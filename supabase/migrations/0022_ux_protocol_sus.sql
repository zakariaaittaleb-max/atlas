-- =============================================================================
-- ATLAS — Migration 0022 : protocole UX facilitateur & questionnaire SUS
--
-- Deux tables pour outiller les tests d'utilisabilité menés en marge d'une
-- session de jeu :
--
--   • ux_protocol_notes  — le cahier du facilitateur (préparation, observations
--     en direct, débriefing qualitatif). Une ligne par session, mise à jour en
--     place au fil des quatre phases du protocole.
--
--   • sus_responses      — une ligne par participant ayant répondu au
--     questionnaire System Usability Scale (Brooke, 1996). Le score individuel
--     n'a pas de valeur isolée en méthodologie SUS ; seule la moyenne du panel
--     l'est, calculée à la volée depuis ces lignes.
--
-- Comme admin_audit_log et security_config_log : RLS activée, aucune policy —
-- seul service_role y écrit, depuis le DAL après vérification de périmètre
-- (requireFacilitator / requireTeam côté application, jamais côté base).
-- =============================================================================

set search_path = atlas, public, extensions;

create table ux_protocol_notes (
  id             uuid primary key default extensions.gen_random_uuid(),
  session_id     uuid not null references game_sessions(id) on delete cascade,
  facilitator_id uuid not null references auth.users(id),
  data           jsonb not null default '{}'::jsonb,
  updated_at     timestamptz not null default now(),
  unique (session_id)
);

alter table ux_protocol_notes enable row level security;

create table sus_responses (
  id                uuid primary key default extensions.gen_random_uuid(),
  session_id        uuid not null references game_sessions(id) on delete cascade,
  team_id           uuid references teams(id) on delete set null,
  participant_label text not null default 'Anonyme',
  score             smallint not null check (score between 0 and 100),
  answers           jsonb not null,
  comment           text not null default '',
  created_at        timestamptz not null default now()
);

alter table sus_responses enable row level security;

create index sus_responses_session_idx on sus_responses(session_id);
