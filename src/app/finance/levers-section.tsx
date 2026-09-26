'use client';

/**
 * Les six leviers financiers du Groupe, tels que le référentiel les définit.
 *
 * Pour chacun : ce qu'il produit quand il réussit, ce qu'il détruit quand il
 * échoue, et le mécanisme financier qui l'explique. C'est le matériel que le
 * facilitateur discutera en salle, et c'est pour cela qu'il vit en base et non
 * dans le code — une promotion peut en retoucher la formulation.
 *
 * ── D'UNE LISTE DE FICHES À UN TABLEAU DE BORD ─────────────────────────────
 * Les leviers se lisaient comme six fiches de cours, détachées des champs qui
 * les actionnent : rien ne disait lequel l'équipe jouait déjà, ni où le régler.
 * Chaque levier est désormais une carte qui dit :
 *   • son ÉTAT ce tour, calculé sur les décisions en cours de saisie — un
 *     tirage de 1,2 Md, aucun dividende, aucun transfert ;
 *   • s'il est jouable — fermé par l'animateur, ou bloqué par un fait (un seul
 *     domaine, aucune capacité d'emprunt) ;
 *   • où l'actionner : le champ de cet écran, ouvert et mis en évidence, ou
 *     l'écran de cession.
 * La fiche pédagogique reste sous le « + ».
 */

import { ArrowRight, Check, Lock, TriangleAlert } from 'lucide-react';
import Link from 'next/link';

import { useT } from '@/components/i18n-provider';
import { InfoHint } from '@/components/ui/info-hint';
import type { MessageKey } from '@/lib/i18n/messages';
import type { FinanceLimits, FinanceValues } from '@/lib/decision-types';
import { formatMadCompact } from '@/lib/format';

export interface FinancialLever {
  key: string;
  category: string;
  actionLabel: string;
  successNote: string;
  riskNote: string;
  rationaleNote: string;
  screen: string | null;
  /** Vrai quand la session a ouvert le champ correspondant. */
  available: boolean;
}

type LeverStatus = 'active' | 'ready' | 'blocked' | 'closed' | 'elsewhere';

interface LeverState {
  title: string;
  status: LeverStatus;
  /** Ce que la décision en cours dit de ce levier, en une ligne. */
  line: string;
  /** L'ancre du champ qui l'actionne sur cet écran. */
  anchor?: string;
}

/** Les titres courts, traduits (`lever.title.*`) : l'intitulé du référentiel est une phrase d'action. */
const TITLED = new Set(['cash_pooling', 'emission_dette', 'spin_off', 'acquisition_consolidation', 'retention_benefices', 'levee_capital']);

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

const md = (v: number) => formatMadCompact(v);

/**
 * L'état de chaque levier, lu sur les décisions EN COURS de saisie : la carte
 * change dès qu'on bouge le curseur de crédit, sans attendre l'enregistrement.
 */
export function leverStates(
  levers: FinancialLever[],
  finance: FinanceValues,
  limits: FinanceLimits,
  dasCount: number,
  t: Translate,
): Map<string, LeverState> {
  const states = new Map<string, LeverState>();

  for (const lever of levers) {
    const title = TITLED.has(lever.key) ? t(`lever.title.${lever.key}` as MessageKey) : lever.category;
    const base = { title };

    if (!lever.available) {
      states.set(lever.key, { ...base, status: 'closed', line: t('lever.closed') });
      continue;
    }

    switch (lever.key) {
      case 'emission_dette': {
        const credit = finance.netCreditMad;
        states.set(lever.key, {
          ...base,
          anchor: 'levier-credit',
          status: credit > 0 ? 'active' : limits.capacityAvailableMad <= 0 && credit >= 0 ? 'blocked' : 'ready',
          line:
            credit > 0 ? t('lever.drawThisRound', { amount: md(credit) })
            : credit < 0 ? t('lever.repayThisRound', { amount: md(-credit) })
            : limits.capacityAvailableMad > 0 ? t('lever.capacity', { amount: md(limits.capacityAvailableMad) })
            : t('lever.bankNo'),
        });
        break;
      }
      case 'levee_capital': {
        const raised = finance.capitalRaisedMad;
        states.set(lever.key, {
          ...base,
          anchor: 'levier-capital',
          status: raised > 0 ? 'active' : 'ready',
          line: raised > 0 ? t('lever.raised', { amount: md(raised), fees: md(raised * 0.02) }) : t('lever.noRaise'),
        });
        break;
      }
      case 'retention_benefices': {
        const distributable = limits.dividendCeilingMad > 0;
        const dividend = finance.dividendMad;
        states.set(lever.key, {
          ...base,
          anchor: 'levier-dividende',
          status: !distributable ? 'blocked' : dividend === 0 ? 'active' : 'ready',
          line:
            !distributable ? t('lever.noDistributable')
            : dividend === 0 ? t('lever.retained', { amount: md(limits.dividendCeilingMad) })
            : t('lever.partial', { amount: md(dividend) }),
        });
        break;
      }
      case 'cash_pooling': {
        const moves = finance.cashTransfers.filter((t) => t.transferMad !== 0);
        const moved = moves.filter((t) => t.transferMad > 0).reduce((acc, t) => acc + t.transferMad, 0);
        states.set(lever.key, {
          ...base,
          anchor: 'levier-cash-pooling',
          status: dasCount < 2 ? 'blocked' : moves.length > 0 ? 'active' : 'ready',
          line:
            dasCount < 2 ? t('lever.twoUnits')
            : moves.length > 0 ? t('lever.moved', { amount: md(moved), units: moves.length })
            : t('lever.noTransfer'),
        });
        break;
      }
      default:
        states.set(lever.key, {
          ...base,
          status: 'elsewhere',
          line: t('lever.elsewhere'),
        });
    }
  }

  return states;
}

