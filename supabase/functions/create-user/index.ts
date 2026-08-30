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

  const { qcm_id, reponses, temps_passe_secondes } = await req.json();
  if (!qcm_id || !reponses) return new Response(JSON.stringify({ error: 'Données manquantes' }), { status: 400, headers: corsHeaders });

  const { data: qcm } = await supabaseAdmin.from('qcms').select('*').eq('id', qcm_id).single();
  if (!qcm) return new Response(JSON.stringify({ error: 'QCM introuvable' }), { status: 404, headers: corsHeaders });

  if (qcm.type_qcm === 'concours_blanc') {
    const { data: dejaFait } = await supabaseAdmin
      .from('attempts')
      .select('id')
      .eq('qcm_id', qcm_id)
      .eq('user_id', caller.user.id)
      .limit(1);
    if (dejaFait && dejaFait.length > 0) {
      return new Response(JSON.stringify({ error: "Ce QCM ne peut être fait qu'une seule fois." }), { status: 403, headers: corsHeaders });
    }
  }

  const { data: questions } = await supabaseAdmin
    .from('questions')
    .select('id, items(id, est_correct)')
    .eq('qcm_id', qcm_id);

  let score = 0;
  const detail = [];

  for (const q of questions) {
    const reponse = reponses.find((r) => r.question_id === q.id);
    const selectionnes = reponse ? reponse.items_selectionnes : [];

    let erreurs = 0;
    q.items.forEach((item) => {
      const estSelectionne = selectionnes.includes(item.id);
      if (item.est_correct && !estSelectionne) erreurs++;
      if (!item.est_correct && estSelectionne) erreurs++;
    });

    const pts = erreurs === 0 ? 1 : erreurs === 1 ? 0.5 : 0;
    score += pts;
    detail.push({
      question_id: q.id,
      items_selectionnes: selectionnes,
      statut: pts === 1 ? 'correct' : pts === 0.5 ? 'partiel' : 'incorrect',
    });
  }

  const { data: attempt, error: attemptError } = await supabaseAdmin
    .from('attempts')
    .insert({ qcm_id, user_id: caller.user.id, score, temps_passe_secondes })
    .select()
    .single();

  if (attemptError) return new Response(JSON.stringify({ error: attemptError.message }), { status: 400, headers: corsHeaders });

  await supabaseAdmin.from('attempt_answers').insert(
    detail.map((d) => ({ attempt_id: attempt.id, ...d }))
  );

  return new Response(JSON.stringify({ score, detail }), { status: 200, headers: corsHeaders });
});
