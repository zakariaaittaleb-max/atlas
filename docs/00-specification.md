# ATLAS — Simulateur de Stratégie d'Entreprise (Maroc)
## Spécification v2 — document de référence

> Cette version **remplace** `cahier_des_charges_dev_vercel_supabase.md`. Elle intègre les
> arbitrages de la session de cadrage du 31/08–01/09/2026. Les écarts par rapport à la v1
> sont signalés par le marqueur **[Δ v1]**.

---

## 0. Le jeu en une page

Des équipes d'étudiants dirigent une entreprise marocaine multi-DAS en concurrence directe.
Chaque tour, elles arbitrent sur sept plans — portefeuille, production, achats, distribution,
RH, finance, organisation — puis un moteur serveur calcule les résultats et **redistribue les
parts de marché à somme nulle** au sein de chaque pool. Un écran de révélation synchronisé
dévoile le classement. Le facilitateur ouvre alors le tour suivant.

**Les trois convictions de conception :**

1. **Aucune décision ne doit être gratuite.** Chaque saisie doit modifier au moins deux
   variables du moteur, dont une à contre-courant. Budget marketing ↑ ⇒ notoriété ↑ *et*
   trésorerie ↓ *et* seuil de rentabilité ↑. C'est la correction du principal défaut relevé
   sur les versions papier : *« les décisions étaient trop simples, pas d'arbitrage ni débat »*.
2. **On ne meurt jamais sans avoir pu se battre.** Une équipe en difficulté peut vendre un DAS,
   pivoter vers un océan bleu, se recentrer, ou se faire racheter. Le jeu ne se joue pas au tour 2.
3. **L'application donne des données, pas des analyses.** Les matrices BCG, PESTEL, Porter,
   VRIO sont construites **par les étudiants, sur Excel, hors de l'application**. Atlas vend
   la donnée brute ; l'intelligence reste au groupe.

---

## 1. Arbitrages de cadrage — ce qui change par rapport à la v1

| Sujet | v1 | **v2 (retenu)** |
|---|---|---|
| Nombre de tours | 3 fixes | **3 à 10, le facilitateur ajoute un tour à la fois** |
| Chronomètre | compte à rebours contraignant | **chronomètre indicatif ; le facilitateur clôt quand la salle est prête** |
| Rôles | 5 rôles cloisonnés | **rôles nominaux, permissions identiques ; 1 personne peut tenir 5 rôles** |
| BCG | affiché dans l'app | **jamais affiché — les étudiants le construisent sur Excel** |
| Frameworks | « pilotent une variable » | **l'app fournit la *donnée* ; l'analyse est un livrable étudiant** |
| Données de marché | seed statique | **achetées auprès d'un cabinet, livrées en Excel, évolutives par scénario** |
| Prix de l'information | — | **trois paliers : payer moins donne des chiffres moins exacts, pas moins de sujets** |
| Sortie de partie | liquidation à 3 tours négatifs | **marché de cession de DAS (NPC + enchère inter-équipes) avant liquidation** |
| M&A | dans le MVP | **hors MVP, architecture réservée** |
| Export Excel | phase 4 | **phase 1 — c'est le canal principal de la donnée** |
| Écosystème | absent | **fournisseurs / distributeurs / partenaires par région, avec pouvoir de négociation** |
| Économies d'échelle | absentes | **courbe d'expérience + capacité + absorption des coûts fixes** |

---

## 2. Boucle de jeu

```
T0  Onboarding  ─ constitution des équipes, dotation initiale, découverte des écrans,
                   achat des premières études, aucune résolution moteur
     │
     ▼
Tn  Tour actif  ─ décisions ouvertes ; chronomètre indicatif ; auto-sauvegarde permanente
     │           ─ le facilitateur peut déclencher une opportunité ou une menace PESTEL
     ▼
    Verrouillage ─ transaction unique, toutes les équipes du pool figées au même instant
     │
     ▼
    Résolution   ─ Route Handler serveur : coûts → compétitivité → parts de marché →
     │             P&L → trésorerie → alignement → cessions → alertes
     ▼
    Révélation   ─ écran synchronisé pour tout le pool (barre animée + décomposition)
     │
     ▼
    Débriefing   ─ les équipes lisent leur rapport de consulting (si acheté), débattent,
     │             téléchargent les Excel du tour
     ▼
    Le facilitateur ouvre Tn+1  ─ ou clôt la session (entre le 3ᵉ et le 10ᵉ tour)
```

