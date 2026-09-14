'use client';

/**
 * ATLAS — pilotage de session.
 *
 * L'écran du formateur, conçu pour être utilisé DEBOUT, dans une salle bruyante,
 * pendant qu'on lui pose des questions.
 *
 * ── CE QUE LA REFONTE A CHANGÉ ─────────────────────────────────────────────
 * La page empilait douze sections sur 6 600 px : les trois gestes qui font
 * avancer la partie (ouvrir, verrouiller, résoudre) côtoyaient la composition
 * de cartes sur mesure et les échelles de variation, que l'on règle une fois
 * avant la séance. Pour verrouiller, on remontait ; pour arbitrer la War Room,
 * on redescendait.
 *
 *   • **La conduite reste en haut, collée.** L'état du tour en étapes, et LE
 *     geste suivant mis en avant — il n'y en a jamais qu'un qui fasse avancer
 *     la partie. Les autres restent à portée, en second rang.
 *   • **Le reste est rangé par moment d'usage**, en onglets : ce qu'on suit
 *     pendant le tour, ce qu'on déclenche sur le marché, ce qu'on règle avant,
 *     ce qu'on ouvre au débriefing. L'onglet retenu vit dans l'URL.
 *   • **Les gestes irréversibles restent confirmés**, et les échecs de
 *     résolution s'affichent en clair dans la barre de conduite, là où l'on
 *     regarde au moment où ils surviennent.
 */

import { Check, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fragment, useEffect, useRef, useState, useTransition } from 'react';

import { ThemeToggle } from '@/components/theme-toggle';
import type { DifficultyDials } from '@/lib/difficulty-types';
import type { ThemeChoice } from '@/lib/display-config-types';
import { formatMadCompact, formatScore, sessionStatusLabel, treasuryLabel } from '@/lib/format';

import { SessionBriefing } from './session-briefing';
import { SettingsSection } from './settings-section';

export interface TeamProgress {
  teamId: string;
  name: string;
  joinCode: string;
  isLiquidated: boolean;
  colorHex: string;
  colorLabel: string;
  memberCount: number;
  hasCorporate: boolean;
  dasDone: number;
  dasExpected: number;
  distributionDone: number;
  hasBudget: boolean;
  treasuryMad: number;
  treasuryStatus: string;
  iaScore: number | null;
  /** Heure de soumission du tour par l'équipe, `null` tant qu'elle n'a pas soumis. */
  submittedAt: string | null;
}

/**
 * L'action arrive en prop plutôt que par import : la faire entrer ici ferait
 * entrer `lib/dal` dans le graphe d'un composant client.
 */
export type JoinTeamAction = (input: {
  sessionId: string;
  teamId: string;
  visible: boolean;
}) => Promise<{ ok: true } | { ok: false; error: string }>;

interface Card {
  key: string; name: string; description: string; nature: string;
  dimension: string; targetSectors: string[]; durationRounds: number; source: string | null;
  /** Composée par le facilitateur pour cette session. */
  custom: boolean;
}

interface Run {
  roundNumber: number; status: string; durationMs: number | null;
  errorMessage: string | null; invariantFailures: unknown;
}

const DIMENSIONS: Record<string, string> = {
  politique: 'Politique', economique: 'Économique', socioculturel: 'Socioculturel',
  technologique: 'Technologique', ecologique: 'Écologique', legal: 'Légal',
};

/** Même fuseau au rendu serveur et à l'hydratation. */
const CLOCK = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Casablanca',
});

const TABS = [
  ['conduite', 'Conduite'],
  ['marche', 'Marché & crises'],
  ['reglages', 'Réglages de session'],
  ['debriefing', 'Débriefing'],
] as const;

type TabId = (typeof TABS)[number][0];

