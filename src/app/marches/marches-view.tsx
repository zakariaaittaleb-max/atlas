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
 *
 * ── LA SYNTHÈSE D'ABORD ────────────────────────────────────────────────────
 * L'écran s'ouvre sur l'état de la filière (matière disponible, demande non
 * servie, fournisseurs et distributeurs retenus), puis un bloc repliable par
 * contrat. Les explications sont sous les « + » ; les alertes restent visibles.
 */

import { TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import { useDasScope } from '@/components/das-scope';
import {
  DasChecklist, DecisionBar, NumberInput, SectionActions, type MissingDecision,
} from '@/components/decision-shell';
import { Accordion } from '@/components/ui/accordion';
import { ChipToggle, GroupLegend } from '@/components/ui/form-controls';
import { InfoHint } from '@/components/ui/info-hint';
import { StatCard } from '@/components/ui/stat-card';
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
        <h1 className="text-3xl font-bold text-(--heading) tracking-tight">Achats &amp; distribution</h1>
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
  const available = das.supply.inputStockUnits + procTotal;
  const short = das.supply.soldLastRound > 0 && available < das.supply.soldLastRound;
  const overShare = shareTotal > 1.0001;
  const showProcurement = isOn(modules, 'marches.procurement');
  const showDistribution = isOn(modules, 'marches.distribution');

  const cards = [
    showProcurement ? (
      <StatCard
        key="available"
        label="Matière disponible ce tour"
        value={formatUnits(available)}
        note={
          short
            ? `Sous les ${formatUnits(das.supply.soldLastRound)} vendus l’an dernier`
            : `${formatUnits(das.supply.inputStockUnits)} en magasin + ${formatUnits(procTotal)} engagés`
        }
        hint="Le stock de matière reporté de l’exercice clos, plus les volumes engagés chez vos fournisseurs. Il borne ce que l’atelier pourra produire."
      />
    ) : null,
    <StatCard
      key="lost"
      label="Demande non servie"
      value={formatUnits(das.supply.lostLastRound)}
      note={das.supply.lostLastRound > 0 ? 'Ventes perdues au dernier exercice' : 'Aucune vente perdue au dernier exercice'}
      hint="Des clients voulaient acheter et n’ont pas été servis : c’est le seul chiffre qui dit qu’on a sous-approvisionné ou sous-distribué."
    />,
    showProcurement ? (
      <StatCard
        key="suppliers"
        label="Fournisseurs retenus"
        value={`${proc.length} / ${das.suppliers.length}`}
        note={proc.length === 0 ? 'Achat au prix spot, sans remise' : `${formatUnits(procTotal)} unités engagées`}
      />
    ) : null,
    showDistribution ? (
      <StatCard
        key="distributors"
        label="Volume confié à des tiers"
        value={formatPct(shareTotal, 0)}
        note={
          dist.length === 0
            ? 'Aucun distributeur retenu'
            : `${dist.length} distributeur${dist.length > 1 ? 's' : ''} retenu${dist.length > 1 ? 's' : ''}`
        }
        hint="Le reste passe par votre réseau de vente propre, s’il existe. Votre part de marché est plafonnée par votre couverture."
      />
    ) : null,
  ].filter(Boolean);

  return (
    <>
      <main className="mx-auto w-full min-w-0 max-w-5xl px-6 py-8 lg:py-10">
        <header className="mb-6">
          <p className="text-xs font-semibold tracking-wider text-(--accent-text) uppercase">
            Tour {context.roundNumber} · niveau domaine · filière de {das.name}
          </p>
          <h1 className="mt-1 flex flex-wrap items-center gap-3 text-3xl font-bold tracking-tight text-(--heading)">
            Achats &amp; distribution
            <InfoHint label="Achats et distribution">
              Concentrer ses achats chez un fournisseur maximise votre pouvoir de négociation{' '}
              <em>et</em> votre risque de rupture. Se disperser fait l’inverse. Il n’y a pas de
              bonne réponse universelle — seulement une réponse cohérente avec votre stratégie.
              <span className="mt-2 block">
                Ces contrats ne concernent que le domaine piloté : changez de domaine dans la
                barre du haut pour renseigner les autres.
              </span>
            </InfoHint>
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {das.status === 'listed_for_sale' ? (
              <span className="rounded-full bg-(--warning-subtle) px-3 py-1 text-sm font-medium text-(--warning)">
                Mis en vente — piloté jusqu’à la résolution
              </span>
            ) : null}
            <span className="inline-flex items-center gap-2 rounded-full bg-(--surface) px-3 py-1 text-sm text-(--foreground-muted) ring-1 ring-(--border)">
              Capacités, fiabilités et marges des acteurs : au{' '}
              <Link href="/cabinet" className="font-medium text-(--accent-text) underline">cabinet</Link>
              <InfoHint label="Chiffres non affichés">
                Les capacités, fiabilités et marges exigées de ces acteurs ne sont pas affichées
                ici : elles s’achètent auprès du cabinet. Sans benchmark, vous choisissez sur le nom.
              </InfoHint>
            </span>
          </div>
        </header>

        <div className="space-y-4">
          {cards.length > 0 ? (
            <div className={`grid gap-4 sm:grid-cols-2 ${cards.length >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
              {cards}
            </div>
          ) : null}

          <DasChecklist items={checklistOf(das)} className="" />

          {/* ── Amont ───────────────────────────────────────────────────── */}
          {showProcurement ? (
            <Accordion
              title="Fournisseurs"
              defaultOpen
              summary={`${proc.length} retenu${proc.length > 1 ? 's' : ''} · ${formatUnits(procTotal)} u.`}
              hint="Le volume engagé détermine votre poids dans leur carnet, donc la remise obtenue — jusqu’à −18 % sur le prix d’achat. Il détermine aussi la matière disponible : en engager moins que vous ne vendez bride l’atelier."
            >
              <fieldset disabled={locked}>
                <legend className="sr-only">Fournisseurs</legend>

                {/* ── Ce qu'il faut savoir avant d'engager un volume ─────────────
                    Un volume ne se juge pas dans le vide. En engager trop immobilise
                    de la trésorerie en magasin ; trop peu fait perdre des ventes. Ces
                    six chiffres sont les seuls qui permettent l'arbitrage. */}
                <SupplyPanel
                  supply={das.supply}
                  engaged={procTotal}
                  treasuryMad={context.treasuryMad}
                />

                <ul className="divide-y divide-(--border) rounded-lg border border-(--border)">
                  {das.suppliers.map((supplier) => {
                    const line = proc.find((l) => l.supplierId === supplier.id);
                    return (
                      <li
                        key={supplier.id}
                        className={`flex flex-wrap items-center gap-3 px-4 py-3 ${line ? 'bg-(--accent-subtle)/40' : ''}`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">{supplier.name}</span>
                          {supplier.regionKey ? (
                            <span className="block text-xs text-(--meta) capitalize">
                              {supplier.regionKey.replace(/_/g, ' ')}
                            </span>
                          ) : null}
                        </span>

                        {line ? (
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
                              className="w-40"
                            />
                          </label>
                        ) : null}

                        <ChipToggle
                          label={line ? 'Retenu' : 'Retenir'}
                          on={Boolean(line)}
                          onToggle={() =>
                            pushProcurement(
                              das.dasId,
                              line
                                ? proc.filter((l) => l.supplierId !== supplier.id)
                                : [...proc, { supplierId: supplier.id, committedVolume: 0 }],
                            )
                          }
                        />

                        {line ? (
                          // `w-full` sur une rangée `flex-wrap` : le repère passe
                          // sous la ligne au lieu de l'allonger.
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
                        ) : null}
                      </li>
                    );
                  })}
                </ul>

                {proc.length === 0 ? (
                  <Alert tone="negative">
                    Aucun fournisseur retenu : vous achèterez au prix spot, sans remise, avec une
                    qualité d’intrants médiocre. Ne rien décider est aussi une décision.
                  </Alert>
                ) : null}

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
            </Accordion>
          ) : null}

          {/* ── Aval ────────────────────────────────────────────────────── */}
          {showDistribution ? (
            <Accordion
              title="Distributeurs"
              summary={overShare ? `${formatPct(shareTotal, 0)} · au-delà de 100 %` : `${dist.length} retenu${dist.length > 1 ? 's' : ''} · ${formatPct(shareTotal, 0)} confié`}
              hint="On ne vend pas là où on n’est pas distribué : votre part de marché est plafonnée par votre couverture. Les couvertures se recoupent — leur somme n’est jamais leur union."
            >
              <fieldset disabled={locked}>
                <legend className="sr-only">Distributeurs</legend>

                <ul className="divide-y divide-(--border) rounded-lg border border-(--border)">
                  {das.distributors.map((distributor) => {
                    const line = dist.find((l) => l.distributorId === distributor.id);
                    return (
                      <li
                        key={distributor.id}
                        className={`flex flex-wrap items-center gap-3 px-4 py-3 ${line ? 'bg-(--accent-subtle)/40' : ''}`}
                      >
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
                              className="w-36 accent-(--accent)"
                            />
                            <span className="tabular w-12 text-right font-mono">{formatPct(line.volumeShare, 0)}</span>
                          </label>
                        ) : null}

                        <ChipToggle
                          label={line ? 'Retenu' : 'Retenir'}
                          on={Boolean(line)}
                          onToggle={() =>
                            pushDistribution(
                              das.dasId,
                              line
                                ? dist.filter((l) => l.distributorId !== distributor.id)
                                : [...dist, { distributorId: distributor.id, volumeShare: 0 }],
                            )
                          }
                        />

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

                <p className="tabular mt-3 flex flex-wrap items-center gap-2 text-sm text-(--foreground-muted)">
                  Volume confié à des tiers :{' '}
                  <strong className={`font-mono ${overShare ? 'text-(--negative)' : 'text-(--foreground)'}`}>
                    {formatPct(shareTotal, 0)}
                  </strong>
                  {!overShare && shareTotal < 1 ? (
                    <>
                      <span>· reste {formatPct(1 - shareTotal, 0)}</span>
                      <InfoHint label="Volume non confié">
                        Le volume que vous ne confiez à aucun distributeur passe par votre réseau de
                        vente propre, s’il existe.
                      </InfoHint>
                    </>
                  ) : null}
                </p>

                {overShare ? (
                  <Alert tone="negative">Vous ne pouvez pas confier plus de 100 % de votre volume.</Alert>
                ) : null}
                {dist.length === 0 ? (
                  <Alert tone="negative">
                    Aucun distributeur : votre couverture sera nulle et vous ne vendrez rien.
                  </Alert>
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
            </Accordion>
          ) : null}
        </div>
      </main>

      <DecisionBar
        state={autosave.state} pending={autosave.pending} lastError={autosave.lastError}
        savedAt={autosave.savedAt}
        missing={missing} decisionsOpen={context.decisionsOpen}
        onValidate={async () => { await autosave.flush(); router.refresh(); }}
      />
    </>
  );
}

function Alert({ tone, children }: { tone: 'negative' | 'warning'; children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className={`mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
        tone === 'negative' ? 'bg-(--negative-subtle) text-(--negative)' : 'bg-(--warning-subtle) text-(--warning)'
      }`}
    >
      <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
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
    <span className="tabular block text-sm text-(--foreground-muted)">
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
      <span className="block text-sm text-(--foreground-muted)">
        Nouveau — non retenu l’an dernier
      </span>
    );
  }

  const points = (value - previous) * 100;
  return (
    <span className="tabular block text-sm text-(--foreground-muted)">
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
    <div className="mb-4">
      <GroupLegend as="p" title="Avant d’engager un volume" />
      <dl className="tabular grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        <Stat label="Trésorerie disponible" value={formatMadCompact(treasuryMad)} />
        <Stat label="Acheté l’an dernier" value={formatUnits(supply.purchasedLastRound)} />
        <Stat label="Vendu l’an dernier" value={formatUnits(supply.soldLastRound)} />
        <Stat
          label="Matière en magasin"
          value={formatUnits(supply.inputStockUnits)}
          hint="Reportée de l’exercice clos."
        />
        <Stat
          label="Produits finis en stock"
          value={formatUnits(supply.finishedStockUnits)}
          hint="Vendables ce tour sans rien produire."
        />
        <Stat
          label="Demande non servie"
          value={formatUnits(supply.lostLastRound)}
          hint="Ventes perdues au dernier exercice, faute de produit ou de couverture."
          negative={supply.lostLastRound > 0}
        />
      </dl>

      <p className="tabular mt-3 text-sm">
        <span className="text-(--foreground-muted)">Disponible ce tour : </span>
        <strong className="font-mono">{formatUnits(available)}</strong>
        <span className="text-(--foreground-muted)">
          {' '}({formatUnits(supply.inputStockUnits)} en magasin
          {' + '}{formatUnits(engaged)} engagés)
        </span>
      </p>

      {short ? (
        <Alert tone="warning">
          Vous engagez moins de matière que vous n’avez vendu l’an dernier. À demande égale,
          l’atelier s’arrêtera avant d’avoir servi le marché.
        </Alert>
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
    <div className={`rounded-lg px-3 py-2.5 ${negative ? 'bg-(--negative-subtle)' : 'bg-(--surface-muted)'}`}>
      <dt className="flex items-center gap-1.5 text-sm text-(--foreground-muted)">
        {label}
        {hint ? <InfoHint label={label}>{hint}</InfoHint> : null}
      </dt>
      <dd className={`mt-0.5 font-mono font-semibold ${negative ? 'text-(--negative)' : ''}`}>{value}</dd>
    </div>
  );
}
