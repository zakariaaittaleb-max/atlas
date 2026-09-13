'use client';

/**
 * ATLAS — cabinet de conseil.
 *
 * L'écran doit rendre lisible le seul arbitrage qui compte ici : **le prix
 * n'achète pas l'accès à l'information, il achète sa précision**. Chaque palier
 * affiche donc sa marge d'erreur et dit explicitement ce qu'il ne couvre pas.
 *
 * Les signaux faibles sont nommés, pas cachés : une équipe doit pouvoir décider
 * en connaissance de cause de jouer à l'aveugle sur la santé financière de ses
 * fournisseurs. Ce qu'elle ne saura pas, c'est ce que cette ignorance lui
 * coûtera au tour 4.
 */

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import Link from 'next/link';

import type { ChartSubject } from '@/components/study-charts';
import type { FieldDisclosure } from '@/lib/consulting-types';
import { formatMadCompact, formatPct } from '@/lib/format';

export interface StudyOffer {
  key: string;
  name: string;
  description: string;
  scope: 'das' | 'team' | 'session';
  tiers: {
    tier: string;
    label: string;
    priceMad: number;
    errorMargin: number;
    includesWeakSignals: boolean;
    bandCount: number | null;
  }[];
}

export interface OrderedStudy {
  orderId: string;
  studyKey: string;
  studyName: string;
  tier: string;
  dasId: string | null;
  targetActorId: string | null;
  roundNumber: number;
  priceMad: number;
  errorMargin: number;
  /** Le livrable figé à la commande, tel qu'il se lit dans l'écran. */
  subjects: DeliverableView[];
  notes: string[];
}

export interface DeliverableView extends ChartSubject {
  fields: FieldDisclosure[];
}

/**
 * Le palier déjà commandé ce tour pour cette étude, sur ce périmètre.
 *
 * Le périmètre compte : une étude concurrentielle sur l'agro-industrie ne dit
 * rien du textile, et une due diligence porte sur UNE cible. Griser les paliers
 * sans regarder le domaine interdirait d'étudier son second métier.
 */
function boughtTierOf(
  orders: OrderedStudy[],
  studyKey: string,
  roundNumber: number,
  dasId: string | null,
  targetActorId: string | null,
): string | null {
  const match = orders.find(
    (o) =>
      o.studyKey === studyKey &&
      o.roundNumber === roundNumber &&
      (dasId === null || o.dasId === dasId) &&
      (targetActorId === null || o.targetActorId === targetActorId),
  );
  return match?.tier ?? null;
}

/** Ce que chaque étude réserve à son palier approfondi, et pourquoi ça compte. */
const WEAK_SIGNALS: Record<string, string> = {
  benchmark_fourn:
    'Santé financière des fournisseurs — le seul indicateur qui annonce une rupture d’approvisionnement avant qu’elle survienne.',
  pestel_sectoriel: 'Risque de choc au tour suivant — anticiper plutôt que subir.',
  concurrentielle: 'Capacité installée des concurrents — qui peut encaisser une guerre de volume.',
  panel_conso: 'Croissance par segment — lequel décolle.',
  due_diligence: 'Passifs non déclarés — l’ardoise dont on hérite.',
  benchmark_distri: '',
  audit_alignement: '',
};

