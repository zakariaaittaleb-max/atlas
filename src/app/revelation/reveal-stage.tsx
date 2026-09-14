'use client';

/**
 * ATLAS — la révélation mise en scène.
 *
 * La révélation est le moment que la salle attend depuis trois quarts d'heure :
 * les résultats tombaient d'un bloc, comme un rapport. Ils arrivent désormais
 * en séquence — compte à rebours, puis le poids du groupe, sa variation, la
 * part de chaque domaine et enfin le rang — avant l'analyse détaillée.
 *
 * Trois garde-fous :
 *   • une fois par tour et par appareil : relire ses résultats ne rejoue pas
 *     le spectacle (voir `useRevealSeen`) ;
 *   • « Passer la mise en scène » est toujours à portée, et reçoit le focus ;
 *   • en mouvement réduit, pas de compte à rebours ni de défilement : tout
 *     s'affiche d'un coup, la séquence se réduit à un fondu.
 *
 * Chaque étape réserve sa place avant d'apparaître : rien ne saute à l'écran.
 */

import { ArrowRight } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { formatMadCompact, formatPct, formatSharePoints } from '@/lib/format';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';

export interface StageShare {
  dasId: string;
  name: string;
  share: number;
  previous: number | null;
}

const COUNTDOWN = [3, 2, 1];
const COUNT_MS = 900;
const BEAT_MS = 1300;
/** Poids, variation, parts de marché, rang. */
const BEATS = 4;

// ── Une fois par tour ──────────────────────────────────────────────────────
const SEEN_EVENT = 'atlas:revelation-vue';

/**
 * La révélation de ce tour a-t-elle déjà été jouée sur cet appareil ?
 * Stockage indisponible (navigation privée, blocage) : on la tient pour vue,
 * plutôt que de rejouer le spectacle à chaque visite.
 */
export function useRevealSeen(key: string): boolean {
  return useSyncExternalStore(
    (callback) => {
      window.addEventListener(SEEN_EVENT, callback);
      window.addEventListener('storage', callback);
      return () => {
        window.removeEventListener(SEEN_EVENT, callback);
        window.removeEventListener('storage', callback);
      };
    },
    () => {
      try {
        return window.localStorage.getItem(key) === 'vue';
      } catch {
        return true;
      }
    },
    () => true,
  );
}

export function markRevealSeen(key: string) {
  try {
    window.localStorage.setItem(key, 'vue');
  } catch {
    // Sans stockage, la révélation est déjà tenue pour vue.
  }
  window.dispatchEvent(new Event(SEEN_EVENT));
}

// ── Compteur qui monte jusqu'à sa valeur ───────────────────────────────────
function useCountUp(target: number, run: boolean): number {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!run) return;
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min((now - start) / 1200, 1);
      setProgress(p);
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [run]);

  if (!run) return target;
  return target * (1 - Math.pow(1 - progress, 3));
}

