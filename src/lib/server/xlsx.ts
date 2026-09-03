import 'server-only';

/**
 * ATLAS — génération des classeurs Excel.
 *
 * L'export n'est pas un livrable de fin de partie : c'est le **format natif de
 * sortie** du jeu (doc 00 §9). Les étudiants construisent leurs matrices BCG,
 * PESTEL, Porter et VRIO sur tableur, hors de l'application — Atlas vend la
 * donnée, l'intelligence reste au groupe.
 *
 * D'où deux règles de mise en forme :
 *   • les nombres sortent en NOMBRES, jamais en texte préformaté : une colonne
 *     qu'on ne peut pas sommer ou trier ne sert à rien dans un tableur ;
 *   • le format d'affichage marocain (« 1 234 567 DH ») est porté par le
 *     `numFmt` de la cellule, pas par sa valeur.
 */

import ExcelJS from 'exceljs';

const MAD_FORMAT = '# ##0 "DH"';
const PCT_FORMAT = '0.0 %';
const SCORE_FORMAT = '0.0';

export interface SheetColumn {
  header: string;
  key: string;
  width?: number;
  format?: 'mad' | 'pct' | 'score' | 'text';
}

export interface SheetSpec {
  name: string;
  /** Lignes de contexte au-dessus du tableau : titre, palier, avertissements. */
  preamble?: string[];
  columns: SheetColumn[];
  rows: Record<string, string | number | null>[];
}

export async function buildWorkbook(
  title: string,
  sheets: SheetSpec[],
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Atlas';
  workbook.title = title;
  workbook.created = new Date();

  for (const spec of sheets) {
    // Excel refuse les noms d'onglet de plus de 31 caractères et certains
    // signes de ponctuation : on assainit plutôt que de laisser échouer l'export.
    const sheet = workbook.addWorksheet(spec.name.replace(/[\\/*?:[\]]/g, '-').slice(0, 31));

    let cursor = 1;
    for (const line of spec.preamble ?? []) {
      const cell = sheet.getCell(cursor, 1);
      cell.value = line;
      cell.font = { italic: cursor > 1, bold: cursor === 1, size: cursor === 1 ? 13 : 10 };
      cursor += 1;
    }
    if (spec.preamble?.length) cursor += 1;

    const headerRow = sheet.getRow(cursor);
    spec.columns.forEach((col, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = col.header;
      cell.font = { bold: true };
      cell.border = { bottom: { style: 'thin' } };
      sheet.getColumn(i + 1).width = col.width ?? Math.max(col.header.length + 4, 14);
    });
    headerRow.commit();
    cursor += 1;

    for (const row of spec.rows) {
      const excelRow = sheet.getRow(cursor);
      spec.columns.forEach((col, i) => {
        const cell = excelRow.getCell(i + 1);
        const value = row[col.key];
        cell.value = value ?? null;

        if (typeof value === 'number') {
          if (col.format === 'mad') cell.numFmt = MAD_FORMAT;
          else if (col.format === 'pct') cell.numFmt = PCT_FORMAT;
          else if (col.format === 'score') cell.numFmt = SCORE_FORMAT;
        }
      });
      excelRow.commit();
      cursor += 1;
    }

    // Filtres sur l'en-tête : les étudiants trient et croisent eux-mêmes.
    if (spec.rows.length > 0) {
      const headerIndex = (spec.preamble?.length ?? 0) + (spec.preamble?.length ? 1 : 0) + 1;
      sheet.autoFilter = {
        from: { row: headerIndex, column: 1 },
        to: { row: headerIndex + spec.rows.length, column: spec.columns.length },
      };
      sheet.views = [{ state: 'frozen', ySplit: headerIndex }];
    }
  }

  // ExcelJS rend son propre type de tampon, compatible ArrayBuffer :
  // c'est exactement ce qu'attend `Response`, sans copie intermédiaire.
  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}

/** Nom de fichier sûr : sans accents ni espaces, horodaté. */
export function safeFileName(...parts: (string | number)[]): string {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '');
  return (
    parts
      .map((p) =>
        String(p)
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-zA-Z0-9]+/g, '_')
          .replace(/^_|_$/g, ''),
      )
      .filter(Boolean)
      .join('_') + `_${stamp}.xlsx`
  );
}
