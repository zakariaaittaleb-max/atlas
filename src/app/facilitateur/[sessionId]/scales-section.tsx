'use client';

/**
 * Les fourchettes que les équipes peuvent parcourir.
 *
 * Un accordéon par famille, replié : le facilitateur qui ne touche à rien joue
 * les fourchettes calées sur la pratique, et celui qui veut brider les
 * licenciements ou ouvrir grand les investissements n'ouvre qu'une ligne.
 *
 * Chaque famille montre un APERÇU de son échelle — les mots que les équipes
 * liront aux différents crans. Régler « +50 % » sans voir que cela s'appellera
 * « hausse maximale » sur les salaires et « faible hausse » sur le marketing
 * revient à régler à l'aveugle.
 */

import { useState, useTransition } from 'react';

import {
  DEFAULT_SCALES,
  FAMILY_LABELS,
  variationLabel,
  type VariationFamily,
  type VariationScale,
} from '@/lib/variation-scale';

type Result = { ok: true } | { ok: false; error: string };

const FAMILIES = Object.keys(DEFAULT_SCALES) as VariationFamily[];

export function ScalesSection({
  sessionId,
  scales,
  setScalesAction,
  resetScalesAction,
}: {
  sessionId: string;
  scales: Readonly<Record<string, VariationScale>>;
  setScalesAction: (input: {
    sessionId: string;
    scales: Record<string, VariationScale>;
  }) => Promise<Result>;
  resetScalesAction: (input: { sessionId: string }) => Promise<Result>;
}) {
  const [draft, setDraft] = useState<Record<string, VariationScale>>({ ...scales });
  const [dirty, setDirty] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: 'ok' | 'ko'; text: string } | null>(null);

  function patch(family: VariationFamily, next: Partial<VariationScale>) {
    setDraft((current) => ({
      ...current,
      [family]: { ...current[family], ...next },
    }));
    setDirty(true);
    setMessage(null);
  }

  return (
    <section className="mb-8 rounded-xl border border-(--border) bg-(--surface) p-6">
      <h2 className="text-xl font-medium">Jusqu’où les équipes peuvent aller</h2>
      <p className="mt-1 mb-4 max-w-3xl text-sm text-(--foreground-muted)">
        Chaque champ chiffré se pilote en écart par rapport au tour précédent. Les fourchettes
        ci-dessous sont calées sur ce qu’on observe en entreprise — un budget marketing peut
        tripler d’un exercice à l’autre, un salaire brut moyen ne bouge que de quelques points.
        Resserrez pour forcer des ajustements prudents, ouvrez pour autoriser les paris.
      </p>

      <div className="space-y-2">
        {FAMILIES.map((family) => {
          const scale = draft[family] ?? DEFAULT_SCALES[family];
          const isDefault =
            scale.bounds.min === DEFAULT_SCALES[family].bounds.min &&
            scale.bounds.max === DEFAULT_SCALES[family].bounds.max;

          return (
            <details
              key={family}
              className="rounded-lg border border-(--border) bg-(--surface)"
            >
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-4 py-3">
                <span className="font-medium">{FAMILY_LABELS[family]}</span>
                <span className="tabular text-sm text-(--foreground-muted)">
                  {scale.bounds.min} % … +{scale.bounds.max} %
                </span>
                {!isDefault ? (
                  <span className="rounded bg-(--surface-muted) px-2 py-0.5 text-xs text-(--foreground-muted)">
                    modifié
                  </span>
                ) : null}
              </summary>

              <div className="border-t border-(--border) px-4 py-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Dial
                    label="Baisse maximale autorisée"
                    value={scale.bounds.min}
                    min={-100}
                    max={0}
                    disabled={pending}
                    onChange={(min) => patch(family, { bounds: { ...scale.bounds, min } })}
                  />
                  <Dial
                    label="Hausse maximale autorisée"
                    value={scale.bounds.max}
                    min={0}
                    max={500}
                    disabled={pending}
                    onChange={(max) => patch(family, { bounds: { ...scale.bounds, max } })}
                  />
                </div>

                <p className="mt-4 text-xs font-medium tracking-wide text-(--foreground-muted) uppercase">
                  Ce que les équipes liront
                </p>
                <ul className="tabular mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  {previewPoints(scale).map((pct) => (
                    <li key={pct}>
                      <span className="text-(--foreground-muted)">
                        {pct > 0 ? '+' : ''}
                        {pct} %
                      </span>{' '}
                      {variationLabel(pct, scale)}
                    </li>
                  ))}
                </ul>

                <div className="mt-4 grid gap-4 sm:grid-cols-4">
                  {(['flat', 'faible', 'moyenne', 'forte'] as const).map((key) => (
                    <Dial
                      key={key}
                      label={THRESHOLD_LABELS[key]}
                      value={Math.round(scale.thresholds[key] * 100)}
                      min={0}
                      max={100}
                      suffix="% de la fourchette"
                      disabled={pending}
                      onChange={(v) =>
                        patch(family, {
                          thresholds: { ...scale.thresholds, [key]: v / 100 },
                        })
                      }
                    />
                  ))}
                </div>
              </div>
            </details>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending || !dirty}
          onClick={() =>
            startTransition(async () => {
              const result = await setScalesAction({ sessionId, scales: draft });
              if (result.ok) {
                setDirty(false);
                setMessage({ kind: 'ok', text: 'Fourchettes appliquées.' });
              } else {
                setMessage({ kind: 'ko', text: result.error });
              }
            })
          }
          className="rounded-lg bg-(--accent) enabled:hover:bg-(--accent-hover) transition-colors px-4 py-2 text-sm font-medium text-(--on-accent) disabled:opacity-40"
        >
          {pending ? 'Application…' : 'Appliquer les fourchettes'}
        </button>

        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await resetScalesAction({ sessionId });
              if (result.ok) {
                setDraft({ ...DEFAULT_SCALES });
                setDirty(false);
                setMessage({ kind: 'ok', text: 'Retour aux fourchettes de référence.' });
              } else {
                setMessage({ kind: 'ko', text: result.error });
              }
            })
          }
          className="rounded-lg border border-(--border) px-4 py-2 text-sm disabled:opacity-40"
        >
          Revenir aux valeurs de référence
        </button>
      </div>

      {message ? (
        <p
          role="status"
          className={
            'mt-3 text-sm ' +
            (message.kind === 'ok' ? 'text-(--positive)' : 'text-(--negative)')
          }
        >
          {message.text}
        </p>
      ) : null}
    </section>
  );
}

const THRESHOLD_LABELS = {
  flat: 'Seuil « inchangé »',
  faible: 'Seuil « faible »',
  moyenne: 'Seuil « moyenne »',
  forte: 'Seuil « forte »',
} as const;

/** Quelques crans représentatifs, pour lire l'échelle d'un coup d'œil. */
function previewPoints(scale: VariationScale): number[] {
  const { min, max } = scale.bounds;
  const points = [
    min,
    Math.round(min / 2),
    0,
    Math.round(max / 4),
    Math.round(max / 2),
    max,
  ];
  return [...new Set(points)].sort((a, b) => a - b);
}

function Dial({
  label,
  value,
  min,
  max,
  onChange,
  disabled,
  suffix = '%',
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  suffix?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm">
        {label}{' '}
        <strong className="tabular">
          {value} {suffix}
        </strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1.5 w-full"
      />
    </label>
  );
}
