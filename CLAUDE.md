# Outremed — Contexte du projet

Plateforme de QCM pour le tutorat en médecine (filières MMOPK), pensée pour les étudiants
d'outre-mer sans accès à une prépa privée. Développée avec Claude (chat) sur plusieurs
sessions ; ce fichier résume tout ce qu'un nouvel assistant doit savoir pour reprendre le
projet sans repartir de zéro.

## Stack technique

- **Frontend** : React + Vite, déployé sur **Vercel**
- **Backend** : Supabase (PostgreSQL + Auth + Edge Functions + RLS)
- **URL Supabase** : `https://vxcdkgeuuwhqkbprlxju.supabase.co`
- **Site en ligne** : `https://outremed.vercel.app` (pas de nom de domaine pour l'instant)
- **Repo GitHub** : `github.com/ssully971/outremed` (compte personnel du propriétaire)
- **Emails transactionnels** : Supabase Auth avec SMTP personnalisé (Gmail ou Resend selon
  ce qui a été configuré en dernier — vérifier Authentication > SMTP Settings)

## Convention générale — IMPORTANT

**Tout le code (variables, fonctions, commentaires) est écrit en français.** Seuls les noms
de fichiers/composants React suivent la casse PascalCase standard (`GestionQcm.jsx`), le
reste (fonctions, variables, colonnes de base de données, policies SQL) est en français :
`supprimerCompte`, `mesAttempts`, `cree_par`, `est_prive`, etc. Garder cette convention pour
toute nouvelle fonctionnalité.

Le design system (classes CSS, composants) a été construit itérativement dans
`src/styles/theme.css` — un seul fichier CSS global, pas de CSS modules ni de
styled-components. Avant de créer une nouvelle classe, toujours vérifier si une classe
existante peut être réutilisée (`.card`, `.btn`, `.field`, `.modal-overlay`/`.modal-box`,
`.status-tag`, `.filter-chip`, `.icon-action`, etc.).

## Rôles et catégories de comptes

Trois rôles réels dans `profiles.role` : `etudiant`, `tuteur`, `proprietaire`. Le
propriétaire a tous les droits d'un tuteur, plus la gestion des comptes tuteurs et des
réglages globaux du site.

**Décision d'architecture importante** : quand un besoin de "sous-catégorie" de compte est
apparu (les "étudiants annale"), on a délibérément **évité de créer un nouveau rôle** pour
ne pas avoir à retoucher toutes les policies RLS. À la place : une colonne
`profiles.categorie_compte` (`null` = normal, `'annale'` = étudiant annale) qui ne change
que l'affichage/les redirections côté client, pas la sécurité de fond. **Reproduire ce
pattern** pour toute future segmentation de comptes plutôt que de créer un rôle.

## Système de filières (modalités / sous-filières)

Ajouté le 2026-09-18 pour gérer plusieurs filières médicales (MMOPK) avec des maquettes de
matières différentes. Hiérarchie : `modalites` (ex: Pass/Las, avec `sans_facultatif` qui
force toutes ses matières en obligatoire pour toutes ses sous-filières) → `sous_filieres`
(ex: Médecine/Pharmacie/Kiné) → `sous_filiere_matieres` (statut `obligatoire`/`facultative`
par matière ; l'absence de ligne = "ne concerne pas"). Un étudiant choisit sa filière une
seule fois via `/choisir-filiere` (mur obligatoire posé dans `Navbar.jsx`, juste après le
fetch du profil : `role === 'etudiant' && !modalite_id` → redirection), **choix irréversible
pour lui** ensuite — seul un tuteur peut le modifier, depuis `FicheEtudiant.jsx`. Les deux
utilisent le composant partagé `src/components/SelecteurFiliere.jsx`.

Toute écriture passe par la fonction RPC `appliquer_filiere_etudiant(p_profile_id,
p_modalite_id, p_sous_filiere_ids[], p_matieres_facultatives_ids[])` (SECURITY DEFINER) :
calcule le statut par matière avec la règle "le plus strict gagne" (obligatoire prime dès
qu'une sous-filière choisie la classe obligatoire), puis **fusionne** le résultat dans
`profil_matieres` par upsert sur `(profile_id, matiere_id)` plutôt que de tout recréer — les
lignes dont la matière reste dans le nouveau calcul gardent leur `compte_classement`
existant (réglage manuel d'un tuteur, voir plus bas), seules les lignes obsolètes sont
supprimées et les nouvelles insérées avec `compte_classement = true`. Autorisation : tuteur/
proprietaire, ou l'étudiant lui-même uniquement si son `profiles.modalite_id` est encore
`null`.

Deux mécanismes d'exclusion de classement à ne pas confondre : `profil_matieres.
compte_classement` (permanent, par matière, réglable par un tuteur sur `FicheEtudiant.jsx`
même pour une matière obligatoire — la matière reste visible à l'étudiant, juste exclue des
classements) et `exclusions_classement` (ponctuel, par `qcm_id` ou `semaine_kholle_id`, géré
depuis le panneau admin de `Classement.jsx` pour réinitialiser un classement ou exclure un
étudiant précis).

`ListeQcm.jsx` restreint les QCM visibles aux matières du `profil_matieres` de l'étudiant
(filtrage **côté client uniquement**, même compromis assumé que le mode annale — décision
explicitement confirmée avec le propriétaire plutôt que d'ajouter une policy RLS). Dans
`Classement.jsx`, les classements sont recalculés par sous-filière active : les matières
facultatives ont leur propre classement (par matière/par kholle) mais n'alimentent jamais le
classement général du semestre, qui ne compte que les matières obligatoires de la
sous-filière affichée.

**`profil_sous_filieres`, `profil_matieres` et `exclusions_classement` sont lisibles par
n'importe quel compte authentifié (`lecture_auth`), pas seulement le propriétaire de la
ligne ou un tuteur/proprietaire** — corrigé le 2026-09-22 après un bug où un étudiant
consultant le classement (y compris ses propres archives) ne voyait que son propre nom avec
un score à 0 : `Classement.jsx` a besoin de la liste complète des membres d'une sous-filière
(et de leurs exclusions/`compte_classement`) pour construire le classement de **n'importe
qui**, pas seulement de l'utilisateur connecté — une policy `profile_id = auth.uid() OR
tuteur/proprietaire` ne renvoie donc que sa propre ligne à un étudiant, vidant le reste du
classement. L'écriture (INSERT/UPDATE/DELETE) reste réservée à `mon_role() in
('tuteur','proprietaire')`.

## Base de données — tables principales

- `profiles` — comptes (role, categorie_compte, statut_compte, essai_fin, compte_actif,
  theme_pref, accent_pref, notif_prefs, session_courante, afficher_position_classement)
- `matieres`, `cours` — avec `couleur`, `emoji`, `est_prive`/`cree_par` (historique de
  l'espace perso, supprimé — voir plus bas ; toujours filtré à `false` partout ailleurs)
- `qcms` — `type_qcm` (entrainement/concours_blanc), `is_annale`, `is_kholle`, `numero`,
  `est_prive`, `visible`, `publie`, `verifie`, `semaine_kholle_id`, `kholle_debut/fin`
- `questions`, `items` — items ont `est_correct`/`correction`, jamais exposés bruts aux
  étudiants pendant un QCM (voir vue `items_visibles`) ; `items` n'est lisible en direct
  (RLS) que par tuteur/proprietaire — un étudiant qui a besoin du détail de ses propres
  réponses (carnet d'erreurs, révision) passe par la fonction serveur `attempt-detail` ou
  `revision-erreurs`, jamais par une requête directe sur `items`. `questions.lien` (colonne
  historique, jamais documentée avant le 2026-09-14) sert désormais d'URL vers l'image
  optionnelle de l'énoncé (stockage Supabase Storage, bucket public `question-images`,
  policies RLS sur `storage.objects` réservant INSERT/SELECT/DELETE à tuteur/proprietaire —
  **le SELECT est indispensable même si le bucket est public**, sinon `.remove()` ne trouve
  rien à supprimer et échoue silencieusement sans erreur). Upload géré par
  `src/lib/uploadImage.js` (compression canvas côté client, 500 Ko max, redimensionnement
  itératif) + `src/components/ImageEnonceUpload.jsx`, utilisés à la fois dans
  `CreationQcm.jsx` (étape 2, avant publication — `uploaderImage(identifiant, ...)` prend un
  identifiant purement local `question.cleLocale` tant que la question n'a pas de vrai id en
  base, le lien est inséré avec la question à la publication) et `EditionQcm.jsx` (après
  coup, `question.id` réel). `uploaderImage`/`supprimerImageStockage` ne touchent plus du
  tout la table `questions` — c'est à l'appelant de répercuter `lien` dans son propre état
  (et de l'enregistrer, immédiatement ou via son bouton "Enregistrer"/"Publier").
- `attempts`, `attempt_answers` — tentatives et réponses détaillées
- `semaines_kholle`, `signalements_erreur`, `notifications`. **`semaines_kholle.date_samedi`
  n'a plus de contrainte unique depuis le 2026-09-18** — plusieurs créneaux de kholle
  peuvent exister sur la même date calendaire (contrainte supprimée exprès : elle forçait
  `CreationQcm.jsx` à réutiliser silencieusement l'horaire d'un créneau déjà existant à la
  même date dès qu'un tuteur retapait sa propre date/heure, même sans le sélectionner dans
  la liste — un tuteur qui n'était pas le premier à créer un créneau sur une date donnée se
  retrouvait "coincé" sur l'horaire du premier). Depuis, `CreationQcm.jsx` ne réutilise un
  créneau que si le tuteur le sélectionne explicitement dans la liste des créneaux
  existants ; sinon un nouveau créneau est toujours créé avec l'horaire tapé.
- `canaux`, `canal_membres`, `canal_dernier_vu`, `messages` — forum
- `types_echeance`, `echeances` — planning
- `historique_comptes`, `historique_qcm` — audit trail, avec `archive` (bool) et purge
  automatique des entrées non archivées de plus de 3 mois via la fonction SQL
  `purger_historique_ancien()`
- `parametres` — table clé/valeur pour tous les réglages globaux (voir plus bas)
- `annonces`, `annonces_vues` — popups d'annonce ciblées (audience + durée)
- `modalites`, `sous_filieres`, `sous_filiere_matieres`, `profil_sous_filieres`,
  `profil_matieres`, `exclusions_classement` — système de filières, voir section dédiée
  plus haut. `profiles.modalite_id` référence `modalites`.

### Vues

- `profils_publics` — profils sans données sensibles, lisible largement
- `items_visibles` — items sans `est_correct`/`correction` pour l'affichage pendant un QCM
  (sauf `type_qcm = 'entrainement'`) ; visible dès `now() >= kholle_debut` pour un QCM de
  kholle, sans borne haute — voir section « Kholles » pour l'historique de ce point
- `resultats_classement` — agrège les scores pour le classement

### Fonctions SQL (RPC)

`mon_role()`, `purger_historique_ancien()`, `cloturer_kholles_expirees`,
`envoyer_rappels_echeances`, `propager_horaire_kholle`, `proteger_champs_profil`,
`verifier_tentative_unique`, `alerter_essais_expirants`, `appliquer_filiere_etudiant`
(voir section « Système de filières »)

### Paramètres globaux (table `parametres`)

Système modulaire d'activation de pages, pensé pour ne plus jamais avoir à toucher au code
pour désactiver une section : `forum_actif`, `planning_actif`, `classement_actif`,
`carnet_erreurs_actif`, `mes_stats_actif`, `mode_site` (`normal`/`annale`),
`essai_gratuit_actif`, `citation_accueil`, `whatsapp_contact`, `instagram_url`,
`mentions_legales_url`. Toujours utilisées avec le même pattern : le propriétaire garde
accès même désactivé, tout le monde d'autre est bloqué à la fois dans la navbar (lien
masqué) ET au niveau de la page elle-même (redirection si accès direct par URL).

## Fonctionnement des comptes privés / mode annale

- **Espace perso** (easter egg propriétaire, double-clic sur le logo, page EspacePerso.jsx) :
  **supprimé le 2026-09-13**, un autre outil est utilisé à la place pour cet usage personnel.
  La colonne `est_prive` sur `matieres`/`cours`/`qcms` reste en base (elle sert aussi à
  filtrer le contenu public partout ailleurs — ne pas la supprimer sans vérifier tous ses
  usages) mais plus aucune UI ne permet de créer du nouveau contenu privé ; d'éventuelles
  lignes `est_prive = true` restantes sont des données historiques, inaccessibles depuis le
  site.
- **Mode annale** (`parametres.mode_site = 'annale'`) : restreint temporairement le site
  aux QCM d'annales. Un compte `categorie_compte = 'annale'` ne voit que la page QCM
  (filtrée sur les annales), peu importe le mode global du site — la restriction est liée
  au compte, pas au mode. Un tuteur en mode annale garde l'accès complet à la création/
  gestion de QCM (tous types, pour agrandir la banque commune) mais perd Forum/Planning/
  Classement et ne gère que les comptes étudiant-annale dans Comptes. Le propriétaire
  garde toujours tout, avec un badge "🎓 Mode Annale actif" dans la navbar.
- **Limite assumée** : la restriction "étudiant annale ne voit que les QCM" est côté
  affichage, pas au niveau RLS — un étudiant technique pourrait deviner l'URL d'un QCM
  non-annale. Accepté comme compromis pour ne pas complexifier la sécurité (petit groupe
  de confiance).

## Kholles — passation, correction, notation

- Une kholle est toujours en mode concours (`QcmDetail.jsx` : `qcm.is_kholle` force
  `choixDemande = false` et `modeChoisi = 'concours'` dès le chargement, jamais l'écran de
  choix entraînement/concours). À la place, une popup d'information (nombre de questions,
  durée, avertissement "tu ne pourras plus le refaire") s'affiche avant que le chrono ne
  démarre — `commencerKholle()` ne pose `dateDebut` qu'au clic sur "Commencer", pour ne pas
  décompter le temps pendant que la popup est affichée.
- **La correction d'un concours (kholle comprise) est toujours reconstruite via la fonction
  serveur `attempt-detail`** (`construireCorrectionDepuisServeur` dans `QcmDetail.jsx`),
  jamais depuis les `items_visibles` chargés localement avant la passation. `grade-qcm`
  renvoie donc `attempt_id` dans sa réponse pour permettre cet appel enchaîné. Raison : les
  policies RLS sur `qcms`/`items_visibles` limitaient historiquement la visibilité d'une
  kholle à sa fenêtre `[kholle_debut, kholle_fin]` — une fois la kholle terminée (le cas
  normal juste après l'avoir passée), l'étudiant perdait l'accès aux questions et voyait
  tout marqué faux. **La policy `qcms` et la vue `items_visibles` ont depuis été corrigées
  (2026-09-21) pour rester visibles indéfiniment dès `now() >= kholle_debut`** (plus de borne
  haute `<= kholle_fin`) — sans risque de fuite de réponses, `items_visibles` masque déjà
  `est_correct`/`correction` (`NULL`) pour tout QCM qui n'est pas de type `entrainement`,
  quelle que soit la fenêtre. Cette même borne haute cassait aussi le classement d'une kholle
  archivée pour un étudiant (`Classement.jsx` interroge `qcms` directement, pas seulement la
  vue) : tous les scores retombaient à 0 et les autres participants disparaissaient — corrigé
  par le même changement de policy.
- **La fonction planifiée `cloturer_kholles_expirees()` convertit chaque QCM d'une kholle
  terminée en `type_qcm = 'entrainement', is_kholle = false`** (pour le rendre rejouable en
  révision) dès que `semaine_kholle.fin < now()`, tout en conservant `semaine_kholle_id`. La
  vue `resultats_classement` filtrait sur `is_kholle = true OR type_qcm = 'concours_blanc'` —
  une fois ce passage à `entrainement` effectué, ses tentatives disparaissaient de la vue
  (donc du classement) alors qu'elles restaient dans `attempts` (donc visibles dans
  Statistiques.jsx, qui lit `attempts` directement, pas la vue). **Corrigé (2026-09-22)** en
  ajoutant `OR q.semaine_kholle_id IS NOT NULL` à la clause `WHERE` de la vue — ce champ n'est
  jamais touché par la conversion et reste le signal fiable "ce QCM a fait partie d'une
  kholle", même après. Si `resultats_classement` est un jour retouché, garder ce `OR`.
- **Notation d'une kholle à plusieurs QCM (un par matière)** : la note globale doit toujours
  être la **moyenne** des scores ramenés sur 20 (`Number(score) / nb_questions * 20`), jamais
  leur somme. Codifié dans `calculerClassements` (`Classement.jsx`), `chargerClassementApercu`
  (`Accueil.jsx`), `detailSession` (`Statistiques.jsx`) et `positionKholle`/`positionSemestre`
  (`MesStats.jsx`) — si un nouvel écran affiche un score de kholle combiné, reproduire ce
  pattern plutôt que sommer les `attempts.score` bruts.
- **Le classement général du semestre (`chargerSemestre` dans `Classement.jsx`) n'inclut que
  les kholles déjà ouvertes** (`kholle_debut <= now()`) : une kholle programmée mais pas
  encore commencée n'a par définition aucune tentative, donc `calculerClassements` la
  zero-remplissait pour tout le monde et tirait injustement la moyenne du semestre vers le
  bas dès qu'une future semaine de kholle existait (bug corrigé le 2026-09-22, ex: moyenne
  à 16,5 sur l'unique kholle faite affichée à 11 sur le semestre à cause d'une 2e kholle pas
  encore ouverte incluse dans le calcul).
- `Classement.jsx` a un panneau admin (tuteur/proprietaire) pour une portée (semaine de
  kholle ou concours) : "Exclure" (via `exclusions_classement`, masque du classement sans
  toucher aux données) et **"Supprimer le résultat"** (supprime réellement la ou les lignes
  `attempts` du/des étudiant(s) sélectionné(s) sur cette portée — irréversible, pour un
  résultat injustifié comme un 0 par absence). La policy `DELETE` sur `attempts` autorise
  désormais `auth.uid() = user_id` **ou** `mon_role() in ('tuteur','proprietaire')`.

## Espace secret tuteurs — "Annexe QCM"

Ajouté le 2026-09-22 : un espace caché, réservé à `tuteur`/`proprietaire`, pour créer et se
passer des QCM entre eux, complètement séparé de l'espace étudiant. **Déclenchement** :
double-clic sur le logo dans [Navbar.jsx](src/components/Navbar.jsx) (`ouvrirEspaceSecret()`),
actif uniquement depuis `/accueil` pour un compte tuteur/propriétaire — aucun lien visible
ailleurs dans la navigation. Reprend l'emplacement de l'ancienne easter-egg « EspacePerso »
(double-clic sur le logo, supprimée le 2026-09-13) sans rapport fonctionnel avec elle.

**Schéma dédié**, tables préfixées `annexe_` (`annexe_matieres`, `annexe_qcms`,
`annexe_questions`, `annexe_items`, `annexe_attempts`, `annexe_attempt_answers`) + vue
`annexe_items_visibles` (masque `est_correct`/`correction` hors `type_qcm='entrainement'`) —
entièrement indépendant des tables `matieres`/`qcms`/`questions`/`items`/`attempts` de
l'espace étudiant, aucune jointure entre les deux mondes. RLS : `annexe_matieres`/
`annexe_qcms`/`annexe_questions`/`annexe_items` en lecture/écriture totale pour tout
tuteur/proprietaire (pool partagé, décision actée : n'importe qui peut modifier/supprimer le
contenu de n'importe qui) ; `annexe_attempts`/`annexe_attempt_answers` personnels
(`user_id = auth.uid()`). **Point de vigilance rappelé de l'audit de sécurité du 2026-09-22** :
l'INSERT direct sur `annexe_attempts` n'est autorisé que pour `type_qcm='entrainement'` — un
`concours_blanc` doit obligatoirement passer par l'edge function `grade-qcm-annexe` (service
role), pour ne pas réintroduire la faille de fabrication de score corrigée le même jour sur
`attempts`. Toute nouvelle table de tentatives doit reproduire cette même restriction dès sa
création plutôt que de la découvrir après coup.

Contrairement à `items_visibles` côté étudiant, le masquage de `annexe_items_visibles` **n'est
pas une frontière de sécurité réelle** : tout accesseur de cet espace est déjà tuteur/
proprietaire avec accès RLS direct et permanent à `annexe_items` brute (pas de rôle
intermédiaire moins privilégié comme un étudiant). Conséquence pratique : aucune edge function
équivalente à `attempt-detail`/`revision-erreurs` n'a été nécessaire — la correction après un
concours (`AnnexeQcmDetail.jsx`, `construireCorrectionDepuisItemsReels`) et le carnet d'erreurs
(`AnnexeCarnetErreurs.jsx`) relisent directement `annexe_items` côté client une fois la
tentative enregistrée.

Pages : `AnnexeListeQcm.jsx` (`/annexe`, landing, statut jamais fait/en pause/fait — la
détection « en pause » utilise la clé localStorage `outremed_annexe_progression_${id}_${userId}`,
volontairement différente de `outremed_progression_${id}_${userId}` du site étudiant),
`AnnexeCreationQcm.jsx`/`AnnexeGestionQcm.jsx`/`AnnexeEditionQcm.jsx` (entraînement/concours
blanc uniquement, jamais de kholle, publication toujours immédiate — pas de statut « à
vérifier »), `AnnexeQcmDetail.jsx` (prise de QCM, réutilise tel quel
[ImportJsonQcm.jsx](src/components/ImportJsonQcm.jsx) et
[ImageEnonceUpload.jsx](src/components/ImageEnonceUpload.jsx)/
[uploadImage.js](src/lib/uploadImage.js), génériques par callback/props, aucune référence à
une table), `AnnexeMesStats.jsx`/`AnnexeCarnetErreurs.jsx` (personnels, pas de classement dans
cet espace). Toutes les autres pages (`QcmDetail.jsx`, `ListeQcm.jsx`, `CreationQcm.jsx`,
`EditionQcm.jsx`, `GestionQcm.jsx`, `MesStats.jsx`) sont dupliquées plutôt que réutilisées
paramétrées : chaque appel `supabase.from('...')` y est un littéral non paramétrable, sans
mécanisme existant pour injecter un nom de table alternatif — refactoriser ce couplage pour un
partage réel serait un chantier à part, risqué sur du code déjà durci (grading, RLS).

**Navigation mobile (ajouté le 2026-09-22)** : `AnnexeNav.jsx` reproduit le pattern hamburger/
`mobile-nav-panel` de [Navbar.jsx](src/components/Navbar.jsx) — la classe partagée
`.nav-links` est cachée en dessous de 900px par une règle CSS globale
(`theme.css`), donc toute barre de nav qui s'appuie sur cette classe **doit** prévoir son
propre bouton `.hamburger-btn` + panneau mobile, sinon elle disparaît purement et simplement
sur mobile sans rien pour la remplacer (bug initial corrigé ce jour). Attention à ne jamais
donner `position: sticky` à ce genre de barre secondaire : `.navbar` (utilisé par le vrai
Navbar juste au-dessus dans le DOM, puisque les pages `/annexe/*` restent dans le même
`<Layout>`) est déjà sticky en haut — dupliquer `top: 0` sur `AnnexeNav` ferait chevaucher les
deux barres au scroll.

**Sous-matières** : `annexe_matieres.parent_id` (self-FK, `on delete cascade`) permet un
niveau d'imbrication ; une matière avec `parent_id is null` est une matière de premier niveau,
une sous-matière y référence son parent. Un QCM peut être rattaché indifféremment à une
matière de premier niveau ou à une sous-matière (`annexe_qcms.matiere_id` reste une FK plate
vers `annexe_matieres`, pas de distinction de type) — `AnnexeListeQcm.jsx` regroupe l'affichage
par matière top-level puis imbrique une sous-section par sous-matière ayant des QCM.

**Mode annale** : `annexe_qcms.is_annale` (booléen, indépendant de `type_qcm`, même pattern que
`qcms.is_annale` côté étudiant) — une annale reste `type_qcm='entrainement'` en base ; le
nombre de questions et d'items reste éditable à la création (seul `concours_blanc` fige
`nb_questions` à 20 via `nbFixe` dans `AnnexeCreationQcm.jsx`).

**`annexe_historique_qcm`** : journal partagé (création/modification/suppression de QCM),
lecture/écriture ouverte à tout tuteur/proprietaire (`AnnexeHistorique.jsx`) — volontairement
sans la distinction « archivé »/propriétaire-seul de `historique_comptes`/`historique_qcm`
côté étudiant, ce journal sert à la coordination entre tuteurs, pas à l'audit de sécurité.
`qcm_id` est en `on delete set null` : l'entrée survit à la suppression du QCM qu'elle décrit
(le `details` texte capture le titre au moment de l'action). `AnnexeStats.jsx` (« stats
communes ») agrège séparément `annexe_qcms.cree_par`/`matiere_id` pour montrer qui a créé quoi
et dans quelles matières — pas de classement, juste des compteurs, pour repérer les trous de
couverture entre tuteurs.

## Demandes d'inscription

Ajouté le 2026-09-22 : le site n'a pas d'inscription libre (seuls tuteurs/propriétaire créent
les comptes étudiants), mais un candidat sans compte peut soumettre une demande depuis
`DemandeInscription.jsx` (route publique `/demande-inscription`, hors `<Layout>`, reliée depuis
la page d'accueil [Login.jsx](src/pages/Login.jsx) — bouton dans le hero et lien sous le
formulaire de connexion). La table `demandes_inscription` (`email`, `pseudo`, `nom_complet`,
`statut` `en_attente`/`validee`/`rejetee`, `traite_par`, `traite_le`) **n'a aucune policy RLS
INSERT ni de GRANT INSERT pour `authenticated`/`anon`** — la création passe exclusivement par
l'edge function `demande-inscription` (service role), seule capable de vérifier côté serveur
qu'aucun compte ni demande en attente n'existe déjà pour cet email (voir section Edge
Functions). RLS SELECT/UPDATE réservées à `tuteur`/`proprietaire`.

Côté admin, `DemandesInscription.jsx` (`/demandes-inscription`, lien dans le menu « Gérer » de
[Navbar.jsx](src/components/Navbar.jsx) — desktop et mobile) liste les demandes (onglets « En
attente » / « Historique »). **Valider** rappelle exactement le même appel à l'edge function
`create-user` que [Comptes.jsx](src/pages/Comptes.jsx) (`creerCompte`) — même formulaire
statut actif/essai gratuit, `role: 'etudiant'` forcé — puis marque la demande `validee` avec
`traite_par`/`traite_le`. **Rejeter** ne fait qu'un `update` direct du statut (pas d'edge
function nécessaire, action réservée par RLS). Aucune des deux actions ne supprime jamais la
ligne : l'historique reste consultable indéfiniment. Dans la modale de validation, le pseudo
reste **modifiable** (le candidat peut avoir mal respecté le format) et le nom complet déclaré
est affiché en lecture seule à côté — la correction éventuelle du pseudo est aussi répercutée
sur la ligne `demandes_inscription` elle-même (pas seulement sur le compte créé), pour que
l'historique reflète ce qui a réellement été utilisé.

**Convention de pseudo** (rappelée dans le champ du formulaire public et dans la modale de
validation) : prénom + initiale du nom + un point, ex. `juliend.` — c'est une convention
d'usage affichée en `field-hint`, pas une contrainte technique appliquée en base ou côté
serveur (le format n'est pas validé par regex, seul un champ non vide est exigé).

**Anti-spam/anti-bruteforce (ajouté le 2026-09-22)** sur `demande-inscription` :
- **Honeypot** : champ caché `site_web` (hors écran via CSS, `tabIndex={-1}`, jamais rempli par
  un humain) — si non vide à la soumission, la fonction renvoie un faux succès sans rien
  écrire, pour ne pas révéler au bot qu'il a été repéré.
- **Limitation par IP** : table `demande_inscription_tentatives` (`ip`, `created_at`),
  écriture/lecture réservées à `service_role`. Chaque appel — succès **ou** échec de
  validation — journalise une tentative *avant* le reste du traitement ; au-delà de 5
  tentatives par IP sur la dernière heure, la fonction répond `429` sans aller plus loin.
  Purge inline des lignes de plus de 24h à chaque appel (pas de `pg_cron`, volume trop faible
  pour le justifier). L'IP est lue via `x-forwarded-for` (repli sur `x-real-ip`) — c'est le
  header que la plateforme Supabase pose sur les edge functions, pas un en-tête à faire
  confiance si la fonction changeait un jour de plateforme d'hébergement.

## Piège Supabase Auth — `redirect_to` non listé retombe sur le domaine nu, sans erreur

Bug diagnostiqué le 2026-09-22 : des étudiants invités atterrissaient sur la page d'accueil au
lieu de `/definir-mot-de-passe`, et devaient passer par « mot de passe oublié » pour activer
leur compte. Diagnostiqué en générant un vrai lien d'invite via
`supabaseAdmin.auth.admin.generateLink({ type: 'invite', ... })` (sans envoyer d'email) puis en
suivant la redirection réelle avec `curl -i` — la seule façon de voir ce que Supabase fait
vraiment, indépendamment du code ou du dashboard :
- Avec un `redirectTo` qui correspond à `additional_redirect_urls` (`https://outremed.vercel.app/**`,
  déjà configuré côté Supabase), le lien redirige correctement vers
  `.../definir-mot-de-passe#access_token=...`.
- Avec un `redirectTo` qui **ne correspond pas** (ex. `http://localhost:5173/...`, ou toute URL
  de déploiement Vercel différente de l'alias stable), Supabase ne renvoie **aucune erreur** —
  il substitue silencieusement `redirect_to` par `site_url` **sans le chemin demandé**
  (`https://outremed.vercel.app`, la racine nue) dès la génération du lien. L'étudiant atterrit
  donc sur la page d'accueil sans qu'aucun message n'indique quoi que ce soit d'anormal.
- Cause réelle : `create-user` construisait `redirectTo` à partir de `redirect_url` envoyé par
  le client (`window.location.origin`) sans le valider — un tuteur créant un compte depuis une
  URL de déploiement Vercel autre que l'alias stable (preview, lien favori périmé, etc.)
  déclenchait le bug sans que rien ne le signale.
- **Corrigé** dans [create-user/index.ts](supabase/functions/create-user/index.ts) :
  `origineFiable()` n'accepte l'origine envoyée par le client que si elle vaut exactement
  `https://outremed.vercel.app` ou commence par `http://localhost` ; toute autre valeur retombe
  sur la constante `ORIGINE_CANONIQUE`, qui correspond toujours à ce que Supabase accepte déjà.
  **Tout nouvel appel à `inviteUserByEmail`/`generateLink` avec un `redirectTo` dérivé d'une
  origine fournie par le client doit passer par ce même genre de validation stricte** —
  ne jamais faire confiance à `window.location.origin` seul pour cet usage précis.
- Si l'allowlist Supabase (`additional_redirect_urls`) doit un jour changer, le faire via
  `npx supabase config pull` (jamais un `push` à l'aveugle : `supabase/config.toml` contient
  encore des valeurs par défaut de dev local sur beaucoup de champs sans rapport — `push`
  écraserait des réglages de prod comme `otp_length`, le MFA, ou la taille du pooler) puis
  ajuster uniquement `auth.site_url`/`auth.additional_redirect_urls` avant de `push`.

## Fonctions serveur (Edge Functions)

Toutes doivent avoir la gestion CORS (`corsHeaders` + réponse à `OPTIONS`) — **un oubli sur
`create-user` a causé un vrai bug en prod, toujours vérifier sur toute nouvelle fonction**.
Tout appel `fetch()` côté client vers une fonction serveur doit être enveloppé dans un
try/catch qui réinitialise l'état de chargement, sinon un bouton reste bloqué indéfiniment
sur un échec réseau silencieux (bug rencontré et corrigé à plusieurs endroits).

**Piège découvert le 2026-09-22, à ne plus reproduire** : une table créée via `CREATE TABLE`
brut par `npx supabase db query --linked` (plutôt que par le dashboard/l'éditeur SQL Supabase)
**n'hérite d'aucun GRANT** sur ses privilèges — ni pour `authenticated`, ni même pour
`service_role`. Sans `GRANT ... TO service_role`, une edge function qui utilise le client
`supabaseAdmin` (service role) reçoit une erreur `permission denied for table ...` **malgré**
le service role bypassant RLS — RLS et GRANT sont deux couches indépendantes. Ce bug a cassé
silencieusement `grade-qcm-annexe` dès sa création (jamais détecté faute de test en conditions
réelles avec un vrai token) et a été trouvé en construisant `demande-inscription`, dont le
premier appel a échoué de la même façon. **Toute nouvelle table doit systématiquement recevoir
`grant select, insert, update, delete on <table> to authenticated;` (RLS filtre ensuite les
lignes) et, si une edge function y touche, `grant ... to service_role;` en plus** — vérifiable
via `select grantee, privilege_type from information_schema.role_table_grants where
table_name = '...'`.

- `create-user` — crée un compte (étudiant/tuteur), envoie l'invitation par email avec
  `redirectTo` dynamique (`window.location.origin`, jamais de `localhost` en dur), transmet
  `data: { pseudo, libelle_role }` pour personnaliser le template d'email Supabase via
  `{{ .Data.pseudo }}` / `{{ .Data.libelle_role }}`
- `delete-account` — supprime un compte : détache (`SET NULL`) toutes les références
  `cree_par`/`effectue_par`/`auteur_id`/etc. avant de supprimer le profil puis le compte
  auth. **Les contraintes de clé étrangère vers `profiles(id)` et `qcms(id)` ont depuis été
  changées en `ON DELETE SET NULL` ou `ON DELETE CASCADE` directement en base** (voir plus
  bas) — le nettoyage manuel dans le code est redondant mais gardé par clarté.
- `grade-qcm` — corrige une tentative en mode concours, calcule le score, enregistre
  `attempts`/`attempt_answers`. Bloque une deuxième tentative pour les QCM `concours_blanc`
  (la condition `!qcm.est_prive` restante dans le code ne joue plus qu'un rôle historique
  depuis la suppression de l'espace perso — jamais faux en pratique aujourd'hui).
  Protection redondante côté DB : trigger `trg_tentative_unique` (BEFORE INSERT sur
  `attempts`) refuse aussi un doublon pour `concours_blanc`.
- `attempt-detail`, `revision-erreurs` — lecture de détail, pas d'action sensible
- `grade-qcm-annexe` — équivalent de `grade-qcm` pour l'espace secret tuteurs (tables
  `annexe_*`), avec en plus une vérification de rôle explicite (`tuteur`/`proprietaire`) au
  tout début — voir section « Espace secret tuteurs »
- `demande-inscription` — **la seule fonction du projet volontairement appelée sans Bearer
  token utilisateur** (le candidat n'a par définition pas encore de compte) ; le client y
  envoie quand même `Authorization`/`apikey` avec la clé anon publique pour satisfaire la
  passerelle Supabase (`verify_jwt`), qui exige un JWT valide même si la fonction elle-même ne
  vérifie aucune session. Fait tout le travail sensible côté serveur : vérifie qu'aucun compte
  `auth.users` n'existe déjà pour cet email (`auth.admin.listUsers` puis filtre côté fonction —
  pas de recherche par email native dans l'API admin), qu'aucune `demandes_inscription`
  `en_attente` n'existe pour cet email, puis insère. Voir section « Demandes d'inscription ».

## Contraintes de clé étrangère — historique important

Plusieurs contraintes ont dû être corrigées en `ON DELETE SET NULL` (pour préserver
l'historique) ou `ON DELETE CASCADE` (pour ce qui n'a plus de sens sans le parent), après
avoir découvert que la suppression d'un compte ou d'un QCM échouait silencieusement à
cause de contraintes par défaut trop strictes (`NO ACTION`). Si un nouveau champ
`cree_par`/`qcm_id`/`user_id` est ajouté à une table, **penser à définir explicitement son
comportement `ON DELETE`** dès la création plutôt que de le découvrir en production.

## Sécurité — points déjà audités et corrigés

Un audit de sécurité complet a été fait sur les policies RLS. Points de vigilance identifiés
pour toute nouvelle table :
- Une policy trop permissive héritée d'avant l'ajout de la confidentialité (QCM privés)
  peut cohabiter avec une policy plus stricte ajoutée après — **toujours vérifier qu'il
  n'existe qu'une seule policy par action (SELECT/INSERT/UPDATE/DELETE) qui reflète la
  règle actuelle**, `select * from pg_policies where tablename = 'x'` pour vérifier.
- Une policy d'`INSERT` trop restrictive (ex: réservée aux tuteurs/propriétaire) peut
  bloquer silencieusement une action légitime déclenchée par un étudiant depuis son propre
  navigateur (ex: `notifications` — un étudiant doit pouvoir créer une notification pour un
  tuteur lors d'un signalement).
- Toujours utiliser `mon_role()` dans les policies plutôt que de dupliquer la sous-requête
  `select role from profiles where id = auth.uid()`.

## Notifications

`src/lib/notifier.js` expose `envoyerNotification(userId, categorie, contenu, lien)` et
`envoyerNotificationGroupe(userIds, ...)`, qui vérifient `profiles.notif_prefs[categorie]`
avant d'insérer. Catégories existantes : `qcm_publie`, `qcm_verifie`, `nouveau_qcm_pair`,
`echeance`, `rappel_echeance`, `compte_admin`, `abonnement`, `kholle_cloture`,
`signalement_erreur`, `forum_mention`, `forum_annonce`, `forum_nouveau_canal`,
`forum_tous_messages`, `compte_modifie`.

## Fichiers obsolètes — à supprimer un jour

Restes de la toute première itération du projet, plus jamais utilisés dans les routes
(`App.jsx`) : `ArchiveQcm.jsx`, `ListeEtudiants.jsx`, `GestionComptes.jsx`,
`GestionTuteurs.jsx`, `GestionMatieres.jsx`, `Parametres.jsx`, `AdminQcmForm.jsx`,
`AjouterEtudiant.jsx`, `QuizPlayer.jsx`, `CreationCanal.jsx`, et la fonction serveur
`create-student`. Sans danger tant qu'ils restent inutilisés, mais à nettoyer si l'occasion
se présente.

## Pages principales (src/pages/)

Accueil, Login (page de présentation + connexion), ListeQcm, QcmDetail (passation),
CreationQcm, EditionQcm, GestionQcm (+ signalements, dupliquer, masquer, export JSON),
Resultats (fusion Résultats + Carnet d'erreurs depuis le 2026-09-13 — onglets "Historique"
/ "Erreurs à revoir" dans une seule page, `CarnetErreurs.jsx` supprimé), RevisionErreurs,
DetailTentative, Classement, Statistiques, Comptes, FicheEtudiant, FicheTuteur, Profil
(paramètres + site + annonces), Historiques, Forum, Planning, MesStats, DefinirMotDePasse,
GestionFilieres (`/filieres`, tuteur+proprietaire), ChoisirFiliere (`/choisir-filiere`,
onboarding étudiant obligatoire, hors `<Layout>`).

## Ce qui reste à faire / pistes connues

- Nettoyer les fichiers obsolètes listés ci-dessus
- Optimisation du build (avertissement Vite sur la taille des chunks — pas urgent)
- Envisager un vrai nom de domaine si le volume d'invitations email augmente (au-delà de
  Gmail/Resend gratuit)
- Recherche dans les archives/QCM (jamais implémentée, notée comme "pour plus tard" très tôt
  dans le projet)
