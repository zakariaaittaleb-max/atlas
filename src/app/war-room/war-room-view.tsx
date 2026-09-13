'use client';

/**
 * ATLAS — War Room : réponse aux opportunités et aux menaces.
 *
 * ── POURQUOI LA RÉPONSE EST ÉCRITE ─────────────────────────────────────────
 * L'écran proposait quatre postures — ignorer, atténuer, absorber, retourner —
 * dont le coût et l'effet étaient tabulés. Une crise se jouait donc au clic, et
 * la meilleure réponse se devinait sans jamais l'écrire : exactement ce qu'un
 * atelier de stratégie ne doit pas récompenser.
 *
 * L'équipe RÉDIGE désormais son plan et engage un budget. Le facilitateur lit
 * chaque plan et arbitre lui-même ce qu'il vaut. Ne rien écrire reste une
 * réponse légitime — une équipe étranglée a de bonnes raisons de laisser passer
 * un choc pour préserver sa trésorerie — mais c'est alors l'événement tel
 * qu'annoncé qui s'applique.
 *
 * Ce que l'écran NE DIT PAS : l'amplitude du choc. Les équipes voient le nom, la
 * description et la source institutionnelle — jamais les chiffres. Qu'un
 * industriel sache qu'une sécheresse sévit est réaliste ; en connaître d'avance
 * l'effet exact sur sa capacité ne l'est pas.
 */

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { formatMadCompact } from '@/lib/format';

export interface ActiveShock {
  shockId: string;
  name: string;
  description: string;
  nature: string;
  dimension: string;
  source: string | null;
  dasName: string;
  roundNumber: number;
  roundsRemaining: number;
  /** Le plan rédigé par l'équipe, tel qu'il est en base. */
  plan: string | null;
  /** Ce que l'équipe a engagé sur cette réponse. */
  budgetMad: number;
}

const DIMENSIONS: Record<string, string> = {
  politique: 'Politique', economique: 'Économique', socioculturel: 'Socioculturel',
  technologique: 'Technologique', ecologique: 'Écologique', legal: 'Légal',
};

