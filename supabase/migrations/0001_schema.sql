-- =============================================================================
-- ATLAS — Simulateur de Stratégie d'Entreprise (Maroc)
-- Migration 0001 — Schéma complet
--
-- Conventions :
--   * tous les montants sont en MAD (entier ou numeric), suffixés _mad
--   * tous les scores sont 0–100 sauf mention contraire
--   * les vocabulaires fermés sont des text + check (et non des enums) pour
--     rester modifiables sans migration lourde entre deux promotions
--   * aucune valeur de calibrage n'est en dur : tout vit dans engine_parameters
-- =============================================================================

-- pgcrypto est installée dans le schéma `extensions` par 0000_namespace.sql.

-- =============================================================================
-- SECTION 1 — SESSION, ÉQUIPES, ACCÈS
-- =============================================================================

-- Atlas vit dans un schéma dédié : le projet Supabase héberge plusieurs
-- applications, et des noms aussi génériques que `teams` ou `regions`
-- entreraient en collision dans `public`. Voir 0000_namespace.sql.
set search_path = atlas, public, extensions;

create table game_sessions (
  id                    uuid primary key default extensions.gen_random_uuid(),
  name                  text not null,
  facilitator_id        uuid not null references auth.users(id),
  status                text not null default 'draft'
    check (status in ('draft','onboarding','round_active','round_locked',
                      'round_resolving','round_resolved','completed')),
  current_round         smallint not null default 0,        -- 0 = T0 onboarding
  planned_rounds        smallint not null default 3,        -- indicatif, affiché aux équipes
  max_rounds            smallint not null default 10
                          check (max_rounds between 3 and 10),
  round_started_at      timestamptz,
  round_soft_deadline   timestamptz,                        -- chronomètre indicatif, non bloquant
  currency              char(3) not null default 'MAD',
  join_code             text unique not null,               -- code de session
  created_at            timestamptz not null default now(),
  constraint current_round_within_bounds check (current_round between 0 and max_rounds)
);

create table teams (
  id            uuid primary key default extensions.gen_random_uuid(),
  session_id    uuid not null references game_sessions(id) on delete cascade,
  name          text not null,
  pool_id       uuid,                                        -- FK ajoutée après market_pools
  join_code     text not null,
  is_liquidated boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (session_id, join_code),
  unique (session_id, name)
);

