import { describe, expect, it } from 'vitest';

import {
  STUDY_BASE_PRICES, STUDY_FIELDS, STUDY_TIERS, TIER_PROFILES, buildStudyDeliverable, discloseField, normalizedError, perturb, quantize, studyPrice, type DisclosureContext, type NumericFieldSpec, type StudyTier,
} from './consulting';
import { buildParams } from './params';

const params = buildParams();

const ctx: DisclosureContext = {
  sessionId: 'sess-1',
  teamId: 'team-a',
  studyKey: 'pestel_sectoriel',
  roundNumber: 2,
  subjectId: 'das-agro',
};

const marketSize: NumericFieldSpec = {
  key: 'market_size_mad',
  label: 'Taille du marché',
  errorMode: 'relative',
};

const growth: NumericFieldSpec = {
  key: 'growth_rate',
  label: 'Croissance',
  errorMode: 'absolute',
  range: 0.25,
};

const financialHealth: NumericFieldSpec = {
  key: 'financial_health',
  label: 'Santé financière',
  errorMode: 'absolute',
  range: 100,
  weakSignal: true,
};

const reliability: NumericFieldSpec = {
  key: 'reliability',
  label: 'Fiabilité',
  errorMode: 'absolute',
  range: 100,
  bandable: true,
  bandMin: 0,
  bandMax: 100,
};

function estimateValue(tier: StudyTier, spec: NumericFieldSpec, trueValue: number, context = ctx) {
  const d = discloseField(trueValue, spec, tier, context, params);
  if (d.mode !== 'estimate') throw new Error(`attendu une estimation, reçu « ${d.mode} »`);
  return d;
}

// ===========================================================================

describe('tarification par palier', () => {
  it('rend la note express nettement moins chère que l’étude approfondie', () => {
    const base = STUDY_BASE_PRICES.benchmark_fourn;
    expect(studyPrice(base, 'express', params)).toBe(42_000);
    expect(studyPrice(base, 'standard', params)).toBe(120_000);
    expect(studyPrice(base, 'approfondie', params)).toBe(264_000);
  });

  it('ordonne strictement les paliers', () => {
    const base = STUDY_BASE_PRICES.concurrentielle;
    const prices = STUDY_TIERS.map((t) => studyPrice(base, t, params));
    expect(prices[0]).toBeLessThan(prices[1]);
    expect(prices[1]).toBeLessThan(prices[2]);
  });
});

describe('déterminisme du bruit', () => {
  it('redonne exactement la même valeur au rachat', () => {
    // Propriété critique : sans elle, une équipe achèterait cinq notes express
    // et moyennerait l'erreur, ce qui viderait la mécanique de son sens.
    const a = estimateValue('express', marketSize, 190_000_000_000);
    const b = estimateValue('express', marketSize, 190_000_000_000);
    expect(a.value).toBe(b.value);
  });

  it('donne des tirages différents à deux équipes', () => {
    const equipeA = estimateValue('express', marketSize, 190_000_000_000);
    const equipeB = estimateValue('express', marketSize, 190_000_000_000, {
      ...ctx,
      teamId: 'team-b',
    });
    expect(equipeA.value).not.toBe(equipeB.value);
  });

  it('donne des tirages différents par tour et par sujet', () => {
    const tour2 = estimateValue('express', marketSize, 1_000);
    const tour3 = estimateValue('express', marketSize, 1_000, { ...ctx, roundNumber: 3 });
    const autreDas = estimateValue('express', marketSize, 1_000, { ...ctx, subjectId: 'das-btp' });
    expect(tour2.value).not.toBe(tour3.value);
    expect(tour2.value).not.toBe(autreDas.value);
  });

  it('produit un écart normalisé dans [−1, 1]', () => {
    for (let i = 0; i < 200; i += 1) {
      const e = normalizedError({ ...ctx, subjectId: `s${i}`, fieldKey: 'f' });
      expect(e).toBeGreaterThanOrEqual(-1);
      expect(e).toBeLessThanOrEqual(1);
    }
  });
});

