export const ORIGINE_CANONIQUE = 'https://outremed.vercel.app';

// Le tuteur/propriétaire peut se trouver sur une URL de déploiement Vercel différente de
// l'alias stable (preview, ancien lien favori, etc.) — si le redirect_to envoyé à Supabase ne
// correspond pas exactement à l'allowlist configurée côté Auth, Supabase l'ignore et retombe
// silencieusement sur site_url SANS le chemin demandé, envoyant l'étudiant sur la page
// d'accueil au lieu de la page attendue (bug constaté le 2026-09-22). On ne fait donc jamais
// confiance à l'origine envoyée par le client au-delà de ce qu'on sait déjà accepté par
// Supabase.
export function origineFiable(redirectUrl) {
  if (redirectUrl === ORIGINE_CANONIQUE) return redirectUrl;
  if (redirectUrl && redirectUrl.startsWith('http://localhost')) return redirectUrl;
  return ORIGINE_CANONIQUE;
}
