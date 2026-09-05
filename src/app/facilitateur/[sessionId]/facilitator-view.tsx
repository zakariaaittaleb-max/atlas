'use client';

/**
 * ATLAS — pilotage de session.
 *
 * L'écran du formateur, conçu pour être utilisé DEBOUT, dans une salle bruyante,
 * pendant qu'on lui pose des questions. D'où trois partis pris :
 *
 *   • **L'avancement des équipes tient en un coup d'œil.** Le formateur doit
 *     savoir qui traîne sans interroger chaque table.
 *   • **Les gestes irréversibles sont confirmés.** Verrouiller un tour ou
 *     résoudre engage toute la salle : un clic malheureux ne doit pas suffire.
 *   • **Les échecs de résolution sont affichés en clair.** Si un invariant a
 *     sauté, le formateur doit le voir et savoir que rien n'a été écrit —
 *     pas découvrir un classement faux projeté au mur.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import type { DifficultyDials } from '@/lib/difficulty-types';

import { SettingsSection } from './settings-section';
import { SessionBriefing } from './session-briefing';
import { useState, useTransition } from 'react';

import { formatMadCompact, formatScore, treasuryLabel, sessionStatusLabel } from '@/lib/format';

export interface TeamProgress {
  teamId: string;
  name: string;
  joinCode: string;
  isLiquidated: boolean;
  connectedMembers: number;
  hasCorporate: boolean;
  dasDone: number;
  dasExpected: number;
  distributionDone: number;
  hasBudget: boolean;
  treasuryMad: number;
  treasuryStatus: string;
  iaScore: number | null;
}

interface Card {
  key: string; name: string; description: string; nature: string;
  dimension: string; targetSectors: string[]; durationRounds: number; source: string | null;
}

interface Run {
  roundNumber: number; status: string; durationMs: number | null;
  errorMessage: string | null; invariantFailures: unknown;
}

const DIMENSIONS: Record<string, string> = {
  politique: 'Politique', economique: 'Économique', socioculturel: 'Socioculturel',
  technologique: 'Technologique', ecologique: 'Écologique', legal: 'Légal',
};

export function FacilitatorView({
  sessionId, sessionName, joinCode, status, roundNumber, plannedRounds, maxRounds,
  teams, das, cards, activeShocks, runs, difficulty, dials, difficultyLocked, sectors,
}: {
  sessionId: string; sessionName: string; joinCode: string; status: string;
  roundNumber: number; plannedRounds: number; maxRounds: number;
  teams: TeamProgress[];
  das: { id: string; name: string; marketOpen: boolean; hasTargets: boolean }[];
  cards: Card[];
  difficulty: string;
  dials: DifficultyDials;
  difficultyLocked: boolean;
  sectors: string[];
  activeShocks: { id: string; cardKey: string; dasId: string; roundNumber: number; roundsRemaining: number }[];
  runs: Run[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState(cards[0]?.key ?? '');
  const [selectedDas, setSelectedDas] = useState(das[0]?.id ?? '');
  const [redistribution, setRedistribution] = useState(0);

  const disabled = busy || pending;

  async function call(path: string, body: Record<string, unknown>, successMessage: string) {
    setError(null); setNotice(null); setBusy(true);
    try {
      const res = await fetch(path, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(payload.error ?? 'Action refusée.');
        // Un échec d'invariant renvoie le détail : on l'affiche plutôt que de
        // le laisser au journal serveur.
        if (payload.invariantFailures) {
          setError(
            `${payload.error} — ${(payload.invariantFailures as { message: string }[])
              .map((f) => f.message).join(' · ')}`,
          );
        }
        setBusy(false);
        return;
      }
      setNotice(successMessage);
      startTransition(() => { router.refresh(); setBusy(false); });
    } catch {
      setError('Le réseau est indisponible.');
      setBusy(false);
    }
  }

  const ready = teams.filter(isReady).length;
  const activeTeams = teams.filter((t) => !t.isLiquidated);

  return (
    <main className="mx-auto w-full min-w-0 max-w-6xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium tracking-wide text-(--foreground-muted) uppercase">
            Pilotage de session
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{sessionName}</h1>
          <p className="tabular mt-2 text-(--foreground-muted)">
            {roundNumber === 0 ? 'Onboarding (T0)' : `Tour ${roundNumber}`} sur {plannedRounds} prévus
            {' · '}{sessionStatusLabel(status)}
            {' · '}<strong>{ready}/{activeTeams.length}</strong> équipes prêtes
          </p>
        </div>
        <div className="rounded-lg border border-(--border) bg-(--surface) px-4 py-3 text-center">
          <p className="text-xs text-(--foreground-muted)">Code de session</p>
          <p className="tabular text-2xl font-semibold tracking-widest">{joinCode}</p>
        </div>
      </header>

      <SessionBriefing roundNumber={roundNumber} />

      {error ? (
        <p role="alert" className="mb-6 rounded-lg border border-(--negative) px-4 py-3 text-sm text-(--negative)">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mb-6 rounded-lg border border-(--positive) px-4 py-3 text-sm text-(--positive)">
          {notice}
        </p>
      ) : null}

      {/* ── Contrôle du tour ─────────────────────────────────────────────── */}
      <section className="mb-8 rounded-xl border border-(--border) bg-(--surface) p-6">
        <h2 className="mb-1 text-xl font-medium">Conduite du tour</h2>
        <p className="mb-5 max-w-3xl text-sm text-(--foreground-muted)">
          C’est vous qui décidez du rythme : rien ne se déclenche tout seul. Le chronomètre est
          indicatif, la partie ne s’arrête jamais d’elle-même.
        </p>

        <div className="flex flex-wrap gap-3">
          <Action
            label={roundNumber === 0 ? 'Ouvrir le tour 1' : `Ouvrir le tour ${roundNumber + 1}`}
            disabled={disabled || roundNumber >= maxRounds || status === 'round_active'}
            onClick={() => call('/api/rounds/control', { sessionId, action: 'open' }, 'Tour ouvert.')}
          />
          <Action
            label="Prolonger de 10 minutes"
            disabled={disabled || status !== 'round_active'}
            onClick={() => call('/api/facilitator', { sessionId, action: 'extend', minutes: 10 }, 'Tour prolongé.')}
          />

          {/* Gestes irréversibles : confirmation explicite. Verrouiller fige
              TOUTES les équipes du pool au même instant. */}
          <Confirm
            label="Verrouiller le tour"
            question={`Verrouiller fige les ${activeTeams.length} équipes au même instant. ${activeTeams.length - ready} n’ont pas fini leur saisie.`}
            confirming={confirming === 'lock'}
            onArm={() => setConfirming('lock')}
            onCancel={() => setConfirming(null)}
            disabled={disabled || status !== 'round_active'}
            onConfirm={() => { setConfirming(null); void call('/api/rounds/control', { sessionId, action: 'lock' }, 'Tour verrouillé.'); }}
          />
          <Confirm
            label="Résoudre le tour"
            question="Le moteur calcule et publie les résultats à tout le pool. Si un invariant est violé, rien n’est écrit et vous pourrez corriger."
            confirming={confirming === 'resolve'}
            onArm={() => setConfirming('resolve')}
            onCancel={() => setConfirming(null)}
            disabled={disabled || (status !== 'round_active' && status !== 'round_locked')}
            onConfirm={() => { setConfirming(null); void call('/api/rounds/resolve', { sessionId }, 'Tour résolu — les résultats sont publiés.'); }}
          />
          <Confirm
            label="Clore la session"
            question="La session passe en « terminée ». Les équipes gardent l’accès à leurs résultats et exports."
            confirming={confirming === 'complete'}
            onArm={() => setConfirming('complete')}
            onCancel={() => setConfirming(null)}
            disabled={disabled || roundNumber < 3}
            onConfirm={() => { setConfirming(null); void call('/api/rounds/control', { sessionId, action: 'complete' }, 'Session close.'); }}
          />

          <a
            href={`/api/export?type=session_complete&sessionId=${sessionId}`}
            className="rounded-lg border border-(--border) px-4 py-2.5 text-sm font-medium"
          >
            Exporter la session
          </a>
        </div>

        {/* ── Les deux documents de séance ────────────────────────────────
            Ils ne pilotent rien : ils servent à EXPLIQUER, au débriefing,
            pourquoi le moteur a rendu ce qu'il a rendu. Séparés des gestes de
            conduite ci-dessus, parce qu'on ne les ouvre pas dans le même
            moment — ni dans le même état d'esprit. */}
        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-(--border) pt-5">
          <span className="text-sm font-medium">Pour le débriefing</span>
          <Link
            href={`/facilitateur/${sessionId}/simulateur`}
            className="rounded-lg border border-(--border) px-4 py-2 text-sm"
          >
            Simulateur d’impacts
          </Link>
          <Link
            href={`/facilitateur/${sessionId}/moteur`}
            className="rounded-lg border border-(--border) px-4 py-2 text-sm"
          >
            Cartographie du moteur
          </Link>
          <span className="text-xs text-(--foreground-muted)">
            Réservés à l’animation : ils donnent les profils-cibles de l’alignement.
          </span>
        </div>

        {runs.length > 0 ? (
          <div className="mt-6 border-t border-(--border) pt-5">
            <h3 className="mb-2 text-sm font-medium">Dernières résolutions</h3>
            <ul className="space-y-1.5 text-sm">
              {runs.map((r, i) => (
                <li key={`${r.roundNumber}-${i}`} className="tabular flex flex-wrap gap-x-3">
                  <span>Tour {r.roundNumber}</span>
                  <span style={{ color: r.status === 'succeeded' ? 'var(--positive)' : 'var(--negative)' }}>
                    {r.status === 'succeeded' ? '✓ réussie' : '✗ échouée'}
                  </span>
                  {r.durationMs ? <span className="text-(--foreground-muted)">{(r.durationMs / 1000).toFixed(1)} s</span> : null}
                  {r.errorMessage ? <span className="text-(--negative)">{r.errorMessage}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {/* ── Avancement des équipes ───────────────────────────────────────── */}
      <section className="mb-8 rounded-xl border border-(--border) bg-(--surface) p-6">
        <h2 className="mb-4 text-xl font-medium">Avancement des équipes</h2>

        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-[52rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-(--border) text-left">
                <th className="py-2 pr-4 font-medium">Équipe</th>
                <th className="py-2 pr-4 font-medium">Code</th>
                <th className="py-2 pr-4 text-center font-medium">Connectés</th>
                <th className="py-2 pr-4 text-center font-medium">Corporate</th>
                <th className="py-2 pr-4 text-center font-medium">DAS</th>
                <th className="py-2 pr-4 text-center font-medium">Distribution</th>
                <th className="py-2 pr-4 text-center font-medium">Budget</th>
                <th className="py-2 pr-4 text-right font-medium">Trésorerie</th>
                <th className="py-2 pr-4 text-right font-medium">IA</th>
                <th className="py-2 font-medium">État</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {teams.map((t) => (
                <tr key={t.teamId} className="border-b border-(--border) last:border-0">
                  <td className="py-2.5 pr-4 font-medium">{t.name}</td>
                  <td className="py-2.5 pr-4 tracking-widest text-(--foreground-muted)">{t.joinCode}</td>
                  <td className="py-2.5 pr-4 text-center">{t.connectedMembers}</td>
                  <td className="py-2.5 pr-4 text-center"><Tick on={t.hasCorporate} /></td>
                  <td className="py-2.5 pr-4 text-center">
                    <Tick on={t.dasDone >= t.dasExpected && t.dasExpected > 0} label={`${t.dasDone}/${t.dasExpected}`} />
                  </td>
                  <td className="py-2.5 pr-4 text-center">
                    <Tick on={t.distributionDone >= t.dasExpected && t.dasExpected > 0} label={`${t.distributionDone}/${t.dasExpected}`} />
                  </td>
                  <td className="py-2.5 pr-4 text-center"><Tick on={t.hasBudget} /></td>
                  <td className="py-2.5 pr-4 text-right">{formatMadCompact(t.treasuryMad)}</td>
                  <td className="py-2.5 pr-4 text-right">{t.iaScore === null ? '—' : formatScore(t.iaScore)}</td>
                  <td className="py-2.5">
                    {t.isLiquidated ? (
                      <span className="text-(--negative)">Liquidée</span>
                    ) : t.treasuryStatus !== 'sain' ? (
                      <span className="text-(--warning)">{treasuryLabel(t.treasuryStatus)}</span>
                    ) : isReady(t) ? (
                      <span className="text-(--positive)">Prête</span>
                    ) : (
                      <span className="text-(--foreground-muted)">En cours</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Offrir une étude : levier pédagogique pour raccrocher une équipe. */}
        <div className="mt-6 border-t border-(--border) pt-5">
          <h3 className="text-sm font-medium">Offrir une étude à une équipe</h3>
          <p className="mt-1 mb-3 text-xs text-(--foreground-muted)">
            Une équipe qui décroche faute d’information ne débat plus. Le geste est gratuit pour
            elle : son compte de résultat n’est pas grevé.
          </p>
          <div className="flex flex-wrap gap-2">
            {teams.filter((t) => !t.isLiquidated).map((t) => (
              <button
                key={t.teamId} type="button" disabled={disabled}
                onClick={() =>
                  call('/api/facilitator', {
                    sessionId, action: 'gift_study', teamId: t.teamId,
                    studyKey: 'audit_alignement', tier: 'approfondie', dasId: null,
                  }, `Audit d’alignement offert à ${t.name}.`)
                }
                className="rounded-lg border border-(--border) px-3 py-1.5 text-sm disabled:opacity-40"
              >
                Audit → {t.name}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Cartes de crise ──────────────────────────────────────────────── */}
      <SettingsSection
        sessionId={sessionId}
        difficulty={difficulty}
        dials={dials}
        locked={difficultyLocked}
        sectors={sectors}
        call={call}
        disabled={disabled}
      />

      {/* ── La réserve mise sur le marché ──────────────────────────────────
          Ouvrir la diversification est un GESTE PÉDAGOGIQUE, pas un réglage.
          Tant qu'un domaine reste fermé, les équipes règlent le métier qu'elles
          ont ; ouvert trop tôt, il devient une échappatoire pour celle qui
          n'arrive pas à redresser le sien. D'où le levier, tour par tour. */}
      <section className="mb-8 rounded-xl border border-(--border) bg-(--surface) p-6">
        <h2 className="mb-1 text-xl font-medium">Domaines ouverts à l’acquisition</h2>
        <p className="mb-5 max-w-3xl text-sm text-(--foreground-muted)">
          Un domaine ouvert apparaît sur le marché des équipes, qui peuvent y entrer par
          rachat — et le pilotent ensuite comme les leurs. Fermer un domaine ne retire rien
          à celles qui l’exploitent déjà : cela retire seulement la cible du marché.
        </p>

        <ul className="space-y-2">
          {das.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-(--border) px-4 py-3"
            >
              <span className="min-w-0">
                <span className="text-sm font-medium">{d.name}</span>
                <span className="ml-3 text-sm text-(--foreground-muted)">
                  {!d.hasTargets
                    ? 'aucune cible provisionnée — non acquérable'
                    : d.marketOpen
                      ? 'sur le marché'
                      : 'en réserve'}
                </span>
              </span>

              <button
                type="button"
                disabled={disabled || !d.hasTargets}
                onClick={() =>
                  call(
                    '/api/facilitator',
                    { sessionId, action: 'set_market', dasId: d.id, open: !d.marketOpen },
                    d.marketOpen
                      ? `${d.name} retiré du marché.`
                      : `${d.name} ouvert à l’acquisition.`,
                  )
                }
                className="rounded-lg border px-4 py-2 text-sm disabled:opacity-40"
                style={{
                  borderColor: d.marketOpen ? 'var(--accent)' : 'var(--border)',
                  background: d.marketOpen ? 'var(--surface-muted)' : undefined,
                  fontWeight: d.marketOpen ? 600 : 400,
                }}
              >
                {/* Le libellé dit l'ACTION, jamais l'état : « ouvert » sur un
                    bouton laisse toujours douter de ce qu'un clic va faire. */}
                {d.marketOpen ? 'Retirer du marché' : 'Mettre sur le marché'}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-(--border) bg-(--surface) p-6">
        <h2 className="mb-1 text-xl font-medium">Opportunités &amp; menaces</h2>
        <p className="mb-5 max-w-3xl text-sm text-(--foreground-muted)">
          Les équipes voient le nom et la description de chaque carte, jamais son amplitude.
          Déclenchez quand la salle est prête à en discuter.
        </p>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium">Carte</span>
            <select
              value={selectedCard} onChange={(e) => setSelectedCard(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-sm"
            >
              {cards.map((c) => (
                <option key={c.key} value={c.key}>
                  {DIMENSIONS[c.dimension] ?? c.dimension} — {c.name}
                  {c.nature === 'opportunite' ? ' (opportunité)' : ' (menace)'}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium">Domaine touché</span>
            <select
              value={selectedDas} onChange={(e) => setSelectedDas(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-sm"
            >
              {das.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
        </div>

        {(() => {
          const card = cards.find((c) => c.key === selectedCard);
          if (!card) return null;
          return (
            <div className="mt-4 rounded-lg border border-(--border) p-4">
              <p className="text-sm">{card.description}</p>
              <p className="mt-2 text-xs text-(--foreground-muted)">
                Durée : {card.durationRounds === 0 ? 'permanent' : `${card.durationRounds} tour(s)`}
                {card.targetSectors.length > 0 ? ` · secteurs visés : ${card.targetSectors.join(', ')}` : ' · tous secteurs'}
                {card.source ? ` · source : ${card.source}` : ''}
              </p>
            </div>
          );
        })()}

        <label className="mt-4 block max-w-sm">
          <span className="text-sm font-medium">
            Points de part de marché redistribués : <span className="tabular">{redistribution}</span>
          </span>
          <input
            type="range" min={0} max={15} step={1} value={redistribution}
            onChange={(e) => setRedistribution(Number(e.target.value))}
            className="mt-1.5 w-full"
          />
          <span className="mt-1 block text-xs text-(--foreground-muted)">
            À zéro, le choc n’agit que par ses effets économiques. Au-delà, il déplace
            directement des parts au sein du pool.
          </span>
        </label>

        <button
          type="button" disabled={disabled || !selectedCard || !selectedDas}
          onClick={() =>
            call('/api/facilitator', {
              sessionId, action: 'trigger_shock', cardKey: selectedCard,
              dasId: selectedDas, redistributionPts: redistribution, beneficiaryTeamIds: [],
            }, 'Carte déclenchée — les équipes la verront dans leur War Room.')
          }
          className="mt-5 rounded-lg bg-(--accent) px-5 py-2.5 text-sm font-medium text-white disabled:opacity-40"
        >
          Déclencher cette carte
        </button>

        {activeShocks.length > 0 ? (
          <div className="mt-6 border-t border-(--border) pt-5">
            <h3 className="mb-2 text-sm font-medium">Cartes déjà déclenchées</h3>
            <ul className="tabular space-y-1 text-sm text-(--foreground-muted)">
              {activeShocks.map((s) => (
                <li key={s.id}>
                  Tour {s.roundNumber} · {cards.find((c) => c.key === s.cardKey)?.name ?? s.cardKey}
                  {' · '}{das.find((d) => d.id === s.dasId)?.name ?? '—'}
                  {s.roundsRemaining < 99 ? ` · ${s.roundsRemaining} tour(s) restant(s)` : ' · permanent'}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function isReady(t: TeamProgress): boolean {
  return (
    !t.isLiquidated && t.hasCorporate && t.hasBudget &&
    t.dasExpected > 0 && t.dasDone >= t.dasExpected && t.distributionDone >= t.dasExpected
  );
}

/** Coche portée par un symbole ET une couleur — jamais la couleur seule. */
function Tick({ on, label }: { on: boolean; label?: string }) {
  return (
    <span style={{ color: on ? 'var(--positive)' : 'var(--foreground-muted)' }}>
      {on ? '✓' : '○'}{label ? ` ${label}` : ''}
    </span>
  );
}

function Action({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button" disabled={disabled} onClick={onClick}
      className="rounded-lg border border-(--border) px-4 py-2.5 text-sm font-medium disabled:opacity-40"
    >
      {label}
    </button>
  );
}

/**
 * Geste irréversible : on arme, on lit ce qui va se passer, on confirme.
 * Verrouiller ou résoudre engage toute la salle — un clic ne doit pas suffire.
 */
function Confirm({
  label, question, confirming, disabled, onArm, onCancel, onConfirm,
}: {
  label: string; question: string; confirming: boolean; disabled: boolean;
  onArm: () => void; onCancel: () => void; onConfirm: () => void;
}) {
  if (!confirming) {
    return <Action label={label} disabled={disabled} onClick={onArm} />;
  }
  return (
    <span className="flex flex-wrap items-center gap-2 rounded-lg border border-(--warning) px-3 py-2">
      <span className="max-w-md text-sm text-(--warning)">{question}</span>
      <button type="button" onClick={onConfirm}
        className="rounded bg-(--accent) px-3 py-1.5 text-sm font-medium text-white">
        Confirmer
      </button>
      <button type="button" onClick={onCancel} className="rounded border border-(--border) px-3 py-1.5 text-sm">
        Annuler
      </button>
    </span>
  );
}