describe('cohérence entre paliers', () => {
  it('fait de l’étude chère un zoom sur l’étude bon marché, jamais une contradiction', () => {
    const vrai = 100_000_000;
    const express = estimateValue('express', marketSize, vrai);
    const approfondie = estimateValue('approfondie', marketSize, vrai);

    // Même direction d'erreur…
    expect(Math.sign(express.value - vrai)).toBe(Math.sign(approfondie.value - vrai));
    // …mais amplitude bien plus faible.
    expect(Math.abs(approfondie.value - vrai)).toBeLessThan(Math.abs(express.value - vrai));
  });
});

describe('erreur bornée et annoncée', () => {
  it('respecte la marge annoncée en mode relatif', () => {
    const vrai = 190_000_000_000;
    for (const tier of STUDY_TIERS) {
      for (let i = 0; i < 50; i += 1) {
        const d = estimateValue(tier, marketSize, vrai, { ...ctx, subjectId: `das-${i}` });
        const ecartRelatif = Math.abs(d.value - vrai) / vrai;
        expect(ecartRelatif).toBeLessThanOrEqual(TIER_PROFILES[tier].errorMargin + 1e-9);
      }
    }
  });

  it('respecte la marge annoncée en mode absolu', () => {
    // Un taux de croissance de 0,5 % ne peut pas porter d'erreur relative
    // significative : l'erreur se mesure sur l'amplitude du champ.
    const vrai = 0.03;
    for (let i = 0; i < 50; i += 1) {
      const d = estimateValue('express', growth, vrai, { ...ctx, subjectId: `das-${i}` });
      expect(Math.abs(d.value - vrai)).toBeLessThanOrEqual(0.25 * 0.25 + 1e-9);
    }
  });

  it('annonce un intervalle qui contient toujours la valeur vraie', () => {
    const vrai = 190_000_000_000;
    for (let i = 0; i < 50; i += 1) {
      const d = estimateValue('standard', marketSize, vrai, { ...ctx, subjectId: `das-${i}` });
      expect(vrai).toBeGreaterThanOrEqual(d.lower - 1e-6);
      expect(vrai).toBeLessThanOrEqual(d.upper + 1e-6);
    }
  });

  it('resserre l’intervalle à mesure qu’on paie', () => {
    const vrai = 190_000_000_000;
    const largeurs = STUDY_TIERS.map((tier) => {
      const d = estimateValue(tier, marketSize, vrai);
      return d.upper - d.lower;
    });
    expect(largeurs[0]).toBeGreaterThan(largeurs[1]);
    expect(largeurs[1]).toBeGreaterThan(largeurs[2]);
  });
});

describe('signaux faibles', () => {
  it('retient la santé financière hors du palier approfondi', () => {
    // C'est le cœur de l'arbitrage : la note express ne PEUT PAS prévenir
    // qu'un fournisseur s'effondre. L'équipe subira la rupture sans l'avoir vue.
    expect(discloseField(28, financialHealth, 'express', ctx, params).mode).toBe('withheld');
    expect(discloseField(28, financialHealth, 'standard', ctx, params).mode).toBe('withheld');
    expect(discloseField(28, financialHealth, 'approfondie', ctx, params).mode).not.toBe('withheld');
  });

  it('livre le signal faible sans bruit au palier approfondi', () => {
    const d = discloseField(28, financialHealth, 'approfondie', ctx, params);
    if (d.mode !== 'estimate') throw new Error('attendu une estimation');
    expect(Math.abs(d.value - 28)).toBeLessThanOrEqual(0.03 * 100);
  });
});

