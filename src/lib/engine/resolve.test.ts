import { describe, expect, it } from 'vitest';

import { buildParams } from './params';
import { checkInvariants, resolveRound, type DasMetricsOutput } from './resolve';
import type {
  DasSnapshot,
  ListingSnapshot,
  ResolutionInput,
  TeamDasSnapshot,
  TeamSnapshot,
} from './snapshot';
import type { DasParameters, GenericStrategy } from './types';

const params = buildParams();

// ===========================================================================
// Fabriques d'instantanés
// ===========================================================================

const PROXIMITY: Record<string, number> = { 'agro|retail': 80, 'agro|btp': 12 };
const proximity = (a: string, b: string) =>
  a === b ? 100 : (PROXIMITY[`${a}|${b}`] ?? PROXIMITY[`${b}|${a}`] ?? 20);

// Marché de 1,02 Md DH à 100 DH l'unité = 10,2 M d'unités.
// Pour trois équipes, une part équitable vaut 3,4 M d'unités : c'est autour de
// cette valeur que la capacité initiale doit être calibrée, sans quoi tout le
// monde subit une rupture massive dès le premier tour.
const FAIR_SHARE_UNITS = 3_400_000;

function dasParameters(over: Partial<DasParameters> = {}): DasParameters {
  return {
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
    referenceCumulativeVolumeUnits: FAIR_SHARE_UNITS,
    ...over,
  };
}

function das(over: Partial<DasSnapshot> = {}): DasSnapshot {
  const parameters = dasParameters(over.parameters);
  return {
    previousMarketSizeMad: 1_000_000_000,
    growthRate: 0.02,
    segments: [
      { segmentKey: 'grand_public', marketSharePct: 0.6, qualityRequirement: 40, priceSensitivity: 1.4 },
      { segmentKey: 'premium', marketSharePct: 0.4, qualityRequirement: 75, priceSensitivity: 0.8 },
    ],
    ...over,
    // Ces trois-là dérivent des paramètres et ne doivent jamais diverger.
    dasId: parameters.dasId,
    sectorKey: parameters.sectorKey,
    parameters,
  };
}

function unitDefaults() {
  return {
    decision: {
      // Une domination par les coûts sert un marché LARGE : servir un seul
      // segment ferait légitimement diagnostiquer une stratégie de focus.
      genericStrategy: 'domination_couts' as GenericStrategy,
      pricePosition: 35,
      servedSegments: ['grand_public', 'premium'],
      capexCapacityMad: 40_000_000,
      capexAutomationMad: 20_000_000,
      capexOwnNetworkMad: 0,
      rdBudgetMad: 3_000_000,
      marketingBudgetMad: 8_000_000,
      declareBlueOcean: false,
    },
    previous: {
      quality: 50,
      notoriety: 50,
      capacityUnits: FAIR_SHARE_UNITS,
      cumulativeVolume: FAIR_SHARE_UNITS,
      volumeSold: FAIR_SHARE_UNITS,
      stockoutRate: 0,
      revenueMad: 340_000_000,
      cumulativeAutomationCapexMad: 300_000_000,
      cumulativeNetworkCapexMad: 0,
      declaredStrategy: 'domination_couts' as GenericStrategy,
      hadStrategicDrift: false,
    },
  };
}