-- Le rôle est un libellé pédagogique : il n'ouvre AUCUN droit d'écriture
-- particulier. Tout membre d'une équipe peut saisir toutes les décisions.
create table team_members (
  id            uuid primary key default extensions.gen_random_uuid(),
  team_id       uuid not null references teams(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  display_role  text not null default 'dg'
    check (display_role in ('dg','daf','dcm','dt','drh','membre')),
  created_at    timestamptz not null default now(),
  unique (team_id, user_id)
);

create table session_spectators (
  id          uuid primary key default extensions.gen_random_uuid(),
  session_id  uuid not null references game_sessions(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (session_id, user_id)
);

-- =============================================================================
-- SECTION 2 — MARCHÉS, DAS, POOLS, SEGMENTS
-- =============================================================================

create table regions (
  key   text primary key,
  name  text not null
);

insert into regions (key, name) values
  ('tanger_tetouan_al_hoceima', 'Tanger-Tétouan-Al Hoceïma'),
  ('oriental',                  'L''Oriental'),
  ('fes_meknes',                'Fès-Meknès'),
  ('rabat_sale_kenitra',        'Rabat-Salé-Kénitra'),
  ('beni_mellal_khenifra',      'Béni Mellal-Khénifra'),
  ('casablanca_settat',         'Casablanca-Settat'),
  ('marrakech_safi',            'Marrakech-Safi'),
  ('draa_tafilalet',            'Drâa-Tafilalet'),
  ('souss_massa',               'Souss-Massa'),
  ('guelmim_oued_noun',         'Guelmim-Oued Noun'),
  ('laayoune_sakia_el_hamra',   'Laâyoune-Sakia El Hamra'),
  ('dakhla_oued_ed_dahab',      'Dakhla-Oued Ed-Dahab');

create table strategic_units (
  id                      uuid primary key default extensions.gen_random_uuid(),
  session_id              uuid not null references game_sessions(id) on delete cascade,
  name                    text not null,
  sector_key              text not null,
  -- Le stade BCG est stocké pour le moteur et le débriefing formateur,
  -- mais N'EST JAMAIS exposé aux équipes : elles doivent le déduire elles-mêmes.
  bcg_stage               text check (bcg_stage in ('vache_a_lait','star','dilemme','poids_mort')),
  base_market_size_mad    numeric not null,
  reference_unit_price_mad numeric not null,
  growth_rate_min         numeric not null,
  growth_rate_max         numeric not null,
  price_elasticity        numeric not null default 1.5,
  learning_rate           numeric not null default 0.88
                            check (learning_rate between 0.70 and 0.99),
  valuation_multiple      numeric not null default 5.0,
  working_capital_days    smallint not null default 60,
  vrio_entry_barrier      numeric not null default 0.20 check (vrio_entry_barrier between 0 and 1),
  unit_capacity_cost_mad  numeric not null default 220,
  capacity_depreciation   numeric not null default 0.06,
  reference_unit_cost_mad numeric not null,
  fixed_cost_base_mad     numeric not null default 0,
  -- Le numérique produit avec des personnes, pas des machines : le moteur
  -- dérive alors la capacité de l'effectif au lieu du CAPEX.
  capacity_from_headcount boolean not null default false,
  headcount_productivity  numeric,
  created_at              timestamptz not null default now(),
  unique (session_id, sector_key)
);

create table market_segments (
  id                  uuid primary key default extensions.gen_random_uuid(),
  das_id              uuid not null references strategic_units(id) on delete cascade,
  segment_key         text not null,
  name                text not null,
  market_share_pct    numeric not null check (market_share_pct between 0 and 1),
  price_sensitivity   numeric not null default 1.0,
  quality_requirement numeric not null default 0 check (quality_requirement between 0 and 100),
  relative_growth     numeric not null default 1.0,
  unique (das_id, segment_key)
);

create table das_region_weights (
  das_id      uuid not null references strategic_units(id) on delete cascade,
  region_key  text not null references regions(key),
  weight      numeric not null check (weight between 0 and 1),
  primary key (das_id, region_key)
);

-- Proximité sectorielle : pilote synergies et coûts de coordination (doc 01 §7.3)
create table sector_proximity (
  session_id  uuid not null references game_sessions(id) on delete cascade,
  sector_a    text not null,
  sector_b    text not null,
  proximity   numeric not null check (proximity between 0 and 100),
  primary key (session_id, sector_a, sector_b)
);

-- Un pool est une LIGUE d'équipes, pas un marché.
--
-- La concurrence à somme nulle se joue par (pool, DAS) : au sein d'une même
-- ligue, toutes les équipes actives sur un DAS se partagent 100 % de ce marché.
-- Deux pools simulent des marchés parallèles indépendants — c'est ce qui permet
-- de faire tourner plusieurs salles sans qu'elles interfèrent.
--
-- Rattacher un pool à un seul DAS (comme envisagé initialement) rendait le jeu
-- incohérent dès qu'une équipe activait un second DAS : elle n'aurait plus eu
-- d'adversaire défini sur celui-ci.
create table market_pools (
  id          uuid primary key default extensions.gen_random_uuid(),
  session_id  uuid not null references game_sessions(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  unique (session_id, name)
);

alter table teams
  add constraint fk_teams_pool foreign key (pool_id) references market_pools(id);

-- =============================================================================
-- SECTION 3 — ÉCOSYSTÈME (fournisseurs, distributeurs, partenaires, cibles)
-- =============================================================================

create table ecosystem_actors (
  id                    uuid primary key default extensions.gen_random_uuid(),
  session_id            uuid not null references game_sessions(id) on delete cascade,
  das_id                uuid references strategic_units(id) on delete cascade,
  actor_type            text not null
    check (actor_type in ('fournisseur','distributeur','partenaire_techno',
                          'sous_traitant','cible_acquisition','concurrent_npc')),
  name                  text not null,          -- fictif, généré au provisioning
  region_key            text references regions(key),
  archetype             text,                   -- discounter, champion_qualite, ...
  scenario              text not null default 'croissance_stable'
    check (scenario in ('croissance_stable','montee_en_puissance','declin_silencieux',
                        'tension_capacitaire','cible_opportune','choc_exogene')),
  scenario_trigger_round smallint,              -- pour choc_exogene
  created_at            timestamptz not null default now()
);

-- Les chiffres d'un acteur évoluent par tour selon son scénario.
-- Les équipes ne les découvrent qu'en achetant l'étude correspondante.
create table ecosystem_actor_rounds (
  id                    uuid primary key default extensions.gen_random_uuid(),
  actor_id              uuid not null references ecosystem_actors(id) on delete cascade,
  round_number          smallint not null,
  revenue_mad           numeric,
  capacity_units        numeric,
  price_index           numeric default 1.00,
  reliability           numeric check (reliability between 0 and 100),
  quality_contribution  numeric check (quality_contribution between 0 and 100),
  coverage_pct          numeric check (coverage_pct between 0 and 1),
  required_margin_pct   numeric check (required_margin_pct between 0 and 1),
  service_level         numeric check (service_level between 0 and 100),
  negotiating_strength  numeric check (negotiating_strength between 0 and 100),
  minimum_volume        numeric default 0,
  switching_cost        numeric default 0 check (switching_cost between 0 and 100),
  financial_health      numeric check (financial_health between 0 and 100),
  divest_appetite       numeric check (divest_appetite between 0 and 100),
  unique (actor_id, round_number)
);

create index on ecosystem_actor_rounds (actor_id, round_number);

-- =============================================================================
-- SECTION 4 — PORTEFEUILLE ET DÉCLARATIONS STRATÉGIQUES
-- =============================================================================

create table team_units (
  id                        uuid primary key default extensions.gen_random_uuid(),
  team_id                   uuid not null references teams(id) on delete cascade,
  das_id                    uuid not null references strategic_units(id) on delete cascade,
  launched_round            smallint not null,
  ansoff_movement           text check (ansoff_movement in
                              ('penetration','developpement_marche',
                               'developpement_produit','diversification')),
  ansoff_risk_coefficient   numeric not null default 0 check (ansoff_risk_coefficient between 0 and 1),
  blue_ocean                boolean not null default false,
  blue_ocean_rounds_left    smallint not null default 0,
  status                    text not null default 'active'
                              check (status in ('active','listed_for_sale','sold','exited')),
  acquired_from_team_id     uuid references teams(id),
  created_at                timestamptz not null default now(),
  unique (team_id, das_id)
);

-- Déclaration corporate d'une équipe pour un tour (le « je dis ce que je fais »)
create table team_round_strategy (
  id                      uuid primary key default extensions.gen_random_uuid(),
  team_id                 uuid not null references teams(id) on delete cascade,
  round_number            smallint not null,
  corporate_strategy      text not null
    check (corporate_strategy in ('specialisation','integration_verticale',
                                  'diversification_liee','diversification_conglomerale')),
  structure_type          text not null
    check (structure_type in ('fonctionnelle','divisionnelle','matricielle')),
  structure_transition_cost_mad numeric not null default 0,
  -- Fonctions centralisées : alimente centralisation_index (doc 01 §5.2)
  central_purchasing      boolean not null default false,
  central_it              boolean not null default false,
  central_rd              boolean not null default false,
  central_hr              boolean not null default false,
  central_finance         boolean not null default true,
  -- Mutualisation effective déclarée : alimente shared_resources_index (§5.3)
  shared_production       boolean not null default false,
  shared_rd               boolean not null default false,
  -- Exactement deux valeurs communiquées (§5.4)
  value_1                 text not null check (value_1 in
    ('excellence_produit','innovation','proximite_client','accessibilite_prix',
     'efficience_operationnelle','responsabilite_sociale','ancrage_territorial','fiabilite_service')),
  value_2                 text not null check (value_2 in
    ('excellence_produit','innovation','proximite_client','accessibilite_prix',
     'efficience_operationnelle','responsabilite_sociale','ancrage_territorial','fiabilite_service')),
  created_at              timestamptz not null default now(),
  unique (team_id, round_number),
  constraint distinct_values check (value_1 <> value_2)
);

-- Déclaration + décisions au niveau d'un DAS pour un tour
create table das_decisions (
  id                      uuid primary key default extensions.gen_random_uuid(),
  team_id                 uuid not null references teams(id) on delete cascade,
  das_id                  uuid not null references strategic_units(id) on delete cascade,
  round_number            smallint not null,
  generic_strategy        text not null
    check (generic_strategy in ('domination_couts','differenciation',
                                'focus_couts','focus_differenciation')),
  price_position          numeric not null default 50 check (price_position between 0 and 100),
  served_segments         text[] not null default '{}',
  capex_capacity_mad      numeric not null default 0 check (capex_capacity_mad >= 0),
  capex_automation_mad    numeric not null default 0 check (capex_automation_mad >= 0),
  capex_own_network_mad   numeric not null default 0 check (capex_own_network_mad >= 0),
  rd_budget_mad           numeric not null default 0 check (rd_budget_mad >= 0),
  marketing_budget_mad    numeric not null default 0 check (marketing_budget_mad >= 0),
  declare_blue_ocean      boolean not null default false,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (team_id, das_id, round_number),
  constraint at_least_one_segment check (cardinality(served_segments) >= 1)
);

create table procurement_contracts (
  id                uuid primary key default extensions.gen_random_uuid(),
  team_id           uuid not null references teams(id) on delete cascade,
  das_id            uuid not null references strategic_units(id) on delete cascade,
  round_number      smallint not null,
  supplier_id       uuid not null references ecosystem_actors(id),
  committed_volume  numeric not null check (committed_volume >= 0),
  -- calculés par le moteur (doc 02 §5)
  bargaining_power  numeric,
  discount_obtained numeric,
  effective_price   numeric,
  supply_disruption numeric,
  created_at        timestamptz not null default now(),
  unique (team_id, das_id, round_number, supplier_id)
);

create table distribution_contracts (
  id                    uuid primary key default extensions.gen_random_uuid(),
  team_id               uuid not null references teams(id) on delete cascade,
  das_id                uuid not null references strategic_units(id) on delete cascade,
  round_number          smallint not null,
  distributor_id        uuid not null references ecosystem_actors(id),
  volume_share          numeric not null check (volume_share between 0 and 1),
  -- calculés par le moteur (doc 02 §6)
  bargaining_power      numeric,
  effective_margin_pct  numeric,
  coverage_contributed  numeric,
  created_at            timestamptz not null default now(),
  unique (team_id, das_id, round_number, distributor_id)
);

-- =============================================================================
-- SECTION 5 — RH ET FINANCE
-- =============================================================================

create table hr_metrics (
  id                      uuid primary key default extensions.gen_random_uuid(),
  team_id                 uuid not null references teams(id) on delete cascade,
  round_number            smallint not null,
  headcount_start         int not null,
  -- Recrutement par profil : alimente talent_mix (C7) et skill_intensity (B8)
  hire_operateurs         int not null default 0 check (hire_operateurs >= 0),
  hire_techniciens        int not null default 0 check (hire_techniciens >= 0),
  hire_experts            int not null default 0 check (hire_experts >= 0),
  hire_cadres             int not null default 0 check (hire_cadres >= 0),
  avg_salary_brut_mad     numeric not null default 5800,
  training_budget_mad     numeric not null default 0 check (training_budget_mad >= 0),
  restructuring_count     int not null default 0 check (restructuring_count >= 0),
  severance_paid_mad      numeric not null default 0,
  -- calculés
  headcount_end           int,
  expert_share            numeric,
  climat_social_delta     numeric,
  created_at              timestamptz not null default now(),
  unique (team_id, round_number)
);

-- Le plancher SMIG n'est PAS une contrainte de colonne : il vit dans
-- engine_parameters et est validé côté serveur, car il change par décret.
create table financial_budgets (
  id                    uuid primary key default extensions.gen_random_uuid(),
  team_id               uuid not null references teams(id) on delete cascade,
  round_number          smallint not null,
  opex_mad              numeric not null default 0 check (opex_mad >= 0),
  debt_drawn_mad        numeric not null default 0 check (debt_drawn_mad >= 0),
  debt_repaid_mad       numeric not null default 0 check (debt_repaid_mad >= 0),
  tax_regime            text not null default 'droit_commun'
    check (tax_regime in ('droit_commun','cfc_zai','banque_assurance')),
  treasury_start_mad    numeric not null,
  equity_mad            numeric not null,
  debt_outstanding_mad  numeric not null default 0,
  created_at            timestamptz not null default now(),
  unique (team_id, round_number)
);

-- =============================================================================
-- SECTION 6 — CABINET DE CONSEIL (la donnée s'achète)
-- =============================================================================

-- Chaque étude existe en trois paliers. Le prix n'achète pas l'ACCÈS à
-- l'information, il achète sa PRÉCISION : la note express livre des
-- estimations bruitées, des bandes au lieu de valeurs, et omet les signaux
-- faibles. Voir src/lib/engine/consulting.ts.
create table consulting_studies (
  key             text primary key,
  name            text not null,
  description     text,
  base_price_mad  numeric not null,
  scope           text not null check (scope in ('das','session','team'))
);

insert into consulting_studies (key, name, base_price_mad, scope, description) values
  ('pestel_sectoriel', 'Étude sectorielle PESTEL',      150000, 'das',
   'Taille, croissance, indicateurs macro et réglementation par DAS et par région'),
  ('concurrentielle',  'Étude concurrentielle',          250000, 'das',
   'Indicateurs agrégés des concurrents du pool, concentration, barrières'),
  ('panel_conso',      'Panel consommateurs',            200000, 'das',
   'Qualité perçue, notoriété, sensibilité prix par segment'),
  ('benchmark_fourn',  'Benchmark fournisseurs',         120000, 'das',
   'Capacité, fiabilité, indice prix et santé financière des fournisseurs'),
  ('benchmark_distri', 'Benchmark distributeurs',        120000, 'das',
   'Couverture régionale, marge exigée, volume minimal, pouvoir de négociation'),
  ('audit_alignement', 'Audit d''alignement stratégique',180000, 'team',
   'Décomposition axe par axe du tour écoulé, diagnostic et recommandations'),
  ('due_diligence',    'Due diligence',                  300000, 'das',
   'Dossier complet sur une cible de cession ou d''intégration');

create table consulting_orders (
  id              uuid primary key default extensions.gen_random_uuid(),
  team_id         uuid not null references teams(id) on delete cascade,
  round_number    smallint not null,
  study_key       text not null references consulting_studies(key),
  tier            text not null default 'standard'
                    check (tier in ('express','standard','approfondie')),
  das_id          uuid references strategic_units(id),
  target_actor_id uuid references ecosystem_actors(id),
  price_paid_mad  numeric not null,
  -- Marge d'erreur annoncée à l'équipe, pour que le livrable reste honnête :
  -- on vend une estimation en disant qu'elle en est une.
  error_margin    numeric not null,
  gifted_by_facilitator boolean not null default false,
  -- Livrable figé à la commande. Une équipe doit pouvoir relire au tour 5 ce
  -- qu'elle a acheté au tour 2, avec les mêmes chiffres — y compris s'ils
  -- étaient faux. C'est la matière du débriefing.
  payload         jsonb,
  file_url        text,                  -- .xlsx dans Supabase Storage
  ordered_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  -- Racheter la même étude au même palier redonne les mêmes chiffres
  -- (déterminisme du bruit) : on empêche donc la dépense inutile en amont
  -- plutôt que de laisser une équipe payer deux fois pour rien.
  --
  -- `nulls not distinct` est indispensable ici : l'audit d'alignement a un
  -- das_id nul, et sans cette clause Postgres considérerait deux NULL comme
  -- différents — la contrainte ne protégerait rien sur les études de portée
  -- « équipe ». Requiert Postgres 15+.
  unique nulls not distinct (team_id, round_number, study_key, tier, das_id, target_actor_id)
);

create index on consulting_orders (team_id, round_number);

-- =============================================================================
-- SECTION 7 — MARCHÉ DE CESSION DE DAS
-- =============================================================================

create table das_listings (
  id                uuid primary key default extensions.gen_random_uuid(),
  session_id        uuid not null references game_sessions(id) on delete cascade,
  seller_team_id    uuid not null references teams(id) on delete cascade,
  das_id            uuid not null references strategic_units(id) on delete cascade,
  round_number      smallint not null,
  -- Offre de l'acheteur non joueur : PRIVÉE, visible du seul vendeur (RLS)
  npc_offer_mad     numeric,
  npc_offer_seed    numeric,
  -- Fiche publique limitée présentée aux autres équipes du pool
  public_snapshot   jsonb not null,
  status            text not null default 'open'
    check (status in ('open','withdrawn','sold_to_npc','sold_to_team','expired')),
  created_at        timestamptz not null default now(),
  unique (seller_team_id, das_id, round_number)
);

-- Offres scellées : aucune équipe ne voit les offres des autres avant résolution
create table das_bids (
  id                    uuid primary key default extensions.gen_random_uuid(),
  listing_id            uuid not null references das_listings(id) on delete cascade,
  bidder_team_id        uuid not null references teams(id) on delete cascade,
  round_number          smallint not null,
  offer_mad             numeric not null check (offer_mad > 0),
  integration_budget_mad numeric not null default 0 check (integration_budget_mad >= 0),
  status                text not null default 'sealed'
    check (status in ('sealed','won','lost','withdrawn')),
  created_at            timestamptz not null default now(),
  unique (listing_id, bidder_team_id)
);

create table das_transfers (
  id                    uuid primary key default extensions.gen_random_uuid(),
  listing_id            uuid not null references das_listings(id),
  round_number          smallint not null,
  seller_team_id        uuid not null references teams(id),
  buyer_team_id         uuid references teams(id),        -- null = acheteur non joueur
  das_id                uuid not null references strategic_units(id),
  price_mad             numeric not null,
  integration_ratio     numeric,
  value_loss_pct        numeric,
  market_share_transferred numeric,
  created_at            timestamptz not null default now()
);

-- Réservé à la phase 5 (M&A inter-entreprises et intégrations)
create table ma_operations (
  id                      uuid primary key default extensions.gen_random_uuid(),
  session_id              uuid not null references game_sessions(id) on delete cascade,
  round_number            smallint not null,
  acquirer_team_id        uuid references teams(id),
  target_team_id          uuid references teams(id),
  target_actor_id         uuid references ecosystem_actors(id),
  integration_type        text check (integration_type in
                            ('verticale_amont','verticale_aval','horizontale','conglomerale')),
  operation_type          text check (operation_type in ('acquisition','jv')),
  offer_price_mad         numeric,
  integration_budget_mad  numeric not null default 0,
  notification_required   boolean,
  notification_delay_rounds smallint not null default 1,
  failure_probability     numeric,
  status                  text not null default 'proposed'
    check (status in ('proposed','pending_notification','approved','failed','rejected')),
  created_at              timestamptz not null default now()
);

-- =============================================================================
-- SECTION 8 — CHOCS PESTEL ET RÉPONSES
-- =============================================================================

create table shock_cards (
  key                 text primary key,
  pestel_dimension    text not null
    check (pestel_dimension in ('politique','economique','socioculturel',
                                'technologique','ecologique','legal')),
  name                text not null,
  description         text not null,
  nature              text not null check (nature in ('opportunite','menace')),
  target_sectors      text[] not null default '{}',   -- vide = tous les DAS
  effects             jsonb not null,                  -- vecteur d'effets, cf. doc 02 §12
  duration_rounds     smallint not null default 1,     -- 0 = permanent
  source_reference    text
);

create table market_shocks (
  id                    uuid primary key default extensions.gen_random_uuid(),
  session_id            uuid not null references game_sessions(id) on delete cascade,
  card_key              text references shock_cards(key),
  das_id                uuid references strategic_units(id),
  pool_id               uuid references market_pools(id),
  round_number          smallint not null,
  triggered_by          text not null default 'facilitator'
                          check (triggered_by in ('facilitator','automatic')),
  effects               jsonb not null,       -- copie figée, éventuellement modulée
  rounds_remaining      smallint not null default 1,
  share_redistribution_pts numeric default 0,
  created_at            timestamptz not null default now()
);

create table shock_responses (
  id            uuid primary key default extensions.gen_random_uuid(),
  shock_id      uuid not null references market_shocks(id) on delete cascade,
  team_id       uuid not null references teams(id) on delete cascade,
  round_number  smallint not null,
  response      text not null
    check (response in ('ignorer','attenuer','absorber','retourner')),
  cost_mad      numeric not null default 0,
  effectiveness numeric,                      -- calculé par le moteur
  created_at    timestamptz not null default now(),
  unique (shock_id, team_id)
);

-- =============================================================================
-- SECTION 9 — RÉSULTATS CALCULÉS PAR LE MOTEUR
-- =============================================================================

-- Trace de chaque exécution du moteur : indispensable pour diagnostiquer
-- une résolution refusée sur violation d'invariant (doc 02 §14).
create table resolution_runs (
  id            uuid primary key default extensions.gen_random_uuid(),
  session_id    uuid not null references game_sessions(id) on delete cascade,
  round_number  smallint not null,
  status        text not null check (status in ('running','succeeded','failed')),
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  duration_ms   int,
  invariant_failures jsonb,
  error_message text,
  triggered_by  uuid references auth.users(id)
);

create table team_round_state (
  id                                uuid primary key default extensions.gen_random_uuid(),
  team_id                           uuid not null references teams(id) on delete cascade,
  round_number                      smallint not null,
  climat_social                     numeric not null default 70 check (climat_social between 0 and 100),
  ia_score                          numeric not null default 70 check (ia_score between 0 and 100),
  headcount                         int,
  centralisation_index              numeric,
  shared_resources_index            numeric,
  portfolio_relatedness             numeric,
  vertical_integration              numeric,
  talent_mix                        numeric,
  synergy_saving_pct                numeric,
  coordination_cost_pct             numeric,
  margin_premium_pct                numeric,
  consecutive_negative_treasury_rounds smallint not null default 0,
  treasury_status                   text not null default 'sain'
    check (treasury_status in ('sain','surveillance','restructuration','liquidation')),
  created_at                        timestamptz not null default now(),
  unique (team_id, round_number)
);

create table team_das_round_metrics (
  id                      uuid primary key default extensions.gen_random_uuid(),
  team_id                 uuid not null references teams(id) on delete cascade,
  das_id                  uuid not null references strategic_units(id) on delete cascade,
  round_number            smallint not null,
  -- état produit
  quality                 numeric check (quality between 0 and 100),
  perceived_quality       numeric check (perceived_quality between 0 and 100),
  notoriety               numeric check (notoriety between 0 and 100),
  input_quality           numeric,
  -- prix et compétitivité
  price_position          numeric,
  unit_price_mad          numeric,
  price_competitiveness   numeric,
  competitive_pressure    numeric,
  competitiveness_score   numeric,
  -- capacité et volumes
  capacity_units          numeric,
  effective_capacity_units numeric,
  volume_demanded         numeric,
  volume_sold             numeric,
  volume_lost             numeric,
  stockout_rate           numeric,
  utilisation_rate        numeric,
  cumulative_volume       numeric,
  -- coûts
  unit_variable_cost_mad  numeric,
  fixed_cost_mad          numeric,
  underabsorption_mad     numeric,
  automation_level        numeric,
  -- canal
  distribution_coverage   numeric,
  avg_distributor_margin  numeric,
  channel_control         numeric,
  -- marché
  market_size_mad         numeric,
  raw_share               numeric,
  market_share_pct        numeric check (market_share_pct between 0 and 1),
  revenue_mad             numeric,
  gross_margin_mad        numeric,
  ebitda_mad              numeric,
  -- alignement de ce DAS
  -- `ia_score` est RECOPIÉ depuis `alignment_scores`, table strictement privée :
  -- c'est la seule voie par laquelle l'indice d'alignement atteint la projection
  -- de pool `pool_reveal` (migration 0006), sans ouvrir le reste.
  ia_score                numeric,
  sab_score               numeric,
  best_fit_strategy       text,
  best_fit_score          numeric,
  created_at              timestamptz not null default now(),
  unique (team_id, das_id, round_number)
);

create index on team_das_round_metrics (das_id, round_number);

create table pnl_statements (
  id                        uuid primary key default extensions.gen_random_uuid(),
  team_id                   uuid not null references teams(id) on delete cascade,
  round_number              smallint not null,
  revenue_mad               numeric not null default 0,
  distributor_margin_mad    numeric not null default 0,
  net_revenue_mad           numeric not null default 0,
  cogs_mad                  numeric not null default 0,
  gross_margin_mad          numeric not null default 0,
  payroll_mad               numeric not null default 0,
  marketing_mad             numeric not null default 0,
  rd_mad                    numeric not null default 0,
  overhead_mad              numeric not null default 0,
  fixed_production_mad      numeric not null default 0,
  consulting_mad            numeric not null default 0,
  ebitda_mad                numeric not null default 0,
  depreciation_mad          numeric not null default 0,
  ebit_mad                  numeric not null default 0,
  interest_mad              numeric not null default 0,
  pretax_income_mad         numeric not null default 0,
  corporate_tax_mad         numeric not null default 0,
  net_income_mad            numeric not null default 0,
  -- trésorerie
  working_capital_mad       numeric not null default 0,
  working_capital_change_mad numeric not null default 0,
  capex_mad                 numeric not null default 0,
  treasury_start_mad        numeric not null default 0,
  treasury_end_mad          numeric not null default 0,
  effective_tax_rate        numeric,
  leverage_ratio            numeric,
  risk_margin               numeric,
  created_at                timestamptz not null default now(),
  unique (team_id, round_number)
);

-- Scores d'alignement : la synthèse (doc 01 §6)
create table alignment_scores (
  id                    uuid primary key default extensions.gen_random_uuid(),
  team_id               uuid not null references teams(id) on delete cascade,
  round_number          smallint not null,
  sab_global            numeric,
  sac_score             numeric,
  sat_score             numeric,
  ia_raw                numeric,
  ia_final              numeric check (ia_final between 0 and 100),
  stuck_in_the_middle   boolean not null default false,
  strategic_drift       boolean not null default false,
  drift_declared        text,
  drift_actual          text,
  categorical_penalties jsonb,      -- liste nommée des pénalités déclenchées
  created_at            timestamptz not null default now(),
  unique (team_id, round_number)
);

-- Détail axe par axe : matière première du rapport d'audit (doc 01 §8)
create table alignment_axis_details (
  id            uuid primary key default extensions.gen_random_uuid(),
  team_id       uuid not null references teams(id) on delete cascade,
  das_id        uuid references strategic_units(id) on delete cascade,  -- null = axe corporate
  round_number  smallint not null,
  level         text not null check (level in ('business','corporate')),
  axis_key      text not null,
  observed      numeric not null,
  target        numeric not null,
  gap           numeric not null,
  weight        numeric not null,
  penalty_pts   numeric not null,
  created_at    timestamptz not null default now()
);

create index on alignment_axis_details (team_id, round_number);

create table treasury_alerts (
  id                  uuid primary key default extensions.gen_random_uuid(),
  team_id             uuid not null references teams(id) on delete cascade,
  round_number        smallint not null,
  treasury_value_mad  numeric not null,
  status              text not null check (status in ('surveillance','restructuration','liquidation')),
  acknowledged_at     timestamptz,
  created_at          timestamptz not null default now()
);

create table balanced_scorecards (
  id              uuid primary key default extensions.gen_random_uuid(),
  team_id         uuid not null references teams(id) on delete cascade,
  round_number    smallint not null,
  financial_score numeric,
  client_score    numeric,
  process_score   numeric,
  learning_score  numeric,
  global_score    numeric,
  created_at      timestamptz not null default now(),
  unique (team_id, round_number)
);

-- =============================================================================
-- SECTION 10 — JOURNAL, PARAMÈTRES, EXPORTS
-- =============================================================================

create table decisions_log (
  id            uuid primary key default extensions.gen_random_uuid(),
  team_id       uuid not null references teams(id) on delete cascade,
  round_number  smallint not null,
  decision_type text not null,
  payload       jsonb not null,
  decided_by    uuid references auth.users(id),
  created_at    timestamptz not null default now()
);

create index on decisions_log (team_id, round_number);

create table engine_parameters (
  id          uuid primary key default extensions.gen_random_uuid(),
  session_id  uuid not null references game_sessions(id) on delete cascade,
  key         text not null,
  value       numeric not null,
  description text,
  unique (session_id, key)
);

create table exports_log (
  id            uuid primary key default extensions.gen_random_uuid(),
  session_id    uuid not null references game_sessions(id) on delete cascade,
  team_id       uuid references teams(id) on delete cascade,
  round_number  smallint,
  export_type   text not null
    check (export_type in ('dossier_initial','etude','resultats_tour','classement_pool','session_complete')),
  file_url      text,
  requested_by  uuid references auth.users(id),
  created_at    timestamptz not null default now()
);

-- =============================================================================
-- SECTION 11 — FONCTIONS D'AIDE POUR LA RLS
-- =============================================================================

create or replace function atlas_team_ids()
returns setof uuid
language sql stable security definer set search_path = atlas, public as $$
  select team_id from team_members where user_id = auth.uid()
$$;

create or replace function atlas_is_facilitator(p_session_id uuid)
returns boolean
language sql stable security definer set search_path = atlas, public as $$
  select exists (
    select 1 from game_sessions
    where id = p_session_id and facilitator_id = auth.uid()
  )
$$;

create or replace function atlas_team_session(p_team_id uuid)
returns uuid
language sql stable security definer set search_path = atlas, public as $$
  select session_id from teams where id = p_team_id
$$;

create or replace function atlas_pool_ids()
returns setof uuid
language sql stable security definer set search_path = atlas, public as $$
  select distinct pool_id from teams
  where id in (select team_id from team_members where user_id = auth.uid())
    and pool_id is not null
$$;

-- =============================================================================
-- SECTION 12 — ROW LEVEL SECURITY
--
-- Principe directeur : les DÉCISIONS d'une équipe ne sont jamais lisibles par
-- une autre équipe, à aucun moment, même après la fin de la session. Seuls les
-- RÉSULTATS AGRÉGÉS deviennent visibles au pool après résolution.
-- =============================================================================

alter table teams                   enable row level security;
alter table team_members            enable row level security;
alter table team_units              enable row level security;
alter table team_round_strategy     enable row level security;
alter table das_decisions           enable row level security;
alter table procurement_contracts   enable row level security;
alter table distribution_contracts  enable row level security;
alter table hr_metrics              enable row level security;
alter table financial_budgets       enable row level security;
alter table consulting_orders       enable row level security;
alter table decisions_log           enable row level security;
alter table das_listings            enable row level security;
alter table das_bids                enable row level security;
alter table shock_responses         enable row level security;
alter table team_round_state        enable row level security;
alter table team_das_round_metrics  enable row level security;
alter table pnl_statements          enable row level security;
alter table alignment_scores        enable row level security;
alter table alignment_axis_details  enable row level security;
alter table treasury_alerts         enable row level security;
alter table balanced_scorecards     enable row level security;
alter table exports_log             enable row level security;

-- --- Décisions et données privées : lecture/écriture par l'équipe seule -------
-- (le facilitateur y accède via la clé service_role, jamais via une policy)

create policy team_private_rw on team_round_strategy
  for all using (team_id in (select atlas_team_ids()))
  with check   (team_id in (select atlas_team_ids()));

create policy team_private_rw on das_decisions
  for all using (team_id in (select atlas_team_ids()))
  with check   (team_id in (select atlas_team_ids()));

create policy team_private_rw on procurement_contracts
  for all using (team_id in (select atlas_team_ids()))
  with check   (team_id in (select atlas_team_ids()));

create policy team_private_rw on distribution_contracts
  for all using (team_id in (select atlas_team_ids()))
  with check   (team_id in (select atlas_team_ids()));

create policy team_private_rw on hr_metrics
  for all using (team_id in (select atlas_team_ids()))
  with check   (team_id in (select atlas_team_ids()));

create policy team_private_rw on financial_budgets
  for all using (team_id in (select atlas_team_ids()))
  with check   (team_id in (select atlas_team_ids()));

create policy team_private_rw on consulting_orders
  for all using (team_id in (select atlas_team_ids()))
  with check   (team_id in (select atlas_team_ids()));

create policy team_private_rw on decisions_log
  for all using (team_id in (select atlas_team_ids()))
  with check   (team_id in (select atlas_team_ids()));

create policy team_private_rw on shock_responses
  for all using (team_id in (select atlas_team_ids()))
  with check   (team_id in (select atlas_team_ids()));

create policy team_private_rw on team_units
  for all using (team_id in (select atlas_team_ids()))
  with check   (team_id in (select atlas_team_ids()));

-- --- Résultats privés de l'équipe : lecture seule (écriture par le moteur) ----

create policy team_reads_own on pnl_statements
  for select using (team_id in (select atlas_team_ids()));

create policy team_reads_own on alignment_scores
  for select using (team_id in (select atlas_team_ids()));

create policy team_reads_own on alignment_axis_details
  for select using (team_id in (select atlas_team_ids()));

create policy team_reads_own on treasury_alerts
  for select using (team_id in (select atlas_team_ids()));

create policy team_reads_own on team_round_state
  for select using (team_id in (select atlas_team_ids()));

create policy team_reads_own on exports_log
  for select using (team_id in (select atlas_team_ids()));

-- --- Résultats agrégés : visibles au pool APRÈS résolution --------------------

create policy pool_reads_resolved_metrics on team_das_round_metrics
  for select using (
    team_id in (select atlas_team_ids())
    or exists (
      select 1
      from teams t
      join game_sessions s on s.id = t.session_id
      where t.id = team_das_round_metrics.team_id
        and t.pool_id in (select atlas_pool_ids())
        and s.status in ('round_resolved','completed')
        and team_das_round_metrics.round_number < s.current_round
             + case when s.status = 'completed' then 1 else 0 end
    )
  );

create policy pool_reads_resolved_bsc on balanced_scorecards
  for select using (
    team_id in (select atlas_team_ids())
    or exists (
      select 1 from teams t
      join game_sessions s on s.id = t.session_id
      where t.id = balanced_scorecards.team_id
        and t.pool_id in (select atlas_pool_ids())
        and s.status in ('round_resolved','completed')
    )
  );

-- --- Marché de cession : la fiche publique oui, l'offre du NPC non ------------
-- npc_offer_mad n'est JAMAIS exposé aux autres équipes : l'application lit le
-- marché via la vue das_listings_public, qui ne contient pas la colonne.

create policy seller_full_access on das_listings
  for all using (seller_team_id in (select atlas_team_ids()))
  with check   (seller_team_id in (select atlas_team_ids()));

create policy pool_reads_open_listings on das_listings
  for select using (
    status = 'open'
    and exists (
      select 1 from teams t
      where t.id = das_listings.seller_team_id
        and t.pool_id in (select atlas_pool_ids())
    )
  );

-- Offres scellées : un enchérisseur ne voit que la sienne ; le vendeur ne voit
-- rien avant la résolution (le moteur dénoue en service_role).
create policy bidder_own_bid on das_bids
  for all using (bidder_team_id in (select atlas_team_ids()))
  with check   (bidder_team_id in (select atlas_team_ids()));

-- --- Équipes et membres : visibilité du pool, sans détail -------------------

create policy read_teams_in_session on teams
  for select using (
    id in (select atlas_team_ids())
    or session_id in (select atlas_team_session(t) from unnest(array(select atlas_team_ids())) t)
  );

create policy read_own_membership on team_members
  for select using (team_id in (select atlas_team_ids()));

-- =============================================================================
-- SECTION 13 — VUES
-- =============================================================================

-- Fiche publique d'un DAS en vente : strictement ce que les concurrents voient.
-- L'offre du NPC est physiquement absente de la vue.
-- `security_invoker` est INDISPENSABLE : sans lui, une vue s'exécute avec les
-- droits de son PROPRIÉTAIRE et CONTOURNE la RLS des tables sous-jacentes.
-- `das_listings_public` exposerait alors toutes les annonces à tout le monde.
create view das_listings_public with (security_invoker = true) as
select
  l.id,
  l.session_id,
  l.das_id,
  l.round_number,
  l.status,
  l.public_snapshot,
  l.created_at
from das_listings l
where l.status = 'open';

-- Classement de pool, exposé au projecteur et aux équipes après résolution.
create view pool_standings with (security_invoker = true) as
select
  t.pool_id,
  m.round_number,
  t.id   as team_id,
  t.name as team_name,
  m.das_id,
  m.market_share_pct,
  m.revenue_mad,
  m.competitiveness_score
from team_das_round_metrics m
join teams t on t.id = m.team_id;

-- =============================================================================
-- SECTION 14 — REALTIME
-- =============================================================================

alter publication supabase_realtime add table atlas.game_sessions;
alter publication supabase_realtime add table atlas.market_shocks;
alter publication supabase_realtime add table atlas.team_das_round_metrics;
alter publication supabase_realtime add table atlas.resolution_runs;

-- =============================================================================
-- SECTION 15 — INDEX DE CONFORT
-- =============================================================================

create index on teams (session_id);
create index on teams (pool_id);
create index on team_members (user_id);
create index on strategic_units (session_id);
create index on market_pools (session_id);
create index on ecosystem_actors (session_id, das_id, actor_type);
create index on das_decisions (team_id, round_number);
create index on team_round_state (team_id, round_number);
create index on pnl_statements (team_id, round_number);
create index on alignment_scores (team_id, round_number);
create index on market_shocks (session_id, round_number);
create index on das_listings (session_id, round_number, status);
