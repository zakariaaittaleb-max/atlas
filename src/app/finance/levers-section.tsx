'use client';

/**
 * Les six leviers financiers du Groupe, tels que le référentiel les définit.
 *
 * Pour chacun : ce qu'il produit quand il réussit, ce qu'il détruit quand il
 * échoue, et le mécanisme financier qui l'explique. C'est le matériel que le
 * facilitateur discutera en salle, et c'est pour cela qu'il vit en base et non
 * dans le code — une promotion peut en retoucher la formulation.
 *
 * Une ligne par levier, sa fiche sous le « + » : une équipe qui sait déjà ce
 * qu'elle fait ne relit pas six fiches à chaque tour, et celle qui hésite les
 * trouve au même endroit que la décision.
 */

import Link from 'next/link';

import { InfoHint } from '@/components/ui/info-hint';

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

export function LeversSection({ levers }: { levers: FinancialLever[] }) {
  if (levers.length === 0) return null;

  return (
    <ul className="m-0 list-none divide-y divide-(--border) rounded-lg border border-(--border) p-0">
      {levers.map((l) => (
        <li key={l.key} className="flex flex-wrap items-center gap-3 px-4 py-3">
          <span className="rounded bg-(--accent-subtle) px-1.5 py-0.5 text-xs font-semibold tracking-wide text-(--accent-text) uppercase">
            {l.category}
          </span>
          <span className="flex min-w-0 flex-1 items-center gap-2 text-sm">
            {l.actionLabel}
            <InfoHint label={l.actionLabel}>
              <span className="block">
                <strong className="font-semibold text-(--positive)">Si ça réussit</strong> — {l.successNote}
              </span>
              <span className="mt-2 block">
                <strong className="font-semibold text-(--negative)">Le risque majeur</strong> — {l.riskNote}
              </span>
              <span className="mt-2 block text-(--foreground-muted)">
                <strong className="font-semibold">Pourquoi ça marche</strong> — {l.rationaleNote}
              </span>
            </InfoHint>
          </span>
          {!l.available ? (
            <span className="text-xs text-(--meta)">fermé par le facilitateur</span>
          ) : null}
          {l.screen && l.screen !== '/finance' ? (
            <Link href={l.screen} className="text-sm font-medium text-(--accent-text) hover:underline">
              Se décide sur un autre écran →
            </Link>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
