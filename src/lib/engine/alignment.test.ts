import { describe, expect, it } from 'vitest';

import {
  BUSINESS_TARGETS, BUSINESS_WEIGHTS, CORPORATE_WEIGHTS, computeAlignment, diagnoseBusiness, marginPremium, penaltyFn, scoreBusinessAlignment, scoreCorporateAlignment, synergyEffect, valuesFit, verticalIntegrationIndex,
} from './alignment';
import { SAG_WEIGHTS } from './group-alignment';
import { buildParams, param } from './params';
import { BUSINESS_AXES } from './types';
import type { BusinessVector, CorporateInput } from './types';

const params = buildParams();

/** Proximité de test : agro↔retail proches, btp↔textile étrangers. */
const PROXIMITY: Record<string, number> = {
  'agro|retail': 80,
  'btp|equipement': 62,
  'btp|textile': 8,
  'agro|btp': 12,
  'retail|textile': 52,
  'agro|textile': 22,
};
const proximity = (a: string, b: string): number =>
  PROXIMITY[`${a}|${b}`] ?? PROXIMITY[`${b}|${a}`] ?? 20;

/**
 * Le vrai « milieu de gué » de Porter : non pas la médiocrité, mais la
 * CONTRADICTION. Prix premium sur un marché de masse, sans R&D, sans qualité,
 * sans avantage de coût. Aucune stratégie ne ressemble à cela.
 */
const STUCK_VECTOR: BusinessVector = {
  price_position: 85, //  prix premium…
  segment_breadth: 85, //  …sur un marché de masse
  rd_intensity: 10, //     sans rien investir pour le justifier
  quality: 35, //          avec un produit médiocre
  cost_efficiency: 25, //  et sans avantage de coût pour compenser
  scale_index: 45,
  automation_level: 20,
  skill_intensity: 30,
  mkt_intensity: 20,
  channel_control: 30,
    // Axes d'organisation neutres : ces cas portent sur l'économie du DAS.
    org_delegation: 50,
    org_layers: 50,
    axis_fit: 60,
    kpi_fit: 60,
    budget_fit: 60,
    key_roles_fit: 60,
};

function corporateInput(overrides: Partial<CorporateInput> = {}): CorporateInput {
  return {
    corporateStrategy: 'specialisation',
    structureType: 'fonctionnelle',
    centralPurchasing: true,
    centralIt: true,
    centralRd: false,
    centralHr: false,
    centralFinance: true,
    sharedProduction: false,
    sharedRd: false,
    values: ['excellence_produit', 'innovation'],
    activeSectors: ['agro'],
    sharedSupplierRatio: 0,
    sharedDistributorRatio: 0,
    verticalIntegration: 40,
    talentMix: 60,
    dominantStrategy: 'differenciation',
    ...overrides,
  };
}

describe('fonction de pénalité', () => {
  it('est gratuite dans la bande de tolérance', () => {
    expect(penaltyFn(0, params)).toBe(0);
    expect(penaltyFn(0.1, params)).toBe(0);
  });

  it('croît de façon convexe entre la bande et la saturation', () => {
    const p15 = penaltyFn(0.15, params);
    const p25 = penaltyFn(0.25, params);
    const p35 = penaltyFn(0.35, params);
    expect(p15).toBeGreaterThan(0);
    // convexité : le second palier coûte plus cher que le premier
    expect(p25 - p15).toBeLessThan(p35 - p25);
  });

  it('sature à 1 au-delà de 45 points d’écart', () => {
    expect(penaltyFn(0.45, params)).toBe(1);
    expect(penaltyFn(0.7, params)).toBe(1);
    expect(penaltyFn(1, params)).toBe(1);
  });
});

