-- =============================================================================
-- ATLAS — Migration 0033 : chaque domaine est une marque
--
-- Un domaine d'activité s'appelait « Agro-industrie » pour tout le monde : le
-- nom du SECTEUR, pas celui de l'entreprise qui l'exploite. Trois équipes sur
-- le même domaine pilotaient donc trois affaires portant le même nom, et
-- aucune ne pouvait dire « notre marque » en salle.
--
-- Le nom de marque appartient à l'équipe, pas au domaine : il vit donc sur
-- `team_units` et non sur `strategic_units`. Une équipe qui rachète un domaine
-- hérite d'une ligne neuve, et donc du droit de le rebaptiser.
--
-- Absent, on retombe sur le nom du secteur : aucune équipe n'est obligée de
-- nommer sa marque pour jouer.
-- =============================================================================

set search_path = atlas, public, extensions;

alter table team_units
  add column if not exists brand_name text
    check (brand_name is null or length(btrim(brand_name)) between 1 and 40);

comment on column team_units.brand_name is
  'Nom commercial donné par l''équipe à ce domaine. Null = on affiche le nom du '
  'secteur. Appartient à l''équipe : un rachat donne le droit de rebaptiser.';
