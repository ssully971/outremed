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

    const { data: callerProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', caller.user.id).single();
    if (!['tuteur', 'proprietaire'].includes(callerProfile?.role)) {
      return new Response(JSON.stringify({ error: 'Réservé aux tuteurs et au propriétaire' }), { status: 403, headers: corsHeaders });
    }

    const { id, nouvel_email, redirect_url } = await req.json();
    if (!id) {
      return new Response(JSON.stringify({ error: 'id requis' }), { status: 400, headers: corsHeaders });
    }

    const { data: cible } = await supabaseAdmin.from('profiles').select('role, pseudo, email, mot_de_passe_defini').eq('id', id).single();
    if (!cible) {
      return new Response(JSON.stringify({ error: 'Compte introuvable' }), { status: 404, headers: corsHeaders });
    }
    if (cible.role === 'proprietaire') {
      return new Response(JSON.stringify({ error: "Impossible d'agir sur un compte propriétaire par ce biais" }), { status: 403, headers: corsHeaders });
    }
    if (cible.role === 'tuteur' && callerProfile?.role !== 'proprietaire') {
      return new Response(JSON.stringify({ error: 'Seul le propriétaire peut agir sur un compte tuteur' }), { status: 403, headers: corsHeaders });
    }
    if (cible.mot_de_passe_defini) {
      return new Response(JSON.stringify({ error: 'Ce compte a déjà défini son mot de passe — utilise plutôt « mot de passe oublié » depuis la page de connexion.' }), { status: 409, headers: corsHeaders });
    }

    let emailCible = cible.email;
    if (nouvel_email && nouvel_email !== cible.email) {
      const { error: erreurMaj } = await supabaseAdmin.auth.admin.updateUserById(id, { email: nouvel_email });
      if (erreurMaj) {
        return new Response(JSON.stringify({ error: erreurMaj.message }), { status: 400, headers: corsHeaders });
      }
      await supabaseAdmin.from('profiles').update({ email: nouvel_email }).eq('id', id);
      emailCible = nouvel_email;
    }

    if (!emailCible) {
      return new Response(JSON.stringify({ error: 'Aucun email connu pour ce compte — renseigne un email avant de renvoyer une invitation.' }), { status: 400, headers: corsHeaders });
    }

    const origineSite = origineFiable(redirect_url);
    const { error: erreurEnvoi } = await supabaseAdmin.auth.resetPasswordForEmail(emailCible, {
      redirectTo: `${origineSite}/definir-mot-de-passe`,
    });
    if (erreurEnvoi) {
      return new Response(JSON.stringify({ error: erreurEnvoi.message }), { status: 400, headers: corsHeaders });
    }

    await supabaseAdmin.from('historique_comptes').insert({
      action: 'renvoi_invitation',
      cible_id: id,
      effectue_par: caller.user.id,
      details: `${cible.pseudo} — invitation renvoyée à ${emailCible}`,
    });

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Erreur inattendue du serveur : ' + (err?.message || String(err)) }), { status: 500, headers: corsHeaders });
  }
});
