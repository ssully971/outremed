import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

const LABELS_ACTION_COMPTE = {
  creation_etudiant: 'Création de compte étudiant',
  creation_tuteur: 'Création de compte tuteur',
  activation_abonnement: 'Activation d\'abonnement',
  desactivation_abonnement: 'Désactivation d\'abonnement',
  changement_pseudo: 'Changement de pseudo',
  suppression_definitive: 'Suppression définitive de compte',
  desactivation_tuteur: 'Désactivation de tuteur',
  reactivation_tuteur: 'Réactivation de tuteur',
};

const LABELS_ACTION_QCM = {
  creation: 'Création',
  modification: 'Modification',
  verification: 'Vérification',
};

export default function Historiques() {
  const [monRole, setMonRole] = useState(null);
  const [vue, setVue] = useState('qcm');
  const [profilsMap, setProfilsMap] = useState({});
  const [qcmsMap, setQcmsMap] = useState({});
  const [lignes, setLignes] = useState([]);
  const [recherche, setRecherche] = useState('');
  const [filtreAction, setFiltreAction] = useState('tous');
  const [voirArchivees, setVoirArchivees] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    async function charger() {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) { navigate('/'); return; }

      const { data: moi } = await supabase.from('profiles').select('role').eq('id', session.session.user.id).single();
      if (moi?.role !== 'tuteur' && moi?.role !== 'proprietaire') { navigate('/accueil'); return; }
      setMonRole(moi?.role);
      if (moi?.role === 'proprietaire') setVue('comptes'); else setVue('qcm');

      const { data: profils } = await supabase.from('profiles').select('id, pseudo');
      const map = {};
      (profils || []).forEach((p) => { map[p.id] = p.pseudo; });
      setProfilsMap(map);

      const { data: qcms } = await supabase.from('qcms').select('id, titre');
      const qmap = {};
      (qcms || []).forEach((q) => { qmap[q.id] = q.titre; });
      setQcmsMap(qmap);
    }
    charger();
  }, []);

  useEffect(() => {
    async function chargerLignes() {
      if (vue === 'comptes') {
        const { data } = await supabase.from('historique_comptes').select('*').order('created_at', { ascending: false });
        setLignes(data || []);
      } else {
        const { data } = await supabase.from('historique_qcm').select('*').order('created_at', { ascending: false });
        setLignes(data || []);
      }
    }
    if (monRole) chargerLignes();
  }, [vue, monRole]);

  async function basculerArchive(ligne) {
    const table = vue === 'comptes' ? 'historique_comptes' : 'historique_qcm';
    await supabase.from(table).update({ archive: !ligne.archive }).eq('id', ligne.id);
    setLignes((prev) => prev.map((l) => l.id === ligne.id ? { ...l, archive: !l.archive } : l));
  }

  async function purgerMaintenant() {
    if (!confirm("Supprimer définitivement toutes les entrées non archivées de plus de 3 mois (comptes ET QCM) ? Pense à exporter avant si besoin.")) return;
    const { error } = await supabase.rpc('purger_historique_ancien');
    if (error) { alert('Erreur : ' + error.message); return; }
    alert('Purge effectuée.');
    setVue((v) => v); // force un rechargement
    const table = vue === 'comptes' ? 'historique_comptes' : 'historique_qcm';
    const { data } = await supabase.from(table).select('*').order('created_at', { ascending: false });
    setLignes(data || []);
  }

  function exporter() {
    let texte = `=== HISTORIQUE ${vue === 'comptes' ? 'DES COMPTES' : 'DES QCM'} ===\n\n`;
    lignesAffichees.forEach((l) => {
      const label = vue === 'comptes' ? (LABELS_ACTION_COMPTE[l.action] || l.action) : (LABELS_ACTION_QCM[l.action] || l.action);
      texte += `[${new Date(l.created_at).toLocaleString('fr-FR')}] ${label}\n`;
      if (vue === 'comptes') {
        texte += `  Cible : ${profilsMap[l.cible_id] || '—'} · Par : ${profilsMap[l.effectue_par] || '—'}\n`;
      } else {
        texte += `  QCM : ${qcmsMap[l.qcm_id] || 'supprimé'} · Par : ${profilsMap[l.effectue_par] || '—'}\n`;
      }
      if (l.details) texte += `  Détail : ${l.details}\n`;
      texte += '\n';
    });

    const blob = new Blob([texte], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `historique-${vue}-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!monRole) return <div style={{ padding: 40 }}>Chargement...</div>;

  const labels = vue === 'comptes' ? LABELS_ACTION_COMPTE : LABELS_ACTION_QCM;
  const actionsDisponibles = [...new Set(lignes.map((l) => l.action))];

  const lignesAffichees = lignes.filter((l) => {
    if (!voirArchivees && l.archive) return false;
    if (filtreAction !== 'tous' && l.action !== filtreAction) return false;
    if (recherche.trim()) {
      const texte = recherche.trim().toLowerCase();
      const nomCible = vue === 'comptes' ? (profilsMap[l.cible_id] || '') : (qcmsMap[l.qcm_id] || '');
      const nomAuteur = profilsMap[l.effectue_par] || '';
      if (!nomCible.toLowerCase().includes(texte) && !nomAuteur.toLowerCase().includes(texte) && !(l.details || '').toLowerCase().includes(texte)) return false;
    }
    return true;
  });

  return (
    <div className="container" style={{ maxWidth: 700 }}>
      <div className="page-top-row">
        <div>
          <h1 className="page-title">Historique</h1>
          <p className="page-sub">Toutes les actions tracées, comptes et QCM.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline btn-sm" onClick={exporter}>📋 Exporter</button>
          {monRole === 'proprietaire' && (
            <button className="btn btn-danger-outline btn-sm" onClick={purgerMaintenant}>Purger maintenant</button>
          )}
        </div>
      </div>

      {monRole === 'proprietaire' && (
        <div className="category-tabs">
          <button className={`cat-tab ${vue === 'comptes' ? 'active' : ''}`} onClick={() => { setVue('comptes'); setFiltreAction('tous'); setRecherche(''); }}>Comptes</button>
          <button className={`cat-tab ${vue === 'qcm' ? 'active' : ''}`} onClick={() => { setVue('qcm'); setFiltreAction('tous'); setRecherche(''); }}>QCM</button>
        </div>
      )}

      <div className="search-bar"><input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher un pseudo, un QCM, un détail..." /></div>

      <div className="toolbar">
        <select className="select-filter" value={filtreAction} onChange={(e) => setFiltreAction(e.target.value)}>
          <option value="tous">Toutes les actions</option>
          {actionsDisponibles.map((a) => <option key={a} value={a}>{labels[a] || a}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          <input type="checkbox" checked={voirArchivees} onChange={(e) => setVoirArchivees(e.target.checked)} style={{ width: 'auto' }} />
          Voir aussi les archivées
        </label>
      </div>

      {lignesAffichees.length === 0 && <p style={{ color: 'var(--text-muted)', marginTop: 16 }}>Rien pour l'instant.</p>}

      <div className="timeline">
        {vue === 'comptes' && lignesAffichees.map((l) => (
          <div key={l.id} className={`timeline-item ${l.archive ? 'archived' : ''}`}>
            <div className="timeline-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div>
                  <div className="tl-action">{LABELS_ACTION_COMPTE[l.action] || l.action} {l.archive && '📦'}</div>
                  <div className="tl-meta">{profilsMap[l.cible_id] || '—'} · par {profilsMap[l.effectue_par] || '—'} · {new Date(l.created_at).toLocaleString('fr-FR')}</div>
                  {l.details && <div className="tl-detail">{l.details}</div>}
                </div>
                {monRole === 'proprietaire' && (
                  <button className="btn btn-ghost btn-sm" onClick={() => basculerArchive(l)}>{l.archive ? 'Désarchiver' : 'Archiver'}</button>
                )}
              </div>
            </div>
          </div>
        ))}

        {vue === 'qcm' && lignesAffichees.map((l) => (
          <div key={l.id} className={`timeline-item ${l.archive ? 'archived' : ''}`}>
            <div className="timeline-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div>
                  <div className="tl-action">{LABELS_ACTION_QCM[l.action] || l.action} — {qcmsMap[l.qcm_id] || 'QCM supprimé'} {l.archive && '📦'}</div>
                  <div className="tl-meta">par {profilsMap[l.effectue_par] || '—'} · {new Date(l.created_at).toLocaleString('fr-FR')}</div>
                  {l.details && <div className="tl-detail">{l.details}</div>}
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => basculerArchive(l)}>{l.archive ? 'Désarchiver' : 'Archiver'}</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
