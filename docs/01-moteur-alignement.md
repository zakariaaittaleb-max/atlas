# ATLAS — Moteur d'Alignement Stratégique
## Guide complet de calcul de l'Indice d'Alignement (IA)

> L'IA est l'indicateur qui distingue Atlas d'un tableur de gestion. Il ne mesure pas la
> performance : il mesure la **cohérence entre ce qu'une équipe déclare vouloir faire et ce
> qu'elle fait réellement**. Une équipe peut être rentable et mal alignée — elle le paiera
> plus tard. Une équipe peut perdre des parts de marché et être bien alignée — elle sera plus
> profitable et rattrapera.

---

## 1. Principe

À chaque tour, une équipe **déclare** :
- une **stratégie corporate** au niveau de l'entreprise ;
- une **stratégie générique** pour chacun de ses DAS.

Le moteur observe ensuite les **décisions réellement prises** et mesure la distance entre
ces décisions et le **profil-cible** de la stratégie déclarée. Cette distance, pondérée et
agrégée, donne l'IA.

```
                 déclaration                    décisions réelles
                      │                                 │
                      ▼                                 ▼
              profil-cible (vecteur)  ◄──distance──►  vecteur observé
                                          │
                                          ▼
                              pénalité pondérée par axe
                                          │
                                          ▼
                         SAB (business) ─┐
                         SAC (corporate) ─┼──►  IA 0–100
                         SAT (temporel)  ─┘
                                          │
                          ┌───────────────┴───────────────┐
                          ▼                               ▼
                 part de marché                      marge
              (poids 0,15 dans le                (prime ±8 %)
               score de compétitivité)
```

**Aucun jugement humain.** Toutes les règles ci-dessous sont codées en dur et paramétrables
via `engine_parameters`. Le facilitateur n'arbitre jamais l'alignement — il l'explique.

---

## 2. Vocabulaire stratégique déclarable

### 2.1 Stratégies génériques (niveau DAS)

| Code | Nom | Logique de création de valeur |
|---|---|---|
| `domination_couts` | Domination par les coûts | Servir un marché large au coût le plus bas du secteur. Le profit vient du volume et de l'efficience, pas du prix. |
| `differenciation` | Différenciation | Servir un marché large avec une offre perçue comme unique, justifiant un premium. Le profit vient de la marge unitaire. |
| `focus_couts` | Concentration fondée sur les coûts | Servir **un seul segment** mieux et moins cher que les généralistes. |
| `focus_differenciation` | Concentration fondée sur la différenciation | Servir **un seul segment** avec une offre sur mesure à forte valeur. |

### 2.2 Stratégies corporate (niveau entreprise)

| Code | Nom | Logique |
|---|---|---|
| `specialisation` | Spécialisation | Concentrer toutes les ressources sur 1–2 DAS proches. Excellence par la profondeur. |
| `integration_verticale` | Intégration verticale | Contrôler les maillons amont (fournisseurs) et/ou aval (distribution) de sa filière. |
| `diversification_liee` | Diversification liée | Plusieurs DAS partageant des ressources, compétences ou canaux. Le pari : les synergies. |
| `diversification_conglomerale` | Diversification conglomérale | Plusieurs DAS sans lien opérationnel. Le pari : la logique financière et la répartition du risque. |

### 2.3 Valeurs communiquées

L'équipe choisit **exactement deux** valeurs parmi huit. Elles ne coûtent rien mais pèsent sur
l'alignement — c'est le volet « valeurs partagées » du 7S.

`excellence_produit` · `innovation` · `proximite_client` · `accessibilite_prix` ·
`efficience_operationnelle` · `responsabilite_sociale` · `ancrage_territorial` ·
`fiabilite_service`

---

## 3. Les 10 axes business

Chaque axe est normalisé sur 0–100 avant comparaison.

