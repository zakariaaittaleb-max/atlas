import { describe, expect, it } from 'vitest';

import {
  budgetFit, BUDGET_TARGETS, hierarchyDepth, keyRolesFit, kpiFit,
  platformSynergy, strategicAxisFit, type Affinity, type OrgSnapshot,
} from './organisation';

const affinity = (over: Partial<Affinity> = {}): Affinity => ({
  domination_couts: 50, differenciation: 50,
  focus_couts: 50, focus_differenciation: 50, ...over,
});

const org = (over: Partial<OrgSnapshot> = {}): OrgSnapshot => ({
  structureType: 'fonctionnelle',
  delegationLevel: 50,
  strategicAxes: [],
  directionKpis: [],
  directionBudgets: [],
  positions: [],
  ...over,
});

describe('axes stratégiques', () => {
  it('pondère par le rang : le premier axe pèse plus que le troisième', () => {
    // « Choisir trois priorités » n'est un arbitrage que si l'ordre compte.
    const premierBon = strategicAxisFit(org({
      strategicAxes: [
        { key: 'a', priority: 1, affinity: affinity({ domination_couts: 100 }) },
        { key: 'b', priority: 3, affinity: affinity({ domination_couts: 0 }) },
      ],
    }), 'domination_couts');

    const premierMauvais = strategicAxisFit(org({
      strategicAxes: [
        { key: 'a', priority: 1, affinity: affinity({ domination_couts: 0 }) },
        { key: 'b', priority: 3, affinity: affinity({ domination_couts: 100 }) },
      ],
    }), 'domination_couts');

    expect(premierBon).toBeGreaterThan(premierMauvais);
  });

  it('ne récompense pas une équipe qui n’a rien choisi', () => {
    expect(strategicAxisFit(org(), 'differenciation')).toBe(0);
  });
});

describe('indicateurs de direction', () => {
  it('note la cohérence moyenne des KPI retenus', () => {
    const coherent = kpiFit(org({
      directionKpis: [
        { directionKey: 'production', kpiKey: 'cout', affinity: affinity({ domination_couts: 96 }) },
        { directionKey: 'achats', kpiKey: 'prix', affinity: affinity({ domination_couts: 94 }) },
      ],
    }), 'domination_couts');

    const contradictoire = kpiFit(org({
      directionKpis: [
        { directionKey: 'production', kpiKey: 'rebut', affinity: affinity({ domination_couts: 45 }) },
        { directionKey: 'technique', kpiKey: 'brevets', affinity: affinity({ domination_couts: 20 }) },
      ],
    }), 'domination_couts');

    expect(coherent).toBeGreaterThan(80);
    expect(contradictoire).toBeLessThan(50);
  });
});

describe('répartition budgétaire', () => {
  it('donne 100 à une allocation conforme au profil de la stratégie', () => {
    const cible = BUDGET_TARGETS.differenciation;
    const budgets = Object.entries(cible).map(([directionKey, part]) => ({
      directionKey, budgetMad: part * 1_000_000,
    }));
    expect(budgetFit(org({ directionBudgets: budgets }), 'differenciation')).toBeCloseTo(100, 4);
  });

  it('sanctionne une équipe qui déclare une chose et finance l’autre', () => {
    // Profil de domination par les coûts, stratégie déclarée : différenciation.
    const budgets = Object.entries(BUDGET_TARGETS.domination_couts).map(([k, part]) => ({
      directionKey: k, budgetMad: part * 1_000_000,
    }));
    const score = budgetFit(org({ directionBudgets: budgets }), 'differenciation');
    expect(score).toBeLessThan(70);
  });

  it('ne conclut pas à la cohérence quand rien n’est réparti', () => {
    // On ne peut pas inventer un alignement sur une décision non prise.
    expect(budgetFit(org(), 'domination_couts')).toBe(0);
  });
});

describe('postes clés', () => {
  const directionAffinity: Record<string, Affinity> = {
    production: affinity({ domination_couts: 95 }),
    technique: affinity({ domination_couts: 20, differenciation: 95 }),
    achats: affinity({ domination_couts: 90 }),
    rh: affinity({ differenciation: 88 }),
    commercial: affinity({ differenciation: 85 }),
    finance: affinity({ domination_couts: 70 }),
    qualite: affinity({ differenciation: 90 }),
  };

  const poste = (directionKey: string, isKeyPosition = true) => ({
    directionKey, hierarchyLevel: 2, headcount: 10, isKeyPosition,
  });

  it('récompense des postes clés cohérents avec la stratégie', () => {
    const score = keyRolesFit(
      org({ positions: [poste('production'), poste('achats')] }),
      'domination_couts', directionAffinity,
    );
    expect(score).toBeGreaterThan(85);
  });

  it('sanctionne la dispersion : tout déclarer clé, c’est ne rien prioriser', () => {
    const resserre = keyRolesFit(
      org({ positions: [poste('production'), poste('achats')] }),
      'domination_couts', directionAffinity,
    );
    const disperse = keyRolesFit(
      org({ positions: ['production','achats','finance','rh','commercial','qualite','technique']
        .map((d) => poste(d)) }),
      'domination_couts', directionAffinity,
    );
    expect(disperse).toBeLessThan(resserre);
  });
});

describe('profondeur hiérarchique', () => {
  it('distingue une organisation plate d’une pyramide', () => {
    const plate = hierarchyDepth(org({
      positions: [1, 2].map((l) => ({ directionKey: 'dg', hierarchyLevel: l, headcount: 5, isKeyPosition: false })),
    }));
    const pyramide = hierarchyDepth(org({
      positions: [1, 2, 3, 4].map((l) => ({ directionKey: 'dg', hierarchyLevel: l, headcount: 5, isKeyPosition: false })),
    }));
    expect(pyramide).toBeGreaterThan(plate);
  });

  it('renvoie une valeur neutre en l’absence d’organigramme', () => {
    expect(hierarchyDepth(org())).toBe(50);
  });
});

describe('plateformes mutualisées', () => {
  const sectorOf = (id: string) => id;
  const proximity = (a: string, b: string) => (a === b ? 100 : a === 'agro' && b === 'retail' ? 80 : 12);

  it('récompense la mutualisation entre métiers proches', () => {
    const { effectiveness } = platformSynergy(
      [{ dasIds: ['agro', 'retail'], investmentMad: 1e6 }], sectorOf, proximity,
    );
    expect(effectiveness).toBeGreaterThan(0);
  });

  it('rend la mutualisation NÉGATIVE entre métiers étrangers', () => {
    // C'est la bureaucratie du conglomérat, rendue mesurable : partager une
    // plateforme entre deux métiers sans rapport coûte plus qu'elle ne rapporte.
    const { effectiveness } = platformSynergy(
      [{ dasIds: ['agro', 'energie'], investmentMad: 1e6 }], sectorOf, proximity,
    );
    expect(effectiveness).toBeLessThan(0);
  });

  it('ne produit aucun effet sans plateforme', () => {
    expect(platformSynergy([], sectorOf, proximity).effectiveness).toBe(0);
  });
});
