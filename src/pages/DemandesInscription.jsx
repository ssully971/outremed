import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { envoyerNotificationGroupe } from '../lib/notifier';

export default function DemandesInscription() {
  const [monProfil, setMonProfil] = useState(null);
  const [demandes, setDemandes] = useState([]);
  const [onglet, setOnglet] = useState('en_attente');
  const [recherche, setRecherche] = useState('');
  const [validationOuverte, setValidationOuverte] = useState(null);
  const [pseudoValidation, setPseudoValidation] = useState('');
  const [statutCompte, setStatutCompte] = useState('actif');
  const [essaiSemaines, setEssaiSemaines] = useState(1);
  const [essaiGratuitActif, setEssaiGratuitActif] = useState(true);
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  async function charger() {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) { navigate('/'); return; }
    const { data: moi } = await supabase.from('profiles').select('*').eq('id', session.session.user.id).single();
    if (moi?.role !== 'tuteur' && moi?.role !== 'proprietaire') { navigate('/accueil'); return; }
    setMonProfil(moi);

    const { data } = await supabase.from('demandes_inscription').select('*').order('created_at', { ascending: false });
    setDemandes(data || []);

    const { data: param1 } = await supabase.from('parametres').select('valeur').eq('cle', 'essai_gratuit_duree_defaut').single();
    if (param1?.valeur) setEssaiSemaines(Number(param1.valeur));
    const { data: param2 } = await supabase.from('parametres').select('valeur').eq('cle', 'essai_gratuit_actif').single();
    setEssaiGratuitActif(param2?.valeur !== 'false');
  }

  useEffect(() => { charger(); }, []);

  function ouvrirValidation(demande) {
    setValidationOuverte(demande);
    setPseudoValidation(demande.pseudo);
    setStatutCompte('actif');
    setMessage('');
  }

  async function validerDemande(e) {
    e.preventDefault();
    setEnCours(true);
    setMessage('');

    const demande = validationOuverte;
    const pseudoFinal = pseudoValidation.trim();
    if (!pseudoFinal) { setEnCours(false); setMessage('Erreur : le pseudo ne peut pas être vide.'); return; }

    const { data: session } = await supabase.auth.getSession();

    let res, result;
    try {
      res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.session.access_token}` },
        body: JSON.stringify({
          email: demande.email, pseudo: pseudoFinal, role: 'etudiant', nom_complet: demande.nom_complet,
          statut_compte: statutCompte, essai_semaines: essaiSemaines, redirect_url: window.location.origin,
        }),
      });
      result = await res.json().catch(() => ({}));
    } catch {
      setEnCours(false);
      setMessage("Erreur : impossible de contacter le serveur. Vérifie ta connexion et réessaie.");
      return;
    }

    if (!res.ok) {
      setEnCours(false);
      setMessage('Erreur : ' + (result.error || 'une erreur inconnue est survenue.'));
      return;
    }

    await supabase.from('demandes_inscription').update({
      statut: 'validee', pseudo: pseudoFinal, traite_par: session.session.user.id, traite_le: new Date().toISOString(),
    }).eq('id', demande.id);

    const { data: autresAdmins } = await supabase
      .from('profiles').select('id').in('role', ['tuteur', 'proprietaire']).neq('id', session.session.user.id);
    if (autresAdmins && autresAdmins.length > 0) {
      await envoyerNotificationGroupe(
        autresAdmins.map((a) => a.id), 'compte_admin',
        `${monProfil.pseudo} a validé la demande d'inscription de ${pseudoFinal}`,
        '/demandes-inscription'
      );
    }

    setEnCours(false);
    setValidationOuverte(null);
    charger();
  }

  async function rejeterDemande(demande) {
    if (!confirm(`Rejeter la demande de ${demande.pseudo} (${demande.email}) ?`)) return;
    const { data: session } = await supabase.auth.getSession();
    await supabase.from('demandes_inscription').update({
      statut: 'rejetee', traite_par: session.session.user.id, traite_le: new Date().toISOString(),
    }).eq('id', demande.id);
    charger();
  }

  if (!monProfil) return null;

  const demandesFiltrees = demandes
    .filter((d) => (onglet === 'en_attente' ? d.statut === 'en_attente' : d.statut !== 'en_attente'))
    .filter((d) => {
      const texte = recherche.trim().toLowerCase();
      if (!texte) return true;
      return d.email.toLowerCase().includes(texte) || d.pseudo.toLowerCase().includes(texte) || d.nom_complet.toLowerCase().includes(texte);
    });

  const nbEnAttente = demandes.filter((d) => d.statut === 'en_attente').length;

  return (
    <div className="container">
      <h1 className="page-title">Demandes d'inscription</h1>
      <p className="page-sub">Étudiants ayant demandé un accès depuis la page publique.</p>

      <div className="category-tabs">
        <button className={`cat-tab ${onglet === 'en_attente' ? 'active' : ''}`} onClick={() => setOnglet('en_attente')}>
          En attente {nbEnAttente > 0 && `(${nbEnAttente})`}
        </button>
        <button className={`cat-tab ${onglet === 'historique' ? 'active' : ''}`} onClick={() => setOnglet('historique')}>
          Historique
        </button>
      </div>

      <div className="search-bar">
        <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher (email, pseudo, nom)..." />
      </div>

      {demandesFiltrees.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Aucune demande.</p>}

      <div className="qcm-manage-list">
        {demandesFiltrees.map((d) => (
          <div
            key={d.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '14px 18px',
            }}
          >
            <div style={{ width: 4, height: 36, borderRadius: 3, flexShrink: 0, background: d.statut === 'rejetee' ? 'var(--error)' : d.statut === 'validee' ? 'var(--success)' : 'var(--accent)' }} />
            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
              <div className="qmr-name">{d.pseudo} <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.8rem' }}>({d.nom_complet})</span></div>
              <div className="qmr-sub">{d.email}</div>
            </div>
            <div className="qmr-type" style={{ flexShrink: 0 }}>{new Date(d.created_at).toLocaleDateString('fr-FR')}</div>
            {d.statut === 'en_attente' ? (
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button className="btn btn-primary btn-sm" onClick={() => ouvrirValidation(d)}>Valider</button>
                <button className="btn btn-outline btn-sm" style={{ color: 'var(--error)', borderColor: 'var(--error)' }} onClick={() => rejeterDemande(d)}>Rejeter</button>
              </div>
            ) : (
              <span className={`status-tag ${d.statut === 'validee' ? 'status-validated' : 'status-pending'}`} style={{ flexShrink: 0, ...(d.statut === 'rejetee' ? { background: 'var(--error-bg)', color: 'var(--error)' } : undefined) }}>
                {d.statut === 'validee' ? 'Validée' : 'Rejetée'}
              </span>
            )}
          </div>
        ))}
      </div>

      {validationOuverte && (
        <div className="modal-overlay open" onClick={() => setValidationOuverte(null)}>
          <form onSubmit={validerDemande} className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>Valider l'inscription</h3>
              <button type="button" onClick={() => setValidationOuverte(null)} style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>
            <p className="modal-sub">
              Un lien d'invitation sera envoyé à <strong>{validationOuverte.email}</strong> pour définir son mot de passe — exactement comme une création de compte manuelle.
            </p>

            <div className="field">
              <label>Nom complet (déclaré)</label>
              <input value={validationOuverte.nom_complet} disabled />
            </div>
            <div className="field">
              <label>Email</label>
              <input value={validationOuverte.email} disabled />
            </div>
            <div className="field">
              <label>Pseudo</label>
              <input value={pseudoValidation} onChange={(e) => setPseudoValidation(e.target.value)} required />
              <p className="field-hint">Format attendu : prénom + initiale du nom + un point (ex : juliend.) — corrige si besoin avant de valider.</p>
            </div>
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

            {message && <div className="error-msg">{message}</div>}

            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setValidationOuverte(null)}>Annuler</button>
              <button className="btn btn-primary" type="submit" disabled={enCours}>
                {enCours ? 'Validation...' : 'Valider et inviter'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
