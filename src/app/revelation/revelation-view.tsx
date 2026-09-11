'use client';

/**
 * ATLAS — écran de révélation.
 *
 * C'est l'écran qui porte toute la tension pédagogique de l'atelier : il montre
 * simultanément à toutes les équipes du pool comment le marché s'est
 * redistribué, puis pourquoi.
 *
 * Trois exigences du cahier (doc 00 §8.6) :
 *
 *   1. Écran de verrouillage pendant le calcul serveur. Aucune équipe n'accède
 *      aux résultats avant que TOUTES aient reçu l'événement — garanti en amont
 *      par la transaction unique de `atlas_persist_resolution`, dont la bascule
 *      d'état intervient en dernier.
 *   2. Transition animée depuis la répartition du tour précédent.
 *   3. Décomposition du score sous le graphique, équipe par équipe.
 *
 * La synchronisation passe par Supabase Realtime sur `game_sessions`. On ne fait
 * JAMAIS confiance à la charge utile de l'événement : elle sert uniquement de
 * signal, et l'écran recharge ensuite ses données par le chemin normal, soumis
 * à la RLS. C'est aussi ce qui rend la révélation rejouable après un
 * rafraîchissement ou une coupure réseau — l'état vit en base, pas dans
 * la mémoire du navigateur.
 *
 * ── DEUX POURCENTAGES, ET NON UN ───────────────────────────────────────────
 * L'écran empilait toutes les lignes de `pool_reveal` dans une seule barre. Or
 * cette vue rend une ligne par équipe ET PAR DOMAINE : un groupe présent sur
 * trois domaines apparaissait trois fois, la somme des tranches montait à
 * 200 %, et la barre débordait en rognant les dernières.
 *
 * Les deux mesures sont désormais distinctes, parce qu'elles ne répondent pas
 * à la même question :
 *
 *   • la PART DE MARCHÉ se joue dans un domaine, contre les équipes qui y sont
 *     et contre les entreprises installées. Une barre par domaine.
 *   • le POIDS DU GROUPE se mesure en chiffre d'affaires, tous domaines
 *     confondus. C'est la taille de l'entreprise, pas sa position sur un
 *     marché. Une barre pour le pool.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { ShareBar, type ShareSlice } from '@/components/share-bar';
import { createClient } from '@/lib/supabase/client';
import {
  colorIndexByTeam,
  dasComposition,
  dasOrder,
  groupWeights,
  type DasSummary,
  type ShareInput,
} from '@/lib/reveal';
import {
  formatMadCompact,
  formatPct,
  formatScore,
  formatSharePoints,
  strategyLabel,
} from '@/lib/format';

export interface RevealRow {
  team_id: string;
  team_name: string;
  das_id: string;
  das_name: string;
  round_number: number;
  competitiveness_score: number | null;
  perceived_quality: number | null;
  notoriety: number | null;
  price_competitiveness: number | null;
  ia_score: number | null;
  competitive_pressure: number | null;
  market_share_pct: number | null;
  revenue_mad: number | null;
  unit_price_mad: number | null;
}

export type DasSummaryRow = DasSummary;

interface OwnDiagnosis {
  ia: number;
  stuck: boolean;
  drift: boolean;
  declared: string | null;
  actual: string | null;
}

type Phase = 'attente' | 'calcul' | 'revelation' | 'pose';

export function RevelationView({
  sessionId, teamId, teamName, roundNumber, status, rows, summaries, ownDiagnosis,
}: {
  sessionId: string;
  teamId: string;
  teamName: string;
  roundNumber: number;
  status: string;
  rows: RevealRow[];
  summaries: DasSummaryRow[];
  ownDiagnosis: OwnDiagnosis | null;
}) {
  const router = useRouter();
  const resolved = status === 'round_resolved' || status === 'completed';

  const [phase, setPhase] = useState<Phase>(
    resolved ? 'revelation' : status === 'round_active' ? 'attente' : 'calcul',
  );
  const [nextRoundOpen, setNextRoundOpen] = useState(false);

  // ── Synchronisation temps réel ────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`session:${sessionId}:round`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'atlas', table: 'game_sessions', filter: `id=eq.${sessionId}` },
        (payload) => {
          const next = (payload.new as { status?: string })?.status;
          if (next === 'round_locked' || next === 'round_resolving') {
            setPhase('calcul');
          } else if (next === 'round_resolved') {
            // Signal seulement : on recharge par le chemin normal plutôt que de
            // faire confiance à la charge utile, qui n'est pas filtrée par la
            // même logique que nos politiques.
            setPhase('revelation');
            router.refresh();
          } else if (next === 'round_active') {
            setNextRoundOpen(true);
          }
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [sessionId, router]);

  // ── Agrégations ───────────────────────────────────────────────────────────
  const shareInputs: ShareInput[] = useMemo(
    () =>
      rows.map((r) => ({
        teamId: r.team_id,
        dasId: r.das_id,
        roundNumber: r.round_number,
        marketSharePct: Number(r.market_share_pct ?? 0),
        revenueMad: Number(r.revenue_mad ?? 0),
      })),
    [rows],
  );

  const teamNames = useMemo(
    () => new Map(rows.map((r) => [r.team_id, r.team_name])),
    [rows],
  );
  const dasNames = useMemo(() => new Map(rows.map((r) => [r.das_id, r.das_name])), [rows]);

  // La couleur suit le groupe, dans toutes les barres de l'écran.
  const colorIndex = useMemo(() => colorIndexByTeam(shareInputs), [shareInputs]);

  const weights = useMemo(() => groupWeights(shareInputs, roundNumber), [shareInputs, roundNumber]);
  const ownWeight = weights.find((w) => w.teamId === teamId);
  const poolRevenue = weights.reduce((acc, w) => acc + w.revenueMad, 0);

  const blocks = useMemo(
    () =>
      dasOrder(shareInputs, summaries, roundNumber).map((dasId) => ({
        dasId,
        name: dasNames.get(dasId) ?? 'Domaine',
        composition: dasComposition(dasId, shareInputs, summaries, roundNumber),
      })),
    [shareInputs, summaries, roundNumber, dasNames],
  );

  // Les parts du tour précédent, par équipe ET par domaine : c'est la clé
  // composée qui manquait, et confondre les deux niveaux faisait comparer la
  // part agro d'un groupe à sa part textile.
  const previousByUnit = useMemo(
    () =>
      new Map(
        rows
          .filter((r) => r.round_number === roundNumber - 1)
          .map((r) => [`${r.team_id}:${r.das_id}`, Number(r.market_share_pct ?? 0)]),
      ),
    [rows, roundNumber],
  );

  const groupSlices: ShareSlice[] = useMemo(
    () =>
      weights.map((w) => ({
        key: w.teamId,
        label: teamNames.get(w.teamId) ?? 'Groupe',
        share: w.weight,
        previousShare: w.previousWeight,
        kind: 'team' as const,
        colorIndex: colorIndex.get(w.teamId),
      })),
    [weights, teamNames, colorIndex],
  );

  const handleSettled = useCallback(() => setPhase('pose'), []);

  if (phase === 'attente') {
    return (
      <Shell roundNumber={roundNumber} teamName={teamName}>
        <Placeholder
          titre="Le tour est en cours"
          texte="La révélation s’ouvrira ici dès que le facilitateur aura clos le tour. Vos décisions restent modifiables jusque-là."
        />
      </Shell>
    );
  }

  if (phase === 'calcul' || !resolved) {
    return (
      <Shell roundNumber={roundNumber} teamName={teamName}>
        <div className="rounded-xl border border-(--border) bg-(--surface) p-10 text-center">
          <div
            className="mx-auto mb-6 h-1.5 w-56 overflow-hidden rounded-full bg-(--surface-muted)"
            role="progressbar"
            aria-label="Calcul du tour en cours"
          >
            <div className="h-full w-1/3 rounded-full bg-(--accent) motion-safe:animate-[atlas-slide_1.4s_ease-in-out_infinite]" />
          </div>
          <h2 className="text-2xl font-medium">Calcul en cours</h2>
          <p className="mx-auto mt-3 max-w-lg text-(--foreground-muted)">
            Le marché se redistribue. Toutes les équipes du pool verront le résultat
            au même instant — personne n’a d’avance.
          </p>
          <style>{`@keyframes atlas-slide { 0% { transform: translateX(-100%);} 100% { transform: translateX(300%);} }`}</style>
        </div>
      </Shell>
    );
  }

  const weightDelta =
    ownWeight && ownWeight.previousWeight !== ownWeight.weight
      ? ownWeight.weight - ownWeight.previousWeight
      : null;

  return (
    <Shell roundNumber={roundNumber} teamName={teamName}>
      {/* Le chiffre qui fait mal ou qui fait plaisir, avant toute explication.
          C'est le poids du GROUPE : un portefeuille de trois domaines n'a pas
          « une » part de marché, il en a trois — elles arrivent juste après. */}
      <section className="mb-8">
        <p className="text-sm font-medium text-(--foreground-muted)">
          Votre poids dans le pool
        </p>
        <p className="tabular mt-1 text-6xl font-semibold tracking-tight">
          {formatPct(ownWeight?.weight ?? 0, 1)}
        </p>
        {weightDelta !== null ? (
          <p
            className="tabular mt-2 text-lg font-medium"
            style={{ color: weightDelta >= 0 ? 'var(--positive)' : 'var(--negative)' }}
          >
            {formatSharePoints(weightDelta)} pts
            <span className="ml-2 font-normal text-(--foreground-muted)">vs tour précédent</span>
          </p>
        ) : (
          <p className="mt-2 text-(--foreground-muted)">Premier tour — pas de comparaison</p>
        )}
        <p className="mt-3 max-w-2xl text-sm text-(--foreground-muted)">
          <span className="tabular">{formatMadCompact(ownWeight?.revenueMad ?? 0)}</span> de
          chiffre d’affaires sur <span className="tabular">{formatMadCompact(poolRevenue)}</span>{' '}
          cumulés par les {weights.length} groupes du pool
          {ownWeight && ownWeight.dasCount > 1
            ? `, répartis sur ${ownWeight.dasCount} domaines`
            : ''}
          .
        </p>
      </section>

      <section className="mb-10 rounded-xl border border-(--border) bg-(--surface) p-6">
        <h2 className="text-lg font-medium">Poids des groupes</h2>
        <p className="mt-1 mb-5 text-sm text-(--foreground-muted)">
          Part du chiffre d’affaires cumulé des groupes, tous domaines confondus. Ce n’est
          pas une part de marché : les entreprises installées n’y figurent pas, et un groupe
          peut peser lourd en jouant petit sur beaucoup de domaines.
        </p>
        <ShareBar
          slices={groupSlices}
          highlightKey={teamId}
          animate={phase === 'revelation'}
          onSettled={handleSettled}
          label="Poids des groupes du pool en chiffre d’affaires"
        />
      </section>

      {/* Une part de marché n'existe que dans un domaine : une section par
          domaine, du plus gros marché au plus petit. */}
      <div className="space-y-10">
        {blocks.map((block) => {
          const { composition } = block;
          const own = composition.teams.find((t) => t.teamId === teamId);
          const ownPrevious = previousByUnit.get(`${teamId}:${block.dasId}`);
          const ownDelta =
            own && ownPrevious !== undefined ? own.share - ownPrevious : null;

          const slices: ShareSlice[] = [
            ...composition.teams.map((t) => ({
              key: t.teamId,
              label: teamNames.get(t.teamId) ?? 'Groupe',
              share: t.share,
              previousShare: t.previousShare,
              kind: 'team' as const,
              colorIndex: colorIndex.get(t.teamId),
            })),
          ];
          if (composition.installedShare > 0.001) {
            slices.push({
              key: 'installes',
              label: 'Entreprises installées',
              share: composition.installedShare,
              previousShare: composition.previousInstalledShare,
              kind: 'installed',
            });
          }
          if (composition.unservedShare > 0.001) {
            slices.push({
              key: 'non-servi',
              label: 'Non servi',
              share: composition.unservedShare,
              previousShare: composition.previousUnservedShare,
              kind: 'unserved',
            });
          }

          return (
            <section
              key={block.dasId}
              className="rounded-xl border border-(--border) bg-(--surface) p-6"
            >
              <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                <h2 className="text-lg font-medium">{block.name}</h2>
                <p className="tabular text-sm text-(--foreground-muted)">
                  Marché de {formatMadCompact(composition.marketSizeMad)}
                </p>
              </div>

              {own ? (
                <p className="mb-5">
                  <span className="text-sm text-(--foreground-muted)">Votre part — </span>
                  <span className="tabular text-2xl font-semibold">
                    {formatPct(own.share, 1)}
                  </span>
                  {ownDelta !== null ? (
                    <span
                      className="tabular ml-3 text-sm font-medium"
                      style={{ color: ownDelta >= 0 ? 'var(--positive)' : 'var(--negative)' }}
                    >
                      {formatSharePoints(ownDelta)} pts
                    </span>
                  ) : null}
                </p>
              ) : (
                <p className="mb-5 text-sm text-(--foreground-muted)">
                  Vous n’êtes pas présent sur ce domaine.
                </p>
              )}

              <ShareBar
                slices={slices}
                highlightKey={teamId}
                animate={phase === 'revelation'}
                label={`Répartition du marché du domaine ${block.name}`}
              />

              {composition.installedShare > 0.001 ? (
                <p className="mt-5 text-sm text-(--foreground-muted)">
                  Les entreprises déjà installées sur ce domaine, qui ne sont pas des
                  équipes de la salle, en servent{' '}
                  <strong className="tabular">
                    {formatPct(composition.installedShare, 1)}
                  </strong>
                  . Le facilitateur peut les mettre en vente : les racheter, c’est
                  récupérer leur part sans la disputer.
                </p>
              ) : null}

              {composition.unservedShare > 0.001 ? (
                <p className="mt-3 rounded-lg border border-(--warning) px-4 py-3 text-sm text-(--warning)">
                  <strong className="tabular">
                    {formatPct(composition.unservedShare, 1)}
                  </strong>{' '}
                  du marché n’a été servi par personne, faute de couverture de distribution
                  suffisante. Ce chiffre d’affaires, aucune équipe ne l’a pris.
                </p>
              ) : null}

              {Math.abs(composition.total - 1) > 0.01 ? (
                <p className="mt-3 text-sm text-(--foreground-muted)">
                  Les tranches de ce domaine ne totalisent que{' '}
                  <span className="tabular">{formatPct(composition.total, 1)}</span> : ce tour
                  a été résolu avant que la part des entreprises installées ne soit mesurée.
                </p>
              ) : null}

              <DecompositionTable
                rows={rows.filter(
                  (r) => r.round_number === roundNumber && r.das_id === block.dasId,
                )}
                previousByUnit={previousByUnit}
                viewerTeamId={teamId}
                visible={phase === 'pose'}
              />
            </section>
          );
        })}
      </div>

      {ownDiagnosis && (ownDiagnosis.stuck || ownDiagnosis.drift) ? (
        <section className="mt-8 rounded-xl border border-(--warning) bg-(--surface) p-6">
          <h2 className="text-lg font-medium">Le cabinet a relevé une incohérence</h2>
          <p className="mt-2 max-w-3xl text-(--foreground-muted)">
            {ownDiagnosis.stuck
              ? 'Vos décisions ne correspondent à aucune stratégie cohérente : ni assez bon marché pour gagner sur les coûts, ni assez distinctives pour justifier un premium. C’est la position la moins défendable d’un secteur.'
              : `Vous déclarez « ${strategyLabel(ownDiagnosis.declared ?? '')} » mais vos décisions exécutent « ${strategyLabel(ownDiagnosis.actual ?? '')} ». Re-déclarer au tour prochain efface ce malus, sans coût de transition.`}
          </p>
          <p className="mt-3 text-sm text-(--foreground-muted)">
            La décomposition axe par axe s’obtient en commandant un audit d’alignement.
          </p>
        </section>
      ) : null}

      <div className="mt-10 flex items-center gap-4">
        <button
          type="button"
          disabled={!nextRoundOpen}
          onClick={() => router.push('/cockpit')}
          className="rounded-lg bg-(--accent) px-6 py-3 font-medium text-white disabled:opacity-40"
        >
          Continuer vers le tour suivant
        </button>
        {!nextRoundOpen ? (
          <p className="text-sm text-(--foreground-muted)">
            En attente de l’ouverture du tour par le facilitateur.
          </p>
        ) : null}
      </div>
    </Shell>
  );
}

