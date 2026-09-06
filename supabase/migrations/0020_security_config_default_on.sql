-- =============================================================================
-- ATLAS — Migration 0020 : les mesures anti-scraping sont activées par défaut
--
-- 0019 les avait toutes désactivées à la naissance de la table, par prudence
-- le temps de vérifier que rien ne casse. Décision du super-admin : la
-- politique par défaut est activée, avec la possibilité de désactiver au cas
-- par cas depuis /admin/security — pas l'inverse.
--
-- C'est un réglage GLOBAL, pas par facilitateur : `proxy.ts` lit ces quatre
-- lignes pour absolument toute requête, quel que soit qui la fait (un
-- facilitateur, une équipe, un visiteur anonyme).
-- =============================================================================

set search_path = atlas, public, extensions;

update security_config set enabled = true, updated_at = now()
where measure_name in ('strict_auth', 'security_headers', 'css_anti_selection', 'rate_limit_api');
