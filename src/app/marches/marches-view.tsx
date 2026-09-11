'use client';

/**
 * ATLAS — achats et distribution : plans 4 et 5 du cahier.
 *
 * C'est ici que se jouent les deux forces de Porter les plus concrètes du jeu :
 * le pouvoir du fournisseur et celui du distributeur.
 *
 * ── UN SEUL DOMAINE À LA FOIS ──────────────────────────────────────────────
 * L'écran ne montre QUE le domaine choisi dans la barre du haut. Les
 * fournisseurs et les distributeurs sont propres à chaque métier — une
 * conserverie et un éditeur de logiciels n'achètent pas aux mêmes gens — et les
 * empiler faisait choisir dans une liste où rien ne disait à quel domaine
 * appartenait la ligne qu'on cochait.
 *
 * ── CE QUI RESTE CACHÉ ─────────────────────────────────────────────────────
 * L'écran affiche les ARBITRAGES, jamais les chiffres qu'on achète au cabinet.
 * Les capacités, fiabilités et marges exigées des acteurs ne sont PAS montrées :
 * une équipe qui n'a pas payé le benchmark choisit à l'aveugle — et c'est
 * exactement ce que le cabinet vend.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import { useDasScope } from '@/components/das-scope';
import {
  DasChecklist, DecisionBar, NumberInput, SectionActions, type MissingDecision,
} from '@/components/decision-shell';
import { formatMadCompact, formatPct, formatScore, formatUnits } from '@/lib/format';
import type {
  DecisionContext, DistributionLine, ProcurementLine,
} from '@/lib/decision-types';
import { deepEqual } from '@/lib/deep-equal';
import { isOn, type EnabledModules } from '@/lib/modules-state';
import { useAutosave } from '@/lib/use-autosave';

import { checklistOf } from '../strategie/strategie-view';

export function MarchesView({
  context, missing, modules,
}: {
  context: DecisionContext;
  missing: MissingDecision[];
  modules: EnabledModules;
}) {
  const router = useRouter();
  const autosave = useAutosave();
  const { activeDasId } = useDasScope();
  const locked = !context.decisionsOpen;

  const [procurement, setProcurement] = useState<Record<string, ProcurementLine[]>>(
    () => Object.fromEntries(context.das.map((d) => [d.dasId, d.procurement])),
  );
  const [distribution, setDistribution] = useState<Record<string, DistributionLine[]>>(
    () => Object.fromEntries(context.das.map((d) => [d.dasId, d.distribution])),
  );

  const pushProcurement = useCallback(
    (dasId: string, lines: ProcurementLine[]) => {
      setProcurement((prev) => ({ ...prev, [dasId]: lines }));
      autosave.save({ plan: 'procurement', dasId, lines });
    },
    [autosave],
  );

  const pushDistribution = useCallback(
    (dasId: string, lines: DistributionLine[]) => {
      setDistribution((prev) => ({ ...prev, [dasId]: lines }));
      autosave.save({ plan: 'distribution', dasId, lines });
    },
    [autosave],
  );

  const das = context.das.find((d) => d.dasId === activeDasId) ?? null;

  if (!das) {
    return (
      <main className="mx-auto w-full min-w-0 max-w-5xl px-6 py-10">
        <h1 className="text-3xl font-semibold tracking-tight">Achats &amp; distribution</h1>
        <p className="mt-4 text-(--foreground-muted)">
          Vous n’exploitez aucun domaine d’activité pour l’instant.
        </p>
      </main>
    );
  }

  const proc = procurement[das.dasId] ?? [];
  const dist = distribution[das.dasId] ?? [];
  const shareTotal = dist.reduce((acc, l) => acc + l.volumeShare, 0);
  const procTotal = proc.reduce((acc, l) => acc + l.committedVolume, 0);

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
            elles s’achètent auprès du <Link href="/cabinet" className="underline">cabinet</Link>.
            Sans benchmark, vous choisissez sur le nom.
          </p>
        </header>

        <DasChecklist items={checklistOf(das)} />

        <section className="rounded-xl border border-(--border) bg-(--surface) p-6">
          <div className="border-b border-(--border) pb-4">
            <p className="text-sm font-medium tracking-wide text-(--foreground-muted) uppercase">
              Niveau domaine
            </p>
            <h2 className="mt-0.5 text-2xl font-semibold tracking-tight">
              Filière de {das.name}
              {das.status === 'listed_for_sale' ? (
                <span className="ml-3 align-middle text-sm font-normal text-(--warning)">
                  mis en vente — piloté jusqu’à la résolution
                </span>
              ) : null}
            </h2>
            <p className="mt-1 text-sm text-(--foreground-muted)">
              Ces contrats ne concernent que ce domaine. Changez de domaine dans la barre du
              haut pour renseigner les autres.
            </p>
          </div>

          {/* ── Amont ───────────────────────────────────────────────────── */}
          {isOn(modules, 'marches.procurement') ? (
          <fieldset disabled={locked} className="mt-6">
            <legend className="mb-1 text-sm font-medium">Fournisseurs</legend>
            <p className="mb-3 text-xs text-(--foreground-muted)">
              Le volume engagé détermine votre poids dans leur carnet, donc la remise
              obtenue — jusqu’à −18 % sur le prix d’achat. Il détermine aussi la
              <strong> matière disponible</strong> : en engager moins que vous ne vendez
              bride l’atelier.
            </p>

            {/* ── Ce qu'il faut savoir avant d'engager un volume ─────────────
                Un volume ne se juge pas dans le vide. En engager trop immobilise
                de la trésorerie en magasin ; trop peu fait perdre des ventes. Ces
                six chiffres sont les seuls qui permettent l'arbitrage. */}
            <SupplyPanel
              supply={das.supply}
              engaged={proc.reduce((acc, l) => acc + l.committedVolume, 0)}
              treasuryMad={context.treasuryMad}
            />

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
                      <>
                        <label className="flex items-center gap-2 text-sm">
                          <span className="text-(--foreground-muted)">Volume engagé</span>
                          <NumberInput
                            value={line.committedVolume}
                            onChange={(v) =>
                              pushProcurement(
                                das.dasId,
                                proc.map((l) =>
                                  l.supplierId === supplier.id ? { ...l, committedVolume: v } : l,
                                ),
                              )
                            }
                            className="w-44"
                          />
                        </label>
                        {/* `w-full` sur une rangée `flex-wrap` : le repère passe
                            sous la ligne au lieu de l'allonger. */}
                        <span className="w-full">
                          <SupplierReference
                            value={line.committedVolume}
                            previous={
                              das.baseline.procurement
                                .find((l) => l.supplierId === supplier.id)?.committedVolume ?? 0
                            }
                            total={procTotal}
                          />
                        </span>
                      </>
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

            <SectionActions
              what={`les achats de ${das.name}`}
              locked={locked}
              changed={!deepEqual(proc, das.baseline.procurement)}
              recorded={das.progress.procurement}
              onValidate={async () => {
                autosave.save({ plan: 'procurement', dasId: das.dasId, lines: proc });
                await autosave.flush();
                router.refresh();
              }}
              onReset={() => pushProcurement(das.dasId, das.baseline.procurement)}
            />
          </fieldset>
          ) : null}

          {/* ── Aval ────────────────────────────────────────────────────── */}
          {isOn(modules, 'marches.distribution') ? (
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
                    {line ? (
                      <span className="w-full">
                        <DistributorReference
                          value={line.volumeShare}
                          previous={
                            das.baseline.distribution
                              .find((l) => l.distributorId === distributor.id)?.volumeShare ?? null
                          }
                        />
                      </span>
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

            <SectionActions
              what={`la distribution de ${das.name}`}
              locked={locked}
              changed={!deepEqual(dist, das.baseline.distribution)}
              recorded={das.progress.distribution}
              onValidate={async () => {
                autosave.save({ plan: 'distribution', dasId: das.dasId, lines: dist });
                await autosave.flush();
                router.refresh();
              }}
              onReset={() => pushDistribution(das.dasId, das.baseline.distribution)}
            />
          </fieldset>
          ) : null}
        </section>
      </main>

      <DecisionBar
        state={autosave.state} pending={autosave.pending} lastError={autosave.lastError}
        missing={missing} decisionsOpen={context.decisionsOpen}
        onValidate={async () => { await autosave.flush(); router.refresh(); }}
      />
    </>
  );
}