| # | Axe | Mesure | Normalisation |
|---|---|---|---|
| B1 | `price_position` | positionnement prix déclaré | déjà 0–100 (0 = agressif, 100 = premium) |
| B2 | `rd_intensity` | budget R&D ÷ CA du DAS | `clamp(pct / 0,12 × 100, 0, 100)` |
| B3 | `mkt_intensity` | budget marketing ÷ CA du DAS | `clamp(pct / 0,12 × 100, 0, 100)` |
| B4 | `quality` | indice qualité produit | déjà 0–100 |
| B5 | `cost_efficiency` | coût unitaire vs médiane du pool | `r = cu / médiane` ; `clamp(100 × (1,5 − r), 0, 100)` |
| B6 | `scale_index` | volume vs médiane du pool | `r = vol / médiane` ; `clamp(50 × r, 0, 100)` |
| B7 | `automation_level` | CAPEX technologique cumulé ÷ capacité installée | `clamp(ratio / seuil × 100, 0, 100)` |
| B8 | `skill_intensity` | 0,4 × (salaire moyen / SMIG − 1) ÷ 2 + 0,3 × formation/tête + 0,3 × part experts | ramené sur 0–100 |
| B9 | `segment_breadth` | nombre de segments servis | `(n − 1) / 4 × 100` (1 segment → 0, 5 segments → 100) |
| B10 | `channel_control` | volume écoulé en réseau propre ÷ volume total | `pct × 100` |

> **Note sur B5 et B6** : ce sont les seuls axes **relatifs au pool**. C'est volontaire — être
> « efficient » n'a de sens que par comparaison avec les concurrents du même marché. Au tour 1,
> en l'absence d'historique, la médiane est celle des dotations initiales.

### 3.1 Profils-cibles

| Axe | `domination_couts` | `differenciation` | `focus_couts` | `focus_differenciation` |
|---|---|---|---|---|
| B1 price_position | **22** | 78 | 30 | **88** |
| B2 rd_intensity | 20 | 80 | 20 | 85 |
| B3 mkt_intensity | 30 | 75 | 25 | 60 |
| B4 quality | 55 | **85** | 58 | **90** |
| B5 cost_efficiency | **88** | 45 | 78 | 38 |
| B6 scale_index | **82** | 55 | 30 | 22 |
| B7 automation_level | 78 | 55 | 62 | 35 |
| B8 skill_intensity | 32 | 82 | 38 | 88 |
| B9 segment_breadth | 80 | 75 | **22** | **18** |
| B10 channel_control | 35 | 70 | 45 | 85 |

### 3.2 Poids par axe et par stratégie

Tous les axes ne comptent pas également : la domination par les coûts se joue sur l'efficience
et l'échelle, la concentration se joue d'abord sur l'étroitesse du champ servi.
*(chaque colonne somme à 1,00)*

| Axe | `domination_couts` | `differenciation` | `focus_couts` | `focus_differenciation` |
|---|---|---|---|---|
| B1 price | 0,16 | 0,14 | 0,15 | 0,14 |
| B2 rd | 0,08 | 0,18 | 0,06 | 0,12 |
| B3 mkt | 0,03 | 0,12 | 0,02 | 0,06 |
| B4 quality | 0,07 | 0,20 | 0,09 | 0,18 |
| B5 cost_eff | **0,20** | 0,06 | **0,18** | 0,04 |
| B6 scale | **0,18** | 0,02 | 0,10 | 0,02 |
| B7 automation | 0,12 | 0,04 | 0,10 | 0,03 |
| B8 skill | 0,08 | 0,13 | 0,08 | 0,13 |
| B9 breadth | 0,06 | 0,03 | **0,18** | **0,18** |
| B10 channel | 0,02 | 0,08 | 0,04 | 0,10 |

### 3.3 Fonction de pénalité — tolérance, raideur, saturation

Un petit écart est normal (le monde réel est bruité) ; un grand écart est une incohérence ;
au-delà d'un certain point, un axe est aussi faux qu'il peut l'être.

```
d      = |valeur_observée − cible| / 100                  ∈ [0, 1]

f(d)   = 0                                si d ≤ 0,10     ← zone de tolérance
       = ((d − 0,10) / (0,45 − 0,10))^1,5  si 0,10 < d < 0,45
       = 1                                si d ≥ 0,45     ← saturation
```

