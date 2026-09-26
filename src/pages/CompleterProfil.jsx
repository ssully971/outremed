import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

export default function CompleterProfil() {
  const [profilId, setProfilId] = useState(null);
  const [nomComplet, setNomComplet] = useState('');
  const [chargement, setChargement] = useState(true);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    async function charger() {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) { navigate('/'); return; }
      const { data: moi } = await supabase.from('profiles').select('id, role, nom_complet').eq('id', session.session.user.id).single();
      if (moi?.role !== 'etudiant') { navigate('/accueil'); return; }
      if (moi.nom_complet) { navigate('/accueil'); return; }
      setProfilId(moi.id);
      setChargement(false);
    }
    charger();
  }, [navigate]);

  async function confirmer(e) {
    e.preventDefault();
    if (!nomComplet.trim()) return;
    setEnCours(true);
    setErreur('');
    const { error } = await supabase.from('profiles').update({ nom_complet: nomComplet.trim() }).eq('id', profilId);
    setEnCours(false);
    if (error) { setErreur(error.message); return; }
    navigate('/accueil');
  }

  if (chargement) return <div style={{ padding: 40 }}>Chargement...</div>;

  return (
    <div className="container" style={{ maxWidth: 480 }}>
      <h1 className="page-title">Une dernière chose</h1>
      <p className="page-sub">Indique ton nom complet pour que tes tuteurs puissent t'identifier facilement.</p>
      <div className="card">
        <form onSubmit={confirmer}>
          <div className="field">
            <label>Nom complet</label>
            <input value={nomComplet} onChange={(e) => setNomComplet(e.target.value)} placeholder="Prénom Nom" autoFocus required />
          </div>
          {erreur && <div className="error-msg">{erreur}</div>}
          <button className="btn btn-primary" style={{ width: '100%' }} type="submit" disabled={enCours || !nomComplet.trim()}>
            {enCours ? 'Enregistrement...' : 'Continuer →'}
          </button>
        </form>
      </div>
    </div>
  );
}
