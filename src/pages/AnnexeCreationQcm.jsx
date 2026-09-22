import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import ImportJsonQcm from '../components/ImportJsonQcm';
import ImageEnonceUpload from '../components/ImageEnonceUpload';
import AnnexeNav from '../components/AnnexeNav';

const ITEM_VIDE = () => ({ texte: '', est_correct: false, correction: '' });
const QUESTION_VIDE = (nbItems) => ({ cleLocale: crypto.randomUUID(), enonce: '', lien: null, items: Array.from({ length: nbItems }, ITEM_VIDE) });
const LETTRES = 'ABCDEFGH';

const TYPES_QCM = [
  { val: 'entrainement', icon: '📘', titre: 'Entraînement', desc: 'Correction affichée après chaque question. Nombre de questions modifiable.' },
  { val: 'annale', icon: '📄', titre: 'Annale', desc: 'Choix du nombre de questions et d\'items. Mode entraînement ou concours au choix du tuteur qui la passe.' },
  { val: 'concours_blanc', icon: '🏆', titre: 'Concours blanc', desc: 'Minuté, correction à la fin, une seule tentative. Toujours 20 questions.' },
];

export default function AnnexeCreationQcm() {
  const navigate = useNavigate();
  const [etape, setEtape] = useState(1);
  const [apercuOuvert, setApercuOuvert] = useState(null);
  const [matieres, setMatieres] = useState([]);
  const [navOuverte, setNavOuverte] = useState(false);

  const [titre, setTitre] = useState('');
  const [matiereId, setMatiereId] = useState('');
  const [typeGeneral, setTypeGeneral] = useState('entrainement');
  const [nbQuestions, setNbQuestions] = useState(20);
  const [nbItems, setNbItems] = useState(5);

  const [questions, setQuestions] = useState(Array.from({ length: 20 }, () => QUESTION_VIDE(5)));
  const [message, setMessage] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [modeQuestions, setModeQuestions] = useState('manuel');

  useEffect(() => {
    async function charger() {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) { navigate('/'); return; }
      const { data: moi } = await supabase.from('profiles').select('role').eq('id', session.session.user.id).single();
      if (moi?.role !== 'tuteur' && moi?.role !== 'proprietaire') { navigate('/accueil'); return; }

      const { data: mats } = await supabase.from('annexe_matieres').select('*').eq('actif', true).order('nom');
      setMatieres(mats || []);
    }
    charger();
  }, []);

  const matieresTop = matieres.filter((m) => !m.parent_id);
  const sousMatieresDe = (parentId) => matieres.filter((m) => m.parent_id === parentId);
  const nomMatiere = (id) => matieres.find((m) => m.id === id)?.nom;

  const nbFixe = typeGeneral === 'concours_blanc';

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
    setEtape(2);
  }

  function questionsIncompletes() {
    return questions
      .map((q, idx) => ({ idx, incomplete: !q.enonce.trim() || !q.items.some((it) => it.est_correct) }))
      .filter((q) => q.incomplete);
  }

  function gererImportJson({ questions: questionsImportees, avertissements }) {
    const questionsAvecCle = questionsImportees.map((q) => ({ cleLocale: crypto.randomUUID(), lien: null, ...q }));
    setNbQuestions(questionsAvecCle.length);
    setNbItems(Math.max(...questionsAvecCle.map((q) => q.items.length)));
    setQuestions(questionsAvecCle);
    setModeQuestions('manuel');

    const base = `✅ ${questionsImportees.length} question(s) importée(s) depuis le JSON.`;
    setMessage(avertissements.length > 0 ? `${base} ⚠️ ${avertissements.join(' ')}` : base);
  }

  async function publier() {
    setEnCours(true);
    setMessage('');

    const { data: session } = await supabase.auth.getSession();
    const userId = session.session.user.id;

    const isAnnale = typeGeneral === 'annale';
    const typeQcmFinal = typeGeneral === 'concours_blanc' ? 'concours_blanc' : 'entrainement';

    const { data: qcm, error } = await supabase.from('annexe_qcms').insert({
      titre, matiere_id: matiereId, type_qcm: typeQcmFinal, is_annale: isAnnale, nb_questions: nbQuestions,
      duree_minutes: typeQcmFinal === 'concours_blanc' ? 30 : null, cree_par: userId,
    }).select().single();

    if (error) { setMessage('Erreur : ' + error.message); setEnCours(false); return; }

    for (let i = 0; i < questions.length; i++) {
      const { data: question } = await supabase.from('annexe_questions').insert({ qcm_id: qcm.id, ordre: i + 1, enonce: questions[i].enonce, lien: questions[i].lien || null }).select().single();
      await supabase.from('annexe_items').insert(
        questions[i].items.map((it, idx) => ({ question_id: question.id, lettre: LETTRES[idx], texte: it.texte, est_correct: it.est_correct, correction: it.correction }))
      );
    }

    await supabase.from('annexe_historique_qcm').insert({
      qcm_id: qcm.id, action: 'creation', effectue_par: userId,
      details: `${titre} — ${questions.length} questions (${nomMatiere(matiereId) || 'sans matière'})`,
    });

    setEnCours(false);
    navigate('/annexe/qcm/gerer');
  }

  // ===== ÉTAPE 1 : CONFIGURATION =====
  if (etape === 1) {
    return (
      <div>
        <AnnexeNav />
        <div className="container" style={{ maxWidth: 640 }}>
          <h1 className="page-title">Créer un QCM</h1>
          <p className="page-sub">Étape 1 sur 3 — configuration générale · publication immédiate, visible par tous les tuteurs/propriétaire</p>

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
              <label>Matière</label>
              <select value={matiereId} onChange={(e) => setMatiereId(e.target.value)}>
                <option value="">— choisir —</option>
                {matieresTop.map((top) => (
                  <optgroup key={top.id} label={top.nom}>
                    <option value={top.id}>{top.nom} (général)</option>
                    {sousMatieresDe(top.id).map((sm) => <option key={sm.id} value={sm.id}>↳ {sm.nom}</option>)}
                  </optgroup>
                ))}
              </select>
              {matieres.length === 0 && <p className="field-hint">Aucune matière pour l'instant — crée-en une depuis "🗂 Gérer les matières" sur la liste des QCM.</p>}
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

            {message && <div className="error-msg">{message}</div>}

            <button className="btn btn-primary" style={{ width: '100%' }} onClick={passerAuxQuestions}>Suivant : saisir les questions →</button>
          </div>
        </div>
      </div>
    );
  }

  // ===== ÉTAPE 3 : RÉCAPITULATIF =====
  if (etape === 3) {
    const incompletes = questionsIncompletes();
    return (
      <div>
        <AnnexeNav />
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
            <div className="recap-info-item"><span>Matière</span><span>{nomMatiere(matiereId)}</span></div>
            <div className="recap-info-item"><span>Type</span><span>{TYPES_QCM.find((t) => t.val === typeGeneral)?.titre}</span></div>
            <div className="recap-info-item"><span>Statut</span><span>Publication immédiate</span></div>
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
      </div>
    );
  }

  // ===== ÉTAPE 2 : QUESTIONS =====
  const nbRemplies = questions.filter((q) => q.enonce.trim() && q.items.some((it) => it.est_correct)).length;

  return (
    <div>
      <AnnexeNav />
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
            coursDescription={nomMatiere(matiereId) || '[décris ici le contenu que tu vas fournir]'}
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
                    👁 {apercuOuvert === qIdx ? "Fermer l'aperçu" : 'Aperçu'}
                  </button>
                </div>
                <textarea
                  value={q.enonce}
                  onChange={(e) => majQuestion(qIdx, 'enonce', e.target.value)}
                  placeholder="Énoncé de la question"
                  style={{ width: '100%', minHeight: 60, marginTop: 8, marginBottom: 8 }}
                />
                <ImageEnonceUpload identifiant={q.cleLocale} urlActuelle={q.lien} onChange={(url) => majQuestion(qIdx, 'lien', url)} />

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
                      <textarea value={it.correction} onChange={(e) => majItem(qIdx, iIdx, 'correction', e.target.value)} placeholder="Correction affichée au tuteur" />
                    </div>
                  </div>
                ))}

                {apercuOuvert === qIdx && (
                  <div style={{ marginTop: 14, padding: 16, background: 'var(--bg-panel)', borderRadius: 'var(--radius-md)' }}>
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase' }}>Aperçu</p>
                    <h3 style={{ marginTop: 0 }}>{q.enonce || <em style={{ color: 'var(--text-muted)' }}>(énoncé vide)</em>}</h3>
                    {q.lien && <img src={q.lien} alt="" style={{ maxWidth: '100%', height: 'auto', borderRadius: 'var(--radius-md)', margin: '0 0 12px' }} />}
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
    </div>
  );
}
