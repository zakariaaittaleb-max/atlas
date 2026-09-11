import { describe, expect, it } from 'vitest';

import {
  downstreamBargainingPower,
  resolveDistribution,
  resolveProcurement,
  totalCoverage,
  upstreamBargainingPower,
} from './channels';
import {
  buildPnl,
  corporateTax,
  dasBaseValuation,
  npcOffer,
  payrollCost,
  resolveTransfer,
  riskMargin,
  treasuryStatus,
} from './finance';
import { makeRng } from './math';
import {
  allocateMarketShares,
  applyShockRedistribution,
  competitivenessScore,
  priceCompetitiveness,
  resolveVolume,
  addressableShare,
  ansoffRisk,
  segmentPriceSensitivity,
  unitPrice,
} from './market';
import {
  applyAutomation,
  breakEvenVolume,
  experienceCurveUnitCost,
  nextNotoriety,
  nextQuality,
  skillCostFactor,
  socialCostFactor,
  perceivedQuality,
  utilisationEffects,
} from './operations';
import { buildParams } from './params';
import type { DistributorOffer, SupplierOffer } from './types';

const params = buildParams();

// ===========================================================================
// Opérations
// ===========================================================================

describe('courbe d’expérience', () => {
  it('abaisse le coût unitaire du taux d’apprentissage à chaque doublement', () => {
    // Critère d'acceptation n°5 : doubler le volume cumulé doit abaisser le
    // coût unitaire d'un facteur conforme au taux paramétré, à ±1 %.
    const learningRate = 0.85;
    const cost1x = experienceCurveUnitCost(100, 1_000, 1_000, learningRate, params);
    const cost2x = experienceCurveUnitCost(100, 2_000, 1_000, learningRate, params);
    const cost4x = experienceCurveUnitCost(100, 4_000, 1_000, learningRate, params);

    expect(cost2x / cost1x).toBeCloseTo(learningRate, 3);
    expect(cost4x / cost2x).toBeCloseTo(learningRate, 3);
  });

  it('respecte le plancher de coût : l’apprentissage n’est pas infini', () => {
    const cost = experienceCurveUnitCost(100, 10_000_000, 1_000, 0.85, params);
    expect(cost).toBeCloseTo(100 * 0.55, 6);
  });

  it('ne récompense pas un volume cumulé nul', () => {
    expect(experienceCurveUnitCost(100, 0, 1_000, 0.85, params)).toBe(100);
  });
});

describe('automatisation', () => {
  it('troque du coût variable contre du coût fixe', () => {
    const sans = applyAutomation(100, 1_000_000, 0, 1, params);
    const avec = applyAutomation(100, 1_000_000, 100, 1, params);

    expect(avec.unitVariableCostMad).toBeLessThan(sans.unitVariableCostMad);
    expect(avec.fixedProductionCostMad).toBeGreaterThan(sans.fixedProductionCostMad);
    expect(avec.unitVariableCostMad).toBeCloseTo(70, 6);
    expect(avec.fixedProductionCostMad).toBeCloseTo(1_500_000, 6);
  });

  it('répercute le prix d’achat négocié sur le coût variable', () => {
    const cher = applyAutomation(100, 0, 50, 1.2, params);
    const negocie = applyAutomation(100, 0, 50, 0.9, params);
    expect(negocie.unitVariableCostMad).toBeLessThan(cher.unitVariableCostMad);
  });
});

describe('taux d’utilisation', () => {
  it('facture la sous-absorption des coûts fixes', () => {
    const result = utilisationEffects(300, 1_000, 2_000_000, 50, params);
    expect(result.utilisationRate).toBeCloseTo(0.3, 6);
    expect(result.underabsorptionMad).toBeGreaterThan(0);
    expect(result.subcontractedUnits).toBe(0);
  });

  it('facture la sous-traitance en surchauffe', () => {
    const result = utilisationEffects(1_000, 1_000, 2_000_000, 50, params);
    expect(result.subcontractedUnits).toBeCloseTo(50, 6); // au-delà de 95 %
    expect(result.subcontractingCostMad).toBeCloseTo(50 * 50 * 0.6, 6);
    expect(result.underabsorptionMad).toBe(0);
  });

  it('ne pénalise rien dans la plage optimale', () => {
    const result = utilisationEffects(850, 1_000, 2_000_000, 50, params);
    expect(result.underabsorptionMad).toBe(0);
    expect(result.subcontractingCostMad).toBe(0);
  });
});

