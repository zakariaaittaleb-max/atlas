'use client';

import { Check } from 'lucide-react';

/**
 * Boutons groupés, un seul actif.
 *
 * Deux présentations pour deux usages :
 *  • `segmented` — peu d'options qui changent la manière de voir (niveau de
 *    lecture, graphique ou tableau). L'option active est « levée » ;
 *  • `chips` — beaucoup d'options qui changent ce qu'on regarde (quatorze
 *    indicateurs d'un domaine). Elles passent à la ligne.
 *
 * L'état actif ne repose jamais sur la seule couleur : relief et graisse pour
 * `segmented`, coche et graisse pour `chips`.
 */
export function MetricToggle<K extends string>({
  options,
  value,
  onChange,
  label,
  variant = 'chips',
  size = 'md',
}: {
  options: ReadonlyArray<{ key: K; label: string; description?: string }>;
  value: K;
  onChange: (key: K) => void;
  /** Nom du groupe pour les lecteurs d'écran. */
  label: string;
  variant?: 'segmented' | 'chips';
  size?: 'sm' | 'md';
}) {
  const text = size === 'sm' ? 'text-xs' : 'text-sm';

  if (variant === 'segmented') {
    return (
      <div
        role="group"
        aria-label={label}
        className="inline-flex max-w-full flex-wrap gap-1 rounded-lg bg-(--surface-muted) p-1 ring-1 ring-(--border) ring-inset"
      >
        {options.map((option) => {
          const on = option.key === value;
          return (
            <button
              key={option.key}
              type="button"
              aria-pressed={on}
              title={option.description}
              onClick={() => onChange(option.key)}
              className={`rounded-md px-3 py-1.5 ${text} transition-[background-color,box-shadow,color] duration-150 ${
                on
                  ? 'bg-(--surface) font-semibold text-(--accent-text) shadow-sm ring-1 ring-(--border)'
                  : 'font-medium text-(--foreground-muted) hover:bg-(--surface) hover:text-(--foreground)'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const on = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            aria-pressed={on}
            title={option.description}
            onClick={() => onChange(option.key)}
            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 ${text} transition-colors duration-150 ${
              on
                ? 'border-(--accent) bg-(--accent-subtle) font-semibold text-(--accent-text)'
                : 'border-(--border) bg-(--surface) text-(--foreground-muted) hover:border-(--border-strong) hover:text-(--foreground)'
            }`}
          >
            {on ? <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={2.5} /> : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
