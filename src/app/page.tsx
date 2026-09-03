import { redirect } from 'next/navigation';

import { getTeamContext } from '@/lib/dal';

export default async function RootPage() {
  const context = await getTeamContext();
  redirect(context ? '/cockpit' : '/login');
}
