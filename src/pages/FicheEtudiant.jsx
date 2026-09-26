import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { envoyerNotification, envoyerNotificationGroupe } from '../lib/notifier';
import SelecteurFiliere from '../components/SelecteurFiliere';

export default function FicheEtudiant() {
  const { id } = useParams();
  const [etudiant, setEtudiant] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [confirmationSuppression, setConfirmationSuppression] = useState('');
  const [suppressionEnCours, setSuppressionEnCours] = useState(false);
  const [zoneSuppressionOuverte, setZoneSuppressionOuverte] = useState(false);
  const [nouveauPseudo, setNouveauPseudo] = useState('');
  const [messagePseudo, setMessagePseudo] = useState('');
  const [matieres, setMatieres] = useState([]);
  const [nbErreurs, setNbErreurs] = useState(0);
  const [sectionOuverte, setSectionOuverte] = useState(null); // 'tentatives' | 'erreurs' | null
  const [questionsErreurs, setQuestionsErreurs] = useState(null); // chargé à la demande
  const [popupOuverte, setPopupOuverte] = useState(null); // 'tentatives' | 'erreurs' | null
  const [rechercheTentative, setRechercheTentative] = useState('');
  const [filtreTypeTentative, setFiltreTypeTentative] = useState('tous');
  const [filtreMatiereTentative, setFiltreMatiereTentative] = useState('');
  const [triTentative, setTriTentative] = useState('date_desc');
  const [filtreMatiereErreur, setFiltreMatiereErreur] = useState('');
  const [modalites, setModalites] = useState([]);
  const [sousFilieres, setSousFilieres] = useState([]);
  const [profilSousFilieres, setProfilSousFilieres] = useState([]);
  const [profilMatieres, setProfilMatieres] = useState([]);
  const [editionFiliereOuverte, setEditionFiliereOuverte] = useState(false);
  const [nouvelEmailInvitation, setNouvelEmailInvitation] = useState('');
  const [renvoiEnCours, setRenvoiEnCours] = useState(false);
  const [messageRenvoi, setMessageRenvoi] = useState('');
  const navigate = useNavigate();

  async function charger() {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) { navigate('/'); return; }

    const { data: moi } = await supabase.from('profiles').select('role').eq('id', session.session.user.id).single();
    if (moi?.role !== 'tuteur' && moi?.role !== 'proprietaire') { navigate('/accueil'); return; }

    const { data: e } = await supabase.from('profiles').select('*').eq('id', id).single();
    setEtudiant(e);
    setNouveauPseudo(e?.pseudo || '');

    const { data: att } = await supabase
      .from('attempts')
      .select('*, qcms(titre, numero, nb_questions, matiere_id, type_qcm, is_kholle, is_annale)')
      .eq('user_id', id)
      .order('created_at', { ascending: false });
    setAttempts(att || []);

    const { data: mats } = await supabase.from('matieres').select('*');
    setMatieres(mats || []);

    const { data: mods } = await supabase.from('modalites').select('*');
    setModalites(mods || []);
    const { data: sf } = await supabase.from('sous_filieres').select('*');
    setSousFilieres(sf || []);
    const { data: psf } = await supabase.from('profil_sous_filieres').select('*').eq('profile_id', id);
    setProfilSousFilieres(psf || []);
    const { data: pm } = await supabase.from('profil_matieres').select('*').eq('profile_id', id);
    setProfilMatieres(pm || []);

    const attemptIds = (att || []).map((a) => a.id);
    let nbErr = 0;
    if (attemptIds.length > 0) {
      const { data: erreurs } = await supabase.from('attempt_answers').select('id').in('attempt_id', attemptIds).neq('statut', 'correct');
      nbErr = (erreurs || []).length;
    }
    setNbErreurs(nbErr);
  }

  useEffect(() => { charger(); }, [id]);

  async function chargerDetailErreurs() {
    if (questionsErreurs) return;
    const attemptIds = attempts.map((a) => a.id);
    if (attemptIds.length === 0) { setQuestionsErreurs([]); return; }

    const { data: erreurs } = await supabase
      .from('attempt_answers')
      .select('attempt_id, statut, question_id')
      .in('attempt_id', attemptIds)
      .neq('statut', 'correct');

    const questionIds = [...new Set((erreurs || []).map((e) => e.question_id))];
    const { data: questions } = questionIds.length > 0
      ? await supabase.from('questions').select('id, enonce, ordre, qcm_id').in('id', questionIds)
      : { data: [] };

    const liste = (erreurs || []).map((e) => {
      const q = (questions || []).find((qq) => qq.id === e.question_id);
      const attempt = attempts.find((a) => a.id === e.attempt_id);
      return {
        enonce: q?.enonce || '—',
        ordre: q?.ordre,
        statut: e.statut,
        titreQcm: attempt?.qcms?.titre || '—',
        matiere: matieres.find((m) => m.id === attempt?.qcms?.matiere_id)?.nom || 'Autre',
        attemptId: e.attempt_id,
      };
    });
    setQuestionsErreurs(liste);
  }

  function toggleSection(section) {
    if (sectionOuverte === section) { setSectionOuverte(null); return; }
    setSectionOuverte(section);
    if (section === 'erreurs') chargerDetailErreurs();
  }

  async function changerStatut(nouveauStatutCompte, nouveauCompteActif) {
    const { data: session } = await supabase.auth.getSession();
    await supabase.from('profiles').update({ statut_compte: nouveauStatutCompte, compte_actif: nouveauCompteActif }).eq('id', id);
    await supabase.from('historique_comptes').insert({
      action: nouveauCompteActif ? 'activation_abonnement' : 'desactivation_abonnement',
      cible_id: id,
      effectue_par: session.session.user.id,
      details: `${etudiant.pseudo} → ${nouveauStatutCompte}${nouveauCompteActif ? '' : ' (désactivé)'}`,
    });
    await envoyerNotification(
      id, 'abonnement',
      nouveauCompteActif ? 'Ton abonnement a été activé.' : 'Ton compte a été désactivé. Contacte ton tuteur.',
      '/profil'
    );

    const { data: autresAdmins } = await supabase
      .from('profiles')
      .select('id')
      .in('role', ['tuteur', 'proprietaire'])
      .neq('id', session.session.user.id);
    if (autresAdmins && autresAdmins.length > 0) {
      await envoyerNotificationGroupe(
        autresAdmins.map((a) => a.id), 'compte_admin',
        `Le compte de ${etudiant.pseudo} a été ${nouveauCompteActif ? 'activé/modifié' : 'désactivé'}.`,
        `/etudiants/${id}`
      );
    }

    charger();
  }

  async function changerCategorie(nouvelleCategorie) {
    const { data: session } = await supabase.auth.getSession();
    await supabase.from('profiles').update({ categorie_compte: nouvelleCategorie || null }).eq('id', id);
    await supabase.from('historique_comptes').insert({
      action: 'changement_categorie',
      cible_id: id,
      effectue_par: session.session.user.id,
      details: `${etudiant.pseudo} → ${nouvelleCategorie === 'annale' ? 'étudiant annale' : 'étudiant normal'}`,
    });
    charger();
  }

  async function basculerCompteClassement(matiereId, valeurActuelle) {
    await supabase.from('profil_matieres').update({ compte_classement: !valeurActuelle }).eq('profile_id', id).eq('matiere_id', matiereId);
    charger();
  }

  async function renvoyerInvitation() {
    setRenvoiEnCours(true);
    setMessageRenvoi('');
    const { data: session } = await supabase.auth.getSession();
    let res, result;
    try {
      res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resend-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.session.access_token}` },
        body: JSON.stringify({ id, nouvel_email: nouvelEmailInvitation.trim() || undefined, redirect_url: window.location.origin }),
      });
      result = await res.json().catch(() => ({}));
    } catch {
      setRenvoiEnCours(false);
      setMessageRenvoi("Erreur : impossible de contacter le serveur. Vérifie ta connexion et réessaie.");
      return;
    }
    setRenvoiEnCours(false);
    if (!res.ok) { setMessageRenvoi('Erreur : ' + (result.error || 'une erreur inconnue est survenue.')); return; }
    setMessageRenvoi('Invitation renvoyée.');
    setNouvelEmailInvitation('');
    charger();
  }

  async function supprimerDefinitivement() {
    setSuppressionEnCours(true);
    const { data: session } = await supabase.auth.getSession();
    let res, result;
    try {
      res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.session.access_token}` },
        body: JSON.stringify({ user_id: id }),
      });
      result = await res.json().catch(() => ({}));
    } catch {
      setSuppressionEnCours(false);
      alert("Erreur : impossible de contacter le serveur. Vérifie ta connexion et réessaie.");
      return;
    }
    setSuppressionEnCours(false);
    if (!res.ok) { alert('Erreur : ' + (result.error || 'une erreur inconnue est survenue.')); return; }
    navigate('/comptes');
  }

  async function changerPseudo() {
    if (!nouveauPseudo.trim()) return;
    const { data: session } = await supabase.auth.getSession();
    const { error } = await supabase.from('profiles').update({ pseudo: nouveauPseudo.trim() }).eq('id', id);
    if (error) { setMessagePseudo('Erreur : ' + error.message); return; }

    await supabase.from('historique_comptes').insert({
      action: 'changement_pseudo',
      cible_id: id,
      effectue_par: session.session.user.id,
      details: `${etudiant.pseudo} renommé en ${nouveauPseudo.trim()}`,
    });

    await envoyerNotification(id, 'compte_modifie', `Ton pseudo a été changé en "${nouveauPseudo.trim()}".`, '/profil');

    setMessagePseudo('Pseudo mis à jour.');
    charger();
  }

  if (!etudiant) return <div style={{ padding: 40 }}>Chargement...</div>;

  const nb = attempts.length;
  const moyenne = nb > 0 ? (attempts.reduce((s, a) => s + Number(a.score), 0) / nb).toFixed(1) : '—';

  const tauxReussite = nb > 0
    ? Math.round((attempts.reduce((s, a) => s + Number(a.score) / (a.qcms?.nb_questions || 1), 0) / nb) * 100)
    : null;

  const parMatiere = {};
  attempts.forEach((a) => {
    const nomMat = matieres.find((m) => m.id === a.qcms?.matiere_id)?.nom || 'Autre';
    if (!parMatiere[nomMat]) parMatiere[nomMat] = { total: 0, count: 0 };
    parMatiere[nomMat].total += Number(a.score) / (a.qcms?.nb_questions || 1);
    parMatiere[nomMat].count += 1;
  });

  function labelType(qcm) {
    if (qcm?.is_kholle) return 'Kholle';
    if (qcm?.is_annale) return 'Annale';
    if (qcm?.type_qcm === 'concours_blanc') return 'Concours blanc';
    return 'Entraînement';
  }
  const parType = {};
  attempts.forEach((a) => {
    const t = labelType(a.qcms);
    parType[t] = (parType[t] || 0) + 1;
  });

  const derniereActivite = attempts.length > 0 ? new Date(attempts[0].created_at).toLocaleDateString('fr-FR') : '—';

  const couleurStatut = { partiel: 'var(--warning)', incorrect: 'var(--error)' };
  const labelStatut = { partiel: 'Partiel', incorrect: 'Faux' };

  function labelTypeTri(qcm) {
    if (qcm?.is_kholle) return 'kholle';
    if (qcm?.is_annale) return 'annale';
    if (qcm?.type_qcm === 'concours_blanc') return 'concours_blanc';
    return 'entrainement';
  }

  const attemptsFiltrees = attempts
    .filter((a) => {
      if (rechercheTentative.trim()) {
        const texte = rechercheTentative.trim().toLowerCase().replace('#', '');
        const numeroStr = String(a.qcms?.numero || '').padStart(4, '0');
        if (!a.qcms?.titre?.toLowerCase().includes(texte) && !numeroStr.includes(texte)) return false;
      }
      if (filtreTypeTentative !== 'tous' && labelTypeTri(a.qcms) !== filtreTypeTentative) return false;
      if (filtreMatiereTentative && a.qcms?.matiere_id !== filtreMatiereTentative) return false;
      return true;
    })
    .sort((a, b) => {
      if (triTentative === 'score_desc') return b.score - a.score;
      if (triTentative === 'score_asc') return a.score - b.score;
      return new Date(b.created_at) - new Date(a.created_at);
    });

  // Regroupement du carnet d'erreurs par matière puis QCM
  const erreursGroupees = {};
  (questionsErreurs || [])
    .filter((q) => !filtreMatiereErreur || q.matiere === filtreMatiereErreur)
    .forEach((q) => {
      if (!erreursGroupees[q.matiere]) erreursGroupees[q.matiere] = {};
      if (!erreursGroupees[q.matiere][q.titreQcm]) erreursGroupees[q.matiere][q.titreQcm] = [];
      erreursGroupees[q.matiere][q.titreQcm].push(q);
    });

  return (
    <div className="container" style={{ maxWidth: 720 }}>
      <Link to="/comptes" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textDecoration: 'none' }}>← Retour aux comptes</Link>

      <div className="profile-header" style={{ marginTop: 12 }}>
        <div className="avatar-big">{etudiant.pseudo.slice(0, 2).toUpperCase()}</div>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: '0 0 4px' }}>{etudiant.pseudo}</h2>
          {(etudiant.nom_complet || etudiant.email) && (
            <p style={{ margin: '0 0 4px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              {[etudiant.nom_complet, etudiant.email].filter(Boolean).join(' · ')}
            </p>
          )}
          <p style={{ margin: 0 }}>Dernière activité : {derniereActivite}</p>
        </div>
        <span className={`status-tag ${etudiant.compte_actif && etudiant.statut_compte !== 'suspendu' ? (etudiant.statut_compte === 'essai_gratuit' ? 'status-pending' : 'status-validated') : 'status-inactive'}`}>
          {etudiant.statut_compte === 'suspendu' ? 'Suspendu' : !etudiant.compte_actif ? 'Désactivé' : etudiant.statut_compte === 'essai_gratuit' ? 'Essai gratuit' : 'Actif'}
        </span>
      </div>

      <div className="settings-card">
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Pseudo</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={nouveauPseudo} onChange={(e) => setNouveauPseudo(e.target.value)} />
            <button className="btn btn-outline" onClick={changerPseudo}>Enregistrer</button>
          </div>
          {messagePseudo && <p style={{ fontSize: '0.78rem', color: 'var(--success)', marginTop: 6 }}>{messagePseudo}</p>}
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="stat-box" style={{ cursor: 'pointer' }} onClick={() => toggleSection('tentatives')}>
          <div className="stat-value">{moyenne}</div>
          <div className="stat-label">Score moyen</div>
        </div>
        <div className="stat-box" style={{ cursor: 'pointer' }} onClick={() => toggleSection('tentatives')}>
          <div className="stat-value" style={{ color: 'var(--text-main)' }}>{nb}</div>
          <div className="stat-label">QCM faits</div>
        </div>
        <div className="stat-box">
          <div className="stat-value" style={{ color: 'var(--success)' }}>{tauxReussite !== null ? `${tauxReussite}%` : '—'}</div>
          <div className="stat-label">Réussite</div>
        </div>
        <div className="stat-box" style={{ cursor: 'pointer' }} onClick={() => toggleSection('erreurs')}>
          <div className="stat-value" style={{ color: 'var(--warning)' }}>{nbErreurs}</div>
          <div className="stat-label">Carnet d'erreurs</div>
        </div>
      </div>

      {Object.keys(parMatiere).length > 0 && (
        <div className="settings-card">
          <h3>Par matière</h3>
          <div className="detail-subject-list">
            {Object.entries(parMatiere).map(([nom, v]) => {
              const infoMat = matieres.find((m) => m.nom === nom);
              const pct = Math.round((v.total / v.count) * 100);
              return (
                <div key={nom} className="detail-subject-row">
                  {infoMat?.couleur && <span className="dot" style={{ background: infoMat.couleur }} />}
                  <span className="ds-name">{nom}</span>
                  <span className="ds-score" style={{ color: pct >= 60 ? 'var(--success)' : pct >= 40 ? 'var(--warning)' : 'var(--error)' }}>{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {Object.keys(parType).length > 0 && (
        <div className="settings-card">
          <h3>Par type de QCM</h3>
          <div className="detail-subject-list">
            {Object.entries(parType).map(([type, count]) => (
              <div key={type} className="detail-subject-row">
                <span className="ds-name">{type}</span>
                <span className="ds-score">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {sectionOuverte === 'tentatives' && (
        <div className="settings-card">
          <h3>Dernières tentatives</h3>
          {attempts.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Aucune tentative.</p>}
          <div className="history-table">
            {attempts.slice(0, 3).map((a) => {
              const infoMat = matieres.find((m) => m.id === a.qcms?.matiere_id);
              return (
                <Link key={a.id} to={`/resultats/${a.id}`} className="history-row" style={{ '--row-color': infoMat?.couleur }}>
                  <div className="bar" />
                  <div>
                    <div className="h-name">{a.qcms?.titre}</div>
                    <div className="h-sub">{infoMat?.nom || 'Autre'} · {labelType(a.qcms)}</div>
                  </div>
                  <div className="h-type" />
                  <div className="h-date">{new Date(a.created_at).toLocaleDateString('fr-FR')}</div>
                  <div className="h-score" style={{ color: 'var(--accent)' }}>{a.score}</div>
                  <span />
                </Link>
              );
            })}
          </div>
          {attempts.length > 3 && (
            <button className="btn btn-outline" style={{ width: '100%', marginTop: 12 }} onClick={() => setPopupOuverte('tentatives')}>
              Voir tout ({attempts.length})
            </button>
          )}
        </div>
      )}

      {sectionOuverte === 'erreurs' && (
        <div className="settings-card">
          <h3>Carnet d'erreurs</h3>
          {questionsErreurs === null && <p style={{ color: 'var(--text-muted)' }}>Chargement...</p>}
          {questionsErreurs && questionsErreurs.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Aucune erreur enregistrée.</p>}
          <div className="detail-error-list">
            {(questionsErreurs || []).slice(0, 3).map((q, idx) => (
              <Link key={idx} to={`/resultats/${q.attemptId}`} className="detail-error-row" style={{ textDecoration: 'none', color: 'var(--text-main)' }}>
                <span className="de-q">{q.matiere} · Q{q.ordre} — {q.enonce.slice(0, 60)}</span>
                <span className="de-count" style={{ color: couleurStatut[q.statut] }}>{labelStatut[q.statut]}</span>
              </Link>
            ))}
          </div>
          {questionsErreurs && questionsErreurs.length > 3 && (
            <button className="btn btn-outline" style={{ width: '100%', marginTop: 12 }} onClick={() => setPopupOuverte('erreurs')}>
              Voir tout ({questionsErreurs.length})
            </button>
          )}
        </div>
      )}

      <div className="settings-card">
        <h3>Filière</h3>
        {editionFiliereOuverte ? (
          <SelecteurFiliere
            profileId={id}
            avertissementIrreversible={false}
            valeurInitiale={{
              modaliteId: etudiant.modalite_id,
              sousFiliereIds: profilSousFilieres.map((p) => p.sous_filiere_id),
              matieresFacultativesIds: profilMatieres.filter((p) => p.statut === 'facultative').map((p) => p.matiere_id),
            }}
            onApplique={() => { setEditionFiliereOuverte(false); charger(); }}
            onAnnuler={() => setEditionFiliereOuverte(false)}
          />
        ) : (
          <>
            <div className="recap-info-list">
              <div className="recap-info-item"><span>Modalité</span><span>{modalites.find((m) => m.id === etudiant.modalite_id)?.nom || 'Non renseignée'}</span></div>
              <div className="recap-info-item">
                <span>Sous-filière(s)</span>
                <span>{profilSousFilieres.map((p) => sousFilieres.find((s) => s.id === p.sous_filiere_id)?.nom).filter(Boolean).join(', ') || '—'}</span>
              </div>
            </div>

            {profilMatieres.length > 0 && (
              <div style={{ marginTop: 16 }}>
                {profilMatieres.map((p) => {
                  const nomMat = matieres.find((m) => m.id === p.matiere_id)?.nom || '—';
                  return (
                    <div key={p.matiere_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ flex: 1 }}>{nomMat}</span>
                      <span className={`status-tag ${p.statut === 'obligatoire' ? 'status-validated' : 'status-pending'}`}>{p.statut}</span>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        <input type="checkbox" checked={p.compte_classement} onChange={() => basculerCompteClassement(p.matiere_id, p.compte_classement)} />
                        Compte pour le classement
                      </label>
                    </div>
                  );
                })}
              </div>
            )}

            <button className="btn btn-outline btn-sm" style={{ marginTop: 16 }} onClick={() => setEditionFiliereOuverte(true)}>
              {etudiant.modalite_id ? 'Modifier la filière' : 'Définir la filière'}
            </button>
          </>
        )}
      </div>

      <div className="settings-card">
        <h3>Gestion du compte</h3>

        <div className="field">
          <label>Catégorie</label>
          <select value={etudiant.categorie_compte || ''} onChange={(e) => changerCategorie(e.target.value)}>
            <option value="">Étudiant normal</option>
            <option value="annale">Étudiant annale</option>
          </select>
          <p className="field-hint">Un étudiant annale ne voit que les QCM, quel que soit le mode actuel du site.</p>
        </div>

        {!etudiant.mot_de_passe_defini && (
          <div className="field">
            <label>Invitation en attente</label>
            <p className="field-hint" style={{ marginTop: 0 }}>Ce compte n'a pas encore défini son mot de passe.</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                type="email"
                value={nouvelEmailInvitation}
                onChange={(e) => setNouvelEmailInvitation(e.target.value)}
                placeholder={etudiant.email || 'Corriger l\'email avant renvoi (optionnel)'}
                style={{ flex: 1, minWidth: 200 }}
              />
              <button className="btn btn-outline" onClick={renvoyerInvitation} disabled={renvoiEnCours}>
                {renvoiEnCours ? 'Envoi...' : "Renvoyer l'invitation"}
              </button>
            </div>
            {messageRenvoi && <p style={{ fontSize: '0.78rem', color: messageRenvoi.startsWith('Erreur') ? 'var(--error)' : 'var(--success)', marginTop: 6 }}>{messageRenvoi}</p>}
          </div>
        )}

        <div className="detail-actions-row" style={{ paddingTop: 0, borderTop: 'none', marginTop: 0 }}>
          {etudiant.compte_actif && etudiant.statut_compte !== 'suspendu' ? (
            <button className="btn btn-warning-outline" onClick={() => changerStatut('suspendu', true)}>Suspendre l'abonnement</button>
          ) : (
            <button className="btn btn-primary" onClick={() => changerStatut('actif', true)}>Activer l'abonnement</button>
          )}
          <button className="btn btn-danger-outline" onClick={() => changerStatut(etudiant.statut_compte, false)}>Désactiver le compte</button>
        </div>

        <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-outline btn-sm" onClick={() => setZoneSuppressionOuverte((v) => !v)}>
            {zoneSuppressionOuverte ? 'Annuler' : 'Supprimer définitivement ce compte...'}
          </button>

          {zoneSuppressionOuverte && (
            <div className="warn-box" style={{ marginTop: 14 }}>
              <div style={{ flex: 1 }}>
                <b>Zone dangereuse.</b> Supprime définitivement ce compte et toutes ses données (tentatives, historique).
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                  <input
                    value={confirmationSuppression}
                    onChange={(e) => setConfirmationSuppression(e.target.value)}
                    placeholder={`Tape "${etudiant.pseudo}" pour confirmer`}
                    style={{ flex: 1, minWidth: 200 }}
                  />
                  <button className="btn btn-danger-outline btn-sm" disabled={confirmationSuppression !== etudiant.pseudo || suppressionEnCours} onClick={supprimerDefinitivement}>
                    {suppressionEnCours ? 'Suppression...' : 'Confirmer'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {popupOuverte === 'tentatives' && (
        <div className="modal-overlay open" onClick={() => setPopupOuverte(null)}>
          <div onClick={(e) => e.stopPropagation()} className="modal-box" style={{ maxWidth: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>Toutes les tentatives</h3>
              <button onClick={() => setPopupOuverte(null)} style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>

            <input value={rechercheTentative} onChange={(e) => setRechercheTentative(e.target.value)} placeholder="Rechercher un QCM (nom ou #0001)..." style={{ marginBottom: 12 }} />

            <div className="filter-row">
              {[['tous', 'Tous'], ['entrainement', 'Entraînement'], ['concours_blanc', 'Concours blanc'], ['kholle', 'Kholle'], ['annale', 'Annale']].map(([val, label]) => (
                <button key={val} className={`filter-chip ${filtreTypeTentative === val ? 'active' : ''}`} onClick={() => setFiltreTypeTentative(val)}>{label}</button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <select className="select-filter" value={filtreMatiereTentative} onChange={(e) => setFiltreMatiereTentative(e.target.value)} style={{ flex: 1 }}>
                <option value="">Toutes les matières</option>
                {matieres.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
              </select>
              <select className="select-filter" value={triTentative} onChange={(e) => setTriTentative(e.target.value)} style={{ flex: 1 }}>
                <option value="date_desc">Plus récent</option>
                <option value="score_desc">Meilleur score</option>
                <option value="score_asc">Moins bon score</option>
              </select>
            </div>

            <div style={{ overflowY: 'auto', flex: 1 }}>
              {attemptsFiltrees.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Aucun résultat.</p>}
              <div className="history-table">
                {attemptsFiltrees.map((a) => {
                  const infoMat = matieres.find((m) => m.id === a.qcms?.matiere_id);
                  return (
                    <Link key={a.id} to={`/resultats/${a.id}`} className="history-row" style={{ '--row-color': infoMat?.couleur }}>
                      <div className="bar" />
                      <div>
                        <div className="h-name">{a.qcms?.titre}</div>
                        <div className="h-sub">{infoMat?.nom || 'Autre'} · {labelType(a.qcms)}</div>
                      </div>
                      <div className="h-type" />
                      <div className="h-date">{new Date(a.created_at).toLocaleDateString('fr-FR')}</div>
                      <div className="h-score" style={{ color: 'var(--accent)' }}>{a.score}</div>
                      <span />
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {popupOuverte === 'erreurs' && (
        <div className="modal-overlay open" onClick={() => setPopupOuverte(null)}>
          <div onClick={(e) => e.stopPropagation()} className="modal-box" style={{ maxWidth: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>Carnet d'erreurs complet</h3>
              <button onClick={() => setPopupOuverte(null)} style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>

            <div className="filter-row">
              <button className={`filter-chip ${!filtreMatiereErreur ? 'active' : ''}`} onClick={() => setFiltreMatiereErreur('')}>Toutes</button>
              {matieres.map((m) => (
                <button key={m.id} className={`filter-chip ${filtreMatiereErreur === m.nom ? 'active' : ''}`} onClick={() => setFiltreMatiereErreur(m.nom)}>{m.nom}</button>
              ))}
            </div>

            <div style={{ overflowY: 'auto', flex: 1 }}>
              {Object.keys(erreursGroupees).length === 0 && <p style={{ color: 'var(--text-muted)' }}>Aucun résultat.</p>}
              {Object.entries(erreursGroupees).map(([matiere, qcmsObj]) => (
                <div key={matiere} className="subject-section" style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>{matiere}</div>
                  {Object.entries(qcmsObj).map(([titreQcm, questions]) => (
                    <div key={titreQcm} style={{ marginBottom: 10, paddingLeft: 12, borderLeft: '2px solid var(--border)' }}>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 4 }}>{titreQcm}</div>
                      {questions.map((q, idx) => (
                        <Link key={idx} to={`/resultats/${q.attemptId}`} style={{ display: 'block', fontSize: '0.85rem', padding: '4px 0', textDecoration: 'none', color: 'var(--text-main)' }}>
                          Q{q.ordre} — <span style={{ color: couleurStatut[q.statut] }}>{labelStatut[q.statut]}</span> : {q.enonce.slice(0, 70)}
                        </Link>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
