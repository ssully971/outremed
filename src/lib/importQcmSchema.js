// Schéma JSON standard pour l'import rapide de QCM (voir CreationQcm.jsx / ImportJsonQcm.jsx)

export const TYPES_QCM_VALIDES = ['entrainement', 'kholle', 'annale', 'concours_blanc'];
export const NB_ITEMS_MIN = 2;
export const NB_ITEMS_MAX = 8; // limité par LETTRES = 'ABCDEFGH' dans CreationQcm.jsx

export const EXEMPLE_JSON_QCM = `{
  "titre": "Nom du QCM",
  "matiere": "Nom de la matière",
  "cours": "Nom du cours (optionnel)",
  "type_qcm": "entrainement",
  "questions": [
    {
      "enonce": "Texte de la question",
      "items": [
        { "lettre": "A", "texte": "Texte de l'item", "est_correct": true, "correction": "Explication de la réponse" },
        { "lettre": "B", "texte": "Texte de l'item", "est_correct": false, "correction": "Explication de la réponse" }
      ]
    }
  ]
}`;

export const PROMPT_IMPORT_QCM = `Tu es un générateur de QCM médicaux au format JSON pour la plateforme Outremed.

Avant de commencer, demande-moi ces informations si je ne te les ai pas déjà données :
- Matière
- Type de QCM (entrainement, annale ou concours_blanc)
- Nom du QCM
- Nombre de questions
- Nombre d'items par question (entre 2 et 8)

Tu vas ensuite recevoir soit :
1. Un QCM déjà existant (texte, photo retranscrite, etc.) → tu dois le retranscrire intégralement dans le format ci-dessous, sans rien inventer, résumer ni corriger le contenu médical.
2. Un cours (texte de contenu) → tu dois générer un QCM original à partir de ce cours, avec le nombre de questions et d'items demandé, en respectant fidèlement le contenu du cours (aucune invention médicale).

Réponds UNIQUEMENT avec le JSON, sans texte avant/après, sans balises markdown \`\`\`, exactement dans ce format :

${EXEMPLE_JSON_QCM}

Règles impératives :
- "type_qcm" doit être exactement l'une de ces valeurs : "entrainement", "kholle", "annale", "concours_blanc".
- Chaque question doit avoir entre 2 et 8 items.
- Chaque item doit avoir "est_correct": true ou false (jamais omis).
- Le champ "correction" doit expliquer pourquoi l'item est vrai ou faux (obligatoire pour un apprentissage utile).
- "cours" est optionnel : ne le mets que si un nom de cours précis s'applique.
- Le JSON doit être strictement valide (guillemets doubles, pas de virgule finale).`;

function estChaineNonVide(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

// Parse et valide un texte JSON de QCM. Ne résout pas les noms de matière/cours en id
// (fait par l'appelant, qui a accès à la liste des matières/cours chargées).
export function validerJsonQcm(texteJson) {
  let brut;
  try {
    brut = JSON.parse(texteJson);
  } catch (e) {
    return { ok: false, erreurs: [`JSON invalide : ${e.message}`] };
  }

  const erreurs = [];
  const avertissements = [];

  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) {
    return { ok: false, erreurs: ['Le JSON doit être un objet (et non un tableau ou une valeur simple).'] };
  }

  if (!estChaineNonVide(brut.titre)) erreurs.push('Le champ "titre" est obligatoire.');
  if (!estChaineNonVide(brut.matiere)) erreurs.push('Le champ "matiere" est obligatoire.');

  let typeGeneral = 'entrainement';
  if (brut.type_qcm !== undefined) {
    if (!TYPES_QCM_VALIDES.includes(brut.type_qcm)) {
      erreurs.push(`"type_qcm" doit être l'une de ces valeurs : ${TYPES_QCM_VALIDES.join(', ')} (reçu : ${JSON.stringify(brut.type_qcm)}).`);
    } else {
      typeGeneral = brut.type_qcm;
    }
  }

  let nomsCoursAnnale = [];
  let nomCours = '';
  if (typeGeneral === 'annale') {
    if (Array.isArray(brut.cours)) {
      nomsCoursAnnale = brut.cours.filter(estChaineNonVide).map((n) => n.trim());
    } else if (estChaineNonVide(brut.cours)) {
      nomsCoursAnnale = [brut.cours.trim()];
    }
    if (nomsCoursAnnale.length === 0) erreurs.push('Pour une "annale", le champ "cours" doit contenir au moins un nom de cours (chaîne ou tableau de chaînes).');
  } else if (brut.cours !== undefined) {
    if (Array.isArray(brut.cours)) {
      erreurs.push('Le champ "cours" doit être une simple chaîne de caractères pour ce type de QCM.');
    } else if (estChaineNonVide(brut.cours)) {
      nomCours = brut.cours.trim();
    }
  }

  const questionsBrutes = Array.isArray(brut.questions) ? brut.questions : null;
  if (!questionsBrutes || questionsBrutes.length === 0) {
    erreurs.push('Le champ "questions" doit être un tableau non vide.');
  }

  const questions = [];
  (questionsBrutes || []).forEach((q, qIdx) => {
    const numero = qIdx + 1;
    if (!q || typeof q !== 'object') { erreurs.push(`Question ${numero} : doit être un objet.`); return; }
    if (!estChaineNonVide(q.enonce)) erreurs.push(`Question ${numero} : le champ "enonce" est obligatoire.`);

    const itemsBruts = Array.isArray(q.items) ? q.items : null;
    if (!itemsBruts || itemsBruts.length < NB_ITEMS_MIN) {
      erreurs.push(`Question ${numero} : "items" doit être un tableau d'au moins ${NB_ITEMS_MIN} éléments.`);
      return;
    }
    if (itemsBruts.length > NB_ITEMS_MAX) {
      erreurs.push(`Question ${numero} : ${itemsBruts.length} items fournis, le maximum est ${NB_ITEMS_MAX}.`);
      return;
    }

    const items = [];
    let aUneBonneReponse = false;
    itemsBruts.forEach((it, iIdx) => {
      const lettreIdx = iIdx + 1;
      if (!it || typeof it !== 'object' || !estChaineNonVide(it.texte)) {
        erreurs.push(`Question ${numero}, item ${lettreIdx} : le champ "texte" est obligatoire.`);
        return;
      }
      if (typeof it.est_correct !== 'boolean') {
        avertissements.push(`Question ${numero}, item ${lettreIdx} : "est_correct" absent ou invalide, considéré comme faux.`);
      }
      const estCorrect = it.est_correct === true;
      if (estCorrect) aUneBonneReponse = true;
      items.push({ texte: it.texte.trim(), est_correct: estCorrect, correction: estChaineNonVide(it.correction) ? it.correction.trim() : '' });
    });

    if (!aUneBonneReponse) avertissements.push(`Question ${numero} : aucun item marqué "est_correct": true.`);
    if (items.length >= NB_ITEMS_MIN) questions.push({ enonce: q.enonce.trim(), items });
  });

  if (erreurs.length > 0) return { ok: false, erreurs };

  return {
    ok: true,
    avertissements,
    donnees: {
      titre: brut.titre.trim(),
      nomMatiere: brut.matiere.trim(),
      nomCours,
      nomsCoursAnnale,
      typeGeneral,
      questions,
    },
  };
}

export function trouverParNom(liste, nom) {
  if (!nom) return null;
  const cible = nom.trim().toLowerCase();
  return liste.find((el) => el.nom.trim().toLowerCase() === cible) || null;
}
