import { loadDecisionContext, missingDecisions } from '@/lib/server/decision-context';

import { StrategieDasView } from '../strategie-view';

export const metadata = { title: 'Atlas — Stratégie du DAS' };
export const dynamic = 'force-dynamic';

export default async function StrategieDasPage() {
  const context = await loadDecisionContext();
  return <StrategieDasView context={context} missing={missingDecisions(context)} />;
}
