import { describe, expect, it } from 'vitest';

import {
  HOURS_PER_MONTH,
  RESTRUCTURING_CLIMATE_COST,
  giacSupport,
  nextClimatSocial,
  nextSkillIndex,
  ofpptReimbursement,
  qualityLossFromCuts,
  safeHeadcountReduction,
  severancePerHead,
  standardisationLevel,
  turnoverRate,
  workloadIndex,
} from './hr';
import { buildParams } from './params';

const params = buildParams();

describe('indemnités de licenciement (article 53)', () => {
  it('applique le barème par TRANCHE, pas le taux de la tranche atteinte', () => {
    // 8 ans = 5 × 96 h + 3 × 144 h = 912 h, et non 8 × 144 = 1152 h.
    const salaire = 6000;
    const attendu = (912 * salaire) / HOURS_PER_MONTH + 2 * salaire;
    expect(severancePerHead(salaire, 8)).toBeCloseTo(attendu, 2);
  });

  it('facture le préavis même sans ancienneté', () => {
    expect(severancePerHead(6000, 0)).toBeCloseTo(12000, 2);
  });

  it('croît avec l’ancienneté, sans jamais décroître', () => {
    let precedent = -1;
    for (const annees of [0, 2, 5, 8, 12, 20, 30]) {
      const v = severancePerHead(6000, annees);
      expect(v).toBeGreaterThan(precedent);
      precedent = v;
    }
  });

  it('représente plusieurs mois de salaire pour une ancienneté courante', () => {
    // Huit ans d'ancienneté : le geste se paie d'avance, et lourdement.
    const mois = severancePerHead(6000, 8) / 6000;
    expect(mois).toBeGreaterThan(6);
    expect(mois).toBeLessThan(9);
  });
});

describe('financements publics', () => {
  it('plafonne l’OFPPT à la MASSE SALARIALE, pas au budget engagé', () => {
    const payroll = 10_000_000;
    const plafond = payroll * 0.016;
    // On dépense dix fois le droit de tirage : le remboursement plafonne.
    expect(ofpptReimbursement(plafond * 10, payroll, params)).toBeCloseTo(plafond, 2);
  });

  it('rembourse 70 % en deçà du plafond', () => {
    expect(ofpptReimbursement(100_000, 100_000_000, params)).toBeCloseTo(70_000, 2);
  });

  it('ne verse rien du GIAC sans bilan de compétences', () => {
    expect(giacSupport(false, 10_000_000, params)).toBe(0);
    expect(giacSupport(true, 10_000_000, params)).toBeGreaterThan(0);
  });
});

describe('charge de travail', () => {
  const base = {
    demandUnits: 900_000, headcount: 1000, baseProductivity: 900,
    standardisationLevel: 0, automationLevel: 0, skillIndex: 50,
  };

  it('vaut environ 100 quand l’effectif absorbe exactement la demande', () => {
    expect(workloadIndex(base)).toBeCloseTo(100, 0);
  });

  it('baisse avec la standardisation, à effectif constant', () => {
    expect(workloadIndex({ ...base, standardisationLevel: 100 }))
      .toBeLessThan(workloadIndex(base));
  });

  it('baisse PLUS avec l’automatisation qu’avec la standardisation', () => {
    const std = workloadIndex({ ...base, standardisationLevel: 100 });
    const auto = workloadIndex({ ...base, automationLevel: 100 });
    expect(auto).toBeLessThan(std);
  });

  it('monte quand la demande dépasse la capacité', () => {
    expect(workloadIndex({ ...base, demandUnits: 1_800_000 })).toBeGreaterThan(150);
  });

  it('reste borné même sans effectif', () => {
    expect(workloadIndex({ ...base, headcount: 0 })).toBeLessThanOrEqual(200);
  });
});

