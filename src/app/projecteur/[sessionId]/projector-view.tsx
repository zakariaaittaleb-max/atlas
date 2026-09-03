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

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { createClient } from '@/lib/supabase/client';
import { formatMadCompact, formatPct, formatSharePoints, sessionStatusLabel } from '@/lib/format';

export interface PoolStanding {
  dasId: string;
  dasName: string;
  unservedShare: number;
  rows: {
    teamId: string;
    teamName: string;
    isLiquidated: boolean;
    marketSharePct: number;
    revenueMad: number;
    competitivenessScore: number;
    deltaPts: number | null;
  }[];
}

export function ProjectorView({
  sessionId, sessionName, status, roundNumber, plannedRounds, standings,
}: {
  sessionId: string; sessionName: string; status: string;
  roundNumber: number; plannedRounds: number; standings: PoolStanding[];
}) {
  const router = useRouter();

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
    <main className="min-h-screen px-10 py-8">
      <header className="mb-8 flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-5xl font-semibold tracking-tight">{sessionName}</h1>
        <p className="tabular text-2xl text-(--foreground-muted)">
          {roundNumber === 0 ? 'Onboarding' : `Tour ${roundNumber} / ${plannedRounds}`}
          <span className="ml-4">{sessionStatusLabel(status)}</span>
        </p>
      </header>

      {standings.length === 0 ? (
        <p className="text-3xl text-(--foreground-muted)">
          Aucun résultat publié pour l’instant.
        </p>
      ) : (
        <div className="space-y-10">
          {standings.map((pool) => (
            <section key={pool.dasId}>
              <h2 className="mb-4 text-3xl font-medium">{pool.dasName}</h2>

              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b-2 border-(--border) text-left text-xl text-(--foreground-muted)">
                    <th className="py-3 pr-6 font-medium">Équipe</th>
                    <th className="py-3 pr-6 text-right font-medium">Part de marché</th>
                    <th className="py-3 pr-6 text-right font-medium">Variation</th>
                    <th className="py-3 text-right font-medium">Chiffre d’affaires</th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {pool.rows.map((row, rank) => (
                    <tr key={row.teamId} className="border-b border-(--border) last:border-0">
                      <td className="py-4 pr-6 text-3xl font-medium">
                        <span className="mr-4 text-(--foreground-muted)">{rank + 1}</span>
                        {row.teamName}
                        {row.isLiquidated ? (
                          <span className="ml-3 text-xl text-(--negative)">liquidée</span>
                        ) : null}
                      </td>
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

              {pool.unservedShare > 0.001 ? (
                <p className="mt-4 text-2xl text-(--warning)">
                  {formatPct(pool.unservedShare, 1)} du marché n’a été servi par personne.
                </p>
              ) : null}
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