describe('alignement business', () => {
  it('donne 100 à une équipe parfaitement conforme à son profil', () => {
    for (const strategy of ['domination_couts', 'differenciation', 'focus_couts', 'focus_differenciation'] as const) {
      const result = scoreBusinessAlignment(BUSINESS_TARGETS[strategy], strategy, params);
      expect(result.score).toBeCloseTo(100, 6);
    }
  });

  it('rend compte de chaque axe dans le détail', () => {
    const result = scoreBusinessAlignment(BUSINESS_TARGETS.differenciation, 'differenciation', params);
    // 10 axes économiques + 6 axes d'organisation : l'audit doit pouvoir
    // nommer chacun d'eux, sinon le rapport ne dit pas OÙ est l'incohérence.
    expect(result.details).toHaveLength(BUSINESS_AXES.length);
    expect(result.details.every((d) => d.penaltyPts === 0)).toBe(true);
  });

  it('signe l’écart pour que l’audit puisse dire « trop » ou « pas assez »', () => {
    const observed: BusinessVector = { ...BUSINESS_TARGETS.differenciation, rd_intensity: 10 };
    const result = scoreBusinessAlignment(observed, 'differenciation', params);
    const rd = result.details.find((d) => d.axis === 'rd_intensity');
    expect(rd?.gap).toBeLessThan(0); // pas assez de R&D
    expect(rd?.penaltyPts).toBeGreaterThan(0);
  });

  it('punit plus durement un écart concentré qu’un écart équivalent réparti', () => {
    const t = BUSINESS_TARGETS.differenciation;

    // 45 points d'écart concentrés sur le seul axe qualité (poids 0,20)
    const concentre: BusinessVector = { ...t, quality: t.quality - 45 };

    // les mêmes 45 points répartis sur trois axes de poids comparable
    const reparti: BusinessVector = {
      ...t,
      quality: t.quality - 15,
      rd_intensity: t.rd_intensity - 15,
      skill_intensity: t.skill_intensity - 15,
    };

    const scoreConcentre = scoreBusinessAlignment(concentre, 'differenciation', params).score;
    const scoreReparti = scoreBusinessAlignment(reparti, 'differenciation', params).score;

    // C'est le cœur du message pédagogique : une contradiction frontale sur un
    // axe coûte bien plus cher que la même imprécision étalée partout.
    expect(scoreConcentre).toBeLessThan(scoreReparti - 10);
  });
});

describe('diagnostics', () => {
  it('ne déclenche rien pour une équipe conforme', () => {
    const d = diagnoseBusiness(BUSINESS_TARGETS.domination_couts, 'domination_couts', params);
    expect(d.stuckInTheMiddle).toBe(false);
    expect(d.strategicDrift).toBe(false);
    expect(d.bestStrategy).toBe('domination_couts');
  });

  it('détecte la dérive : cohérent, mais pas avec ce qui est déclaré', () => {
    // vecteur de pur low-cost, déclaré en différenciation
    const d = diagnoseBusiness(BUSINESS_TARGETS.domination_couts, 'differenciation', params);
    expect(d.bestStrategy).toBe('domination_couts');
    expect(d.strategicDrift).toBe(true);
    expect(d.stuckInTheMiddle).toBe(false);
    expect(d.bestFit - d.declaredFit).toBeGreaterThan(15);
  });

  it('détecte le milieu de gué : cohérent avec aucune stratégie', () => {
    const d = diagnoseBusiness(STUCK_VECTOR, 'domination_couts', params);
    expect(d.bestFit).toBeLessThan(55);
    expect(d.stuckInTheMiddle).toBe(true);
    // on ne cumule pas les deux diagnostics : il n'y a pas de stratégie
    // alternative cohérente vers laquelle « dériver »
    expect(d.strategicDrift).toBe(false);
  });

  it('ne confond pas la médiocrité avec l’incohérence', () => {
    // Une équipe qui met tout à 50 n'est pas incohérente : elle est terne.
    // L'IA sanctionne l'incohérence ; c'est le marché à somme nulle qui
    // sanctionne l'absence de position distinctive. Séparation volontaire.
    const middling: BusinessVector = {
      price_position: 50, rd_intensity: 50, mkt_intensity: 50, quality: 50, cost_efficiency: 50,
      scale_index: 50, automation_level: 50, skill_intensity: 50, segment_breadth: 50, channel_control: 50,
    // Axes d'organisation neutres : ces cas portent sur l'économie du DAS.
    org_delegation: 50,
    org_layers: 50,
    axis_fit: 60,
    kpi_fit: 60,
    budget_fit: 60,
    key_roles_fit: 60,
    };
    const terne = diagnoseBusiness(middling, 'focus_couts', params);
    const incoherent = diagnoseBusiness(STUCK_VECTOR, 'focus_couts', params);

    expect(terne.stuckInTheMiddle).toBe(false);
    expect(incoherent.stuckInTheMiddle).toBe(true);
    expect(terne.bestFit).toBeGreaterThan(incoherent.bestFit + 20);
  });
});