describe('qualité et notoriété', () => {
  // Assiette d'effort : 100 M DH de CA sur le DAS. La R&D et le marketing se
  // jugent en INTENSITÉ (part du CA), jamais en montant absolu.
  const CA = 100_000_000;
  const HUIT_PCT = CA * 0.08;

  it('rend la R&D à rendement décroissant', () => {
    const depuisBas = nextQuality(40, HUIT_PCT, CA, 0, params) - 40 * 0.96;
    const depuisHaut = nextQuality(85, HUIT_PCT, CA, 0, params) - 85 * 0.96;
    expect(depuisBas).toBeGreaterThan(depuisHaut);
  });

  it('érode la qualité sans R&D', () => {
    expect(nextQuality(80, 0, CA, 0, params)).toBeLessThan(80);
  });

  it('juge l’effort en intensité, pas en montant absolu', () => {
    // Régression : avec une référence en dirhams, tout budget réaliste sur un
    // gros DAS saturait la qualité à 100 et la notoriété avec elle.
    const petiteEntreprise = nextQuality(50, 0.08 * 10_000_000, 10_000_000, 0, params);
    const grandGroupe = nextQuality(50, 0.08 * 50_000_000_000, 50_000_000_000, 0, params);
    expect(grandGroupe).toBeCloseTo(petiteEntreprise, 6);
    expect(grandGroupe).toBeLessThan(100);

    // Et un budget dérisoire rapporté au CA ne doit rien produire de notable.
    const effortDerisoire = nextQuality(50, 1_000_000, 50_000_000_000, 0, params);
    expect(effortDerisoire).toBeLessThan(50);
  });

  it('fait perdre une marque plus vite qu’un produit', () => {
    const qualitePerdue = 80 - nextQuality(80, 0, CA, 0, params);
    const notorietePerdue = 80 - nextNotoriety(80, 0, CA, 0, params);
    expect(notorietePerdue).toBeGreaterThan(qualitePerdue);
  });

  it('punit deux fois la rupture de stock', () => {
    const sansRupture = nextNotoriety(70, HUIT_PCT, CA, 0, params);
    const avecRupture = nextNotoriety(70, HUIT_PCT, CA, 0.5, params);
    expect(avecRupture).toBeLessThan(sansRupture);

    const perçueOk = perceivedQuality(80, 70, 0, 80, params);
    const perçueRupture = perceivedQuality(80, 70, 0.5, 80, params);
    expect(perçueRupture).toBeLessThan(perçueOk);
  });

  it('fait dépendre la qualité perçue des intrants et du service', () => {
    const bonFournisseur = perceivedQuality(80, 90, 0, 90, params);
    const mauvaisFournisseur = perceivedQuality(80, 30, 0, 90, params);
    expect(bonFournisseur).toBeGreaterThan(mauvaisFournisseur);
  });
});

describe('point mort', () => {
  it('est nul si aucun volume ne rend l’activité rentable', () => {
    expect(breakEvenVolume(1_000_000, 100, 0.3, 90)).toBeNull();
  });

  it('se calcule sur la marge sur coût variable après marge distributeur', () => {
    expect(breakEvenVolume(1_000_000, 100, 0.2, 50)).toBeCloseTo(1_000_000 / 30, 6);
  });
});

// ===========================================================================
// Canaux
// ===========================================================================

describe('pouvoir de négociation amont', () => {
  it('croît avec la part du carnet du fournisseur', () => {
    const petit = upstreamBargainingPower(10, 1_000, 3, 20, params);
    const gros = upstreamBargainingPower(300, 1_000, 3, 20, params);
    expect(gros).toBeGreaterThan(petit);
  });

  it('s’effondre quand le coût de changement est élevé', () => {
    const libre = upstreamBargainingPower(300, 1_000, 3, 0, params);
    const captif = upstreamBargainingPower(300, 1_000, 3, 100, params);
    expect(captif).toBeLessThan(libre - 20);
  });

  it('croît avec le nombre d’alternatives', () => {
    const sansAlternative = upstreamBargainingPower(100, 1_000, 0, 20, params);
    const avecAlternatives = upstreamBargainingPower(100, 1_000, 5, 20, params);
    expect(avecAlternatives).toBeGreaterThan(sansAlternative);
  });
});

