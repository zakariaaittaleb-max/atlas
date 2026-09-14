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

import { InfoHint } from '@/components/ui/info-hint';
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

/** Les titres courts : l'intitulé du référentiel est une phrase d'action. */
const TITLES: Record<string, string> = {
  cash_pooling: 'Cash pooling',
  emission_dette: 'Émission de dette',
  spin_off: 'Spin-off ou cession',
  acquisition_consolidation: 'Acquisition de consolidation',
  retention_benefices: 'Rétention des bénéfices',
  levee_capital: 'Levée de fonds propres',
};

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
): Map<string, LeverState> {
  const states = new Map<string, LeverState>();

  for (const lever of levers) {
    const title = TITLES[lever.key] ?? lever.category;
    const base = { title };

    if (!lever.available) {
      states.set(lever.key, { ...base, status: 'closed', line: 'Fermé par l’animateur pour cette session' });
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
            credit > 0 ? `Tirage de ${md(credit)} ce tour`
            : credit < 0 ? `Remboursement de ${md(-credit)} ce tour`
            : limits.capacityAvailableMad > 0 ? `Capacité disponible : ${md(limits.capacityAvailableMad)}`
            : 'La banque ne prête pas en l’état',
        });
        break;
      }
      case 'levee_capital': {
        const raised = finance.capitalRaisedMad;
        states.set(lever.key, {
          ...base,
          anchor: 'levier-capital',
          status: raised > 0 ? 'active' : 'ready',
          line: raised > 0 ? `Levée de ${md(raised)} · ${md(raised * 0.02)} de frais` : 'Aucune levée ce tour',
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
            !distributable ? 'Aucun résultat distribuable pour l’instant'
            : dividend === 0 ? `100 % retenus sur ${md(limits.dividendCeilingMad)} distribuables`
            : `Dividende de ${md(dividend)} : rétention partielle`,
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
            dasCount < 2 ? 'Exige au moins deux domaines dans le portefeuille'
            : moves.length > 0 ? `${md(moved)} déplacés entre ${moves.length} domaines`
            : 'Aucun transfert ce tour',
        });
        break;
      }
      default:
        states.set(lever.key, {
          ...base,
          status: 'elsewhere',
          line: 'Se décide sur l’écran Cession & acquisitions',
        });
    }
  }

  return states;
}

const STATUS = {
  active: { label: 'Actionné', icon: Check, tone: 'bg-(--accent) text-(--on-accent)' },
  ready: { label: 'Disponible', icon: null, tone: 'bg-(--surface-muted) text-(--foreground-muted) ring-1 ring-(--border)' },
  elsewhere: { label: 'Disponible', icon: null, tone: 'bg-(--surface-muted) text-(--foreground-muted) ring-1 ring-(--border)' },
  blocked: { label: 'Indisponible', icon: TriangleAlert, tone: 'bg-(--warning-subtle) text-(--warning)' },
  closed: { label: 'Fermé', icon: Lock, tone: 'bg-(--surface-muted) text-(--meta) ring-1 ring-(--border)' },
} as const;

export function LeversSection({
  levers, finance, limits, dasCount,
}: {
  levers: FinancialLever[];
  finance: FinanceValues;
  limits: FinanceLimits;
  dasCount: number;
}) {
  if (levers.length === 0) return null;
  const states = leverStates(levers, finance, limits, dasCount);
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
                {lever.category}
              </span>
              {/* L'état se lit en mot et en pictogramme, jamais par la seule teinte. */}
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-sm font-semibold ${status.tone}`}>
                {StatusIcon ? <StatusIcon aria-hidden className="h-3.5 w-3.5" strokeWidth={2.5} /> : null}
                {status.label}
              </span>
            </div>

            <h3 className={`mt-2 flex items-center gap-2 text-base font-semibold ${muted ? 'text-(--foreground-muted)' : 'text-(--heading)'}`}>
              {state.title}
              <InfoHint label={state.title}>
                <span className="block text-(--foreground-muted)">{lever.actionLabel}</span>
                <span className="mt-2 block">
                  <strong className="font-semibold text-(--positive)">↑ Si ça réussit</strong> — {lever.successNote}
                </span>
                <span className="mt-2 block">
                  <strong className="font-semibold text-(--negative)">↓ Le risque majeur</strong> — {lever.riskNote}
                </span>
                <span className="mt-2 block text-(--foreground-muted)">
                  <strong className="font-semibold">Pourquoi ça marche</strong> — {lever.rationaleNote}
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
                  Ouvrir Cession &amp; acquisitions
                  <ArrowRight aria-hidden className="h-4 w-4" />
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
                  {state.status === 'active' ? 'Ajuster' : 'Régler'}
                  <ArrowRight aria-hidden className="h-4 w-4" />
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
        <span className="font-medium text-(--foreground)">Pas actionnables ce tour : </span>
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
