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

describe('historique du domaine acquis', () => {
  /**
   * Le chiffre d'affaires repris était inscrit à ZÉRO en base, alors que le
   * poids réel de la cible était chargé côté serveur et transmis au moteur.
   * Un domaine racheté entrait sans passé commercial, et le tour suivant en
   * tirait quatre conséquences fausses : poids nul dans le SAB pondéré, rôle
   * de portefeuille injugeable, aucun apport à l'intégration verticale, et un
   * océan bleu déclarable gratuitement — le ticket étant proportionnel à un
   * chiffre d'affaires nul.
   */
  it('reprend le chiffre d’affaires, amputé de la perte d’intégration', () => {
    const outcome = resolveTransfer(1_000_000_000, 200_000_000, 0.25, 70, params);
    const repris = 800_000_000 * (1 - outcome.valueLossPct);

    expect(repris).toBeGreaterThan(0);
    expect(repris).toBeLessThan(800_000_000);
  });

  it('reprend le chiffre d’affaires au même rythme que la part de marché', () => {
    // Mal intégrer, c'est perdre des clients : le chiffre d'affaires et la
    // part de marché suivent la même érosion, sans quoi l'un dirait une chose
    // et l'autre son contraire au débriefing.
    const outcome = resolveTransfer(1_000_000_000, 0, 0.30, 80, params);
    const revenu = 500_000_000 * (1 - outcome.valueLossPct);

    expect(revenu / 500_000_000).toBeCloseTo(outcome.marketShareTransferred / 0.30, 9);
  });
});
