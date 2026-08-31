import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL'),
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401, headers: corsHeaders });

  const token = authHeader.replace('Bearer ', '');
  const { data: caller } = await supabaseAdmin.auth.getUser(token);
  if (!caller?.user) return new Response(JSON.stringify({ error: 'Session invalide' }), { status: 401, headers: corsHeaders });

  const { data: callerProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', caller.user.id).single();

  const { user_id } = await req.json();
  if (!user_id) return new Response(JSON.stringify({ error: 'user_id requis' }), { status: 400, headers: corsHeaders });

  const { data: cible } = await supabaseAdmin.from('profiles').select('role, pseudo').eq('id', user_id).single();
  if (!cible) return new Response(JSON.stringify({ error: 'Compte introuvable' }), { status: 404, headers: corsHeaders });

  if (cible.role === 'proprietaire') {
    return new Response(JSON.stringify({ error: 'Un compte propriétaire ne peut pas être supprimé par ce biais' }), { status: 403, headers: corsHeaders });
  }
  if (cible.role === 'etudiant' && !['tuteur', 'proprietaire'].includes(callerProfile?.role)) {
    return new Response(JSON.stringify({ error: 'Réservé aux tuteurs et au propriétaire' }), { status: 403, headers: corsHeaders });
  }
  if (cible.role === 'tuteur' && callerProfile?.role !== 'proprietaire') {
    return new Response(JSON.stringify({ error: 'Seul le propriétaire peut supprimer un compte tuteur' }), { status: 403, headers: corsHeaders });
  }

  // On détache d'abord ce compte des tables qu'il a créées/modifiées, pour ne pas les supprimer par erreur
  await supabaseAdmin.from('qcms').update({ cree_par: null }).eq('cree_par', user_id);
  await supabaseAdmin.from('qcms').update({ verifie_par: null }).eq('verifie_par', user_id);
  await supabaseAdmin.from('qcms').update({ modifie_par: null }).eq('modifie_par', user_id);
  await supabaseAdmin.from('historique_qcm').update({ effectue_par: null }).eq('effectue_par', user_id);
  await supabaseAdmin.from('canaux').update({ cree_par: null }).eq('cree_par', user_id);
  await supabaseAdmin.from('semaines_kholle').update({ cree_par: null }).eq('cree_par', user_id);
  await supabaseAdmin.from('semaines_kholle').update({ modifie_par: null }).eq('modifie_par', user_id);
  await supabaseAdmin.from('profiles').update({ cree_par: null }).eq('cree_par', user_id);
  await supabaseAdmin.from('matieres').update({ cree_par: null }).eq('cree_par', user_id);
  await supabaseAdmin.from('cours').update({ cree_par: null }).eq('cree_par', user_id);
  await supabaseAdmin.from('echeances').update({ cree_par: null }).eq('cree_par', user_id);
  await supabaseAdmin.from('annonces').update({ cree_par: null }).eq('cree_par', user_id);
  await supabaseAdmin.from('messages').update({ supprime_par: null }).eq('supprime_par', user_id);
  await supabaseAdmin.from('signalements_erreur').update({ auteur_id: null }).eq('auteur_id', user_id);
  await supabaseAdmin.from('signalements_erreur').update({ traite_par: null }).eq('traite_par', user_id);

  // Historique des comptes : on garde les lignes, on détache juste la référence au compte supprimé
  await supabaseAdmin.from('historique_comptes').update({ cible_id: null }).eq('cible_id', user_id);
  await supabaseAdmin.from('historique_comptes').update({ effectue_par: null }).eq('effectue_par', user_id);

  // On trace la suppression elle-même, avant que le compte ne disparaisse
  await supabaseAdmin.from('historique_comptes').insert({
    action: 'suppression_definitive',
    cible_id: null,
    effectue_par: caller.user.id,
    details: `${cible.pseudo} (${cible.role}) supprimé définitivement`,
  });

  const { data: autresAdmins } = await supabaseAdmin.from('profiles').select('id, notif_prefs').in('role', ['tuteur', 'proprietaire']).neq('id', caller.user.id);
  for (const admin of autresAdmins || []) {
    const prefs = admin.notif_prefs || {};
    if (prefs.compte_admin === false) continue;
    await supabaseAdmin.from('notifications').insert({
      user_id: admin.id,
      contenu: `${cible.pseudo} (${cible.role}) a été supprimé définitivement.`,
      lien: '/historiques',
      categorie: 'compte_admin',
    });
  }

  // Ses propres données
  const { data: sesAttempts } = await supabaseAdmin.from('attempts').select('id').eq('user_id', user_id);
  const attemptIds = (sesAttempts || []).map((a) => a.id);
  if (attemptIds.length > 0) {
    await supabaseAdmin.from('attempt_answers').delete().in('attempt_id', attemptIds);
  }
  await supabaseAdmin.from('attempts').delete().eq('user_id', user_id);
  await supabaseAdmin.from('notifications').delete().eq('user_id', user_id);
  await supabaseAdmin.from('canal_membres').delete().eq('user_id', user_id);
  await supabaseAdmin.from('canal_dernier_vu').delete().eq('user_id', user_id);
  await supabaseAdmin.from('annonces_vues').delete().eq('user_id', user_id);
  await supabaseAdmin.from('messages').delete().eq('auteur_id', user_id);

  // Le profil, puis le compte d'authentification
  const { error: erreurProfil } = await supabaseAdmin.from('profiles').delete().eq('id', user_id);
  if (erreurProfil) return new Response(JSON.stringify({ error: `Suppression du profil bloquée : ${erreurProfil.message}` }), { status: 400, headers: corsHeaders });

  const { error: erreurAuth } = await supabaseAdmin.auth.admin.deleteUser(user_id);
  if (erreurAuth) return new Response(JSON.stringify({ error: erreurAuth.message }), { status: 400, headers: corsHeaders });

  return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
});
