'use client';

/**
 * ATLAS — lecture de gestion, par DAS et pour le Groupe.
 *
 * ── LE PARTI PRIS, ET SON REVIREMENT ───────────────────────────────────────
 * Le public n'est pas financier. On en avait tiré la conclusion inverse de la
 * bonne : remplacer chaque terme par une paraphrase — « ce que tout cela a
 * coûté » pour les charges d'exploitation, « ce que votre outil rapporte »
 * pour la rentabilité économique.
 *
 * L'intention était juste, le résultat contraire à l'objectif :
 *
 *   • une paraphrase NE S'APPREND PAS. Une équipe ayant joué six tours sur
 *     « ce qui reste une fois tout payé » ne sait toujours pas lire un compte
 *     de résultat — et c'est pourtant l'objet du jeu ;
 *   • elle NE SE CHERCHE PAS : introuvable dans un manuel, indicible en
 *     soutenance, incomparable à ce qu'un enseignant écrit au tableau ;
 *   • elle est AMBIGUË. « Ce que votre argent coûte » désigne aussi bien le
 *     coût de la dette que le coût moyen pondéré du capital — deux notions
 *     distinctes, dont l'une est au programme.
 *
 * L'écran affiche donc le TERME EXACT, et l'explication vient au survol : une
 * définition en une phrase, puis un exemple chiffré. On apprend le vocabulaire
 * en le lisant, sans jamais rester bloqué devant. Le glossaire vit dans
 * `lib/glossary.ts`, hors de cette vue, pour être testable et réutilisable.
 *
 * Les phrases d'interprétation — celles qui commentent un ratio plutôt que de
 * le nommer — viennent toujours du moteur (`indicators.ts`) et non de la vue,
 * pour qu'un export Excel dise exactement la même chose. Elles sont rangées
 * sous les « + » ; l'état qu'elles commentent (levier favorable ou non) reste
 * visible.
 *
 * ── L'HONNÊTETÉ DU LIBELLÉ ─────────────────────────────────────────────────
 * La marge affichée PAR DAS est une marge d'exploitation : elle ignore les
 * charges de siège, l'impôt et les intérêts, qui ne se calculent qu'au niveau
 * du groupe. L'écrire est indispensable — sans cela, une équipe lirait 43 % au
 * niveau d'un DAS, 6 % au niveau du groupe, et conclurait à un bug.
 */

import { Term } from '@/components/term';
import { GroupLegend } from '@/components/ui/form-controls';
import { InfoHint } from '@/components/ui/info-hint';
import { formatMadCompact } from '@/lib/format';
import type { ResultsContext } from '@/lib/results-types';

