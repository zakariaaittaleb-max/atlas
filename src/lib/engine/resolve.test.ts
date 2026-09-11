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
    // Aucun concurrent installé : les cas de test portent sur la compétition
    // entre équipes, qu'un prélèvement extérieur brouillerait.
    npcRevenueMad: 0,
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
      // Entrepôts vides : c'est l'état d'une équipe qui démarre, et le seul
      // qui n'introduise pas d'amortisseur invisible dans les cas de test.
      inputStockUnits: 0,
      finishedStockUnits: 0,
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
    previousTreasuryStatus: 'sain',
    previousConsecutiveNegativeRounds: 0,
    consecutiveImprovingRounds: 0,
    previousCorporateStrategy: 'specialisation',
    previousStructureType: 'fonctionnelle',
    shockResponses: [],
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
            shockId: 'shock-secheresse',
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
            shockId: 'shock-redistribution',
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

// ===========================================================================
// La RH atteint-elle la trésorerie ?
// ===========================================================================

const hrDecision = (over: Partial<NonNullable<TeamDasSnapshot['hr']>> = {}) => ({
  hireOperateurs: 0, hireTechniciens: 0, hireExperts: 0, hireCadres: 0,
  layoffs: 0, internalTransfersIn: 0,
  avgSalaryBrutMad: 5_800, trainingBudgetMad: 0,
  trainingFocus: 'technique' as const,
  claimOfppt: false, claimGiac: false, orderSkillsAudit: false,
  restructuring: 'aucune' as const,
  ...over,
});

const treasuryOf = (result: ReturnType<typeof resolveRound>, teamId: string) =>
  result.teams.find((t) => t.teamId === teamId)!.pnl.treasuryEndMad;

describe('décisions RH et trésorerie', () => {
  /**
   * Le défaut corrigé : les indemnités étaient calculées au barème de
   * l'article 53, affichées à l'équipe AVANT qu'elle ne tranche, puis jamais
   * débitées — le compte de résultat lisait une colonne que personne
   * n'alimentait. Licencier libérait la masse salariale sans coûter le cash
   * annoncé, soit l'inverse exact de ce que l'écran enseigne.
   */
  it('débite les indemnités de licenciement de la trésorerie', () => {
    const sans = resolveRound(
      baseInput({ teams: [team('t1', { units: [unit({ hr: hrDecision() })] }), team('t2'), team('t3')] }),
      params,
    );
    const avec = resolveRound(
      baseInput({
        teams: [
          team('t1', { units: [unit({ hr: hrDecision({ layoffs: 60 }) })] }),
          team('t2'), team('t3'),
        ],
      }),
      params,
    );

    expect(treasuryOf(avec, 't1')).toBeLessThan(treasuryOf(sans, 't1'));
  });

  it('rend les indemnités proportionnelles au nombre de départs', () => {
    const build = (layoffs: number) =>
      treasuryOf(
        resolveRound(
          baseInput({
            teams: [
              team('t1', { units: [unit({ hr: hrDecision({ layoffs }) })] }),
              team('t2'), team('t3'),
            ],
          }),
          params,
        ),
        't1',
      );

    const [zero, peu, beaucoup] = [build(0), build(30), build(90)];
    expect(peu).toBeLessThan(zero);
    expect(beaucoup).toBeLessThan(peu);
  });

  /**
   * L'OFPPT rembourse la formation, le GIAC finance l'ingénierie de formation
   * — et seulement contre un bilan de compétences. Les deux étaient calculés
   * puis persistés sans jamais être crédités.
   */
  it('crédite les subventions OFPPT et GIAC', () => {
    const build = (over: Partial<NonNullable<TeamDasSnapshot['hr']>>) =>
      treasuryOf(
        resolveRound(
          baseInput({
            teams: [
              team('t1', {
                units: [unit({ hr: hrDecision({ trainingBudgetMad: 4_000_000, ...over }) })],
              }),
              team('t2'), team('t3'),
            ],
          }),
          params,
        ),
        't1',
      );

    const sansRien = build({});
    expect(build({ claimOfppt: true })).toBeGreaterThan(sansRien);
    expect(build({ claimGiac: true, orderSkillsAudit: true })).toBeGreaterThan(sansRien);
  });

  it('ne verse pas le GIAC sans bilan de compétences', () => {
    // Le GIAC finance l'INGÉNIERIE de formation : sans audit, il n'y a
    // rien à rembourser. C'est la règle du dispositif, et l'écran le dit.
    const build = (orderSkillsAudit: boolean) =>
      treasuryOf(
        resolveRound(
          baseInput({
            teams: [
              team('t1', {
                units: [unit({
                  hr: hrDecision({
                    trainingBudgetMad: 4_000_000, claimGiac: true, orderSkillsAudit,
                  }),
                })],
              }),
              team('t2'), team('t3'),
            ],
          }),
          params,
        ),
        't1',
      );

    expect(build(true)).toBeGreaterThan(build(false));
  });
});

