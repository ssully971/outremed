import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { estMatiereActive } from '../lib/filiere';
import SelecteurFiliere from '../components/SelecteurFiliere';

// Reconfirmation périodique des matières facultatives : affichée seulement si l'étudiant a déjà
// une filière (sinon c'est ChoisirFiliere.jsx qui s'applique) et que le semestre actif a changé
// depuis sa dernière confirmation. Si aucune facultative n'est concernée ce semestre, on marque
// silencieusement la confirmation sans rien afficher (voir Navbar.jsx pour la logique de garde
// équivalente qui décide si cette page doit être atteinte).
export default function ChoisirFacultatives() {
  const [profil, setProfil] = useState(null);
  const [chargement, setChargement] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function charger() {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) { navigate('/'); return; }
      const uid = session.session.user.id;
      const { data: moi } = await supabase.from('profiles').select('id, role, modalite_id, facultatives_confirmees_pour').eq('id', uid).single();
      if (moi?.role !== 'etudiant') { navigate('/accueil'); return; }
      if (!moi.modalite_id) { navigate('/choisir-filiere'); return; }

      const { data: param } = await supabase.from('parametres').select('valeur').eq('cle', 'semestre_actif').single();
      const semestreActif = param?.valeur || '';
      if (moi.facultatives_confirmees_pour === semestreActif) { navigate('/accueil'); return; }

      const { data: psf } = await supabase.from('profil_sous_filieres').select('sous_filiere_id').eq('profile_id', uid);
      const sousFiliereIds = (psf || []).map((p) => p.sous_filiere_id);
      const { data: pm } = await supabase.from('profil_matieres').select('matiere_id, statut').eq('profile_id', uid);
      const { data: sfm } = await supabase.from('sous_filiere_matieres').select('*').in('sous_filiere_id', sousFiliereIds).eq('statut', 'facultative');
      const { data: mats } = await supabase.from('matieres').select('*').eq('est_prive', false);

      const facultativesDisponiblesCetteSaison = (sfm || [])
        .map((s) => (mats || []).find((m) => m.id === s.matiere_id))
        .filter((m) => m && estMatiereActive(m, semestreActif));

      if (facultativesDisponiblesCetteSaison.length === 0) {
        // Rien à reconfirmer ce semestre : on marque silencieusement et on continue.
        await supabase.from('profiles').update({ facultatives_confirmees_pour: semestreActif }).eq('id', uid);
        navigate('/accueil');
        return;
      }

      setProfil({
        id: uid,
        modaliteId: moi.modalite_id,
        sousFiliereIds,
        matieresFacultativesIds: (pm || []).filter((p) => p.statut === 'facultative').map((p) => p.matiere_id),
      });
      setChargement(false);
    }
    charger();
  }, [navigate]);

  if (chargement || !profil) return <div style={{ padding: 40 }}>Chargement...</div>;

  return (
    <div className="container" style={{ maxWidth: 640 }}>
      <h1 className="page-title">Nouveau semestre</h1>
      <p className="page-sub">Vérifie les matières facultatives que tu veux suivre ce semestre.</p>
      <div className="card">
        <SelecteurFiliere
          profileId={profil.id}
          facultativesSeulement
          valeurInitiale={{
            modaliteId: profil.modaliteId,
            sousFiliereIds: profil.sousFiliereIds,
            matieresFacultativesIds: profil.matieresFacultativesIds,
          }}
          onApplique={() => navigate('/accueil')}
        />
      </div>
    </div>
  );
}
