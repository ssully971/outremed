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

## Base de données — tables principales

- `profiles` — comptes (role, categorie_compte, statut_compte, essai_fin, compte_actif,
  theme_pref, accent_pref, notif_prefs, session_courante, afficher_position_classement)
- `matieres`, `cours` — avec `couleur`, `emoji`, `est_prive`/`cree_par` (historique de
  l'espace perso, supprimé — voir plus bas ; toujours filtré à `false` partout ailleurs)
- `qcms` — `type_qcm` (entrainement/concours_blanc), `is_annale`, `is_kholle`, `numero`,
  `est_prive`, `visible`, `publie`, `verifie`, `semaine_kholle_id`, `kholle_debut/fin`
- `questions`, `items` — items ont `est_correct`/`correction`, jamais exposés bruts aux
  étudiants pendant un QCM (voir vue `items_visibles`)
- `attempts`, `attempt_answers` — tentatives et réponses détaillées
- `semaines_kholle`, `signalements_erreur`, `notifications`
- `canaux`, `canal_membres`, `canal_dernier_vu`, `messages` — forum
- `types_echeance`, `echeances` — planning
- `historique_comptes`, `historique_qcm` — audit trail, avec `archive` (bool) et purge
  automatique des entrées non archivées de plus de 3 mois via la fonction SQL
  `purger_historique_ancien()`
- `parametres` — table clé/valeur pour tous les réglages globaux (voir plus bas)
- `annonces`, `annonces_vues` — popups d'annonce ciblées (audience + durée)

### Vues

- `profils_publics` — profils sans données sensibles, lisible largement
- `items_visibles` — items sans `est_correct`/`correction` pour l'affichage pendant un QCM
- `resultats_classement` — agrège les scores pour le classement

### Fonctions SQL (RPC)

`mon_role()`, `purger_historique_ancien()`, `cloturer_kholles_expirees`,
`envoyer_rappels_echeances`, `propager_horaire_kholle`, `proteger_champs_profil`,
`verifier_tentative_unique`, `alerter_essais_expirants`

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

## Fonctions serveur (Edge Functions)

Toutes doivent avoir la gestion CORS (`corsHeaders` + réponse à `OPTIONS`) — **un oubli sur
`create-user` a causé un vrai bug en prod, toujours vérifier sur toute nouvelle fonction**.
Tout appel `fetch()` côté client vers une fonction serveur doit être enveloppé dans un
try/catch qui réinitialise l'état de chargement, sinon un bouton reste bloqué indéfiniment
sur un échec réseau silencieux (bug rencontré et corrigé à plusieurs endroits).

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
CreationQcm, EditionQcm, GestionQcm (+ signalements, dupliquer, masquer), Resultats,
CarnetErreurs, RevisionErreurs, DetailTentative, Classement, Statistiques, Comptes,
FicheEtudiant, FicheTuteur, Profil (paramètres + site + annonces), Historiques, Forum,
Planning, MesStats, DefinirMotDePasse.

## Ce qui reste à faire / pistes connues

- Nettoyer les fichiers obsolètes listés ci-dessus
- Optimisation du build (avertissement Vite sur la taille des chunks — pas urgent)
- Envisager un vrai nom de domaine si le volume d'invitations email augmente (au-delà de
  Gmail/Resend gratuit)
- Recherche dans les archives/QCM (jamais implémentée, notée comme "pour plus tard" très tôt
  dans le projet)
