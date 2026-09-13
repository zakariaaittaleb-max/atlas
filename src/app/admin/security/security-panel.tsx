'use client';

import { useMemo, useState, useTransition } from 'react';

import type { SecurityConfigState, SecurityMeasureName } from '@/lib/security-config-types';

interface Measure {
  name: SecurityMeasureName;
  label: string;
  description: string;
}

type UpdateSecurityConfigResult = { ok: true } | { ok: false; error: string };
type UpdateAction = (next: SecurityConfigState) => Promise<UpdateSecurityConfigResult>;

/**
 * Lit et pilote l'état des mesures depuis le composant : les bascules cochées
 * à l'écran (`draft`) restent locales tant que « Appliquer » n'a pas confirmé
 * l'écriture en base — un clic malheureux sur un toggle ne coupe rien.
 *
 * La Server Function elle-même est reçue en prop (fournie par `page.tsx`)
 * plutôt qu'importée ici : un composant client qui importe `./actions`
 * entraînerait tout son graphe serveur (DAL, client `service_role`) dans
 * l'analyse statique de `boundaries.test.ts`, alors que Next.js ne bundle en
 * réalité qu'une référence RPC.
 */
function useSecurityConfig(initialConfig: SecurityConfigState, updateAction: UpdateAction) {
  const [applied, setApplied] = useState(initialConfig);
  const [draft, setDraft] = useState(initialConfig);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(
    null,
  );

  const isDirty = useMemo(
    () => (Object.keys(draft) as SecurityMeasureName[]).some((key) => draft[key] !== applied[key]),
    [draft, applied],
  );

  function toggle(name: SecurityMeasureName) {
    setMessage(null);
    setDraft((prev) => ({ ...prev, [name]: !prev[name] }));
  }

  function apply() {
    setMessage(null);
    startTransition(async () => {
      const result = await updateAction(draft);
      if (result.ok) {
        setApplied(draft);
        setMessage({ kind: 'success', text: 'Configuration appliquée.' });
      } else {
        setMessage({ kind: 'error', text: result.error });
      }
    });
  }

  return { draft, isDirty, pending, message, toggle, apply };
}

export function SecurityPanel({
  measures,
  initialConfig,
  updateAction,
}: {
  measures: readonly Measure[];
  initialConfig: SecurityConfigState;
  updateAction: UpdateAction;
}) {
  const { draft, isDirty, pending, message, toggle, apply } = useSecurityConfig(
    initialConfig,
    updateAction,
  );

  return (
    <section>
      <ul className="space-y-3">
        {measures.map((measure) => {
          const enabled = draft[measure.name];
          return (
            <li
              key={measure.name}
              className="flex items-start justify-between gap-4 rounded-xl border border-(--border) bg-(--surface) p-5"
            >
              <div className="min-w-0">
                <p className="font-medium">{measure.label}</p>
                <p className="mt-1 text-sm text-(--foreground-muted)">{measure.description}</p>
                <p className="mt-2 text-xs font-medium uppercase tracking-wide text-(--foreground-muted)">
                  {enabled ? 'Activée' : 'Désactivée'}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-label={measure.label}
                onClick={() => toggle(measure.name)}
                disabled={pending}
                className={
                  'relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ' +
                  (enabled ? 'bg-(--accent)' : 'bg-(--surface-muted)')
                }
              >
                <span
                  className={
                    'absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ' +
                    (enabled ? 'translate-x-6' : 'translate-x-1')
                  }
                />
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-6 flex items-center gap-4">
        <button
          type="button"
          onClick={apply}
          disabled={!isDirty || pending}
          className="rounded-lg bg-(--accent) enabled:hover:bg-(--accent-hover) transition-colors px-5 py-2.5 font-medium text-(--on-accent) disabled:opacity-50"
        >
          {pending ? 'Application…' : 'Appliquer'}
        </button>
        {message ? (
          <p
            role="alert"
            className={message.kind === 'success' ? 'text-(--positive)' : 'text-(--negative)'}
          >
            {message.text}
          </p>
        ) : isDirty ? (
          <p className="text-sm text-(--foreground-muted)">Modifications non appliquées.</p>
        ) : null}
      </div>
    </section>
  );
}
