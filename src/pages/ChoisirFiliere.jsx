import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import SelecteurFiliere from '../components/SelecteurFiliere';

export default function ChoisirFiliere() {
  const [profilId, setProfilId] = useState(null);
  const [chargement, setChargement] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function charger() {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) { navigate('/'); return; }
      const { data: moi } = await supabase.from('profiles').select('id, role, modalite_id').eq('id', session.session.user.id).single();
      if (moi?.role !== 'etudiant') { navigate('/accueil'); return; }
      if (moi.modalite_id) { navigate('/accueil'); return; }
      setProfilId(moi.id);
      setChargement(false);
    }
    charger();
  }, [navigate]);

  if (chargement) return <div style={{ padding: 40 }}>Chargement...</div>;

  return (
    <div className="container" style={{ maxWidth: 640 }}>
      <h1 className="page-title">Bienvenue !</h1>
      <p className="page-sub">Avant de continuer, indique-nous ta filière — ce choix déterminera les matières et QCM auxquels tu as accès.</p>
      <div className="card">
        <SelecteurFiliere profileId={profilId} onApplique={() => navigate('/accueil')} />
      </div>
    </div>
  );
}
