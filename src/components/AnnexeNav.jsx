import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';

const LIENS = [
  ['/annexe', 'QCM'],
  ['/annexe/qcm/nouveau', 'Créer'],
  ['/annexe/qcm/gerer', 'Gérer'],
  ['/annexe/mes-stats', 'Mes stats'],
  ['/annexe/stats', 'Stats communes'],
  ['/annexe/historique', 'Historique'],
  ['/annexe/carnet-erreurs', "Carnet d'erreurs"],
];

export default function AnnexeNav() {
  const location = useLocation();
  const [menuMobileOuvert, setMenuMobileOuvert] = useState(false);

  function classe(path) {
    return location.pathname === path ? 'active' : '';
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px', gap: 16, borderBottom: '1px solid var(--border)' }}>
      <div className="nav-links">
        {LIENS.map(([path, label]) => (
          <Link key={path} to={path} className={classe(path)}>{label}</Link>
        ))}
        <Link to="/accueil" style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>← Retour à l'accueil</Link>
      </div>

      <button className="hamburger-btn" onClick={() => setMenuMobileOuvert(true)}>☰</button>

      {menuMobileOuvert && createPortal(
        <>
          <div className="mobile-nav-overlay" onClick={() => setMenuMobileOuvert(false)} />
          <div className="mobile-nav-panel">
            <div className="mnp-head">
              <strong>Espace tuteurs</strong>
              <button onClick={() => setMenuMobileOuvert(false)} style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>
            {LIENS.map(([path, label]) => (
              <Link key={path} to={path} className={classe(path)} onClick={() => setMenuMobileOuvert(false)}>{label}</Link>
            ))}
            <div className="mnp-section-label">Compte</div>
            <Link to="/accueil" onClick={() => setMenuMobileOuvert(false)}>← Retour à l'accueil</Link>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
