import 'server-only';

import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getUser } from '@/lib/dal';
import { sessionStatusLabel } from '@/lib/format';
import { isSuperAdminEmail } from '@/lib/security-config';
import { DAS_CATALOG } from '@/lib/server/das-catalog';
import { createAdminClient } from '@/lib/supabase/server';

import { SessionLauncher } from './session-launcher';
import { BriefingGuide } from './briefing-guide';

export const metadata = { title: 'Atlas — Mes sessions' };
export const dynamic = 'force-dynamic';

export default async function FacilitatorIndexPage() {
  const user = await getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: sessions } = await admin
    .from('game_sessions')
    .select('id, name, status, current_round, planned_rounds, join_code, created_at')
    .eq('facilitator_id', user.id)
    .order('created_at', { ascending: false });

  return (
    <main className="mx-auto w-full min-w-0 max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center justify-end gap-4 text-sm">
        {isSuperAdminEmail(user.email) ? (
          <Link href="/admin/security" className="hover:underline">
            Sécurité (super-admin)
          </Link>
        ) : null}
        {/* En POST : une déconnexion en GET pourrait être déclenchée par un
            lien préchargé ou une image. */}
        <form action="/api/auth/logout" method="post">
          <button type="submit" className="hover:underline">
            Se déconnecter
          </button>
        </form>
      </div>

      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Mes sessions</h1>
        <p className="mt-2 text-(--foreground-muted)">
          Vous animez les ateliers ci-dessous. Le code de session et les codes d’équipe se
          distribuent en salle.
        </p>
      </header>

      <BriefingGuide />

      {(sessions ?? []).length === 0 ? (
        <p className="mb-10 rounded-xl border border-(--border) bg-(--surface) p-6 text-(--foreground-muted)">
          Aucune session pour l’instant. Créez-en une ci-dessous.
        </p>
      ) : (
        <ul className="mb-12 space-y-3">
          {(sessions ?? []).map((s) => (
            <li
              key={String(s.id)}
              className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-(--border) bg-(--surface) p-5"
            >
              <div className="min-w-0">
                <p className="font-medium">{String(s.name)}</p>
                <p className="tabular mt-1 text-sm text-(--foreground-muted)">
                  Code <strong className="tracking-widest">{String(s.join_code)}</strong>
                  {' · '}
                  {Number(s.current_round) === 0 ? 'T0' : `Tour ${s.current_round}`} sur{' '}
                  {String(s.planned_rounds)} prévus · {sessionStatusLabel(String(s.status))}
                </p>
              </div>
              <div className="flex gap-2">
                <Link
                  href={`/facilitateur/${String(s.id)}`}
                  className="rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-white"
                >
                  Piloter
                </Link>
                <Link
                  href={`/projecteur/${String(s.id)}`}
                  className="rounded-lg border border-(--border) px-4 py-2 text-sm font-medium"
                >
                  Projecteur
                </Link>
                <Link
                  href={`/facilitateur/${String(s.id)}/protocole`}
                  className="rounded-lg border border-(--border) px-4 py-2 text-sm font-medium"
                >
                  Test utilisateur
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}

      <SessionLauncher
        sectors={DAS_CATALOG.map((d) => ({ key: d.sectorKey, name: d.name }))}
      />
    </main>
  );
}
