'use client';

/**
 * ATLAS — lecture de gestion, par DAS et pour le Groupe.
 *
 * ── LE PARTI PRIS ──────────────────────────────────────────────────────────
 * Le public n'est pas financier. Aucun sigle n'apparaît ici : ni EBITDA, ni
 * BFR, ni OPEX. Chaque chiffre est accompagné de la PHRASE qui dit ce qu'il
 * signifie, et ces phrases viennent du moteur (`indicators.ts`) et non de la
 * vue — pour qu'un export Excel dise exactement la même chose.
 *
 * ── L'HONNÊTETÉ DU LIBELLÉ ─────────────────────────────────────────────────
 * La marge affichée PAR DAS est une marge d'exploitation : elle ignore les
 * charges de siège, l'impôt et les intérêts, qui ne se calculent qu'au niveau
 * du groupe. L'écrire est indispensable — sans cela, une équipe lirait 43 % au
 * niveau d'un DAS, 6 % au niveau du groupe, et conclurait à un bug.
 */

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
        Les mêmes chiffres que votre comptable, dits autrement. Chaque nombre est suivi de ce
        qu’il veut dire.
      </p>

      {/* ── Groupe ─────────────────────────────────────────────────────── */}
      <h3 className="text-sm font-medium tracking-wide text-(--foreground-muted) uppercase">
        Le Groupe
      </h3>

      <dl className="tabular mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Figure
          term="Ce que nous avons vendu"
          value={formatMadCompact(g.revenueMad)}
        />
        <Figure
          term="Ce que tout cela a coûté"
          value={formatMadCompact(g.totalCostsMad)}
          note={`${g.profitMarginPct >= 0 ? '' : '−'}${Math.abs(100 - g.profitMarginPct).toFixed(0)} DH de coûts pour 100 DH vendus`}
        />
        <Figure
          term="Ce qui reste, une fois tout payé"
          value={formatMadCompact(g.netIncomeMad)}
          tone={g.netIncomeMad >= 0 ? 'positive' : 'negative'}
        />
        <Figure
          term="Ce qui est réellement entré en caisse"
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
        <Figure term="Ce que vous devez" value={formatMadCompact(g.debtOutstandingMad)} />
        <Figure
          term="Poids de la dette"
          value={`${g.debtRatioPct.toFixed(0)} %`}
          note="Dette rapportée à l’argent de vos actionnaires."
        />
        <Figure
          term="Ce que votre argent coûte"
          value={`${g.costOfDebtPct.toFixed(1)} %`}
        />
        <Figure
          term="Ce que votre outil rapporte"
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
        <>
          <h3 className="mt-8 text-sm font-medium tracking-wide text-(--foreground-muted) uppercase">
            Domaine par domaine
          </h3>
          <p className="mt-1 mb-3 max-w-3xl text-sm text-(--foreground-muted)">
            Ces marges sont calculées <strong>avant</strong> les charges de siège, l’impôt et les
            intérêts — qui ne se répartissent qu’au niveau du Groupe. Elles servent à comparer vos
            domaines entre eux, pas à mesurer votre bénéfice.
          </p>

          <div className="min-w-0 overflow-x-auto">
            <table className="tabular w-full min-w-[46rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-(--border) text-left">
                  <th className="py-2 pr-4 font-medium">Domaine</th>
                  <th className="py-2 pr-4 font-medium">Vendu</th>
                  <th className="py-2 pr-4 font-medium">Coûts</th>
                  <th className="py-2 pr-4 font-medium">Reste sur 100 DH</th>
                  <th className="py-2 pr-4 font-medium">Rendement</th>
                  <th className="py-2 pr-4 font-medium">Caisse</th>
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
                      {d.profitMarginPct.toFixed(1)} DH
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
        </>
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
      <dt className="text-sm text-(--foreground-muted)">{term}</dt>
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
