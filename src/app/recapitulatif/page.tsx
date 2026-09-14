import 'server-only';

/**
 * ATLAS — le récapitulatif du tour, avant de le soumettre.
 *
 * Plusieurs ordinateurs par équipe : chacun saisit sa partie, et personne ne
 * voyait l'ensemble avant le verrouillage. Cet écran rassemble ce que l'équipe
 * s'apprête à engager — argent, choix du Groupe, choix de chaque domaine — et
 * ce qui manque encore, sur une seule page qu'on relit ensemble avant de
 * soumettre.
 */

import Link from 'next/link';

import { isOn } from '@/lib/modules-state';
import { formatMadCompact, strategyLabel } from '@/lib/format';
import { loadDecisionContext, missingDecisions } from '@/lib/server/decision-context';
import { loadEnabledModules } from '@/lib/server/modules';
import { loadMoneyBar } from '@/lib/server/money-bar';
import { createServerClient } from '@/lib/supabase/server';

import { SubmitRound } from './submit-round';

export const metadata = { title: 'Atlas — Récapitulatif du tour' };
export const dynamic = 'force-dynamic';

/** « diversification_liee » → « Diversification liee » : lisible sans table de libellés à maintenir. */
function humanize(key: string | null | undefined): string {
  if (!key) return '—';
  const text = key.replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function signedMad(value: number): string {
  if (value === 0) return 'aucun';
  return `${value > 0 ? 'emprunt de ' : 'remboursement de '}${formatMadCompact(Math.abs(value))}`;
}

export default async function RecapPage() {
  const context = await loadDecisionContext();
  const supabase = await createServerClient();
  const [modules, money, { data: submission }] = await Promise.all([
    loadEnabledModules(context.team.sessionId),
    loadMoneyBar(),
    supabase
      .from('team_round_submissions')
      .select('submitted_at')
      .eq('team_id', context.team.teamId)
      .eq('round_number', context.roundNumber)
      .maybeSingle(),
  ]);

  const missing = missingDecisions(context, modules);
  const { corporate, finance } = context;
  const showProcurement = isOn(modules, 'marches.procurement');
  const showDistribution = isOn(modules, 'marches.distribution');

  return (
    <main className="mx-auto w-full min-w-0 max-w-5xl px-6 py-8 lg:py-10">
      <header className="mb-6">
        <p className="text-xs font-semibold tracking-wider text-(--accent-text) uppercase">
          Tour {context.roundNumber} · soumission
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-(--heading)">Récapitulatif du tour</h1>
      </header>

      <div className="space-y-6">
        <section aria-label="Soumission" className="rounded-xl border border-(--border) bg-(--surface) p-6">
          <SubmitRound
            submittedAt={submission?.submitted_at ? String(submission.submitted_at) : null}
            missingCount={missing.length}
            decisionsOpen={context.decisionsOpen}
          />

          {missing.length > 0 ? (
            <div className="mt-5 border-t border-(--border) pt-4">
              <h2 className="text-sm font-semibold">À compléter</h2>
              <ul className="mt-2 flex flex-wrap gap-2">
                {missing.map((m) => (
                  <li key={m.href + m.label}>
                    <Link
                      href={m.href}
                      className="inline-flex min-h-9 items-center rounded-lg border border-(--border) px-3 text-sm font-medium hover:border-(--accent)"
                    >
                      {m.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        {money ? (
          <section aria-labelledby="recap-argent" className="rounded-xl border border-(--border) bg-(--surface) p-6">
            <h2 id="recap-argent" className="text-xl font-semibold text-(--heading)">L’argent du tour</h2>
            <dl className="tabular mt-4 grid gap-4 sm:grid-cols-3">
              <Fact label="Vous disposez de" value={formatMadCompact(money.availableMad)} />
              <Fact label="Engagé ce tour" value={formatMadCompact(money.engagedMad)} />
              <Fact
                label="Il vous reste"
                value={formatMadCompact(money.availableMad - money.engagedMad)}
                tone={money.availableMad - money.engagedMad < 0 ? 'negative' : undefined}
              />
            </dl>
          </section>
        ) : null}

        <section aria-labelledby="recap-groupe" className="rounded-xl border border-(--border) bg-(--surface) p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="recap-groupe" className="text-xl font-semibold text-(--heading)">Le Groupe</h2>
            <span className="flex flex-wrap gap-3 text-sm">
              <Link href="/strategie" className="font-medium text-(--accent-text) underline underline-offset-4">Modifier la stratégie</Link>
              <Link href="/finance" className="font-medium text-(--accent-text) underline underline-offset-4">Modifier la finance</Link>
            </span>
          </div>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Fact
              label="Logique de portefeuille"
              value={humanize(corporate.corporateStrategy)}
              note={context.corporateRecorded ? undefined : 'reconduite, pas encore validée ce tour'}
            />
            <Fact label="Structure" value={humanize(corporate.structureType)} />
            <Fact label="Valeurs communiquées" value={`${humanize(corporate.value1)} · ${humanize(corporate.value2)}`} />
            <Fact label="Frais de siège" value={formatMadCompact(finance.opexMad)} />
            <Fact label="Crédit du tour" value={signedMad(finance.netCreditMad)} />
            <Fact
              label="Levée · dividende"
              value={`${formatMadCompact(finance.capitalRaisedMad)} · ${formatMadCompact(finance.dividendMad)}`}
              note={context.financeRecorded ? undefined : 'budget pas encore validé ce tour'}
            />
          </dl>
        </section>

        <section aria-labelledby="recap-das" className="rounded-xl border border-(--border) bg-(--surface) p-6">
          <h2 id="recap-das" className="text-xl font-semibold text-(--heading)">Vos domaines</h2>
          <div className="mt-4 min-w-0 overflow-x-auto">
            <table className="w-full min-w-[44rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-(--border) text-left text-(--foreground-muted)">
                  <th scope="col" className="py-2 pr-4 font-medium">Domaine</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Stratégie</th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">Prix</th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">Segments</th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">Investi</th>
                  <th scope="col" className="py-2 font-medium">Volets</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {context.das.map((das) => {
                  const d = das.decision;
                  const invested =
                    d.capexCapacityMad + d.capexAutomationMad + d.capexOwnNetworkMad +
                    d.rdBudgetMad + d.marketingBudgetMad;
                  const volets: [string, boolean][] = [
                    ['stratégie', das.progress.strategy],
                    ['RH', das.progress.hr],
                    ...(showProcurement ? [['achats', das.progress.procurement] as [string, boolean]] : []),
                    ...(showDistribution ? [['distribution', das.progress.distribution] as [string, boolean]] : []),
                  ];
                  return (
                    <tr key={das.dasId} className="border-b border-(--border) last:border-0 align-top">
                      <th scope="row" className="py-3 pr-4 text-left font-medium">{das.name}</th>
                      <td className="py-3 pr-4">{strategyLabel(d.genericStrategy)}</td>
                      <td className="py-3 pr-4 text-right font-mono">{Math.round(60 + d.pricePosition * 0.8)} %</td>
                      <td className="py-3 pr-4 text-right font-mono">{d.servedSegments.length} / {das.segments.length}</td>
                      <td className="py-3 pr-4 text-right font-mono">{formatMadCompact(invested)}</td>
                      <td className="py-3">
                        <ul className="flex flex-wrap gap-x-3 gap-y-1">
                          {volets.map(([label, done]) => (
                            <li key={label} className={done ? 'text-(--positive)' : 'text-(--foreground-muted)'}>
                              <span aria-hidden>{done ? '✓' : '○'}</span> {label}
                              <span className="sr-only">{done ? ' : fait' : ' : à faire'}</span>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-(--foreground-muted)">
            Prix en pourcentage du prix de marché. Investi : capacité, automatisation, réseau propre, R&amp;D et marketing.
          </p>
        </section>
      </div>
    </main>
  );
}

function Fact({
  label, value, note, tone,
}: { label: string; value: string; note?: string; tone?: 'negative' }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-(--foreground-muted)">{label}</dt>
      <dd className={`mt-0.5 font-semibold ${tone === 'negative' ? 'text-(--negative)' : ''}`}>{value}</dd>
      {note ? <dd className="text-sm text-(--warning)">{note}</dd> : null}
    </div>
  );
}
