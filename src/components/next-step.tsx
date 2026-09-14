'use client';

/**
 * « Étape suivante », en bas de chaque écran de décision.
 *
 * Arrivée en bas d'un écran, une équipe remontait ouvrir la barre latérale pour
 * trouver le suivant. Le lien suit l'ordre de la navigation — Groupe, puis
 * domaines, puis récapitulatif — sans jamais l'imposer : la barre latérale reste
 * libre. Les écrans fermés par le facilitateur n'y figurent pas.
 */

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface Step {
  href: string;
  label: string;
}

export function NextStep({ steps }: { steps: Step[] }) {
  const pathname = usePathname();
  const index = steps.findIndex((s) => s.href === pathname);
  if (index < 0 || index === steps.length - 1) return null;
  const next = steps[index + 1];

  return (
    <nav aria-label="Étape suivante" className="mx-auto w-full min-w-0 max-w-5xl px-6 pb-10 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-(--border) pt-5">
        <p className="tabular text-sm text-(--foreground-muted)">
          Étape {index + 1} sur {steps.length}
        </p>
        <Link
          href={next.href}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-(--border) bg-(--surface) px-4 text-sm font-medium transition-colors hover:border-(--accent) hover:text-(--accent-text)"
        >
          Étape suivante : {next.label}
          <ArrowRight aria-hidden className="h-4 w-4" />
        </Link>
      </div>
    </nav>
  );
}
