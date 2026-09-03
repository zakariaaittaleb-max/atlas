# ATLAS — Référentiel des DAS et de l'écosystème marocain

> ⚠️ **Avertissement de calibrage.** Les tailles de marché ci-dessous sont des **ordres de
> grandeur** destinés à rendre le jeu vraisemblable, pas des statistiques officielles. Elles
> doivent être **revalidées avant chaque session** contre les sources publiques (HCP, Office
> des Changes, Bank Al-Maghrib, Ministère de l'Industrie, Observatoire du Tourisme, AMDIE).
> Elles vivent en base (`strategic_units`, `engine_parameters`), jamais en dur dans le code.
>
> ⚠️ **Les acteurs de l'écosystème sont fictifs.** Fournisseurs, distributeurs, partenaires et
> cibles portent des noms inventés, plausibles dans le contexte marocain. Aucune donnée n'est
> attribuée à une entreprise réelle. C'est un choix de conception : les chiffres doivent servir
> la pédagogie et suivre des scénarios, pas prétendre décrire des sociétés existantes.

---

## 1. Les huit domaines d'activité stratégique

| # | DAS | `sector_key` | Taille (Md MAD) | Croissance | Élast. prix | Apprent. | Multiple | BFR (j) |
|---|---|---|---|---|---|---|---|---|
| 1 | Agro-industrie | `agro` | 190 | 0 % → 4 % | 2,0 | 0,88 | 5,5× | 75 |
| 2 | Construction & infrastructures | `btp` | 180 | −2 % → 9 % | 1,6 | 0,90 | 4,5× | 110 |
| 3 | Tourisme & hôtellerie | `tourisme` | 138 | 3 % → 18 % | 0,9 | 0,92 | 8,0× | 30 |
| 4 | Distribution de matériel industriel | `equipement` | 36 | 1 % → 7 % | 1,4 | 0,91 | 5,0× | 95 |
| 5 | Distribution alimentaire moderne | `retail` | 58 | 2 % → 8 % | 2,2 | 0,89 | 6,0× | 25 |
| 6 | Textile & habillement | `textile` | 48 | −3 % → 7 % | 1,9 | 0,86 | 4,0× | 85 |
| 7 | Énergies renouvelables & efficacité | `energie` | 22 | 6 % → 22 % | 1,1 | 0,87 | 9,0× | 120 |
| 8 | Services numériques & offshoring | `numerique` | 26 | 5 % → 20 % | 1,2 | 0,84 | 8,5× | 55 |

**Lecture des colonnes**
- *Croissance* : bornes du tirage aléatoire par tour, avant chocs PESTEL.
- *Élasticité prix* : sensibilité de la part de marché à l'écart au prix médian (§2.3 du doc
  économie). Le tourisme haut de gamme est peu élastique ; le retail l'est fortement.
- *Apprentissage* : taux de la courbe d'expérience. 0,84 signifie que doubler le volume cumulé
  abaisse le coût unitaire de 16 % — le numérique apprend vite, le tourisme lentement.
- *Multiple* : multiple d'EBITDA pour la valorisation en cession.
- *BFR* : jours de chiffre d'affaires immobilisés. Le BTP (110 j) étrangle la trésorerie de
  ceux qui croissent vite ; le tourisme (30 j) encaisse d'avance.

### 1.1 Fiches détaillées

#### DAS 1 — Agro-industrie
Transformation de productions agricoles : conserves, huiles, produits laitiers, céréales.
- **Segments** : `grand_public_national`, `export_europe`, `restauration_collective`,
  `premium_bio`, `industrie_agroalimentaire_b2b`
- **Facteurs clés de succès** : accès à la matière première, coût énergétique, certification
  sanitaire, relation avec la grande distribution
- **Vulnérabilité dominante** : climat. Une sécheresse compresse la marge par le haut (moins de
  volume) et par le bas (matière première plus chère).
- **Barrière VRIO** : 0,30 — les contrats d'approvisionnement historiques protègent les
  installés.
- **Capacité** : coût de 1 unité de capacité ≈ 220 DH · dépréciation 6 %/tour

#### DAS 2 — Construction & infrastructures
Bâtiment résidentiel, tertiaire, ouvrages d'art, infrastructures publiques.
- **Segments** : `logement_social`, `moyen_standing`, `haut_standing`, `tertiaire_bureaux`,
  `infrastructures_publiques`