function unit(over: Partial<TeamDasSnapshot> = {}): TeamDasSnapshot {
  const defaults = unitDefaults();
  return {
    dasId: 'das-agro',
    supplierAlternatives: 3,
    launchedRound: 0,
    ansoffMovement: null,
    ansoffRiskCoefficient: 0,
    blueOcean: false,
    blueOceanRoundsLeft: 0,
    commissionedCapexMad: 30_000_000,
    previousRdBudgetMad: 3_000_000,
    technologyPartnerBonus: 0,
    // Aucune conception organisationnelle par défaut : ces cas d'intégration
    // portent sur l'économie. Les tests d'organisation vivent dans
    // `organisation.test.ts`.
    organisation: null,
    groupStance: null,
    hr: null,
    previousHr: {
      headcount: 400, climatSocial: 70, skillIndex: 50,
      avgSalaryBrutMad: 5800, seniorityYears: 8,
    },
    procurement: [
      {
        supplier: {
          actorId: 'f1',
          priceIndex: 1.0,
          reliability: 85,
          qualityContribution: 70,
          capacityUnits: 5_000_000,
          switchingCost: 30,
          minimumVolume: 0,
        },
        committedVolume: 3_000_000,
      },
    ],
    distribution: [
      {
        distributor: {
          actorId: 'd1',
          coveragePct: 0.65,
          requiredMarginPct: 0.28,
          negotiatingStrength: 88,
          serviceLevel: 70,
          minimumVolume: 1_000_000,
        },
        volumeShare: 1,
      },
    ],
    ...over,
    decision: { ...defaults.decision, ...over.decision },
    previous: { ...defaults.previous, ...over.previous },
  };
}

function team(id: string, over: Partial<TeamSnapshot> = {}): TeamSnapshot {
  return {
    teamId: id,
    poolId: 'pool-a',
    isLiquidated: false,
    corporate: {
      corporateStrategy: 'specialisation',
      structureType: 'fonctionnelle',
      structureTransitionCostMad: 0,
      centralPurchasing: true,
      centralIt: true,
      centralRd: false,
      centralHr: false,
      centralFinance: true,
      sharedProduction: false,
      sharedRd: false,
      values: ['accessibilite_prix', 'efficience_operationnelle'],
      sharedSupplierRatio: 0,
      sharedDistributorRatio: 0,
      verticalIntegration: 30,
      ...over.corporate,
    },
    hr: {
      headcountStart: 240,
      hireOperateurs: 10,
      hireTechniciens: 5,
      hireExperts: 0,
      hireCadres: 0,
      avgSalaryBrutMad: 5_800,
      trainingBudgetMad: 500_000,
      restructuringCount: 0,
      severancePaidMad: 0,
      previousExpertShare: 20,
      ...over.hr,
    },
    finance: {
      opexMad: 12_000_000,
      debtDrawnMad: 0,
      debtRepaidMad: 0,
      taxRegime: 'droit_commun',
      treasuryStartMad: 45_000_000,
      equityMad: 120_000_000,
      debtOutstandingMad: 30_000_000,
      capexHistoryMad: [8_000_000, 6_000_000],
      previousWorkingCapitalMad: 25_000_000,
      consultingSpendMad: 270_000,
      ...over.finance,
    },
    units: over.units ?? [unit()],
    previousClimatSocial: 70,
    previousIaScore: 70,
    previousTreasuryStatus: 'sain',
    previousConsecutiveNegativeRounds: 0,
    consecutiveImprovingRounds: 0,
    previousCorporateStrategy: 'specialisation',
    ...over,
  };
}

function baseInput(over: Partial<ResolutionInput> = {}): ResolutionInput {
  return {
    sessionId: 'sess-1',
    roundNumber: 2,
    das: [das()],
    teams: [team('t1'), team('t2'), team('t3')],
    shocks: [],
    listings: [],
    acquisitionOffers: [],
    // Catalogue d'affinités vide : ces cas d'intégration portent sur
    // l'économie, l'organisation est testée dans `organisation.test.ts`.
    directionAffinity: {},
    proximity,
    ...over,
  };
}

const shareOf = (metrics: DasMetricsOutput[], teamId: string) =>
  metrics.find((m) => m.teamId === teamId)?.marketSharePct ?? 0;

// ===========================================================================

