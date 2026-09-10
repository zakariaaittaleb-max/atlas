'use client';

/**
 * Une étude concurrentielle, en graphiques.
 *
 * Un livrable ne se lisait qu'en téléchargeant un classeur : l'équipe sortait
 * du jeu pour le consulter, puis revenait décider de mémoire. Et une fois
 * ouvert, il n'offrait qu'une PHOTO — savoir qu'un concurrent détient 22 % du
 * marché ne dit pas s'il vient d'en gagner huit ou d'en perdre douze.
 *
 * ── CE QUE CE COMPOSANT MONTRE ─────────────────────────────────────────────
 * Un indicateur à la fois, choisi par l'équipe, en TRAJECTOIRE : une courbe par
 * concurrent, sur tous les tours joués. La comparaison qui décide — « qui monte,
 * qui décroche » — devient une forme qu'on lit d'un coup d'œil, au lieu d'un
 * tableau de nombres qu'il faut soustraire mentalement.
 *
 * La ligne de l'équipe est plus épaisse et jamais estimée : ses chiffres sont
 * les siens. Ceux des concurrents portent la marge d'erreur du palier payé —
 * l'afficher est ce qui empêche une estimation de passer pour une vérité.
 */

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useState } from 'react';

import { formatMadCompact, formatScore, formatUnits } from '@/lib/format';
import type { SubjectHistoryPoint, SupplierRank } from '@/lib/consulting-types';

export interface ChartSubject {
  subjectId: string;
  subjectName: string;
  isSelf?: boolean;
  history?: SubjectHistoryPoint[];
  suppliers?: SupplierRank[];
}

/**
 * Les indicateurs qu'on met en courbe, dans l'ordre où on les consulte.
 *
 * Tous ne méritent pas une trajectoire : la barrière à l'entrée et la menace
 * des substituts sont des propriétés de filière, identiques pour tout le monde
 * et plates par construction. Les tracer donnerait six droites superposées.
 */
const PLOTTABLE: { key: string; label: string; unit: 'DH' | '%' | 'unites' | 'score' }[] = [
  { key: 'competitor_market_share', label: 'Part de marché', unit: '%' },
  { key: 'volume_sold', label: 'Volume vendu', unit: 'unites' },
  { key: 'production_estimate', label: 'Production estimée', unit: 'unites' },
  { key: 'revenue_mad', label: 'Chiffre d’affaires', unit: 'DH' },
  { key: 'revenue_forecast_mad', label: 'CA prévisionnel', unit: 'DH' },
  { key: 'gross_margin_mad', label: 'Marge brute', unit: 'DH' },
  { key: 'margin_pct', label: 'Taux de marge', unit: '%' },
  { key: 'distribution_coverage', label: 'Couverture de distribution', unit: '%' },
  { key: 'competitor_quality', label: 'Qualité perçue', unit: 'score' },
  { key: 'competitor_notoriety', label: 'Notoriété', unit: 'score' },
  { key: 'competitor_price_position', label: 'Positionnement prix', unit: 'score' },
  { key: 'competitor_capacity', label: 'Capacité installée', unit: 'unites' },
  { key: 'volume_lost', label: 'Demande non servie', unit: 'unites' },
];

/**
 * Palette des séries.
 *
 * L'équipe prend l'accent ; les concurrents des teintes distinctes. Aucune
 * information n'est portée par la seule couleur — chaque courbe est nommée
 * dans la légende et dans l'infobulle.
 */
const SERIES_COLOURS = [
  'var(--accent)',
  '#c2410c',
  '#0f766e',
  '#7c3aed',
  '#a16207',
  '#be123c',
  '#1d4ed8',
];

