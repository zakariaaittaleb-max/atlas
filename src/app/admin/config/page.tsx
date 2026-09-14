import 'server-only';

import { buildUserEmailMap } from '@/lib/admin-users';
import { readDisplayConfig } from '@/lib/display-config';
import { DASHBOARD_SECTIONS, VIEW_LEVELS } from '@/lib/display-config-types';
import { createAdminClient } from '@/lib/supabase/server';

import { updateDisplayConfigAction } from './actions';
import { ConfigPanel } from './config-panel';

export const metadata = { title: 'Atlas — Affichage' };
export const dynamic = 'force-dynamic';

interface LogRow {
  id: string;
  changed_by: string | null;
  changed_at: string;
}

export default async function DisplayConfigPage() {
  const admin = createAdminClient();

  const [config, { data: log }, emailById] = await Promise.all([
    readDisplayConfig(),
    admin
      .from('display_config_log')
      .select('id, changed_by, changed_at')
      .order('changed_at', { ascending: false })
      .limit(20),
    buildUserEmailMap(),
  ]);

  const entries = ((log as LogRow[] | null) ?? []).map((row) => ({
    ...row,
    changedByEmail: row.changed_by ? (emailById.get(row.changed_by) ?? row.changed_by) : '—',
  }));

  return (
    <main className="mx-auto w-full min-w-0 max-w-3xl px-6 py-10">
      <header className="mb-10">
        <p className="text-xs font-semibold tracking-wider text-(--accent-text) uppercase">
          Super-admin
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-(--heading)">
          Configuration de l’affichage
        </h1>
        <p className="mt-2 max-w-2xl text-(--foreground-muted)">
          Ce que les équipes voient, et comment. Masquer une section retire son onglet du
          dashboard sans rien effacer : ses données restent calculées et reviennent à
          l’identique dès qu’elle est rallumée. Effet en quelques secondes, sans redéploiement.
        </p>
      </header>

      <ConfigPanel
        sections={DASHBOARD_SECTIONS}
        views={VIEW_LEVELS}
        initialConfig={config}
        updateAction={updateDisplayConfigAction}
      />

      <section className="mt-14">
        <h2 className="mb-4 text-xl font-semibold text-(--heading)">Journal des enregistrements</h2>
        {entries.length === 0 ? (
          <p className="text-(--foreground-muted)">Aucun enregistrement pour l’instant.</p>
        ) : (
          <ul className="divide-y divide-(--border) rounded-xl border border-(--border) bg-(--surface)">
            {entries.map((entry) => (
              <li key={entry.id} className="flex flex-wrap justify-between gap-2 px-4 py-3 text-sm">
                <span className="font-medium">{entry.changedByEmail}</span>
                <span className="tabular text-(--foreground-muted)">
                  {new Date(entry.changed_at).toLocaleString('fr-FR')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
