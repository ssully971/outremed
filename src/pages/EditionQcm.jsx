import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { envoyerNotificationGroupe } from '../lib/notifier';
import ImageEnonceUpload from '../components/ImageEnonceUpload';
import { estMatiereActive } from '../lib/filiere';

const LETTRES = 'ABCDEFGH';

const TYPES_QCM = [
  { val: 'entrainement', icon: '📘', titre: 'Entraînement', desc: 'Correction affichée après chaque question. Nombre de questions modifiable.' },
  { val: 'kholle', icon: '🔥', titre: 'Kholle hebdomadaire', desc: "Visible uniquement pendant le créneau choisi, redevient un entraînement une fois terminée. Toujours 20 questions." },
  { val: 'annale', icon: '📄', titre: 'Annale', desc: "L'étudiant choisit lui-même entraînement ou concours. Nombre de questions modifiable." },
  { val: 'concours_blanc', icon: '🏆', titre: 'Concours blanc', desc: 'Minuté, correction à la fin, une seule tentative. Toujours 20 questions.' },
];

function typeGeneralDepuisQcm(q) {
  if (q.is_kholle) return 'kholle';
  if (q.is_annale) return 'annale';
  if (q.type_qcm === 'concours_blanc') return 'concours_blanc';
  return 'entrainement';
}

