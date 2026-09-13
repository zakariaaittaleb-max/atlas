import 'server-only';

/**
 * ATLAS — l'ossature commune aux documents de séance.
 *
 * Le document lui-même est servi par `/api/facilitator/document`, derrière le
 * contrôle du facilitateur, et affiché dans une `<iframe>` de même origine.
 *
 * ── POURQUOI UNE IFRAME PLUTÔT QU'UNE PAGE REACT ───────────────────────────
 * Les deux documents sont ENGENDRÉS depuis le moteur : profils-cibles, poids
 * des axes et coefficients y sont extraits du code au moment de la génération.
 * Les réécrire en composants les ferait diverger dès la première
 * recalibration — sans que personne ne s'en aperçoive, puisqu'ils
 * continueraient d'afficher des chiffres plausibles. C'est le défaut que
 * l'audit du moteur a corrigé une douzaine de fois ; il n'allait pas être
 * réintroduit ici.
 *
 * L'iframe apporte en prime l'isolation des styles : les documents portent
 * leur propre système typographique, qui n'a pas à négocier avec celui de
 * l'application.
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getFacilitatorContext } from '@/lib/dal';

export async function DocumentFrame({
  sessionId, doc, title, lede, siblingHref, siblingLabel,
}: {
  sessionId: string;
  doc: 'moteur' | 'simulateur';
  title: string;
  lede: string;
  siblingHref: string;
  siblingLabel: string;
}) {
  // Le même contrôle qu'à la route : la page ne doit pas exister pour qui
  // n'anime pas cette session, même si l'iframe refuserait de se charger.
  const context = await getFacilitatorContext(sessionId);
  if (!context) notFound();

  return (
    <main className="mx-auto flex w-full min-w-0 max-w-6xl flex-col px-6 py-8">
      <header className="mb-5">
        <p className="text-sm text-(--foreground-muted)">
          <Link href={`/facilitateur/${sessionId}`} className="hover:underline">
            ← {context.sessionName}
          </Link>
        </p>
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h1 className="text-3xl font-bold text-(--heading) tracking-tight">{title}</h1>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link href={siblingHref} className="hover:underline">{siblingLabel} →</Link>
            <a
              href={`/api/facilitator/document?doc=${doc}&sessionId=${sessionId}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-(--border) px-3 py-1.5 font-medium"
            >
              Ouvrir en plein écran
            </a>
          </div>
        </div>
        <p className="mt-2 max-w-3xl text-sm text-(--foreground-muted)">{lede}</p>
        <p className="mt-3 max-w-3xl rounded-lg border border-(--warning) px-4 py-2.5 text-sm">
          <strong>Réservé à l’animation.</strong> Ce document donne les profils-cibles exacts de
          l’indice d’alignement. Projeté avant le débriefing, il permettrait d’optimiser le score
          sans jamais arbitrer — c’est-à-dire de contourner tout l’exercice.
        </p>
      </header>

      <iframe
        src={`/api/facilitator/document?doc=${doc}&sessionId=${sessionId}`}
        title={title}
        className="min-h-[70vh] w-full flex-1 rounded-xl border border-(--border) bg-(--surface)"
        // Le document est de même origine et engendré par nous : il n'exécute
        // que son propre script. On ne lui ouvre ni la navigation du parent,
        // ni les popups.
        sandbox="allow-same-origin allow-scripts"
      />
    </main>
  );
}
