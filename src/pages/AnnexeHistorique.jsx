import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import AnnexeNav from '../components/AnnexeNav';

const LIBELLE_ACTION = { creation: '✨ Création', modification: '✏️ Modification', suppression: '🗑 Suppression' };

export default function AnnexeHistorique() {
  const [chargement, setChargement] = useState(true);
  const [entrees, setEntrees] = useState([]);
  const [profilsMap, setProfilsMap] = useState({});
  const navigate = useNavigate();

  useEffect(() => {
    async function charger() {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) { navigate('/'); return; }
      const { data: moi } = await supabase.from('profiles').select('role').eq('id', session.session.user.id).single();
      if (moi?.role !== 'tuteur' && moi?.role !== 'proprietaire') { navigate('/accueil'); return; }

      const { data } = await supabase.from('annexe_historique_qcm').select('*').order('created_at', { ascending: false }).limit(200);
      const { data: profils } = await supabase.from('profiles').select('id, pseudo');
      const map = {};
      (profils || []).forEach((p) => { map[p.id] = p.pseudo; });

      setEntrees(data || []);
      setProfilsMap(map);
      setChargement(false);
    }
    charger();
  }, []);

  if (chargement) return null;

  return (
    <div>
      <AnnexeNav />
      <div className="container" style={{ maxWidth: 700 }}>
        <h1 className="page-title">Historique</h1>
        <p className="page-sub">Créations, modifications et suppressions de QCM dans l'espace tuteurs.</p>

        {entrees.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Rien pour l'instant.</p>}

        <div className="settings-card">
          {entrees.map((e) => (
            <div key={e.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{LIBELLE_ACTION[e.action] || e.action}</span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{new Date(e.created_at).toLocaleString('fr-FR')}</span>
              </div>
              <div style={{ fontSize: '0.85rem', marginTop: 4 }}>{e.details}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>Par {profilsMap[e.effectue_par] || '—'}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
