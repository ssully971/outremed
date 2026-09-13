import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { envoyerNotificationGroupe } from '../lib/notifier';

const LETTRES = 'ABCDEFGH';

export default function QcmDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [userId, setUserId] = useState(null);
  const [qcm, setQcm] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [dejaFait, setDejaFait] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [meilleurScore, setMeilleurScore] = useState(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [validated, setValidated] = useState({}); // 'correct'|'partial'|'incorrect'|'skipped'
  const [timeLeft, setTimeLeft] = useState(1800);
  const [tempsEcoule, setTempsEcoule] = useState(0);
  const [dateDebut, setDateDebut] = useState(null);
  const [finished, setFinished] = useState(false);
  const [finalScore, setFinalScore] = useState(null);
  const [erreur, setErreur] = useState('');
  const [monPseudo, setMonPseudo] = useState('');
  const [signalementOuvert, setSignalementOuvert] = useState(false);
  const [messageSignalement, setMessageSignalement] = useState('');
  const [signalementEnvoye, setSignalementEnvoye] = useState(false);
  const [apercuSeul, setApercuSeul] = useState(false);
  const [apercuIndex, setApercuIndex] = useState(0);
  const [debutSession] = useState(Date.now());
  const [navOuverte, setNavOuverte] = useState(false);
  const [flagged, setFlagged] = useState(new Set());
  const [soumissionEnCours, setSoumissionEnCours] = useState(false);
  const soumissionEnvoyeeRef = useRef(false);
  const [filtreCorrection, setFiltreCorrection] = useState('tous');
  const [detailCorrection, setDetailCorrection] = useState([]);
  const [carteOuverte, setCarteOuverte] = useState(null);

  const modeFige = qcm?.type_qcm === 'concours_blanc';
  const [choixDemande, setChoixDemande] = useState(!modeFige);
  const [modeChoisi, setModeChoisi] = useState(null);

  const isConcours = modeFige || modeChoisi === 'concours';
  const peutPause = !modeFige && modeChoisi === 'entrainement';
  const clePause = `outremed_progression_${id}_${userId}`;

  useEffect(() => {
    async function charger() {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) { navigate('/'); return; }
      const uid = session.session.user.id;
      setUserId(uid);

      const { data: qcmData } = await supabase.from('qcms').select('*').eq('id', id).single();
      if (!qcmData) { setChargement(false); return; }
      setQcm(qcmData);
      const dureeSec = (qcmData.duree_minutes || 30) * 60;
      setTimeLeft(dureeSec);

      const { data: monProfil } = await supabase.from('profiles').select('role, pseudo').eq('id', uid).single();
      const estAdmin = monProfil?.role === 'tuteur' || monProfil?.role === 'proprietaire';
      setMonPseudo(monProfil?.pseudo || '');

      const { data: mesTentatives } = await supabase.from('attempts').select('id, score').eq('qcm_id', id).eq('user_id', uid);
      const aDejaTente = (mesTentatives || []).length > 0;
      if (mesTentatives && mesTentatives.length > 0) {
        setMeilleurScore(Math.max(...mesTentatives.map((t) => Number(t.score))));
      }

      if (estAdmin || aDejaTente) {
        const { data: qs } = await supabase.from('questions').select('*').eq('qcm_id', id).order('ordre');
        const { data: its } = await supabase.from('items_visibles').select('*').in('question_id', (qs || []).map((q) => q.id));
        const questionsAvecItems = (qs || []).map((q) => ({ ...q, items: (its || []).filter((i) => i.question_id === q.id) }));
        setQuestions(questionsAvecItems);

        const questionCiblee = searchParams.get('q');
        if (questionCiblee) {
          const indexCible = questionsAvecItems.findIndex((q) => q.ordre === Number(questionCiblee));
          if (indexCible >= 0) setApercuIndex(indexCible);
        }

        setApercuSeul(true);
        setChargement(false);
        return;
      }

      if (qcmData.type_qcm === 'concours_blanc') {
        const { data: tentative } = await supabase
          .from('attempts').select('*').eq('qcm_id', id).eq('user_id', uid).limit(1);
        if (tentative && tentative.length > 0) {
          setDejaFait(tentative[0]);
          setChargement(false);
          return;
        }
      }

      const { data: qs } = await supabase.from('questions').select('*').eq('qcm_id', id).order('ordre');
      const { data: its } = await supabase.from('items_visibles').select('*').in('question_id', (qs || []).map((q) => q.id));

      const questionsAvecItems = (qs || []).map((q) => ({
        ...q,
        items: (its || []).filter((i) => i.question_id === q.id),
      }));
      setQuestions(questionsAvecItems);

      const questionCiblee = searchParams.get('q');
      if (questionCiblee) {
        const indexCible = questionsAvecItems.findIndex((q) => q.ordre === Number(questionCiblee));
        if (indexCible >= 0) setCurrentIndex(indexCible);
      }

      const sauvegarde = localStorage.getItem(`outremed_progression_${id}_${uid}`);
      if (sauvegarde) {
        const parsed = JSON.parse(sauvegarde);

        if (parsed.dateDebut) {
          const ecouleSec = Math.floor((Date.now() - new Date(parsed.dateDebut).getTime()) / 1000);
          if (ecouleSec < dureeSec) {
            setCurrentIndex(parsed.currentIndex || 0);
            setAnswers(parsed.answers || {});
            setDateDebut(parsed.dateDebut);
            setTimeLeft(dureeSec - ecouleSec);
            if (parsed.modeChoisi) { setModeChoisi(parsed.modeChoisi); setChoixDemande(false); }
          } else if (qcmData.type_qcm === 'concours_blanc') {
            setCurrentIndex(parsed.currentIndex || 0);
            setAnswers(parsed.answers || {});
            setDateDebut(parsed.dateDebut);
            setTimeLeft(0);
          } else {
            localStorage.removeItem(clePause);
          }
        } else {
          setCurrentIndex(parsed.currentIndex || 0);
          setAnswers(parsed.answers || {});
          setValidated(parsed.validated || {});
          setTempsEcoule(parsed.tempsEcoule || 0);
          if (parsed.modeChoisi) {
            setModeChoisi(parsed.modeChoisi);
            setChoixDemande(false);
          }
        }
      } else if (qcmData.type_qcm === 'concours_blanc') {
        setDateDebut(new Date().toISOString());
      }

      setChargement(false);
    }
    charger();
  }, [id]);

  useEffect(() => {
    if (!userId || finished || chargement || dejaFait || apercuSeul || choixDemande) return;
    localStorage.setItem(clePause, JSON.stringify({
      currentIndex, answers, validated, modeChoisi, dateDebut, tempsEcoule,
      dernierModif: Date.now(),
    }));
  }, [currentIndex, answers, validated, modeChoisi, dateDebut, tempsEcoule]);

  // Chrono : décompte en concours, temps écoulé en entraînement
  useEffect(() => {
    if (finished || chargement || dejaFait || choixDemande) return;
    if (isConcours) {
      if (timeLeft <= 0) { soumettreConcours(); return; }
      const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setTempsEcoule((s) => s + 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, tempsEcoule, isConcours, finished, chargement, choixDemande]);

  const currentQuestion = questions[currentIndex];

  function toggleItem(itemId) {
    setAnswers((prev) => {
      const current = prev[currentQuestion.id] || [];
      const next = current.includes(itemId) ? current.filter((i) => i !== itemId) : [...current, itemId];
      return { ...prev, [currentQuestion.id]: next };
    });
  }

  function evaluer(question, selected) {
    const erreurs = question.items.filter((i) => i.est_correct && !selected.includes(i.id)).length
      + question.items.filter((i) => !i.est_correct && selected.includes(i.id)).length;
    return erreurs === 0 ? 1 : erreurs === 1 ? 0.5 : 0;
  }

  function validerEntrainement() {
    const selected = answers[currentQuestion.id] || [];
    const pts = evaluer(currentQuestion, selected);
    setValidated((prev) => ({ ...prev, [currentQuestion.id]: pts === 1 ? 'correct' : pts === 0.5 ? 'partial' : 'incorrect' }));
  }

  function passerQuestion() {
    setValidated((prev) => ({ ...prev, [currentQuestion.id]: 'skipped' }));
    setTimeout(() => next(), 50);
  }

  function next() {
    if (currentIndex < questions.length - 1) setCurrentIndex((i) => i + 1);
    else finirEntrainement();
  }
  function precedent() {
    if (currentIndex > 0) setCurrentIndex((i) => i - 1);
  }

  async function finirEntrainement() {
    if (soumissionEnvoyeeRef.current) return;
    soumissionEnvoyeeRef.current = true;
    setSoumissionEnCours(true);

    let score = 0;
    const detail = [];
    questions.forEach((q) => {
      const selected = answers[q.id] || [];
      const statutExistant = validated[q.id];
      let statut, pts;
      if (statutExistant === 'skipped' && selected.length === 0) {
        statut = 'incorrect'; pts = 0;
      } else {
        pts = evaluer(q, selected);
        statut = pts === 1 ? 'correct' : pts === 0.5 ? 'partiel' : 'incorrect';
      }
      score += pts;
      detail.push({ question_id: q.id, items_selectionnes: selected, statut: statut === 'incorrect' ? 'incorrect' : statut });
    });

    const tempsPasse = Math.floor((Date.now() - debutSession) / 1000);
    const { data: attempt, error: erreurAttempt } = await supabase
      .from('attempts').insert({ qcm_id: id, user_id: userId, score, temps_passe_secondes: tempsPasse }).select().single();

    if (erreurAttempt || !attempt) {
      setErreur("Impossible d'enregistrer ta tentative. Vérifie ta connexion et réessaie.");
      soumissionEnvoyeeRef.current = false;
      setSoumissionEnCours(false);
      return;
    }
    await supabase.from('attempt_answers').insert(detail.map((d) => ({ attempt_id: attempt.id, ...d })));

    localStorage.removeItem(clePause);
    setFinalScore(score);
    construireCorrection();
    setFinished(true);
  }

  async function soumettreConcours() {
    if (soumissionEnvoyeeRef.current) return;
    soumissionEnvoyeeRef.current = true;
    setSoumissionEnCours(true);

    const payload = questions.map((q) => ({ question_id: q.id, items_selectionnes: answers[q.id] || [] }));
    const { data: session } = await supabase.auth.getSession();
    const dureeSec = (qcm.duree_minutes || 30) * 60;

    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/grade-qcm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.session.access_token}` },
        body: JSON.stringify({ qcm_id: id, reponses: payload, temps_passe_secondes: dureeSec - timeLeft }),
      });
      let result;
      try {
        result = await res.json();
      } catch {
        result = {};
      }

      if (!res.ok) {
        setErreur(result.error || "Une erreur est survenue lors de l'enregistrement. Réessaie, et si ça persiste, préviens ton tuteur.");
        soumissionEnvoyeeRef.current = false;
        setSoumissionEnCours(false);
        return;
      }
      localStorage.removeItem(clePause);
      setFinalScore(result.score);
      construireCorrection();
      setFinished(true);
    } catch {
      setErreur("Impossible de contacter le serveur pour enregistrer ta tentative. Vérifie ta connexion et réessaie.");
      soumissionEnvoyeeRef.current = false;
      setSoumissionEnCours(false);
    }
  }

  function construireCorrection() {
    const detail = questions.map((q) => {
      const selected = answers[q.id] || [];
      let statut;
      if (isConcours) {
        const pts = evaluer(q, selected);
        statut = pts === 1 ? 'correct' : pts === 0.5 ? 'partial' : selected.length === 0 ? 'skipped' : 'incorrect';
      } else {
        statut = validated[q.id] || (selected.length === 0 ? 'skipped' : 'incorrect');
      }
      return { question: q, selected, statut };
    });
    setDetailCorrection(detail);
  }

  function quitterPause() {
    navigate('/qcm');
  }

  function basculerFlag() {
    setFlagged((prev) => {
      const next = new Set(prev);
      if (next.has(currentQuestion.id)) next.delete(currentQuestion.id); else next.add(currentQuestion.id);
      return next;
    });
  }

  async function envoyerSignalement(question) {
    if (!messageSignalement.trim()) return;
    await supabase.from('signalements_erreur').insert({
      qcm_id: id, question_id: question.id, auteur_id: userId, message: messageSignalement.trim(),
    });
    const { data: admins } = await supabase.from('profils_publics').select('id').in('role', ['tuteur', 'proprietaire']);
    if (admins && admins.length > 0) {
      await envoyerNotificationGroupe(admins.map((a) => a.id), 'signalement_erreur', `${monPseudo} a signalé une erreur sur "${qcm.titre}"`, `/qcm/${id}?q=${question.ordre}`);
    }
    setMessageSignalement('');
    setSignalementOuvert(false);
    setSignalementEnvoye(true);
    setTimeout(() => setSignalementEnvoye(false), 3000);
  }

  function choisirMode(mode) {
    setModeChoisi(mode);
    setChoixDemande(false);
    if (mode === 'concours') setDateDebut(new Date().toISOString());
  }

  function statutNav(q) {
    if (isConcours) return (answers[q.id] || []).length > 0 ? 'answered-concours' : '';
    return validated[q.id] === 'skipped' ? 'incorrect' : (validated[q.id] || '');
  }

  function copierCarnet() {
    let log = `=== CARNET D'ERREURS — ${qcm.titre} ===\n\n`;
    detailCorrection.forEach((d, i) => {
      if (d.statut === 'correct') return;
      log += `Q${i + 1}: ${d.question.enonce}\n`;
      d.question.items.forEach((item, idx) => {
        const sel = d.selected.includes(item.id);
        log += `${sel ? '[X]' : '[ ]'} ${LETTRES[idx]}. ${item.texte} (${item.est_correct ? 'VRAI' : 'FAUX'})\n`;
      });
      log += '\n';
    });
    navigator.clipboard.writeText(log).then(() => alert('Copié dans le presse-papier !'));
  }

  if (chargement) return <div className="container">Chargement...</div>;
  if (!qcm) return <div className="container">QCM introuvable.</div>;

  // ===== APERÇU ADMIN =====
  if (apercuSeul) {
    const q = questions[apercuIndex];
    if (!q) return <div className="container">Aucune question.</div>;
    return (
      <div className="container" style={{ maxWidth: 760 }}>
        <Link to="/qcm/gerer" className="home-btn" style={{ marginBottom: 16, display: 'inline-flex' }}>← Gérer les QCM</Link>
        <div className="card">
          <div className="question-meta">
            <span>Aperçu — Question {apercuIndex + 1}/{questions.length}</span>
            <span style={{ color: 'var(--accent)', fontFamily: 'monospace' }}>#{String(qcm.numero).padStart(4, '0')}</span>
          </div>
          <div className="question-title">{q.enonce}</div>
          {q.items.map((item, idx) => (
            <div key={item.id} className={`item locked ${item.est_correct ? 'r-correct' : ''}`}>
              <span className="item-letter">{LETTRES[idx]}</span>
              <span className="item-text">{item.texte}</span>
            </div>
          ))}
          <div className="feedback-block">
            {q.items.map((item, idx) => (
              <div key={item.id} className="expl-item" style={{ marginBottom: 8 }}>
                <strong style={{ color: item.est_correct ? 'var(--success)' : 'var(--error)' }}>{LETTRES[idx]}. {item.est_correct ? 'Vrai.' : 'Faux.'}</strong> {item.correction}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
            <button className="btn btn-outline" disabled={apercuIndex === 0} onClick={() => setApercuIndex((i) => i - 1)}>← Précédent</button>
            <button className="btn" disabled={apercuIndex === questions.length - 1} onClick={() => setApercuIndex((i) => i + 1)}>Suivant →</button>
          </div>
          <div style={{ marginTop: 16 }}>
            {signalementEnvoye ? <p style={{ fontSize: '0.78rem', color: 'var(--success)' }}>Signalement envoyé.</p>
              : signalementOuvert ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={messageSignalement} onChange={(e) => setMessageSignalement(e.target.value)} placeholder="Décris le problème..." style={{ flex: 1 }} />
                  <button className="btn btn-outline" onClick={() => envoyerSignalement(q)}>Envoyer</button>
                  <button className="btn btn-ghost" onClick={() => setSignalementOuvert(false)}>Annuler</button>
                </div>
              ) : (
                <button onClick={() => setSignalementOuvert(true)} className="btn-ghost" style={{ background: 'none', border: 'none', fontSize: '0.78rem', cursor: 'pointer', textDecoration: 'underline' }}>
                  🚩 Signaler une erreur
                </button>
              )}
          </div>
        </div>
      </div>
    );
  }

  if (dejaFait) {
    return (
      <div className="container" style={{ maxWidth: 500, textAlign: 'center' }}>
        <div className="card">
          <h2>{qcm.titre}</h2>
          <p style={{ color: 'var(--text-muted)' }}>Tu as déjà fait ce QCM — une seule tentative est autorisée.</p>
          <div className="stats-grid" style={{ gridTemplateColumns: '1fr' }}>
            <div className="stat-box"><div className="stat-value">{dejaFait.score}/{qcm.nb_questions}</div><div className="stat-label">Ton score</div></div>
          </div>
          <Link to="/qcm" className="btn btn-outline" style={{ textDecoration: 'none', display: 'inline-block' }}>Retour aux QCM</Link>
        </div>
      </div>
    );
  }

  // ===== ÉCRAN DE RÉSULTATS =====
  if (finished) {
    const nbFiltre = filtreCorrection === 'incorrect' ? detailCorrection.filter((d) => d.statut !== 'correct') : detailCorrection;
    const tempsFinal = isConcours ? (qcm.duree_minutes || 30) * 60 - timeLeft : tempsEcoule;
    const labelStatut = { correct: 'Juste (+1)', partial: 'Partiel (+0.5)', incorrect: 'Faux (0)', skipped: 'Non répondue (0)' };
    const classeStatut = { correct: 'st-correct', partial: 'st-partial', incorrect: 'st-incorrect', skipped: 'st-skipped' };

    return (
      <div className="container" style={{ maxWidth: 760 }}>
        <h1 style={{ textAlign: 'center', color: 'var(--accent)' }}>Résultats</h1>
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="stat-box"><div className="stat-value">{finalScore}/{qcm.nb_questions}</div><div className="stat-label">Score</div></div>
          <div className="stat-box"><div className="stat-value">{Math.round((finalScore / qcm.nb_questions) * 100)}%</div><div className="stat-label">Réussite</div></div>
          <div className="stat-box"><div className="stat-value">{Math.floor(tempsFinal / 60)}m {tempsFinal % 60}s</div><div className="stat-label">Temps</div></div>
        </div>

        <button className="btn btn-outline" onClick={copierCarnet} style={{ width: '100%', marginBottom: 20, borderStyle: 'dashed', justifyContent: 'center' }}>
          📋 Copier le carnet d'erreurs
        </button>

        <div className="review-controls">
          <h3 style={{ margin: 0 }}>Correction détaillée</h3>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className={`filter-btn ${filtreCorrection === 'tous' ? 'active' : ''}`} onClick={() => setFiltreCorrection('tous')}>Tout</button>
            <button className={`filter-btn ${filtreCorrection === 'incorrect' ? 'active' : ''}`} onClick={() => setFiltreCorrection('incorrect')} style={{ color: 'var(--error)' }}>Erreurs</button>
          </div>
        </div>

        <div className="review-list">
          {nbFiltre.map((d) => {
            const indexReel = detailCorrection.indexOf(d);
            const estOuvert = carteOuverte === indexReel;
            return (
              <div key={indexReel} className={`review-card ${estOuvert ? 'expanded' : ''}`}>
                <div className="review-header" onClick={() => setCarteOuverte(estOuvert ? null : indexReel)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontWeight: 'bold', color: 'var(--text-muted)' }}>Q{indexReel + 1}</span>
                    <span className={`review-status ${classeStatut[d.statut]}`}>{labelStatut[d.statut]}</span>
                  </div>
                  <span className="arrow">▾</span>
                </div>
                {estOuvert && (
                  <div className="review-body">
                    <div style={{ fontWeight: 700, marginBottom: 15, fontSize: '1.1rem' }}>{d.question.enonce}</div>
                    {d.question.items.map((item, idx) => {
                      const selectionne = d.selected.includes(item.id);
                      let cls = 'item';
                      if (item.est_correct) cls += ' r-correct';
                      if (selectionne && !item.est_correct) cls += ' r-incorrect';
                      if (!selectionne && item.est_correct && d.statut !== 'correct') cls += ' r-missed';
                      return (
                        <div key={item.id} className={cls} style={{ pointerEvents: 'none', padding: '10px 15px' }}>
                          <span className="item-letter">{LETTRES[idx]}</span>
                          <span className="item-text">{item.texte}</span>
                          {selectionne && <span style={{ marginLeft: 'auto', fontSize: '0.8rem', opacity: 0.7 }}>(Coché)</span>}
                        </div>
                      );
                    })}
                    <div style={{ marginTop: 20, paddingTop: 15, borderTop: '1px dashed var(--border)' }}>
                      <strong>Explication :</strong>
                      <div style={{ marginTop: 5, fontSize: '0.95rem', lineHeight: 1.6, color: 'var(--text-muted)' }}>
                        {d.question.items.map((item, idx) => (
                          <div key={item.id} style={{ marginBottom: 6 }}>
                            <strong style={{ color: item.est_correct ? 'var(--success)' : 'var(--error)' }}>{LETTRES[idx]}. {item.est_correct ? 'Vrai.' : 'Faux.'}</strong> {item.correction}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 15, marginTop: 40 }}>
          <Link to="/qcm" className="btn btn-outline" style={{ textDecoration: 'none' }}>Retour aux QCM</Link>
        </div>
      </div>
    );
  }

  // ===== ÉCRAN DE CHOIX DU MODE =====
  if (choixDemande) {
    const dureeEstimee = qcm.duree_minutes || Math.max(5, Math.round((qcm.nb_questions || questions.length) * 0.75));
    return (
      <div className="container" style={{ maxWidth: 700, textAlign: 'center' }}>
        <h1 style={{ color: 'var(--accent)', fontSize: '2.4rem', margin: '10px 0 0' }}>{qcm.titre}</h1>
        <p style={{ color: 'var(--text-muted)', margin: '10px 0' }}>
          {qcm.nb_questions} Questions à Choix Multiples · Temps estimé {dureeEstimee} min
          {meilleurScore !== null && <> · Meilleur score : <strong style={{ color: 'var(--accent)' }}>{meilleurScore}</strong></>}
        </p>
        <h3 style={{ marginTop: 24 }}>Choisis ton mode :</h3>
        <div className="mode-selector">
          <div className={`mode-card ${modeChoisi === 'entrainement' ? 'selected' : ''}`} onClick={() => setModeChoisi('entrainement')}>
            <div className="mode-title">🎯 Entraînement</div>
            <div className="mode-desc">Correction affichée immédiatement après chaque question.</div>
          </div>
          <div className={`mode-card ${modeChoisi === 'concours' ? 'selected' : ''}`} onClick={() => setModeChoisi('concours')}>
            <div className="mode-title">⏳ Concours</div>
            <div className="mode-desc">Compte à rebours de {dureeEstimee} min, correction à la toute fin.</div>
          </div>
        </div>
        <button className="btn" style={{ width: 220 }} disabled={!modeChoisi} onClick={() => choisirMode(modeChoisi)}>Commencer</button>
      </div>
    );
  }

  // ===== ÉCRAN DE PASSATION =====
  const timeLabel = isConcours
    ? `${String(Math.floor(timeLeft / 60)).padStart(2, '0')}:${String(timeLeft % 60).padStart(2, '0')}`
    : `${String(Math.floor(tempsEcoule / 60)).padStart(2, '0')}:${String(tempsEcoule % 60).padStart(2, '0')}`;
  const statutActuel = validated[currentQuestion?.id];
  const isValidatedNow = !isConcours && statutActuel;
  const selected = answers[currentQuestion?.id] || [];

  return (
    <div className="container" style={{ maxWidth: 760 }}>
      <div className="header-bar">
        <button className="home-btn" onClick={() => navigate('/qcm')}>← Index</button>
        <button className="icon-btn" onClick={() => setNavOuverte(true)}>☰</button>
        <div className={`timer ${isConcours && timeLeft < 300 ? 'danger' : ''}`}>{timeLabel}</div>
        <div className="header-actions">
          <button className={`icon-btn ${flagged.has(currentQuestion?.id) ? 'active-flag' : ''}`} onClick={basculerFlag} title="Épingler la question">🚩</button>
        </div>
      </div>

      <div className="card q-card" style={{ '--progress-width': `${(currentIndex / questions.length) * 100}%` }}>
        <div className="question-meta">
          <span>Question {currentIndex + 1}/{questions.length}</span>
          <span style={{ opacity: 0.5 }}>Choix Multiples (QCM)</span>
        </div>
        <div className="question-title">{currentQuestion?.enonce}</div>

        {currentQuestion?.items.map((item, idx) => {
          const isSelected = selected.includes(item.id);
          let cls = 'item';
          if (isSelected) cls += ' selected';
          if (isValidatedNow && statutActuel !== 'skipped') {
            cls += item.est_correct ? (isSelected ? ' r-correct' : ' r-missed') : isSelected ? ' r-incorrect' : '';
            cls += ' locked';
          } else if (isValidatedNow) {
            cls += ' locked';
          }
          return (
            <div key={item.id} className={cls} onClick={() => !isValidatedNow && toggleItem(item.id)}>
              <span className="item-letter">{LETTRES[idx]}</span>
              <span className="item-text">{item.texte}</span>
            </div>
          );
        })}

        {isValidatedNow && (
          <div className={`feedback-block ${statutActuel === 'skipped' ? '' : statutActuel}`}>
            {statutActuel !== 'skipped' && (
              <div style={{ fontWeight: 700, marginBottom: 10, color: 'var(--accent)' }}>
                {statutActuel === 'correct' ? '1 / 1 point' : statutActuel === 'partial' ? '0,5 / 1 point' : '0 / 1 point'}
              </div>
            )}
            {currentQuestion.items.map((item, idx) => (
              <div key={item.id} className="expl-item" style={{ marginBottom: 6 }}>
                <strong style={{ color: item.est_correct ? 'var(--success)' : 'var(--error)' }}>{LETTRES[idx]}. {item.est_correct ? 'Vrai.' : 'Faux.'}</strong> {item.correction}
              </div>
            ))}
          </div>
        )}

        {erreur && <div className="error-msg">{erreur}</div>}

        <div style={{ marginTop: 16 }}>
          {signalementEnvoye ? <p style={{ fontSize: '0.78rem', color: 'var(--success)' }}>Signalement envoyé, merci !</p>
            : signalementOuvert ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={messageSignalement} onChange={(e) => setMessageSignalement(e.target.value)} placeholder="Décris le problème..." style={{ flex: 1 }} />
                <button className="btn btn-outline" onClick={() => envoyerSignalement(currentQuestion)}>Envoyer</button>
                <button className="btn btn-ghost" onClick={() => setSignalementOuvert(false)}>Annuler</button>
              </div>
            ) : (
              <button onClick={() => setSignalementOuvert(true)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.78rem', cursor: 'pointer', textDecoration: 'underline' }}>
                🚩 Signaler une erreur sur cette question
              </button>
            )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
        <button className="btn btn-outline" onClick={precedent} style={{ visibility: currentIndex === 0 ? 'hidden' : 'visible' }}>← Retour</button>
        <div style={{ flex: 1 }} />
        {peutPause && <button className="btn btn-ghost" onClick={quitterPause}>Mettre en pause</button>}
        {!isConcours && !isValidatedNow && <button className="btn btn-ghost" onClick={passerQuestion}>Passer</button>}
        {!isConcours && !isValidatedNow && <button className="btn" onClick={validerEntrainement}>Valider</button>}
        {(isConcours || isValidatedNow) && (
          <button
            className="btn"
            disabled={currentIndex === questions.length - 1 && soumissionEnCours}
            onClick={currentIndex === questions.length - 1 ? (isConcours ? soumettreConcours : next) : next}
          >
            {currentIndex === questions.length - 1
              ? (soumissionEnCours ? 'Enregistrement...' : (isConcours ? 'Enregistrer' : 'Terminer'))
              : (isConcours ? 'Enregistrer & Suivant' : 'Suivant →')}
          </button>
        )}
      </div>

      {navOuverte && (
        <div className="nav-overlay" onClick={(e) => e.target === e.currentTarget && setNavOuverte(false)}>
          <div className="nav-content">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0 }}>Navigation</h2>
              <button onClick={() => setNavOuverte(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-main)' }}>✕</button>
            </div>
            <div className="nav-grid">
              {questions.map((q, idx) => (
                <button
                  key={q.id}
                  className={`nav-item ${statutNav(q)} ${idx === currentIndex ? 'current' : ''} ${flagged.has(q.id) ? 'flagged' : ''}`}
                  onClick={() => { setCurrentIndex(idx); setNavOuverte(false); }}
                >
                  {idx + 1}
                </button>
              ))}
            </div>
            {!isConcours ? (
              <div className="nav-legend">
                <div className="legend-item"><div className="legend-dot" style={{ background: 'var(--success)' }} />Juste</div>
                <div className="legend-item"><div className="legend-dot" style={{ background: 'var(--warning)' }} />Partiel</div>
                <div className="legend-item"><div className="legend-dot" style={{ background: 'var(--error)' }} />Faux</div>
                <div className="legend-item"><div className="legend-dot" style={{ background: 'var(--flag-color)' }} />Épinglé</div>
              </div>
            ) : (
              <>
                <div className="nav-legend">
                  <div className="legend-item"><div className="legend-dot" style={{ background: 'var(--answered-bg)' }} />Répondu</div>
                  <div className="legend-item"><div className="legend-dot" style={{ background: 'var(--flag-color)' }} />Épinglé</div>
                </div>
                <button className="btn btn-danger" style={{ width: '100%', marginTop: 20 }} onClick={() => { setNavOuverte(false); soumettreConcours(); }}>
                  Terminer l'épreuve maintenant
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
