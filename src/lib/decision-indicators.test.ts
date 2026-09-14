import { describe, expect, it } from 'vitest';

import type { DashboardContext, DasPoint, DasSeries, GroupPoint } from '@/lib/dashboard-types';

import { INDICATOR_TOPICS, buildIndicatorSheet } from './decision-indicators';

function groupPoint(roundNumber: number, patch: Partial<GroupPoint> = {}): GroupPoint {
  return {
    roundNumber,
    treasuryMad: 18_000_000_000,
    revenueMad: 90_000_000_000,
    netIncomeMad: 1_000_000_000,
    grossMarginMad: 20_000_000_000,
    marginPct: 12,
    climatSocial: 70,
    iaScore: 70,
    bsc: null,
    ...patch,
  } as GroupPoint;
}

function dasPoint(roundNumber: number, patch: Partial<DasPoint> = {}): DasPoint {
  return {
    roundNumber,
    marketSharePct: 12.5,
    revenueMad: 40_000_000_000,
    grossMarginMad: 9_000_000_000,
    volumeSold: 1_200_000,
    volumeLost: 30_000,
    productionUnits: 1_250_000,
    competitivenessScore: 61,
    perceivedQuality: 58,
    notoriety: 44,
    pricePosition: 50,
    distributionCoverage: 80,
    utilisationRate: 91,
    inputStockUnits: 20_000,
    finishedStockUnits: 50_000,
    ...patch,
  };
}

function das(dasId: string, name: string, history: DasPoint[], share = 0.5): DasSeries {
  return {
    dasId,
    name,
    revenueShareOfGroup: share,
    grossMarginMad: 9_000_000_000,
    history,
    forces: { entryBarrier: 0, substitution: 0, supplierPower: 0, distributorPower: 0, rivalry: 0 },
    marketGrowth: null,
    relativeShare: null,
  } as DasSeries;
}

function context(patch: Partial<DashboardContext> = {}): DashboardContext {
  return {
    teamName: 'Équipe B',
    roundNumber: 2,
    hasResults: true,
    treasuryStatus: 'sain',
    group: [groupPoint(1), groupPoint(2, { treasuryMad: 17_000_000_000 })],
    das: [das('agro', 'Micarom', [dasPoint(1, { marketSharePct: 10 }), dasPoint(2)])],
    alignment: { score: 70, trend: null, sentence: 'Vos décisions servent la stratégie déclarée.', stuckInTheMiddle: false, drift: false, worstAxes: [] },
    cabinet: [],
    ...patch,
  } as DashboardContext;
}

describe('buildIndicatorSheet', () => {
  it('dit en clair qu’il n’y a rien à lire avant la première résolution', () => {
    const sheet = buildIndicatorSheet(context({ hasResults: false, group: [], das: [] }), 'das-prix', 'agro');
    expect(sheet.cards).toEqual([]);
    expect(sheet.roundNumber).toBeNull();
    expect(sheet.empty).toMatch(/première résolution/);
  });

  it('met en tête les chiffres du domaine que la décision touche', () => {
    const sheet = buildIndicatorSheet(context(), 'das-prix', 'agro');
    expect(sheet.dasName).toBe('Micarom');
    expect(sheet.roundNumber).toBe(2);
    expect(sheet.cards[0]).toMatchObject({ label: 'Part de marché', value: '12,5 %', scope: 'Domaine' });
  });

  it('exprime la variation d’une part en points, pas en pourcentage', () => {
    const share = buildIndicatorSheet(context(), 'das-prix', 'agro').cards[0];
    expect(share.delta).toMatchObject({ direction: 'up' });
    expect(share.delta?.label).toBe('↑ +2,5 pts');
  });

  it('lit la demande non servie à l’envers : la baisse est une bonne nouvelle', () => {
    const lost = buildIndicatorSheet(context(), 'das-prix', 'agro').cards.find((c) => c.label === 'Demande non servie');
    expect(lost?.polarity).toBe('inverted');
  });

  it('remplace la variation par une note quand un seul exercice est clos', () => {
    const sheet = buildIndicatorSheet(
      context({ group: [groupPoint(1)], das: [das('agro', 'Micarom', [dasPoint(1)])] }),
      'das-investissements',
      'agro',
    );
    expect(sheet.cards.every((c) => c.delta === null && c.note !== undefined)).toBe(true);
  });

  it('ne prend pas un zéro d’avant la première résolution pour une mesure', () => {
    const sheet = buildIndicatorSheet(
      context({
        group: [groupPoint(-1), groupPoint(0)],
        das: [das('agro', 'Micarom', [dasPoint(-1, { competitivenessScore: 0 }), dasPoint(0, { competitivenessScore: 0 })])],
      }),
      'das-prix',
      'agro',
    );
    const competitiveness = sheet.cards.find((c) => c.label === 'Compétitivité');
    expect(competitiveness).toMatchObject({ value: '—', delta: null, note: 'Mesuré à partir de la première résolution' });
    expect(sheet.cards.find((c) => c.label === 'Part de marché')?.value).toBe('12,5 %');
  });

  it('garde les chiffres du Groupe pour un domaine sans exercice clos, et le signale', () => {
    const sheet = buildIndicatorSheet(
      context({ das: [das('agro', 'Micarom', [])] }),
      'das-investissements',
      'agro',
    );
    expect(sheet.empty).toMatch(/Ce domaine/);
    expect(sheet.cards.map((c) => c.scope)).toEqual(['Groupe']);
  });

  it('ne joint le verdict d’alignement qu’aux fiches qui portent l’indice', () => {
    expect(buildIndicatorSheet(context(), 'das-strategie', 'agro').alignment).toMatch(/stratégie déclarée/);
    expect(buildIndicatorSheet(context(), 'das-prix', 'agro').alignment).toBeNull();
  });

  it('compose une carte par domaine pour décider lequel céder', () => {
    const sheet = buildIndicatorSheet(
      context({ das: [das('agro', 'Micarom', [dasPoint(2)], 0.6), das('tex', 'Filatex', [dasPoint(2)], 0.4)] }),
      'cession-vente',
      null,
    );
    const portfolio = sheet.cards.filter((c) => c.key.startsWith('portefeuille:'));
    expect(portfolio.map((c) => [c.label, c.value])).toEqual([
      ['Poids de Micarom', '60,0 %'],
      ['Poids de Filatex', '40,0 %'],
    ]);
  });

  it('produit une fiche lisible pour chaque sujet', () => {
    for (const topic of INDICATOR_TOPICS) {
      const sheet = buildIndicatorSheet(context(), topic, 'agro');
      expect(sheet.question.length).toBeGreaterThan(20);
      expect(sheet.cards.length).toBeGreaterThan(0);
      expect(sheet.cards.every((c) => c.value !== '' && c.hint.length > 0)).toBe(true);
    }
  });
});
