import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { envoyerNotificationGroupe } from '../lib/notifier';

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

  const [modifHoraireOuvert, setModifHoraireOuvert] = useState(false);
  const [nouvelleDate, setNouvelleDate] = useState('');
  const [nouveauDebut, setNouveauDebut] = useState('');
  const [nouveauFin, setNouveauFin] = useState('');
  const [erreurHoraire, setErreurHoraire] = useState('');

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

  function calculerClassements(qcmsGroupe, attemptsGroupe) {
    const parMatiere = {};
    qcmsGroupe.forEach((q) => {
      const nom = nomMatiere(q.matiere_id);
      if (!parMatiere[nom]) parMatiere[nom] = [];
      const attemptsCeQcm = attemptsGroupe.filter((a) => a.qcm_id === q.id).sort((a, b) => b.score - a.score);
      parMatiere[nom] = attemptsCeQcm.map((a) => ({ pseudo: etudiants.find((e) => e.id === a.user_id)?.pseudo || '—', score: a.score }));
    });

    const general = etudiants.map((e) => {
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
      setClassementConcours((prev) => ({ ...prev, [qcmId]: data || [] }));
    }
  }

  async function enregistrerNouvelHoraire() {
    if (!semaineActuelle || !nouvelleDate || !nouveauDebut || !nouveauFin) return;
    setErreurHoraire('');
    if (new Date(nouveauFin) <= new Date(nouveauDebut)) { setErreurHoraire('La fin doit être après le début.'); return; }

    const { error } = await supabase.from('semaines_kholle').update({
      date_samedi: nouvelleDate,
      debut: new Date(nouveauDebut).toISOString(),
      fin: new Date(nouveauFin).toISOString(),
      modifie_par: monProfil.id,
      modifie_le: new Date().toISOString(),
    }).eq('id', semaineActuelle.id);

    if (error) {
      setErreurHoraire(error.code === '23505' ? 'Une kholle est déjà programmée à cette date.' : 'Erreur : ' + error.message);
      return;
    }

    const dateFormatee = new Date(nouvelleDate).toLocaleDateString('fr-FR');

    const { data: autresAdmins } = await supabase.from('profiles').select('id').in('role', ['tuteur', 'proprietaire']).neq('id', monProfil.id);
    if (autresAdmins && autresAdmins.length > 0) {
      await envoyerNotificationGroupe(autresAdmins.map((a) => a.id), 'compte_admin', `L'horaire de la kholle du ${dateFormatee} a été modifié.`, '/classement');
    }

    if (etudiants.length > 0) {
      await envoyerNotificationGroupe(etudiants.map((e) => e.id), 'echeance', `L'horaire de la kholle du ${dateFormatee} a changé.`, '/classement');
    }

    setModifHoraireOuvert(false);
    window.location.reload();
  }

  if (!monProfil) return <div style={{ padding: 40 }}>Chargement...</div>;

  const peutCorrigerHoraire = monProfil.role === 'tuteur' || monProfil.role === 'proprietaire';
  const semaineAArafficher = semaineAffichee || semaineActuelle;
  const { parMatiere: parMatiereKholle, general: generalKholle } = calculerClassements(qcmsSemaine, attemptsSemaine);
  const { parMatiere: parMatiereSemestre, general: generalSemestre } = calculerClassements(qcmsSemestre, attemptsSemestre);

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

      {onglet === 'kholle' && (
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
                    <p className="rc-sub" style={{ margin: '4px 0 0' }}>{qcmsSemaine.length} QCM de kholle cette semaine</p>
                  </div>
                  {peutCorrigerHoraire && !semaineAffichee && (
                    <button
                      className="btn-outline"
                      onClick={() => {
                        const ouverture = !modifHoraireOuvert;
                        setModifHoraireOuvert(ouverture);
                        setErreurHoraire('');
                        if (ouverture) setNouvelleDate(semaineActuelle.date_samedi);
                      }}
                    >
                      Reporter / corriger l'horaire
                    </button>
                  )}
                </div>

                {modifHoraireOuvert && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                    <div className="field">
                      <label>Date</label>
                      <input type="date" value={nouvelleDate} onChange={(e) => setNouvelleDate(e.target.value)} />
                    </div>
                    <div className="field-row">
                      <div className="field">
                        <label>Nouveau début</label>
                        <input type="datetime-local" value={nouveauDebut} onChange={(e) => setNouveauDebut(e.target.value)} />
                      </div>
                      <div className="field">
                        <label>Nouvelle fin</label>
                        <input type="datetime-local" value={nouveauFin} onChange={(e) => setNouveauFin(e.target.value)} />
                      </div>
                    </div>
                    {erreurHoraire && <div className="error-msg">{erreurHoraire}</div>}
                    <button className="btn" onClick={enregistrerNouvelHoraire}>Enregistrer</button>
                  </div>
                )}
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

      {onglet === 'semestre' && (
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

      {onglet === 'concours' && (
        <>
          {concoursBlancs.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Aucun concours blanc pour l'instant.</p>}
          {concoursBlancs.map((qcm) => (
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
