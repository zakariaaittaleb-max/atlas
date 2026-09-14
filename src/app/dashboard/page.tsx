import { TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { cookies } from 'next/headers';

import { DashboardScreen } from './dashboard-screen';
import { getRoundState, requireTeam } from '@/lib/dal';
import { readDisplayConfig } from '@/lib/display-config';
import { parseViewLevel, VIEW_COOKIE } from '@/lib/display-config-types';
import { loadDashboardContext } from '@/lib/server/dashboard-context';
import { treasuryLabel } from '@/lib/format';

export const metadata = { title: 'Atlas — Dashboard' };
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const team = await requireTeam();
  const [round, context, config, jar] = await Promise.all([
    getRoundState(team.sessionId),
    loadDashboardContext(),
    readDisplayConfig(),
    cookies(),
  ]);
  const currentRound = (round?.current_round as number) ?? 0;
  // Le niveau choisi par ce membre prime ; à défaut, celui fixé par l'admin.
  const initialView = parseViewLevel(jar.get(VIEW_COOKIE)?.value) ?? config.defaultView;

  return (
    <main className="mx-auto w-full min-w-0 max-w-6xl px-6 py-8 lg:py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-wider text-(--accent-text) uppercase">
            Dashboard · {currentRound === 0 ? 'Onboarding (T0)' : `Tour ${currentRound}`}
            {round?.planned_rounds ? ` sur ${round.planned_rounds} prévus` : null}
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-(--heading)">{team.teamName}</h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {context.treasuryStatus && context.treasuryStatus !== 'sain' ? (
            <p className="inline-flex items-center gap-2 rounded-full bg-(--warning-subtle) px-3.5 py-1.5 text-sm font-semibold text-(--warning)">
              <TriangleAlert aria-hidden className="h-4 w-4" />
              Trésorerie {treasuryLabel(context.treasuryStatus).toLowerCase()}
            </p>
          ) : null}
        </div>
      </header>

      <DashboardScreen context={context} sections={config.sections} initialView={initialView} />

      {/* Apporté par le protocole de test d'utilisabilité : le participant doit
          trouver le questionnaire SUS sans qu'on le lui montre. Il le trouve en
          pied d'écran, là où l'on cherche ce qui n'est pas le jeu lui-même —
          et non plus à la place de l'action principale du Dashboard. */}
      <footer className="mt-12 border-t border-(--border) pt-5 text-sm text-(--foreground-muted)">
        Une remarque sur l’outil ?{' '}
        <Link href="/sus" className="font-medium text-(--accent-text) underline underline-offset-4">
          Donner mon avis sur Atlas
        </Link>
        {' '}(2 minutes).
      </footer>
    </main>
  );
}
