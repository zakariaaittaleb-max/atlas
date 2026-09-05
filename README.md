# ATLAS — Simulateur de Stratégie d'Entreprise (Maroc)

Application web temps réel pour un atelier pédagogique où des équipes d'étudiants dirigent une
entreprise marocaine multi-DAS en concurrence directe à somme nulle.

## Documents de conception

À lire dans cet ordre — ils font foi sur le code, et le code doit s'y conformer.

| Document | Contenu |
|---|---|
| [`docs/00-specification.md`](docs/00-specification.md) | Le jeu, la boucle, les sept plans de décision, les arbitrages de cadrage |
| [`docs/01-moteur-alignement.md`](docs/01-moteur-alignement.md) | L'Indice d'Alignement : profils-cibles, diagnostics, effets économiques |
| [`docs/02-economie.md`](docs/02-economie.md) | Coûts, courbe d'expérience, pouvoir de négociation, P&L, trésorerie |
| [`docs/03-referentiel-das.md`](docs/03-referentiel-das.md) | Les 8 DAS, l'écosystème régional, le catalogue PESTEL |

## État d'avancement

**L'application est complète et fonctionnelle de bout en bout.**
29 routes · 307 tests · types, lint et build propres.

| Domaine | État |
|---|---|
| Documents de conception (4) | ✅ |
| Schéma Supabase, RLS, étanchéité testée avec de vrais jetons | ✅ 9 migrations |
| Moteur — alignement, économie, cabinet, dotation, résolution | ✅ 144 tests |
| Balanced Scorecard de clôture | ✅ 8 tests |
| Frontière serveur/client vérifiée statiquement, en transitif | ✅ 5 tests |
| Auth par codes · 7 plans de saisie · auto-sauvegarde hors ligne | ✅ |
| Révélation temps réel · cabinet · marché de cession · War Room | ✅ |
| Facilitateur : création multi-ligues, pilotage, projecteur | ✅ |
| Exports Excel : dossier T0, résultats équipe, session (7 onglets) | ✅ |

### Hors périmètre, comme convenu

- **M&A inter-entreprises** (phase 5). L'architecture est en place — table
  `ma_operations`, types d'intégration verticale / horizontale / conglomérale —
  rien n'est branché.
- Persistance multi-sessions, i18n, SSO, application mobile native.

## Base de données

Projet Supabase **`Apps`** (`mzqleykmqbotbmwbgfpb`), région `eu-west-3` (Paris).

Atlas vit dans le schéma **`atlas`**, jamais dans `public` : le projet héberge
plusieurs applications, et des noms aussi génériques que `teams`, `regions` ou
`market_segments` entreraient sinon en collision. Tous les clients Supabase sont
construits avec `db: { schema: 'atlas' }`.

Les dix-sept migrations de `supabase/migrations/` sont appliquées :
56 tables, 5 vues, 48 politiques, 13 fonctions.

### Mise en route sur un nouvel environnement

```bash
cp .env.example .env.local
```

Renseigner l'URL, la clé publiable et la clé `service_role`
(*Settings → API Keys*), appliquer les dix-sept migrations, puis **activer la
connexion anonyme** (*Authentication → Providers → Anonymous*) : Atlas ne
manipule aucun mot de passe, les étudiants entrent deux codes.

L'exposition du schéma `atlas` à PostgREST est faite par la migration 0005,
pour ne pas dépendre d'un clic à ne pas oublier.

### Étanchéité vérifiée contre la base réelle

Le critère d'acceptation n°2 a été testé avec de vrais jetons `authenticated`,
pas déduit d'une relecture des politiques :

| Contrôle | Résultat |
|---|---|
| Décisions, budgets, RH d'une équipe concurrente | 0 ligne |
| Toute requête sans être connecté | 401 |
| `ecosystem_actor_rounds` (la donnée vendue par le cabinet) | accès refusé |
| `strategic_units.bcg_stage` | colonne refusée |
| `game_sessions.join_code` | colonne refusée |
| `engine_parameters`, `sector_proximity` | accès refusé |
| `shock_cards.effects` (nom visible, effets non) | colonne refusée |
| Réécrire le prix d'une concurrente | aucune ligne atteinte |
| Insérer une décision au nom d'une concurrente | refusé |
| Se rattacher soi-même à l'équipe adverse | refusé |
| Appeler `atlas_lock_round` depuis une équipe | refusé *(après correctif 0004)* |

