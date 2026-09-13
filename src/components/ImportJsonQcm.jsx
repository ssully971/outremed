import { useState } from 'react';
import { validerJsonQcm, trouverParNom, PROMPT_IMPORT_QCM, EXEMPLE_JSON_QCM } from '../lib/importQcmSchema';

function copier(texte, setCopie) {
  navigator.clipboard.writeText(texte).then(() => {
    setCopie(true);
    setTimeout(() => setCopie(false), 2000);
  });
}

function ModalPrompt({ onFermer }) {
  const [copiePrompt, setCopiePrompt] = useState(false);
  const [copieExemple, setCopieExemple] = useState(false);

  return (
    <div className="modal-overlay open" onClick={onFermer}>
      <div onClick={(e) => e.stopPropagation()} className="modal-box" style={{ maxWidth: 640, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Prompt à utiliser dans une IA</h3>
          <button onClick={onFermer} style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
        </div>
        <p className="modal-sub">
          Copie ce prompt dans ChatGPT, Claude ou un autre outil d'IA, colle-le en premier message, puis donne-lui le QCM
          existant à retranscrire ou le cours à partir duquel générer les questions. Colle ensuite sa réponse JSON ci-dessous.
        </p>
        <div style={{ overflowY: 'auto' }}>
          <pre style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 16, fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
            {PROMPT_IMPORT_QCM}
          </pre>
          <button type="button" className="btn btn-outline" style={{ width: '100%', marginTop: 12 }} onClick={() => copier(PROMPT_IMPORT_QCM, setCopiePrompt)}>
            {copiePrompt ? '✓ Copié' : '📋 Copier le prompt'}
          </button>

          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 22, marginBottom: 8 }}>Format JSON attendu (rappel) :</p>
          <pre style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 16, fontSize: '0.78rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
            {EXEMPLE_JSON_QCM}
          </pre>
          <button type="button" className="btn btn-ghost" style={{ width: '100%', marginTop: 10 }} onClick={() => copier(EXEMPLE_JSON_QCM, setCopieExemple)}>
            {copieExemple ? '✓ Copié' : '📋 Copier juste le format'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Zone de collage + validation d'un QCM au format JSON. Ne connaît pas Supabase : elle
// résout les noms de matière/cours face aux listes déjà chargées par CreationQcm, puis
// renvoie des données prêtes à remplir le formulaire manuel (matiereId éventuellement vide
// si non trouvée — le tuteur la choisit ou la crée ensuite avec le "+").
export default function ImportJsonQcm({ matieres, cours, onImporte }) {
  const [texteJson, setTexteJson] = useState('');
  const [erreurs, setErreurs] = useState([]);
  const [promptOuvert, setPromptOuvert] = useState(false);

  function analyser() {
    setErreurs([]);
    if (!texteJson.trim()) { setErreurs(['Colle d\'abord un JSON avant d\'analyser.']); return; }

    const resultat = validerJsonQcm(texteJson);
    if (!resultat.ok) { setErreurs(resultat.erreurs); return; }

    const { donnees, avertissements } = resultat;
    const matiereTrouvee = trouverParNom(matieres, donnees.nomMatiere);
    const coursDisponibles = matiereTrouvee ? cours.filter((c) => c.matiere_id === matiereTrouvee.id) : [];
    const coursTrouve = donnees.nomCours ? trouverParNom(coursDisponibles, donnees.nomCours) : null;

    const avertissementsNoms = [...avertissements];
    if (!matiereTrouvee) avertissementsNoms.push(`Matière "${donnees.nomMatiere}" introuvable — sélectionne-la ou crée-la ci-dessous.`);
    if (donnees.nomCours && !coursTrouve) avertissementsNoms.push(`Cours "${donnees.nomCours}" introuvable dans cette matière — sélectionne-le ou crée-le ci-dessous.`);

    let coursAnnaleIds = [];
    if (donnees.typeGeneral === 'annale') {
      const listeCoursPourMatiere = matiereTrouvee ? cours.filter((c) => c.matiere_id === matiereTrouvee.id) : [];
      const introuvables = [];
      coursAnnaleIds = donnees.nomsCoursAnnale
        .map((n) => {
          const trouve = trouverParNom(listeCoursPourMatiere, n);
          if (!trouve) introuvables.push(n);
          return trouve?.id;
        })
        .filter(Boolean);
      if (introuvables.length > 0) avertissementsNoms.push(`Cours d'annale introuvables : ${introuvables.join(', ')} — à rattacher manuellement à l'étape suivante si besoin.`);
    }

    onImporte({
      titre: donnees.titre,
      matiereId: matiereTrouvee?.id || '',
      coursId: coursTrouve?.id || '',
      typeGeneral: donnees.typeGeneral,
      coursAnnaleIds,
      questions: donnees.questions,
      avertissements: avertissementsNoms,
    });
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Colle ici le JSON généré par une IA</label>
        <button type="button" className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: '0.78rem' }} onClick={() => setPromptOuvert(true)}>
          📋 Voir le prompt à copier
        </button>
      </div>
      <textarea
        value={texteJson}
        onChange={(e) => setTexteJson(e.target.value)}
        placeholder={EXEMPLE_JSON_QCM}
        spellCheck={false}
        style={{ width: '100%', minHeight: 260, fontFamily: 'monospace', fontSize: '0.8rem', marginTop: 10, marginBottom: 14 }}
      />

      {erreurs.length > 0 && (
        <div className="warn-box">
          <div>
            <b>{erreurs.length} erreur(s) dans le JSON :</b>
            <ul>{erreurs.map((e, i) => <li key={i} style={{ cursor: 'default', color: 'var(--text-muted)', fontWeight: 400 }}>{e}</li>)}</ul>
          </div>
        </div>
      )}

      <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={analyser}>Analyser le JSON →</button>

      {promptOuvert && <ModalPrompt onFermer={() => setPromptOuvert(false)} />}
    </div>
  );
}
