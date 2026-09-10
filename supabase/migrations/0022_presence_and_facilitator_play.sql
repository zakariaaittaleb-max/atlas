-- =============================================================================
-- ATLAS — Migration 0022 : identité des participants, facilitateur joueur,
-- capacités pilotées par le super-admin.
--
-- Trois besoins, une seule migration parce qu'ils partagent la même table :
--
--   1. Un participant n'était qu'un `uuid` anonyme. Impossible, dans ces
--      conditions, d'afficher « qui est connecté avec moi dans mon groupe » —
--      la salle voyait un nombre, jamais des personnes. Un prénom est
--      désormais saisi à la connexion, à côté des deux codes.
--
--   2. Le facilitateur doit pouvoir entrer dans un groupe et y JOUER, pas
--      seulement regarder. Il devient donc un membre d'équipe comme un autre —
--      c'est ce qui fait que tous les écrans, toutes les écritures et toute la
--      RLS existante fonctionnent sans exception à écrire nulle part. Un
--      marqueur le distingue, et un réglage de discrétion décide si le groupe
--      le voit ou non.
--
--   3. Ce droit se pilote depuis /admin : le super-admin l'ouvre ou le ferme
--      pour un facilitateur donné. La table est volontairement générique
--      (`capability text`) pour accueillir les modules d'écran à venir sans
--      nouvelle migration.
-- =============================================================================

set search_path = atlas, public, extensions;

-- -----------------------------------------------------------------------------
-- 1. Identité des membres
-- -----------------------------------------------------------------------------

alter table team_members
  add column display_name        text,
  add column is_facilitator      boolean not null default false,
  add column facilitator_visible boolean not null default true;

-- Les rôles pédagogiques (DG, DAF, DCM, DT, DRH) ne sont JAMAIS répartis en
-- salle : le groupe décide ensemble. La colonne existait depuis la migration
-- initiale sans qu'aucun écran ne l'affiche ni qu'aucune politique s'y réfère —
-- elle laissait seulement croire à une distribution des rôles qui n'a jamais eu
-- lieu.
alter table team_members drop column display_role;

-- Un facilitateur discret ne doit pas être décelable en lisant la table depuis
-- le navigateur : la politique de lecture masque sa ligne au reste du groupe,
-- tout en la lui laissant lire (sans quoi il ne verrait plus sa propre équipe).
drop policy read_own_membership on team_members;

create policy read_own_membership on team_members
  for select using (
    team_id in (select atlas_team_ids())
    and (not is_facilitator or facilitator_visible or user_id = auth.uid())
  );

-- -----------------------------------------------------------------------------
-- 2. Journal des passages du facilitateur en équipe
--
-- La ligne `team_members` est supprimée quand il ressort du groupe : sans ce
-- journal, plus rien ne dirait après coup que telle décision d'équipe portant
-- son `decided_by` a été saisie par l'animateur. On garde donc les fenêtres
-- d'entrée et de sortie, définitivement.
-- -----------------------------------------------------------------------------

create table facilitator_play_log (
  id              uuid primary key default extensions.gen_random_uuid(),
  session_id      uuid not null references game_sessions(id) on delete cascade,
  team_id         uuid not null references teams(id) on delete cascade,
  facilitator_id  uuid not null references auth.users(id) on delete cascade,
  visible_to_team boolean not null default true,
  joined_at       timestamptz not null default now(),
  left_at         timestamptz
);

create index on facilitator_play_log (session_id, team_id);
create index on facilitator_play_log (facilitator_id, left_at);

-- Comme admin_audit_log : RLS active, aucune policy. Seul `service_role` écrit
-- et lit, depuis le serveur, après vérification de l'identité.
alter table facilitator_play_log enable row level security;

-- -----------------------------------------------------------------------------
-- 3. Capacités d'un facilitateur, ouvertes ou fermées par le super-admin
--
-- L'absence de ligne vaut AUTORISÉ : une capacité nouvelle est disponible par
-- défaut, et le super-admin la retire explicitement. L'inverse obligerait à
-- créer une ligne par facilitateur et par capacité à chaque déploiement, et un
-- oubli se traduirait par une fonctionnalité muette sans message d'erreur.
-- -----------------------------------------------------------------------------

create table facilitator_capabilities (
  facilitator_id uuid not null references auth.users(id) on delete cascade,
  capability     text not null,
  enabled        boolean not null default true,
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users(id),
  primary key (facilitator_id, capability)
);

alter table facilitator_capabilities enable row level security;
