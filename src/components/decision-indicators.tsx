'use client';

/**
 * Le bouton « Indicateurs » d'un bloc de décision, et sa fenêtre.
 *
 * ── POURQUOI ───────────────────────────────────────────────────────────────
 * On arbitrait un prix sans voir sa part de marché, un volume d'achat sans voir
 * ses ventes perdues : les chiffres existaient, mais sur le dashboard, à deux
 * écrans de là. Recopier ces cartes sous chaque décision aurait noyé la saisie ;
 * elles restent donc à un geste, et ne montrent que ce qui éclaire la décision
 * ouverte.
 *
 * ── À LA DEMANDE ───────────────────────────────────────────────────────────
 * Rien n'est chargé tant que la fenêtre n'est pas ouverte, et chaque ouverture
 * relit la donnée : entre deux ouvertures, un tour a pu être résolu.
 */

import { ChartColumn, LoaderCircle } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useRef, useState } from 'react';

import { Dialog } from '@/components/ui/dialog';
import { StatCard } from '@/components/ui/stat-card';
import type { IndicatorSheet, IndicatorTopic } from '@/lib/decision-indicators';

export interface IndicatorsRequest {
  topic: IndicatorTopic;
  /** Domaine concerné ; absent pour une décision de niveau Groupe. */
  dasId?: string | null;
}

type Status = 'loading' | 'ready' | 'error';

export function IndicatorsButton({
  decision, topic, dasId = null,
}: IndicatorsRequest & {
  /** Le nom de la décision, repris dans le titre et dans le nom du bouton. */
  decision: string;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>('loading');
  const [sheet, setSheet] = useState<IndicatorSheet | null>(null);
  // Une réponse lente d'une ouverture précédente ne doit pas écraser la
  // suivante — changer de domaine entre deux ouvertures, par exemple.
  const request = useRef(0);
  const trigger = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    const id = ++request.current;
    setStatus('loading');
    try {
      const params = new URLSearchParams({ topic });
      if (dasId) params.set('das', dasId);
      const res = await fetch(`/api/indicators?${params}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const next = (await res.json()) as IndicatorSheet;
      if (id !== request.current) return;
      setSheet(next);
      setStatus('ready');
    } catch {
      if (id === request.current) setStatus('error');
    }
  }, [topic, dasId]);

  const subtitle =
    status === 'ready' && sheet
      ? [
          sheet.dasName,
          sheet.roundNumber === null
            ? 'aucun exercice clos'
            : sheet.roundNumber === 0
              ? 'situation initiale (T0)'
              : `dernier exercice clos : tour ${sheet.roundNumber}`,
        ].filter(Boolean).join(' · ')
      : undefined;

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        onClick={(event) => {
          // Posé dans l'en-tête cliquable d'un accordéon : ouvrir la fenêtre ne
          // doit pas replier la section.
          event.stopPropagation();
          setOpen(true);
          void load();
        }}
        className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-(--border) bg-(--surface) px-2.5 text-sm font-medium text-(--accent-text) transition-colors hover:border-(--accent) hover:bg-(--accent-subtle)"
      >
        <ChartColumn aria-hidden className="h-4 w-4" />
        <span className="max-sm:sr-only">Indicateurs</span>
        <span className="sr-only"> : {decision}</span>
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        returnFocus={trigger}
        width="lg"
        title={`Indicateurs — ${decision}`}
        subtitle={subtitle}
        footer={
          <>
            <Link
              href="/dashboard"
              className="mr-auto text-sm font-medium text-(--accent-text) underline underline-offset-4"
            >
              Tout le tableau de bord
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg bg-(--accent) px-4 py-2.5 font-medium text-(--on-accent) transition-colors hover:bg-(--accent-hover)"
            >
              Revenir à la décision
            </button>
          </>
        }
      >
        <div aria-busy={status === 'loading'}>
          {status === 'loading' ? <LoadingState /> : null}

          {status === 'error' ? (
            <div role="alert" className="rounded-lg bg-(--negative-subtle) px-4 py-3 text-sm text-(--negative)">
              Les indicateurs n’ont pas pu être chargés. Vos décisions ne sont pas concernées.{' '}
              <button type="button" onClick={() => void load()} className="font-semibold underline">
                Réessayer
              </button>
            </div>
          ) : null}

          {status === 'ready' && sheet ? <SheetBody sheet={sheet} /> : null}
        </div>
      </Dialog>
    </>
  );
}

function LoadingState() {
  return (
    <>
      <p role="status" className="flex items-center gap-2 text-sm text-(--foreground-muted)">
        <LoaderCircle aria-hidden className="h-4 w-4 animate-spin motion-reduce:animate-none" />
        Chargement des indicateurs…
      </p>
      <div aria-hidden className="mt-4 grid animate-pulse gap-4 motion-reduce:animate-none sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-36 rounded-xl border border-(--border) bg-(--surface-muted)" />
        ))}
      </div>
    </>
  );
}

function SheetBody({ sheet }: { sheet: IndicatorSheet }) {
  return (
    <>
      <p className="max-w-3xl text-(--foreground-muted)">{sheet.question}</p>

      {sheet.empty ? (
        <div className="mt-4 rounded-xl border border-(--border) bg-(--surface-muted) p-5">
          <p className="font-semibold text-(--heading)">Pas encore de chiffres pour cette décision</p>
          <p className="mt-1.5 max-w-2xl text-sm text-(--foreground-muted)">{sheet.empty}</p>
          <a
            href="/api/export?type=dossier_initial"
            className="mt-3 inline-block text-sm font-medium text-(--accent-text) underline underline-offset-4"
          >
            Télécharger le dossier initial
          </a>
        </div>
      ) : null}

      {sheet.cards.length > 0 ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sheet.cards.map((card) => (
            <StatCard
              key={card.key}
              label={card.label}
              value={card.value}
              delta={card.delta}
              trend={card.trend}
              note={card.note}
              hint={card.hint}
              source={card.scope}
              polarity={card.polarity}
            />
          ))}
        </div>
      ) : null}

      {sheet.alignment ? (
        <p className="mt-4 rounded-lg bg-(--accent-subtle) px-4 py-3 text-sm text-(--foreground)">
          <strong className="font-semibold">Lecture de l’alignement — </strong>
          {sheet.alignment}
        </p>
      ) : null}
    </>
  );
}
