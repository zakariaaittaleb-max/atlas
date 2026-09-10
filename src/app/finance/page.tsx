import { loadDecisionContext, missingDecisions } from '@/lib/server/decision-context';
import { loadEnabledModules } from '@/lib/server/modules';
import { loadMoneyBar } from '@/lib/server/money-bar';
import { loadResultsContext } from '@/lib/server/results-context';

import { FinanceView } from './finance-view';

export const metadata = { title: 'Atlas — Organisation & finance' };
export const dynamic = 'force-dynamic';

export default async function FinancePage() {
  const [context, results, money] = await Promise.all([
    loadDecisionContext(),
    loadResultsContext(),
    loadMoneyBar(),
  ]);
  const modules = await loadEnabledModules(context.team.sessionId);
  return (
    <FinanceView
      context={context}
      missing={missingDecisions(context, modules)}
      modules={modules}
      results={results}
      money={money}
    />
  );
}
