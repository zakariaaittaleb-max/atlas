import 'server-only';

import { listFacilitatorUsers, isBanned } from '@/lib/admin-users';
import {
  DEFAULT_FACILITATOR_CAPABILITIES,
  readCapabilitiesFor,
} from '@/lib/facilitator-capabilities';
import { loadCeilingsFor } from '@/lib/server/modules';
import { createAdminClient } from '@/lib/supabase/server';

import {
  createFacilitatorAction,
  deleteFacilitatorAction,
  impersonateFacilitatorAction,
  resetFacilitatorPasswordAction,
  setFacilitatorBannedAction,
  setFacilitatorCapabilityAction,
  setFacilitatorModulesAction,
} from './actions';
import { FacilitatorsPanel } from './facilitators-panel';

export const metadata = { title: 'Atlas — Facilitateurs' };
export const dynamic = 'force-dynamic';

export default async function FacilitatorsAdminPage() {
  const [users, { data: sessions }] = await Promise.all([
    listFacilitatorUsers(),
    createAdminClient().from('game_sessions').select('facilitator_id'),
  ]);

  const sessionCountByFacilitator = new Map<string, number>();
  for (const row of sessions ?? []) {
    const id = String(row.facilitator_id);
    sessionCountByFacilitator.set(id, (sessionCountByFacilitator.get(id) ?? 0) + 1);
  }

  const ids = users.map((u) => u.id);
  const [capabilities, ceilings] = await Promise.all([
    readCapabilitiesFor(ids),
    loadCeilingsFor(ids),
  ]);

  const facilitators = users
    .map((u) => ({
      id: u.id,
      email: u.email ?? '—',
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at ?? null,
      banned: isBanned(u),
      sessionCount: sessionCountByFacilitator.get(u.id) ?? 0,
      capabilities: capabilities.get(u.id) ?? { ...DEFAULT_FACILITATOR_CAPABILITIES },
      modules: ceilings.get(u.id) ?? {},
    }))
    .sort((a, b) => a.email.localeCompare(b.email));

  return (
    <main className="mx-auto w-full min-w-0 max-w-4xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-(--heading) tracking-tight">Facilitateurs</h1>
        <p className="mt-2 text-(--foreground-muted)">
          Tout compte non-anonyme est un facilitateur — les participants n’existent qu’en
          anonyme, le temps d’une session.
        </p>
      </header>

      <FacilitatorsPanel
        facilitators={facilitators}
        createAction={createFacilitatorAction}
        setBannedAction={setFacilitatorBannedAction}
        resetPasswordAction={resetFacilitatorPasswordAction}
        deleteAction={deleteFacilitatorAction}
        impersonateAction={impersonateFacilitatorAction}
        setCapabilityAction={setFacilitatorCapabilityAction}
        setModulesAction={setFacilitatorModulesAction}
      />
    </main>
  );
}
