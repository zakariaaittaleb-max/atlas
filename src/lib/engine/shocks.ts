/**
 * ATLAS — vocabulaire des chocs PESTEL.
 *
 * ── POURQUOI CE MODULE EXISTE ──────────────────────────────────────────────
 * Deux leviers étaient déclarés, agrégés, puis JAMAIS LUS : `quality_floor` et
 * `rate_delta`. Huit cartes du catalogue — resserrement monétaire, norme
 * qualité obligatoire, rupture technologique, détente monétaire… — ne faisaient
 * donc strictement rien. Le facilitateur les jouait, annonçait leur effet en
 * salle, et le moteur ignorait la carte.
 *
 * La cause est structurelle : la liste des effets vivait dans trois endroits
 * (le type, l'agrégation, l'application) sans que rien ne garantisse leur
 * accord. Ce module la ramène à UN seul endroit, et le test
 * `shocks.test.ts` vérifie que tout levier déclaré est effectivement appliqué.
 *
 * ── IL SERT AUSSI D'ÉDITEUR ────────────────────────────────────────────────
 * Les métadonnées (libellé, unité, sens) sont ce que l'écran du facilitateur
 * affiche pour composer une carte sur mesure. Elles vivent dans
 * `lib/shock-types.ts`, hors du moteur, pour rester importables côté client.
 * Ajouter un levier là-bas le rend disponible à la création de cartes sans
 * toucher à l'interface.
 */

import { EFFECT_KEYS, EFFECT_SPECS } from '@/lib/shock-types';

// Réexport : les appelants du moteur n'ont qu'un point d'import à connaître.
export { EFFECT_KEYS, EFFECT_SPECS } from '@/lib/shock-types';
export type { EffectDirection, EffectSpec } from '@/lib/shock-types';





/** Effets cumulés d'un tour sur un DAS, tous leviers à zéro par défaut. */
export type ShockLevers = Record<string, number>;

export function emptyLevers(): ShockLevers {
  return Object.fromEntries(EFFECT_KEYS.map((k) => [k, 0]));
}

/**
 * Cumul de plusieurs cartes actives sur un même DAS.
 *
 * Les pourcentages s'ADDITIONNENT plutôt que de se composer : deux cartes à
 * +20 % de coût donnent +40 %, pas +44 %. C'est un choix de lisibilité — au
 * débriefing, le facilitateur doit pouvoir refaire le calcul de tête.
 *
 * Le seuil de qualité fait exception : c'est un plancher, et deux planchers ne
 * s'additionnent pas. On retient le plus exigeant.
 */
export function mergeLevers(all: ShockLevers[]): ShockLevers {
  const merged = emptyLevers();

  for (const one of all) {
    for (const key of EFFECT_KEYS) {
      const v = Number(one[key] ?? 0);
      if (!Number.isFinite(v)) continue;
      merged[key] = key === 'quality_floor' ? Math.max(merged[key], v) : merged[key] + v;
    }
  }
  return merged;
}

/** Valide et borne une carte composée par le facilitateur. */
export function sanitiseLevers(raw: Record<string, unknown>): ShockLevers {
  const levers = emptyLevers();

  for (const spec of EFFECT_SPECS) {
    const v = Number(raw[spec.key]);
    if (!Number.isFinite(v) || v === 0) continue;
    levers[spec.key] = Math.min(Math.max(v, spec.min), spec.max);
  }
  return levers;
}

/**
 * Résumé lisible d'une carte, pour la vue facilitateur et le débriefing.
 *
 * N'énumère que les leviers non nuls : une carte qui touche deux variables ne
 * doit pas se présenter comme une liste de quinze zéros.
 */
