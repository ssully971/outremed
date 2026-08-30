import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

export default function FicheTuteur() {
  const { id } = useParams();
  const [monRole, setMonRole] = useState(null);
  const [tuteur, setTuteur] = useState(null);
  const [qcmsAjoutes, setQcmsAjoutes] = useState([]);
  const [validationsCeMois, setValidationsCeMois] = useState(0);
  const [matieres, setMatieres] = useState([]);
  const navigate = useNavigate();

  async function charger() {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) { navigate('/'); return; }
    const { data: moi } = await supabase.from('profiles').select('role').eq('id', session.session.user.id).single();
    if (moi?.role !== 'proprietaire') { navigate('/accueil'); return; }
    setMonRole(moi.role);

    const { data: t } = await supabase.from('profiles').select('*').eq('id', id).single();
    setTuteur(t);

    const { data: qcms } = await supabase.from('qcms').select('id, titre, matiere_id, created_at, verifie').eq('cree_par', id).eq('est_prive', false).order('created_at', { ascending: false });
    setQcmsAjoutes(qcms || []);

    const { data: mats } = await supabase.from('matieres').select('*');
    setMatieres(mats || []);

    const debutMois = new Date();
    debutMois.setDate(1);
    debutMois.setHours(0, 0, 0, 0);
    const { count } = await supabase
      .from('historique_qcm')
      .select('id', { count: 'exact', head: true })
      .eq('effectue_par', id)
      .eq('action', 'verification')
      .gte('created_at', debutMois.toISOString());
    setValidationsCeMois(count || 0);
  }

  useEffect(() => { charger(); }, [id]);

  if (!tuteur) return <div style={{ padding: 40 }}>Chargement...</div>;

  return (
    <div className="container" style={{ maxWidth: 700 }}>
      <Link to="/comptes" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textDecoration: 'none' }}>← Retour aux comptes</Link>

      <div className="profile-header" style={{ marginTop: 12 }}>
        <div className="avatar-big" style={{ background: 'var(--role-tuteur)' }}>{tuteur.pseudo.slice(0, 2).toUpperCase()}</div>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: '0 0 4px' }}>{tuteur.pseudo}</h2>
          <p style={{ margin: 0 }}>Tuteur</p>
        </div>
        <span className={`status-tag ${tuteur.compte_actif ? 'status-validated' : 'status-inactive'}`}>{tuteur.compte_actif ? 'Actif' : 'Désactivé'}</span>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <div className="stat-box">
          <div className="stat-value">{qcmsAjoutes.length}</div>
          <div className="stat-label">QCM ajoutés</div>
        </div>
        <div className="stat-box">
          <div className="stat-value" style={{ color: 'var(--success)' }}>{validationsCeMois}</div>
          <div className="stat-label">Validations ce mois-ci</div>
        </div>
      </div>

      <div className="section-title"><h2>QCM ajoutés</h2></div>
      {qcmsAjoutes.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Aucun QCM pour l'instant.</p>}
      <div className="qcm-row">
        {qcmsAjoutes.map((q) => {
          const infoMat = matieres.find((m) => m.id === q.matiere_id);
          return (
            <Link key={q.id} to={`/qcm/${q.id}/modifier`} className="qcm-card" style={{ '--card-color': infoMat?.couleur }}>
              {infoMat?.nom && <span className="subject-tag">{infoMat.nom}</span>}
              <h4>{q.titre}</h4>
              <div className="meta">
                <span>{new Date(q.created_at).toLocaleDateString('fr-FR')}</span>
                <span className={`status-pill ${q.verifie ? 'status-done' : 'status-new'}`}>{q.verifie ? 'Vérifié' : 'À vérifier'}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
