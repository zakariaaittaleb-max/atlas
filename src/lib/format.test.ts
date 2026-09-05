import { describe, expect, it } from 'vitest';

import { formatMadCompact, formatPct, formatScore } from './format';

// Le module sépare par une espace insécable FINE (U+202F), pas par une espace
// ordinaire : c'est la convention typographique française, et l'écrire en clair
// ici évite un test qui échoue sur un caractère invisible.
const NB = '\u202f';

/**
 * Le formatage des montants n'est pas cosmétique : « 578444444.4444445 » sur un
 * vidéoprojecteur ne se lit pas, ne se compare pas, et fait douter du calcul
 * qui l'a produit. Trois paliers — k, M, Md — et deux décimales au plus.
 */

describe('formatMadCompact — palier k et plafond décimal', () => {
  it('exprime les milliers en k plutôt qu’en chiffres bruts', () => {
    // « 578 444 DH » se lit chiffre à chiffre ; « 578,44 k DH » se compare.
    expect(formatMadCompact(578_444)).toBe(`578,44${NB}k${NB}DH`);
  });

  it('ne laisse jamais passer une décimale de flottant', () => {
    // Le cas qui a motivé la règle : 578444444.4444445 affiché tel quel.
    expect(formatMadCompact(578_444_444.4444445)).toBe(`578,44${NB}M${NB}DH`);
  });

  it('tient les trois paliers', () => {
    expect(formatMadCompact(1_234_567_890)).toBe(`1,23${NB}Md${NB}DH`);
    expect(formatMadCompact(1_234_567)).toBe(`1,23${NB}M${NB}DH`);
    expect(formatMadCompact(1_234)).toBe(`1,23${NB}k${NB}DH`);
  });

  it('reste en dirhams sous le millier', () => {
    expect(formatMadCompact(842)).toBe(`842${NB}DH`);
  });

  it('garde le signe négatif explicite', () => {
    expect(formatMadCompact(-4_200_000)).toBe(`−4,20${NB}M${NB}DH`);
  });
});

describe('plafond de deux décimales', () => {
  it('borne formatPct même si l’appelant en demande plus', () => {
    expect(formatPct(0.123456, 5)).toBe(`12,35${NB}%`);
  });

  it('borne formatScore de la même façon', () => {
    expect(formatScore(3.14159, 4)).toBe('3,14');
  });
});
