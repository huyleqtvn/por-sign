// What the commands print: times as the platform shows them, in UTC, and the rows not signed or not valid, each with
// its row number and why, the way Import signatures lists them.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Nov 10, 2026 · 09:00 UTC". */
export function fmtUtc(iso: string): string {
  const at = new Date(iso);
  const hh = String(at.getUTCHours()).padStart(2, "0");
  const mm = String(at.getUTCMinutes()).padStart(2, "0");
  return `${MONTHS[at.getUTCMonth()]} ${at.getUTCDate()}, ${at.getUTCFullYear()} · ${hh}:${mm} UTC`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export interface RowNote {
  row: number;
  address: string;
  reason: string;
}

/** One line per row, the first `limit` of them, then how many more. */
export function rowLines(notes: RowNote[], limit = Infinity): string[] {
  const lines = notes.slice(0, limit).map((n) => `  Row ${n.row}  ${n.address || "(no address)"}  ${n.reason}`);
  if (notes.length > limit) lines.push(`  … and ${notes.length - limit} more`);
  return lines;
}

/** Label and value lines, the values lined up. */
export function table(pairs: [string, string][]): string[] {
  const width = Math.max(...pairs.map(([k]) => k.length));
  return pairs.map(([k, v]) => `${k.padEnd(width)}  ${v}`);
}

export const distinct = (values: string[]) => [...new Set(values)].join(", ");
