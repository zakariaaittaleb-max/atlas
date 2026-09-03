import { describe, expect, it } from 'vitest';

import {
  breakEvenUnits, computeIndicators, leverageView, readLeverage, readProfitMargin,
} from './indicators';

const base = {
  revenueMad: 1000, variableCostsMad: 400, fixedCostsMad: 200, payrollMad: 150,
  marketingMad: 50, rdMad: 30, channelCostMad: 70, otherCostsMad: 20,
  netIncomeMad: 80, capitalEmployedMad: 800, investmentMad: 60,
};

describe('indicateurs de gestion', () => {
  it('additionne tous les postes dans le total des coûts', () => {
    expect(computeIndicators(base).totalCostsMad).toBe(920);
  });

  it('dit ce qui reste sur 100 DH vendus', () => {
    expect(computeIndicators(base).profitMarginPct).toBeCloseTo(8, 6);
  });

  it('rapporte le résultat aux capitaux immobilisés', () => {
    expect(computeIndicators(base).roiPct).toBeCloseTo(10, 6);
  });

  it('ne renvoie pas un rendement infini faute de capitaux', () => {
    // Un DAS sans actif ne doit pas trôner en tête du classement.
    expect(computeIndicators({ ...base, capitalEmployedMad: 0 }).roiPct).toBe(0);
  });

  it('distingue le résultat de la trésorerie réellement dégagée', () => {
    const i = computeIndicators(base);
    expect(i.cashGeneratedMad).toBe(20);
    expect(i.cashGeneratedMad).toBeLessThan(base.netIncomeMad);
  });

  it('rend une caisse négative quand on réinvestit plus qu’on ne gagne', () => {
    expect(computeIndicators({ ...base, investmentMad: 500 }).cashGeneratedMad).toBe(-420);
  });

  it('ne divise pas par zéro sans chiffre d’affaires', () => {
    const i = computeIndicators({ ...base, revenueMad: 0 });
    expect(Number.isFinite(i.profitMarginPct)).toBe(true);
    expect(Number.isFinite(i.costPerRevenuePct)).toBe(true);
  });
});

describe('seuil de rentabilité', () => {
  it('donne le volume qui couvre les coûts fixes', () => {
    expect(breakEvenUnits(100, 60, 40_000)).toBe(1000);
  });

  it('n’existe PAS quand chaque unité vendue perd de l’argent', () => {
    // Aucun volume ne sauve l'affaire : vendre plus aggrave la perte.
    expect(breakEvenUnits(50, 60, 40_000)).toBeNull();
    expect(breakEvenUnits(60, 60, 40_000)).toBeNull();
  });
});

describe('effet de levier', () => {
  it('reconnaît un levier favorable quand l’outil rapporte plus que la dette', () => {
    // Outil à 10 %, dette à 6 %.
    const v = leverageView(80, 100, 500, 500, 30);
    expect(v.favourable).toBe(true);
    expect(v.leverageEffectPts).toBeGreaterThan(0);
  });

  it('reconnaît un levier défavorable — et le nomme', () => {
    // Outil à 4 %, dette à 8 %.
    const v = leverageView(-20, 40, 500, 500, 40);
    expect(v.favourable).toBe(false);
    expect(v.leverageEffectPts).toBeLessThan(0);
    expect(readLeverage(v)).toContain('retire');
  });

  it('amplifie l’effet avec le montant emprunté, dans les deux sens', () => {
    const peu = leverageView(80, 100, 800, 200, 12);
    const beaucoup = leverageView(80, 100, 200, 800, 48);
    expect(Math.abs(beaucoup.leverageEffectPts))
      .toBeGreaterThan(Math.abs(peu.leverageEffectPts));
  });

  it('dit qu’il n’y a pas de levier sans dette', () => {
    const v = leverageView(80, 100, 1000, 0, 0);
    expect(v.leverageEffectPts).toBe(0);
    expect(readLeverage(v)).toContain('pas de dette');
  });

  it('nomme le seuil de bascule quand le levier est favorable', () => {
    const v = leverageView(80, 100, 500, 500, 30);
    expect(readLeverage(v)).toContain('%');
  });
});

describe('lecture en français courant', () => {
  it('alerte sans détour quand chaque vente perd de l’argent', () => {
    expect(readProfitMargin(-4)).toContain('aggrave la perte');
  });

  it('signale une marge trop mince pour absorber un imprévu', () => {
    expect(readProfitMargin(1.5)).toContain('trop mince');
  });

  it('énonce simplement une marge saine', () => {
    expect(readProfitMargin(9)).toContain('9.0 DH');
  });
});