L'exposant 1,5 fait qu'un écart **concentré** sur un axe coûte plus cher que le même écart
total **réparti** sur plusieurs : une équipe légèrement imprécise partout reste crédible ;
une équipe qui contredit frontalement sa stratégie sur un axe critique est sanctionnée.

> **Le point de saturation à 0,45 n'est pas cosmétique.** Sans lui — c'est-à-dire en
> normalisant sur [0, 1] au lieu de [0,10 ; 0,45] — une équipe contredisant sa stratégie sur
> *tous* les axes conservait un score supérieur à 90, et le diagnostic de « milieu de gué »
> ne se déclenchait jamais. Le défaut a été trouvé par le test
> `alignment.test.ts › détecte le milieu de gué`, pas par relecture.

### 3.4 Score d'alignement business d'un DAS

```
SAB(das) = clamp( 100 × ( 1 − Σᵢ poidsᵢ × f(dᵢ) ) , 0 , 100 )
```

### 3.5 Score business consolidé

Pondéré par le chiffre d'affaires de chaque DAS — une incohérence sur le DAS principal pèse
plus qu'une incohérence sur un DAS marginal.

```
SAB_global = Σ_das ( CA_das / CA_total ) × SAB(das)
```

---

## 4. Les deux diagnostics critiques

Le moteur calcule le SAB du DAS **contre les quatre profils**, pas seulement contre celui
déclaré. La comparaison produit deux diagnostics distincts — c'est le point le plus important
du modèle.

```
fit_déclaré = SAB(das, stratégie_déclarée)
meilleur_fit = max( SAB(das, p) pour p dans les 4 profils )
profil_réel  = argmax(...)
```

### 4.1 « Milieu de gué » (*stuck in the middle*)

```
si meilleur_fit < 55  →  diagnostic MILIEU_DE_GUE, malus −12 points d'IA
```

**Lecture pédagogique :** les décisions de l'équipe ne correspondent à *aucune* stratégie
cohérente. Ni assez bon marché pour gagner sur les coûts, ni assez distinctif pour justifier
un premium. C'est la sanction que Porter décrit : la position la moins défendable du secteur.

**Ce que le diagnostic ne fait pas.** Il ne punit pas la *médiocrité*, seulement
l'*incohérence*. Une équipe qui met tout à 50 n'est pas au milieu de gué : elle est terne, et
c'est le marché à somme nulle qui la sanctionnera — elle perdra des parts face à toute équipe
qui s'engage. Le milieu de gué, c'est autre chose : **prix premium sur un marché de masse,
sans R&D pour le justifier, sans qualité derrière, et sans avantage de coût pour compenser.**
Cette séparation est délibérée : l'IA mesure la cohérence, le marché mesure la position.

### 4.2 « Dérive stratégique »

```
si (meilleur_fit − fit_déclaré) > 15  →  diagnostic DERIVE, malus −6 points d'IA
```

**Lecture pédagogique :** l'équipe exécute une stratégie cohérente, mais **ce n'est pas celle
qu'elle a annoncée**. Le malus est volontairement plus faible : ce n'est pas une faute de
gestion, c'est une faute de lucidité. L'audit dit alors explicitement : *« vous déclarez la
différenciation, vous exécutez la domination par les coûts ; l'un des deux doit changer. »*

Si l'équipe **re-déclare** la stratégie réellement exécutée au tour suivant, le malus disparaît
sans coût de transition. **Le jeu récompense la lucidité, pas l'entêtement.**

---

## 5. Les 8 axes corporate

