import { describe, expect, it } from 'vitest';

import { VALUE_AFFINITY } from './alignment';
import {
  AUTONOMY_TOLERANCE,
  ROLE_INVESTMENT_RATIO,
  SAG_WEIGHTS,
  type DasStance,
  type GroupDirectives,
  expectedAdoption,
  hqFit,
  identityFit,
  mutualisationFit,
  roleFit,
  scoreGroupAlignment,
} from './group-alignment';
import type { Affinity } from './organisation';

const COUTS: Affinity = {
  domination_couts: 95, differenciation: 10, focus_couts: 80, focus_differenciation: 15,
};
const DIFF: Affinity = {
  domination_couts: 10, differenciation: 95, focus_couts: 15, focus_differenciation: 85,
};

const DIRECTIVES: GroupDirectives = {
  central: { purchasing: true, it: true, rd: false, hr: false, finance: true },
  values: ['accessibilite_prix', 'efficience_operationnelle'],
};

function stance(over: Partial<DasStance> = {}): DasStance {
  return {
    portfolioRole: 'relais',
    hq: { purchasing: true, it: true, rd: false, hr: false, finance: true },
    declaredStrategy: 'domination_couts',
    axes: [{ key: 'reduction_couts', priority: 1, affinity: COUTS }],
    investmentShare: 0.30,
    revenueShare: 0.30,
    offers: [],
    ...over,
  };
}

describe('rôle dans le portefeuille', () => {
  it('donne le maximum quand l’investissement suit exactement le rôle', () => {
    expect(roleFit(stance())).toBeCloseTo(100, 5);
  });

  it('sanctionne un moteur affiché mais non financé', () => {
    const s = stance({ portfolioRole: 'moteur', investmentShare: 0.30, revenueShare: 0.30 });
    expect(roleFit(s)).toBeLessThan(80);
  });

  it('sanctionne autant le sur- que le sous-investissement — la mesure est logarithmique', () => {
    const half = roleFit(stance({ investmentShare: 0.15, revenueShare: 0.30 }));
    const double = roleFit(stance({ investmentShare: 0.60, revenueShare: 0.30 }));
    expect(half).toBeCloseTo(double, 4);
  });

  it('sanctionne une réserve qui dévore l’enveloppe', () => {
    const s = stance({ portfolioRole: 'reserve', investmentShare: 0.45, revenueShare: 0.30 });
    expect(roleFit(s)).toBeLessThan(40);
  });

  it("ne conclut rien d'un DAS sans chiffre d'affaires", () => {
    expect(roleFit(stance({ revenueShare: 0 }))).toBe(50);
  });

  it('ne renvoie jamais l’infini quand un moteur n’investit rien', () => {
    const s = stance({ portfolioRole: 'moteur', investmentShare: 0, revenueShare: 0.30 });
    expect(Number.isFinite(roleFit(s))).toBe(true);
    expect(roleFit(s)).toBeGreaterThanOrEqual(0);
  });

  it('classe les quatre rôles par intensité décroissante', () => {
    const r = ROLE_INVESTMENT_RATIO;
    expect(r.moteur).toBeGreaterThan(r.relais);
    expect(r.relais).toBeGreaterThan(r.soutien);
    expect(r.soutien).toBeGreaterThan(r.reserve);
  });
});

describe('mutualisation', () => {
  it('ne reproche rien à un DAS auquel le groupe n’a rien ouvert', () => {
    expect(mutualisationFit([])).toBe(100);
  });

  it('récompense l’adhésion quand les métiers sont proches', () => {
    const fit = mutualisationFit([
      { resourceKey: 'centrale_achat', proximity: 90, adoptionLevel: 88 },
    ]);
    expect(fit).toBeGreaterThan(95);
  });

  it("récompense l'ABSTENTION quand les métiers sont éloignés", () => {
    const abstenu = mutualisationFit([
      { resourceKey: 'usine_partagee', proximity: 20, adoptionLevel: 5 },
    ]);
    const adhere = mutualisationFit([
      { resourceKey: 'usine_partagee', proximity: 20, adoptionLevel: 90 },
    ]);
    expect(abstenu).toBeGreaterThan(adhere + 40);
  });

  it('place le point de bascule autour de 40 de proximité', () => {
    // En deçà, la bonne décision est de s'abstenir ; au-delà, d'adhérer.
    expect(expectedAdoption(35)).toBeLessThan(30);
    expect(expectedAdoption(80)).toBeGreaterThan(70);
  });
});

