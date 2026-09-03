-- =============================================================================
-- ATLAS — Migration 0006 : ce que le pool voit à la révélation
--
-- Défaut corrigé : `team_das_round_metrics` était lisible EN ENTIER par tout le
-- pool après résolution. Or cette table contient le coût unitaire, le niveau
-- d'automatisation, le contrôle du canal, le taux de rupture et la stratégie
-- réellement détectée de chaque équipe — c'est-à-dire précisément ce que le
-- cabinet est censé VENDRE. L'écran de révélation l'aurait distribué gratuitement.
--
-- La RLS étant ROW-level, elle ne sait pas masquer une colonne. Et un GRANT par
-- colonne s'appliquerait aussi à l'équipe sur SES PROPRES données, dont elle a
-- besoin. D'où une projection dédiée.
-- =============================================================================

set search_path = atlas, public, extensions;

drop policy pool_reads_resolved_metrics on team_das_round_metrics;

create policy team_reads_own_metrics on team_das_round_metrics
  for select using (team_id in (select atlas_team_ids()));

-- Projection de pool : SEULEMENT ce qu'un concurrent a le droit de voir.
--
-- Vue `security definer` assumée : elle contourne délibérément la RLS des tables
-- sous-jacentes, et sa clause WHERE est l'unique garde. Elle reproduit
-- exactement l'ancienne politique — même pool, session résolue, aucun tour futur.
--
-- Ce qui reste HORS de la vue, et pourquoi :
--   coût unitaire, automatisation, contrôle du canal  → vendus par l'étude concurrentielle
--   capacité, volumes, taux de rupture                → renseignement opérationnel
--   sab_score, best_fit_strategy                      → le diagnostic d'alignement est
--                                                        ce que vend l'audit
--   marge brute, EBITDA                               → l'avantage de rentabilité
--
-- Le prix unitaire, lui, EST public : sur un marché réel, un prix se constate.
create view pool_reveal as
select
  m.team_id,
  t.name       as team_name,
  t.pool_id,
  m.das_id,
  m.round_number,
  m.competitiveness_score,
  m.perceived_quality,
  m.notoriety,
  m.price_competitiveness,
  m.ia_score,
  m.competitive_pressure,
  m.market_share_pct,
  m.revenue_mad,
  m.unit_price_mad
from team_das_round_metrics m
join teams t         on t.id = m.team_id
join game_sessions s on s.id = t.session_id
where t.pool_id in (select atlas_pool_ids())
  and s.status in ('round_resolved', 'completed')
  and m.round_number <= s.current_round;

grant select on pool_reveal to authenticated;

comment on view pool_reveal is
  'Projection de pool pour l''écran de révélation. security definer assumé : la '
  'clause WHERE est l''unique garde d''accès. Ne jamais y ajouter une colonne '
  'sans se demander si le cabinet la vend.';

-- Part de marché non servie : elle appartient au débriefing du pool.
grant select on pool_round_summary to authenticated;
