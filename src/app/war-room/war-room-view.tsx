'use client';

/**
 * ATLAS — War Room : réponse aux opportunités et aux menaces.
 *
 * Quatre postures, du renoncement à la contre-attaque. **Ignorer est une
 * réponse légitime**, présentée comme telle : c'est un arbitrage budgétaire,
 * pas un oubli. Une équipe étranglée a de bonnes raisons de laisser passer un
 * choc pour préserver sa trésorerie.
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
  response: string | null;
}

const DIMENSIONS: Record<string, string> = {
  politique: 'Politique', economique: 'Économique', socioculturel: 'Socioculturel',
  technologique: 'Technologique', ecologique: 'Écologique', legal: 'Légal',
};

/** Coût en part du CA du tour précédent, et ce que chaque posture achète. */
const RESPONSES = [
  ['ignorer', 'Ignorer', 0,
   'Vous subissez l’effet plein. C’est un choix défendable si votre trésorerie ne permet rien d’autre.'],
  ['attenuer', 'Atténuer', 0.02,
   'Réduit l’effet d’environ 40 %. La réponse minimale, souvent la plus raisonnable.'],
  ['absorber', 'Absorber', 0.05,
   'Réduit l’effet d’environ 75 %. Coûteux, mais vous restez dans la course.'],
  ['retourner', 'Retourner', 0.10,
   'Neutralise l’effet et vous avantage si vos concurrents le subissent. Très cher, et sans garantie.'],
] as const;

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

  async function respond(shockId: string, response: string) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/shocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shockId, response }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setError(payload.error ?? 'Réponse refusée.');
        setBusy(false);
        return;
      }
      startTransition(() => { router.refresh(); setBusy(false); });
    } catch {
      setError('Le réseau est indisponible. Rien n’a été envoyé.');
      setBusy(false);
    }
  }

  const unanswered = shocks.filter((s) => s.response === null && s.roundsRemaining > 0);

  return (
    <main className="mx-auto w-full min-w-0 max-w-5xl px-6 py-10">
      <header className="mb-8">
        <p className="text-sm font-medium tracking-wide text-(--foreground-muted) uppercase">
          Tour {roundNumber}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">War Room</h1>
        <p className="mt-3 max-w-3xl text-(--foreground-muted)">
          Les événements qui frappent votre marché. Vous en connaissez la nature, jamais
          l’amplitude — c’est à vous d’estimer ce qu’ils vous coûteront, et ce que vous êtes
          prêt à dépenser pour vous en protéger.
        </p>
        {unanswered.length > 0 ? (
          <p className="mt-3 rounded-lg border border-(--warning) px-4 py-2.5 text-sm text-(--warning)">
            {unanswered.length} carte{unanswered.length > 1 ? 's' : ''} sans réponse budgétée.
            Ne rien décider revient à subir l’effet plein.
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
                <legend className="mb-3 text-sm font-medium">Votre réponse</legend>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {RESPONSES.map(([value, label, costPct, hint]) => {
                    const selected = shock.response === value;
                    const cost = previousRevenueMad * costPct;
                    return (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => respond(shock.shockId, value)}
                        className="rounded-lg border p-3 text-left disabled:opacity-40"
                        style={{
                          borderColor: selected ? 'var(--accent)' : 'var(--border)',
                          background: selected ? 'var(--surface-muted)' : undefined,
                        }}
                      >
                        <span className="block text-sm" style={{ fontWeight: selected ? 600 : 500 }}>
                          {selected ? '✓ ' : ''}{label}
                        </span>
                        <span className="tabular mt-1 block text-sm">
                          {cost === 0 ? 'Gratuit' : formatMadCompact(cost)}
                        </span>
                        <span className="mt-1.5 block text-xs text-(--foreground-muted)">{hint}</span>
                      </button>
                    );
                  })}
                </div>

                {shock.response === null ? (
                  <p className="mt-3 text-sm text-(--foreground-muted)">
                    Sans réponse budgétée, vous subissez l’effet plein — ce qui reste un choix.
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