const STATUS = {
  active: { icon: Check, tone: 'bg-(--accent) text-(--on-accent)' },
  ready: { icon: null, tone: 'bg-(--surface-muted) text-(--foreground-muted) ring-1 ring-(--border)' },
  elsewhere: { icon: null, tone: 'bg-(--surface-muted) text-(--foreground-muted) ring-1 ring-(--border)' },
  blocked: { icon: TriangleAlert, tone: 'bg-(--warning-subtle) text-(--warning)' },
  closed: { icon: Lock, tone: 'bg-(--surface-muted) text-(--meta) ring-1 ring-(--border)' },
} as const;

export function LeversSection({
  levers, finance, limits, dasCount,
}: {
  levers: FinancialLever[];
  finance: FinanceValues;
  limits: FinanceLimits;
  dasCount: number;
}) {
  const t = useT();
  if (levers.length === 0) return null;
  const states = leverStates(levers, finance, limits, dasCount, t);
  const category = (value: string) => {
    const key = `lever.category.${value}` as MessageKey;
    const text = t(key);
    return text === key ? value : text;
  };
  const isOut = (key: string) => ['closed', 'blocked'].includes(states.get(key)!.status);
  const actionable = levers.filter((lever) => !isOut(lever.key));
  const unavailable = levers.filter((lever) => isOut(lever.key));

  return (
    <>
    <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
      {actionable.map((lever) => {
        const state = states.get(lever.key)!;
        const status = STATUS[state.status];
        const StatusIcon = status.icon;
        const muted = state.status === 'closed';

        return (
          <li
            key={lever.key}
            className={`flex flex-col rounded-xl border p-4 transition-colors ${
              state.status === 'active'
                ? 'border-(--accent) bg-(--accent-subtle)/50'
                : 'border-(--border) bg-(--surface)'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold tracking-wide text-(--accent-text) uppercase">
                {category(lever.category)}
              </span>
              {/* L'état se lit en mot et en pictogramme, jamais par la seule teinte. */}
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-sm font-semibold ${status.tone}`}>
                {StatusIcon ? <StatusIcon aria-hidden className="h-3.5 w-3.5" strokeWidth={2.5} /> : null}
                {t(`lever.status.${state.status}` as MessageKey)}
              </span>
            </div>

            <h3 className={`mt-2 flex items-center gap-2 text-base font-semibold ${muted ? 'text-(--foreground-muted)' : 'text-(--heading)'}`}>
              {state.title}
              <InfoHint label={state.title}>
                <span className="block text-(--foreground-muted)">{lever.actionLabel}</span>
                <span className="mt-2 block">
                  <strong className="font-semibold text-(--positive)">{t('lever.success')}</strong> — {lever.successNote}
                </span>
                <span className="mt-2 block">
                  <strong className="font-semibold text-(--negative)">{t('lever.risk')}</strong> — {lever.riskNote}
                </span>
                <span className="mt-2 block text-(--foreground-muted)">
                  <strong className="font-semibold">{t('lever.why')}</strong> — {lever.rationaleNote}
                </span>
              </InfoHint>
            </h3>

            <p className={`tabular mt-1 text-sm ${state.status === 'active' ? 'font-medium text-(--foreground)' : 'text-(--foreground-muted)'}`}>
              {state.line}
            </p>

            <div className="mt-auto pt-4">
              {state.status === 'closed' ? null : state.status === 'elsewhere' || (lever.screen && lever.screen !== '/finance') ? (
                <Link
                  href={lever.screen ?? '/cession'}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-(--accent-text) hover:underline"
                >
                  {t('lever.openCession')}
                  <ArrowRight aria-hidden className="h-4 w-4 rtl:-scale-x-100" />
                </Link>
              ) : state.anchor && state.status !== 'blocked' ? (
                <a
                  href={`#${state.anchor}`}
                  onClick={() => {
                    // Un second clic sur la même ancre ne déclenche pas
                    // `hashchange` : on le relance pour rouvrir et resurligner.
                    if (window.location.hash === `#${state.anchor}`) {
                      window.dispatchEvent(new HashChangeEvent('hashchange'));
                    }
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    state.status === 'active'
                      ? 'border border-(--accent) text-(--accent-text) hover:bg-(--surface)'
                      : 'bg-(--accent) text-(--on-accent) hover:bg-(--accent-hover)'
                  }`}
                >
                  {state.status === 'active' ? t('lever.adjust') : t('lever.set')}
                  <ArrowRight aria-hidden className="h-4 w-4 rtl:-scale-x-100" />
                </a>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
    {/* Fermés ou indisponibles : une ligne qui dit pourquoi, au lieu de cartes
        de même taille que les leviers qu'on peut réellement actionner. */}
    {unavailable.length > 0 ? (
      <p className="mt-3 text-sm text-(--foreground-muted)">
        <span className="font-medium text-(--foreground)">{t('lever.unavailable')} </span>
        {unavailable.map((lever, index) => {
          const state = states.get(lever.key)!;
          return (
            <span key={lever.key}>
              {index > 0 ? ' · ' : ''}
              {state.title} ({state.line.charAt(0).toLowerCase() + state.line.slice(1)})
            </span>
          );
        })}
      </p>
    ) : null}
    </>
  );
}
