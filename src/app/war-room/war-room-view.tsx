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
 *
 * Une carte par événement, repliable : celles qui attendent encore un plan
 * s'ouvrent d'elles-mêmes, celles déjà traitées montrent leur état dans le titre.
 */

import { CircleCheck, TriangleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Accordion } from '@/components/ui/accordion';
import { GroupLegend } from '@/components/ui/form-controls';
import { InfoHint } from '@/components/ui/info-hint';
import { StatCard } from '@/components/ui/stat-card';
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
  const engaged = shocks.reduce((acc, s) => acc + s.budgetMad, 0);
  const threats = shocks.filter((s) => s.nature !== 'opportunite').length;

  return (
    <main className="mx-auto w-full min-w-0 max-w-5xl px-6 py-8 lg:py-10">
      <header className="mb-6">
        <p className="text-xs font-semibold tracking-wider text-(--accent-text) uppercase">
          Tour {roundNumber} · opérations
        </p>
        <h1 className="mt-1 flex flex-wrap items-center gap-3 text-3xl font-bold tracking-tight text-(--heading)">
          War Room
          <InfoHint label="War Room">
            Les événements qui frappent votre marché. Vous en connaissez la nature, jamais
            l’amplitude — c’est à vous d’estimer ce qu’ils vous coûteront, et ce que vous êtes
            prêt à dépenser pour vous en protéger. Votre facilitateur lit chaque plan et décide de
            ce qu’il vous vaut.
          </InfoHint>
        </h1>
      </header>

      <div className="space-y-4">
        {!decisionsOpen ? (
          <Alert tone="warning">Le tour est verrouillé : la War Room est close.</Alert>
        ) : null}
        {error ? <Alert tone="negative">{error}</Alert> : null}

        {shocks.length === 0 ? (
          <section className="rounded-xl border border-(--border) bg-(--surface) p-8">
            <h2 className="flex items-center gap-2 text-2xl font-semibold text-(--heading)">
              Aucun événement en cours
              <InfoHint label="Anticiper un choc">
                L’étude sectorielle approfondie du cabinet indique le risque de choc au tour
                suivant — c’est le seul moyen d’anticiper plutôt que de subir.
              </InfoHint>
            </h2>
            <p className="mt-3 max-w-2xl text-(--foreground-muted)">
              Rien ne frappe votre marché pour l’instant.
            </p>
          </section>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard
                label="Événements en cours"
                value={String(shocks.length)}
                note={`${threats} menace${threats > 1 ? 's' : ''} · ${shocks.length - threats} opportunité${shocks.length - threats > 1 ? 's' : ''}`}
              />
              <StatCard
                label="Sans plan transmis"
                value={String(unanswered.length)}
                note={unanswered.length > 0 ? 'Subis tels qu’annoncés' : 'Tous traités'}
                hint="Ne rien écrire revient à subir l’événement tel qu’il est annoncé — ce qui reste un choix."
              />
              <StatCard
                label="Budget engagé"
                value={formatMadCompact(engaged)}
                note={previousRevenueMad > 0 ? `1 % du CA = ${formatMadCompact(previousRevenueMad * 0.01)}` : 'Toutes réponses confondues'}
                hint="Débité que l’événement s’avère bénin ou non."
              />
            </div>

            {shocks.map((shock) => {
              const opportunity = shock.nature === 'opportunite';
              const duration =
                shock.roundsRemaining >= 99 ? 'permanent'
                : shock.roundsRemaining > 0 ? `${shock.roundsRemaining} tour${shock.roundsRemaining > 1 ? 's' : ''} restant${shock.roundsRemaining > 1 ? 's' : ''}`
                : 'terminé';

              return (
                <Accordion
                  key={shock.shockId}
                  title={shock.name}
                  defaultOpen={!shock.plan && shock.roundsRemaining > 0}
                  summary={
                    shock.plan
                      ? `plan transmis${shock.budgetMad > 0 ? ` · ${formatMadCompact(shock.budgetMad)}` : ''}`
                      : 'sans plan'
                  }
                >
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {/* Nature portée par le mot et l'icône, pas seulement par la couleur. */}
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-semibold uppercase ${
                        opportunity
                          ? 'bg-(--positive-subtle) text-(--positive)'
                          : 'bg-(--warning-subtle) text-(--warning)'
                      }`}
                    >
                      {opportunity ? <CircleCheck aria-hidden className="h-3.5 w-3.5" /> : <TriangleAlert aria-hidden className="h-3.5 w-3.5" />}
                      {opportunity ? 'Opportunité' : 'Menace'}
                    </span>
                    <span className="rounded-full bg-(--surface-muted) px-2.5 py-0.5 text-sm font-medium text-(--foreground-muted) ring-1 ring-(--border)">
                      {DIMENSIONS[shock.dimension] ?? shock.dimension}
                    </span>
                    <span className="tabular text-(--foreground-muted)">
                      {shock.dasName} · survenu au tour {shock.roundNumber} · {duration}
                    </span>
                  </div>

                  <p className="mt-3 max-w-3xl">{shock.description}</p>
                  {shock.source ? (
                    <p className="mt-2 text-xs text-(--meta)">Source : {shock.source}</p>
                  ) : null}

                  <fieldset disabled={disabled} className="mt-5 border-t border-(--border) pt-5">
                    <GroupLegend title="Votre réponse">
                      Décrivez ce que vous faites, et ce que vous y consacrez. Votre facilitateur lit
                      ce plan et décide de ce qu’il vous vaut — un plan précis et financé pèse plus
                      qu’une intention. Sans plan transmis, vous subissez l’événement tel qu’il est
                      annoncé.
                    </GroupLegend>

                    <label className="block text-sm font-medium" htmlFor={`plan-${shock.shockId}`}>
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
                      className="mt-1.5 w-full rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-sm"
                    />

                    <div className="mt-4 flex flex-wrap items-end gap-4">
                      <div>
                        <span className="flex items-center gap-2">
                          <label className="block text-sm font-medium" htmlFor={`budget-${shock.shockId}`}>
                            Budget engagé
                          </label>
                          <InfoHint label="Budget engagé">
                            Débité que l’événement s’avère bénin ou non.
                            {previousRevenueMad > 0
                              ? ` Repère : 1 % de votre chiffre d’affaires vaut ${formatMadCompact(previousRevenueMad * 0.01)}.`
                              : ''}
                          </InfoHint>
                        </span>
                        <div className="mt-1.5 flex items-center gap-2">
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
                            className="tabular w-44 rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-sm"
                            placeholder="0"
                          />
                          <span className="text-sm text-(--foreground-muted)">DH</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => submit(shock.shockId)}
                        className="rounded-lg bg-(--accent) enabled:hover:bg-(--accent-hover) transition-colors px-4 py-2.5 text-sm font-medium text-(--on-accent) disabled:opacity-40"
                      >
                        {shock.plan ? 'Mettre à jour le plan' : 'Transmettre au facilitateur'}
                      </button>

                      {saved === shock.shockId ? (
                        <span className="flex items-center gap-1.5 text-sm text-(--positive)" role="status">
                          <CircleCheck aria-hidden className="h-4 w-4" /> Transmis
                        </span>
                      ) : shock.plan ? (
                        <span className="tabular text-sm text-(--foreground-muted)">
                          Transmis · {formatMadCompact(shock.budgetMad)} engagés
                        </span>
                      ) : null}
                    </div>
                  </fieldset>
                </Accordion>
              );
            })}
          </>
        )}
      </div>
    </main>
  );
}

function Alert({ tone, children }: { tone: 'negative' | 'warning'; children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className={`flex items-start gap-2 rounded-lg px-4 py-3 text-sm ${
        tone === 'negative' ? 'bg-(--negative-subtle) text-(--negative)' : 'bg-(--warning-subtle) text-(--warning)'
      }`}
    >
      <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
