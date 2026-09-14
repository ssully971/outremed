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

  const { matiere_id, cours_id, qcm_id } = await req.json();

  const { data: mesAttempts } = await supabaseAdmin.from('attempts').select('id').eq('user_id', caller.user.id);
  const attemptIds = (mesAttempts || []).map((a) => a.id);
  if (attemptIds.length === 0) return new Response(JSON.stringify({ questions: [] }), { status: 200, headers: corsHeaders });

  const { data: reponses } = await supabaseAdmin
    .from('attempt_answers')
    .select('question_id, statut')
    .in('attempt_id', attemptIds)
    .neq('statut', 'correct');

  const questionIds = [...new Set((reponses || []).map((r) => r.question_id))];
  if (questionIds.length === 0) return new Response(JSON.stringify({ questions: [] }), { status: 200, headers: corsHeaders });

  const { data: questions } = await supabaseAdmin
    .from('questions')
    .select('id, enonce, ordre, qcm_id, lien, qcms(titre, matiere_id, cours_id)')
    .in('id', questionIds);

  let questionsFiltrees = questions || [];
  if (qcm_id) questionsFiltrees = questionsFiltrees.filter((q) => q.qcm_id === qcm_id);
  else if (cours_id) questionsFiltrees = questionsFiltrees.filter((q) => q.qcms?.cours_id === cours_id);
  else if (matiere_id) questionsFiltrees = questionsFiltrees.filter((q) => q.qcms?.matiere_id === matiere_id);

  const { data: items } = await supabaseAdmin
    .from('items')
    .select('id, question_id, lettre, texte, est_correct, correction')
    .in('question_id', questionsFiltrees.map((q) => q.id));

  const resultat = questionsFiltrees.map((q) => ({
    id: q.id,
    enonce: q.enonce,
    lien: q.lien,
    titreQcm: q.qcms?.titre,
    items: (items || []).filter((i) => i.question_id === q.id),
  }));

  return new Response(JSON.stringify({ questions: resultat }), { status: 200, headers: corsHeaders });
});
