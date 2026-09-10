-- =============================================================================
-- ATLAS — Migration 0024 : bornes des curseurs de variation
--
-- Les champs chiffrés se pilotent désormais en ÉCART par rapport au tour
-- précédent, et chaque famille de champs a sa propre fourchette : un budget
-- marketing peut tripler d'un exercice à l'autre, un salaire brut moyen ne
-- bouge que de quelques points.
--
-- Les valeurs par défaut vivent dans `src/lib/variation-scale.ts`, calées sur
-- ce qu'on observe en entreprise. Cette table ne contient donc QUE les
-- ajustements d'un facilitateur qui veut durcir ou assouplir une famille pour
-- son atelier — l'absence de ligne vaut « bornes par défaut », comme pour les
-- modules de la migration 0023.
--
-- Les seuils de libellé sont stockés à côté des bornes : ils décident où
-- « faible hausse » devient « hausse moyenne », et ils s'expriment en FRACTION
-- de la fourchette, pas en points de pourcentage. C'est ce qui permet au mot de
-- garder son sens sur une fourchette de ±5 % comme de ±300 %.
-- =============================================================================

set search_path = atlas, public, extensions;

create table session_variation_scales (
  session_id   uuid not null references game_sessions(id) on delete cascade,
  family       text not null,

  -- Bornes de l'écart autorisé, en points de pourcentage. Le plancher dur de
  -- −100 % (le poste disparaît) est appliqué par le code : une borne plus basse
  -- produirait un montant négatif, dont le moteur ne saurait rien faire.
  min_pct      numeric not null check (min_pct >= -100 and min_pct <= 0),
  max_pct      numeric not null check (max_pct >= 0 and max_pct <= 1000),

  -- Seuils de libellé, en fraction de la fourchette (0 à 1), croissants.
  flat         numeric not null default 0.04  check (flat between 0 and 1),
  faible       numeric not null default 0.25  check (faible between 0 and 1),
  moyenne      numeric not null default 0.5   check (moyenne between 0 and 1),
  forte        numeric not null default 0.75  check (forte between 0 and 1),

  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users(id),

  primary key (session_id, family),
  constraint seuils_croissants check (flat <= faible and faible <= moyenne and moyenne <= forte)
);

-- Comme les autres tables de réglage : seul `service_role` y touche, depuis le
-- serveur, après vérification que l'appelant anime bien la session. Les équipes
-- ne la lisent jamais — l'échelle leur arrive résolue dans les props.
alter table session_variation_scales enable row level security;