function Shell({
  children, roundNumber, teamName,
}: { children: React.ReactNode; roundNumber: number; teamName: string }) {
  return (
    <main className="mx-auto w-full min-w-0 max-w-5xl px-6 py-10">
      <header className="mb-10">
        <p className="text-sm font-medium tracking-wide text-(--foreground-muted) uppercase">
          Tour {roundNumber} — Révélation
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{teamName}</h1>
      </header>
      {children}
    </main>
  );
}

function Placeholder({ titre, texte }: { titre: string; texte: string }) {
  return (
    <div className="rounded-xl border border-(--border) bg-(--surface) p-10">
      <h2 className="text-xl font-medium">{titre}</h2>
      <p className="mt-3 max-w-2xl text-(--foreground-muted)">{texte}</p>
    </div>
  );
}

/**
 * Décomposition du score, équipe par équipe, POUR UN DOMAINE.
 *
 * Les cinq composantes du score sont des grandeurs de domaine : la qualité
 * perçue d'un groupe dans l'agro-industrie n'a rien à voir avec la sienne dans
 * le textile. Les empiler dans un tableau unique mélangeait des lignes sans
 * rapport, et deux lignes d'un même groupe s'y contredisaient.
 *
 * Elle sert aussi de « vue tableau » exigée par la règle de relief : trois
 * teintes de la palette passent sous 3:1 de contraste en mode clair, donc
 * l'identité et les valeurs doivent être lisibles en texte, sans dépendre de
 * la couleur.
 */
