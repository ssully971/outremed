import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

export default function DefinirMotDePasse() {
  const [motDePasse, setMotDePasse] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const theme = localStorage.getItem('outremed_theme_landing') || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  }, []);

  async function valider(e) {
    e.preventDefault();
    setErreur('');

    if (motDePasse.length < 8) {
      setErreur('Le mot de passe doit faire au moins 8 caractères.');
      return;
    }
    if (motDePasse !== confirmation) {
      setErreur('Les deux mots de passe ne correspondent pas.');
      return;
    }

    setChargement(true);
    // Supabase a déjà créé une session temporaire à partir du lien cliqué (présent dans l'URL)
    const { error } = await supabase.auth.updateUser({ password: motDePasse });
    setChargement(false);

    if (error) {
      setErreur("Le lien a peut-être expiré. Demande à ton tuteur de t'en renvoyer un.");
      return;
    }

    const { data: session } = await supabase.auth.getSession();
    const jeton = crypto.randomUUID();
    localStorage.setItem('outremed_session_token', jeton);
    await supabase.from('profiles').update({ session_courante: jeton, mot_de_passe_defini: true }).eq('id', session.session.user.id);

    navigate('/accueil');
  }

  return (
    <div className="landing-page">
      <div className="login-card-wrap" style={{ minHeight: '100vh' }}>
        <div className="card" style={{ width: '100%', maxWidth: 400 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
            <img
              src={(localStorage.getItem('outremed_theme_landing') || 'dark') === 'dark' ? '/logo-dark.png' : '/logo-light.png'}
              alt="Outremed"
              style={{ height: 60, width: 'auto' }}
            />
          </div>
          <h2 style={{ margin: '0 0 4px', textAlign: 'center' }}>Bienvenue sur Outremed</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 24, textAlign: 'center' }}>
            Choisis ton mot de passe pour activer ton compte.
          </p>

          <form onSubmit={valider}>
            <div className="field">
              <label>Mot de passe</label>
              <input type="password" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} required />
            </div>
            <div className="field">
              <label>Confirme ton mot de passe</label>
              <input type="password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} required />
            </div>

            {erreur && <div className="error-msg">{erreur}</div>}

            <button className="btn btn-primary" style={{ width: '100%' }} type="submit" disabled={chargement}>
              {chargement ? 'Activation...' : 'Activer mon compte →'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
