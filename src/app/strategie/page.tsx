import { loadDecisionContext, missingDecisions } from '@/lib/server/decision-context';

import { StrategieView } from './strategie-view';

export const metadata = { title: 'Atlas — Stratégie' };
export const dynamic = 'force-dynamic';

export default async function StrategiePage() {
  const context = await loadDecisionContext();
  return <StrategieView context={context} missing={missingDecisions(context)} />;
}
