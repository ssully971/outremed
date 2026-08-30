import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

const ITEM_VIDE = () => ({ texte: '', est_correct: false, correction: '' });
const QUESTION_VIDE = (nbItems) => ({ enonce: '', items: Array.from({ length: nbItems }, ITEM_VIDE) });
const LETTRES = 'ABCDEFGH';

export default function EspacePerso() {
  const [monProfil, setMonProfil] = useState(null);
  const [qcmsPrives, setQcmsPrives] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [matieres, setMatieres] = useState([]);
  const [cours, setCours] = useState([]);
  const [creationOuverte, setCreationOuverte] = useState(false);
  const [etape, setEtape] = useState(1);
  const [titre, setTitre] = useState('');
  const [matiereId, setMatiereId] = useState('');
  const [coursId, setCoursId] = useState('');
  const [nouvelleMatiere, setNouvelleMatiere] = useState('');
  const [nouveauCours, setNouveauCours] = useState('');
  const [typeQcm, setTypeQcm] = useState('entrainement');
  const [nbQuestions, setNbQuestions] = useState(10);
  const [nbItems, setNbItems] = useState(5);
  const [questions, setQuestions] = useState(Array.from({ length: 10 }, () => QUESTION_VIDE(5)));
  const [message, setMessage] = useState('');

  const [recherche, setRecherche] = useState('');
  const [filtreMatiere, setFiltreMatiere] = useState('');
  const [tri, setTri] = useState('recent');
  const [popupOuverte, setPopupOuverte] = useState(false);

  const navigate = useNavigate();

  async function charger() {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) { navigate('/'); return; }
    const { data: moi } = await supabase.from('profiles').select('*').eq('id', session.session.user.id).single();
    if (moi?.role !== 'proprietaire') { navigate('/accueil'); return; }
    setMonProfil(moi);

    const { data: qcms } = await supabase.from('qcms').select('*').eq('est_prive', true).order('created_at', { ascending: false });
    setQcmsPrives(qcms || []);

    const { data: att } = await supabase.from('attempts').select('*').eq('user_id', moi.id);
    setAttempts(att || []);

    const { data: mats } = await supabase.from('matieres').select('*').eq('est_prive', true).eq('cree_par', moi.id);
    setMatieres(mats || []);

    const { data: crs } = await supabase.from('cours').select('*').eq('est_prive', true).eq('cree_par', moi.id);
    setCours(crs || []);
  }

  useEffect(() => { charger(); }, []);

  async function ajouterMatiere() {
    if (!nouvelleMatiere.trim()) return;
    const COULEURS = ['#FF3EB5', '#38bdf8', '#22c55e', '#f97316', '#a78bfa', '#ef4444', '#eab308', '#14b8a6'];
    const { data, error } = await supabase.from('matieres').insert({
      nom: nouvelleMatiere.trim(), est_prive: true, cree_par: monProfil.id, couleur: COULEURS[matieres.length % COULEURS.length],
    }).select().single();
    if (error) { setMessage('Erreur : ' + error.message); return; }
    setNouvelleMatiere('');
    await charger();
    setMatiereId(data.id);
  }

  async function ajouterCours() {
    if (!nouveauCours.trim() || !matiereId) return;
    const { data, error } = await supabase.from('cours').insert({
      nom: nouveauCours.trim(), matiere_id: matiereId, est_prive: true, cree_par: monProfil.id,
    }).select().single();
    if (error) { setMessage('Erreur : ' + error.message); return; }
    setNouveauCours('');
    await charger();
    setCoursId(data.id);
  }

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

  async function publier() {
    if (!titre.trim()) { setMessage('Le titre est obligatoire.'); return; }

    const { data: qcm, error } = await supabase.from('qcms').insert({
      titre,
      matiere_id: matiereId || null,
      cours_id: coursId || null,
      type_qcm: typeQcm,
      is_annale: false,
      is_classe: false,
      is_kholle: false,
      nb_questions: nbQuestions,
      nb_items: nbItems,
      duree_minutes: typeQcm === 'concours_blanc' ? 30 : null,
      visible: true,
      publie: true,
      verifie: true,
      est_prive: true,
      cree_par: monProfil.id,
    }).select().single();

    if (error) { setMessage('Erreur : ' + error.message); return; }

    for (let i = 0; i < questions.length; i++) {
      const { data: question } = await supabase.from('questions').insert({ qcm_id: qcm.id, ordre: i + 1, enonce: questions[i].enonce }).select().single();
      await supabase.from('items').insert(questions[i].items.map((it, idx) => ({
        question_id: question.id, lettre: LETTRES[idx], texte: it.texte, est_correct: it.est_correct, correction: it.correction,
      })));
    }

    setCreationOuverte(false);
    setEtape(1);
    setTitre(''); setMatiereId(''); setCoursId(''); setNbQuestions(10); setNbItems(5);
    setQuestions(Array.from({ length: 10 }, () => QUESTION_VIDE(5)));
    charger();
  }

  async function supprimer(qcm) {
    if (!confirm(`Supprimer définitivement "${qcm.titre}" et toutes tes tentatives dessus ?`)) return;

    const { data: mesQuestions } = await supabase.from('questions').select('id').eq('qcm_id', qcm.id);
    const questionIds = (mesQuestions || []).map((q) => q.id);
    const { data: mesAttempts } = await supabase.from('attempts').select('id').eq('qcm_id', qcm.id);
    const attemptIds = (mesAttempts || []).map((a) => a.id);

    if (attemptIds.length > 0) await supabase.from('attempt_answers').delete().in('attempt_id', attemptIds);
    if (attemptIds.length > 0) await supabase.from('attempts').delete().eq('qcm_id', qcm.id);
    if (questionIds.length > 0) await supabase.from('items').delete().in('question_id', questionIds);
    await supabase.from('questions').delete().eq('qcm_id', qcm.id);

    const { error } = await supabase.from('qcms').delete().eq('id', qcm.id);
    if (error) { alert('Erreur : ' + error.message); return; }
    charger();
  }

  if (!monProfil) return <div style={{ padding: 40 }}>Chargement...</div>;

  function labelType(qcm) {
    return qcm?.type_qcm === 'concours_blanc' ? 'Chronométré' : 'Entraînement';
  }

  // ===== Stats personnelles =====
  const attemptsAvecQcm = attempts.map((a) => ({ ...a, qcm: qcmsPrives.find((q) => q.id === a.qcm_id) })).filter((a) => a.qcm);
  const nbFaits = attemptsAvecQcm.length;
  const moyenne = nbFaits > 0 ? (attemptsAvecQcm.reduce((s, a) => s + Number(a.score), 0) / nbFaits).toFixed(1) : '—';
  const tauxReussite = nbFaits > 0
    ? Math.round((attemptsAvecQcm.reduce((s, a) => s + Number(a.score) / (a.qcm.nb_questions || 1), 0) / nbFaits) * 100)
    : null;

  const parMatierePerso = {};
  attemptsAvecQcm.forEach((a) => {
    const nom = matieres.find((m) => m.id === a.qcm.matiere_id)?.nom || 'Sans matière';
    if (!parMatierePerso[nom]) parMatierePerso[nom] = { total: 0, count: 0 };
    parMatierePerso[nom].total += Number(a.score) / (a.qcm.nb_questions || 1);
    parMatierePerso[nom].count += 1;
  });

  const parCoursPerso = {};
  attemptsAvecQcm.forEach((a) => {
    if (!a.qcm.cours_id) return;
    const nom = cours.find((c) => c.id === a.qcm.cours_id)?.nom || 'Sans cours';
    if (!parCoursPerso[nom]) parCoursPerso[nom] = { total: 0, count: 0 };
    parCoursPerso[nom].total += Number(a.score) / (a.qcm.nb_questions || 1);
    parCoursPerso[nom].count += 1;
  });

  // Évolution mensuelle + progression
  const parMois = {};
  attemptsAvecQcm.forEach((a) => {
    const mois = new Date(a.created_at).toISOString().slice(0, 7);
    if (!parMois[mois]) parMois[mois] = { total: 0, count: 0 };
    parMois[mois].total += Number(a.score) / (a.qcm.nb_questions || 1);
    parMois[mois].count += 1;
  });
  const moisActuel = new Date().toISOString().slice(0, 7);
  const moisPrecedent = (() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); })();
  let progression = null;
  if (parMois[moisActuel] && parMois[moisPrecedent]) {
    const pctActuel = (parMois[moisActuel].total / parMois[moisActuel].count) * 100;
    const pctPrecedent = (parMois[moisPrecedent].total / parMois[moisPrecedent].count) * 100;
    progression = Math.round(pctActuel - pctPrecedent);
  }

  // Régularité + meilleure série
  const joursActifsListe = [...new Set(attemptsAvecQcm.map((a) => new Date(a.created_at).toISOString().slice(0, 10)))].sort();
  let meilleureSerie = 0, courante = 0, precedent = null;
  joursActifsListe.forEach((jour) => {
    courante = precedent && (new Date(jour) - new Date(precedent)) / 86400000 === 1 ? courante + 1 : 1;
    meilleureSerie = Math.max(meilleureSerie, courante);
    precedent = jour;
  });
  const joursActifsSet = new Set(joursActifsListe);
  const derniers30Jours = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (29 - i));
    return d.toISOString().slice(0, 10);
  });

  // Temps moyen
  const attemptsAvecTemps = attemptsAvecQcm.filter((a) => a.temps_passe_secondes);
  const tempsMoyen = attemptsAvecTemps.length > 0
    ? Math.round(attemptsAvecTemps.reduce((s, a) => s + a.temps_passe_secondes, 0) / attemptsAvecTemps.length / 60)
    : null;

  const qcmsAffiches = qcmsPrives
    .filter((q) => q.titre.toLowerCase().includes(recherche.toLowerCase()))
    .filter((q) => !filtreMatiere || q.matiere_id === filtreMatiere)
    .sort((a, b) => {
      if (tri === 'nom') return a.titre.localeCompare(b.titre);
      if (tri === 'score') {
        const scoreA = Math.max(0, ...attempts.filter((x) => x.qcm_id === a.id).map((x) => x.score));
        const scoreB = Math.max(0, ...attempts.filter((x) => x.qcm_id === b.id).map((x) => x.score));
        return scoreB - scoreA;
      }
      return new Date(b.created_at) - new Date(a.created_at);
    });

  const coursDeMatiereChoisie = cours.filter((c) => c.matiere_id === matiereId);

  return (
    <div className="container" style={{ maxWidth: 720 }}>
      <div className="secret-badge">🦋 Espace personnel — visible et accessible uniquement par toi</div>
      <h1 className="page-title">Espace personnel</h1>
      <p className="page-sub" style={{ marginBottom: 20 }}>Ton terrain d'entraînement privé.</p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        <Link to="/resultats" className="btn btn-outline" style={{ textDecoration: 'none' }}>Mes résultats</Link>
        <Link to="/carnet-erreurs" className="btn btn-outline" style={{ textDecoration: 'none' }}>Mon carnet d'erreurs</Link>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="stat-box">
          <div className="stat-value">{moyenne}</div>
          <div className="stat-label">Score moyen</div>
        </div>
        <div className="stat-box">
          <div className="stat-value" style={{ color: 'var(--text-main)' }}>{nbFaits}</div>
          <div className="stat-label">QCM faits</div>
        </div>
        <div className="stat-box">
          <div className="stat-value" style={{ color: 'var(--success)' }}>{tauxReussite !== null ? `${tauxReussite}%` : '—'}</div>
          <div className="stat-label">Réussite</div>
        </div>
      </div>
      {(progression !== null || tempsMoyen !== null) && (
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: -14, marginBottom: 24 }}>
          {progression !== null && <span style={{ color: progression >= 0 ? 'var(--success)' : 'var(--error)' }}>{progression >= 0 ? '↑' : '↓'} {Math.abs(progression)}% vs mois dernier</span>}
          {progression !== null && tempsMoyen !== null && ' · '}
          {tempsMoyen !== null && `${tempsMoyen} min en moyenne par QCM`}
        </p>
      )}

      <div className="settings-card">
        <div className="section-title">
          <h3 style={{ margin: 0 }}>Régularité (30 derniers jours)</h3>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 400 }}>🔥 Meilleure série : {meilleureSerie} j</span>
        </div>
        <div className="heat-grid">
          {derniers30Jours.map((jour) => (
            <div key={jour} title={jour} className={`heat-day ${joursActifsSet.has(jour) ? 'active' : ''}`} />
          ))}
        </div>
      </div>

      {Object.keys(parMatierePerso).length > 0 && (
        <div className="settings-card">
          <h3>Par matière</h3>
          {Object.entries(parMatierePerso).map(([nom, v]) => {
            const infoMat = matieres.find((m) => m.nom === nom);
            const pct = Math.round((v.total / v.count) * 100);
            return (
              <div key={nom} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: 5 }}>
                  <span>{nom}</span>
                  <strong>{pct}%</strong>
                </div>
                <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct}%`, background: infoMat?.couleur || 'var(--accent)' }} /></div>
              </div>
            );
          })}
        </div>
      )}

      {Object.keys(parCoursPerso).length > 0 && (
        <div className="settings-card">
          <h3>Par cours</h3>
          <div className="detail-subject-list">
            {Object.entries(parCoursPerso).map(([nom, v]) => (
              <div key={nom} className="detail-subject-row">
                <span className="ds-name">{nom}</span>
                <span className="ds-score">{Math.round((v.total / v.count) * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {nbFaits > 0 && (
        <div className="settings-card">
          <h3>Historique</h3>
          <div className="history-table">
            {attemptsAvecQcm.slice(0, 3).map((a) => {
              const infoMat = matieres.find((m) => m.id === a.qcm.matiere_id);
              return (
                <Link key={a.id} to={`/resultats/${a.id}`} className="history-row" style={{ '--row-color': infoMat?.couleur }}>
                  <div className="bar" />
                  <div><div className="h-name">{a.qcm.titre}</div></div>
                  <div className="h-type" /><div className="h-date" />
                  <div className="h-score" style={{ color: 'var(--accent)' }}>{a.score}</div>
                  <span />
                </Link>
              );
            })}
          </div>
          {nbFaits > 3 && (
            <button className="btn btn-outline" style={{ width: '100%', marginTop: 12 }} onClick={() => setPopupOuverte(true)}>Voir tout ({nbFaits})</button>
          )}
        </div>
      )}

      <div className="section-title">
        <h2>Tes QCM privés</h2>
        {!creationOuverte && <button className="btn btn-primary" onClick={() => setCreationOuverte(true)}>+ Nouveau QCM privé</button>}
      </div>

      {creationOuverte && etape === 1 && (
        <div className="settings-card">
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 0 }}>Étape 1 sur 2 — configuration</p>
          <div className="field">
            <label>Titre</label>
            <input value={titre} onChange={(e) => setTitre(e.target.value)} />
          </div>
          <div className="field">
            <label>Matière (les tiennes uniquement, séparées du reste du site)</label>
            <select value={matiereId} onChange={(e) => { setMatiereId(e.target.value); setCoursId(''); }}>
              <option value="">— aucune —</option>
              {matieres.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <input value={nouvelleMatiere} onChange={(e) => setNouvelleMatiere(e.target.value)} placeholder="Nouvelle matière perso" style={{ flex: 1 }} />
              <button type="button" className="btn btn-outline btn-sm" onClick={ajouterMatiere}>+ Ajouter</button>
            </div>
          </div>

          {matiereId && (
            <div className="field">
              <label>Cours (optionnel)</label>
              <select value={coursId} onChange={(e) => setCoursId(e.target.value)}>
                <option value="">— aucun —</option>
                {coursDeMatiereChoisie.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <input value={nouveauCours} onChange={(e) => setNouveauCours(e.target.value)} placeholder="Nouveau cours perso" style={{ flex: 1 }} />
                <button type="button" className="btn btn-outline btn-sm" onClick={ajouterCours}>+ Ajouter</button>
              </div>
            </div>
          )}

          <div className="field">
            <label>Mode</label>
            <div className="type-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className={`type-card ${typeQcm === 'entrainement' ? 'selected' : ''}`} onClick={() => setTypeQcm('entrainement')}>
                <span className="tc-icon">🎯</span>
                <div className="tc-title">Entraînement</div>
                <div className="tc-desc">Correction immédiate après chaque question.</div>
              </div>
              <div className={`type-card ${typeQcm === 'concours_blanc' ? 'selected' : ''}`} onClick={() => setTypeQcm('concours_blanc')}>
                <span className="tc-icon">⏳</span>
                <div className="tc-title">Chronométré</div>
                <div className="tc-desc">30 min, correction à la fin. Rejouable librement.</div>
              </div>
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Nombre de questions</label>
              <input type="number" value={nbQuestions} onChange={(e) => changerNbQuestions(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Items par question</label>
              <input type="number" value={nbItems} onChange={(e) => changerNbItems(Number(e.target.value))} />
            </div>
          </div>
          {message && <div className="error-msg">{message}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => setCreationOuverte(false)}>Annuler</button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setEtape(2)}>Suivant →</button>
          </div>
        </div>
      )}

      {creationOuverte && etape === 2 && (
        <>
          {questions.map((q, qIdx) => (
            <div key={qIdx} className="card" style={{ marginBottom: 16 }}>
              <strong>Question {qIdx + 1}</strong>
              <textarea
                value={q.enonce}
                onChange={(e) => majQuestion(qIdx, 'enonce', e.target.value)}
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
                    <textarea value={it.correction} onChange={(e) => majItem(qIdx, iIdx, 'correction', e.target.value)} placeholder="Correction" />
                  </div>
                </div>
              ))}
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => setEtape(1)}>← Retour</button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={publier}>Enregistrer</button>
          </div>
        </>
      )}

      {!creationOuverte && (
        <>
          <div className="search-bar"><input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher un QCM..." /></div>
          <div className="filter-row" style={{ marginBottom: 20 }}>
            <select className="select-filter" value={filtreMatiere} onChange={(e) => setFiltreMatiere(e.target.value)}>
              <option value="">Toutes les matières</option>
              {matieres.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
            </select>
            <select className="select-filter" value={tri} onChange={(e) => setTri(e.target.value)}>
              <option value="recent">Plus récent</option>
              <option value="nom">Nom (A-Z)</option>
              <option value="score">Meilleur score</option>
            </select>
          </div>

          {qcmsAffiches.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Aucun QCM privé pour l'instant.</p>}
          <div className="qcm-row">
            {qcmsAffiches.map((qcm) => {
              const infoMat = matieres.find((m) => m.id === qcm.matiere_id);
              const meilleur = Math.max(0, ...attempts.filter((x) => x.qcm_id === qcm.id).map((x) => x.score));
              return (
                <div key={qcm.id} className="qcm-card" style={{ '--card-color': infoMat?.couleur }}>
                  {infoMat?.nom && <span className="subject-tag">{infoMat.nom}</span>}
                  <Link to={`/qcm/${qcm.id}`} style={{ textDecoration: 'none', color: 'var(--text-main)' }}><h4>{qcm.titre}</h4></Link>
                  <div className="meta">
                    <span>{meilleur > 0 ? `Meilleur : ${meilleur}` : labelType(qcm)}</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Link to={`/qcm/${qcm.id}/modifier`} className="icon-action" title="Modifier">✏️</Link>
                      <button className="icon-action danger" title="Supprimer" onClick={() => supprimer(qcm)}>🗑</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {popupOuverte && (
        <div className="modal-overlay open" onClick={() => setPopupOuverte(false)}>
          <div onClick={(e) => e.stopPropagation()} className="modal-box" style={{ maxWidth: 520, maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>Tout mon historique</h3>
              <button onClick={() => setPopupOuverte(false)} style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>
            <div className="history-table">
              {attemptsAvecQcm.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map((a) => {
                const infoMat = matieres.find((m) => m.id === a.qcm.matiere_id);
                return (
                  <Link key={a.id} to={`/resultats/${a.id}`} className="history-row" style={{ '--row-color': infoMat?.couleur }}>
                    <div className="bar" />
                    <div>
                      <div className="h-name">{a.qcm.titre}</div>
                      <div className="h-sub">{infoMat?.nom || 'Sans matière'} · {labelType(a.qcm)}</div>
                    </div>
                    <div className="h-type" />
                    <div className="h-date">{new Date(a.created_at).toLocaleDateString('fr-FR')}</div>
                    <div className="h-score" style={{ color: 'var(--accent)' }}>{a.score}</div>
                    <span />
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
