'use client';

/**
 * Un champ chiffré qui se pilote en écart.
 *
 * Trois choses tenues ensemble, et il en faut les trois :
 *
 *   • **le curseur** porte l'intention — « je double », « je coupe » — dans une
 *     fourchette calée sur ce que le poste supporte réellement ;
 *   • **le mot** dit où l'on se trouve dans cette fourchette, ce qu'un
 *     pourcentage seul ne dit pas : +20 % est un maximum sur les salaires et
 *     une broutille sur le marketing ;
 *   • **le montant, saisissable**, garde la décision arbitrable. Sans lui la
 *     barre « engagé ce tour » n'aurait plus de sens, et une équipe ne pourrait
 *     pas départager deux postes qui se disputent la même trésorerie.
 *
 * Les deux voies mènent au même endroit : bouger le curseur recalcule le
 * montant, taper un montant replace le curseur.
 */

import { useState } from 'react';

import { formatMadCompact, formatUnits } from '@/lib/format';
import {
  clampVariation,
  valueFromVariation,
  variationFromValue,
  variationLabel,
  type VariationScale,
} from '@/lib/variation-scale';

export function VariationField({
  label,
  value,
  reference,
  scale,
  onChange,
  disabled,
  hint,
  /** `money` affiche des dirhams, `count` des unités (personnes, volumes). */
  unit = 'money',
  referenceLabel = 'tour précédent',
  unset = false,
}: {
  label: string;
  value: number;
  /** Valeur de référence : le tour précédent, ou la dotation à défaut. */
  reference: number;
  scale: VariationScale;
  onChange: (value: number) => void;
  disabled?: boolean;
  hint?: string;
  unit?: 'money' | 'count';
  referenceLabel?: string;
  /**
   * Vrai quand l'équipe n'a encore rien décidé pour ce tour.
   *
   * Sans cette distinction, un poste à zéro parce qu'on ne l'a pas ouvert
   * s'affichait « Supprimé » — l'écran accusait l'équipe d'avoir coupé un
   * budget auquel elle n'avait pas touché.
   */
  unset?: boolean;
}) {
  // Ce que l'équipe tape, laissé intact tant qu'elle n'a pas quitté le champ :
  // regrouper les chiffres à chaque frappe fait sauter le curseur de saisie.
  const [draft, setDraft] = useState<string | null>(null);

  const rawPct = variationFromValue(reference, value);
  const pct = clampVariation(rawPct, scale.bounds);
  const pristine = unset && value === 0;

  /**
   * Le montant stocké peut sortir de la fourchette — le facilitateur a le droit
   * de resserrer une borne après que les équipes ont décidé. Le dire est la
   * seule option honnête : afficher « +60 % » à côté d'un montant qui vaut
   * +200 % ferait mentir l'étiquette sur le chiffre posé juste en dessous.
   * Le clamp serveur ramènera la valeur dans la fourchette au prochain envoi.
   */
  const outOfRange = !pristine && Math.abs(rawPct - pct) > 0.5;

  const word = pristine
    ? 'Non renseigné'
    : outOfRange
      ? 'Hors fourchette'
      : variationLabel(pct, scale);
  const format = unit === 'money' ? formatMadCompact : formatUnits;
  const floor = Math.max(scale.bounds.min, -100);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-sm font-medium">{label}</span>
        <span
          className="tabular text-sm"
          style={{
            color: pristine
              ? 'var(--foreground-muted)'
              : outOfRange
                ? 'var(--warning)'
                : colourOf(pct),
          }}
        >
          {word}
          {!pristine && Math.abs(outOfRange ? rawPct : pct) >= 1 ? (
            <span className="ml-1.5 text-(--foreground-muted)">
              {(outOfRange ? rawPct : pct) > 0 ? '+' : '−'}
              {Math.abs(Math.round(outOfRange ? rawPct : pct))} %
            </span>
          ) : null}
        </span>
      </div>

      <input
        type="range"
        min={floor}
        max={scale.bounds.max}
        step={1}
        value={Math.round(pct)}
        disabled={disabled}
        aria-label={`${label} — écart par rapport au ${referenceLabel}`}
        onChange={(event) =>
          onChange(valueFromVariation(reference, Number(event.target.value)))
        }
        className="mt-2 w-full"
      />

      <div className="tabular mt-1 flex justify-between text-xs text-(--foreground-muted)">
        <span>
          {floor <= -100 ? 'supprimé' : `${floor} %`}
        </span>
        <span>{referenceLabel} : {format(reference)}</span>
        <span>+{scale.bounds.max} %</span>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <input
          type="text"
          inputMode="numeric"
          disabled={disabled}
          value={draft ?? formatUnits(value)}
          onFocus={() => setDraft(value === 0 ? '' : String(Math.round(value)))}
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/g, '');
            setDraft(digits);
            // Le montant tapé est ramené dans la fourchette, sinon la saisie
            // libre contournerait les bornes que le facilitateur a posées.
            const asked = Number(digits);
            const bounded = clampVariation(
              variationFromValue(reference, asked),
              scale.bounds,
            );
            onChange(reference > 0 ? valueFromVariation(reference, bounded) : asked);
          }}
          onBlur={() => setDraft(null)}
          className="tabular w-40 rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-sm disabled:opacity-50"
        />
        <span className="text-xs text-(--foreground-muted)">
          {unit === 'money' ? 'DH' : 'unités'}
          {unit === 'money' && value > 0 ? ` · ${formatMadCompact(value)}` : ''}
        </span>
      </div>

      {outOfRange ? (
        <p className="mt-1 text-xs" style={{ color: 'var(--warning)' }}>
          Votre animateur a resserré la fourchette depuis votre saisie. Ce montant sera
          ramené à {format(valueFromVariation(reference, pct))} au prochain enregistrement.
        </p>
      ) : null}

      {hint ? <p className="mt-1 text-xs text-(--foreground-muted)">{hint}</p> : null}
    </div>
  );
}

/**
 * La couleur ne porte JAMAIS l'information seule — le mot est toujours là.
 * Elle sert à repérer d'un coup d'œil, sur un écran parcouru en vingt minutes,
 * les postes qu'on vient de couper.
 */
function colourOf(pct: number): string | undefined {
  if (pct <= -50) return 'var(--negative)';
  if (pct >= 50) return 'var(--positive)';
  return undefined;
}
