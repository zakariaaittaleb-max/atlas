import 'server-only';

/**
 * ATLAS — l'argent, en permanence sous les yeux.
 *
 * ── POURQUOI EN BARRE, ET NON DANS UN ÉCRAN ────────────────────────────────
 * Une équipe engageait des dépenses sur quatre écrans différents — stratégie,
 * achats, organisation, finance — sans jamais voir la somme. Elle découvrait le
 * dépassement à la résolution, c'est-à-dire trop tard pour en tirer une leçon
 * autre que « on n'avait pas compté ».
 *
 * Trois nombres suffisent, et ils doivent suivre l'utilisateur partout :
 * ce dont on dispose, ce qu'on a déjà engagé, ce qu'on doit encore.
 */

import { getRoundState, getTeamContext } from '@/lib/dal';
import type { MoneyBar } from '@/lib/results-types';
import { createServerClient } from '@/lib/supabase/server';

const num = (v: unknown, d = 0) => (typeof v === 'number' ? v : Number(v ?? d) || d);

/**
 * Taux de cotisations patronales.
 *
 * Dupliqué ici depuis `engine_parameters` faute d'accès au calibrage de session
 * dans ce chemin de lecture. La valeur est volontairement conservatrice : la
 * barre est un REPÈRE d'arbitrage, la vérité comptable est établie à la
 * résolution, où le paramètre de session s'applique.
 */
const CHARGES_PATRONALES = 0.2109;

export type { MoneyBar };


export async function loadMoneyBar(): Promise<MoneyBar | null> {
  const team = await getTeamContext();
  if (!team) return null;

  const round = await getRoundState(team.sessionId);
  const roundNumber = (round?.current_round as number) ?? 0;

  const supabase = await createServerClient();

  const [{ data: pnl }, { data: budget }, { data: decisions }, { data: hr }, { data: state }] =
    await Promise.all([
      supabase.from('pnl_statements').select('treasury_end_mad')
        .eq('team_id', team.teamId).eq('round_number', roundNumber - 1).maybeSingle(),
      // Tous les budgets connus : l'état (dette, siège reconduit) se lit sur le
      // DERNIER, les gestes du tour (tirage, remboursement, dividende) sur
      // celui du tour COURANT seulement. Les confondre comptait le tirage d'un
      // tour précédent comme un encaissement du tour en cours.
      supabase.from('financial_budgets').select('*')
        .eq('team_id', team.teamId).lte('round_number', roundNumber)
        .order('round_number'),
      supabase.from('das_decisions').select('*')
        .eq('team_id', team.teamId).eq('round_number', roundNumber),
      supabase.from('hr_metrics').select('*')
        .eq('team_id', team.teamId).eq('round_number', roundNumber).maybeSingle(),
      supabase.from('team_round_state').select('headcount')
        .eq('team_id', team.teamId).eq('round_number', roundNumber - 1).maybeSingle(),
    ]);

  const budgets = (budget ?? []) as Record<string, unknown>[];
  /** Le dernier budget connu : il porte l'ÉTAT — dette en cours, frais de siège. */
  const lastBudget = budgets.at(-1) ?? null;
  /** Celui du tour courant : il porte les GESTES, qui ne se reconduisent pas. */
  const thisRound = budgets.find((b) => num(b.round_number) === roundNumber) ?? null;

  const drawnThisRoundMad = num(thisRound?.debt_drawn_mad);

  // Ce dont on dispose : la trésorerie de clôture du dernier exercice, plus le
  // crédit pris ce tour. Un tirage augmente réellement la capacité à engager —
  // l'omettre ferait apparaître un dépassement fictif.
  const availableMad = num(pnl?.treasury_end_mad) + drawnThisRoundMad;

  // Les salaires sont un engagement du tour au même titre qu'un investissement :
  // les omettre faisait apparaître « 0 DH engagé » à une équipe qui payait
  // pourtant plusieurs milliards de masse salariale.
  const hires =
    num(hr?.hire_operateurs) + num(hr?.hire_techniciens) +
    num(hr?.hire_experts) + num(hr?.hire_cadres);
  const headcountEnd = Math.max(
    num(state?.headcount) + hires - num(hr?.restructuring_count), 0,
  );
  const payrollMad =
    headcountEnd * num(hr?.avg_salary_brut_mad, 5800) * 12 * (1 + CHARGES_PATRONALES);

  const dasEngagedMad = (decisions ?? []).reduce(
    (acc, d) =>
      acc + num(d.capex_capacity_mad) + num(d.capex_automation_mad) +
      num(d.capex_own_network_mad) + num(d.rd_budget_mad) + num(d.marketing_budget_mad),
    0,
  );

  const engagedMad =
    payrollMad + dasEngagedMad +
    num(lastBudget?.opex_mad) + num(thisRound?.debt_repaid_mad) +
    num(thisRound?.dividend_mad) + num(hr?.training_budget_mad);

  return {
    availableMad,
    engagedMad,
    payrollMad,
    dasEngagedMad,
    debtOutstandingMad: num(lastBudget?.debt_outstanding_mad),
    drawnThisRoundMad,
  };
}
