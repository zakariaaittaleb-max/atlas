set search_path = atlas, public, extensions;

-- =============================================================================
-- ATLAS — Migration 0048 : se situer dans son pool, entre deux révélations
--
-- « +5,11 Md DH depuis le tour précédent » ne dit pas si une équipe fait mieux
-- que ses concurrents — c'est pourtant ce qui fait débattre. Mais `pool_reveal`
-- ne s'ouvre qu'à la publication des résultats : dès que le tour suivant est
-- ouvert, la comparaison disparaissait de l'écran où l'on décide.
--
-- Deux vues AGRÉGÉES, sans identité d'équipe, sur les seuls exercices clos :
--   • pool_das_benchmark   — part de marché médiane par domaine ;
--   • pool_group_benchmark — chiffre d'affaires médian des groupes.
-- Elles ne disent rien que la révélation n'ait déjà publié.
--
-- Comme `pool_reveal`, elles s'exécutent avec les droits de leur propriétaire :
-- la clause WHERE (pools de l'utilisateur, exercices clos) est l'unique garde.
-- =============================================================================

create or replace view pool_das_benchmark as
select
  t.pool_id,
  m.das_id,
  m.round_number,
  percentile_cont(0.5) within group (order by m.market_share_pct) as median_market_share,
  count(*)::int as teams
from team_das_round_metrics m
join teams t         on t.id = m.team_id
join game_sessions s on s.id = t.session_id
where t.pool_id in (select atlas_pool_ids())
  and (m.round_number < s.current_round or s.status in ('round_resolved', 'completed'))
group by t.pool_id, m.das_id, m.round_number;

create or replace view pool_group_benchmark as
select
  pool_id,
  round_number,
  percentile_cont(0.5) within group (order by group_revenue_mad) as median_group_revenue_mad,
  count(*)::int as teams
from (
  select t.pool_id, m.round_number, m.team_id, sum(coalesce(m.revenue_mad, 0)) as group_revenue_mad
  from team_das_round_metrics m
  join teams t         on t.id = m.team_id
  join game_sessions s on s.id = t.session_id
  where t.pool_id in (select atlas_pool_ids())
    and (m.round_number < s.current_round or s.status in ('round_resolved', 'completed'))
  group by t.pool_id, m.round_number, m.team_id
) per_group
group by pool_id, round_number;

grant select on pool_das_benchmark to authenticated;
grant select on pool_group_benchmark to authenticated;

comment on view pool_das_benchmark is
  'Part de marché médiane des groupes d''un pool, par domaine et exercice clos. Agrégat sans identité d''équipe.';
comment on view pool_group_benchmark is
  'Chiffre d''affaires médian des groupes d''un pool, par exercice clos. Agrégat sans identité d''équipe.';
