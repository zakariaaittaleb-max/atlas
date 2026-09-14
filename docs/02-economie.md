# ATLAS — Moteur économique
## Coûts, échelle, pouvoir de négociation, compte de résultat

> Ce document répond directement au diagnostic porté sur les versions papier :
> *« certaines décisions n'avaient pas d'impact sur l'économie d'échelle, la qualité perçue,
> le pouvoir de négociation avec les distributeurs, les fournisseurs, la part de marché, le
> chiffre d'affaires »*. Chaque mécanique ci-dessous existe pour rendre une décision coûteuse
> à prendre **et** coûteuse à ne pas prendre.

---

## 1. Ordre de résolution d'un tour

L'ordre est impératif : chaque étape consomme les sorties de la précédente.

```
 1. Chocs PESTEL          → taille de marché, coûts d'intrants, contraintes réglementaires
 2. Approvisionnement     → pouvoir amont, prix d'achat réel, qualité intrants, ruptures
 3. Capacité              → capacité effective du tour (CAPEX du tour n−1 mis en service)
 4. Coût unitaire         → courbe d'expérience × automatisation × prix d'achat
 5. Qualité & notoriété   → R&D, marketing, qualité intrants, disponibilité
 6. Alignement            → SAB, SAC, SAT → IA  (doc 01)
 7. Compétitivité         → score par DAS
 8. Distribution          → couverture, plafond de part de marché, marge cédée
 9. Parts de marché       → répartition à somme nulle par pool + choc PESTEL
10. Volumes               → demande, contrainte de capacité, ventes perdues
11. Compte de résultat    → CA → marge → EBITDA → EBIT → IS → résultat net
12. Trésorerie            → flux, BFR, dette, paliers d'alerte
13. Cessions de DAS       → dénouement des offres scellées, transferts
14. Écriture & révélation → persistance transactionnelle puis événement Realtime
```

---

## 2. Marché, prix et volume

### 2.1 Taille du marché

```
taille_marché_mad(das, t) = taille_marché_mad(das, t−1) × (1 + croissance(das, t))
croissance(das, t)        = tirage dans [growth_rate_min, growth_rate_max] ± effet_choc_pestel
prix_référence(das, t)    = prix_référence(das, t−1) × (1 + inflation_sectorielle(t))
volume_marché(das, t)     = taille_marché_mad(das, t) / prix_référence(das, t)
```

### 2.2 Prix pratiqué

Le positionnement prix `p ∈ [0, 100]` se traduit en prix unitaire :

```
prix_unitaire = prix_référence × (0,60 + 0,008 × p)
```
`p = 0` → 60 % du prix marché · `p = 50` → prix marché · `p = 100` → 140 % du prix marché.

### 2.3 Compétitivité prix

Relative au pool, avec élasticité : c'est l'écart au prix médian qui compte, pas le prix absolu.

```
écart = (prix_médian_pool − prix_unitaire) / prix_médian_pool
compétitivité_prix = clamp( 0,5 + élasticité_das × écart , 0 , 1 )
```
`élasticité_das` ∈ [0,8 ; 2,2] selon le DAS — l'agro-industrie est élastique (2,0),
le tourisme haut de gamme l'est peu (0,9). **Un même geste de prix ne produit pas le même
effet selon le métier** : c'est une leçon en soi.

---

## 3. Capacité de production

### 3.1 Évolution

```
capacité(t) = capacité(t−1) × (1 − dépréciation_annuelle)
            + capex_capacité(t−1) / coût_unitaire_de_capacité(das)
```

**La capacité financée au tour *t* n'est disponible qu'au tour *t+1*.** Délai volontaire :
il oblige à anticiper la demande plutôt qu'à réagir. Une équipe qui gagne des parts sans avoir
investi un tour plus tôt ne peut pas les servir.

Le délai est **structurel** : l'instantané transporte le CAPEX du tour précédent. Il n'existe
donc aucun paramètre pour le régler, et celui qui prétendait le faire a été retiré.

### 3.1 bis Disponibilité sociale — la première sortie de la boucle RH

```
manque_social       = max(60 − climat_social(t−1), 0) / 60
disponibilité       = 1 − poids_capacité × manque_social
capacité_effective  = capacité × (1 − rupture_approvisionnement) × disponibilité
```

