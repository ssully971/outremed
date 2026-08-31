import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

export default function DetailTentative() {
  const { attemptId } = useParams();
  const [donnees, setDonnees] = useState(null);
  const [index, setIndex] = useState(0);
  const [erreur, setErreur] = useState('');
  const [monId, setMonId] = useState(null);

  useEffect(() => {
    async function charger() {
      const { data: session } = await supabase.auth.getSession();
      setMonId(session.session.user.id);
      try {
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/attempt-detail`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.session.access_token}` },
          body: JSON.stringify({ attempt_id: attemptId }),
        });
        const result = await res.json().catch(() => ({}));
        if (!res.ok) { setErreur(result.error || "Une erreur est survenue lors du chargement."); return; }
        setDonnees(result);
      } catch (err) {
        setErreur("Impossible de contacter le serveur. Vérifie ta connexion et réessaie.");
      }
    }
    charger();
  }, [attemptId]);

  if (erreur) return <div style={{ padding: 40 }}>{erreur}</div>;
  if (!donnees) return <div style={{ padding: 40 }}>Chargement...</div>;

  const q = donnees.detail[index];
  const couleurStatut = { correct: 'var(--success)', partiel: 'var(--warning)', incorrect: 'var(--error)' };
  const labelStatut = { correct: 'Juste', partiel: 'Partiel', incorrect: 'Faux' };

  return (
    <div className="container" style={{ maxWidth: 760 }}>
      <Link
        to={monId === donnees.user_id ? '/resultats' : `/etudiants/${donnees.user_id}`}
        className="home-btn"
        style={{ display: 'inline-flex', marginBottom: 16 }}
      >
        ← {monId === donnees.user_id ? 'Retour aux résultats' : 'Retour à la fiche étudiant'}
      </Link>

      <h1 className="page-title">{donnees.titre}</h1>

      <div className="stats-grid" style={{ gridTemplateColumns: donnees.temps_passe_secondes ? 'repeat(2, 1fr)' : '1fr', marginBottom: 20 }}>
        <div className="stat-box">
          <div className="stat-value">{donnees.score}</div>
          <div className="stat-label">Score final</div>
        </div>
        {donnees.temps_passe_secondes && (
          <div className="stat-box">
            <div className="stat-value" style={{ color: 'var(--text-main)' }}>{Math.round(donnees.temps_passe_secondes / 60)} min</div>
            <div className="stat-label">Temps pris</div>
          </div>
        )}
      </div>

      <div className="card q-card" style={{ '--progress-width': `${(index / donnees.detail.length) * 100}%` }}>
        <div className="question-meta">
          <span>Question {index + 1}/{donnees.detail.length}</span>
          <span style={{ color: couleurStatut[q.statut], fontWeight: 700 }}>{labelStatut[q.statut]}</span>
        </div>

        <div className="question-title">{q.enonce}</div>

        {q.items.map((item) => {
          const isSelected = q.items_selectionnes.includes(item.id);
          let cls = 'item locked';
          if (item.est_correct) cls += isSelected ? ' r-correct' : ' r-missed';
          else if (isSelected) cls += ' r-incorrect';
          return (
            <div key={item.id} className={cls}>
              <span className="item-letter">{item.lettre}</span>
              <span className="item-text">{item.texte}</span>
            </div>
          );
        })}

        <div className="feedback-block">
          {q.items.map((item) => (
            <div key={item.id} className="expl-item" style={{ marginBottom: 6 }}>
              <strong style={{ color: item.est_correct ? 'var(--success)' : 'var(--error)' }}>{item.lettre}. {item.est_correct ? 'Vrai.' : 'Faux.'}</strong> {item.correction}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
          <button className="btn btn-outline" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>← Précédent</button>
          <button className="btn" disabled={index === donnees.detail.length - 1} onClick={() => setIndex((i) => i + 1)}>Suivant →</button>
        </div>
      </div>
    </div>
  );
}