- **Facteurs clés de succès** : accès au foncier, carnet de commandes publiques, maîtrise des
  délais, solidité financière (les paiements publics sont longs)
- **Vulnérabilité dominante** : trésorerie. Le BFR à 110 jours tue les croissances rapides.
- **Barrière VRIO** : 0,35 — la qualification aux marchés publics est longue à obtenir.
- **Note pédagogique** : c'est le DAS qui enseigne le mieux « bénéficiaire mais à court de
  cash ».

#### DAS 3 — Tourisme & hôtellerie
Hébergement, restauration, transport touristique, activités de loisir.
- **Segments** : `balneaire_international`, `culturel_medina`, `affaires_mice`,
  `tourisme_interne`, `luxe_resort`
- **Facteurs clés de succès** : notoriété et avis en ligne, emplacement, taux d'occupation,
  distribution (OTA vs direct)
- **Vulnérabilité dominante** : coûts fixes. Un hôtel vide coûte presque autant qu'un hôtel
  plein — le taux d'utilisation est l'indicateur roi.
- **Barrière VRIO** : 0,25
- **Note pédagogique** : DAS idéal pour la différenciation et le focus. Le `channel_control`
  (réservation directe vs plateformes) y est un arbitrage très concret.

#### DAS 4 — Distribution de matériel industriel
Importation et distribution d'équipements, machines-outils, pièces, maintenance.
- **Segments** : `btp_engins`, `agro_equipement`, `industrie_manufacturiere`,
  `energie_maintenance`, `pieces_detachees`
- **Facteurs clés de succès** : exclusivités constructeurs, réseau de service après-vente,
  disponibilité du stock, financement client
- **Vulnérabilité dominante** : change et stock. Le stock immobilisé est le poste critique.
- **Barrière VRIO** : 0,45 — la plus élevée. Les contrats d'exclusivité sont difficiles à
  déloger. Une équipe qui entre tard sur ce DAS le paie cher.

#### DAS 5 — Distribution alimentaire moderne
Grandes et moyennes surfaces, supérettes de proximité, e-commerce alimentaire.
- **Segments** : `hypermarche`, `supermarche_urbain`, `proximite_quartier`,
  `cash_and_carry_b2b`, `e_commerce`
- **Facteurs clés de succès** : densité du maillage, pouvoir d'achat sur les fournisseurs,
  rotation des stocks, marque propre
- **Vulnérabilité dominante** : marge très fine, volume indispensable.
- **Barrière VRIO** : 0,20
- **Note pédagogique** : proximité 0,80 avec l'agro-industrie. C'est le couple qui démontre
  l'intégration verticale aval et la diversification liée.

#### DAS 6 — Textile & habillement
Confection, fast fashion, tissage, sous-traitance export.
- **Segments** : `sous_traitance_export`, `marque_nationale`, `uniformes_b2b`,
  `textile_technique`, `e_commerce_mode`
- **Facteurs clés de succès** : réactivité (délai de réassort), coût de main-d'œuvre,
  proximité du marché européen, conformité sociale et environnementale
- **Vulnérabilité dominante** : concurrence par les coûts venue d'Asie ; exposition
  réglementaire européenne.
- **Barrière VRIO** : 0,15 — la plus basse. Marché très ouvert, entrée facile, guerre de prix.
- **Note pédagogique** : le DAS où la domination par les coûts est la plus tentante et la plus
  destructrice de valeur si mal exécutée.

#### DAS 7 — Énergies renouvelables & efficacité énergétique
Solaire, éolien, efficacité énergétique industrielle, stockage.
- **Segments** : `solaire_utilitaire`, `solaire_decentralise`, `eolien`,
  `efficacite_industrielle`, `services_energetiques`
- **Facteurs clés de succès** : capacité d'investissement, accès au financement long,
  compétences d'ingénierie, relation avec le régulateur
- **Vulnérabilité dominante** : intensité capitalistique. BFR 120 jours, CAPEX massif,
  retour lent.
- **Barrière VRIO** : 0,40
- **Note pédagogique** : DAS « dilemme » par excellence — forte croissance, forte
  consommation de cash. Idéal pour enseigner l'arbitrage BCG.

#### DAS 8 — Services numériques & offshoring
Développement logiciel, centres de services, BPO, intégration, cybersécurité.
- **Segments** : `bpo_relation_client`, `ingenierie_logicielle`, `integration_si`,
  `cloud_infrastructure`, `cybersecurite`