Le climat social de la **clôture précédente** décide de la part de l'outil que l'organisation
est en état de faire tourner : absentéisme, arrêts de ligne, gestes de mauvaise volonté. La
machine est là, elle ne produit pas.

Le pivot est 60 — le même vers lequel le climat revient spontanément et à partir duquel la
rotation s'aggrave. Au-dessus, rien ne se perd : une équipe qui gère correctement ses gens ne
paie aucune taxe.

**Ce que cette formule corrige.** La chaîne RH se refermait sur elle-même : les décisions
faisaient le climat, le climat faisait la rotation et la compétence, la compétence faisait la
charge de travail, la charge de travail refaisait le climat. Rien n'en sortait vers la
production. Une équipe pouvait payer au minimum, ne jamais former et licencier à chaque tour
sans produire une unité de moins ni perdre un point de part de marché.

### 3.2 Contrainte de service

```
volume_demandé = volume_marché(das) × part_de_marché
volume_vendu   = min( volume_demandé , capacité_effective )
ventes_perdues = volume_demandé − volume_vendu
```

Une rupture se paie deux fois — en chiffre d'affaires et en réputation :

```
taux_rupture = ventes_perdues / volume_demandé
notoriété(t+1) −= 12 × taux_rupture
qualité_perçue −= 10 × taux_rupture
```

> **Arbitrage central du jeu.** Attaquer en prix sans capacité, c'est acheter des parts de
> marché qu'on ne peut pas servir, et abîmer sa marque en le faisant.

### 3.3 Taux d'utilisation

```
utilisation = volume_produit / capacité

utilisation < 0,70  →  surcoût_sous_absorption = coûts_fixes × (0,70 − u)/0,70 × 0,50
utilisation > 0,95  →  l'excédent est sous-traité au coût unitaire × 1,60
```
Surcapacité et surchauffe coûtent toutes les deux. L'optimum se situe entre 70 % et 95 %.

---

## 4. Coût unitaire — la courbe d'expérience

**C'est la mécanique qui rend la domination par les coûts réellement jouable.**

### 4.0 Les deux facteurs humains

```
coût_variable_unitaire = coût_après_automatisation
                       × (1 − levier_compétence × écart_compétence)   // QUI travaille
                       × (1 + pénalité_climat   × manque_social)      // DANS QUEL ÉTAT
écart_compétence = (indice_compétence(t−1) − compétence_de_dotation) / 100
```

Deux grandeurs humaines pèsent sur le même coût, et elles se composent : une équipe démotivée
**et** déqualifiée paie les deux. La compétence enlève ou ajoute du rebut, de la casse et du
temps de réglage ; le climat se paie en heures supplémentaires pour couvrir les absences, en
reprises et en malfaçons.

**Pourquoi un écart et non un niveau pour la compétence.** Le levier s'applique à l'écart par
rapport au niveau **hérité** de la dotation. Une équipe qui n'a rien décidé n'est donc ni
récompensée ni punie : elle produit au coût de référence. Un pivot arbitraire à 50 aurait taxé
tout le monde dès le premier tour pour une décision que personne n'avait prise.

**Pourquoi un second canal pour le climat, et pas seulement le plafond de capacité.** Vérifié
sur une session réelle : la capacité installée y valait deux fois et demie la demande. Un
climat effondré retirait bien 12 % de l'outil, et cela ne changeait rien — il restait de la
marge. La sanction n'existait que pour une équipe déjà saturée, soit l'inverse de la pédagogie
visée. Le coût, lui, est toujours payé.

### 4.1 Effet d'apprentissage

```
volume_cumulé(t) = volume_cumulé(t−1) + volume_produit(t)

λ = − ln(taux_apprentissage) / ln(2)          // 85 % d'apprentissage → λ = 0,2345

coût_unitaire_base(t) = coût_référence
                      × ( volume_cumulé(t) / volume_cumulé_référence ) ^ (−λ)
```
Plancher : `coût_unitaire_base ≥ 0,55 × coût_référence` — l'apprentissage n'est pas infini.

