'use client';

/**
 * Choisir sa langue : français, anglais ou arabe.
 *
 * Le sens de lecture bascule à l'instant (`dir` du document), puis la page se
 * rafraîchit pour que le serveur rende les textes dans la langue choisie. Le
 * choix est retenu par cookie, pour chaque participant.
 */

import { Languages } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { useLocale, useT } from '@/components/i18n-provider';
import {
  dirOf, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, LOCALE_LABELS, LOCALES, parseLocale, type Locale,
} from '@/lib/i18n/locales';

/** Retenu pour le prochain rendu serveur, et appliqué au document sans attendre. */
function applyLocale(next: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
  document.documentElement.lang = next;
  document.documentElement.dir = dirOf(next);
}

export function LanguageSwitcher() {
  const locale = useLocale();
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <label className="flex shrink-0 items-center gap-1.5 text-sm">
      <Languages aria-hidden className="h-4 w-4 text-(--foreground-muted)" />
      <span className="sr-only">{t('lang.label')}</span>
      <select
        id="langue"
        value={locale}
        disabled={pending}
        onChange={(event) => {
          const next = parseLocale(event.target.value);
          if (!next) return;
          applyLocale(next);
          startTransition(() => router.refresh());
        }}
        className="min-h-8 rounded-lg border border-(--border) bg-(--surface) px-2 text-sm"
      >
        {LOCALES.map((value) => (
          <option key={value} value={value} lang={value}>
            {LOCALE_LABELS[value]}
          </option>
        ))}
      </select>
    </label>
  );
}
