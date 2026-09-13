// Schéma JSON standard pour l'import rapide du contenu d'un QCM (voir CreationQcm.jsx / ImportJsonQcm.jsx).
// Les métadonnées (titre, matière, cours, type) sont saisies à l'étape 1 ; le JSON ne contient que le contenu.

export const NB_ITEMS_MIN = 2;
export const NB_ITEMS_MAX = 8; // limité par LETTRES = 'ABCDEFGH' dans CreationQcm.jsx

export const EXEMPLE_JSON_CONTENU = `{
  "questions": [
    {
      "enonce": "Texte de la question",
      "items": [
        { "lettre": "A", "texte": "Texte de la proposition", "est_correct": true, "correction": "Explication" },
        { "lettre": "B", "texte": "...", "est_correct": false, "correction": "..." }
      ]
    }
  ]
}`;

const MODELE_PROMPT = `Tu es un enseignant spécialisé dans la création de QCM médicaux pour des étudiants en
médecine, au format des colles/PASS-LAS.

PARAMÈTRES (à préciser avant de lancer) :
- Nombre de questions : {{NB_QUESTIONS}}
- Nombre d'items par question : {{NB_ITEMS}}
- Cours fournis : {{COURS}}

DEUX CAS DE FIGURE POSSIBLES :
1. Si je te fournis un QCM déjà rédigé en texte (énoncés + propositions, avec ou sans
   correction) : retranscris-le intégralement et fidèlement au format JSON demandé
   ci-dessous, sans reformuler ni modifier le contenu, les questions ni les propositions.
2. Si je te fournis un ou plusieurs cours (contenu de cours, pas un QCM) : génère un QCM
   entièrement nouveau à partir de ce contenu, en respectant toutes les règles ci-dessous.

# 1. Fidélité au cours

- Utilise exclusivement les informations présentes dans le ou les cours fournis.
- N'ajoute pas de connaissances extérieures, sauf si cela est indispensable pour corriger
  une incohérence manifeste.
- Si une information est absente, ambiguë ou contradictoire dans le cours, ne l'utilise pas
  plutôt que d'inventer.
- Respecte la terminologie, les définitions, les chiffres, les rapports anatomiques, les
  classifications et les exceptions présentés dans le cours.
- Lorsque plusieurs cours sont fournis, croise-les et signale les éventuelles
  contradictions entre eux dans ta réflexion (sans les inclure dans le JSON final).

# 2. Répartition entre les cours fournis

Si un seul cours est fourni, 100 % des questions doivent porter dessus.
Si plusieurs cours sont fournis, répartis les questions de façon égale entre eux
(ex : 4 cours fournis → environ 25 % des questions par cours). Si le nombre de questions
ne se divise pas exactement, répartis le reste aussi équitablement que possible.

# 3. Format des questions

Chaque question comporte un énoncé et exactement {{NB_ITEMS}} propositions
indépendantes les unes des autres (numérotées A, B, C, D, E...). Chaque proposition est une
affirmation autonome qui peut être vraie ou fausse indépendamment des autres — ce ne sont
pas des choix qui s'excluent mutuellement, mais bien des mini-affirmations distinctes à
évaluer chacune séparément.

# 4. Répartition des questions par thème

Répartis les questions de manière équilibrée entre les différents thèmes importants du
cours. Mélange les types de questions suivants : définitions, anatomie descriptive,
rapports anatomiques, insertions/terminaisons/trajets, innervation et vascularisation,
fonctions et actions musculaires, classifications, comparaisons, vrai/faux déguisés,
questions de synthèse, cas simples d'application ou de raisonnement, pièges classiques
fréquents aux examens. Évite de regrouper toutes les questions faciles au début et toutes
les questions difficiles à la fin.

# 5. Niveau de difficulté

- Environ 30 % de questions faciles (connaissances fondamentales)
- Environ 50 % de questions intermédiaires (distinguer plusieurs notions proches)
- Environ 20 % de questions difficiles (pièges raisonnables, nécessitant un raisonnement)

Les pièges doivent rester loyaux et reposer uniquement sur le contenu du cours. Ne crée
jamais de piège fondé sur une faute d'orthographe, une formulation artificiellement
ambiguë, un détail absent du cours, une différence minime de ponctuation, ou une
information extérieure non fournie.

# 6. Construction des propositions — règles précises

**Nombre de réponses vraies par question**, avec cette répartition sur l'ensemble du QCM :
- Le plus souvent : 2 ou 3 réponses vraies par question
- Un peu plus rarement : 4 réponses vraies
- Plus rarement encore, mais doivent apparaître au moins une ou deux fois sur l'ensemble
  du QCM : 1 seule réponse vraie, et à l'inverse toutes les réponses vraies
- Ne répète jamais le même nombre de réponses vraies sur plusieurs questions d'affilée

**Comment construire une proposition fausse (règle la plus importante)** : la meilleure
méthode est de partir d'une affirmation vraie et d'en modifier un seul élément précis et
factuel — un terme technique, un chiffre, un rapport anatomique, une latéralité, une
proportion — pour la rendre fausse, tout en gardant exactement la même structure de
phrase. Exemple : dans un QCM sur le membre inférieur, une proposition vraie sur le tibia
peut devenir fausse en remplaçant "tibia" par "fibula" (ou l'inverse), sans rien changer
d'autre à la phrase. Ce type de piège teste une vraie connaissance précise plutôt qu'une
stratégie de repérage. Utilise cette méthode en priorité plutôt que d'inventer une
affirmation fausse sans rapport avec le cours.

Autres règles :
- Varie les combinaisons de lettres parmi les réponses correctes (A, AB, AC, BDE, ABCD...)
  d'une question à l'autre.
- Les lettres doivent chacune apparaître régulièrement parmi les bonnes réponses sur
  l'ensemble du QCM — pas de lettre systématiquement vraie ou systématiquement fausse.
- Évite que la réponse correcte soit systématiquement la proposition la plus longue ou la
  plus précise.
- Une proposition fausse doit comporter une seule erreur principale autant que possible.
- Ne crée pas de doublons ni de propositions formulées de manière équivalente.
- N'utilise pas "toutes les réponses sont vraies"/"aucune réponse n'est vraie", sauf
  cas exceptionnel justifié par le cours.
- Fais attention aux mots comme "toujours", "jamais", "uniquement", "exclusivement",
  "tous", "aucun" — à n'utiliser que s'ils sont réellement justifiés par le cours.

# 7. Contrôle qualité final (à faire silencieusement, sans le montrer)

Avant de répondre, vérifie que : chaque question a une correction parfaitement
déterminée ; il n'y a pas de contradiction entre deux propositions ; le nombre de réponses
justes est bien réparti selon la règle de la section 6 ; les lettres apparaissent
régulièrement comme bonnes réponses ; toutes les réponses sont justifiables par le cours ;
la répartition entre les cours fournis (section 2) est respectée.

# 8. Format de sortie — IMPORTANT

Réponds UNIQUEMENT avec un objet JSON valide, sans aucun texte avant ou après, exactement
dans ce format :

${EXEMPLE_JSON_CONTENU}

Inclus une explication ("correction") pour CHAQUE proposition, vraie ou fausse — pas
seulement pour les fausses. Pour une proposition fausse, l'explication doit préciser
l'erreur exacte et donner si possible la formulation correcte.

Commence par analyser silencieusement le ou les cours fournis, puis génère uniquement le
JSON, sans aucun commentaire ni texte d'accompagnement.`;