describe('bandes qualitatives', () => {
  it('livre une appréciation au lieu d’un chiffre aux paliers bon marché', () => {
    const express = discloseField(82, reliability, 'express', ctx, params);
    expect(express.mode).toBe('band');
    if (express.mode === 'band') {
      expect(express.band).toBe('élevé');
      expect(express.lower).toBeCloseTo(66.67, 1);
    }
  });

  it('affine la granularité au palier standard', () => {
    const express = discloseField(82, reliability, 'express', ctx, params);
    const standard = discloseField(82, reliability, 'standard', ctx, params);
    if (express.mode !== 'band' || standard.mode !== 'band') throw new Error('attendu des bandes');

    // Sur la même vérité (82), la note express dit « élevé » sur 66,7–100 ;
    // l'étude standard resserre à « très élevé » sur 80–100.
    expect(express.band).toBe('élevé');
    expect(standard.band).toBe('très élevé');
    expect(standard.upper - standard.lower).toBeLessThan(express.upper - express.lower);
    expect(standard.lower).toBeGreaterThan(express.lower);
  });

  it('livre le chiffre au palier approfondi', () => {
    const d = discloseField(82, reliability, 'approfondie', ctx, params);
    expect(d.mode).toBe('estimate');
  });

  it('borne l’index de bande aux extrémités', () => {
    expect(quantize(0, 0, 100, 3).bandIndex).toBe(0);
    expect(quantize(100, 0, 100, 3).bandIndex).toBe(2);
    expect(quantize(-50, 0, 100, 3).bandIndex).toBe(0);
    expect(quantize(150, 0, 100, 3).bandIndex).toBe(2);
  });
});

describe('perturbation', () => {
  it('ne modifie rien à marge nulle', () => {
    expect(perturb(100, marketSize, 0, 0.9)).toBe(100);
  });

  it('applique l’erreur proportionnellement en mode relatif', () => {
    expect(perturb(100, marketSize, 0.25, 1)).toBeCloseTo(125, 6);
    expect(perturb(100, marketSize, 0.25, -1)).toBeCloseTo(75, 6);
  });

  it('applique l’erreur sur l’amplitude en mode absolu', () => {
    expect(perturb(0.03, growth, 0.25, 1)).toBeCloseTo(0.03 + 0.0625, 6);
  });
});

describe('livrable complet', () => {
  it('n’inclut que les champs dont la valeur vraie est fournie', () => {
    const deliverable = buildStudyDeliverable(
      'benchmark_fourn',
      'approfondie',
      { price_index: 0.92, reliability: 78, financial_health: 31 },
      { ...ctx, studyKey: 'benchmark_fourn', subjectId: 'fournisseur-7' },
      params,
    );
    expect(deliverable.map((d) => d.key).sort()).toEqual([
      'financial_health',
      'price_index',
      'reliability',
    ]);
  });

  it('retient les signaux faibles dans un livrable express', () => {
    const deliverable = buildStudyDeliverable(
      'benchmark_fourn',
      'express',
      { price_index: 0.92, reliability: 78, financial_health: 31 },
      { ...ctx, studyKey: 'benchmark_fourn', subjectId: 'fournisseur-7' },
      params,
    );
    const sante = deliverable.find((d) => d.key === 'financial_health');
    expect(sante?.mode).toBe('withheld');
  });

  it('rejette une étude inconnue plutôt que de livrer un fichier vide', () => {
    expect(() => buildStudyDeliverable('inexistante', 'standard', {}, ctx, params)).toThrow(
      /Étude inconnue/,
    );
  });
});

// ===========================================================================
// Les analyses stratégiques sont-elles CONSTRUCTIBLES ?
// ===========================================================================

/**
 * Un catalogue d'études peut porter les bons noms et ne pas livrer la matière.
 * C'était le cas : l'étude « PESTEL » ne livrait aucune des six dimensions, et
 * deux des cinq forces de Porter n'avaient aucune donnée achetable — la menace
 * des entrants reposait sur une valeur que le moteur utilisait sans jamais la
 * divulguer, celle des substituts n'existait pas du tout.
 *
 * Ce test relie chaque outil d'analyse aux champs qui le rendent possible.
 * Retirer un champ casse l'outil, et le test le dit.
 */
