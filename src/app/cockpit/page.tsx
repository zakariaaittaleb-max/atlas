import Link from 'next/link';

import { KpiCard } from '@/components/kpi-card';
import { getRoundState, requireTeam } from '@/lib/dal';
import {
  delta,
  formatMadCompact,
  formatPct,
  formatScore,
  treasuryLabel,
} from '@/lib/format';
import { createServerClient } from '@/lib/supabase/server';

export const metadata = { title: 'Atlas — Cockpit' };

export default async function CockpitPage() {
  const team = await requireTeam();
  const round = await getRoundState(team.sessionId);
  const currentRound = (round?.current_round as number) ?? 0;

  // Lecture par le client ANONYME, donc soumise à la RLS : cette page ne peut
  // structurellement pas afficher les données d'une autre équipe, même si le
  // code en faisait la demande.
  const supabase = await createServerClient();

  const [{ data: states }, { data: pnls }, { data: alignments }] = await Promise.all([
    supabase
      .from('team_round_state')
      .select('*')
      .eq('team_id', team.teamId)
      .order('round_number', { ascending: false })
      .limit(2),
    supabase
      .from('pnl_statements')
      .select('*')
      .eq('team_id', team.teamId)
      .order('round_number', { ascending: false })
      .limit(2),
    supabase
      .from('alignment_scores')
      .select('*')
      .eq('team_id', team.teamId)
      .order('round_number', { ascending: false })
      .limit(2),
  ]);

  const state = states?.[0];
  const previousState = states?.[1];
  const pnl = pnls?.[0];
  const previousPnl = pnls?.[1];
  const alignment = alignments?.[0];
  const previousAlignment = alignments?.[1];

  const hasResults = Boolean(pnl);

  return (
    <main className="mx-auto w-full min-w-0 max-w-6xl px-6 py-10">
      <header className="mb-10 flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{team.teamName}</h1>
          <p className="mt-1 text-(--foreground-muted)">
            {currentRound === 0 ? 'Onboarding (T0)' : `Tour ${currentRound}`}
            {round?.planned_rounds ? ` sur ${round.planned_rounds} prévus` : null}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {state?.treasury_status && state.treasury_status !== 'sain' ? (
            <p className="rounded-lg border border-(--warning) px-4 py-2 text-sm font-medium text-(--warning)">
              Trésorerie {treasuryLabel(state.treasury_status as string).toLowerCase()}
            </p>
          ) : null}
          <Link
            href="/sus"
            className="rounded-lg border border-(--border) px-4 py-2 text-sm font-medium text-(--foreground-muted) hover:bg-(--surface-muted)"
          >
            Donner mon avis sur Atlas
          </Link>
        </div>
      </header>

      {!hasResults ? (
        <section className="rounded-xl border border-(--border) bg-(--surface) p-8">
          <h2 className="text-xl font-medium">Aucun tour résolu pour l’instant</h2>
          <p className="mt-3 max-w-2xl text-(--foreground-muted)">
            Vos indicateurs apparaîtront ici après la résolution du premier tour. D’ici là,
            saisissez vos décisions et commandez vos premières études auprès du cabinet — sans
            elles, vous jouerez à l’aveugle.
          </p>
        </section>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <KpiCard
              label="Trésorerie"
              value={formatMadCompact(pnl?.treasury_end_mad as number)}
              delta={delta(
                pnl?.treasury_end_mad as number,
                previousPnl?.treasury_end_mad as number,
                (v) => formatMadCompact(v),
              )}
              hint={
                state?.treasury_status && state.treasury_status !== 'sain'
                  ? treasuryLabel(state.treasury_status as string)
                  : undefined
              }
            />
            <KpiCard
              label="Chiffre d’affaires"
              value={formatMadCompact(pnl?.revenue_mad as number)}
              delta={delta(
                pnl?.revenue_mad as number,
                previousPnl?.revenue_mad as number,
                (v) => formatMadCompact(v),
              )}
            />
            <KpiCard
              label="Résultat net"
              value={formatMadCompact(pnl?.net_income_mad as number)}
              delta={delta(
                pnl?.net_income_mad as number,
                previousPnl?.net_income_mad as number,
                (v) => formatMadCompact(v),
              )}
            />
            <KpiCard
              label="Indice d’alignement"
              value={formatScore(alignment?.ia_final as number)}
              delta={delta(
                alignment?.ia_final as number,
                previousAlignment?.ia_final as number,
              )}
              hint={
                alignment?.stuck_in_the_middle
                  ? 'Diagnostic : milieu de gué'
                  : alignment?.strategic_drift
                    ? 'Diagnostic : dérive stratégique'
                    : undefined
              }
            />
            <KpiCard
              label="Climat social"
              value={formatScore(state?.climat_social as number)}
              delta={delta(state?.climat_social as number, previousState?.climat_social as number)}
            />
            <KpiCard
              label="Prime de marge liée à l’alignement"
              value={formatPct((state?.margin_premium_pct as number) ?? 0, 1)}
              hint="Une entreprise cohérente exécute mieux : la prime joue sur la marge, pas sur les parts."
            />
          </section>

          {alignment?.stuck_in_the_middle || alignment?.strategic_drift ? (
            <section className="mt-8 rounded-xl border border-(--warning) bg-(--surface) p-6">
              <h2 className="text-lg font-medium">Le cabinet a relevé une incohérence</h2>
              <p className="mt-2 max-w-3xl text-(--foreground-muted)">
                {alignment.stuck_in_the_middle
                  ? 'Vos décisions ne correspondent à aucune stratégie cohérente : ni assez bon marché pour gagner sur les coûts, ni assez distinctives pour justifier un premium.'
                  : `Vous déclarez « ${alignment.drift_declared} » mais vos décisions exécutent « ${alignment.drift_actual} ». Re-déclarer au tour prochain efface ce malus, sans coût de transition.`}
              </p>
              <p className="mt-3 text-sm text-(--foreground-muted)">
                Le détail axe par axe s’obtient en commandant un audit d’alignement.
              </p>
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}