describe('climat social', () => {
  const base = {
    previousClimat: 70, workloadIndex: 100, hiringRatio: 0, layoffRatio: 0,
    trainingIntensity: 0, salaryRatio: 1, automationDelta: 0,
    restructuring: 'aucune' as const,
  };

  it('se dégrade en surcharge', () => {
    expect(nextClimatSocial({ ...base, workloadIndex: 160 }, params))
      .toBeLessThan(nextClimatSocial(base, params));
  });

  it('se dégrade AUSSI en sous-charge, mais moins qu’en surcharge', () => {
    const sous = nextClimatSocial({ ...base, workloadIndex: 50 }, params);
    const sur = nextClimatSocial({ ...base, workloadIndex: 150 }, params);
    const normal = nextClimatSocial(base, params);
    expect(sous).toBeLessThan(normal);
    expect(sur).toBeLessThan(sous);
  });

  it('chute dès le PREMIER licenciement, avant tout effet de volume', () => {
    const un = nextClimatSocial({ ...base, layoffRatio: 0.001 }, params);
    expect(nextClimatSocial(base, params) - un).toBeGreaterThan(7);
  });

  it('classe les restructurations par brutalité croissante', () => {
    const c = RESTRUCTURING_CLIMATE_COST;
    expect(c.aucune).toBeLessThan(c.reorganisation);
    expect(c.reorganisation).toBeLessThan(c.externalisation);
    expect(c.externalisation).toBeLessThan(c.fermeture_site);
  });

  it('atténue le choc de l’automatisation quand la formation l’accompagne', () => {
    const seul = nextClimatSocial({ ...base, automationDelta: 30 }, params);
    const accompagne = nextClimatSocial(
      { ...base, automationDelta: 30, trainingIntensity: 0.01 }, params,
    );
    expect(accompagne).toBeGreaterThan(seul);
  });

  it('permet de REMONTER un climat dégradé — la faute n’est pas définitive', () => {
    const bas = 20;
    const remonte = nextClimatSocial(
      { ...base, previousClimat: bas, trainingIntensity: 0.02, salaryRatio: 1.15 },
      params,
    );
    expect(remonte).toBeGreaterThan(bas);
  });

  it('reste borné sur 0–100', () => {
    const pire = nextClimatSocial({
      previousClimat: 5, workloadIndex: 200, hiringRatio: 0.9, layoffRatio: 0.5,
      trainingIntensity: 0, salaryRatio: 0.5, automationDelta: 100,
      restructuring: 'fermeture_site',
    }, params);
    expect(pire).toBeGreaterThanOrEqual(0);
    expect(pire).toBeLessThanOrEqual(100);
  });
});

describe('rotation', () => {
  it('monte quand le climat se dégrade', () => {
    expect(turnoverRate(20, 50, params)).toBeGreaterThan(turnoverRate(80, 50, params));
  });

  it('emporte d’abord les plus qualifiés — ils ont un marché', () => {
    expect(turnoverRate(25, 90, params)).toBeGreaterThan(turnoverRate(25, 20, params));
  });

  it('garde un plancher incompressible même à climat parfait', () => {
    expect(turnoverRate(100, 50, params)).toBeGreaterThan(0);
  });
});

describe('compétence', () => {
  const base = {
    previousSkill: 50, trainingIntensity: 0, skillsAuditOrdered: false,
    hiringRatio: 0, internalHiringRatio: 0, turnoverRate: 0.04,
  };

  it('progresse davantage quand un bilan de compétences a précédé', () => {
    const sans = nextSkillIndex({ ...base, trainingIntensity: 0.02 }, params);
    const avec = nextSkillIndex(
      { ...base, trainingIntensity: 0.02, skillsAuditOrdered: true }, params,
    );
    expect(avec).toBeGreaterThan(sans);
  });

  it('se dilue au recrutement externe, pas au recrutement intergroupe', () => {
    const externe = nextSkillIndex({ ...base, hiringRatio: 0.3 }, params);
    const interne = nextSkillIndex(
      { ...base, hiringRatio: 0.3, internalHiringRatio: 0.3 }, params,
    );
    expect(interne).toBeGreaterThan(externe);
  });

  it('recule quand la rotation emporte les qualifiés', () => {
    expect(nextSkillIndex({ ...base, turnoverRate: 0.4 }, params))
      .toBeLessThan(nextSkillIndex(base, params));
  });
});

describe('standardisation et réduction d’effectif', () => {
  it('ne compte que ce qui est à la fois adopté ET standardisé', () => {
    expect(standardisationLevel([{ adoptionLevel: 100, standardised: false }])).toBe(0);
    expect(standardisationLevel([{ adoptionLevel: 100, standardised: true }])).toBe(100);
  });

  it('rapporte au nombre de ressources OUVERTES, pas standardisées', () => {
    // Une plateforme standardisée sur deux ouvertes : 50, pas 100.
    expect(standardisationLevel([
      { adoptionLevel: 100, standardised: true },
      { adoptionLevel: 80, standardised: false },
    ])).toBe(50);
  });

  it('n’autorise aucune réduction sans standardisation ni automatisation', () => {
    expect(safeHeadcountReduction(1000, 0, 0, params)).toBe(0);
  });

  it('autorise une réduction proportionnée quand les deux sont acquises', () => {
    const marge = safeHeadcountReduction(1000, 100, 100, params);
    expect(marge).toBeGreaterThan(0);
    expect(marge).toBeLessThanOrEqual(180);
  });

  it('ne facture aucune qualité en deçà de la marge autorisée', () => {
    expect(qualityLossFromCuts(50, 100, 1000)).toBe(0);
  });

  it('facture la qualité au-delà — la réduction est permise, pas offerte', () => {
    expect(qualityLossFromCuts(300, 100, 1000)).toBeGreaterThan(0);
  });

  it('plafonne la perte de qualité, sans jamais l’annuler', () => {
    expect(qualityLossFromCuts(900, 0, 1000)).toBeLessThanOrEqual(30);
    expect(qualityLossFromCuts(900, 0, 1000)).toBeGreaterThan(20);
  });
});
