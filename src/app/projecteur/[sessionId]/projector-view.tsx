'use client';

/**
 * ATLAS — vue projecteur.
 *
 * Conçue pour être lue **à cinq mètres, dans une salle éclairée**. D'où :
 *   • des corps de texte très supérieurs à ceux du reste de l'application ;
 *   • aucune interaction — personne ne clique sur un mur ;
 *   • un rafraîchissement automatique à la résolution, pour que le formateur
 *     n'ait pas à toucher son ordinateur au moment où toute la salle regarde.
 *
 * Ce qu'elle montre : le CLASSEMENT du pool, jamais le détail des décisions
 * d'une équipe (doc 00 §10). Les coûts, l'alignement et la trésorerie restent
 * hors de l'écran commun.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { createClient } from '@/lib/supabase/client';
import { DasDot } from '@/components/ui/das-dot';
import { formatMadCompact, formatPct, formatSharePoints, sessionStatusLabel } from '@/lib/format';

export interface PoolStanding {
  dasId: string;
  dasName: string;
  unservedShare: number;
  installedShare: number;
  rows: {
    teamId: string;
    teamName: string;
    /** La marque que l'équipe a donnée à SON domaine ici. `null` faute de nom choisi. */
    brandName: string | null;
    isLiquidated: boolean;
    marketSharePct: number;
    revenueMad: number;
    competitivenessScore: number;
    deltaPts: number | null;
  }[];
}

export interface ProjectedShock {
  name: string;
  description: string;
  nature: string;
  dasName: string;
  roundsRemaining: number;
}