/**
 * Repères sous un volume d'achat.
 *
 * ── POURQUOI CELUI-LÀ, ET PAS UN AUTRE ─────────────────────────────────────
 * L'écran dit lui-même que concentrer ses achats maximise le pouvoir de
 * négociation ET le risque de rupture. Mais il demandait ensuite un volume dans
 * un champ nu : impossible de savoir si l'on venait de mettre 30 % ou 90 % de
 * ses achats chez le même fournisseur — c'est-à-dire impossible d'arbitrer la
 * chose même que l'écran annonce.
 *
 * La PART DE CE FOURNISSEUR dans les achats engagés est donc le repère qui
 * compte ici, davantage que le montant. S'y ajoute le volume du tour précédent :
 * changer de fournisseur principal est une décision, la reconduire aussi.
 */
function SupplierReference({
  value, previous, total,
}: { value: number; previous: number; total: number }) {
  const bits: string[] = [];

  if (previous === 0 && value === 0) bits.push('Rien engagé l’an dernier');
  else if (previous === 0) bits.push('Nouveau — rien l’an dernier');
  else {
    const pct = ((value - previous) / previous) * 100;
    const move = Math.abs(pct) < 0.5
      ? 'inchangé'
      : `${pct > 0 ? '↑ +' : '↓ −'}${formatScore(Math.abs(pct), 0)} %`;
    bits.push(`Tour précédent ${formatUnits(previous)} u. · ${move}`);
  }

  if (total > 0) {
    const share = (value / total) * 100;
    bits.push(`${formatScore(share, share < 10 ? 1 : 0)} % de vos achats de ce domaine`);
  }

  return (
    <span className="tabular block pt-1 text-xs text-(--foreground-muted)">
      {bits.join('  ·  ')}
    </span>
  );
}

