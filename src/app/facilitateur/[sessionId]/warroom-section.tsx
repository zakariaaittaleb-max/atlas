'use client';

/**
 * ATLAS — la War Room vue du facilitateur.
 *
 * Un accordéon par carte, puis par équipe : on lit le plan, on voit le budget
 * engagé, et on arbitre d'un curseur ce que cette réponse a valu.
 *
 * ── POURQUOI UN JUGEMENT PLUTÔT QU'UNE TABLE ───────────────────────────────
 * Les équipes choisissaient parmi quatre postures dont l'effet était tabulé :
 * « absorber » retirait 75 % du choc, que le plan derrière soit brillant ou
 * vide. La crise se jouait au clic. Ici, c'est le texte qui décide, lu par
 * quelqu'un — ce qui est à la fois plus juste et plus formateur, puisque
 * l'équipe doit défendre ce qu'elle écrit.
 */

import { useState, useTransition } from 'react';

import { formatMadCompact } from '@/lib/format';

export interface WarRoomTeamResponse {
  teamId: string;
  teamName: string;
  plan: string | null;
  budgetMad: number;
  impactPct: number;
  reviewed: boolean;
}

export interface WarRoomShock {
  shockId: string;
  cardName: string;
  nature: string;
  dasName: string;
  roundNumber: number;
  /**
   * Faux quand la carte n'agit que sur des grandeurs PARTAGÉES par le pool.
   *
   * La taille du marché et la redistribution de parts ne peuvent pas valoir
   * deux choses selon l'équipe qui les regarde : un marché ne se contracte pas
   * de 15 % pour l'un et de 5 % pour l'autre. Le curseur n'a alors aucune prise,
   * et l'écran doit le dire — sinon le facilitateur arbitre dans le vide, et
   * c'est en salle, devant les équipes, qu'il s'en apercevra.
   */
  arbitrable: boolean;
  responses: WarRoomTeamResponse[];
}

type Result = { ok: true } | { ok: false; error: string };

/**
 * Les mots suivent la NATURE de la carte : sur une menace, −100 % veut dire
 * « évitée » ; sur une opportunité, « manquée ». Un curseur unique dont le sens
 * s'inverse selon la carte serait un piège à contresens, et c'est au moment où
 * le facilitateur arbitre devant la salle qu'il ne peut pas se tromper.
 */
function verdict(impactPct: number, nature: string): string {
  const menace = nature !== 'opportunite';
  if (impactPct <= -95) return menace ? 'Évitée' : 'Manquée';
  if (impactPct < -10) return menace ? 'Largement amortie' : 'Mal exploitée';
  if (impactPct <= 10) return menace ? 'Subie comme annoncée' : 'Saisie comme annoncée';
  if (impactPct < 100) return menace ? 'Aggravée' : 'Bien exploitée';
  return menace ? 'Encaissée de plein fouet' : 'Pleinement exploitée';
}