export function StudyCharts({
  subjects,
  errorMargin,
}: {
  subjects: ChartSubject[];
  /** Marge du palier payé, annoncée sur le graphique. */
  errorMargin: number;
}) {
  const [metric, setMetric] = useState(PLOTTABLE[0].key);

  const spec = PLOTTABLE.find((p) => p.key === metric) ?? PLOTTABLE[0];
  const rounds = [
    ...new Set(subjects.flatMap((s) => (s.history ?? []).map((h) => h.roundNumber))),
  ].sort((a, b) => a - b);

  // Recharts veut une ligne par abscisse : on pivote l'historique, qui est
  // rangé par sujet, en un tableau rangé par tour.
  const data = rounds.map((round) => {
    const row: Record<string, number | string | null> = { round: roundLabel(round) };
    for (const subject of subjects) {
      const point = (subject.history ?? []).find((h) => h.roundNumber === round);
      row[subject.subjectName] = point?.values[metric] ?? null;
    }
    return row;
  });

  const hasData = data.some((row) =>
    subjects.some((s) => typeof row[s.subjectName] === 'number'),
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {PLOTTABLE.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setMetric(item.key)}
            aria-pressed={metric === item.key}
            className="rounded-lg border px-2.5 py-1 text-xs"
            style={{
              borderColor: metric === item.key ? 'var(--accent)' : 'var(--border)',
              background: metric === item.key ? 'var(--surface-muted)' : undefined,
              fontWeight: metric === item.key ? 600 : 400,
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {hasData ? (
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="round"
                stroke="var(--foreground-muted)"
                tick={{ fontSize: 12 }}
              />
              <YAxis
                stroke="var(--foreground-muted)"
                tick={{ fontSize: 12 }}
                width={72}
                tickFormatter={(v: number) => axisLabel(Number(v), spec.unit)}
              />
              <Tooltip
                formatter={(v, name) => [axisLabel(Number(v), spec.unit), String(name)]}
                labelFormatter={(l) => (String(l) === 'Départ' ? 'Dotation initiale' : `Tour ${String(l).replace('T', '')}`)}
                contentStyle={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontSize: 13,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {subjects.map((subject, index) => (
                <Line
                  key={subject.subjectId}
                  type="monotone"
                  dataKey={subject.subjectName}
                  stroke={SERIES_COLOURS[index % SERIES_COLOURS.length]}
                  strokeWidth={subject.isSelf ? 3 : 1.75}
                  dot={{ r: 3 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="rounded-lg border border-(--border) p-6 text-sm text-(--foreground-muted)">
          Aucun tour n’a encore été résolu : il n’y a pas de trajectoire à tracer.
          Les indicateurs apparaîtront après la première résolution.
        </p>
      )}

      <p className="mt-3 text-xs text-(--foreground-muted)">
        Votre courbe est exacte et tracée plus épaisse. Celles des concurrents sont des
        estimations à ±{Math.round(errorMargin * 100)} % — un écart de cet ordre entre deux
        équipes ne prouve rien.
      </p>
    </div>
  );
}

/**
 * Le provisionnement écrit une ligne de métriques AVANT le premier tour : c'est
 * la dotation, identique pour toutes les équipes. L'afficher « T-1 » laissait
 * croire à un tour joué que personne ne se rappelait.
 */
function roundLabel(round: number): string {
  return round < 0 ? 'Départ' : `T${round}`;
}

function axisLabel(value: number, unit: string): string {
  if (unit === 'DH') return formatMadCompact(value);
  if (unit === '%') return `${formatScore(value, 0)} %`;
  if (unit === 'unites') return formatUnits(Math.round(value));
  return formatScore(value, 0);
}

/**
 * Les fournisseurs d'un concurrent, par rang.
 *
 * Sans les volumes : qui livre qui s'observe sur un marché, combien relève du
 * contrat. Le rang suffit d'ailleurs à l'essentiel — un concurrent mono-source
 * est vulnérable, et partager son fournisseur principal veut dire qu'on se
 * dispute le même carnet de commandes.
 */
export function SupplierRanks({ subjects }: { subjects: ChartSubject[] }) {
  const withSuppliers = subjects.filter((s) => (s.suppliers ?? []).length > 0);
  if (withSuppliers.length === 0) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {withSuppliers.map((subject) => (
        <div key={subject.subjectId} className="rounded-lg border border-(--border) p-3">
          <p className="text-sm font-medium">{subject.subjectName}</p>
          <ol className="mt-2 space-y-1 text-sm">
            {(subject.suppliers ?? []).map((supplier) => (
              <li key={supplier.rank} className="flex flex-wrap items-baseline gap-2">
                <span className="tabular text-(--foreground-muted)">{supplier.rank}.</span>
                <span>{supplier.name}</span>
                {supplier.sharedWithYou ? (
                  <span
                    className="rounded px-1.5 py-0.5 text-xs"
                    style={{ background: 'var(--surface-muted)', color: 'var(--warning)' }}
                  >
                    aussi le vôtre
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
          {(subject.suppliers ?? []).length === 1 ? (
            <p className="mt-2 text-xs" style={{ color: 'var(--warning)' }}>
              Mono-source : une rupture chez ce fournisseur l’arrête net.
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
