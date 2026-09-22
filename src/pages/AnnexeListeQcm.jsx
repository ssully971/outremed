import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import AnnexeNav from '../components/AnnexeNav';
import AnnexePopupMatieres from '../components/AnnexePopupMatieres';

export default function AnnexeListeQcm() {
  const [matieres, setMatieres] = useState([]);
  const [qcms, setQcms] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [userId, setUserId] = useState(null);
  const [ongletActif, setOngletActif] = useState('tous');
  const [recherche, setRecherche] = useState('');
  const [popupMatieresOuverte, setPopupMatieresOuverte] = useState(false);
  const [chargement, setChargement] = useState(true);
  const navigate = useNavigate();

  async function charger() {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) { navigate('/'); return; }
    const uid = session.session.user.id;

    const { data: moi } = await supabase.from('profiles').select('role').eq('id', uid).single();
    if (moi?.role !== 'tuteur' && moi?.role !== 'proprietaire') { navigate('/accueil'); return; }
    setUserId(uid);

    const { data: mats } = await supabase.from('annexe_matieres').select('*').eq('actif', true).order('ordre');
    const { data: listeQcms } = await supabase.from('annexe_qcms').select('*');
    const { data: mesAttempts } = await supabase.from('annexe_attempts').select('*').eq('user_id', uid);

    setMatieres(mats || []);
    setQcms(listeQcms || []);
    setAttempts(mesAttempts || []);
    setChargement(false);
  }

  useEffect(() => { charger(); }, []);

  function statutQcm(qcm) {
    if (localStorage.getItem(`outremed_annexe_progression_${qcm.id}_${userId}`)) {
      return { label: 'En pause', classe: 'status-progress', score: null };
    }
    const tentatives = attempts.filter((a) => a.qcm_id === qcm.id);
    if (tentatives.length === 0) return { label: 'Jamais fait', classe: 'status-new', score: null };
    const meilleur = Math.max(...tentatives.map((a) => Number(a.score)));
    return { label: 'Fait', classe: 'status-done', score: meilleur };
  }

  function labelType(qcm) {
    if (qcm.is_annale) return 'Annale';
    return qcm.type_qcm === 'concours_blanc' ? 'Concours blanc' : 'Entraînement';
  }

  const qcmsFiltres = qcms
    .filter((q) => {
      if (ongletActif === 'entrainement') return q.type_qcm === 'entrainement' && !q.is_annale;
      if (ongletActif === 'annale') return q.is_annale;
      if (ongletActif === 'concours') return q.type_qcm === 'concours_blanc';
      return true;
    })
    .filter((q) => q.titre.toLowerCase().includes(recherche.toLowerCase()));

  const matieresTop = matieres.filter((m) => !m.parent_id);
  const sousMatieresDe = (parentId) => matieres.filter((m) => m.parent_id === parentId);

  const parMatiereTop = matieresTop.map((top) => ({
    ...top,
    qcmsDirects: qcmsFiltres.filter((q) => q.matiere_id === top.id),
    sousMatieres: sousMatieresDe(top.id)
      .map((sm) => ({ ...sm, qcms: qcmsFiltres.filter((q) => q.matiere_id === sm.id) }))
      .filter((sm) => sm.qcms.length > 0),
  })).filter((top) => top.qcmsDirects.length > 0 || top.sousMatieres.length > 0);

  const idsMatieresConnues = matieres.map((m) => m.id);
  const sansMatiere = qcmsFiltres.filter((q) => !q.matiere_id || !idsMatieresConnues.includes(q.matiere_id));

  function CarteQcm({ qcm }) {
    const statut = statutQcm(qcm);
    const couleur = matieres.find((m) => m.id === qcm.matiere_id)?.couleur || '#FF3EB5';
    return (
      <div className="qcm-card" style={{ '--card-color': couleur }} onClick={() => navigate(`/annexe/qcm/${qcm.id}`)}>
        <span className="mode-tag">{labelType(qcm)}</span>
        <h3>{qcm.titre}</h3>
        <div className="meta-row">
          <span>{qcm.nb_questions} questions</span>
        </div>
        <div className="meta-row" style={{ marginBottom: 0 }}>
          <span className={`status-pill ${statut.classe}`}>{statut.label}</span>
          {statut.score !== null && <span className="score-line" style={{ color: 'var(--success)' }}>{statut.score}/{qcm.nb_questions}</span>}
        </div>
      </div>
    );
  }

  function SectionMatiere({ titre, couleur, liste }) {
    return (
      <div className="subject-section">
        <div className="subject-header">
          {couleur && <span className="dot" style={{ background: couleur }} />}
          <h2>{titre}</h2>
          <span className="count">({liste.length})</span>
        </div>
        <div className="qcm-grid">
          {liste.map((q) => <CarteQcm key={q.id} qcm={q} />)}
        </div>
      </div>
    );
  }

  if (chargement) return null;

  return (
    <div>
      <AnnexeNav />
      <div className="container">
        <h1 className="page-title">🕵️ Espace tuteurs — QCM</h1>
        <p className="page-sub">Créez et passez des QCM entre tuteurs, séparément de l'espace étudiant.</p>

        <div className="category-tabs">
          {[['tous', 'Tous'], ['entrainement', 'Entraînement'], ['annale', 'Annales'], ['concours', 'Concours blancs']].map(([val, label]) => (
            <button key={val} className={`cat-tab ${ongletActif === val ? 'active' : ''}`} onClick={() => setOngletActif(val)}>
              {label}
            </button>
          ))}
          <button className="btn btn-outline btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setPopupMatieresOuverte(true)}>🗂 Gérer les matières</button>
        </div>

        <div className="search-bar">
          <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher un QCM..." />
        </div>

        {parMatiereTop.length === 0 && sansMatiere.length === 0 && (
          <p style={{ color: 'var(--text-muted)' }}>Aucun QCM ne correspond à cette recherche.</p>
        )}

        {parMatiereTop.map((top) => (
          <div key={top.id}>
            {top.qcmsDirects.length > 0 && (
              <SectionMatiere titre={top.nom} couleur={top.couleur} liste={top.qcmsDirects} />
            )}
            {top.sousMatieres.map((sm) => (
              <div key={sm.id} style={{ marginLeft: 20 }}>
                <SectionMatiere titre={`${top.nom} · ${sm.nom}`} couleur={sm.couleur || top.couleur} liste={sm.qcms} />
              </div>
            ))}
          </div>
        ))}

        {sansMatiere.length > 0 && (
          <SectionMatiere titre="Autre" couleur={null} liste={sansMatiere} />
        )}
      </div>

      {popupMatieresOuverte && (
        <AnnexePopupMatieres onFermer={() => { setPopupMatieresOuverte(false); charger(); }} />
      )}
    </div>
  );
}
