import { describe, expect, it } from 'vitest';

import {
  HOURS_PER_MONTH, RESTRUCTURING_CLIMATE_SHARE, consolidateClimate, qualityFocusFactor, restructuringClimateCost, skillEdge, socialAvailability, socialShortfall, consolidateHeadcount, giacSupport, nextClimatSocial, nextSkillIndex, ofpptReimbursement, qualityLossFromCuts, safeHeadcountReduction, severancePerHead, standardisationLevel, trainingFocusEffects, turnoverRate, workloadIndex,
} from './hr';
import { buildParams, param } from './params';

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
    const c = RESTRUCTURING_CLIMATE_SHARE;
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

// ===========================================================================
// Orientation de la formation — quatre décisions, quatre effets
// ===========================================================================

describe('orientation de la formation', () => {
  /**
   * Le défaut corrigé : `training_focus` était saisi, validé, stocké, chargé
   * dans l'instantané — et lu par personne. Les quatre orientations avaient
   * rigoureusement le même effet : aucun. L'écran en annonçait pourtant quatre
   * distincts, ce qui en faisait une décision d'apparence.
   */
  it('donne à chaque orientation un profil distinct', () => {
    const profils = (['technique', 'management', 'qualite', 'polyvalence'] as const)
      .map((f) => JSON.stringify(trainingFocusEffects(f)));
    expect(new Set(profils).size).toBe(4);
  });

  it('fait de la technique la meilleure voie vers la compétence', () => {
    const technique = trainingFocusEffects('technique').skill;
    for (const autre of ['management', 'qualite', 'polyvalence'] as const) {
      expect(technique).toBeGreaterThan(trainingFocusEffects(autre).skill);
    }
  });

  it('fait du management la meilleure voie vers le climat', () => {
    const management = trainingFocusEffects('management').climat;
    for (const autre of ['technique', 'qualite', 'polyvalence'] as const) {
      expect(management).toBeGreaterThan(trainingFocusEffects(autre).climat);
    }
  });

  it('fait de la qualité la meilleure voie vers la montée en gamme', () => {
    const qualite = trainingFocusEffects('qualite').quality;
    for (const autre of ['technique', 'management', 'polyvalence'] as const) {
      expect(qualite).toBeGreaterThan(trainingFocusEffects(autre).quality);
    }
  });

  it('fait de la polyvalence la meilleure voie vers la standardisation', () => {
    // C'est le seul chemin par lequel un effectif se réduit sans perte de
    // qualité : l'orientation qui le sert doit être identifiable.
    const polyvalence = trainingFocusEffects('polyvalence').standardisation;
    for (const autre of ['technique', 'management', 'qualite'] as const) {
      expect(polyvalence).toBeGreaterThan(trainingFocusEffects(autre).standardisation);
    }
  });

  it('spécialiser rend PLUS sur sa cible que la polyvalence partout', () => {
    // Sans cet écart, choisir n'aurait aucune conséquence.
    const cible = trainingFocusEffects('qualite').quality;
    const partout = trainingFocusEffects('polyvalence').quality;
    expect(cible).toBeGreaterThan(partout * 1.2);
  });

  it('retombe sur la technique faute d’orientation saisie', () => {
    expect(trainingFocusEffects(null)).toEqual(trainingFocusEffects('technique'));
    expect(trainingFocusEffects(undefined)).toEqual(trainingFocusEffects('technique'));
  });

  it('module réellement le gain de compétence', () => {
    const base = {
      previousSkill: 50, trainingIntensity: 0.04, skillsAuditOrdered: false,
      hiringRatio: 0, internalHiringRatio: 0, turnoverRate: 0,
    };
    const technique = nextSkillIndex(
      { ...base, focusMultiplier: trainingFocusEffects('technique').skill }, params,
    );
    const management = nextSkillIndex(
      { ...base, focusMultiplier: trainingFocusEffects('management').skill }, params,
    );
    expect(technique).toBeGreaterThan(management);
  });
});

// ===========================================================================
// Consolidation d'équipe — une seule source, pas deux modèles
// ===========================================================================

