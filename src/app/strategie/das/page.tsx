import { loadDecisionContext, missingDecisions } from '@/lib/server/decision-context';
import { loadEnabledModules } from '@/lib/server/modules';
import { loadVariationScales } from '@/lib/server/variation-scales';

import { renameBrandAction } from '@/app/actions/brand';

import { StrategieDasView } from '../strategie-view';

export const metadata = { title: 'Atlas — Stratégie du DAS' };
export const dynamic = 'force-dynamic';

export default async function StrategieDasPage() {
  const context = await loadDecisionContext();
  const [modules, scales] = await Promise.all([
    loadEnabledModules(context.team.sessionId),
    loadVariationScales(context.team.sessionId),
  ]);
  return (
    <StrategieDasView
      context={context}
      missing={missingDecisions(context, modules)}
      modules={modules}
      scales={scales}
      renameBrandAction={renameBrandAction}
    />
  );
}
