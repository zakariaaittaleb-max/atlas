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
 *
 * À l'ouverture de tout tour, le curseur est posé sur « Inchangé » : la valeur
 * héritée, même nulle. Depuis zéro, il ne descend pas — il n'y a rien à
 * baisser — et « +100 % » rend la dotation (voir `referenceOf`).
 */

import { useState } from 'react';

import { InfoHint } from '@/components/ui/info-hint';
import { formatMadCompact, formatUnits } from '@/lib/format';

import { useT } from '@/components/i18n-provider';
import type { MessageKey } from '@/lib/i18n/messages';
import {
  clampVariation,
  floorOf,
  valueFromVariation,
  variationFromValue,
  variationLabel,
  type VariationReference,
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
  referenceLabel: referenceLabelProp,
  unset = false,
}: {
  label: string;
  value: number;
  /** La valeur héritée et l'unité du pourcentage (voir `referenceOf`). */
  reference: VariationReference;
  scale: VariationScale;
  onChange: (value: number) => void;
  disabled?: boolean;
  hint?: string;
  unit?: 'money' | 'count';
  referenceLabel?: string;
  /**
   * Vrai quand l'équipe n'a encore rien décidé pour ce tour : la valeur
   * affichée est alors la valeur reconduite, et le mot le dit.
   */
  unset?: boolean;
}) {
  // Ce que l'équipe tape, laissé intact tant qu'elle n'a pas quitté le champ :
  // regrouper les chiffres à chaque frappe fait sauter le curseur de saisie.
  const [draft, setDraft] = useState<string | null>(null);
  const t = useT();
  const referenceLabel = referenceLabelProp ?? t('variation.previousRound');

  const rawPct = variationFromValue(reference, value);
  const pct = clampVariation(rawPct, scale.bounds, reference);
  // « Non renseigné » a disparu : un poste auquel on n'a pas touché est un
  // poste INCHANGÉ, et c'est désormais ce que le curseur montre à l'ouverture.
  const pristine = unset && Math.abs(rawPct) < 0.5;

  /**
   * Le montant stocké peut sortir de la fourchette — le facilitateur a le droit
   * de resserrer une borne après que les équipes ont décidé. Le dire est la
   * seule option honnête : afficher « +60 % » à côté d'un montant qui vaut
   * +200 % ferait mentir l'étiquette sur le chiffre posé juste en dessous.
   * Le clamp serveur ramènera la valeur dans la fourchette au prochain envoi.
   */
  const outOfRange = !pristine && Math.abs(rawPct - pct) > 0.5;

  const scaleWord = variationLabel(pct, scale);
  const word = outOfRange
    ? t('variation.outOfRange')
    : VARIATION_WORDS[scaleWord] ? t(VARIATION_WORDS[scaleWord]) : scaleWord;
  const format = unit === 'money' ? formatMadCompact : formatUnits;
  const floor = floorOf(reference, scale.bounds);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="flex items-center gap-2 text-sm font-medium">
          {label}
          {hint ? <InfoHint label={label}>{hint}</InfoHint> : null}
        </span>
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
          {pristine ? <span className="ms-1.5 text-(--foreground-muted)">{t('variation.carried')}</span> : null}
          {!pristine && Math.abs(outOfRange ? rawPct : pct) >= 1 ? (
            <span className="ms-1.5 text-(--foreground-muted)">
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
        aria-label={t('variation.sliderAria', { label, reference: referenceLabel })}
        onChange={(event) =>
          onChange(valueFromVariation(reference, Number(event.target.value)))
        }
        className="mt-2 w-full"
      />

      <div className="tabular mt-1 flex justify-between text-sm text-(--foreground-muted)">
        <span>
          {floor <= -100 ? t('variation.removedShort') : floor === 0 ? '0 %' : `${floor} %`}
        </span>
        <span>
          {referenceLabel} : {format(reference.anchor)}
          {reference.anchor === 0 && reference.unit > 0
            ? ` · +100 % = ${format(reference.unit)}`
            : ''}
        </span>
        <span>+{scale.bounds.max} %</span>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <input
          type="text"
          inputMode="numeric"
          aria-label={t('variation.amountAria', { label, unit: unit === 'money' ? t('variation.dirhams') : t('variation.units') })}
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
              reference,
            );
            onChange(reference.unit > 0 ? valueFromVariation(reference, bounded) : asked);
          }}
          onBlur={() => setDraft(null)}
          className="tabular w-40 rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-sm disabled:opacity-50"
        />
        <span className="text-sm text-(--foreground-muted)">
          {unit === 'money' ? 'DH' : t('variation.units')}
          {unit === 'money' && value > 0 ? ` · ${formatMadCompact(value)}` : ''}
        </span>
      </div>

      {outOfRange ? (
        <p className="mt-1 text-sm" style={{ color: 'var(--warning)' }}>
          {t('variation.narrowed', { amount: format(valueFromVariation(reference, pct)) })}
        </p>
      ) : null}

    </div>
  );
}

/** Les mots de l'échelle de variation, dans la langue du participant. */
const VARIATION_WORDS: Record<string, MessageKey> = {
  'Supprimé': 'variation.removed',
  'Inchangé': 'variation.flat',
  'Faible baisse': 'variation.smallDown',
  'Baisse moyenne': 'variation.midDown',
  'Forte baisse': 'variation.bigDown',
  'Très forte baisse': 'variation.veryBigDown',
  'Baisse maximale': 'variation.maxDown',
  'Faible hausse': 'variation.smallUp',
  'Hausse moyenne': 'variation.midUp',
  'Forte hausse': 'variation.bigUp',
  'Très forte hausse': 'variation.veryBigUp',
  'Hausse maximale': 'variation.maxUp',
};

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
