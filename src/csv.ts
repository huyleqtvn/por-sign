// CSV as the platform's Export messages writes it: a field is quoted when it holds a quote, a comma or a line break, a
// quote doubled inside; records are joined by "\n". The parser keeps a quoted field byte for byte, line breaks
// included, so a message comes back exactly as exported and its check (message.ts) sees any "\r" a spreadsheet added.
// A byte-order mark, which Excel writes, is dropped.

export class CsvError extends Error {}

/** The file's records, each a list of fields; a blank line holds none. */
export function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const endField = () => {
    record.push(field);
    field = "";
  };
  const endRecord = () => {
    endField();
    // A blank line between records (or at the end) holds no record.
    if (record.length > 1 || record[0] !== "") records.push(record);
    record = [];
  };
  while (i < text.length) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i += 2;
        continue;
      }
      if (c === '"') quoted = false;
      else field += c;
      i++;
      continue;
    }
    if (c === '"' && field === "") quoted = true;
    else if (c === ",") endField();
    else if (c === "\n") endRecord();
    else if (c === "\r" && text[i + 1] === "\n") {
      endRecord();
      i++;
    } else field += c;
    i++;
  }
  if (quoted) throw new CsvError("The file ends inside a quoted field: it is cut short or not a CSV file.");
  if (field !== "" || record.length) endRecord();
  return records;
}

const quote = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function toCsv(records: string[][]): string {
  return records.map((r) => r.map(quote).join(",")).join("\n");
}
