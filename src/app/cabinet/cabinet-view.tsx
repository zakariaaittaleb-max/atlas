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
 *
 * ── CE QU'ON VIENT CHERCHER D'ABORD ────────────────────────────────────────
 * Ses études déjà payées : elles sont en tête, ouvertes. Le catalogue suit, une
 * étude par bloc replié, avec dans le titre le palier déjà commandé ce tour ou
 * le prix d'entrée. La description de chaque étude est sous son « + ».
 */

import { Check, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import type { ChartSubject } from '@/components/study-charts';
import { Accordion } from '@/components/ui/accordion';
import { GroupLegend } from '@/components/ui/form-controls';
import { InfoHint } from '@/components/ui/info-hint';
import { StatCard } from '@/components/ui/stat-card';
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

const TIER_NAMES: Record<string, string> = {
  express: 'note express',
  standard: 'étude standard',
  approfondie: 'étude approfondie',
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

  const thisRound = orders.filter((o) => o.roundNumber === roundNumber);
  const spent = thisRound.reduce((acc, o) => acc + o.priceMad, 0);
  const readable = orders.filter((o) => o.subjects.length > 0).length;

  return (
    <main className="mx-auto w-full min-w-0 max-w-5xl px-6 py-8 lg:py-10">
      <header className="mb-6">
        <p className="text-xs font-semibold tracking-wider text-(--accent-text) uppercase">
          Tour {roundNumber} · conseils
        </p>
        <h1 className="mt-1 flex flex-wrap items-center gap-3 text-3xl font-bold tracking-tight text-(--heading)">
          Cabinet de conseil
          <InfoHint label="Cabinet de conseil">
            Le prix n’achète pas l’accès à l’information : il achète sa <strong>précision</strong>.
            Une note express coûte trois fois moins cher et livre des estimations à ±25 %, en
            bandes, sans les signaux faibles. À vous de juger ce que l’incertitude vous coûtera.
          </InfoHint>
        </h1>
      </header>

      <div className="space-y-4">
        {!decisionsOpen ? (
          <Alert tone="warning">Le tour est verrouillé : le cabinet n’accepte plus de mission.</Alert>
        ) : null}
        {error ? <Alert tone="negative">{error}</Alert> : null}

        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Engagé ce tour"
            value={formatMadCompact(spent)}
            note="Décaissé à la résolution"
          />
          <StatCard
            label="Études commandées"
            value={String(orders.length)}
            note={`dont ${thisRound.length} ce tour`}
          />
          <StatCard
            label="Rapports à lire"
            value={String(readable)}
            note={readable > 0 ? 'Lisibles dans l’écran' : 'Aucun pour l’instant'}
          />
        </div>

        {/* ── Ce qui a déjà été payé ───────────────────────────────────────── */}
        <Accordion
          title="Vos études"
          defaultOpen={orders.length > 0}
          summary={orders.length === 0 ? 'aucune' : `${orders.length} étude${orders.length > 1 ? 's' : ''}`}
          hint="Chaque étude se lit dans l’écran ou se télécharge en classeur. Ses chiffres sont figés à la commande, marge d’erreur comprise."
        >
          {orders.length === 0 ? (
            <p className="flex flex-wrap items-center gap-2 text-sm text-(--foreground-muted)">
              Aucune étude commandée.
              <InfoHint label="Jouer sans étude">
                Sans information, vous jouez à l’aveugle — c’est une stratégie, pas un oubli, mais
                assumez-la.
              </InfoHint>
            </p>
          ) : (
            <ul className="divide-y divide-(--border) rounded-lg border border-(--border)">
              {orders.map((o) => (
                <li key={o.orderId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {o.studyName}
                      <span className="ml-2 font-normal text-(--foreground-muted)">
                        {TIER_NAMES[o.tier] ?? o.tier}
                      </span>
                    </p>
                    <p className="tabular mt-0.5 text-xs text-(--meta)">
                      Tour {o.roundNumber} · {formatMadCompact(o.priceMad)}
                      {o.errorMargin > 0 ? ` · ±${formatPct(o.errorMargin, 0)}` : ' · sans marge d’erreur'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={`/api/consulting/${o.orderId}/download`}
                      className="rounded-lg border border-(--border) px-3.5 py-2 text-sm font-medium hover:border-(--border-strong)"
                    >
                      Télécharger le classeur
                    </a>
                    {o.subjects.length > 0 ? (
                      <Link
                        href={`/cabinet/${o.orderId}`}
                        className="rounded-lg bg-(--accent) hover:bg-(--accent-hover) transition-colors px-3.5 py-2 text-sm font-medium text-(--on-accent)"
                      >
                        Lire le rapport
                      </Link>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Accordion>

        {/* ── Le catalogue ─────────────────────────────────────────────────── */}
        <h2 className="pt-4 text-2xl font-semibold text-(--heading)">Commander une étude</h2>

        {offers.map((offer) => {
          const scopeDas = offer.scope === 'das' ? (selectedDas[offer.key] ?? das[0]?.id ?? null) : null;
          const scopeTarget = offer.key === 'due_diligence' ? selectedTarget : null;
          const bought = boughtTierOf(orders, offer.key, roundNumber, scopeDas, scopeTarget);
          const cheapest = Math.min(...offer.tiers.map((t) => t.priceMad));

          return (
            <Accordion
              key={offer.key}
              title={offer.name}
              summary={bought ? `commandée : ${TIER_NAMES[bought] ?? bought}` : `dès ${formatMadCompact(cheapest)}`}
              hint={
                <>
                  {offer.description}
                  {WEAK_SIGNALS[offer.key] ? (
                    <span className="mt-2 block">
                      <strong className="font-semibold">Réservé au palier qui couvre les signaux faibles :</strong>{' '}
                      {WEAK_SIGNALS[offer.key]}
                    </span>
                  ) : null}
                </>
              }
            >
              {offer.scope === 'das' || (offer.key === 'due_diligence' && targets.length > 0) ? (
                <div className="mb-4 grid gap-4 sm:grid-cols-2">
                  {offer.scope === 'das' ? (
                    <label className="block">
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
                    <label className="block">
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
                </div>
              ) : null}

              <GroupLegend as="p" title="Choisir un palier" />
              <div className="grid gap-3 sm:grid-cols-3">
                {offer.tiers.map((t) => {
                  // Déjà payée ce tour, sur CE domaine et CETTE cible : les autres
                  // paliers se grisent. Ils restent cliquables — monter en gamme
                  // est une décision légitime — mais au prix complet, et l'écran
                  // le dit avant le clic plutôt qu'après le débit.
                  const isBought = bought === t.tier;
                  const otherBought = bought !== null && !isBought;

                  return (
                    <button
                      key={t.tier}
                      type="button"
                      disabled={disabled}
                      onClick={() => order(offer.key, t.tier, offer.scope)}
                      className={`rounded-lg border p-4 text-left transition-colors enabled:hover:border-(--accent) disabled:opacity-40 ${
                        isBought ? 'border-(--accent) bg-(--accent-subtle)' : 'border-(--border) bg-(--surface)'
                      } ${otherBought ? 'opacity-60' : ''}`}
                    >
                      <span className="flex items-center justify-between gap-2 text-sm font-medium">
                        {t.label}
                        {isBought ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-(--accent-text)">
                            <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />
                            commandée
                          </span>
                        ) : null}
                      </span>
                      <span className="tabular mt-1 block font-mono text-lg font-semibold">
                        {formatMadCompact(t.priceMad)}
                      </span>
                      <span className="mt-2 block text-xs text-(--foreground-muted)">
                        {t.errorMargin > 0
                          ? `±${(t.errorMargin * 100).toFixed(0)} %`
                          : 'Sans marge d’erreur'}
                        {t.bandCount !== null ? ` · ${t.bandCount} bandes` : ' · valeurs chiffrées'}
                        {WEAK_SIGNALS[offer.key]
                          ? t.includesWeakSignals ? ' · signaux faibles' : ' · sans signaux faibles'
                          : ''}
                      </span>
                      {otherBought ? (
                        <span className="mt-2 block text-xs font-medium text-(--warning)">
                          Déjà commandée ce tour : prix complet
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </Accordion>
          );
        })}
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
