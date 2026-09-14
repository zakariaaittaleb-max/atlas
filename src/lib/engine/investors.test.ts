import { describe, expect, it } from 'vitest';

import { equityIssueTerms, investorAttractiveness, investorRateAdjustment, type InvestorInput } from './investors';
import { buildParams } from './params';

const params = buildParams();

function base(over: Partial<InvestorInput> = {}): InvestorInput {
  return {
    netIncomeMad: 12_000_000,
    equityOpenMad: 100_000_000,
    equityEndMad: 112_000_000,
    revenueMad: 500_000_000,
    previousRevenueMad: 480_000_000,
    debtEndMad: 40_000_000,
    treasuryStatus: 'sain',
    iaScore: 70,
    dividendMad: 0,
    previousDividendMad: 0,
    distributableIncomeMad: 10_000_000,
    previousScore: null,
    ...over,
  };
}

describe('attractivité pour les investisseurs', () => {
  it('récompense un groupe rentable, en croissance, peu endetté et cohérent', () => {
    const view = investorAttractiveness(
      base({ netIncomeMad: 22_000_000, revenueMad: 560_000_000, debtEndMad: 10_000_000, iaScore: 85 }),
      params,
    );
    expect(view.score).toBeGreaterThan(75);
    expect(view.components).toHaveLength(5);
  });

  it('sanctionne un groupe en perte, surendetté et en restructuration', () => {
    const view = investorAttractiveness(
      base({
        netIncomeMad: -15_000_000, equityEndMad: 85_000_000, debtEndMad: 250_000_000,
        revenueMad: 420_000_000, treasuryStatus: 'restructuration', iaScore: 35,
      }),
      params,
    );
    expect(view.score).toBeLessThan(35);
  });

  it('lit une baisse du dividende comme un signal négatif', () => {
    const maintenu = investorAttractiveness(base({ dividendMad: 4_000_000, previousDividendMad: 4_000_000 }), params);
    const coupe = investorAttractiveness(base({ dividendMad: 1_000_000, previousDividendMad: 4_000_000 }), params);

    expect(coupe.dividendCut).toBe(true);
    expect(maintenu.dividendCut).toBe(false);
    const part = (v: typeof coupe) => v.components.find((c) => c.key === 'distribution')!.score;
    expect(part(coupe)).toBeLessThan(part(maintenu));
    expect(coupe.score).toBeLessThan(maintenu.score);
  });

  it('attend une entreprise mûre au guichet, et pardonne la rétention d’une entreprise en croissance', () => {
    const part = (v: ReturnType<typeof investorAttractiveness>) =>
      v.components.find((c) => c.key === 'distribution')!.score;

    // Mûre : croissance nulle. Distribuer la moitié vaut mieux que tout garder.
    const mureRetient = investorAttractiveness(base({ previousRevenueMad: 500_000_000 }), params);
    const mureDistribue = investorAttractiveness(
      base({ previousRevenueMad: 500_000_000, dividendMad: 5_000_000 }), params,
    );
    expect(part(mureDistribue)).toBeGreaterThan(part(mureRetient));

    // En croissance rentable : tout garder n'est pas une faute.
    const croissance = investorAttractiveness(
      base({ netIncomeMad: 20_000_000, revenueMad: 600_000_000 }), params,
    );
    expect(part(croissance)).toBe(100);
  });

  it('garde la mémoire du tour précédent', () => {
    const sansMemoire = investorAttractiveness(base(), params);
    const apresUneMauvaiseAnnee = investorAttractiveness(base({ previousScore: 10 }), params);

    expect(apresUneMauvaiseAnnee.rawScore).toBe(sansMemoire.rawScore);
    expect(apresUneMauvaiseAnnee.score).toBeLessThan(sansMemoire.score);
  });
});

describe('conditions d’une levée de fonds propres', () => {
  it('ne facture que les frais de base sans historique ou au-dessus du seuil', () => {
    expect(equityIssueTerms(null, 100_000_000, params).costPct).toBeCloseTo(0.02, 6);
    expect(equityIssueTerms(80, 100_000_000, params).costPct).toBeCloseTo(0.02, 6);
  });

  it('ajoute une décote croissante quand l’attractivité baisse', () => {
    const moyen = equityIssueTerms(40, 100_000_000, params).costPct;
    const faible = equityIssueTerms(10, 100_000_000, params).costPct;
    expect(moyen).toBeGreaterThan(0.02);
    expect(faible).toBeGreaterThan(moyen);
    expect(equityIssueTerms(0, 100_000_000, params).costPct).toBeCloseTo(0.22, 6);
  });

  it('plafonne la levée selon l’attractivité et les fonds propres', () => {
    expect(equityIssueTerms(100, 100_000_000, params).capMad).toBeCloseTo(100_000_000, 0);
    expect(equityIssueTerms(0, 100_000_000, params).capMad).toBeCloseTo(10_000_000, 0);
    expect(equityIssueTerms(50, -5, params).capMad).toBe(0);
  });

  it('ajuste la prime de risque bancaire dans les deux sens', () => {
    expect(investorRateAdjustment(null, params)).toBe(0);
    expect(investorRateAdjustment(50, params)).toBe(0);
    expect(investorRateAdjustment(0, params)).toBeGreaterThan(0);
    expect(investorRateAdjustment(100, params)).toBeLessThan(0);
  });
});