**Conséquence de jeu :** doubler le volume cumulé abaisse le coût unitaire de 15 % (à 85 %
d'apprentissage). Une équipe qui prend la tête en volume au tour 1 creuse un avantage de coût
que les autres ne rattrapent qu'en volume, donc en agressivité prix, donc en marge sacrifiée.
La boucle est vertueuse pour le leader, vicieuse pour les suiveurs — et parfaitement lisible
au débriefing.

### 4.2 Automatisation : troquer du variable contre du fixe

```
a = automation_level / 100

coût_unitaire_variable = coût_unitaire_base × (1 − 0,30 × a) × indice_prix_achat
coûts_fixes_production = coûts_fixes_base   × (1 + 0,50 × a)
```
Automatiser à fond avec de faibles volumes est ruineux ; automatiser en position de leader
est décisif. **Le même investissement est bon ou mauvais selon la stratégie.**

### 4.3 Point mort

Affiché en permanence dans le dashboard — c'est l'indicateur qui force le débat :

```
point_mort_volume = coûts_fixes_totaux
                  / ( prix_unitaire × (1 − marge_distributeur) − coût_unitaire_variable )
```

---

## 5. Amont — fournisseurs et pouvoir de négociation

Chaque fournisseur du référentiel porte : `indice_prix` (1,00 = marché), `fiabilite` 0–100,
`contribution_qualite` 0–100, `capacite`, `volume_minimum`, `cout_de_changement` 0–100, `region`.

### 5.1 Pouvoir de négociation amont

```
part_du_carnet   = volume_engagé_par_l_équipe / capacité_du_fournisseur
nb_alternatives  = fournisseurs du DAS disposant d'une capacité suffisante

pouvoir_amont = clamp(
    40
  + 45 × min( part_du_carnet / 0,30 , 1 )      // être un client majeur pèse
  + 15 × min( nb_alternatives / 5 , 1 )        // pouvoir sortir pèse
  − 25 × ( cout_de_changement / 100 )          // être captif ne pèse pas
, 0 , 100 )
```

### 5.2 Prix d'achat effectif

```
remise = 0,18 × ( pouvoir_amont / 100 )                    // jusqu'à −18 %
prix_achat = prix_catalogue × indice_prix × (1 − remise)
indice_prix_achat = prix_achat / prix_achat_référence       // entre dans §4.2
```

### 5.3 Fiabilité et qualité des intrants

```
rupture_appro   = (1 − fiabilite/100) × aléa(0,5 ; 1,5)
capacité_effective = capacité × (1 − rupture_appro)

qualité_intrants = Σ ( part_volume(f) × contribution_qualite(f) )
```

> **Arbitrage.** Le fournisseur le moins cher est souvent le moins fiable. Concentrer ses
> achats chez un seul fournisseur maximise le pouvoir de négociation *et* le risque de
> rupture. Se diversifier fait l'inverse. Il n'y a pas de bonne réponse universelle — seulement
> une réponse cohérente avec la stratégie déclarée.

---

## 6. Aval — distributeurs, couverture et marge cédée

Chaque distributeur porte : `couverture` par région, `marge_requise` (% du prix de vente),
`volume_minimum`, `force_de_negociation` 0–100, `niveau_de_service` 0–100.

### 6.1 Pouvoir de négociation aval

```
pouvoir_aval = clamp(
    35
  + 30 × ( notoriété / 100 )                        // une marque demandée se négocie
  + 20 × min( part_du_volume_du_distributeur / 0,25 , 1 )
  + 15 × ( channel_control / 100 )                  // avoir son réseau = alternative crédible
  − 30 × ( force_de_negociation / 100 )
, 0 , 100 )

marge_distributeur_effective = marge_requise × ( 1 − 0,35 × pouvoir_aval / 100 )
```

### 6.2 Couverture et plafond de part de marché

La couverture est l'**union** des couvertures des canaux engagés — jamais leur somme. Deux
distributeurs couvrant 50 % chacun ne couvrent pas 100 % du marché : ils se recoupent.

```
engagement(canal)  = min( volume_confié / volume_minimum_exigé , 1 )
couverture_totale  = 1 − Π ( 1 − couverture(canal) × engagement(canal) )
```

**La contribution d'un canal dépend de l'atteinte de son volume minimal**, et non de la part
de volume qu'on lui confie. C'est ce qui rend `volume_minimum` opérant : une grande surface
nationale exige des volumes qu'une petite équipe ne peut pas fournir, et lui reste donc fermée
quelle que soit sa bonne volonté. Le pouvoir de l'acheteur, rendu concret.

> Une version antérieure pondérait la couverture par la part de volume. Elle produisait un
> effet pervers découvert au test : répartir 50/50 entre deux réseaux couvrant 65 % chacun
> donnait **54 %** de couverture — soit moins que de tout confier à un seul (65 %).
> Multiplier ses canaux doit élargir sa portée, jamais la réduire.

**Plafond de part de marché** — on ne vend pas là où on n'est pas distribué :

```
part_de_marché_plafonnée = min( part_brute , couverture_totale × 1,15 )
```
Le surplus non servi est **redistribué aux autres équipes du pool** au prorata de leur score,
ce qui maintient la somme à 100 %.

### 6.3 Réseau propre

Alternative aux distributeurs : `capex_reseau_propre` construit une couverture qui grandit
lentement (≈ +6 points de couverture par million de DH, plafonnée par région), mais supprime
la marge distributeur **et** fait monter `channel_control`, donc le pouvoir aval sur le reste
du canal. Coûteux, lent, structurant — typiquement cohérent avec la différenciation.

---

## 7. Qualité perçue et notoriété

### 7.1 Qualité produit (intrinsèque)

```
qualité(t) = clamp(
    qualité(t−1) × (1 − obsolescence)                       // obsolescence ≈ 4 %/tour
  + k_rd × normalise( budget_rd ) × (1 − qualité(t−1)/100)  // rendement décroissant
  + bonus_partenariat_technologique
, 0 , 100 )
```
Le gain de R&D est **multiplié par la compétence** et le résultat est **diminué des points
perdus par les coupes d'effectif** du tour précédent :

```
gain_rd  = k_rd × normalise(budget_rd) × (1 − qualité(t−1)/100)
         × (1 + levier_compétence_qualité × écart_compétence)
qualité  = … + gain_rd + bonus_partenariat − perte_qualité_des_coupes(t−1)
```

Un budget de recherche confié à des gens qui ne savent pas l'exécuter produit moins que le même
budget entre des mains formées. L'écart porte sur le **gain** et non sur le niveau : laisser
filer la compétence n'abîme pas le produit existant, cela empêche de l'améliorer.

La perte de qualité des coupes, elle, frappe le produit. Elle est calculée au tour où l'on
licencie au-delà de ce que la standardisation autorisait, et appliquée au tour **suivant** : un
atelier ne perd pas son tour de main le jour de la notification. Elle était calculée et jetée,
faute de colonne pour la porter — licencier au-delà du seuil sûr était réputé coûter de la
qualité et n'en coûtait aucune.

**L'effet de la R&D est différé d'un tour** : le budget du tour *t* produit son effet en *t+1*.
Une équipe qui coupe sa R&D pour sauver sa trésorerie ne le paie qu'au tour suivant — quand
il est trop tard pour corriger. Leçon classique, mécanique implacable.

### 7.2 Qualité perçue

C'est elle qui entre dans la compétitivité, pas la qualité intrinsèque :

```
qualité_perçue = 0,55 × qualité_produit
               + 0,20 × qualité_intrants
               + 0,15 × (100 − 100 × taux_rupture)
               + 0,10 × niveau_de_service_distribution
```

### 7.3 Notoriété

```
notoriété(t) = clamp(
    notoriété(t−1) × (1 − oubli)                              // oubli ≈ 8 %/tour
  + k_mkt × normalise( budget_marketing ) × (1 − notoriété(t−1)/100)
  − 12 × taux_rupture
, 0 , 100 )
```
L'oubli est supérieur à l'obsolescence de la qualité : **une marque se perd plus vite qu'un
produit**. Arrêter le marketing un tour se voit immédiatement.

---

## 8. Score de compétitivité et parts de marché

```
compétitivité(équipe, das, t) =
      0,30 × qualité_perçue / 100
    + 0,25 × notoriété / 100
    + 0,20 × compétitivité_prix
    + 0,15 × IA / 100
    − 0,10 × pression_concurrentielle

  × (1 − coefficient_risque_ansoff)     si le DAS a moins de 2 tours
  × (1 − malus_trésorerie)              si surveillance (−10 %) ou restructuration (−20 %)
```

```
pression_concurrentielle(das) = normalise( nb_équipes_actives ) × (1 − barrière_vrio)

part_brute(équipe) = compétitivité(équipe) / Σ compétitivité(pool)
part_plafonnée     = min( part_brute , couverture × 1,15 )            // §6.2
part_finale        = remplissage par paliers, puis ± choc PESTEL
```

**Algorithme de remplissage par paliers.** On répartit au prorata du score ; on fige les
équipes qui butent sur leur plafond de couverture ; on redistribue leur excédent entre les
autres ; on recommence. Sans cette itération, une redistribution naïve pourrait repousser une
équipe au-dessus de son propre plafond. Convergence en au plus *n* passes.

**Marché non servi.** Si toutes les équipes butent sur leur plafond et que la somme des
plafonds reste inférieure à 100 %, le reliquat n'est **pas** redistribué de force : c'est un
marché que personne n'a su atteindre, faute de distribution. Il est journalisé en
`unserved_share` et constitue un signal de débriefing puissant — *« collectivement, vous avez
laissé 12 % du marché sur la table »*.

**Vérification obligatoire post-calcul** :
`Σ part_finale(équipes du pool) + unserved_share = 1,000 ± 1e−6`, par DAS et par pool.
Toute résolution violant cette invariante est rejetée avant écriture — jamais de résolution
partielle.

**Exception Océan Bleu** : l'équipe est retirée du pool pendant 2 tours (marché considéré
vierge), sa part est calculée sur un marché propre, et sa marge est multipliée par 2,5 en cas
de succès. La renormalisation du pool s'opère sur les équipes restantes.