- **Facteurs clés de succès** : disponibilité des talents, taux de rotation du personnel,
  références clients, maîtrise linguistique
- **Vulnérabilité dominante** : les ressources humaines *sont* l'actif. Un climat social
  dégradé se traduit immédiatement en perte de capacité.
- **Barrière VRIO** : 0,20
- **Particularité moteur** : `capacité = effectif × productivité`. Le CAPEX capacité y est
  quasi nul, le recrutement y remplace l'investissement. **C'est le seul DAS où la RH est le
  levier de production principal** — cela oblige les équipes à comprendre que la « capacité »
  n'a pas la même nature selon le métier.

---

## 2. Segments de marché

Chaque DAS expose 5 segments. Une équipe choisit ceux qu'elle sert. Chaque segment porte :
`part_du_marché`, `sensibilité_prix`, `exigence_qualité`, `croissance_relative`.

Servir un segment de plus élargit le marché adressable mais **dilue** la cohérence d'une
stratégie de focus (axe B9 du doc alignement) et impose de satisfaire une exigence de qualité
parfois contradictoire.

**Contrainte d'exigence** : si `qualité_perçue < exigence_qualité(segment)`, la part de marché
de l'équipe **sur ce segment** est divisée par deux. On ne vend pas du haut de gamme avec un
produit moyen — quel que soit le budget marketing.

---

## 3. Les douze régions

`tanger_tetouan_al_hoceima` · `oriental` · `fes_meknes` · `rabat_sale_kenitra` ·
`beni_mellal_khenifra` · `casablanca_settat` · `marrakech_safi` · `draa_tafilalet` ·
`souss_massa` · `guelmim_oued_noun` · `laayoune_sakia_el_hamra` · `dakhla_oued_ed_dahab`

Chaque région porte un `poids_de_marché` par DAS. Exemples de profils :
- Casablanca-Settat concentre l'industrie, la finance et la distribution moderne.
- Marrakech-Safi et Souss-Massa pèsent lourd dans le tourisme.
- Tanger-Tétouan concentre le textile export et la logistique.
- Les régions du Sud pèsent dans l'énergie renouvelable et la pêche.
- Béni Mellal-Khénifra et Fès-Meknès pèsent dans l'agro-industrie.

**Effet de jeu** : la couverture de distribution se calcule région par région. Une équipe très
présente à Casablanca et absente ailleurs plafonne sa part de marché nationale, même avec le
meilleur score de compétitivité (doc économie §6.2).

---

## 4. Matrice de proximité sectorielle

Proximité 0–100, moyenne pondérée de cinq dimensions : **clients** (0,25), **canaux** (0,25),
**technologies** (0,20), **fournisseurs** (0,15), **compétences** (0,15).
Elle pilote les synergies et les coûts de coordination (doc alignement §7.3).

| | agro | btp | tour. | équip. | retail | textile | énergie | num. |
|---|---|---|---|---|---|---|---|---|
| **agro** | — | 12 | 28 | 35 | **80** | 22 | 25 | 20 |
| **btp** | 12 | — | 38 | **62** | 10 | 8 | **55** | 18 |
| **tourisme** | 28 | 38 | — | 12 | 42 | 20 | 22 | 35 |
| **équipement** | 35 | **62** | 12 | — | 25 | 40 | 48 | 22 |
| **retail** | **80** | 10 | 42 | 25 | — | **52** | 12 | 30 |
| **textile** | 22 | 8 | 20 | 40 | **52** | — | 10 | 18 |
| **énergie** | 25 | **55** | 22 | 48 | 12 | 10 | — | 32 |
| **numérique** | 20 | 18 | 35 | 22 | 30 | 18 | 32 | — |

**Couples remarquables à faire découvrir aux étudiants**
- `agro ↔ retail` (80) : intégration verticale aval évidente, synergies fortes.
- `btp ↔ équipement` (62) : le distributeur d'engins et le constructeur partagent clients et
  compétences techniques.
- `btp ↔ énergie` (55) : ingénierie, chantiers, relation au donneur d'ordre public.
- `retail ↔ textile` (52) : mêmes canaux, mêmes emplacements, mêmes clients.
- `btp ↔ textile` (8) : le contre-exemple. Mutualiser ces deux-là ne produit que de la
  coordination stérile — et le moteur le facture.

---

## 5. Écosystème — modèle d'acteur