export function describeLevers(levers: ShockLevers): string[] {
  return EFFECT_SPECS.flatMap((spec) => {
    const v = levers[spec.key] ?? 0;
    if (v === 0) return [];

    const shown =
      spec.unit === 'pct' ? `${v > 0 ? '+' : ''}${(v * 100).toFixed(0)} %`
      : spec.unit === 'taux' ? `${v > 0 ? '+' : ''}${(v * 100).toFixed(2)} pt`
      : spec.unit === 'jours' ? `${v > 0 ? '+' : ''}${v.toFixed(0)} j`
      : `${v.toFixed(0)}`;

    // Le sens de la phrase suit le SIGNE. Afficher « l'outil produit
    // davantage » à côté d'un −6 % rendait le résumé faux au moment précis où
    // le facilitateur s'en sert pour annoncer la carte en salle.
    return [`${spec.label} ${shown} — ${v > 0 ? spec.positiveMeans : spec.negativeMeans}`];
  });
}

/**
 * Ce que la réponse d'une équipe fait à une carte, pour elle seule.
 *
 * ── CE QUE CETTE FONCTION A REMPLACÉ ───────────────────────────────────────
 * Répondre à une crise ne faisait d'abord RIEN : l'écran proposait quatre
 * postures, la route calculait leur coût et leur efficacité, les écrivait dans
 * `shock_responses`… et personne ne relisait la table. La correction d'alors a
 * introduit une atténuation tabulée — « absorber » retirait 75 % de la part
 * défavorable, quel que soit ce que l'équipe avait réellement prévu de faire.
 *
 * Une crise ne se joue plus au clic : l'équipe rédige son plan, et le
 * facilitateur, qui a le texte sous les yeux, arbitre ce qu'il vaut. Le facteur
 * qui arrive ici est SON jugement, entre 0 (l'événement a été évité) et 3 (il a
 * frappé trois fois plus fort), 1 laissant la carte s'appliquer telle quelle.
 *
 * ── POURQUOI TOUS LES LEVIERS, ET PLUS SEULEMENT LES DÉFAVORABLES ──────────
 * L'atténuation ne touchait que la part adverse, pour qu'« absorber » une carte
 * mixte n'efface pas sa bonne nouvelle. Cette prudence n'a plus lieu d'être :
 * un facteur nul sur une OPPORTUNITÉ doit vouloir dire « cette équipe est
 * passée à côté », et un facteur de 3 « elle l'a exploitée trois fois mieux ».
 * Réserver l'échelle aux seuls effets adverses aurait rendu le curseur inerte
 * sur la moitié du catalogue. Le facteur porte donc sur toute la carte, ce qui
 * se dit en une phrase : l'événement a compté plus, ou moins, pour elle.
 */
export function scaleShock<T extends object>(effects: T, factor: number): T {
  const scale = Math.min(Math.max(factor, 0), 3);
  if (scale === 1) return effects;

  const out = { ...effects } as Record<string, unknown>;

  for (const spec of EFFECT_SPECS) {
    // Le catalogue est en `snake_case`, l'instantané du moteur en `camelCase`.
    const key = spec.key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    const value = out[key];
    if (typeof value !== 'number' || value === 0) continue;

    // `|| 0` ramène le −0 de `x * 0` à 0 : il ressortirait tel quel en JSON,
    // et « −0 % de coût des intrants » n'est pas une phrase.
    out[key] = value * scale || 0;
  }

  return out as T;
}

/**
 * Le facteur d'échelle correspondant à l'arbitrage du facilitateur.
 *
 * Le curseur parle en POURCENTAGE D'ÉCART — −100 % à +200 % — parce que c'est
 * ainsi que se pense un jugement : « ils l'ont évité », « ils l'ont pris de
 * plein fouet ». Le moteur, lui, multiplie. La conversion vit ici, en un seul
 * endroit, pour que l'écran et le calcul ne puissent pas en donner deux
 * lectures.
 */
export function impactFactor(impactPct: number): number {
  const pct = Math.min(Math.max(Number.isFinite(impactPct) ? impactPct : 0, -100), 200);
  return 1 + pct / 100;
}
