-- =============================================================================
-- ATLAS — Migration 0043 : clés de module des leviers de cession
--
-- Le référentiel des leviers (migration 0035) rattachait le spin-off et
-- l'acquisition de consolidation à `cession.listing` et `cession.acquisition`.
-- Ces clés n'existent pas dans le catalogue des modules (`cession.sell`,
-- `cession.acquire`) : `isOn` renvoyait donc toujours faux, et les deux leviers
-- s'affichaient « fermés par le facilitateur » même quand le marché de cession
-- était ouvert.
-- =============================================================================

set search_path = atlas, public, extensions;

update financial_lever_catalog set field_key = 'cession.sell'
where key = 'spin_off' and field_key = 'cession.listing';

update financial_lever_catalog set field_key = 'cession.acquire'
where key = 'acquisition_consolidation' and field_key = 'cession.acquisition';