// ===========================================================================
// Répondre à une crise : un coût ET un effet
// ===========================================================================

const secheresse = {
  shockId: 'shock-secheresse',
  dasId: 'das-agro',
  marketSizePct: -0.12,
  inputCostPct: 0.35,
  capacityPct: -0.10,
  qualityFloor: null,
  rateDelta: 0, supplierPowerPct: 0, distributorPowerPct: 0,
  payrollPct: 0, severancePct: 0, capexCostPct: 0,
  workingCapitalDaysDelta: 0, priceElasticityDelta: 0, notorietyPct: 0,
  trainingSubsidyPct: 0, subsidyPctOfRevenue: 0,
  shareRedistributionPts: 0, beneficiaryTeamIds: [] as string[],
};

describe('réponses aux chocs', () => {
  /**
   * Le défaut corrigé : la war room proposait quatre réponses, la route
   * calculait leur coût et leur efficacité, les écrivait en base — et
   * personne ne relisait la table. Ignorer était donc la seule réponse
   * rationnelle, puisque les trois autres se payaient sans rien produire.
   */
  it('protège la part de marché de qui répond, face à qui ignore', () => {
    const result = resolveRound(
      baseInput({
        shocks: [secheresse],
        teams: [
          team('t1', { shockResponses: [
            { shockId: 'shock-secheresse', effectiveness: 0.75, costMad: 0 },
          ] }),
          team('t2'),
          team('t3'),
        ],
      }),
      params,
    );

    expect(shareOf(result.dasMetrics, 't1')).toBeGreaterThan(shareOf(result.dasMetrics, 't2'));
  });

  it('fait payer la réponse, même quand la carte s’avère bénigne', () => {
    const build = (costMad: number) =>
      treasuryOf(
        resolveRound(
          baseInput({
            shocks: [secheresse],
            teams: [
              team('t1', { shockResponses: [
                { shockId: 'shock-secheresse', effectiveness: 0.4, costMad },
              ] }),
              team('t2'), team('t3'),
            ],
          }),
          params,
        ),
        't1',
      );

    expect(build(20_000_000)).toBeCloseTo(build(0) - 20_000_000, 0);
  });

  it('n’atténue une carte que pour l’équipe qui l’a payée', () => {
    const result = resolveRound(
      baseInput({
        shocks: [secheresse],
        teams: [
          team('t1', { shockResponses: [
            { shockId: 'shock-secheresse', effectiveness: 1, costMad: 0 },
          ] }),
          team('t2'), team('t3'),
        ],
      }),
      params,
    );

    // t2 et t3 subissent la même chose : la réponse de t1 ne les couvre pas.
    expect(shareOf(result.dasMetrics, 't2')).toBeCloseTo(shareOf(result.dasMetrics, 't3'), 9);
  });

  it('ne laisse pas une réponse rétrécir le marché des autres', () => {
    // La taille du marché est PARTAGÉE : elle ne peut pas valoir deux choses
    // selon l'équipe qui la regarde. Seuls les effets subis par l'entreprise
    // s'atténuent.
    const sansReponse = resolveRound(baseInput({ shocks: [secheresse] }), params);
    const avecReponse = resolveRound(
      baseInput({
        shocks: [secheresse],
        teams: [
          team('t1', { shockResponses: [
            { shockId: 'shock-secheresse', effectiveness: 1, costMad: 0 },
          ] }),
          team('t2'), team('t3'),
        ],
      }),
      params,
    );

    const taille = (r: ReturnType<typeof resolveRound>) => r.poolSummaries[0].marketSizeMad;
    expect(taille(avecReponse)).toBeCloseTo(taille(sansReponse), 6);
  });

  it('ignore une réponse qui vise une carte absente du tour', () => {
    const result = resolveRound(
      baseInput({
        shocks: [secheresse],
        teams: [
          team('t1', { shockResponses: [
            { shockId: 'carte-inexistante', effectiveness: 1, costMad: 0 },
          ] }),
          team('t2'), team('t3'),
        ],
      }),
      params,
    );

    expect(result.invariantFailures).toEqual([]);
    expect(shareOf(result.dasMetrics, 't1')).toBeCloseTo(shareOf(result.dasMetrics, 't2'), 9);
  });
});

