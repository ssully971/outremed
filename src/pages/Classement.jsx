import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

export default function Classement() {
  const [onglet, setOnglet] = useState('kholle');
  const [monProfil, setMonProfil] = useState(null);
  const [matieres, setMatieres] = useState([]);
  const [etudiants, setEtudiants] = useState([]);
  const [semaines, setSemaines] = useState([]);
  const [semaineActuelle, setSemaineActuelle] = useState(null);
  const [semaineAffichee, setSemaineAffichee] = useState(null);
  const [qcmsSemaine, setQcmsSemaine] = useState([]);
  const [attemptsSemaine, setAttemptsSemaine] = useState([]);
  const [archivesOuvertes, setArchivesOuvertes] = useState(false);

  const [semestreActif, setSemestreActif] = useState('');
  const [qcmsSemestre, setQcmsSemestre] = useState([]);
  const [attemptsSemestre, setAttemptsSemestre] = useState([]);

  const [concoursBlancs, setConcoursBlancs] = useState([]);
  const [classementConcours, setClassementConcours] = useState({});
  const [concoursOuvert, setConcoursOuvert] = useState(null);

  const [modalites, setModalites] = useState([]);
  const [sousFilieres, setSousFilieres] = useState([]);
  const [sousFiliereMatieres, setSousFiliereMatieres] = useState([]);
  const [profilSousFilieresTous, setProfilSousFilieresTous] = useState([]);
  const [profilMatieresTous, setProfilMatieresTous] = useState([]);
  const [exclusions, setExclusions] = useState([]);
  const [modaliteFiltre, setModaliteFiltre] = useState(null);
  const [sousFiliereActive, setSousFiliereActive] = useState(null);
  const [panneauAdminOuvert, setPanneauAdminOuvert] = useState(false);
  const [porteeAdmin, setPorteeAdmin] = useState(null); // { type: 'semaine'|'concours', id }
  const [selectionEtudiantsAdmin, setSelectionEtudiantsAdmin] = useState([]);

  const navigate = useNavigate();

  useEffect(() => {
    async function charger() {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) { navigate('/'); return; }
      const { data: moi } = await supabase.from('profiles').select('*').eq('id', session.session.user.id).single();
      if (moi?.role !== 'proprietaire') {
        const { data: params } = await supabase.from('parametres').select('cle, valeur').in('cle', ['classement_actif', 'mode_site']);
        const map = {}; (params || []).forEach((p) => { map[p.cle] = p.valeur; });
        const estEtudiantAnnale = moi?.role === 'etudiant' && moi?.categorie_compte === 'annale';
        const estTuteurRestreint = moi?.role === 'tuteur' && map.mode_site === 'annale';
        if (map.classement_actif === 'false' || estEtudiantAnnale || estTuteurRestreint) { navigate('/accueil'); return; }
      }
      setMonProfil(moi);

      const { data: mats } = await supabase.from('matieres').select('*');
      setMatieres(mats || []);

      const { data: etus } = await supabase.from('profils_publics').select('id, pseudo').eq('role', 'etudiant');
      setEtudiants(etus || []);

      const { data: mods } = await supabase.from('modalites').select('*').order('ordre', { ascending: true, nullsFirst: false });
      setModalites(mods || []);
      const { data: sf } = await supabase.from('sous_filieres').select('*').order('ordre', { ascending: true, nullsFirst: false });
      setSousFilieres(sf || []);
      const { data: sfm } = await supabase.from('sous_filiere_matieres').select('*');
      setSousFiliereMatieres(sfm || []);
      const { data: psf } = await supabase.from('profil_sous_filieres').select('*');
      setProfilSousFilieresTous(psf || []);
      const { data: pm } = await supabase.from('profil_matieres').select('*');
      setProfilMatieresTous(pm || []);
      const { data: excl } = await supabase.from('exclusions_classement').select('*');
      setExclusions(excl || []);

      if (moi?.role === 'etudiant') {
        const mesSousFilieres = (psf || []).filter((p) => p.profile_id === moi.id);
        if (mesSousFilieres.length > 0) setSousFiliereActive(mesSousFilieres[0].sous_filiere_id);
      }

      const { data: sem } = await supabase.from('semaines_kholle').select('*').order('date_samedi', { ascending: false });
      setSemaines(sem || []);
      if (sem && sem.length > 0) setSemaineActuelle(sem[0]);

      const { data: param } = await supabase.from('parametres').select('valeur').eq('cle', 'semestre_actif').single();
      setSemestreActif(param?.valeur || '');

      const { data: cb } = await supabase.from('qcms').select('*').eq('type_qcm', 'concours_blanc').eq('is_kholle', false).order('created_at', { ascending: false });
      setConcoursBlancs(cb || []);
    }
    charger();
  }, []);

  useEffect(() => {
    async function chargerSemaine() {
      const semaine = semaineAffichee || semaineActuelle;
      if (!semaine) return;
      const { data: qcms } = await supabase.from('qcms').select('*').eq('semaine_kholle_id', semaine.id);
      setQcmsSemaine(qcms || []);
      const { data: att } = await supabase.from('resultats_classement').select('*').in('qcm_id', (qcms || []).map((q) => q.id));
      setAttemptsSemaine(att || []);
    }
    chargerSemaine();
  }, [semaineActuelle, semaineAffichee]);

  useEffect(() => {
    async function chargerSemestre() {
      if (!semestreActif) return;
      const { data: sems } = await supabase.from('semaines_kholle').select('id').eq('semestre', semestreActif);
      const semaineIds = (sems || []).map((s) => s.id);
      if (semaineIds.length === 0) { setQcmsSemestre([]); setAttemptsSemestre([]); return; }
      const { data: qcms } = await supabase.from('qcms').select('*').in('semaine_kholle_id', semaineIds);
      setQcmsSemestre(qcms || []);
      const { data: att } = await supabase.from('resultats_classement').select('*').in('qcm_id', (qcms || []).map((q) => q.id));
      setAttemptsSemestre(att || []);
    }
    chargerSemestre();
  }, [semestreActif]);

  function nomMatiere(id) {
    return matieres.find((m) => m.id === id)?.nom || '—';
  }

  // Statut d'une matière pour la sous-filière actuellement affichée (obligatoire/facultative/null
  // = ne concerne pas). Base du cloisonnement des classements par sous-filière (item 20.5).
  function statutMatierePourSousFiliere(matiereId) {
    if (!sousFiliereActive) return null;
    return sousFiliereMatieres.find((sfm) => sfm.sous_filiere_id === sousFiliereActive && sfm.matiere_id === matiereId)?.statut || null;
  }

  // avecFacultatives=true : matières obligatoires + facultatives (classements par matière/par
  // kholle, qui ont chacun leur propre classement). avecFacultatives=false : uniquement les
  // obligatoires (alimente le classement général, qui ne doit jamais compter une facultative).
  function filtrerQcmsPourSousFiliere(qcmsGroupe, avecFacultatives) {
    return qcmsGroupe.filter((q) => {
      const statut = statutMatierePourSousFiliere(q.matiere_id);
      if (!statut) return false;
      return avecFacultatives ? true : statut === 'obligatoire';
    });
  }

  // Exclut les tentatives couvertes par une exclusion ponctuelle (item 24.1) ou par un
  // profil_matieres.compte_classement=false (exclusion permanente d'une matière pour cet
  // étudiant, item 20.4).
  function filtrerAttemptsPourClassement(attemptsGroupe, qcmsGroupeFiltre) {
    const qcmById = {};
    qcmsGroupeFiltre.forEach((q) => { qcmById[q.id] = q; });
    return attemptsGroupe.filter((a) => {
      const qcm = qcmById[a.qcm_id];
      if (!qcm) return false;
      const exclu = exclusions.some((ex) => ex.user_id === a.user_id && (
        ex.qcm_id === a.qcm_id || (qcm.semaine_kholle_id && ex.semaine_kholle_id === qcm.semaine_kholle_id)
      ));
      if (exclu) return false;
      const pm = profilMatieresTous.find((p) => p.profile_id === a.user_id && p.matiere_id === qcm.matiere_id);
      if (pm && pm.compte_classement === false) return false;
      return true;
    });
  }

  function calculerClassements(qcmsGroupe, attemptsGroupe, etudiantsGroupe) {
    const parMatiere = {};
    const matiereIds = [...new Set(qcmsGroupe.map((q) => q.matiere_id))];
    matiereIds.forEach((matId) => {
      const nom = nomMatiere(matId);
      const qcmsDeCetteMatiere = qcmsGroupe.filter((q) => q.matiere_id === matId);
      parMatiere[nom] = etudiantsGroupe
        .map((e) => {
          const scores = qcmsDeCetteMatiere.map((q) => attemptsGroupe.find((a) => a.qcm_id === q.id && a.user_id === e.id));
          const aFait = scores.some((s) => s);
          const moyenne = scores.reduce((s, a) => s + (a ? Number(a.score) : 0), 0) / qcmsDeCetteMatiere.length;
          return { pseudo: e.pseudo, score: moyenne, aFait };
        })
        .filter((r) => r.aFait)
        .sort((a, b) => b.score - a.score)
        .map((r) => ({ pseudo: r.pseudo, score: r.score.toFixed(2) }));
    });

    const general = etudiantsGroupe.map((e) => {
      const scoresEtudiant = qcmsGroupe.map((q) => {
        const tentative = attemptsGroupe.find((a) => a.qcm_id === q.id && a.user_id === e.id);
        return tentative ? Number(tentative.score) : 0;
      });
      const moyenne = qcmsGroupe.length > 0 ? scoresEtudiant.reduce((s, v) => s + v, 0) / qcmsGroupe.length : 0;
      return { pseudo: e.pseudo, moyenne: moyenne.toFixed(2) };
    }).sort((a, b) => b.moyenne - a.moyenne);

    return { parMatiere, general };
  }

  async function ouvrirConcours(qcmId) {
    if (concoursOuvert === qcmId) { setConcoursOuvert(null); return; }
    setConcoursOuvert(qcmId);
    if (!classementConcours[qcmId]) {
      const { data } = await supabase.from('resultats_classement').select('*').eq('qcm_id', qcmId).order('score', { ascending: false });
      const qcm = concoursBlancs.find((c) => c.id === qcmId);
      const idsAutorises = new Set(etudiantsSousFiliere.map((e) => e.id));
      const filtres = (data || []).filter((a) => {
        if (!idsAutorises.has(a.user_id)) return false;
        const exclu = exclusions.some((ex) => ex.user_id === a.user_id && ex.qcm_id === qcmId);
        if (exclu) return false;
        const pm = profilMatieresTous.find((p) => p.profile_id === a.user_id && p.matiere_id === qcm?.matiere_id);
        if (pm && pm.compte_classement === false) return false;
        return true;
      });
      setClassementConcours((prev) => ({ ...prev, [qcmId]: filtres }));
    }
  }

  async function rechargerExclusions() {
    const { data: excl } = await supabase.from('exclusions_classement').select('*');
    setExclusions(excl || []);
  }

  async function reinitialiserClassement() {
    if (!porteeAdmin) return;
    const libelle = porteeAdmin.type === 'semaine' ? 'cette semaine de kholle' : 'ce concours blanc';
    if (!confirm(`Réinitialiser le classement pour ${libelle} ? Toutes les exclusions manuelles existantes pour cette portée seront levées.`)) return;
    const colonne = porteeAdmin.type === 'semaine' ? 'semaine_kholle_id' : 'qcm_id';
    await supabase.from('exclusions_classement').delete().eq(colonne, porteeAdmin.id);
    setClassementConcours({});
    await rechargerExclusions();
  }

  async function exclureSelectionDuClassement() {
    if (!porteeAdmin || selectionEtudiantsAdmin.length === 0) return;
    const lignes = selectionEtudiantsAdmin.map((userId) => ({
      user_id: userId,
      qcm_id: porteeAdmin.type === 'concours' ? porteeAdmin.id : null,
      semaine_kholle_id: porteeAdmin.type === 'semaine' ? porteeAdmin.id : null,
      cree_par: monProfil.id,
    }));
    await supabase.from('exclusions_classement').insert(lignes);
    setSelectionEtudiantsAdmin([]);
    setClassementConcours({});
    await rechargerExclusions();
  }

  async function reinclure(exclusionId) {
    await supabase.from('exclusions_classement').delete().eq('id', exclusionId);
    setClassementConcours({});
    await rechargerExclusions();
  }

  if (!monProfil) return <div style={{ padding: 40 }}>Chargement...</div>;

  const estAdminClassement = monProfil.role === 'tuteur' || monProfil.role === 'proprietaire';
  const semaineAArafficher = semaineAffichee || semaineActuelle;

  const mesSousFilieresIds = profilSousFilieresTous.filter((p) => p.profile_id === monProfil.id).map((p) => p.sous_filiere_id);
  const sousFilieresChoix = estAdminClassement
    ? sousFilieres.filter((s) => modaliteFiltre && s.modalite_id === modaliteFiltre)
    : sousFilieres.filter((s) => mesSousFilieresIds.includes(s.id));

  const etudiantsSousFiliere = sousFiliereActive
    ? etudiants.filter((e) => profilSousFilieresTous.some((p) => p.profile_id === e.id && p.sous_filiere_id === sousFiliereActive))
    : [];

  const qcmsSemaineAvecFac = sousFiliereActive ? filtrerQcmsPourSousFiliere(qcmsSemaine, true) : [];
  const qcmsSemaineObligatoires = sousFiliereActive ? filtrerQcmsPourSousFiliere(qcmsSemaine, false) : [];
  const { parMatiere: parMatiereKholle } = calculerClassements(qcmsSemaineAvecFac, filtrerAttemptsPourClassement(attemptsSemaine, qcmsSemaineAvecFac), etudiantsSousFiliere);
  const { general: generalKholle } = calculerClassements(qcmsSemaineObligatoires, filtrerAttemptsPourClassement(attemptsSemaine, qcmsSemaineObligatoires), etudiantsSousFiliere);

  const qcmsSemestreAvecFac = sousFiliereActive ? filtrerQcmsPourSousFiliere(qcmsSemestre, true) : [];
  const qcmsSemestreObligatoires = sousFiliereActive ? filtrerQcmsPourSousFiliere(qcmsSemestre, false) : [];
  const { parMatiere: parMatiereSemestre } = calculerClassements(qcmsSemestreAvecFac, filtrerAttemptsPourClassement(attemptsSemestre, qcmsSemestreAvecFac), etudiantsSousFiliere);
  const { general: generalSemestre } = calculerClassements(qcmsSemestreObligatoires, filtrerAttemptsPourClassement(attemptsSemestre, qcmsSemestreObligatoires), etudiantsSousFiliere);

  const concoursBlancsFiltres = sousFiliereActive ? concoursBlancs.filter((qcm) => !!statutMatierePourSousFiliere(qcm.matiere_id)) : [];

  function ClassementListe({ liste, cleScore }) {
    return liste.map((item, idx) => (
      <div key={idx} className={`rank-item ${item.pseudo === monProfil.pseudo ? 'me' : ''}`}>
        <span className={`pos ${idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? 'bronze' : ''}`}>{idx + 1}</span>
        <span style={{ flex: 1 }}>{item.pseudo === monProfil.pseudo ? 'Toi' : item.pseudo}</span>
        <span className="score">{item[cleScore]}</span>
      </div>
    ));
  }

  return (
    <div className="container" style={{ position: 'relative' }}>
      <h1 className="page-title">Classement</h1>
      <p className="page-sub">Kholles, cumul du semestre, et concours blancs.</p>

      <div className="category-tabs">
        {[['kholle', 'Kholle en cours'], ['semestre', 'Semestre'], ['concours', 'Concours blancs']].map(([val, label]) => (
          <button key={val} className={`cat-tab ${onglet === val ? 'active' : ''}`} onClick={() => { setOnglet(val); setSemaineAffichee(null); }}>
            {label}
          </button>
        ))}
      </div>

      {estAdminClassement && (
        <div className="filter-row">
          {modalites.map((m) => (
            <button key={m.id} className={`filter-chip ${modaliteFiltre === m.id ? 'active' : ''}`} onClick={() => { setModaliteFiltre(m.id); setSousFiliereActive(null); }}>{m.nom}</button>
          ))}
        </div>
      )}

      {sousFilieresChoix.length > 0 && (estAdminClassement || sousFilieresChoix.length > 1) && (
        <div className="filter-row" style={{ marginBottom: 20 }}>
          {sousFilieresChoix.map((s) => (
            <button key={s.id} className={`filter-chip ${sousFiliereActive === s.id ? 'active' : ''}`} onClick={() => setSousFiliereActive(s.id)}>{s.nom}</button>
          ))}
        </div>
      )}

      {!sousFiliereActive && (
        <p style={{ color: 'var(--text-muted)' }}>
          {estAdminClassement
            ? (modaliteFiltre ? 'Choisis une sous-filière pour afficher le classement.' : 'Choisis une modalité puis une sous-filière pour afficher le classement.')
            : "Ta filière n'est pas encore configurée."}
        </p>
      )}

      {sousFiliereActive && estAdminClassement && (
        <div style={{ marginBottom: 20 }}>
          <button className="btn btn-outline btn-sm" onClick={() => setPanneauAdminOuvert((v) => !v)}>
            {panneauAdminOuvert ? 'Fermer les outils de classement' : '⚙ Outils de classement (réinitialiser / exclure)'}
          </button>
          {panneauAdminOuvert && (
            <div className="card" style={{ marginTop: 12 }}>
              <div className="field">
                <label>Portée</label>
                <select
                  value={porteeAdmin ? `${porteeAdmin.type}:${porteeAdmin.id}` : ''}
                  onChange={(e) => {
                    const [type, id] = e.target.value.split(':');
                    setPorteeAdmin(e.target.value ? { type, id } : null);
                    setSelectionEtudiantsAdmin([]);
                  }}
                >
                  <option value="">— Choisir —</option>
                  {semaines.map((s) => (
                    <option key={s.id} value={`semaine:${s.id}`}>Kholle du {new Date(s.date_samedi).toLocaleDateString('fr-FR')}</option>
                  ))}
                  {concoursBlancsFiltres.map((c) => (
                    <option key={c.id} value={`concours:${c.id}`}>{c.titre}</option>
                  ))}
                </select>
              </div>

              {porteeAdmin && (
                <>
                  <div className="field">
                    <label>Exclure des étudiants de cette portée</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                      {etudiantsSousFiliere.map((e) => (
                        <label key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}>
                          <input
                            type="checkbox"
                            checked={selectionEtudiantsAdmin.includes(e.id)}
                            onChange={() => setSelectionEtudiantsAdmin((prev) => prev.includes(e.id) ? prev.filter((x) => x !== e.id) : [...prev, e.id])}
                          />
                          {e.pseudo}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
                    <button className="btn btn-outline btn-sm" disabled={selectionEtudiantsAdmin.length === 0} onClick={exclureSelectionDuClassement}>
                      Exclure la sélection
                    </button>
                    <button className="btn btn-danger-outline btn-sm" onClick={reinitialiserClassement}>
                      Réinitialiser cette portée (lever toutes les exclusions)
                    </button>
                  </div>

                  {exclusions.filter((ex) => (porteeAdmin.type === 'semaine' ? ex.semaine_kholle_id === porteeAdmin.id : ex.qcm_id === porteeAdmin.id)).length > 0 && (
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>Étudiants actuellement exclus</label>
                      {exclusions.filter((ex) => (porteeAdmin.type === 'semaine' ? ex.semaine_kholle_id === porteeAdmin.id : ex.qcm_id === porteeAdmin.id)).map((ex) => (
                        <div key={ex.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', fontSize: '0.85rem' }}>
                          <span>{etudiants.find((e) => e.id === ex.user_id)?.pseudo || '—'}</span>
                          <button className="btn btn-ghost btn-sm" onClick={() => reinclure(ex.id)}>Ré-inclure</button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {sousFiliereActive && onglet === 'kholle' && (
        <>
          {semaineAArafficher ? (
            <>
              <div className="rank-card">
                <div className="rank-top-row">
                  <div>
                    <h3 style={{ margin: 0 }}>
                      Semaine du {new Date(semaineAArafficher.date_samedi).toLocaleDateString('fr-FR')}
                      {semaineAffichee && ' (archive)'}
                    </h3>
                    <p className="rc-sub" style={{ margin: '4px 0 0' }}>{qcmsSemaineAvecFac.length} QCM de kholle cette semaine</p>
                  </div>
                </div>
              </div>

              <div className="rank-card">
                <h3 style={{ marginTop: 0 }}>Classement général (moyenne)</h3>
                <ClassementListe liste={generalKholle} cleScore="moyenne" />
              </div>

              {Object.entries(parMatiereKholle).map(([nom, liste]) => (
                <div key={nom} className="rank-card">
                  <h3 style={{ marginTop: 0 }}>{nom}</h3>
                  {liste.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>Personne n'a encore fait ce QCM.</p> : <ClassementListe liste={liste} cleScore="score" />}
                </div>
              ))}
            </>
          ) : (
            <p style={{ color: 'var(--text-muted)' }}>Aucune kholle programmée pour l'instant.</p>
          )}
        </>
      )}

      {sousFiliereActive && onglet === 'semestre' && (
        <>
          <p className="semester-rank-note">Semestre actif : <strong style={{ color: 'var(--text-main)' }}>{semestreActif}</strong></p>
          <div className="rank-card">
            <h3 style={{ marginTop: 0 }}>Classement général cumulé</h3>
            <ClassementListe liste={generalSemestre} cleScore="moyenne" />
          </div>
          {Object.entries(parMatiereSemestre).map(([nom, liste]) => (
            <div key={nom} className="rank-card">
              <h3 style={{ marginTop: 0 }}>{nom}</h3>
              {liste.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>Pas encore de données.</p> : <ClassementListe liste={liste} cleScore="score" />}
            </div>
          ))}
        </>
      )}

      {sousFiliereActive && onglet === 'concours' && (
        <>
          {concoursBlancsFiltres.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Aucun concours blanc pour l'instant.</p>}
          {concoursBlancsFiltres.map((qcm) => (
            <div key={qcm.id}>
              <div className="concours-note" onClick={() => ouvrirConcours(qcm.id)}>
                <span className="cn-text"><b>{qcm.titre}</b></span>
                <span>{concoursOuvert === qcm.id ? '▲' : '▼'}</span>
              </div>
              {concoursOuvert === qcm.id && (
                <div className="rank-card" style={{ marginTop: -12 }}>
                  <ClassementListe
                    liste={(classementConcours[qcm.id] || []).map((a) => ({ pseudo: etudiants.find((e) => e.id === a.user_id)?.pseudo || '—', score: a.score }))}
                    cleScore="score"
                  />
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {onglet === 'kholle' && semaines.length > 1 && (
        <button
          onClick={() => setArchivesOuvertes(true)}
          style={{
            position: 'fixed', bottom: 20, right: 20, background: 'var(--bg-panel)', border: '1px dashed var(--border)',
            color: 'var(--text-muted)', fontSize: '0.75rem', padding: '8px 14px', borderRadius: 20, cursor: 'pointer',
          }}
        >
          Archives kholles
        </button>
      )}

      {archivesOuvertes && (
        <div onClick={() => setArchivesOuvertes(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ maxWidth: 400, width: '100%', maxHeight: '70vh', overflowY: 'auto' }}>
            <h3>Archives des kholles</h3>
            {semaines.slice(1).map((s) => (
              <div key={s.id} className="week-select" style={{ marginBottom: 8, width: '100%' }} onClick={() => { setSemaineAffichee(s); setArchivesOuvertes(false); }}>
                Semaine du {new Date(s.date_samedi).toLocaleDateString('fr-FR')}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