function formatDateHeure(iso) {
  return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function EditionQcm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [chargement, setChargement] = useState(true);
  const [qcm, setQcm] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [matieres, setMatieres] = useState([]);
  const [cours, setCours] = useState([]);
  const [semainesKholle, setSemainesKholle] = useState([]);
  const [typeGeneral, setTypeGeneral] = useState('entrainement');
  const [coursAnnaleIds, setCoursAnnaleIds] = useState([]);
  const [message, setMessage] = useState('');
  const [enregistrement, setEnregistrement] = useState(false);
  const [apercuOuvert, setApercuOuvert] = useState(null);
  const [signalementOuvert, setSignalementOuvert] = useState(null);
  const [messageSignalement, setMessageSignalement] = useState('');
  const [monId, setMonId] = useState(null);
  const [monPseudo, setMonPseudo] = useState('');
  const [navOuverte, setNavOuverte] = useState(false);
  const [mode, setMode] = useState('edition');
  const [matiereInitialeId, setMatiereInitialeId] = useState(null);
  const [semestreInitiale, setSemestreInitiale] = useState(null);
  const [semestreActif, setSemestreActif] = useState('');

  async function charger() {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) { navigate('/'); return; }
    const uid = session.session.user.id;
    const { data: moiRole } = await supabase.from('profiles').select('role').eq('id', uid).single();
    if (moiRole?.role !== 'tuteur' && moiRole?.role !== 'proprietaire') { navigate('/accueil'); return; }

    setMonId(uid);
    const { data: monProfil } = await supabase.from('profiles').select('pseudo').eq('id', uid).single();
    setMonPseudo(monProfil?.pseudo || '');

    const { data: qcmData } = await supabase.from('qcms').select('*').eq('id', id).single();
    setQcm(qcmData);
    if (qcmData) { setTypeGeneral(typeGeneralDepuisQcm(qcmData)); setMatiereInitialeId(qcmData.matiere_id); setSemestreInitiale(qcmData.semestre); }

    const { data: paramSem } = await supabase.from('parametres').select('valeur').eq('cle', 'semestre_actif').single();
    setSemestreActif(paramSem?.valeur || '');

    const { data: qs } = await supabase.from('questions').select('*').eq('qcm_id', id).order('ordre');
    const { data: its } = await supabase.from('items').select('*').in('question_id', (qs || []).map((q) => q.id));
    setQuestions((qs || []).map((q) => ({ ...q, items: (its || []).filter((i) => i.question_id === q.id) })));

    const { data: mats } = await supabase.from('matieres').select('*').eq('est_prive', false).order('nom');
    setMatieres(mats || []);
    const { data: crs } = await supabase.from('cours').select('*').eq('est_prive', false).order('nom');
    setCours(crs || []);

    // Chargée systématiquement (pas seulement si déjà kholle) : il faut la liste disponible
    // dès qu'on bascule VERS kholle, pas seulement quand le QCM en est déjà une.
    const { data: semaines } = await supabase.from('semaines_kholle').select('*').order('debut', { ascending: false });
    setSemainesKholle(semaines || []);

    if (qcmData?.is_annale) {
      const { data: qc } = await supabase.from('qcm_cours').select('cours_id').eq('qcm_id', id);
      setCoursAnnaleIds((qc || []).map((r) => r.cours_id));
    }

    setChargement(false);
  }

  useEffect(() => { charger(); }, [id]);

  // Arrivée depuis un signalement (lien "Voir la question →") : défile jusqu'à la question
  // visée une fois le contenu chargé, plutôt que de la laisser chercher manuellement.
  useEffect(() => {
    if (chargement || mode !== 'edition') return;
    const ordreVise = Number(searchParams.get('q'));
    if (!ordreVise) return;
    const qIdx = questions.findIndex((q) => q.ordre === ordreVise);
    if (qIdx === -1) return;
    document.getElementById(`question-${qIdx}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [chargement, mode, questions, searchParams]);

  function majQcm(champ, valeur) {
    setQcm((prev) => ({ ...prev, [champ]: valeur }));
  }

  // Changer la semaine d'une kholle doit aussi répercuter kholle_debut/kholle_fin (copie
  // dénormalisée sur qcms, utilisée par la fenêtre de visibilité RLS et le classement) —
  // sinon le QCM resterait affiché/masqué selon l'horaire de son ancienne semaine.
  function changerSemaineKholle(semaineId) {
    const semaine = semainesKholle.find((s) => s.id === semaineId);
    setQcm((prev) => ({
      ...prev,
      semaine_kholle_id: semaineId || null,
      kholle_debut: semaine ? semaine.debut : prev.kholle_debut,
      kholle_fin: semaine ? semaine.fin : prev.kholle_fin,
    }));
  }

  function majQuestion(qIdx, champ, valeur) {
    setQuestions((prev) => {
      const copy = [...prev];
      copy[qIdx] = { ...copy[qIdx], [champ]: valeur };
      return copy;
    });
  }

  function majItem(qIdx, iIdx, champ, valeur) {
    setQuestions((prev) => {
      const copy = [...prev];
      const items = [...copy[qIdx].items];
      items[iIdx] = { ...items[iIdx], [champ]: valeur };
      copy[qIdx] = { ...copy[qIdx], items };
      return copy;
    });
  }

  async function envoyerSignalement(question) {
    if (!messageSignalement.trim()) return;
    await supabase.from('signalements_erreur').insert({
      qcm_id: id,
      question_id: question.id,
      auteur_id: monId,
      message: messageSignalement.trim(),
    });

    const { data: admins } = await supabase.from('profils_publics').select('id').in('role', ['tuteur', 'proprietaire']).neq('id', monId);
    if (admins && admins.length > 0) {
      await envoyerNotificationGroupe(
        admins.map((a) => a.id), 'signalement_erreur',
        `${monPseudo} a un doute sur "${qcm.titre}"`,
        `/qcm/${id}/modifier?q=${question.ordre}`
      );
    }

    setMessageSignalement('');
    setSignalementOuvert(null);
  }

  async function enregistrer() {
    if (typeGeneral === 'kholle' && !qcm.semaine_kholle_id) {
      setMessage('Erreur : choisis une semaine de kholle.');
      return;
    }
    if (typeGeneral === 'annale' && coursAnnaleIds.length === 0) {
      setMessage('Erreur : sélectionne au moins un cours pour cette annale.');
      return;
    }
    if (!/^\d{4}-S[12]$/.test(qcm.semestre || '')) {
      setMessage('Erreur : le semestre doit être au format AAAA-S1 ou AAAA-S2 (ex : 2026-S1).');
      return;
    }
    setEnregistrement(true);

    let type_qcm = 'entrainement', is_kholle = false, is_annale = false;
    if (typeGeneral === 'concours_blanc') type_qcm = 'concours_blanc';
    if (typeGeneral === 'kholle') { type_qcm = 'concours_blanc'; is_kholle = true; }
    if (typeGeneral === 'annale') { type_qcm = 'entrainement'; is_annale = true; }

    await supabase.from('qcms').update({
      titre: qcm.titre,
      matiere_id: qcm.matiere_id,
      cours_id: typeGeneral !== 'annale' ? (qcm.cours_id || null) : null,
      is_classe: qcm.is_classe,
      semestre: qcm.semestre,
      type_qcm, is_annale, is_kholle,
      // Ne jamais effacer semaine_kholle_id/kholle_debut/kholle_fin en sortant de kholle : comme
      // cloturer_kholles_expirees() (voir CLAUDE.md), ce QCM doit rester rattaché à sa semaine
      // pour que ses tentatives passées restent comptées dans resultats_classement (dont le
      // WHERE inclut `semaine_kholle_id IS NOT NULL`) — seul un passage EN kholle les renseigne.
      semaine_kholle_id: qcm.semaine_kholle_id,
      kholle_debut: qcm.kholle_debut,
      kholle_fin: qcm.kholle_fin,
      duree_minutes: type_qcm === 'concours_blanc' ? (qcm.duree_minutes || 30) : null,
      publie: is_kholle ? true : qcm.publie,
      modifie_par: monId,
      modifie_le: new Date().toISOString(),
    }).eq('id', id);

    // Repart toujours de zéro plutôt qu'un diff incrémental — qcm_cours est une simple table
    // de liaison, sans coût à la vider/reconstruire, et ça vide naturellement les anciennes
    // liaisons en sortant du type annale (coursAnnaleIds n'est alors pas réinséré).
    await supabase.from('qcm_cours').delete().eq('qcm_id', id);
    if (is_annale && coursAnnaleIds.length > 0) {
      await supabase.from('qcm_cours').insert(coursAnnaleIds.map((cours_id) => ({ qcm_id: id, cours_id })));
    }

    for (const q of questions) {
      await supabase.from('questions').update({ enonce: q.enonce, lien: q.lien || null }).eq('id', q.id);
      for (const it of q.items) {
        await supabase.from('items').update({
          texte: it.texte, est_correct: it.est_correct, correction: it.correction,
        }).eq('id', it.id);
      }
    }

    await supabase.from('historique_qcm').insert({
      qcm_id: id, action: 'modification', effectue_par: monId,
      details: `${qcm.titre} — modifié`,
    });

    const { data: autresAdmins } = await supabase.from('profils_publics').select('id').in('role', ['tuteur', 'proprietaire']).neq('id', monId);
    if (autresAdmins && autresAdmins.length > 0) {
      await envoyerNotificationGroupe(autresAdmins.map((a) => a.id), 'nouveau_qcm_pair', `QCM modifié : ${qcm.titre}`, `/qcm/${id}/modifier`);
    }

    setEnregistrement(false);
    setMessage('Modifications enregistrées.');
  }

  if (chargement) return <div style={{ padding: 40 }}>Chargement...</div>;
  if (!qcm) return <div style={{ padding: 40 }}>QCM introuvable.</div>;

  const matiereActuelle = matieres.find((m) => m.id === qcm.matiere_id);

  return (
    <div className="container" style={{ maxWidth: 700 }}>
      <Link to="/qcm/gerer" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textDecoration: 'none' }}>← Retour à Gérer les QCM</Link>

      <h1 className="page-title" style={{ marginTop: 12 }}>Modifier le QCM</h1>

      <div className="mode-selector" style={{ margin: '0 0 24px' }}>
        <div className={`mode-card ${mode === 'edition' ? 'selected' : ''}`} onClick={() => setMode('edition')}>
          <div className="mode-title">✏️ Modifier</div>
          <div className="mode-desc">Éditer le contenu question par question.</div>
        </div>
        <div className={`mode-card ${mode === 'apercu' ? 'selected' : ''}`} onClick={() => setMode('apercu')}>
          <div className="mode-title">👁 Aperçu</div>
          <div className="mode-desc">Défilement continu, exactement comme le verrait un étudiant, réponses affichées.</div>
        </div>
      </div>

      {mode === 'apercu' ? (
        <>
          {questions.map((q, qIdx) => (
            <div key={q.id} className="card" style={{ marginBottom: 16 }}>
              <strong>Question {qIdx + 1}</strong>
              <div className="question-title" style={{ marginTop: 8 }}>{q.enonce}</div>
              {q.lien && <img src={q.lien} alt="" style={{ maxWidth: '100%', height: 'auto', borderRadius: 'var(--radius-md)', margin: '0 0 16px', display: 'block' }} />}
              {q.items.map((it, iIdx) => (
                <div key={it.id} className={`item locked ${it.est_correct ? 'r-correct' : ''}`}>
                  <span className="item-letter">{it.lettre || LETTRES[iIdx]}</span>
                  <span className="item-text">{it.texte}</span>
                </div>
              ))}
              <div className="feedback-block" style={{ marginTop: 12 }}>
                {q.items.map((it, iIdx) => (
                  <div key={it.id} className="expl-item" style={{ marginBottom: 6 }}>
                    <strong style={{ color: it.est_correct ? 'var(--success)' : 'var(--error)' }}>{it.lettre || LETTRES[iIdx]}. {it.est_correct ? 'Vrai.' : 'Faux.'}</strong> {it.correction}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      ) : (
      <>
      <div className="field">
        <label>Type de QCM</label>
        <div className="type-grid">
          {TYPES_QCM.map((t) => (
            <div key={t.val} className={`type-card ${typeGeneral === t.val ? 'selected' : ''}`} onClick={() => setTypeGeneral(t.val)}>
              <span className="tc-icon">{t.icon}</span>
              <div className="tc-title">{t.titre}</div>
              <div className="tc-desc">{t.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {(typeGeneral === 'kholle' || typeGeneral === 'concours_blanc') && qcm.nb_questions !== 20 && (
        <div className="warn-box" style={{ marginBottom: 16 }}>
          <div>⚠️ Ce type nécessite normalement 20 questions, mais ce QCM en a {qcm.nb_questions}. Le nombre n'est pas modifié automatiquement — les questions existantes restent inchangées, ajuste-les manuellement ci-dessous si besoin.</div>
        </div>
      )}

      <div className="settings-card">
        <div className="field">
          <label>Titre</label>
          <input value={qcm.titre} onChange={(e) => majQcm('titre', e.target.value)} />
        </div>

        <div className="field">
          <label>Matière</label>
          <select
            value={qcm.matiere_id || ''}
            onChange={(e) => {
              const nouvelleMatiereId = e.target.value;
              majQcm('matiere_id', nouvelleMatiereId);
              if (nouvelleMatiereId === matiereInitialeId) {
                // Retour à la matière d'origine : restaure sa vraie valeur historique plutôt
                // que de la recalculer sur le semestre actif (qui peut différer si ce QCM date
                // d'une année précédente).
                majQcm('semestre', semestreInitiale);
              } else {
                const m = matieres.find((mm) => mm.id === nouvelleMatiereId);
                if (m?.semestre) majQcm('semestre', semestreActif);
              }
            }}
          >
            <option value="">— choisir —</option>
            {matieres.filter((m) => m.id === qcm.matiere_id || (m.actif !== false && estMatiereActive(m, semestreActif))).map((m) => <option key={m.id} value={m.id}>{m.nom}{m.actif === false ? ' (désactivée)' : ''}</option>)}
          </select>
        </div>

        {typeGeneral === 'annale' ? (
          <div className="field">
            <label>Cours concernés (plusieurs possibles)</label>
            <select multiple value={coursAnnaleIds} onChange={(e) => setCoursAnnaleIds([...e.target.selectedOptions].map((o) => o.value))} style={{ minHeight: 100 }}>
              {cours.filter((c) => c.matiere_id === qcm.matiere_id).map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
            <p className="field-hint">L'étudiant choisira lui-même de la faire en mode entraînement ou concours.</p>
          </div>
        ) : (
          <div className="field">
            <label>Cours (optionnel)</label>
            <select value={qcm.cours_id || ''} onChange={(e) => majQcm('cours_id', e.target.value)}>
              <option value="">— aucun —</option>
              {cours.filter((c) => c.matiere_id === qcm.matiere_id).map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </div>
        )}

        {typeGeneral === 'kholle' && (
          <div className="field">
            <label>Semaine de kholle</label>
            <select value={qcm.semaine_kholle_id || ''} onChange={(e) => changerSemaineKholle(e.target.value)}>
              <option value="">— choisir —</option>
              {semainesKholle.map((s) => (
                <option key={s.id} value={s.id}>Du {formatDateHeure(s.debut)} au {formatDateHeure(s.fin)}</option>
              ))}
            </select>
            <p className="field-hint">Déplace ce QCM vers une autre semaine déjà créée — son horaire de visibilité s'aligne automatiquement sur celui de la semaine choisie.</p>
          </div>
        )}

        <div className="field">
          <label>Semestre {matiereActuelle?.semestre && '(verrouillé sur la matière)'}</label>
          <input
            value={qcm.semestre || ''}
            onChange={(e) => majQcm('semestre', e.target.value)}
            placeholder="2025-S1"
            readOnly={!!matiereActuelle?.semestre}
            disabled={!!matiereActuelle?.semestre}
          />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={qcm.is_classe} onChange={(e) => majQcm('is_classe', e.target.checked)} style={{ width: 'auto' }} />
            Ce QCM alimente un classement
          </label>
        </div>
      </div>

      <div className="nav-trigger-row">
        <button className="nav-trigger-btn" onClick={() => setNavOuverte(true)}>🔢 Navigation entre questions</button>
        <span className="mini-progress">{questions.length} question(s)</span>
      </div>

      {questions.map((q, qIdx) => (
        <div key={q.id} id={`question-${qIdx}`} className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>Question {qIdx + 1}</strong>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="icon-action" style={{ color: 'var(--warning)', width: 'auto', padding: '0 10px' }} title="Mettre en doute" onClick={() => setSignalementOuvert(signalementOuvert === qIdx ? null : qIdx)}>🚩</button>
              <button className="icon-action" style={{ width: 'auto', padding: '0 10px' }} title="Aperçu étudiant" onClick={() => setApercuOuvert(apercuOuvert === qIdx ? null : qIdx)}>👁</button>
            </div>
          </div>

          {signalementOuvert === qIdx && (
            <div style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
              <input value={messageSignalement} onChange={(e) => setMessageSignalement(e.target.value)} placeholder="Décris ton doute pour qu'un autre tuteur vérifie..." />
              <button className="btn btn-outline btn-sm" onClick={() => envoyerSignalement(q)}>Envoyer</button>
            </div>
          )}
          <textarea
            value={q.enonce}
            onChange={(e) => majQuestion(qIdx, 'enonce', e.target.value)}
            style={{ width: '100%', minHeight: 60, marginTop: 8, marginBottom: 8 }}
          />
          <ImageEnonceUpload identifiant={q.id} urlActuelle={q.lien} onChange={(url) => majQuestion(qIdx, 'lien', url)} />
          {q.items.map((it, iIdx) => (
            <div key={it.id} className="item-editor">
              <div className="item-editor-head">
                <span className="item-letter-badge">{it.lettre || LETTRES[iIdx]}</span>
                <input type="text" value={it.texte} onChange={(e) => majItem(qIdx, iIdx, 'texte', e.target.value)} placeholder={`Item ${LETTRES[iIdx]}`} />
                <label className="truth-toggle">
                  <input type="checkbox" checked={it.est_correct} onChange={(e) => majItem(qIdx, iIdx, 'est_correct', e.target.checked)} />
                  <span>{it.est_correct ? 'Vrai' : 'Faux'}</span>
                </label>
              </div>
              <div className="explanation-input">
                <span className="explanation-label">Explication (optionnel)</span>
                <textarea value={it.correction || ''} onChange={(e) => majItem(qIdx, iIdx, 'correction', e.target.value)} placeholder="Correction" />
              </div>
            </div>
          ))}

          {apercuOuvert === qIdx && (
            <div style={{ marginTop: 14, padding: 16, background: 'var(--bg-panel)', borderRadius: 'var(--radius-md)' }}>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase' }}>Ce que verra l'étudiant</p>
              <h3 style={{ marginTop: 0 }}>{q.enonce}</h3>
              {q.lien && <img src={q.lien} alt="" style={{ maxWidth: '100%', height: 'auto', borderRadius: 'var(--radius-md)', margin: '0 0 12px' }} />}
              {q.items.map((it) => (
                <div key={it.id} className="item">
                  <span className="item-letter">{it.lettre}</span>
                  <span>{it.texte}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {message && <div className="error-msg" style={{ color: message.startsWith('Erreur') ? 'var(--error)' : 'var(--success)' }}>{message}</div>}

      <button className="btn btn-primary" style={{ width: '100%' }} onClick={enregistrer} disabled={enregistrement}>
        {enregistrement ? 'Enregistrement...' : 'Enregistrer les modifications'}
      </button>

      {navOuverte && (
        <div className="nav-overlay open" onClick={(e) => e.target === e.currentTarget && setNavOuverte(false)}>
          <div className="nav-content">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0 }}>Navigation</h2>
              <button onClick={() => setNavOuverte(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-main)' }}>✕</button>
            </div>
            <div className="nav-grid">
              {questions.map((q, idx) => (
                <button key={q.id} className="nav-item" onClick={() => { setNavOuverte(false); document.getElementById(`question-${idx}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}>
                  {idx + 1}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}
