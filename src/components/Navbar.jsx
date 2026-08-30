import { useEffect, useState, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import NotificationBell from './NotificationBell';

export default function Navbar() {
  const [profil, setProfil] = useState(null);
  const [menuAdminOuvert, setMenuAdminOuvert] = useState(false);
  const [menuProfilOuvert, setMenuProfilOuvert] = useState(false);
  const [menuMobileOuvert, setMenuMobileOuvert] = useState(false);
  const [forumActif, setForumActif] = useState(true);
  const [planningActif, setPlanningActif] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const refAdmin = useRef(null);
  const refProfil = useRef(null);

  useEffect(() => {
    async function charger() {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) return;
      const { data } = await supabase.from('profiles').select('*').eq('id', session.session.user.id).single();

      const jetonLocal = localStorage.getItem('outremed_session_token');
      if (jetonLocal && data?.session_courante && jetonLocal !== data.session_courante) {
        await supabase.auth.signOut();
        localStorage.removeItem('outremed_session_token');
        alert('Tu as été déconnecté car ton compte a été utilisé sur un autre appareil.');
        navigate('/');
        return;
      }

      setProfil(data);

      if (data) {
        document.documentElement.setAttribute('data-theme', data.theme_pref || 'dark');
        const accent = data.accent_pref || '#FF3EB5';
        document.documentElement.style.setProperty('--accent', accent);
        document.documentElement.style.setProperty('--accent-glow', accent + '33');
        document.documentElement.style.setProperty('--accent-soft', accent + '14');
      }

      const { data: paramF } = await supabase.from('parametres').select('valeur').eq('cle', 'forum_actif').single();
      setForumActif(paramF?.valeur !== 'false');
      const { data: paramP } = await supabase.from('parametres').select('valeur').eq('cle', 'planning_actif').single();
      setPlanningActif(paramP?.valeur !== 'false');
    }
    charger();
    setMenuAdminOuvert(false);
    setMenuProfilOuvert(false);
    setMenuMobileOuvert(false);
  }, [location.pathname]);

  useEffect(() => {
    function fermerSiExterieur(e) {
      if (refAdmin.current && !refAdmin.current.contains(e.target)) setMenuAdminOuvert(false);
      if (refProfil.current && !refProfil.current.contains(e.target)) setMenuProfilOuvert(false);
    }
    document.addEventListener('mousedown', fermerSiExterieur);
    return () => document.removeEventListener('mousedown', fermerSiExterieur);
  }, []);

  async function seDeconnecter() {
    localStorage.removeItem('outremed_session_token');
    await supabase.auth.signOut();
    navigate('/');
  }

  if (!profil) return null;

  const estAdmin = profil.role === 'tuteur' || profil.role === 'proprietaire';
  const initiales = profil.pseudo.slice(0, 2).toUpperCase();

  function lienClasse(path) {
    return location.pathname === path ? 'active' : '';
  }

  return (
    <nav className="navbar">
      <div
        className="logo"
        style={{ cursor: profil.role === 'proprietaire' ? 'pointer' : 'default', display: 'flex', alignItems: 'center' }}
        onDoubleClick={() => { if (profil.role === 'proprietaire') navigate('/espace-perso'); }}
      >
        <img
          src={(profil.theme_pref || 'dark') === 'dark' ? '/logo-dark.png' : '/logo-light.png'}
          alt="Outremed"
          style={{ height: 52, width: 'auto', display: 'block' }}
        />
      </div>

      <div className="nav-links">
        <Link to="/accueil" className={lienClasse('/accueil')}>Accueil</Link>

        {!estAdmin && (
          <>
            <Link to="/qcm" className={lienClasse('/qcm')}>QCM</Link>
            <Link to="/resultats" className={lienClasse('/resultats')}>Résultats</Link>
            <Link to="/carnet-erreurs" className={lienClasse('/carnet-erreurs')}>Carnet</Link>
            <Link to="/mes-stats" className={lienClasse('/mes-stats')}>Mes stats</Link>
          </>
        )}

        <Link to="/classement" className={lienClasse('/classement')}>Classement</Link>
        {(forumActif || profil.role === 'proprietaire') && <Link to="/forum" className={lienClasse('/forum')}>Forum{!forumActif && ' 🔒'}</Link>}
        {(planningActif || profil.role === 'proprietaire') && <Link to="/planning" className={lienClasse('/planning')}>Planning{!planningActif && ' 🔒'}</Link>}

        {estAdmin && (
          <div ref={refAdmin} style={{ position: 'relative' }}>
            <button
              onClick={() => setMenuAdminOuvert((v) => !v)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: menuAdminOuvert ? 'var(--accent)' : 'var(--text-muted)',
                fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              Gérer <span style={{ fontSize: '0.7rem' }}>{menuAdminOuvert ? '▲' : '▼'}</span>
            </button>

            {menuAdminOuvert && (
              <div className="dropdown-menu" style={{ top: '130%', left: 0, minWidth: 200 }}>
                <Link to="/qcm/gerer" className="dropdown-item">Gérer les QCM</Link>
                <Link to="/statistiques" className="dropdown-item">Statistiques</Link>
                <Link to="/comptes" className="dropdown-item">Comptes</Link>
                <Link to="/historiques" className="dropdown-item">Historique</Link>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="nav-right">
        <NotificationBell />
        <button className="hamburger-btn" onClick={() => setMenuMobileOuvert(true)}>☰</button>
        <div ref={refProfil} style={{ position: 'relative' }}>
          <button className="avatar" onClick={() => setMenuProfilOuvert((v) => !v)} style={{ border: 'none' }}>
            {initiales}
          </button>

          {menuProfilOuvert && (
            <div className="dropdown-menu" style={{ top: '130%', right: 0, minWidth: 190 }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{profil.pseudo}</div>
                <span className="role-badge">{profil.role}</span>
              </div>
              <Link to="/profil" className="dropdown-item">Mon profil</Link>
              <button onClick={seDeconnecter} className="dropdown-item" style={{ color: 'var(--error)' }}>
                Déconnexion
              </button>
            </div>
          )}
        </div>
      </div>

      {menuMobileOuvert && (
        <>
          <div className="mobile-nav-overlay" onClick={() => setMenuMobileOuvert(false)} />
          <div className="mobile-nav-panel">
            <div className="mnp-head">
              <strong>Menu</strong>
              <button onClick={() => setMenuMobileOuvert(false)} style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>

            <Link to="/accueil" className={lienClasse('/accueil')}>Accueil</Link>

            {!estAdmin && (
              <>
                <Link to="/qcm" className={lienClasse('/qcm')}>QCM</Link>
                <Link to="/resultats" className={lienClasse('/resultats')}>Résultats</Link>
                <Link to="/carnet-erreurs" className={lienClasse('/carnet-erreurs')}>Carnet</Link>
                <Link to="/mes-stats" className={lienClasse('/mes-stats')}>Mes stats</Link>
              </>
            )}

            <Link to="/classement" className={lienClasse('/classement')}>Classement</Link>
            {(forumActif || profil.role === 'proprietaire') && <Link to="/forum" className={lienClasse('/forum')}>Forum{!forumActif && ' 🔒'}</Link>}
            {(planningActif || profil.role === 'proprietaire') && <Link to="/planning" className={lienClasse('/planning')}>Planning{!planningActif && ' 🔒'}</Link>}

            {estAdmin && (
              <>
                <div className="mnp-section-label">Gérer</div>
                <Link to="/qcm/gerer" className={lienClasse('/qcm/gerer')}>Gérer les QCM</Link>
                <Link to="/statistiques" className={lienClasse('/statistiques')}>Statistiques</Link>
                <Link to="/comptes" className={lienClasse('/comptes')}>Comptes</Link>
                <Link to="/historiques" className={lienClasse('/historiques')}>Historique</Link>
              </>
            )}

            <div className="mnp-section-label">Compte</div>
            <Link to="/profil" className={lienClasse('/profil')}>Mon profil ({profil.pseudo})</Link>
            <button onClick={seDeconnecter} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '14px 20px', background: 'none', border: 'none', color: 'var(--error)', fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer' }}>
              Déconnexion
            </button>
          </div>
        </>
      )}
    </nav>
  );
}
