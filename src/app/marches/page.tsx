import { loadDecisionContext, missingDecisions } from '@/lib/server/decision-context';
import { loadEnabledModules } from '@/lib/server/modules';

import { MarchesView } from './marches-view';

export const metadata = { title: 'Atlas — Achats & distribution' };
export const dynamic = 'force-dynamic';

export default async function MarchesPage() {
  const context = await loadDecisionContext();
  const modules = await loadEnabledModules(context.team.sessionId);
  return (
    <MarchesView
      context={context}
      missing={missingDecisions(context, modules)}
      modules={modules}
    />
  );
}
