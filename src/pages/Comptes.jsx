import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { envoyerNotification, envoyerNotificationGroupe } from '../lib/notifier';

export default function Comptes() {
  const [monProfil, setMonProfil] = useState(null);
  const [onglet, setOnglet] = useState('ajouter');
  const navigate = useNavigate();

  // Ajouter un compte
  const [email, setEmail] = useState('');
  const [pseudo, setPseudo] = useState('');
  const [role, setRole] = useState('etudiant');
  const [statutCompte, setStatutCompte] = useState('actif');
  const [essaiSemaines, setEssaiSemaines] = useState(1);
  const [essaiGratuitActif, setEssaiGratuitActif] = useState(true);
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState('');

  // Étudiants
  const [etudiants, setEtudiants] = useState([]);
  const [rechercheEtudiant, setRechercheEtudiant] = useState('');
  const [filtreStatutEtudiant, setFiltreStatutEtudiant] = useState('tous');
  const [triEtudiant, setTriEtudiant] = useState('pseudo');

  // Tuteurs
  const [tuteurs, setTuteurs] = useState([]);
  const [suppressionOuverte, setSuppressionOuverte] = useState(null);
  const [confirmationTexte, setConfirmationTexte] = useState('');
  const [suppressionEnCours, setSuppressionEnCours] = useState(false);
  const [moyennesEtudiants, setMoyennesEtudiants] = useState({});
  const [ajoutOuvert, setAjoutOuvert] = useState(false);
  const [statsTuteurs, setStatsTuteurs] = useState({});

  async function charger() {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) { navigate('/'); return; }
    const { data: moi } = await supabase.from('profiles').select('*').eq('id', session.session.user.id).single();
    if (moi?.role !== 'tuteur' && moi?.role !== 'proprietaire') { navigate('/accueil'); return; }
    setMonProfil(moi);

    const { data: etus } = await supabase.from('profiles').select('*').eq('role', 'etudiant').order('pseudo');
    setEtudiants(etus || []);

    const { data: att } = await supabase.from('attempts').select('user_id, score, qcms(nb_questions)');
    const moyennesMap = {};
    (att || []).forEach((a) => {
      if (!moyennesMap[a.user_id]) moyennesMap[a.user_id] = { total: 0, count: 0 };
      moyennesMap[a.user_id].total += Number(a.score) / (a.qcms?.nb_questions || 1);
      moyennesMap[a.user_id].count += 1;
    });
    setMoyennesEtudiants(moyennesMap);

    if (moi?.role === 'proprietaire') {
      const { data: tut } = await supabase.from('profiles').select('*').eq('role', 'tuteur').order('pseudo');
      setTuteurs(tut || []);

      const { data: tousQcmsPublics } = await supabase.from('qcms').select('id, cree_par').eq('est_prive', false);
      const debutMois = new Date(); debutMois.setDate(1); debutMois.setHours(0, 0, 0, 0);
      const { data: validations } = await supabase.from('historique_qcm').select('effectue_par').eq('action', 'verification').gte('created_at', debutMois.toISOString());
      const stats = {};
      (tut || []).forEach((t) => {
        stats[t.id] = {
          qcmAjoutes: (tousQcmsPublics || []).filter((q) => q.cree_par === t.id).length,
          validationsMois: (validations || []).filter((v) => v.effectue_par === t.id).length,
        };
      });
      setStatsTuteurs(stats);
    }

    const { data: param1 } = await supabase.from('parametres').select('valeur').eq('cle', 'essai_gratuit_duree_defaut').single();
    if (param1?.valeur) setEssaiSemaines(Number(param1.valeur));
    const { data: param2 } = await supabase.from('parametres').select('valeur').eq('cle', 'essai_gratuit_actif').single();
    setEssaiGratuitActif(param2?.valeur !== 'false');
  }

  useEffect(() => { charger(); }, []);

  async function creerCompte(e) {
    e.preventDefault();
    setEnCours(true);
    setMessage('');

    const { data: session } = await supabase.auth.getSession();

    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.session.access_token}` },
      body: JSON.stringify({ email, pseudo, role, statut_compte: statutCompte, essai_semaines: essaiSemaines, redirect_url: window.location.origin }),
    });

    const result = await res.json();
    setEnCours(false);

    if (!res.ok) { setMessage('Erreur : ' + result.error); return; }

    setMessage(`Compte créé — un email d'invitation a été envoyé à ${email}.`);

    const { data: autresAdmins } = await supabase
      .from('profiles').select('id').in('role', ['tuteur', 'proprietaire']).neq('id', session.session.user.id);
    if (autresAdmins && autresAdmins.length > 0) {
      await envoyerNotificationGroupe(
        autresAdmins.map((a) => a.id), 'compte_admin',
        `${monProfil.pseudo} a créé un compte ${role === 'tuteur' ? 'tuteur' : 'étudiant'} : ${pseudo}`,
        '/comptes'
      );
    }

    setEmail(''); setPseudo('');
    setAjoutOuvert(false);
    charger();
  }

  function statutLabel(e) {
    if (e.statut_compte === 'suspendu') return { texte: 'Suspendu', couleur: 'var(--error)' };
    if (!e.compte_actif) return { texte: 'Désactivé', couleur: 'var(--error)' };
    if (e.statut_compte === 'essai_gratuit') {
      const expire = new Date(e.essai_fin) < new Date();
      return expire ? { texte: 'Essai expiré', couleur: 'var(--error)' } : { texte: 'Essai gratuit', couleur: 'var(--warning)' };
    }
    return { texte: 'Actif', couleur: 'var(--success)' };
  }

  async function basculerActivationTuteur(tuteur) {
    const { data: session } = await supabase.auth.getSession();
    const nouveauStatut = !tuteur.compte_actif;
    if (!nouveauStatut && !confirm(`Désactiver le compte de ${tuteur.pseudo} ?`)) return;

    await supabase.from('profiles').update({ compte_actif: nouveauStatut }).eq('id', tuteur.id);
    await supabase.from('historique_comptes').insert({
      action: nouveauStatut ? 'reactivation_tuteur' : 'desactivation_tuteur',
      cible_id: tuteur.id, effectue_par: session.session.user.id,
      details: `${tuteur.pseudo} ${nouveauStatut ? 'réactivé' : 'désactivé'}`,
    });

    await envoyerNotification(
      tuteur.id, 'compte_admin',
      nouveauStatut ? 'Ton compte tuteur a été réactivé.' : 'Ton compte tuteur a été désactivé.',
      '/profil'
    );

    const { data: autresAdmins } = await supabase.from('profiles').select('id').in('role', ['tuteur', 'proprietaire']).neq('id', session.session.user.id).neq('id', tuteur.id);
    if (autresAdmins && autresAdmins.length > 0) {
      await envoyerNotificationGroupe(
        autresAdmins.map((a) => a.id), 'compte_admin',
        `Le compte tuteur de ${tuteur.pseudo} a été ${nouveauStatut ? 'réactivé' : 'désactivé'}.`,
        '/comptes'
      );
    }

    charger();
  }

  async function supprimerTuteur(tuteur) {
    setSuppressionEnCours(true);
    const { data: session } = await supabase.auth.getSession();
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.session.access_token}` },
      body: JSON.stringify({ user_id: tuteur.id }),
    });
    const result = await res.json();
    setSuppressionEnCours(false);
    if (!res.ok) { alert('Erreur : ' + result.error); return; }
    setSuppressionOuverte(null);
    setConfirmationTexte('');
    charger();
  }

  if (!monProfil) return <div style={{ padding: 40 }}>Chargement...</div>;

  const etudiantsAffiches = etudiants
    .filter((e) => e.pseudo.toLowerCase().includes(rechercheEtudiant.toLowerCase()))
    .filter((e) => {
      if (filtreStatutEtudiant === 'tous') return true;
      if (filtreStatutEtudiant === 'suspendu') return !e.compte_actif || e.statut_compte === 'suspendu';
      return e.statut_compte === filtreStatutEtudiant && e.compte_actif;
    })
    .sort((a, b) => {
      if (triEtudiant === 'recent') return new Date(b.created_at) - new Date(a.created_at);
      if (triEtudiant === 'moyenne') {
        const mA = moyennesEtudiants[a.id];
        const mB = moyennesEtudiants[b.id];
        const pctA = mA && mA.count > 0 ? mA.total / mA.count : -1;
        const pctB = mB && mB.count > 0 ? mB.total / mB.count : -1;
        return pctB - pctA;
      }
      return a.pseudo.localeCompare(b.pseudo);
    });

  return (
    <div className="container">
      <div className="page-top-row">
        <div>
          <h1 className="page-title">Comptes</h1>
          <p className="page-sub">Gère les étudiants{monProfil.role === 'proprietaire' && ' et les tuteurs'}.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setAjoutOuvert(true)}>+ Ajouter un compte</button>
      </div>

      <div className="stats-grid">
        <div className="stat-box"><div className="stat-value">{etudiants.filter((e) => e.compte_actif).length}</div><div className="stat-label">Étudiants actifs</div></div>
        <div className="stat-box"><div className="stat-value" style={{ color: 'var(--warning)' }}>{etudiants.filter((e) => e.statut_compte === 'essai_gratuit' && e.compte_actif).length}</div><div className="stat-label">En essai gratuit</div></div>
        {monProfil.role === 'proprietaire' && (
          <div className="stat-box"><div className="stat-value" style={{ color: 'var(--role-tuteur)' }}>{tuteurs.filter((t) => t.compte_actif).length}</div><div className="stat-label">Tuteurs actifs</div></div>
        )}
        <div className="stat-box"><div className="stat-value" style={{ color: 'var(--error)' }}>{etudiants.filter((e) => !e.compte_actif || e.statut_compte === 'suspendu').length}</div><div className="stat-label">Désactivés/suspendus</div></div>
      </div>

      <div className="category-tabs">
        <button className={`cat-tab ${onglet === 'etudiants' ? 'active' : ''}`} onClick={() => setOnglet('etudiants')}>Étudiants</button>
        {monProfil.role === 'proprietaire' && (
          <button className={`cat-tab ${onglet === 'tuteurs' ? 'active' : ''}`} onClick={() => setOnglet('tuteurs')}>Tuteurs</button>
        )}
      </div>

      {onglet === 'etudiants' && (
        <>
          <div className="search-bar"><input value={rechercheEtudiant} onChange={(e) => setRechercheEtudiant(e.target.value)} placeholder="Rechercher un pseudo..." /></div>

          <div className="filter-row" style={{ alignItems: 'center' }}>
            {[
              ['tous', 'Tous'],
              ['actif', 'Actifs'],
              ['essai_gratuit', 'Essai gratuit'],
              ['suspendu', 'Suspendus/désactivés'],
            ].map(([val, label]) => (
              <button key={val} className={`filter-chip ${filtreStatutEtudiant === val ? 'active' : ''}`} onClick={() => setFiltreStatutEtudiant(val)}>{label}</button>
            ))}
            <select className="select-filter" value={triEtudiant} onChange={(e) => setTriEtudiant(e.target.value)} style={{ marginLeft: 'auto' }}>
              <option value="pseudo">Trier par pseudo (A-Z)</option>
              <option value="recent">Trier par plus récent</option>
              <option value="moyenne">Trier par moyenne</option>
            </select>
          </div>

          {etudiantsAffiches.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Aucun étudiant ne correspond.</p>}
          <div className="student-list">
            {etudiantsAffiches.map((e) => {
              const statut = statutLabel(e);
              const m = moyennesEtudiants[e.id];
              const moyennePct = m && m.count > 0 ? Math.round((m.total / m.count) * 100) : null;
              const joursRestants = e.statut_compte === 'essai_gratuit' && e.essai_fin
                ? Math.ceil((new Date(e.essai_fin) - new Date()) / (1000 * 60 * 60 * 24))
                : null;
              return (
                <Link key={e.id} to={`/etudiants/${e.id}`} className="student-row">
                  <div className="sr-avatar">{e.pseudo.slice(0, 2).toUpperCase()}</div>
                  <div className="sr-name">{e.pseudo}</div>
                  <div className="sr-avg" style={{ color: moyennePct !== null ? 'var(--accent)' : 'var(--text-muted)' }}>{moyennePct !== null ? `${moyennePct}%` : '—'}</div>
                  <div className="sr-qcm">{m?.count ?? 0} QCM</div>
                  <div className="sr-trial">
                    {joursRestants !== null ? <span className="trial-days">{joursRestants > 0 ? `${joursRestants} j restants` : 'Expiré'}</span> : '—'}
                  </div>
                  <span className={`status-tag ${statut.texte === 'Actif' ? 'status-validated' : statut.texte === 'Essai gratuit' ? 'status-pending' : 'status-inactive'}`}>
                    {statut.texte}
                  </span>
                  <div className="sr-actions">
                    <span className="icon-action" title="Voir la fiche">→</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}

      {onglet === 'tuteurs' && monProfil.role === 'proprietaire' && (
        <>
          <div className="owner-card">
            <div className="tr-avatar">{monProfil.pseudo.slice(0, 2).toUpperCase()}</div>
            <div className="owner-card-info">
              <div className="tr-name">{monProfil.pseudo}<span className="owner-badge">Propriétaire</span></div>
              <div className="tr-email">Tous les droits des tuteurs, plus la gestion des comptes tuteurs</div>
            </div>
          </div>

          {tuteurs.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Aucun tuteur pour l'instant.</p>}
          <div className="tutor-list">
            {tuteurs.map((t) => {
              const stats = statsTuteurs[t.id] || { qcmAjoutes: 0, validationsMois: 0 };
              return (
                <div key={t.id}>
                  <div className={`tutor-row ${!t.compte_actif ? 'inactive' : ''}`}>
                    <div className="tr-avatar">{t.pseudo.slice(0, 2).toUpperCase()}</div>
                    <Link to={`/tuteurs/${t.id}`} style={{ textDecoration: 'none', color: 'var(--text-main)' }}>
                      <div className="tr-name">{t.pseudo}</div>
                      <div className="tr-since">Depuis le {new Date(t.created_at).toLocaleDateString('fr-FR')}</div>
                    </Link>
                    <div className="tr-stat"><div className="val">{stats.qcmAjoutes}</div><div className="lbl">QCM</div></div>
                    <div className="tr-stat"><div className="val">{stats.validationsMois}</div><div className="lbl">Validés</div></div>
                    <span className={`status-tag ${t.compte_actif ? 'status-validated' : 'status-inactive'}`}>{t.compte_actif ? 'Actif' : 'Désactivé'}</span>
                    <div className="tr-actions">
                      <button className={`icon-action ${t.compte_actif ? 'danger' : ''}`} title={t.compte_actif ? 'Désactiver' : 'Réactiver'} onClick={() => basculerActivationTuteur(t)}>
                        {t.compte_actif ? '⛔' : '🔄'}
                      </button>
                      <button className="icon-action danger" title="Supprimer" onClick={() => { setSuppressionOuverte(suppressionOuverte === t.id ? null : t.id); setConfirmationTexte(''); }}>🗑</button>
                    </div>
                  </div>

                  {suppressionOuverte === t.id && (
                    <div className="warn-box" style={{ marginTop: 10 }}>
                      <div style={{ flex: 1 }}>
                        <b>Suppression définitive de {t.pseudo}.</b> Cette action est irréversible ; ses QCM et son historique resteront tracés mais son compte sera effacé.
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                          <input
                            value={confirmationTexte}
                            onChange={(e) => setConfirmationTexte(e.target.value)}
                            placeholder={`Tape "${t.pseudo}" pour confirmer`}
                            style={{ flex: 1, minWidth: 200 }}
                          />
                          <button className="btn btn-danger-outline btn-sm" disabled={confirmationTexte !== t.pseudo || suppressionEnCours} onClick={() => supprimerTuteur(t)}>
                            {suppressionEnCours ? 'Suppression...' : 'Confirmer'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {ajoutOuvert && (
        <div className="modal-overlay open" onClick={() => setAjoutOuvert(false)}>
          <form onSubmit={(e) => { creerCompte(e); }} className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>Ajouter un compte</h3>
              <button type="button" onClick={() => setAjoutOuvert(false)} style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>
            <p className="modal-sub">Un lien d'invitation sera envoyé par e-mail pour définir le mot de passe.</p>

            <div className="field">
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label>Pseudo</label>
              <input value={pseudo} onChange={(e) => setPseudo(e.target.value)} required />
            </div>
            <div className="field">
              <label>Type de compte</label>
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="etudiant">Étudiant</option>
                {monProfil.role === 'proprietaire' && <option value="tuteur">Tuteur</option>}
              </select>
            </div>
            {role === 'etudiant' && (
              <>
                <div className="field">
                  <label>Statut</label>
                  <select value={statutCompte} onChange={(e) => setStatutCompte(e.target.value)}>
                    <option value="actif">Compte actif (paiement reçu)</option>
                    {essaiGratuitActif && <option value="essai_gratuit">Essai gratuit</option>}
                  </select>
                </div>
                {statutCompte === 'essai_gratuit' && (
                  <div className="field">
                    <label>Durée de l'essai</label>
                    <select value={essaiSemaines} onChange={(e) => setEssaiSemaines(Number(e.target.value))}>
                      <option value={1}>1 semaine</option>
                      <option value={2}>2 semaines</option>
                    </select>
                  </div>
                )}
              </>
            )}
            {message && <div className="error-msg" style={{ color: message.startsWith('Erreur') ? 'var(--error)' : 'var(--success)' }}>{message}</div>}
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setAjoutOuvert(false)}>Annuler</button>
              <button className="btn btn-primary" type="submit" disabled={enCours}>
                {enCours ? 'Création...' : "Créer et inviter"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
