import Link from 'next/link';

import { CockpitView } from './cockpit-view';
import { getRoundState, requireTeam } from '@/lib/dal';
import { loadDashboardContext } from '@/lib/server/dashboard-context';
import { treasuryLabel } from '@/lib/format';

export const metadata = { title: 'Atlas — Cockpit' };
export const dynamic = 'force-dynamic';

export default async function CockpitPage() {
  const team = await requireTeam();
  const [round, context] = await Promise.all([
    getRoundState(team.sessionId),
    loadDashboardContext(),
  ]);
  const currentRound = (round?.current_round as number) ?? 0;

  return (
    <main className="mx-auto w-full min-w-0 max-w-6xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{team.teamName}</h1>
          <p className="mt-1 text-(--foreground-muted)">
            {currentRound === 0 ? 'Onboarding (T0)' : `Tour ${currentRound}`}
            {round?.planned_rounds ? ` sur ${round.planned_rounds} prévus` : null}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {context.treasuryStatus && context.treasuryStatus !== 'sain' ? (
            <p className="rounded-lg border border-(--warning) px-4 py-2 text-sm font-medium text-(--warning)">
              Trésorerie {treasuryLabel(context.treasuryStatus).toLowerCase()}
            </p>
          ) : null}
          {/* Apporté par le protocole de test d'utilisabilité : le participant
              doit trouver le questionnaire SUS sans qu'on le lui montre. */}
          <Link
            href="/sus"
            className="rounded-lg border border-(--border) px-4 py-2 text-sm font-medium text-(--foreground-muted) hover:bg-(--surface-muted)"
          >
            Donner mon avis sur Atlas
          </Link>
        </div>
      </header>

      <CockpitView context={context} />
    </main>
  );
}
