import { loadDecisionContext, missingDecisions } from '@/lib/server/decision-context';

import { MarchesView } from './marches-view';

export const metadata = { title: 'Atlas — Achats & distribution' };
export const dynamic = 'force-dynamic';

export default async function MarchesPage() {
  const context = await loadDecisionContext();
  return <MarchesView context={context} missing={missingDecisions(context)} />;
}
