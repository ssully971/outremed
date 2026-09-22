import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import ImageEnonceUpload from '../components/ImageEnonceUpload';
import AnnexeNav from '../components/AnnexeNav';

const LETTRES = 'ABCDEFGH';

export default function AnnexeEditionQcm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [chargement, setChargement] = useState(true);
  const [qcm, setQcm] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [matieres, setMatieres] = useState([]);
  const [message, setMessage] = useState('');
  const [enregistrement, setEnregistrement] = useState(false);
  const [apercuOuvert, setApercuOuvert] = useState(null);
  const [navOuverte, setNavOuverte] = useState(false);
  const [mode, setMode] = useState('edition');

  async function charger() {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) { navigate('/'); return; }
    const { data: moiRole } = await supabase.from('profiles').select('role').eq('id', session.session.user.id).single();
    if (moiRole?.role !== 'tuteur' && moiRole?.role !== 'proprietaire') { navigate('/accueil'); return; }

    const { data: qcmData } = await supabase.from('annexe_qcms').select('*').eq('id', id).single();
    setQcm(qcmData);

    const { data: qs } = await supabase.from('annexe_questions').select('*').eq('qcm_id', id).order('ordre');
    const { data: its } = await supabase.from('annexe_items').select('*').in('question_id', (qs || []).map((q) => q.id));
    setQuestions((qs || []).map((q) => ({ ...q, items: (its || []).filter((i) => i.question_id === q.id) })));

    const { data: mats } = await supabase.from('annexe_matieres').select('*').order('nom');
    setMatieres(mats || []);

    setChargement(false);
  }

  useEffect(() => { charger(); }, [id]);

  const matieresTop = matieres.filter((m) => !m.parent_id);
  const sousMatieresDe = (parentId) => matieres.filter((m) => m.parent_id === parentId);

  function majQcm(champ, valeur) {
    setQcm((prev) => ({ ...prev, [champ]: valeur }));
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

  async function enregistrer() {
    setEnregistrement(true);

    const { data: session } = await supabase.auth.getSession();

    await supabase.from('annexe_qcms').update({
      titre: qcm.titre,
      matiere_id: qcm.matiere_id,
    }).eq('id', id);

    for (const q of questions) {
      await supabase.from('annexe_questions').update({ enonce: q.enonce, lien: q.lien || null }).eq('id', q.id);
      for (const it of q.items) {
        await supabase.from('annexe_items').update({
          texte: it.texte, est_correct: it.est_correct, correction: it.correction,
        }).eq('id', it.id);
      }
    }

    await supabase.from('annexe_historique_qcm').insert({
      qcm_id: id, action: 'modification', effectue_par: session.session.user.id,
      details: `${qcm.titre} — modifié`,
    });

    setEnregistrement(false);
    setMessage('Modifications enregistrées.');
  }

  if (chargement) return <div style={{ padding: 40 }}>Chargement...</div>;
  if (!qcm) return <div style={{ padding: 40 }}>QCM introuvable.</div>;

  return (
    <div>
      <AnnexeNav />
      <div className="container" style={{ maxWidth: 700 }}>
        <h1 className="page-title">Modifier le QCM</h1>

        <div className="mode-selector" style={{ margin: '0 0 24px' }}>
          <div className={`mode-card ${mode === 'edition' ? 'selected' : ''}`} onClick={() => setMode('edition')}>
            <div className="mode-title">✏️ Modifier</div>
            <div className="mode-desc">Éditer le contenu question par question.</div>
          </div>
          <div className={`mode-card ${mode === 'apercu' ? 'selected' : ''}`} onClick={() => setMode('apercu')}>
            <div className="mode-title">👁 Aperçu</div>
            <div className="mode-desc">Défilement continu, réponses affichées.</div>
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
            <div className="settings-card">
              <div className="field">
                <label>Titre</label>
                <input value={qcm.titre} onChange={(e) => majQcm('titre', e.target.value)} />
              </div>

              <div className="field" style={{ marginBottom: 0 }}>
                <label>Matière</label>
                <select value={qcm.matiere_id || ''} onChange={(e) => majQcm('matiere_id', e.target.value)}>
                  <option value="">— choisir —</option>
                  {matieresTop.map((top) => (
                    <optgroup key={top.id} label={top.nom}>
                      <option value={top.id}>{top.nom} (général)</option>
                      {sousMatieresDe(top.id).map((sm) => <option key={sm.id} value={sm.id}>↳ {sm.nom}</option>)}
                    </optgroup>
                  ))}
                </select>
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
                  <button className="icon-action" style={{ width: 'auto', padding: '0 10px' }} title="Aperçu" onClick={() => setApercuOuvert(apercuOuvert === qIdx ? null : qIdx)}>👁</button>
                </div>
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

            {message && <div className="error-msg" style={{ color: 'var(--success)' }}>{message}</div>}

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
    </div>
  );
}
