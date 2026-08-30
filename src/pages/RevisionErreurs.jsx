import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

export default function RevisionErreurs() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [questions, setQuestions] = useState(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [validated, setValidated] = useState({});
  const [termine, setTermine] = useState(false);

  useEffect(() => {
    async function charger() {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) { navigate('/'); return; }

      const body = {
        matiere_id: searchParams.get('matiere') || undefined,
        cours_id: searchParams.get('cours') || undefined,
        qcm_id: searchParams.get('qcm') || undefined,
      };

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/revision-erreurs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.session.access_token}` },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      setQuestions(result.questions || []);
    }
    charger();
  }, []);

  function toggleItem(itemId) {
    setAnswers((prev) => {
      const current = prev[questions[index].id] || [];
      const next = current.includes(itemId) ? current.filter((i) => i !== itemId) : [...current, itemId];
      return { ...prev, [questions[index].id]: next };
    });
  }

  function valider() {
    setValidated((prev) => ({ ...prev, [questions[index].id]: true }));
  }

  function suivant() {
    if (index < questions.length - 1) setIndex((i) => i + 1);
    else setTermine(true);
  }

  if (questions === null) return <div style={{ padding: 40 }}>Chargement...</div>;

  if (questions.length === 0) {
    return (
      <div className="container" style={{ maxWidth: 500, textAlign: 'center' }}>
        <div className="card">
          <h2>Rien à réviser ici</h2>
          <p style={{ color: 'var(--text-muted)' }}>Aucune erreur enregistrée pour cette sélection.</p>
          <Link to="/carnet-erreurs" className="btn btn-primary" style={{ textDecoration: 'none', display: 'inline-block' }}>Retour au carnet</Link>
        </div>
      </div>
    );
  }

  if (termine) {
    const nbJustes = questions.filter((q) => {
      const selected = answers[q.id] || [];
      const correctIds = q.items.filter((i) => i.est_correct).map((i) => i.id);
      return correctIds.length === selected.length && correctIds.every((id) => selected.includes(id));
    }).length;

    return (
      <div className="container" style={{ maxWidth: 500, textAlign: 'center' }}>
        <div className="card">
          <h2>Révision terminée !</h2>
          <p style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent)' }}>{nbJustes} / {questions.length} bien refaites</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 20 }}>
            Cette révision n'est pas comptée comme une tentative officielle — c'est juste pour t'entraîner.
          </p>
          <Link to="/carnet-erreurs" className="btn btn-primary" style={{ textDecoration: 'none', display: 'inline-block' }}>Retour au carnet</Link>
        </div>
      </div>
    );
  }

  const q = questions[index];
  const selected = answers[q.id] || [];
  const estValidee = validated[q.id];

  return (
    <div className="container" style={{ maxWidth: 760 }}>
      <Link to="/carnet-erreurs" className="home-btn" style={{ display: 'inline-flex', marginBottom: 16 }}>← Carnet d'erreurs</Link>

      <div className="card q-card" style={{ '--progress-width': `${(index / questions.length) * 100}%` }}>
        <div className="question-meta">
          <span>Question {index + 1}/{questions.length}</span>
          <span>{q.titreQcm}</span>
        </div>

        <div className="question-title">{q.enonce}</div>

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
            <button className="btn" onClick={suivant}>{index === questions.length - 1 ? 'Terminer' : 'Suivant →'}</button>
          )}
        </div>
      </div>
    </div>
  );
}
