/**
 * ATLAS — les chiffres vitaux d'un domaine d'activité.
 *
 * Un domaine se pilotait sans jamais voir s'il grandissait, ce qu'il pesait
 * dans le Groupe ni ce qu'il rapportait : ces chiffres existaient, mais au
 * Dashboard, à deux écrans de la décision. Quatre repères suivent donc le
 * domaine piloté partout où il se décide — et accompagnent chaque domaine
 * quand on répartit la trésorerie entre eux :
 *
 *   • la CROISSANCE, variation du chiffre d'affaires sur l'exercice précédent ;
 *   • la PART DE MARCHÉ, et son évolution en points ;
 *   • le POIDS dans le Groupe, part du chiffre d'affaires consolidé ;
 *   • la MARGE d'exploitation, EBITDA rapporté au chiffre d'affaires.
 *
 * Tout vient du dernier exercice CLOS : pendant la saisie, le tour courant
 * n'a pas encore de chiffres. Module client-safe.
 */

import { formatPct } from '@/lib/format';

export interface DasVitals {
  /** L'exercice clos d'où viennent les chiffres. */
  roundNumber: number;
  revenueMad: number;
  /** En fraction. `null` sans exercice antérieur, ou sur un chiffre d'affaires nul. */
  growth: number | null;
  /** En fraction. */
  marketShare: number | null;
  /** Évolution de la part de marché, en fraction (0,012 = 1,2 point). */
  marketShareDelta: number | null;
  /** Part du chiffre d'affaires du Groupe, en fraction. */
  weightInGroup: number | null;
  /** EBITDA ÷ chiffre d'affaires, en fraction. */
  margin: number | null;
}

export interface DasMetricRow {
  dasId: string;
  roundNumber: number;
  revenueMad: number | null;
  marketShare: number | null;
  ebitdaMad: number | null;
}

/**
 * Les chiffres vitaux de chaque domaine du portefeuille.
 *
 * `rows` ne doit contenir que des exercices clos. Le poids se calcule sur les
 * seuls domaines du portefeuille (`dasIds`) : un domaine cédé ne compte plus
 * dans le Groupe qu'il a quitté.
 */
export function computeDasVitals(rows: DasMetricRow[], dasIds: string[]): Map<string, DasVitals> {
  const result = new Map<string, DasVitals>();
  const owned = new Set(dasIds);
  const mine = rows.filter((r) => owned.has(r.dasId));

  const groupRevenueAt = (round: number) =>
    mine
      .filter((r) => r.roundNumber === round)
      .reduce((acc, r) => acc + Math.max(r.revenueMad ?? 0, 0), 0);

  for (const dasId of dasIds) {
    const history = mine
      .filter((r) => r.dasId === dasId)
      .sort((a, b) => b.roundNumber - a.roundNumber);
    const [last, previous] = history;
    if (!last) continue;

    const revenue = last.revenueMad ?? 0;
    const previousRevenue = previous?.revenueMad ?? 0;
    const groupRevenue = groupRevenueAt(last.roundNumber);

    result.set(dasId, {
      roundNumber: last.roundNumber,
      revenueMad: revenue,
      growth: previous && previousRevenue > 0 ? revenue / previousRevenue - 1 : null,
      marketShare: last.marketShare,
      marketShareDelta:
        previous && last.marketShare !== null && previous.marketShare !== null
          ? last.marketShare - previous.marketShare
          : null,
      weightInGroup: groupRevenue > 0 ? Math.max(revenue, 0) / groupRevenue : null,
      margin: revenue > 0 && last.ebitdaMad !== null ? last.ebitdaMad / revenue : null,
    });
  }

  return result;
}

/** « +6,0 % », « −0,7 % », « 0,0 % » — le signe toujours écrit, jamais porté par la seule couleur. */
export function formatSignedPct(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const sign = value > 0.00005 ? '+' : value < -0.00005 ? '−' : '';
  return `${sign}${formatPct(Math.abs(value), decimals)}`;
}

/** Ton d'un chiffre dont la hausse est une bonne nouvelle. */
export function toneOf(value: number | null | undefined): 'positive' | 'negative' | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  if (value > 0.00005) return 'positive';
  if (value < -0.00005) return 'negative';
  return null;
}
