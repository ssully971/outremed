import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import AnnexeNav from '../components/AnnexeNav';

export default function AnnexeMesStats() {
  const [profil, setProfil] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [matieres, setMatieres] = useState([]);
  const [meilleureSerieHistorique, setMeilleureSerieHistorique] = useState(0);

  const [popupOuverte, setPopupOuverte] = useState(false);
  const [recherche, setRecherche] = useState('');
  const [filtreType, setFiltreType] = useState('tous');
  const [filtreMatiere, setFiltreMatiere] = useState('');
  const [tri, setTri] = useState('date_desc');

  const navigate = useNavigate();

  async function charger() {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) { navigate('/'); return; }
    const uid = session.session.user.id;

    const { data: p } = await supabase.from('profiles').select('*').eq('id', uid).single();
    if (p?.role !== 'tuteur' && p?.role !== 'proprietaire') { navigate('/accueil'); return; }
    setProfil(p);

    const { data: mats } = await supabase.from('annexe_matieres').select('*');
    setMatieres(mats || []);

    const { data: att } = await supabase
      .from('annexe_attempts')
      .select('*, annexe_qcms(titre, nb_questions, matiere_id, type_qcm, is_annale)')
      .eq('user_id', uid)
      .order('created_at', { ascending: false });
    setAttempts(att || []);

    const joursActifs = [...new Set((att || []).map((a) => new Date(a.created_at).toISOString().slice(0, 10)))].sort();
    let meilleure = 0, courante = 0, precedent = null;
    joursActifs.forEach((jour) => {
      if (precedent) {
        const diff = (new Date(jour) - new Date(precedent)) / (1000 * 60 * 60 * 24);
        courante = diff === 1 ? courante + 1 : 1;
      } else {
        courante = 1;
      }
      meilleure = Math.max(meilleure, courante);
      precedent = jour;
    });
    setMeilleureSerieHistorique(meilleure);
  }

  useEffect(() => { charger(); }, []);

  if (!profil) return null;

  function labelType(qcm) {
    if (qcm?.is_annale) return 'Annale';
    return qcm?.type_qcm === 'concours_blanc' ? 'Concours blanc' : 'Entraînement';
  }

  const nb = attempts.length;
  const moyenne = nb > 0 ? (attempts.reduce((s, a) => s + Number(a.score), 0) / nb).toFixed(1) : '—';
  const tauxReussite = nb > 0
    ? Math.round((attempts.reduce((s, a) => s + Number(a.score) / (a.annexe_qcms?.nb_questions || 1), 0) / nb) * 100)
    : null;

  const parMatiere = {};
  attempts.forEach((a) => {
    const nom = matieres.find((m) => m.id === a.annexe_qcms?.matiere_id)?.nom || 'Autre';
    if (!parMatiere[nom]) parMatiere[nom] = { total: 0, count: 0 };
    parMatiere[nom].total += Number(a.score) / (a.annexe_qcms?.nb_questions || 1);
    parMatiere[nom].count += 1;
  });

  const parType = {};
  attempts.forEach((a) => {
    const t = labelType(a.annexe_qcms);
    if (!parType[t]) parType[t] = { total: 0, count: 0 };
    parType[t].total += Number(a.score) / (a.annexe_qcms?.nb_questions || 1);
    parType[t].count += 1;
  });

  const parMois = {};
  attempts.forEach((a) => {
    const mois = new Date(a.created_at).toISOString().slice(0, 7);
    if (!parMois[mois]) parMois[mois] = { total: 0, count: 0 };
    parMois[mois].total += Number(a.score) / (a.annexe_qcms?.nb_questions || 1);
    parMois[mois].count += 1;
  });
  const moisTries = Object.keys(parMois).sort();

  const attemptsAvecTemps = attempts.filter((a) => a.temps_passe_secondes);
  const tempsMoyen = attemptsAvecTemps.length > 0
    ? Math.round(attemptsAvecTemps.reduce((s, a) => s + a.temps_passe_secondes, 0) / attemptsAvecTemps.length / 60)
    : null;

  const joursActifsSet = new Set(attempts.map((a) => new Date(a.created_at).toISOString().slice(0, 10)));
  const derniers30Jours = Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    return d.toISOString().slice(0, 10);
  });

  const attemptsFiltrees = attempts
    .filter((a) => {
      if (recherche.trim() && !a.annexe_qcms?.titre?.toLowerCase().includes(recherche.trim().toLowerCase())) return false;
      if (filtreType !== 'tous' && labelType(a.annexe_qcms) !== filtreType) return false;
      if (filtreMatiere && a.annexe_qcms?.matiere_id !== filtreMatiere) return false;
      return true;
    })
    .sort((a, b) => {
      if (tri === 'score_desc') return b.score - a.score;
      if (tri === 'score_asc') return a.score - b.score;
      return new Date(b.created_at) - new Date(a.created_at);
    });

  function LigneHistorique({ a }) {
    const infoMat = matieres.find((m) => m.id === a.annexe_qcms?.matiere_id);
    return (
      <div className="history-row" style={{ '--row-color': infoMat?.couleur }}>
        <div className="bar" />
        <div>
          <div className="h-name">{a.annexe_qcms?.titre}</div>
          <div className="h-sub">{infoMat?.nom || 'Autre'} · {labelType(a.annexe_qcms)}</div>
        </div>
        <div className="h-type" />
        <div className="h-date">{new Date(a.created_at).toLocaleDateString('fr-FR')}</div>
        <div className="h-score" style={{ color: 'var(--accent)' }}>{a.score}</div>
        <span />
      </div>
    );
  }

  return (
    <div>
      <AnnexeNav />
      <div className="container" style={{ maxWidth: 720 }}>
        <h1 className="page-title">Mes statistiques</h1>
        <p className="page-sub">Ta progression dans l'espace tuteurs.</p>

        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="stat-box">
            <div className="stat-value">{moyenne}</div>
            <div className="stat-label">Score moyen</div>
          </div>
          <div className="stat-box">
            <div className="stat-value" style={{ color: 'var(--success)' }}>{tauxReussite !== null ? `${tauxReussite}%` : '—'}</div>
            <div className="stat-label">Réussite</div>
          </div>
          <div className="stat-box">
            <div className="stat-value" style={{ color: 'var(--text-main)' }}>{nb}</div>
            <div className="stat-label">QCM faits</div>
          </div>
        </div>

        <div className="settings-card">
          <div className="section-title">
            <h3 style={{ margin: 0 }}>Régularité (30 derniers jours)</h3>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 400 }}>🔥 Meilleure série : {meilleureSerieHistorique} j</span>
          </div>
          <div className="heat-grid">
            {derniers30Jours.map((jour) => (
              <div key={jour} title={jour} className={`heat-day ${joursActifsSet.has(jour) ? 'active' : ''}`} />
            ))}
          </div>
        </div>

        {Object.keys(parMatiere).length > 0 && (
          <div className="settings-card">
            <h3>Par matière</h3>
            {Object.entries(parMatiere).map(([nom, v]) => {
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

        {Object.keys(parType).length > 0 && (
          <div className="settings-card">
            <h3>Par type de QCM</h3>
            <div className="detail-subject-list">
              {Object.entries(parType).map(([type, v]) => (
                <div key={type} className="detail-subject-row">
                  <span className="ds-name">{type} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({v.count})</span></span>
                  <span className="ds-score">{Math.round((v.total / v.count) * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {moisTries.length > 1 && (
          <div className="settings-card">
            <h3>Évolution dans le temps</h3>
            <div className="distrib-bars" style={{ height: 130 }}>
              {moisTries.map((mois) => {
                const pct = Math.round((parMois[mois].total / parMois[mois].count) * 100);
                return (
                  <div key={mois} className="distrib-bar-wrap">
                    <div className="distrib-bar" style={{ height: `${pct}%` }}><span className="bar-count">{pct}%</span></div>
                    <span className="distrib-label">{mois.slice(2)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tempsMoyen !== null && (
          <div className="stat-box" style={{ marginBottom: 24 }}>
            <div className="stat-value">{tempsMoyen} min</div>
            <div className="stat-label">Temps moyen passé par QCM</div>
          </div>
        )}

        <div className="settings-card">
          <h3>Historique</h3>
          <div className="history-table">
            {attempts.slice(0, 3).map((a) => <LigneHistorique key={a.id} a={a} />)}
          </div>
          {attempts.length > 3 && (
            <button className="btn btn-outline" style={{ width: '100%', marginTop: 12 }} onClick={() => setPopupOuverte(true)}>
              Voir tout ({attempts.length})
            </button>
          )}
        </div>

        {popupOuverte && (
          <div className="modal-overlay open" onClick={() => setPopupOuverte(false)}>
            <div onClick={(e) => e.stopPropagation()} className="modal-box" style={{ maxWidth: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0 }}>Tout mon historique</h3>
                <button onClick={() => setPopupOuverte(false)} style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
              </div>

              <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher un QCM..." style={{ marginBottom: 12 }} />

              <div className="filter-row">
                {[['tous', 'Tous'], ['Entraînement', 'Entraînement'], ['Annale', 'Annale'], ['Concours blanc', 'Concours blanc']].map(([val, label]) => (
                  <button key={val} className={`filter-chip ${filtreType === val ? 'active' : ''}`} onClick={() => setFiltreType(val)}>{label}</button>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <select className="select-filter" value={filtreMatiere} onChange={(e) => setFiltreMatiere(e.target.value)} style={{ flex: 1 }}>
                  <option value="">Toutes les matières</option>
                  {matieres.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
                </select>
                <select className="select-filter" value={tri} onChange={(e) => setTri(e.target.value)} style={{ flex: 1 }}>
                  <option value="date_desc">Plus récent</option>
                  <option value="score_desc">Meilleur score</option>
                  <option value="score_asc">Moins bon score</option>
                </select>
              </div>

              <div style={{ overflowY: 'auto', flex: 1 }}>
                {attemptsFiltrees.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Aucun résultat.</p>}
                <div className="history-table">
                  {attemptsFiltrees.map((a) => <LigneHistorique key={a.id} a={a} />)}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
