import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const COULEURS = ['#FF3EB5', '#38bdf8', '#22c55e', '#f97316', '#a78bfa', '#ef4444', '#eab308', '#14b8a6'];

// Popup de création rapide d'une matière ou d'un cours, sans quitter l'écran de création de QCM.
export default function CreerMatiereCoursModal({ mode, matiereId, nomInitial = '', onCree, onFermer }) {
  const [nom, setNom] = useState(nomInitial);
  const [emoji, setEmoji] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState('');

  async function valider(e) {
    e.preventDefault();
    if (!nom.trim()) return;
    setEnCours(true);
    setErreur('');

    if (mode === 'matiere') {
      const { data: existantes } = await supabase.from('matieres').select('ordre').eq('est_prive', false);
      const maxOrdre = Math.max(0, ...(existantes || []).map((m) => m.ordre || 0));
      const { data, error } = await supabase.from('matieres').insert({
        nom: nom.trim(),
        ordre: maxOrdre + 1,
        couleur: COULEURS[Math.floor(Math.random() * COULEURS.length)],
        emoji: emoji.trim() || null,
      }).select().single();
      setEnCours(false);
      if (error) { setErreur('Erreur : ' + error.message); return; }
      onCree(data);
    } else {
      const { data, error } = await supabase.from('cours').insert({ matiere_id: matiereId, nom: nom.trim() }).select().single();
      setEnCours(false);
      if (error) { setErreur('Erreur : ' + error.message); return; }
      onCree(data);
    }
  }

  return (
    <div className="modal-overlay open" onClick={onFermer}>
      <div onClick={(e) => e.stopPropagation()} className="modal-box" style={{ maxWidth: 420 }}>
        <h3>{mode === 'matiere' ? 'Nouvelle matière' : 'Nouveau cours'}</h3>
        <p className="modal-sub">
          {mode === 'matiere' ? 'Créée immédiatement, modifiable ensuite depuis la gestion des matières.' : 'Rattaché à la matière sélectionnée.'}
        </p>
        <form onSubmit={valider}>
          <div className="field" style={{ display: 'flex', gap: 8 }}>
            {mode === 'matiere' && (
              <input value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="🎯" maxLength={4} style={{ width: 50, textAlign: 'center', flexShrink: 0 }} />
            )}
            <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder={mode === 'matiere' ? 'Nom de la matière' : 'Nom du cours'} autoFocus style={{ flex: 1 }} />
          </div>
          {erreur && <div className="error-msg">{erreur}</div>}
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button type="button" className="btn btn-ghost" onClick={onFermer}>Annuler</button>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={enCours || !nom.trim()}>
              {enCours ? 'Création...' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
