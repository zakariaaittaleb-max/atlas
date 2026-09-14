'use client';

import { usePathname } from 'next/navigation';

import { NextStep, type Step } from '@/components/next-step';

/**
 * L'habillage des écrans d'équipe : navigation, barre d'argent, lien d'évitement.
 *
 * ── POURQUOI UN COMPOSANT CLIENT ───────────────────────────────────────────
 * Un facilitateur qui joue dans une équipe EST membre de cette équipe : la coque
 * se construisait donc aussi sur ses propres écrans, et la page de pilotage
 * s'ouvrait sous la trésorerie et la navigation du groupe qu'il venait
 * d'aider. Deux contextes superposés, dont un faux. Un layout ne connaît pas
 * le chemin demandé ; le client, si — c'est ici qu'on retire l'habillage des
 * écrans qui ne sont pas des écrans d'équipe.
 */
const BARE_PREFIXES = ['/facilitateur', '/projecteur', '/admin'];

export function TeamChrome({
  locked, sidebar, topBar, steps = [], children,
}: {
  /** Écrans de décision dans l'ordre du parcours, pour « Étape suivante ». */
  steps?: Step[];
  /** Saisie fermée : les champs passent en lecture seule lisible. */
  locked: boolean;
  sidebar: React.ReactNode;
  topBar: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const bare = BARE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  if (bare) return <>{children}</>;

  return (
    <div className="min-h-0 flex-1 lg:flex" data-round-locked={locked ? '' : undefined}>
      {/* Premier arrêt de la tabulation : sans lui, clavier et lecteur d'écran
          traversaient toute la navigation avant d'atteindre chaque écran. */}
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-(--accent) focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-(--on-accent)"
      >
        Aller au contenu
      </a>
      {sidebar}

      <div className="flex min-w-0 flex-1 flex-col">
        {topBar}

        {/* Cible du lien d'évitement. Un conteneur, pas une commande : le
            contour de focus n'y signalerait rien d'actionnable. */}
        <div id="contenu" tabIndex={-1} className="flex min-w-0 flex-1 flex-col" style={{ outline: 'none' }}>
          {children}
          <NextStep steps={steps} />
        </div>
      </div>
    </div>
  );
}
