'use client';

/**
 * Cash pooling : répartir la trésorerie du Groupe entre ses domaines.
 *
 * ── POURQUOI UNE RÉPARTITION, ET NON DES MONTANTS ──────────────────────────
 * L'écran demandait un transfert en dirhams par domaine. « 1,2 Md » ne disait
 * pas si c'était une aumône ou une saignée : il fallait connaître la
 * trésorerie, la taille du domaine, et faire la division de tête. La saisie se
 * fait désormais en PARTS de la trésorerie d'ouverture, sur une barre que
 * l'équipe voit se déformer, et chaque part est doublée de son montant.
 *
 * La référence est la répartition au prorata du chiffre d'affaires. S'en
 * écarter, c'est transférer (voir `lib/cash-allocation.ts`) : les parts
 * somment à 100 %, donc les transferts à zéro, comme le moteur l'exige.
 *
 * ── DÉCIDER EN VOYANT CE QUE VAUT CHAQUE DOMAINE ───────────────────────────
 * Donner à l'étoile, prendre à la vache à lait : l'arbitrage ne se fait pas
 * sans la croissance, le chiffre d'affaires et la marge de chacun. Ils sont
 * affichés sur la ligne même où l'on déplace la part.
 *
 * ── CE QUE LE DOMAINE QUI REÇOIT GAGNE ─────────────────────────────────────
 * Rien, par lui-même. De l'argent ne produit pas de la part de marché : il
 * donne les moyens d'investir. Le domaine qu'on PONCTIONNE, en revanche, paie
 * ses fournisseurs plus tard et le perd en compétitivité.
 */

import { CircleCheck, RotateCcw, TriangleAlert } from 'lucide-react';

import { useDasScope } from '@/components/das-scope';
import { DasDot } from '@/components/ui/das-dot';
import { GroupLegend } from '@/components/ui/form-controls';
import { InfoHint } from '@/components/ui/info-hint';
import {
  moveShare, referenceShares, sharesFromTransfers, transfersFromShares,
} from '@/lib/cash-allocation';
import { dasColor } from '@/lib/das-color';
import { formatSignedPct, toneOf } from '@/lib/das-vitals';
import type { DasEntry } from '@/lib/decision-types';
import { formatMadCompact, formatPct } from '@/lib/format';

type Transfer = { dasId: string; transferMad: number };

const TONE_CLASS = {
  positive: 'text-(--positive)',
  negative: 'text-(--negative)',
} as const;

