-- =============================================================================
-- ATLAS — Migration 0028 : resserrer la précision des études
--
-- Les trois paliers annonçaient ±25 %, ±10 % et ±3 %. Le palier bon marché
-- n'informait plus : une part de marché donnée à 25 % pouvait valoir 20 ou 30,
-- ce qui ne départage aucune décision. Une étude qu'on ne peut pas utiliser ne
-- se vend pas, et les trois paliers s'effondraient en un seul.
--
-- ±10 / ±5 / ±2 correspond à ce qu'annonce une étude de marché réelle : une
-- note de cadrage donne l'ordre de grandeur, une étude commanditée resserre,
-- une mission approfondie avec accès aux données confine à la certitude. Le
-- rapport entre paliers reste assez large pour justifier de monter en gamme —
-- surtout à 2,2 fois le prix.
--
-- ── SEULES LES VALEURS NON RÉGLÉES SONT REPRISES ───────────────────────────
-- Ces paramètres sont ajustables par session : un facilitateur a pu durcir ou
-- assouplir délibérément. On ne met à jour que les lignes portant encore
-- exactement l'ancien défaut — celles que personne n'a touchées.
-- =============================================================================

set search_path = atlas, public, extensions;

update engine_parameters
   set value = 0.10
 where key = 'consulting.tier.express.error_margin'
   and value = 0.25;

update engine_parameters
   set value = 0.05
 where key = 'consulting.tier.standard.error_margin'
   and value = 0.10;

update engine_parameters
   set value = 0.02
 where key = 'consulting.tier.approfondie.error_margin'
   and value = 0.03;
