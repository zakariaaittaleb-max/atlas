'use client';

import { ChartLine, Download, Maximize2, Minimize2, Table2, TriangleAlert } from 'lucide-react';
import { Component, useState, useSyncExternalStore } from 'react';

import { DataTable, downloadCsv, type DataColumn, type DataRow } from './data-table';
import { InfoHint } from './info-hint';

/**
 * Cadre commun à tous les graphiques du dashboard.
 *
 * Quatre promesses, tenues ici une fois pour toutes :
 *  • **chargement** — Recharts mesure le DOM : avant l'hydratation, un gabarit
 *    réserve la hauteur au lieu d'un blanc qui fait sauter la page ;
 *  • **repli** — si le graphique plante, les mêmes données s'affichent en
 *    tableau, avec un message qui le dit. Jamais d'écran vide ;
 *  • **tableau et export** — chaque graphique a sa vue tableau et son CSV ;
 *  • **simple d'abord** — la vue détaillée (plus d'indicateurs, plus de
 *    hauteur) s'ouvre sur demande.
 */
export function ChartContainer({
  title,
  description,
  source,
  columns,
  rows,
  filename,
  height = 264,
  controls,
  detailLabel,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  /** Provenance des données quand elles ne sont pas les vôtres. */
  source?: string;
  columns: DataColumn[];
  rows: DataRow[];
  filename: string;
  height?: number;
  /** Au-dessus du tracé : sélecteur d'indicateur, légende. */
  controls?: React.ReactNode | ((detailed: boolean) => React.ReactNode);
  /** Libellé du bouton de vue détaillée ; absent, le bouton n'existe pas. */
  detailLabel?: string;
  children: React.ReactNode | ((detailed: boolean) => React.ReactNode);
}) {
  const [mode, setMode] = useState<'chart' | 'table'>('chart');
  const [detailed, setDetailed] = useState(false);
  const hydrated = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );

  const body = typeof children === 'function' ? children(detailed) : children;
  const top = typeof controls === 'function' ? controls(detailed) : controls;
  const chartHeight = detailed ? Math.round(height * 1.4) : height;

  return (
    <figure className="min-w-0">
      <figcaption className="mb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-semibold text-(--heading)">
            {title}
            {source ? (
              <span className="rounded bg-(--surface-muted) px-1.5 py-0.5 text-xs font-normal text-(--foreground-muted) ring-1 ring-(--border)">
                {source}
              </span>
            ) : null}
            {description ? <InfoHint label={title}>{description}</InfoHint> : null}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 print:hidden">
          <div role="group" aria-label="Présentation" className="inline-flex rounded-lg bg-(--surface-muted) p-0.5 ring-1 ring-(--border) ring-inset">
            <ModeButton on={mode === 'chart'} onClick={() => setMode('chart')} icon={ChartLine} label="Graphique" />
            <ModeButton on={mode === 'table'} onClick={() => setMode('table')} icon={Table2} label="Tableau" />
          </div>
          {detailLabel ? (
            <button
              type="button"
              aria-pressed={detailed}
              onClick={() => setDetailed((d) => !d)}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-(--accent-text) hover:bg-(--accent-subtle)"
            >
              {detailed ? (
                <Minimize2 aria-hidden className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 aria-hidden className="h-3.5 w-3.5" />
              )}
              {detailed ? 'Vue simple' : detailLabel}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => downloadCsv(filename, columns, rows)}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-(--foreground-muted) hover:bg-(--surface-muted) hover:text-(--foreground)"
          >
            <Download aria-hidden className="h-3.5 w-3.5" />
            CSV
          </button>
        </div>
      </figcaption>

      {top ? <div className="mb-3">{top}</div> : null}

      {mode === 'table' ? (
        <div className="reveal">
          <DataTable columns={columns} rows={rows} caption={title} />
        </div>
      ) : !hydrated ? (
        <div
          aria-busy="true"
          aria-label={`Chargement : ${title}`}
          className="animate-pulse rounded-lg bg-(--surface-muted)"
          style={{ height: chartHeight }}
        />
      ) : (
        <ChartBoundary title={title} fallback={<DataTable columns={columns} rows={rows} caption={title} />}>
          <div className="w-full" style={{ height: chartHeight }}>
            {body}
          </div>
        </ChartBoundary>
      )}
    </figure>
  );
}

function subscribeNothing() {
  return () => {};
}

function ModeButton({
  on, onClick, icon: Icon, label,
}: {
  on: boolean;
  onClick: () => void;
  icon: typeof ChartLine;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm ${
        on
          ? 'bg-(--surface) font-semibold text-(--accent-text) shadow-sm'
          : 'font-medium text-(--foreground-muted) hover:text-(--foreground)'
      }`}
    >
      <Icon aria-hidden className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

/**
 * Filet de sécurité : un graphique qui lève une erreur (donnée inattendue,
 * régression de la librairie) laisse place à son tableau, et le dit.
 */
class ChartBoundary extends Component<
  { title: string; fallback: React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="space-y-3">
        <p className="flex items-start gap-2 rounded-lg bg-(--warning-subtle) px-3 py-2 text-sm text-(--warning)">
          <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          Le graphique « {this.props.title} » n’a pas pu s’afficher. Voici les mêmes données en
          tableau.
        </p>
        {this.props.fallback}
      </div>
    );
  }
}
