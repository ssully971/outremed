import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import AnnexeNav from '../components/AnnexeNav';

export default function AnnexeGestionQcm() {
  const [qcms, setQcms] = useState([]);
  const [matieres, setMatieres] = useState([]);
  const [profilsMap, setProfilsMap] = useState({});
  const [monId, setMonId] = useState(null);
  const [recherche, setRecherche] = useState('');
  const [menuActionsOuvert, setMenuActionsOuvert] = useState(null);
  const navigate = useNavigate();

  async function charger() {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) { navigate('/'); return; }
    const { data: moi } = await supabase.from('profiles').select('role').eq('id', session.session.user.id).single();
    if (moi?.role !== 'tuteur' && moi?.role !== 'proprietaire') { navigate('/accueil'); return; }
    setMonId(session.session.user.id);

    const { data: profils } = await supabase.from('profiles').select('id, pseudo');
    const map = {};
    (profils || []).forEach((p) => { map[p.id] = p.pseudo; });
    setProfilsMap(map);

    const { data } = await supabase.from('annexe_qcms').select('*').order('created_at', { ascending: false });
    setQcms(data || []);

    const { data: mats } = await supabase.from('annexe_matieres').select('*');
    setMatieres(mats || []);
  }

  useEffect(() => { charger(); }, []);

  useEffect(() => {
    function fermerSiExterieur(e) {
      if (!e.target.closest('.qmr-actions')) setMenuActionsOuvert(null);
    }
    document.addEventListener('mousedown', fermerSiExterieur);
    return () => document.removeEventListener('mousedown', fermerSiExterieur);
  }, []);

  async function supprimer(qcm) {
    if (!confirm(`Supprimer définitivement "${qcm.titre}" ? Cette action est irréversible et supprime aussi les tentatives déjà faites par les tuteurs.`)) return;
    await supabase.from('annexe_historique_qcm').insert({
      qcm_id: null, action: 'suppression', effectue_par: monId,
      details: `${qcm.titre} — supprimé`,
    });
    const { error } = await supabase.from('annexe_qcms').delete().eq('id', qcm.id);
    if (error) { alert('Erreur : ' + error.message); return; }
    charger();
  }

  function labelType(qcm) {
    if (qcm.is_annale) return 'Annale';
    return qcm.type_qcm === 'concours_blanc' ? 'Concours blanc' : 'Entraînement';
  }

  function nomAvecParent(matiereId) {
    const m = matieres.find((mm) => mm.id === matiereId);
    if (!m) return 'Sans matière';
    if (!m.parent_id) return m.nom;
    const parent = matieres.find((p) => p.id === m.parent_id);
    return parent ? `${parent.nom} · ${m.nom}` : m.nom;
  }

  const qcmsFiltres = qcms.filter((q) => q.titre.toLowerCase().includes(recherche.toLowerCase()));

  return (
    <div>
      <AnnexeNav />
      <div className="container">
        <h1 className="page-title">Gérer les QCM de l'espace tuteurs</h1>
        <p className="page-sub">Pool partagé — n'importe quel tuteur/propriétaire peut modifier ou supprimer n'importe quel QCM.</p>

        <div className="search-bar">
          <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher un QCM..." />
        </div>

        <div className="qcm-manage-list">
          {qcmsFiltres.map((qcm) => {
            const infoMatiere = matieres.find((m) => m.id === qcm.matiere_id);
            return (
              <div key={qcm.id} className="qcm-manage-row" style={{ '--row-color': infoMatiere?.couleur || 'var(--accent)' }}>
                <div className="bar" />
                <div>
                  <div className="qmr-name">{qcm.titre}</div>
                  <div className="qmr-sub">{nomAvecParent(qcm.matiere_id)}</div>
                </div>
                <div className="qmr-type">{labelType(qcm)}</div>
                <div className="qmr-count">{qcm.nb_questions} Q.</div>
                <div className="qmr-author">Par <b>{qcm.cree_par === monId ? 'Moi' : (profilsMap[qcm.cree_par] || '—')}</b></div>
                <div className="qmr-actions" style={{ position: 'relative' }}>
                  <button className="icon-action" title="Actions" onClick={() => setMenuActionsOuvert(menuActionsOuvert === qcm.id ? null : qcm.id)}>⋯</button>
                  {menuActionsOuvert === qcm.id && (
                    <div className="dropdown-menu" style={{ top: '110%', right: 0, minWidth: 180 }}>
                      <Link to={`/annexe/qcm/${qcm.id}/modifier`} className="dropdown-item" onClick={() => setMenuActionsOuvert(null)}>✏️ Modifier</Link>
                      <button className="dropdown-item" style={{ color: 'var(--error)' }} onClick={() => { supprimer(qcm); setMenuActionsOuvert(null); }}>🗑 Supprimer</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {qcmsFiltres.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Aucun QCM pour l'instant.</p>}
        </div>
      </div>
    </div>
  );
}
