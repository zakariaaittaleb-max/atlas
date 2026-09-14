'use client';

/**
 * Le nom de marque d'un domaine, modifiable sur place.
 *
 * Replié en lecture : le titre de l'écran reste un titre, et le crayon
 * n'apparaît que si on le cherche. Une équipe nomme sa marque une fois, pas à
 * chaque tour.
 */

import { useState, useTransition } from 'react';

import { useT } from '@/components/i18n-provider';

type Result = { ok: true; name: string } | { ok: false; error: string };

export function BrandName({
  dasId,
  brandName,
  activityName,
  renameAction,
}: {
  dasId: string;
  /** Le nom donné par l'équipe, ou `null` si elle n'en a pas donné. */
  brandName: string | null;
  /** Le nom du secteur : ce qu'on affiche faute de marque. */
  activityName: string;
  renameAction: (input: { dasId: string; brandName: string }) => Promise<Result>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(brandName ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const t = useT();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await renameAction({ dasId, brandName: draft });
      if (result.ok) setEditing(false);
      else setError(result.error);
    });
  }

  if (!editing) {
    return (
      <span className="inline-flex flex-wrap items-baseline gap-2">
        <span>{brandName ?? activityName}</span>
        {brandName ? (
          <span className="text-base font-normal text-(--foreground-muted)">
            {activityName}
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-sm font-normal text-(--accent) underline"
        >
          {brandName ? t('brand.rename') : t('brand.name')}
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <input
        autoFocus
        value={draft}
        maxLength={40}
        disabled={pending}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') { setDraft(brandName ?? ''); setEditing(false); }
        }}
        placeholder={activityName}
        aria-label={t('brand.aria')}
        className="rounded-lg border border-(--border) bg-(--background) px-3 py-1.5 text-2xl"
      />
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="rounded-lg bg-(--accent) enabled:hover:bg-(--accent-hover) transition-colors px-3 py-1.5 text-sm font-medium text-(--on-accent) disabled:opacity-40"
      >
        {t('brand.save')}
      </button>
      <button
        type="button"
        onClick={() => { setDraft(brandName ?? ''); setEditing(false); }}
        className="text-sm text-(--foreground-muted) underline"
      >
        {t('actions.cancel')}
      </button>
      {/* Vider le champ est une décision, pas une faute : on le dit. */}
      <span className="text-xs text-(--foreground-muted)">
        {t('brand.emptyHint', { name: activityName })}
      </span>
      {error ? <span className="text-sm text-(--negative)">{error}</span> : null}
    </span>
  );
}
