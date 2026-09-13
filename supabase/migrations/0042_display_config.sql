-- =============================================================================
-- ATLAS — Migration 0042 : configuration d'affichage
--
-- Pilotée depuis /admin/config par le super-admin, sans redéploiement :
--   • sections du cockpit affichées ou masquées (Santé, Portefeuille,
--     Stratégie, Concurrence, Matrices) ;
--   • données sensibles de la barre d'argent (budget disponible, crédits) ;
--   • niveau de lecture par défaut du cockpit (Pilote, Gestionnaire, Analyste) ;
--   • thème (système, clair, sombre) et taille de police (standard, grand).
--
-- Une seule ligne (`id = 'global'`) portant un document JSON : les réglages
-- évoluent plus vite que le schéma, et `src/lib/display-config-types.ts`
-- complète toute clé absente par sa valeur par défaut. `{}` vaut donc « rien
-- de changé » — déployer cette migration ne modifie aucun affichage.
--
-- Même régime que `security_config` (migration 0019) : RLS activée sans
-- policy, seul le service_role y touche, après vérification applicative de
-- l'allowlist super-admin.
-- =============================================================================

set search_path = atlas, public, extensions;

create table display_config (
  id          text primary key default 'global' check (id = 'global'),
  settings    jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id)
);

-- Journal append-only : l'état complet après chaque enregistrement, pour
-- savoir qui a masqué une section quand une équipe ne la retrouve plus.
create table display_config_log (
  id          uuid primary key default extensions.gen_random_uuid(),
  settings    jsonb not null,
  changed_by  uuid references auth.users(id),
  changed_at  timestamptz not null default now()
);

alter table display_config     enable row level security;
alter table display_config_log enable row level security;

insert into display_config (id, settings) values ('global', '{}'::jsonb)
on conflict (id) do nothing;
