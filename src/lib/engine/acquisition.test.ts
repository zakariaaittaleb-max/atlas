import { describe, expect, it } from 'vitest';

import { resolveTransfer } from './finance';
import { buildParams } from './params';

const params = buildParams();

/**
 * Acquérir une entreprise pour entrer dans un nouveau domaine repose sur la
 * même mécanique d'intégration que le rachat d'un DAS entre équipes : ce qu'on
 * ne finance pas pour intégrer, on le perd.
 */
describe('acquisition externe', () => {
  it('érode près de la moitié de la valeur quand l’intégration n’est pas financée', () => {
    const sansBudget = resolveTransfer(1_000_000_000, 0, 0.25, 70, params);
    const avecBudget = resolveTransfer(1_000_000_000, 200_000_000, 0.25, 70, params);

    expect(sansBudget.valueLossPct).toBeGreaterThan(0.4);
    expect(avecBudget.valueLossPct).toBeLessThan(0.15);
    expect(avecBudget.marketShareTransferred)
      .toBeGreaterThan(sansBudget.marketShareTransferred);
  });

  it('ne descend jamais sous le plancher de perte', () => {
    // Même surfinancée, une intégration coûte : on n'achète pas une entreprise
    // sans en perdre une part. Le plancher évite l'illusion du rachat parfait.
    const surfinance = resolveTransfer(1_000_000_000, 10_000_000_000, 0.25, 70, params);
    expect(surfinance.valueLossPct).toBeCloseTo(0.05, 6);
  });

  it('transfère la notoriété au même rythme que la part de marché', () => {
    // Mal intégrer, c'est perdre des clients ET l'image qui les retenait.
    const outcome = resolveTransfer(1_000_000_000, 0, 0.30, 80, params);
    expect(outcome.notorietyTransferred / 80)
      .toBeCloseTo(outcome.marketShareTransferred / 0.30, 6);
  });
});
