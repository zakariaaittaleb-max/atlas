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
          ? `La banque s’arrête à ${formatMadCompact(max)} : montant ramené à ce plafond.`
          : 'La banque ne prête rien en l’état : aucun tirage possible.'
        : raw < min
          ? debt > 0
            ? `Vous ne devez que ${formatMadCompact(debt)} : remboursement ramené à la dette.`
            : 'Vous n’avez aucune dette à rembourser.'
          : null,
    );
    onChange(next);
  }

  const verdict =
    bounded > 0 ? `Vous tirez ${formatMadCompact(bounded)}`
    : bounded < 0 ? `Vous remboursez ${formatMadCompact(-bounded)}`
    : 'Aucun mouvement de dette';

  const bloque = max <= 0;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="flex items-center gap-2">
          <label htmlFor={id} className="text-sm font-medium">Crédit net du tour</label>
          {/* La capacité se détaille à la demande : c'est le chiffre que l'équipe
              contestera, et elle doit pouvoir voir lequel des deux critères la
              bloque — c'est celui-là qu'il faut desserrer. */}
          <InfoHint label="Comment la banque calcule votre capacité">
            <span className="block">
              Deux fois vos fonds propres :{' '}
              <strong className="font-mono">{formatMadCompact(limits.capacityByEquityMad)}</strong>{' '}
              sur {formatMadCompact(limits.equityMad)} de capitaux propres
              {limits.capacityBinding === 'fonds_propres' ? ' — c’est lui qui bloque.' : '.'}
            </span>
            <span className="mt-1 block">
              40 % de votre activité :{' '}
              <strong className="font-mono">{formatMadCompact(limits.capacityByRevenueMad)}</strong>{' '}
              sur {formatMadCompact(limits.lastRevenueMad)} de chiffre d’affaires
              {limits.capacityBinding === 'activite' ? ' — c’est lui qui bloque.' : '.'}
            </span>
            <span className="mt-1 block">
              Encours accepté :{' '}
              <strong className="font-mono">{formatMadCompact(limits.capacityTotalMad)}</strong>, le plus
              contraignant des deux. Déjà utilisé : {debt > 0 ? `−${formatMadCompact(debt)}` : 'rien'}.
            </span>
            <span className="mt-2 block text-(--foreground-muted)">
              {bloque && limits.lastRevenueMad <= 0
                ? 'Sans exercice clos, la banque n’a rien à regarder : votre ligne s’ouvrira après le premier tour résolu.'
                : bloque && limits.equityMad <= 0
                  ? 'Vos fonds propres sont nuls : aucune banque ne prête sans assise. Une levée de capital rouvrirait votre ligne.'
                  : limits.capacityBinding === 'activite'
                    ? 'C’est votre volume d’activité qui fixe le plafond : une ligne de crédit suit le chiffre d’affaires qu’elle finance. Reconquérir des parts de marché l’élargit.'
                    : 'C’est votre assise en fonds propres qui bloque : une levée de capital élargirait directement ce plafond.'}
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

      <div id={`${id}-bornes`} className="tabular flex flex-wrap justify-between gap-3 text-xs text-(--foreground-muted)">
        <span>
          {debt > 0 ? `tout rembourser : ${formatMadCompact(debt)}` : 'aucune dette à rembourser'}
        </span>
        <span>
          {max > 0 ? `capacité restante : ${formatMadCompact(max)}` : 'plus rien à tirer'}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          inputMode="numeric"
          aria-label="Crédit net du tour, en dirhams : positif pour emprunter, négatif pour rembourser"
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
        <span className="text-xs text-(--foreground-muted)">
          positif : vous empruntez · négatif : vous remboursez
        </span>
      </div>
      {clipped ? (
        <p className="mt-1.5 mb-0 text-xs" style={{ color: 'var(--warning)' }}>{clipped}</p>
      ) : null}

    </div>
  );
}
