import { useState } from 'react';
import { validerJsonContenuQcm, construirePromptImport, EXEMPLE_JSON_CONTENU } from '../lib/importQcmSchema';

function copier(texte, setCopie) {
  navigator.clipboard.writeText(texte).then(() => {
    setCopie(true);
    setTimeout(() => setCopie(false), 2000);
  });
}

function ModalPrompt({ prompt, onFermer }) {
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
          existant à retranscrire ou le(s) cours à partir duquel générer les questions. Colle ensuite sa réponse JSON ci-dessous.
          Le nombre de questions, d'items et les cours ont déjà été pré-remplis d'après l'étape précédente — vérifie-les avant de copier.
        </p>
        <button type="button" className="btn btn-outline" style={{ width: '100%', marginBottom: 12, flexShrink: 0 }} onClick={() => copier(prompt, setCopiePrompt)}>
          {copiePrompt ? '✓ Copié' : '📋 Copier le prompt'}
        </button>
        <div style={{ overflowY: 'auto' }}>
          <pre style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 16, fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
            {prompt}
          </pre>

          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 22, marginBottom: 8 }}>Format JSON attendu (rappel) :</p>
          <pre style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 16, fontSize: '0.78rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
            {EXEMPLE_JSON_CONTENU}
          </pre>
          <button type="button" className="btn btn-ghost" style={{ width: '100%', marginTop: 10 }} onClick={() => copier(EXEMPLE_JSON_CONTENU, setCopieExemple)}>
            {copieExemple ? '✓ Copié' : '📋 Copier juste le format'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Zone de collage + validation du CONTENU d'un QCM (questions/items) au format JSON — les
// métadonnées (titre, matière, cours, type) ont déjà été saisies à l'étape 1 et ne sont pas
// redemandées ici. Utilisée à l'étape 2 de CreationQcm, en alternative à la saisie manuelle.
export default function ImportJsonQcm({ nbQuestionsAttendu, nbItemsAttendu, coursDescription, onImporte }) {
  const [texteJson, setTexteJson] = useState('');
  const [erreurs, setErreurs] = useState([]);
  const [promptOuvert, setPromptOuvert] = useState(false);

  const prompt = construirePromptImport({ nbQuestions: nbQuestionsAttendu, nbItems: nbItemsAttendu, coursDescription });

  function importer() {
    setErreurs([]);
    if (!texteJson.trim()) { setErreurs(["Colle d'abord un JSON avant d'importer."]); return; }

    const resultat = validerJsonContenuQcm(texteJson);
    if (!resultat.ok) { setErreurs(resultat.erreurs); return; }

    const avertissements = [...resultat.avertissements];
    if (resultat.questions.length !== nbQuestionsAttendu) {
      avertissements.push(`${resultat.questions.length} question(s) importée(s) alors que ${nbQuestionsAttendu} étaient configurées à l'étape précédente.`);
    }

    onImporte({ questions: resultat.questions, avertissements });
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Colle ici le contenu JSON généré par une IA</label>
        <button type="button" className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: '0.78rem' }} onClick={() => setPromptOuvert(true)}>
          📋 Voir le prompt à copier
        </button>
      </div>
      <textarea
        value={texteJson}
        onChange={(e) => setTexteJson(e.target.value)}
        placeholder={EXEMPLE_JSON_CONTENU}
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

      <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={importer}>Importer le contenu →</button>

      {promptOuvert && <ModalPrompt prompt={prompt} onFermer={() => setPromptOuvert(false)} />}
    </div>
  );
}
