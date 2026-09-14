'use client';

/**
 * Thème d'affichage : système, clair ou sombre.
 *
 * Le choix s'applique à l'instant — l'attribut `data-theme` du document change
 * sans rechargement — et un cookie le fait valoir au rendu serveur suivant, si
 * bien que la première image d'une nouvelle page est déjà la bonne.
 */

import { Monitor, Moon, Sun } from 'lucide-react';
import { useState } from 'react';

import { useT } from '@/components/i18n-provider';
import { THEME_COOKIE, THEME_COOKIE_MAX_AGE } from '@/lib/appearance';
import type { MessageKey } from '@/lib/i18n/messages';
import type { ThemeChoice } from '@/lib/display-config-types';

const OPTIONS: [ThemeChoice, MessageKey, typeof Sun][] = [
  ['system', 'theme.system', Monitor],
  ['light', 'theme.light', Sun],
  ['dark', 'theme.dark', Moon],
];

/** Retenu pour le prochain rendu serveur, et appliqué au document sans attendre. */
function applyTheme(next: ThemeChoice) {
  document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
  const root = document.documentElement;
  if (next === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', next);
}

export function ThemeToggle({ initial }: { initial: ThemeChoice }) {
  const [choice, setChoice] = useState<ThemeChoice>(initial);
  const t = useT();

  function choose(next: ThemeChoice) {
    setChoice(next);
    applyTheme(next);
  }

  return (
    <div
      role="group"
      aria-label={t('theme.group')}
      className="inline-flex shrink-0 rounded-lg border border-(--border) bg-(--surface) p-0.5"
    >
      {OPTIONS.map(([value, labelKey, Icon]) => {
        const label = t(labelKey);
        const on = choice === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={on}
            title={label}
            onClick={() => choose(value)}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
              on
                ? 'bg-(--accent-subtle) text-(--accent-text)'
                : 'text-(--foreground-muted) hover:text-(--foreground)'
            }`}
          >
            <Icon aria-hidden className="h-4 w-4" />
            <span className="sr-only">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