describe('alignement corporate', () => {
  it('pénalise une structure fonctionnelle sur un portefeuille large', () => {
    const result = scoreCorporateAlignment(
      corporateInput({
        corporateStrategy: 'diversification_conglomerale',
        structureType: 'fonctionnelle',
        activeSectors: ['agro', 'btp', 'textile', 'tourisme'],
      }),
      proximity,
      params,
    );
    const keys = result.penalties.map((p) => p.key);
    expect(keys).toContain('fonctionnelle_portefeuille_large');
    expect(keys.some((k) => k.startsWith('structure_diversification_conglomerale:fonctionnelle'))).toBe(true);
  });

  it('pénalise une matrice sans rien à croiser', () => {
    const result = scoreCorporateAlignment(
      corporateInput({ structureType: 'matricielle', activeSectors: ['agro'] }),
      proximity,
      params,
    );
    expect(result.penalties.map((p) => p.key)).toContain('matricielle_sans_objet');
  });

  it('pénalise la mutualisation stérile entre métiers étrangers', () => {
    const result = scoreCorporateAlignment(
      corporateInput({
        corporateStrategy: 'diversification_liee',
        structureType: 'matricielle',
        activeSectors: ['btp', 'textile'], // proximité 8
        sharedSupplierRatio: 1,
        sharedDistributorRatio: 1,
        sharedProduction: true,
        sharedRd: true,
      }),
      proximity,
      params,
    );
    expect(result.penalties.map((p) => p.key)).toContain('mutualisation_sterile');
  });

  it('pénalise une intégration verticale proclamée mais jamais réalisée', () => {
    const result = scoreCorporateAlignment(
      corporateInput({ corporateStrategy: 'integration_verticale', verticalIntegration: 5 }),
      proximity,
      params,
    );
    expect(result.penalties.map((p) => p.key)).toContain('integration_proclamee');
  });

  it('récompense une diversification liée cohérente', () => {
    const coherent = scoreCorporateAlignment(
      corporateInput({
        corporateStrategy: 'diversification_liee',
        structureType: 'matricielle',
        activeSectors: ['agro', 'retail'], // proximité 80
        sharedSupplierRatio: 0.8,
        sharedDistributorRatio: 0.8,
        sharedProduction: true,
        sharedRd: true,
        centralPurchasing: true,
        centralIt: true,
        centralRd: false,
        centralHr: false,
        centralFinance: true,
      }),
      proximity,
      params,
    );
    const incoherent = scoreCorporateAlignment(
      corporateInput({
        corporateStrategy: 'diversification_liee',
        structureType: 'fonctionnelle',
        activeSectors: ['btp', 'textile'],
        sharedSupplierRatio: 0,
        sharedDistributorRatio: 0,
      }),
      proximity,
      params,
    );
    expect(coherent.score).toBeGreaterThan(incoherent.score + 25);
  });

  it('mesure l’affinité des valeurs avec la stratégie dominante', () => {
    expect(valuesFit(['accessibilite_prix', 'efficience_operationnelle'], 'domination_couts')).toBe(100);
    expect(valuesFit(['excellence_produit', 'innovation'], 'domination_couts')).toBe(0);
    expect(valuesFit(['fiabilite_service', 'ancrage_territorial'], 'focus_couts')).toBe(100);
  });
});

