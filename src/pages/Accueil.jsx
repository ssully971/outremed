import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

export default function Accueil() {
  const [profil, setProfil] = useState(null);
  const [stats, setStats] = useState(null);
  const [dernierQcms, setDernierQcms] = useState([]);
  const [kholles, setKholles] = useState([]);
  const [whatsapp, setWhatsapp] = useState('');
  const [citation, setCitation] = useState('');
  const [editionCitation, setEditionCitation] = useState(false);
  const [nouvelleCitation, setNouvelleCitation] = useState('');
  const [reprise, setReprise] = useState(null);
  const [serie, setSerie] = useState(0);
  const [prochaineEcheance, setProchaineEcheance] = useState(null);
  const [signalementsNonTraites, setSignalementsNonTraites] = useState(0);
  const [etudiantsInactifs, setEtudiantsInactifs] = useState([]);
  const [nbTuteurs, setNbTuteurs] = useState(0);

  const [semaineKholleActuelle, setSemaineKholleActuelle] = useState(null);
  const [kholleActive, setKholleActive] = useState(false);
  const [qcmsKholleDetail, setQcmsKholleDetail] = useState([]);
  const [progressionParMatiere, setProgressionParMatiere] = useState([]);
  const [classementApercu, setClassementApercu] = useState(null);
  const [monId, setMonId] = useState(null);
  const [idsQcmsSemaineActuelle, setIdsQcmsSemaineActuelle] = useState([]);

  const [comptesAActiver, setComptesAActiver] = useState([]);
  const [equipeTuteurs, setEquipeTuteurs] = useState([]);
  const [matieresMap, setMatieresMap] = useState({});
  const [mesAttemptsIds, setMesAttemptsIds] = useState(new Set());
  const [fileAnnonces, setFileAnnonces] = useState([]);

  const navigate = useNavigate();

  useEffect(() => {
    async function charger() {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) { navigate('/'); return; }
      const uid = session.session.user.id;

      const { data: p } = await supabase.from('profiles').select('*').eq('id', uid).single();
      setProfil(p);
      setMonId(uid);

      const { data: toutesAnnonces } = await supabase.from('annonces').select('*').neq('cree_par', uid).order('created_at', { ascending: false });
      const { data: vues } = await supabase.from('annonces_vues').select('annonce_id').eq('user_id', uid);
      const idsVues = new Set((vues || []).map((v) => v.annonce_id));
      const maintenantAnnonce = new Date();
      const applicables = (toutesAnnonces || []).filter((a) => {
        if (idsVues.has(a.id)) return false;
        if (a.expire_le && new Date(a.expire_le) < maintenantAnnonce) return false;
        if (a.audience === 'tous') return true;
        if (a.audience === 'tuteurs') return p.role === 'tuteur';
        if (a.audience === 'etudiants') return p.role === 'etudiant';
        if (a.audience === 'liste') return (a.destinataires || []).includes(uid);
        return false;
      });
      setFileAnnonces(applicables);

      const { data: param } = await supabase.from('parametres').select('valeur').eq('cle', 'citation_accueil').single();
      setCitation(param?.valeur || '');
      setNouvelleCitation(param?.valeur || '');

      const { data: paramW } = await supabase.from('parametres').select('valeur').eq('cle', 'whatsapp_contact').single();
      setWhatsapp(paramW?.valeur || '');

      const { data: qcms } = await supabase.from('qcms').select('*').eq('visible', true).eq('est_prive', false).order('created_at', { ascending: false }).limit(5);
      setDernierQcms((qcms || []).filter((q) => !q.is_kholle));
      setKholles((qcms || []).filter((q) => q.is_kholle));

      const { data: matieresListe } = await supabase.from('matieres').select('*').eq('est_prive', false);
      const mMap = {};
      (matieresListe || []).forEach((m) => { mMap[m.id] = { nom: m.nom, couleur: m.couleur || '#FF3EB5', emoji: m.emoji || null }; });
      setMatieresMap(mMap);

      const aujourdhui = new Date().toISOString().slice(0, 10);
      const { data: echeance } = await supabase.from('echeances').select('*').gte('date', aujourdhui).order('date').limit(1);
      setProchaineEcheance((echeance && echeance[0]) || null);

      if (p.role === 'etudiant') {
        const { data: attempts } = await supabase.from('attempts').select('score, created_at, qcm_id, qcms(matiere_id)').eq('user_id', uid);
        const nb = (attempts || []).length;
        const total = (attempts || []).reduce((s, a) => s + Number(a.score), 0);
        setStats({ nb, moyenne: nb > 0 ? (total / nb).toFixed(1) : '—' });
        setMesAttemptsIds(new Set((attempts || []).map((a) => a.qcm_id)));

        const joursActifs = [...new Set((attempts || []).map((a) => new Date(a.created_at).toISOString().slice(0, 10)))];
        let compteur = 0;
        if (joursActifs.length > 0) {
          const curseur = new Date();
          curseur.setHours(0, 0, 0, 0);
          const todayStr = curseur.toISOString().slice(0, 10);
          if (!joursActifs.includes(todayStr)) curseur.setDate(curseur.getDate() - 1);
          while (joursActifs.includes(curseur.toISOString().slice(0, 10))) {
            compteur++;
            curseur.setDate(curseur.getDate() - 1);
          }
        }
        setSerie(compteur);

        const { data: tousLesQcms } = await supabase.from('qcms').select('id, matiere_id').eq('visible', true).eq('publie', true).eq('est_prive', false);
        const qcmIdsFaits = new Set((attempts || []).map((a) => a.qcm_id));
        const progression = Object.entries(matieresMap).map(([mid, info]) => {
          const qcmsDeLaMatiere = (tousLesQcms || []).filter((q) => q.matiere_id === mid);
          const faits = qcmsDeLaMatiere.filter((q) => qcmIdsFaits.has(q.id)).length;
          return { nom: info.nom, couleur: info.couleur, emoji: info.emoji, pct: qcmsDeLaMatiere.length > 0 ? Math.round((faits / qcmsDeLaMatiere.length) * 100) : 0 };
        }).slice(0, 6);
        setProgressionParMatiere(progression);

        const { data: semainesAVenir } = await supabase.from('semaines_kholle').select('*').gte('fin', new Date().toISOString()).order('debut', { ascending: true }).limit(5);
        const semaineEnCours = (semainesAVenir || []).find((s) => new Date(s.debut) <= new Date());
        const semainePertinente = semaineEnCours || (semainesAVenir || [])[0] || null;

        if (semainePertinente) {
          setSemaineKholleActuelle(semainePertinente);
          setKholleActive(!!semaineEnCours);

          if (semaineEnCours) {
            const { data: qcmsSemaine } = await supabase.from('qcms').select('id, titre, matiere_id, nb_questions').eq('semaine_kholle_id', semainePertinente.id);
            const detail = (qcmsSemaine || []).map((q) => {
              const tentative = (attempts || []).find((a) => a.qcm_id === q.id);
              const infoMatiere = matieresMap[q.matiere_id] || { nom: 'Autre', couleur: '#FF3EB5', emoji: null };
              return { titre: q.titre, matiere: infoMatiere.nom, couleur: infoMatiere.couleur, emoji: infoMatiere.emoji, qcmId: q.id, fait: !!tentative, score: tentative?.score, nb_questions: q.nb_questions };
            });
            setQcmsKholleDetail(detail);

            const idsQcmsSemaine = (qcmsSemaine || []).map((q) => q.id);
            setIdsQcmsSemaineActuelle(idsQcmsSemaine);
            if (p.afficher_position_classement) {
              await chargerClassementApercu(idsQcmsSemaine, uid);
            }
          }
        }

        let meilleure = null;
        for (const cle of Object.keys(localStorage)) {
          if (!cle.startsWith('outremed_progression_')) continue;
          const parties = cle.split('_');
          const qcmId = parties[2];
          const userIdDeLaCle = parties[3];
          if (userIdDeLaCle !== uid) continue;

          try {
            const donnees = JSON.parse(localStorage.getItem(cle));
            if (donnees.dateDebut) {
              const { data: qcmInfo } = await supabase.from('qcms').select('titre, duree_minutes, type_qcm, matiere_id').eq('id', qcmId).single();
              if (!qcmInfo) continue;
              const dureeSec = (qcmInfo.duree_minutes || 30) * 60;
              const ecouleSec = Math.floor((Date.now() - new Date(donnees.dateDebut).getTime()) / 1000);
              if (ecouleSec >= dureeSec) continue;
              if (!meilleure || donnees.dernierModif > meilleure.dernierModif) {
                meilleure = { qcmId, titre: qcmInfo.titre, dernierModif: donnees.dernierModif || 0, matiereId: qcmInfo.matiere_id };
              }
            } else {
              const { data: qcmInfo } = await supabase.from('qcms').select('titre, matiere_id').eq('id', qcmId).single();
              if (!qcmInfo) continue;
              if (!meilleure || donnees.dernierModif > meilleure.dernierModif) {
                meilleure = { qcmId, titre: qcmInfo.titre, dernierModif: donnees.dernierModif || 0, matiereId: qcmInfo.matiere_id };
              }
            }
          } catch { /* entrée corrompue, on ignore */ }
        }
        if (meilleure) {
          const infoMat = matieresMap[meilleure.matiereId] || {};
          meilleure.matiereNom = infoMat.nom || '';
          meilleure.couleur = infoMat.couleur || '#FF3EB5';
        }
        setReprise(meilleure);
      } else {
        const { data: aVerifier } = await supabase.from('qcms').select('id').eq('verifie', false);
        const { data: etudiants } = await supabase.from('profiles').select('id, pseudo, statut_compte, essai_fin, compte_actif').eq('role', 'etudiant');
        setStats({ aVerifier: (aVerifier || []).length, nbEtudiants: (etudiants || []).length });

        const { count: nbSignalements } = await supabase.from('signalements_erreur').select('id', { count: 'exact', head: true }).eq('traite', false);
        setSignalementsNonTraites(nbSignalements || 0);

        const enEssai = (etudiants || []).filter((e) => e.statut_compte === 'essai_gratuit' && e.compte_actif);
        setComptesAActiver(enEssai);

        const { data: toutesAttempts } = await supabase.from('attempts').select('user_id, created_at');
        const maintenant = new Date();
        const inactifs = (etudiants || []).map((e) => {
          const mesAttempts = (toutesAttempts || []).filter((a) => a.user_id === e.id);
          const derniere = mesAttempts.length > 0 ? new Date(Math.max(...mesAttempts.map((a) => new Date(a.created_at).getTime()))) : null;
          const jours = derniere ? Math.floor((maintenant - derniere) / (1000 * 60 * 60 * 24)) : null;
          return { pseudo: e.pseudo, jours };
        }).filter((e) => e.jours === null || e.jours >= 15)
          .sort((a, b) => (b.jours ?? 99999) - (a.jours ?? 99999))
          .slice(0, 3);
        setEtudiantsInactifs(inactifs);

        if (p.role === 'proprietaire') {
          const { data: tuteurs } = await supabase.from('profiles').select('id, pseudo, compte_actif').eq('role', 'tuteur');
          setNbTuteurs((tuteurs || []).filter((t) => t.compte_actif).length);

          const { data: tousQcmsPublics } = await supabase.from('qcms').select('id, cree_par').eq('est_prive', false);
          const debutMois = new Date(); debutMois.setDate(1); debutMois.setHours(0, 0, 0, 0);
          const { data: validations } = await supabase.from('historique_qcm').select('effectue_par').eq('action', 'verification').gte('created_at', debutMois.toISOString());

          const equipe = (tuteurs || []).map((t) => ({
            pseudo: t.pseudo,
            id: t.id,
            qcmAjoutes: (tousQcmsPublics || []).filter((q) => q.cree_par === t.id).length,
            validationsMois: (validations || []).filter((v) => v.effectue_par === t.id).length,
          }));
          setEquipeTuteurs(equipe);
        }
      }
    }
    charger();
  }, []);

  if (!profil) return <div style={{ padding: 40 }}>Chargement...</div>;

  const estAdmin = profil.role === 'tuteur' || profil.role === 'proprietaire';
  const estEtudiantAnnale = profil.role === 'etudiant' && profil.categorie_compte === 'annale';

  if (estEtudiantAnnale) {
    return (
      <div className="container" style={{ maxWidth: 560, textAlign: 'center', paddingTop: 80 }}>
        <div className="hero-icon-wrap" style={{ marginBottom: 20 }}>
          <span style={{ fontSize: '3rem' }}>🎓</span>
        </div>
        <h1 className="page-title">Salut {profil.pseudo} !</h1>
        <p className="page-sub">Retrouve ici toutes les annales disponibles.</p>
        <Link to="/qcm" className="btn btn-primary" style={{ textDecoration: 'none', display: 'inline-block', padding: '14px 32px' }}>
          Voir les annales →
        </Link>
      </div>
    );
  }

  async function enregistrerCitation() {
    await supabase.from('parametres').update({ valeur: nouvelleCitation }).eq('cle', 'citation_accueil');
    setCitation(nouvelleCitation);
    setEditionCitation(false);
  }

  async function fermerAnnonce(id) {
    setFileAnnonces((prev) => prev.filter((a) => a.id !== id));
    await supabase.from('annonces_vues').insert({ annonce_id: id, user_id: profil.id });
  }

  async function activerEssai(etudiantId) {
    await supabase.from('profiles').update({ statut_compte: 'actif' }).eq('id', etudiantId);
    setComptesAActiver((prev) => prev.filter((e) => e.id !== etudiantId));
  }

  async function chargerClassementApercu(idsQcmsSemaine, uid) {
    if (!idsQcmsSemaine || idsQcmsSemaine.length === 0) { setClassementApercu({ top: [], monRang: null, total: 0 }); return; }
    const { data: resultats } = await supabase.from('resultats_classement').select('user_id, score').in('qcm_id', idsQcmsSemaine);
    const { data: pseudos } = await supabase.from('profils_publics').select('id, pseudo').eq('role', 'etudiant');
    const parEtudiant = {};
    (resultats || []).forEach((r) => { parEtudiant[r.user_id] = (parEtudiant[r.user_id] || 0) + Number(r.score); });
    const classement = Object.entries(parEtudiant)
      .map(([userId, total]) => ({ userId, total, pseudo: (pseudos || []).find((p2) => p2.id === userId)?.pseudo || '—' }))
      .sort((a, b) => b.total - a.total);
    const rang = classement.findIndex((c) => c.userId === uid);
    setClassementApercu({ top: classement.slice(0, 3), monRang: rang >= 0 ? rang + 1 : null, total: classement.length });
  }

  async function basculerAffichageClassement() {
    const nouvelleValeur = !profil.afficher_position_classement;
    await supabase.from('profiles').update({ afficher_position_classement: nouvelleValeur }).eq('id', profil.id);
    setProfil((prev) => ({ ...prev, afficher_position_classement: nouvelleValeur }));
    if (nouvelleValeur) await chargerClassementApercu(idsQcmsSemaineActuelle, monId);
  }

  function decompteKholle() {
    if (!semaineKholleActuelle) return '';
    const cible = kholleActive ? semaineKholleActuelle.fin : semaineKholleActuelle.debut;
    const diffMs = new Date(cible) - new Date();
    if (diffMs <= 0) return 'Fermée';
    const jours = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const heures = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const verbe = kholleActive ? 'Ferme' : 'Ouvre';
    return jours > 0 ? `${verbe} dans ${jours}j ${heures}h` : `${verbe} dans ${heures}h`;
  }

  return (
    <div className="container">
      <div className="welcome-row">
        <div>
          <h1>Bonjour {profil.pseudo} 👋</h1>
          {editionCitation ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <textarea
                value={nouvelleCitation}
                onChange={(e) => setNouvelleCitation(e.target.value)}
                style={{ flex: 1, minHeight: 50, padding: 10, borderRadius: 8, background: 'var(--bg-panel)', color: 'var(--text-main)', border: '1px solid var(--border)' }}
              />
              <button className="btn" style={{ padding: '8px 14px', fontSize: '0.8rem' }} onClick={enregistrerCitation}>Enregistrer</button>
            </div>
          ) : (
            <p className="quote-line" style={{ cursor: estAdmin ? 'pointer' : 'default' }} onClick={() => estAdmin && setEditionCitation(true)}>
              "{citation}" {estAdmin && <span style={{ fontSize: '0.7rem' }}>✏️</span>}
            </p>
          )}
        </div>
        {!estAdmin && serie > 0 && (
          <div className="streak-badge"><span className="flame">🔥</span> {serie} jour{serie > 1 ? 's' : ''} de suite</div>
        )}
      </div>

      {estAdmin ? (
        <>
          <div className="stats-grid">
            <div className="stat-box" style={{ '--stat-color': 'var(--warning)' }}>
              <div className="stat-value" style={{ color: 'var(--warning)' }}>{stats?.aVerifier ?? '—'}</div>
              <div className="stat-label">QCM à vérifier</div>
            </div>
            <div className="stat-box">
              <div className="stat-value">{stats?.nbEtudiants ?? '—'}</div>
              <div className="stat-label">Étudiants</div>
            </div>
            <Link to="/qcm/gerer" className="stat-box">
              <div className="stat-value" style={{ color: signalementsNonTraites > 0 ? 'var(--error)' : 'var(--success)' }}>{signalementsNonTraites}</div>
              <div className="stat-label">Signalements</div>
            </Link>
            {profil.role === 'proprietaire' && (
              <Link to="/comptes" className="stat-box">
                <div className="stat-value">{nbTuteurs}</div>
                <div className="stat-label">Tuteurs actifs</div>
              </Link>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 32, flexWrap: 'wrap' }}>
            <Link to="/qcm/nouveau" className="btn" style={{ textDecoration: 'none' }}>+ Ajouter un QCM</Link>
            {profil.role === 'proprietaire' && (
              <>
                <Link to="/comptes" className="btn btn-outline" style={{ textDecoration: 'none' }}>👥 Gérer les tuteurs</Link>
                <Link to="/comptes" className="btn btn-outline" style={{ textDecoration: 'none' }}>+ Ajouter un étudiant</Link>
              </>
            )}
          </div>

          {profil.role === 'proprietaire' && comptesAActiver.length > 0 && (
            <section>
              <div className="section-title">
                <h3>Comptes à activer</h3>
                {comptesAActiver.length > 5 && <Link to="/comptes">Voir tout ({comptesAActiver.length}) →</Link>}
              </div>
              <div className="side-card">
                {comptesAActiver.slice(0, 5).map((e) => (
                  <div key={e.id} className="rank-item">
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700 }}>{e.pseudo}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Essai gratuit en cours</div>
                    </div>
                    <button className="btn btn-outline" style={{ padding: '5px 12px', fontSize: '0.78rem' }} onClick={() => activerEssai(e.id)}>Activer</button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {profil.role === 'proprietaire' && equipeTuteurs.length > 0 && (
            <section>
              <div className="section-title">
                <h3>Équipe de tuteurs</h3>
                {equipeTuteurs.length > 5 && <Link to="/comptes">Voir tout ({equipeTuteurs.length}) →</Link>}
              </div>
              <div className="side-card">
                {equipeTuteurs.slice(0, 5).map((t) => (
                  <Link key={t.id} to={`/tuteurs/${t.id}`} className="rank-item" style={{ textDecoration: 'none', color: 'var(--text-main)' }}>
                    <span style={{ flex: 1 }}>{t.pseudo}</span>
                    <span className="score">{t.qcmAjoutes} QCM · {t.validationsMois} validations</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {etudiantsInactifs.length > 0 && (
            <section>
              <div className="section-title"><h3>Étudiants inactifs</h3><Link to="/statistiques">Voir tout →</Link></div>
              <div className="side-card">
                {etudiantsInactifs.map((e, idx) => (
                  <div key={idx} className="rank-item">
                    <span style={{ flex: 1 }}>{e.pseudo}</span>
                    <span className="score" style={{ color: 'var(--warning)' }}>{e.jours === null ? 'Jamais actif' : `${e.jours} j`}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="stat-box">
            <div className="stat-value">{stats?.moyenne ?? '—'}</div>
            <div className="stat-label">Score moyen</div>
          </div>
          <div className="stat-box">
            <div className="stat-value" style={{ color: 'var(--text-main)' }}>{stats?.nb ?? 0}</div>
            <div className="stat-label">QCM faits</div>
          </div>
          <div className="stat-box">
            <div className="stat-value" style={{ color: 'var(--warning)' }}>{serie > 0 ? `🔥 ${serie}` : '—'}</div>
            <div className="stat-label">Jour(s) de suite</div>
          </div>
        </div>
      )}

      {reprise && (
        <Link to={`/qcm/${reprise.qcmId}`} className="resume-card" style={{ '--card-color': reprise.couleur }}>
          <div className="r-icon">↻</div>
          <div>
            {reprise.matiereNom && <div className="r-subject">{reprise.matiereNom}</div>}
            <div className="r-title">Reprendre : {reprise.titre}</div>
          </div>
        </Link>
      )}

      {prochaineEcheance && (
        <Link to="/planning" className="qcm-card" style={{ marginBottom: 24 }}>
          <span className="subject-tag" style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase', marginBottom: 4 }}>Prochaine échéance</span>
          <h4>{prochaineEcheance.titre}</h4>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{new Date(prochaineEcheance.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        </Link>
      )}

      {!estAdmin && semaineKholleActuelle && kholleActive && (
        <div className="kholle-banner">
          <div className="kholle-top">
            <div>
              <span className="tag">Kholle</span>
              <h3>Kholle de la semaine</h3>
              <p className="meta-info">{qcmsKholleDetail.length} matière(s)</p>
            </div>
            <span className="countdown">{decompteKholle()}</span>
          </div>
          <div className="kholle-subjects">
            {qcmsKholleDetail.map((q, idx) => (
              <Link key={idx} to={`/qcm/${q.qcmId}`} className="kholle-subject-chip" style={{ '--sub-color': q.couleur }}>
                {q.emoji ? <span>{q.emoji}</span> : <span className="dot" />}
                {q.matiere}
                <span className="qstatus">{q.fait ? `${q.score}/${q.nb_questions}` : 'à faire'}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {!estAdmin && semaineKholleActuelle && !kholleActive && (
        <div className="kholle-banner">
          <div className="kholle-top">
            <div>
              <span className="tag">Kholle</span>
              <h3>Prochaine kholle</h3>
              <p className="meta-info">Pas encore ouverte</p>
            </div>
            <span className="countdown">{decompteKholle()}</span>
          </div>
        </div>
      )}

      {!estAdmin && semaineKholleActuelle && kholleActive && (
        <section>
          <div className="section-title">
            <h3>Classement de la kholle</h3>
            <button onClick={basculerAffichageClassement}>{profil.afficher_position_classement ? 'Masquer' : 'Afficher'}</button>
          </div>
          <div className="side-card">
            {profil.afficher_position_classement && classementApercu ? (
              classementApercu.top.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: 0 }}>Personne n'a encore participé à cette kholle.</p>
              ) : (
                <>
                  {classementApercu.top.map((c, idx) => (
                    <div key={idx} className="rank-item">
                      <span className={`pos ${idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? 'bronze' : ''}`}>{idx + 1}</span>
                      <span style={{ flex: 1 }}>{c.pseudo}</span>
                      <span className="score">{c.total}</span>
                    </div>
                  ))}
                  {classementApercu.monRang && classementApercu.monRang > 3 && (
                    <div className="rank-item me">
                      <span className="pos">{classementApercu.monRang}</span>
                      <span style={{ flex: 1 }}>Toi</span>
                    </div>
                  )}
                </>
              )
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: 0 }}>Classement masqué. Clique sur "Afficher" pour le voir.</p>
            )}
          </div>
        </section>
      )}

      {!estAdmin && progressionParMatiere.length > 0 && (
        <section>
          <div className="section-title"><h3>Par matière</h3></div>
          <div className="subjects-grid">
            {progressionParMatiere.map((m, idx) => (
              <div key={idx} className="subject-card" style={{ '--sub-color': m.couleur }}>
                <div className="icon-circle">{m.emoji || m.nom.slice(0, 1).toUpperCase()}</div>
                <h4>{m.nom}</h4>
                <div className="progress-bar"><div className="progress-fill" style={{ width: `${m.pct}%` }} /></div>
                <div className="progress-label">{m.pct}% complété</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {kholles.length > 0 && (
        <section>
          <div className="section-title"><h3>Kholles de la semaine</h3></div>
          <div className="qcm-row">
            {kholles.map((q) => {
              const info = matieresMap[q.matiere_id] || { nom: '', couleur: '#FF3EB5' };
              const fait = mesAttemptsIds.has(q.id);
              return (
                <Link key={q.id} to={`/qcm/${q.id}`} className="qcm-card" style={{ '--card-color': info.couleur }}>
                  {info.nom && <span className="subject-tag">{info.emoji ? `${info.emoji} ` : ''}{info.nom}</span>}
                  <h4>{q.titre}</h4>
                  <div className="meta">
                    <span>{q.nb_questions} questions</span>
                    {!estAdmin && <span className={`status-pill ${fait ? 'status-done' : 'status-new'}`}>{fait ? 'Fait' : 'Nouveau'}</span>}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <div className="section-title"><h3>Derniers QCM ajoutés</h3></div>
        <div className="qcm-row">
          {dernierQcms.map((q) => {
            const info = matieresMap[q.matiere_id] || { nom: '', couleur: '#FF3EB5' };
            const fait = mesAttemptsIds.has(q.id);
            return (
              <Link key={q.id} to={`/qcm/${q.id}`} className="qcm-card" style={{ '--card-color': info.couleur }}>
                {info.nom && <span className="subject-tag">{info.emoji ? `${info.emoji} ` : ''}{info.nom}</span>}
                <h4>{q.titre}</h4>
                <div className="meta">
                  <span>{q.nb_questions} questions</span>
                  {!estAdmin && <span className={`status-pill ${fait ? 'status-done' : 'status-new'}`}>{fait ? 'Fait' : 'Nouveau'}</span>}
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <footer style={{
        marginTop: 40, padding: '20px 0', borderTop: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10,
        fontSize: '0.78rem', color: 'var(--text-muted)',
      }}>
        <span>Outre<span style={{ color: 'var(--accent)' }}>med</span> © {new Date().getFullYear()}</span>
        {whatsapp && <a href={whatsapp} target="_blank" rel="noreferrer" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Nous contacter</a>}
      </footer>

      {fileAnnonces.length > 0 && (
        <div className="modal-overlay open">
          <div className="modal-box" style={{ maxWidth: 420, textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: 10 }}>📣</div>
            <h3 style={{ marginBottom: 14 }}>Annonce</h3>
            <p style={{ fontSize: '0.92rem', lineHeight: 1.6, marginBottom: 22 }}>{fileAnnonces[0].message}</p>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => fermerAnnonce(fileAnnonces[0].id)}>
              Compris
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
