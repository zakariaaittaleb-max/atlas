import { loadDecisionContext, missingDecisions } from '@/lib/server/decision-context';
import { loadEnabledModules } from '@/lib/server/modules';

import { StrategieGroupeView } from './strategie-view';

export const metadata = { title: 'Atlas — Stratégie du Groupe' };
export const dynamic = 'force-dynamic';

export default async function StrategieGroupePage() {
  const context = await loadDecisionContext();
  const modules = await loadEnabledModules(context.team.sessionId);
  return (
    <StrategieGroupeView
      context={context}
      missing={missingDecisions(context, modules)}
      modules={modules}
    />
  );
}