| # | Axe | Mesure |
|---|---|---|
| C1 | `portfolio_breadth` | nombre de DAS actifs, normalisé `(n − 1) / 7 × 100` |
| C2 | `portfolio_relatedness` | proximité moyenne deux à deux des DAS (matrice §5.1) |
| C3 | `structure_type` | catégoriel : `fonctionnelle` / `divisionnelle` / `matricielle` |
| C4 | `centralisation_index` | 0–100, dérivé des fonctions centralisées (§5.2) |
| C5 | `shared_resources_index` | 0–100, mutualisation **effective** entre DAS (§5.3) |
| C6 | `vertical_integration` | 0–100, maillons amont/aval contrôlés |
| C7 | `talent_mix` | part des experts et cadres dans l'effectif, 0–100 |
| C8 | `values_fit` | affinité des valeurs déclarées avec la stratégie business dominante (§5.4) |

### 5.1 Matrice de proximité sectorielle

Proximité 0–100 entre deux DAS. Elle détermine si une diversification est *liée* ou
*conglomérale*, et si mutualiser produit des économies ou des coûts de coordination.
Voir [`03-referentiel-das.md`](03-referentiel-das.md) §4 pour la matrice complète des 8 DAS.

Principe : deux DAS sont proches s'ils partagent des **clients**, des **canaux**, des
**technologies**, des **fournisseurs** ou des **compétences**. La proximité est la moyenne
pondérée de ces cinq dimensions.

### 5.2 Indice de centralisation

L'équipe décide, pour cinq fonctions, si elles sont pilotées au siège ou par les divisions :
`achats`, `systeme_information`, `recherche_developpement`, `ressources_humaines`, `finance`.

