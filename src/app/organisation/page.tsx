import { loadOrgContext } from '@/lib/server/org-context';

import { OrganisationView } from './organisation-view';

export const metadata = { title: 'Atlas — Organisation' };
export const dynamic = 'force-dynamic';

export default async function OrganisationPage() {
  return <OrganisationView context={await loadOrgContext()} />;
}