**Règle de verrouillage inchangée et non négociable** : la transition `round_active →
round_locked` fige **toutes les équipes d'un pool dans la même transaction Postgres**, avant
tout calcul. Sinon la somme nulle porte sur un état incohérent.

---

## 3. Les sept plans de décision

Chaque tour, une équipe arbitre sur sept plans. Le bouton « Valider mes décisions » compte les
plans encore incomplets.

### 3.1 Portefeuille (stratégie corporate)
- Déclarer / réviser la **stratégie corporate** : spécialisation, intégration verticale,
  diversification liée, diversification conglomérale.
- Lancer un DAS (mouvement Ansoff : pénétration, développement marché, développement produit,
  diversification) — le coefficient de risque Ansoff pèse sur les deux premiers tours du DAS.
- Déclarer un **Océan Bleu** sur un DAS : sortie du calcul à somme nulle pendant 2 tours,
  multiplicateur de marge ×2,5 en cas de succès, coût d'entrée élevé, échec possible.
- **Céder un DAS** (§7).

### 3.2 Business (stratégie par DAS)
- Déclarer la **stratégie générique** du DAS : domination par les coûts, différenciation,
  focus coûts, focus différenciation.
- Positionner le **prix** (0 = agressif, 100 = premium).
- Choisir les **segments servis** (1 à 5) — un segment de plus élargit le marché adressable
  mais dilue la cohérence d'une stratégie de focus.

### 3.3 Production & technologie
- **CAPEX capacité** : augmente le volume productible. Sous-capacité ⇒ ventes perdues.
  Surcapacité ⇒ coûts fixes non absorbés.
- **CAPEX automatisation** : baisse le coût unitaire variable, augmente les coûts fixes.
- **R&D** : alimente la qualité produit, avec rendement décroissant et effet différé d'un tour.

### 3.4 Achats (amont)
- Sélectionner un ou plusieurs **fournisseurs** dans le référentiel régional.
- Négocier le volume engagé — le **pouvoir de négociation** dépend de la part que l'équipe
  représente dans le carnet du fournisseur, du nombre d'alternatives et du coût de changement.
- Arbitrage central : fournisseur bon marché / peu fiable vs fournisseur premium / cher.

### 3.5 Distribution (aval)
- Sélectionner des **distributeurs** par région (GMS, grossistes, réseau propre, e-commerce).
- Chaque canal a une couverture, une marge captée et une exigence de volume.
- Le **réseau propre** coûte du CAPEX mais supprime la marge distributeur et le rapport de force.

### 3.6 Organisation & RH
- **Structure** : fonctionnelle, divisionnelle, matricielle (coût de transition).
- **Centralisation** : achats, SI, R&D, RH — mutualisés ou laissés aux divisions.
- **Recrutement par profil** : opérateurs / techniciens / experts / cadres dirigeants.
- **Formation**, **restructuration** (indemnités + climat social).
- **Valeurs communiquées** (choix multiple) — pèsent sur l'alignement, pas sur le coût.

### 3.7 Finance
- Allocation OPEX / CAPEX / marketing / R&D sous contrainte de trésorerie.
- **Dette** : tirage, taux directeur BAM + marge fonction du levier.
- **Régime fiscal** : droit commun, CFC/ZAI, banque-assurance.
- **Achat d'études** auprès du cabinet (§6).

---

## 4. Alignement stratégique — l'indicateur central

Détaillé dans [`01-moteur-alignement.md`](01-moteur-alignement.md). Résumé :

- Chaque équipe **déclare** une stratégie corporate et une stratégie générique par DAS.
- Le moteur mesure la **distance** entre les décisions réellement prises et le profil-cible de
  la stratégie déclarée, sur 10 axes business et 8 axes corporate.
- Il en tire un **Indice d'Alignement (IA)** 0–100, qui pèse dans le score de compétitivité.
- Il détecte le **« milieu de gué »** (Porter) : une équipe qui n'est franchement ni low-cost
  ni différenciée subit un malus explicite et nommé.
