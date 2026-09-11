'use client';

/**
 * Les indicateurs financiers du Groupe, expliqués à la demande.
 *
 * ── POURQUOI À LA DEMANDE ──────────────────────────────────────────────────
 * Un ratio qu'on ne sait pas lire est un ratio qui ne sert à rien, et douze
 * ratios affichés d'un coup ne se lisent pas. Chaque ligne montre donc le
 * CHIFFRE, et déplie sur demande son calcul AVEC LES PROPRES NOMBRES de
 * l'équipe : « CAF = résultat net (−4,45 Md) + amortissements (1,20 Md) ».
 * C'est la différence entre un tableau de bord et un cours.
 *
 * Le régime d'imposition a quitté l'écran : il proposait trois options dont
 * deux calculaient le même impôt. Ces indicateurs prennent sa place, et ils
 * portent de vraies décisions.
 */

import { formatMadCompact, formatScore } from '@/lib/format';
import type { GroupResult } from '@/lib/results-types';
import type { FinanceLimits } from '@/lib/decision-types';

interface Ligne {
  terme: string;
  valeur: string;
  /** Le calcul, avec les nombres de l'équipe. */
  calcul: string;
  /** Ce que le chiffre dit, en une phrase. */
  lecture: string;
  ton?: 'positive' | 'negative';
}

const md = (v: number) => formatMadCompact(v);
const ratio = (v: number | null, suffixe = '×') =>
  v === null ? '—' : `${formatScore(v, 2)} ${suffixe}`;

export function IndicatorsSection({
  group,
  limits,
}: {
  group: GroupResult;
  limits: FinanceLimits;
}) {
  const lignes: Ligne[] = [
    {
      terme: 'Capacité d’autofinancement',
      valeur: md(group.selfFinancingMad),
      calcul: `résultat net ${md(group.netIncomeMad)} + amortissements ${md(group.depreciationMad)}`,
      lecture:
        group.selfFinancingMad >= 0
          ? 'Ce que l’exploitation dégage réellement, avant de financer la croissance.'
          : 'L’exploitation ne dégage rien : tout investissement se paiera par la dette ou par le matelas.',
      ton: group.selfFinancingMad >= 0 ? 'positive' : 'negative',
    },
    {
      terme: 'Flux de trésorerie libre',
      valeur: md(group.freeCashFlowMad),
      calcul:
        `CAF ${md(group.selfFinancingMad)} − variation du besoin en fonds de roulement ` +
        `${md(group.workingCapitalChangeMad)} − investissements ${md(group.capexMad)}`,
      lecture:
        group.freeCashFlowMad >= 0
          ? 'Le tour s’autofinance : vous pouvez vous payer ce plan.'
          : 'Le tour ne s’autofinance pas. La différence sort de la trésorerie ou de la banque.',
      ton: group.freeCashFlowMad >= 0 ? 'positive' : 'negative',
    },
    {
      terme: 'Capacité d’endettement restante',
      valeur: md(limits.capacityAvailableMad),
      calcul:
        `min(2 × fonds propres ${md(limits.capacityByEquityMad)} ; ` +
        `40 % de l’activité ${md(limits.capacityByRevenueMad)}) − encours ${md(limits.debtOutstandingMad)}`,
      lecture:
        limits.capacityAvailableMad > 0
          ? limits.capacityBinding === 'activite'
            ? 'C’est votre volume d’activité qui fixe le plafond.'
            : 'C’est votre assise en fonds propres qui fixe le plafond.'
          : 'La banque ne prêtera pas davantage en l’état.',
    },
    {
      terme: 'Gearing',
      valeur: ratio(group.equityMad > 0 ? group.debtOutstandingMad / group.equityMad : null),
      calcul: `dette ${md(group.debtOutstandingMad)} ÷ fonds propres ${md(group.equityMad)}`,
      lecture:
        'Au-delà de 2, la banque considère que l’actionnaire ne prend plus sa part du risque.',
    },
    {
      terme: 'Dette / EBITDA',
      valeur: ratio(group.debtToEbitda, 'ans'),
      calcul: `dette ${md(group.debtOutstandingMad)} ÷ EBITDA ${md(group.ebitdaMad)}`,
      lecture:
        'Le nombre d’années d’exploitation qu’il faudrait pour rembourser. Au-delà de 3,5, c’est trop long.',
    },
    {
      terme: 'Couverture des intérêts',
      valeur: ratio(group.interestCoverage),
      calcul: `résultat d’exploitation ${md(group.ebitMad)} ÷ intérêts ${md(group.interestMad)}`,
      lecture:
        group.interestCoverage === null
          ? 'Aucune charge d’intérêt : rien à couvrir.'
          : group.interestCoverage < 2
            ? 'Sous 2, la charge financière devient le premier risque de l’entreprise.'
            : 'L’exploitation paie confortablement sa charge financière.',
      ton:
        group.interestCoverage !== null && group.interestCoverage < 2 ? 'negative' : undefined,
    },
    {
      terme: 'Besoin en fonds de roulement',
      valeur: `${formatScore(group.workingCapitalDays, 0)} jours de CA`,
      calcul: `${md(group.workingCapitalMad)} immobilisés sur ${md(group.revenueMad)} de chiffre d’affaires`,
      lecture:
        'Ce que le cycle d’exploitation immobilise en permanence. Chaque jour gagné libère du cash.',
    },
    {
      terme: 'Rentabilité des capitaux propres',
      valeur: `${formatScore(group.returnOnEquityPct, 1)} %`,
      calcul: `résultat net ${md(group.netIncomeMad)} ÷ fonds propres ${md(group.equityMad)}`,
      lecture: group.leverageNote,
      ton: group.returnOnEquityPct >= 0 ? 'positive' : 'negative',
    },
  ];

  return (
    <section className="mt-8 rounded-xl border border-(--border) bg-(--surface) p-6">
      <h2 className="text-xl font-medium">Vos indicateurs financiers</h2>
      <p className="mt-1 mb-5 max-w-3xl text-sm text-(--foreground-muted)">
        Les grandeurs sur lesquelles un comité de crédit et un actionnaire vous jugeront.
        Dépliez-en une pour voir son calcul avec vos propres chiffres.
      </p>

      <ul className="flex flex-col gap-1 p-0 m-0 list-none">
        {lignes.map((l) => (
          <li key={l.terme} className="border-b border-(--border) last:border-0">
            <details>
              <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-3 py-2.5">
                <span className="flex items-baseline gap-2">
                  <span aria-hidden className="text-(--foreground-muted)">+</span>
                  <span>{l.terme}</span>
                </span>
                <span
                  className="tabular font-medium"
                  style={{
                    color:
                      l.ton === 'positive' ? 'var(--positive)'
                      : l.ton === 'negative' ? 'var(--negative)'
                      : undefined,
                  }}
                >
                  {l.valeur}
                </span>
              </summary>
              <div className="pb-3.5 pl-6">
                <p className="tabular m-0 text-sm text-(--foreground-muted)">{l.calcul}</p>
                <p className="mt-1.5 mb-0 text-sm">{l.lecture}</p>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