describe('approvisionnement', () => {
  const supplier = (o: Partial<SupplierOffer> = {}): SupplierOffer => ({
    actorId: 'f1',
    priceIndex: 1.0,
    reliability: 80,
    qualityContribution: 70,
    capacityUnits: 1_000,
    switchingCost: 30,
    minimumVolume: 0,
    ...o,
  });

  it('pénalise l’absence de décision d’achat', () => {
    const rien = resolveProcurement([], 3, makeRng(1), params);
    expect(rien.priceIndex).toBeGreaterThan(1);
    expect(rien.inputQuality).toBeLessThan(50);
  });

  it('obtient une remise proportionnelle au pouvoir', () => {
    const faible = resolveProcurement(
      [{ supplier: supplier(), committedVolume: 10 }],
      1,
      makeRng(1),
      params,
    );
    const fort = resolveProcurement(
      [{ supplier: supplier({ switchingCost: 0 }), committedVolume: 400 }],
      5,
      makeRng(1),
      params,
    );
    expect(fort.results[0].discountObtained).toBeGreaterThan(faible.results[0].discountObtained);
    expect(fort.priceIndex).toBeLessThan(faible.priceIndex);
  });

  it('fait payer le fournisseur bon marché en ruptures et en qualité', () => {
    const discounter = resolveProcurement(
      [{ supplier: supplier({ priceIndex: 0.8, reliability: 45, qualityContribution: 40 }), committedVolume: 200 }],
      3,
      makeRng(42),
      params,
    );
    const champion = resolveProcurement(
      [{ supplier: supplier({ priceIndex: 1.25, reliability: 92, qualityContribution: 90 }), committedVolume: 200 }],
      3,
      makeRng(42),
      params,
    );

    expect(discounter.priceIndex).toBeLessThan(champion.priceIndex);
    expect(discounter.disruption).toBeGreaterThan(champion.disruption);
    expect(discounter.inputQuality).toBeLessThan(champion.inputQuality);
  });

  it('est déterministe pour une graine donnée', () => {
    const a = resolveProcurement([{ supplier: supplier(), committedVolume: 100 }], 3, makeRng(7), params);
    const b = resolveProcurement([{ supplier: supplier(), committedVolume: 100 }], 3, makeRng(7), params);
    expect(a.disruption).toBe(b.disruption);
  });
});

describe('distribution', () => {
  const distributor = (o: Partial<DistributorOffer> = {}): DistributorOffer => ({
    actorId: 'd1',
    coveragePct: 0.65,
    requiredMarginPct: 0.28,
    negotiatingStrength: 88,
    serviceLevel: 70,
    minimumVolume: 0,
    ...o,
  });

  it('fait de la notoriété la contre-mesure au pouvoir du distributeur', () => {
    const marqueFaible = downstreamBargainingPower(20, 0.3, 0, 88, params);
    const marqueForte = downstreamBargainingPower(95, 0.3, 0, 88, params);
    expect(marqueForte).toBeGreaterThan(marqueFaible);
  });

  it('unit les couvertures au lieu de les additionner', () => {
    const coverage = totalCoverage(
      [
        { distributor: distributor({ coveragePct: 0.5 }), volumeShare: 1 },
        { distributor: distributor({ actorId: 'd2', coveragePct: 0.5 }), volumeShare: 1 },
      ],
      0,
      1_000_000,
    );
    expect(coverage).toBeCloseTo(0.75, 6); // 1 − 0,5 × 0,5, jamais 1,0
  });

  it('récompense la multiplication des canaux plutôt que la concentration', () => {
    // Régression : une version antérieure pondérait la couverture par la part
    // de volume, si bien que répartir entre deux réseaux couvrait MOINS que de
    // tout confier à un seul. Multiplier ses canaux doit élargir sa portée.
    const unSeul = totalCoverage(
      [{ distributor: distributor({ coveragePct: 0.65 }), volumeShare: 1 }],
      0,
      1_000_000,
    );
    const deux = totalCoverage(
      [
        { distributor: distributor({ coveragePct: 0.65 }), volumeShare: 0.5 },
        { distributor: distributor({ actorId: 'd2', coveragePct: 0.65 }), volumeShare: 0.5 },
      ],
      0,
      1_000_000,
    );
    expect(deux).toBeGreaterThan(unSeul);
  });

  it('ferme l’accès à un réseau dont on n’atteint pas le volume minimal', () => {
    // La grande surface nationale n'est pas accessible à une petite équipe,
    // quelle que soit sa bonne volonté. C'est le pouvoir de l'acheteur.
    const grandeSurface = distributor({ coveragePct: 0.65, minimumVolume: 1_000_000 });

    const petiteEquipe = totalCoverage(
      [{ distributor: grandeSurface, volumeShare: 1 }],
      0,
      100_000, // dix fois trop peu
    );
    const grosseEquipe = totalCoverage(
      [{ distributor: grandeSurface, volumeShare: 1 }],
      0,
      1_500_000,
    );

    expect(petiteEquipe).toBeCloseTo(0.065, 6); // 10 % de la couverture
    expect(grosseEquipe).toBeCloseTo(0.65, 6);
  });

  it('donne un contrôle du canal total en réseau propre', () => {
    const result = resolveDistribution([], 60, 20_000_000, 1_000_000, params);
    expect(result.channelControl).toBe(100);
    expect(result.avgMarginPct).toBe(0);
    expect(result.coverage).toBeGreaterThan(0);
  });

  it('réduit la marge cédée quand le rapport de force s’inverse', () => {
    const faible = resolveDistribution(
      [{ distributor: distributor(), volumeShare: 0.9 }],
      20,
      0,
      1_000_000,
      params,
    );
    const fort = resolveDistribution(
      [{ distributor: distributor({ negotiatingStrength: 30 }), volumeShare: 0.9 }],
      95,
      15_000_000,
      1_000_000,
      params,
    );
    expect(fort.avgMarginPct).toBeLessThan(faible.avgMarginPct);
  });
});

