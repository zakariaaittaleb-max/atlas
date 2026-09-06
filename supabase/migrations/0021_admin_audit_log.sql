-- =============================================================================
-- ATLAS — Migration 0021 : journal des actions super-admin
--
-- Le panneau /admin s'étend à la gestion des facilitateurs et des sessions
-- (création, blocage, changement de mot de passe, suppression, connexion en
-- tant que), en plus des bascules déjà journalisées dans security_config_log.
-- Ces actions touchent des comptes et des données d'autrui : elles méritent
-- leur propre trace, jamais modifiable ni supprimable par l'application.
--
-- Comme security_config_log : RLS activée, aucune policy — seul service_role
-- y écrit, depuis src/lib/admin-audit.ts, après vérification de l'allowlist
-- super-admin côté application.
-- =============================================================================

set search_path = atlas, public, extensions;

create table admin_audit_log (
  id           uuid primary key default extensions.gen_random_uuid(),
  actor_id     uuid references auth.users(id),
  action       text not null,
  target_type  text not null,
  target_id    text,
  details      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

alter table admin_audit_log enable row level security;
