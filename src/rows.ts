// The Export messages file (the platform's client docs › Sign many wallets): its columns, its rows, and the checks each
// row passes before it is signed or its signature checked (README.md › What it refuses or skips). A row that fails is
// refused when the file itself is wrong, such as an edited message, and skipped when it is fine but not to sign now,
// such as one already signed. The file is written back with only the signature column changed, so Import signatures
// reads it as the file it exported.

import { isAddress, isAddressEqual } from "viem";
import { parseCsv, toCsv } from "./csv.ts";
import { checkMessage, type OwnershipMessage } from "./message.ts";

export const COLUMNS = ["address", "chain_family", "message", "accept_until", "signature"] as const;
type Column = (typeof COLUMNS)[number];

/** The chain family this release signs, as the column and the message name it. A row of another family is skipped. */
const EVM = { column: "evm", label: "EVM" };

export class FileError extends Error {}

export interface MessageRow {
  /** Its row in a spreadsheet, the header being row 1, as Import signatures numbers it. */
  row: number;
  address: string;
  chainFamily: string;
  message: string;
  acceptUntil: string;
  signature: string;
}

export interface MessagesFile {
  header: string[];
  records: string[][];
  rows: MessageRow[];
  column: Record<Column, number>;
}

export function readMessagesFile(text: string): MessagesFile {
  const [header, ...records] = parseCsv(text);
  if (!header) throw new FileError("The file is empty.");
  const names = header.map((h) => h.trim());
  const missing = COLUMNS.filter((c) => !names.includes(c));
  if (missing.length) {
    throw new FileError(`The file lacks the columns ${missing.join(", ")}: use the file from Export messages.`);
  }
  const column = Object.fromEntries(COLUMNS.map((c) => [c, names.indexOf(c)])) as Record<Column, number>;
  const rows = records.map((r, i) => ({
    row: i + 2,
    address: (r[column.address] ?? "").trim(),
    chainFamily: (r[column.chain_family] ?? "").trim(),
    message: r[column.message] ?? "",
    acceptUntil: (r[column.accept_until] ?? "").trim(),
    signature: (r[column.signature] ?? "").trim(),
  }));
  return { header, records, rows, column };
}

/** The file again, with the signatures given by row number in its signature column. */
export function withSignatures(file: MessagesFile, signatures: Map<number, string>): string {
  const records = file.records.map((r, i) => {
    const signature = signatures.get(i + 2);
    if (signature === undefined) return r;
    const out = [...r];
    while (out.length <= file.column.signature) out.push("");
    out[file.column.signature] = signature;
    return out;
  });
  return toCsv([file.header, ...records]);
}

export type RowCheck =
  | { ok: true; message: OwnershipMessage }
  | { ok: false; outcome: "refused" | "skipped"; reason: string };

const refused = (reason: string): RowCheck => ({ ok: false, outcome: "refused", reason });
const skipped = (reason: string): RowCheck => ({ ok: false, outcome: "skipped", reason });

/**
 * Whether a row's message is the platform's, for the domain given, about the row's own address and family. For
 * signing, `now` also skips a row past its window and one already signed.
 */
export function checkRow(row: MessageRow, opts: { domain?: string; now?: Date; signing: boolean }): RowCheck {
  if (row.chainFamily.toLowerCase() !== EVM.column) return skipped("Not an EVM row: this release signs EVM messages only");
  const checked = checkMessage(row.message);
  if (!checked.ok) return refused(checked.reason);
  const m = checked.message;
  if (opts.domain && m.domain.toLowerCase() !== opts.domain.toLowerCase()) {
    return refused(`The message is for ${m.domain}, not ${opts.domain}`);
  }
  if (m.chainFamily !== EVM.label) return refused(`The message is for ${m.chainFamily}, the row for ${EVM.label}`);
  if (!isAddress(row.address, { strict: false })) return refused("Not an EVM address");
  if (!isAddress(m.address, { strict: false }) || !isAddressEqual(m.address, row.address)) {
    return refused(`The message names another address, ${m.address}`);
  }
  if (!opts.signing) return { ok: true, message: m };
  const until = new Date(row.acceptUntil);
  if (!row.acceptUntil || Number.isNaN(until.getTime())) return refused("accept_until is not a date");
  if (row.signature) return skipped("Already signed");
  if (opts.now && until <= opts.now) return skipped(`Past its accept_until, ${row.acceptUntil}`);
  return { ok: true, message: m };
}
