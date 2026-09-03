set search_path = atlas, public, extensions;

-- =============================================================================
-- ATLAS — Migration 0013 : finance et RH PAR DAS, difficulté, cartes sur mesure
-- =============================================================================
--
-- Quatre chantiers dans une seule migration parce qu'ils partagent un sujet :
-- ce que le facilitateur règle AVANT la séance, et ce que les équipes pilotent
-- domaine par domaine plutôt qu'en bloc au niveau du groupe.
--
-- ── POURQUOI PAR DAS ────────────────────────────────────────────────────────
-- Une conserverie et une société de services n'ont ni la même pyramide, ni la
-- même productivité, ni la même sensibilité à la formation. Un effectif unique
-- au niveau du groupe revenait à demander une seule politique salariale pour
-- des métiers qui n'ont rien en commun. Même raisonnement pour le compte de
-- résultat : comparer ses domaines entre eux exige de les mesurer séparément.
-- =============================================================================

-- --- 1. COMPTE DE RÉSULTAT PAR DAS ------------------------------------------
create table das_pnl (
  id                    uuid primary key default extensions.gen_random_uuid(),
  team_id               uuid not null references teams(id) on delete cascade,
  das_id                uuid not null references strategic_units(id) on delete cascade,
  round_number          smallint not null,

  revenue_mad           numeric not null default 0,
  total_costs_mad       numeric not null default 0,
  variable_costs_mad    numeric not null default 0,
  fixed_costs_mad       numeric not null default 0,
  payroll_mad           numeric not null default 0,
  marketing_mad         numeric not null default 0,
  rd_mad                numeric not null default 0,
  channel_cost_mad      numeric not null default 0,
  operating_income_mad  numeric not null default 0,
  net_income_mad        numeric not null default 0,

  capital_employed_mad  numeric not null default 0,
  investment_mad        numeric not null default 0,
  cash_generated_mad    numeric not null default 0,

  -- Les notions que le public sait lire : ce qui reste sur 100 DH vendus, ce
  -- que rapportent les capitaux immobilisés, à partir de quel volume on gagne.
  profit_margin_pct     numeric,
  roi_pct               numeric,
  cost_per_revenue_pct  numeric,
  break_even_units      numeric,

  created_at            timestamptz not null default now(),
  unique (team_id, das_id, round_number)
);
create index on das_pnl (team_id, round_number);

-- --- 2. RESSOURCES HUMAINES PAR DAS -----------------------------------------
create table das_hr_decisions (
  id                    uuid primary key default extensions.gen_random_uuid(),
  team_id               uuid not null references teams(id) on delete cascade,
  das_id                uuid not null references strategic_units(id) on delete cascade,
  round_number          smallint not null,

  hire_operateurs       int not null default 0 check (hire_operateurs >= 0),
  hire_techniciens      int not null default 0 check (hire_techniciens >= 0),
  hire_experts          int not null default 0 check (hire_experts >= 0),
  hire_cadres           int not null default 0 check (hire_cadres >= 0),
  layoffs               int not null default 0 check (layoffs >= 0),
  -- Le marché interne : recruter dans un autre DAS du groupe ne dilue pas le
  -- niveau moyen, contrairement à un recrutement externe.
  internal_transfers_in int not null default 0 check (internal_transfers_in >= 0),

  avg_salary_brut_mad   numeric not null default 5800,

  training_budget_mad   numeric not null default 0 check (training_budget_mad >= 0),
  training_focus        text not null default 'technique'
    check (training_focus in ('technique','management','qualite','polyvalence')),
  -- Contrats Spéciaux de Formation : remboursent une part, plafonnée au droit
  -- de tirage (1,6 % de la masse salariale).
  claim_ofppt           boolean not null default false,
  -- Le GIAC finance l'INGÉNIERIE de formation, pas la formation : d'où le
  -- conditionnement au bilan de compétences, appliqué côté serveur.
  claim_giac            boolean not null default false,

  order_skills_audit    boolean not null default false,
  restructuring         text not null default 'aucune'
    check (restructuring in ('aucune','reorganisation','externalisation','fermeture_site')),

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (team_id, das_id, round_number)
);
create index on das_hr_decisions (team_id, round_number);

create table das_hr_state (
  id                    uuid primary key default extensions.gen_random_uuid(),
  team_id               uuid not null references teams(id) on delete cascade,
  das_id                uuid not null references strategic_units(id) on delete cascade,
  round_number          smallint not null,

  headcount             int not null default 0,
  climat_social         numeric check (climat_social between 0 and 100),
  productivity          numeric,
  standardisation_level numeric check (standardisation_level between 0 and 100),
  automation_level      numeric check (automation_level between 0 and 100),
  turnover_rate         numeric check (turnover_rate between 0 and 1),
  payroll_mad           numeric not null default 0,
  -- 100 = l'effectif absorbe exactement la demande. Au-delà, on tient par
  -- l'usure ; en deçà, on paie des gens à attendre. Les deux coûtent.
  workload_index        numeric,
  overstaffing_pct      numeric,
  skill_index           numeric check (skill_index between 0 and 100),
  severance_paid_mad    numeric not null default 0,
  subsidies_mad         numeric not null default 0,

  created_at            timestamptz not null default now(),
  unique (team_id, das_id, round_number)
);
create index on das_hr_state (team_id, round_number);

-- --- 3. NIVEAU DE DIFFICULTÉ ------------------------------------------------
--
-- `difficulty_locked` bascule à la PREMIÈRE résolution : changer le niveau en
-- cours de partie casserait la comparabilité entre tours, qui est tout
-- l'intérêt d'une simulation en plusieurs exercices.
alter table game_sessions
  add column if not exists difficulty text not null default 'standard'
    check (difficulty in ('decouverte','standard','exigeant','sur_mesure')),
  add column if not exists difficulty_dials jsonb not null default '{}'::jsonb,
  add column if not exists difficulty_locked boolean not null default false;

-- --- 4. CARTES CRÉÉES PAR LE FACILITATEUR -----------------------------------
--
-- `session_id` nul = carte du catalogue commun ; renseigné = carte composée
-- pour cette session-là.
alter table shock_cards
  add column if not exists session_id uuid references game_sessions(id) on delete cascade,
  add column if not exists created_by uuid;

-- --- 5. VERROUILLAGE --------------------------------------------------------
alter table das_pnl          enable row level security;
alter table das_hr_decisions enable row level security;
alter table das_hr_state     enable row level security;

-- Les états sont en LECTURE SEULE : ils sont écrits par la résolution sous
-- `service_role`, qui n'est pas soumis à la RLS. Ne pas créer de politique
-- d'écriture est le point — une équipe ne se note pas elle-même.
create policy das_pnl_read on das_pnl
  for select to authenticated
  using (team_id in (select team_id from team_members where user_id = auth.uid()));

create policy das_hr_decisions_team on das_hr_decisions
  for all to authenticated
  using (team_id in (select team_id from team_members where user_id = auth.uid()))
  with check (team_id in (select team_id from team_members where user_id = auth.uid()));

create policy das_hr_state_read on das_hr_state
  for select to authenticated
  using (team_id in (select team_id from team_members where user_id = auth.uid()));

grant select                          on das_pnl          to authenticated;
grant select, insert, update, delete  on das_hr_decisions to authenticated;
grant select                          on das_hr_state     to authenticated;
