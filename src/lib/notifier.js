import { supabase } from './supabaseClient';

export async function envoyerNotification(userId, categorie, contenu, lien) {
  const { data: profil } = await supabase.from('profiles').select('notif_prefs').eq('id', userId).single();
  const prefs = profil?.notif_prefs || {};
  if (prefs[categorie] === false) return;
  await supabase.from('notifications').insert({ user_id: userId, contenu, lien, categorie });
}

export async function envoyerNotificationGroupe(userIds, categorie, contenu, lien) {
  for (const uid of userIds) {
    await envoyerNotification(uid, categorie, contenu, lien);
  }
}
