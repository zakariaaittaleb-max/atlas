/**
 * ATLAS — niveau de difficulté d'une session.
 *
 * ── LE PRINCIPE, ET IL EST NON NÉGOCIABLE ──────────────────────────────────
 * La difficulté ne change PAS les mathématiques du moteur. Aucune formule n'est
 * remplacée, aucun score n'est majoré. Elle ne touche qu'à deux choses :
 *
 *   • la MARGE D'ERREUR tolérée avant qu'une incohérence ne se voie,
 *   • la VITESSE à laquelle l'environnement se dérobe.
 *
 * La raison est pédagogique, pas technique. Si le réglage changeait les règles,
 * le débriefing deviendrait faux : « vous avez échoué parce que le niveau était
 * dur » n'enseigne rien, alors que « vous avez échoué parce que le marché ne
 * croissait plus et que vous investissiez comme s'il croissait » enseigne tout.
 *
 * ── DEUX RÈGLES D'USAGE ────────────────────────────────────────────────────
 * 1. Visible du facilitateur, INVISIBLE des équipes. Une équipe qui connaît le
 *    réglage l'invoquera en excuse, et c'est exactement ce qu'on veut éviter.
 * 2. VERROUILLÉE dès la première résolution. Changer le niveau en cours de
 *    partie casse la comparabilité entre tours, qui est tout l'intérêt d'une
 *    simulation multi-tours.
 *
 * Module PUR.
 */

import {
  DIFFICULTY_PRESETS,
  type DifficultyDials,
  type DifficultyLevel,
} from '@/lib/difficulty-types';

// Réexport : les appelants du moteur n'ont qu'un point d'import à connaître.
export {
  DIFFICULTY_LEVELS, DIFFICULTY_PRESETS, DIAL_EXPLANATIONS,
} from '@/lib/difficulty-types';
export type { DifficultyDials, DifficultyLevel } from '@/lib/difficulty-types';






export function dialsFor(
  level: DifficultyLevel,
  custom: Partial<DifficultyDials> = {},
): DifficultyDials {
  const base =
    level === 'sur_mesure'
      ? DIFFICULTY_PRESETS.standard
      : DIFFICULTY_PRESETS[level];

  return {
    marketGrowth: clampDial(custom.marketGrowth ?? base.marketGrowth, 0, 3),
    alignmentTolerance: clampDial(custom.alignmentTolerance ?? base.alignmentTolerance, 0.4, 2),
    financialSlack: clampDial(custom.financialSlack ?? base.financialSlack, 0.5, 2),
    ecosystemPower: clampDial(custom.ecosystemPower ?? base.ecosystemPower, 0.5, 2),
    competitivenessExponent: clampDial(
      custom.competitivenessExponent ?? base.competitivenessExponent, 1, 4,
    ),
  };
}

function clampDial(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.min(Math.max(v, min), max);
}

/**
 * Surcharges de paramètres induites par un réglage.
 *
 * Le résultat se fond dans `engine_parameters` : la difficulté emprunte le
 * mécanisme de calibrage qui existait déjà, elle n'en crée pas un second. Un
 * paramètre posé explicitement par le facilitateur reste prioritaire — c'est
 * ce qui rend le mode « sur mesure » utile plutôt que redondant.
 */
export function paramOverrides(dials: DifficultyDials): Record<string, number> {
  return {
    'market.growth_multiplier': dials.marketGrowth,
    'alignment.saturation_gap': 0.45 * dials.alignmentTolerance,
    'endowment.treasury_months_of_revenue': 2.5 * dials.financialSlack,
    'finance.risk_margin_per_leverage': 0.02 / dials.financialSlack,
    'ecosystem.power_multiplier': dials.ecosystemPower,
    'market.competitiveness_exponent': dials.competitivenessExponent,
  };
}