describe('composition de l’IA', () => {
  const baseCorporate = () => scoreCorporateAlignment(corporateInput(), proximity, params);

  it('reste dans [0, 100]', () => {
    const result = computeAlignment(
      {
        perDas: {
          d1: diagnoseBusiness(BUSINESS_TARGETS.differenciation, 'differenciation', params),
        },
        revenueByDas: { d1: 1_000_000 },
        corporate: baseCorporate(),
        strategyChangesThisRound: 0,
        consecutiveImprovingRounds: 0,
      },
      params,
    );
    expect(result.iaFinal).toBeGreaterThanOrEqual(0);
    expect(result.iaFinal).toBeLessThanOrEqual(100);
  });

  it('pondère le SAB par le chiffre d’affaires de chaque DAS', () => {
    const bon = diagnoseBusiness(BUSINESS_TARGETS.differenciation, 'differenciation', params);
    const mauvais = diagnoseBusiness(BUSINESS_TARGETS.domination_couts, 'differenciation', params);

    const grosDasBon = computeAlignment(
      {
        perDas: { gros: bon, petit: mauvais },
        revenueByDas: { gros: 9_000_000, petit: 1_000_000 },
        corporate: baseCorporate(),
        strategyChangesThisRound: 0,
        consecutiveImprovingRounds: 0,
      },
      params,
    );
    const grosDasMauvais = computeAlignment(
      {
        perDas: { gros: mauvais, petit: bon },
        revenueByDas: { gros: 9_000_000, petit: 1_000_000 },
        corporate: baseCorporate(),
        strategyChangesThisRound: 0,
        consecutiveImprovingRounds: 0,
      },
      params,
    );
    expect(grosDasBon.sabGlobal).toBeGreaterThan(grosDasMauvais.sabGlobal);
  });

  it('rend gratuit le changement qui résout une dérive', () => {
    const shared = {
      perDas: { d1: diagnoseBusiness(BUSINESS_TARGETS.differenciation, 'differenciation', params) },
      revenueByDas: { d1: 1_000_000 },
      corporate: baseCorporate(),
      consecutiveImprovingRounds: 0,
    };
    const puni = computeAlignment({ ...shared, strategyChangesThisRound: 1 }, params);
    const gratuit = computeAlignment(
      { ...shared, strategyChangesThisRound: 1, driftResolvingChanges: 1 },
      params,
    );
    expect(gratuit.sat).toBeGreaterThan(puni.sat);
    expect(gratuit.iaFinal).toBeGreaterThan(puni.iaFinal);
  });

  it('applique le malus de milieu de gué', () => {
    const result = computeAlignment(
      {
        perDas: { d1: diagnoseBusiness(STUCK_VECTOR, 'domination_couts', params) },
        revenueByDas: { d1: 1_000_000 },
        corporate: baseCorporate(),
        strategyChangesThisRound: 0,
        consecutiveImprovingRounds: 0,
      },
      params,
    );
    expect(result.stuckInTheMiddle).toBe(true);
    expect(result.iaFinal).toBeCloseTo(Math.max(result.iaRaw - 12, 0), 6);
    expect(result.penalties.map((p) => p.key)).toContain('milieu_de_gue');
  });
});

describe('effets économiques de l’alignement', () => {
  it('donne une prime de marge nulle au pivot', () => {
    expect(marginPremium(70, params)).toBeCloseTo(0, 10);
  });

  it('plafonne la prime et le malus à ±8 %', () => {
    expect(marginPremium(100, params)).toBeCloseTo(0.08, 10);
    expect(marginPremium(0, params)).toBeCloseTo(-0.08, 10);
    expect(marginPremium(140, params)).toBeCloseTo(0.08, 10);
  });

  it('récompense la mutualisation de métiers proches', () => {
    const lie = synergyEffect(80, 80, 40, 2, params);
    expect(lie.savingPct).toBeGreaterThan(lie.coordinationCostPct);
    expect(lie.opexMultiplier).toBeLessThan(1);
  });

  it('facture la mutualisation de métiers étrangers', () => {
    const conglomerat = synergyEffect(80, 15, 40, 2, params);
    expect(conglomerat.coordinationCostPct).toBeGreaterThan(conglomerat.savingPct);
    expect(conglomerat.opexMultiplier).toBeGreaterThan(1);
  });

  it('fait grossir le siège avec la centralisation et le nombre de DAS', () => {
    const petit = synergyEffect(0, 50, 100, 1, params);
    const gros = synergyEffect(0, 50, 100, 6, params);
    expect(gros.hqOverheadPct).toBeGreaterThan(petit.hqOverheadPct);
  });
});

// ===========================================================================
// SAG — conformité aux directives du groupe
// ===========================================================================

