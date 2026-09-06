import 'server-only';

import { notFound } from 'next/navigation';

import { getUser } from '@/lib/dal';
import {
  isSuperAdminEmail,
  readSecurityConfig,
  SECURITY_MEASURES,
} from '@/lib/security-config';
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
  // 404 plutôt que redirection : un visiteur qui devine l'URL sans être
  // super-admin ne doit même pas apprendre que la page existe.
  const user = await getUser();
  if (!user || !isSuperAdminEmail(user.email)) notFound();

  const admin = createAdminClient();

  const [config, { data: log }] = await Promise.all([
    readSecurityConfig(),
    admin
      .from('security_config_log')
      .select('id, measure_name, enabled, changed_by, changed_at')
      .order('changed_at', { ascending: false })
      .limit(50),
  ]);

  const emailById = new Map<string, string>();
  try {
    const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
    for (const u of data?.users ?? []) {
      if (u.email) emailById.set(u.id, u.email);
    }
  } catch {
    // L'API Admin Auth n'est qu'un enrichissement d'affichage : son absence
    // ne doit pas empêcher la page de rendre le journal (avec des id bruts).
  }

  const entries = ((log as LogRow[] | null) ?? []).map((row) => ({
    ...row,
    changedByEmail: row.changed_by ? (emailById.get(row.changed_by) ?? row.changed_by) : '—',
  }));

  return (
    <main className="mx-auto w-full min-w-0 max-w-3xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Sécurité</h1>
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
