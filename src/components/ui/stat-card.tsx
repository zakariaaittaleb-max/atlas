import { ArrowDown, ArrowUp, Equal } from 'lucide-react';

import { useT } from '@/components/i18n-provider';
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
  benchmark,
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
  /** Repère de comparaison au pool, affiché sous la variation. */
  benchmark?: string;
  /** `sm` pour une valeur en mots plutôt qu'en chiffres. */
  size?: 'md' | 'sm';
  polarity?: Polarity;
  invertPolarity?: boolean;
}) {
  const t = useT();
  const resolvedPolarity: Polarity = polarity ?? (invertPolarity ? 'inverted' : 'normal');

  return (
    // Trois rangées partagées avec les cartes voisines (`subgrid`) : quel que
    // soit le nombre de lignes d'un libellé, toutes les valeurs d'une rangée
    // tombent sur la même ligne. La carte est un conteneur de requête : le
    // chiffre se resserre avec la largeur de la carte plutôt que de déborder.
    <div className="stat-card @container row-span-3 grid min-w-0 [grid-template-rows:subgrid] content-start gap-y-2 rounded-xl border border-(--border) bg-(--surface) p-5">
      {/* Deux lignes réservées : sans `subgrid`, un libellé court ne remonte pas son chiffre. */}
      <p className="min-h-[2lh] text-sm font-medium text-(--foreground-muted)">
        <LabelWithHint label={label} hint={hint} />
        {source ? (
          <span className="ms-2 inline-block rounded bg-(--surface-muted) px-1.5 py-0.5 align-middle text-xs font-normal">
            {source}
          </span>
        ) : null}
      </p>
      <p
        className={
          size === 'sm'
            ? 'self-start text-lg leading-7 font-semibold text-(--foreground)'
            : 'tabular self-start font-mono text-[clamp(0.875rem,14cqi,1.75rem)] leading-[1.25] font-medium tracking-tight text-(--foreground)'
        }
      >
        {value}
      </p>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {delta ? (
            <>
              <TrendBadge delta={delta} polarity={resolvedPolarity} />
              <span className="text-xs text-(--meta)">{t('stat.vsPrevious')}</span>
            </>
          ) : (
            <span className="text-sm text-(--meta)">{note ?? t('stat.firstRound')}</span>
          )}
        </div>
        {benchmark ? <p className="tabular mt-1 text-sm text-(--meta)">{benchmark}</p> : null}

        {trend && trend.length > 1 ? (
          <Sparkline values={trend} className="mt-4" label={t('stat.trend', { label })} />
        ) : null}
      </div>
    </div>
  );
}

/**
 * Le « + » reste accroché au dernier mot du libellé : seul en début de ligne,
 * il ajoutait une rangée à la carte et décalait son chiffre.
 */
function LabelWithHint({ label, hint }: { label: string; hint?: React.ReactNode }) {
  if (!hint) return <>{label}</>;
  const cut = label.lastIndexOf(' ');
  return (
    <>
      {cut > 0 ? label.slice(0, cut + 1) : null}
      <span className="whitespace-nowrap">
        {cut > 0 ? label.slice(cut + 1) : label}
        <InfoHint label={label} className="ms-2">{hint}</InfoHint>
      </span>
    </>
  );
}

export function TrendBadge({
  delta,
  polarity = 'normal',
}: {
  delta: Delta;
  polarity?: Polarity;
}) {
  const t = useT();
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
    delta.direction === 'flat' ? t('stat.unchanged') : delta.label.replace(/^[↑↓]\s*/, '');

  return (
    <span
      className={`tabular inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-sm font-medium ${tone}`}
    >
      <Icon aria-hidden className="h-3.5 w-3.5" strokeWidth={2.5} />
      {text}
    </span>
  );
}
