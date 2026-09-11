import { describe, expect, it } from 'vitest';

import { measuredForces } from './dashboard-view';
import type { CabinetOverlay, DasSeries } from '@/lib/dashboard-types';

/**
 * Le pouvoir de l'amont et de l'aval, mesuré plutôt que déduit.
 *
 * Sans benchmark, ces deux forces s'estiment au nombre d'acteurs indépendants
 * restants — honnête mais grossier : cinq fournisseurs dont un seul est fiable
 * ne valent pas cinq fournisseurs solides.
 */

const das = {
  dasId: 'das-1',
  name: 'Agro',
  forces: { entryBarrier: 40, substitution: 30, supplierPower: 55, distributorPower: 45, rivalry: 50 },
} as unknown as DasSeries;

function benchmark(
  studyKey: string,
  dasId: string | null,
  key: string,
  values: number[],
): CabinetOverlay {
  return {
    studyKey,
    tier: 'standard',
    errorMargin: 0.05,
    roundNumber: 1,
    dasId,
    subjects: values.map((value, i) => ({
      subjectId: `a${i}`,
      subjectName: `Acteur ${i}`,
      fields: [{ mode: 'estimate', key, label: key, value, errorMargin: 0.05, lower: value, upper: value }],
    })),
  } as CabinetOverlay;
}

describe('pouvoir mesuré de la filière', () => {
  it('retombe sur la déduction quand aucun benchmark n’est acheté', () => {
    const result = measuredForces([], das);
    expect(result.supplier).toBe(55);
    expect(result.distributor).toBe(45);
    expect(result.note).toBeNull();
  });

  it('retient le PLUS FORT du panel, pas la moyenne', () => {
    // C'est celui qui peut vous tordre le bras qui fixe le rapport de force,
    // pas la moyenne de ceux qui ne le peuvent pas.
    const result = measuredForces(
      [benchmark('benchmark_fourn', 'das-1', 'switching_cost', [10, 80, 25])],
      das,
    );
    expect(result.supplier).toBe(80);
  });

  it('ne mélange pas les domaines', () => {
    // Un benchmark sur le textile ne dit rien des fournisseurs de l'agro.
    const result = measuredForces(
      [benchmark('benchmark_fourn', 'autre-das', 'switching_cost', [90])],
      das,
    );
    expect(result.supplier).toBe(55);
    expect(result.note).toBeNull();
  });

  it('nomme les côtés effectivement mesurés', () => {
    const amont = measuredForces(
      [benchmark('benchmark_fourn', 'das-1', 'switching_cost', [70])],
      das,
    );
    expect(amont.note).toContain('amont');
    expect(amont.note).not.toContain('aval');

    const deux = measuredForces(
      [
        benchmark('benchmark_fourn', 'das-1', 'switching_cost', [70]),
        benchmark('benchmark_distri', 'das-1', 'negotiating_strength', [65]),
      ],
      das,
    );
    expect(deux.note).toContain('amont et aval');
    expect(deux.distributor).toBe(65);
  });
});