**Un défaut réel trouvé par ce test** : `revoke execute ... from anon,
authenticated` ne retirait rien, parce que PostgreSQL accorde `EXECUTE` à
`PUBLIC` par défaut sur toute fonction. Une équipe pouvait verrouiller le tour
de toute la salle. Corrigé en migration 0004.

## Le Balanced Scorecard de clôture

Calculé **une seule fois**, à la clôture : le tableau de bord prospectif ne pilote pas les
tours, il les relit. Les quatre axes pèsent à égalité — pondérer le financier reviendrait à
retomber dans ce qu'il sert précisément à corriger.

Les scores sont **relatifs au pool**, assumé : le jeu est à somme nulle, « bien gérer » n'a de
sens que par comparaison avec ceux qui se disputaient le même marché. La normalisation part de
20 et non de 0 — le dernier d'une ligue serrée n'a pas démérité, et un zéro affiché au
débriefing ferait taire une équipe qu'on veut faire parler.

### Ce qu'il a produit sur la session de validation

| Équipe | Financier | Client | Processus | Apprentissage | **Global** |
|---|---|---|---|---|---|
| Tazi Industries | 54,7 | **90,7** | **99,4** | 73,3 | **79,5** |
| Ziyad Holding | 28,1 | 53,7 | 73,3 | 54,4 | 52,4 |
| Bennani Group | **86,7** | **20,0** | 40,5 | 46,7 | 48,5 |

**Bennani — l'équipe au milieu de gué — a le meilleur score financier et finit dernière.**
Prix élevé, coûts comprimés, aucun investissement : 16 Md DH de trésorerie au tour 1. Mais
aucun client (20,0), aucun alignement (IA 23,9), rien de construit.

C'est exactement ce à quoi sert un tableau de bord prospectif : **l'axe financier seul l'aurait
sacrée, les quatre axes ensemble disent la vérité.** Le débriefing s'écrit tout seul.

## Conduite de l'atelier

Le formateur dispose de trois écrans :

| Écran | Rôle |
|---|---|
| `/facilitateur` | ses sessions, et la création d'une nouvelle (pools, DAS ouverts, tours prévus) |
| `/facilitateur/[id]` | avancement équipe par équipe, conduite du tour, déclenchement des crises, export |
| `/projecteur/[id]` | classement en très grands caractères, rafraîchi tout seul à la résolution |

### Le portefeuille de départ, et la réserve

Le formulaire de création sépare deux choses qu'il confondait auparavant :

- **les domaines ouverts** — provisionnés avec leurs segments, leur écosystème
  et leurs cibles de rachat. Ouvrir un domaine le fait *exister* ;
- **le portefeuille de départ** — ce que toutes les équipes exploitent au tour 1,
  à l'identique. Il peut compter plusieurs domaines ; chacun apporte sa dotation.

Un domaine ouvert mais non attribué est précisément ce qui reste **à acquérir**.
Jusqu'à la migration 0016, seul le PREMIER secteur sélectionné était attribué :
un facilitateur qui en ouvrait quatre voyait ses équipes n'en piloter qu'un, sans
que rien à l'écran ne l'explique.

**Le facilitateur ouvre la réserve quand il le décide** (`ecosystem_actors.
market_open`). C'est un levier pédagogique, pas un réglage : tant qu'un domaine
reste fermé, les équipes règlent le métier qu'elles ont ; ouvert trop tôt, il
devient une échappatoire pour celle qui n'arrive pas à redresser le sien. Le
filtre vit dans la vue `acquisition_targets_public` et non dans la requête de
l'écran — une cible fermée doit être hors de portée, pas seulement masquée — et
le Route Handler d'acquisition le revérifie, puisqu'il écrit avec `service_role`
et contourne donc la RLS.

Un DAS **acquis en cours de partie se pilote exactement comme les autres** :
il apparaît dans le sélecteur et reçoit tous les volets de saisie.

**Les gestes irréversibles sont confirmés.** Verrouiller un tour ou lancer une résolution
engage toute la salle : le bouton s'arme, affiche ce qui va se passer — *« verrouiller fige
les 3 équipes au même instant, 2 n'ont pas fini leur saisie »* — puis se confirme.

**Les échecs de résolution s'affichent en clair**, avec le détail des invariants violés. Le
formateur doit voir qu'un tour a échoué et que rien n'a été écrit, pas découvrir un classement
faux projeté au mur.

**Offrir une étude** est un levier pédagogique : une équipe qui décroche faute d'information
ne débat plus. Le geste est gratuit pour elle — son compte de résultat n'est pas grevé.

### Les 30 cartes PESTEL

