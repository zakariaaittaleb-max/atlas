import { describe, expect, it } from 'vitest';

import { computeDasVitals, formatSignedPct, toneOf } from './das-vitals';

const row = (dasId: string, roundNumber: number, revenueMad: number, marketShare: number, ebitdaMad: number | null) =>
  ({ dasId, roundNumber, revenueMad, marketShare, ebitdaMad });

describe('computeDasVitals', () => {
  it('lit croissance, part, poids et marge sur le dernier exercice clos', () => {
    const vitals = computeDasVitals(
      [
        row('agro', 3, 6_740e6, 0.279, -890e6),
        row('agro', 4, 4_615e6, 0.214, -3_214e6),
        row('textile', 3, 8_396e6, 0.448, 2_777e6),
        row('textile', 4, 8_337e6, 0.448, 2_535e6),
      ],
      ['agro', 'textile'],
    );

    const agro = vitals.get('agro')!;
    expect(agro.roundNumber).toBe(4);
    expect(agro.growth).toBeCloseTo(4_615 / 6_740 - 1, 6);
    expect(agro.marketShareDelta).toBeCloseTo(0.214 - 0.279, 6);
    expect(agro.weightInGroup).toBeCloseTo(4_615 / (4_615 + 8_337), 6);
    expect(agro.margin).toBeCloseTo(-3_214 / 4_615, 6);
  });

  it('ne compte pas un domaine cédé dans le poids du Groupe', () => {
    const vitals = computeDasVitals(
      [row('garde', 2, 100, 0.1, 10), row('cede', 2, 300, 0.2, 30)],
      ['garde'],
    );
    expect(vitals.get('garde')!.weightInGroup).toBe(1);
    expect(vitals.has('cede')).toBe(false);
  });

  it('laisse la croissance et la marge inconnues plutôt que d’inventer un zéro', () => {
    const vitals = computeDasVitals([row('seul', 0, 90e9, 0.5, null)], ['seul']);
    const seul = vitals.get('seul')!;
    expect(seul.growth).toBeNull();
    expect(seul.marketShareDelta).toBeNull();
    expect(seul.margin).toBeNull();
  });

  it('ignore un domaine sans exercice clos', () => {
    expect(computeDasVitals([], ['neuf']).has('neuf')).toBe(false);
  });
});

describe('formatSignedPct', () => {
  it('écrit toujours le signe', () => {
    expect(formatSignedPct(0.06)).toBe('+6,0\u202f%');
    expect(formatSignedPct(-0.007)).toBe('−0,7\u202f%');
    expect(formatSignedPct(0)).toBe('0,0\u202f%');
    expect(formatSignedPct(null)).toBe('—');
  });

  it('donne un ton aux variations', () => {
    expect(toneOf(0.1)).toBe('positive');
    expect(toneOf(-0.1)).toBe('negative');
    expect(toneOf(0)).toBeNull();
  });
});
