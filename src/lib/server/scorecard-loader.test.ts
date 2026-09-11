import { describe, expect, it } from 'vitest';

import { weightedShare } from './scorecard-loader';

/**
 * La part de marché moyenne du palmarès se moyennait sans base : 50 % d'un
 * marché de 50 Md et 10 % d'un marché de 190 Md comptaient pareil. Un groupe
 * pouvait donc paraître dominant en régnant sur le plus petit domaine de son
 * portefeuille, et le classement final s'en nourrissait.
 */
describe('part de marché moyenne du palmarès', () => {
  it('pondère par la taille des marchés joués', () => {
    const share = weightedShare([
      { market_share_pct: 0.5, market_size_mad: 50e9 },
      { market_share_pct: 0.1, market_size_mad: 190e9 },
    ]);

    // (0,5×50 + 0,1×190) / 240 = 0,183 — et non la moyenne simple de 0,30.
    expect(share).toBeCloseTo(0.1833, 4);
  });

  it('retombe sur la moyenne simple quand la taille du marché manque', () => {
    // Tours anciens : la colonne existait sans être alimentée. Rendre zéro
    // aurait effacé la part de marché de tout un palmarès.
    const share = weightedShare([
      { market_share_pct: 0.4 },
      { market_share_pct: 0.2 },
    ]);
    expect(share).toBeCloseTo(0.3, 6);
  });

  it('rend zéro sans aucune mesure', () => {
    expect(weightedShare([])).toBe(0);
  });
});
