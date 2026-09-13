import 'server-only';

import { buildUserEmailMap } from '@/lib/admin-users';
import { readSecurityConfig, SECURITY_MEASURES } from '@/lib/security-config';
import { createAdminClient } from '@/lib/supabase/server';

import { updateSecurityConfigAction } from './actions';
import { SecurityPanel } from './security-panel';

export const metadata = { title: 'Atlas — Sécurité' };
export const dynamic = 'force-dynamic';

interface LogRow {
  id: string;
  measure_name: string;
  enabled: boolean;
  changed_by: string | null;
  changed_at: string;
}

export default async function SecurityAdminPage() {
  const admin = createAdminClient();

  const [config, { data: log }, emailById] = await Promise.all([
    readSecurityConfig(),
    admin
      .from('security_config_log')
      .select('id, measure_name, enabled, changed_by, changed_at')
      .order('changed_at', { ascending: false })
      .limit(50),
    buildUserEmailMap(),
  ]);

  const entries = ((log as LogRow[] | null) ?? []).map((row) => ({
    ...row,
    changedByEmail: row.changed_by ? (emailById.get(row.changed_by) ?? row.changed_by) : '—',
  }));

  return (
    <main className="mx-auto w-full min-w-0 max-w-3xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-(--heading) tracking-tight">Sécurité</h1>
        <p className="mt-2 text-(--foreground-muted)">
          Mesures anti-scraping appliquées à l’ensemble du site. Chaque bascule prend effet en
          quelques secondes, sans redéploiement.
        </p>
      </header>

      <SecurityPanel
        measures={SECURITY_MEASURES}
        initialConfig={config}
        updateAction={updateSecurityConfigAction}
      />

      <section className="mt-12">
        <h2 className="mb-4 text-xl font-semibold">Journal des changements</h2>
        {entries.length === 0 ? (
          <p className="text-(--foreground-muted)">Aucun changement pour l’instant.</p>
        ) : (
          <ul className="space-y-2">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="rounded-lg border border-(--border) bg-(--surface) px-4 py-3 text-sm"
              >
                <span className="font-medium">{entry.measure_name}</span>
                {' → '}
                <span className={entry.enabled ? 'text-(--positive)' : 'text-(--negative)'}>
                  {entry.enabled ? 'activée' : 'désactivée'}
                </span>
                <span className="text-(--foreground-muted)">
                  {' · '}
                  {entry.changedByEmail}
                  {' · '}
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