function DecompositionTable({
  rows, previousByUnit, viewerTeamId, visible,
}: {
  rows: RevealRow[];
  previousByUnit: Map<string, number>;
  viewerTeamId: string;
  visible: boolean;
}) {
  const ordered = [...rows].sort(
    (a, b) => Number(b.market_share_pct ?? 0) - Number(a.market_share_pct ?? 0),
  );

  return (
    <div
      className="mt-6 border-t border-(--border) pt-6 transition-opacity duration-700"
      style={{ opacity: visible ? 1 : 0 }}
      aria-hidden={!visible}
    >
      <h3 className="text-base font-medium">Décomposition du score de compétitivité</h3>
      <p className="mt-1 mb-5 text-sm text-(--foreground-muted)">
        Qualité 30 % · Notoriété 25 % · Prix 20 % · Alignement 15 % · Pression −10 %
      </p>

      {/* `min-w-0` sur le conteneur de défilement : sans lui, la largeur
          minimale du tableau se propage au parent et fait déborder la page
          entière sur mobile au lieu de faire défiler ce seul bloc. */}
      <div className="min-w-0 overflow-x-auto">
        <table className="w-full min-w-[46rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-(--border) text-left">
              <th className="py-2 pr-4 font-medium">Équipe</th>
              <th className="py-2 pr-4 text-right font-medium">Qualité</th>
              <th className="py-2 pr-4 text-right font-medium">Notoriété</th>
              <th className="py-2 pr-4 text-right font-medium">Prix</th>
              <th className="py-2 pr-4 text-right font-medium">Alignement</th>
              <th className="py-2 pr-4 text-right font-medium">Pression</th>
              <th className="py-2 pr-4 text-right font-medium">Score</th>
              <th className="py-2 pr-4 text-right font-medium">Part</th>
              <th className="py-2 text-right font-medium">Δ</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {ordered.map((r) => {
              const isViewer = r.team_id === viewerTeamId;
              const prev = previousByUnit.get(`${r.team_id}:${r.das_id}`);
              const delta =
                prev !== undefined ? Number(r.market_share_pct ?? 0) - prev : null;

              return (
                <tr
                  key={r.team_id}
                  className="border-b border-(--border) last:border-0"
                  style={{ background: isViewer ? 'var(--surface-muted)' : undefined }}
                >
                  <td className={`py-2.5 pr-4 ${isViewer ? 'font-semibold' : ''}`}>
                    {r.team_name}
                    {isViewer ? <span className="text-(--foreground-muted)"> (vous)</span> : null}
                  </td>
                  <td className="py-2.5 pr-4 text-right">{formatScore(r.perceived_quality)}</td>
                  <td className="py-2.5 pr-4 text-right">{formatScore(r.notoriety)}</td>
                  <td className="py-2.5 pr-4 text-right">
                    {formatScore(Number(r.price_competitiveness ?? 0) * 100)}
                  </td>
                  <td className="py-2.5 pr-4 text-right">{formatScore(r.ia_score)}</td>
                  <td className="py-2.5 pr-4 text-right text-(--foreground-muted)">
                    −{formatScore(Number(r.competitive_pressure ?? 0) * 100)}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-semibold">
                    {formatScore(Number(r.competitiveness_score ?? 0) * 100, 1)}
                  </td>
                  <td className="py-2.5 pr-4 text-right">
                    {formatPct(r.market_share_pct, 1)}
                  </td>
                  <td
                    className="py-2.5 text-right"
                    style={{
                      color:
                        delta === null
                          ? 'var(--foreground-muted)'
                          : delta >= 0
                            ? 'var(--positive)'
                            : 'var(--negative)',
                    }}
                  >
                    {formatSharePoints(delta)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <details className="mt-4">
        <summary className="cursor-pointer text-sm text-(--foreground-muted)">
          Chiffre d’affaires et prix pratiqués sur ce domaine
        </summary>
        <table className="tabular mt-3 w-full border-collapse text-sm">
          <tbody>
            {ordered.map((r) => (
              <tr key={r.team_id} className="border-b border-(--border) last:border-0">
                <td className="py-2 pr-4">{r.team_name}</td>
                <td className="py-2 pr-4 text-right">{formatMadCompact(r.revenue_mad)}</td>
                <td className="py-2 text-right text-(--foreground-muted)">
                  {formatScore(r.unit_price_mad, 0)} DH / unité
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      <p className="mt-5 text-sm text-(--foreground-muted)">
        Les coûts, capacités et diagnostics d’alignement de vos concurrents ne sont pas
        publics — ils s’achètent auprès du cabinet.
      </p>
    </div>
  );
}