describe('fonctions pilotées au siège', () => {
  it('donne le maximum à un accord parfait', () => {
    expect(hqFit(DIRECTIVES, stance())).toBeCloseTo(100, 5);
  });

  it('sanctionne lourdement un DAS de coûts qui refuse la centrale d’achat', () => {
    const s = stance({
      declaredStrategy: 'domination_couts',
      hq: { purchasing: false, it: true, rd: false, hr: false, finance: true },
    });
    expect(hqFit(DIRECTIVES, s)).toBeLessThan(85);
  });

  it('tolère qu’une niche différenciée garde sa R&D', () => {
    const central = { purchasing: true, it: true, rd: true, hr: false, finance: true };
    const niche = stance({
      declaredStrategy: 'focus_differenciation',
      hq: { purchasing: true, it: true, rd: false, hr: false, finance: true },
    });
    const couts = stance({
      declaredStrategy: 'domination_couts',
      hq: { purchasing: true, it: true, rd: false, hr: false, finance: true },
    });

    const fitNiche = hqFit({ ...DIRECTIVES, central }, niche);
    const fitCouts = hqFit({ ...DIRECTIVES, central }, couts);
    expect(fitNiche).toBeGreaterThan(fitCouts);
  });

  it('punit moins l’excès de zèle que la désertion', () => {
    const deserte = stance({
      hq: { purchasing: false, it: true, rd: false, hr: false, finance: true },
    });
    const zele = stance({
      hq: { purchasing: true, it: true, rd: true, hr: false, finance: true },
    });
    expect(hqFit(DIRECTIVES, zele)).toBeGreaterThan(hqFit(DIRECTIVES, deserte));
  });

  it('garde la tolérance R&D croissante du coût vers la niche', () => {
    const t = AUTONOMY_TOLERANCE;
    expect(t.domination_couts.rd).toBeLessThan(t.differenciation.rd);
    expect(t.differenciation.rd).toBeLessThan(t.focus_differenciation.rd);
  });

  it('ne tolère jamais l’autonomie financière — elle n’est pas une option', () => {
    for (const s of Object.values(AUTONOMY_TOLERANCE)) {
      expect(s.finance).toBeLessThanOrEqual(0.10);
    }
  });
});

describe('identité', () => {
  it('reconnaît un DAS qui décline les valeurs du groupe', () => {
    const s = stance({ axes: [{ key: 'reduction_couts', priority: 1, affinity: COUTS }] });
    expect(identityFit(DIRECTIVES, s, VALUE_AFFINITY)).toBeGreaterThan(70);
  });

  it('relève un DAS qui les contredit', () => {
    const fidele = identityFit(DIRECTIVES, stance(), VALUE_AFFINITY);
    const contraire = identityFit(
      DIRECTIVES,
      stance({ axes: [{ key: 'montee_en_gamme', priority: 1, affinity: DIFF }] }),
      VALUE_AFFINITY,
    );
    expect(contraire).toBeLessThan(fidele - 20);
  });

  it('ne confond pas le silence et la contradiction', () => {
    expect(identityFit(DIRECTIVES, stance({ axes: [] }), VALUE_AFFINITY)).toBe(50);
  });

  it('pondère le premier axe plus lourdement que le troisième', () => {
    const coutsDabord = identityFit(DIRECTIVES, stance({
      axes: [
        { key: 'a', priority: 1, affinity: COUTS },
        { key: 'b', priority: 3, affinity: DIFF },
      ],
    }), VALUE_AFFINITY);

    const diffDabord = identityFit(DIRECTIVES, stance({
      axes: [
        { key: 'b', priority: 1, affinity: DIFF },
        { key: 'a', priority: 3, affinity: COUTS },
      ],
    }), VALUE_AFFINITY);

    expect(coutsDabord).toBeGreaterThan(diffDabord);
  });
});

