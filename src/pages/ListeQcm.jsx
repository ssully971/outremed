import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

export default function ListeQcm() {
  const [matieres, setMatieres] = useState([]);
  const [qcms, setQcms] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [monRole, setMonRole] = useState(null);
  const [ongletActif, setOngletActif] = useState('tous');
  const [recherche, setRecherche] = useState('');
  const [etendues, setEtendues] = useState({});
  const [semaineKholleActuelle, setSemaineKholleActuelle] = useState(null);
  const [qcmsKholleDetail, setQcmsKholleDetail] = useState([]);
  const navigate = useNavigate();

  async function charger() {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) { navigate('/'); return; }
    const uid = session.session.user.id;

    const { data: moi } = await supabase.from('profiles').select('role').eq('id', uid).single();
    setMonRole(moi?.role);

    const { data: mats } = await supabase.from('matieres').select('*').eq('est_prive', false).order('nom');
    const { data: listeQcms } = await supabase.from('qcms').select('*').eq('visible', true).eq('publie', true).eq('est_prive', false);
    const { data: mesAttempts } = await supabase.from('attempts').select('*').eq('user_id', uid);

    setMatieres(mats || []);
    setQcms(listeQcms || []);
    setAttempts(mesAttempts || []);

    const { data: semaines } = await supabase.from('semaines_kholle').select('*').order('date_samedi', { ascending: false }).limit(1);
    if (semaines && semaines.length > 0 && new Date(semaines[0].fin) > new Date()) {
      setSemaineKholleActuelle(semaines[0]);
      const { data: qcmsSemaine } = await supabase.from('qcms').select('id, titre, matiere_id, nb_questions').eq('semaine_kholle_id', semaines[0].id);
      const detail = (qcmsSemaine || []).map((q) => {
        const tentative = (mesAttempts || []).find((a) => a.qcm_id === q.id);
        const info = (mats || []).find((m) => m.id === q.matiere_id) || {};
        return { titre: q.titre, matiere: info.nom || 'Autre', couleur: info.couleur || '#FF3EB5', qcmId: q.id, fait: !!tentative, score: tentative?.score, nb_questions: q.nb_questions };
      });
      setQcmsKholleDetail(detail);
    }
  }

  useEffect(() => { charger(); }, []);

  function statutQcm(qcm) {
    const tentatives = attempts.filter((a) => a.qcm_id === qcm.id);
    if (tentatives.length === 0) return { label: 'Nouveau', classe: 'status-new', fait: false, score: null };
    const meilleur = Math.max(...tentatives.map((a) => a.score));
    return { label: 'Fait', classe: 'status-done', fait: true, score: meilleur };
  }

  function labelType(qcm) {
    if (qcm.is_kholle) return 'Kholle';
    if (qcm.is_annale) return 'Annale';
    if (qcm.type_qcm === 'concours_blanc') return 'Concours blanc';
    return 'Entraînement';
  }

  async function masquer(e, qcmId) {
    e.stopPropagation();
    if (!confirm('Masquer ce QCM ? Il ira dans les archives, tu pourras le remontrer plus tard.')) return;
    await supabase.from('qcms').update({ visible: false }).eq('id', qcmId);
    charger();
  }

  function decompteKholle() {
    if (!semaineKholleActuelle) return '';
    const diffMs = new Date(semaineKholleActuelle.fin) - new Date();
    if (diffMs <= 0) return 'Fermée';
    const jours = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const heures = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    return jours > 0 ? `Ferme dans ${jours}j ${heures}h` : `Ferme dans ${heures}h`;
  }

  const estAdmin = monRole === 'tuteur' || monRole === 'proprietaire';

  const qcmsFiltres = qcms
    .filter((q) => !q.is_kholle)
    .filter((q) => {
      if (ongletActif === 'entrainement') return q.type_qcm === 'entrainement' && !q.is_annale;
      if (ongletActif === 'annale') return q.is_annale;
      if (ongletActif === 'concours') return q.type_qcm === 'concours_blanc' && !q.is_annale;
      return true;
    })
    .filter((q) => q.titre.toLowerCase().includes(recherche.toLowerCase()));

  const parMatiere = matieres.map((m) => ({
    ...m,
    qcms: qcmsFiltres.filter((q) => q.matiere_id === m.id),
  })).filter((m) => m.qcms.length > 0);

  const sansMatiere = qcmsFiltres.filter((q) => !q.matiere_id);

  function CarteQcm({ qcm }) {
    const statut = statutQcm(qcm);
    return (
      <div className="qcm-card" style={{ '--card-color': matieres.find((m) => m.id === qcm.matiere_id)?.couleur || '#FF3EB5' }} onClick={() => navigate(`/qcm/${qcm.id}`)}>
        <span className="mode-tag">{labelType(qcm)}</span>
        <h3>{qcm.titre}</h3>
        <div className="meta-row">
          <span>{qcm.nb_questions} questions</span>
          {estAdmin && (
            <button onClick={(e) => masquer(e, qcm.id)} className="btn btn-outline" style={{ padding: '3px 8px', fontSize: '0.7rem' }} title="Masquer / archiver">🗄</button>
          )}
        </div>
        <div className="meta-row" style={{ marginBottom: 0 }}>
          <span className={`status-pill ${statut.classe}`}>{statut.label}</span>
          {statut.score !== null && <span className="score-line" style={{ color: 'var(--success)' }}>{statut.score}/{qcm.nb_questions}</span>}
        </div>
      </div>
    );
  }

  function SectionMatiere({ titre, couleur, liste }) {
    const cle = titre;
    const estEtendue = etendues[cle];
    const aMontrer = estEtendue ? liste : liste.slice(0, 6);
    return (
      <div className="subject-section">
        <div className="subject-header">
          {couleur && <span className="dot" style={{ background: couleur }} />}
          <h2>{titre}</h2>
          <span className="count">({liste.length})</span>
        </div>
        <div className="qcm-grid">
          {aMontrer.map((q) => <CarteQcm key={q.id} qcm={q} />)}
        </div>
        {liste.length > 6 && (
          <div className="see-more-row">
            <button className="see-more-btn" onClick={() => setEtendues((prev) => ({ ...prev, [cle]: !prev[cle] }))}>
              {estEtendue ? 'Voir moins' : `Voir plus (${liste.length - 6})`} <span className="arrow">▾</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="container">
      <h1 className="page-title">QCM</h1>
      <p className="page-sub">Retrouve tous les QCM disponibles, par matière.</p>

      {semaineKholleActuelle && (
        <div className="kholle-banner">
          <div className="kholle-top">
            <div>
              <span className="tag">Kholle</span>
              <h3>Kholle de la semaine</h3>
              <p className="meta-info" style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>{qcmsKholleDetail.length} matière(s)</p>
            </div>
            <span className="countdown">{decompteKholle()}</span>
          </div>
          <div className="kholle-subjects">
            {qcmsKholleDetail.map((q, idx) => (
              <Link key={idx} to={`/qcm/${q.qcmId}`} className="kholle-subject-chip" style={{ '--sub-color': q.couleur }}>
                <span className="dot" />
                {q.matiere}
                <span className="qstatus">{q.fait ? `${q.score}/${q.nb_questions}` : 'à faire'}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="category-tabs">
        {[['tous', 'Tous'], ['entrainement', 'Entraînement'], ['annale', 'Annales'], ['concours', 'Concours blancs']].map(([val, label]) => (
          <button key={val} className={`cat-tab ${ongletActif === val ? 'active' : ''}`} onClick={() => setOngletActif(val)}>
            {label}
          </button>
        ))}
      </div>

      <div className="search-bar">
        <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher un QCM..." />
      </div>

      {parMatiere.length === 0 && sansMatiere.length === 0 && (
        <p style={{ color: 'var(--text-muted)' }}>Aucun QCM ne correspond à cette recherche.</p>
      )}

      {parMatiere.map((m) => (
        <SectionMatiere key={m.id} titre={m.nom} couleur={m.couleur} liste={m.qcms} />
      ))}

      {sansMatiere.length > 0 && (
        <SectionMatiere titre="Autre" couleur={null} liste={sansMatiere} />
      )}
    </div>
  );
}