```
ecosystem_actors
  type              fournisseur | distributeur | partenaire_techno | sous_traitant
                    | cible_acquisition | concurrent_npc
  das_id            DAS de rattachement
  region            l'une des 12
  nom               fictif
  chiffre_affaires  MAD, évolue par scénario
  capacite          unités
  indice_prix       1,00 = prix de marché
  fiabilite         0–100
  contribution_qualite  0–100
  couverture        0–100 (distributeurs)
  marge_requise     % du prix de vente (distributeurs)
  force_negociation 0–100
  volume_minimum    unités
  cout_changement   0–100
  sante_financiere  0–100
  appetence_cession 0–100  (probabilité d'accepter une offre)
  multiple_valo     multiple d'EBITDA si cible
```

### 5.1 Archétypes de fournisseurs

| Archétype | Indice prix | Fiabilité | Qualité | Coût de changement | Le piège |
|---|---|---|---|---|---|
| **Le discounter** | 0,80 | 45 | 40 | 20 | ruptures fréquentes, qualité qui plombe |
| **Le régional fiable** | 0,98 | 78 | 65 | 45 | correct partout, décisif nulle part |
| **Le champion qualité** | 1,25 | 92 | 90 | 70 | excellent et cher, et il le sait |
| **Le géant captif** | 0,92 | 85 | 72 | **85** | bon marché, mais on ne peut plus en sortir |
| **Le nouvel entrant** | 0,85 | 55 | 70 | 15 | prometteur, capacité limitée |

### 5.2 Archétypes de distributeurs

| Archétype | Couverture | Marge requise | Force de négo. | Volume min. |
|---|---|---|---|---|
| **Grande surface nationale** | 65 % | 28 % | **88** | très élevé |
| **Grossiste régional** | 30 % | 16 % | 45 | moyen |
| **Réseau de proximité** | 22 % | 20 % | 30 | faible |
| **Plateforme e-commerce** | 45 % | 22 % | 72 | faible |
| **Réseau propre** | croissant | **0 %** | — | — (CAPEX) |

> La grande surface nationale offre la meilleure couverture et prend la marge la plus lourde,
> avec un rapport de force écrasant. C'est la 5-forces de Porter rendue palpable : **le
> pouvoir de l'acheteur**. La seule contre-mesure est la notoriété — ou son propre réseau.

### 5.3 Exemples nommés *(fictifs)*

| Nom | Type | DAS | Région | Profil |
|---|---|---|---|---|
| Coopérative Doukkala Verte | fournisseur | agro | Casablanca-Settat | régional fiable |
| Semences Atlas Sud | fournisseur | agro | Souss-Massa | champion qualité |
| Cimenterie Bouregreg | fournisseur | btp | Rabat-Salé-Kénitra | géant captif |
| Aciers du Détroit | fournisseur | btp | Tanger-Tétouan | discounter |
| Filature Saïss Industries | fournisseur | textile | Fès-Meknès | nouvel entrant |
| Groupe Marjane Al Wafa | distributeur | retail | national | grande surface nationale |
| Comptoir Anfa Distribution | distributeur | agro | Casablanca-Settat | grossiste régional |
| Souk Digital SA | distributeur | retail | national | plateforme e-commerce |
| Ingelec Maghreb | partenaire_techno | énergie | Casablanca-Settat | partenaire technologique |
| Riad Collection Holding | cible_acquisition | tourisme | Marrakech-Safi | cible, appétence 70 |
| Transfo Loukkos | cible_acquisition | agro | Tanger-Tétouan | cible, appétence 45 |

Le jeu de données complet — environ 110 acteurs — est généré au provisioning de la session
(`supabase/seed/ecosystem.ts`) à partir de ces archétypes, avec des variations aléatoires
bornées et un nom tiré d'un dictionnaire de toponymes et de racines marocaines.

### 5.4 Scénarios d'évolution

Les chiffres des acteurs ne sont pas figés : chaque acteur suit une **trajectoire** tirée au
provisioning, révélée progressivement par les études du cabinet.

| Trajectoire | Évolution | Signal détectable dans les études |
|---|---|---|
| `croissance_stable` | CA +4 à +8 %/tour, fiabilité stable | rien de notable |
| `montee_en_puissance` | CA +15 %/tour, capacité +20 %, prix qui monte | capacité en hausse dès T1 |
| `declin_silencieux` | CA −8 %/tour, **fiabilité −10 pts/tour** | santé financière qui s'érode |
| `tension_capacitaire` | demande > capacité, indice prix +12 %/tour | capacité saturée |
| `cible_opportune` | santé financière basse, appétence de cession qui monte | multiple qui baisse |
| `choc_exogene` | rupture brutale au tour tiré | rien — c'est le principe |

