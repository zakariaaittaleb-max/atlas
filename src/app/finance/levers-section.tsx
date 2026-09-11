'use client';

/**
 * Les six leviers financiers du Groupe, tels que le référentiel les définit.
 *
 * Pour chacun : ce qu'il produit quand il réussit, ce qu'il détruit quand il
 * échoue, et le mécanisme financier qui l'explique. C'est le matériel que le
 * facilitateur discutera en salle, et c'est pour cela qu'il vit en base et non
 * dans le code — une promotion peut en retoucher la formulation.
 *
 * Replié par défaut : une équipe qui sait déjà ce qu'elle fait ne relit pas six
 * fiches à chaque tour, et celle qui hésite les trouve au même endroit que la
 * décision.
 */

import Link from 'next/link';

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
    <section className="mt-8 rounded-xl border border-(--border) bg-(--surface) p-6">
      <h2 className="text-xl font-medium">Les leviers financiers du Groupe</h2>
      <p className="mt-1 mb-4 max-w-3xl text-sm text-(--foreground-muted)">
        Six façons de faire travailler l’argent du groupe. Chacune a un bénéfice, un risque
        majeur, et une raison financière d’exister. Dépliez-en une avant de l’actionner.
      </p>

      <ul className="flex flex-col gap-1 p-0 m-0 list-none">
        {levers.map((l) => (
          <li key={l.key} className="border-b border-(--border) last:border-0">
            <details>
              <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
                <span aria-hidden className="text-(--foreground-muted)">+</span>
                <span
                  className="rounded px-1.5 py-0.5 text-xs font-semibold tracking-wide uppercase"
                  style={{ background: 'var(--surface-muted)', color: 'var(--accent)' }}
                >
                  {l.category}
                </span>
                <span className="flex-1 text-sm">{l.actionLabel}</span>
                {!l.available ? (
                  <span className="text-xs text-(--foreground-muted)">
                    fermé par le facilitateur
                  </span>
                ) : null}
              </summary>

              <dl className="mb-3 ml-6 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
                <dt className="font-medium" style={{ color: 'var(--positive)' }}>
                  Si ça réussit
                </dt>
                <dd className="m-0">{l.successNote}</dd>

                <dt className="font-medium" style={{ color: 'var(--negative)' }}>
                  Le risque majeur
                </dt>
                <dd className="m-0">{l.riskNote}</dd>

                <dt className="font-medium text-(--foreground-muted)">Pourquoi ça marche</dt>
                <dd className="m-0 text-(--foreground-muted)">{l.rationaleNote}</dd>
              </dl>

              {l.screen && l.screen !== '/finance' ? (
                <p className="mb-3 ml-6 text-sm">
                  <Link href={l.screen} className="underline">
                    Ce levier se décide sur un autre écran →
                  </Link>
                </p>
              ) : null}
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
