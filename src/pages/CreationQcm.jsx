import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { envoyerNotificationGroupe } from '../lib/notifier';
import ImportJsonQcm from '../components/ImportJsonQcm';
import CreerMatiereCoursModal from '../components/CreerMatiereCoursModal';

const ITEM_VIDE = () => ({ texte: '', est_correct: false, correction: '' });
const QUESTION_VIDE = (nbItems) => ({ enonce: '', items: Array.from({ length: nbItems }, ITEM_VIDE) });
const LETTRES = 'ABCDEFGH';

const TYPES_QCM = [
  { val: 'entrainement', icon: '📘', titre: 'Entraînement', desc: 'Correction affichée après chaque question. Nombre de questions modifiable.' },
  { val: 'kholle', icon: '🔥', titre: 'Kholle hebdomadaire', desc: "Visible uniquement pendant le créneau choisi, redevient un entraînement une fois terminée. Toujours 20 questions." },
  { val: 'annale', icon: '📄', titre: 'Annale', desc: "L'étudiant choisit lui-même entraînement ou concours. Nombre de questions modifiable." },
  { val: 'concours_blanc', icon: '🏆', titre: 'Concours blanc', desc: 'Minuté, correction à la fin, une seule tentative. Toujours 20 questions.' },
];

function formatDateHeure(iso) {
  return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function CreationQcm() {
  const navigate = useNavigate();
  const [etape, setEtape] = useState(1);
  const [apercuOuvert, setApercuOuvert] = useState(null);
  const [matieres, setMatieres] = useState([]);
  const [cours, setCours] = useState([]);
  const [navOuverte, setNavOuverte] = useState(false);

  const [titre, setTitre] = useState('');
  const [matiereId, setMatiereId] = useState('');
  const [coursId, setCoursId] = useState('');
  const [typeGeneral, setTypeGeneral] = useState('entrainement');
  const [coursAnnaleIds, setCoursAnnaleIds] = useState([]);
  const [isClasse, setIsClasse] = useState(false);
  const [nbQuestions, setNbQuestions] = useState(20);
  const [nbItems, setNbItems] = useState(5);
  const [semestre, setSemestre] = useState('');
  const [publierMaintenant, setPublierMaintenant] = useState(true);

  const [creneauxKholleDisponibles, setCreneauxKholleDisponibles] = useState([]);
  const [creneauKholleChoisi, setCreneauKholleChoisi] = useState('');
  const [kholleDebutInput, setKholleDebutInput] = useState('');
  const [kholleFinInput, setKholleFinInput] = useState('');

  const [questions, setQuestions] = useState(Array.from({ length: 20 }, () => QUESTION_VIDE(5)));
  const [message, setMessage] = useState('');
  const [enCours, setEnCours] = useState(false);

  const [modeQuestions, setModeQuestions] = useState('manuel');
  const [modalMatiereOuvert, setModalMatiereOuvert] = useState(false);
  const [modalCoursOuvert, setModalCoursOuvert] = useState(false);

  async function chargerMatieresEtCours() {
    const { data: mats } = await supabase.from('matieres').select('*').eq('est_prive', false).order('nom');
    const { data: crs } = await supabase.from('cours').select('*').eq('est_prive', false).order('nom');
    setMatieres(mats || []);
    setCours(crs || []);
  }

  async function chargerCreneauxKholle() {
    const { data: creneaux } = await supabase.from('semaines_kholle').select('*').gte('fin', new Date().toISOString()).order('debut', { ascending: true }).limit(15);
    setCreneauxKholleDisponibles(creneaux || []);
  }

  useEffect(() => {
    async function charger() {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) { navigate('/'); return; }
      const { data: moi } = await supabase.from('profiles').select('role').eq('id', session.session.user.id).single();
      if (moi?.role !== 'tuteur' && moi?.role !== 'proprietaire') { navigate('/accueil'); return; }

      await chargerMatieresEtCours();
      await chargerCreneauxKholle();

      const { data: paramQ } = await supabase.from('parametres').select('valeur').eq('cle', 'nb_questions_defaut').single();
      const { data: paramI } = await supabase.from('parametres').select('valeur').eq('cle', 'nb_items_defaut').single();
      if (paramQ?.valeur) {
        const n = Number(paramQ.valeur);
        setNbQuestions(n);
        setQuestions(Array.from({ length: n }, () => QUESTION_VIDE(paramI?.valeur ? Number(paramI.valeur) : 5)));
      }
      if (paramI?.valeur) setNbItems(Number(paramI.valeur));
    }
    charger();
  }, []);

  const nbFixe = typeGeneral === 'kholle' || typeGeneral === 'concours_blanc' || typeGeneral === 'annale';

  function changerNbQuestions(n) {
    setNbQuestions(n);
    setQuestions((prev) => {
      const copy = [...prev];
      while (copy.length < n) copy.push(QUESTION_VIDE(nbItems));
      return copy.slice(0, n);
    });
  }

  function changerNbItems(n) {
    setNbItems(n);
    setQuestions((prev) => prev.map((q) => {
      const items = [...q.items];
      while (items.length < n) items.push(ITEM_VIDE());
      return { ...q, items: items.slice(0, n) };
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

  function passerAuxQuestions() {
    setMessage('');
    if (!titre.trim() || !matiereId) { setMessage('Le nom du QCM et la matière sont obligatoires.'); return; }
    if (typeGeneral === 'kholle' && !creneauKholleChoisi) {
      if (!kholleDebutInput || !kholleFinInput) { setMessage('Choisis un créneau existant ou définis un début et une fin pour la kholle.'); return; }
      if (new Date(kholleFinInput) <= new Date(kholleDebutInput)) { setMessage('La fin doit être après le début.'); return; }
    }
    if (typeGeneral === 'annale' && coursAnnaleIds.length === 0) { setMessage('Sélectionne au moins un cours pour cette annale.'); return; }
    setEtape(2);
  }

  function questionsIncompletes() {
    return questions
      .map((q, idx) => ({ idx, incomplete: !q.enonce.trim() || !q.items.some((it) => it.est_correct) }))
      .filter((q) => q.incomplete);
  }

  function descriptionCoursPourPrompt() {
    if (typeGeneral === 'annale' && coursAnnaleIds.length > 0) {
      return coursAnnaleIds.map((cid) => cours.find((c) => c.id === cid)?.nom).filter(Boolean).join(', ');
    }
    if (coursId) {
      const c = cours.find((c) => c.id === coursId);
      if (c) return c.nom;
    }
    const m = matieres.find((m) => m.id === matiereId);
    return m ? `[décris ici le(s) cours de ${m.nom} que tu vas fournir]` : '[décris ici le(s) cours que tu vas fournir]';
  }

  function gererImportJson({ questions: questionsImportees, avertissements }) {
    setNbQuestions(questionsImportees.length);
    setNbItems(Math.max(...questionsImportees.map((q) => q.items.length)));
    setQuestions(questionsImportees);
    setModeQuestions('manuel');

    const base = `✅ ${questionsImportees.length} question(s) importée(s) depuis le JSON.`;
    setMessage(avertissements.length > 0 ? `${base} ⚠️ ${avertissements.join(' ')}` : base);
  }

  async function publier() {
    setEnCours(true);
    setMessage('');

    const { data: session } = await supabase.auth.getSession();
    const userId = session.session.user.id;

    let type_qcm = 'entrainement';
    let is_kholle = false;
    let is_annale = false;

    if (typeGeneral === 'concours_blanc') type_qcm = 'concours_blanc';
    if (typeGeneral === 'kholle') { type_qcm = 'concours_blanc'; is_kholle = true; }
    if (typeGeneral === 'annale') { type_qcm = 'entrainement'; is_annale = true; }

    let semaineKholleId = null;
    let kholleDebutFinal = null;
    let kholleFinFinal = null;

    if (is_kholle) {
      if (creneauKholleChoisi) {
        const creneau = creneauxKholleDisponibles.find((c) => c.id === creneauKholleChoisi);
        semaineKholleId = creneau.id;
        kholleDebutFinal = creneau.debut;
        kholleFinFinal = creneau.fin;
      } else {
        const dateChoisie = kholleDebutInput.slice(0, 10);
        const { data: semaineExistante } = await supabase.from('semaines_kholle').select('*').eq('date_samedi', dateChoisie).maybeSingle();

        if (semaineExistante) {
          semaineKholleId = semaineExistante.id;
          kholleDebutFinal = semaineExistante.debut;
          kholleFinFinal = semaineExistante.fin;
        } else {
          const { data: parametre } = await supabase.from('parametres').select('valeur').eq('cle', 'semestre_actif').single();

          const { data: nouvelleSemaine, error: erreurSemaine } = await supabase
            .from('semaines_kholle')
            .insert({ date_samedi: dateChoisie, debut: new Date(kholleDebutInput).toISOString(), fin: new Date(kholleFinInput).toISOString(), semestre: parametre?.valeur || null, cree_par: userId })
            .select().single();

          if (erreurSemaine) { setMessage('Erreur : ' + erreurSemaine.message); setEnCours(false); return; }
          semaineKholleId = nouvelleSemaine.id;
          kholleDebutFinal = nouvelleSemaine.debut;
          kholleFinFinal = nouvelleSemaine.fin;
        }
      }
    }

    const { data: qcm, error } = await supabase.from('qcms').insert({
      titre, matiere_id: matiereId, cours_id: typeGeneral !== 'annale' ? (coursId || null) : null,
      type_qcm, is_annale, is_classe: isClasse, is_kholle, semaine_kholle_id: semaineKholleId,
      kholle_debut: kholleDebutFinal, kholle_fin: kholleFinFinal, nb_questions: nbQuestions, nb_items: nbItems,
      semestre: semestre || null, publie: publierMaintenant, duree_minutes: type_qcm === 'concours_blanc' ? 30 : null, cree_par: userId,
    }).select().single();

    if (error) { setMessage('Erreur : ' + error.message); setEnCours(false); return; }

    if (is_annale && coursAnnaleIds.length > 0) {
      await supabase.from('qcm_cours').insert(coursAnnaleIds.map((cours_id) => ({ qcm_id: qcm.id, cours_id })));
    }

    for (let i = 0; i < questions.length; i++) {
      const { data: question } = await supabase.from('questions').insert({ qcm_id: qcm.id, ordre: i + 1, enonce: questions[i].enonce }).select().single();
      await supabase.from('items').insert(
        questions[i].items.map((it, idx) => ({ question_id: question.id, lettre: LETTRES[idx], texte: it.texte, est_correct: it.est_correct, correction: it.correction }))
      );
    }

    await supabase.from('historique_qcm').insert({ qcm_id: qcm.id, action: 'creation', effectue_par: userId, details: `${titre} — ${questions.length} questions, marqué "à vérifier"` });

    const { data: etudiants } = await supabase.from('profiles').select('id').eq('role', 'etudiant');
    if (publierMaintenant && etudiants && etudiants.length > 0) {
      await envoyerNotificationGroupe(etudiants.map((e) => e.id), 'qcm_publie', `Nouveau QCM disponible : ${titre}`, `/qcm/${qcm.id}`);
    }

    const { data: autresAdmins } = await supabase.from('profils_publics').select('id').in('role', ['tuteur', 'proprietaire']).neq('id', userId);
    if (autresAdmins && autresAdmins.length > 0) {
      await envoyerNotificationGroupe(autresAdmins.map((a) => a.id), 'nouveau_qcm_pair', `Nouveau QCM ajouté : ${titre}`, '/qcm/gerer');
    }

    setEnCours(false);
    navigate('/qcm/gerer');
  }

  // ===== ÉTAPE 1 : CONFIGURATION =====
  if (etape === 1) {
    return (
      <div className="container" style={{ maxWidth: 640 }}>
        <Link to="/qcm/gerer" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textDecoration: 'none' }}>← Retour à Gérer les QCM</Link>
        <h1 className="page-title" style={{ marginTop: 12 }}>Créer un QCM</h1>
        <p className="page-sub">Étape 1 sur 3 — configuration générale</p>

        <div className="field">
          <label>Type de QCM</label>
          <div className="type-grid">
            {TYPES_QCM.map((t) => (
              <div
                key={t.val}
                className={`type-card ${typeGeneral === t.val ? 'selected' : ''}`}
                onClick={() => { setTypeGeneral(t.val); if (t.val !== 'entrainement') changerNbQuestions(20); }}
              >
                <span className="tc-icon">{t.icon}</span>
                <div className="tc-title">{t.titre}</div>
                <div className="tc-desc">{t.desc}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="field">
            <label>Nom du QCM</label>
            <input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Ex : Système respiratoire" />
          </div>

          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              Matière
              <button type="button" className="btn btn-ghost" style={{ padding: '2px 10px', fontSize: '0.72rem' }} onClick={() => setModalMatiereOuvert(true)}>+ Nouvelle matière</button>
            </label>
            <select value={matiereId} onChange={(e) => { setMatiereId(e.target.value); setCoursId(''); }}>
              <option value="">— choisir —</option>
              {matieres.filter((m) => m.actif !== false).map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
            </select>
          </div>

          {typeGeneral !== 'annale' && matiereId && (
            <div className="field">
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                Cours (optionnel)
                <button type="button" className="btn btn-ghost" style={{ padding: '2px 10px', fontSize: '0.72rem' }} onClick={() => setModalCoursOuvert(true)}>+ Nouveau cours</button>
              </label>
              <select value={coursId} onChange={(e) => setCoursId(e.target.value)}>
                <option value="">— aucun —</option>
                {cours.filter((c) => c.matiere_id === matiereId).map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
            </div>
          )}

          {typeGeneral === 'annale' && matiereId && (
            <div className="field">
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                Cours concernés (plusieurs possibles)
                <button type="button" className="btn btn-ghost" style={{ padding: '2px 10px', fontSize: '0.72rem' }} onClick={() => setModalCoursOuvert(true)}>+ Nouveau cours</button>
              </label>
              <select multiple value={coursAnnaleIds} onChange={(e) => setCoursAnnaleIds([...e.target.selectedOptions].map((o) => o.value))} style={{ minHeight: 100 }}>
                {cours.filter((c) => c.matiere_id === matiereId).map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
              <p className="field-hint">L'étudiant choisira lui-même de la faire en mode entraînement ou concours.</p>
            </div>
          )}

          {typeGeneral === 'kholle' && (
            <div className="kholle-note">
              <div style={{ width: '100%' }}>
                <label style={{ display: 'block', marginBottom: 8 }}>Créneau de kholle</label>

                {creneauxKholleDisponibles.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <p className="field-hint" style={{ marginTop: 0, marginBottom: 8 }}>Créneaux déjà programmés — clique pour rejoindre :</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {creneauxKholleDisponibles.map((c) => (
                        <div
                          key={c.id}
                          className={`filter-chip ${creneauKholleChoisi === c.id ? 'active' : ''}`}
                          style={{ textAlign: 'left', cursor: 'pointer' }}
                          onClick={() => setCreneauKholleChoisi(creneauKholleChoisi === c.id ? '' : c.id)}
                        >
                          Du {formatDateHeure(c.debut)} au {formatDateHeure(c.fin)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!creneauKholleChoisi && (
                  <>
                    <p className="field-hint" style={{ marginTop: 0 }}>Ou définis un nouvel horaire :</p>
                    <div className="field-row">
                      <div className="field">
                        <label>Début</label>
                        <input type="datetime-local" value={kholleDebutInput} onChange={(e) => setKholleDebutInput(e.target.value)} />
                      </div>
                      <div className="field">
                        <label>Fin</label>
                        <input type="datetime-local" value={kholleFinInput} onChange={(e) => setKholleFinInput(e.target.value)} />
                      </div>
                    </div>
                  </>
                )}
                <p style={{ margin: '8px 0 0' }}>
                  {creneauKholleChoisi
                    ? 'Ce QCM rejoindra ce créneau existant.'
                    : "Si une kholle existe déjà pour cette date, ce QCM la rejoindra automatiquement avec son horaire."}
                </p>
              </div>
            </div>
          )}

          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={isClasse} onChange={(e) => setIsClasse(e.target.checked)} style={{ width: 'auto' }} />
              Ce QCM alimente un classement
            </label>
          </div>

          <div className="field-row">
            <div className="field">
              <label>Nombre de questions {nbFixe && '(fixé)'}</label>
              <input type="number" value={nbQuestions} disabled={nbFixe} onChange={(e) => changerNbQuestions(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Items par question</label>
              <input type="number" value={nbItems} onChange={(e) => changerNbItems(Number(e.target.value))} />
            </div>
          </div>

          <div className="field">
            <label>Semestre (optionnel, ex : 2025-S1)</label>
            <input value={semestre} onChange={(e) => setSemestre(e.target.value)} placeholder="2025-S1" />
          </div>

          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={publierMaintenant} onChange={(e) => setPublierMaintenant(e.target.checked)} style={{ width: 'auto' }} />
              Publier immédiatement
            </label>
            {!publierMaintenant && <p className="field-hint">Le QCM sera enregistré en brouillon — invisible des étudiants tant que tu ne le publies pas depuis "Gérer les QCM".</p>}
          </div>

          {message && <div className="error-msg">{message}</div>}

          <button className="btn btn-primary" style={{ width: '100%' }} onClick={passerAuxQuestions}>Suivant : saisir les questions →</button>
        </div>

        {modalMatiereOuvert && (
          <CreerMatiereCoursModal
            mode="matiere"
            onFermer={() => setModalMatiereOuvert(false)}
            onCree={async (nouvelle) => { await chargerMatieresEtCours(); setMatiereId(nouvelle.id); setCoursId(''); setModalMatiereOuvert(false); }}
          />
        )}

        {modalCoursOuvert && (
          <CreerMatiereCoursModal
            mode="cours"
            matiereId={matiereId}
            onFermer={() => setModalCoursOuvert(false)}
            onCree={async (nouveau) => {
              await chargerMatieresEtCours();
              if (typeGeneral === 'annale') setCoursAnnaleIds((prev) => [...prev, nouveau.id]);
              else setCoursId(nouveau.id);
              setModalCoursOuvert(false);
            }}
          />
        )}
      </div>
    );
  }

  // ===== ÉTAPE 3 : RÉCAPITULATIF =====
  if (etape === 3) {
    const incompletes = questionsIncompletes();
    return (
      <div className="container" style={{ maxWidth: 600 }}>
        <h1 className="page-title">Récapitulatif</h1>
        <p className="page-sub">Vérifie tout avant de publier.</p>

        <div className="recap-summary">
          <div className="recap-stat"><div className="val">{questions.length}</div><div className="lbl">Questions</div></div>
          <div className="recap-stat"><div className="val">{nbItems}</div><div className="lbl">Items / question</div></div>
          <div className={`recap-stat ${incompletes.length > 0 ? 'warn' : ''}`}><div className="val">{incompletes.length}</div><div className="lbl">Incomplètes</div></div>
        </div>

        <div className="recap-info-list">
          <div className="recap-info-item"><span>Nom</span><span>{titre}</span></div>
          <div className="recap-info-item"><span>Matière</span><span>{matieres.find((m) => m.id === matiereId)?.nom}</span></div>
          <div className="recap-info-item"><span>Type</span><span>{TYPES_QCM.find((t) => t.val === typeGeneral)?.titre}</span></div>
          <div className="recap-info-item"><span>Statut</span><span>{publierMaintenant ? 'Publication immédiate' : 'Brouillon'}</span></div>
        </div>

        {incompletes.length > 0 && (
          <div className="warn-box">
            <div>
              <b>{incompletes.length} question(s) semblent incomplètes</b> (énoncé vide ou aucune bonne réponse cochée) :
              <ul>
                {incompletes.map((q) => (
                  <li key={q.idx} onClick={() => { setEtape(2); document.getElementById(`question-${q.idx}`)?.scrollIntoView({ behavior: 'smooth' }); }}>
                    Question {q.idx + 1} →
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {message && <div className="error-msg">{message}</div>}

        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn btn-ghost" onClick={() => setEtape(2)}>← Retour</button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={publier} disabled={enCours}>
            {enCours ? 'Publication...' : 'Confirmer et publier'}
          </button>
        </div>
      </div>
    );
  }

  // ===== ÉTAPE 2 : QUESTIONS =====
  const nbRemplies = questions.filter((q) => q.enonce.trim() && q.items.some((it) => it.est_correct)).length;

  return (
    <div className="container" style={{ maxWidth: 700 }}>
      <h1 className="page-title">{titre}</h1>
      <p className="page-sub">Étape 2 sur 3 — {questions.length} questions</p>

      <div className="mode-selector" style={{ margin: '0 0 24px' }}>
        <div className={`mode-card ${modeQuestions === 'manuel' ? 'selected' : ''}`} onClick={() => setModeQuestions('manuel')}>
          <div className="mode-title">✍️ Saisie manuelle</div>
          <div className="mode-desc">Rédige chaque question directement sur le site.</div>
        </div>
        <div className={`mode-card ${modeQuestions === 'json' ? 'selected' : ''}`} onClick={() => setModeQuestions('json')}>
          <div className="mode-title">📥 Coller le JSON</div>
          <div className="mode-desc">Importe le contenu généré par une IA à partir du prompt-type.</div>
        </div>
      </div>

      {modeQuestions === 'json' ? (
        <ImportJsonQcm
          nbQuestionsAttendu={nbQuestions}
          nbItemsAttendu={nbItems}
          coursDescription={descriptionCoursPourPrompt()}
          onImporte={gererImportJson}
        />
      ) : (
        <>
          <div className="nav-trigger-row">
            <button className="nav-trigger-btn" onClick={() => setNavOuverte(true)}>🔢 Navigation entre questions</button>
            <span className="mini-progress"><b>{nbRemplies}</b> / {questions.length} rédigées</span>
          </div>

          {questions.map((q, qIdx) => (
            <div key={qIdx} id={`question-${qIdx}`} className="card" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>Question {qIdx + 1}</strong>
                <button type="button" className="btn btn-ghost" style={{ padding: '3px 10px', fontSize: '0.75rem' }} onClick={() => setApercuOuvert(apercuOuvert === qIdx ? null : qIdx)}>
                  👁 {apercuOuvert === qIdx ? "Fermer l'aperçu" : 'Aperçu étudiant'}
                </button>
              </div>
              <textarea
                value={q.enonce}
                onChange={(e) => majQuestion(qIdx, 'enonce', e.target.value)}
                placeholder="Énoncé de la question"
                style={{ width: '100%', minHeight: 60, marginTop: 8, marginBottom: 14 }}
              />

              {q.items.map((it, iIdx) => (
                <div key={iIdx} className="item-editor">
                  <div className="item-editor-head">
                    <span className="item-letter-badge">{LETTRES[iIdx]}</span>
                    <input type="text" value={it.texte} onChange={(e) => majItem(qIdx, iIdx, 'texte', e.target.value)} placeholder={`Item ${LETTRES[iIdx]}`} />
                    <label className="truth-toggle">
                      <input type="checkbox" checked={it.est_correct} onChange={(e) => majItem(qIdx, iIdx, 'est_correct', e.target.checked)} />
                      <span>{it.est_correct ? 'Vrai' : 'Faux'}</span>
                    </label>
                  </div>
                  <div className="explanation-input">
                    <span className="explanation-label">Explication (optionnel)</span>
                    <textarea value={it.correction} onChange={(e) => majItem(qIdx, iIdx, 'correction', e.target.value)} placeholder="Correction affichée à l'étudiant" />
                  </div>
                </div>
              ))}

              {apercuOuvert === qIdx && (
                <div style={{ marginTop: 14, padding: 16, background: 'var(--bg-panel)', borderRadius: 'var(--radius-md)' }}>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase' }}>Ce que verra l'étudiant</p>
                  <h3 style={{ marginTop: 0 }}>{q.enonce || <em style={{ color: 'var(--text-muted)' }}>(énoncé vide)</em>}</h3>
                  {q.items.map((it, iIdx) => (
                    <div key={iIdx} className="item">
                      <span className="item-letter">{LETTRES[iIdx]}</span>
                      <span>{it.texte || <em style={{ color: 'var(--text-muted)' }}>(item vide)</em>}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {message && <div className="error-msg" style={{ color: message.startsWith('✅') ? 'var(--success)' : 'var(--error)' }}>{message}</div>}

      <div style={{ display: 'flex', gap: 12 }}>
        <button className="btn btn-ghost" onClick={() => setEtape(1)}>← Retour</button>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setEtape(3)}>Suivant : récapitulatif →</button>
      </div>

      {navOuverte && (
        <div className="nav-overlay open" onClick={(e) => e.target === e.currentTarget && setNavOuverte(false)}>
          <div className="nav-content">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0 }}>Navigation</h2>
              <button onClick={() => setNavOuverte(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-main)' }}>✕</button>
            </div>
            <div className="nav-grid">
              {questions.map((q, idx) => {
                const remplie = q.enonce.trim() && q.items.some((it) => it.est_correct);
                return (
                  <button
                    key={idx}
                    className={`nav-item ${remplie ? 'filled' : 'empty-warn'}`}
                    onClick={() => { setNavOuverte(false); document.getElementById(`question-${idx}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
            <div className="nav-legend">
              <div className="legend-item"><div className="dot" style={{ background: 'var(--success)' }} />Rédigée</div>
              <div className="legend-item"><div className="dot" style={{ background: 'var(--error)' }} />Incomplète</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
