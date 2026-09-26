import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { estMatiereActive } from '../lib/filiere';

// Sélecteur modalité -> sous-filière(s) -> matières facultatives, avec récap avant validation.
// Utilisé pour l'onboarding obligatoire d'un étudiant (ChoisirFiliere.jsx, `profileId` = son
// propre id), pour l'édition par un tuteur (FicheEtudiant.jsx, `profileId` = l'étudiant
// affiché, `avertissementIrreversible` = false puisque le tuteur peut toujours revenir dessus),
// et pour la reconfirmation périodique des facultatives (ChoisirFacultatives.jsx,
// `facultativesSeulement` = true) : modalité/sous-filière restent figées (déjà choisies), seule
// l'étape facultatives est affichée, sans écran de récapitulatif intermédiaire.
export default function SelecteurFiliere({ profileId, valeurInitiale, avertissementIrreversible = true, facultativesSeulement = false, onApplique, onAnnuler }) {
  const [etape, setEtape] = useState(facultativesSeulement ? 'facultatives-seules' : 1);
  const [chargement, setChargement] = useState(true);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState('');

  const [modalites, setModalites] = useState([]);
  const [sousFilieres, setSousFilieres] = useState([]);
  const [matieres, setMatieres] = useState([]);
  const [statutsMatieres, setStatutsMatieres] = useState([]);
  const [semestreActif, setSemestreActif] = useState('');

  const [modaliteId, setModaliteId] = useState(valeurInitiale?.modaliteId || null);
  const [sousFiliereIds, setSousFiliereIds] = useState(valeurInitiale?.sousFiliereIds || []);
  const [facultativesCochees, setFacultativesCochees] = useState(valeurInitiale?.matieresFacultativesIds || []);

  useEffect(() => {
    async function charger() {
      const { data: mods } = await supabase.from('modalites').select('*').order('ordre', { ascending: true, nullsFirst: false });
      setModalites(mods || []);
      const { data: sf } = await supabase.from('sous_filieres').select('*').order('ordre', { ascending: true, nullsFirst: false });
      setSousFilieres(sf || []);
      const { data: mats } = await supabase.from('matieres').select('*').eq('est_prive', false).order('ordre', { ascending: true, nullsFirst: false });
      setMatieres(mats || []);
      const { data: sfm } = await supabase.from('sous_filiere_matieres').select('*');
      setStatutsMatieres(sfm || []);
      const { data: param } = await supabase.from('parametres').select('valeur').eq('cle', 'semestre_actif').single();
      setSemestreActif(param?.valeur || '');
      setChargement(false);
    }
    charger();
  }, []);

  if (chargement) return <div style={{ padding: 20 }}>Chargement...</div>;

  const modaliteChoisie = modalites.find((m) => m.id === modaliteId) || null;
  const sousFilieresDeLaModalite = modaliteChoisie ? sousFilieres.filter((s) => s.modalite_id === modaliteChoisie.id) : [];

  // Calcul "le plus strict gagne" côté client, identique à la logique de la RPC serveur —
  // sert uniquement à prévisualiser avant validation.
  const statutsCalcules = {};
  statutsMatieres
    .filter((sfm) => sousFiliereIds.includes(sfm.sous_filiere_id))
    .forEach((sfm) => {
      if (statutsCalcules[sfm.matiere_id] !== 'obligatoire') statutsCalcules[sfm.matiere_id] = sfm.statut;
    });

  const matieresObligatoires = matieres.filter((m) => statutsCalcules[m.id] === 'obligatoire');
  // Une facultative déjà cochée reste visible même hors-saison (sinon impossible de la revoir/
  // décocher — tuteur sur FicheEtudiant.jsx comme étudiant sur ChoisirFacultatives.jsx) ; seules
  // les nouvelles propositions sont limitées à la saison active.
  const matieresFacultativesDisponibles = modaliteChoisie?.sans_facultatif ? [] : matieres.filter((m) => statutsCalcules[m.id] === 'facultative' && (facultativesCochees.includes(m.id) || estMatiereActive(m, semestreActif)));

  function basculerSousFiliere(id) {
    setSousFiliereIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setFacultativesCochees([]);
  }

  function basculerFacultative(id) {
    setFacultativesCochees((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function nomModalite(id) { return modalites.find((m) => m.id === id)?.nom || '—'; }
  function nomSousFiliere(id) { return sousFilieres.find((s) => s.id === id)?.nom || '—'; }

  async function confirmer() {
    setEnCours(true);
    setErreur('');
    const { error } = await supabase.rpc('appliquer_filiere_etudiant', {
      p_profile_id: profileId,
      p_modalite_id: modaliteId,
      p_sous_filiere_ids: sousFiliereIds,
      p_matieres_facultatives_ids: facultativesCochees,
    });
    if (error) { setEnCours(false); setErreur(error.message); return; }
    // La RPC n'a pas connaissance du semestre — marqué séparément, à chaque confirmation
    // réussie (onboarding initial, édition tuteur, ou reconfirmation dédiée) : les facultatives
    // qui viennent d'être appliquées sont par définition à jour pour le semestre actif.
    await supabase.from('profiles').update({ facultatives_confirmees_pour: semestreActif }).eq('id', profileId);
    setEnCours(false);
    onApplique?.();
  }

  const etapeFacultatives = matieresFacultativesDisponibles.length > 0 ? 3 : null;
  const etapeRecap = etapeFacultatives ? 4 : 3;

  return (
    <div>
      {etape === 'facultatives-seules' && (
        <div>
          <h3 style={{ marginTop: 0 }}>Matières facultatives de ce semestre</h3>
          {matieresFacultativesDisponibles.length === 0 ? (
            <p className="field-hint" style={{ marginBottom: 16 }}>Aucune matière facultative disponible ce semestre pour ta filière.</p>
          ) : (
            <>
              <p className="field-hint" style={{ marginBottom: 16 }}>Coche celles que tu veux suivre ce semestre.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {matieresFacultativesDisponibles.map((m) => (
                  <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <input type="checkbox" checked={facultativesCochees.includes(m.id)} onChange={() => basculerFacultative(m.id)} />
                    {m.emoji ? `${m.emoji} ` : ''}{m.nom}
                  </label>
                ))}
              </div>
            </>
          )}
          {erreur && <div className="error-msg">{erreur}</div>}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
            {onAnnuler && <button className="btn btn-ghost" onClick={onAnnuler} disabled={enCours}>Annuler</button>}
            <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={confirmer} disabled={enCours}>{enCours ? 'Enregistrement...' : 'Confirmer'}</button>
          </div>
        </div>
      )}

      {etape === 1 && (
        <div>
          <h3 style={{ marginTop: 0 }}>Choisis ta modalité</h3>
          <div className="subjects-manage-grid">
            {modalites.map((m) => (
              <div
                key={m.id}
                className={`type-card ${modaliteId === m.id ? 'selected' : ''}`}
                onClick={() => { setModaliteId(m.id); setSousFiliereIds([]); setFacultativesCochees([]); }}
              >
                <div className="tc-title">{m.nom}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
            {onAnnuler && <button className="btn btn-ghost" onClick={onAnnuler}>Annuler</button>}
            <button className="btn btn-primary" style={{ marginLeft: 'auto' }} disabled={!modaliteId} onClick={() => setEtape(2)}>Suivant →</button>
          </div>
        </div>
      )}

      {etape === 2 && (
        <div>
          <h3 style={{ marginTop: 0 }}>Choisis une ou plusieurs sous-filières</h3>
          <div className="subjects-manage-grid">
            {sousFilieresDeLaModalite.map((s) => (
              <div
                key={s.id}
                className={`type-card ${sousFiliereIds.includes(s.id) ? 'selected' : ''}`}
                onClick={() => basculerSousFiliere(s.id)}
              >
                <div className="tc-title">{s.nom}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
            <button className="btn btn-ghost" onClick={() => setEtape(1)}>← Retour</button>
            <button className="btn btn-primary" disabled={sousFiliereIds.length === 0} onClick={() => setEtape(etapeFacultatives || etapeRecap)}>Suivant →</button>
          </div>
        </div>
      )}

      {etape === 3 && etapeFacultatives === 3 && (
        <div>
          <h3 style={{ marginTop: 0 }}>Matières facultatives</h3>
          <p className="field-hint" style={{ marginBottom: 16 }}>Coche celles que tu veux suivre. Tu pourras en discuter avec un tuteur si tu changes d'avis, mais toi-même ne pourras plus modifier ce choix ensuite.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {matieresFacultativesDisponibles.map((m) => (
              <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <input type="checkbox" checked={facultativesCochees.includes(m.id)} onChange={() => basculerFacultative(m.id)} />
                {m.emoji ? `${m.emoji} ` : ''}{m.nom}
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
            <button className="btn btn-ghost" onClick={() => setEtape(2)}>← Retour</button>
            <button className="btn btn-primary" onClick={() => setEtape(etapeRecap)}>Suivant →</button>
          </div>
        </div>
      )}

      {etape === etapeRecap && (
        <div>
          <h3 style={{ marginTop: 0 }}>Récapitulatif</h3>
          <div className="recap-info-list">
            <div className="recap-info-item"><span>Modalité</span><span>{nomModalite(modaliteId)}</span></div>
            <div className="recap-info-item"><span>Sous-filière(s)</span><span>{sousFiliereIds.map(nomSousFiliere).join(', ')}</span></div>
            <div className="recap-info-item"><span>Matières obligatoires</span><span>{matieresObligatoires.map((m) => m.nom).join(', ') || 'Aucune'}</span></div>
            {etapeFacultatives && (
              <div className="recap-info-item"><span>Matières facultatives choisies</span><span>{matieres.filter((m) => facultativesCochees.includes(m.id)).map((m) => m.nom).join(', ') || 'Aucune'}</span></div>
            )}
          </div>

          {avertissementIrreversible && (
            <div className="warn-box">
              <span>⚠️</span>
              <span><b>Ce choix est définitif.</b> Une fois confirmé, tu ne pourras plus le modifier toi-même — seul un tuteur pourra le faire si besoin.</span>
            </div>
          )}

          {erreur && <div className="error-msg">{erreur}</div>}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
            <button className="btn btn-ghost" onClick={() => setEtape(etapeFacultatives || 2)} disabled={enCours}>← Retour</button>
            <button className="btn btn-primary" onClick={confirmer} disabled={enCours}>{enCours ? 'Enregistrement...' : 'Confirmer'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
