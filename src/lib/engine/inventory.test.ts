import { describe, expect, it } from 'vitest';

import { resolveVolume } from './market';

/**
 * Les deux étages de stock.
 *
 * L'approvisionnement n'était qu'un levier de négociation : une équipe pouvait
 * vendre sans avoir rien acheté. Ces cas fixent le comportement des deux
 * magasins — intrants et produits finis — et surtout ce qui bride quoi.
 */

const MARKET = 1_000;
const SHARE = 0.5; // 500 unités demandées
const PRICE = 100;

describe('volumes et stocks', () => {
  it('sans contrat, l’approvisionnement ne bride jamais', () => {
    const r = resolveVolume(MARKET, SHARE, 400, PRICE, {
      inputsAvailable: null,
      finishedStockStart: 0,
    });
    // Seule la capacité limite : 400 vendus sur 500 demandés.
    expect(r.volumeSold).toBe(400);
    expect(r.limitedByInputs).toBe(false);
    expect(r.inputStockEndUnits).toBe(0);
  });

  it('les intrants manquants font perdre des ventes', () => {
    const r = resolveVolume(MARKET, SHARE, 600, PRICE, {
      inputsAvailable: 300,
      finishedStockStart: 0,
    });
    expect(r.productionUnits).toBe(300);
    expect(r.volumeSold).toBe(300);
    expect(r.volumeLost).toBe(200);
    expect(r.limitedByInputs).toBe(true);
    expect(r.inputStockEndUnits).toBe(0);
  });

  it('acheter trop laisse des intrants en magasin', () => {
    const r = resolveVolume(MARKET, SHARE, 600, PRICE, {
      inputsAvailable: 800,
      finishedStockStart: 0,
    });
    expect(r.productionUnits).toBe(500);
    expect(r.volumeSold).toBe(500);
    // 800 livrés, 500 consommés : 300 dorment en magasin.
    expect(r.inputStockEndUnits).toBe(300);
    expect(r.limitedByInputs).toBe(false);
  });

  it('l’atelier ne tourne pas pour remplir l’entrepôt', () => {
    // Capacité et intrants larges, demande faible : on produit la demande.
    const r = resolveVolume(MARKET, 0.1, 900, PRICE, {
      inputsAvailable: 900,
      finishedStockStart: 0,
    });
    expect(r.productionUnits).toBe(100);
    expect(r.finishedStockEndUnits).toBe(0);
    expect(r.inputStockEndUnits).toBe(800);
  });

  it('le stock de produits finis amortit une demande qui remonte', () => {
    // 200 en entrepôt, 500 demandés : on ne produit que les 300 manquants.
    const r = resolveVolume(MARKET, SHARE, 600, PRICE, {
      inputsAvailable: 600,
      finishedStockStart: 200,
    });
    expect(r.productionUnits).toBe(300);
    expect(r.volumeSold).toBe(500);
    expect(r.finishedStockEndUnits).toBe(0);
    expect(r.inputStockEndUnits).toBe(300);
  });

  it('un entrepôt plus grand que la demande laisse de l’invendu', () => {
    const r = resolveVolume(MARKET, 0.1, 600, PRICE, {
      inputsAvailable: 600,
      finishedStockStart: 400,
    });
    // 100 demandés, 400 en stock : rien à produire, 300 restent.
    expect(r.productionUnits).toBe(0);
    expect(r.volumeSold).toBe(100);
    expect(r.finishedStockEndUnits).toBe(300);
    expect(r.volumeLost).toBe(0);
  });

  it('distingue le manque de capacité du manque de matière', () => {
    const capacite = resolveVolume(MARKET, SHARE, 300, PRICE, {
      inputsAvailable: 900,
      finishedStockStart: 0,
    });
    expect(capacite.volumeLost).toBe(200);
    expect(capacite.limitedByInputs).toBe(false);

    const matiere = resolveVolume(MARKET, SHARE, 900, PRICE, {
      inputsAvailable: 300,
      finishedStockStart: 0,
    });
    expect(matiere.volumeLost).toBe(200);
    expect(matiere.limitedByInputs).toBe(true);
  });

  it('reste compatible avec les appels sans état d’approvisionnement', () => {
    const r = resolveVolume(MARKET, SHARE, 400, PRICE);
    expect(r.volumeSold).toBe(400);
    expect(r.revenueMad).toBe(40_000);
  });
});
