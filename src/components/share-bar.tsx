'use client';

/**
 * Barre empilée horizontale des parts de marché, animée d'un tour à l'autre.
 *
 * ── POURQUOI PAS UN ANNEAU ─────────────────────────────────────────────────
 * Le cahier des charges demandait « un graphique en anneau empilé animé ».
 * L'anneau est écarté délibérément : il n'est lisible que pour comparer des
 * valeurs NETTEMENT différentes, or les parts d'un pool sont par construction
 * proches (38 / 34 / 27 %) — c'est même toute la tension du jeu. Comparer des
 * arcs voisins de quelques degrés est le cas d'usage où le camembert échoue.
 *
 * La barre empilée horizontale conserve l'intention — voir sa tranche grandir
 * ou fondre — en la servant mieux : la frontière qui se déplace le long d'un
 * axe unique se lit d'un coup d'œil, les noms d'équipes s'inscrivent dans les
 * segments, et la lisibilité tient jusqu'à douze équipes là où l'anneau devient
 * illisible au-delà de six.
 *
 * ── TOUT LE MARCHÉ, PAS SEULEMENT LES ÉQUIPES ──────────────────────────────
 * Une barre empilée dit « voici comment 100 % se partagent ». Elle ne peut donc
 * pas ne montrer que les équipes : un domaine a aussi ses entreprises
 * installées, et une part que personne n'a su servir. Tant que ces deux
 * tranches manquaient, la barre s'arrêtait avant le bord sans rien expliquer —
 * un blanc qu'on lit comme un bug d'affichage, alors que c'est un résultat.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { formatPct } from '@/lib/format';

/** Ce que représente une tranche — la couleur et la légende en découlent. */
export type SliceKind = 'team' | 'installed' | 'unserved';

export interface ShareSlice {
  /** Identité stable de la tranche : `teamId`, ou un mot-clé pour le reste. */
  key: string;
  label: string;
  share: number;
  previousShare: number;
  kind: SliceKind;
  /**
   * Rang dans la palette. Fourni par l'appelant plutôt que déduit de la
   * position : une équipe doit garder SA couleur d'un domaine à l'autre, et la
   * composition d'un domaine n'est pas celle du voisin.
   */
  colorIndex?: number;
}

/**
 * Palette catégorielle validée (contrôles CVD, bande de clarté, plancher de
 * chroma) dans les deux modes. L'ordre est FIXE et jamais recyclé : la couleur
 * suit l'équipe, jamais son rang — un classement qui change ne doit pas
 * repeindre les survivants.
 */
const SERIES_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
const SERIES_DARK  = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];

const DURATION_MS = 3400;
const W = 1000;   // unités de la viewBox
const H = 46;     // marque FINE : un aplat saturé épais se lit comme un bloc, pas comme une donnée
const GAP = 2.6;  // séparateur de ~2px prescrit entre segments empilés

/** Sortie cubique : départ franc, arrivée qui se pose. */
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Préférence système de mouvement réduit.
 *
 * `useSyncExternalStore` plutôt qu'un `useState` mis à jour dans un effet : la
 * valeur vient d'un système extérieur à React, la lire par abonnement évite un
 * rendu en cascade et donne la bonne valeur dès le premier rendu client.
 */
const reducedMotionQuery = () => window.matchMedia('(prefers-reduced-motion: reduce)');

function subscribeReducedMotion(callback: () => void) {
  const query = reducedMotionQuery();
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => reducedMotionQuery().matches,
    // Côté serveur, on suppose l'absence de préférence : l'animation est
    // décidée au montage client, jamais au rendu initial.
    () => false,
  );
}

/** Les équipes d'abord, puis les installés, puis ce que personne n'a servi. */
const KIND_RANK: Record<SliceKind, number> = { team: 0, installed: 1, unserved: 2 };

