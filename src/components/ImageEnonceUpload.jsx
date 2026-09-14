import { useRef, useState } from 'react';
import { uploaderImageQuestion, supprimerImageQuestion, MAX_IMAGE_BYTES } from '../lib/uploadImage';

// Import + compression d'une image pour l'énoncé d'une question. Nécessite un `questionId`
// déjà existant en base (le champ questions.lien est mis à jour immédiatement à l'upload,
// indépendamment du bouton "Enregistrer" de la page qui l'utilise).
export default function ImageEnonceUpload({ questionId, urlActuelle, onChange }) {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState('');
  const inputRef = useRef(null);

  async function gererFichier(e) {
    const fichier = e.target.files?.[0];
    e.target.value = '';
    if (!fichier) return;
    setErreur('');
    setEnCours(true);
    try {
      const url = await uploaderImageQuestion(questionId, fichier, urlActuelle);
      onChange(url);
    } catch (err) {
      setErreur(err.message || "Échec de l'import de l'image.");
    } finally {
      setEnCours(false);
    }
  }

  async function retirer() {
    if (!confirm("Retirer l'image de cette question ?")) return;
    setEnCours(true);
    setErreur('');
    try {
      await supprimerImageQuestion(questionId, urlActuelle);
      onChange(null);
    } catch (err) {
      setErreur(err.message || 'Erreur lors de la suppression.');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div style={{ margin: '10px 0 14px' }}>
      {urlActuelle && (
        <div style={{ position: 'relative', display: 'inline-block', marginBottom: 8 }}>
          <img src={urlActuelle} alt="Illustration de la question" style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 'var(--radius-md)', display: 'block' }} />
          <button
            type="button"
            className="icon-action danger"
            style={{ position: 'absolute', top: 6, right: 6, width: 26, height: 26, background: 'var(--bg-card)' }}
            onClick={retirer}
            disabled={enCours}
            title="Retirer l'image"
          >
            🗑
          </button>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <input ref={inputRef} type="file" accept="image/*" onChange={gererFichier} disabled={enCours} style={{ display: 'none' }} />
        <button type="button" className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: '0.78rem' }} onClick={() => inputRef.current?.click()} disabled={enCours}>
          {enCours ? 'Import...' : (urlActuelle ? "🖼 Remplacer l'image" : '🖼 Ajouter une image')}
        </button>
        <span className="field-hint" style={{ margin: 0 }}>Compressée automatiquement, {Math.round(MAX_IMAGE_BYTES / 1024)} Ko max</span>
      </div>
      {erreur && <div className="error-msg">{erreur}</div>}
    </div>
  );
}
