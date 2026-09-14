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

  const { attempt_id } = await req.json();
  if (!attempt_id) return new Response(JSON.stringify({ error: 'attempt_id requis' }), { status: 400, headers: corsHeaders });

  const { data: attempt } = await supabaseAdmin.from('attempts').select('*, qcms(titre)').eq('id', attempt_id).single();
  if (!attempt) return new Response(JSON.stringify({ error: 'Tentative introuvable' }), { status: 404, headers: corsHeaders });

  const { data: callerProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', caller.user.id).single();
  const estAutorise = attempt.user_id === caller.user.id || ['tuteur', 'proprietaire'].includes(callerProfile?.role);
  if (!estAutorise) return new Response(JSON.stringify({ error: 'Accès refusé' }), { status: 403, headers: corsHeaders });

  const { data: reponses } = await supabaseAdmin
    .from('attempt_answers')
    .select('question_id, items_selectionnes, statut, questions(enonce, ordre, lien)')
    .eq('attempt_id', attempt_id);

  const questionIds = (reponses || []).map((r) => r.question_id);
  const { data: items } = await supabaseAdmin
    .from('items')
    .select('id, question_id, lettre, texte, est_correct, correction')
    .in('question_id', questionIds);

  const detail = (reponses || [])
    .sort((a, b) => a.questions.ordre - b.questions.ordre)
    .map((r) => ({
      enonce: r.questions.enonce,
      ordre: r.questions.ordre,
      lien: r.questions.lien,
      statut: r.statut,
      items_selectionnes: r.items_selectionnes,
      items: (items || []).filter((i) => i.question_id === r.question_id),
    }));

  return new Response(JSON.stringify({
    titre: attempt.qcms.titre, score: attempt.score, user_id: attempt.user_id,
    temps_passe_secondes: attempt.temps_passe_secondes, detail,
  }), { status: 200, headers: corsHeaders });
});