- Chaque écart est **traçable et explicable** — c'est la matière du rapport de consulting.

**Point pédagogique :** l'IA ne punit pas le changement de stratégie, il punit
l'**incohérence** entre ce qu'on annonce et ce qu'on fait. Une équipe qui pivote proprement
(déclare le nouveau cap *et* réaligne ses décisions) ne perd que le coût de transition.

---

## 5. Économie du jeu

Détaillée dans [`02-economie.md`](02-economie.md). Les trois mécaniques ajoutées par rapport
à la v1, qui corrigent le diagnostic « les décisions n'avaient pas d'impact » :

1. **Courbe d'expérience** — le coût unitaire baisse avec le volume cumulé produit.
   `coût_unitaire = coût_base × (volume_cumulé / volume_référence) ^ (−λ)`.
   C'est ce qui rend la domination par les coûts jouable : il faut du volume, donc de la part
   de marché, donc de l'agressivité prix — boucle vertueuse ou cercle vicieux.
2. **Pouvoir de négociation** — amont et aval, calculé à partir de la part de volume, du nombre
   d'alternatives et du coût de changement. Il fixe le prix d'achat réel et la marge laissée au
   distributeur. C'est la 5-forces de Porter avec des dents.
3. **Capacité et absorption** — produire au-delà de la capacité coûte de la sous-traitance ;
   produire en dessous laisse des coûts fixes non absorbés. La qualité perçue intègre un délai
   de livraison dégradé en cas de rupture.

---

## 6. Le cabinet de conseil — le prix achète la *précision*, pas l'accès

**[Δ v1]** L'application ne montre presque rien gratuitement. Les équipes **commandent des
études**, les paient, et **téléchargent un fichier Excel** qu'elles exploitent hors application.

**[Δ cadrage 01/09]** Et surtout : chaque étude existe en **trois paliers**. Payer moins ne
donne pas moins de sujets — cela donne des chiffres **moins exacts**.

| Palier | Prix | Marge d'erreur annoncée | Champs qualitatifs | Signaux faibles |
|---|---|---|---|---|
| **Note express** | ×0,35 | **±25 %** | 3 bandes (faible / moyen / élevé) | ❌ absents |
| **Étude standard** | ×1,00 | **±10 %** | 5 bandes | ❌ absents |
| **Étude approfondie** | ×2,20 | **±3 %** | valeurs chiffrées | ✅ livrés |

| Étude | Prix de base | Express | Standard | Approfondie |
|---|---|---|---|---|
| Étude sectorielle PESTEL | 150 000 DH | 52 500 | 150 000 | 330 000 |
| Étude concurrentielle | 250 000 DH | 87 500 | 250 000 | 550 000 |
| Panel consommateurs | 200 000 DH | 70 000 | 200 000 | 440 000 |
| Benchmark fournisseurs | 120 000 DH | 42 000 | 120 000 | 264 000 |
| Benchmark distributeurs | 120 000 DH | 42 000 | 120 000 | 264 000 |
| Audit d'alignement | 180 000 DH | 63 000 | 180 000 | 396 000 |
| Due diligence | 300 000 DH | 105 000 | 300 000 | 660 000 |

### 6.1 Ce que chaque palier retient

**Les signaux faibles sont le cœur de l'arbitrage.** Certains champs ne sont livrés qu'au
palier approfondi — pas bruités, *absents* :

| Étude | Signal faible réservé à l'approfondie | Ce que l'équipe rate sans lui |
|---|---|---|
| Benchmark fournisseurs | **santé financière** | la trajectoire `declin_silencieux` : le fournisseur s'effondre au tour 4, l'équipe subit la rupture sans l'avoir vue venir |
| Étude sectorielle | risque de choc au tour suivant | elle subit le choc PESTEL au lieu de l'anticiper |
| Étude concurrentielle | capacité installée des concurrents | elle ne voit pas qui peut encaisser une guerre de volume |
| Panel consommateurs | croissance par segment | elle rate le segment qui décolle |
| Due diligence | **passifs non déclarés** | elle rachète un DAS avec une ardoise |