// ===========================================================================
// Océan bleu : une déclaration qui engage enfin quelque chose
// ===========================================================================

const metricOf = (result: ReturnType<typeof resolveRound>, teamId: string) =>
  result.dasMetrics.find((m) => m.teamId === teamId)!;

/** Rejoue la même équipe jusqu'à trouver une graine où l'entrée réussit. */
function findRound(predicate: (m: DasMetricsOutput) => boolean): DasMetricsOutput {
  for (let i = 0; i < 60; i += 1) {
    const result = resolveRound(
      baseInput({
        sessionId: `sess-${i}`,
        teams: [
          team('t1', {
            units: [unit({
              decision: { ...unitDefaults().decision, declareBlueOcean: true },
            })],
          }),
          team('t2'), team('t3'),
        ],
      }),
      params,
    );
    const m = metricOf(result, 't1');
    if (predicate(m)) return m;
  }
  throw new Error('Aucune graine ne satisfait le cas recherché.');
}

describe('océan bleu', () => {
  /**
   * Le défaut corrigé : la case était écrite en base et lue par personne.
   * `team_units.blue_ocean` restait faux pour toujours, si bien que le code de
   * répartition hors somme nulle n'était jamais atteint — et que ni le ticket
   * d'entrée, ni le risque d'échec, ni la marge ×2,5 n'existaient, alors que
   * l'écran promettait les trois au moment de décider.
   */
  it('ne fait rien tant que l’équipe ne déclare rien', () => {
    const m = metricOf(resolveRound(baseInput(), params), 't1');
    expect(m.blueOceanActive).toBe(false);
    expect(m.blueOceanEntryCostMad).toBe(0);
    expect(m.blueOceanFailed).toBe(false);
  });

  it('fait payer le ticket d’entrée, que la tentative réussisse ou non', () => {
    expect(findRound((m) => m.blueOceanActive).blueOceanEntryCostMad).toBeGreaterThan(0);
    expect(findRound((m) => m.blueOceanFailed).blueOceanEntryCostMad).toBeGreaterThan(0);
  });

  it('peut échouer — l’entrée n’est pas un achat', () => {
    const echec = findRound((m) => m.blueOceanFailed);
    expect(echec.blueOceanActive).toBe(false);
    expect(echec.blueOceanRoundsLeft).toBe(0);
  });

  it('ouvre une fenêtre de deux tours quand elle réussit', () => {
    expect(findRound((m) => m.blueOceanActive).blueOceanRoundsLeft)
      .toBe(params['blue_ocean.rounds']);
  });

  it('sort le domaine de la somme nulle et lui donne sa propre part', () => {
    const succes = findRound((m) => m.blueOceanActive);
    // Hors pool : la part n'est plus une fraction disputée mais la
    // compétitivité propre de l'équipe sur un marché vierge.
    expect(succes.marketSharePct).toBeCloseTo(succes.competitivenessScore, 6);
  });

  it('décompte la fenêtre héritée, puis la referme', () => {
    const build = (roundsLeft: number) =>
      metricOf(
        resolveRound(
          baseInput({
            teams: [
              team('t1', {
                units: [unit({ blueOcean: roundsLeft > 0, blueOceanRoundsLeft: roundsLeft })],
              }),
              team('t2'), team('t3'),
            ],
          }),
          params,
        ),
        't1',
      );

    expect(build(2).blueOceanActive).toBe(true);
    expect(build(2).blueOceanRoundsLeft).toBe(1);
    expect(build(1).blueOceanActive).toBe(true);
    expect(build(1).blueOceanRoundsLeft).toBe(0);
    expect(build(0).blueOceanActive).toBe(false);
  });

  it('ne fait pas repayer le ticket pendant une fenêtre déjà ouverte', () => {
    const m = metricOf(
      resolveRound(
        baseInput({
          teams: [
            team('t1', {
              units: [unit({
                blueOcean: true, blueOceanRoundsLeft: 2,
                decision: { ...unitDefaults().decision, declareBlueOcean: true },
              })],
            }),
            team('t2'), team('t3'),
          ],
        }),
        params,
      ),
      't1',
    );

    expect(m.blueOceanActive).toBe(true);
    expect(m.blueOceanEntryCostMad).toBe(0);
  });

  it('respecte les invariants du pool malgré une équipe hors somme nulle', () => {
    const result = resolveRound(
      baseInput({
        teams: [
          team('t1', { units: [unit({ blueOcean: true, blueOceanRoundsLeft: 2 })] }),
          team('t2'), team('t3'),
        ],
      }),
      params,
    );
    expect(result.invariantFailures).toEqual([]);
  });
});

