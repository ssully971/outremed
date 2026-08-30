import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

const CATEGORIES_NOTIF_COMMUNES = [
  ['qcm_publie', 'Nouveaux QCM publiés'],
  ['forum_mention', 'Mentions (@pseudo) dans le forum'],
  ['forum_annonce', 'Nouvelles annonces dans le forum'],
  ['forum_nouveau_canal', 'Nouveaux canaux créés'],
  ['forum_tous_messages', 'Tous les nouveaux messages du forum (même sans mention)'],
];
const CATEGORIES_NOTIF_ETUDIANT = [
  ['echeance', 'Nouvelles échéances du planning'],
  ['rappel_echeance', "Rappel avant une échéance"],
  ['kholle_cloture', 'Classement de kholle disponible'],
  ['abonnement', 'Changements sur mon abonnement'],
  ['compte_modifie', 'Modifications de mon compte (pseudo...)'],
  ['signalement_erreur', "Réponse à mes signalements d'erreur"],
];
const CATEGORIES_NOTIF_ADMIN = [
  ['qcm_verifie', 'QCM vérifiés'],
  ['nouveau_qcm_pair', 'QCM ajoutés ou modifiés par un autre tuteur'],
  ['compte_admin', 'Comptes créés/modifiés par les autres admins'],
  ['signalement_erreur', "Signalements d'erreur reçus"],
];

