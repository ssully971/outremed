import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { envoyerNotification, envoyerNotificationGroupe } from '../lib/notifier';
import PopupMatieres from '../components/PopupMatieres';

export default function GestionQcm() {
  const [qcms, setQcms] = useState([]);
  const [profilsMap, setProfilsMap] = useState({});
  const [monId, setMonId] = useState(null);
  const [filtre, setFiltre] = useState('tous');
  const [signalements, setSignalements] = useState([]);
  const [afficherSignalements, setAfficherSignalements] = useState(false);
  const [recherche, setRecherche] = useState('');
  const [filtreMatiere, setFiltreMatiere] = useState('');
  const [filtreCours, setFiltreCours] = useState('');
  const [popupMatieresOuverte, setPopupMatieresOuverte] = useState(false);
  const [historiqueOuvert, setHistoriqueOuvert] = useState(null);
  const [historiquesParQcm, setHistoriquesParQcm] = useState({});
  const [selection, setSelection] = useState([]);
  const [monRole, setMonRole] = useState(null);
  const [filtreSemestre, setFiltreSemestre] = useState('');
  const [filtreAuteur, setFiltreAuteur] = useState('');
  const [filtreType, setFiltreType] = useState('tous');
  const [matiereDeplacement, setMatiereDeplacement] = useState('');
  const [admins, setAdmins] = useState([]);
  const navigate = useNavigate();

  // Matières & cours
  const [matieres, setMatieres] = useState([]);

  async function charger() {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) { navigate('/'); return; }
    const { data: moi } = await supabase.from('profiles').select('role').eq('id', session.session.user.id).single();
    if (moi?.role !== 'tuteur' && moi?.role !== 'proprietaire') { navigate('/accueil'); return; }
    setMonRole(moi.role);
    setMonId(session.session.user.id);

    const { data: adminsList } = await supabase.from('profils_publics').select('id, pseudo').in('role', ['tuteur', 'proprietaire']);
    setAdmins(adminsList || []);

    const { data: profils } = await supabase.from('profiles').select('id, pseudo');
    const map = {};
    (profils || []).forEach((p) => { map[p.id] = p.pseudo; });
    setProfilsMap(map);

    const { data } = await supabase.from('qcms').select('*').eq('est_prive', false).order('created_at', { ascending: false });
    setQcms(data || []);

    const { data: mats } = await supabase.from('matieres').select('*').eq('est_prive', false).order('ordre', { ascending: true, nullsFirst: false });
    const { data: crs } = await supabase.from('cours').select('*').eq('est_prive', false).order('nom');
    setMatieres((mats || []).map((m) => ({ ...m, cours: (crs || []).filter((c) => c.matiere_id === m.id) })));

    const { data: sign } = await supabase.from('signalements_erreur').select('*, questions(enonce, ordre)').order('created_at', { ascending: false });
    setSignalements(sign || []);
  }

  useEffect(() => { charger(); }, []);

  async function ouvrirHistorique(qcmId) {
    if (historiqueOuvert === qcmId) { setHistoriqueOuvert(null); return; }
    setHistoriqueOuvert(qcmId);
    if (!historiquesParQcm[qcmId]) {
      const { data } = await supabase.from('historique_qcm').select('*').eq('qcm_id', qcmId).order('created_at', { ascending: false });
      setHistoriquesParQcm((prev) => ({ ...prev, [qcmId]: data || [] }));
    }
  }

  function basculerSelection(qcmId) {
    setSelection((prev) => prev.includes(qcmId) ? prev.filter((id) => id !== qcmId) : [...prev, qcmId]);
  }

  async function masquerSelection() {
    if (selection.length === 0) return;
    if (!confirm(`Masquer ${selection.length} QCM ?`)) return;
    await supabase.from('qcms').update({ visible: false }).in('id', selection);
    setSelection([]);
    charger();
  }

  async function supprimerSelection() {
    if (selection.length === 0) return;
    if (!confirm(`Supprimer définitivement ${selection.length} QCM ? Action irréversible.`)) return;
    const { error } = await supabase.from('qcms').delete().in('id', selection);
    if (error) alert("Certains QCM n'ont pas pu être supprimés (des étudiants ont déjà des tentatives dessus).");
    setSelection([]);
    charger();
  }

  async function deplacerSelection() {
    if (selection.length === 0 || !matiereDeplacement) return;
    await supabase.from('qcms').update({ matiere_id: matiereDeplacement, cours_id: null }).in('id', selection);
    setSelection([]);
    setMatiereDeplacement('');
    charger();
  }

  async function validerSelection() {
    if (selection.length === 0) return;
    const aValider = selection.filter((id) => qcms.find((q) => q.id === id)?.cree_par !== monId);
    if (aValider.length === 0) { alert('Aucun QCM sélectionné ne peut être validé (tu ne peux pas valider tes propres QCM).'); return; }
    const { data: session } = await supabase.auth.getSession();
    await supabase.from('qcms').update({ verifie: true, verifie_par: session.session.user.id, verifie_le: new Date().toISOString() }).in('id', aValider);
    setSelection([]);
    charger();
  }

  async function marquerSignalementTraite(sig) {
    await supabase.from('signalements_erreur').update({ traite: true, traite_par: monId }).eq('id', sig.id);
    if (sig.auteur_id) {
      await envoyerNotification(sig.auteur_id, 'signalement_erreur', `Ton signalement sur "${qcms.find((q) => q.id === sig.qcm_id)?.titre || 'un QCM'}" a été traité.`, `/qcm/${sig.qcm_id}`);
    }
    charger();
  }

  async function dupliquer(qcm) {
    const { data: session } = await supabase.auth.getSession();
    const uid = session.session.user.id;

    const { data: questionsOriginales } = await supabase.from('questions').select('*').eq('qcm_id', qcm.id).order('ordre');
    const { data: itemsOriginaux } = await supabase.from('items').select('*').in('question_id', (questionsOriginales || []).map((q) => q.id));

    const kholleForcee = qcm.is_kholle;

    const { data: copie, error } = await supabase.from('qcms').insert({
      titre: `${qcm.titre} (copie)`,
      matiere_id: qcm.matiere_id,
      cours_id: qcm.cours_id,
      type_qcm: kholleForcee ? 'entrainement' : qcm.type_qcm,
      is_annale: qcm.is_annale,
      is_classe: false,
      is_kholle: false,
      nb_questions: qcm.nb_questions,
      nb_items: qcm.nb_items,
      semestre: qcm.semestre,
      duree_minutes: kholleForcee ? null : qcm.duree_minutes,
      publie: false,
      cree_par: uid,
    }).select().single();

    if (error) { alert('Erreur : ' + error.message); return; }

    for (const q of questionsOriginales || []) {
      const { data: nouvelleQuestion } = await supabase.from('questions').insert({ qcm_id: copie.id, ordre: q.ordre, enonce: q.enonce }).select().single();
      const itemsDeCetteQuestion = (itemsOriginaux || []).filter((i) => i.question_id === q.id);
      await supabase.from('items').insert(itemsDeCetteQuestion.map((i) => ({
        question_id: nouvelleQuestion.id, lettre: i.lettre, texte: i.texte, est_correct: i.est_correct, correction: i.correction,
      })));
    }

    await supabase.from('historique_qcm').insert({
      qcm_id: copie.id, action: 'creation', effectue_par: uid,
      details: `Dupliqué depuis "${qcm.titre}" — enregistré en brouillon`,
    });

    charger();
  }

  async function verifier(qcm) {
    const { data: session } = await supabase.auth.getSession();
    await supabase.from('qcms').update({
      verifie: true,
      verifie_par: session.session.user.id,
      verifie_le: new Date().toISOString(),
    }).eq('id', qcm.id);

    await supabase.from('historique_qcm').insert({
      qcm_id: qcm.id,
      action: 'verification',
      effectue_par: session.session.user.id,
      details: `${qcm.titre} vérifié`,
    });

    if (qcm.cree_par && qcm.cree_par !== session.session.user.id) {
      await envoyerNotification(qcm.cree_par, 'qcm_verifie', `Ton QCM "${qcm.titre}" a été vérifié.`, '/qcm/gerer');
    }

    const { data: etudiants } = await supabase.from('profiles').select('id').eq('role', 'etudiant');
    if (etudiants && etudiants.length > 0) {
      await envoyerNotificationGroupe(etudiants.map((e) => e.id), 'qcm_verifie', `Le QCM "${qcm.titre}" a été vérifié et validé.`, `/qcm/${qcm.id}`);
    }

    charger();
  }

  async function publier(qcm) {
    await supabase.from('qcms').update({ publie: true }).eq('id', qcm.id);

    const { data: etudiants } = await supabase.from('profiles').select('id').eq('role', 'etudiant');
    if (etudiants && etudiants.length > 0) {
      await envoyerNotificationGroupe(etudiants.map((e) => e.id), 'qcm_publie', `Nouveau QCM disponible : ${qcm.titre}`, `/qcm/${qcm.id}`);
    }
    charger();
  }

  async function basculerVisibilite(qcm) {
    await supabase.from('qcms').update({ visible: !qcm.visible }).eq('id', qcm.id);
    charger();
  }

  async function supprimer(qcm) {
    if (!confirm(`Supprimer définitivement "${qcm.titre}" ? Cette action est irréversible.`)) return;
    const { error } = await supabase.from('qcms').delete().eq('id', qcm.id);
    if (error) {
      alert("Impossible de supprimer : des étudiants ont déjà des tentatives sur ce QCM. Utilise plutôt le masquage.");
      return;
    }
    charger();
  }

  const qcmsFiltres = qcms.filter((q) => {
    if (filtre === 'brouillons' && q.publie) return false;
    if (filtre === 'a_verifier' && q.verifie) return false;
    if (filtre === 'verifies' && !q.verifie) return false;
    if (filtre === 'masques' && q.visible) return false;
    if (filtreMatiere && q.matiere_id !== filtreMatiere) return false;
    if (filtreCours && q.cours_id !== filtreCours) return false;
    if (monRole === 'proprietaire' && filtreSemestre && q.semestre !== filtreSemestre) return false;
    if (filtreAuteur && q.cree_par !== filtreAuteur) return false;
    if (filtreType !== 'tous') {
      if (filtreType === 'kholle' && !q.is_kholle) return false;
      if (filtreType === 'annale' && !q.is_annale) return false;
      if (filtreType === 'concours_blanc' && (q.type_qcm !== 'concours_blanc' || q.is_kholle)) return false;
      if (filtreType === 'entrainement' && (q.type_qcm !== 'entrainement' || q.is_annale)) return false;
    }
    if (recherche.trim()) {
      const texte = recherche.trim().toLowerCase().replace('#', '');
      const numeroStr = String(q.numero).padStart(4, '0');
      if (!q.titre.toLowerCase().includes(texte) && !numeroStr.includes(texte)) return false;
    }
    return true;
  });

  const semestresDisponibles = [...new Set(qcms.map((q) => q.semestre).filter(Boolean))].sort().reverse();

  function labelType(qcm) {
    if (qcm.is_kholle) return 'Kholle';
    if (qcm.is_annale) return 'Annale';
    if (qcm.type_qcm === 'concours_blanc') return 'Concours blanc';
    return 'Entraînement';
  }

  function LigneQcm({ qcm }) {
    const infoMatiere = matieres.find((m) => m.id === qcm.matiere_id);
    return (
      <>
        <div className="qcm-manage-row" style={{ '--row-color': infoMatiere?.couleur || 'var(--accent)' }}>
          <input type="checkbox" checked={selection.includes(qcm.id)} onChange={() => basculerSelection(qcm.id)} />
          <div className="bar" />
          <div>
            <div className="qmr-name">
              <span style={{ color: 'var(--accent)', fontFamily: 'monospace', fontSize: '0.8rem' }}>#{String(qcm.numero).padStart(4, '0')}</span> {qcm.titre}
            </div>
            <div className="qmr-sub">
              {!qcm.publie && 'Brouillon'}{!qcm.publie && !qcm.visible && ' · '}{!qcm.visible && 'Masqué'}
            </div>
          </div>
          <div className="qmr-type">{labelType(qcm)}</div>
          <div className="qmr-count">{qcm.nb_questions} Q.</div>
          <div className="qmr-author">Par <b>{qcm.cree_par === monId ? 'Moi' : (profilsMap[qcm.cree_par] || '—')}</b></div>
          <span className={`status-tag ${qcm.verifie ? 'status-validated' : 'status-pending'}`}>
            {qcm.verifie ? 'Vérifié' : 'À vérifier'}
          </span>
          <div className="qmr-actions">
            <Link to={`/qcm/${qcm.id}/modifier`} className="icon-action" title="Voir / Modifier">👁</Link>
            {!qcm.publie && (
              <button className="icon-action verify" title="Publier" onClick={() => publier(qcm)}>📤</button>
            )}
            {!qcm.verifie && qcm.cree_par !== monId && (
              <button className="icon-action verify" title="Valider" onClick={() => verifier(qcm)}>✓</button>
            )}
            <button className="icon-action" title={qcm.visible ? 'Masquer' : 'Remontrer'} onClick={() => basculerVisibilite(qcm)}>{qcm.visible ? '🗄' : '👁‍🗨'}</button>
            <button className="icon-action" title="Dupliquer" onClick={() => dupliquer(qcm)}>📋</button>
            <button className="icon-action" title="Historique" onClick={() => ouvrirHistorique(qcm.id)}>🕒</button>
            <button className="icon-action danger" title="Supprimer" onClick={() => supprimer(qcm)}>🗑</button>
          </div>
        </div>

        {!qcm.verifie && qcm.cree_par === monId && (
          <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontStyle: 'italic', margin: '-4px 0 0 42px' }}>
            En attente qu'un autre tuteur vérifie
          </p>
        )}

        {historiqueOuvert === qcm.id && (
          <div className="card" style={{ margin: '-4px 0 0 42px', padding: 14 }}>
            {(historiquesParQcm[qcm.id] || []).length === 0 && <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>Aucun historique.</p>}
            {(historiquesParQcm[qcm.id] || []).map((h) => (
              <div key={h.id} style={{ fontSize: '0.8rem', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <strong>{h.action}</strong> par {profilsMap[h.effectue_par] || '—'} · {new Date(h.created_at).toLocaleString('fr-FR')}
                {h.details && <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>{h.details}</div>}
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="container">
      <div className="page-top-row">
        <div>
          <h1 className="page-title">Gérer les QCM</h1>
          <p className="page-sub">{qcms.length} QCM au total</p>
        </div>
        <div className="header-actions-row">
          <button className="btn btn-outline" onClick={() => setAfficherSignalements((v) => !v)}>
            🚩 Signalements {signalements.filter((s) => !s.traite).length > 0 && `(${signalements.filter((s) => !s.traite).length})`}
          </button>
          <Link to="/qcm/nouveau" className="btn btn-primary" style={{ textDecoration: 'none' }}>+ Ajouter un QCM</Link>
        </div>
      </div>

      {monRole === 'proprietaire' && semestresDisponibles.length > 0 && (
        <div className="semester-bar">
          <div>
            <label>Semestre</label>
            <select className="select-filter" value={filtreSemestre} onChange={(e) => setFiltreSemestre(e.target.value)}>
              <option value="">Tous les semestres</option>
              {semestresDisponibles.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      )}

      {afficherSignalements && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginTop: 0 }}>Signalements d'erreur</h3>
          {signalements.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Aucun signalement pour l'instant.</p>}
          {signalements.map((s) => (
            <div key={s.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', opacity: s.traite ? 0.5 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>
                    {qcms.find((q) => q.id === s.qcm_id)?.titre || 'QCM supprimé'}
                    {s.questions && ` — Q${s.questions.ordre}`}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '4px 0' }}>
                    Par {profilsMap[s.auteur_id] || '—'} · {new Date(s.created_at).toLocaleString('fr-FR')}
                  </div>
                  <div style={{ fontSize: '0.85rem' }}>{s.message}</div>
                </div>
                {!s.traite && (
                  <button className="btn btn-outline btn-sm" onClick={() => marquerSignalementTraite(s)}>Marquer traité</button>
                )}
              </div>
              {s.questions && (
                <Link to={`/qcm/${s.qcm_id}?q=${s.questions.ordre}`} style={{ fontSize: '0.78rem', color: 'var(--accent)', textDecoration: 'none' }}>Voir la question →</Link>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: matieres.length > 0 ? 12 : 0 }}>
          <strong>Matières</strong>
          <button className="btn btn-outline btn-sm" onClick={() => setPopupMatieresOuverte(true)}>Gérer les matières</button>
        </div>
        {matieres.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {matieres.map((m) => (
              <div
                key={m.id}
                onClick={() => { setFiltreMatiere(filtreMatiere === m.id ? '' : m.id); setFiltreCours(''); }}
                className="filter-chip"
                style={{
                  borderColor: filtreMatiere === m.id ? (m.couleur || 'var(--accent)') : 'var(--border)',
                  background: filtreMatiere === m.id ? (m.couleur || 'var(--accent)') + '26' : 'transparent',
                  color: filtreMatiere === m.id ? 'var(--text-main)' : 'var(--text-muted)',
                  opacity: m.actif === false ? 0.5 : 1,
                }}
              >
                {m.nom} ({qcms.filter((q) => q.matiere_id === m.id).length})
              </div>
            ))}
          </div>
        )}

        {filtreMatiere && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <div className={`filter-chip ${!filtreCours ? 'active' : ''}`} onClick={() => setFiltreCours('')}>Tous les cours</div>
            {(matieres.find((m) => m.id === filtreMatiere)?.cours || []).map((c) => (
              <div key={c.id} className={`filter-chip ${filtreCours === c.id ? 'active' : ''}`} onClick={() => setFiltreCours(filtreCours === c.id ? '' : c.id)}>
                {c.nom} ({qcms.filter((q) => q.cours_id === c.id).length})
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="toolbar">
        <input className="search-input" value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher par nom ou numéro (#0001)..." />
        <select className="select-filter" value={filtreAuteur} onChange={(e) => setFiltreAuteur(e.target.value)}>
          <option value="">Tous les auteurs</option>
          {admins.map((a) => <option key={a.id} value={a.id}>{a.id === monId ? 'Moi' : a.pseudo}</option>)}
        </select>
      </div>

      <div className="category-tabs">
        {[['tous', 'Tous les types'], ['entrainement', 'Entraînement'], ['kholle', 'Kholles'], ['annale', 'Annales'], ['concours_blanc', 'Concours blancs']].map(([val, label]) => (
          <button key={val} className={`cat-tab ${filtreType === val ? 'active' : ''}`} onClick={() => setFiltreType(val)}>{label}</button>
        ))}
      </div>

      {(filtreMatiere || filtreCours) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          <span>
            Filtré par : {matieres.find((m) => m.id === filtreMatiere)?.nom}
            {filtreCours && ` — ${matieres.flatMap((m) => m.cours).find((c) => c.id === filtreCours)?.nom}`}
          </span>
          <button className="btn btn-ghost" style={{ padding: '2px 10px', fontSize: '0.75rem' }} onClick={() => { setFiltreMatiere(''); setFiltreCours(''); }}>Réinitialiser</button>
        </div>
      )}

      <div className="status-filter-row">
        {[['tous', 'Tous'], ['brouillons', 'Brouillons'], ['a_verifier', 'À vérifier'], ['verifies', 'Vérifiés'], ['masques', 'Masqués']].map(([val, label]) => (
          <button key={val} className={`status-chip ${filtre === val ? 'active' : ''}`} onClick={() => setFiltre(val)}>{label}</button>
        ))}
      </div>

      {selection.length > 0 && (
        <div className="bulk-bar">
          <span>{selection.length} sélectionné(s)</span>
          <div className="bulk-actions">
            <select value={matiereDeplacement} onChange={(e) => setMatiereDeplacement(e.target.value)}>
              <option value="">Déplacer vers...</option>
              {matieres.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
            </select>
            <button className="btn btn-outline btn-sm" disabled={!matiereDeplacement} onClick={deplacerSelection}>Déplacer</button>
            <button className="btn btn-outline btn-sm" onClick={validerSelection}>✓ Valider</button>
            <button className="btn btn-outline btn-sm" onClick={masquerSelection}>Masquer</button>
            <button className="btn btn-danger btn-sm" onClick={supprimerSelection}>Supprimer</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelection([])}>Annuler</button>
          </div>
        </div>
      )}

      <div className="qcm-manage-list">
        {filtre === 'masques' ? (
          Object.entries(
            qcmsFiltres.reduce((acc, q) => {
              const sem = q.semestre || 'Sans semestre';
              if (!acc[sem]) acc[sem] = [];
              acc[sem].push(q);
              return acc;
            }, {})
          ).map(([semestre, qcmsGroupe]) => (
            <div key={semestre} style={{ marginBottom: 16 }}>
              <h3>{semestre}</h3>
              {qcmsGroupe.map((qcm) => <LigneQcm key={qcm.id} qcm={qcm} />)}
            </div>
          ))
        ) : (
          qcmsFiltres.map((qcm) => <LigneQcm key={qcm.id} qcm={qcm} />)
        )}
      </div>

      {popupMatieresOuverte && (
        <PopupMatieres onFermer={() => { setPopupMatieresOuverte(false); charger(); }} />
      )}
    </div>
  );
}
