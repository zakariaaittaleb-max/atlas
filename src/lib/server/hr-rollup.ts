import 'server-only';

/**
 * Consolidation RH du groupe, dérivée des décisions par domaine.
 *
 * ── POURQUOI CETTE FONCTION EXISTE ─────────────────────────────────────────
 * Le recrutement se décide DANS un domaine — avec sa pyramide, son climat
 * social et sa charge de travail sous les yeux. Le Groupe n'en saisit rien.
 *
 * Mais le moteur, lui, lit encore `hr_metrics` au niveau de l'équipe : c'est de
 * là que viennent la masse salariale, le talent_mix et l'intensité de
 * compétences. Sans quelqu'un pour l'écrire, une équipe qui recrute quatre
 * cents personnes réparties sur trois domaines verrait le moteur calculer sur
 * ZÉRO recrutement — silencieusement, et seulement à partir du tour 1, ce qui
 * est exactement le genre de défaut qu'une session entière ne révèle pas.
 *
 * `hr_metrics` devient donc une VUE MATÉRIALISÉE À LA MAIN : personne ne la
 * saisit, elle est recalculée à chaque écriture RH par domaine. Une seule
 * source de vérité — `das_hr_decisions` — et une projection tenue à jour.
 *
 * ── POURQUOI PAS UN TRIGGER POSTGRES ───────────────────────────────────────
 * Ce serait plus robuste, et c'est le bon geste le jour où d'autres chemins
 * écriront `das_hr_decisions`. Aujourd'hui il n'y en a qu'un — le Route Handler
 * d'organisation — et un trigger cacherait dans la base une règle que le code
 * applicatif doit pouvoir expliquer au débriefing.
 */

import type { createAdminClient } from '@/lib/supabase/server';

type AdminClient = ReturnType<typeof createAdminClient>;
type Row = Record<string, unknown>;

const num = (v: unknown, d = 0) => (typeof v === 'number' ? v : Number(v ?? d) || d);
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);

/**
 * Recalcule `hr_metrics` pour une équipe et un tour, à partir de ses décisions
 * RH par domaine.
 *
 * Appelée APRÈS chaque écriture dans `das_hr_decisions`. Idempotente : la
 * rejouer sur un état inchangé réécrit les mêmes valeurs.
 */
export async function refreshHrRollup(
  admin: AdminClient,
  teamId: string,
  roundNumber: number,
): Promise<void> {
  const [{ data: decisions }, { data: states }, { data: teamState }] = await Promise.all([
    admin.from('das_hr_decisions').select('*')
      .eq('team_id', teamId).eq('round_number', roundNumber),
    // L'effectif de DÉPART de chaque domaine : le dernier exercice clos.
    // `lt` et non `lte` — la ligne du tour courant n'existe qu'après sa
    // résolution, et la lire reviendrait à partir de l'arrivée.
    admin.from('das_hr_state').select('das_id, round_number, headcount')
      .eq('team_id', teamId).lt('round_number', roundNumber),
    // Repli : une session provisionnée avant le module RH par domaine n'a pas
    // de `das_hr_state`. L'effectif du groupe vaut mieux qu'un zéro, qui ferait
    // cesser la production pour une raison qui n'est pas une décision.
    admin.from('team_round_state').select('headcount')
      .eq('team_id', teamId).eq('round_number', roundNumber - 1).maybeSingle(),
  ]);

  const rollup = computeHrRollup(
    (decisions ?? []) as Row[],
    (states ?? []) as Row[],
    num(teamState?.headcount),
  );

  const { error } = await admin.from('hr_metrics').upsert(
    { team_id: teamId, round_number: roundNumber, ...rollup },
    { onConflict: 'team_id,round_number' },
  );

  if (error) throw new Error(`Consolidation RH impossible : ${error.message}`);
}

/**
 * Le calcul lui-même, séparé de tout accès base pour être testable.
 *
 * `states` doit être filtré aux tours ANTÉRIEURS au tour saisi : l'appelant s'en
 * charge, parce que c'est lui qui connaît le tour courant.
 */
export function computeHrRollup(
  decisions: Row[],
  states: Row[],
  fallbackHeadcount: number,
) {
  // Effectif en place, domaine par domaine : la ligne la plus récente de chacun.
  const latestByDas = new Map<string, Row>();
  for (const row of states) {
    const dasId = str(row.das_id);
    const kept = latestByDas.get(dasId);
    if (!kept || num(row.round_number) > num(kept.round_number)) {
      latestByDas.set(dasId, row);
    }
  }
  const headcountByDas = new Map(
    [...latestByDas].map(([dasId, row]) => [dasId, num(row.headcount)]),
  );

  // Faute d'état par domaine — session provisionnée avant le module RH par
  // domaine — on retombe sur l'effectif du groupe. Un zéro ferait cesser la
  // production pour une raison qui n'est pas une décision.
  const headcountStart = headcountByDas.size > 0
    ? [...headcountByDas.values()].reduce((a, v) => a + v, 0)
    : fallbackHeadcount;

  let hireOperateurs = 0;
  let hireTechniciens = 0;
  let hireExperts = 0;
  let hireCadres = 0;
  let layoffs = 0;
  let trainingBudgetMad = 0;
  let salaryWeighted = 0;
  let salaryWeight = 0;

  for (const r of decisions) {
    hireOperateurs += num(r.hire_operateurs);
    hireTechniciens += num(r.hire_techniciens);
    hireExperts += num(r.hire_experts);
    hireCadres += num(r.hire_cadres);
    layoffs += num(r.layoffs);
    trainingBudgetMad += num(r.training_budget_mad);

    // Salaire moyen PONDÉRÉ par l'effectif du domaine : la moyenne arithmétique
    // de deux domaines de tailles très différentes ne veut rien dire, et c'est
    // elle qui multiplie la masse salariale du groupe entier.
    const weight = Math.max(headcountByDas.get(str(r.das_id)) ?? 1, 1);
    salaryWeighted += num(r.avg_salary_brut_mad, 5800) * weight;
    salaryWeight += weight;
  }

  // Les transferts internes ne sont volontairement PAS comptés comme des
  // recrutements du groupe : ils déplacent quelqu'un d'un domaine à l'autre.
  // Les additionner gonflerait l'effectif consolidé de gens déjà présents.
  return {
    headcount_start: Math.round(headcountStart),
    hire_operateurs: hireOperateurs,
    hire_techniciens: hireTechniciens,
    hire_experts: hireExperts,
    hire_cadres: hireCadres,
    avg_salary_brut_mad: salaryWeight > 0 ? salaryWeighted / salaryWeight : 5800,
    training_budget_mad: trainingBudgetMad,
    restructuring_count: layoffs,
  };
}
