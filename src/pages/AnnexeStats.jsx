import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import AnnexeNav from '../components/AnnexeNav';

export default function AnnexeStats() {
  const [chargement, setChargement] = useState(true);
  const [qcms, setQcms] = useState([]);
  const [matieres, setMatieres] = useState([]);
  const [profils, setProfils] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    async function charger() {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) { navigate('/'); return; }
      const { data: moi } = await supabase.from('profiles').select('role').eq('id', session.session.user.id).single();
      if (moi?.role !== 'tuteur' && moi?.role !== 'proprietaire') { navigate('/accueil'); return; }

      const { data: q } = await supabase.from('annexe_qcms').select('id, matiere_id, cree_par, type_qcm, is_annale');
      const { data: mats } = await supabase.from('annexe_matieres').select('*');
      const { data: p } = await supabase.from('profiles').select('id, pseudo').in('role', ['tuteur', 'proprietaire']);

      setQcms(q || []);
      setMatieres(mats || []);
      setProfils(p || []);
      setChargement(false);
    }
    charger();
  }, []);

  if (chargement) return null;

  function nomAvecParent(matiereId) {
    const m = matieres.find((mm) => mm.id === matiereId);
    if (!m) return 'Sans matière';
    if (!m.parent_id) return m.nom;
    const parent = matieres.find((p2) => p2.id === m.parent_id);
    return parent ? `${parent.nom} · ${m.nom}` : m.nom;
  }

  const parTuteur = profils.map((p) => {
    const siens = qcms.filter((q) => q.cree_par === p.id);
    const parMatiere = {};
    siens.forEach((q) => {
      const nom = nomAvecParent(q.matiere_id);
      parMatiere[nom] = (parMatiere[nom] || 0) + 1;
    });
    return { pseudo: p.pseudo, total: siens.length, parMatiere };
  }).sort((a, b) => b.total - a.total);

  const parMatiereGlobal = {};
  qcms.forEach((q) => {
    const nom = nomAvecParent(q.matiere_id);
    parMatiereGlobal[nom] = (parMatiereGlobal[nom] || 0) + 1;
  });
  const matieresTriees = Object.entries(parMatiereGlobal).sort((a, b) => b[1] - a[1]);

  return (
    <div>
      <AnnexeNav />
      <div className="container" style={{ maxWidth: 720 }}>
        <h1 className="page-title">Statistiques communes</h1>
        <p className="page-sub">Qui a créé quoi, pour s'organiser entre tuteurs.</p>

        <div className="settings-card">
          <h3>Par tuteur</h3>
          {parTuteur.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Aucun QCM créé pour l'instant.</p>}
          {parTuteur.map((t) => (
            <div key={t.pseudo} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <strong>{t.pseudo}</strong>
                <span className="status-pill status-done">{t.total} QCM</span>
              </div>
              {Object.entries(t.parMatiere).length > 0 && (
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>
                  {Object.entries(t.parMatiere).map(([nom, n]) => `${nom} (${n})`).join(' · ')}
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="settings-card">
          <h3>Par matière</h3>
          {matieresTriees.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Aucun QCM créé pour l'instant.</p>}
          <div className="detail-subject-list">
            {matieresTriees.map(([nom, n]) => (
              <div key={nom} className="detail-subject-row">
                <span className="ds-name">{nom}</span>
                <span className="ds-score">{n}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
          <div className="stat-box">
            <div className="stat-value">{qcms.length}</div>
            <div className="stat-label">QCM au total</div>
          </div>
          <div className="stat-box">
            <div className="stat-value">{qcms.filter((q) => q.type_qcm === 'concours_blanc').length}</div>
            <div className="stat-label">Concours blancs</div>
          </div>
        </div>
      </div>
    </div>
  );
}
