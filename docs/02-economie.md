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

Affiché en permanence dans le cockpit — c'est l'indicateur qui force le débat :

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

Déclenchés **par le facilitateur** (ou automatiquement selon une probabilité paramétrable).
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
Répondre coûte de la trésorerie et atténue l'effet ; ignorer laisse l'effet plein. Le choix de
*ne pas* répondre est légitime — c'est aussi un arbitrage.

---

## 13. Paramètres exposés

```
market.price_position_floor_factor      0.60
market.price_position_span              0.008
capacity.depreciation_per_round         0.06
capacity.commissioning_delay_rounds     1
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
stockout.quality_penalty                10
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
