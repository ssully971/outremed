import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { origineFiable } from '../_shared/origine.ts';

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL'),
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401, headers: corsHeaders });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: caller } = await supabaseAdmin.auth.getUser(token);
    if (!caller?.user) {
      return new Response(JSON.stringify({ error: 'Session invalide' }), { status: 401, headers: corsHeaders });
    }

    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', caller.user.id)
      .single();

    const { email, pseudo, role, statut_compte, essai_semaines, redirect_url, categorie_compte, nom_complet } = await req.json();

    if (!email || !pseudo || !role) {
      return new Response(JSON.stringify({ error: 'Email, pseudo et rôle requis' }), { status: 400, headers: corsHeaders });
    }

    // Règles de permission : seul un propriétaire peut créer un tuteur.
    // Un tuteur ou un propriétaire peut créer un étudiant.
    if (role === 'tuteur' && callerProfile?.role !== 'proprietaire') {
      return new Response(JSON.stringify({ error: 'Seul le propriétaire peut créer un compte tuteur' }), { status: 403, headers: corsHeaders });
    }
    if (role === 'etudiant' && !['tuteur', 'proprietaire'].includes(callerProfile?.role)) {
      return new Response(JSON.stringify({ error: 'Réservé aux tuteurs et au propriétaire' }), { status: 403, headers: corsHeaders });
    }
    if (role === 'proprietaire') {
      return new Response(JSON.stringify({ error: 'Impossible de créer un compte propriétaire par ce biais' }), { status: 403, headers: corsHeaders });
    }

    const origineSite = origineFiable(redirect_url);
    const libelleRole = categorie_compte === 'annale' ? 'étudiant annale' : role === 'tuteur' ? 'tuteur' : 'étudiant';
    const { data: newUser, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${origineSite}/definir-mot-de-passe`,
      data: { pseudo, libelle_role: libelleRole },
    });
    if (inviteError) {
      return new Response(JSON.stringify({ error: inviteError.message }), { status: 400, headers: corsHeaders });
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
      email,
      nom_complet: nom_complet || null,
      statut_compte: statut_compte || 'actif',
      essai_fin: essaiFin,
      cree_par: caller.user.id,
      categorie_compte: role === 'etudiant' ? (categorie_compte || null) : null,
    });

    if (profileError) {
      return new Response(JSON.stringify({ error: profileError.message }), { status: 400, headers: corsHeaders });
    }

    // Historique — visible uniquement par le propriétaire
    await supabaseAdmin.from('historique_comptes').insert({
      action: role === 'tuteur' ? 'creation_tuteur' : 'creation_etudiant',
      cible_id: newUser.user.id,
      effectue_par: caller.user.id,
      details: `${pseudo} (${email}) — statut : ${statut_compte || 'actif'}`,
    });

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Erreur inattendue du serveur : ' + (err?.message || String(err)) }), { status: 500, headers: corsHeaders });
  }
});