Le catalogue couvre les six dimensions, chacune ancrée dans une institution réelle
(Bank Al-Maghrib, ONSSA, MASEN, Conseil de la Concurrence, agences de bassin hydraulique…),
que le formateur peut citer au débriefing.

Les équipes voient le **nom, la description et la source** de chaque carte — jamais son
amplitude. Qu'un industriel de l'agro sache qu'une sécheresse peut survenir est réaliste et
sain : il doit pouvoir s'y préparer. En connaître d'avance l'effet exact sur sa capacité ne
l'est pas.

Quatre postures de réponse, dont **« ignorer », présentée comme un choix légitime** : c'est un
arbitrage budgétaire, pas un oubli. Une équipe étranglée a de bonnes raisons de laisser passer
un choc pour préserver sa trésorerie.

## Saisie des décisions

Les sept plans du cahier tiennent sur trois pages — deux niveaux de navigation maximum :

| Page | Plans |
|---|---|
| `/strategie` | **Groupe** : portefeuille, structure, centralisation, valeurs, vision · **domaine piloté** : stratégie générique, prix, segments, investissements |
| `/organisation` | **domaine piloté** : structure, axes, KPI, budgets, postes clés · RH — effectif visé, profils, formation, restructuration |
| `/marches` | **domaine piloté** : achats (fournisseurs, volumes engagés) · distribution (canaux, parts de volume) |
| `/finance` | **Groupe** : OPEX, dette, régime fiscal · consolidation RH, en lecture seule |

### Un domaine à la fois

Le geste central de la saisie est **« je choisis un domaine, je le renseigne sur
tous les volets, je passe au suivant »**. Le sélecteur vit dans la barre de
navigation et non dans les pages : le domaine choisi sur la stratégie est encore
celui des achats. Il est porté par un cookie plutôt que par `localStorage`, pour
que le serveur le connaisse AU MOMENT DU RENDU — sinon chaque navigation
afficherait d'abord le premier domaine puis basculerait après hydratation.

Les décisions **se reconduisent** : un écran de tour N s'ouvre sur ce que
l'équipe avait arrêté au tour N−1, comme dans une entreprise réelle où ne rien
changer, c'est conserver l'an dernier. D'où deux boutons par bloc :

- **Valider** écrit les valeurs AFFICHÉES, même si personne n'y a touché — le
  geste de l'équipe qui reconduit sciemment ;
- **Réinitialiser** ramène le bloc à son état d'ouverture de tour. Après vingt
  minutes d'hypothèses empilées, plus personne ne se souvient de ce qui a été
  changé ; « annuler » doit avoir une définition. Le geste est confirmé.

### Le recrutement part de l'effectif en place

On ne décide pas « de recruter quarante personnes » : on décide de passer de
1 240 à 1 280. Le compteur porte donc l'effectif du dernier exercice clos, et
l'équipe l'augmente ou le baisse ; l'écart se répartit ensuite entre profils, ou
se traduit en départs.

La RH était auparavant saisie **en double** — `/finance` écrivait `hr_metrics`
pendant que `/organisation` écrivait `das_hr_decisions`. Une équipe pouvait
recruter deux fois sans le savoir, et le total dépendait du dernier écran
ouvert. `das_hr_decisions` est désormais la seule source ; `hr_metrics` en est
une projection recalculée à chaque écriture (`lib/server/hr-rollup.ts`), parce
que le moteur la lit encore pour la masse salariale et le talent_mix.

**Aucun bouton « enregistrer ».** Chaque champ déclenche une auto-sauvegarde temporisée. Le
bouton du bas ne sauvegarde rien — il déclare le tour prêt, et l'étiquette le dit
explicitement, sinon les étudiants cliquent par réflexe en croyant que c'est lui qui écrit.

### Résilience réseau, vérifiée

Une coupure a été simulée au navigateur, en pleine saisie :

```
pendant la coupure  → « Hors ligne — vos saisies sont conservées et repartiront seules (1 en attente) »
                       file locale : { corporate: { corporateStrategy: 'diversification_conglomerale' } }
au rétablissement   → « Enregistré », file vide, ligne écrite en base
```

Les écritures sont persistées **avant** l'envoi réseau, rejouées au montage (donc après le
redémarrage d'un poste), sur l'événement `online`, et par `sendBeacon` quand l'onglet part.
La clé de file est le plan concerné : une saisie plus récente **écrase** la précédente au lieu
de s'empiler — rejouer dix états intermédiaires d'un curseur de prix n'a aucun intérêt.

Un message d'erreur brut du navigateur (« Failed to fetch ») n'apprend rien à un étudiant et
l'inquiète : seuls les messages venus du serveur sont affichés tels quels.

