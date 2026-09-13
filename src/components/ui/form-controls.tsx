'use client';

import { Check } from 'lucide-react';

import { InfoHint } from './info-hint';

/**
 * Les briques de saisie communes aux écrans de décision.
 *
 * L'état « choisi » ne repose jamais sur la seule couleur : une coche, une
 * graisse et un fond l'accompagnent toujours.
 */

/** Une option parmi plusieurs, en carte. Ses définitions vont sous le « + » du groupe. */
export function ChoiceCard({
  selected, title, onSelect,
}: { selected: boolean; title: string; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors duration-150 disabled:opacity-50 ${
        selected
          ? 'border-(--accent) bg-(--accent-subtle) font-semibold text-(--accent-text)'
          : 'border-(--border) bg-(--surface) font-medium text-(--foreground) enabled:hover:border-(--border-strong)'
      }`}
    >
      <span>{title}</span>
      <span
        aria-hidden
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
          selected ? 'border-(--accent) bg-(--accent) text-(--on-accent)' : 'border-(--border-strong)'
        }`}
      >
        {selected ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
      </span>
    </button>
  );
}

/** Un interrupteur en pastille, pour les choix multiples. */
export function ChipToggle({
  label, on, onToggle,
}: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors duration-150 disabled:opacity-50 ${
        on
          ? 'border-(--accent) bg-(--accent-subtle) font-semibold text-(--accent-text)'
          : 'border-(--border) bg-(--surface) text-(--foreground) enabled:hover:border-(--border-strong)'
      }`}
    >
      {on ? <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={3} /> : null}
      {label}
    </button>
  );
}

/** Titre d'un groupe de champs, avec son explication sous le « + ». */
export function GroupLegend({
  title, children, as: Tag = 'legend',
}: {
  title: string;
  /** L'explication. Absente, pas de « + ». */
  children?: React.ReactNode;
  /** `legend` dans un fieldset, `p` ailleurs. */
  as?: 'legend' | 'p';
}) {
  return (
    <Tag className="mb-3 flex items-center gap-2 text-sm font-semibold text-(--heading)">
      {title}
      {children ? <InfoHint label={title}>{children}</InfoHint> : null}
    </Tag>
  );
}

/** Des options et leur définition, pour la bulle du « + ». */
export function Definitions({ items }: { items: readonly (readonly [string, string])[] }) {
  return (
    <>
      {items.map(([label, description]) => (
        <span key={label} className="mt-2 block first:mt-0">
          <strong className="font-semibold">{label}</strong> — {description}
        </span>
      ))}
    </>
  );
}