describe('consolidateClimate', () => {
  /**
   * Le défaut corrigé : deux modèles de climat coexistaient, et le plus
   * grossier alimentait le dashboard ET le Balanced Scorecard. Sans décision RH
   * il rendait exactement la valeur précédente — sur une partie de dix tours,
   * le climat de groupe restait figé à sa valeur de départ, quelle que soit la
   * charge que les équipes faisaient peser sur leurs effectifs.
   */
  it('pondère par l’effectif : un petit domaine ne fait pas la loi', () => {
    const climat = consolidateClimate(
      [{ climatSocial: 20, headcount: 40 }, { climatSocial: 80, headcount: 1_000 }],
      70,
    );
    expect(climat).toBeCloseTo((20 * 40 + 80 * 1000) / 1040, 6);
    expect(climat).toBeGreaterThan(75);
  });

  it('ne laisse pas mille personnes sereines effacer un domaine en souffrance', () => {
    // La pondération reste une moyenne : la souffrance pèse à proportion des
    // gens qui la vivent, ni plus ni moins.
    const sain = consolidateClimate([{ climatSocial: 80, headcount: 1_000 }], 70);
    const mixte = consolidateClimate(
      [{ climatSocial: 80, headcount: 1_000 }, { climatSocial: 15, headcount: 300 }], 70,
    );
    expect(mixte).toBeLessThan(sain);
  });

  it('SUIT le climat des domaines, sans décision RH', () => {
    // C'est tout l'objet du correctif : le climat de groupe bouge parce que
    // celui des domaines a bougé, pas parce qu'on a coché quelque chose.
    expect(consolidateClimate([{ climatSocial: 42, headcount: 500 }], 80)).toBeCloseTo(42, 6);
  });

  it('retombe sur la valeur précédente sans aucun domaine', () => {
    expect(consolidateClimate([], 63)).toBe(63);
  });

  it('rend la moyenne simple quand aucun domaine n’a d’effectif', () => {
    expect(consolidateClimate(
      [{ climatSocial: 40, headcount: 0 }, { climatSocial: 60, headcount: 0 }], 70,
    )).toBeCloseTo(50, 6);
  });

  it('borne le résultat sur 0–100', () => {
    expect(consolidateClimate([{ climatSocial: 140, headcount: 10 }], 70)).toBe(100);
    expect(consolidateClimate([], -20)).toBe(0);
  });
});

describe('consolidateHeadcount', () => {
  it('additionne ce que le moteur a réellement calculé par domaine', () => {
    // Le calcul d'équipe ignorait les transferts internes et le plancher
    // appliqué par domaine : deux chemins, deux nombres.
    expect(consolidateHeadcount(
      [{ headcount: 1_200 }, { headcount: 340 }, { headcount: 8 }], 0,
    )).toBe(1_548);
  });

  it('retombe sur la valeur de repli sans aucun domaine', () => {
    expect(consolidateHeadcount([], 900)).toBe(900);
  });

  it('n’additionne jamais un effectif négatif', () => {
    expect(consolidateHeadcount([{ headcount: 100 }, { headcount: -50 }], 0)).toBe(100);
  });
});

// ===========================================================================
// LES DEUX SORTIES DE LA BOUCLE RH
//
// Ces tests portent sur ce qui manquait : jusqu'ici la chaîne RH se refermait
// sur elle-même et n'atteignait jamais la production.
// ===========================================================================

