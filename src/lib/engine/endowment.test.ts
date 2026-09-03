import { describe, expect, it } from 'vitest';

import { computeEndowment } from './endowment';
import { buildParams } from './params';
import type { DasParameters } from './types';

const params = buildParams();

const agro: DasParameters = {
  dasId: 'das-agro',
  sectorKey: 'agro',
  referenceUnitPriceMad: 100,
  referenceUnitCostMad: 55,
  fixedCostBaseMad: 8_000_000,
  priceElasticity: 2.0,
  learningRate: 0.88,
  valuationMultiple: 5.5,
  workingCapitalDays: 75,
  vrioEntryBarrier: 0.3,
  unitCapacityCostMad: 220,
  capacityDepreciation: 0.06,
  capacityFromHeadcount: false,
  headcountProductivity: null,
  referenceCumulativeVolumeUnits: 0,
};

const numerique: DasParameters = {
  ...agro,
  dasId: 'das-num',
  sectorKey: 'numerique',
  capacityFromHeadcount: true,
  headcountProductivity: 500,
  workingCapitalDays: 55,
};

describe('dotation initiale', () => {
  it('donne à chaque équipe une part équitable du marché, presque servable', () => {
    // Marché de 1 Md DH à 100 DH → 10 M d'unités, pour 4 équipes.
    const e = computeEndowment(agro, 1_000_000_000, 4, params);
    expect(e.capacityUnits).toBeCloseTo((10_000_000 / 4) * 0.95, 6);
    expect(e.expectedRevenueMad).toBeCloseTo(237_500_000, 6);
  });

  it('s’adapte à la taille du pool', () => {
    const troisEquipes = computeEndowment(agro, 1_000_000_000, 3, params);
    const huitEquipes = computeEndowment(agro, 1_000_000_000, 8, params);

    // Régression : avec une capacité fixée en dur, un pool de huit équipes
    // subissait une rupture massive dès le premier tour.
    expect(huitEquipes.capacityUnits).toBeCloseTo(troisEquipes.capacityUnits * (3 / 8), 6);
  });

  it('s’adapte à la taille du DAS', () => {
    const gros = computeEndowment(agro, 190_000_000_000, 4, params);
    const petit = computeEndowment(agro, 22_000_000_000, 4, params);
    expect(gros.capacityUnits / petit.capacityUnits).toBeCloseTo(190 / 22, 6);
    expect(gros.treasuryMad).toBeGreaterThan(petit.treasuryMad);
  });

  it('ouvre la courbe d’expérience au volume de dotation', () => {
    // Toutes les équipes doivent démarrer exactement au coût de référence.
    const e = computeEndowment(agro, 1_000_000_000, 4, params);
    expect(e.cumulativeVolumeUnits).toBe(e.capacityUnits);
  });

  it('dote un BFR cohérent avec le chiffre d’affaires de départ', () => {
    // Un BFR initial nul ferait apparaître au tour 1 un besoin de financement
    // fictif, imputé à des décisions que personne n'a prises.
    const e = computeEndowment(agro, 1_000_000_000, 4, params);
    expect(e.workingCapitalMad).toBeCloseTo(e.expectedRevenueMad * (75 / 360), 6);
    expect(e.workingCapitalMad).toBeGreaterThan(0);
  });

  it('laisse une trésorerie de l’ordre de deux mois et demi de chiffre d’affaires', () => {
    const e = computeEndowment(agro, 1_000_000_000, 4, params);
    expect(e.treasuryMad / e.expectedRevenueMad).toBeCloseTo(2.5 / 12, 6);
    expect(e.debtMad / e.equityMad).toBeCloseTo(0.25, 6);
  });

  it('dérive l’effectif de la productivité sur les DAS de service', () => {
    // Sur le numérique, la capacité EST l'effectif : le recrutement y remplace
    // l'investissement industriel.
    const e = computeEndowment(numerique, 1_000_000_000, 4, params);
    expect(e.headcount).toBe(Math.round(e.capacityUnits / 500));
  });

  it('ne produit jamais d’effectif nul', () => {
    const e = computeEndowment(agro, 1_000, 12, params);
    expect(e.headcount).toBeGreaterThanOrEqual(1);
  });

  it('est identique pour toutes les équipes d’un pool', () => {
    // La fonction ne prend aucun identifiant d'équipe : l'asymétrie est
    // impossible par construction, pas seulement par discipline.
    const a = computeEndowment(agro, 1_000_000_000, 5, params);
    const b = computeEndowment(agro, 1_000_000_000, 5, params);
    expect(a).toEqual(b);
  });
});