// Construit le prompt à copier, avec les paramètres déjà connus (nombre de questions, d'items,
// et cours concernés) pré-remplis à partir de ce que le tuteur a choisi à l'étape 1.
export function construirePromptImport({ nbQuestions, nbItems, coursDescription }) {
  return MODELE_PROMPT
    .replaceAll('{{NB_QUESTIONS}}', String(nbQuestions))
    .replaceAll('{{NB_ITEMS}}', String(nbItems))
    .replaceAll('{{COURS}}', coursDescription || '[à préciser]');
}

function estChaineNonVide(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

// Valide et normalise le contenu JSON collé par le tuteur (uniquement questions/items,
// pas de métadonnées de QCM). Retourne { ok, erreurs } ou { ok, avertissements, questions }.
export function validerJsonContenuQcm(texteJson) {
  let brut;
  try {
    brut = JSON.parse(texteJson);
  } catch (e) {
    return { ok: false, erreurs: [`JSON invalide : ${e.message}`] };
  }

  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) {
    return { ok: false, erreurs: ['Le JSON doit être un objet (et non un tableau ou une valeur simple).'] };
  }

  const erreurs = [];
  const avertissements = [];

  const questionsBrutes = Array.isArray(brut.questions) ? brut.questions : null;
  if (!questionsBrutes || questionsBrutes.length === 0) {
    return { ok: false, erreurs: ['Le champ "questions" doit être un tableau non vide.'] };
  }

  const questions = [];
  questionsBrutes.forEach((q, qIdx) => {
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

  return { ok: true, avertissements, questions };
}
