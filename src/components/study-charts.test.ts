import { describe, expect, it } from 'vitest';

import { plottableOf, type ChartSubject } from './study-charts';

/**
 * Les indicateurs traçables se déduisent du livrable.
 *
 * Ils étaient énumérés en dur, ce qui ne marchait que pour l'étude
 * concurrentielle : les quatre autres n'avaient aucune courbe alors que leurs
 * données sont bien historisées.
 */

function subject(
  fields: { key: string; label: string; unit?: string }[],
  history: Record<string, number | null>[],
): ChartSubject {
  return {
    subjectId: 's1',
    subjectName: 'Sujet',
    fields,
    history: history.map((values, i) => ({ roundNumber: i, values })),
  };
}

describe('indicateurs traçables', () => {
  it('retient un indicateur qui bouge', () => {
    const result = plottableOf([
      subject(
        [{ key: 'revenue_mad', label: "Chiffre d'affaires", unit: 'DH' }],
        [{ revenue_mad: 100 }, { revenue_mad: 140 }],
      ),
    ]);
    expect(result).toEqual([
      { key: 'revenue_mad', label: "Chiffre d'affaires", unit: 'DH' },
    ]);
  });

  it('écarte une grandeur structurelle, qui ne bouge jamais', () => {
    // L'exigence de qualité d'un segment ou l'exposition PESTEL d'une filière
    // sont des constantes : les tracer donnerait une droite horizontale qu'on
    // prendrait pour une panne d'affichage.
    const result = plottableOf([
      subject(
        [{ key: 'quality_requirement', label: 'Exigence de qualité' }],
        [{ quality_requirement: 70 }, { quality_requirement: 70 }],
      ),
    ]);
    expect(result).toEqual([]);
  });

  it('écarte un indicateur qui n’a qu’un seul point', () => {
    const result = plottableOf([
      subject([{ key: 'revenue_mad', label: 'CA', unit: 'DH' }], [{ revenue_mad: 100 }]),
    ]);
    expect(result).toEqual([]);
  });

  it('retient un indicateur qui bouge chez UN sujet seulement', () => {
    // Deux concurrents, l'un stable et l'autre non : la comparaison reste
    // porteuse, c'est même exactement ce qu'on veut voir.
    const stable = subject(
      [{ key: 'market_share', label: 'Part' , unit: '%' }],
      [{ market_share: 30 }, { market_share: 30 }],
    );
    const mouvant: ChartSubject = {
      ...stable,
      subjectId: 's2',
      history: [
        { roundNumber: 0, values: { market_share: 20 } },
        { roundNumber: 1, values: { market_share: 45 } },
      ],
    };
    expect(plottableOf([stable, mouvant]).map((m) => m.key)).toEqual(['market_share']);
  });

  it('ne trace rien quand aucun sujet ne porte de livrable', () => {
    expect(plottableOf([{ subjectId: 's', subjectName: 'S' }])).toEqual([]);
  });

  it('classe l’unité du champ pour le formatage de l’axe', () => {
    const result = plottableOf([
      subject(
        [
          { key: 'a', label: 'Montant', unit: 'DH' },
          { key: 'b', label: 'Taux', unit: '%' },
          { key: 'c', label: 'Indice' },
        ],
        [{ a: 1, b: 1, c: 1 }, { a: 2, b: 2, c: 2 }],
      ),
    ]);
    expect(result.map((m) => m.unit)).toEqual(['DH', '%', 'score']);
  });
});