export function WarRoomSection({
  sessionId,
  shocks,
  setImpactAction,
}: {
  sessionId: string;
  shocks: WarRoomShock[];
  setImpactAction: (input: {
    sessionId: string;
    shockId: string;
    teamId: string;
    impactPct: number;
  }) => Promise<Result>;
}) {
  const [draft, setDraft] = useState<Record<string, number>>(
    Object.fromEntries(
      shocks.flatMap((s) => s.responses.map((r) => [`${s.shockId}:${r.teamId}`, r.impactPct])),
    ),
  );
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: 'ok' | 'ko'; text: string } | null>(null);

  function arbitrate(shockId: string, teamId: string) {
    const key = `${shockId}:${teamId}`;
    startTransition(async () => {
      const result = await setImpactAction({
        sessionId, shockId, teamId, impactPct: draft[key] ?? 0,
      });
      setMessage(
        result.ok
          ? { kind: 'ok', text: 'Arbitrage enregistré.' }
          : { kind: 'ko', text: result.error },
      );
    });
  }

  return (
    <section className="mb-8 rounded-xl border border-(--border) bg-(--surface) p-6">
      <h2 className="text-xl font-medium">War Room — ce que les équipes ont répondu</h2>
      <p className="mt-1 mb-4 max-w-3xl text-sm text-(--foreground-muted)">
        Chaque équipe rédige son plan et engage un budget. À vous de dire ce que ce plan lui
        vaut : le curseur va de « l’événement a été évité » à « il a frappé trois fois plus
        fort ». Sans arbitrage, la carte s’applique telle qu’elle est écrite.
      </p>

      {message ? (
        <p
          className="mb-4 rounded-lg border px-4 py-2.5 text-sm"
          style={{
            borderColor: message.kind === 'ok' ? 'var(--positive)' : 'var(--negative)',
            color: message.kind === 'ok' ? 'var(--positive)' : 'var(--negative)',
          }}
        >
          {message.text}
        </p>
      ) : null}

      {shocks.length === 0 ? (
        <p className="text-sm text-(--foreground-muted)">
          Aucune carte en cours. Déclenchez-en une ci-dessous pour ouvrir la War Room.
        </p>
      ) : (
        <div className="space-y-3">
          {shocks.map((shock) => (
            <details key={shock.shockId} className="rounded-lg border border-(--border)">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-4 py-3">
                <span className="font-medium">{shock.cardName}</span>
                <span className="text-sm text-(--foreground-muted)">
                  {shock.dasName} · tour {shock.roundNumber}
                </span>
                <span
                  className="rounded px-2 py-0.5 text-xs"
                  style={{
                    background: 'var(--surface-muted)',
                    color: shock.nature === 'opportunite' ? 'var(--positive)' : 'var(--warning)',
                  }}
                >
                  {shock.nature === 'opportunite' ? 'Opportunité' : 'Menace'}
                </span>
                <span className="text-sm text-(--foreground-muted)">
                  {shock.responses.filter((r) => r.plan).length}/{shock.responses.length} plans
                </span>
              </summary>

              <div className="space-y-4 border-t border-(--border) px-4 py-4">
                {!shock.arbitrable ? (
                  <p className="rounded-lg border border-(--warning) px-4 py-3 text-sm text-(--warning)">
                    Cette carte n’agit que sur des grandeurs partagées par tout le pool — la
                    taille du marché, la redistribution des parts. Elle frappe donc les équipes
                    de la même façon, et le curseur n’a aucune prise. Lisez les plans, mais
                    l’arbitrage se jouera sur une autre carte.
                  </p>
                ) : null}
                {shock.responses.map((r) => {
                  const key = `${shock.shockId}:${r.teamId}`;
                  const value = draft[key] ?? 0;
                  return (
                    <article key={r.teamId} className="rounded-lg bg-(--surface-muted) p-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-3">
                        <h3 className="font-medium">{r.teamName}</h3>
                        <p className="tabular text-sm text-(--foreground-muted)">
                          {r.budgetMad > 0
                            ? `${formatMadCompact(r.budgetMad)} engagés`
                            : 'aucun budget engagé'}
                          {r.reviewed ? ' · arbitré' : ''}
                        </p>
                      </div>

                      {r.plan ? (
                        <p className="mt-2 text-sm whitespace-pre-wrap">{r.plan}</p>
                      ) : (
                        <p className="mt-2 text-sm text-(--foreground-muted)">
                          Aucun plan transmis. L’équipe subit l’événement tel qu’annoncé.
                        </p>
                      )}

                      <div className="mt-4 flex flex-wrap items-center gap-4">
                        <input
                          type="range"
                          min={-100}
                          max={200}
                          step={5}
                          value={value}
                          disabled={pending}
                          aria-label={`Arbitrage pour ${r.teamName}`}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, [key]: Number(e.target.value) }))
                          }
                          className="w-full max-w-md"
                        />
                        <span className="tabular text-sm font-medium">
                          {value > 0 ? '+' : ''}{value} %
                        </span>
                        <span className="text-sm text-(--foreground-muted)">
                          {verdict(value, shock.nature)}
                        </span>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => arbitrate(shock.shockId, r.teamId)}
                          className="rounded-lg bg-(--accent) enabled:hover:bg-(--accent-hover) transition-colors px-3 py-1.5 text-sm font-medium text-(--on-accent) disabled:opacity-40"
                        >
                          Arbitrer
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
