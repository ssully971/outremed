import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

export default function Login() {
  const [vue, setVue] = useState('landing'); // 'landing' | 'connexion'
  const [theme, setTheme] = useState(() => localStorage.getItem('outremed_theme_landing') || 'dark');
  const [whatsapp, setWhatsapp] = useState('');
  const [instagram, setInstagram] = useState('');

  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const [messageReset, setMessageReset] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('outremed_theme_landing', theme);
  }, [theme]);

  useEffect(() => {
    async function charger() {
      const { data } = await supabase.from('parametres').select('cle, valeur').in('cle', ['whatsapp_contact', 'instagram_url']);
      (data || []).forEach((row) => {
        if (row.cle === 'whatsapp_contact') setWhatsapp(row.valeur || '');
        if (row.cle === 'instagram_url') setInstagram(row.valeur || '');
      });
    }
    charger();
  }, []);

  async function motDePasseOublie() {
    if (!email) { setErreur('Entre ton adresse mail ci-dessus, puis clique sur "Mot de passe oublié".'); return; }
    setMessageReset('');
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: 'http://localhost:5173/definir-mot-de-passe' });
    if (error) { setErreur(error.message); return; }
    setMessageReset('Un lien de réinitialisation a été envoyé à ton adresse mail.');
  }

  async function seConnecter(e) {
    e.preventDefault();
    setErreur('');
    setChargement(true);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password: motDePasse });
    if (error) { setErreur('Email ou mot de passe incorrect.'); setChargement(false); return; }

    const { data: profil } = await supabase.from('profiles').select('*').eq('id', data.user.id).single();

    if (!profil || !profil.compte_actif || profil.statut_compte === 'suspendu') {
      await supabase.auth.signOut();
      setErreur('Ton compte est désactivé ou suspendu. Contacte ton tuteur.');
      setChargement(false);
      return;
    }

    if (profil.statut_compte === 'essai_gratuit' && new Date(profil.essai_fin) < new Date()) {
      await supabase.auth.signOut();
      setErreur("Ton essai gratuit est terminé. Contacte-nous pour activer ton compte.");
      setChargement(false);
      return;
    }

    const jeton = crypto.randomUUID();
    localStorage.setItem('outremed_session_token', jeton);
    await supabase.from('profiles').update({ session_courante: jeton }).eq('id', data.user.id);

    navigate('/accueil');
  }

  function basculerTheme() {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }

  return (
    <div className="landing-page">
      <nav className="landing-navbar">
        <div className="brand-lockup" style={{ cursor: 'pointer' }} onClick={() => setVue('landing')}>
          <Logo theme={theme} height={52} />
        </div>

        <div className="landing-nav-right">
          {theme === 'dark' && vue === 'landing' && (
            <div className="theme-callout">
              <span className="callout-text">essaie notre mode clair ;)</span>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12 L17 12" />
                <path d="M12 6 L18 12 L12 18" />
              </svg>
            </div>
          )}

          <button className="theme-switch-btn" onClick={basculerTheme}>
            <span className="ts-label">{theme === 'dark' ? 'Mode sombre' : 'Mode clair'}</span>
            <div className="ts-track"><div className="ts-knob">{theme === 'dark' ? '🌙' : '☀️'}</div></div>
          </button>

          {vue === 'landing' && (
            <>
              <button className="btn btn-outline" onClick={() => setVue('connexion')}>Se connecter</button>
              {instagram && (
                <a href={instagram} target="_blank" rel="noreferrer" className="btn btn-insta">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" /></svg>
                  Instagram
                </a>
              )}
            </>
          )}
        </div>
      </nav>

      {vue === 'connexion' ? (
        <div className="login-card-wrap">
          <div className="card" style={{ width: '100%', maxWidth: 400, boxShadow: '0 25px 60px -20px rgba(0,0,0,0.4)' }}>
            <button onClick={() => setVue('landing')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.82rem', cursor: 'pointer', marginBottom: 18, padding: 0 }}>← Retour</button>

            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
              <Logo theme={theme} height={56} />
            </div>

            <h2 style={{ margin: '0 0 4px', textAlign: 'center' }}>Content de te revoir</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 26, textAlign: 'center' }}>
              Connecte-toi pour accéder à tes QCM.
            </p>

            <form onSubmit={seConnecter}>
              <div className="field">
                <label htmlFor="email">Adresse e-mail</label>
                <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="motdepasse">Mot de passe</label>
                <input id="motdepasse" type="password" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} required />
              </div>

              {erreur && <div className="error-msg">{erreur}</div>}
              {messageReset && <div className="error-msg" style={{ color: 'var(--success)' }}>{messageReset}</div>}

              <button className="btn btn-primary" style={{ width: '100%' }} type="submit" disabled={chargement}>
                {chargement ? 'Connexion...' : 'Se connecter →'}
              </button>
            </form>

            <button onClick={motDePasseOublie} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: 16, cursor: 'pointer', textDecoration: 'underline', padding: 0, display: 'block', margin: '16px auto 0' }}>
              Mot de passe oublié ?
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="hero">
            <div className="hero-icon-wrap"><Logo theme={theme} height={220} /></div>
            <h1>La révision MMOPK,<br /><span className="accent-word">pensée pour l'outre-mer.</span></h1>
            <p className="sub">🌺 Outremed accompagne les étudiants de 1re année sans accès à une prépa privée : kholles hebdomadaires, annales, concours blancs et suivi personnalisé. 🩺</p>

            {whatsapp && <p className="hero-trial-note">📩 <strong>Contacte-nous</strong> pour bénéficier d'un essai gratuit et découvrir la plateforme.</p>}

            <div className="hero-actions">
              <button className="btn btn-primary" onClick={() => setVue('connexion')}>Se connecter</button>
              {whatsapp && <a href={whatsapp} target="_blank" rel="noreferrer" className="btn btn-outline">Nous contacter 📞</a>}
            </div>

            <div className="hero-tagline">Médecine <span className="dot-sep">•</span> Tutorat <span className="dot-sep">•</span> Outre-mer</div>
          </div>

          <div className="preview-section">
            <div className="preview-grid">
              <div className="preview-card">
                <h3>Accueil étudiant</h3>
                <p>Progression, derniers QCM, kholle en cours</p>
                <div className="mini-subject"><span><span className="dot" style={{ background: '#ec4899' }} />Histologie</span><span className="mini-badge badge-progress">En cours</span></div>
                <div className="mini-subject"><span><span className="dot" style={{ background: '#38bdf8' }} />Biochimie</span><span className="mini-badge badge-done">17/20</span></div>
                <div className="mini-subject"><span><span className="dot" style={{ background: '#a78bfa' }} />Kholle du 30/08</span><span className="mini-badge badge-new">Nouveau</span></div>
              </div>

              <div className="preview-card">
                <h3>Résultats & progression</h3>
                <p>Historique de tentatives et meilleurs scores</p>
                <div className="mini-stats-row">
                  <div className="mini-stat"><div className="val">86%</div><div className="lbl">Moy. générale</div></div>
                  <div className="mini-stat"><div className="val">42</div><div className="lbl">QCM faits</div></div>
                  <div className="mini-stat"><div className="val">#5</div><div className="lbl">Classement</div></div>
                </div>
                <div className="mini-subject"><span><span className="dot" style={{ background: '#22c55e' }} />Physiologie</span><span className="mini-badge badge-done">92%</span></div>
              </div>

              <div className="preview-card">
                <h3>Classement kholles</h3>
                <p>Comparatif hebdomadaire entre étudiants</p>
                <div className="mini-rank"><span className="pos">1</span>Camille R. — 19,5/20</div>
                <div className="mini-rank"><span className="pos silver">2</span>Lucas M. — 18/20</div>
                <div className="mini-rank"><span className="pos bronze">3</span>Toi — 17,5/20</div>
              </div>
            </div>
            <p className="preview-disclaimer">Aperçu illustratif — données fictives à titre d'exemple.</p>
          </div>

          <div className="hiw-section">
            <div className="hiw-title">
              <h2>Comment ça marche</h2>
              <p>Trois étapes simples pour rejoindre le suivi et commencer à réviser.</p>
            </div>

            <div className="hiw-steps">
              <div className="hiw-step">
                <div className="hiw-num">1</div>
                <div className="hiw-emoji">🎓</div>
                <h3>Rejoins-nous</h3>
                <p>Intègre notre groupe {whatsapp ? <a href={whatsapp} target="_blank" rel="noreferrer" className="hiw-link">WhatsApp</a> : 'WhatsApp'} pour être ajouté à la plateforme et suivre les annonces.</p>
              </div>
              <div className="hiw-arrow">→</div>
              <div className="hiw-step">
                <div className="hiw-num">2</div>
                <div className="hiw-emoji">📚</div>
                <h3>Révise</h3>
                <p>Accède aux QCM par matière et participe aux kholles hebdomadaires pour t'entraîner en conditions réelles.</p>
              </div>
              <div className="hiw-arrow">→</div>
              <div className="hiw-step">
                <div className="hiw-num">3</div>
                <div className="hiw-emoji">📈</div>
                <h3>Progresse</h3>
                <p>Suis ton classement et ta progression pour identifier tes points faibles et t'améliorer semaine après semaine.</p>
              </div>
            </div>
          </div>

          <div className="mission-section">
            <div className="mission-card">
              <h2>Pourquoi Outremed</h2>
              <p className="mission-intro">Beaucoup d'étudiants en médecine d'outre-mer n'ont pas accès aux prépas privées. Outremed a été créé pour combler ce manque avec un accompagnement structuré et une plateforme adaptée à l'apprentissage en première année des filières MMOPK.</p>

              <div className="fact-grid">
                <div className="fact-item"><span className="fact-emoji">🌴</span><div><h4>Pensé pour l'outre-mer</h4><p>Conçu spécifiquement pour les étudiants qui n'ont pas de prépa privée.</p></div></div>
                <div className="fact-item"><span className="fact-emoji">✅</span><div><h4>Contenu vérifié</h4><p>QCM et kholles créés et validés par des tuteurs à votre disposition.</p></div></div>
                <div className="fact-item"><span className="fact-emoji">🗓️</span><div><h4>Un rythme hebdomadaire</h4><p>Des kholles chaque semaine pour garder une progression régulière tout au long de l'année.</p></div></div>
                <div className="fact-item"><span className="fact-emoji">🩺</span><div><h4>Adapté au programme MMOPK</h4><p>Un contenu pensé pour coller précisément au programme de première année des filières MMOPK.</p></div></div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
