import 'server-only';

import { buildUserEmailMap, listFacilitatorUsers } from '@/lib/admin-users';
import { sessionStatusLabel } from '@/lib/format';
import { createAdminClient } from '@/lib/supabase/server';

import { deleteSessionAction, reassignSessionAction, renameSessionAction } from './actions';
import { SessionsPanel } from './sessions-panel';

export const metadata = { title: 'Atlas — Sessions' };
export const dynamic = 'force-dynamic';

export default async function SessionsAdminPage() {
  const admin = createAdminClient();

  const [{ data: sessionRows }, { data: teamRows }, emailById, facilitatorUsers] =
    await Promise.all([
      admin
        .from('game_sessions')
        .select('id, name, facilitator_id, status, current_round, planned_rounds, join_code, created_at')
        .order('created_at', { ascending: false }),
      admin.from('teams').select('session_id'),
      buildUserEmailMap(),
      listFacilitatorUsers(),
    ]);

  const teamCountBySession = new Map<string, number>();
  for (const row of teamRows ?? []) {
    const id = String(row.session_id);
    teamCountBySession.set(id, (teamCountBySession.get(id) ?? 0) + 1);
  }

  const sessions = (sessionRows ?? []).map((s) => ({
    id: String(s.id),
    name: String(s.name),
    facilitatorId: String(s.facilitator_id),
    facilitatorEmail: emailById.get(String(s.facilitator_id)) ?? '—',
    status: sessionStatusLabel(String(s.status)),
    currentRound: Number(s.current_round),
    plannedRounds: Number(s.planned_rounds),
    joinCode: String(s.join_code),
    createdAt: String(s.created_at),
    teamCount: teamCountBySession.get(String(s.id)) ?? 0,
  }));

  const facilitatorOptions = facilitatorUsers
    .filter((u) => u.email)
    .map((u) => ({ id: u.id, email: u.email! }))
    .sort((a, b) => a.email.localeCompare(b.email));

  return (
    <main className="mx-auto w-full min-w-0 max-w-4xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Sessions</h1>
        <p className="mt-2 text-(--foreground-muted)">
          Toutes les sessions, tous facilitateurs confondus. Pour en créer une, connectez-vous en
          tant que le facilitateur concerné (page Facilitateurs) puis utilisez le formulaire
          habituel — le provisionnement (DAS, écosystème, équipes) reste celui de /facilitateur.
        </p>
      </header>

      <SessionsPanel
        sessions={sessions}
        facilitatorOptions={facilitatorOptions}
        renameAction={renameSessionAction}
        reassignAction={reassignSessionAction}
        deleteAction={deleteSessionAction}
      />
    </main>
  );
}
