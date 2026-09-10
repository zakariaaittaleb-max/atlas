-- =============================================================================
-- ATLAS — Migration 0023 : modules activables
--
-- Atlas est trop grand pour un atelier de trois heures. Chaque champ de saisie
-- devient fermable, et deux étages décident de ce qui est ouvert :
--
--   • le SUPER-ADMIN pose un plafond par facilitateur — il réutilise la table
--     `facilitator_capabilities` de la migration 0022, avec des capacités
--     nommées `module:<clé>`. C'est exactement ce pour quoi elle avait été
--     faite générique ;
--   • le FACILITATEUR choisit ensuite, session par session, ce qu'il ouvre
--     parmi ce plafond. D'où `session_modules`.
--
-- Dans les deux cas, l'ABSENCE DE LIGNE vaut OUVERT. Un champ nouvellement
-- déployé est donc jouable sans qu'il faille créer une ligne par facilitateur
-- et par session ; le réglage est toujours un retrait explicite.
--
-- Le catalogue lui-même (libellés, catégories, poids, valeurs neutres) vit dans
-- `src/lib/modules-catalog.ts`, pas ici : c'est du contenu pédagogique qui
-- change au rythme du produit, et une migration par libellé serait absurde.
-- =============================================================================

set search_path = atlas, public, extensions;

-- -----------------------------------------------------------------------------
-- Ce qu'une session ouvre, parmi ce que son facilitateur a le droit d'ouvrir
-- -----------------------------------------------------------------------------

create table session_modules (
  session_id uuid not null references game_sessions(id) on delete cascade,
  field_key  text not null,
  enabled    boolean not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  primary key (session_id, field_key)
);

-- Comme les autres tables de réglage : seul `service_role` y touche, depuis le
-- serveur, après vérification que l'appelant anime bien la session. Les équipes
-- ne lisent jamais cette table — l'état des modules leur arrive déjà résolu,
-- dans les props de leurs écrans.
alter table session_modules enable row level security;

-- -----------------------------------------------------------------------------
-- Préréglages enregistrés par un facilitateur
--
-- Trois préréglages sont livrés dans le code (Découverte, Standard, Complet).
-- Ceux-ci sont les siens : un formateur qui anime le même atelier six fois par
-- an ne doit pas recocher soixante-huit cases à chaque fois.
-- -----------------------------------------------------------------------------

create table module_presets (
  id             uuid primary key default extensions.gen_random_uuid(),
  facilitator_id uuid not null references auth.users(id) on delete cascade,
  name           text not null,
  field_keys     jsonb not null default '[]'::jsonb,
  created_at     timestamptz not null default now(),
  unique (facilitator_id, name)
);

create index on module_presets (facilitator_id);

alter table module_presets enable row level security;
