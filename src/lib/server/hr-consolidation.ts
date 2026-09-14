import 'server-only';

/**
 * ATLAS — la masse salariale et la formation du tour, consolidées au Groupe.
 *
 * Deux écrans en donnaient deux chiffres : la barre du haut lisait
 * `hr_metrics` du seul tour courant (salaire par défaut, formation nulle tant
 * que l'équipe n'avait rien rouvert), la finance consolidait les décisions RH
 * EN VIGUEUR de chaque domaine. Même libellé « Engagé ce tour », 140 M DH
 * d'écart. Une seule consolidation désormais, lue par les deux.
 */

import type { HrRollup } from '@/lib/decision-types';

import { latestAtMost, reconductHrDecision } from './reconduction';

type Row = Record<string, unknown>;

const num = (v: unknown, d = 0) => (typeof v === 'number' ? v : Number(v ?? d) || d);
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);

/** Taux de cotisations patronales, repère de saisie (le paramètre de session s'applique à la résolution). */
export const CHARGES_PATRONALES_PCT = 0.2109;

/**
 * Effectif d'un domaine au dernier exercice clos.
 *
 * `lte` et non `lt` : une ligne n'existe pour le tour courant qu'APRÈS sa
 * résolution. Pendant la saisie, `lte` rend donc le tour précédent ; une fois
 * le tour résolu, il rend le tour lui-même — le dernier exercice clos dans les
 * deux cas.
 */
export function dasHeadcount(states: Row[] | null, dasId: string, round: number): number | null {
  const row = latestAtMost((states ?? []).filter((s) => str(s.das_id) === dasId), round);
  return row ? num(row.headcount) : null;
}

export function averageSalary(
  decisions: Row[] | null, states: Row[] | null, round: number,
): number {
  const rows = decisions ?? [];
  if (rows.length === 0) return 5800;

  let weighted = 0;
  let weight = 0;
  for (const r of rows) {
    // Pondéré par l'effectif : la moyenne arithmétique de deux domaines de
    // tailles très différentes ne veut rien dire.
    const w = Math.max(dasHeadcount(states, str(r.das_id), round) ?? 1, 1);
    weighted += num(r.avg_salary_brut_mad, 5800) * w;
    weight += w;
  }
  return weight > 0 ? weighted / weight : 5800;
}

export function rollupHr(
  das: { dasId: string; name: string }[], decisions: Row[] | null, states: Row[] | null,
  round: number, groupHeadcount: number,
): HrRollup {
  const all = decisions ?? [];
  // Ce que l'équipe a SAISI ce tour : c'est lui qui dit quels domaines
  // attendent encore une décision.
  const saisies = all.filter((r) => num(r.round_number) === round);
  // Ce qui est EN VIGUEUR : additionner les seules saisies faisait tomber la
  // formation d'un domaine non rouvert à zéro dans le récapitulatif.
  const rows = das
    .map((d) => reconductHrDecision(all.filter((r) => str(r.das_id) === d.dasId), round))
    .filter((r): r is Row => r !== null);

  // Faute d'état par domaine — première session, ou partie provisionnée avant
  // le module RH — on retombe sur l'effectif du groupe plutôt que sur zéro : un
  // effectif nul ferait cesser la production pour une raison qui n'est pas une
  // décision.
  const perDas = das.map((d) => dasHeadcount(states, d.dasId, round));
  const known = perDas.filter((v): v is number => v !== null);
  const headcountStart = known.length > 0
    ? known.reduce((a, v) => a + v, 0)
    : groupHeadcount;

  let hires = 0;
  let layoffs = 0;
  let trainingBudgetMad = 0;
  for (const r of rows) {
    hires += num(r.hire_operateurs) + num(r.hire_techniciens)
      + num(r.hire_experts) + num(r.hire_cadres) + num(r.internal_transfers_in);
    layoffs += num(r.layoffs);
    trainingBudgetMad += num(r.training_budget_mad);
  }

  const headcountEnd = Math.max(headcountStart + hires - layoffs, 0);
  const avgSalaryBrutMad = averageSalary(rows, states, round);

  return {
    headcountStart,
    hires,
    layoffs,
    headcountEnd,
    avgSalaryBrutMad,
    trainingBudgetMad,
    payrollMad: headcountEnd * avgSalaryBrutMad * 12 * (1 + CHARGES_PATRONALES_PCT),
    pendingDas: das
      .filter((d) => !saisies.some((r) => str(r.das_id) === d.dasId))
      .map((d) => ({ dasId: d.dasId, name: d.name })),
  };
}
