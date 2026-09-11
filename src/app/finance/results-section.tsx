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
 * pour qu'un export Excel dise exactement la même chose.
 *
 * ── L'HONNÊTETÉ DU LIBELLÉ ─────────────────────────────────────────────────
 * La marge affichée PAR DAS est une marge d'exploitation : elle ignore les
 * charges de siège, l'impôt et les intérêts, qui ne se calculent qu'au niveau
 * du groupe. L'écrire est indispensable — sans cela, une équipe lirait 43 % au
 * niveau d'un DAS, 6 % au niveau du groupe, et conclurait à un bug.
 */

import { Term } from '@/components/term';
import { formatMadCompact } from '@/lib/format';
import type { ResultsContext } from '@/lib/results-types';

export function ResultsSection({ results }: { results: ResultsContext }) {
  if (results.roundNumber === null || results.group === null) {
    return (
      <section className="mt-8 rounded-xl border border-(--border) bg-(--surface) p-6">
        <h2 className="text-xl font-medium">Vos résultats</h2>
        <p className="mt-2 text-sm text-(--foreground-muted)">
          Aucun exercice n’est encore clos. Vos résultats apparaîtront ici dès la première
          publication.
        </p>
      </section>
    );
  }

  const g = results.group;

  return (
    <section className="mt-8 rounded-xl border border-(--border) bg-(--surface) p-6">
      <h2 className="text-xl font-medium">Vos résultats — exercice {results.roundNumber}</h2>
      <p className="mt-1 mb-5 max-w-3xl text-sm text-(--foreground-muted)">
        Les termes sont ceux de la discipline — ceux que vous emploierez en soutenance et que
        vous retrouverez dans un manuel. <strong>Survolez-en un</strong> pour sa définition et un
        exemple chiffré.
      </p>

      {/* ── Groupe ─────────────────────────────────────────────────────── */}
      <h3 className="text-sm font-medium tracking-wide text-(--foreground-muted) uppercase">
        Le Groupe
      </h3>

      <dl className="tabular mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Figure
          term="Chiffre d'affaires"
          value={formatMadCompact(g.revenueMad)}
        />
        <Figure
          term="Charges d'exploitation"
          value={formatMadCompact(g.totalCostsMad)}
          note={`${g.profitMarginPct >= 0 ? '' : '−'}${Math.abs(100 - g.profitMarginPct).toFixed(0)} DH de coûts pour 100 DH vendus`}
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

      <p className="mt-4 rounded-lg border border-(--border) px-4 py-3 text-sm">
        {g.marginNote}
      </p>

      {/* ── Crédit et levier ───────────────────────────────────────────── */}
      <h3 className="mt-8 text-sm font-medium tracking-wide text-(--foreground-muted) uppercase">
        Votre crédit
      </h3>

      <dl className="tabular mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Figure term="Dette financière" value={formatMadCompact(g.debtOutstandingMad)} />
        <Figure
          term="Ratio d'endettement"
          value={`${g.debtRatioPct.toFixed(0)} %`}
          note="Dette rapportée à l’argent de vos actionnaires."
        />
        <Figure
          term="Coût de la dette"
          value={`${g.costOfDebtPct.toFixed(1)} %`}
        />
        <Figure
          term="Rentabilité économique"
          value={`${g.returnOnAssetsPct.toFixed(1)} %`}
          tone={g.leverageFavourable ? 'positive' : 'negative'}
        />
      </dl>

      <p
        className="mt-4 rounded-lg border px-4 py-3 text-sm"
        style={{
          borderColor: g.leverageFavourable ? 'var(--positive)' : 'var(--negative)',
        }}
      >
        <strong>L’effet de levier.</strong> {g.leverageNote}
      </p>

      {/* ── Par domaine d'activité ─────────────────────────────────────── */}
      {results.das.length > 0 ? (
        // Replié : au niveau Groupe, la comparaison domaine par domaine est une
        // lecture de second rang — un tableau de huit colonnes sous les quatre
        // chiffres qui, eux, commandent la décision du tour.
        <details className="mt-8">
          <summary className="cursor-pointer list-none text-sm font-medium tracking-wide text-(--foreground-muted) uppercase">
            Domaine par domaine
            <span className="ml-2 normal-case">({results.das.length})</span>
          </summary>
          <p className="mt-3 mb-3 max-w-3xl text-sm text-(--foreground-muted)">
            Ces marges sont calculées <strong>avant</strong> les charges de siège, l’impôt et les
            intérêts — qui ne se répartissent qu’au niveau du Groupe. Elles servent à comparer vos
            domaines entre eux, pas à mesurer votre bénéfice.
          </p>

          <div className="min-w-0 overflow-x-auto">
            <table className="tabular w-full min-w-[46rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-(--border) text-left">
                  <th className="py-2 pr-4 font-medium">Domaine</th>
                  <th className="py-2 pr-4 font-medium"><Term>Chiffre d’affaires</Term></th>
                  <th className="py-2 pr-4 font-medium"><Term>Charges d’exploitation</Term></th>
                  <th className="py-2 pr-4 font-medium"><Term>Marge d’exploitation</Term></th>
                  <th className="py-2 pr-4 font-medium"><Term>Rentabilité économique</Term></th>
                  <th className="py-2 pr-4 font-medium"><Term>Flux de trésorerie d’exploitation</Term></th>
                  <th className="py-2 font-medium">Seuil de rentabilité</th>
                </tr>
              </thead>
              <tbody>
                {results.das.map((d) => (
                  <tr key={d.dasId} className="border-b border-(--border)">
                    <td className="py-2.5 pr-4">{d.dasName}</td>
                    <td className="py-2.5 pr-4">{formatMadCompact(d.revenueMad)}</td>
                    <td className="py-2.5 pr-4">{formatMadCompact(d.totalCostsMad)}</td>
                    <td
                      className="py-2.5 pr-4"
                      style={{ color: d.profitMarginPct < 0 ? 'var(--negative)' : undefined }}
                    >
                      {d.profitMarginPct.toFixed(1)} %
                    </td>
                    <td className="py-2.5 pr-4">{d.roiPct.toFixed(1)} %</td>
                    <td
                      className="py-2.5 pr-4"
                      style={{ color: d.cashGeneratedMad < 0 ? 'var(--negative)' : undefined }}
                    >
                      {formatMadCompact(d.cashGeneratedMad)}
                    </td>
                    <td className="py-2.5">
                      {d.breakEvenUnits === null ? (
                        <span style={{ color: 'var(--negative)' }}>
                          aucun — chaque vente perd de l’argent
                        </span>
                      ) : (
                        <>
                          {Math.round(d.breakEvenUnits).toLocaleString('fr-FR')} u.
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
        </details>
      ) : null}
    </section>
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
    <div>
      <dt className="text-sm text-(--foreground-muted)"><Term>{term}</Term></dt>
      <dd
        className="mt-0.5 text-lg font-semibold"
        style={{
          color:
            tone === 'negative' ? 'var(--negative)'
            : tone === 'positive' ? 'var(--positive)'
            : undefined,
        }}
      >
        {value}
      </dd>
      {note ? <p className="mt-1 text-xs text-(--foreground-muted)">{note}</p> : null}
    </div>
  );
}