export function ProjectorView({
  sessionId, sessionName, status, roundNumber, plannedRounds, standings, visualStyle,
  scene, progress, deadline, shock,
}: {
  /** Scène choisie par le facilitateur ; `auto` suit l'état du tour. */
  scene: string;
  progress: { submitted: number; teams: number };
  /** Heure de fin annoncée du tour, si le facilitateur en a fixé une. */
  deadline: string | null;
  shock: ProjectedShock | null;
  /** Style choisi par le facilitateur pour la session. */
  visualStyle: 'corporate' | 'ludique';
  sessionId: string; sessionName: string; status: string;
  roundNumber: number; plannedRounds: number; standings: PoolStanding[];
}) {
  const router = useRouter();

  const effective =
    scene !== 'auto' ? scene
    : status === 'round_active' || status === 'onboarding' ? 'avancement'
    : status === 'round_locked' || status === 'round_resolving' ? 'calcul'
    : status === 'round_resolved' || status === 'completed' ? 'classement'
    : 'pause';

  // Rafraîchissement automatique : le formateur ne doit pas avoir à toucher son
  // clavier au moment où toute la salle regarde l'écran.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`projector:${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'atlas', table: 'game_sessions', filter: `id=eq.${sessionId}` },
        () => router.refresh(),
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [sessionId, router]);

  return (
    // `data-surface="projection"` : palier de contraste renforcé (7:1) pour une
    // lecture à cinq mètres, sur un vidéoprojecteur qui délave les couleurs.
    <main
      data-surface="projection"
      data-style={visualStyle === 'ludique' ? 'ludique' : undefined}
      className="min-h-screen bg-(--background) px-10 py-8 text-(--foreground)"
    >
      <header className="mb-8 flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-5xl font-semibold tracking-tight">{sessionName}</h1>
        <p className="tabular text-2xl text-(--foreground-muted)">
          {roundNumber === 0 ? 'Onboarding' : `Tour ${roundNumber} / ${plannedRounds}`}
          <span className="ml-4">{sessionStatusLabel(status)}</span>
        </p>
      </header>

      {effective === 'classement' ? (standings.length === 0 ? (
        <p className="text-3xl text-(--foreground-muted)">
          Aucun résultat publié pour l’instant.
        </p>
      ) : (
        <div className="space-y-10">
          {standings.map((pool) => (
            <section key={pool.dasId}>
              <h2 className="mb-4 flex items-center gap-3 text-3xl font-medium">
                <DasDot seed={pool.dasName} className="h-4 w-4" />
                {pool.dasName}
              </h2>

              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b-2 border-(--border) text-left text-xl text-(--foreground-muted)">
                    <th scope="col" className="py-3 pr-6 font-medium">Marque</th>
                    <th scope="col" className="py-3 pr-6 text-right font-medium">Part de marché</th>
                    <th scope="col" className="py-3 pr-6 text-right font-medium">Variation</th>
                    <th scope="col" className="py-3 text-right font-medium">Chiffre d’affaires</th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {pool.rows.map((row, rank) => (
                    <tr key={row.teamId} className="border-b border-(--border) last:border-0">
                      <th scope="row" className="py-4 pr-6 text-left text-3xl font-medium">
                        <span className="mr-4 text-(--foreground-muted)">{rank + 1}</span>
                        {row.brandName ?? row.teamName}
                        {row.brandName ? (
                          <span className="ml-3 text-lg font-normal text-(--foreground-muted)">
                            {row.teamName}
                          </span>
                        ) : null}
                        {row.isLiquidated ? (
                          <span className="ml-3 text-xl text-(--negative)">liquidée</span>
                        ) : null}
                      </th>
                      <td className="py-4 pr-6 text-right text-4xl font-semibold">
                        {formatPct(row.marketSharePct, 1)}
                      </td>
                      <td
                        className="py-4 pr-6 text-right text-2xl"
                        style={{
                          color:
                            row.deltaPts === null ? 'var(--foreground-muted)'
                            : row.deltaPts >= 0 ? 'var(--positive)' : 'var(--negative)',
                        }}
                      >
                        {formatSharePoints(row.deltaPts)}
                      </td>
                      <td className="py-4 text-right text-2xl text-(--foreground-muted)">
                        {formatMadCompact(row.revenueMad)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {pool.installedShare > 0.001 ? (
                <p className="mt-4 text-2xl text-(--foreground-muted)">
                  {formatPct(pool.installedShare, 1)} du marché est servi par les entreprises
                  déjà installées, hors jeu.
                </p>
              ) : null}

              {pool.unservedShare > 0.001 ? (
                <p className="mt-2 text-2xl text-(--warning)">
                  {formatPct(pool.unservedShare, 1)} du marché n’a été servi par personne.
                </p>
              ) : null}
            </section>
          ))}
        </div>
      )) : effective === 'avancement' ? (
        <ProgressScene progress={progress} deadline={deadline} />
      ) : effective === 'carte' ? (
        <ShockScene shock={shock} />
      ) : effective === 'calcul' ? (
        <section aria-live="polite" className="mt-16">
          <p className="text-7xl font-semibold tracking-tight text-(--heading)">Calcul en cours</p>
          <p className="mt-6 text-4xl text-(--foreground-muted)">
            Toutes les équipes découvriront les résultats au même instant.
          </p>
        </section>
      ) : (
        <section className="mt-16">
          <p className="text-7xl font-semibold tracking-tight text-(--heading)">Échange en salle</p>
          <p className="mt-6 text-4xl text-(--foreground-muted)">Le jeu reprend dans un instant.</p>
        </section>
      )}
    </main>
  );
}

/** L'heure courante, rafraîchie chaque seconde après le montage — jamais au rendu serveur. */
function useNow(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, []);
  return now;
}

function formatClock(ms: number): string {
  const total = Math.max(Math.ceil(ms / 1000), 0);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Combien d'équipes ont soumis, et le temps annoncé qui reste. Aucune équipe n'est nommée. */
function ProgressScene({
  progress, deadline,
}: { progress: { submitted: number; teams: number }; deadline: string | null }) {
  const now = useNow();
  const remaining = deadline && now !== null ? new Date(deadline).getTime() - now : null;
  const pct = progress.teams > 0 ? (progress.submitted / progress.teams) * 100 : 0;

  return (
    <section aria-label="Avancement du tour" className="mt-12 grid gap-16 lg:grid-cols-2">
      <div>
        <p className="text-3xl text-(--foreground-muted)">Équipes ayant soumis leur tour</p>
        <p className="tabular mt-4 font-mono text-[8rem] leading-none font-semibold">
          {progress.submitted}
          <span className="text-(--foreground-muted)"> / {progress.teams}</span>
        </p>
        <div
          role="progressbar"
          aria-label="Équipes ayant soumis"
          aria-valuemin={0}
          aria-valuemax={progress.teams}
          aria-valuenow={progress.submitted}
          className="mt-10 h-5 w-full overflow-hidden rounded-full bg-(--surface-muted)"
        >
          <div className="h-full rounded-full bg-(--accent)" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div>
        <p className="text-3xl text-(--foreground-muted)">Temps restant</p>
        <p className="tabular mt-4 font-mono text-[8rem] leading-none font-semibold">
          {remaining === null ? '—' : formatClock(remaining)}
        </p>
        {remaining !== null && remaining <= 0 ? (
          <p className="mt-6 text-3xl font-semibold text-(--warning)">Le temps annoncé est écoulé</p>
        ) : deadline === null ? (
          <p className="mt-6 text-2xl text-(--foreground-muted)">Pas d’heure de fin annoncée</p>
        ) : null}
      </div>
    </section>
  );
}

/** La carte en cours : ce que les équipes lisent dans leur War Room, en grand. */
function ShockScene({ shock }: { shock: ProjectedShock | null }) {
  if (!shock) {
    return <p className="mt-16 text-4xl text-(--foreground-muted)">Aucune carte déclenchée pour l’instant.</p>;
  }
  const threat = shock.nature !== 'opportunite';
  return (
    <section aria-label="Carte en cours" className="mt-12 max-w-6xl">
      <p
        className={`inline-flex rounded-full px-6 py-2 text-2xl font-semibold ${
          threat ? 'bg-(--negative-subtle) text-(--negative)' : 'bg-(--positive-subtle) text-(--positive)'
        }`}
      >
        {threat ? 'Menace' : 'Opportunité'} · {shock.dasName}
      </p>
      <h2 className="mt-8 text-7xl font-semibold tracking-tight text-(--heading)">{shock.name}</h2>
      {shock.description ? (
        <p className="mt-8 max-w-5xl text-4xl leading-snug">{shock.description}</p>
      ) : null}
      <p className="tabular mt-10 text-2xl text-(--foreground-muted)">
        {shock.roundsRemaining >= 99
          ? 'Effet permanent'
          : `${shock.roundsRemaining} tour${shock.roundsRemaining > 1 ? 's' : ''} d’effet`}
        {' · '}plans de riposte à rédiger dans la War Room
      </p>
    </section>
  );
}
