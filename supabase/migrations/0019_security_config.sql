-- =============================================================================
-- ATLAS — Migration 0019 : configuration des mesures anti-scraping
--
-- Quatre mesures (authentification stricte, en-têtes HTTP, anti-sélection CSS,
-- limitation de débit API) pilotées depuis /admin/security, sans redéploiement.
-- `proxy.ts` lit `security_config` à chaque requête (avec cache mémoire courte
-- durée) pour décider quoi appliquer.
--
-- Aucune policy RLS : contrairement aux données de jeu, cette table n'a pas de
-- lecteur légitime côté `anon`/`authenticated`— seul le service_role y touche,
-- depuis `src/lib/security-config.ts`, après que le code applicatif a vérifié
-- que l'appelant figure dans l'allowlist super-admin (`ATLAS_SUPER_ADMIN_EMAILS`).
-- RLS activée avec zéro policy équivaut donc à un refus total pour ces deux
-- rôles, exactement comme pour les tables déjà verrouillées en section 12 du
-- schéma initial.
-- =============================================================================

set search_path = atlas, public, extensions;

create table security_config (
  measure_name  text primary key,
  enabled       boolean not null default false,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id)
);

-- Journal append-only : « Log des changements » du cahier des charges. Une
-- ligne par bascule, jamais modifiée ni supprimée par l'application.
create table security_config_log (
  id            uuid primary key default extensions.gen_random_uuid(),
  measure_name  text not null,
  enabled       boolean not null,
  changed_by    uuid references auth.users(id),
  changed_at    timestamptz not null default now()
);

alter table security_config     enable row level security;
alter table security_config_log enable row level security;

-- État initial : tout désactivé. Déployer ce code ne change donc AUCUN
-- comportement en production tant que le super-admin ne bascule rien depuis
-- /admin/security — le déploiement lui-même reste sans risque.
insert into security_config (measure_name, enabled) values
  ('strict_auth', false),
  ('security_headers', false),
  ('css_anti_selection', false),
  ('rate_limit_api', false)
on conflict (measure_name) do nothing;