describe('disponibilité sociale', () => {
  it('ne retire rien au-dessus du pivot de 60', () => {
    expect(socialAvailability(60, params)).toBeCloseTo(1, 10);
    expect(socialAvailability(85, params)).toBeCloseTo(1, 10);
    expect(socialAvailability(100, params)).toBeCloseTo(1, 10);
  });

  it('retire le poids plein quand le climat est effondré', () => {
    const poids = param(params, 'climate.capacity_impact_weight');
    expect(socialAvailability(0, params)).toBeCloseTo(1 - poids, 10);
  });

  it('décroît sans discontinuité entre les deux', () => {
    let precedent = 1.01;
    for (const climat of [60, 50, 40, 30, 20, 10, 0]) {
      const v = socialAvailability(climat, params);
      expect(v).toBeLessThan(precedent);
      precedent = v;
    }
  });

  it('reste une fraction : jamais négative, jamais au-dessus de un', () => {
    for (const climat of [-50, 0, 30, 70, 150]) {
      const v = socialAvailability(climat, params);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('obéit au réglage du facilitateur', () => {
    const doux = buildParams({ 'climate.capacity_impact_weight': 0.05 });
    const dur = buildParams({ 'climate.capacity_impact_weight': 0.6 });
    expect(socialAvailability(20, doux)).toBeGreaterThan(socialAvailability(20, dur));
  });
});

describe('écart de compétence', () => {
  it('vaut zéro au niveau HÉRITÉ : ne rien décider ne coûte ni ne rapporte', () => {
    const herite = param(params, 'endowment.expert_share');
    expect(skillEdge(herite, params)).toBeCloseTo(0, 10);
  });

  it('est positif au-dessus de la dotation, négatif en dessous', () => {
    expect(skillEdge(80, params)).toBeGreaterThan(0);
    expect(skillEdge(5, params)).toBeLessThan(0);
  });
});

describe('barème de climat réellement réglable', () => {
  it('classe les restructurations par brutalité croissante, à l’échelle de la session', () => {
    const c = (n: keyof typeof RESTRUCTURING_CLIMATE_SHARE) =>
      restructuringClimateCost(n, params);
    expect(c('aucune')).toBeLessThan(c('reorganisation'));
    expect(c('reorganisation')).toBeLessThan(c('externalisation'));
    expect(c('externalisation')).toBeLessThan(c('fermeture_site'));
  });

  it('suit le paramètre : adoucir l’échelle adoucit toutes les natures', () => {
    const doux = buildParams({ 'climate.restructuring_malus': 5 });
    expect(restructuringClimateCost('fermeture_site', doux))
      .toBeLessThan(restructuringClimateCost('fermeture_site', params));
  });

  it('plafonne le choc de recrutement au lieu de le laisser filer', () => {
    const base = {
      previousClimat: 70, workloadIndex: 100, layoffRatio: 0,
      trainingIntensity: 0, salaryRatio: 1, automationDelta: 0,
      restructuring: 'aucune' as const,
    };
    // Recruter l'équivalent de l'effectif coûtait 48 points, soit plus qu'une
    // fermeture de site. Le malus est désormais borné par son paramètre.
    const plafond = param(params, 'climate.recruitment_shock_malus');
    const calme = nextClimatSocial({ ...base, hiringRatio: 0 }, params);
    const fou = nextClimatSocial({ ...base, hiringRatio: 1 }, params);
    expect(calme - fou).toBeCloseTo(plafond, 6);
    expect(calme - fou).toBeLessThan(restructuringClimateCost('fermeture_site', params));
  });

  it('ne sanctionne pas un recrutement sous le seuil de choc', () => {
    const base = {
      previousClimat: 70, workloadIndex: 100, layoffRatio: 0,
      trainingIntensity: 0, salaryRatio: 1, automationDelta: 0,
      restructuring: 'aucune' as const,
    };
    const seuil = param(params, 'social.recruitment_shock_threshold_pct');
    expect(nextClimatSocial({ ...base, hiringRatio: seuil }, params))
      .toBeCloseTo(nextClimatSocial({ ...base, hiringRatio: 0 }, params), 6);
  });
});

describe('manque social', () => {
  it('est nul au-dessus du pivot, plein à zéro', () => {
    expect(socialShortfall(60)).toBe(0);
    expect(socialShortfall(100)).toBe(0);
    expect(socialShortfall(0)).toBe(1);
    expect(socialShortfall(30)).toBeCloseTo(0.5, 10);
  });

  it('est la SEULE source des deux conséquences : capacité et coût', () => {
    // Si les deux canaux divergeaient, l'écran ne pourrait plus expliquer le
    // résultat à l'équipe. Ils lisent le même manque.
    const poids = param(params, 'climate.capacity_impact_weight');
    expect(socialAvailability(30, params))
      .toBeCloseTo(1 - poids * socialShortfall(30), 10);
  });
});

describe('orientation de formation et rendement qualité', () => {
  /**
   * Quatre coefficients étaient déclarés et aucun n'était lu : l'orientation
   * « normes et contrôle », vendue comme la montée en gamme, ne touchait pas un
   * point de qualité.
   */
  it('classe les orientations comme le tableau l’annonce', () => {
    const plein = 0.10; // au-delà de l'effort maximal
    const f = (o: Parameters<typeof qualityFocusFactor>[0]) => qualityFocusFactor(o, plein);
    expect(f('qualite')).toBeGreaterThan(f('technique'));
    expect(f('technique')).toBeGreaterThan(f('polyvalence'));
    expect(f('polyvalence')).toBeGreaterThan(f('management'));
  });

  it('ne rend rien sans budget : cocher une orientation ne forme personne', () => {
    expect(qualityFocusFactor('qualite', 0)).toBeCloseTo(1, 10);
    expect(qualityFocusFactor('management', 0)).toBeCloseTo(1, 10);
  });

  it('monte progressivement avec l’effort, puis sature', () => {
    const petit = qualityFocusFactor('qualite', 0.01);
    const moyen = qualityFocusFactor('qualite', 0.04);
    const plein = qualityFocusFactor('qualite', 0.07);
    const enorme = qualityFocusFactor('qualite', 0.5);
    expect(moyen).toBeGreaterThan(petit);
    expect(plein).toBeGreaterThan(moyen);
    expect(enorme).toBeCloseTo(plein, 10);
  });

  it('est neutre quand aucune orientation n’est saisie', () => {
    // Repli sur « technique », comme le reste du module — mais sans budget,
    // le facteur reste exactement neutre.
    expect(qualityFocusFactor(null, 0)).toBeCloseTo(1, 10);
  });
});
