import { describe, expect, it } from 'vitest';

import { computeScorecards, type TeamHistory } from './scorecard';

function history(id: string, over: Partial<TeamHistory> = {}): TeamHistory {
  return {
    teamId: id,
    finalTreasuryMad: 10_000_000_000,
    cumulativeRevenueMad: 100_000_000_000,
    cumulativeNetIncomeMad: 5_000_000_000,
    equityMad: 50_000_000_000,
    averageMarketShare: 0.33,
    finalNotoriety: 60,
    finalPerceivedQuality: 60,
    initialQuality: 50,
    finalQuality: 60,
    averageIaScore: 65,
    finalSacScore: 70,
    averageStockoutRate: 0.05,
    finalClimatSocial: 70,
    rdIntensity: 0.05,
    isLiquidated: false,
    ...over,
  };
}

describe('Balanced Scorecard', () => {
  it('ne rend rien pour un pool vide', () => {
    expect(computeScorecards([])).toEqual([]);
  });

  it('donne 60 partout quand les équipes sont indiscernables', () => {
    // Aucune caractéristique n'a discriminé : ni sanction ni récompense.
    const cards = computeScorecards([history('a'), history('b')]);
    for (const card of cards) {
      expect(card.globalScore).toBeCloseTo(60, 6);
    }
  });

  it('classe l’axe financier sur la trésorerie, le CA et la rentabilité', () => {
    const [riche, pauvre] = computeScorecards([
      history('riche', { finalTreasuryMad: 30_000_000_000, cumulativeNetIncomeMad: 20_000_000_000 }),
      history('pauvre', { finalTreasuryMad: 1_000_000_000, cumulativeNetIncomeMad: -2_000_000_000 }),
    ]);
    expect(riche.financialScore).toBeGreaterThan(pauvre.financialScore);
  });

  it('récompense la FIABILITÉ de service, donc l’absence de rupture', () => {
    // Orientation inversée : moins de rupture vaut mieux.
    const [fiable, defaillant] = computeScorecards([
      history('fiable', { averageStockoutRate: 0 }),
      history('defaillant', { averageStockoutRate: 0.6 }),
    ]);
    expect(fiable.processScore).toBeGreaterThan(defaillant.processScore);
  });

  it('mesure la PROGRESSION de la qualité, pas son niveau', () => {
    // Deux équipes finissent au même niveau ; celle qui est partie de plus bas
    // a davantage appris.
    const [progresse, stagne] = computeScorecards([
      history('progresse', { initialQuality: 30, finalQuality: 70 }),
      history('stagne', { initialQuality: 68, finalQuality: 70 }),
    ]);
    expect(progresse.learningScore).toBeGreaterThan(stagne.learningScore);
  });

  it('ne descend jamais au-dessous du plancher de 20', () => {
    // Le dernier d'une ligue serrée n'a pas démérité, et un zéro affiché au
    // débriefing ferait taire une équipe qu'on veut faire parler.
    const cards = computeScorecards([
      history('excellent', { finalTreasuryMad: 1e12, averageMarketShare: 0.9,
        averageIaScore: 100, finalClimatSocial: 100, finalNotoriety: 100,
        finalPerceivedQuality: 100, finalSacScore: 100, averageStockoutRate: 0,
        finalQuality: 100, rdIntensity: 0.2, cumulativeNetIncomeMad: 1e11 }),
      history('desastreux', { finalTreasuryMad: -5e10, averageMarketShare: 0.02,
        averageIaScore: 10, finalClimatSocial: 5, finalNotoriety: 10,
        finalPerceivedQuality: 15, finalSacScore: 12, averageStockoutRate: 0.95,
        finalQuality: 20, rdIntensity: 0, cumulativeNetIncomeMad: -3e10 }),
    ]);
    const dernier = cards[1];
    expect(dernier.globalScore).toBeGreaterThanOrEqual(20);
    expect(dernier.globalScore).toBeLessThan(cards[0].globalScore);
  });

  it('pèse les quatre axes à égalité', () => {
    // Pondérer le financier reviendrait à retomber dans ce que le tableau de
    // bord prospectif sert précisément à corriger.
    const [card] = computeScorecards([history('seul')]);
    const moyenne =
      (card.financialScore + card.clientScore + card.processScore + card.learningScore) / 4;
    expect(card.globalScore).toBeCloseTo(moyenne, 10);
  });

  it('conserve la décomposition de chaque axe pour le débriefing', () => {
    const [card] = computeScorecards([history('a'), history('b')]);
    expect(card.axes).toHaveLength(4);
    for (const axis of card.axes) {
      expect(axis.components).toHaveLength(3);
      expect(axis.score).toBeCloseTo(
        axis.components.reduce((acc, c) => acc + c.normalized, 0) / 3, 6,
      );
    }
  });
});