describe('synthèse', () => {
  it('somme les poids à 1', () => {
    const total = Object.values(SAG_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it('reste borné sur 0–100 dans le pire des cas', () => {
    const pire = stance({
      portfolioRole: 'reserve',
      investmentShare: 0.9,
      revenueShare: 0.05,
      declaredStrategy: 'domination_couts',
      hq: { purchasing: false, it: false, rd: true, hr: true, finance: false },
      axes: [{ key: 'montee_en_gamme', priority: 1, affinity: DIFF }],
      offers: [{ resourceKey: 'usine_partagee', proximity: 10, adoptionLevel: 100 }],
    });
    const r = scoreGroupAlignment(DIRECTIVES, pire, VALUE_AFFINITY);
    expect(r.sag).toBeGreaterThanOrEqual(0);
    expect(r.sag).toBeLessThanOrEqual(100);
  });

  it('félicite un DAS parfaitement aligné', () => {
    const r = scoreGroupAlignment(DIRECTIVES, stance(), VALUE_AFFINITY);
    expect(r.sag).toBeGreaterThan(90);
    expect(r.divergenceNote).toContain('fidèlement');
  });

  it('nomme la divergence la plus COÛTEUSE, pas la plus basse en score', () => {
    // Le classement se fait en POINTS PERDUS (écart × poids), pas en score
    // brut : une composante à 60 qui pèse 0,32 coûte plus qu'une composante à
    // 40 qui pèse 0,16. On vérifie la propriété plutôt qu'un chiffre supposé.
    const s = stance({
      portfolioRole: 'moteur',
      investmentShare: 0.30,
      revenueShare: 0.30,
      axes: [{ key: 'montee_en_gamme', priority: 1, affinity: DIFF }],
    });
    const r = scoreGroupAlignment(DIRECTIVES, s, VALUE_AFFINITY);

    const perdus = {
      role: (100 - r.roleFit) * SAG_WEIGHTS.role,
      mutual: (100 - r.mutualisationFit) * SAG_WEIGHTS.mutualisation,
      hq: (100 - r.hqFit) * SAG_WEIGHTS.hq,
      identity: (100 - r.identityFit) * SAG_WEIGHTS.identity,
    };
    const pire = Object.entries(perdus).sort((a, b) => b[1] - a[1])[0][0];

    // Ici l'identité coûte davantage que le rôle, bien que le rôle soit un
    // écart plus visible : c'est bien l'identité qui doit être nommée.
    expect(pire).toBe('identity');
    expect(r.divergenceNote).toContain('identité');
  });

  it('nomme le rôle quand c’est lui qui coûte le plus', () => {
    const s = stance({
      portfolioRole: 'reserve',
      investmentShare: 0.50,
      revenueShare: 0.10,
    });
    const r = scoreGroupAlignment(DIRECTIVES, s, VALUE_AFFINITY);
    expect(r.divergenceNote).toContain('reserve');
  });

  it('distingue le rôle affiché non financé du rôle sur-financé', () => {
    const affame = scoreGroupAlignment(DIRECTIVES, stance({
      portfolioRole: 'moteur', investmentShare: 0.10, revenueShare: 0.30,
    }), VALUE_AFFINITY);
    const gave = scoreGroupAlignment(DIRECTIVES, stance({
      portfolioRole: 'reserve', investmentShare: 0.50, revenueShare: 0.30,
    }), VALUE_AFFINITY);

    expect(affame.divergenceNote).toContain('pas financé');
    expect(gave.divergenceNote).toContain('détriment');
  });

  it("dit quand la plateforme est payée mais inutilisée", () => {
    const s = stance({ offers: [
      { resourceKey: 'centrale_achat', proximity: 95, adoptionLevel: 0 },
    ] });
    const r = scoreGroupAlignment(DIRECTIVES, s, VALUE_AFFINITY);
    expect(r.divergenceNote).toContain('synergie ne vient pas');
  });
});
