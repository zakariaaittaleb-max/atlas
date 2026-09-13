import { ArrowDown, ArrowUp, Equal } from 'lucide-react';

import type { Delta } from '@/lib/format';

import { InfoHint } from './info-hint';
import { Sparkline } from './sparkline';

type Polarity = 'normal' | 'inverted' | 'neutral';

/**
 * Carte d'indicateur : une valeur, son libellé, sa variation.
 *
 * Règle imposée (doc 00 §8) : **chaque KPI affiche sa variation par rapport au
 * tour précédent, jamais une valeur brute isolée.** Une trésorerie de 38 M DH
 * ne dit rien ; « 38 M DH, ↓ −7 M » dit tout.
 *
 * La direction est portée par une icône, un signe ET une couleur : jamais par
 * la seule teinte, y compris sur un vidéoprojecteur qui délave les contrastes.
 * Une DÉCISION (un prix, un budget) n'est ni bonne ni mauvaise en soi : elle se
 * montre en `neutral`, sans vert ni rouge.
 */
export function StatCard({
  label,
  value,
  delta,
  hint,
  trend,
  source,
  note,
  size = 'md',
  polarity,
  /** Pour un indicateur où la baisse est une bonne nouvelle (coût, pression). */
  invertPolarity = false,
}: {
  label: string;
  value: string;
  delta?: Delta | null;
  /** Explication de l'indicateur, sous le « + ». */
  hint?: React.ReactNode;
  /** Valeurs de tous les tours, pour la ligne de tendance. */
  trend?: number[];
  /** Provenance quand la valeur n'est pas la vôtre, ex. « cabinet ±5 % ». */
  source?: string;
  /** Remplace « Premier tour — pas de comparaison » quand il n'y a pas d'écart chiffrable. */
  note?: string;
  /** `sm` pour une valeur en mots plutôt qu'en chiffres. */
  size?: 'md' | 'sm';
  polarity?: Polarity;
  invertPolarity?: boolean;
}) {
  const resolvedPolarity: Polarity = polarity ?? (invertPolarity ? 'inverted' : 'normal');

  return (
    <div className="stat-card flex min-w-0 flex-col rounded-xl border border-(--border) bg-(--surface) p-5">
      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-(--foreground-muted)">
        {label}
        {source ? (
          <span className="rounded bg-(--surface-muted) px-1.5 py-0.5 text-xs font-normal">
            {source}
          </span>
        ) : null}
        {hint ? <InfoHint label={label}>{hint}</InfoHint> : null}
      </p>
      <p
        className={
          size === 'sm'
            ? 'mt-2 text-lg leading-7 font-semibold text-(--foreground)'
            : 'tabular mt-2 font-mono text-[1.75rem] leading-9 font-medium tracking-tight text-(--foreground)'
        }
      >
        {value}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        {delta ? (
          <>
            <TrendBadge delta={delta} polarity={resolvedPolarity} />
            <span className="text-xs text-(--meta)">vs tour précédent</span>
          </>
        ) : (
          <span className="text-sm text-(--meta)">{note ?? 'Premier tour — pas de comparaison'}</span>
        )}
      </div>

      {trend && trend.length > 1 ? (
        <Sparkline values={trend} className="mt-4" label={`Trajectoire : ${label}`} />
      ) : null}
    </div>
  );
}

export function TrendBadge({
  delta,
  polarity = 'normal',
}: {
  delta: Delta;
  polarity?: Polarity;
}) {
  const favourable =
    delta.direction === 'flat' || polarity === 'neutral'
      ? null
      : polarity === 'inverted'
        ? delta.direction === 'down'
        : delta.direction === 'up';

  const tone =
    favourable === null
      ? 'bg-(--surface-muted) text-(--foreground-muted) ring-1 ring-(--border) ring-inset'
      : favourable
        ? 'bg-(--positive-subtle) text-(--positive)'
        : 'bg-(--negative-subtle) text-(--negative)';

  const Icon = delta.direction === 'up' ? ArrowUp : delta.direction === 'down' ? ArrowDown : Equal;
  // `delta.label` porte déjà « ↑ + » : l'icône le remplace, le signe reste.
  const text =
    delta.direction === 'flat' ? 'inchangé' : delta.label.replace(/^[↑↓]\s*/, '');

  return (
    <span
      className={`tabular inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-sm font-medium ${tone}`}
    >
      <Icon aria-hidden className="h-3.5 w-3.5" strokeWidth={2.5} />
      {text}
    </span>
  );
}