export function CabinetView({
  roundNumber, decisionsOpen, offers, das, targets, orders,
}: {
  roundNumber: number;
  decisionsOpen: boolean;
  offers: StudyOffer[];
  das: { id: string; name: string }[];
  targets: { id: string; name: string; dasId: string }[];
  orders: OrderedStudy[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDas, setSelectedDas] = useState<Record<string, string>>({});
  const [selectedTarget, setSelectedTarget] = useState<string>(targets[0]?.id ?? '');

  const disabled = busy || pending || !decisionsOpen;

  async function order(studyKey: string, tier: string, scope: StudyOffer['scope']) {
    setError(null);
    setBusy(true);
    const dasId = scope === 'das' ? (selectedDas[studyKey] ?? das[0]?.id ?? null) : null;
    try {
      const res = await fetch('/api/consulting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studyKey, tier, dasId,
          targetActorId: studyKey === 'due_diligence' ? selectedTarget : null,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setError(payload.error ?? 'Commande refusée.');
        setBusy(false);
        return;
      }
      startTransition(() => { router.refresh(); setBusy(false); });
    } catch {
      setError('Le réseau est indisponible. Rien n’a été commandé.');
      setBusy(false);
    }
  }

  const spent = orders
    .filter((o) => o.roundNumber === roundNumber)
    .reduce((acc, o) => acc + o.priceMad, 0);

  return (
    <main className="mx-auto w-full min-w-0 max-w-5xl px-6 py-10">
      <header className="mb-8">
        <p className="text-sm font-medium tracking-wide text-(--foreground-muted) uppercase">
          Tour {roundNumber}
        </p>
        <h1 className="mt-1 text-3xl font-bold text-(--heading) tracking-tight">Cabinet de conseil</h1>
        <p className="mt-3 max-w-3xl text-(--foreground-muted)">
          Le prix n’achète pas l’accès à l’information : il achète sa <strong>précision</strong>.
          Une note express coûte trois fois moins cher et livre des estimations à ±25 %, en
          bandes, sans les signaux faibles. À vous de juger ce que l’incertitude vous coûtera.
        </p>
        {spent > 0 ? (
          <p className="tabular mt-3 text-sm text-(--foreground-muted)">
            Engagé ce tour : <strong>{formatMadCompact(spent)}</strong> — décaissé à la résolution.
          </p>
        ) : null}
      </header>

      {!decisionsOpen ? (
        <p className="mb-8 rounded-lg border border-(--warning) px-4 py-3 text-sm text-(--warning)">
          Le tour est verrouillé : le cabinet n’accepte plus de mission.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mb-8 rounded-lg border border-(--negative) px-4 py-3 text-sm text-(--negative)">
          {error}
        </p>
      ) : null}

      <section className="mb-12 space-y-5">
        {offers.map((offer) => (
          <article key={offer.key} className="rounded-xl border border-(--border) bg-(--surface) p-6">
            <h2 className="text-lg font-medium">{offer.name}</h2>
            <p className="mt-1 max-w-3xl text-sm text-(--foreground-muted)">{offer.description}</p>

            {offer.scope === 'das' ? (
              <label className="mt-4 block max-w-sm">
                <span className="text-sm font-medium">Domaine d’activité</span>
                <select
                  value={selectedDas[offer.key] ?? das[0]?.id ?? ''}
                  onChange={(e) =>
                    setSelectedDas((prev) => ({ ...prev, [offer.key]: e.target.value }))
                  }
                  className="mt-1.5 w-full rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-sm"
                >
                  {das.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </label>
            ) : null}

            {offer.key === 'due_diligence' && targets.length > 0 ? (
              <label className="mt-4 block max-w-sm">
                <span className="text-sm font-medium">Cible à examiner</span>
                <select
                  value={selectedTarget}
                  onChange={(e) => setSelectedTarget(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-sm"
                >
                  {targets.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </label>
            ) : null}

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {offer.tiers.map((t) => {
                // Déjà payée ce tour, sur CE domaine et CETTE cible : les autres
                // paliers se grisent. Ils restent cliquables — monter en gamme
                // est une décision légitime — mais au prix complet, et l'écran
                // le dit avant le clic plutôt qu'après le débit.
                const bought = boughtTierOf(
                  orders, offer.key, roundNumber,
                  offer.scope === 'das' ? (selectedDas[offer.key] ?? das[0]?.id ?? null) : null,
                  offer.key === 'due_diligence' ? selectedTarget : null,
                );
                const isBought = bought === t.tier;
                const otherBought = bought !== null && !isBought;

                return (
                <button
                  key={t.tier}
                  type="button"
                  disabled={disabled}
                  onClick={() => order(offer.key, t.tier, offer.scope)}
                  className="rounded-lg border p-4 text-left transition-colors hover:border-(--accent) disabled:opacity-40"
                  style={{
                    borderColor: isBought ? 'var(--accent)' : 'var(--border)',
                    opacity: otherBought ? 0.55 : 1,
                  }}
                >
                  <span className="block text-sm font-medium">
                    {t.label}
                    {isBought ? (
                      <span className="ml-2 text-xs font-normal text-(--positive)">
                        commandée ce tour
                      </span>
                    ) : null}
                  </span>
                  <span className="tabular mt-1 block text-lg font-semibold">
                    {formatMadCompact(t.priceMad)}
                  </span>
                  <span className="mt-2 block text-xs text-(--foreground-muted)">
                    {t.errorMargin > 0
                      ? `Marge d’erreur ±${(t.errorMargin * 100).toFixed(0)} %`
                      : 'Sans marge d’erreur'}
                    {t.bandCount !== null ? ` · ${t.bandCount} bandes` : ' · valeurs chiffrées'}
                  </span>
                  {otherBought ? (
                    <span className="mt-2 block text-xs" style={{ color: 'var(--warning)' }}>
                      Vous avez déjà commandé cette étude ce tour. La reprendre ici coûtera
                      le prix complet.
                    </span>
                  ) : null}
                  {!t.includesWeakSignals && WEAK_SIGNALS[offer.key] ? (
                    <span className="mt-2 block text-xs text-(--warning)">
                      Ne couvre pas : {WEAK_SIGNALS[offer.key]}
                    </span>
                  ) : null}
                </button>
                );
              })}
            </div>
          </article>
        ))}
      </section>

      <section>
        <h2 className="mb-4 text-xl font-medium">Vos études</h2>
        {orders.length === 0 ? (
          <p className="rounded-xl border border-(--border) bg-(--surface) p-6 text-(--foreground-muted)">
            Aucune étude commandée. Sans information, vous jouez à l’aveugle — c’est une
            stratégie, pas un oubli, mais assumez-la.
          </p>
        ) : (
          <ul className="space-y-3">
            {orders.map((o) => (
              <li
                key={o.orderId}
                className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-(--border) bg-(--surface) p-5"
              >
                <div>
                  <p className="font-medium">
                    {o.studyName}
                    <span className="ml-2 font-normal text-(--foreground-muted)">
                      {o.tier === 'express' ? 'note express' : o.tier === 'standard' ? 'étude standard' : 'étude approfondie'}
                    </span>
                  </p>
                  <p className="tabular mt-1 text-sm text-(--foreground-muted)">
                    Tour {o.roundNumber} · {formatMadCompact(o.priceMad)}
                    {o.errorMargin > 0 ? ` · ±${formatPct(o.errorMargin, 0)}` : ' · sans marge d’erreur'}
                  </p>
                </div>
                <a
                  href={`/api/consulting/${o.orderId}/download`}
                  className="rounded-lg border border-(--border) px-4 py-2 text-sm font-medium"
                >
                  Télécharger le classeur
                </a>

                {o.subjects.length > 0 ? (
                  <Link
                    href={`/cabinet/${o.orderId}`}
                    className="rounded-lg bg-(--accent) hover:bg-(--accent-hover) transition-colors px-4 py-2 text-sm font-medium text-(--on-accent)"
                  >
                    Lire le rapport
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