---

## 9. Compte de produits et charges

```
  Chiffre d'affaires             = volume_vendu × prix_unitaire
− Marges distributeurs           = CA × marge_distributeur_moyenne
─────────────────────────────────
= CA net
− Coût des ventes                = volume_vendu × coût_unitaire_variable
─────────────────────────────────
= Marge brute
  × (1 + prime_marge_IA)         ← doc 01 §7.2, ±8 %
− Charges de personnel           = effectif × salaire_moyen × 12 × (1 + charges_patronales)
− Marketing
− Recherche & développement
− Charges de structure           × facteur_synergie   ← doc 01 §7.3
− Coûts fixes de production      + surcoût de sous-absorption
− Études de conseil achetées
─────────────────────────────────
= EBITDA
− Dotations aux amortissements   = CAPEX amorti linéairement sur 5 tours
─────────────────────────────────
= Résultat d'exploitation (EBIT)
− Charges financières            = dette × ( taux_BAM + marge_de_risque )
─────────────────────────────────
= Résultat avant impôt
− Impôt sur les sociétés
─────────────────────────────────
= Résultat net
```

### 9.1 Marge de risque sur la dette

```
levier = dette_totale / capitaux_propres
marge_de_risque = 0,015 + 0,020 × clamp( levier , 0 , 3 )
```
De +1,5 point (sans dette) à +7,5 points (levier 3). **S'endetter devient progressivement plus
cher** — la banque n'est pas un distributeur automatique.

