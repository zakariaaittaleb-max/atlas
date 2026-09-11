-- =============================================================================
-- ATLAS — Migration 0036 : le cash pooling entre domaines
--
-- Premier levier du référentiel financier qui n'avait aucune existence dans le
-- jeu : « transfert de trésorerie du DAS vache à lait vers le DAS étoile ».
-- La trésorerie était une grandeur de GROUPE, indifférenciée ; déplacer de
-- l'argent d'un domaine à l'autre n'avait donc ni trace ni conséquence.
--
-- ── CE QUE LA TABLE ENREGISTRE ──────────────────────────────────────────────
-- Un montant par domaine et par tour, SIGNÉ : positif, le groupe injecte dans
-- ce domaine ; négatif, il y prélève. C'est un transfert, pas une création de
-- monnaie — la somme sur l'ensemble des domaines doit valoir zéro, et c'est le
-- serveur qui le garantit.
--
-- Le geste ne se reconduit PAS d'un tour à l'autre : un transfert est un
-- mouvement, pas une politique. Le reconduire ferait vider le même domaine
-- chaque tour sans que personne ne l'ait redemandé.
-- =============================================================================

set search_path = atlas, public, extensions;

create table if not exists das_cash_allocation (
  id            uuid primary key default extensions.gen_random_uuid(),
  team_id       uuid not null references teams(id) on delete cascade,
  das_id        uuid not null references strategic_units(id) on delete cascade,
  round_number  smallint not null,
  /** Signé : positif le groupe injecte, négatif il prélève. */
  transfer_mad  numeric not null default 0,
  created_at    timestamptz not null default now(),
  unique (team_id, das_id, round_number)
);

alter table das_cash_allocation enable row level security;

create policy team_private_rw on das_cash_allocation
  for all using (team_id in (select atlas_team_ids()))
  with check (team_id in (select atlas_team_ids()));

create index on das_cash_allocation (team_id, round_number);

comment on table das_cash_allocation is
  'Cash pooling : transferts de trésorerie entre domaines d''un même groupe. '
  'Signé, et de somme nulle sur l''ensemble des domaines — c''est un transfert. '
  'Un domaine asséché perd en compétitivité (doc du référentiel financier).';
