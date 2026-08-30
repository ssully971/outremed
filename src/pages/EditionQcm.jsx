import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { envoyerNotificationGroupe } from '../lib/notifier';

const LETTRES = 'ABCDEFGH';

export default function EditionQcm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [chargement, setChargement] = useState(true);
  const [qcm, setQcm] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [matieres, setMatieres] = useState([]);
  const [cours, setCours] = useState([]);
  const [message, setMessage] = useState('');
  const [enregistrement, setEnregistrement] = useState(false);
  const [apercuOuvert, setApercuOuvert] = useState(null);
  const [signalementOuvert, setSignalementOuvert] = useState(null);
  const [messageSignalement, setMessageSignalement] = useState('');
  const [monId, setMonId] = useState(null);
  const [monPseudo, setMonPseudo] = useState('');
  const [navOuverte, setNavOuverte] = useState(false);

  async function charger() {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) { navigate('/'); return; }
    const uid = session.session.user.id;
    const { data: moiRole } = await supabase.from('profiles').select('role').eq('id', uid).single();
    if (moiRole?.role !== 'tuteur' && moiRole?.role !== 'proprietaire') { navigate('/accueil'); return; }

    setMonId(uid);
    const { data: monProfil } = await supabase.from('profiles').select('pseudo').eq('id', uid).single();
    setMonPseudo(monProfil?.pseudo || '');

    const { data: qcmData } = await supabase.from('qcms').select('*').eq('id', id).single();
    setQcm(qcmData);

    const { data: qs } = await supabase.from('questions').select('*').eq('qcm_id', id).order('ordre');
    const { data: its } = await supabase.from('items').select('*').in('question_id', (qs || []).map((q) => q.id));
    setQuestions((qs || []).map((q) => ({ ...q, items: (its || []).filter((i) => i.question_id === q.id) })));

    if (qcmData?.est_prive) {
      const { data: mats } = await supabase.from('matieres').select('*').eq('est_prive', true).eq('cree_par', uid).order('nom');
      setMatieres(mats || []);
      const { data: crs } = await supabase.from('cours').select('*').eq('est_prive', true).eq('cree_par', uid).order('nom');
      setCours(crs || []);
    } else {
      const { data: mats } = await supabase.from('matieres').select('*').eq('est_prive', false).order('nom');
      setMatieres(mats || []);
      const { data: crs } = await supabase.from('cours').select('*').eq('est_prive', false).order('nom');
      setCours(crs || []);
    }

    setChargement(false);
  }

  useEffect(() => { charger(); }, [id]);

  function majQcm(champ, valeur) {
    setQcm((prev) => ({ ...prev, [champ]: valeur }));
  }

  function majQuestion(qIdx, champ, valeur) {
    setQuestions((prev) => {
      const copy = [...prev];
      copy[qIdx] = { ...copy[qIdx], [champ]: valeur };
      return copy;
    });
  }

  function majItem(qIdx, iIdx, champ, valeur) {
    setQuestions((prev) => {
      const copy = [...prev];
      const items = [...copy[qIdx].items];
      items[iIdx] = { ...items[iIdx], [champ]: valeur };
      copy[qIdx] = { ...copy[qIdx], items };
      return copy;
    });
  }

  async function envoyerSignalement(question) {
    if (!messageSignalement.trim()) return;
    await supabase.from('signalements_erreur').insert({
      qcm_id: id,
      question_id: question.id,
      auteur_id: monId,
      message: messageSignalement.trim(),
    });

    const { data: admins } = await supabase.from('profils_publics').select('id').in('role', ['tuteur', 'proprietaire']).neq('id', monId);
    if (admins && admins.length > 0) {
      await envoyerNotificationGroupe(
        admins.map((a) => a.id), 'signalement_erreur',
        `${monPseudo} a un doute sur "${qcm.titre}"`,
        `/qcm/${id}?q=${question.ordre}`
      );
    }

    setMessageSignalement('');
    setSignalementOuvert(null);
  }

  async function enregistrer() {
    setEnregistrement(true);

    await supabase.from('qcms').update({
      titre: qcm.titre,
      matiere_id: qcm.matiere_id,
      cours_id: qcm.cours_id,
      is_classe: qcm.is_classe,
      semestre: qcm.semestre,
      modifie_par: monId,
      modifie_le: new Date().toISOString(),
    }).eq('id', id);

    for (const q of questions) {
      await supabase.from('questions').update({ enonce: q.enonce }).eq('id', q.id);
      for (const it of q.items) {
        await supabase.from('items').update({
          texte: it.texte, est_correct: it.est_correct, correction: it.correction,
        }).eq('id', it.id);
      }
    }

    // Un QCM privé ne doit laisser aucune trace dans l'historique consultable par les autres tuteurs
    if (!qcm.est_prive) {
      await supabase.from('historique_qcm').insert({
        qcm_id: id, action: 'modification', effectue_par: monId,
        details: `${qcm.titre} — modifié`,
      });

      const { data: autresAdmins } = await supabase.from('profils_publics').select('id').in('role', ['tuteur', 'proprietaire']).neq('id', monId);
      if (autresAdmins && autresAdmins.length > 0) {
        await envoyerNotificationGroupe(autresAdmins.map((a) => a.id), 'nouveau_qcm_pair', `QCM modifié : ${qcm.titre}`, `/qcm/${id}/modifier`);
      }
    }

    setEnregistrement(false);
    setMessage('Modifications enregistrées.');
  }

  if (chargement) return <div style={{ padding: 40 }}>Chargement...</div>;
  if (!qcm) return <div style={{ padding: 40 }}>QCM introuvable.</div>;

  return (
    <div className="container" style={{ maxWidth: 700 }}>
      <Link to={qcm.est_prive ? '/espace-perso' : '/qcm/gerer'} style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textDecoration: 'none' }}>
        ← Retour à {qcm.est_prive ? "l'espace perso" : 'Gérer les QCM'}
      </Link>

      <h1 className="page-title" style={{ marginTop: 12 }}>Modifier le QCM</h1>
      {qcm.est_prive && <span className="status-tag status-pending" style={{ marginBottom: 16, display: 'inline-block' }}>Privé</span>}

      <div className="settings-card">
        <div className="field">
          <label>Titre</label>
          <input value={qcm.titre} onChange={(e) => majQcm('titre', e.target.value)} />
        </div>

        <div className="field">
          <label>Matière</label>
          <select value={qcm.matiere_id || ''} onChange={(e) => majQcm('matiere_id', e.target.value)}>
            <option value="">— choisir —</option>
            {matieres.filter((m) => m.actif !== false || m.id === qcm.matiere_id).map((m) => <option key={m.id} value={m.id}>{m.nom}{m.actif === false ? ' (désactivée)' : ''}</option>)}
          </select>
        </div>

        <div className="field">
          <label>Cours (optionnel)</label>
          <select value={qcm.cours_id || ''} onChange={(e) => majQcm('cours_id', e.target.value)}>
            <option value="">— aucun —</option>
            {cours.filter((c) => c.matiere_id === qcm.matiere_id).map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </div>

        {!qcm.est_prive && (
          <>
            <div className="field">
              <label>Semestre</label>
              <input value={qcm.semestre || ''} onChange={(e) => majQcm('semestre', e.target.value)} placeholder="2025-S1" />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={qcm.is_classe} onChange={(e) => majQcm('is_classe', e.target.checked)} style={{ width: 'auto' }} />
                Ce QCM alimente un classement
              </label>
            </div>
          </>
        )}

        <p className="field-hint" style={{ marginTop: 16 }}>Le type de QCM ne peut pas être changé une fois créé — supprime et recrée si besoin.</p>
      </div>

      <div className="nav-trigger-row">
        <button className="nav-trigger-btn" onClick={() => setNavOuverte(true)}>🔢 Navigation entre questions</button>
        <span className="mini-progress">{questions.length} question(s)</span>
      </div>

      {questions.map((q, qIdx) => (
        <div key={q.id} id={`question-${qIdx}`} className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>Question {qIdx + 1}</strong>
            {!qcm.est_prive && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="icon-action" style={{ color: 'var(--warning)', width: 'auto', padding: '0 10px' }} title="Mettre en doute" onClick={() => setSignalementOuvert(signalementOuvert === qIdx ? null : qIdx)}>🚩</button>
                <button className="icon-action" style={{ width: 'auto', padding: '0 10px' }} title="Aperçu étudiant" onClick={() => setApercuOuvert(apercuOuvert === qIdx ? null : qIdx)}>👁</button>
              </div>
            )}
          </div>

          {signalementOuvert === qIdx && (
            <div style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
              <input value={messageSignalement} onChange={(e) => setMessageSignalement(e.target.value)} placeholder="Décris ton doute pour qu'un autre tuteur vérifie..." />
              <button className="btn btn-outline btn-sm" onClick={() => envoyerSignalement(q)}>Envoyer</button>
            </div>
          )}
          <textarea
            value={q.enonce}
            onChange={(e) => majQuestion(qIdx, 'enonce', e.target.value)}
            style={{ width: '100%', minHeight: 60, marginTop: 8, marginBottom: 14 }}
          />
          {q.items.map((it, iIdx) => (
            <div key={it.id} className="item-editor">
              <div className="item-editor-head">
                <span className="item-letter-badge">{it.lettre || LETTRES[iIdx]}</span>
                <input type="text" value={it.texte} onChange={(e) => majItem(qIdx, iIdx, 'texte', e.target.value)} placeholder={`Item ${LETTRES[iIdx]}`} />
                <label className="truth-toggle">
                  <input type="checkbox" checked={it.est_correct} onChange={(e) => majItem(qIdx, iIdx, 'est_correct', e.target.checked)} />
                  <span>{it.est_correct ? 'Vrai' : 'Faux'}</span>
                </label>
              </div>
              <div className="explanation-input">
                <span className="explanation-label">Explication (optionnel)</span>
                <textarea value={it.correction || ''} onChange={(e) => majItem(qIdx, iIdx, 'correction', e.target.value)} placeholder="Correction" />
              </div>
            </div>
          ))}

          {apercuOuvert === qIdx && (
            <div style={{ marginTop: 14, padding: 16, background: 'var(--bg-panel)', borderRadius: 'var(--radius-md)' }}>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase' }}>Ce que verra l'étudiant</p>
              <h3 style={{ marginTop: 0 }}>{q.enonce}</h3>
              {q.items.map((it) => (
                <div key={it.id} className="item">
                  <span className="item-letter">{it.lettre}</span>
                  <span>{it.texte}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {message && <div className="error-msg" style={{ color: 'var(--success)' }}>{message}</div>}

      <button className="btn btn-primary" style={{ width: '100%' }} onClick={enregistrer} disabled={enregistrement}>
        {enregistrement ? 'Enregistrement...' : 'Enregistrer les modifications'}
      </button>

      {navOuverte && (
        <div className="nav-overlay open" onClick={(e) => e.target === e.currentTarget && setNavOuverte(false)}>
          <div className="nav-content">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0 }}>Navigation</h2>
              <button onClick={() => setNavOuverte(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-main)' }}>✕</button>
            </div>
            <div className="nav-grid">
              {questions.map((q, idx) => (
                <button key={q.id} className="nav-item" onClick={() => { setNavOuverte(false); document.getElementById(`question-${idx}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}>
                  {idx + 1}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
