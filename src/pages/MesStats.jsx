import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

export default function MesStats() {
  const [profil, setProfil] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [matieres, setMatieres] = useState([]);
  const [positionKholle, setPositionKholle] = useState(null);
  const [positionSemestre, setPositionSemestre] = useState(null);
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
    setProfil(p);

    const { data: mats } = await supabase.from('matieres').select('*');
    setMatieres(mats || []);

    const { data: att } = await supabase
      .from('attempts')
      .select('*, qcms(titre, numero, nb_questions, matiere_id, type_qcm, is_kholle, is_annale, semaine_kholle_id)')
      .eq('user_id', uid)
      .order('created_at', { ascending: false });
    setAttempts(att || []);

    // Meilleure série de jours consécutifs jamais atteinte
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

    if (p.afficher_position_classement) {
      // Position sur la dernière kholle
      const { data: semaines } = await supabase.from('semaines_kholle').select('*').order('date_samedi', { ascending: false }).limit(1);
      if (semaines && semaines.length > 0) {
        const { data: qcmsSemaine } = await supabase.from('qcms').select('id').eq('semaine_kholle_id', semaines[0].id);
        const idsQcms = (qcmsSemaine || []).map((q) => q.id);
        if (idsQcms.length > 0) {
          const { data: resultatsSemaine } = await supabase.from('resultats_classement').select('user_id, score').in('qcm_id', idsQcms);
          const parEtudiant = {};
          (resultatsSemaine || []).forEach((r) => {
            parEtudiant[r.user_id] = (parEtudiant[r.user_id] || 0) + Number(r.score);
          });
          const classement = Object.entries(parEtudiant).sort((a, b) => b[1] - a[1]).map(([id]) => id);
          const rang = classement.indexOf(uid);
          if (rang >= 0) setPositionKholle({ rang: rang + 1, total: classement.length });
        }
      }

      // Position cumulée sur le semestre actif
      const { data: paramSemestre } = await supabase.from('parametres').select('valeur').eq('cle', 'semestre_actif').single();
      if (paramSemestre?.valeur) {
        const { data: semainesSemestre } = await supabase.from('semaines_kholle').select('id').eq('semestre', paramSemestre.valeur);
        const idsSemaines = (semainesSemestre || []).map((s) => s.id);
        if (idsSemaines.length > 0) {
          const { data: qcmsSemestre } = await supabase.from('qcms').select('id').in('semaine_kholle_id', idsSemaines);
          const idsQcmsSemestre = (qcmsSemestre || []).map((q) => q.id);
          if (idsQcmsSemestre.length > 0) {
            const { data: resultatsSemestre } = await supabase.from('resultats_classement').select('user_id, score').in('qcm_id', idsQcmsSemestre);
            const parEtudiant = {};
            (resultatsSemestre || []).forEach((r) => {
              parEtudiant[r.user_id] = (parEtudiant[r.user_id] || 0) + Number(r.score);
            });
            const classement = Object.entries(parEtudiant).sort((a, b) => b[1] - a[1]).map(([id]) => id);
            const rang = classement.indexOf(uid);
            if (rang >= 0) setPositionSemestre({ rang: rang + 1, total: classement.length });
          }
        }
      }
    }
  }

  useEffect(() => { charger(); }, []);

  async function basculerAffichagePosition() {
    const nouvelleValeur = !profil.afficher_position_classement;
    await supabase.from('profiles').update({ afficher_position_classement: nouvelleValeur }).eq('id', profil.id);
    setProfil((prev) => ({ ...prev, afficher_position_classement: nouvelleValeur }));
    if (nouvelleValeur) charger();
    else { setPositionKholle(null); setPositionSemestre(null); }
  }

  if (!profil) return <div style={{ padding: 40 }}>Chargement...</div>;

  function labelType(qcm) {
    if (qcm?.is_kholle) return 'Kholle';
    if (qcm?.is_annale) return 'Annale';
    if (qcm?.type_qcm === 'concours_blanc') return 'Concours blanc';
    return 'Entraînement';
  }

  const nb = attempts.length;
  const moyenne = nb > 0 ? (attempts.reduce((s, a) => s + Number(a.score), 0) / nb).toFixed(1) : '—';
  const tauxReussite = nb > 0
    ? Math.round((attempts.reduce((s, a) => s + Number(a.score) / (a.qcms?.nb_questions || 1), 0) / nb) * 100)
    : null;

  const parMatiere = {};
  attempts.forEach((a) => {
    const nom = matieres.find((m) => m.id === a.qcms?.matiere_id)?.nom || 'Autre';
    if (!parMatiere[nom]) parMatiere[nom] = { total: 0, count: 0 };
    parMatiere[nom].total += Number(a.score) / (a.qcms?.nb_questions || 1);
    parMatiere[nom].count += 1;
  });

  const parType = {};
  attempts.forEach((a) => {
    const t = labelType(a.qcms);
    if (!parType[t]) parType[t] = { total: 0, count: 0 };
    parType[t].total += Number(a.score) / (a.qcms?.nb_questions || 1);
    parType[t].count += 1;
  });

  // Évolution mensuelle
  const parMois = {};
  attempts.forEach((a) => {
    const mois = new Date(a.created_at).toISOString().slice(0, 7);
    if (!parMois[mois]) parMois[mois] = { total: 0, count: 0 };
    parMois[mois].total += Number(a.score) / (a.qcms?.nb_questions || 1);
    parMois[mois].count += 1;
  });
  const moisTries = Object.keys(parMois).sort();
  const moisActuel = new Date().toISOString().slice(0, 7);
  const moisPrecedent = (() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); })();
  let progression = null;
  if (parMois[moisActuel] && parMois[moisPrecedent]) {
    const pctActuel = (parMois[moisActuel].total / parMois[moisActuel].count) * 100;
    const pctPrecedent = (parMois[moisPrecedent].total / parMois[moisPrecedent].count) * 100;
    progression = Math.round(pctActuel - pctPrecedent);
  }

  // Temps moyen par QCM
  const attemptsAvecTemps = attempts.filter((a) => a.temps_passe_secondes);
  const tempsMoyen = attemptsAvecTemps.length > 0
    ? Math.round(attemptsAvecTemps.reduce((s, a) => s + a.temps_passe_secondes, 0) / attemptsAvecTemps.length / 60)
    : null;

  // Régularité sur 30 jours
  const joursActifsSet = new Set(attempts.map((a) => new Date(a.created_at).toISOString().slice(0, 10)));
  const derniers30Jours = Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    return d.toISOString().slice(0, 10);
  });

  const attemptsFiltrees = attempts
    .filter((a) => {
      if (recherche.trim()) {
        const texte = recherche.trim().toLowerCase().replace('#', '');
        const numeroStr = String(a.qcms?.numero || '').padStart(4, '0');
        if (!a.qcms?.titre?.toLowerCase().includes(texte) && !numeroStr.includes(texte)) return false;
      }
      if (filtreType !== 'tous' && labelType(a.qcms) !== filtreType) return false;
      if (filtreMatiere && a.qcms?.matiere_id !== filtreMatiere) return false;
      return true;
    })
    .sort((a, b) => {
      if (tri === 'score_desc') return b.score - a.score;
      if (tri === 'score_asc') return a.score - b.score;
      return new Date(b.created_at) - new Date(a.created_at);
    });

  return (
    <div className="container" style={{ maxWidth: 720 }}>
      <h1 className="page-title">Mes statistiques</h1>
      <p className="page-sub" style={{ marginBottom: 24 }}>Ta progression, en détail.</p>

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

      {progression !== null && (
        <p style={{ fontSize: '0.85rem', color: progression >= 0 ? 'var(--success)' : 'var(--error)', marginTop: -14, marginBottom: 24 }}>
          {progression >= 0 ? '↑' : '↓'} {Math.abs(progression)}% par rapport au mois dernier
        </p>
      )}

      <div className="settings-card">
        <div className="section-title" style={{ marginBottom: profil.afficher_position_classement ? 16 : 0 }}>
          <h3 style={{ margin: 0 }}>Position au classement</h3>
          <button onClick={basculerAffichagePosition}>{profil.afficher_position_classement ? 'Masquer' : 'Afficher'}</button>
        </div>
        {profil.afficher_position_classement && (
          <div style={{ display: 'flex', gap: 32 }}>
            <div>
              <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--accent)' }}>{positionKholle ? `${positionKholle.rang}/${positionKholle.total}` : '—'}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Dernière kholle</div>
            </div>
            <div>
              <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--accent)' }}>{positionSemestre ? `${positionSemestre.rang}/${positionSemestre.total}` : '—'}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Cumulé semestre</div>
            </div>
          </div>
        )}
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
          {attempts.slice(0, 3).map((a) => {
            const infoMat = matieres.find((m) => m.id === a.qcms?.matiere_id);
            return (
              <Link key={a.id} to={`/resultats/${a.id}`} className="history-row" style={{ '--row-color': infoMat?.couleur }}>
                <div className="bar" />
                <div>
                  <div className="h-name">{a.qcms?.titre}</div>
                  <div className="h-sub">{infoMat?.nom || 'Autre'} · {labelType(a.qcms)}</div>
                </div>
                <div className="h-type" />
                <div className="h-date">{new Date(a.created_at).toLocaleDateString('fr-FR')}</div>
                <div className="h-score" style={{ color: 'var(--accent)' }}>{a.score}</div>
                <span />
              </Link>
            );
          })}
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
              {[['tous', 'Tous'], ['Entraînement', 'Entraînement'], ['Concours blanc', 'Concours blanc'], ['Kholle', 'Kholle'], ['Annale', 'Annale']].map(([val, label]) => (
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
                {attemptsFiltrees.map((a) => {
                  const infoMat = matieres.find((m) => m.id === a.qcms?.matiere_id);
                  return (
                    <Link key={a.id} to={`/resultats/${a.id}`} className="history-row" style={{ '--row-color': infoMat?.couleur }}>
                      <div className="bar" />
                      <div>
                        <div className="h-name">{a.qcms?.titre}</div>
                        <div className="h-sub">{infoMat?.nom || 'Autre'} · {labelType(a.qcms)}</div>
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
        </div>
      )}
    </div>
  );
}
