export type CsvColumn<T> = { key: string; label: string; value: (row: T) => string | number | null | undefined };

export function exportCsv<T>(rows: T[], columns: CsvColumn<T>[], filename: string) {
  const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csv = `\uFEFF${columns.map((column) => escape(column.label)).join(',')}\n${rows.map((row) => columns.map((column) => escape(column.value(row))).join(',')).join('\n')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}

export function parseCsv(text: string) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return { headers: [], rows: [] as string[][] };
  const parseLine = (line: string) => {
    const cells: string[] = []; let current = ''; let quoted = false;
    for (let i = 0; i < line.length; i += 1) { const char = line[i]; if (char === '"') { if (quoted && line[i + 1] === '"') { current += '"'; i += 1; } else quoted = !quoted; } else if (char === ',' && !quoted) { cells.push(current.trim()); current = ''; } else current += char; }
    cells.push(current.trim()); return cells;
  };
  const headers = parseLine(lines[0]); return { headers, rows: lines.slice(1).map(parseLine) };
}