/**
 * Repère sous une part de distribution.
 *
 * L'écart se dit EN POINTS et non en pourcentage relatif : passer de 10 % à
 * 20 % de couverture n'est pas « +100 % », c'est « +10 points ». Le premier
 * énoncé est exact et illisible ; le second se compare d'un distributeur à
 * l'autre.
 */
function DistributorReference({
  value, previous,
}: { value: number; previous: number | null }) {
  if (previous === null) {
    return (
      <span className="block pt-1 text-xs text-(--foreground-muted)">
        Nouveau — non retenu l’an dernier
      </span>
    );
  }

  const points = (value - previous) * 100;
  return (
    <span className="tabular block pt-1 text-xs text-(--foreground-muted)">
      Tour précédent {formatPct(previous, 0)}
      {Math.abs(points) < 0.5
        ? ' · inchangé'
        : ` · ${points > 0 ? '↑ +' : '↓ −'}${formatScore(Math.abs(points), 0)} points`}
    </span>
  );
}

/**
 * L'état d'approvisionnement du domaine.
 *
 * Le stock est un magasin, pas une statistique : ce qui reste à la clôture d'un
 * tour borne la production du suivant. L'écran doit donc montrer les deux
 * étages — matière et produits finis — et surtout la demande NON SERVIE, qui
 * est le seul chiffre disant qu'on a sous-approvisionné.
 */
function SupplyPanel({
  supply,
  engaged,
  treasuryMad,
}: {
  supply: DecisionContext['das'][number]['supply'];
  engaged: number;
  treasuryMad: number;
}) {
  const available = supply.inputStockUnits + engaged;
  const short = supply.soldLastRound > 0 && available < supply.soldLastRound;

  return (
    <div className="mb-4 rounded-lg border border-(--border) bg-(--surface-muted) p-4">
      <dl className="tabular grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
        <Stat label="Trésorerie disponible" value={formatMadCompact(treasuryMad)} />
        <Stat label="Acheté l’an dernier" value={formatUnits(supply.purchasedLastRound)} />
        <Stat label="Vendu l’an dernier" value={formatUnits(supply.soldLastRound)} />
        <Stat
          label="Matière en magasin"
          value={formatUnits(supply.inputStockUnits)}
          hint="Reportée de l’exercice clos"
        />
        <Stat
          label="Produits finis en stock"
          value={formatUnits(supply.finishedStockUnits)}
          hint="Vendables sans rien produire"
        />
        <Stat
          label="Demande non servie"
          value={formatUnits(supply.lostLastRound)}
          hint={supply.lostLastRound > 0 ? 'Ventes perdues' : undefined}
          negative={supply.lostLastRound > 0}
        />
      </dl>

      <p className="tabular mt-3 border-t border-(--border) pt-3 text-sm">
        <span className="text-(--foreground-muted)">Disponible ce tour : </span>
        <strong>{formatUnits(available)}</strong>
        <span className="text-(--foreground-muted)">
          {' '}({formatUnits(supply.inputStockUnits)} en magasin
          {' + '}{formatUnits(engaged)} engagés)
        </span>
      </p>

      {short ? (
        <p className="mt-2 text-sm" style={{ color: 'var(--warning)' }}>
          Vous engagez moins de matière que vous n’avez vendu l’an dernier. À demande
          égale, l’atelier s’arrêtera avant d’avoir servi le marché.
        </p>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  negative,
}: {
  label: string;
  value: string;
  hint?: string;
  negative?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-(--foreground-muted)">{label}</dt>
      <dd
        className="font-semibold"
        style={{ color: negative ? 'var(--negative)' : undefined }}
      >
        {value}
      </dd>
      {hint ? <dd className="text-xs text-(--foreground-muted)">{hint}</dd> : null}
    </div>
  );
}