> **Le `declin_silencieux` est la trajectoire pédagogique clé.** Une équipe qui achète l'étude
> fournisseurs voit la santé financière se dégrader et peut changer de fournisseur à temps.
> Une équipe qui ne l'achète pas subit une rupture d'approvisionnement au tour 4 sans avoir
> rien vu venir. **C'est ce qui justifie de dépenser 120 000 DH en information.**

---

## 6. Catalogue des chocs PESTEL

Déclenchés par le facilitateur (ou automatiquement). Chaque carte porte une source
réglementaire ou institutionnelle réelle, pour l'ancrage pédagogique.

### Politique
| Carte | Cible | Effet | Durée |
|---|---|---|---|
| Programme d'infrastructures majeur | btp, équipement, énergie | marché +18 %, fenêtre d'appel d'offres | 3 tours |
| Nouvelle loi de finances — incitations à l'investissement | tous | CAPEX déductible +, IS effectif − | 2 tours |
| Accord commercial régional élargi | textile, agro | marché export +12 %, concurrence import + | permanent |
| Priorité nationale à la souveraineté alimentaire | agro | subvention CAPEX, contrainte d'approvisionnement local | 3 tours |
| Décentralisation des marchés publics régionaux | btp, énergie | avantage aux équipes couvrant les régions du Sud | 2 tours |

### Économique
| Carte | Cible | Effet | Durée |
|---|---|---|---|
| Resserrement monétaire (Bank Al-Maghrib) | tous | taux directeur +0,75 pt | 2 tours |
| Détente monétaire | tous | taux directeur −0,50 pt | 2 tours |
| Flambée des prix de l'énergie | agro, btp, textile | coût intrants +18 % | 2 tours |
| Ralentissement de la demande européenne | textile, agro, numérique | marché export −15 % | 2 tours |
| Élargissement de la bande de flottement du dirham | équipement, textile | coût des imports +7 %, exports + | 3 tours |
| Reprise des transferts de la diaspora | retail, btp, tourisme | marché +9 % | 1 tour |

### Socioculturel
| Carte | Cible | Effet | Durée |
|---|---|---|---|
| Grand événement sportif international | tourisme, btp, retail | tourisme +25 %, btp +15 % | 3 tours |
| Bascule vers la consommation de marque propre | retail, agro | avantage aux bas prix, différenciation érodée | 2 tours |
| Tension sociale sectorielle | textile, agro, numérique | climat social −15, revendication salariale | 1 tour |
| Montée de l'exigence sanitaire | agro, retail | plancher de qualité à 60 | permanent |
| Pénurie de compétences numériques | numérique | salaire moyen +18 %, rotation du personnel + | 3 tours |

### Technologique
| Carte | Cible | Effet | Durée |
|---|---|---|---|
| Automatisation accessible | agro, textile, btp | coût de l'automatisation −25 % | permanent |
| Bascule du commerce vers le numérique | retail, textile, tourisme | canal e-commerce +20 pts de couverture | permanent |
| Rupture technologique sectorielle | équipement, énergie | qualité des équipes sans R&D −15 | 2 tours |
| Interopérabilité des paiements | retail, tourisme, numérique | BFR −15 jours | permanent |

### Écologique
| Carte | Cible | Effet | Durée |
|---|---|---|---|
| **Sécheresse sévère** | agro | marché −12 %, coût intrants +22 %, capacité −8 % | 2 tours |
| Stress hydrique et quotas industriels | agro, textile, énergie | capacité −10 %, CAPEX de mise aux normes | 3 tours |
| Mécanisme carbone à l'import (UE) | textile, agro, équipement | export −10 % sauf si automatisation ≥ 60 | permanent |
| Appel d'offres solaire de grande envergure | énergie, btp | marché +30 %, exigence de capacité | 2 tours |
| Épisode climatique extrême régional | btp, tourisme, agro | capacité régionale −20 % | 1 tour |

