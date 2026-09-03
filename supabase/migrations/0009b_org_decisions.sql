set search_path = atlas, public, extensions;

-- =============================================================================
-- ATLAS — Migration 0009-B : les décisions d'organisation, par DAS
-- =============================================================================

-- --- Conception organisationnelle d'un DAS ----------------------------------
create table das_org_design (
  id              uuid primary key default extensions.gen_random_uuid(),
  team_id         uuid not null references teams(id) on delete cascade,
  das_id          uuid not null references strategic_units(id) on delete cascade,
  round_number    smallint not null,

  structure_type  text not null default 'fonctionnelle'
    check (structure_type in ('fonctionnelle','divisionnelle','matricielle','processus')),

  -- 0 = toute décision remonte au sommet ; 100 = le terrain décide seul.
  -- Ni l'un ni l'autre n'est bon dans l'absolu : la domination par les coûts
  -- veut de la standardisation, la différenciation de niche veut de la
  -- réactivité. C'est la COHÉRENCE avec la stratégie qui est notée.
  delegation_level smallint not null default 50
    check (delegation_level between 0 and 100),

  -- Texte libre, JAMAIS noté numériquement : un score tiré de mots-clés serait
  -- arbitraire et les étudiants le sentiraient. Ces énoncés servent le
  -- débriefing et figurent dans l'audit et les exports.
  vision          text,
  mission         text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (team_id, das_id, round_number)
);

-- --- Les trois axes stratégiques retenus pour ce DAS ------------------------
create table das_strategic_axes (
  id            uuid primary key default extensions.gen_random_uuid(),
  team_id       uuid not null references teams(id) on delete cascade,
  das_id        uuid not null references strategic_units(id) on delete cascade,
  round_number  smallint not null,
  axis_key      text not null references strategic_axis_catalog(key),
  -- 1 à 3 : le rang pondère l'axe. Le premier axe pèse davantage que le
  -- troisième — sinon « choisir trois priorités » ne serait pas un arbitrage.
  priority      smallint not null check (priority between 1 and 3),
  unique (team_id, das_id, round_number, axis_key),
  unique (team_id, das_id, round_number, priority)
);

-- --- L'organigramme, poste par poste ----------------------------------------
create table das_positions (
  id              uuid primary key default extensions.gen_random_uuid(),
  team_id         uuid not null references teams(id) on delete cascade,
  das_id          uuid not null references strategic_units(id) on delete cascade,
  round_number    smallint not null,

  direction_key   text not null references direction_catalog(key),
  title           text not null,
  -- 1 = direction générale, 2 = directeur, 3 = manager, 4 = opérationnel.
  hierarchy_level smallint not null check (hierarchy_level between 1 and 4),
  reports_to      uuid references das_positions(id) on delete set null,

  headcount       int not null default 0 check (headcount >= 0),
  budget_mad      numeric not null default 0 check (budget_mad >= 0),

  -- Un poste CLÉ concentre l'attention et les moyens. En déclarer trop revient
  -- à n'en déclarer aucun : le moteur pénalise la dispersion.
  is_key_position boolean not null default false,

  created_at      timestamptz not null default now(),
  unique (team_id, das_id, round_number, direction_key, title)
);

create index on das_positions (team_id, das_id, round_number);

-- --- L'indicateur que chaque direction se donne -----------------------------
create table das_direction_kpis (
  id            uuid primary key default extensions.gen_random_uuid(),
  team_id       uuid not null references teams(id) on delete cascade,
  das_id        uuid not null references strategic_units(id) on delete cascade,
  round_number  smallint not null,
  direction_key text not null references direction_catalog(key),
  kpi_key       text not null references kpi_catalog(key),
  -- La cible que l'équipe s'engage à atteindre. Non contraignante pour le
  -- moteur : c'est le CHOIX de l'indicateur qui est noté, pas la promesse.
  target_value  numeric,
  unique (team_id, das_id, round_number, direction_key)
);

-- --- Répartition du budget entre directions ---------------------------------
--
-- Table distincte des postes : une direction peut recevoir un budget sans que
-- l'équipe ait détaillé son organigramme. Les deux niveaux de finesse
-- coexistent, et l'équipe choisit jusqu'où elle descend.
create table das_direction_budgets (
  id            uuid primary key default extensions.gen_random_uuid(),
  team_id       uuid not null references teams(id) on delete cascade,
  das_id        uuid not null references strategic_units(id) on delete cascade,
  round_number  smallint not null,
  direction_key text not null references direction_catalog(key),
  budget_mad    numeric not null default 0 check (budget_mad >= 0),
  unique (team_id, das_id, round_number, direction_key)
);

-- --- Ressources et technologies mutualisées entre DAS -----------------------
--
-- C'est ici que la synergie cesse d'être une déclaration d'intention. Une
-- plateforme partagée entre deux DAS proches produit des économies ; entre deux
-- métiers étrangers, elle produit surtout de la coordination.
create table shared_platforms (
  id              uuid primary key default extensions.gen_random_uuid(),
  team_id         uuid not null references teams(id) on delete cascade,
  round_number    smallint not null,
  platform_type   text not null check (platform_type in
    ('si_commun','plateforme_logistique','centre_rd','centrale_achat',
     'force_commerciale','usine_partagee','centre_services_partages','marque_ombrelle')),
  name            text not null,
  investment_mad  numeric not null default 0 check (investment_mad >= 0),
  -- Les DAS qui s'en servent réellement. Deux DAS minimum, sinon ce n'est pas
  -- une mutualisation : c'est un actif dédié.
  das_ids         uuid[] not null,
  created_at      timestamptz not null default now(),
  unique (team_id, round_number, platform_type, name),
  constraint at_least_two_das check (cardinality(das_ids) >= 2)
);

create index on shared_platforms (team_id, round_number);

-- --- RLS : tout ceci est strictement privé à l'équipe -----------------------
alter table das_org_design         enable row level security;
alter table das_strategic_axes     enable row level security;
alter table das_positions          enable row level security;
alter table das_direction_kpis     enable row level security;
alter table das_direction_budgets  enable row level security;
alter table shared_platforms       enable row level security;

create policy team_private_rw on das_org_design
  for all using (team_id in (select atlas_team_ids())) with check (team_id in (select atlas_team_ids()));
create policy team_private_rw on das_strategic_axes
  for all using (team_id in (select atlas_team_ids())) with check (team_id in (select atlas_team_ids()));
create policy team_private_rw on das_positions
  for all using (team_id in (select atlas_team_ids())) with check (team_id in (select atlas_team_ids()));
create policy team_private_rw on das_direction_kpis
  for all using (team_id in (select atlas_team_ids())) with check (team_id in (select atlas_team_ids()));
create policy team_private_rw on das_direction_budgets
  for all using (team_id in (select atlas_team_ids())) with check (team_id in (select atlas_team_ids()));
create policy team_private_rw on shared_platforms
  for all using (team_id in (select atlas_team_ids())) with check (team_id in (select atlas_team_ids()));
