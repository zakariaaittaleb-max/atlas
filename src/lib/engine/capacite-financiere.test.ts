import { describe, expect, it } from 'vitest';

import {
  debtCapacity, freeCashFlow, interestCoverage, selfFinancingCapacity,
} from './finance';
import { buildParams } from './params';

const params = buildParams();

/**
 * L'écran demandait un montant de crédit sans jamais dire combien la banque
 * accepterait d'en prêter. Ces règles sont celles d'un comité de crédit : le
 * plus contraignant des deux critères l'emporte.
 */
describe('capacité d’endettement', () => {
  it('retient le gearing quand c’est lui qui bloque', () => {
    // 100 M de fonds propres → 200 M ; 2 Md de CA → 800 M.
    const c = debtCapacity(100e6, 2_000e6, 0, params);

    expect(c.byEquityMad).toBeCloseTo(200e6, 0);
    expect(c.byRevenueMad).toBeCloseTo(800e6, 0);
    expect(c.totalMad).toBeCloseTo(200e6, 0);
    expect(c.binding).toBe('fonds_propres');
  });

  it('retient le volume d’activité quand c’est lui qui bloque', () => {
    // Beaucoup de capital, peu d'activité : la ligne suit l'activité.
    const c = debtCapacity(10_000e6, 1_000e6, 0, params);

    expect(c.totalMad).toBeCloseTo(400e6, 0);
    expect(c.binding).toBe('activite');
  });

  it('déduit l’encours déjà tiré', () => {
    const c = debtCapacity(100e6, 2_000e6, 150e6, params);
    expect(c.availableMad).toBeCloseTo(50e6, 0);
  });

  it('ne rend jamais une capacité négative', () => {
    // Une équipe déjà au-delà du plafond ne se voit pas proposer un tirage.
    const c = debtCapacity(100e6, 2_000e6, 900e6, params);
    expect(c.availableMad).toBe(0);
  });

  /**
   * Sans exercice clos, la banque n'a rien à regarder : la ligne s'ouvre après
   * le premier tour résolu.
   */
  it('ne prête rien sans activité constatée', () => {
    expect(debtCapacity(5_000e6, 0, 0, params).totalMad).toBe(0);
  });
});

describe('capacité d’autofinancement et flux libre', () => {
  it('ajoute au résultat ce qui n’a pas été décaissé', () => {
    expect(selfFinancingCapacity(-4.45e9, 1.2e9)).toBeCloseTo(-3.25e9, 0);
  });

  it('retire du flux libre ce que la croissance immobilise', () => {
    // 3 Md de CAF, 500 M de BFR supplémentaire, 2 Md investis.
    expect(freeCashFlow(3e9, 0.5e9, 2e9)).toBeCloseTo(0.5e9, 0);
  });

  it('rend un flux négatif quand le tour ne s’autofinance pas', () => {
    expect(freeCashFlow(1e9, 0.8e9, 2e9)).toBeLessThan(0);
  });

  it('ne divise pas par une charge d’intérêt nulle', () => {
    expect(interestCoverage(500e6, 0)).toBeNull();
    expect(interestCoverage(500e6, 100e6)).toBeCloseTo(5, 6);
  });
});

/**
 * Une dette d'ouverture négative — cicatrice d'une ancienne écriture qui
 * déduisait deux fois le remboursement — ne doit jamais se lire comme une
 * créance sur la banque qui élargirait la ligne de crédit.
 */
describe('capacité d’endettement et bilan abîmé', () => {
  it('traite une dette négative comme nulle', () => {
    const saine = debtCapacity(100e6, 2_000e6, 0, params);
    const cicatrice = debtCapacity(100e6, 2_000e6, -50e6, params);
    expect(cicatrice.availableMad).toBeCloseTo(saine.availableMad, 0);
  });

  it('ne prête rien sans fonds propres, quel que soit le chiffre d’affaires', () => {
    const c = debtCapacity(0, 90_000e6, 0, params);
    expect(c.availableMad).toBe(0);
    expect(c.binding).toBe('fonds_propres');
  });
});