// ===========================================================================
// Marché interne, réorganisation, score temporel
// ===========================================================================

const hrStateOf = (result: ReturnType<typeof resolveRound>, dasId: string) =>
  result.dasHr.find((h) => h.dasId === dasId)!;

describe('marché interne du travail', () => {
  const deuxDas = (transfersIn: number) =>
    resolveRound(
      baseInput({
        das: [das(), das({ parameters: dasParameters({ dasId: 'das-num', sectorKey: 'retail' }) })],
        teams: [
          team('t1', {
            units: [
              unit({ dasId: 'das-agro', hr: hrDecision({ internalTransfersIn: transfersIn }) }),
              unit({ dasId: 'das-num', hr: hrDecision() }),
            ],
          }),
          team('t2'), team('t3'),
        ],
      }),
      params,
    );

  /**
   * Le défaut corrigé : `internalTransfersIn` n'avait aucune contrepartie
   * sortante. Un domaine gagnait des gens, aucun autre n'en perdait, et la
   * consolidation excluait ces transferts de la masse salariale — puisqu'il
   * s'agit de personnes déjà payées. C'était de l'effectif GRATUIT, qui
   * allégeait la charge et remontait le climat sans coûter un dirham.
   */
  it('prélève sur le domaine d’origine ce que l’autre reçoit', () => {
    const sans = deuxDas(0);
    const avec = deuxDas(80);

    expect(hrStateOf(avec, 'das-agro').headcount)
      .toBeGreaterThan(hrStateOf(sans, 'das-agro').headcount);
    expect(hrStateOf(avec, 'das-num').headcount)
      .toBeLessThan(hrStateOf(sans, 'das-num').headcount);
  });

  it('conserve l’effectif total de l’équipe', () => {
    const total = (r: ReturnType<typeof resolveRound>) =>
      r.dasHr
        .filter((h) => h.teamId === 't1')
        .reduce((acc, h) => acc + h.headcount, 0);

    expect(total(deuxDas(80))).toBeCloseTo(total(deuxDas(0)), 6);
  });

  it('ne prélève rien quand le domaine est seul — il n’y a personne à débaucher', () => {
    const seul = resolveRound(
      baseInput({
        teams: [
          team('t1', { units: [unit({ hr: hrDecision({ internalTransfersIn: 50 }) })] }),
          team('t2'), team('t3'),
        ],
      }),
      params,
    );
    expect(seul.invariantFailures).toEqual([]);
  });
});