describe('résolution d’un tour complet', () => {
  it('se résout sans violer aucun invariant', () => {
    const result = resolveRound(baseInput(), params);
    expect(result.invariantFailures).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('produit un jeu de résultats complet pour chaque équipe', () => {
    const result = resolveRound(baseInput(), params);
    expect(result.teams).toHaveLength(3);
    expect(result.dasMetrics).toHaveLength(3);
    expect(result.poolSummaries).toHaveLength(1);

    for (const t of result.teams) {
      expect(Number.isFinite(t.pnl.treasuryEndMad)).toBe(true);
      expect(t.alignment.iaFinal).toBeGreaterThanOrEqual(0);
      expect(t.alignment.iaFinal).toBeLessThanOrEqual(100);
    }
  });

  it('répartit exactement 100 % du marché entre les concurrents et le non-servi', () => {
    const result = resolveRound(baseInput(), params);
    const summary = result.poolSummaries[0];
    const total =
      result.dasMetrics.reduce((acc, m) => acc + m.marketSharePct, 0) + summary.unservedShare;
    expect(total).toBeCloseTo(1, 6);
  });

  it('est parfaitement déterministe', () => {
    // Sans cela, on ne peut pas rejouer un tour contesté devant la classe.
    const a = resolveRound(baseInput(), params);
    const b = resolveRound(baseInput(), params);
    expect(JSON.stringify(a.dasMetrics)).toBe(JSON.stringify(b.dasMetrics));
    expect(a.teams[0].pnl.treasuryEndMad).toBe(b.teams[0].pnl.treasuryEndMad);
  });
});

describe('la compétitivité décide des parts', () => {
  it('récompense une meilleure qualité perçue', () => {
    const input = baseInput({
      teams: [
        team('fort', {
          units: [unit({ previous: { ...unitDefaults().previous, quality: 85 } })],
        }),
        team('faible', {
          units: [unit({ previous: { ...unitDefaults().previous, quality: 30 } })],
        }),
      ],
    });
    const result = resolveRound(input, params);
    expect(shareOf(result.dasMetrics, 'fort')).toBeGreaterThan(
      shareOf(result.dasMetrics, 'faible'),
    );
  });

  it('récompense un prix agressif sur un DAS élastique', () => {
    const input = baseInput({
      teams: [
        team('agressif', {
          units: [unit({ decision: { ...unitDefaults().decision, pricePosition: 20 } })],
        }),
        team('premium', {
          units: [unit({ decision: { ...unitDefaults().decision, pricePosition: 80 } })],
        }),
      ],
    });
    const result = resolveRound(input, params);
    expect(shareOf(result.dasMetrics, 'agressif')).toBeGreaterThan(
      shareOf(result.dasMetrics, 'premium'),
    );
  });

  it('fait payer le désalignement en parts ET en marge', () => {
    // Une équipe qui déclare la différenciation en jouant le low-cost.
    const coherent = team('coherent');
    const incoherent = team('incoherent', {
      units: [
        unit({
          decision: { ...unitDefaults().decision, genericStrategy: 'differenciation' },
        }),
      ],
    });

    const result = resolveRound(baseInput({ teams: [coherent, incoherent] }), params);
    const bon = result.teams.find((t) => t.teamId === 'coherent')!;
    const mauvais = result.teams.find((t) => t.teamId === 'incoherent')!;

    expect(bon.alignment.iaFinal).toBeGreaterThan(mauvais.alignment.iaFinal);
    expect(bon.marginPremiumPct).toBeGreaterThan(mauvais.marginPremiumPct);
    expect(mauvais.alignment.strategicDrift).toBe(true);
  });
});

describe('la capacité contraint réellement les ventes', () => {
  it('perd les ventes qu’elle ne peut pas servir', () => {
    const input = baseInput({
      teams: [
        team('sous_capacite', {
          units: [
            unit({
              previous: { ...unitDefaults().previous, capacityUnits: 50_000 },
              commissionedCapexMad: 0,
              decision: { ...unitDefaults().decision, pricePosition: 10 },
            }),
          ],
        }),
        team('normale'),
      ],
    });
    const result = resolveRound(input, params);
    const bride = result.dasMetrics.find((m) => m.teamId === 'sous_capacite')!;

    expect(bride.volumeLost).toBeGreaterThan(0);
    expect(bride.stockoutRate).toBeGreaterThan(0);
    expect(bride.volumeSold).toBeLessThanOrEqual(bride.effectiveCapacityUnits + 1e-6);
  });

  it('ne laisse jamais vendre plus que la capacité effective', () => {
    const result = resolveRound(baseInput(), params);
    for (const m of result.dasMetrics) {
      expect(m.volumeSold).toBeLessThanOrEqual(m.effectiveCapacityUnits + 1e-3);
    }
  });
});

describe('plafond de couverture de distribution', () => {
  it('empêche de gagner des parts là où on n’est pas distribué', () => {
    const input = baseInput({
      teams: [
        team('dominant', {
          units: [
            unit({
              previous: { ...unitDefaults().previous, quality: 95, notoriety: 95 },
              distribution: [
                {
                  distributor: {
                    actorId: 'petit',
                    coveragePct: 0.2,
                    requiredMarginPct: 0.2,
                    negotiatingStrength: 40,
                    serviceLevel: 60,
                    minimumVolume: 0,
                  },
                  volumeShare: 1,
                },
              ],
            }),
          ],
        }),
        team('bien_distribue'),
      ],
    });
    const result = resolveRound(input, params);
    const dominant = result.dasMetrics.find((m) => m.teamId === 'dominant')!;

    // Score de compétitivité très supérieur, part plafonnée par la couverture.
    expect(dominant.marketSharePct).toBeLessThanOrEqual(dominant.distributionCoverage * 1.15 + 1e-6);
  });
});

describe('cession de DAS', () => {
  const listing = (over: Partial<ListingSnapshot> = {}): ListingSnapshot => ({
    listingId: 'l1',
    sellerTeamId: 't1',
    dasId: 'das-agro',
    bids: [],
    withdrawn: false,
    sellerChoice: 'npc',
    ...over,
  });

  it('encaisse le prix chez le vendeur', () => {
    const sans = resolveRound(baseInput(), params);
    const avec = resolveRound(baseInput({ listings: [listing()] }), params);

    const tresorerieSans = sans.teams.find((t) => t.teamId === 't1')!.pnl.treasuryEndMad;
    const tresorerieAvec = avec.teams.find((t) => t.teamId === 't1')!.pnl.treasuryEndMad;

    expect(avec.transfers).toHaveLength(1);
    expect(tresorerieAvec).toBeGreaterThan(tresorerieSans);
    expect(tresorerieAvec - tresorerieSans).toBeCloseTo(avec.transfers[0].priceMad, 2);
  });

  it('transfère la part de marché à l’acheteur, amputée du coût d’intégration', () => {
    const result = resolveRound(
      baseInput({
        listings: [
          listing({
            sellerChoice: 'best_bid',
            bids: [
              { bidderTeamId: 't2', offerMad: 90_000_000, integrationBudgetMad: 0 },
              { bidderTeamId: 't3', offerMad: 60_000_000, integrationBudgetMad: 5_000_000 },
            ],
          }),
        ],
      }),
      params,
    );

    const transfer = result.transfers[0];
    expect(transfer.buyerTeamId).toBe('t2'); // la meilleure offre l'emporte
    expect(transfer.priceMad).toBe(90_000_000);
    // Aucun budget d'intégration : destruction maximale de valeur.
    expect(transfer.valueLossPct).toBeCloseTo(0.45, 6);
    expect(transfer.shareReleasedToPool).toBeGreaterThan(0);
  });

  it('préserve la valeur quand l’acheteur budgète son intégration', () => {
    const bacle = resolveRound(
      baseInput({
        listings: [
          listing({
            sellerChoice: 'best_bid',
            bids: [{ bidderTeamId: 't2', offerMad: 80_000_000, integrationBudgetMad: 0 }],
          }),
        ],
      }),
      params,
    );
    const soigne = resolveRound(
      baseInput({
        listings: [
          listing({
            sellerChoice: 'best_bid',
            bids: [{ bidderTeamId: 't2', offerMad: 80_000_000, integrationBudgetMad: 16_000_000 }],
          }),
        ],
      }),
      params,
    );

    expect(soigne.transfers[0].marketShareTransferred).toBeGreaterThan(
      bacle.transfers[0].marketShareTransferred,
    );
  });

  it('offre moins cher quand le vendeur est aux abois', () => {
    const sain = resolveRound(baseInput({ listings: [listing()] }), params);
    const detresse = resolveRound(
      baseInput({
        listings: [listing()],
        teams: [
          team('t1', {
            previousTreasuryStatus: 'restructuration',
            previousConsecutiveNegativeRounds: 2,
            finance: { ...team('t1').finance, treasuryStartMad: -5_000_000 },
          }),
          team('t2'),
          team('t3'),
        ],
      }),
      params,
    );

    expect(detresse.transfers[0].priceMad).toBeLessThan(sain.transfers[0].priceMad);
  });

  it('ne dénoue rien si le vendeur retire son annonce', () => {
    const result = resolveRound(
      baseInput({ listings: [listing({ sellerChoice: 'withdraw' })] }),
      params,
    );
    expect(result.transfers).toHaveLength(0);
  });
});

describe('chocs PESTEL', () => {
  it('répercute la contraction du marché sur le chiffre d’affaires', () => {
    const normal = resolveRound(baseInput(), params);
    const secheresse = resolveRound(
      baseInput({
        shocks: [
          {
            dasId: 'das-agro',
            marketSizePct: -0.12,
            inputCostPct: 0.22,
            capacityPct: -0.08,
            qualityFloor: null,
            rateDelta: 0,
            supplierPowerPct: 0, distributorPowerPct: 0, payrollPct: 0, severancePct: 0,
            capexCostPct: 0, workingCapitalDaysDelta: 0, priceElasticityDelta: 0,
            notorietyPct: 0, trainingSubsidyPct: 0, subsidyPctOfRevenue: 0,
            shareRedistributionPts: 0,
            beneficiaryTeamIds: [],
          },
        ],
      }),
      params,
    );

    const caNormal = normal.dasMetrics[0].revenueMad;
    const caChoc = secheresse.dasMetrics[0].revenueMad;
    expect(caChoc).toBeLessThan(caNormal);
    expect(secheresse.dasMetrics[0].unitVariableCostMad).toBeGreaterThan(
      normal.dasMetrics[0].unitVariableCostMad,
    );
  });

  it('redistribue des parts sans en créer', () => {
    const result = resolveRound(
      baseInput({
        shocks: [
          {
            dasId: 'das-agro',
            marketSizePct: 0,
            inputCostPct: 0,
            capacityPct: 0,
            qualityFloor: null,
            rateDelta: 0,
            supplierPowerPct: 0, distributorPowerPct: 0, payrollPct: 0, severancePct: 0,
            capexCostPct: 0, workingCapitalDaysDelta: 0, priceElasticityDelta: 0,
            notorietyPct: 0, trainingSubsidyPct: 0, subsidyPctOfRevenue: 0,
            shareRedistributionPts: 10,
            beneficiaryTeamIds: ['t1'],
          },
        ],
      }),
      params,
    );
    expect(result.invariantFailures).toEqual([]);
    const total =
      result.dasMetrics.reduce((acc, m) => acc + m.marketSharePct, 0) +
      result.poolSummaries[0].unservedShare;
    expect(total).toBeCloseTo(1, 6);
    expect(shareOf(result.dasMetrics, 't1')).toBeGreaterThan(shareOf(result.dasMetrics, 't2'));
  });
});

describe('portefeuille multi-DAS', () => {
  it('récompense la mutualisation de métiers proches et facture celle de métiers étrangers', () => {
    const twoDas = [das(), das({ parameters: dasParameters({ dasId: 'das-retail', sectorKey: 'retail' }) })];
    const unitsFor = (secondDasId: string) => [
      unit(),
      unit({ dasId: secondDasId, decision: { ...unitDefaults().decision } }),
    ];

    const lie = resolveRound(
      {
        ...baseInput(),
        das: twoDas,
        teams: [
          team('lie', {
            units: unitsFor('das-retail'),
            corporate: {
              ...team('x').corporate,
              corporateStrategy: 'diversification_liee',
              structureType: 'matricielle',
              sharedSupplierRatio: 0.8,
              sharedDistributorRatio: 0.8,
              sharedProduction: true,
              sharedRd: true,
            },
          }),
        ],
      },
      params,
    );

    const conglomerat = resolveRound(
      {
        ...baseInput(),
        das: [das(), das({ parameters: dasParameters({ dasId: 'das-btp', sectorKey: 'btp' }) })],
        teams: [
          team('conglomerat', {
            units: unitsFor('das-btp'),
            corporate: {
              ...team('x').corporate,
              corporateStrategy: 'diversification_liee',
              structureType: 'matricielle',
              sharedSupplierRatio: 0.8,
              sharedDistributorRatio: 0.8,
              sharedProduction: true,
              sharedRd: true,
            },
          }),
        ],
      },
      params,
    );

    const bon = lie.teams[0];
    const mauvais = conglomerat.teams[0];

    // agro↔retail : proximité 80 → économies de synergie.
    expect(bon.synergySavingPct).toBeGreaterThan(bon.coordinationCostPct);
    // agro↔btp : proximité 12 → coûts de coordination.
    expect(mauvais.coordinationCostPct).toBeGreaterThan(mauvais.synergySavingPct);
    expect(bon.pnl.overheadMad).toBeLessThan(mauvais.pnl.overheadMad);
  });
});

describe('détection des invariants', () => {
  it('refuse une somme de parts incorrecte', () => {
    const failures = checkInvariants(
      [
        { teamId: 't1', dasId: 'd1', marketSharePct: 0.4, rawShare: 0.4 } as DasMetricsOutput,
        { teamId: 't2', dasId: 'd1', marketSharePct: 0.4, rawShare: 0.4 } as DasMetricsOutput,
      ],
      [],
      [{ poolId: 'p1', dasId: 'd1', marketSizeMad: 1, unservedShare: 0, teamIds: ['t1', 't2'] }],
      [],
    );
    expect(failures.map((f) => f.code)).toContain('share_sum');
  });

  it('refuse une part hors bornes', () => {
    const failures = checkInvariants(
      [{ teamId: 't1', dasId: 'd1', marketSharePct: 1.4, rawShare: 1.4 } as DasMetricsOutput],
      [],
      [],
      [],
    );
    expect(failures.map((f) => f.code)).toContain('share_range');
  });

  it('refuse une vente supérieure à la capacité', () => {
    const failures = checkInvariants(
      [
        {
          teamId: 't1',
          dasId: 'd1',
          marketSharePct: 0.5,
          volumeSold: 100,
          effectiveCapacityUnits: 10,
        } as DasMetricsOutput,
      ],
      [],
      [],
      [],
    );
    expect(failures.map((f) => f.code)).toContain('volume_exceeds_capacity');
  });

  it('refuse un score hors de [0, 100]', () => {
    const failures = checkInvariants(
      [{ teamId: 't1', dasId: 'd1', marketSharePct: 0.5, quality: 140 } as DasMetricsOutput],
      [],
      [],
      [],
    );
    expect(failures.map((f) => f.code)).toContain('score_range');
  });

  it('refuse une cession à soi-même et un dénouement en double', () => {
    const transfer = {
      listingId: 'l1',
      dasId: 'd1',
      sellerTeamId: 't1',
      buyerTeamId: 't1',
      priceMad: 1,
      integrationRatio: 0,
      valueLossPct: 0,
      marketShareTransferred: 0,
      shareReleasedToPool: 0,
    };
    const failures = checkInvariants([], [], [], [transfer, { ...transfer }]);
    const codes = failures.map((f) => f.code);
    expect(codes).toContain('self_transfer');
    expect(codes).toContain('duplicate_transfer');
  });

  it('refuse un NaN avant qu’il n’atteigne la base', () => {
    const failures = checkInvariants(
      [],
      [
        {
          teamId: 't1',
          pnl: { treasuryEndMad: Number.NaN, revenueMad: 0 },
          alignment: { iaFinal: 70 },
        } as never,
      ],
      [],
      [],
    );
    expect(failures.map((f) => f.code)).toContain('non_finite');
  });
});
