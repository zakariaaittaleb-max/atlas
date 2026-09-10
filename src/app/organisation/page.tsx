import { requireTeam } from '@/lib/dal';
import { loadEnabledModules } from '@/lib/server/modules';
import { loadOrgContext } from '@/lib/server/org-context';
import { loadVariationScales } from '@/lib/server/variation-scales';

import { OrganisationView } from './organisation-view';

export const metadata = { title: 'Atlas — Organisation' };
export const dynamic = 'force-dynamic';

export default async function OrganisationPage() {
  const team = await requireTeam();
  const [context, modules, scales] = await Promise.all([
    loadOrgContext(),
    loadEnabledModules(team.sessionId),
    loadVariationScales(team.sessionId),
  ]);
  return <OrganisationView context={context} modules={modules} scales={scales} />;
}