describe('coût de réorganisation', () => {
  /**
   * Le défaut corrigé : le coût était lu depuis une colonne qu'aucune écriture
   * n'alimentait. Changer de structure ne coûtait rien en trésorerie — une
   * équipe pouvait basculer chaque tour et revenir le suivant, ne payant
   * jamais que la pénalité d'alignement.
   */
  it('fait payer un changement de structure', () => {
    const stable = treasuryOf(
      resolveRound(
        baseInput({
          teams: [
            team('t1', { previousStructureType: 'fonctionnelle' }),
            team('t2'), team('t3'),
          ],
        }),
        params,
      ),
      't1',
    );
    const reorganise = treasuryOf(
      resolveRound(
        baseInput({
          teams: [
            team('t1', { previousStructureType: 'matricielle' }),
            team('t2'), team('t3'),
          ],
        }),
        params,
      ),
      't1',
    );

    expect(reorganise).toBeLessThan(stable);
  });

  it('ne fait rien payer au premier tour, faute de structure antérieure', () => {
    const premier = treasuryOf(
      resolveRound(
        baseInput({
          teams: [team('t1', { previousStructureType: null }), team('t2'), team('t3')],
        }),
        params,
      ),
      't1',
    );
    const stable = treasuryOf(
      resolveRound(
        baseInput({
          teams: [
            team('t1', { previousStructureType: 'fonctionnelle' }),
            team('t2'), team('t3'),
          ],
        }),
        params,
      ),
      't1',
    );

    expect(premier).toBeCloseTo(stable, 0);
  });
});

describe('score temporel', () => {
  const iaOf = (r: ReturnType<typeof resolveRound>, teamId: string) =>
    r.teams.find((t) => t.teamId === teamId)!.alignment;

  /**
   * Le champ `consecutiveImprovingRounds` était câblé à zéro : le bonus de
   * progression n'était JAMAIS versé.
   *
   * Il ne se lit pas sur une équipe stable — la constance vaut déjà 100, et le
   * cahier plafonne là (§6.1). Ce que le bonus permet, c'est de RATTRAPER un
   * changement de cap : une équipe qui vire de bord en se redressant paie
   * moins cher que celle qui vire de bord en stagnant. C'est cette différence
   * qui n'existait pas.
   */
  it('laisse une progression soutenue rattraper un changement de cap', () => {
    const build = (improving: number) =>
      iaOf(
        resolveRound(
          baseInput({
            teams: [
              team('t1', {
                previousCorporateStrategy: 'diversification_conglomerale',
                consecutiveImprovingRounds: improving,
              }),
              team('t2'), team('t3'),
            ],
          }),
          params,
        ),
        't1',
      ).sat;

    expect(build(0)).toBeLessThan(100);
    expect(build(1)).toBeGreaterThan(build(0));
    expect(build(2)).toBeGreaterThan(build(1));
  });

  it('plafonne à 100 : la constance ne se dépasse pas', () => {
    // Conforme au cahier (§6.1) : le bonus offre un rattrapage, pas une prime
    // cumulable sur une équipe qui n'a rien changé.
    const stable = iaOf(
      resolveRound(
        baseInput({
          teams: [team('t1', { consecutiveImprovingRounds: 5 }), team('t2'), team('t3')],
        }),
        params,
      ),
      't1',
    );
    expect(stable.sat).toBe(100);
  });

  it('facture un changement de stratégie de groupe', () => {
    const stable = iaOf(resolveRound(baseInput(), params), 't1');
    const vire = iaOf(
      resolveRound(
        baseInput({
          teams: [
            team('t1', { previousCorporateStrategy: 'diversification_conglomerale' }),
            team('t2'), team('t3'),
          ],
        }),
        params,
      ),
      't1',
    );

    expect(vire.sat).toBeLessThan(stable.sat);
  });
});