### 9.2 Impôt sur les sociétés (barème marocain)

```
taux = résultat_fiscal > 100 000 000 MAD
     ? ( régime = banque_assurance ? 0,40 : 0,35 )
     : 0,20

IS = max( résultat_fiscal × taux ,
          CA × 0,0025 ,                    // cotisation minimale
          3 000 MAD )                       // plancher
```
Une équipe déficitaire paie quand même la cotisation minimale. Les paramètres fiscaux vivent
dans `engine_parameters` et doivent être **revérifiés avant chaque session** — les taux
changent par loi de finances.

### 9.3 Investisseurs : attractivité, levée et dividende

La levée de fonds propres et le dividende existaient sans interlocuteur : le dividende n'était
qu'une sortie de trésorerie, la levée un robinet à 2 % de frais quelle que soit la santé du
Groupe. Le moteur calcule désormais, à chaque résolution, un **indice d'attractivité** (`0–100`,
`src/lib/engine/investors.ts`) qui fixe au tour suivant le coût et le plafond d'une levée, et la
prime de risque bancaire.

Cinq composantes, pondérées (`investors.weight.*`) :

| Composante | Ce qu'elle juge |
|---|---|
| Rentabilité | rendement des capitaux propres d'ouverture, contre le coût des fonds propres |
| Croissance | évolution du chiffre d'affaires |
| Solidité | endettement et palier de détresse de trésorerie |
| Distribution | dividende rapporté au résultat distribuable, jugé selon le profil de l'équipe — une entreprise qui croît vite et rentablement est pardonnée de tout réinvestir, une entreprise mûre est attendue au guichet ; une **baisse** du dividende est toujours sanctionnée |
| Cohérence | l'indice d'alignement (§15) : un investisseur finance une histoire qu'il comprend |