**L'audit d'alignement est le seul livrable sans bruit** : le cabinet analyse les données que
l'équipe lui a elle-même transmises, il ne peut pas se tromper dessus. Ce que le palier change
ici, c'est la **profondeur** : 3 axes décomposés en express, les 10 axes business en standard,
les 17 axes plus la comparaison anonymisée au pool en approfondie.

### 6.2 Trois garanties de conception

1. **Déterminisme.** Le bruit est dérivé de `(session, équipe, étude, tour, sujet, champ)`.
   Racheter la même étude au même palier redonne **exactement** les mêmes chiffres. Sans cela,
   une équipe achèterait cinq notes express et moyennerait l'erreur — la mécanique s'effondrerait.
   L'unicité est aussi imposée en base, pour ne pas laisser une équipe payer deux fois pour rien.
2. **Cohérence entre paliers.** Le palier n'entre pas dans la graine : l'étude chère est un
   *zoom* sur l'étude bon marché — même direction d'erreur, amplitude plus faible — jamais une
   contradiction inexplicable qui ferait douter les étudiants du moteur.
3. **Erreur bornée et annoncée.** `|valeur rapportée − valeur vraie| ≤ marge`, et la marge est
   affichée. **On ne triche pas : on vend une estimation en disant qu'elle en est une.**
   L'équipe apprend à raisonner sous incertitude, elle n'est pas piégée.

> **Note.** Deux équipes achetant le même palier obtiennent des tirages *différents*. Elles
> peuvent donc s'échanger leurs études pour réduire leur incertitude. C'est voulu : la
> coopération entre concurrents est un comportement stratégique réel, et le débriefing a de
> quoi en parler.

### 6.3 Règles générales

- Une étude commandée au tour *n* est livrée **immédiatement** (données du tour *n−1*).
- Sans audit d'alignement, l'équipe voit son IA mais **pas** sa décomposition.
  C'est le levier d'apprentissage principal.
- Toute étude produit un `.xlsx` horodaté, archivé et re-téléchargeable. Le livrable est
  **figé à la commande** : une équipe doit pouvoir relire au tour 5 ce qu'elle a acheté au
  tour 2, avec les mêmes chiffres — y compris s'ils étaient faux. C'est la matière du débriefing.
- Le facilitateur peut offrir une étude à une équipe en difficulté (levier pédagogique).

---

## 7. Marché de cession de DAS

**[Δ v1]** Une équipe peut mettre un DAS en vente. Deux canaux simultanés :

**Canal A — acheteur non joueur (NPC)**
Le moteur calcule une offre ferme, **privée, visible du seul vendeur** :
```
offre_npc = valeur_actualisée(EBITDA_das) × multiple_sectoriel
          × (1 − décote_urgence)          // décote si trésorerie en détresse
          × (1 ± aléa_marché)
```
Elle est en général **inférieure** à ce qu'une équipe concurrente rationnelle proposerait —
le NPC est un plancher de liquidité, pas une bonne affaire.

**Canal B — enchère inter-équipes**
Les autres équipes du pool voient une **fiche limitée**, jamais les décisions du vendeur :

| Visible | Masqué |
|---|---|
| Nom du DAS, segments servis | prix de vente NPC |
| Part de marché du dernier tour | décisions détaillées, budgets |
| CA du dernier tour (bande de ±10 %) | trésorerie du vendeur |
| Effectif, capacité installée | stratégie déclarée |
| Indice qualité (bande : faible/moyen/élevé) | historique complet |
| Notoriété (bande) | motif de la vente |

Les offres sont **scellées** : chaque acheteur propose un prix sans voir les offres des autres.
À la résolution, le vendeur choisit — offre NPC ou meilleure offre équipe — ou retire le DAS.