const champs = (study: string) => STUDY_FIELDS[study].map((f) => f.key);
const toutesLesEtudes = Object.keys(STUDY_FIELDS).flatMap(champs);

describe('couverture des outils d’analyse stratégique', () => {
  it('PESTEL — les six dimensions sont livrées', () => {
    const dims = ['politique', 'economique', 'socioculturel',
                  'technologique', 'ecologique', 'legal'];
    for (const d of dims) {
      expect(champs('pestel_sectoriel'), d).toContain(`exposure_${d}`);
    }
  });

  it('PORTER — les cinq forces ont chacune leur donnée', () => {
    // 1. Pouvoir de négociation des fournisseurs
    expect(champs('benchmark_fourn')).toContain('switching_cost');
    expect(champs('benchmark_fourn')).toContain('capacity_units');
    // 2. Pouvoir de négociation des distributeurs
    expect(champs('benchmark_distri')).toContain('negotiating_strength');
    expect(champs('benchmark_distri')).toContain('required_margin_pct');
    // 3. Rivalité entre concurrents
    expect(champs('concurrentielle')).toContain('pool_concentration');
    expect(champs('concurrentielle')).toContain('competitor_market_share');
    // 4. Menace des entrants — la donnée existait, elle n'était pas vendue
    expect(champs('concurrentielle')).toContain('entry_barrier');
    // 5. Menace des substituts — elle n'existait pas du tout
    expect(champs('concurrentielle')).toContain('substitution_pressure');
  });

  it('BCG — les deux axes sont achetables', () => {
    // Abscisse : part relative au leader. Une part absolue ne dit rien.
    expect(champs('concurrentielle')).toContain('relative_market_share');
    // Ordonnée : croissance du marché.
    expect(champs('pestel_sectoriel')).toContain('growth_rate');
  });

  it('BCG — les deux axes sont dans DEUX études distinctes', () => {
    // C'est délibéré : construire un BCG demande deux missions, et le coût de
    // l'information est une leçon du jeu, pas une lacune du catalogue.
    expect(champs('pestel_sectoriel')).not.toContain('relative_market_share');
    expect(champs('concurrentielle')).not.toContain('growth_rate');
  });

  it('SWOT — l’interne et l’externe sont couverts', () => {
    // Forces et faiblesses : l'audit d'alignement décompose axe par axe.
    expect(champs('audit_alignement')).toContain('sab_global');
    expect(champs('audit_alignement')).toContain('sac_score');
    // Opportunités et menaces : exposition PESTEL et pression concurrentielle.
    expect(champs('pestel_sectoriel')).toContain('next_round_shock_risk');
    expect(champs('concurrentielle')).toContain('substitution_pressure');
  });

  it('aucun champ n’est déclaré deux fois dans la même étude', () => {
    for (const [study, fields] of Object.entries(STUDY_FIELDS)) {
      const keys = fields.map((f) => f.key);
      expect(new Set(keys).size, study).toBe(keys.length);
    }
  });

  it('chaque champ porte un libellé lisible en salle', () => {
    for (const [study, fields] of Object.entries(STUDY_FIELDS)) {
      for (const f of fields) {
        expect(f.label.length, `${study}.${f.key}`).toBeGreaterThan(3);
        expect(f.label, `${study}.${f.key}`).not.toMatch(/_/);
      }
    }
  });

  it('les signaux faibles restent rares — sinon ils ne signalent plus rien', () => {
    const faibles = Object.values(STUDY_FIELDS).flat().filter((f) => f.weakSignal);
    expect(faibles.length).toBeGreaterThan(0);
    expect(faibles.length / toutesLesEtudes.length).toBeLessThan(0.2);
  });
});
