import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

const LETTRES = 'ABCDEFGH';

export default function CarnetErreurs() {
  const [groupes, setGroupes] = useState({});
  const [matieres, setMatieres] = useState([]);
  const [coursMap, setCoursMap] = useState({});
  const [monRole, setMonRole] = useState(null);
  const [recherche, setRecherche] = useState('');
  const [filtreMatiere, setFiltreMatiere] = useState('');
  const [carteOuverte, setCarteOuverte] = useState(null);
  const navigate = useNavigate();

  async function charger() {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) { navigate('/'); return; }
    const uid = session.session.user.id;

    const { data: moi } = await supabase.from('profiles').select('role').eq('id', uid).single();
    setMonRole(moi?.role);

    const { data: mats } = await supabase.from('matieres').select('*');
    setMatieres(mats || []);

    const { data: crs } = await supabase.from('cours').select('*');
    const cmap = {};
    (crs || []).forEach((c) => { cmap[c.id] = c.nom; });
    setCoursMap(cmap);

    const { data: attempts } = await supabase
      .from('attempts')
      .select('id, qcms(id, titre, matiere_id, cours_id), attempt_answers(id, question_id, items_selectionnes, statut, questions(enonce, ordre))')
      .eq('user_id', uid);

    const questionIds = [];
    (attempts || []).forEach((a) => {
      (a.attempt_answers || []).forEach((ans) => { if (ans.statut !== 'correct') questionIds.push(ans.question_id); });
    });
    const { data: tousLesItems } = questionIds.length > 0
      ? await supabase.from('items').select('id, question_id, lettre, texte, est_correct, correction').in('question_id', questionIds)
      : { data: [] };

    const parMatiere = {};
    (attempts || []).forEach((a) => {
      const matiereId = a.qcms.matiere_id;
      const coursId = a.qcms.cours_id || 'sans-cours';
      const qcmId = a.qcms.id;
      const erreurs = (a.attempt_answers || []).filter((ans) => ans.statut !== 'correct');
      if (erreurs.length === 0) return;

      if (!parMatiere[matiereId]) parMatiere[matiereId] = {};
      if (!parMatiere[matiereId][coursId]) parMatiere[matiereId][coursId] = {};
      if (!parMatiere[matiereId][coursId][qcmId]) parMatiere[matiereId][coursId][qcmId] = { titre: a.qcms.titre, questions: [] };

      erreurs.forEach((e) => {
        parMatiere[matiereId][coursId][qcmId].questions.push({
          reponseId: e.id,
          enonce: e.questions.enonce,
          ordre: e.questions.ordre,
          statut: e.statut,
          selectionnes: e.items_selectionnes || [],
          items: (tousLesItems || []).filter((i) => i.question_id === e.question_id),
        });
      });
    });

    setGroupes(parMatiere);
  }

  useEffect(() => { charger(); }, []);

  async function supprimerErreur(e, reponseId) {
    e.stopPropagation();
    if (!confirm('Retirer cette question de ton carnet d\'erreurs ? Ça ne change pas ton score déjà obtenu.')) return;
    await supabase.from('attempt_answers').delete().eq('id', reponseId);
    charger();
  }

  function exporterTexte() {
    let texte = '=== CARNET D\'ERREURS ===\n\n';
    Object.entries(groupes).forEach(([matiereId, coursObj]) => {
      const nomMatiere = matieres.find((m) => m.id === matiereId)?.nom || 'Autre';
      texte += `--- ${nomMatiere} ---\n\n`;
      Object.entries(coursObj).forEach(([coursId, qcmsObj]) => {
        Object.entries(qcmsObj).forEach(([qcmId, data]) => {
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
    if (filtreMatiere && matiereId !== filtreMatiere) return;
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

  const estVide = Object.keys(groupes).length === 0;
  const rienTrouve = Object.keys(groupesFiltres).length === 0;

  // Stats globales
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

  return (
    <div className="container">
      {monRole === 'proprietaire' && (
        <Link to="/espace-perso" className="home-btn" style={{ display: 'inline-flex', marginBottom: 16 }}>← Espace perso</Link>
      )}
      <div className="page-top-row">
        <div>
          <h1 className="page-title">Carnet d'erreurs</h1>
          <p className="page-sub">Les questions à retravailler, organisées par matière.</p>
        </div>
        {!estVide && <button className="btn btn-outline" onClick={exporterTexte}>📋 Copier le carnet</button>}
      </div>

      {!estVide && (
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="stat-box"><div className="stat-value">{totalQuestions}</div><div className="stat-label">Questions à revoir</div></div>
          <div className="stat-box"><div className="stat-value">{Object.keys(matieresConcernees).length}</div><div className="stat-label">Matières concernées</div></div>
          <div className="stat-box"><div className="stat-value" style={{ fontSize: '1.1rem' }}>{nomMatierePlusTouchee}</div><div className="stat-label">Matière la plus touchée</div></div>
        </div>
      )}

      {!estVide && (
        <>
          <div className="search-bar"><input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher dans les questions..." /></div>
          <div className="filter-row">
            <button className={`filter-chip ${!filtreMatiere ? 'active' : ''}`} onClick={() => setFiltreMatiere('')}>Toutes les matières</button>
            {Object.keys(groupes).map((mid) => {
              const m = matieres.find((mm) => mm.id === mid);
              return (
                <button key={mid} className={`filter-chip ${filtreMatiere === mid ? 'active' : ''}`} onClick={() => setFiltreMatiere(mid)}>
                  {m?.couleur && <span className="dot" style={{ background: m.couleur }} />}
                  {m?.nom || 'Autre'} <span className="fc-count">({matieresConcernees[mid] || 0})</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {estVide && <p style={{ color: 'var(--text-muted)' }}>Aucune erreur enregistrée pour l'instant — continue comme ça !</p>}
      {!estVide && rienTrouve && <p style={{ color: 'var(--text-muted)' }}>Aucun résultat pour cette recherche.</p>}

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
                              {q.items.map((item, iIdx) => {
                                const selectionne = q.selectionnes.includes(item.id);
                                let cls = 'eq-item';
                                if (item.est_correct) cls += ' correct'; else if (selectionne) cls += ' incorrect';
                                return (
                                  <div key={item.id} className={cls}>
                                    <span className="letter">{item.lettre || LETTRES[iIdx]}</span>
                                    <span>{item.texte}</span>
                                    {selectionne && <span className="tag-inline">Coché</span>}
                                  </div>
                                );
                              })}
                              {q.items.length > 0 && (
                                <div className="eq-explanation">
                                  {q.items.map((item, iIdx) => (
                                    <div key={item.id} style={{ marginBottom: 4 }}>
                                      <b>{item.lettre || LETTRES[iIdx]}. {item.est_correct ? 'Vrai.' : 'Faux.'}</b> {item.correction}
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
    </div>
  );
}
