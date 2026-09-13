import { supabase } from './supabaseClient';

function typeGeneralQcm(qcm) {
  if (qcm.is_kholle) return 'kholle';
  if (qcm.is_annale) return 'annale';
  if (qcm.type_qcm === 'concours_blanc') return 'concours_blanc';
  return 'entrainement';
}

function nomCours(coursId, matieres) {
  return matieres.flatMap((m) => m.cours || []).find((c) => c.id === coursId)?.nom || null;
}

// Reconstitue le JSON exportable d'un QCM : métadonnées + contenu (questions/items),
// au même format que celui attendu par l'import (point 1), avec les métadonnées en plus.
export async function construireDonneesExport(qcm, matieres) {
  const { data: questions } = await supabase.from('questions').select('*').eq('qcm_id', qcm.id).order('ordre');
  const { data: items } = await supabase.from('items').select('*').in('question_id', (questions || []).map((q) => q.id));

  let cours = null;
  if (qcm.is_annale) {
    const { data: liaisons } = await supabase.from('qcm_cours').select('cours_id').eq('qcm_id', qcm.id);
    const noms = (liaisons || []).map((l) => nomCours(l.cours_id, matieres)).filter(Boolean);
    cours = noms.length > 0 ? noms : null;
  } else if (qcm.cours_id) {
    cours = nomCours(qcm.cours_id, matieres);
  }

  return {
    titre: qcm.titre,
    matiere: matieres.find((m) => m.id === qcm.matiere_id)?.nom || null,
    cours,
    type_qcm: typeGeneralQcm(qcm),
    questions: (questions || []).map((q) => ({
      enonce: q.enonce,
      items: (items || [])
        .filter((it) => it.question_id === q.id)
        .sort((a, b) => a.lettre.localeCompare(b.lettre))
        .map((it) => ({ lettre: it.lettre, texte: it.texte, est_correct: it.est_correct, correction: it.correction || '' })),
    })),
  };
}

function nomFichierQcm(qcm) {
  const slug = qcm.titre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return `qcm-${String(qcm.numero).padStart(4, '0')}-${slug || 'sans-titre'}.json`;
}

function telechargerJson(nomFichier, donnees) {
  const blob = new Blob([JSON.stringify(donnees, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomFichier;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exporterUnQcm(qcm, matieres) {
  const donnees = await construireDonneesExport(qcm, matieres);
  telechargerJson(nomFichierQcm(qcm), donnees);
}

export async function exporterSelectionQcm(qcmsSelectionnes, matieres) {
  const donnees = await Promise.all(qcmsSelectionnes.map((qcm) => construireDonneesExport(qcm, matieres)));
  const nomFichier = `qcms-export-${new Date().toISOString().slice(0, 10)}.json`;
  telechargerJson(nomFichier, donnees);
}
