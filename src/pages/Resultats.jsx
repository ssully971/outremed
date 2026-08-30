import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

export default function Resultats() {
  const [attempts, setAttempts] = useState([]);
  const [matieres, setMatieres] = useState([]);
  const [filtreMatiere, setFiltreMatiere] = useState('toutes');
  const [filtreType, setFiltreType] = useState('tous');
  const [recherche, setRecherche] = useState('');
  const [monRole, setMonRole] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    async function charger() {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) { navigate('/'); return; }
      const uid = session.session.user.id;

      const { data: moi } = await supabase.from('profiles').select('role').eq('id', uid).single();
      setMonRole(moi?.role);

      const { data: mats } = await supabase.from('matieres').select('*').order('nom');
      setMatieres(mats || []);

      const { data: att } = await supabase
        .from('attempts')
        .select('*, qcms(titre, type_qcm, is_annale, is_kholle, matiere_id)')
        .eq('user_id', uid)
        .order('created_at', { ascending: false });
      setAttempts(att || []);
    }
    charger();
  }, []);

  function infoMatiere(matiereId) {
    return matieres.find((m) => m.id === matiereId) || { nom: '—', couleur: '#FF3EB5' };
  }

  function labelType(qcm) {
    if (qcm.is_kholle) return 'Kholle';
    if (qcm.is_annale) return 'Annale';
    if (qcm.type_qcm === 'concours_blanc') return 'Concours blanc';
    return 'Entraînement';
  }

  const attemptsFiltres = attempts
    .filter((a) => filtreMatiere === 'toutes' || a.qcms.matiere_id === filtreMatiere)
    .filter((a) => {
      if (filtreType === 'tous') return true;
      const t = labelType(a.qcms);
      return t.toLowerCase().replace(' blanc', '') === filtreType;
    })
    .filter((a) => a.qcms.titre.toLowerCase().includes(recherche.toLowerCase()));

  async function supprimer(e, attemptId) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Supprimer définitivement cette tentative ?')) return;
    await supabase.from('attempts').delete().eq('id', attemptId);
    setAttempts((prev) => prev.filter((x) => x.id !== attemptId));
  }

  return (
    <div className="container">
      {monRole === 'proprietaire' && (
        <Link to="/espace-perso" className="home-btn" style={{ display: 'inline-flex', marginBottom: 16 }}>← Espace perso</Link>
      )}
      <h1 className="page-title">Résultats</h1>
      <p className="page-sub">L'historique complet de tes tentatives.</p>

      <div className="search-bar">
        <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher un QCM..." />
      </div>

      <div className="category-tabs">
        {[['tous', 'Tous'], ['entrainement', 'Entraînement'], ['kholle', 'Kholle'], ['annale', 'Annale'], ['concours', 'Concours']].map(([val, label]) => (
          <button key={val} className={`cat-tab ${filtreType === val ? 'active' : ''}`} onClick={() => setFiltreType(val)}>{label}</button>
        ))}
      </div>

      <div className="filter-row">
        <button className={`filter-chip ${filtreMatiere === 'toutes' ? 'active' : ''}`} onClick={() => setFiltreMatiere('toutes')}>Toutes les matières</button>
        {matieres.map((m) => (
          <button key={m.id} className={`filter-chip ${filtreMatiere === m.id ? 'active' : ''}`} onClick={() => setFiltreMatiere(m.id)}>{m.nom}</button>
        ))}
      </div>

      {attemptsFiltres.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Aucune tentative ne correspond.</p>}

      <div className="history-table">
        {attemptsFiltres.map((a) => {
          const info = infoMatiere(a.qcms.matiere_id);
          return (
            <Link key={a.id} to={`/resultats/${a.id}`} className="history-row" style={{ '--row-color': info.couleur }}>
              <div className="bar" />
              <div>
                <div className="h-name">{a.qcms.titre}</div>
                <div className="h-sub">{info.nom}</div>
              </div>
              <div className="h-type">{labelType(a.qcms)}</div>
              <div className="h-date">{new Date(a.created_at).toLocaleDateString('fr-FR')}</div>
              <div className="h-score" style={{ color: 'var(--accent)' }}>{a.score}</div>
              <button
                onClick={(e) => supprimer(e, a.id)}
                title="Supprimer"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem' }}
              >
                🗑
              </button>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