## Marché de cession et cabinet — vérifiés contre la base

### Les offres sont réellement scellées

| Requête | Acheteur (Tazi) | Vendeur (Ziyad) |
|---|---|---|
| `das_listings` — offre du NPC | `[]` | 48,5 Md DH |
| `das_listings_public` | 10 champs curatés | — |
| `das_bids` — montants | la sienne seule | **0** |
| `das_listing_interest` | — | **2 offres reçues** |

Le vendeur sait qu'on s'intéresse à son DAS, **jamais à quel prix**. Il arbitre en aveugle
entre la liquidité certaine du NPC et le pari du marché. C'est là qu'est la décision.

**Défaut corrigé au passage** : `pool_reads_open_listings` accordait un `SELECT` sur la ligne
entière de `das_listings`, `npc_offer_mad` compris. Un concurrent l'aurait lue et aurait
surenchéri d'un dirham. Même famille de défaut que la table de résultats — une politique RLS
ouvre une **ligne**, jamais une colonne (migration 0007).

### Le prix achète la précision, pas l'accès

Vérifié sur **Tensift Comptoir**, fournisseur en `declin_silencieux` — vérité : santé 42,
indice prix 0,816.

| Palier | Prix | Santé financière | Fiabilité | Indice prix estimé |
|---|---|---|---|---|
| Note express | 42 000 DH | **non couvert** | bande « moyen » | 0,686 (−16 %) |
| Étude standard | 120 000 DH | **non couvert** | bande « faible » | 0,764 (−6 %) |
| Étude approfondie | 264 000 DH | **43,4** | 34,1 | 0,800 (−2 %) |

Les estimations convergent vers la vérité en gardant la **même direction d'erreur** : l'étude
chère est un *zoom* sur l'étude bon marché, jamais une contradiction qui ferait douter du
moteur. Et l'équipe qui prend l'express ne peut pas voir la faillite arriver — c'est tout
l'arbitrage.

L'audit d'alignement est le seul livrable **sans bruit** : le cabinet analyse les données que
l'équipe lui a transmises. Le palier n'y change que la profondeur (3 / 10 / 17 axes).

## Un tour joué de bout en bout

Une session complète a été provisionnée, jouée et résolue contre la base réelle :
3 équipes, 3 DAS, 39 acteurs d'écosystème, décisions saisies **par les équipes
elles-mêmes sous RLS**, résolution en 2,9 s. Parts de marché : `1.00000000`.

Trois profils volontairement contrastés, trois diagnostics justes :

| Équipe | Déclaré | Joué | IA | Diagnostic |
|---|---|---|---|---|
| Ziyad Holding | domination par les coûts | prix 25, coût 37,2, PdM 38,6 % | 67,6 | cohérent |
| Tazi Industries | différenciation | prix 78, R&D 8 %, notoriété 74, zéro rupture | 66,7 | cohérent |
| Bennani Group | différenciation | prix 72 **mais** coût 37,2, R&D 1,4 % | **23,9** | **milieu de gué** |

Bennani affiche pourtant le meilleur résultat du tour : prix élevé, coûts
comprimés, aucun investissement. C'est voulu — **le milieu de gué est
confortable un tour et intenable ensuite** : sans R&D sa qualité s'érode, sans
marketing sa notoriété décroît, et sa prime de marge est déjà au plancher
(−8 %). Le débriefing du tour 3 se raconte tout seul.

### Trois défauts de calibrage que seul un tour joué pouvait montrer

1. **Notoriété saturée à 100 pour tout le monde.** Les références de R&D et de
   marketing étaient des MONTANTS absolus (8 M, 10 M DH), calibrés pour une PME.
   Sur un DAS de 190 Md, tout budget réaliste les dépassait d'un facteur dix.
   L'effort se mesure désormais en **intensité** (part du chiffre d'affaires),
   ce qui rend le moteur invariant d'échelle.
2. **Ruptures d'approvisionnement caricaturales.** Un fournisseur à 45 % de
   fiabilité amputait jusqu'à 83 % de la capacité en un tour. Le signal était
   juste, son amplitude absurde : ramenée par `procurement.disruption_scale`.
3. **L'effet de la R&D est nul au tour 1** — par construction, il est différé
   d'un tour. C'est un choix assumé, mais il doit être dit aux équipes :
   *« votre R&D de ce tour produira au tour suivant »*.

## Développement

```bash
npm run dev
```

```bash
npm test
```

## Architecture du moteur

