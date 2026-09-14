import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
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
  const [classementActif, setClassementActif] = useState(true);
  const [mesStatsActif, setMesStatsActif] = useState(true);
  const [modeSite, setModeSite] = useState('normal');
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
        const accentParDefaut = (data.theme_pref || 'dark') === 'dark' ? '#FF3EB5' : '#21323C';
        const accent = data.accent_pref || accentParDefaut;
        document.documentElement.style.setProperty('--accent', accent);
        document.documentElement.style.setProperty('--accent-glow', accent + '33');
        document.documentElement.style.setProperty('--accent-soft', accent + '14');
      }

      const { data: params } = await supabase.from('parametres').select('cle, valeur').in('cle', [
        'forum_actif', 'planning_actif', 'classement_actif', 'mes_stats_actif', 'mode_site',
      ]);
      const map = {};
      (params || []).forEach((p) => { map[p.cle] = p.valeur; });
      setForumActif(map.forum_actif !== 'false');
      setPlanningActif(map.planning_actif !== 'false');
      setClassementActif(map.classement_actif !== 'false');
      setMesStatsActif(map.mes_stats_actif !== 'false');
      setModeSite(map.mode_site || 'normal');
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
  const estProprietaire = profil.role === 'proprietaire';
  const modeAnnale = modeSite === 'annale';
  const estEtudiantAnnale = profil.role === 'etudiant' && profil.categorie_compte === 'annale';
  const estTuteurRestreint = profil.role === 'tuteur' && modeAnnale;
  const initiales = profil.pseudo.slice(0, 2).toUpperCase();

  // En mode annale, un tuteur ou un étudiant-annale ne doit pas voir Classement/Forum/Planning
  const voirPagesEtendues = !estEtudiantAnnale && !estTuteurRestreint;

  function lienClasse(path) {
    return location.pathname === path ? 'active' : '';
  }

  const contenuLiensPrincipaux = (
    <>
      <Link to="/accueil" className={lienClasse('/accueil')}>Accueil</Link>

      {!estAdmin && (
        <>
          <Link to="/qcm" className={lienClasse('/qcm')}>QCM</Link>
          {!estEtudiantAnnale && (
            <>
              <Link to="/resultats" className={lienClasse('/resultats')}>Résultats</Link>
              {(mesStatsActif || estProprietaire) && <Link to="/mes-stats" className={lienClasse('/mes-stats')}>Mes stats{!mesStatsActif && ' 🔒'}</Link>}
            </>
          )}
        </>
      )}

      {voirPagesEtendues && (classementActif || estProprietaire) && <Link to="/classement" className={lienClasse('/classement')}>Classement{!classementActif && ' 🔒'}</Link>}
      {voirPagesEtendues && (forumActif || estProprietaire) && <Link to="/forum" className={lienClasse('/forum')}>Forum{!forumActif && ' 🔒'}</Link>}
      {voirPagesEtendues && (planningActif || estProprietaire) && <Link to="/planning" className={lienClasse('/planning')}>Planning{!planningActif && ' 🔒'}</Link>}
    </>
  );

  return (
    <nav className="navbar">
      <div className="logo" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <img
          src={(profil.theme_pref || 'dark') === 'dark' ? '/logo-dark.png' : '/logo-light.png'}
          alt="Outremed"
          style={{ height: 52, width: 'auto', display: 'block' }}
        />
        {modeAnnale && estProprietaire && (
          <Link to="/profil" className="mode-annale-badge" onClick={(e) => e.stopPropagation()}>🎓 Mode Annale actif</Link>
        )}
      </div>

      <div className="nav-links">
        {contenuLiensPrincipaux}

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
                <span className="role-badge">{profil.role}{estEtudiantAnnale && ' (annale)'}</span>
              </div>
              <Link to="/profil" className="dropdown-item">Mon profil</Link>
              <button onClick={seDeconnecter} className="dropdown-item" style={{ color: 'var(--error)' }}>
                Déconnexion
              </button>
            </div>
          )}
        </div>
      </div>

      {menuMobileOuvert && createPortal(
        <>
          <div className="mobile-nav-overlay" onClick={() => setMenuMobileOuvert(false)} />
          <div className="mobile-nav-panel">
            <div className="mnp-head">
              <strong>Menu</strong>
              <button onClick={() => setMenuMobileOuvert(false)} style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>

            {contenuLiensPrincipaux}

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
        </>,
        document.body
      )}
    </nav>
  );
}
