import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL'),
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
);

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401 });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: caller } = await supabaseAdmin.auth.getUser(token);
  if (!caller?.user) {
    return new Response(JSON.stringify({ error: 'Session invalide' }), { status: 401 });
  }

  const { data: callerProfile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', caller.user.id)
    .single();

  const { email, pseudo, role, statut_compte, essai_semaines, redirect_url } = await req.json();

  if (!email || !pseudo || !role) {
    return new Response(JSON.stringify({ error: 'Email, pseudo et rôle requis' }), { status: 400 });
  }

  // Règles de permission : seul un propriétaire peut créer un tuteur.
  // Un tuteur ou un propriétaire peut créer un étudiant.
  if (role === 'tuteur' && callerProfile?.role !== 'proprietaire') {
    return new Response(JSON.stringify({ error: 'Seul le propriétaire peut créer un compte tuteur' }), { status: 403 });
  }
  if (role === 'etudiant' && !['tuteur', 'proprietaire'].includes(callerProfile?.role)) {
    return new Response(JSON.stringify({ error: 'Réservé aux tuteurs et au propriétaire' }), { status: 403 });
  }
  if (role === 'proprietaire') {
    return new Response(JSON.stringify({ error: 'Impossible de créer un compte propriétaire par ce biais' }), { status: 403 });
  }

  const origineSite = redirect_url || 'https://outremed.vercel.app';
  const { data: newUser, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${origineSite}/definir-mot-de-passe`,
  });
  if (inviteError) {
    return new Response(JSON.stringify({ error: inviteError.message }), { status: 400 });
  }

  let essaiFin = null;
  if (statut_compte === 'essai_gratuit') {
    const fin = new Date();
    fin.setDate(fin.getDate() + (essai_semaines === 2 ? 14 : 7));
    essaiFin = fin.toISOString();
  }

  const { error: profileError } = await supabaseAdmin.from('profiles').insert({
    id: newUser.user.id,
    pseudo,
    role,
    statut_compte: statut_compte || 'actif',
    essai_fin: essaiFin,
    cree_par: caller.user.id,
  });

  if (profileError) {
    return new Response(JSON.stringify({ error: profileError.message }), { status: 400 });
  }

  // Historique — visible uniquement par le propriétaire
  await supabaseAdmin.from('historique_comptes').insert({
    action: role === 'tuteur' ? 'creation_tuteur' : 'creation_etudiant',
    cible_id: newUser.user.id,
    effectue_par: caller.user.id,
    details: `${pseudo} (${email}) — statut : ${statut_compte || 'actif'}`,
  });

  return new Response(JSON.stringify({ success: true }), { status: 200 });
});
