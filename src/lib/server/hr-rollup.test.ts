import { describe, expect, it } from 'vitest';

import { computeHrRollup } from './hr-rollup';

/**
 * La consolidation RH est la projection de niveau ÉQUIPE des décisions prises
 * domaine par domaine. C'est elle que le moteur lit pour la masse salariale et
 * le talent_mix — si elle se trompe, le tour se calcule faux sans que rien ne
 * le signale.
 */

const decision = (over: Record<string, unknown> = {}) => ({
  das_id: 'agro',
  hire_operateurs: 0,
  hire_techniciens: 0,
  hire_experts: 0,
  hire_cadres: 0,
  layoffs: 0,
  internal_transfers_in: 0,
  avg_salary_brut_mad: 5800,
  training_budget_mad: 0,
  ...over,
});

describe('computeHrRollup', () => {
  it('additionne les recrutements de tous les domaines', () => {
    const out = computeHrRollup(
      [
        decision({ das_id: 'agro', hire_operateurs: 120, hire_techniciens: 30 }),
        decision({ das_id: 'num', hire_experts: 45, hire_cadres: 5 }),
      ],
      [
        { das_id: 'agro', round_number: 0, headcount: 1000 },
        { das_id: 'num', round_number: 0, headcount: 200 },
      ],
      0,
    );

    expect(out.hire_operateurs).toBe(120);
    expect(out.hire_techniciens).toBe(30);
    expect(out.hire_experts).toBe(45);
    expect(out.hire_cadres).toBe(5);
    expect(out.headcount_start).toBe(1200);
  });

  it('retient le dernier exercice connu de chaque domaine, pas leur somme', () => {
    // Un domaine porte une ligne par exercice écoulé. Les additionner
    // gonflerait l'effectif de tout l'historique.
    const out = computeHrRollup(
      [],
      [
        { das_id: 'agro', round_number: -1, headcount: 900 },
        { das_id: 'agro', round_number: 0, headcount: 1000 },
      ],
      0,
    );

    expect(out.headcount_start).toBe(1000);
  });

  it('pondère le salaire moyen par l’effectif du domaine', () => {
    // 1 000 personnes à 5 000 DH et 100 à 20 000 DH : la moyenne arithmétique
    // dirait 12 500, ce qui multiplierait la masse salariale du groupe.
    const out = computeHrRollup(
      [
        decision({ das_id: 'agro', avg_salary_brut_mad: 5000 }),
        decision({ das_id: 'num', avg_salary_brut_mad: 20000 }),
      ],
      [
        { das_id: 'agro', round_number: 0, headcount: 1000 },
        { das_id: 'num', round_number: 0, headcount: 100 },
      ],
      0,
    );

    expect(out.avg_salary_brut_mad).toBeCloseTo((5000 * 1000 + 20000 * 100) / 1100, 6);
    expect(out.avg_salary_brut_mad).toBeLessThan(12500);
  });

  it('ne compte pas les transferts internes comme des recrutements', () => {
    // Ils déplacent quelqu'un d'un domaine à l'autre : les additionner
    // ferait apparaître au niveau groupe des gens déjà présents.
    const out = computeHrRollup(
      [decision({ internal_transfers_in: 80 })],
      [{ das_id: 'agro', round_number: 0, headcount: 1000 }],
      0,
    );

    const hires = out.hire_operateurs + out.hire_techniciens
      + out.hire_experts + out.hire_cadres;
    expect(hires).toBe(0);
  });

  it('somme les licenciements dans restructuring_count', () => {
    const out = computeHrRollup(
      [
        decision({ das_id: 'agro', layoffs: 60 }),
        decision({ das_id: 'num', layoffs: 15 }),
      ],
      [],
      1200,
    );

    expect(out.restructuring_count).toBe(75);
  });

  it('retombe sur l’effectif du groupe quand aucun état par domaine n’existe', () => {
    // Session provisionnée avant le module RH par domaine. Un zéro ferait
    // cesser la production pour une raison qui n'est pas une décision.
    const out = computeHrRollup([decision()], [], 1234);

    expect(out.headcount_start).toBe(1234);
  });

  it('rend des valeurs neutres sans aucune décision', () => {
    // Une équipe qui n'a rien décidé ne doit pas produire de ligne aberrante :
    // le moteur la lira telle quelle.
    const out = computeHrRollup([], [], 0);

    expect(out).toEqual({
      headcount_start: 0,
      hire_operateurs: 0,
      hire_techniciens: 0,
      hire_experts: 0,
      hire_cadres: 0,
      avg_salary_brut_mad: 5800,
      training_budget_mad: 0,
      restructuring_count: 0,
    });
  });
});