```
score_brut = Σ( poids × note_composante ) / Σ( poids )
score      = score_précédent === null ? score_brut
           : (1 − mémoire) × score_brut + mémoire × score_précédent      // investors.memory = 0,4
```

Les investisseurs ont de la mémoire : une bonne année ne fait pas oublier trois mauvaises.

**Ce que l'indice fixe, au tour SUIVANT** (jamais le même tour : une levée se négocie sur la
réputation qu'on a, pas sur celle qu'on espère) :

```
manque   = clamp( (seuil − score) / seuil , 0 , 1 )                      // investors.issue_discount_threshold
frais_pct = frais_de_base + décote_max × manque^1,3                      // finance.equity_issue_cost_pct, investors.issue_discount_max
plafond   = fonds_propres_ouverture × ( plafond_min + (plafond_max − plafond_min) × score/100 )
prime_taux = investors.rate_span × (50 − score) / 50                     // points, appliqués à la marge de risque §9.1
```

Un Groupe en perte, surendetté et incohérent lève donc plus cher, moins, et emprunte plus cher —
un Groupe qui tient les trois est récompensé sur les trois à la fois. Avant la première
résolution, aucune opinion n'est formée : frais de base, plafond calé sur une attractivité
neutre, aucune prime.

---

## 10. Trésorerie

```
trésorerie_fin = trésorerie_début
               + résultat_net
               + dotations_aux_amortissements        // charge non décaissée
               − CAPEX du tour
               − variation_du_BFR
               + tirage_de_dette − remboursement
               ± flux de cession de DAS
```

### 10.1 Besoin en fonds de roulement

```
BFR = CA × ( jours_bfr / 360 )                       // jours_bfr ≈ 45 à 90 selon le DAS
variation_BFR = BFR(t) − BFR(t−1)
```
> **La croissance consomme du cash.** Une équipe qui double son chiffre d'affaires immobilise
> davantage de stocks et de créances : elle peut être bénéficiaire et à court de trésorerie.
> C'est la leçon financière la plus utile du jeu, et elle n'existait pas en v1.

### 10.2 Paliers de détresse

Progressifs, jamais couperet :

| Tours consécutifs négatifs | Statut | Effet |
|---|---|---|
| 0 | `sain` | — |
| 1 | `surveillance` | −10 % de compétitivité au tour suivant ; accès au marché de cession signalé |
| 2 | `restructuration` | −20 % de compétitivité ; CAPEX plafonné ; cession d'un DAS fortement incitée |
| 3+ | `liquidation` | l'équipe sort du pool ; ses DAS sont mis en vente automatiquement |

À chaque palier, le facilitateur est alerté et peut offrir une étude ou déclencher une
opportunité ciblée. **Une équipe ne doit jamais passer deux heures à regarder les autres jouer.**

---

## 11. Valorisation d'un DAS pour cession

```
si EBITDA_das > 0 :
    valeur_base = EBITDA_das × multiple_sectoriel × ( 1 + 2 × croissance_das )
sinon :
    valeur_base = capacité × valeur_résiduelle_unitaire
                + part_de_marché × prime_de_position(das)
```

`multiple_sectoriel` ∈ [4 ; 9] selon le DAS (voir référentiel).