Tout le calcul vit dans `src/lib/engine/`, en **fonctions pures** : aucun accès base, aucun
effet de bord, tout entre par les arguments. C'est ce qui rend chaque formule testable
isolément et rejouable devant les étudiants.

| Module | Rôle |
|---|---|
| `types.ts` | Formes de données du domaine — seul module importable côté client |
| `params.ts` | Valeurs de calibrage par défaut ; la vérité vit en base (`engine_parameters`) |
| `math.ts` | Utilitaires, dont le générateur pseudo-aléatoire **déterministe** |
| `alignment.ts` | Indice d'Alignement : SAB, SAC, SAT, diagnostics, synergies |
| `operations.ts` | Capacité, courbe d'expérience, automatisation, qualité, notoriété |
| `channels.ts` | Pouvoir de négociation amont et aval, couverture de distribution |
| `market.ts` | Prix, compétitivité, répartition à somme nulle, volumes |
| `finance.ts` | Compte de résultat, fiscalité marocaine, trésorerie, valorisation |
| `consulting.ts` | Études à trois paliers : le prix achète la précision, pas l'accès |
| `endowment.ts` | Dotation T0, dérivée du marché et de la taille du pool |
| `snapshot.ts` | Formes d'entrée de la résolution |
| `resolve.ts` | Orchestration des 14 étapes d'un tour + vérification des invariants |

### Deux règles non négociables

1. **Aucun module du moteur n'est importable depuis un composant `"use client"`.**
   Le calcul s'exécute exclusivement dans un Route Handler avec `SUPABASE_SERVICE_ROLE_KEY`.
   Une équipe ne doit jamais pouvoir déduire le score d'une autre avant la révélation.
   Vérifié **statiquement et en transitif** par `src/lib/boundaries.test.ts` : un composant
   client qui importerait un helper qui importe le moteur est détecté.
2. **Le moteur n'appelle jamais `Math.random`.** Tout aléa passe par `makeRng(seed)` avec une
   graine dérivée de `(session, tour, contexte)`. Une résolution litigieuse doit pouvoir être
   rejouée à l'identique.

### Couche serveur

| Module | Rôle |
|---|---|
| `lib/supabase/server.ts` | Deux clients : anonyme (soumis à la RLS) et `service_role` (la contourne) |
| `lib/dal.ts` | Vérification d'identité et de périmètre — point de passage unique |
| `lib/server/load-snapshot.ts` | Traduction base → domaine ; seul module qui lit largement |
| `app/api/rounds/resolve/route.ts` | Verrouille, calcule, vérifie les invariants, persiste |
| `proxy.ts` | Rafraîchissement de session uniquement — aucune décision d'autorisation |
| `supabase/migrations/0002` | `atlas_lock_round`, `atlas_persist_resolution` : l'atomicité |

**Pourquoi une fonction Postgres pour la persistance** : le client Supabase n'expose pas de
transaction multi-instructions. Écrire les huit tables de résultats par appels successifs
laisserait, en cas d'interruption, un classement à moitié publié — et l'événement Realtime de
révélation partirait sur un état incohérent, sous les yeux de la salle. La bascule vers
`round_resolved` intervient en dernier, dans la même transaction.

**Si un invariant est violé**, rien n'est écrit : la session repasse en `round_locked`, l'échec
est journalisé dans `resolution_runs`, et le facilitateur peut corriger puis relancer. Mieux
vaut un tour à rejouer qu'un classement faux projeté au mur.

## Variables d'environnement

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # serveur uniquement, jamais NEXT_PUBLIC_
NEXT_PUBLIC_SITE_URL=
```

## Points de vigilance

- **Calibrage fiscal et social** — les taux d'IS, de charges patronales, le SMIG et le taux
  directeur vivent dans `engine_parameters` et doivent être **revérifiés avant chaque session**.
  Ils changent par loi de finances ou par décret.
- **Tailles de marché** — les valeurs du référentiel sont des ordres de grandeur destinés à
  rendre le jeu vraisemblable, à revalider contre HCP / Office des Changes / Bank Al-Maghrib.
- **Acteurs de l'écosystème** — fournisseurs, distributeurs et cibles sont **fictifs**. Aucune
  donnée n'est attribuée à une entreprise réelle.
- **Dépendances** — `exceljs` tire un `uuid` porteur d'un avis modéré (bornes de tampon sur
  les versions v3/v5/v6 avec tampon explicite). ExcelJS n'emprunte pas ce chemin de code et
  la génération se fait côté serveur sur nos propres données. À revoir si ExcelJS publie un
  correctif.