export function CashPooling({
  das,
  transfers,
  treasuryMad,
  disabled,
  onChange,
}: {
  das: DasEntry[];
  transfers: Transfer[];
  /** Trésorerie d'ouverture du tour : la somme que l'on répartit. */
  treasuryMad: number;
  disabled: boolean;
  onChange: (next: Transfer[]) => void;
}) {
  const { das: options } = useDasScope();
  const vitalsOf = (dasId: string) => options.find((o) => o.dasId === dasId)?.vitals ?? null;

  const baseMad = Math.max(treasuryMad, 0);
  const reference = referenceShares(das.map((d) => vitalsOf(d.dasId)?.weightInGroup ?? null));
  const amounts = das.map((d) => transfers.find((t) => t.dasId === d.dasId)?.transferMad ?? 0);
  const shares = sharesFromTransfers(reference, amounts, baseMad);
  const byRevenue = das.some((d) => (vitalsOf(d.dasId)?.weightInGroup ?? 0) > 0);

  const solde = amounts.reduce((acc, v) => acc + v, 0);
  const balanced = Math.abs(solde) <= 1;
  const movedMad = amounts.reduce((acc, v) => acc + Math.max(v, 0), 0);

  function apply(nextShares: number[]) {
    const next = transfersFromShares(reference, nextShares, baseMad);
    onChange(
      das
        .map((d, i) => ({ dasId: d.dasId, transferMad: next[i] }))
        .filter((t) => t.transferMad !== 0),
    );
  }

  return (
    <fieldset disabled={disabled || baseMad <= 0} className="mt-8 border-t border-(--border) pt-6">
      <GroupLegend title="Répartir la trésorerie entre vos domaines">
        Prendre là où l’argent dort pour le mettre là où il pousse. Un domaine ponctionné paie ses
        fournisseurs plus tard et <strong>perd en compétitivité</strong> ; celui qui reçoit ne
        gagne rien de lui-même — c’est ce que vous en investirez qui produira.
      </GroupLegend>

      {baseMad <= 0 ? (
        <p className="mt-2 text-sm text-(--foreground-muted)">
          Aucune trésorerie d’ouverture à répartir ce tour.
        </p>
      ) : (
        <>
          <p className="tabular mt-1 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
            <span>
              <span className="text-(--foreground-muted)">Trésorerie d’ouverture </span>
              <strong className="font-mono font-semibold">{formatMadCompact(baseMad)}</strong>
            </span>
            <span>
              <span className="text-(--foreground-muted)">Déplacé entre domaines </span>
              <strong className="font-mono font-semibold">{formatMadCompact(movedMad)}</strong>
            </span>
            <InfoHint label="Répartition de référence">
              {byRevenue
                ? 'La référence répartit la trésorerie au prorata du chiffre d’affaires de chaque domaine au dernier exercice clos. '
                : 'Sans chiffre d’affaires encore connu, la référence répartit la trésorerie à parts égales. '}
              S’en écarter déplace de l’argent : ce qu’un domaine reçoit, un autre le cède, et le total
              reste à 100 %.
            </InfoHint>
          </p>

          {/* Les deux barres se lisent l'une contre l'autre : la référence, et
              ce que l'équipe en fait. Les chiffres sont portés par les lignes
              ci-dessous — les barres ne sont qu'une image. */}
          <div aria-hidden className="mt-4 grid grid-cols-[6.5rem_1fr] items-center gap-x-3 gap-y-2 text-sm">
            <span className="text-(--foreground-muted)">Référence</span>
            <AllocationBar das={das} shares={reference} thin />
            <span className="font-medium">Votre choix</span>
            <AllocationBar das={das} shares={shares} />
          </div>

          <ul className="m-0 mt-5 flex list-none flex-col gap-3 p-0">
            {das.map((d, i) => {
              const vitals = vitalsOf(d.dasId);
              const share = shares[i];
              const transfer = amounts[i];
              const sliderId = `repartition-${d.dasId}`;
              const pctId = `repartition-pct-${d.dasId}`;
              const growthTone = toneOf(vitals?.growth);
              const marginTone = vitals?.margin !== null && vitals?.margin !== undefined && vitals.margin < 0
                ? 'negative' : null;

              return (
                <li
                  key={d.dasId}
                  className="grid gap-x-6 gap-y-3 rounded-lg border border-(--border) p-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium">
                      <DasDot seed={d.activityName} />
                      {d.name}
                    </p>
                    <dl className="tabular mt-2 grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <dt className="text-(--foreground-muted)">Chiffre d’affaires</dt>
                        <dd className="font-mono font-semibold">{formatMadCompact(vitals?.revenueMad)}</dd>
                      </div>
                      <div>
                        <dt className="text-(--foreground-muted)">Croissance</dt>
                        <dd className={`font-mono font-semibold ${growthTone ? TONE_CLASS[growthTone] : ''}`}>
                          {formatSignedPct(vitals?.growth)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-(--foreground-muted)">Marge</dt>
                        <dd className={`font-mono font-semibold ${marginTone ? TONE_CLASS[marginTone] : ''}`}>
                          {formatPct(vitals?.margin)}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <label htmlFor={sliderId} className="sr-only">
                        Part de la trésorerie pour {d.name}
                      </label>
                      <input
                        id={sliderId}
                        type="range"
                        min={0}
                        max={100}
                        step={0.5}
                        value={Number((share * 100).toFixed(1))}
                        aria-valuetext={`${formatPct(share)}, ${formatMadCompact(share * baseMad)}`}
                        onChange={(e) => apply(moveShare(shares, i, Number(e.target.value) / 100))}
                        className="min-w-0 flex-1 accent-(--accent)"
                      />
                      <label htmlFor={pctId} className="sr-only">
                        Part de {d.name}, en pourcentage
                      </label>
                      <span className="flex items-center gap-1">
                        <input
                          id={pctId}
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={100}
                          step={0.1}
                          value={Number((share * 100).toFixed(1))}
                          onChange={(e) => {
                            const value = Number(e.target.value);
                            if (Number.isFinite(value)) apply(moveShare(shares, i, value / 100));
                          }}
                          className="tabular w-20 rounded-lg border border-(--border) bg-(--surface) px-2 py-1.5 text-right font-mono text-sm"
                        />
                        <span aria-hidden className="text-sm text-(--foreground-muted)">%</span>
                      </span>
                    </div>

                    <p className="tabular mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
                      <span>
                        <strong className="font-mono font-semibold">{formatMadCompact(share * baseMad)}</strong>
                        <span className="text-(--foreground-muted)"> · référence {formatPct(reference[i])}</span>
                      </span>
                      {transfer > 0 ? (
                        <span className="font-medium text-(--positive)">↑ reçoit {formatMadCompact(transfer)}</span>
                      ) : transfer < 0 ? (
                        <span className="font-medium text-(--warning)">↓ cède {formatMadCompact(-transfer)}</span>
                      ) : (
                        <span className="text-(--foreground-muted)">aucun mouvement</span>
                      )}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p
              className={`tabular flex items-center gap-2 text-sm font-medium ${
                balanced ? 'text-(--foreground-muted)' : 'text-(--negative)'
              }`}
            >
              {balanced ? (
                <CircleCheck aria-hidden className="h-4 w-4" />
              ) : (
                <TriangleAlert aria-hidden className="h-4 w-4" />
              )}
              {balanced
                ? 'Total à 100 % : ce que les uns reçoivent, les autres le cèdent.'
                : `Déséquilibre de ${formatMadCompact(solde)} : déplacez une part pour rééquilibrer.`}
            </p>
            <button
              type="button"
              disabled={transfers.length === 0}
              onClick={() => onChange([])}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-(--border) px-3 text-sm font-medium enabled:hover:border-(--accent) disabled:opacity-40"
            >
              <RotateCcw aria-hidden className="h-4 w-4" />
              Revenir à la référence
            </button>
          </div>
        </>
      )}
    </fieldset>
  );
}

/** Une barre empilée : un segment par domaine, dans sa couleur. */
function AllocationBar({ das, shares, thin = false }: { das: DasEntry[]; shares: number[]; thin?: boolean }) {
  return (
    <div className={`flex w-full overflow-hidden rounded-md bg-(--surface-muted) ${thin ? 'h-2' : 'h-7'}`}>
      {das.map((d, i) => (
        <span
          key={d.dasId}
          className="h-full border-r-2 border-(--surface) last:border-r-0 transition-[width] duration-150 motion-reduce:transition-none"
          style={{ width: `${(shares[i] ?? 0) * 100}%`, background: dasColor(d.activityName).dot, opacity: thin ? 0.55 : 1 }}
        />
      ))}
    </div>
  );
}