describe('SAG dans l’indice global', () => {
  const corporate = () => scoreCorporateAlignment(corporateInput(), proximity, params);

  function withSag(sagByDas: Record<string, number> | undefined) {
    return computeAlignment(
      {
        perDas: {
          d1: diagnoseBusiness(BUSINESS_TARGETS.differenciation, 'differenciation', params),
          d2: diagnoseBusiness(BUSINESS_TARGETS.differenciation, 'differenciation', params),
        },
        revenueByDas: { d1: 3_000_000, d2: 1_000_000 },
        corporate: corporate(),
        sagByDas,
        strategyChangesThisRound: 0,
        consecutiveImprovingRounds: 0,
      },
      params,
    );
  }

  it('reste null quand aucune directive n’a été saisie', () => {
    expect(withSag(undefined).sagGlobal).toBeNull();
  });

  it('ne pénalise PAS une équipe pour des directives jamais demandées', () => {
    // Le poids du SAG est REDISTRIBUÉ au prorata : le score obtenu est très
    // exactement celui qu'aurait donné la formule à trois étages d'avant. Sans
    // cela, une session provisionnée avant l'introduction des directives
    // verrait tous ses indices s'effondrer sans qu'aucune décision ait changé.
    const sans = withSag(undefined);

    const wSab = param(params, 'alignment.weight.sab');
    const wSac = param(params, 'alignment.weight.sac');
    const wSat = param(params, 'alignment.weight.sat');
    const somme = wSab + wSac + wSat;

    const attendu =
      (wSab * sans.sabGlobal + wSac * sans.sac + wSat * sans.sat) / somme;

    expect(sans.iaRaw).toBeCloseTo(attendu, 6);
  });

  it('vaut mieux que d’être noté zéro sur un score qu’on n’a pas saisi', () => {
    expect(withSag(undefined).iaFinal).toBeGreaterThan(withSag({ d1: 0, d2: 0 }).iaFinal);
  });

  it('pondère le SAG par le chiffre d’affaires, comme le SAB', () => {
    // d1 pèse 3 fois d2 : 100/0 doit donner 75, pas 50.
    expect(withSag({ d1: 100, d2: 0 }).sagGlobal).toBeCloseTo(75, 4);
    expect(withSag({ d1: 0, d2: 100 }).sagGlobal).toBeCloseTo(25, 4);
  });

  it('renormalise quand un seul DAS a des directives', () => {
    // d2 seul est renseigné : son score vaut pour lui-même, non dilué par le
    // silence de d1.
    expect(withSag({ d2: 60 }).sagGlobal).toBeCloseTo(60, 4);
  });

  it('fait effectivement baisser l’indice quand les DAS ignorent le groupe', () => {
    const aligne = withSag({ d1: 100, d2: 100 });
    const divergent = withSag({ d1: 20, d2: 20 });
    expect(aligne.iaFinal - divergent.iaFinal).toBeGreaterThan(10);
  });

  it('garde les quatre poids sommés à 1', () => {
    const total =
      param(params, 'alignment.weight.sab') +
      param(params, 'alignment.weight.sag') +
      param(params, 'alignment.weight.sac') +
      param(params, 'alignment.weight.sat');
    expect(total).toBeCloseTo(1, 6);
  });
});

// ===========================================================================
// Intégration verticale — un indice DÉRIVÉ, plus une constante
// ===========================================================================

