'use client';

/**
 * Tableau de données, et son export CSV.
 *
 * Il sert trois fois : comme vue Analyste, comme alternative à chaque
 * graphique (bouton « Tableau »), et comme repli quand un graphique échoue à
 * s'afficher. Les mêmes lignes alimentent les trois, si bien qu'un chiffre lu
 * dans le tableau est exactement celui que le graphique trace.
 */

export interface DataColumn {
  key: string;
  label: string;
  /** Affichage à l'écran. L'export garde la valeur brute. */
  format?: (value: unknown) => string;
  align?: 'left' | 'right';
}

export type DataRow = Record<string, string | number | null | undefined>;

export function DataTable({
  columns,
  rows,
  caption,
}: {
  columns: DataColumn[];
  rows: DataRow[];
  caption?: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-(--foreground-muted)">Aucune ligne à afficher.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-(--border)">
      <table className="tabular w-full border-collapse text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="bg-(--surface-muted)">
            {columns.map((column, index) => (
              <th
                key={column.key}
                scope="col"
                className={`border-b border-(--border) px-3 py-2 text-xs font-semibold whitespace-nowrap text-(--foreground-muted) ${
                  alignOf(column, rows, index) === 'right' ? 'text-right' : 'text-left'
                }`}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="odd:bg-(--surface) even:bg-(--surface-muted)/60 hover:bg-(--accent-subtle)">
              {columns.map((column, index) => {
                const value = row[column.key];
                const right = alignOf(column, rows, index) === 'right';
                return (
                  <td
                    key={column.key}
                    className={`border-b border-(--border) px-3 py-2 whitespace-nowrap ${
                      right ? 'text-right font-mono' : 'text-left'
                    } ${index === 0 ? 'font-medium' : ''}`}
                  >
                    {value === null || value === undefined
                      ? '—'
                      : column.format
                        ? column.format(value)
                        : String(value)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function alignOf(column: DataColumn, rows: DataRow[], index: number): 'left' | 'right' {
  if (column.align) return column.align;
  if (index === 0) return 'left';
  return rows.some((r) => typeof r[column.key] === 'number') ? 'right' : 'left';
}

/**
 * CSV lisible par un Excel réglé en français : point-virgule, virgule
 * décimale, BOM UTF-8 pour les accents.
 */
export function toCsv(columns: DataColumn[], rows: DataRow[]): string {
  const cell = (value: unknown) => {
    if (value === null || value === undefined) return '';
    const text = typeof value === 'number' ? String(value).replace('.', ',') : String(value);
    return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [
    columns.map((c) => cell(c.label)).join(';'),
    ...rows.map((row) => columns.map((c) => cell(row[c.key])).join(';')),
  ];
  return '\uFEFF' + lines.join('\n');
}

export function downloadCsv(filename: string, columns: DataColumn[], rows: DataRow[]): void {
  const blob = new Blob([toCsv(columns, rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
