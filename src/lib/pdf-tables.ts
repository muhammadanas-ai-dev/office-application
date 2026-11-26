// PDF table extraction — pure helpers (F23).
//
// Detect tables in a PDF's text layer and turn them into
// rows of cells. The detector works on the positioned text
// runs the Day 9 extractor reads (`listPdfTextRuns`):
//
//   1. Runs are grouped into lines by their baseline.
//   2. The x-starts of runs on multi-run lines are clustered
//      into column starts; a column needs support from at
//      least two lines.
//   3. A table is a run of at least two consecutive lines
//      whose every run maps onto the shared columns and
//      which use at least two of them.
//
// This is a text-alignment heuristic, the honest kind: it
// finds tables whose cells are drawn as aligned text (the
// common case for generated reports and statements). It
// cannot see ruled lines, merged cells, or tables drawn as
// images — the UI says so. Nothing here touches the
// filesystem or a network.
import type { PdfTextRun } from "@/lib/pdf-content";

/** How far a run's x may drift from a column start (points)
 *  and still belong to that column. */
const COLUMN_TOLERANCE_PT = 6;

export interface DetectedTable {
  /** 1-based page number. */
  page: number;
  /** Rows of cells; every row has the same length. */
  rows: string[][];
}

interface Line {
  y: number;
  runs: PdfTextRun[];
}

/** Group one page's runs into lines, top to bottom (the
 *  running-average baseline from the Day 21 extractor, so a
 *  line whose runs drift slightly stays one line). */
function groupLines(runs: PdfTextRun[]): Line[] {
  const sorted = [...runs]
    .filter((r) => r.text && r.text.trim() !== "")
    .sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Line[] = [];
  for (const run of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(run.y - last.y) <= run.fontSize / 2) {
      last.runs.push(run);
      last.y =
        (last.y * (last.runs.length - 1) + run.y) / last.runs.length;
    } else {
      lines.push({ y: run.y, runs: [run] });
    }
  }
  for (const line of lines) line.runs.sort((a, b) => a.x - b.x);
  return lines;
}

/** Cluster x positions into column starts. */
function clusterColumns(xs: number[]): number[] {
  const sorted = [...xs].sort((a, b) => a - b);
  const columns: number[] = [];
  for (const x of sorted) {
    if (
      columns.length === 0 ||
      x - columns[columns.length - 1] > COLUMN_TOLERANCE_PT
    ) {
      columns.push(x);
    }
  }
  return columns;
}

/** The column index a run maps to, or -1 when it maps to
 *  none of the given columns. */
function columnOf(x: number, columns: number[]): number {
  let best = -1;
  let bestDistance = Infinity;
  for (let i = 0; i < columns.length; i++) {
    const distance = Math.abs(x - columns[i]);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return bestDistance <= COLUMN_TOLERANCE_PT ? best : -1;
}

/**
 * Detect the tables on one page. `page` is the 1-based page
 * number stamped onto the results.
 */
export function detectTablesInRuns(
  runs: PdfTextRun[],
  page: number
): DetectedTable[] {
  const lines = groupLines(runs);
  const multiLines = lines.filter((l) => l.runs.length >= 2);
  if (multiLines.length < 2) return [];

  // Column candidates from every multi-run line; a column
  // needs support from at least two lines.
  const candidates = clusterColumns(
    multiLines.flatMap((l) => l.runs.map((r) => r.x))
  );
  const support = candidates.map(
    (c) =>
      multiLines.filter((l) => l.runs.some((r) => columnOf(r.x, [c]) === 0))
        .length
  );
  const columns = candidates.filter((_, i) => support[i] >= 2);
  if (columns.length < 2) return [];

  // A line fits the table when every run maps to a column
  // and the line uses at least two distinct columns.
  const fits = lines.map((line) => {
    if (line.runs.length < 2) return false;
    const used = new Set<number>();
    for (const run of line.runs) {
      const col = columnOf(run.x, columns);
      if (col === -1) return false;
      used.add(col);
    }
    return used.size >= 2;
  });

  const tables: DetectedTable[] = [];
  let start = -1;
  const flush = (endExclusive: number) => {
    if (start >= 0 && endExclusive - start >= 2) {
      const rows: string[][] = [];
      for (let i = start; i < endExclusive; i++) {
        const cells = new Array<string>(columns.length).fill("");
        for (const run of lines[i].runs) {
          const col = columnOf(run.x, columns);
          if (col >= 0) {
            cells[col] = cells[col]
              ? `${cells[col]} ${run.text.trim()}`
              : run.text.trim();
          }
        }
        rows.push(cells);
      }
      // Drop trailing columns that are empty in every row.
      let width = columns.length;
      while (
        width > 2 &&
        rows.every((r) => (r[width - 1] ?? "") === "")
      ) {
        width--;
      }
      tables.push({ page, rows: rows.map((r) => r.slice(0, width)) });
    }
    start = -1;
  };
  for (let i = 0; i < lines.length; i++) {
    if (fits[i]) {
      if (start === -1) start = i;
    } else {
      flush(i);
    }
  }
  flush(lines.length);
  return tables;
}

/** One table as CSV text (RFC 4180 escaping, CRLF rows). */
export function tableToCsv(table: DetectedTable): string {
  const escape = (cell: string) =>
    /[",\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
  return table.rows.map((row) => row.map(escape).join(",")).join("\r\n") + "\r\n";
}

/** The file name for one table inside the ZIP. */
export function getTableFileName(index: number, page: number): string {
  return `table-${index + 1}-page-${page}.csv`;
}

/** The ZIP file name for a document's extracted tables. */
export function getTablesFileName(title: string): string {
  const base = title.replace(/\.[^.]+$/, "").trim() || "document";
  return `${base}-tables.zip`;
}
