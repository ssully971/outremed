import { supabase } from './supabaseClient';

export const MAX_IMAGE_BYTES = 500 * 1024; // 500 Ko — bucket Storage limité, garde de la marge (~1000 images)
const DIMENSION_MAX = 1280;

async function compresserImage(fichier) {
  const bitmap = await createImageBitmap(fichier);
  let largeur = bitmap.width;
  let hauteur = bitmap.height;
  if (largeur > DIMENSION_MAX || hauteur > DIMENSION_MAX) {
    const ratio = Math.min(DIMENSION_MAX / largeur, DIMENSION_MAX / hauteur);
    largeur = Math.round(largeur * ratio);
    hauteur = Math.round(hauteur * ratio);
  }

  const canvas = document.createElement('canvas');
  canvas.width = largeur;
  canvas.height = hauteur;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, largeur, hauteur);

  async function exporter(qualite) {
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', qualite));
  }

  let qualite = 0.85;
  let blob = await exporter(qualite);
  while (blob && blob.size > MAX_IMAGE_BYTES && qualite > 0.35) {
    qualite -= 0.1;
    blob = await exporter(qualite);
  }

  while (blob && blob.size > MAX_IMAGE_BYTES && largeur > 400) {
    largeur = Math.round(largeur * 0.8);
    hauteur = Math.round(hauteur * 0.8);
    canvas.width = largeur;
    canvas.height = hauteur;
    ctx.drawImage(bitmap, 0, 0, largeur, hauteur);
    blob = await exporter(0.7);
  }

  return blob;
}

function cheminDepuisUrl(url) {
  const marqueur = '/question-images/';
  const idx = url.indexOf(marqueur);
  return idx >= 0 ? url.slice(idx + marqueur.length) : null;
}

export async function uploaderImageQuestion(questionId, fichier, ancienneUrl) {
  const blob = await compresserImage(fichier);
  if (!blob) throw new Error("Impossible de traiter cette image.");
  if (blob.size > MAX_IMAGE_BYTES) {
    throw new Error(`Image trop lourde même après compression (max ${Math.round(MAX_IMAGE_BYTES / 1024)} Ko).`);
  }

  const chemin = `${questionId}-${Date.now()}.jpg`;
  const { error: erreurUpload } = await supabase.storage.from('question-images').upload(chemin, blob, { contentType: 'image/jpeg', upsert: false });
  if (erreurUpload) throw new Error(erreurUpload.message);

  const { data: urlData } = supabase.storage.from('question-images').getPublicUrl(chemin);
  const { error: erreurMaj } = await supabase.from('questions').update({ lien: urlData.publicUrl }).eq('id', questionId);
  if (erreurMaj) throw new Error(erreurMaj.message);

  // Remplacement : l'ancien fichier n'est plus référencé par aucune question, on le retire
  // pour ne pas accumuler des orphelins dans le bucket (limité en taille).
  const ancienChemin = ancienneUrl ? cheminDepuisUrl(ancienneUrl) : null;
  if (ancienChemin) await supabase.storage.from('question-images').remove([ancienChemin]);

  return urlData.publicUrl;
}

export async function supprimerImageQuestion(questionId, urlActuelle) {
  const chemin = urlActuelle ? cheminDepuisUrl(urlActuelle) : null;
  if (chemin) {
    const { error: erreurSuppression } = await supabase.storage.from('question-images').remove([chemin]);
    if (erreurSuppression) throw new Error(erreurSuppression.message);
  }
  const { error } = await supabase.from('questions').update({ lien: null }).eq('id', questionId);
  if (error) throw new Error(error.message);
}
