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

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401, headers: corsHeaders });

    const token = authHeader.replace('Bearer ', '');
    const { data: caller } = await supabaseAdmin.auth.getUser(token);
    if (!caller?.user) return new Response(JSON.stringify({ error: 'Session invalide' }), { status: 401, headers: corsHeaders });

    const { qcm_id, reponses, temps_passe_secondes } = await req.json();
    if (!qcm_id || !reponses) return new Response(JSON.stringify({ error: 'Données manquantes' }), { status: 400, headers: corsHeaders });

    const { data: qcm, error: erreurQcm } = await supabaseAdmin.from('qcms').select('*').eq('id', qcm_id).single();
    if (erreurQcm || !qcm) return new Response(JSON.stringify({ error: 'QCM introuvable : ' + (erreurQcm?.message || '') }), { status: 404, headers: corsHeaders });

    // Une seule tentative pour concours blanc / kholle (jamais pour un QCM privé)
    if (qcm.type_qcm === 'concours_blanc' && !qcm.est_prive) {
      const { data: dejaFait } = await supabaseAdmin
        .from('attempts')
        .select('id')
        .eq('qcm_id', qcm_id)
        .eq('user_id', caller.user.id)
        .limit(1);
      if (dejaFait && dejaFait.length > 0) {
        return new Response(JSON.stringify({ error: 'Ce QCM ne peut être fait qu\'une seule fois.' }), { status: 403, headers: corsHeaders });
      }
    }

    const { data: questions, error: erreurQuestions } = await supabaseAdmin
      .from('questions')
      .select('id, items(id, est_correct)')
      .eq('qcm_id', qcm_id);
    if (erreurQuestions) return new Response(JSON.stringify({ error: 'Erreur de lecture des questions : ' + erreurQuestions.message }), { status: 400, headers: corsHeaders });

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

    if (attemptError) return new Response(JSON.stringify({ error: "Enregistrement de la tentative impossible : " + attemptError.message }), { status: 400, headers: corsHeaders });

    const { error: erreurReponses } = await supabaseAdmin.from('attempt_answers').insert(
      detail.map((d) => ({ attempt_id: attempt.id, ...d }))
    );
    if (erreurReponses) return new Response(JSON.stringify({ error: "Enregistrement du détail impossible : " + erreurReponses.message }), { status: 400, headers: corsHeaders });

    return new Response(JSON.stringify({ score, detail, attempt_id: attempt.id }), { status: 200, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Erreur inattendue du serveur : ' + (err?.message || String(err)) }), { status: 500, headers: corsHeaders });
  }
});
