import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

export default function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [ouvert, setOuvert] = useState(false);
  const [popupOuverte, setPopupOuverte] = useState(false);
  const [recherche, setRecherche] = useState('');
  const [filtreCategorie, setFiltreCategorie] = useState('toutes');
  const [nonLuesUniquement, setNonLuesUniquement] = useState(false);
  const refDropdown = useRef(null);
  const navigate = useNavigate();

  async function charger() {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) return;
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', session.session.user.id)
      .order('created_at', { ascending: false });
    setNotifications(data || []);
  }

  useEffect(() => {
    charger();
    const intervalle = setInterval(charger, 30000); // rafraîchit toutes les 30s
    return () => clearInterval(intervalle);
  }, []);

  useEffect(() => {
    function fermerSiExterieur(e) {
      if (refDropdown.current && !refDropdown.current.contains(e.target)) setOuvert(false);
    }
    document.addEventListener('mousedown', fermerSiExterieur);
    return () => document.removeEventListener('mousedown', fermerSiExterieur);
  }, []);

  const nonLues = notifications.filter((n) => !n.lu).length;

  async function marquerLue(notif) {
    if (!notif.lu) {
      await supabase.from('notifications').update({ lu: true }).eq('id', notif.id);
      charger();
    }
    setOuvert(false);
    setPopupOuverte(false);
    if (notif.lien) navigate(notif.lien);
  }

  async function toutMarquerLu() {
    const { data: session } = await supabase.auth.getSession();
    await supabase.from('notifications').update({ lu: true }).eq('user_id', session.session.user.id).eq('lu', false);
    charger();
  }

  function tempsEcoule(date) {
    const diffMs = new Date() - new Date(date);
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return 'À l\'instant';
    if (minutes < 60) return `Il y a ${minutes} min`;
    const heures = Math.floor(minutes / 60);
    if (heures < 24) return `Il y a ${heures} h`;
    return new Date(date).toLocaleDateString('fr-FR');
  }

  const categoriesDisponibles = [...new Set(notifications.map((n) => n.categorie).filter(Boolean))];
  const notificationsFiltrees = notifications.filter((n) => {
    if (nonLuesUniquement && n.lu) return false;
    if (filtreCategorie !== 'toutes' && n.categorie !== filtreCategorie) return false;
    if (recherche.trim() && !n.contenu.toLowerCase().includes(recherche.trim().toLowerCase())) return false;
    return true;
  });

  const ICONES = {
    qcm_publie: '📘', qcm_verifie: '✅', nouveau_qcm_pair: '📝', echeance: '📅', rappel_echeance: '⏰',
    compte_admin: '👤', abonnement: '💳', kholle_cloture: '🏁', signalement_erreur: '🚩',
    forum_mention: '💬', forum_annonce: '📣', forum_nouveau_canal: '#', forum_tous_messages: '💬', compte_modifie: '⚙️',
  };

  return (
    <>
      <div ref={refDropdown} style={{ position: 'relative' }}>
        <button className="notif-btn" onClick={() => setOuvert((v) => !v)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {nonLues > 0 && <span className="notif-dot" />}
        </button>

        {ouvert && (
          <div className="notif-panel">
            <div className="notif-header">
              <h3>Notifications</h3>
              {nonLues > 0 && <button onClick={toutMarquerLu}>Tout marquer lu</button>}
            </div>

            {notifications.slice(0, 5).map((n) => (
              <div key={n.id} onClick={() => marquerLue(n)} className={`notif-item ${!n.lu ? 'unread' : ''}`}>
                <div className="notif-icon">{ICONES[n.categorie] || '🔔'}</div>
                <div>
                  <div>{n.contenu}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 3 }}>{tempsEcoule(n.created_at)}</div>
                </div>
              </div>
            ))}

            {notifications.length === 0 && (
              <div style={{ padding: 20, fontSize: '0.82rem', color: 'var(--text-muted)', textAlign: 'center' }}>Rien pour l'instant.</div>
            )}

            <button
              onClick={() => { setPopupOuverte(true); setOuvert(false); }}
              style={{ width: '100%', padding: '12px', background: 'none', border: 'none', borderTop: '1px solid var(--border)', color: 'var(--accent)', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
            >
              Voir tout
            </button>
          </div>
        )}
      </div>

      {popupOuverte && createPortal(
        <div className="modal-overlay open" onClick={() => setPopupOuverte(false)}>
          <div onClick={(e) => e.stopPropagation()} className="modal-box" style={{ maxWidth: 500, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>Toutes les notifications</h3>
              <button onClick={() => setPopupOuverte(false)} style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>

            {nonLues > 0 && (
              <button className="btn btn-outline btn-sm" style={{ marginBottom: 14 }} onClick={toutMarquerLu}>
                Tout marquer comme lu
              </button>
            )}

            <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher..." style={{ marginBottom: 10 }} />

            <div className="filter-row" style={{ marginBottom: 6 }}>
              <select className="select-filter" value={filtreCategorie} onChange={(e) => setFiltreCategorie(e.target.value)}>
                <option value="toutes">Toutes les catégories</option>
                {categoriesDisponibles.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                <input type="checkbox" checked={nonLuesUniquement} onChange={(e) => setNonLuesUniquement(e.target.checked)} style={{ width: 'auto' }} />
                Non lues uniquement
              </label>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, marginTop: 10 }}>
              {notificationsFiltrees.map((n) => (
                <div key={n.id} onClick={() => marquerLue(n)} className={`notif-item ${!n.lu ? 'unread' : ''}`} style={{ borderRadius: 'var(--radius-md)', marginBottom: 6, border: '1px solid var(--border)' }}>
                  <div className="notif-icon">{ICONES[n.categorie] || '🔔'}</div>
                  <div>
                    <div>{n.contenu}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>{tempsEcoule(n.created_at)}</div>
                  </div>
                </div>
              ))}
              {notificationsFiltrees.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Aucun résultat.</p>}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
