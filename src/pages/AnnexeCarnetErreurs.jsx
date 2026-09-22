import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import AnnexeNav from '../components/AnnexeNav';

export default function AnnexeCarnetErreurs() {
  const navigate = useNavigate();
  const [chargement, setChargement] = useState(true);
  const [questions, setQuestions] = useState([]);
  const [matieres, setMatieres] = useState([]);
  const [matiereActive, setMatiereActive] = useState(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [validated, setValidated] = useState({});
  const [termine, setTermine] = useState(false);

  useEffect(() => {
    async function charger() {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) { navigate('/'); return; }
      const uid = session.session.user.id;
      const { data: moi } = await supabase.from('profiles').select('role').eq('id', uid).single();
      if (moi?.role !== 'tuteur' && moi?.role !== 'proprietaire') { navigate('/accueil'); return; }

      const { data: mesAttempts } = await supabase.from('annexe_attempts').select('id').eq('user_id', uid);
      const attemptIds = (mesAttempts || []).map((a) => a.id);
      if (attemptIds.length === 0) { setQuestions([]); setChargement(false); return; }

      const { data: reponses } = await supabase
        .from('annexe_attempt_answers')
        .select('question_id, statut')
        .in('attempt_id', attemptIds)
        .neq('statut', 'correct');

      const questionIds = [...new Set((reponses || []).map((r) => r.question_id))];
      if (questionIds.length === 0) { setQuestions([]); setChargement(false); return; }

      const { data: qs } = await supabase
        .from('annexe_questions')
        .select('id, enonce, lien, qcm_id, annexe_qcms(titre, matiere_id)')
        .in('id', questionIds);
      const { data: its } = await supabase.from('annexe_items').select('*').in('question_id', questionIds);
      const { data: mats } = await supabase.from('annexe_matieres').select('*');

      const questionsCompletes = (qs || []).map((q) => ({
        id: q.id,
        enonce: q.enonce,
        lien: q.lien,
        titreQcm: q.annexe_qcms?.titre,
        matiereId: q.annexe_qcms?.matiere_id,
        items: (its || []).filter((i) => i.question_id === q.id),
      }));

      setQuestions(questionsCompletes);
      setMatieres(mats || []);
      setChargement(false);
    }
    charger();
  }, []);

  function toggleItem(itemId) {
    const q = questionsMatiere[index];
    setAnswers((prev) => {
      const current = prev[q.id] || [];
      const next = current.includes(itemId) ? current.filter((i) => i !== itemId) : [...current, itemId];
      return { ...prev, [q.id]: next };
    });
  }

  function valider() {
    setValidated((prev) => ({ ...prev, [questionsMatiere[index].id]: true }));
  }

  function suivant() {
    if (index < questionsMatiere.length - 1) setIndex((i) => i + 1);
    else setTermine(true);
  }

  function commencerRevision(matiereId) {
    setMatiereActive(matiereId);
    setIndex(0);
    setAnswers({});
    setValidated({});
    setTermine(false);
  }

  if (chargement) return <div style={{ padding: 40 }}>Chargement...</div>;

  const parMatiere = {};
  questions.forEach((q) => {
    const nom = matieres.find((m) => m.id === q.matiereId)?.nom || 'Autre';
    if (!parMatiere[nom]) parMatiere[nom] = { matiereId: q.matiereId, count: 0 };
    parMatiere[nom].count += 1;
  });

  const questionsMatiere = matiereActive === 'toutes'
    ? questions
    : questions.filter((q) => q.matiereId === matiereActive);

  // ===== ÉCRAN DE RÉVISION =====
  if (matiereActive !== null) {
    if (questionsMatiere.length === 0) {
      return (
        <div>
          <AnnexeNav />
          <div className="container" style={{ maxWidth: 500, textAlign: 'center' }}>
            <div className="card">
              <h2>Rien à réviser ici</h2>
              <button className="btn btn-primary" onClick={() => setMatiereActive(null)}>Retour au carnet</button>
            </div>
          </div>
        </div>
      );
    }

    if (termine) {
      const nbJustes = questionsMatiere.filter((q) => {
        const selected = answers[q.id] || [];
        const correctIds = q.items.filter((i) => i.est_correct).map((i) => i.id);
        return correctIds.length === selected.length && correctIds.every((id) => selected.includes(id));
      }).length;

      return (
        <div>
          <AnnexeNav />
          <div className="container" style={{ maxWidth: 500, textAlign: 'center' }}>
            <div className="card">
              <h2>Révision terminée !</h2>
              <p style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent)' }}>{nbJustes} / {questionsMatiere.length} bien refaites</p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 20 }}>
                Cette révision n'est pas comptée comme une tentative officielle.
              </p>
              <button className="btn btn-primary" onClick={() => setMatiereActive(null)}>Retour au carnet</button>
            </div>
          </div>
        </div>
      );
    }

    const q = questionsMatiere[index];
    const selected = answers[q.id] || [];
    const estValidee = validated[q.id];

    return (
      <div>
        <AnnexeNav />
        <div className="container" style={{ maxWidth: 760 }}>
          <button className="home-btn" style={{ display: 'inline-flex', marginBottom: 16 }} onClick={() => setMatiereActive(null)}>← Carnet d'erreurs</button>

          <div className="card q-card" style={{ '--progress-width': `${(index / questionsMatiere.length) * 100}%` }}>
            <div className="question-meta">
              <span>Question {index + 1}/{questionsMatiere.length}</span>
              <span>{q.titreQcm}</span>
            </div>

            <div className="question-title">{q.enonce}</div>
            {q.lien && <img src={q.lien} alt="" style={{ maxWidth: '100%', height: 'auto', borderRadius: 'var(--radius-md)', margin: '0 0 16px', display: 'block' }} />}

            {q.items.map((item) => {
              const isSelected = selected.includes(item.id);
              let cls = 'item';
              if (isSelected) cls += ' selected';
              if (estValidee) {
                cls += item.est_correct ? (isSelected ? ' r-correct' : ' r-missed') : isSelected ? ' r-incorrect' : '';
                cls += ' locked';
              }
              return (
                <div key={item.id} className={cls} onClick={() => !estValidee && toggleItem(item.id)}>
                  <span className="item-letter">{item.lettre}</span>
                  <span className="item-text">{item.texte}</span>
                </div>
              );
            })}

            {estValidee && (
              <div className="feedback-block">
                {q.items.map((item) => (
                  <div key={item.id} className="expl-item" style={{ marginBottom: 6 }}>
                    <strong style={{ color: item.est_correct ? 'var(--success)' : 'var(--error)' }}>{item.lettre}. {item.est_correct ? 'Vrai.' : 'Faux.'}</strong> {item.correction}
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
              {!estValidee ? (
                <button className="btn" onClick={valider}>Valider</button>
              ) : (
                <button className="btn" onClick={suivant}>{index === questionsMatiere.length - 1 ? 'Terminer' : 'Suivant →'}</button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ===== ÉCRAN DE REGROUPEMENT PAR MATIÈRE =====
  return (
    <div>
      <AnnexeNav />
      <div className="container" style={{ maxWidth: 600 }}>
        <h1 className="page-title">Carnet d'erreurs</h1>
        <p className="page-sub">Les questions ratées ou partielles dans l'espace tuteurs, à revoir.</p>

        {questions.length === 0 && (
          <div className="card" style={{ textAlign: 'center' }}>
            <p style={{ color: 'var(--text-muted)' }}>Rien à réviser pour l'instant.</p>
          </div>
        )}

        {questions.length > 0 && (
          <>
            <button className="btn btn-primary" style={{ width: '100%', marginBottom: 16 }} onClick={() => commencerRevision('toutes')}>
              Tout réviser ({questions.length})
            </button>
            <div className="detail-subject-list">
              {Object.entries(parMatiere).map(([nom, v]) => (
                <div key={nom} className="detail-subject-row" style={{ cursor: 'pointer' }} onClick={() => commencerRevision(v.matiereId)}>
                  <span className="ds-name">{nom}</span>
                  <span className="ds-score">{v.count} question(s)</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