export function ShareBar({
  slices,
  /** La tranche de l'équipe qui regarde : entourée et nommée « vous ». */
  highlightKey,
  animate,
  onSettled,
  label = 'Répartition des parts de marché',
}: {
  slices: ShareSlice[];
  highlightKey?: string;
  animate: boolean;
  onSettled?: () => void;
  label?: string;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const shouldAnimate = animate && !reducedMotion;

  // Un identifiant par instance : l'écran empile une barre par domaine, et
  // deux `clipPath` de même id feraient que la première découpe toutes les
  // autres — un id de document ne peut pas être une constante de module.
  const domId = useId().replace(/[^a-zA-Z0-9_-]/g, '');

  const [animProgress, setAnimProgress] = useState(0);
  const [hovered, setHovered] = useState<string | null>(null);
  const frame = useRef<number | null>(null);
  const settledRef = useRef(false);

  // Sans animation, l'avancement vaut 1 par dérivation — jamais par un
  // `setState` posé dans un effet, qui provoquerait un rendu en cascade.
  const progress = shouldAnimate ? animProgress : 1;

  const settle = useCallback(() => {
    if (settledRef.current) return;
    settledRef.current = true;
    onSettled?.();
  }, [onSettled]);

  useEffect(() => {
    if (!shouldAnimate) {
      // Rien à animer : on signale l'état stable au tour de boucle suivant.
      const id = setTimeout(settle, 0);
      return () => clearTimeout(id);
    }

    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min((now - start) / DURATION_MS, 1);
      setAnimProgress(easeOutCubic(t));
      if (t < 1) {
        frame.current = requestAnimationFrame(step);
      } else {
        settle();
      }
    };
    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [shouldAnimate, settle]);

  // Ordre FIXE, indépendant du classement : c'est ce qui permet à l'œil de
  // suivre sa propre tranche pendant qu'elle se déplace.
  const ordered = useMemo(
    () =>
      [...slices].sort(
        (a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.key.localeCompare(b.key),
      ),
    [slices],
  );

  // Position cumulée construite par réduction, sans variable mutée en
  // fermeture : un `useMemo` doit rester une pure dérivation.
  const segments = useMemo(
    () =>
      ordered.reduce<(ShareSlice & { x: number; width: number; value: number })[]>(
        (acc, slice) => {
          const value = slice.previousShare + (slice.share - slice.previousShare) * progress;
          const width = Math.max(value * W, 0);
          const previousSegment = acc[acc.length - 1];
          const x = previousSegment ? previousSegment.x + previousSegment.width : 0;
          return [...acc, { ...slice, x, width, value }];
        },
        [],
      ),
    [ordered, progress],
  );

  const fillOf = (slice: ShareSlice, position: number) => {
    if (slice.kind === 'installed') return 'var(--outside)';
    if (slice.kind === 'unserved') return `url(#unserved-${domId})`;
    return `var(--s${((slice.colorIndex ?? position) % 8) + 1})`;
  };

  return (
    <figure className="viz-root m-0">
      <style>{`
        .viz-root { --s1:${SERIES_LIGHT[0]}; --s2:${SERIES_LIGHT[1]}; --s3:${SERIES_LIGHT[2]};
                    --s4:${SERIES_LIGHT[3]}; --s5:${SERIES_LIGHT[4]}; --s6:${SERIES_LIGHT[5]};
                    --s7:${SERIES_LIGHT[6]}; --s8:${SERIES_LIGHT[7]};
                    --outside: var(--foreground-muted); }
        @media (prefers-color-scheme: dark) {
          :root:where(:not([data-theme="light"])) .viz-root {
            --s1:${SERIES_DARK[0]}; --s2:${SERIES_DARK[1]}; --s3:${SERIES_DARK[2]};
            --s4:${SERIES_DARK[3]}; --s5:${SERIES_DARK[4]}; --s6:${SERIES_DARK[5]};
            --s7:${SERIES_DARK[6]}; --s8:${SERIES_DARK[7]}; }
        }
        :root[data-theme="dark"] .viz-root {
          --s1:${SERIES_DARK[0]}; --s2:${SERIES_DARK[1]}; --s3:${SERIES_DARK[2]};
          --s4:${SERIES_DARK[3]}; --s5:${SERIES_DARK[4]}; --s6:${SERIES_DARK[5]};
          --s7:${SERIES_DARK[6]}; --s8:${SERIES_DARK[7]}; }
      `}</style>

      <svg
        viewBox="0 0 1000 46"
        preserveAspectRatio="none"
        role="img"
        aria-label={label}
        className="h-[46px] w-full"
      >
        <defs>
          <clipPath id={`round-${domId}`}>
            <rect x="0" y="0" width="1000" height="46" rx="5" />
          </clipPath>

          {/* Hachures pour le marché que personne n'a servi : ni un
              concurrent, ni un aplat de couleur — une tranche vide, mais
              nommée. `patternTransform` plutôt qu'un motif oblique tracé à la
              main, la viewBox étant étirée sans conserver les proportions. */}
          <pattern
            id={`unserved-${domId}`}
            width="8"
            height="8"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(35)"
          >
            <rect width="8" height="8" fill="var(--surface-muted)" />
            <line x1="0" y1="0" x2="0" y2="8" stroke="var(--foreground-muted)" strokeWidth="2.5" />
          </pattern>
        </defs>

        <g clipPath={`url(#round-${domId})`}>
          {segments.map((seg, position) => {
            const isViewer = seg.key === highlightKey;
            const dim = hovered !== null && hovered !== seg.key;
            return (
              <rect
                key={seg.key}
                x={seg.x}
                y={0}
                width={Math.max(seg.width - GAP, 0)}
                height={H}
                fill={fillOf(seg, position)}
                opacity={dim ? 0.35 : 1}
                style={{ transition: 'opacity 160ms ease' }}
                onMouseEnter={() => setHovered(seg.key)}
                onMouseLeave={() => setHovered(null)}
              >
                {/* Une seule chaîne : React refuse un tableau de nœuds dans
                    <title>, que le navigateur aplatirait de toute façon en
                    texte — d'où une erreur d'hydratation. */}
                <title>{`${seg.label}${isViewer ? ' (vous)' : ''} — ${formatPct(seg.value, 1)}`}</title>
              </rect>
            );
          })}
        </g>

        {/* Liseré autour de la tranche de l'équipe qui regarde : l'identité ne
            doit jamais reposer sur la seule couleur. */}
        {segments
          .filter((s) => s.key === highlightKey && s.width > 6)
          .map((seg) => (
            <rect
              key={`${seg.key}-ring`}
              x={seg.x + 1}
              y={1}
              width={Math.max(seg.width - GAP - 2, 0)}
              height={H - 2}
              fill="none"
              stroke="var(--foreground)"
              strokeWidth={2}
              rx={4}
              vectorEffect="non-scaling-stroke"
            />
          ))}
      </svg>

      {/* Étiquettes directes sous la barre — c'est la « relief rule » : trois
          teintes de la palette passent sous 3:1 sur fond clair, l'identité doit
          donc être portée aussi par du texte. */}
      <figcaption className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
        {segments.map((seg, position) => (
          <span
            key={seg.key}
            className="flex items-center gap-2 text-sm"
            onMouseEnter={() => setHovered(seg.key)}
            onMouseLeave={() => setHovered(null)}
          >
            <span
              aria-hidden
              className="inline-block h-3 w-3 shrink-0 rounded-sm"
              style={
                seg.kind === 'unserved'
                  ? {
                      background: 'var(--surface-muted)',
                      border: '1px solid var(--foreground-muted)',
                    }
                  : { background: fillOf(seg, position) }
              }
            />
            <span
              className={
                seg.key === highlightKey
                  ? 'font-semibold'
                  : seg.kind === 'team'
                    ? ''
                    : 'text-(--foreground-muted)'
              }
            >
              {seg.label}
              {seg.key === highlightKey ? ' (vous)' : ''}
            </span>
            <span className="tabular text-(--foreground-muted)">
              {formatPct(seg.value, 1)}
            </span>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