export function FacilitatorView({
  sessionId, sessionName, joinCode, status, roundNumber, plannedRounds, maxRounds,
  teams, das, cards, activeShocks, runs, difficulty, dials, difficultyLocked, sectors,
  canPlayInTeam, playingTeamId, joinTeamAction, modulesSection, scalesSection,
  warRoomSection, warRoomPending, themeChoice, visualStyle,
}: {
  themeChoice: ThemeChoice;
  /** Style des écrans d'équipe et du projecteur : `corporate` ou `ludique`. */
  visualStyle: string;
  sessionId: string; sessionName: string; joinCode: string; status: string;
  roundNumber: number; plannedRounds: number; maxRounds: number;
  teams: TeamProgress[];
  canPlayInTeam: boolean;
  playingTeamId: string | null;
  joinTeamAction: JoinTeamAction;
  /** Rendus côté serveur puis passés tels quels : voir `modules-section.tsx`. */
  modulesSection: React.ReactNode;
  scalesSection: React.ReactNode;
  warRoomSection: React.ReactNode;
  /** Plans de War Room rédigés par les équipes et pas encore arbitrés. */
  warRoomPending: number;
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
  const [tab, setTab] = useState<TabId>('conduite');
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const disabled = busy || pending;

  // L'onglet vit dans l'URL : un rechargement, ou un lien envoyé à un
  // co-animateur, rouvre le bon. Lu après le montage — le serveur ne connaît
  // pas le fragment, et le lire au rendu désynchroniserait l'hydratation.
  useEffect(() => {
    const read = () => {
      const hash = window.location.hash.slice(1);
      if (TABS.some(([id]) => id === hash)) setTab(hash as TabId);
    };
    const initial = window.setTimeout(read, 0);
    window.addEventListener('hashchange', read);
    return () => {
      window.clearTimeout(initial);
      window.removeEventListener('hashchange', read);
    };
  }, []);

  function selectTab(id: TabId, focus = false) {
    setTab(id);
    window.history.replaceState(null, '', `#${id}`);
    if (focus) tabRefs.current[id]?.focus();
  }

  /** Renvoie la réponse de l'API en cas de succès — la création d'une carte en lit la clé. */
  async function call(
    path: string, body: Record<string, unknown>, successMessage: string,
  ): Promise<Record<string, unknown> | null> {
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
        return null;
      }
      setNotice(successMessage);
      startTransition(() => { router.refresh(); setBusy(false); });
      return payload as Record<string, unknown>;
    } catch {
      setError('Le réseau est indisponible.');
      setBusy(false);
      return null;
    }
  }

  const activeTeams = teams.filter((t) => !t.isLiquidated);
  const ready = activeTeams.filter(isReady).length;
  const submitted = activeTeams.filter((t) => t.submittedAt).length;
  const waiting = activeTeams.filter((t) => !isReady(t));

  const badges: Partial<Record<TabId, string>> = {
    conduite: `${ready}/${activeTeams.length}`,
    ...(warRoomPending > 0 ? { marche: String(warRoomPending) } : {}),
  };

  // ── Le geste suivant, et lui seul en avant ────────────────────────────────
  const canOpen = roundNumber < maxRounds && !['round_active', 'round_locked', 'round_resolving', 'completed'].includes(status);
  const openLabel = `Ouvrir le tour ${roundNumber + 1}`;

  const lockConfirm = (
    <Confirm
      key="lock"
      primary={status === 'round_active'}
      label="Verrouiller le tour"
      question={`Verrouiller fige les ${activeTeams.length} équipes au même instant.${
        activeTeams.length - ready > 0 ? ` ${activeTeams.length - ready} n’ont pas fini leur saisie.` : ''
      }`}
      confirming={confirming === 'lock'}
      onArm={() => setConfirming('lock')}
      onCancel={() => setConfirming(null)}
      disabled={disabled || status !== 'round_active'}
      onConfirm={() => { setConfirming(null); void call('/api/rounds/control', { sessionId, action: 'lock' }, 'Tour verrouillé.'); }}
    />
  );
  const resolveConfirm = (
    <Confirm
      key="resolve"
      primary={status === 'round_locked'}
      label={status === 'round_active' ? 'Résoudre sans verrouiller' : 'Résoudre le tour'}
      question="Le moteur calcule et publie les résultats à tout le pool. Si un invariant est violé, rien n’est écrit et vous pourrez corriger."
      confirming={confirming === 'resolve'}
      onArm={() => setConfirming('resolve')}
      onCancel={() => setConfirming(null)}
      disabled={disabled || (status !== 'round_active' && status !== 'round_locked')}
      onConfirm={() => { setConfirming(null); void call('/api/rounds/resolve', { sessionId }, 'Tour résolu — les résultats sont publiés.'); }}
    />
  );

  return (
    <main className="mx-auto w-full min-w-0 max-w-6xl px-6 pt-6 pb-16">
      <Link
        href="/facilitateur"
        className="inline-flex min-h-9 items-center gap-2 rounded-lg text-sm font-medium text-(--foreground-muted) hover:text-(--foreground)"
      >
        <span aria-hidden>←</span> Mes sessions
      </Link>

      <header className="mt-3 mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wider text-(--accent-text) uppercase">
            Pilotage de session
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-(--heading)">{sessionName}</h1>
          <p className="tabular mt-1.5 text-(--foreground-muted)">
            {roundNumber === 0 ? 'Onboarding' : `Tour ${roundNumber}`} sur {plannedRounds} prévus
            {' · '}{maxRounds} au plus
          </p>
        </div>
        <div className="flex flex-wrap items-stretch gap-3">
          <div className="self-center">
            <ThemeToggle initial={themeChoice} />
          </div>
          <a
            href={`/projecteur/${sessionId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-(--border) bg-(--surface) px-4 text-sm font-medium transition-colors hover:border-(--accent) hover:text-(--accent-text)"
          >
            <ExternalLink aria-hidden className="h-4 w-4" />
            Ouvrir le projecteur
            <span className="sr-only"> (nouvel onglet)</span>
          </a>
          <div className="rounded-lg border border-(--border) bg-(--surface) px-4 py-2 text-center">
            <p className="text-sm text-(--foreground-muted)">Code de session</p>
            <p className="tabular font-mono text-2xl font-semibold tracking-widest">{joinCode}</p>
          </div>
        </div>
      </header>

      {/* ── La barre de conduite ─────────────────────────────────────────── */}
      <section
        aria-labelledby="conduite-titre"
        className="sticky top-0 z-20 -mx-2 mb-6 rounded-xl border border-(--border) bg-(--surface)/95 px-5 py-4 shadow-sm backdrop-blur"
      >
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h2 id="conduite-titre" className="sr-only">Conduite du tour</h2>
            <RoundStepper status={status} roundNumber={roundNumber} />
            <p className="mt-2 text-sm text-(--foreground-muted)">
              {sessionStatusLabel(status)}
              {' · '}
              <strong className="tabular font-semibold text-(--foreground)">{submitted}/{activeTeams.length}</strong> équipes ont soumis
              {' · '}
              <strong className="tabular font-semibold text-(--foreground)">{ready}</strong> complètes
              {status === 'round_active' && waiting.length > 0 ? (
                <> · en attente : {waiting.map((t) => t.name).join(', ')}</>
              ) : null}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canOpen ? (
              <Action
                primary
                label={openLabel}
                disabled={disabled}
                onClick={() => call('/api/rounds/control', { sessionId, action: 'open' }, 'Tour ouvert.')}
              />
            ) : null}
            {status === 'round_active' ? (
              <>
                {lockConfirm}
                <Action
                  label="Prolonger de 10 min"
                  disabled={disabled}
                  onClick={() => call('/api/facilitator', { sessionId, action: 'extend', minutes: 10 }, 'Tour prolongé de 10 minutes.')}
                />
                {resolveConfirm}
              </>
            ) : null}
            {status === 'round_locked' ? resolveConfirm : null}
            {status === 'round_resolving' ? (
              <p role="status" className="text-sm font-medium text-(--foreground-muted)">Calcul en cours…</p>
            ) : null}
            {status !== 'completed' && roundNumber >= 3 && status !== 'round_active' ? (
              <Confirm
                label="Clore la session"
                question="La session passe en « terminée ». Les équipes gardent l’accès à leurs résultats et exports."
                confirming={confirming === 'complete'}
                onArm={() => setConfirming('complete')}
                onCancel={() => setConfirming(null)}
                disabled={disabled}
                onConfirm={() => { setConfirming(null); void call('/api/rounds/control', { sessionId, action: 'complete' }, 'Session close.'); }}
              />
            ) : null}
          </div>
        </div>

        {error ? (
          <p role="alert" className="mt-3 rounded-lg bg-(--negative-subtle) px-4 py-2.5 text-sm text-(--negative)">
            {error}
          </p>
        ) : null}
        <p role="status" className={notice ? 'mt-3 rounded-lg bg-(--positive-subtle) px-4 py-2.5 text-sm text-(--positive)' : 'sr-only'}>
          {notice ? <><Check aria-hidden className="mr-1.5 inline h-4 w-4" />{notice}</> : ''}
        </p>
      </section>

      {/* ── Les onglets ──────────────────────────────────────────────────── */}
      <div
        role="tablist"
        aria-label="Sections du pilotage"
        className="mb-6 flex flex-wrap gap-1 border-b border-(--border)"
        onKeyDown={(event) => {
          const index = TABS.findIndex(([id]) => id === tab);
          const target =
            event.key === 'ArrowRight' ? TABS[(index + 1) % TABS.length]
            : event.key === 'ArrowLeft' ? TABS[(index - 1 + TABS.length) % TABS.length]
            : event.key === 'Home' ? TABS[0]
            : event.key === 'End' ? TABS[TABS.length - 1]
            : null;
          if (!target) return;
          event.preventDefault();
          selectTab(target[0], true);
        }}
      >
        {TABS.map(([id, label]) => {
          const selected = tab === id;
          return (
            <button
              key={id}
              ref={(node) => { tabRefs.current[id] = node; }}
              type="button"
              role="tab"
              id={`onglet-${id}`}
              aria-selected={selected}
              aria-controls={`panneau-${id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => selectTab(id)}
              className={`-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 px-4 text-sm transition-colors ${
                selected
                  ? 'border-(--accent) font-semibold text-(--accent-text)'
                  : 'border-transparent font-medium text-(--foreground-muted) hover:text-(--foreground)'
              }`}
            >
              {label}
              {badges[id] ? (
                <span
                  className={`tabular rounded-full px-2 text-sm font-semibold ${
                    id === 'marche' ? 'bg-(--warning-subtle) text-(--warning)' : 'bg-(--surface-muted) text-(--foreground-muted)'
                  }`}
                >
                  {badges[id]}
                  <span className="sr-only">
                    {id === 'marche' ? ' plan(s) de War Room à arbitrer' : ' équipes prêtes'}
                  </span>
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Les panneaux fermés restent montés (masqués) : une carte en cours de
          composition ne perd pas sa saisie quand on va jeter un œil ailleurs. */}
      <div role="tabpanel" id="panneau-conduite" aria-labelledby="onglet-conduite" hidden={tab !== 'conduite'} className="space-y-6">
        <SessionBriefing status={status} />

        <section className="rounded-xl border border-(--border) bg-(--surface) p-6">
          <h2 className="mb-4 text-xl font-semibold text-(--heading)">Avancement des équipes</h2>

          <div className="min-w-0 overflow-x-auto">
            <table className="w-full min-w-[52rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-(--border) text-left text-(--foreground-muted)">
                  <th scope="col" className="py-2 pr-4 font-medium">Équipe</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Code</th>
                  <th scope="col" className="py-2 pr-4 text-center font-medium">Membres</th>
                  <th scope="col" className="py-2 pr-4 text-center font-medium">Stratégie Groupe</th>
                  <th scope="col" className="py-2 pr-4 text-center font-medium">Stratégie DAS</th>
                  <th scope="col" className="py-2 pr-4 text-center font-medium">Distribution</th>
                  <th scope="col" className="py-2 pr-4 text-center font-medium">Budget</th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">Trésorerie</th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">Alignement</th>
                  <th scope="col" className="py-2 font-medium">État</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {teams.map((t) => (
                  <tr key={t.teamId} className="border-b border-(--border) last:border-0">
                    <th scope="row" className="py-2.5 pr-4 text-left font-medium">
                      <span className="flex items-center gap-2">
                        {/* La couleur du groupe, la même que sur l'écran des
                            participants — doublée de son nom, jamais seule. */}
                        <span
                          aria-hidden
                          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: t.colorHex }}
                        />
                        {t.name}
                        <span className="text-sm font-normal text-(--foreground-muted)">{t.colorLabel}</span>
                      </span>
                    </th>
                    <td className="py-2.5 pr-4 font-mono tracking-widest text-(--foreground-muted)">{t.joinCode}</td>
                    <td className="py-2.5 pr-4 text-center">{t.memberCount}</td>
                    <td className="py-2.5 pr-4 text-center"><Tick on={t.hasCorporate} /></td>
                    <td className="py-2.5 pr-4 text-center">
                      <Tick on={t.dasDone >= t.dasExpected && t.dasExpected > 0} label={`${t.dasDone}/${t.dasExpected}`} />
                    </td>
                    <td className="py-2.5 pr-4 text-center">
                      <Tick on={t.distributionDone >= t.dasExpected && t.dasExpected > 0} label={`${t.distributionDone}/${t.dasExpected}`} />
                    </td>
                    <td className="py-2.5 pr-4 text-center"><Tick on={t.hasBudget} /></td>
                    <td className="py-2.5 pr-4 text-right font-mono">{formatMadCompact(t.treasuryMad)}</td>
                    <td className="py-2.5 pr-4 text-right font-mono">{t.iaScore === null ? '—' : formatScore(t.iaScore)}</td>
                    <td className="py-2.5">
                      {t.isLiquidated ? (
                        <span className="font-medium text-(--negative)">Liquidée</span>
                      ) : t.treasuryStatus !== 'sain' ? (
                        <span className="font-medium text-(--warning)">{treasuryLabel(t.treasuryStatus)}</span>
                      ) : t.submittedAt ? (
                        <span className="font-medium text-(--positive)">
                          ✓ Soumise <span className="font-normal text-(--foreground-muted)">à {CLOCK.format(new Date(t.submittedAt))}</span>
                        </span>
                      ) : isReady(t) ? (
                        <span className="font-medium text-(--foreground)">Complète, non soumise</span>
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
            <h3 className="text-base font-semibold">Offrir un audit d’alignement</h3>
            <p className="mt-1 mb-3 max-w-2xl text-sm text-(--foreground-muted)">
              Une équipe qui décroche faute d’information ne débat plus. L’audit approfondi lui est
              livré gratuitement : son compte de résultat n’est pas grevé.
            </p>
            <div className="flex flex-wrap gap-2">
              {activeTeams.map((t) => (
                <button
                  key={t.teamId} type="button" disabled={disabled}
                  onClick={() =>
                    call('/api/facilitator', {
                      sessionId, action: 'gift_study', teamId: t.teamId,
                      studyKey: 'audit_alignement', tier: 'approfondie', dasId: null,
                    }, `Audit d’alignement offert à ${t.name}.`)
                  }
                  className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-(--border) px-3 text-sm disabled:opacity-40 enabled:hover:border-(--accent)"
                >
                  <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.colorHex }} />
                  Offrir à {t.name}
                </button>
              ))}
            </div>
          </div>

          <JoinTeamBlock
            sessionId={sessionId}
            teams={teams}
            canPlay={canPlayInTeam}
            playingTeamId={playingTeamId}
            joinTeamAction={joinTeamAction}
          />
        </section>

        {runs.length > 0 ? (
          <section className="rounded-xl border border-(--border) bg-(--surface) p-6">
            <h2 className="mb-3 text-xl font-semibold text-(--heading)">Dernières résolutions</h2>
            <ul className="space-y-1.5 text-sm">
              {runs.map((r, i) => (
                <li key={`${r.roundNumber}-${i}`} className="tabular flex flex-wrap gap-x-3">
                  <span>Tour {r.roundNumber}</span>
                  <span className="font-medium" style={{ color: r.status === 'succeeded' ? 'var(--positive)' : 'var(--negative)' }}>
                    {r.status === 'succeeded' ? '✓ réussie' : '✗ échouée'}
                  </span>
                  {r.durationMs ? <span className="text-(--foreground-muted)">{(r.durationMs / 1000).toFixed(1)} s</span> : null}
                  {r.errorMessage ? <span className="text-(--negative)">{r.errorMessage}</span> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <div role="tabpanel" id="panneau-marche" aria-labelledby="onglet-marche" hidden={tab !== 'marche'}>
        <Fragment key="warroom">{warRoomSection}</Fragment>

        <section id="declencher-carte" className="mb-8 scroll-mt-40 rounded-xl border border-(--border) bg-(--surface) p-6">
          <h2 className="mb-1 text-xl font-semibold text-(--heading)">Déclencher une opportunité ou une menace</h2>
          <p className="mb-5 max-w-3xl text-sm text-(--foreground-muted)">
            Les équipes voient le nom et la description de chaque carte, jamais son amplitude.
            Déclenchez quand la salle est prête à en discuter.
          </p>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block sm:col-span-2">
              <span className="text-sm font-medium">Carte</span>
              <select
                id="carte-a-declencher"
                value={selectedCard} onChange={(e) => setSelectedCard(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-sm"
              >
                {/* Les cartes composées pour la session d'abord : c'est celle
                    qu'on vient d'écrire qu'on cherche, pas la quarantième du
                    catalogue commun. */}
                {cards.some((c) => c.custom) ? (
                  <optgroup label="Composées pour cette session">
                    {cards.filter((c) => c.custom).map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.name}{c.nature === 'opportunite' ? ' (opportunité)' : ' (menace)'}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                <optgroup label="Catalogue commun">
                  {cards.filter((c) => !c.custom).map((c) => (
                    <option key={c.key} value={c.key}>
                      {DIMENSIONS[c.dimension] ?? c.dimension} — {c.name}
                      {c.nature === 'opportunite' ? ' (opportunité)' : ' (menace)'}
                    </option>
                  ))}
                </optgroup>
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
              <div className="mt-4 rounded-lg bg-(--surface-muted) p-4">
                <p className="text-sm">{card.description}</p>
                <p className="mt-2 text-sm text-(--foreground-muted)">
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
            <span className="mt-1 block text-sm text-(--foreground-muted)">
              À zéro, la carte n’agit que par ses effets économiques. Au-delà, elle déplace
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
            className="mt-5 rounded-lg bg-(--accent) enabled:hover:bg-(--accent-hover) transition-colors px-5 py-2.5 text-sm font-medium text-(--on-accent) disabled:opacity-40"
          >
            Déclencher cette carte
          </button>

          {activeShocks.length > 0 ? (
            <div className="mt-6 border-t border-(--border) pt-5">
              <h3 className="mb-2 text-base font-semibold">Cartes déjà déclenchées</h3>
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

        {/* Composer, puis déclencher : les deux gestes se suivent. Une carte
            créée est présélectionnée ci-dessus ; « Créer et déclencher » la
            pose directement dans la War Room des équipes. */}
        <SettingsSection
          part="carte"
          sessionId={sessionId}
          difficulty={difficulty}
          dials={dials}
          locked={difficultyLocked}
          sectors={sectors}
          call={call}
          disabled={disabled}
          das={das.map((d) => ({ id: d.id, name: d.name }))}
          onCardCreated={(key) => {
            setSelectedCard(key);
            document.getElementById('declencher-carte')?.scrollIntoView({ block: 'start' });
            document.getElementById('carte-a-declencher')?.focus({ preventScroll: true });
          }}
        />

        {/* ── La réserve mise sur le marché ──────────────────────────────────
            Ouvrir la diversification est un GESTE PÉDAGOGIQUE, pas un réglage.
            Tant qu'un domaine reste fermé, les équipes règlent le métier qu'elles
            ont ; ouvert trop tôt, il devient une échappatoire pour celle qui
            n'arrive pas à redresser le sien. D'où le levier, tour par tour. */}
        <section className="mb-8 rounded-xl border border-(--border) bg-(--surface) p-6">
          <h2 className="mb-1 text-xl font-semibold text-(--heading)">Domaines ouverts à l’acquisition</h2>
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
                  <span
                    className={`ml-3 rounded-full px-2 py-0.5 text-sm ${
                      d.marketOpen ? 'bg-(--positive-subtle) font-medium text-(--positive)' : 'text-(--foreground-muted)'
                    }`}
                  >
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
                  className="rounded-lg border border-(--border) px-4 py-2 text-sm font-medium disabled:opacity-40 enabled:hover:border-(--accent)"
                >
                  {/* Le libellé dit l'ACTION, jamais l'état : « ouvert » sur un
                      bouton laisse toujours douter de ce qu'un clic va faire. */}
                  {d.marketOpen ? 'Retirer du marché' : 'Mettre sur le marché'}
                </button>
              </li>
            ))}
          </ul>
        </section>

      </div>

      <div role="tabpanel" id="panneau-reglages" aria-labelledby="onglet-reglages" hidden={tab !== 'reglages'}>
        <p className="mb-6 max-w-3xl text-sm text-(--foreground-muted)">
          Ce qui se règle avant la séance, ou entre deux tours : le niveau de difficulté, les
          décisions ouvertes aux équipes et l’amplitude qu’elles peuvent donner à chacune.
        </p>
        <StyleSection sessionId={sessionId} current={visualStyle} disabled={disabled} call={call} />
        <SettingsSection
          part="difficulte"
          sessionId={sessionId}
          difficulty={difficulty}
          dials={dials}
          locked={difficultyLocked}
          sectors={sectors}
          call={call}
          disabled={disabled}
        />
        {/* Sections construites par la page serveur : un Fragment à clé porte
            l'identité de chaque emplacement (voir l'historique de ce fichier —
            React réclamait sinon une clé à l'élément désérialisé du flux RSC). */}
        <Fragment key="modules">{modulesSection}</Fragment>
        <Fragment key="scales">{scalesSection}</Fragment>
      </div>

      <div role="tabpanel" id="panneau-debriefing" aria-labelledby="onglet-debriefing" hidden={tab !== 'debriefing'}>
        <div className="grid gap-4 md:grid-cols-2">
          <DebriefLink
            href={`/facilitateur/${sessionId}/simulateur`}
            title="Simulateur d’impacts"
            text="Rejouer une décision pour montrer à une équipe ce qu’un autre choix aurait donné."
          />
          <DebriefLink
            href={`/facilitateur/${sessionId}/moteur`}
            title="Cartographie du moteur"
            text="Ce que chaque décision déplace dans le calcul — et les profils-cibles de l’alignement. Réservée à l’animation."
          />
          <DebriefLink
            href={`/api/export?type=session_complete&sessionId=${sessionId}`}
            title="Exporter la session"
            text="Un classeur Excel de six onglets, décisions de toutes les équipes comprises. Document d’animation, jamais à distribuer."
            download
          />
          <DebriefLink
            href={`/facilitateur/${sessionId}/protocole`}
            title="Protocole de test d’utilisabilité"
            text="À ouvrir avant la séance pour la préparation, et après pour le score SUS du panel."
          />
        </div>
      </div>
    </main>
  );
}

const VISUAL_STYLES = [
  ['corporate', 'Sobre',
   'Bleu nuit, formes nettes : l’allure des outils de pilotage réels. Pour un public de cadres.'],
  ['ludique', 'Ludique',
   'Violet vif, titres arrondis, cartes plus douces : l’atmosphère d’un jeu. Pour une promotion d’étudiants.'],
] as const;

/**
 * Le style de la session. Il habille les écrans d'équipe et le projecteur, sans
 * toucher aux règles ni aux contrastes — les deux palettes tiennent AA.
 */
function StyleSection({
  sessionId, current, disabled, call,
}: {
  sessionId: string;
  current: string;
  disabled: boolean;
  call: (path: string, body: Record<string, unknown>, ok: string) => Promise<Record<string, unknown> | null>;
}) {
  return (
    <section className="mb-8 rounded-xl border border-(--border) bg-(--surface) p-6">
      <h2 className="text-xl font-semibold text-(--heading)">Style visuel des équipes</h2>
      <p className="mt-1 mb-5 max-w-3xl text-sm text-(--foreground-muted)">
        S’applique aux écrans des équipes et au projecteur, dès leur prochain affichage. Chaque
        participant garde son propre choix de thème clair ou sombre.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {VISUAL_STYLES.map(([value, label, hint]) => {
          const on = current === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={on}
              disabled={disabled || on}
              onClick={() =>
                void call(
                  '/api/facilitator',
                  { action: 'set_visual_style', sessionId, style: value },
                  `Style « ${label} » appliqué aux écrans des équipes et au projecteur.`,
                )
              }
              className="rounded-lg border p-4 text-left transition-colors enabled:hover:border-(--accent) disabled:cursor-default"
              style={{ borderColor: on ? 'var(--accent)' : 'var(--border)' }}
            >
              {/* Un aperçu dans les jetons du style lui-même. */}
              <span
                aria-hidden
                data-style={value === 'ludique' ? 'ludique' : undefined}
                className="mb-3 flex h-16 items-end gap-2 rounded-lg bg-(--background) p-2.5"
              >
                <span className="h-full w-2/5 rounded-lg border border-(--border) bg-(--surface)" />
                <span className="h-2/3 w-1/5 rounded-lg bg-(--accent)" />
                <span className="h-1/2 w-1/6 rounded-lg" style={{ background: 'var(--series-2)' }} />
                <span className="h-1/3 w-1/6 rounded-lg" style={{ background: 'var(--series-3)' }} />
              </span>
              <span className="block font-semibold">{on ? '✓ ' : ''}{label}</span>
              <span className="mt-1 block text-sm text-(--foreground-muted)">{hint}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Où en est le tour, en trois étapes. L'étape courante porte `aria-current` ;
 * une étape franchie porte une coche — jamais la seule couleur.
 */
function RoundStepper({ status, roundNumber }: { status: string; roundNumber: number }) {
  const upcoming = status === 'draft' || status === 'onboarding';
  const round = upcoming ? roundNumber + 1 : roundNumber;
  const current =
    upcoming ? -1
    : status === 'round_active' ? 0
    : status === 'round_locked' || status === 'round_resolving' ? 1
    : status === 'round_resolved' ? 2
    : 3;
  const steps = [`Tour ${round} ouvert`, 'Verrouillé', 'Résolu'];

  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm" aria-label={`Étapes du tour ${round}`}>
      {steps.map((label, index) => {
        const done = index < current || (index === current && index === steps.length - 1) || current === 3;
        const isCurrent = index === current && !done;
        return (
          <li key={label} className="flex items-center gap-2" aria-current={isCurrent ? 'step' : undefined}>
            {index > 0 ? <span aria-hidden className="h-px w-5 bg-(--border-strong)" /> : null}
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium ${
                isCurrent
                  ? 'bg-(--accent) text-(--on-accent)'
                  : done
                    ? 'bg-(--positive-subtle) text-(--positive)'
                    : 'bg-(--surface-muted) text-(--foreground-muted)'
              }`}
            >
              {done ? <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={3} /> : null}
              {label}
              <span className="sr-only">{done ? ' — fait' : isCurrent ? ' — en cours' : ' — à venir'}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function DebriefLink({
  href, title, text, download = false,
}: { href: string; title: string; text: string; download?: boolean }) {
  const className =
    'block rounded-xl border border-(--border) bg-(--surface) p-5 transition-colors hover:border-(--accent)';
  const body = (
    <>
      <span className="block text-base font-semibold text-(--heading)">{title}</span>
      <span className="mt-1 block text-sm text-(--foreground-muted)">{text}</span>
    </>
  );
  // Un export est un fichier, pas un écran : lien simple, sans routage client.
  return download ? <a href={href} className={className}>{body}</a> : <Link href={href} className={className}>{body}</Link>;
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
      <span aria-hidden>{on ? '✓' : '○'}</span>
      <span className="sr-only">{on ? 'fait' : 'à faire'}</span>
      {label ? ` ${label}` : ''}
    </span>
  );
}

function Action({
  label, disabled, onClick, primary = false,
}: { label: string; disabled: boolean; onClick: () => void; primary?: boolean }) {
  return (
    <button
      type="button" disabled={disabled} onClick={onClick}
      className={`min-h-10 rounded-lg px-4 text-sm font-medium transition-colors disabled:opacity-40 ${
        primary
          ? 'bg-(--accent) text-(--on-accent) enabled:hover:bg-(--accent-hover)'
          : 'border border-(--border) bg-(--surface) enabled:hover:border-(--accent)'
      }`}
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
  label, question, confirming, disabled, onArm, onCancel, onConfirm, primary = false,
}: {
  label: string; question: string; confirming: boolean; disabled: boolean;
  onArm: () => void; onCancel: () => void; onConfirm: () => void; primary?: boolean;
}) {
  if (!confirming) {
    return <Action label={label} disabled={disabled} onClick={onArm} primary={primary} />;
  }
  return (
    <span role="group" aria-label={label} className="flex flex-wrap items-center gap-2 rounded-lg border border-(--warning) bg-(--warning-subtle) px-3 py-2">
      <span className="max-w-md text-sm text-(--warning)">{question}</span>
      <button type="button" onClick={onConfirm}
        className="min-h-9 rounded-lg bg-(--accent) px-3 text-sm font-medium text-(--on-accent) transition-colors hover:bg-(--accent-hover)">
        Confirmer : {label.toLowerCase()}
      </button>
      <button type="button" onClick={onCancel} className="min-h-9 rounded-lg border border-(--border) bg-(--surface) px-3 text-sm">
        Annuler
      </button>
    </span>
  );
}

/**
 * Entrer dans un groupe pour y jouer.
 *
 * Le facilitateur devient un membre de l'équipe comme un autre : ses saisies
 * comptent. C'est délibéré — animer un atelier depuis la place d'un participant
 * est la seule façon de voir ce qu'une équipe voit, y compris ce qu'elle ne
 * trouve pas.
 *
 * Discret ou visible : les deux ont leur usage. Visible, il vient prêter
 * main-forte à une table qui décroche. Discret, il observe un groupe qui se
 * tient autrement dès que le formateur s'assoit à côté.
 */
function JoinTeamBlock({
  sessionId,
  teams,
  canPlay,
  playingTeamId,
  joinTeamAction,
}: {
  sessionId: string;
  teams: TeamProgress[];
  canPlay: boolean;
  playingTeamId: string | null;
  joinTeamAction: JoinTeamAction;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [visible, setVisible] = useState(true);
  const [error, setError] = useState<string | null>(null);

  if (!canPlay) return null;

  const joinable = teams.filter((t) => !t.isLiquidated);
  if (joinable.length === 0) return null;

  function join(teamId: string) {
    setError(null);
    startTransition(async () => {
      const result = await joinTeamAction({ sessionId, teamId, visible });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push('/dashboard');
    });
  }

  return (
    <div className="mt-6 border-t border-(--border) pt-5">
      <h3 className="text-base font-semibold">Entrer dans un groupe comme participant</h3>
      <p className="mt-1 mb-3 max-w-2xl text-sm text-(--foreground-muted)">
        Vous jouez réellement dans l’équipe : vos saisies comptent pour elle. Un bandeau vous
        ramène ici à tout moment, et vous ne pouvez être que dans un groupe à la fois.
      </p>

      <label className="mb-3 flex items-center gap-2 text-sm">
        <input
          id="facilitateur-visible"
          type="checkbox"
          checked={visible}
          onChange={(event) => setVisible(event.target.checked)}
          disabled={pending}
        />
        M’afficher dans la liste des connectés du groupe
      </label>

      {error ? <p role="alert" className="mb-3 text-sm text-(--negative)">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        {joinable.map((t) => (
          <button
            key={t.teamId}
            type="button"
            disabled={pending}
            onClick={() => join(t.teamId)}
            className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-(--border) px-3 text-sm disabled:opacity-40 enabled:hover:border-(--accent)"
          >
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: t.colorHex }}
            />
            {playingTeamId === t.teamId ? `Revenir dans ${t.name}` : `Rejoindre ${t.name}`}
          </button>
        ))}
      </div>
    </div>
  );
}