**Offre de l'acheteur non joueur (privée, visible du seul vendeur) :**
```
décote_urgence = 0    si sain
               = 0,15 si surveillance
               = 0,30 si restructuration ou liquidation

offre_npc = valeur_base × (1 − décote_urgence) × ( 0,85 + aléa(0 ; 0,15) )
```
Le NPC offre structurellement moins qu'un concurrent rationnel : c'est un **plancher de
liquidité**, pas une bonne affaire. Vendre au NPC, c'est renoncer à la valeur pour survivre.

**Transfert à l'acheteur :**
```
ratio_intégration = budget_intégration / ( 0,20 × prix_payé )
perte_de_valeur   = clamp( 0,45 − 0,40 × ratio_intégration , 0,05 , 0,45 )

part_de_marché_transférée = part_vendeur × (1 − perte_de_valeur)
notoriété_transférée      = notoriété_vendeur × (1 − perte_de_valeur)
qualité, capacité, effectif, climat social → transférés intégralement
```
La part perdue est redistribuée au pool. **Racheter sans budgéter l'intégration détruit
jusqu'à 45 % de ce qu'on vient de payer.**

---

## 12. Chocs PESTEL — opportunités et menaces

Déclenchés **par le facilitateur**, depuis son écran. Il n'y a pas de tirage automatique : les
deux paramètres qui le prétendaient (`pestel.shock_probability`, `pestel.shock_max_points`) ont
été retirés, faute d'être lus par quoi que ce soit.
Catalogue complet dans [`03-referentiel-das.md`](03-referentiel-das.md) §5.

Un choc porte un vecteur d'effets, appliqué sur un ou plusieurs DAS, pour une durée en tours :

| Effet | Champ | Exemple |
|---|---|---|
| Taille de marché | `market_size_pct` | sécheresse : agro-industrie −12 % |
| Coût des intrants | `input_cost_pct` | énergie : +18 % sur la construction |
| Exigence de qualité | `quality_floor` | norme obligatoire : qualité < 60 → pénalité |
| Capacité | `capacity_pct` | stress hydrique : −8 % de capacité agro |
| Coût du capital | `rate_delta` | resserrement BAM : +0,75 point |
| Redistribution de parts | `share_redistribution_pts` | jusqu'à 15 points redistribués |
| Fenêtre d'opportunité | `opportunity_window` | marché public : volume additionnel à capter |

**Réponse de l'équipe (War Room) :** chaque choc ouvre une fenêtre de réponse budgétée.
L'équipe ÉCRIT son plan et engage un budget ; le facilitateur le lit et arbitre l'ampleur avec
un curseur — 0 l'événement a été évité, 1 il s'applique tel quel, 3 il frappe trois fois plus
fort. Le budget se paie dans tous les cas, y compris si la carte s'avère bénigne : c'est le prix
de l'assurance, et c'est l'arbitrage. Le choix de *ne pas* répondre est légitime.

Il n'existe donc plus de barème d'atténuation à trois options : les six paramètres
`pestel.response_*` ont été retirés, aucun n'étant lu depuis que le jugement du facilitateur a
remplacé le menu.

---

## 13. Paramètres exposés

```
market.price_position_floor_factor      0.60
market.price_position_span              0.008
capacity.depreciation_per_round         0.06
capacity.underuse_threshold             0.70
capacity.overuse_threshold              0.95
capacity.subcontracting_multiplier      1.60
learning.rate_default                   0.85
learning.cost_floor_ratio               0.55
automation.variable_cost_reduction      0.30
automation.fixed_cost_increase          0.50
procurement.max_discount                0.18
procurement.power_volume_pivot          0.30
distribution.max_margin_reduction       0.35
distribution.coverage_headroom          1.15
quality.obsolescence_per_round          0.04
quality.rd_effect_delay_rounds          1
notoriety.decay_per_round               0.08
stockout.notoriety_penalty              12
climate.capacity_impact_weight          0.30
climate.unit_cost_penalty               0.12
climate.recruitment_shock_malus         15
climate.restructuring_malus             25
climate.training_bonus                  12
social.recruitment_shock_threshold_pct  0.20
skill.unit_cost_leverage                0.15
quality.skill_leverage                  0.50
finance.risk_margin_base                0.015
finance.risk_margin_per_leverage        0.020
finance.amortization_rounds             5
treasury.surveillance_malus             0.10
treasury.restructuring_malus            0.20
divest.integration_reference_pct        0.20
divest.value_loss_floor                 0.05
divest.value_loss_ceiling               0.45
```