**Effets du transfert :** l'acheteur récupère la part de marché, la capacité, la notoriété et
la qualité du DAS, **décotées d'un coût d'intégration** ; il hérite aussi de l'effectif et du
climat social. Un rachat mal préparé (budget d'intégration insuffisant) détruit une partie de
la valeur acquise — c'est la même fonction continue que le M&A de la v1, réutilisée.

---

## 8. Écosystème marocain — fournisseurs, distributeurs, partenaires

**[Δ v1]** Référentiel détaillé dans [`03-referentiel-das.md`](03-referentiel-das.md).

Pour chacun des 8 DAS, l'application connaît un ensemble d'acteurs typés :
`fournisseur`, `distributeur`, `partenaire_technologique`, `sous_traitant`, `cible_acquisition`,
`concurrent_npc` — chacun localisé dans une **région du Maroc** (Casablanca-Settat,
Rabat-Salé-Kénitra, Tanger-Tétouan-Al Hoceïma, Marrakech-Safi, Fès-Meknès, Souss-Massa,
l'Oriental, Béni Mellal-Khénifra, Drâa-Tafilalet, Laâyoune-Sakia El Hamra, Dakhla-Oued Ed-Dahab,
Guelmim-Oued Noun).

Chaque acteur porte des chiffres clés qui **évoluent par tour selon un scénario** :
chiffre d'affaires, capacité, fiabilité, indice prix, délai, exigence de volume, santé
financière, appétence à la cession. Ces séries sont générées au provisioning de la session et
révélées par les études du cabinet.

**Décisions d'intégration** (hors MVP, architecture prête) :
- racheter un **fournisseur** ⇒ intégration verticale amont ;
- racheter un **distributeur** ⇒ intégration verticale aval ;
- racheter un **concurrent** du même DAS ⇒ intégration horizontale ;
- racheter un acteur d'un **autre secteur** ⇒ diversification conglomérale.

Chaque type d'intégration a un effet distinct sur les coûts, le pouvoir de négociation et
l'alignement corporate.

---

## 9. Exports Excel — canal principal de la donnée

**[Δ v1]** L'export n'est pas un livrable de fin de partie, c'est le **format natif de sortie**.

| Moment | Fichier | Destinataire |
|---|---|---|
| T0 | `atlas_T0_dossier_initial_<equipe>.xlsx` — bilan et CPC d'ouverture, catalogue des DAS, trame vierge des matrices | équipe |
| À l'achat d'une étude | `atlas_etude_<type>_T<n>_<equipe>.xlsx` | équipe |
| Fin de chaque tour | `atlas_T<n>_resultats_<equipe>.xlsx` — décisions, P&L, KPI, part de marché, IA | équipe |
| Fin de chaque tour | `atlas_T<n>_pool_<pool>.xlsx` — classement du pool | facilitateur + projecteur |
| Fin de session | `atlas_session_<nom>_complet.xlsx` — 6 onglets | facilitateur |

Onglets de l'export final : **Décisions**, **KPI par tour**, **P&L consolidé**,
**Classement**, **Alignement stratégique**, **Débriefing formateur**.

Génération serveur (SheetJS), archivage dans Supabase Storage, journal dans `exports_log`.

---

## 10. Rôles et accès

| Rôle | Portée | Peut faire |
|---|---|---|
| `facilitator` | la session entière | tout paramétrer, ouvrir/clore un tour, ajouter un tour, déclencher opportunités et menaces, offrir une étude, corriger une saisie, exporter |
| membre d'équipe | son équipe | **toutes** les décisions de l'équipe — le rôle déclaré (`dg`, `daf`, `dcm`, `dt`, `drh`) est un libellé pédagogique, pas une permission **[Δ v1]** |
| `spectator` | la session, lecture seule | vue projecteur : classement du pool uniquement |

Inscription par **code de session + code d'équipe** distribués par le facilitateur.
Un membre peut porter plusieurs rôles ; une équipe fonctionne à partir d'une personne.

---

## 11. Confidentialité — la règle qui tient tout le jeu

Inchangée et renforcée :

- `decisions_log`, `financial_budgets`, `hr_metrics`, `procurement_*`, `distribution_*`,
  `consulting_orders` d'une équipe ne sont **jamais** lisibles par une autre équipe, à aucun
  moment, même après la fin de la session.
- Seuls les **résultats agrégés** (`team_das_round_metrics`, classement) deviennent visibles au
  pool **après** résolution.
- Les offres de cession sont **scellées** : une équipe ne voit ni les offres concurrentes ni
  l'offre NPC.
- **Tout calcul de score, de part de marché, de coût ou de trésorerie s'exécute côté serveur**,
  dans un Route Handler avec `SUPABASE_SERVICE_ROLE_KEY`. Aucune fonction du moteur n'est
  importable depuis un composant `"use client"` — vérifié par un test automatisé.

---

## 12. L'écran de révélation

C'est l'écran qui porte toute la tension pédagogique de l'atelier. Il montre simultanément à
toutes les équipes du pool **comment** le marché s'est redistribué, puis **pourquoi**.

### 12.1 Séquence

1. **Écran de verrouillage** (« Calcul en cours ») pendant l'exécution serveur. Aucune équipe
   n'accède aux résultats avant que toutes aient reçu l'événement — garanti en amont par la
   transaction unique de `atlas_persist_resolution`, dont la bascule d'état intervient en
   dernier. Le message le dit explicitement : *« personne n'a d'avance »*.
2. **Le chiffre, avant toute explication.** La part de marché de l'équipe en très grand, avec
   sa variation en points. C'est le choc.
3. **La barre empilée animée**, qui transitionne du partage du tour précédent vers le nouveau
   — 3,4 s, sortie cubique.
4. **La décomposition du score**, équipe par équipe, une fois l'animation posée.
5. **Bouton « Continuer vers le tour suivant »**, désactivé tant que le facilitateur n'a pas
   ouvert le tour suivant.

### 12.2 Pourquoi une barre et non un anneau — **[Δ v1]**

Le cahier initial demandait « un graphique en anneau empilé animé ». L'anneau est écarté
délibérément.

Un anneau n'est lisible que pour comparer des valeurs **nettement différentes**. Or les parts
d'un pool sont par construction **proches** — 38 / 34 / 27 % dans la partie de validation — et
c'est même toute la tension du jeu. Comparer des arcs voisins de quelques degrés est
précisément le cas d'usage où cette forme échoue.

La barre empilée horizontale sert mieux la même intention — *voir sa tranche grandir ou
fondre* : la frontière qui se déplace le long d'un axe unique se lit d'un coup d'œil, les noms
d'équipes s'inscrivent dans les segments, et la lisibilité tient jusqu'à douze équipes là où
l'anneau devient illisible au-delà de six.

Contraintes tenues : marque **fine** (46 px — un aplat saturé épais se lit comme un bloc, pas
comme une donnée), séparateur de 2 px entre segments, palette catégorielle validée en vision
des couleurs déficiente dans les deux modes, **étiquettes directes ET vue tableau** (trois
teintes passent sous 3:1 de contraste sur fond clair : l'identité ne peut pas reposer sur la
couleur seule), `prefers-reduced-motion` respecté, liseré autour de la tranche de l'équipe qui
regarde, et **ordre des segments fixe, indépendant du classement** — un changement de rang ne
doit jamais repeindre les survivants.

### 12.3 Ce que le pool voit, et rien d'autre

La décomposition est servie par la vue `pool_reveal`, projection **curatée** des résultats.
Cette curation n'est pas cosmétique : la table de résultats complète contient exactement ce
que le cabinet est censé vendre.

| Visible par le pool | Réservé à l'équipe — ou vendu par le cabinet |
|---|---|
| nom de l'équipe | coût unitaire variable |
| score de compétitivité | niveau d'automatisation, contrôle du canal |
| qualité perçue, notoriété | capacité, volumes, taux de rupture |
| compétitivité prix, alignement, pression | diagnostic d'alignement (`sab_score`, stratégie réellement détectée) |
| part de marché et sa variation | marge brute, EBITDA, trésorerie |
| chiffre d'affaires, **prix unitaire** | décisions, budgets, contrats |

Le prix unitaire est public : sur un marché réel, un prix se constate. L'indice d'alignement
l'est aussi — c'est un *résultat*, pas une décision, et le voir élevé chez un concurrent qui
vient de gagner des parts est exactement le signal pédagogique recherché. Sa **décomposition**,
elle, reste privée : c'est ce que vend l'audit.

### 12.4 Résilience

L'écran est **rejouable**. L'état vit en base, jamais dans la mémoire du navigateur : un
rafraîchissement, une coupure réseau ou un poste redémarré retrouvent la révélation intacte.
L'événement Realtime ne sert que de **signal** — l'écran recharge ensuite ses données par le
chemin normal, soumis à la RLS, plutôt que de faire confiance à la charge utile.

## 13. Résilience d'atelier

- **Auto-sauvegarde à chaque champ**, avec indicateur d'état de synchronisation visible.
- **File d'attente locale** : si le réseau tombe, les saisies sont mises en file dans
  IndexedDB et rejouées à la reconnexion. Aucune perte, y compris si un poste redémarre.
- Le facilitateur voit l'état de connexion de chaque équipe.
- Si la révélation échoue côté client, elle est **rejouable** : l'état est en base, pas dans
  la mémoire du navigateur.
- Un tour verrouillé peut être **déverrouillé** par le facilitateur avant résolution
  (erreur de manipulation), jamais après.

---

## 14. Pièges de business game — parades intégrées

| Piège | Parade dans Atlas |
|---|---|
| Une équipe décroche au tour 2 et s'ennuie | cession de DAS, océan bleu, recentrage, offre d'étude par le facilitateur, paliers de trésorerie progressifs |
| Décisions triviales, pas de débat | 7 plans, arbitrages à contre-courant, capacité et pouvoir de négociation qui forcent le choix |
| Optimisation par tâtonnement plutôt que par stratégie | l'IA récompense la cohérence ; le « milieu de gué » est explicitement puni |
| Espionnage via l'inspecteur réseau | RLS stricte, calcul serveur, test d'acceptation dédié |
| Résultat prévisible, plus de tension | aléas PESTEL, offres scellées, décisions simultanées |
| Le facilitateur perd le fil du timing | tableau de bord d'avancement, chronomètre indicatif, clôture manuelle assumée |
| Debriefing pauvre | audit d'alignement, export 6 onglets, grille de questions par axe |

---

## 15. Stack et phases

Stack **inchangée** : Next.js 15 (App Router, TypeScript), Tailwind + shadcn/ui, Recharts,
Supabase (Postgres, Auth, Realtime, Storage), SheetJS, déploiement Vercel.

| Phase | Contenu | Sortie utile |
|---|---|---|
| **P1 — Socle** | schéma + RLS + auth par codes + les 7 écrans de saisie + export T0 | une équipe peut saisir un tour complet |
| **P2 — Moteur** | fonctions pures testées : coûts, échelle, négociation, compétitivité, somme nulle, P&L, alignement | un tour se résout, chiffres vérifiables |
| **P3 — Temps réel** | verrouillage synchronisé, révélation animée, machine à états, projecteur | un atelier peut tourner |
| **P4 — Cabinet & cession** | études payantes + exports par étude, marché de cession NPC + enchère | la boucle pédagogique complète |
| **P5 — Réservé** | M&A inter-entreprises, intégrations verticale/horizontale/conglomérale | hors MVP |

---

## 16. Critères d'acceptation

1. Pour chaque DAS de chaque pool et à chaque tour, la somme des parts de marché des équipes
   plus la part non servie fait exactement 100 %.
2. Une équipe ne peut lire aucune donnée de décision d'une autre équipe — vérifié par un test
   RLS explicite exécuté avec un JWT d'équipe.
3. Aucun module du moteur n'est importable dans un composant client — vérifié par un test
   statique sur le graphe d'imports.
4. Une équipe déclarant « domination par les coûts » avec un prix à 80/100 et 9 % de R&D voit
   son IA chuter et reçoit le diagnostic « milieu de gué » dans son audit.
5. Doubler le volume produit fait baisser le coût unitaire d'un facteur conforme à la courbe
   d'expérience paramétrée, à ±1 %.
6. Une cession de DAS transfère part de marché, capacité, effectif et notoriété à l'acheteur,
   et la somme des parts du pool reste à 100 %.
7. Une saisie effectuée hors ligne est retrouvée intacte après reconnexion.
8. Le facilitateur peut ajouter un 4ᵉ, 5ᵉ … 10ᵉ tour sans redéploiement.
9. L'export de session (12 équipes × 10 tours) est produit en moins de 15 secondes.
10. Le timer et l'écran de révélation sont synchronisés pour toutes les équipes d'un pool.