describe('stocks dans la résolution complète', () => {
  /**
   * Ces cas prouvent le BRANCHEMENT, pas la formule — `inventory.test.ts`
   * couvre déjà les deux étages isolément. Ce qui se vérifie ici est qu'une
   * décision d'achat traverse bien toute la résolution jusqu'au volume vendu,
   * ce qu'un test de la seule fonction de volume ne dirait pas.
   */
  function withCommitted(volume: number) {
    return unit({
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
          committedVolume: volume,
        },
      ],
    });
  }

  it('acheter moins fait vendre moins', () => {
    const input = baseInput({
      teams: [
        team('genereuse', { units: [withCommitted(3_000_000)] }),
        team('radine', { units: [withCommitted(500_000)] }),
      ],
    });
    const result = resolveRound(input, params);

    const genereuse = result.dasMetrics.find((m) => m.teamId === 'genereuse')!;
    const radine = result.dasMetrics.find((m) => m.teamId === 'radine')!;

    expect(radine.volumeSold).toBeLessThan(genereuse.volumeSold);
    // Et l'équipe qui n'a pas acheté assez le paie en ventes perdues.
    expect(radine.volumeLost).toBeGreaterThan(0);
  });

  it('sur-acheter laisse du stock et coûte sa possession', () => {
    const input = baseInput({
      teams: [team('prevoyante', { units: [withCommitted(9_000_000)] })],
    });
    const result = resolveRound(input, params);
    const metric = result.dasMetrics[0];

    expect(metric.inputStockUnits).toBeGreaterThan(0);
    expect(metric.inventoryHoldingCostMad).toBeGreaterThan(0);
  });

  it('sans contrat, aucune contrainte d’approvisionnement', () => {
    const input = baseInput({
      teams: [team('comptant', { units: [unit({ procurement: [] })] })],
    });
    const result = resolveRound(input, params);
    const metric = result.dasMetrics[0];

    // Rien en magasin, et la capacité redevient la seule limite.
    expect(metric.inputStockUnits).toBe(0);
    expect(metric.volumeSold).toBeGreaterThan(0);
  });
});

describe('concurrents non joueurs', () => {
  /**
   * Un domaine ne contient pas que les équipes de la salle. Les entreprises
   * installées — celles que le facilitateur peut mettre en vente — servaient
   * déjà une part du marché sans figurer dans la répartition : les équipes se
   * partageaient 100 % d'un marché déjà entamé, et le total servi dépassait la
   * taille du marché.
   */
  function marketOf(npcRevenueMad: number) {
    const base = baseInput({
      teams: [team('alpha'), team('beta')],
    });
    return resolveRound(
      { ...base, das: base.das.map((d) => ({ ...d, npcRevenueMad })) },
      params,
    );
  }

  it('laisse les équipes se partager tout le marché quand il n’y a aucun installé', () => {
    const total = marketOf(0).dasMetrics.reduce((acc, m) => acc + m.marketSharePct, 0);
    expect(total).toBeCloseTo(1, 3);
  });

  it('réduit la part des équipes de ce que les installés servent déjà', () => {
    // La taille du marché est dérivée du cas lui-même plutôt que codée en
    // dur : un montant fixe aurait tout absorbé le jour où la dotation change.
    const marche = marketOf(0).dasMetrics[0].marketSizeMad;
    const avec = marketOf(marche * 0.2);
    const total = avec.dasMetrics.reduce((acc, m) => acc + m.marketSharePct, 0);

    // Un installé qui sert un cinquième du marché en laisse quatre aux équipes.
    expect(total).toBeCloseTo(0.8, 2);
    for (const m of avec.dasMetrics) {
      expect(m.marketSharePct).toBeLessThan(0.5);
    }
  });

  it('ne laisse rien aux équipes si les installés servent tout le marché', () => {
    const total = marketOf(500_000_000_000).dasMetrics
      .reduce((acc, m) => acc + m.marketSharePct, 0);
    expect(total).toBeCloseTo(0, 6);
  });
});
