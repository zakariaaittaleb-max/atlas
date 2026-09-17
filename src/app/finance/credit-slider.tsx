'use client';

/**
 * Le crédit du tour, en UN seul curseur — et un champ pour le chiffre exact.
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
 *
 * ── POURQUOI UN CHAMP EN PLUS DU CURSEUR ───────────────────────────────────
 * Sur une amplitude de plusieurs dizaines de milliards, un pas de curseur vaut
 * des centaines de millions : impossible d'emprunter exactement ce que le plan
 * exige. Et quand la banque ne prête rien, un curseur immobile ne dit pas
 * POURQUOI. Le champ accepte n'importe quel montant, le ramène dans les bornes,
 * et dit laquelle il a heurtée.
 */

import { useId, useState } from 'react';

import { useT } from '@/components/i18n-provider';
import { InfoHint } from '@/components/ui/info-hint';
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
  const t = useT();
  // Planchers à zéro : une dette ou une capacité négative inversait les bornes
  // — la gauche passait au-dessus de la droite — et figeait le curseur.
  const debt = Math.max(limits.debtOutstandingMad, 0);
  const min = -debt;
  const max = Math.max(limits.capacityAvailableMad, 0);

  // Ce que l'équipe est en train de taper, tant qu'elle n'a pas quitté le
  // champ : « - » ou « 12 » ne sont pas encore des montants à reformater.
  const [draft, setDraft] = useState<string | null>(null);
  // La borne heurtée par la dernière saisie, dite en clair.
  const [clipped, setClipped] = useState<string | null>(null);

  // Pas de curseur : un centième de l'amplitude, arrondi au million, pour que
  // le geste reste lisible sur des montants de l'ordre du milliard.
  const span = Math.max(max - min, 1);
  const step = Math.max(Math.round(span / 100 / 1_000_000) * 1_000_000, 1_000_000);
  const bounded = Math.min(Math.max(value, min), max);

  function commit(raw: number) {
    const next = Math.min(Math.max(raw, min), max);
    setClipped(
      raw > max
        ? max > 0
          ? t('credit.bankCap', { amount: formatMadCompact(max) })
          : t('credit.bankNothing')
        : raw < min
          ? debt > 0
            ? t('credit.debtCap', { amount: formatMadCompact(debt) })
            : t('credit.noDebt')
          : null,
    );
    onChange(next);
  }

  const verdict =
    bounded > 0 ? t('credit.draw', { amount: formatMadCompact(bounded) })
    : bounded < 0 ? t('credit.repay', { amount: formatMadCompact(-bounded) })
    : t('credit.none');

  const bloque = max <= 0;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="flex items-center gap-2">
          <label htmlFor={id} className="text-sm font-medium">{t('credit.label')}</label>
          {/* La capacité se détaille à la demande : c'est le chiffre que l'équipe
              contestera, et elle doit pouvoir voir lequel des deux critères la
              bloque — c'est celui-là qu'il faut desserrer. */}
          <InfoHint label={t('credit.hintTitle')}>
            <span className="block">
              {t('credit.byEquity')}{' '}
              <strong className="font-mono">{formatMadCompact(limits.capacityByEquityMad)}</strong>{' '}
              {t('credit.onEquity', { amount: formatMadCompact(limits.equityMad) })}
              {limits.capacityBinding === 'fonds_propres' ? t('credit.binding') : '.'}
            </span>
            <span className="mt-1 block">
              {t('credit.byRevenue')}{' '}
              <strong className="font-mono">{formatMadCompact(limits.capacityByRevenueMad)}</strong>{' '}
              {t('credit.onRevenue', { amount: formatMadCompact(limits.lastRevenueMad) })}
              {limits.capacityBinding === 'activite' ? t('credit.binding') : '.'}
            </span>
            <span className="mt-1 block">
              {t('credit.accepted')}{' '}
              <strong className="font-mono">{formatMadCompact(limits.capacityTotalMad)}</strong>
              {t('credit.acceptedTail', { used: debt > 0 ? `−${formatMadCompact(debt)}` : t('credit.nothing') })}
            </span>
            <span className="mt-2 block text-(--foreground-muted)">
              {bloque && limits.lastRevenueMad <= 0
                ? t('credit.noYear')
                : bloque && limits.equityMad <= 0
                  ? t('credit.noEquity')
                  : limits.capacityBinding === 'activite'
                    ? t('credit.revenueBinds')
                    : t('credit.equityBinds')}
            </span>
          </InfoHint>
        </span>
        <span
          className="tabular text-sm font-medium"
          style={{
            color: bounded > 0 ? 'var(--warning)' : bounded < 0 ? 'var(--positive)' : undefined,
          }}
        >
          {verdict}
        </span>
      </div>

      <input
        id={id}
        type="range"
        min={min}
        max={max}
        // `any`, puis arrondi au pas COMPTÉ DEPUIS ZÉRO : un pas natif se compte
        // depuis la borne basse, qui n'est jamais un multiple rond. La poignée
        // se posait alors à +169 M pendant que la décision valait zéro, et
        // aucune position du curseur ne ramenait exactement à zéro.
        step="any"
        value={bounded}
        disabled={disabled || max - min <= 0}
        onChange={(e) => {
          setDraft(null);
          const raw = Number(e.target.value);
          // Les bornes restent atteignables : « tout rembourser » et « tirer
          // toute la capacité » ne tombent pas sur la grille.
          const snapped =
            raw <= min + step / 2 ? min
            : raw >= max - step / 2 ? max
            : Math.round(raw / step) * step;
          commit(snapped);
        }}
        className="mt-2 w-full accent-(--accent)"
        aria-describedby={`${id}-bornes`}
      />

      <div id={`${id}-bornes`} className="tabular flex flex-wrap justify-between gap-3 text-sm text-(--foreground-muted)">
        <span>
          {debt > 0 ? t('credit.repayAll', { amount: formatMadCompact(debt) }) : t('credit.noDebtLower')}
        </span>
        <span>
          {max > 0 ? t('credit.remaining', { amount: formatMadCompact(max) }) : t('credit.nothingLeft')}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          inputMode="numeric"
          aria-label={t('credit.inputAria')}
          disabled={disabled}
          value={draft ?? (bounded === 0 ? '' : String(Math.round(bounded)))}
          onChange={(e) => {
            // Des chiffres, et un signe moins en tête seulement.
            const cleaned = e.target.value.replace(/[^0-9-]/g, '').replace(/(?!^)-/g, '');
            setDraft(cleaned);
            if (cleaned === '' || cleaned === '-') {
              setClipped(null);
              onChange(0);
              return;
            }
            commit(Number(cleaned));
          }}
          onBlur={() => setDraft(null)}
          placeholder="0"
          className="tabular w-48 rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-sm"
        />
        <span className="text-sm text-(--foreground-muted)">DH</span>
        <span className="text-sm text-(--foreground-muted)">
          {t('credit.signHint')}
        </span>
      </div>
      {clipped ? (
        <p className="mt-1.5 mb-0 text-sm" style={{ color: 'var(--warning)' }}>{clipped}</p>
      ) : null}

    </div>
  );
}
