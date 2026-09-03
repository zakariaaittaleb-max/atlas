'use client';

/**
 * ATLAS — achats et distribution : plans 4 et 5 du cahier.
 *
 * C'est ici que se jouent les deux forces de Porter les plus concrètes du jeu :
 * le pouvoir du fournisseur et celui du distributeur.
 *
 * L'écran affiche les ARBITRAGES, jamais les chiffres qu'on achète au cabinet.
 * Les capacités, fiabilités et marges exigées des acteurs ne sont PAS montrées :
 * une équipe qui n'a pas payé le benchmark choisit à l'aveugle — et c'est
 * exactement ce que le cabinet vend.
 */

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import { DecisionBar, type MissingDecision } from '@/components/decision-shell';
import { formatPct, formatUnits } from '@/lib/format';
import type { DecisionContext } from '@/lib/decision-types';
import { useAutosave } from '@/lib/use-autosave';

export function MarchesView({
  context, missing,
}: { context: DecisionContext; missing: MissingDecision[] }) {
  const router = useRouter();
  const autosave = useAutosave();
  const locked = !context.decisionsOpen;

  const [procurement, setProcurement] = useState<Record<string, { supplierId: string; committedVolume: number }[]>>(
    () => Object.fromEntries(context.das.map((d) => [d.dasId, d.procurement])),
  );
  const [distribution, setDistribution] = useState<Record<string, { distributorId: string; volumeShare: number }[]>>(
    () => Object.fromEntries(context.das.map((d) => [d.dasId, d.distribution])),
  );

  const pushProcurement = useCallback(
    (dasId: string, lines: { supplierId: string; committedVolume: number }[]) => {
      setProcurement((prev) => ({ ...prev, [dasId]: lines }));
      autosave.save({ plan: 'procurement', dasId, lines });
    },
    [autosave],
  );

  const pushDistribution = useCallback(
    (dasId: string, lines: { distributorId: string; volumeShare: number }[]) => {
      setDistribution((prev) => ({ ...prev, [dasId]: lines }));
      autosave.save({ plan: 'distribution', dasId, lines });
    },
    [autosave],
  );

  return (
    <>
      <main className="mx-auto w-full min-w-0 max-w-5xl px-6 py-10">
        <header className="mb-8">
          <p className="text-sm font-medium tracking-wide text-(--foreground-muted) uppercase">
            Tour {context.roundNumber}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Achats &amp; distribution</h1>
          <p className="mt-3 max-w-3xl text-(--foreground-muted)">
            Concentrer ses achats chez un fournisseur maximise votre pouvoir de négociation
            <em> et</em> votre risque de rupture. Se disperser fait l’inverse. Il n’y a pas de
            bonne réponse universelle — seulement une réponse cohérente avec votre stratégie.
          </p>
          <p className="mt-3 max-w-3xl rounded-lg border border-(--border) px-4 py-3 text-sm text-(--foreground-muted)">
            Les capacités, fiabilités et marges exigées de ces acteurs ne sont pas affichées ici :
            elles s’achètent auprès du <a href="/cabinet" className="underline">cabinet</a>.
            Sans benchmark, vous choisissez sur le nom.
          </p>
        </header>

        {context.das.map((das) => {
          const proc = procurement[das.dasId] ?? [];
          const dist = distribution[das.dasId] ?? [];
          const shareTotal = dist.reduce((acc, l) => acc + l.volumeShare, 0);

          return (
            <section key={das.dasId} className="mb-8 rounded-xl border border-(--border) bg-(--surface) p-6">
              <h2 className="text-xl font-medium">{das.name}</h2>

              {/* ── Amont ─────────────────────────────────────────────── */}
              <fieldset disabled={locked} className="mt-6">
                <legend className="mb-1 text-sm font-medium">Fournisseurs</legend>
                <p className="mb-3 text-xs text-(--foreground-muted)">
                  Le volume engagé détermine votre poids dans leur carnet, donc la remise
                  obtenue — jusqu’à −18 % sur le prix d’achat.
                </p>

                <ul className="space-y-2">
                  {das.suppliers.map((supplier) => {
                    const line = proc.find((l) => l.supplierId === supplier.id);
                    return (
                      <li key={supplier.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-(--border) p-3">
                        <button
                          type="button"
                          aria-pressed={Boolean(line)}
                          onClick={() =>
                            pushProcurement(
                              das.dasId,
                              line
                                ? proc.filter((l) => l.supplierId !== supplier.id)
                                : [...proc, { supplierId: supplier.id, committedVolume: 0 }],
                            )
                          }
                          className="rounded border px-2.5 py-1 text-sm"
                          style={{
                            borderColor: line ? 'var(--accent)' : 'var(--border)',
                            background: line ? 'var(--surface-muted)' : undefined,
                          }}
                        >
                          {line ? '✓ retenu' : 'retenir'}
                        </button>

                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">{supplier.name}</span>
                          {supplier.regionKey ? (
                            <span className="block text-xs text-(--foreground-muted)">
                              {supplier.regionKey.replace(/_/g, ' ')}
                            </span>
                          ) : null}
                        </span>

                        {line ? (
                          <label className="flex items-center gap-2 text-sm">
                            <span className="text-(--foreground-muted)">Volume engagé</span>
                            <input
                              type="number" min={0} step={100_000} value={line.committedVolume}
                              onChange={(e) =>
                                pushProcurement(
                                  das.dasId,
                                  proc.map((l) =>
                                    l.supplierId === supplier.id
                                      ? { ...l, committedVolume: Math.max(Number(e.target.value) || 0, 0) }
                                      : l,
                                  ),
                                )
                              }
                              className="tabular w-40 rounded-lg border border-(--border) bg-(--surface) px-3 py-1.5"
                            />
                          </label>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>

                {proc.length === 0 ? (
                  <p className="mt-3 text-sm text-(--negative)">
                    Aucun fournisseur retenu : vous achèterez au prix spot, sans remise, avec
                    une qualité d’intrants médiocre. Ne rien décider est aussi une décision.
                  </p>
                ) : (
                  <p className="tabular mt-3 text-sm text-(--foreground-muted)">
                    {proc.length} fournisseur(s) · {formatUnits(proc.reduce((a, l) => a + l.committedVolume, 0))} unités engagées
                  </p>
                )}
              </fieldset>

              {/* ── Aval ──────────────────────────────────────────────── */}
              <fieldset disabled={locked} className="mt-8 border-t border-(--border) pt-6">
                <legend className="mb-1 text-sm font-medium">Distributeurs</legend>
                <p className="mb-3 text-xs text-(--foreground-muted)">
                  On ne vend pas là où on n’est pas distribué : votre part de marché est
                  plafonnée par votre couverture. Les couvertures se recoupent — leur somme
                  n’est jamais leur union.
                </p>

                <ul className="space-y-2">
                  {das.distributors.map((distributor) => {
                    const line = dist.find((l) => l.distributorId === distributor.id);
                    return (
                      <li key={distributor.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-(--border) p-3">
                        <button
                          type="button"
                          aria-pressed={Boolean(line)}
                          onClick={() =>
                            pushDistribution(
                              das.dasId,
                              line
                                ? dist.filter((l) => l.distributorId !== distributor.id)
                                : [...dist, { distributorId: distributor.id, volumeShare: 0 }],
                            )
                          }
                          className="rounded border px-2.5 py-1 text-sm"
                          style={{
                            borderColor: line ? 'var(--accent)' : 'var(--border)',
                            background: line ? 'var(--surface-muted)' : undefined,
                          }}
                        >
                          {line ? '✓ retenu' : 'retenir'}
                        </button>

                        <span className="min-w-0 flex-1 text-sm font-medium">{distributor.name}</span>

                        {line ? (
                          <label className="flex items-center gap-2 text-sm">
                            <span className="text-(--foreground-muted)">Part du volume</span>
                            <input
                              type="range" min={0} max={100} step={5}
                              value={Math.round(line.volumeShare * 100)}
                              onChange={(e) =>
                                pushDistribution(
                                  das.dasId,
                                  dist.map((l) =>
                                    l.distributorId === distributor.id
                                      ? { ...l, volumeShare: Number(e.target.value) / 100 }
                                      : l,
                                  ),
                                )
                              }
                              className="w-40"
                            />
                            <span className="tabular w-12 text-right">{formatPct(line.volumeShare, 0)}</span>
                          </label>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>

                <p
                  className="tabular mt-3 text-sm"
                  style={{ color: shareTotal > 1.0001 ? 'var(--negative)' : 'var(--foreground-muted)' }}
                >
                  Volume confié à des tiers : {formatPct(shareTotal, 0)}
                  {shareTotal > 1.0001
                    ? ' — vous ne pouvez pas confier plus de 100 % de votre volume.'
                    : shareTotal < 1
                      ? ` · le reste (${formatPct(1 - shareTotal, 0)}) passe par votre réseau propre, s’il existe.`
                      : ''}
                </p>

                {dist.length === 0 ? (
                  <p className="mt-2 text-sm text-(--negative)">
                    Aucun distributeur : votre couverture sera nulle et vous ne vendrez rien.
                  </p>
                ) : null}
              </fieldset>
            </section>
          );
        })}
      </main>

      <DecisionBar
        state={autosave.state} pending={autosave.pending} lastError={autosave.lastError}
        missing={missing} decisionsOpen={context.decisionsOpen}
        onValidate={async () => { await autosave.flush(); router.refresh(); }}
      />
    </>
  );
}
