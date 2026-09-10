-- =============================================================================
-- ATLAS — Migration 0025 : les deux étages de stock
--
-- L'approvisionnement n'était qu'un levier de négociation : le volume engagé
-- auprès d'un fournisseur jouait sur la remise obtenue et sur le risque de
-- rupture, jamais sur la QUANTITÉ disponible. Une équipe pouvait donc vendre
-- sans avoir rien acheté, et sur-acheter ne coûtait rien.
--
-- Deux magasins se remplissent et se vident désormais :
--
--   1. les INTRANTS, qui bornent ce que l'atelier peut produire — en acheter
--      trop peu fait perdre des ventes, trop immobilise de la trésorerie ;
--   2. les PRODUITS FINIS, reportés d'un tour à l'autre. Ils s'accumulent
--      quand la demande recule et amortissent le tour suivant.
--
-- Les deux se paient un coût de possession (`inventory.holding_rate`), sans
-- quoi le stock n'aurait aucun coût d'opportunité.
--
-- Une équipe sans contrat fournisseur n'est PAS contrainte : elle achète au
-- comptant, plus cher et avec des intrants médiocres. C'est aussi ce qui se
-- passe quand le facilitateur a fermé le module des achats — fermer un module
-- ne doit pas affamer les usines.
-- =============================================================================

set search_path = atlas, public, extensions;

alter table team_das_round_metrics
  -- Sorti de l'atelier ce tour. Distinct du vendu : un tour servi depuis
  -- l'entrepôt laisse les machines à l'arrêt, et c'est bien une
  -- sous-absorption des charges fixes.
  add column production_units          numeric,
  -- Les deux magasins à la CLÔTURE du tour. Ils deviennent l'ouverture du
  -- suivant, lue par `load-snapshot`.
  add column input_stock_units         numeric,
  add column finished_stock_units      numeric,
  add column inventory_holding_cost_mad numeric;

comment on column team_das_round_metrics.input_stock_units is
  'Intrants en magasin à la clôture. Bornent la production du tour suivant.';
comment on column team_das_round_metrics.finished_stock_units is
  'Produits finis invendus. Vendables au tour suivant sans rien produire.';