---

## 14. Invariants vérifiés à chaque résolution

Une résolution qui viole l'un de ces invariants est **annulée en transaction**, journalisée,
et signalée au facilitateur. Jamais d'écriture partielle.

1. `Σ part_de_marché + part_non_servie = 1` pour chaque DAS de chaque pool (tolérance 1e−6).
2. Aucune part de marché négative ou supérieure à 1.
3. `volume_vendu ≤ capacité_effective` pour chaque équipe et chaque DAS.
4. `trésorerie_fin` reconstituée par les flux est égale à celle du bilan (tolérance 0,01 DH).
5. Tous les scores 0–100 sont effectivement dans [0, 100].
6. Chaque DAS cédé a exactement un acquéreur et un vendeur, et disparaît du portefeuille du
   vendeur au même tour où il apparaît dans celui de l'acheteur.
7. Aucune équipe liquidée ne détient de DAS actif.

---

## 15. Boucle sociale — ce que chaque décision RH finit par coûter

La chaîne, en une phrase : la demande crée une **charge de travail** ; l'effectif, la
productivité, la standardisation et l'automatisation l'absorbent ; ce qui reste — surcharge ou
sous-charge — pèse sur le **climat social** ; le climat fait la **rotation** et la
**compétence** ; et c'est par là que l'on retourne à l'économie, au tour suivant.

| Décision | Effet direct | Effet indirect, au tour suivant |
|---|---|---|
| Salaire proposé | Masse salariale | Climat → capacité effective et coût unitaire |
| Budget de formation | Trésorerie, remboursement OFPPT/GIAC | Compétence → coût unitaire, rendement de la R&D, axe d'intensité de compétence du domaine |
| Recrutement | Masse salariale, charge de travail | Climat (choc d'intégration au-delà du seuil), compétence (dilution si externe) |
| Licenciements | Indemnités en trésorerie, masse salariale | Climat, et **perte de qualité** au-delà du seuil sûr |
| Restructuration | — | Climat, à l'échelle de sa brutalité |
| Bilan de compétences | Trésorerie, concours GIAC | Rendement de la formation |
| Transferts internes | Effectif déplacé, à somme nulle | Compétence sans dilution |

```
départs_subis(t) = effectif(t−1) × taux_de_rotation(t−1)
effectif(t)      = effectif(t−1) + recrutements − licenciements
                 − transferts_sortants − départs_subis(t)
```

**Les départs ont lieu.** La rotation était calculée, bornée entre 0 et 1 par la base,
persistée, et affichée à l'équipe avec la phrase « ce sont les plus qualifiés qui partent ».
Personne ne partait jamais : un climat à 10 sur 100 laissait l'effectif intact tour après tour.
C'est le taux du tour **précédent** qui s'applique — on subit en *t+1* la démission qu'on a
provoquée en *t*. Le plancher de rotation est inclus : une entreprise irréprochable perd elle
aussi des salariés, et doit donc recruter pour tenir la même charge. C'est ce qui fait du
recrutement une décision récurrente et non un geste de croissance.

Une démission ne coûte **aucune indemnité**, et c'est précisément ce qui la rend plus insidieuse
qu'un licenciement, dont le prix se voit tout de suite.

### 15.1 Le siège doit tenir ce qu'il centralise

```
manque_de_siège       = clamp(1 − budget_siège / (masse_salariale × part_de_référence), 0, 1)
économie_de_synergie  = … × (1 − manque_de_siège)
coût_de_coordination  = … + manque_de_siège × indice_de_centralisation × coût_max
```

Couper les frais de siège était une économie **sans contrepartie**, alors qu'une équipe peut
centraliser simultanément ses achats, son informatique, sa R&D, ses RH et sa finance. Elle
déclarait cinq fonctions groupe, ne payait personne pour les tenir, et encaissait quand même
les économies d'échelle. Un service partagé qu'on ne dote pas ne produit pas d'économie : il
produit un goulot. Une équipe qui laisse le siège à sa valeur de référence ne perd rien.
