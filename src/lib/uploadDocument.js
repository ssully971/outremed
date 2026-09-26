import { supabase } from './supabaseClient';

export const MAX_PDF_BYTES = 5 * 1024 * 1024; // 5 Mo, aligné sur le file_size_limit du bucket

function cheminDepuisUrl(url) {
  const marqueur = '/documents-legaux/';
  const idx = url.indexOf(marqueur);
  return idx >= 0 ? url.slice(idx + marqueur.length) : null;
}

// Un seul document à la fois (pas un id par question comme uploadImage.js) — identifiant est
// une constante fixe côté appelant (ex. 'politique-confidentialite'), pas de compression
// possible pour un PDF donc juste une validation de type/taille avant envoi.
export async function uploaderDocumentLegal(identifiant, fichier, ancienneUrl) {
  if (fichier.type !== 'application/pdf') throw new Error('Le fichier doit être un PDF.');
  if (fichier.size > MAX_PDF_BYTES) {
    throw new Error(`PDF trop lourd (max ${Math.round(MAX_PDF_BYTES / 1024 / 1024)} Mo).`);
  }

  const chemin = `${identifiant}-${Date.now()}.pdf`;
  const { error: erreurUpload } = await supabase.storage.from('documents-legaux').upload(chemin, fichier, { contentType: 'application/pdf', upsert: false });
  if (erreurUpload) throw new Error(erreurUpload.message);

  // Remplacement : retire l'ancien fichier une fois le nouveau confirmé en place, pour ne
  // jamais se retrouver sans document si l'upload échouait en cours de route. Un échec de
  // suppression ne doit jamais faire perdre la nouvelle URL déjà uploadée avec succès — au pire
  // l'ancien fichier reste orphelin en storage, ce qui est nettement moins grave.
  if (ancienneUrl) {
    try { await supprimerDocumentLegal(ancienneUrl); } catch { /* best effort */ }
  }

  const { data: urlData } = supabase.storage.from('documents-legaux').getPublicUrl(chemin);
  return urlData.publicUrl;
}

export async function supprimerDocumentLegal(url) {
  const chemin = url ? cheminDepuisUrl(url) : null;
  if (!chemin) return;
  const { error } = await supabase.storage.from('documents-legaux').remove([chemin]);
  if (error) throw new Error(error.message);
}
