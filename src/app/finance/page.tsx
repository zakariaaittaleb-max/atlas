import { loadDecisionContext, missingDecisions } from '@/lib/server/decision-context';
import { isOn } from '@/lib/modules-state';
import { loadEnabledModules } from '@/lib/server/modules';
import { loadVariationScales } from '@/lib/server/variation-scales';
import { loadMoneyBar } from '@/lib/server/money-bar';
import { loadResultsContext } from '@/lib/server/results-context';

import { createServerClient } from '@/lib/supabase/server';

import type { FinancialLever } from './levers-section';
import { FinanceView } from './finance-view';

export const metadata = { title: 'Atlas — Organisation & finance' };
export const dynamic = 'force-dynamic';

export default async function FinancePage() {
  const [context, results, money] = await Promise.all([
    loadDecisionContext(),
    loadResultsContext(),
    loadMoneyBar(),
  ]);
  const supabase = await createServerClient();
  const [modules, scales, { data: leverRows }] = await Promise.all([
    loadEnabledModules(context.team.sessionId),
    loadVariationScales(context.team.sessionId),
    // Référentiel des leviers financiers : en base pour qu'un formateur puisse
    // en retoucher la formulation sans attendre un déploiement.
    supabase.from('financial_lever_catalog').select('*').order('display_order'),
  ]);

  const levers: FinancialLever[] = (leverRows ?? []).map((l) => ({
    key: String(l.key),
    category: String(l.category),
    actionLabel: String(l.action_label),
    successNote: String(l.success_note),
    riskNote: String(l.risk_note),
    rationaleNote: String(l.rationale_note),
    screen: l.screen ? String(l.screen) : null,
    // Un levier dont le champ est fermé reste LISIBLE : on explique ce qu'on
    // ne joue pas cette fois, plutôt que de le faire disparaître sans un mot.
    available: l.field_key ? isOn(modules, String(l.field_key)) : false,
  }));
  return (
    <FinanceView
      context={context}
      missing={missingDecisions(context, modules)}
      modules={modules}
      scales={scales}
      results={results}
      money={money}
      levers={levers}
    />
  );
}