// ===========================================================================
// Marché
// ===========================================================================

describe('prix', () => {
  it('mappe le positionnement sur le prix de référence', () => {
    expect(unitPrice(100, 0, params)).toBeCloseTo(60, 6);
    expect(unitPrice(100, 50, params)).toBeCloseTo(100, 6);
    expect(unitPrice(100, 100, params)).toBeCloseTo(140, 6);
  });

  it('fait dépendre l’effet prix de l’élasticité du DAS', () => {
    const elastique = priceCompetitiveness(90, 100, 2.0);
    const rigide = priceCompetitiveness(90, 100, 0.9);
    expect(elastique).toBeGreaterThan(rigide);
  });
});

describe('répartition à somme nulle', () => {
  it('somme exactement à 100 % sans contrainte de couverture', () => {
    const { shares, unservedShare } = allocateMarketShares([
      { teamId: 'a', competitiveness: 0.6, coverageCap: 1, blueOcean: false },
      { teamId: 'b', competitiveness: 0.3, coverageCap: 1, blueOcean: false },
      { teamId: 'c', competitiveness: 0.1, coverageCap: 1, blueOcean: false },
    ]);
    const total = Object.values(shares).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);
    expect(unservedShare).toBeCloseTo(0, 10);
    expect(shares.a).toBeCloseTo(0.6, 10);
  });

  it('respecte le plafond de couverture et redistribue l’excédent', () => {
    const { shares } = allocateMarketShares([
      { teamId: 'fort', competitiveness: 0.9, coverageCap: 0.3, blueOcean: false },
      { teamId: 'moyen', competitiveness: 0.05, coverageCap: 1, blueOcean: false },
      { teamId: 'faible', competitiveness: 0.05, coverageCap: 1, blueOcean: false },
    ]);
    expect(shares.fort).toBeCloseTo(0.3, 10);
    expect(shares.moyen + shares.faible).toBeCloseTo(0.7, 10);
    expect(Object.values(shares).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it('laisse du marché non servi quand personne ne peut le couvrir', () => {
    const { shares, unservedShare } = allocateMarketShares([
      { teamId: 'a', competitiveness: 0.5, coverageCap: 0.2, blueOcean: false },
      { teamId: 'b', competitiveness: 0.5, coverageCap: 0.2, blueOcean: false },
    ]);
    expect(shares.a).toBeCloseTo(0.2, 10);
    expect(shares.b).toBeCloseTo(0.2, 10);
    // 60 % du marché que le pool laisse collectivement sur la table
    expect(unservedShare).toBeCloseTo(0.6, 10);
  });

  it('sort les équipes en océan bleu du calcul du pool', () => {
    const { shares, blueOceanTeams } = allocateMarketShares([
      { teamId: 'bleu', competitiveness: 0.9, coverageCap: 1, blueOcean: true },
      { teamId: 'a', competitiveness: 0.5, coverageCap: 1, blueOcean: false },
      { teamId: 'b', competitiveness: 0.5, coverageCap: 1, blueOcean: false },
    ]);
    expect(blueOceanTeams).toEqual(['bleu']);
    expect(shares.a + shares.b).toBeCloseTo(1, 10);
    expect(shares.a).toBeCloseTo(0.5, 10);
  });

  it('n’attribue jamais de part négative ni supérieure à 1', () => {
    const { shares } = allocateMarketShares([
      { teamId: 'a', competitiveness: 0.001, coverageCap: 1, blueOcean: false },
      { teamId: 'b', competitiveness: 5, coverageCap: 1, blueOcean: false },
    ]);
    for (const value of Object.values(shares)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});

describe('choc PESTEL', () => {
  it('conserve la somme des parts : il déplace, il ne crée pas', () => {
    const before = { a: 0.5, b: 0.3, c: 0.2 };
    const after = applyShockRedistribution(before, ['a'], 10);
    expect(Object.values(after).reduce((x, y) => x + y, 0)).toBeCloseTo(1, 10);
    expect(after.a).toBeGreaterThan(before.a);
    expect(after.b).toBeLessThan(before.b);
  });

  it('ne prend pas plus que ce que les perdants possèdent', () => {
    const after = applyShockRedistribution({ a: 0.95, b: 0.05 }, ['a'], 50);
    expect(after.b).toBeGreaterThanOrEqual(0);
    expect(Object.values(after).reduce((x, y) => x + y, 0)).toBeCloseTo(1, 10);
  });
});

describe('volumes', () => {
  it('perd les ventes que la capacité ne peut pas servir', () => {
    const result = resolveVolume(10_000, 0.4, 3_000, 120);
    expect(result.volumeDemanded).toBeCloseTo(4_000, 6);
    expect(result.volumeSold).toBeCloseTo(3_000, 6);
    expect(result.volumeLost).toBeCloseTo(1_000, 6);
    expect(result.stockoutRate).toBeCloseTo(0.25, 6);
    expect(result.revenueMad).toBeCloseTo(360_000, 6);
  });
});

describe('marché adressable par les segments', () => {
  // Les cinq segments d'un DAS pèsent 1 au total. Ceux qu'on ne sert pas ne
  // rapportent rien : c'est ce que « élargir le marché adressable » veut dire.
  const cinq = [
    { qualityRequirement: 40, marketSharePct: 0.38 },
    { qualityRequirement: 70, marketSharePct: 0.24 },
    { qualityRequirement: 35, marketSharePct: 0.14 },
    { qualityRequirement: 82, marketSharePct: 0.10 },
    { qualityRequirement: 55, marketSharePct: 0.14 },
  ];

  it('divise par deux la part d’un segment trop exigeant', () => {
    expect(addressableShare(50, [{ qualityRequirement: 80, marketSharePct: 1 }], params))
      .toBeCloseTo(0.5, 6);
  });

  it('ne pénalise pas une offre à la hauteur', () => {
    expect(addressableShare(85, [{ qualityRequirement: 80, marketSharePct: 1 }], params))
      .toBe(1);
  });

  it('rend le marché entier à qui sert les cinq segments avec la qualité requise', () => {
    expect(addressableShare(90, cinq, params)).toBeCloseTo(1, 6);
  });

  it('RESTREINT le marché de qui ne sert qu’une niche', () => {
    // Le défaut corrigé : la normalisation rendait 1 dans les deux cas, si
    // bien que se concentrer ne coûtait aucun volume tout en rapportant des
    // points d’alignement. La concentration était strictement dominante.
    const niche = addressableShare(90, [cinq[3]], params);
    expect(niche).toBeCloseTo(0.10, 6);
    expect(niche).toBeLessThan(addressableShare(90, cinq, params));
  });

  it('n’adresse rien quand aucun segment n’est servi', () => {
    expect(addressableShare(90, [], params)).toBe(0);
  });
});

describe('sensibilité au prix des segments servis', () => {
  const cinq = [
    { marketSharePct: 0.38, priceSensitivity: 1.7 },
    { marketSharePct: 0.24, priceSensitivity: 1.2 },
    { marketSharePct: 0.14, priceSensitivity: 1.9 },
    { marketSharePct: 0.10, priceSensitivity: 0.7 },
    { marketSharePct: 0.14, priceSensitivity: 1.5 },
  ];

  it('laisse l’élasticité de branche intacte quand tout le marché est servi', () => {
    // Sans quoi le correctif aurait dérégulé la calibration de tout le jeu :
    // la sensibilité moyenne de l’agro vaut 1,48, pas 1.
    expect(segmentPriceSensitivity(cinq, cinq)).toBeCloseTo(1, 9);
  });

  it('rend le premium bio nettement moins sensible que la moyenne', () => {
    expect(segmentPriceSensitivity([cinq[3]], cinq)).toBeLessThan(0.6);
  });

  it('rend la restauration collective plus sensible que la moyenne', () => {
    expect(segmentPriceSensitivity([cinq[2]], cinq)).toBeGreaterThan(1.2);
  });

  it('rend 1 plutôt qu’un zéro quand aucun segment n’est servi', () => {
    // Un zéro se propagerait dans une multiplication d’élasticité.
    expect(segmentPriceSensitivity([], cinq)).toBe(1);
  });
});

describe('compétitivité', () => {
  it('reste strictement positive pour ne pas casser la répartition', () => {
    const score = competitivenessScore(
      {
        perceivedQuality: 0,
        notoriety: 0,
        priceCompetitiveness: 0,
        iaScore: 0,
        competitivePressure: 1,
        ansoffRiskCoefficient: 0.9,
        roundsSinceLaunch: 0,
        treasuryMalus: 0.2,
      },
      params,
    );
    expect(score).toBeGreaterThan(0);
  });

  it('applique le risque Ansoff les deux premiers tours seulement', () => {
    const base = {
      perceivedQuality: 70, notoriety: 60, priceCompetitiveness: 0.5, iaScore: 75,
      competitivePressure: 0.3, ansoffRiskCoefficient: 0.28, treasuryMalus: 0,
    };
    const jeune = competitivenessScore({ ...base, roundsSinceLaunch: 1 }, params);
    const mature = competitivenessScore({ ...base, roundsSinceLaunch: 2 }, params);
    expect(jeune).toBeLessThan(mature);
    expect(jeune / mature).toBeCloseTo(0.72, 6);
  });
});

// ===========================================================================
// Finance
// ===========================================================================

describe('fiscalité', () => {
  it('applique la cotisation minimale à une équipe déficitaire', () => {
    const result = corporateTax(-5_000_000, 80_000_000, 'droit_commun', params);
    expect(result.minimumContributionApplied).toBe(true);
    expect(result.taxMad).toBeCloseTo(80_000_000 * 0.0025, 6);
  });

  it('applique le plancher absolu quand le CA est négligeable', () => {
    const result = corporateTax(-100, 100_000, 'droit_commun', params);
    expect(result.taxMad).toBe(3_000);
  });

  it('bascule au taux majoré au-delà du seuil', () => {
    const bas = corporateTax(50_000_000, 300_000_000, 'droit_commun', params);
    const haut = corporateTax(150_000_000, 900_000_000, 'droit_commun', params);
    expect(bas.taxMad).toBeCloseTo(50_000_000 * 0.2, 6);
    expect(haut.taxMad).toBeCloseTo(150_000_000 * 0.35, 6);
  });

  it('applique le taux banque-assurance au-delà du seuil', () => {
    const result = corporateTax(150_000_000, 900_000_000, 'banque_assurance', params);
    expect(result.taxMad).toBeCloseTo(150_000_000 * 0.4, 6);
  });
});

describe('dette', () => {
  it('renchérit avec le levier', () => {
    const sansDette = riskMargin(0, 100_000_000, params);
    const endette = riskMargin(300_000_000, 100_000_000, params);
    expect(sansDette).toBeCloseTo(0.015, 6);
    expect(endette).toBeCloseTo(0.075, 6);
  });
});

describe('charges de personnel', () => {
  it('revalide le plancher SMIG côté serveur', () => {
    const sousLeSmig = payrollCost(100, 1_000, params);
    const auSmig = payrollCost(100, 3_422.72, params);
    expect(sousLeSmig).toBeCloseTo(auSmig, 6);
  });

  it('applique les charges patronales', () => {
    expect(payrollCost(10, 10_000, params)).toBeCloseTo(10 * 10_000 * 12 * 1.2109, 6);
  });
});

describe('compte de résultat et trésorerie', () => {
  const baseInput = {
    revenueMad: 100_000_000,
    distributorMarginPct: 0.2,
    cogsMad: 45_000_000,
    marginPremiumPct: 0,
    payrollMad: 15_000_000,
    marketingMad: 5_000_000,
    rdMad: 4_000_000,
    overheadMad: 8_000_000,
    overheadMultiplier: 1,
    fixedProductionMad: 3_000_000,
    consultingMad: 0,
    depreciationMad: 6_000_000,
    debtMad: 30_000_000,
    equityMad: 120_000_000,
    taxRegime: 'droit_commun' as const,
    capexMad: 10_000_000,
    treasuryStartMad: 45_000_000,
    workingCapitalDays: 75,
    previousWorkingCapitalMad: 0,
    debtDrawnMad: 0,
    debtRepaidMad: 0,
    divestitureCashMad: 0,
  };

  it('enchaîne correctement les soldes intermédiaires', () => {
    const pnl = buildPnl(baseInput, params);
    expect(pnl.netRevenueMad).toBeCloseTo(80_000_000, 6);
    expect(pnl.grossMarginMad).toBeCloseTo(35_000_000, 6);
    // 35 − 15 (paie) − 5 (mkt) − 4 (R&D) − 8 (structure) − 3 (fixes) = 0
    expect(pnl.ebitdaMad).toBeCloseTo(0, 6);
    expect(pnl.ebitMad).toBeCloseTo(-6_000_000, 6);
    expect(pnl.netIncomeMad).toBeCloseTo(pnl.pretaxIncomeMad - pnl.corporateTaxMad, 6);

    // Équipe déficitaire : elle paie tout de même la cotisation minimale.
    expect(pnl.pretaxIncomeMad).toBeLessThan(0);
    expect(pnl.corporateTaxMad).toBeCloseTo(100_000_000 * 0.0025, 6);
  });

  it('reconstitue la trésorerie par les flux', () => {
    const pnl = buildPnl(baseInput, params);
    const reconstituee =
      pnl.treasuryStartMad +
      pnl.netIncomeMad +
      pnl.depreciationMad -
      pnl.capexMad -
      pnl.workingCapitalChangeMad;
    expect(pnl.treasuryEndMad).toBeCloseTo(reconstituee, 2);
  });

  it('démontre que la croissance consomme du cash', () => {
    // Même rentabilité, mais le BFR immobilise davantage quand le CA double.
    const stable = buildPnl({ ...baseInput, previousWorkingCapitalMad: 20_833_333 }, params);
    const enCroissance = buildPnl({ ...baseInput, previousWorkingCapitalMad: 0 }, params);
    expect(enCroissance.treasuryEndMad).toBeLessThan(stable.treasuryEndMad);
    expect(enCroissance.workingCapitalChangeMad).toBeGreaterThan(0);
  });

  it('applique la prime de marge issue de l’alignement', () => {
    const aligne = buildPnl({ ...baseInput, marginPremiumPct: 0.08 }, params);
    const desaligne = buildPnl({ ...baseInput, marginPremiumPct: -0.08 }, params);
    expect(aligne.grossMarginMad).toBeGreaterThan(desaligne.grossMarginMad);
    expect(aligne.grossMarginMad - desaligne.grossMarginMad).toBeCloseTo(35_000_000 * 0.16, 4);
  });

  it('applique le multiplicateur de synergie aux charges de structure', () => {
    const synergie = buildPnl({ ...baseInput, overheadMultiplier: 0.9 }, params);
    const coordination = buildPnl({ ...baseInput, overheadMultiplier: 1.15 }, params);
    expect(synergie.overheadMad).toBeCloseTo(7_200_000, 6);
    expect(coordination.overheadMad).toBeCloseTo(9_200_000, 6);
    expect(synergie.ebitdaMad).toBeGreaterThan(coordination.ebitdaMad);
  });
});

describe('paliers de trésorerie', () => {
  it('parcourt les paliers sans couperet brutal', () => {
    const t1 = treasuryStatus(-1_000, 0, params);
    expect(t1.status).toBe('surveillance');
    expect(t1.nextRoundCompetitivenessMalus).toBeCloseTo(0.1, 6);

    const t2 = treasuryStatus(-1_000, t1.consecutiveNegativeRounds, params);
    expect(t2.status).toBe('restructuration');
    expect(t2.nextRoundCompetitivenessMalus).toBeCloseTo(0.2, 6);

    const t3 = treasuryStatus(-1_000, t2.consecutiveNegativeRounds, params);
    expect(t3.status).toBe('liquidation');
  });

  it('remet le compteur à zéro dès que la trésorerie repasse au vert', () => {
    const result = treasuryStatus(1, 2, params);
    expect(result.status).toBe('sain');
    expect(result.consecutiveNegativeRounds).toBe(0);
  });
});

describe('cession de DAS', () => {
  it('valorise sur l’EBITDA quand l’activité est rentable', () => {
    expect(dasBaseValuation(10_000_000, 5.5, 0.05, 0, 0, 0, 0)).toBeCloseTo(60_500_000, 6);
  });

  it('bascule sur les actifs et la position quand l’activité est déficitaire', () => {
    const valeur = dasBaseValuation(-2_000_000, 5.5, 0.05, 10_000, 150, 0.2, 50_000_000);
    expect(valeur).toBeCloseTo(10_000 * 150 + 0.2 * 50_000_000, 6);
  });

  it('décote l’offre du NPC selon la détresse du vendeur', () => {
    const sain = npcOffer(100_000_000, 'sain', makeRng(3), params);
    const detresse = npcOffer(100_000_000, 'restructuration', makeRng(3), params);
    expect(detresse).toBeLessThan(sain);
    expect(detresse / sain).toBeCloseTo(0.7, 6);
  });

  it('offre toujours moins que la valeur de base : c’est un plancher, pas une affaire', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      expect(npcOffer(100_000_000, 'sain', makeRng(seed), params)).toBeLessThan(100_000_000);
    }
  });

  it('détruit jusqu’à 45 % de la valeur si l’intégration n’est pas budgétée', () => {
    const sansBudget = resolveTransfer(100_000_000, 0, 0.3, 70, params);
    expect(sansBudget.valueLossPct).toBeCloseTo(0.45, 6);
    expect(sansBudget.marketShareTransferred).toBeCloseTo(0.165, 6);
    expect(sansBudget.shareReleasedToPool).toBeCloseTo(0.135, 6);
  });

  it('préserve la valeur si l’intégration est correctement financée', () => {
    const bienIntegre = resolveTransfer(100_000_000, 20_000_000, 0.3, 70, params);
    expect(bienIntegre.integrationRatio).toBeCloseTo(1, 6);
    expect(bienIntegre.valueLossPct).toBeCloseTo(0.05, 6);
  });
});

describe('risque d’entrée d’Ansoff', () => {
  /**
   * Le défaut corrigé : les quatre paramètres `ansoff.risk.*` existaient, la
   * matrice était saisie à l'écran d'organisation, et rien ne reliait le
   * mouvement déclaré à son coefficient — le moteur lisait une colonne d'état
   * que seule la persistance des acquisitions alimente. Une équipe déclarait
   * « diversification », le mouvement le plus risqué de la matrice, et n'en
   * subissait aucun risque.
   */
  it('ne fait courir aucun risque à la pénétration de son propre marché', () => {
    expect(ansoffRisk('penetration', params)).toBe(0);
  });

  it('ordonne les quatre mouvements du moins au plus risqué', () => {
    const risques = ['penetration', 'developpement_marche', 'developpement_produit', 'diversification']
      .map((m) => ansoffRisk(m, params));

    for (let i = 1; i < risques.length; i += 1) {
      expect(risques[i]).toBeGreaterThan(risques[i - 1]);
    }
  });

  it('fait de la diversification le mouvement le plus coûteux', () => {
    expect(ansoffRisk('diversification', params)).toBeGreaterThan(0.2);
  });

  it('ne risque rien faute de mouvement déclaré', () => {
    expect(ansoffRisk(null, params)).toBe(0);
    expect(ansoffRisk(undefined, params)).toBe(0);
  });

  it('borne un mouvement inconnu plutôt que de propager un NaN', () => {
    expect(ansoffRisk('mouvement_fantaisiste', params)).toBe(0);
  });
});

// ===========================================================================
// COMPÉTENCE ET ÉCONOMIE
//
// Former coûtait de la trésorerie et ne rapportait qu'un chiffre sur un écran.
// Ces deux liaisons sont les chemins par lesquels la compétence devient un
// avantage économique — et son érosion un handicap.
// ===========================================================================

describe('compétence et coût de production', () => {
  it('ne change rien au niveau de compétence HÉRITÉ', () => {
    expect(skillCostFactor(0, params)).toBeCloseTo(1, 10);
  });

  it('abaisse le coût variable quand l’équipe a formé au-delà de la dotation', () => {
    expect(skillCostFactor(0.6, params)).toBeLessThan(1);
  });

  it('le renchérit quand elle a laissé la compétence s’éroder', () => {
    expect(skillCostFactor(-0.2, params)).toBeGreaterThan(1);
  });

  it('ne rend jamais la production gratuite', () => {
    expect(skillCostFactor(50, params)).toBeGreaterThanOrEqual(0.5);
  });
});

describe('compétence et qualité', () => {
  const CA = 40_000_000_000;
  const RD = 0.08 * CA;

  it('fait mieux rendre le même budget de recherche entre des mains formées', () => {
    const forme = nextQuality(50, RD, CA, 0, params, { skillEdge: 0.6 });
    const neutre = nextQuality(50, RD, CA, 0, params);
    const erode = nextQuality(50, RD, CA, 0, params, { skillEdge: -0.2 });
    expect(forme).toBeGreaterThan(neutre);
    expect(neutre).toBeGreaterThan(erode);
  });

  it('ne détruit pas le produit existant : l’écart porte sur le GAIN', () => {
    // Sans budget de recherche, il n'y a pas de gain à moduler : la compétence
    // ne peut alors ni ajouter ni retirer un point.
    expect(nextQuality(70, 0, CA, 0, params, { skillEdge: -1 }))
      .toBeCloseTo(nextQuality(70, 0, CA, 0, params), 10);
  });

  it('retire les points de qualité que les coupes du tour précédent ont emportés', () => {
    const sain = nextQuality(70, RD, CA, 0, params);
    const coupe = nextQuality(70, RD, CA, 0, params, { qualityLossPts: 6 });
    expect(sain - coupe).toBeCloseTo(6, 6);
  });

  it('ne transforme jamais une perte annoncée en gain', () => {
    expect(nextQuality(70, RD, CA, 0, params, { qualityLossPts: -20 }))
      .toBeCloseTo(nextQuality(70, RD, CA, 0, params), 10);
  });
});

describe('climat social et coût de production', () => {
  it('ne renchérit rien au-dessus du pivot', () => {
    expect(socialCostFactor(0, params)).toBeCloseTo(1, 10);
  });

  it('fait payer les absences et les reprises d’un climat dégradé', () => {
    expect(socialCostFactor(0.5, params)).toBeGreaterThan(1);
    expect(socialCostFactor(1, params)).toBeGreaterThan(socialCostFactor(0.5, params));
  });

  it('reste borné : un climat effondré ne double pas les coûts', () => {
    expect(socialCostFactor(5, params)).toBeCloseTo(socialCostFactor(1, params), 10);
    expect(socialCostFactor(1, params)).toBeLessThan(1.5);
  });
});