describe('verticalIntegrationIndex', () => {
  const unit = (over: Partial<Parameters<typeof verticalIntegrationIndex>[0][number]> = {}) => ({
    weight: 1_000_000,
    channelControl: 0,
    committedVolume: 0,
    ownedVolume: 0,
    expectedVolume: 1_000,
    ...over,
  });

  it('rend zéro à qui ne contrôle ni son amont ni son aval', () => {
    expect(verticalIntegrationIndex([unit()], params)).toBe(0);
  });

  it('rend cent à qui écoule en propre et DÉTIENT son approvisionnement', () => {
    expect(
      verticalIntegrationIndex(
        [unit({ channelControl: 100, ownedVolume: 1_000 })],
        params,
      ),
    ).toBeCloseTo(100, 6);
  });

  it('compte un CONTRAT pour la moitié d’une DÉTENTION', () => {
    // Contracter n'est pas intégrer : un contrat sécurise l'amont tant qu'il
    // court, détenir le maillon le sécurise tout court. C'est la différence
    // que la stratégie d'intégration verticale prétend faire.
    const contrat = verticalIntegrationIndex([unit({ committedVolume: 1_000 })], params);
    const detention = verticalIntegrationIndex([unit({ ownedVolume: 1_000 })], params);
    expect(contrat).toBeCloseTo(detention / 2, 6);
  });

  it('fait du rachat de son distributeur un levier d’intégration', () => {
    // Racheter le maillon aval remonte `channelControl`, et c'est par ce seul
    // chemin que l'opération atteint l'axe corporate.
    const tiers = verticalIntegrationIndex([unit({ channelControl: 0 })], params);
    const integre = verticalIntegrationIndex([unit({ channelControl: 100 })], params);
    expect(integre).toBeGreaterThan(tiers + 50);
  });

  it('permet ENFIN d’atteindre la cible de la stratégie d’intégration verticale', () => {
    // Le défaut corrigé : l'axe valait 20 pour toujours, alors que la cible est
    // 85 sur le poids le plus lourd de cette stratégie (0,30), plus un malus
    // absolu de −14 en dessous de 30. L'option était injouable.
    const engage = verticalIntegrationIndex(
      [unit({ channelControl: 85, ownedVolume: 900 })],
      params,
    );
    expect(engage).toBeGreaterThan(80);
  });

  it('pondère par le chiffre d’affaires : un DAS marginal ne fait pas une filière', () => {
    const index = verticalIntegrationIndex(
      [
        unit({ weight: 9_000_000_000, channelControl: 0, ownedVolume: 0 }),
        unit({ weight: 1_000_000, channelControl: 100, ownedVolume: 1_000 }),
      ],
      params,
    );
    expect(index).toBeLessThan(5);
  });

  it('pondère à parts égales quand aucun DAS n’a encore de chiffre d’affaires', () => {
    // Premier tour, ou domaine tout juste acquis : ignorer ces DAS reviendrait
    // à supposer qu'une filière naissante n'est pas intégrée.
    const index = verticalIntegrationIndex(
      [
        unit({ weight: 0, channelControl: 100, ownedVolume: 1_000 }),
        unit({ weight: 0, channelControl: 0, ownedVolume: 0 }),
      ],
      params,
    );
    expect(index).toBeCloseTo(50, 6);
  });

  it('rend zéro sans aucun domaine', () => {
    expect(verticalIntegrationIndex([], params)).toBe(0);
  });
});

// ===========================================================================
// Les poids restent ceux du cahier
// ===========================================================================

describe('poids de composition de l’IA', () => {
  it('somment à 1 sur les quatre étages', () => {
    const total = ['sab', 'sag', 'sac', 'sat']
      .reduce((acc, k) => acc + params[`alignment.weight.${k}`], 0);
    expect(total).toBeCloseTo(1, 9);
  });

  /**
   * Le cahier (§6.2) pose une formule à TROIS étages :
   *   IA = 0,55 SAB + 0,35 SAC + 0,10 SAT
   *
   * Le SAG s'y est ajouté depuis, à 0,20. La redistribution au prorata, quand
   * aucune directive n'est saisie, doit retomber EXACTEMENT sur les trois
   * poids du cahier — sans quoi une session ancienne et une session récente ne
   * seraient pas notées sur la même échelle, et deux promotions ne se
   * compareraient plus.
   */
  it('retombent sur la formule à trois étages du cahier sans SAG', () => {
    const { sab, sag, sac, sat } = {
      sab: params['alignment.weight.sab'],
      sag: params['alignment.weight.sag'],
      sac: params['alignment.weight.sac'],
      sat: params['alignment.weight.sat'],
    };
    const scale = (sab + sac + sat + sag) / (sab + sac + sat);

    expect(sab * scale).toBeCloseTo(0.55, 9);
    expect(sac * scale).toBeCloseTo(0.35, 9);
    expect(sat * scale).toBeCloseTo(0.10, 9);
  });

  it('somment à 1 pour les quatre composantes du SAG', () => {
    const total = Object.values(SAG_WEIGHTS).reduce((a, v) => a + v, 0);
    expect(total).toBeCloseTo(1, 9);
  });

  it('somment à 1 sur chaque jeu de poids business et corporate', () => {
    for (const [strategy, weights] of Object.entries(BUSINESS_WEIGHTS)) {
      const total = Object.values(weights).reduce((a, v) => a + v, 0);
      expect(total, `business ${strategy}`).toBeCloseTo(1, 6);
    }
    for (const [strategy, weights] of Object.entries(CORPORATE_WEIGHTS)) {
      const total = Object.values(weights).reduce((a, v) => a + v, 0);
      expect(total, `corporate ${strategy}`).toBeCloseTo(1, 6);
    }
  });
});
