import { loadDecisionContext, missingDecisions } from '@/lib/server/decision-context';

import { StrategieGroupeView } from './strategie-view';

export const metadata = { title: 'Atlas — Stratégie du Groupe' };
export const dynamic = 'force-dynamic';

export default async function StrategieGroupePage() {
  const context = await loadDecisionContext();
  return <StrategieGroupeView context={context} missing={missingDecisions(context)} />;
}
