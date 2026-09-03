import { describe, expect, it } from 'vitest';

import {
  DIAL_EXPLANATIONS, DIFFICULTY_PRESETS, dialsFor, paramOverrides,
} from './difficulty';
import { allocateMarketShares } from './market';
import { DEFAULT_PARAMS } from './params';

describe('préréglages', () => {
  it('ordonne les trois niveaux du plus clément au plus dur, molette par molette', () => {
    const { decouverte: d, standard: s, exigeant: e } = DIFFICULTY_PRESETS;

    expect(d.marketGrowth).toBeGreaterThan(s.marketGrowth);
    expect(s.marketGrowth).toBeGreaterThan(e.marketGrowth);

    expect(d.alignmentTolerance).toBeGreaterThan(s.alignmentTolerance);
    expect(s.alignmentTolerance).toBeGreaterThan(e.alignmentTolerance);

    expect(d.financialSlack).toBeGreaterThan(s.financialSlack);
    expect(s.financialSlack).toBeGreaterThan(e.financialSlack);

    expect(d.ecosystemPower).toBeLessThan(s.ecosystemPower);
    expect(s.ecosystemPower).toBeLessThan(e.ecosystemPower);

    expect(d.competitivenessExponent).toBeLessThan(s.competitivenessExponent);
    expect(s.competitivenessExponent).toBeLessThan(e.competitivenessExponent);
  });

  it('laisse « standard » neutre sur les molettes qui ont un neutre', () => {
    const s = DIFFICULTY_PRESETS.standard;
    expect(s.marketGrowth).toBe(1);
    expect(s.alignmentTolerance).toBe(1);
    expect(s.financialSlack).toBe(1);
    expect(s.ecosystemPower).toBe(1);
  });

  it('explique chaque molette au facilitateur', () => {
    for (const key of Object.keys(DIFFICULTY_PRESETS.standard)) {
      expect(DIAL_EXPLANATIONS[key as keyof typeof DIAL_EXPLANATIONS]).toBeTruthy();
    }
  });
});

describe('réglage sur mesure', () => {
  it('part de « standard » et n’applique que ce qui est posé', () => {
    const d = dialsFor('sur_mesure', { marketGrowth: 0.2 });
    expect(d.marketGrowth).toBe(0.2);
    expect(d.alignmentTolerance).toBe(DIFFICULTY_PRESETS.standard.alignmentTolerance);
  });

  it('borne les valeurs aberrantes plutôt que de casser le moteur', () => {
    const d = dialsFor('sur_mesure', {
      marketGrowth: 99, competitivenessExponent: 0, financialSlack: -5,
    });
    expect(d.marketGrowth).toBeLessThanOrEqual(3);
    expect(d.competitivenessExponent).toBeGreaterThanOrEqual(1);
    expect(d.financialSlack).toBeGreaterThanOrEqual(0.5);
  });

  it('résiste à une valeur non finie', () => {
    const d = dialsFor('sur_mesure', { marketGrowth: Number.NaN });
    expect(Number.isFinite(d.marketGrowth)).toBe(true);
  });
});

describe('surcharges de paramètres', () => {
  it('ne produit que des clés que le moteur lit RÉELLEMENT', () => {
    // Sans ce test, une molette peut être réglée sans aucun effet : c'est
    // précisément ce qui était arrivé à `quality_floor` et `rate_delta`.
    for (const key of Object.keys(paramOverrides(DIFFICULTY_PRESETS.standard))) {
      expect(DEFAULT_PARAMS).toHaveProperty(key);
    }
  });

  it('resserre la tolérance d’alignement en mode exigeant', () => {
    const dur = paramOverrides(DIFFICULTY_PRESETS.exigeant)['alignment.saturation_gap'];
    const doux = paramOverrides(DIFFICULTY_PRESETS.decouverte)['alignment.saturation_gap'];
    expect(dur).toBeLessThan(doux);
  });

  it('rend la banque plus dure quand la marge financière se resserre', () => {
    const dur = paramOverrides(DIFFICULTY_PRESETS.exigeant)['finance.risk_margin_per_leverage'];
    const doux = paramOverrides(DIFFICULTY_PRESETS.decouverte)['finance.risk_margin_per_leverage'];
    expect(dur).toBeGreaterThan(doux);
  });
});

describe('exposant de compétitivité — le partage des parts', () => {
  const duel = [
    { teamId: 'A', competitiveness: 0.6, coverageCap: 1, blueOcean: false },
    { teamId: 'B', competitiveness: 0.5, coverageCap: 1, blueOcean: false },
  ];

  it('partage strictement au prorata à exposant 1', () => {
    const { shares } = allocateMarketShares(duel, 1);
    expect(shares.A / shares.B).toBeCloseTo(1.2, 6);
  });

  it('concentre davantage à exposant élevé — le mieux placé rafle plus', () => {
    const doux = allocateMarketShares(duel, 1.3).shares;
    const dur = allocateMarketShares(duel, 2.5).shares;
    expect(dur.A).toBeGreaterThan(doux.A);
    expect(dur.A / dur.B).toBeGreaterThan(doux.A / doux.B);
  });

  it('conserve la somme des parts à 1, quel que soit l’exposant', () => {
    for (const e of [1, 1.3, 1.8, 2.5, 4]) {
      const { shares } = allocateMarketShares(duel, e);
      expect(shares.A + shares.B).toBeCloseTo(1, 6);
    }
  });

  it('ne change pas l’ORDRE du classement', () => {
    for (const e of [1, 1.8, 2.5]) {
      const { shares } = allocateMarketShares(duel, e);
      expect(shares.A).toBeGreaterThan(shares.B);
    }
  });

  it('respecte toujours le plafond de couverture', () => {
    const { shares } = allocateMarketShares([
      { teamId: 'A', competitiveness: 0.9, coverageCap: 0.3, blueOcean: false },
      { teamId: 'B', competitiveness: 0.2, coverageCap: 1, blueOcean: false },
    ], 2.5);
    expect(shares.A).toBeLessThanOrEqual(0.3 + 1e-9);
  });
});