### Légal
| Carte | Cible | Effet | Durée |
|---|---|---|---|
| Revalorisation du SMIG | tous | plancher salarial +6 %, climat social +5 | permanent |
| Renforcement du droit du travail | tous | indemnités de restructuration ×1,5 | permanent |
| Norme qualité sectorielle obligatoire | agro, équipement, énergie | plancher qualité 65, CAPEX de mise en conformité | permanent |
| Contrôle des concentrations renforcé | tous | seuil de notification abaissé, délai +1 tour | permanent |
| Encadrement des délais de paiement | btp, équipement | BFR −20 jours, pénalités de retard | permanent |
| Fiscalité verte sur les procédés | agro, btp, textile | surtaxe si automatisation < 40 | 3 tours |

### 6.1 Réponse aux chocs (War Room)

Chaque carte ouvre une fenêtre de réponse. L'équipe choisit :

| Réponse | Coût | Effet |
|---|---|---|
| **Ignorer** | 0 | effet plein |
| **Atténuer** | modéré | effet réduit de 40 % |
| **Absorber** | élevé | effet réduit de 75 % |
| **Retourner** | très élevé | effet neutralisé + avantage relatif si les concurrents subissent |

« Retourner » n'est possible que si l'équipe dispose des prérequis (trésorerie, capacité,
alignement suffisant). C'est le mouvement qui transforme une menace en opportunité — rare,
cher, et mémorable au débriefing.

---

## 7. Dotation initiale (T0)

**Strictement identique pour toutes les équipes.** Aucune modulation, aucune asymétrie de
départ, y compris par le facilitateur.

C'est une décision de conception, pas un défaut de paramétrage : si les écarts de fin de partie
doivent enseigner quelque chose, ils doivent provenir **entièrement** des décisions prises en
salle. Une dotation asymétrique donnerait à l'équipe perdante l'argument imparable — *« on
était moins bien dotés »* — et ruinerait le débriefing, qui est le vrai livrable pédagogique
de l'atelier.

### 7.1 Une dotation dérivée, jamais absolue

Les montants se **calculent** à partir du marché du DAS et du nombre d'équipes du pool.
Une version antérieure de ce document fixait 45 M DH de trésorerie et 12 % de part de marché
en dur. Une sonde sur une résolution complète a montré que c'était intenable : sur un pool de
trois équipes, chacune subissait **70 % de rupture d'approvisionnement dès le premier tour**,
et un DAS de 22 Md DH était doté exactement comme un DAS de 190 Md DH.

```
volume_marché      = taille_marché_DAS / prix_référence
capacité_initiale  = volume_marché / nb_équipes_du_pool × 0,95
CA_de_départ       = capacité_initiale × prix_référence

trésorerie         = CA_de_départ × 2,5 / 12          // ≈ 2,5 mois de CA
capitaux_propres   = CA_de_départ × 0,45
dette              = capitaux_propres × 0,25          // levier 0,25
BFR_initial        = CA_de_départ × jours_bfr / 360
effectif           = capacité_initiale / 14 000       // unités produites par personne
```

**Le facteur 0,95** rend la capacité légèrement rare dès le tour 1 : l'investissement compte
immédiatement, sans provoquer une rupture dont personne n'est responsable.

**Le BFR initial doit être doté**, et non laissé à zéro : sinon le tour 1 fait apparaître un
besoin de financement fictif de plusieurs dizaines de millions, imputé à des décisions que
personne n'a prises.

**Le volume cumulé de départ égale la capacité initiale** : c'est l'origine de la courbe
d'expérience, ce qui garantit que toutes les équipes démarrent exactement au coût de référence
du DAS.

### 7.2 Valeurs fixes, communes à tous les DAS

| Poste | Valeur |
|---|---|
| DAS actif à T0 | 1, imposé par le pool |
| Salaire brut moyen | 5 800 DH |
| Part des experts et cadres | 20 % |
| Qualité / Notoriété | 50 / 50 |
| Climat social | 70 |
| Indice d'alignement | 70 |

*Implémentation : `src/lib/engine/endowment.ts`. La fonction ne prend aucun identifiant
d'équipe en argument — l'asymétrie de dotation est impossible par construction.*

Le seul écart admis entre équipes à T0 est le **DAS d'affectation**, imposé par la composition
des pools. Deux équipes d'un même pool démarrent donc exactement au même point.

Les paramètres de dotation vivent dans `engine_parameters` sous le préfixe `endowment.` et
sont appliqués uniformément au provisioning : il n'existe pas de champ de dotation par équipe
dans le schéma, ce qui rend l'asymétrie impossible par construction plutôt que par discipline.
