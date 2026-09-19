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

// Compresse et envoie l'image dans le bucket Storage, sans toucher à la table `questions` —
// utilisable aussi bien pour une question déjà en base (EditionQcm) que pour une question
// encore seulement en mémoire côté client avant publication (CreationQcm, qui n'a pas encore
// de question_id réel). `identifiant` sert uniquement de préfixe de nom de fichier (question.id
// réel, ou une clé locale temporaire tant que la question n'est pas créée).
export async function uploaderImage(identifiant, fichier, ancienneUrl) {
  const blob = await compresserImage(fichier);
  if (!blob) throw new Error("Impossible de traiter cette image.");
  if (blob.size > MAX_IMAGE_BYTES) {
    throw new Error(`Image trop lourde même après compression (max ${Math.round(MAX_IMAGE_BYTES / 1024)} Ko).`);
  }

  const chemin = `${identifiant}-${Date.now()}.jpg`;
  const { error: erreurUpload } = await supabase.storage.from('question-images').upload(chemin, blob, { contentType: 'image/jpeg', upsert: false });
  if (erreurUpload) throw new Error(erreurUpload.message);

  // Remplacement : l'ancien fichier n'est plus référencé nulle part, on le retire pour ne
  // pas accumuler des orphelins dans le bucket (limité en taille).
  if (ancienneUrl) await supprimerImageStockage(ancienneUrl);

  const { data: urlData } = supabase.storage.from('question-images').getPublicUrl(chemin);
  return urlData.publicUrl;
}

export async function supprimerImageStockage(url) {
  const chemin = url ? cheminDepuisUrl(url) : null;
  if (!chemin) return;
  const { error } = await supabase.storage.from('question-images').remove([chemin]);
  if (error) throw new Error(error.message);
}