export function RevealStage({
  weight, previousWeight, rank, groupsCount, revenueMad, poolRevenueMad, shares, onDone,
}: {
  weight: number;
  /** `null` au premier tour : rien à comparer. */
  previousWeight: number | null;
  rank: number;
  groupsCount: number;
  revenueMad: number;
  poolRevenueMad: number;
  shares: StageShare[];
  onDone: () => void;
}) {
  const reduced = usePrefersReducedMotion();
  const total = COUNTDOWN.length + BEATS;
  const [tick, setTick] = useState(0);
  const skipRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    skipRef.current?.focus();
  }, []);

  useEffect(() => {
    if (reduced || tick >= total) return;
    const id = window.setTimeout(
      () => setTick((t) => t + 1),
      tick < COUNTDOWN.length ? COUNT_MS : BEAT_MS,
    );
    return () => window.clearTimeout(id);
  }, [tick, reduced, total]);

  const step = reduced ? total : tick;
  const counting = step < COUNTDOWN.length;
  const beat = step - COUNTDOWN.length;
  const shownWeight = useCountUp(weight, !reduced && beat >= 0);
  const delta = previousWeight === null ? null : weight - previousWeight;

  const reveal = (from: number) =>
    beat >= from ? 'motion-safe:animate-[atlas-rise_600ms_ease-out_both]' : 'invisible';

  const announcement =
    counting ? 'La révélation commence.'
    : beat >= 3 ? `Rang ${rank} sur ${groupsCount}. Poids dans le pool : ${formatPct(weight, 1)}.`
    : `Votre poids dans le pool : ${formatPct(weight, 1)}.`;

  return (
    <section
      aria-labelledby="scene-revelation"
      className="relative overflow-hidden rounded-xl border border-(--border) bg-(--surface) px-6 pt-16 pb-10 text-center sm:px-10"
    >
      <h2 id="scene-revelation" className="sr-only">Révélation du tour</h2>
      <p role="status" className="sr-only">{announcement}</p>

      <button
        ref={skipRef}
        type="button"
        onClick={onDone}
        className="absolute top-4 right-4 min-h-10 rounded-lg px-3 text-sm font-medium text-(--foreground-muted) transition-colors hover:bg-(--surface-muted) hover:text-(--foreground)"
      >
        Passer la mise en scène
      </button>

      {counting ? (
        <div className="flex min-h-[26rem] items-center justify-center">
          <p
            aria-hidden
            key={step}
            className="tabular font-mono text-[9rem] leading-none font-semibold text-(--accent-text) motion-safe:animate-[atlas-count_900ms_ease-out_both]"
          >
            {COUNTDOWN[step]}
          </p>
        </div>
      ) : (
        <div className="mx-auto max-w-2xl space-y-9">
          <div className="motion-safe:animate-[atlas-rise_600ms_ease-out_both]">
            <p className="text-lg text-(--foreground-muted)">Votre poids dans le pool</p>
            <p className="tabular mt-2 text-7xl font-semibold tracking-tight sm:text-8xl">
              {formatPct(shownWeight, 1)}
            </p>
          </div>

          <p
            className={`tabular text-2xl font-medium ${reveal(1)}`}
            style={{
              color: delta === null ? 'var(--foreground-muted)' : delta >= 0 ? 'var(--positive)' : 'var(--negative)',
            }}
          >
            {delta === null ? 'Premier tour : pas encore de comparaison' : `${formatSharePoints(delta)} pts depuis le tour précédent`}
          </p>

          {shares.length > 0 ? (
            <ul className={`mx-auto grid max-w-xl gap-2 text-left ${beat >= 2 ? '' : 'invisible'}`}>
              {shares.map((s, index) => {
                const change = s.previous === null ? null : s.share - s.previous;
                return (
                  <li
                    key={s.dasId}
                    className="tabular flex items-baseline justify-between gap-4 rounded-lg bg-(--surface-muted) px-4 py-3 motion-safe:animate-[atlas-rise_600ms_ease-out_both]"
                    style={{ animationDelay: beat >= 2 ? `${index * 250}ms` : undefined }}
                  >
                    <span className="min-w-0 font-medium">{s.name}</span>
                    <span className="flex items-baseline gap-3">
                      <strong className="font-mono text-2xl font-semibold">{formatPct(s.share, 1)}</strong>
                      {change !== null ? (
                        <span style={{ color: change >= 0 ? 'var(--positive)' : 'var(--negative)' }}>
                          {formatSharePoints(change)} pts
                        </span>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}

          <div className={reveal(3)}>
            <p className="text-lg text-(--foreground-muted)">Classement du pool</p>
            <p className="tabular mt-1 text-5xl font-semibold text-(--heading)">
              {rank}<sup className="text-2xl">{rank === 1 ? 'er' : 'e'}</sup>
              <span className="text-2xl font-normal text-(--foreground-muted)"> sur {groupsCount}</span>
            </p>
            <p className="mt-3 text-sm text-(--foreground-muted)">
              <span className="tabular">{formatMadCompact(revenueMad)}</span> de chiffre d’affaires sur{' '}
              <span className="tabular">{formatMadCompact(poolRevenueMad)}</span> cumulés par le pool.
            </p>
          </div>

          <div className={reveal(4)}>
            <button
              type="button"
              onClick={onDone}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-(--accent) px-6 font-medium text-(--on-accent) transition-colors hover:bg-(--accent-hover)"
            >
              Voir l’analyse complète
              <ArrowRight aria-hidden className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
