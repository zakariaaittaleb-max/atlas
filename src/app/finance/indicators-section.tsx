'use client';

/**
 * Les indicateurs financiers du Groupe, expliqués à la demande.
 *
 * ── POURQUOI À LA DEMANDE ──────────────────────────────────────────────────
 * Un ratio qu'on ne sait pas lire est un ratio qui ne sert à rien, et douze
 * ratios affichés d'un coup ne se lisent pas. Chaque ligne montre donc le
 * CHIFFRE, et son « + » ouvre le calcul AVEC LES PROPRES NOMBRES de l'équipe :
 * « CAF = résultat net (−4,45 Md) + amortissements (1,20 Md) ». C'est la
 * différence entre un tableau de bord et un cours.
 *
 * Le régime d'imposition a quitté l'écran : il proposait trois options dont
 * deux calculaient le même impôt. Ces indicateurs prennent sa place, et ils
 * portent de vraies décisions.
 */

import { TriangleAlert } from 'lucide-react';

import { InfoHint } from '@/components/ui/info-hint';
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
    <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
      {lignes.map((l) => (
        <li
          key={l.terme}
          className={`flex items-center justify-between gap-3 rounded-lg px-4 py-3 ${
            l.ton === 'negative' ? 'bg-(--negative-subtle)' : 'bg-(--surface-muted)'
          }`}
        >
          <span className="flex min-w-0 items-center gap-2 text-sm">
            {l.terme}
            <InfoHint label={l.terme}>
              <span className="block font-mono text-sm text-(--foreground-muted)">{l.calcul}</span>
              <span className="mt-2 block">{l.lecture}</span>
            </InfoHint>
          </span>
          <span
            className={`tabular inline-flex shrink-0 items-center gap-1.5 font-mono font-semibold ${
              l.ton === 'positive' ? 'text-(--positive)' : l.ton === 'negative' ? 'text-(--negative)' : ''
            }`}
          >
            {l.ton === 'negative' ? <TriangleAlert aria-hidden className="h-4 w-4" /> : null}
            {l.valeur}
          </span>
        </li>
      ))}
    </ul>
  );
}
