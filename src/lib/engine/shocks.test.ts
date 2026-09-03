import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  EFFECT_KEYS, EFFECT_SPECS, describeLevers, emptyLevers, mergeLevers, sanitiseLevers,
} from './shocks';

describe('vocabulaire des chocs', () => {
  it('déclare chaque levier avec ses bornes et son sens', () => {
    for (const spec of EFFECT_SPECS) {
      expect(spec.label.length).toBeGreaterThan(3);
      expect(spec.positiveMeans.length).toBeGreaterThan(5);
      expect(spec.min).toBeLessThan(spec.max);
      expect(['favorable', 'defavorable']).toContain(spec.positiveIs);
    }
  });

  it('n’a aucune clé en double', () => {
    expect(new Set(EFFECT_KEYS).size).toBe(EFFECT_KEYS.length);
  });

  /**
   * LE test qui compte.
   *
   * `quality_floor` et `rate_delta` étaient déclarés, agrégés, puis jamais lus :
   * huit cartes du catalogue ne faisaient rien, et personne ne s'en apercevait
   * puisque rien ne reliait la déclaration à l'usage. Ce test relie les deux.
   */
  it('APPLIQUE réellement chaque levier déclaré, quelque part dans le moteur', () => {
    const here = fileURLToPath(new URL('.', import.meta.url));
    let sources = ['resolve.ts', 'finance.ts', 'channels.ts', 'market.ts', 'hr.ts']
      .map((f) => readFileSync(here + f, 'utf8'))
      .join('\n');

    // On RETIRE le bloc d'agrégation avant de chercher. Sans cette coupe, le
    // test se satisfait de `sum('rateDelta')` et déclare vivant un levier qui
    // n'est qu'additionné — c'est exactement le faux négatif qui a laissé
    // `quality_floor` et `rate_delta` inertes pendant tout le développement.
    const start = sources.indexOf('function shocksFor');
    if (start >= 0) {
      const end = sources.indexOf('\n}', start);
      sources = sources.slice(0, start) + sources.slice(end);
    }

    const camel = (k: string) => k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const morts = EFFECT_KEYS.filter(
      (key) => !sources.includes(camel(key)) && !sources.includes(key),
    );

    expect(morts).toEqual([]);
  });
});

describe('cumul de plusieurs cartes', () => {
  it('additionne les pourcentages plutôt que de les composer', () => {
    // Deux cartes à +20 % donnent +40 %, pas +44 % : le facilitateur doit
    // pouvoir refaire le calcul de tête au débriefing.
    const merged = mergeLevers([
      { ...emptyLevers(), input_cost_pct: 0.2 },
      { ...emptyLevers(), input_cost_pct: 0.2 },
    ]);
    expect(merged.input_cost_pct).toBeCloseTo(0.4, 6);
  });

  it('retient le seuil de qualité le PLUS EXIGEANT — deux planchers ne s’ajoutent pas', () => {
    const merged = mergeLevers([
      { ...emptyLevers(), quality_floor: 55 },
      { ...emptyLevers(), quality_floor: 70 },
    ]);
    expect(merged.quality_floor).toBe(70);
  });

  it('rend tous les leviers à zéro sans aucune carte', () => {
    const merged = mergeLevers([]);
    for (const key of EFFECT_KEYS) expect(merged[key]).toBe(0);
  });

  it('ignore une valeur non numérique au lieu de propager NaN', () => {
    const merged = mergeLevers([
      { ...emptyLevers(), input_cost_pct: Number.NaN },
      { ...emptyLevers(), input_cost_pct: 0.1 },
    ]);
    expect(merged.input_cost_pct).toBeCloseTo(0.1, 6);
  });
});

describe('carte composée par le facilitateur', () => {
  it('borne une valeur aberrante au lieu de casser le moteur', () => {
    const levers = sanitiseLevers({ input_cost_pct: 99 });
    const spec = EFFECT_SPECS.find((e) => e.key === 'input_cost_pct')!;
    expect(levers.input_cost_pct).toBe(spec.max);
  });

  it('ignore une clé inconnue', () => {
    const levers = sanitiseLevers({ effet_invente: 5 });
    expect(levers).not.toHaveProperty('effet_invente');
  });

  it('ignore une valeur non numérique', () => {
    expect(sanitiseLevers({ input_cost_pct: 'beaucoup' }).input_cost_pct).toBe(0);
  });

  it('n’énumère que les leviers réellement posés', () => {
    const lignes = describeLevers({ ...emptyLevers(), input_cost_pct: 0.18 });
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toContain('+18 %');
    expect(lignes[0]).toContain('renchérissent');
  });

  it('ne dit rien d’une carte vide', () => {
    expect(describeLevers(emptyLevers())).toEqual([]);
  });
});

describe('sens de la phrase', () => {
  it('inverse la formulation pour une valeur NÉGATIVE', () => {
    // Afficher « l'outil produit davantage » à côté d'un −6 % rendait le
    // résumé faux au moment précis où le facilitateur annonce la carte.
    const baisse = describeLevers({ ...emptyLevers(), capacity_pct: -0.06 })[0];
    const hausse = describeLevers({ ...emptyLevers(), capacity_pct: 0.06 })[0];

    expect(baisse).toContain('produit moins');
    expect(hausse).toContain('produit davantage');
  });

  it('donne une formulation aux deux sens de CHAQUE levier', () => {
    for (const spec of EFFECT_SPECS) {
      expect(spec.negativeMeans.length).toBeGreaterThan(5);
      expect(spec.negativeMeans).not.toBe(spec.positiveMeans);
    }
  });
});