```
centralisation_index = (nb fonctions centralisées / 5) × 100
```
Chaque fonction centralisée réduit son coût unitaire (mutualisation) mais réduit la réactivité
du DAS (voir §7.2 pour l'effet économique).

### 5.3 Indice de mutualisation effective

Distinct de la centralisation : on peut centraliser les achats **sans** que les DAS achètent
les mêmes choses. La mutualisation ne compte que si elle est **réelle**.

```
shared_resources_index = 100 × moyenne de :
   • part des fournisseurs communs à ≥ 2 DAS
   • part des distributeurs communs à ≥ 2 DAS
   • R&D mutualisée (booléen × poids)
   • capacité de production partagée (booléen × poids)
```

### 5.4 Affinité des valeurs

Affinité de chaque valeur avec chaque stratégie générique : `+1` consonante, `0` neutre,
`−1` dissonante.

| Valeur | `domination_couts` | `differenciation` | `focus_couts` | `focus_differenciation` |
|---|---|---|---|---|
| `excellence_produit` | −1 | +1 | −1 | +1 |
| `innovation` | −1 | +1 | 0 | +1 |
| `proximite_client` | 0 | +1 | 0 | +1 |
| `accessibilite_prix` | +1 | −1 | +1 | −1 |
| `efficience_operationnelle` | +1 | 0 | +1 | −1 |
| `responsabilite_sociale` | 0 | +1 | 0 | +1 |
| `ancrage_territorial` | 0 | 0 | +1 | +1 |
| `fiabilite_service` | +1 | +1 | +1 | +1 |

```
affinité_moyenne = moyenne( affinité(valeur, stratégie_dominante) pour les 2 valeurs )
values_fit = (affinité_moyenne + 1) / 2 × 100
```
La stratégie dominante est celle du DAS pesant le plus de CA.

> `fiabilite_service` est consonante avec tout : c'est volontaire. Il existe des valeurs
> universelles, et les étudiants doivent découvrir qu'en choisir une « sans risque » ne
> distingue pas leur entreprise.

### 5.5 Profils-cibles corporate

| Axe | `specialisation` | `integration_verticale` | `diversification_liee` | `diversification_conglomerale` |
|---|---|---|---|---|
| C1 breadth | **10** | 25 | 50 | **75** |
| C2 relatedness | **85** | 80 | **65** | **20** |
| C4 centralisation | 75 | 80 | 55 | **30** |
| C5 shared_resources | 60 | 70 | **80** | **20** |
| C6 vertical_integration | 40 | **85** | 40 | 20 |
| C7 talent_mix | 60 | 55 | 60 | 45 |
| C8 values_fit | 75 | 70 | 70 | 60 |

**Poids** *(somme = 1,00)*

| Axe | `specialisation` | `integration_verticale` | `diversification_liee` | `diversification_conglomerale` |
|---|---|---|---|---|
| C1 breadth | 0,22 | 0,10 | 0,16 | 0,18 |
| C2 relatedness | 0,20 | 0,14 | 0,20 | 0,18 |
| C4 centralisation | 0,14 | 0,16 | 0,12 | 0,18 |
| C5 shared_resources | 0,14 | 0,16 | **0,26** | 0,20 |
| C6 vertical_integration | 0,08 | **0,30** | 0,08 | 0,06 |
| C7 talent_mix | 0,10 | 0,06 | 0,08 | 0,08 |
| C8 values_fit | 0,12 | 0,08 | 0,10 | 0,12 |

Même fonction de pénalité qu'en §3.3.

### 5.6 Pénalités catégorielles — structure × stratégie corporate

Appliquées **en points, directement** sur le SAC (elles ne passent pas par la fonction de
distance, car une structure est un choix discret).

| | `fonctionnelle` | `divisionnelle` | `matricielle` |
|---|---|---|---|
| `specialisation` | **0** | −8 | −15 |
| `integration_verticale` | −4 | **0** | −10 |
| `diversification_liee` | −18 | −5 | **0** |
| `diversification_conglomerale` | −22 | **0** | −16 |

**Lectures :**
- *Fonctionnelle + conglomérat (−22)* : une direction commerciale unique ne peut pas vendre du
  ciment et des nuitées d'hôtel. L'organisation ne tient pas.
- *Matricielle + conglomérat (−16)* : la matrice sert à croiser des expertises partagées.
  Sans rien à partager, c'est un coût de coordination pur.
- *Matricielle + spécialisation (−15)* : deux lignes hiérarchiques pour un seul métier.

### 5.7 Pénalités structurelles absolues

Indépendantes de la déclaration — ce sont des contraintes physiques d'organisation.

```
structure = fonctionnelle ET nb_DAS ≥ 4        →  −15 points
structure = matricielle   ET nb_DAS ≤ 1        →  −12 points
structure = divisionnelle ET nb_DAS ≤ 1        →  −8  points
centralisation ≥ 80 ET relatedness ≤ 30        →  −10 points   (siège qui décide de tout
                                                                 sur des métiers étrangers)
shared_resources ≥ 70 ET relatedness ≤ 30      →  −12 points   (mutualisation stérile)
declare integration_verticale ET C6 < 30       →  −14 points   (intégration proclamée,
                                                                 jamais réalisée)
```

### 5.8 Score corporate

```
SAC = clamp( 100 × (1 − Σ poidsⱼ × f(dⱼ)) + Σ pénalités_catégorielles + Σ pénalités_absolues , 0 , 100 )
```

---

## 6. Composition de l'IA

### 6.1 Score temporel (SAT)

Une stratégie a besoin de temps. Cet axe récompense la constance productive et pénalise le
zapping stratégique.

```
SAT = clamp(
        100
        − 20 × nb_changements_de_stratégie_déclarée_ce_tour
        + 10 × nb_tours_consécutifs_avec_SAB_en_hausse
      , 0 , 100 )
```
> Le changement de stratégie n'est pas interdit — il coûte un tour. C'est la réalité.
> Exception : un changement qui **résout une dérive** diagnostiquée au tour précédent est
> **gratuit** (voir §4.2).

### 6.2 Formule finale

```
IA_brut = 0,55 × SAB_global + 0,35 × SAC + 0,10 × SAT

IA = clamp(
       IA_brut
       − 12 × (milieu_de_gué ? 1 : 0)
       −  6 × (dérive_stratégique ? 1 : 0)
     , 0 , 100 )
```

Au tour 0, l'IA est initialisée à **70** pour toutes les équipes.

---

## 7. Effets de l'IA sur le moteur

L'IA n'est pas un indicateur décoratif : il agit sur **trois** canaux distincts.

### 7.1 Canal part de marché

L'IA entre dans le score de compétitivité avec un poids de **0,15** (inchangé v1) :

```
competitiveness_score = 0,30 × qualité/100
                      + 0,25 × notoriété/100
                      + 0,20 × compétitivité_prix
                      + 0,15 × IA/100
                      − 0,10 × pression_concurrentielle
```

### 7.2 Canal marge — la parade à la frustration

**C'est le mécanisme qui répond à « ma stratégie était bonne mais j'ai perdu ».**
Une entreprise cohérente exécute mieux : moins de gaspillage, meilleure acceptation du prix.

```
prime_marge = clamp( 0,08 × (IA − 70) / 30 , −0,08 , +0,08 )
marge_effective = marge_brute × (1 + prime_marge)
```

Conséquence recherchée : une équipe **très bien alignée peut perdre des parts de marché et
rester la plus profitable du pool**. Elle a de quoi financer sa reconquête au tour suivant, et
le débriefing a une leçon à raconter autre que « ils ont mis plus de budget marketing ».

### 7.3 Canal synergies — l'effet corporate réel

Mutualiser des activités proches produit des économies ; mutualiser des activités étrangères
produit de la bureaucratie. Cet effet est **économique**, pas seulement scoré.

```
m = shared_resources_index / 100
p = portfolio_relatedness  / 100

économie_synergie   = m × p       × 0,12      // jusqu'à −12 % d'OPEX
coût_coordination   = m × (1 − p) × 0,15      // jusqu'à +15 % d'OPEX
surcoût_siège       = centralisation_index/100 × nb_DAS × 0,004   // siège qui grossit

opex_effectif = opex × (1 − économie_synergie + coût_coordination + surcoût_siège)
```

C'est la démonstration chiffrée de la différence entre diversification liée et conglomérale.
Une équipe qui mutualise l'agro-industrie et la distribution alimentaire (`p ≈ 0,8`) gagne ;
une équipe qui mutualise le tourisme et le matériel industriel (`p ≈ 0,15`) perd.

---

## 8. Le rapport d'audit d'alignement

Livrable de l'étude à 180 000 DH (§6 de la spécification). Fichier `.xlsx` + affichage écran.

**Onglet 1 — Verdict**
> *« Vous déclarez une stratégie de différenciation sur l'Agro-industrie. Vos décisions
> correspondent à 41 % à ce profil et à 79 % à une domination par les coûts.
> Diagnostic : dérive stratégique. »*

**Onglet 2 — Décomposition business, axe par axe**

| Axe | Cible | Observé | Écart | Contribution |
|---|---|---|---|---|
| Positionnement prix | 78 | 31 | −47 | **−6,4 pts** |
| Intensité R&D | 80 | 12 | −68 | **−9,8 pts** |
| Qualité | 85 | 58 | −27 | −4,1 pts |
| Efficience coût | 45 | 81 | +36 | −1,7 pts |
| … | | | | |
| **SAB Agro-industrie** | | | | **41 / 100** |

**Onglet 3 — Décomposition corporate**
Même structure, plus la liste nominative des pénalités catégorielles déclenchées, chacune
accompagnée de sa phrase d'explication.

**Onglet 4 — Recommandations chiffrées**
> 1. Porter le budget R&D de 1,4 M DH à 6,8 M DH (8 % du CA) — gain estimé +9 pts d'IA.
> 2. Remonter le prix de 31 à 65 — gain estimé +5 pts d'IA, perte estimée de 4 pts de PdM.
> 3. Ou : re-déclarer une domination par les coûts — gain immédiat +23 pts d'IA, sans coût
>    de transition (résolution d'une dérive).

**Onglet 5 — Position relative**
Comparaison anonymisée avec la médiane du pool, par axe. Jamais de nom d'équipe concurrente.

---

## 9. Paramètres exposés dans `engine_parameters`

Tous ajustables sans redéploiement, avec le préfixe `alignment.` :

```
alignment.weight.sab                    0.55
alignment.weight.sac                    0.35
alignment.weight.sat                    0.10
alignment.tolerance_band                0.10      // zone franche de la fonction f
alignment.saturation_gap                0.45      // au-delà, pénalité maximale
alignment.penalty_exponent              1.50
alignment.stuck_threshold               55        // seuil « milieu de gué »
alignment.stuck_malus                   12
alignment.drift_gap_threshold           15        // seuil « dérive stratégique »
alignment.drift_malus                   6
alignment.margin_premium_max            0.08
alignment.margin_premium_pivot          70        // IA neutre
alignment.synergy_saving_max            0.12
alignment.coordination_cost_max         0.15
alignment.hq_overhead_per_das           0.004
alignment.sat_change_malus              20
alignment.sat_improvement_bonus         10
alignment.initial_ia                    70
```
Les 40 valeurs des profils-cibles et les 40 poids business sont également en base
(`alignment.target.<strategie>.<axe>` et `alignment.weight.<strategie>.<axe>`), afin que le
facilitateur puisse durcir ou assouplir le modèle entre deux promotions.

---

## 10. Exemple travaillé de bout en bout

**Équipe « Ziyad Holding », tour 2, DAS Agro-industrie.**
Stratégie déclarée : `differenciation`.

*Valeurs produites par le moteur lui-même — voir `src/lib/engine/alignment.ts`.*

| Axe | Observé | Cible | d | poids | pénalité (pts) |
|---|---|---|---|---|---|
| B1 price_position | 31 | 78 | 0,47 → saturé | 0,14 | **14,00** |
| B2 rd_intensity | 12 | 80 | 0,68 → saturé | 0,18 | **18,00** |
| B3 mkt_intensity | 44 | 75 | 0,31 | 0,12 | 5,58 |
| B4 quality | 58 | 85 | 0,27 | 0,20 | 6,77 |
| B5 cost_efficiency | 81 | 45 | 0,36 | 0,06 | 3,84 |
| B6 scale_index | 68 | 55 | 0,13 | 0,02 | 0,05 |
| B7 automation_level | 72 | 55 | 0,17 | 0,04 | 0,36 |
| B8 skill_intensity | 35 | 82 | 0,47 → saturé | 0,13 | **13,00** |
| B9 segment_breadth | 75 | 75 | 0,00 | 0,03 | 0,00 |
| B10 channel_control | 20 | 70 | 0,50 → saturé | 0,08 | **8,00** |
| | | | | **Σ** | **69,60** |

```
SAB(agro, différenciation) = 100 − 69,60 = 30,4
SAB(agro, domination_couts) = 99,1      ← recalculé contre les trois autres profils
```

→ `meilleur_fit (99,1) − fit_déclaré (30,4) = 68,7` ≫ 15 → **dérive stratégique déclenchée.**

**Le verdict de l'audit :**

> *« Vos décisions exécutent une domination par les coûts quasi parfaite : prix à 31, R&D à
> 12 %, efficience à 81, automatisation à 72. Vous avez déclaré la différenciation. L'une des
> deux affirmations doit changer — et la moins coûteuse à changer est la déclaration. »*

C'est exactement le cas que le jeu doit produire : une équipe qui **joue bien** une stratégie
qu'elle **croit ne pas jouer**. Le malus n'est que de −6 points, et il disparaît entièrement
si l'équipe re-déclare `domination_couts` au tour suivant, sans coût de transition.

---

## 11. Ce que le modèle enseigne

| Mécanisme | Leçon de stratégie |
|---|---|
| Fonction de pénalité raide | Une contradiction frontale coûte plus cher que dix approximations |
| Milieu de gué | La position médiane est la moins défendable (Porter, 1980) |
| Dérive vs incohérence | Se tromper de stratégie est réparable ; ne pas en avoir ne l'est pas |
| Prime de marge | La cohérence paie en rentabilité même quand elle ne paie pas en volume |
| Synergie × proximité | La diversification ne crée de valeur que si les activités se parlent |
| Pénalité structure × portefeuille | « Structure follows strategy » (Chandler, 1962), chiffré |
| Mutualisation stérile | Partager des ressources entre métiers étrangers détruit de la valeur |
| SAT | Une stratégie qu'on change tous les tours n'est pas une stratégie |
