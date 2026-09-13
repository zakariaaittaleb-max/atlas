/**
 * Traduire un EFFECTIF VISÉ en recrutements et en départs.
 *
 * ── LE DÉFAUT CORRIGÉ ──────────────────────────────────────────────────────
 * L'écran RH dérive l'effectif visé des décisions : en place, plus les
 * recrutements, moins les départs. Le compteur « + » se contentait pourtant de
 * remettre les départs à zéro, sans créer le moindre recrutement : l'effectif
 * visé, recalculé, revenait aussitôt à l'effectif en place. Et le cadre « Qui
 * vous recrutez » ne s'ouvrait qu'une fois un recrutement saisi — c'est-à-dire
 * jamais. On pouvait licencier, on ne pouvait pas embaucher.
 *
 * ── LA RÈGLE ───────────────────────────────────────────────────────────────
 * On monte : l'écart manquant rejoint le premier profil que la session ouvre,
 * opérateurs d'abord — la base de toute pyramide. L'équipe répartit ensuite
 * entre profils, juste en dessous. On redescend sans passer sous l'effectif en
 * place : on retire d'abord ce qui a été ajouté par défaut, les opérateurs,
 * puis en remontant la pyramide, les transferts internes en dernier — ce sont
 * des décisions nominatives. On passe sous l'effectif en place : l'écart
 * devient des départs, et aucun recrutement ne coexiste avec eux.
 *
 * Module pur, sans React : c'est ce qui le rend testable.
 */

import type { DasHr } from './org-types';

export const HIRE_KEYS = [
  'hireOperateurs', 'hireTechniciens', 'hireExperts', 'hireCadres', 'internalTransfersIn',
] as const;
export type HireKey = (typeof HIRE_KEYS)[number];

export function hiresOf(hr: Pick<DasHr, HireKey>): number {
  return HIRE_KEYS.reduce((acc, k) => acc + hr[k], 0);
}

/**
 * Les champs à modifier pour atteindre `target`.
 *
 * `openHireKey` est le profil qui reçoit un recrutement ajouté depuis le
 * compteur ; `null` quand la session n'ouvre aucun recrutement — l'effectif ne
 * peut alors pas dépasser ce qui est en place.
 */
export function retargetHeadcount(
  hr: Pick<DasHr, HireKey | 'layoffs'>,
  current: number,
  target: number,
  openHireKey: HireKey | null,
): Partial<Pick<DasHr, HireKey | 'layoffs'>> {
  const wanted = Math.max(Math.round(target), 0);
  const delta = wanted - current;

  if (delta < 0) {
    return {
      layoffs: -delta,
      hireOperateurs: 0, hireTechniciens: 0, hireExperts: 0, hireCadres: 0,
      internalTransfersIn: 0,
    };
  }

  const hires = hiresOf(hr);
  if (delta > hires) {
    if (openHireKey === null) {
      // Recrutement fermé : on s'arrête à ce qui est déjà saisi.
      return { layoffs: 0 };
    }
    return { layoffs: 0, [openHireKey]: hr[openHireKey] + (delta - hires) };
  }

  // 0 ≤ delta ≤ recrutements : on retire l'excédent, opérateurs d'abord.
  let excess = hires - delta;
  const next: Partial<Pick<DasHr, HireKey | 'layoffs'>> = { layoffs: 0 };
  for (const key of HIRE_KEYS) {
    if (excess <= 0) break;
    const cut = Math.min(hr[key], excess);
    if (cut > 0) {
      next[key] = hr[key] - cut;
      excess -= cut;
    }
  }
  return next;
}