export function ResultsSection({ results }: { results: ResultsContext }) {
  if (results.roundNumber === null || results.group === null) {
    return (
      <p className="text-sm text-(--foreground-muted)">
        Aucun exercice n’est encore clos. Vos résultats apparaîtront ici dès la première
        publication.
      </p>
    );
  }

  const g = results.group;

  return (
    <div className="space-y-8">
      {/* ── Groupe ─────────────────────────────────────────────────────── */}
      <div>
        <GroupLegend as="p" title={`Le Groupe — exercice ${results.roundNumber}`}>
          {g.marginNote}
        </GroupLegend>
        <dl className="tabular grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Figure term="Chiffre d'affaires" value={formatMadCompact(g.revenueMad)} />
          <Figure
            term="Charges d'exploitation"
            value={formatMadCompact(g.totalCostsMad)}
            note={`${g.profitMarginPct >= 0 ? '' : '−'}${Math.abs(100 - g.profitMarginPct).toFixed(0)} DH de coûts pour 100 DH vendus.`}
          />
          <Figure
            term="Résultat net"
            value={formatMadCompact(g.netIncomeMad)}
            tone={g.netIncomeMad >= 0 ? 'positive' : 'negative'}
          />
          <Figure
            term="Flux de trésorerie d'exploitation"
            value={formatMadCompact(g.cashGeneratedMad)}
            tone={g.cashGeneratedMad >= 0 ? 'positive' : 'negative'}
            note="Le résultat, moins ce que vous avez réinvesti."
          />
        </dl>
      </div>

      {/* ── Crédit et levier ───────────────────────────────────────────── */}
      <div>
        <GroupLegend as="p" title="Votre crédit" />
        <dl className="tabular grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Figure term="Dette financière" value={formatMadCompact(g.debtOutstandingMad)} />
          <Figure
            term="Ratio d'endettement"
            value={`${g.debtRatioPct.toFixed(0)} %`}
            note="Dette rapportée à l’argent de vos actionnaires."
          />
          <Figure term="Coût de la dette" value={`${g.costOfDebtPct.toFixed(1)} %`} />
          <Figure
            term="Rentabilité économique"
            value={`${g.returnOnAssetsPct.toFixed(1)} %`}
            tone={g.leverageFavourable ? 'positive' : 'negative'}
          />
        </dl>

        <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              g.leverageFavourable
                ? 'bg-(--positive-subtle) text-(--positive)'
                : 'bg-(--negative-subtle) text-(--negative)'
            }`}
          >
            {g.leverageFavourable ? '↑ Effet de levier favorable' : '↓ Effet de levier défavorable'}
          </span>
          <InfoHint label="Effet de levier">{g.leverageNote}</InfoHint>
        </p>
      </div>

      {/* ── Par domaine d'activité ─────────────────────────────────────── */}
      {results.das.length > 0 ? (
        <div>
          <GroupLegend as="p" title={`Domaine par domaine (${results.das.length})`}>
            Ces marges sont calculées <strong>avant</strong> les charges de siège, l’impôt et les
            intérêts — qui ne se répartissent qu’au niveau du Groupe. Elles servent à comparer vos
            domaines entre eux, pas à mesurer votre bénéfice.
          </GroupLegend>

          <div className="min-w-0 overflow-x-auto rounded-lg border border-(--border)">
            <table className="tabular w-full min-w-[46rem] border-collapse text-sm">
              <thead>
                <tr className="bg-(--surface-muted) text-left text-xs text-(--foreground-muted)">
                  <th className="px-3 py-2 font-semibold">Domaine</th>
                  <th className="px-3 py-2 font-semibold"><Term>Chiffre d’affaires</Term></th>
                  <th className="px-3 py-2 font-semibold"><Term>Charges d’exploitation</Term></th>
                  <th className="px-3 py-2 font-semibold"><Term>Marge d’exploitation</Term></th>
                  <th className="px-3 py-2 font-semibold"><Term>Rentabilité économique</Term></th>
                  <th className="px-3 py-2 font-semibold"><Term>Flux de trésorerie d’exploitation</Term></th>
                  <th className="px-3 py-2 font-semibold">Seuil de rentabilité</th>
                </tr>
              </thead>
              <tbody>
                {results.das.map((d) => (
                  <tr key={d.dasId} className="border-t border-(--border)">
                    <td className="px-3 py-2.5 font-medium">{d.dasName}</td>
                    <td className="px-3 py-2.5 font-mono">{formatMadCompact(d.revenueMad)}</td>
                    <td className="px-3 py-2.5 font-mono">{formatMadCompact(d.totalCostsMad)}</td>
                    <td className={`px-3 py-2.5 font-mono ${d.profitMarginPct < 0 ? 'text-(--negative)' : ''}`}>
                      {d.profitMarginPct.toFixed(1)} %
                    </td>
                    <td className="px-3 py-2.5 font-mono">{d.roiPct.toFixed(1)} %</td>
                    <td className={`px-3 py-2.5 font-mono ${d.cashGeneratedMad < 0 ? 'text-(--negative)' : ''}`}>
                      {formatMadCompact(d.cashGeneratedMad)}
                    </td>
                    <td className="px-3 py-2.5">
                      {d.breakEvenUnits === null ? (
                        <span className="text-(--negative)">aucun — chaque vente perd de l’argent</span>
                      ) : (
                        <>
                          <span className="font-mono">{Math.round(d.breakEvenUnits).toLocaleString('fr-FR')} u.</span>
                          {d.volumeSold > 0 ? (
                            <span className="text-(--foreground-muted)">
                              {' '}· vendu {Math.round(d.volumeSold).toLocaleString('fr-FR')}
                            </span>
                          ) : null}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Figure({
  term, value, note, tone,
}: {
  term: string;
  value: string;
  note?: string;
  tone?: 'positive' | 'negative';
}) {
  return (
    <div className="rounded-lg bg-(--surface-muted) px-3 py-2.5">
      <dt className="flex items-center gap-1.5 text-xs text-(--foreground-muted)">
        <Term>{term}</Term>
        {note ? <InfoHint label={term}>{note}</InfoHint> : null}
      </dt>
      <dd
        className={`mt-0.5 font-mono text-lg font-semibold ${
          tone === 'negative' ? 'text-(--negative)' : tone === 'positive' ? 'text-(--positive)' : ''
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
