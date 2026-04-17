/**
 * Client-side CSV export. Escapes cells per RFC 4180 (quotes, commas,
 * newlines) and triggers a browser download.
 */

function escapeCell(v) {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(rows, columns) {
  const header = columns.map((c) => escapeCell(c.label ?? c.key)).join(',');
  const body = rows
    .map((r) => columns.map((c) => escapeCell(c.get ? c.get(r) : r[c.key])).join(','))
    .join('\n');
  return header + '\n' + body + '\n';
}

export function downloadCsv(filename, rows, columns) {
  const csv = toCsv(rows, columns);
  // UTF-8 BOM so Excel opens non-ASCII characters correctly.
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