export function WarRoomView({
  roundNumber, decisionsOpen, shocks, previousRevenueMad,
}: {
  roundNumber: number;
  decisionsOpen: boolean;
  shocks: ActiveShock[];
  previousRevenueMad: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disabled = busy || pending || !decisionsOpen;

  /** Le brouillon local, pour que la frappe ne dépende pas d'un aller-retour. */
  const [drafts, setDrafts] = useState<Record<string, { plan: string; budget: string }>>(
    Object.fromEntries(
      shocks.map((s) => [
        s.shockId,
        { plan: s.plan ?? '', budget: s.budgetMad > 0 ? String(Math.round(s.budgetMad)) : '' },
      ]),
    ),
  );
  const [saved, setSaved] = useState<string | null>(null);

  async function submit(shockId: string) {
    const draft = drafts[shockId] ?? { plan: '', budget: '' };
    setError(null);
    setSaved(null);
    setBusy(true);
    try {
      const res = await fetch('/api/shocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shockId,
          plan: draft.plan,
          budgetMad: Number(draft.budget.replace(/\s/g, '')) || 0,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setError(payload.error ?? 'Réponse refusée.');
        setBusy(false);
        return;
      }
      setSaved(shockId);
      startTransition(() => { router.refresh(); setBusy(false); });
    } catch {
      setError('Le réseau est indisponible. Rien n’a été envoyé.');
      setBusy(false);
    }
  }

  const unanswered = shocks.filter((s) => !s.plan && s.roundsRemaining > 0);

  return (
    <main className="mx-auto w-full min-w-0 max-w-5xl px-6 py-10">
      <header className="mb-8">
        <p className="text-sm font-medium tracking-wide text-(--foreground-muted) uppercase">
          Tour {roundNumber}
        </p>
        <h1 className="mt-1 text-3xl font-bold text-(--heading) tracking-tight">War Room</h1>
        <p className="mt-3 max-w-3xl text-(--foreground-muted)">
          Les événements qui frappent votre marché. Vous en connaissez la nature, jamais
          l’amplitude — c’est à vous d’estimer ce qu’ils vous coûteront, et ce que vous êtes
          prêt à dépenser pour vous en protéger.
        </p>
        {unanswered.length > 0 ? (
          <p className="mt-3 rounded-lg border border-(--warning) px-4 py-2.5 text-sm text-(--warning)">
            {unanswered.length} carte{unanswered.length > 1 ? 's' : ''} sans plan rédigé.
            Ne rien écrire revient à subir l’événement tel qu’il est annoncé.
          </p>
        ) : null}
      </header>

      {!decisionsOpen ? (
        <p className="mb-8 rounded-lg border border-(--warning) px-4 py-3 text-sm text-(--warning)">
          Le tour est verrouillé : la War Room est close.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mb-8 rounded-lg border border-(--negative) px-4 py-3 text-sm text-(--negative)">
          {error}
        </p>
      ) : null}

      {shocks.length === 0 ? (
        <section className="rounded-xl border border-(--border) bg-(--surface) p-8">
          <h2 className="text-xl font-medium">Aucun événement en cours</h2>
          <p className="mt-3 max-w-2xl text-(--foreground-muted)">
            Rien ne frappe votre marché pour l’instant. L’étude sectorielle approfondie du
            cabinet indique le <strong>risque de choc au tour suivant</strong> — c’est le seul
            moyen d’anticiper plutôt que de subir.
          </p>
        </section>
      ) : (
        <ul className="space-y-5">
          {shocks.map((shock) => (
            <li
              key={shock.shockId}
              className="rounded-xl border bg-(--surface) p-6"
              style={{
                borderColor:
                  shock.nature === 'opportunite' ? 'var(--positive)' : 'var(--warning)',
              }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium tracking-wide uppercase"
                     style={{ color: shock.nature === 'opportunite' ? 'var(--positive)' : 'var(--warning)' }}>
                    {/* Nature portée par le mot, pas seulement par la couleur. */}
                    {shock.nature === 'opportunite' ? 'Opportunité' : 'Menace'}
                    {' · '}{DIMENSIONS[shock.dimension] ?? shock.dimension}
                  </p>
                  <h2 className="mt-1 text-xl font-medium">{shock.name}</h2>
                </div>
                <p className="tabular text-sm text-(--foreground-muted)">
                  {shock.dasName} · survenu au tour {shock.roundNumber}
                  {shock.roundsRemaining < 99 && shock.roundsRemaining > 0
                    ? ` · ${shock.roundsRemaining} tour(s) restant(s)`
                    : shock.roundsRemaining >= 99 ? ' · permanent' : ' · terminé'}
                </p>
              </div>

              <p className="mt-3 max-w-3xl">{shock.description}</p>
              {shock.source ? (
                <p className="mt-2 text-xs text-(--foreground-muted)">Source : {shock.source}</p>
              ) : null}

              <fieldset disabled={disabled} className="mt-5 border-t border-(--border) pt-5">
                <legend className="mb-1 text-sm font-medium">Votre réponse</legend>
                <p className="mb-3 text-xs text-(--foreground-muted)">
                  Décrivez ce que vous faites, et ce que vous y consacrez. Votre facilitateur
                  lit ce plan et décide de ce qu’il vous vaut — un plan précis et financé
                  pèse plus qu’une intention.
                </p>

                <label className="block text-xs font-medium" htmlFor={`plan-${shock.shockId}`}>
                  Votre plan d’action
                </label>
                <textarea
                  id={`plan-${shock.shockId}`}
                  rows={4}
                  value={drafts[shock.shockId]?.plan ?? ''}
                  onChange={(e) =>
                    setDrafts((d) => ({
                      ...d,
                      [shock.shockId]: { ...(d[shock.shockId] ?? { plan: '', budget: '' }), plan: e.target.value },
                    }))
                  }
                  maxLength={2000}
                  placeholder="Ce que vous décidez, pourquoi, et ce que vous en attendez."
                  className="mt-1 w-full rounded-lg border border-(--border) bg-(--background) px-3 py-2 text-sm"
                />

                <div className="mt-3 flex flex-wrap items-end gap-4">
                  <div>
                    <label className="block text-xs font-medium" htmlFor={`budget-${shock.shockId}`}>
                      Budget engagé
                    </label>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        id={`budget-${shock.shockId}`}
                        type="text"
                        inputMode="numeric"
                        value={drafts[shock.shockId]?.budget ?? ''}
                        onChange={(e) =>
                          setDrafts((d) => ({
                            ...d,
                            [shock.shockId]: {
                              ...(d[shock.shockId] ?? { plan: '', budget: '' }),
                              budget: e.target.value.replace(/[^0-9]/g, ''),
                            },
                          }))
                        }
                        className="tabular w-44 rounded-lg border border-(--border) bg-(--background) px-3 py-2 text-sm"
                        placeholder="0"
                      />
                      <span className="text-sm text-(--foreground-muted)">DH</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => submit(shock.shockId)}
                    className="rounded-lg bg-(--accent) enabled:hover:bg-(--accent-hover) transition-colors px-4 py-2 text-sm font-medium text-(--on-accent) disabled:opacity-40"
                  >
                    Transmettre au facilitateur
                  </button>

                  {saved === shock.shockId ? (
                    <span className="text-sm text-(--positive)">Transmis.</span>
                  ) : null}

                  {previousRevenueMad > 0 ? (
                    <span className="tabular text-xs text-(--foreground-muted)">
                      Repère : 1 % de votre chiffre d’affaires vaut{' '}
                      {formatMadCompact(previousRevenueMad * 0.01)}
                    </span>
                  ) : null}
                </div>

                {shock.budgetMad > 0 ? (
                  <p className="tabular mt-3 text-xs text-(--foreground-muted)">
                    Engagé sur cette carte : {formatMadCompact(shock.budgetMad)} — débité que
                    l’événement s’avère bénin ou non.
                  </p>
                ) : null}

                {!shock.plan ? (
                  <p className="mt-3 text-sm text-(--foreground-muted)">
                    Sans plan transmis, vous subissez l’événement tel qu’il est annoncé — ce
                    qui reste un choix.
                  </p>
                ) : null}
              </fieldset>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
