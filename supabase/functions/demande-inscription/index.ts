import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL'),
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
);

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_TENTATIVES_PAR_HEURE = 5;

function ipAppelant(req) {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'inconnue';
}

// Fonction publique, volontairement sans vérification de Bearer token : un candidat n'a par
// définition pas encore de compte. Toute la logique sensible (anti-doublon, anti-spam,
// écriture) est donc entièrement côté serveur ici plutôt que dans une policy RLS, puisque la
// table demandes_inscription n'a aucune policy INSERT — c'est ce endpoint qui fait foi.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const ip = ipAppelant(req);

    // Anti-bruteforce : on journalise cette tentative avant tout, y compris les échecs de
    // validation qui suivent — c'est justement le spam de tentatives qu'on veut limiter, pas
    // seulement les demandes qui aboutissent.
    await supabaseAdmin.from('demande_inscription_tentatives').insert({ ip });
    // Purge best-effort des tentatives de plus de 24h, pas besoin de pg_cron pour ce volume.
    await supabaseAdmin.from('demande_inscription_tentatives').delete().lt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    const { count } = await supabaseAdmin
      .from('demande_inscription_tentatives')
      .select('id', { count: 'exact', head: true })
      .eq('ip', ip)
      .gt('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());
    if ((count || 0) > MAX_TENTATIVES_PAR_HEURE) {
      return new Response(JSON.stringify({ error: 'Trop de tentatives. Réessaie dans une heure.' }), { status: 429, headers: corsHeaders });
    }

    const { email, pseudo, nom_complet, site_web } = await req.json();

    // Honeypot : champ invisible pour un humain, que les bots remplissent souvent en
    // aveugle. On répond un succès factice sans rien écrire, pour ne pas leur indiquer
    // qu'ils ont été détectés.
    if (site_web) {
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
    }

    const emailNormalise = (email || '').trim().toLowerCase();
    const pseudoNettoye = (pseudo || '').trim();
    const nomNettoye = (nom_complet || '').trim();

    if (!emailNormalise || !pseudoNettoye || !nomNettoye) {
      return new Response(JSON.stringify({ error: 'Email, pseudo et nom complet sont obligatoires.' }), { status: 400, headers: corsHeaders });
    }
    if (!REGEX_EMAIL.test(emailNormalise)) {
      return new Response(JSON.stringify({ error: 'Adresse email invalide.' }), { status: 400, headers: corsHeaders });
    }

    // Un compte existe déjà avec cet email ?
    const { data: utilisateurs, error: erreurListe } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (erreurListe) {
      return new Response(JSON.stringify({ error: 'Erreur serveur : ' + erreurListe.message }), { status: 500, headers: corsHeaders });
    }
    const compteExistant = (utilisateurs?.users || []).some((u) => (u.email || '').toLowerCase() === emailNormalise);
    if (compteExistant) {
      return new Response(JSON.stringify({ error: 'Un compte existe déjà avec cette adresse email. Essaie de te connecter, ou utilise "Mot de passe oublié".' }), { status: 409, headers: corsHeaders });
    }

    // Une demande en attente existe déjà avec cet email ?
    const { data: demandeExistante } = await supabaseAdmin
      .from('demandes_inscription')
      .select('id')
      .ilike('email', emailNormalise)
      .eq('statut', 'en_attente')
      .limit(1);
    if (demandeExistante && demandeExistante.length > 0) {
      return new Response(JSON.stringify({ error: 'Une demande est déjà en attente pour cette adresse email.' }), { status: 409, headers: corsHeaders });
    }

    const { error: erreurInsertion } = await supabaseAdmin.from('demandes_inscription').insert({
      email: emailNormalise, pseudo: pseudoNettoye, nom_complet: nomNettoye, statut: 'en_attente',
    });
    if (erreurInsertion) {
      return new Response(JSON.stringify({ error: 'Erreur serveur : ' + erreurInsertion.message }), { status: 500, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Erreur inattendue du serveur : ' + (err?.message || String(err)) }), { status: 500, headers: corsHeaders });
  }
});
