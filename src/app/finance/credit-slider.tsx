'use client';

/**
 * Le crédit du tour, en UN seul curseur.
 *
 * ── POURQUOI UN SEUL ───────────────────────────────────────────────────────
 * L'écran demandait deux montants : « crédit que vous prenez » et « crédit que
 * vous remboursez ». Rien n'empêchait de saisir les deux, et il fallait alors
 * deviner ce que l'équipe voulait dire. Or il n'y a qu'une décision : de quel
 * côté on pousse la dette, cette année.
 *
 * ── LES DEUX BORNES SONT DES FAITS, PAS DES RÉGLAGES ───────────────────────
 * À gauche, on ne peut pas rembourser plus qu'on ne doit. À droite, la banque
 * s'arrête à la capacité d'endettement — le plus contraignant du gearing et de
 * la capacité de remboursement. Le curseur ne peut donc pas proposer un geste
 * que le serveur refuserait : c'est la même fonction qui borne les deux.
 */

import { useId } from 'react';

import { formatMadCompact } from '@/lib/format';
import type { FinanceLimits } from '@/lib/decision-types';

export function CreditSlider({
  value,
  limits,
  disabled,
  onChange,
}: {
  /** Crédit net : positif on tire, négatif on rembourse. */
  value: number;
  limits: FinanceLimits;
  disabled: boolean;
  onChange: (next: number) => void;
}) {
  const id = useId();
  const min = -limits.debtOutstandingMad;
  const max = limits.capacityAvailableMad;

  // Pas de curseur : un centième de l'amplitude, arrondi au million, pour que
  // le geste reste lisible sur des montants de l'ordre du milliard.
  const span = Math.max(max - min, 1);
  const step = Math.max(Math.round(span / 100 / 1_000_000) * 1_000_000, 1_000_000);

  const verdict =
    value > 0 ? `Vous tirez ${formatMadCompact(value)}`
    : value < 0 ? `Vous remboursez ${formatMadCompact(-value)}`
    : 'Aucun mouvement de dette';

  const bloque = max <= 0;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">Crédit net du tour</label>
        <span
          className="tabular text-sm font-medium"
          style={{
            color: value > 0 ? 'var(--warning)' : value < 0 ? 'var(--positive)' : undefined,
          }}
        >
          {verdict}
        </span>
      </div>

      <input
        id={id}
        type="range"
        min={min}
        max={Math.max(max, 0)}
        step={step}
        value={Math.min(Math.max(value, min), Math.max(max, 0))}
        disabled={disabled || (min === 0 && max <= 0)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full"
        aria-describedby={`${id}-bornes`}
      />

      <div id={`${id}-bornes`} className="tabular flex flex-wrap justify-between gap-3 text-xs text-(--foreground-muted)">
        <span>
          {limits.debtOutstandingMad > 0
            ? `tout rembourser : ${formatMadCompact(limits.debtOutstandingMad)}`
            : 'aucune dette à rembourser'}
        </span>
        <span>
          {max > 0 ? `capacité restante : ${formatMadCompact(max)}` : 'plus rien à tirer'}
        </span>
      </div>

      {/* La capacité se détaille à la demande : c'est le chiffre que l'équipe
          contestera, et elle doit pouvoir voir lequel des deux critères la
          bloque — c'est celui-là qu'il faut desserrer. */}
      <details className="mt-3">
        <summary className="cursor-pointer text-sm text-(--foreground-muted)">
          + Comment la banque calcule votre capacité
        </summary>
        <dl className="tabular mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
          <dt className={limits.capacityBinding === 'fonds_propres' ? 'font-semibold' : ''}>
            Deux fois vos fonds propres
          </dt>
          <dd className="m-0">
            {formatMadCompact(limits.capacityByEquityMad)}
            <span className="ml-2 text-(--foreground-muted)">
              sur {formatMadCompact(limits.equityMad)} de capitaux propres
            </span>
          </dd>

          <dt className={limits.capacityBinding === 'activite' ? 'font-semibold' : ''}>
            40 % de votre activité
          </dt>
          <dd className="m-0">
            {formatMadCompact(limits.capacityByRevenueMad)}
            <span className="ml-2 text-(--foreground-muted)">
              sur {formatMadCompact(limits.lastRevenueMad)} de chiffre d’affaires
            </span>
          </dd>

          <dt className="font-semibold">Encours accepté</dt>
          <dd className="m-0">
            {formatMadCompact(limits.capacityTotalMad)}
            <span className="ml-2 text-(--foreground-muted)">le plus contraignant des deux</span>
          </dd>

          <dt>Déjà utilisé</dt>
          <dd className="m-0">−{formatMadCompact(limits.debtOutstandingMad)}</dd>
        </dl>

        <p className="mt-3 text-sm text-(--foreground-muted)">
          {bloque && limits.lastRevenueMad <= 0
            ? 'Sans exercice clos, la banque n’a rien à regarder : votre ligne s’ouvrira après le premier tour résolu.'
            : limits.capacityBinding === 'activite'
              ? 'C’est votre volume d’activité qui fixe le plafond : une ligne de crédit suit le chiffre d’affaires qu’elle finance. Reconquérir des parts de marché l’élargit.'
              : 'C’est votre assise en fonds propres qui bloque : une levée de capital élargirait directement ce plafond.'}
        </p>
      </details>
    </div>
  );
}
