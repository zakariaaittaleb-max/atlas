set search_path = atlas, public, extensions;

-- =============================================================================
-- ATLAS — Migration 0009-C : acquisitions externes et historique de deux exercices
-- =============================================================================

-- --- Acquérir une entreprise pour ENTRER dans un nouveau DAS ----------------
--
-- Jusqu'ici, le marché ne permettait que de CÉDER un DAS qu'on exploitait déjà.
-- Il devient aussi un marché d'ACHAT : une équipe peut racheter une entreprise
-- opérant dans un domaine où elle n'est pas présente, et y entrer d'un coup
-- avec une part de marché constituée.
--
-- C'est l'alternative à la croissance organique, avec son arbitrage propre :
-- entrer vite et cher, en héritant d'une organisation qu'on n'a pas choisie —
-- ou entrer lentement en construisant, mais en laissant le marché se structurer
-- sans soi. La barrière VRIO du DAS pénalise l'entrée tardive ; l'acquisition
-- est précisément le moyen de la contourner, à un prix.
create table acquisition_offers (
  id                     uuid primary key default extensions.gen_random_uuid(),
  session_id             uuid not null references game_sessions(id) on delete cascade,
  bidder_team_id         uuid not null references teams(id) on delete cascade,
  target_actor_id        uuid not null references ecosystem_actors(id) on delete cascade,
  das_id                 uuid not null references strategic_units(id) on delete cascade,
  round_number           smallint not null,

  offer_mad              numeric not null check (offer_mad > 0),
  -- Sans budget d'intégration, on hérite d'une entreprise qu'on ne sait pas
  -- faire fonctionner : jusqu'à 45 % de la valeur payée part en fumée.
  integration_budget_mad numeric not null default 0 check (integration_budget_mad >= 0),

  status                 text not null default 'sealed'
    check (status in ('sealed','won','lost','withdrawn','rejected')),
  -- Renseignés à la résolution, jamais avant.
  resolved_price_mad     numeric,
  value_loss_pct         numeric,
  market_share_acquired  numeric,

  created_at             timestamptz not null default now(),
  -- Une seule offre par équipe et par cible à chaque tour : on ne surenchérit
  -- pas contre soi-même.
  unique (bidder_team_id, target_actor_id, round_number)
);

create index on acquisition_offers (session_id, round_number, status);

alter table acquisition_offers enable row level security;

-- Chaque équipe ne voit QUE ses propres offres. Les enchères sont scellées :
-- connaître les offres concurrentes reviendrait à surenchérir d'un dirham.
create policy bidder_own_offer on acquisition_offers
  for all using (bidder_team_id in (select atlas_team_ids()))
  with check (bidder_team_id in (select atlas_team_ids()));

-- --- Le catalogue des cibles, tel que le voient les acheteurs ---------------
--
-- Vue `security definer` assumée : la clause WHERE est l'unique garde.
-- Elle expose l'IDENTITÉ des cibles et leur DAS, jamais leurs chiffres —
-- ceux-ci s'achètent en due diligence auprès du cabinet. Une équipe qui
-- acquiert sans due diligence approfondie hérite des passifs non déclarés.
create view acquisition_targets_public as
select
  a.id            as target_actor_id,
  a.session_id,
  a.das_id,
  u.name          as das_name,
  u.sector_key,
  a.name          as target_name,
  a.region_key
from ecosystem_actors a
join strategic_units u on u.id = a.das_id
where a.actor_type = 'cible_acquisition'
  and a.session_id in (
    select atlas_team_session(t) from unnest(array(select atlas_team_ids())) t
  );

grant select on acquisition_targets_public to authenticated;

comment on view acquisition_targets_public is
  'Cibles acquérables, identité seulement. Les chiffres (EBITDA, capacité, '
  'passifs non déclarés) s''achètent en due diligence : acquérir à l''aveugle '
  'est un choix, pas un oubli.';

-- --- Historique : deux exercices clos avant le premier tour joué ------------
--
-- Le cahier pose qu'un tour vaut UNE ANNÉE et que les équipes disposent
-- toujours du référentiel des DEUX exercices écoulés. On stocke donc :
--
--   round_number = -1  →  exercice N−2
--   round_number =  0  →  exercice N−1, le dernier clos — c'est aussi l'état
--                          de dotation à partir duquel le tour 1 se calcule
--   round_number >=  1 →  les années jouées
--
-- Aucune contrainte à modifier : `round_number` est un smallint libre sur les
-- tables de résultats, et `current_round` de la session reste positif.
comment on column team_das_round_metrics.round_number is
  'Numéro d''exercice. -1 = N−2 et 0 = N−1 sont les deux exercices historiques '
  'fournis en référence ; les tours joués commencent à 1.';

comment on column pnl_statements.round_number is
  'Numéro d''exercice. -1 et 0 sont les deux exercices historiques de référence.';
