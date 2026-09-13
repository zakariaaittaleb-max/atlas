'use client';

/**
 * ATLAS — protocole de test d'utilisabilité.
 *
 * Le déroulé d'une session de test menée en marge du jeu : préparation avant
 * l'arrivée des participants, script d'accueil, observation en direct
 * chronométrée, puis débriefing qualitatif. Les quatre phases sont un vrai
 * ordre chronologique — la numérotation encode ça, pas une convention.
 *
 * Le score SUS n'est PAS saisi ici : il est rempli par chaque participant,
 * seul, sur /sus. Un score individuel n'a pas de valeur en méthodologie SUS
 * (Brooke, 1996) — cet écran n'affiche que la moyenne du panel, en lecture
 * seule, une fois qu'il y a des réponses.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { ActionResult, ProtocolData } from './protocol-data';
import type { SusAggregate } from '@/lib/sus-types';

const PHASES = [
  { n: 1, title: 'Préparation', duration: '2–3 h avant' },
  { n: 2, title: 'Accueil', duration: '10 min' },
  { n: 3, title: 'Tests en direct', duration: '30–40 min' },
  { n: 4, title: 'Débriefing', duration: '10 min' },
] as const;

type SaveState = 'idle' | 'pending' | 'saved' | 'error';

function Field({
  label, value, onChange, placeholder, textarea,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; textarea?: boolean;
}) {
  const cls = 'w-full rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-sm text-(--foreground) placeholder:text-(--foreground-muted) focus:outline-2 focus:outline-(--accent)';
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {textarea ? (
        <textarea className={cls + ' min-h-24 resize-y'} value={value} placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input className={cls} value={value} placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}

export function ProtocoleView({
  sessionId, sessionName, initial, sus, saveAction,
}: {
  sessionId: string;
  sessionName: string;
  initial: ProtocolData;
  sus: SusAggregate;
  /** Passée par la page : un composant client n'importe pas une action serveur. */
  saveAction: (input: { sessionId: string; data: unknown }) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState(1);
  const [data, setData] = useState<ProtocolData>(initial);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const patch = useCallback((next: Partial<ProtocolData>) => {
    setData((prev) => {
      const merged = { ...prev, ...next };
      setSaveState('pending');
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        const result = await saveAction({ sessionId, data: merged });
        setSaveState(result.ok ? 'saved' : 'error');
      }, 700);
      return merged;
    });
  }, [sessionId, saveAction]);

  useEffect(() => {
    if (!running) return;
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [running]);

  useEffect(() => {
    if (!running) patch({ duration: formatTime(seconds) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  function formatTime(total: number) {
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  const saveLabel: Record<SaveState, string> = {
    idle: '', pending: 'Enregistrement…', saved: 'Enregistré', error: 'Échec de l’enregistrement',
  };

  return (
    <main className="mx-auto w-full min-w-0 max-w-4xl px-6 py-10">
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-3 border-b border-(--border) pb-5">
        <div>
          <p className="text-sm text-(--foreground-muted)">
            <Link href={`/facilitateur/${sessionId}`} className="hover:underline">
              ← {sessionName}
            </Link>
          </p>
          <h1 className="mt-1 text-2xl font-bold text-(--heading)">Protocole de test d’utilisabilité</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-(--foreground-muted)">{saveLabel[saveState]}</span>
          <a
            href={`/api/export?type=ux_protocol&sessionId=${sessionId}`}
            className="rounded-lg border border-(--border) px-3 py-1.5 text-sm font-medium hover:bg-(--surface-muted)"
          >
            Exporter le cahier (.xlsx)
          </a>
        </div>
      </header>

      <nav className="mb-6 flex gap-1 overflow-x-auto">
        {PHASES.map((p) => (
          <button
            key={p.n}
            type="button"
            onClick={() => setPhase(p.n)}
            className={
              'flex shrink-0 items-baseline gap-2 rounded-lg px-3 py-2 text-sm ' +
              (phase === p.n
                ? 'bg-(--accent) text-(--on-accent)'
                : 'border border-(--border) text-(--foreground-muted)')
            }
          >
            <span className="font-mono text-xs">{p.n}</span>
            <span>{p.title}</span>
          </button>
        ))}
      </nav>

      <div className="rounded-xl border border-(--border) bg-(--surface) p-6">
        {phase === 1 && (
          <section className="flex flex-col gap-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">1 · Préparation</h2>
              <span className="text-xs text-(--foreground-muted)">Facilitateur seul, 2–3 h avant</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Facilitateur" value={data.facilitator} onChange={(v) => patch({ facilitator: v })} placeholder="Jean Dupont" />
              <Field label="Email" value={data.email} onChange={(v) => patch({ email: v })} placeholder="jean@atlas.io" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Date de la session" value={data.date} onChange={(v) => patch({ date: v })} placeholder="15/01/2026" />
              <Field label="Lieu" value={data.location} onChange={(v) => patch({ location: v })} placeholder="Campus ABC" />
            </div>
            <Field label="Profil des participants" value={data.profile} onChange={(v) => patch({ profile: v })}
              placeholder="Ex : 2 étudiants master, première utilisation d’Atlas" textarea />

            <div className="border-t border-(--border) pt-4">
              <h3 className="mb-3 text-sm font-semibold">Les 4 tâches à observer</h3>
              <div className="flex flex-col gap-3">
                {data.tasks.map((t, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-(--accent) font-mono text-xs text-(--on-accent)">{i + 1}</span>
                    <input
                      className="w-full rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-sm"
                      value={t}
                      onChange={(e) => {
                        const tasks = [...data.tasks];
                        tasks[i] = e.target.value;
                        patch({ tasks });
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {phase === 2 && (
          <section className="flex flex-col gap-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">2 · Accueil</h2>
              <span className="text-xs text-(--foreground-muted)">10 min</span>
            </div>
            <blockquote className="rounded-lg border-l-4 border-(--warning) bg-(--surface-muted) p-4 text-sm italic">
              « Merci d’avoir accepté de tester Atlas aujourd’hui. C’est important de savoir que nous testons l’outil, pas
              vous — il n’y a pas de bonne ou mauvaise réponse. Votre honnêteté nous aide énormément. N’hésitez pas à
              parler à voix haute pendant que vous explorez : dites ce que vous voyez, ce que vous pensez, ce qui vous
              confond. »
            </blockquote>
            <div className="flex flex-col gap-2">
              {[
                'Accueil chaleureux',
                'Demander la permission d’observer et de prendre des notes',
                'Vérifier que tout le monde est à l’aise',
              ].map((label) => (
                <label key={label} className="flex items-center gap-3 rounded-lg bg-(--surface-muted) px-3 py-2.5 text-sm">
                  <input type="checkbox" className="accent-(--accent)" />
                  {label}
                </label>
              ))}
            </div>
          </section>
        )}

        {phase === 3 && (
          <section className="flex flex-col gap-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">3 · Tests en direct</h2>
              <span className="text-xs text-(--foreground-muted)">30–40 min</span>
            </div>

            <div className="rounded-lg bg-(--surface-muted) py-6 text-center font-mono text-5xl font-semibold tabular text-(--accent)">
              {formatTime(seconds)}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setRunning(true)} disabled={running}
                className="rounded-lg bg-(--accent) enabled:hover:bg-(--accent-hover) transition-colors px-4 py-2 text-sm font-medium text-(--on-accent) disabled:opacity-50">▶ Démarrer</button>
              <button type="button" onClick={() => setRunning(false)}
                className="rounded-lg border border-(--border) px-4 py-2 text-sm">⏸ Pause</button>
              <button type="button" onClick={() => { setRunning(false); setSeconds(0); }}
                className="rounded-lg border border-(--border) px-4 py-2 text-sm">↻ Réinitialiser</button>
            </div>

            <Field label="Observations en direct" value={data.observations} onChange={(v) => patch({ observations: v })}
              placeholder={'Participant cherche X pendant 30 sec\nConfusion sur où cliquer pour Y'} textarea />
            <Field label="Points de friction" value={data.friction} onChange={(v) => patch({ friction: v })}
              placeholder="Lieu précis, moment, action exacte de la confusion" textarea />
            <Field label="Moments de succès" value={data.success} onChange={(v) => patch({ success: v })}
              placeholder="Quand ils ont trouvé, compris, ou eu du plaisir" textarea />
          </section>
        )}

        {phase === 4 && (
          <section className="flex flex-col gap-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">4 · Débriefing</h2>
              <span className="text-xs text-(--foreground-muted)">10 min</span>
            </div>

            <Field label="1 — En général, qu’en pensez-vous ?" value={data.debrief.q1}
              onChange={(v) => patch({ debrief: { ...data.debrief, q1: v } })} placeholder="Réaction spontanée" textarea />
            <Field label="2 — Y a-t-il un moment où vous vous êtes senti perdu ?" value={data.debrief.q2}
              onChange={(v) => patch({ debrief: { ...data.debrief, q2: v } })} placeholder="Points de confusion" textarea />
            <Field label="3 — Qu’est-ce qui vous a plu ?" value={data.debrief.q3}
              onChange={(v) => patch({ debrief: { ...data.debrief, q3: v } })} placeholder="Points forts" textarea />
            <Field label="4 — Si vous pouviez changer une chose, ce serait ?" value={data.debrief.q4}
              onChange={(v) => patch({ debrief: { ...data.debrief, q4: v } })} placeholder="Suggestion principale" textarea />

            <div className="rounded-lg border border-dashed border-(--accent) bg-(--surface-muted) p-5">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold">Questionnaire SUS du panel</h3>
                <button type="button" onClick={() => router.refresh()} className="text-xs text-(--accent) underline">
                  Actualiser
                </button>
              </div>

              {sus.count === 0 ? (
                <p className="text-sm text-(--foreground-muted)">
                  Aucune réponse reçue. Partagez <span className="font-mono text-xs">/sus</span> aux participants —
                  chacun y répond seul, sur son propre appareil.
                </p>
              ) : (
                <>
                  <div className="mb-3 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-(--border) bg-(--border)">
                    <div className="bg-(--surface) p-3 text-center">
                      <div className="font-mono text-xl font-semibold text-(--accent)">{sus.average}</div>
                      <div className="text-xs text-(--foreground-muted)">Moyenne du panel</div>
                    </div>
                    <div className="bg-(--surface) p-3 text-center">
                      <div className="font-mono text-xl font-semibold text-(--accent)">{sus.count}</div>
                      <div className="text-xs text-(--foreground-muted)">Réponses reçues</div>
                    </div>
                  </div>
                  {sus.count < 3 && (
                    <p className="mb-3 text-xs text-(--warning)">
                      Moyenne indicative — un panel SUS fiable compte au moins 5 réponses.
                    </p>
                  )}
                  <div className="flex flex-col gap-2">
                    {sus.responses.filter((r) => r.comment).map((r, i) => (
                      <div key={i} className="rounded-lg bg-(--surface) px-3 py-2 text-sm">
                        <span className="mr-2 rounded-full bg-(--surface-muted) px-2 py-0.5 font-mono text-xs text-(--accent)">
                          {r.label} · {r.score}/100
                        </span>
                        {r.comment}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
