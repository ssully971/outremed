import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

export default function Statistiques() {
  const [qcms, setQcms] = useState([]);
  const [matieres, setMatieres] = useState([]);
  const [profils, setProfils] = useState({});
  const [etudiants, setEtudiants] = useState([]);
  const [toutesAttempts, setToutesAttempts] = useState([]);
  const [semainesKholle, setSemainesKholle] = useState([]);
  const [nbDesactivationsRecentes, setNbDesactivationsRecentes] = useState(0);

  const [ongletType, setOngletType] = useState('kholles');
  const [sessionSelectionnee, setSessionSelectionnee] = useState(null); // { type: 'kholle'|'qcm', id }

  const [rechercheEtudiantStat, setRechercheEtudiantStat] = useState('');
  const [triEtudiantStat, setTriEtudiantStat] = useState('moyenne_desc');
  const [questionsRatees, setQuestionsRatees] = useState([]);
  const [matieresPrioritaires, setMatieresPrioritaires] = useState([]);

  const navigate = useNavigate();

  useEffect(() => {
    async function charger() {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) { navigate('/'); return; }
      const { data: moi } = await supabase.from('profiles').select('role').eq('id', session.session.user.id).single();
      if (moi?.role !== 'tuteur' && moi?.role !== 'proprietaire') { navigate('/accueil'); return; }

      const { data: mats } = await supabase.from('matieres').select('*').eq('est_prive', false);
      setMatieres(mats || []);

      const { data: qcmsData } = await supabase.from('qcms').select('*').eq('est_prive', false).order('created_at', { ascending: false });
      setQcms(qcmsData || []);

      const { data: profs } = await supabase.from('profiles').select('id, pseudo, role, compte_actif, statut_compte, essai_fin');
      const pmap = {};
      (profs || []).forEach((p) => { pmap[p.id] = p.pseudo; });
      setProfils(pmap);
      setEtudiants((profs || []).filter((p) => p.role === 'etudiant'));

      const { data: attGeneral } = await supabase.from('attempts').select('id, score, user_id, qcm_id, created_at, temps_passe_secondes');
      setToutesAttempts(attGeneral || []);

      const { data: sem } = await supabase.from('semaines_kholle').select('*').order('date_samedi', { ascending: false });
      setSemainesKholle(sem || []);

      const ilYA30Jours = new Date();
      ilYA30Jours.setDate(ilYA30Jours.getDate() - 30);
      const { data: desactivations } = await supabase
        .from('historique_comptes')
        .select('id')
        .in('action', ['desactivation_abonnement', 'suppression_definitive'])
        .gte('created_at', ilYA30Jours.toISOString());
      setNbDesactivationsRecentes((desactivations || []).length);

      const { data: reponsesRatees } = await supabase.from('attempt_answers').select('question_id, statut').neq('statut', 'correct');
      const { data: toutesQuestions } = await supabase.from('questions').select('id, enonce, qcm_id');
      const qMap = {};
      (toutesQuestions || []).forEach((q) => { qMap[q.id] = q; });

      const compteurQuestions = {};
      (reponsesRatees || []).forEach((r) => { compteurQuestions[r.question_id] = (compteurQuestions[r.question_id] || 0) + 1; });

      const classementQuestions = Object.entries(compteurQuestions)
        .map(([qid, count]) => {
          const q = qMap[qid];
          const qcm = (qcmsData || []).find((c) => c.id === q?.qcm_id);
          return { enonce: q?.enonce, titreQcm: qcm?.titre, count };
        })
        .filter((x) => x.enonce)
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
      setQuestionsRatees(classementQuestions);

      const compteurMatieres = {};
      Object.entries(compteurQuestions).forEach(([qid, count]) => {
        const q = qMap[qid];
        const qcm = (qcmsData || []).find((c) => c.id === q?.qcm_id);
        if (qcm?.matiere_id) compteurMatieres[qcm.matiere_id] = (compteurMatieres[qcm.matiere_id] || 0) + count;
      });
      const classementMatieres = Object.entries(compteurMatieres)
        .map(([mid, count]) => ({ nom: (mats || []).find((m) => m.id === mid)?.nom, count }))
        .sort((a, b) => b.count - a.count);
      setMatieresPrioritaires(classementMatieres);
    }
    charger();
  }, []);

  function labelType(qcm) {
    if (qcm?.is_kholle) return 'Kholle';
    if (qcm?.is_annale) return 'Annale';
    if (qcm?.type_qcm === 'concours_blanc') return 'Concours blanc';
    return 'Entraînement';
  }

  const maintenant = new Date();
  const etudiantsActifsListe = etudiants.filter((e) => e.compte_actif);
  const nbEtudiantsActifs = etudiantsActifsListe.length;

  const etudiantsActifs = etudiants.filter((e) =>
    e.compte_actif && (e.statut_compte === 'actif' || (e.statut_compte === 'essai_gratuit' && new Date(e.essai_fin) >= maintenant))
  ).length;
  const essaisEnCours = etudiants.filter((e) =>
    e.compte_actif && e.statut_compte === 'essai_gratuit' && new Date(e.essai_fin) >= maintenant
  ).length;
  const convDenom = etudiants.filter((e) => e.essai_fin).length;
  const convNum = etudiants.filter((e) => e.essai_fin && e.statut_compte === 'actif').length;
  const tauxConversion = convDenom > 0 ? Math.round((convNum / convDenom) * 100) : null;
  const qcmEnAttente = qcms.filter((q) => !q.verifie).length;

  const attemptsEnrichies = toutesAttempts.map((a) => ({ ...a, qcm: qcms.find((q) => q.id === a.qcm_id) })).filter((a) => a.qcm);

  // ===== Listes de sessions par type =====
  const qcmsEntrainement = qcms.filter((q) => q.type_qcm === 'entrainement' && !q.is_annale && !q.is_kholle);
  const qcmsAnnales = qcms.filter((q) => q.is_annale);
  const qcmsConcours = qcms.filter((q) => q.type_qcm === 'concours_blanc' && !q.is_kholle);

  // ===== Détail d'une session sélectionnée =====
  function detailSession() {
    if (!sessionSelectionnee) return null;

    let qcmsSession = [];
    let titreSession = '';
    if (sessionSelectionnee.type === 'kholle') {
      const semaine = semainesKholle.find((s) => s.id === sessionSelectionnee.id);
      qcmsSession = qcms.filter((q) => q.semaine_kholle_id === sessionSelectionnee.id);
      titreSession = `Kholle du ${new Date(semaine?.date_samedi).toLocaleDateString('fr-FR')}`;
    } else {
      const qcm = qcms.find((q) => q.id === sessionSelectionnee.id);
      qcmsSession = qcm ? [qcm] : [];
      titreSession = qcm?.titre || '';
    }

    const idsQcms = qcmsSession.map((q) => q.id);
    const attemptsSession = toutesAttempts.filter((a) => idsQcms.includes(a.qcm_id));
    const maxScore = qcmsSession.reduce((s, q) => s + (q.nb_questions || 0), 0);

    // Score total par étudiant (somme si plusieurs QCM, ex: kholle)
    const parEtudiant = {};
    attemptsSession.forEach((a) => {
      if (!parEtudiant[a.user_id]) parEtudiant[a.user_id] = { total: 0, temps: 0, nb: 0 };
      parEtudiant[a.user_id].total += Number(a.score);
      parEtudiant[a.user_id].temps += a.temps_passe_secondes || 0;
      parEtudiant[a.user_id].nb += 1;
    });
    const classement = Object.entries(parEtudiant)
      .map(([userId, v]) => ({ userId, pseudo: profils[userId] || '—', score: v.total, temps: v.temps }))
      .sort((a, b) => b.score - a.score);

    const nbParticipants = classement.length;
    const nbNonParticipants = Math.max(0, nbEtudiantsActifs - nbParticipants);
    const scoreMoyen = nbParticipants > 0 ? (classement.reduce((s, c) => s + c.score, 0) / nbParticipants).toFixed(1) : '—';
    const meilleurScore = nbParticipants > 0 ? classement[0].score : '—';

    // Distribution par tranche (5 tranches égales)
    const nbTranches = 5;
    const tranches = Array.from({ length: nbTranches }, (_, i) => ({
      label: `${Math.round((maxScore * i) / nbTranches)}-${Math.round((maxScore * (i + 1)) / nbTranches)}`,
      count: 0,
    }));
    classement.forEach((c) => {
      const idx = Math.min(nbTranches - 1, Math.floor((c.score / (maxScore || 1)) * nbTranches));
      tranches[idx].count++;
    });
    const maxTranche = Math.max(1, ...tranches.map((t) => t.count));

    return { titreSession, qcmsSession, maxScore, classement, nbParticipants, nbNonParticipants, scoreMoyen, meilleurScore, tranches, maxTranche };
  }

  function exporterSession(detail) {
    let texte = `=== ${detail.titreSession} ===\n\n`;
    texte += `Participants : ${detail.nbParticipants} / ${detail.nbParticipants + detail.nbNonParticipants}\n`;
    texte += `Score moyen : ${detail.scoreMoyen} / ${detail.maxScore}\n\n`;
    texte += `Classement :\n`;
    detail.classement.forEach((c, idx) => {
      texte += `${idx + 1}. ${c.pseudo} — ${c.score}/${detail.maxScore}${c.temps ? ` — ${Math.round(c.temps / 60)} min` : ''}\n`;
    });
    const blob = new Blob([texte], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `resultats-${detail.titreSession.replace(/\s+/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ===== Répartition par niveau =====
  const tranchesNiveau = { '0-40%': 0, '40-60%': 0, '60-80%': 0, '80-100%': 0 };
  etudiants.forEach((e) => {
    const mesAttempts = attemptsEnrichies.filter((a) => a.user_id === e.id);
    if (mesAttempts.length === 0) return;
    const moyennePct = (mesAttempts.reduce((s, a) => s + Number(a.score) / (a.qcm.nb_questions || 1), 0) / mesAttempts.length) * 100;
    if (moyennePct < 40) tranchesNiveau['0-40%']++;
    else if (moyennePct < 60) tranchesNiveau['40-60%']++;
    else if (moyennePct < 80) tranchesNiveau['60-80%']++;
    else tranchesNiveau['80-100%']++;
  });
  const maxTrancheNiveau = Math.max(1, ...Object.values(tranchesNiveau));

  const parTypeReussite = {};
  attemptsEnrichies.forEach((a) => {
    const t = labelType(a.qcm);
    if (!parTypeReussite[t]) parTypeReussite[t] = { total: 0, count: 0 };
    parTypeReussite[t].total += Number(a.score) / (a.qcm.nb_questions || 1);
    parTypeReussite[t].count += 1;
  });

  const parMois = {};
  attemptsEnrichies.forEach((a) => {
    const mois = new Date(a.created_at).toISOString().slice(0, 7);
    if (!parMois[mois]) parMois[mois] = { total: 0, count: 0 };
    parMois[mois].total += Number(a.score) / (a.qcm.nb_questions || 1);
    parMois[mois].count += 1;
  });
  const moisTries = Object.keys(parMois).sort();

  const parQcmMoyenne = {};
  attemptsEnrichies.forEach((a) => {
    if (!parQcmMoyenne[a.qcm_id]) parQcmMoyenne[a.qcm_id] = { total: 0, count: 0, titre: a.qcm.titre };
    parQcmMoyenne[a.qcm_id].total += Number(a.score) / (a.qcm.nb_questions || 1);
    parQcmMoyenne[a.qcm_id].count += 1;
  });
  const qcmDifficiles = Object.values(parQcmMoyenne)
    .filter((v) => v.count >= 1)
    .map((v) => ({ titre: v.titre, moyenne: Math.round((v.total / v.count) * 100), nb: v.count }))
    .sort((a, b) => a.moyenne - b.moyenne)
    .slice(0, 8);

  const contenuParMatiere = matieres.map((m) => ({ nom: m.nom, count: qcms.filter((q) => q.matiere_id === m.id).length }))
    .filter((m) => m.count > 0)
    .sort((a, b) => b.count - a.count);
  const maxContenu = Math.max(1, ...contenuParMatiere.map((m) => m.count));

  const enAttenteDepuisLongtemps = qcms
    .filter((q) => !q.verifie)
    .map((q) => ({ ...q, jours: Math.floor((maintenant - new Date(q.created_at)) / (1000 * 60 * 60 * 24)) }))
    .sort((a, b) => b.jours - a.jours)
    .slice(0, 8);

  const participationKholles = semainesKholle.map((sk) => {
    const qcmsSemaine = qcms.filter((q) => q.semaine_kholle_id === sk.id);
    const participants = new Set(
      attemptsEnrichies.filter((a) => qcmsSemaine.some((q) => q.id === a.qcm_id)).map((a) => a.user_id)
    );
    return { date: sk.date_samedi, count: participants.size };
  });
  const maxParticipation = Math.max(1, ...participationKholles.map((p) => p.count));

  const tableauEtudiants = etudiants.map((e) => {
    const mesAttempts = attemptsEnrichies.filter((a) => a.user_id === e.id);
    const moyennePct = mesAttempts.length > 0
      ? Math.round((mesAttempts.reduce((s, a) => s + Number(a.score) / (a.qcm.nb_questions || 1), 0) / mesAttempts.length) * 100)
      : null;
    const derniereActiviteDate = mesAttempts.length > 0
      ? new Date(Math.max(...mesAttempts.map((a) => new Date(a.created_at).getTime())))
      : null;
    const joursInactif = derniereActiviteDate ? Math.floor((maintenant - derniereActiviteDate) / (1000 * 60 * 60 * 24)) : null;
    return { id: e.id, pseudo: e.pseudo, moyennePct, nb: mesAttempts.length, derniereActiviteDate, joursInactif };
  });

  const tableauFiltre = tableauEtudiants
    .filter((e) => e.pseudo.toLowerCase().includes(rechercheEtudiantStat.toLowerCase()))
    .sort((a, b) => {
      if (triEtudiantStat === 'nom') return a.pseudo.localeCompare(b.pseudo);
      if (triEtudiantStat === 'moyenne_desc') return (b.moyennePct ?? -1) - (a.moyennePct ?? -1);
      if (triEtudiantStat === 'moyenne_asc') return (a.moyennePct ?? 999) - (b.moyennePct ?? 999);
      if (triEtudiantStat === 'activite') return (b.derniereActiviteDate?.getTime() || 0) - (a.derniereActiviteDate?.getTime() || 0);
      return 0;
    });

  const etudiantsInactifs = tableauEtudiants
    .filter((e) => e.joursInactif === null || e.joursInactif >= 15)
    .sort((a, b) => (b.joursInactif ?? 99999) - (a.joursInactif ?? 99999));

  const detail = detailSession();

  return (
    <div className="container">
      <h1 className="page-title">Statistiques</h1>
      <p className="page-sub">Vue d'ensemble et détail par session.</p>

      <div className="stats-grid">
        <div className="stat-box">
          <div className="stat-value">{etudiantsActifs}</div>
          <div className="stat-label">Étudiants actifs</div>
        </div>
        <div className="stat-box">
          <div className="stat-value" style={{ color: 'var(--warning)' }}>{essaisEnCours}</div>
          <div className="stat-label">Essais en cours</div>
        </div>
        <div className="stat-box">
          <div className="stat-value" style={{ color: 'var(--success)' }}>{tauxConversion !== null ? `${tauxConversion}%` : '—'}</div>
          <div className="stat-label">Conversion essai→payant</div>
        </div>
        <div className="stat-box">
          <div className="stat-value" style={{ color: 'var(--error)' }}>{qcmEnAttente}</div>
          <div className="stat-label">QCM à vérifier</div>
        </div>
      </div>
      {nbDesactivationsRecentes > 0 && (
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: -18, marginBottom: 24 }}>
          {nbDesactivationsRecentes} compte(s) désactivé(s)/supprimé(s) ces 30 derniers jours.
        </p>
      )}

        {/* ===== Résultats détaillés par session ===== */}
        <h3 style={{ marginBottom: 4 }}>Résultats par session</h3>
        <div className="category-tabs">
          {[['kholles', 'Kholles'], ['entrainement', "QCM d'entraînement"], ['annales', 'Annales'], ['concours', 'Concours blancs']].map(([val, label]) => (
            <button
              key={val}
              className={`cat-tab ${ongletType === val ? 'active' : ''}`}
              onClick={() => { setOngletType(val); setSessionSelectionnee(null); }}
            >
              {label}
            </button>
          ))}
        </div>

        {!sessionSelectionnee && (
          <div className="results-table" style={{ marginBottom: 30 }}>
            {ongletType === 'kholles' && semainesKholle.map((s) => (
              <div key={s.id} className="result-row" style={{ gridTemplateColumns: '1fr auto' }} onClick={() => setSessionSelectionnee({ type: 'kholle', id: s.id })}>
                <span className="rname">Kholle du {new Date(s.date_samedi).toLocaleDateString('fr-FR')}</span>
                {new Date(s.fin) > maintenant && <span className="session-tag">En cours</span>}
              </div>
            ))}
            {ongletType === 'entrainement' && qcmsEntrainement.map((q) => (
              <div key={q.id} className="result-row" style={{ gridTemplateColumns: '1fr' }} onClick={() => setSessionSelectionnee({ type: 'qcm', id: q.id })}>
                <span className="rname">{q.titre}</span>
              </div>
            ))}
            {ongletType === 'annales' && qcmsAnnales.map((q) => (
              <div key={q.id} className="result-row" style={{ gridTemplateColumns: '1fr' }} onClick={() => setSessionSelectionnee({ type: 'qcm', id: q.id })}>
                <span className="rname">{q.titre}</span>
              </div>
            ))}
            {ongletType === 'concours' && qcmsConcours.map((q) => (
              <div key={q.id} className="result-row" style={{ gridTemplateColumns: '1fr' }} onClick={() => setSessionSelectionnee({ type: 'qcm', id: q.id })}>
                <span className="rname">{q.titre}</span>
              </div>
            ))}
          </div>
        )}

        {sessionSelectionnee && detail && (
          <>
            <button className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }} onClick={() => setSessionSelectionnee(null)}>← Retour à la liste</button>

            <div className="session-summary-card">
              <div className="session-summary-top">
                <div>
                  <span className="session-tag">{ongletType === 'kholles' ? 'Kholle' : ongletType === 'entrainement' ? 'Entraînement' : ongletType === 'annales' ? 'Annale' : 'Concours blanc'}</span>
                  <h2>{detail.titreSession}</h2>
                  <p>Sur {detail.maxScore} points</p>
                </div>
                <button className="btn btn-outline btn-sm" onClick={() => exporterSession(detail)}>📊 Exporter</button>
              </div>
              <div className="summary-stats-grid">
                <div className="summary-stat"><div className="val">{detail.nbParticipants}</div><div className="lbl">Ont participé</div></div>
                <div className="summary-stat"><div className="val">{detail.scoreMoyen}/{detail.maxScore}</div><div className="lbl">Score moyen</div></div>
                <div className="summary-stat"><div className="val" style={{ color: 'var(--success)' }}>{detail.meilleurScore}/{detail.maxScore}</div><div className="lbl">Meilleur score</div></div>
                <div className="summary-stat warn"><div className="val">{detail.nbNonParticipants}</div><div className="lbl">N'ont pas participé</div></div>
              </div>
            </div>

            <div className="distrib-card">
              <h3>Distribution des scores</h3>
              <p className="dc-sub">Répartition des étudiants par tranche</p>
              <div className="distrib-bars">
                {detail.tranches.map((t, idx) => (
                  <div key={idx} className="distrib-bar-wrap">
                    <div className="distrib-bar" style={{ height: `${(t.count / detail.maxTranche) * 100}%`, minHeight: 2 }}>
                      <span className="bar-count">{t.count}</span>
                    </div>
                    <span className="distrib-label">{t.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="section-title"><h3>Classement complet</h3></div>
            <div className="results-table" style={{ marginBottom: 30 }}>
              {detail.classement.map((c, idx) => (
                <div key={c.userId} className="result-row">
                  <span className={`pos ${idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? 'bronze' : ''}`}>{idx + 1}</span>
                  <span className="rname">{c.pseudo}</span>
                  <span className="rscore" style={{ color: 'var(--accent)' }}>{c.score}/{detail.maxScore}</span>
                  <span className="rtime">{c.temps > 0 ? `${Math.round(c.temps / 60)} min` : '—'}</span>
                </div>
              ))}
              {detail.classement.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Personne n'a encore participé.</p>}
            </div>
          </>
        )}

        {/* ===== Répartition par niveau ===== */}
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginTop: 0 }}>Répartition des étudiants par niveau</h3>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 140 }}>
            {Object.entries(tranchesNiveau).map(([tranche, count]) => (
              <div key={tranche} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>{count}</span>
                <div style={{ width: '100%', background: 'var(--accent)', borderRadius: '4px 4px 0 0', height: `${(count / maxTrancheNiveau) * 100}%`, minHeight: 4 }} />
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 6 }}>{tranche}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginTop: 0 }}>Taux de réussite par type de QCM</h3>
          {Object.entries(parTypeReussite).map(([type, v]) => (
            <div key={type} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: 4 }}>
                <span>{type}</span>
                <strong>{Math.round((v.total / v.count) * 100)}%</strong>
              </div>
              <div style={{ height: 8, background: 'var(--bg-panel)', borderRadius: 4 }}>
                <div style={{ height: '100%', width: `${Math.round((v.total / v.count) * 100)}%`, background: 'var(--accent)', borderRadius: 4 }} />
              </div>
            </div>
          ))}
          {Object.keys(parTypeReussite).length === 0 && <p style={{ color: 'var(--text-muted)' }}>Pas encore de données.</p>}
        </div>

        {moisTries.length > 0 && (
          <div className="card" style={{ marginBottom: 24 }}>
            <h3 style={{ marginTop: 0 }}>Moyenne générale dans le temps</h3>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 140 }}>
              {moisTries.map((mois) => {
                const pct = Math.round((parMois[mois].total / parMois[mois].count) * 100);
                return (
                  <div key={mois} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 4 }}>{pct}%</span>
                    <div style={{ width: '70%', background: 'var(--accent)', borderRadius: '4px 4px 0 0', height: `${pct}%` }} />
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 6 }}>{mois.slice(2)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginTop: 0 }}>QCM les plus difficiles</h3>
          {qcmDifficiles.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Pas encore assez de données.</p>}
          {qcmDifficiles.map((q, idx) => (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '0.85rem' }}>
              <span>{q.titre} <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>({q.nb} tentative(s))</span></span>
              <strong style={{ color: 'var(--error)' }}>{q.moyenne}%</strong>
            </div>
          ))}
        </div>

        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginTop: 0 }}>Répartition du contenu par matière</h3>
          {contenuParMatiere.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Aucune matière pour l'instant.</p>}
          {contenuParMatiere.map((m) => (
            <div key={m.nom} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: 4 }}>
                <span>{m.nom}</span>
                <strong>{m.count}</strong>
              </div>
              <div style={{ height: 8, background: 'var(--bg-panel)', borderRadius: 4 }}>
                <div style={{ height: '100%', width: `${(m.count / maxContenu) * 100}%`, background: 'var(--accent)', borderRadius: 4 }} />
              </div>
            </div>
          ))}
        </div>

        {enAttenteDepuisLongtemps.length > 0 && (
          <div className="card" style={{ marginBottom: 24 }}>
            <h3 style={{ marginTop: 0 }}>À vérifier depuis longtemps</h3>
            {enAttenteDepuisLongtemps.map((q) => (
              <div key={q.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '0.85rem' }}>
                <span>{q.titre}</span>
                <strong style={{ color: q.jours > 14 ? 'var(--error)' : 'var(--warning)' }}>{q.jours} jour(s)</strong>
              </div>
            ))}
          </div>
        )}

        {participationKholles.length > 0 && (
          <div className="card" style={{ marginBottom: 24 }}>
            <h3 style={{ marginTop: 0 }}>Participation aux kholles dans le temps</h3>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 140 }}>
              {participationKholles.map((p) => (
                <div key={p.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 4 }}>{p.count}</span>
                  <div style={{ width: '70%', background: 'var(--accent)', borderRadius: '4px 4px 0 0', height: `${(p.count / maxParticipation) * 100}%`, minHeight: 4 }} />
                  <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 6 }}>{new Date(p.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginTop: 0 }}>Étudiants</h3>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              value={rechercheEtudiantStat}
              onChange={(e) => setRechercheEtudiantStat(e.target.value)}
              placeholder="Rechercher un pseudo..."
              style={{ flex: 1 }}
            />
            <select value={triEtudiantStat} onChange={(e) => setTriEtudiantStat(e.target.value)} style={{ width: 'auto', fontSize: '0.8rem' }}>
              <option value="moyenne_desc">Meilleure moyenne</option>
              <option value="moyenne_asc">Moins bonne moyenne</option>
              <option value="nom">Nom (A-Z)</option>
              <option value="activite">Plus récemment actif</option>
            </select>
          </div>
          {tableauFiltre.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Aucun résultat.</p>}
          {tableauFiltre.map((e) => (
            <Link key={e.id} to={`/etudiants/${e.id}`} className="item" style={{ textDecoration: 'none', color: 'var(--text-main)', justifyContent: 'space-between' }}>
              <span>{e.pseudo}</span>
              <span style={{ display: 'flex', gap: 14, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                <span>{e.nb} QCM</span>
                <strong style={{ color: e.moyennePct === null ? 'var(--text-muted)' : 'var(--accent)' }}>{e.moyennePct !== null ? `${e.moyennePct}%` : '—'}</strong>
              </span>
            </Link>
          ))}
        </div>

        {etudiantsInactifs.length > 0 && (
          <div className="card" style={{ marginBottom: 24 }}>
            <h3 style={{ marginTop: 0 }}>Étudiants inactifs</h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 12 }}>Aucun QCM depuis 15 jours ou plus (ou jamais commencé).</p>
            {etudiantsInactifs.map((e) => (
              <Link key={e.id} to={`/etudiants/${e.id}`} className="item" style={{ textDecoration: 'none', color: 'var(--text-main)', justifyContent: 'space-between' }}>
                <span>{e.pseudo}</span>
                <strong style={{ color: 'var(--warning)', fontSize: '0.82rem' }}>
                  {e.joursInactif === null ? 'Jamais actif' : `${e.joursInactif} jour(s)`}
                </strong>
              </Link>
            ))}
          </div>
        )}

        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginTop: 0 }}>Questions les plus ratées</h3>
          {questionsRatees.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Pas encore assez de données.</p>}
          {questionsRatees.map((q, idx) => (
            <div key={idx} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.85rem' }}>{q.enonce}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{q.titreQcm} · ratée {q.count} fois</div>
            </div>
          ))}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Matières prioritaires</h3>
          {matieresPrioritaires.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Pas encore assez de données.</p>}
          {matieresPrioritaires.map((m, idx) => (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
              <span>{m.nom}</span>
              <strong style={{ color: 'var(--warning)' }}>{m.count} erreurs</strong>
            </div>
          ))}
        </div>
    </div>
  );
}