export default function Profil() {
  const [profil, setProfil] = useState(null);
  const [onglet, setOnglet] = useState('profil');
  const [nouveauPseudo, setNouveauPseudo] = useState('');
  const [nouveauMdp, setNouveauMdp] = useState('');
  const [confirmationMdp, setConfirmationMdp] = useState('');
  const [message, setMessage] = useState('');
  const [themePref, setThemePref] = useState('dark');
  const [accentPref, setAccentPref] = useState('#FF3EB5');
  const [notifPrefs, setNotifPrefs] = useState({});

  const [params, setParams] = useState({});
  const [messageParams, setMessageParams] = useState('');

  const [annonces, setAnnonces] = useState([]);
  const [utilisateurs, setUtilisateurs] = useState([]);
  const [messageAnnonce, setMessageAnnonce] = useState('');
  const [audienceAnnonce, setAudienceAnnonce] = useState('tous');
  const [destinatairesAnnonce, setDestinatairesAnnonce] = useState([]);
  const [dureeAnnonce, setDureeAnnonce] = useState('7');
  const [messageEnvoiAnnonce, setMessageEnvoiAnnonce] = useState('');

  const navigate = useNavigate();

  useEffect(() => {
    async function charger() {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) { navigate('/'); return; }
      const { data } = await supabase.from('profiles').select('*').eq('id', session.session.user.id).single();
      setProfil(data);
      setNouveauPseudo(data.pseudo);
      setThemePref(data.theme_pref || 'dark');
      setAccentPref(data.accent_pref || '#FF3EB5');
      setNotifPrefs(data.notif_prefs || {});

      if (data.role === 'proprietaire') {
        const { data: p } = await supabase.from('parametres').select('*');
        const map = {};
        (p || []).forEach((row) => { map[row.cle] = row.valeur; });
        setParams(map);
      }

      if (data.role === 'tuteur' || data.role === 'proprietaire') {
        const { data: users } = await supabase.from('profils_publics').select('id, pseudo, role').neq('id', session.session.user.id);
        setUtilisateurs(users || []);
        await chargerAnnonces();
      }
    }
    charger();
  }, []);

  async function chargerAnnonces() {
    const { data } = await supabase.from('annonces').select('*').order('created_at', { ascending: false });
    setAnnonces(data || []);
  }

  async function publierAnnonce(e) {
    e.preventDefault();
    setMessageEnvoiAnnonce('');
    if (!messageAnnonce.trim()) { setMessageEnvoiAnnonce('Le message est obligatoire.'); return; }
    if (audienceAnnonce === 'liste' && destinatairesAnnonce.length === 0) { setMessageEnvoiAnnonce('Choisis au moins un destinataire.'); return; }

    const dureeJours = dureeAnnonce === 'illimite' ? null : Number(dureeAnnonce);
    const expireLe = dureeJours ? new Date(Date.now() + dureeJours * 86400000).toISOString() : null;

    const { error } = await supabase.from('annonces').insert({
      message: messageAnnonce.trim(),
      audience: audienceAnnonce,
      destinataires: audienceAnnonce === 'liste' ? destinatairesAnnonce : null,
      duree_jours: dureeJours,
      expire_le: expireLe,
      cree_par: profil.id,
    });
    if (error) { setMessageEnvoiAnnonce('Erreur : ' + error.message); return; }

    setMessageAnnonce(''); setAudienceAnnonce('tous'); setDestinatairesAnnonce([]); setDureeAnnonce('7');
    setMessageEnvoiAnnonce('Annonce publiée.');
    chargerAnnonces();
  }

  async function supprimerAnnonce(id) {
    if (!confirm('Supprimer cette annonce ?')) return;
    await supabase.from('annonces').delete().eq('id', id);
    chargerAnnonces();
  }

  async function changerApparence(nouveauTheme, nouvelAccent) {
    setThemePref(nouveauTheme);
    setAccentPref(nouvelAccent);
    await supabase.from('profiles').update({ theme_pref: nouveauTheme, accent_pref: nouvelAccent }).eq('id', profil.id);
    document.documentElement.setAttribute('data-theme', nouveauTheme);
    document.documentElement.style.setProperty('--accent', nouvelAccent);
    document.documentElement.style.setProperty('--accent-glow', nouvelAccent + '33');
  }

  async function changerMotDePasse(e) {
    e.preventDefault();
    setMessage('');
    if (nouveauMdp.length < 8) { setMessage('Le mot de passe doit faire au moins 8 caractères.'); return; }
    if (nouveauMdp !== confirmationMdp) { setMessage('Les mots de passe ne correspondent pas.'); return; }

    const { error } = await supabase.auth.updateUser({ password: nouveauMdp });
    if (error) { setMessage('Erreur : ' + error.message); return; }
    setMessage('Mot de passe mis à jour.');
    setNouveauMdp('');
    setConfirmationMdp('');
  }

  async function changerPseudoTuteur() {
    const { error } = await supabase.from('profiles').update({ pseudo: nouveauPseudo }).eq('id', profil.id);
    if (error) { setMessage('Erreur : ' + error.message); return; }
    setMessage('Pseudo mis à jour.');
    setProfil((prev) => ({ ...prev, pseudo: nouveauPseudo }));
  }

  async function basculerNotifPref(cle) {
    const nouvelles = { ...notifPrefs, [cle]: notifPrefs[cle] === false ? true : false };
    setNotifPrefs(nouvelles);
    await supabase.from('profiles').update({ notif_prefs: nouvelles }).eq('id', profil.id);
  }

  function majParam(cle, valeur) {
    setParams((prev) => ({ ...prev, [cle]: valeur }));
  }

  async function enregistrerParametres() {
    setMessageParams('');
    for (const [cle, valeur] of Object.entries(params)) {
      await supabase.from('parametres').update({ valeur }).eq('cle', cle);
    }
    setMessageParams('Paramètres du site enregistrés.');
  }

  const couleursCommunes = ['#E91E8C', '#2FA8A0', '#7FB88F', '#C9B6E4', '#FF8A65'];
  const couleursSombre = [...couleursCommunes, '#EAF2F7', '#FAF9F7', '#F7D9E8'];
  const couleursClair = [...couleursCommunes, '#21323C', '#33363D'];
  const palette = themePref === 'dark' ? couleursSombre : couleursClair;

  if (!profil) return <div style={{ padding: 40 }}>Chargement...</div>;

  const estEtudiant = profil.role === 'etudiant';
  const estProprietaire = profil.role === 'proprietaire';
  const estAdmin = profil.role === 'tuteur' || profil.role === 'proprietaire';

  let statutTexte = 'Actif';
  let statutCouleur = 'var(--success)';
  if (estEtudiant) {
    if (!profil.compte_actif || profil.statut_compte === 'suspendu') { statutTexte = 'Suspendu'; statutCouleur = 'var(--error)'; }
    else if (profil.statut_compte === 'essai_gratuit') {
      const finEssai = new Date(profil.essai_fin);
      const joursRestants = Math.ceil((finEssai - new Date()) / (1000 * 60 * 60 * 24));
      statutTexte = joursRestants > 0 ? `Essai gratuit — ${joursRestants} jour(s) restant(s)` : 'Essai expiré';
      statutCouleur = joursRestants > 0 ? 'var(--warning)' : 'var(--error)';
    }
  }

  const categoriesNotif = [...CATEGORIES_NOTIF_COMMUNES, ...(estAdmin ? CATEGORIES_NOTIF_ADMIN : CATEGORIES_NOTIF_ETUDIANT)];

  const onglets = [
    ['profil', 'Profil'],
    ['apparence', 'Apparence'],
    ['notifications', 'Notifications'],
    ['securite', 'Sécurité'],
  ];
  if (estProprietaire) onglets.push(['site', 'Site']);
  if (estAdmin) onglets.push(['annonces', 'Annonces']);

  const initiales = profil.pseudo.slice(0, 2).toUpperCase();

  return (
    <div className="container" style={{ maxWidth: 700 }}>
      <h1 className="page-title">Mon compte</h1>
      <p className="page-sub">Profil, apparence, notifications et sécurité.</p>

      <div className="profile-header">
        <div className="avatar-big">{initiales}</div>
        <div>
          <h2>{profil.pseudo}</h2>
          <p style={{ textTransform: 'capitalize' }}>{profil.role}</p>
          {estEtudiant && (
            <span className="sub-badge" style={{ background: statutCouleur + '22', color: statutCouleur }}>{statutTexte}</span>
          )}
        </div>
      </div>

      <div className="settings-tabs">
        {onglets.map(([val, label]) => (
          <button key={val} className={`settings-tab ${onglet === val ? 'active' : ''}`} onClick={() => setOnglet(val)}>
            {label}
          </button>
        ))}
      </div>

      {onglet === 'profil' && (
        <div className="settings-card">
          <h3>Identité</h3>
          <p className="desc">Ton pseudo tel qu'il apparaît partout sur le site.</p>
          <div className="field">
            <label>Pseudo</label>
            {estEtudiant ? (
              <>
                <input value={profil.pseudo} disabled />
                <p className="field-hint">🔒 Pour changer ton pseudo, demande à un tuteur ou au propriétaire.</p>
              </>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={nouveauPseudo} onChange={(e) => setNouveauPseudo(e.target.value)} />
                <button className="btn btn-outline" onClick={changerPseudoTuteur}>Enregistrer</button>
              </div>
            )}
          </div>
          {message && onglet === 'profil' && <div className="error-msg" style={{ color: message.startsWith('Erreur') ? 'var(--error)' : 'var(--success)' }}>{message}</div>}
        </div>
      )}

      {onglet === 'apparence' && (
        <div className="settings-card">
          <h3>Apparence</h3>
          <p className="desc">Personnalise le thème et la couleur d'accent.</p>

          <div className="field">
            <label>Thème</label>
            <div className="theme-toggle-row">
              <div className={`theme-option ${themePref === 'dark' ? 'selected' : ''}`} onClick={() => changerApparence('dark', accentPref)}>
                <div className="theme-preview dark-preview" />
                <span>Sombre</span>
              </div>
              <div className={`theme-option ${themePref === 'light' ? 'selected' : ''}`} onClick={() => changerApparence('light', accentPref)}>
                <div className="theme-preview light-preview" />
                <span>Clair</span>
              </div>
            </div>
          </div>

          <div className="field">
            <label>Couleur d'accent</label>
            <div className="color-grid">
              {palette.map((c) => (
                <div key={c} className={`color-swatch ${accentPref === c ? 'selected' : ''}`} style={{ background: c, width: 40, height: 40 }} onClick={() => changerApparence(themePref, c)} />
              ))}
            </div>
          </div>
        </div>
      )}

      {onglet === 'notifications' && (
        <div className="settings-card">
          <h3>Notifications</h3>
          <p className="desc">Choisis les notifications que tu veux recevoir.</p>
          {categoriesNotif.map(([cle, label]) => (
            <div key={cle} className="toggle-row">
              <span className="toggle-label" style={{ fontWeight: 500 }}>{label}</span>
              <label className="switch">
                <input type="checkbox" checked={notifPrefs[cle] !== false} onChange={() => basculerNotifPref(cle)} />
                <span className="slider" />
              </label>
            </div>
          ))}
        </div>
      )}

      {onglet === 'securite' && (
        <div className="settings-card">
          <h3>Changer le mot de passe</h3>
          <form onSubmit={changerMotDePasse}>
            <div className="field">
              <label>Nouveau mot de passe</label>
              <input type="password" value={nouveauMdp} onChange={(e) => setNouveauMdp(e.target.value)} />
            </div>
            <div className="field">
              <label>Confirmer</label>
              <input type="password" value={confirmationMdp} onChange={(e) => setConfirmationMdp(e.target.value)} />
            </div>
            {message && <div className="error-msg" style={{ color: message.startsWith('Erreur') ? 'var(--error)' : 'var(--success)' }}>{message}</div>}
            <button className="btn btn-primary" type="submit">Mettre à jour</button>
          </form>
        </div>
      )}

      {onglet === 'site' && estProprietaire && (
        <>
          <div className="settings-card">
            <h3>Académique</h3>
            <div className="field">
              <label>Semestre actif</label>
              <input value={params.semestre_actif || ''} onChange={(e) => majParam('semestre_actif', e.target.value)} placeholder="2025-S1" />
              <p className="field-hint">Change cette valeur pour remettre à zéro les classements cumulés.</p>
            </div>
            <div className="field">
              <label>Durée par défaut de l'essai gratuit</label>
              <select value={params.essai_gratuit_duree_defaut || '1'} onChange={(e) => majParam('essai_gratuit_duree_defaut', e.target.value)}>
                <option value="1">1 semaine</option>
                <option value="2">2 semaines</option>
              </select>
            </div>
            <div className="field-row">
              <div className="field">
                <label>Nombre de questions par défaut</label>
                <input type="number" value={params.nb_questions_defaut || '20'} onChange={(e) => majParam('nb_questions_defaut', e.target.value)} />
              </div>
              <div className="field">
                <label>Nombre d'items par défaut</label>
                <input type="number" value={params.nb_items_defaut || '5'} onChange={(e) => majParam('nb_items_defaut', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="settings-card">
            <h3>Fonctionnement du site</h3>
            <div className="toggle-row">
              <span className="toggle-label">Essai gratuit activé</span>
              <label className="switch">
                <input type="checkbox" checked={params.essai_gratuit_actif === 'true'} onChange={(e) => majParam('essai_gratuit_actif', e.target.checked ? 'true' : 'false')} />
                <span className="slider" />
              </label>
            </div>
            <div className="toggle-row">
              <span className="toggle-label">Forum activé</span>
              <label className="switch">
                <input type="checkbox" checked={params.forum_actif === 'true'} onChange={(e) => majParam('forum_actif', e.target.checked ? 'true' : 'false')} />
                <span className="slider" />
              </label>
            </div>
            <div className="toggle-row">
              <span className="toggle-label">Planning activé</span>
              <label className="switch">
                <input type="checkbox" checked={params.planning_actif === 'true'} onChange={(e) => majParam('planning_actif', e.target.checked ? 'true' : 'false')} />
                <span className="slider" />
              </label>
            </div>
          </div>

          <div className="settings-card">
            <h3>Communication</h3>
            <div className="field">
              <label>Lien de contact WhatsApp</label>
              <input value={params.whatsapp_contact || ''} onChange={(e) => majParam('whatsapp_contact', e.target.value)} placeholder="https://wa.me/590..." />
              <p className="field-hint">Affiché en bas de la page d'accueil et sur la page de présentation.</p>
            </div>
            <div className="field">
              <label>Lien Instagram</label>
              <input value={params.instagram_url || ''} onChange={(e) => majParam('instagram_url', e.target.value)} placeholder="https://instagram.com/..." />
              <p className="field-hint">Affiché sur la page de présentation, avant connexion.</p>
            </div>
            <div className="field">
              <label>Lien mentions légales / conditions d'utilisation</label>
              <input value={params.mentions_legales_url || ''} onChange={(e) => majParam('mentions_legales_url', e.target.value)} placeholder="À définir avant la mise en ligne" />
            </div>
          </div>

          {messageParams && <div className="error-msg" style={{ color: 'var(--success)' }}>{messageParams}</div>}
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={enregistrerParametres}>Enregistrer les paramètres du site</button>
        </>
      )}

      {onglet === 'annonces' && estAdmin && (
        <>
          <div className="settings-card">
            <h3>Publier une annonce</h3>
            <p className="desc">Elle apparaîtra en popup à l'accueil des personnes ciblées, une seule fois.</p>
            <form onSubmit={publierAnnonce}>
              <div className="field">
                <label>Message</label>
                <textarea value={messageAnnonce} onChange={(e) => setMessageAnnonce(e.target.value)} placeholder="Ex : Le forum est maintenant disponible, retrouvez-y vos tuteurs !" />
              </div>
              <div className="field">
                <label>Qui doit voir ce message ?</label>
                <select value={audienceAnnonce} onChange={(e) => setAudienceAnnonce(e.target.value)}>
                  <option value="tous">Tout le monde</option>
                  <option value="etudiants">Les étudiants uniquement</option>
                  <option value="tuteurs">Les tuteurs uniquement</option>
                  <option value="liste">Une liste de personnes précises</option>
                </select>
              </div>
              {audienceAnnonce === 'liste' && (
                <div className="field">
                  <label>Destinataires</label>
                  <select multiple value={destinatairesAnnonce} onChange={(e) => setDestinatairesAnnonce([...e.target.selectedOptions].map((o) => o.value))} style={{ minHeight: 120 }}>
                    {utilisateurs.map((u) => <option key={u.id} value={u.id}>{u.pseudo} ({u.role})</option>)}
                  </select>
                </div>
              )}
              <div className="field">
                <label>Pendant combien de temps ?</label>
                <select value={dureeAnnonce} onChange={(e) => setDureeAnnonce(e.target.value)}>
                  <option value="1">1 jour</option>
                  <option value="3">3 jours</option>
                  <option value="7">7 jours</option>
                  <option value="30">30 jours</option>
                  <option value="illimite">Jusqu'à ce que je la supprime</option>
                </select>
              </div>
              {messageEnvoiAnnonce && <div className="error-msg" style={{ color: messageEnvoiAnnonce.startsWith('Erreur') ? 'var(--error)' : 'var(--success)' }}>{messageEnvoiAnnonce}</div>}
              <button className="btn btn-primary" style={{ width: '100%' }} type="submit">Publier l'annonce</button>
            </form>
          </div>

          <div className="settings-card">
            <h3>Annonces actives</h3>
            {annonces.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Aucune annonce pour l'instant.</p>}
            {annonces.map((a) => (
              <div key={a.id} className="detail-error-row" style={{ background: 'var(--bg-panel)', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.88rem' }}>{a.message}</div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    {a.audience === 'tous' ? 'Tout le monde' : a.audience === 'etudiants' ? 'Étudiants' : a.audience === 'tuteurs' ? 'Tuteurs' : `${(a.destinataires || []).length} personne(s)`}
                    {' · '}{a.expire_le ? `jusqu'au ${new Date(a.expire_le).toLocaleDateString('fr-FR')}` : 'sans limite'}
                  </div>
                </div>
                <button className="icon-action danger" onClick={() => supprimerAnnonce(a.id)}>🗑</button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
