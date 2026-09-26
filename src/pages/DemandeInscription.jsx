import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

function Logo({ theme, height = 32 }) {
  return (
    <img
      src={theme === 'dark' ? '/logo-dark.png' : '/logo-light.png'}
      alt="Outremed"
      style={{ height, width: 'auto', display: 'block' }}
    />
  );
}

export default function DemandeInscription() {
  const [theme] = useState(() => localStorage.getItem('outremed_theme_landing') || 'dark');
  const [email, setEmail] = useState('');
  const [pseudo, setPseudo] = useState('');
  const [nomComplet, setNomComplet] = useState('');
  const [siteWeb, setSiteWeb] = useState(''); // honeypot anti-spam, doit rester vide
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [envoye, setEnvoye] = useState(false);
  const [politiqueConfidentialite, setPolitiqueConfidentialite] = useState('');

  useEffect(() => {
    async function charger() {
      const { data } = await supabase.from('parametres').select('valeur').eq('cle', 'politique_confidentialite_url').single();
      setPolitiqueConfidentialite(data?.valeur || '');
    }
    charger();
  }, []);

  async function soumettre(e) {
    e.preventDefault();
    setErreur('');
    setEnvoi(true);

    let res, result;
    try {
      res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/demande-inscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ email, pseudo, nom_complet: nomComplet, site_web: siteWeb }),
      });
      result = await res.json().catch(() => ({}));
    } catch {
      setEnvoi(false);
      setErreur("Impossible de contacter le serveur. Vérifie ta connexion et réessaie.");
      return;
    }

    setEnvoi(false);
    if (!res.ok) { setErreur(result.error || 'Une erreur est survenue.'); return; }
    setEnvoye(true);
  }

  return (
    <div className="landing-page">
      <nav className="landing-navbar">
        <Link to="/" className="brand-lockup" style={{ textDecoration: 'none' }}>
          <Logo theme={theme} height={52} />
        </Link>
      </nav>

      <div className="login-card-wrap">
        <div className="card" style={{ width: '100%', maxWidth: 440, boxShadow: '0 25px 60px -20px rgba(0,0,0,0.4)' }}>
          <Link to="/" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.82rem', textDecoration: 'none', marginBottom: 18, display: 'inline-block' }}>← Retour</Link>

          {envoye ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>✅</div>
              <h2 style={{ margin: '0 0 8px' }}>Demande envoyée</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Un tuteur va vérifier ta demande. Tu recevras un email d'invitation à l'adresse
                indiquée une fois ton compte validé.
              </p>
              <Link to="/" className="btn btn-outline" style={{ textDecoration: 'none', display: 'inline-block', marginTop: 12 }}>Retour à l'accueil</Link>
            </div>
          ) : (
            <>
              <h2 style={{ margin: '0 0 4px', textAlign: 'center' }}>Demander un accès</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 26, textAlign: 'center' }}>
                Un tuteur vérifiera ta demande avant de t'envoyer une invitation par email.
              </p>

              <form onSubmit={soumettre}>
                <div className="field">
                  <label htmlFor="email">Adresse e-mail</label>
                  <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="field">
                  <label htmlFor="pseudo">Pseudo</label>
                  <input id="pseudo" value={pseudo} onChange={(e) => setPseudo(e.target.value)} placeholder="Ex : juliend." required />
                  <p className="field-hint">Format attendu : ton prénom suivi de la première lettre de ton nom, puis un point (ex : Julien Dupont → juliend.).</p>
                </div>
                <div className="field">
                  <label htmlFor="nomComplet">Nom complet</label>
                  <input id="nomComplet" value={nomComplet} onChange={(e) => setNomComplet(e.target.value)} required />
                  <p className="field-hint">Sert uniquement à la vérification manuelle par un tuteur.</p>
                </div>

                {/* Honeypot anti-spam : invisible pour un humain, souvent rempli par les bots */}
                <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}>
                  <label htmlFor="siteWeb">Site web</label>
                  <input id="siteWeb" name="siteWeb" tabIndex={-1} autoComplete="off" value={siteWeb} onChange={(e) => setSiteWeb(e.target.value)} />
                </div>

                {erreur && <div className="error-msg">{erreur}</div>}

                <button className="btn btn-primary" style={{ width: '100%' }} type="submit" disabled={envoi}>
                  {envoi ? 'Envoi...' : 'Envoyer ma demande →'}
                </button>
              </form>
            </>
          )}
        </div>

        {politiqueConfidentialite && (
          <p style={{ textAlign: 'center', marginTop: 20, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <a href={politiqueConfidentialite} target="_blank" rel="noreferrer" style={{ color: 'var(--text-muted)' }}>Politique de confidentialité</a>
          </p>
        )}
      </div>
    </div>
  );
}
