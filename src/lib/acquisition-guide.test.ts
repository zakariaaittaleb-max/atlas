import { describe, expect, it } from 'vitest';

import type { FieldDisclosure } from '@/lib/consulting-types';

import { intervalOf, priceGuide, reserveRange, typeFactor } from './acquisition-guide';

describe('reserveRange', () => {
  it('reprend la règle du moteur sur des valeurs connues', () => {
    // 1 Md DH de CA, multiple 5, cible industrielle, appétence 40 :
    // 1e9 × 5 × 1 × 0,35 × (1 − 0,4 × 0,35) = 1,505 Md DH
    const range = reserveRange({ lower: 1e9, upper: 1e9 }, { lower: 40, upper: 40 }, 5, 'cible_acquisition');
    expect(range.lower).toBeCloseTo(1.505e9, -3);
    expect(range.upper).toBeCloseTo(1.505e9, -3);
  });

  it('élargit la fourchette quand l’appétence est inconnue', () => {
    const range = reserveRange({ lower: 1e9, upper: 1e9 }, { lower: 0, upper: 100 }, 5, 'cible_acquisition');
    expect(range.lower).toBeCloseTo(1e9 * 5 * 0.35 * 0.65, -3);
    expect(range.upper).toBeCloseTo(1e9 * 5 * 0.35, -3);
  });

  it('valorise un maillon de filière moins cher que l’industriel qu’il sert', () => {
    expect(typeFactor('distributeur')).toBeLessThan(typeFactor('fournisseur'));
    expect(typeFactor('fournisseur')).toBeLessThan(typeFactor('cible_acquisition'));
  });
});

describe('intervalOf', () => {
  it('lit chaque mode de divulgation', () => {
    const fallback = { lower: 0, upper: 100 };
    expect(intervalOf({ mode: 'exact', key: 'k', label: 'l', value: 7 }, fallback)).toEqual({ lower: 7, upper: 7 });
    expect(intervalOf({ mode: 'estimate', key: 'k', label: 'l', value: 10, errorMargin: 0.1, lower: 9, upper: 11 }, fallback))
      .toEqual({ lower: 9, upper: 11 });
    expect(intervalOf({ mode: 'withheld', key: 'k', label: 'l', reason: 'palier' }, fallback)).toEqual(fallback);
    expect(intervalOf(undefined, fallback)).toEqual(fallback);
  });
});

describe('priceGuide', () => {
  const fields: FieldDisclosure[] = [
    { mode: 'estimate', key: 'revenue_mad', label: 'CA', value: 1e9, errorMargin: 0.05, lower: 0.95e9, upper: 1.05e9 },
    { mode: 'band', key: 'divest_appetite', label: 'Appétence', band: 'moyenne', bandIndex: 1, lower: 30, upper: 50 },
    { mode: 'withheld', key: 'hidden_liabilities_mad', label: 'Passifs', reason: 'palier approfondi' },
  ];

  it('resserre la fourchette quand une due diligence a été commandée', () => {
    const publicRevenue = { lower: 0.6e9, upper: 1.4e9 };
    const free = priceGuide({ multiple: 5, actorType: 'cible_acquisition', publicRevenue, study: null })!;
    const paid = priceGuide({ multiple: 5, actorType: 'cible_acquisition', publicRevenue, study: { tier: 'standard', fields } })!;
    expect(free.source).toBe('place');
    expect(paid.source).toBe('due_diligence');
    expect(paid.maxMad - paid.minMad).toBeLessThan(free.maxMad - free.minMad);
    expect(paid.liabilitiesMad).toBeNull();
  });

  it('ne devine rien pour un maillon de filière sans due diligence', () => {
    expect(priceGuide({ multiple: 5, actorType: 'fournisseur', publicRevenue: null, study: null })).toBeNull();
  });
});
