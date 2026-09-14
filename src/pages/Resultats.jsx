import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

const LETTRES = 'ABCDEFGH';

export default function Resultats() {
  const [onglet, setOnglet] = useState('historique');
  const [attempts, setAttempts] = useState([]);
  const [matieres, setMatieres] = useState([]);
  const [coursMap, setCoursMap] = useState({});
  const [itemsMap, setItemsMap] = useState({});
  const [filtreMatiere, setFiltreMatiere] = useState('toutes');
  const [filtreType, setFiltreType] = useState('tous');
  const [recherche, setRecherche] = useState('');
  const [carteOuverte, setCarteOuverte] = useState(null);
  const [carnetActif, setCarnetActif] = useState(true);
  const [estProprietaire, setEstProprietaire] = useState(false);
  const navigate = useNavigate();

  async function charger() {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) { navigate('/'); return; }
    const uid = session.session.user.id;

    const { data: moi } = await supabase.from('profiles').select('role, categorie_compte').eq('id', uid).single();
    if (moi?.role === 'etudiant' && moi?.categorie_compte === 'annale') { navigate('/accueil'); return; }
    setEstProprietaire(moi?.role === 'proprietaire');

    const { data: param } = await supabase.from('parametres').select('valeur').eq('cle', 'carnet_erreurs_actif').single();
    setCarnetActif(param?.valeur !== 'false');

    const { data: mats } = await supabase.from('matieres').select('*').eq('est_prive', false).order('nom');
    setMatieres(mats || []);

    const { data: crs } = await supabase.from('cours').select('*').eq('est_prive', false);
    const cmap = {};
    (crs || []).forEach((c) => { cmap[c.id] = c.nom; });
    setCoursMap(cmap);

    const { data: att } = await supabase
      .from('attempts')
      .select('*, qcms(id, titre, type_qcm, is_annale, is_kholle, matiere_id, cours_id), attempt_answers(id, question_id, items_selectionnes, statut, questions(enonce, ordre, lien))')
      .eq('user_id', uid)
      .order('created_at', { ascending: false });
    setAttempts(att || []);

    // La table `items` (avec est_correct/correction) n'est lisible en direct que par les
    // tuteurs/propriétaire (RLS) — un étudiant passe par la fonction serveur attempt-detail,
    // qui vérifie que la tentative lui appartient avant de renvoyer le détail des items.
    const attemptsAvecErreurs = (att || []).filter((a) => (a.attempt_answers || []).some((ans) => ans.statut !== 'correct'));
    if (attemptsAvecErreurs.length === 0) { setItemsMap({}); return; }

    const imap = {};
    await Promise.all(attemptsAvecErreurs.map(async (a) => {
      try {
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/attempt-detail`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.session.access_token}` },
          body: JSON.stringify({ attempt_id: a.id }),
        });
        const result = await res.json().catch(() => ({}));
        if (!res.ok || !result.detail) return;
        (a.attempt_answers || []).forEach((ans) => {
          if (ans.statut === 'correct') return;
          const d = result.detail.find((x) => x.ordre === ans.questions.ordre);
          if (d) imap[ans.question_id] = d.items;
        });
      } catch { /* tentative ignorée si la fonction serveur est injoignable */ }
    }));
    setItemsMap(imap);
  }

  useEffect(() => { charger(); }, []);

  function infoMatiere(matiereId) {
    return matieres.find((m) => m.id === matiereId) || { nom: '—', couleur: '#FF3EB5' };
  }

  function labelType(qcm) {
    if (qcm.is_kholle) return 'Kholle';
    if (qcm.is_annale) return 'Annale';
    if (qcm.type_qcm === 'concours_blanc') return 'Concours blanc';
    return 'Entraînement';
  }

  async function supprimerTentative(e, attemptId) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Supprimer définitivement cette tentative ?')) return;
    await supabase.from('attempts').delete().eq('id', attemptId);
    setAttempts((prev) => prev.filter((x) => x.id !== attemptId));
  }

  async function supprimerErreur(e, reponseId) {
    e.stopPropagation();
    if (!confirm("Retirer cette question de ton carnet d'erreurs ? Ça ne change pas ton score déjà obtenu.")) return;
    await supabase.from('attempt_answers').delete().eq('id', reponseId);
    charger();
  }

  // ===== Historique =====
  const attemptsFiltres = attempts
    .filter((a) => filtreMatiere === 'toutes' || a.qcms.matiere_id === filtreMatiere)
    .filter((a) => {
      if (filtreType === 'tous') return true;
      const t = labelType(a.qcms);
      return t.toLowerCase().replace(' blanc', '') === filtreType;
    })
    .filter((a) => a.qcms.titre.toLowerCase().includes(recherche.toLowerCase()));

  // ===== Erreurs à revoir =====
  const groupes = {};
  attempts.forEach((a) => {
    const matiereId = a.qcms.matiere_id;
    const coursId = a.qcms.cours_id || 'sans-cours';
    const qcmId = a.qcms.id;
    const erreurs = (a.attempt_answers || []).filter((ans) => ans.statut !== 'correct');
    if (erreurs.length === 0) return;

    if (!groupes[matiereId]) groupes[matiereId] = {};
    if (!groupes[matiereId][coursId]) groupes[matiereId][coursId] = {};
    if (!groupes[matiereId][coursId][qcmId]) groupes[matiereId][coursId][qcmId] = { titre: a.qcms.titre, questions: [] };

    erreurs.forEach((e) => {
      groupes[matiereId][coursId][qcmId].questions.push({
        reponseId: e.id,
        enonce: e.questions.enonce,
        lien: e.questions.lien,
        ordre: e.questions.ordre,
        statut: e.statut,
        selectionnes: e.items_selectionnes || [],
        items: itemsMap[e.question_id] || [],
      });
    });
  });

  function exporterTexte() {
    let texte = "=== CARNET D'ERREURS ===\n\n";
    Object.entries(groupes).forEach(([matiereId, coursObj]) => {
      const nomMatiere = matieres.find((m) => m.id === matiereId)?.nom || 'Autre';
      texte += `--- ${nomMatiere} ---\n\n`;
      Object.entries(coursObj).forEach(([, qcmsObj]) => {
        Object.entries(qcmsObj).forEach(([, data]) => {
          texte += `${data.titre}\n`;
          data.questions.forEach((q) => { texte += `  Q${q.ordre} (${q.statut}) : ${q.enonce}\n`; });
          texte += '\n';
        });
      });
    });
    navigator.clipboard.writeText(texte).then(() => alert('Carnet copié dans le presse-papier !'));
  }

  const groupesFiltres = {};
  Object.entries(groupes).forEach(([matiereId, coursObj]) => {
    if (filtreMatiere !== 'toutes' && matiereId !== filtreMatiere) return;
    const coursFiltre = {};
    Object.entries(coursObj).forEach(([coursId, qcmsObj]) => {
      const qcmsFiltre = {};
      Object.entries(qcmsObj).forEach(([qcmId, data]) => {
        const questionsFiltrees = recherche.trim()
          ? data.questions.filter((q) => q.enonce.toLowerCase().includes(recherche.trim().toLowerCase()))
          : data.questions;
        if (questionsFiltrees.length > 0) qcmsFiltre[qcmId] = { ...data, questions: questionsFiltrees };
      });
      if (Object.keys(qcmsFiltre).length > 0) coursFiltre[coursId] = qcmsFiltre;
    });
    if (Object.keys(coursFiltre).length > 0) groupesFiltres[matiereId] = coursFiltre;
  });

  const estVideErreurs = Object.keys(groupes).length === 0;
  const rienTrouveErreurs = Object.keys(groupesFiltres).length === 0;

  let totalQuestions = 0;
  const matieresConcernees = {};
  Object.entries(groupes).forEach(([matiereId, coursObj]) => {
    let compte = 0;
    Object.values(coursObj).forEach((qcmsObj) => {
      Object.values(qcmsObj).forEach((data) => { compte += data.questions.length; });
    });
    if (compte > 0) matieresConcernees[matiereId] = compte;
    totalQuestions += compte;
  });
  const matierePlusTouchee = Object.entries(matieresConcernees).sort((a, b) => b[1] - a[1])[0];
  const nomMatierePlusTouchee = matierePlusTouchee ? matieres.find((m) => m.id === matierePlusTouchee[0])?.nom : '—';

  const carnetAccessible = carnetActif || estProprietaire;

  return (
    <div className="container">
      <h1 className="page-title">Résultats</h1>
      <p className="page-sub">Ton historique de tentatives et tes erreurs à retravailler.</p>

      <div className="category-tabs">
        <button className={`cat-tab ${onglet === 'historique' ? 'active' : ''}`} onClick={() => setOnglet('historique')}>Historique</button>
        {carnetAccessible && (
          <button className={`cat-tab ${onglet === 'erreurs' ? 'active' : ''}`} onClick={() => setOnglet('erreurs')}>
            Erreurs à revoir{!carnetActif && ' 🔒'}{totalQuestions > 0 && ` (${totalQuestions})`}
          </button>
        )}
      </div>

      <div className="search-bar">
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder={onglet === 'historique' ? 'Rechercher un QCM...' : 'Rechercher dans les questions...'}
        />
      </div>

      {onglet === 'historique' && (
        <div className="category-tabs">
          {[['tous', 'Tous'], ['entrainement', 'Entraînement'], ['kholle', 'Kholle'], ['annale', 'Annale'], ['concours', 'Concours']].map(([val, label]) => (
            <button key={val} className={`cat-tab ${filtreType === val ? 'active' : ''}`} onClick={() => setFiltreType(val)}>{label}</button>
          ))}
        </div>
      )}

      <div className="filter-row">
        <button className={`filter-chip ${filtreMatiere === 'toutes' ? 'active' : ''}`} onClick={() => setFiltreMatiere('toutes')}>Toutes les matières</button>
        {matieres.map((m) => (
          <button key={m.id} className={`filter-chip ${filtreMatiere === m.id ? 'active' : ''}`} onClick={() => setFiltreMatiere(m.id)}>{m.nom}</button>
        ))}
      </div>

      {onglet === 'historique' ? (
        <>
          {attemptsFiltres.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Aucune tentative ne correspond.</p>}

          <div className="history-table">
            {attemptsFiltres.map((a) => {
              const info = infoMatiere(a.qcms.matiere_id);
              return (
                <Link key={a.id} to={`/resultats/${a.id}`} className="history-row" style={{ '--row-color': info.couleur }}>
                  <div className="bar" />
                  <div>
                    <div className="h-name">{a.qcms.titre}</div>
                    <div className="h-sub">{info.nom}</div>
                  </div>
                  <div className="h-type">{labelType(a.qcms)}</div>
                  <div className="h-date">{new Date(a.created_at).toLocaleDateString('fr-FR')}</div>
                  <div className="h-score" style={{ color: 'var(--accent)' }}>{a.score}</div>
                  <button
                    onClick={(e) => supprimerTentative(e, a.id)}
                    title="Supprimer"
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem' }}
                  >
                    🗑
                  </button>
                </Link>
              );
            })}
          </div>
        </>
      ) : !carnetAccessible ? (
        <p style={{ color: 'var(--text-muted)' }}>Cette fonctionnalité est désactivée pour le moment.</p>
      ) : (
        <>
          {!estVideErreurs && (
            <>
              <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 16 }}>
                <div className="stat-box"><div className="stat-value">{totalQuestions}</div><div className="stat-label">Questions à revoir</div></div>
                <div className="stat-box"><div className="stat-value">{Object.keys(matieresConcernees).length}</div><div className="stat-label">Matières concernées</div></div>
                <div className="stat-box"><div className="stat-value" style={{ fontSize: '1.1rem' }}>{nomMatierePlusTouchee}</div><div className="stat-label">Matière la plus touchée</div></div>
              </div>
              <button className="btn btn-outline" onClick={exporterTexte} style={{ marginBottom: 20 }}>📋 Copier le carnet</button>
            </>
          )}

          {estVideErreurs && <p style={{ color: 'var(--text-muted)' }}>Aucune erreur enregistrée pour l'instant — continue comme ça !</p>}
          {!estVideErreurs && rienTrouveErreurs && <p style={{ color: 'var(--text-muted)' }}>Aucun résultat pour cette recherche.</p>}

          {Object.entries(groupesFiltres).map(([matiereId, coursObj]) => {
            const infoMat = matieres.find((m) => m.id === matiereId) || {};
            return (
              <div key={matiereId} className="subject-section">
                <div className="subject-header">
                  {infoMat.couleur && <span className="dot" style={{ background: infoMat.couleur }} />}
                  <h2>{infoMat.nom || 'Autre'}</h2>
                  <Link to={`/carnet-erreurs/revision?matiere=${matiereId}`} className="filter-chip" style={{ marginLeft: 'auto', textDecoration: 'none' }}>
                    Refaire toute la matière
                  </Link>
                </div>

                {Object.entries(coursObj).map(([coursId, qcmsObj]) => (
                  <div key={coursId} style={{ marginBottom: 16 }}>
                    {coursId !== 'sans-cours' && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 700 }}>{coursMap[coursId] || 'Cours'}</div>
                        <Link to={`/carnet-erreurs/revision?cours=${coursId}`} style={{ fontSize: '0.75rem', color: 'var(--accent)', textDecoration: 'none' }}>Refaire ce cours →</Link>
                      </div>
                    )}

                    {Object.entries(qcmsObj).map(([qcmId, data]) => {
                      const cle = `${coursId}-${qcmId}`;
                      const estOuverte = carteOuverte === cle;
                      return (
                        <div key={qcmId} className={`qcm-error-card ${estOuverte ? 'expanded' : ''}`}>
                          <div className="qcm-error-header" onClick={() => setCarteOuverte(estOuverte ? null : cle)}>
                            <div className="qeh-left">
                              <div>
                                <div className="qeh-name">{data.titre}</div>
                                <div className="qeh-meta">{data.questions.length} question(s) à revoir</div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span className="error-count-badge">{data.questions.length}</span>
                              <Link to={`/carnet-erreurs/revision?qcm=${qcmId}`} onClick={(e) => e.stopPropagation()} style={{ fontSize: '0.75rem', color: 'var(--accent)', textDecoration: 'none' }}>Refaire →</Link>
                              <span className="arrow">▾</span>
                            </div>
                          </div>

                          {estOuverte && (
                            <div className="qcm-error-body">
                              {data.questions.map((q, idx) => (
                                <div key={idx} className="error-question">
                                  <div className="eq-title">Q{q.ordre} — {q.enonce}</div>
                                  {q.lien && <img src={q.lien} alt="" style={{ maxWidth: '100%', height: 'auto', borderRadius: 'var(--radius-md)', margin: '0 0 14px', display: 'block' }} />}

                                  {q.items.map((item, iIdx) => {
                                    const selectionne = q.selectionnes.includes(item.id);
                                    let cls = 'item locked';
                                    if (item.est_correct) cls += selectionne ? ' r-correct' : ' r-missed';
                                    else if (selectionne) cls += ' r-incorrect';
                                    return (
                                      <div key={item.id} className={cls}>
                                        <span className="item-letter">{item.lettre || LETTRES[iIdx]}</span>
                                        <span className="item-text">{item.texte}</span>
                                      </div>
                                    );
                                  })}

                                  {q.items.length > 0 && (
                                    <div className="feedback-block" style={{ marginTop: 12 }}>
                                      {q.items.map((item, iIdx) => (
                                        <div key={item.id} className="expl-item" style={{ marginBottom: 6 }}>
                                          <strong style={{ color: item.est_correct ? 'var(--success)' : 'var(--error)' }}>{item.lettre || LETTRES[iIdx]}. {item.est_correct ? 'Vrai.' : 'Faux.'}</strong> {item.correction}
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  <div className="eq-footer">
                                    <button className="pill-action-btn" onClick={(e) => supprimerErreur(e, q.reponseId)}>Retirer du carnet</button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
