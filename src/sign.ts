// `por-sign sign` (README.md › Sign): checks every row of the Export messages file, finds the keys of the rows that
// pass, shows what it is about to sign and asks, then signs each message (EIP-191, as the platform checks it) and
// writes the file back with the signatures in. Each signature's signer is recovered and compared before it is written,
// so the file never carries one the platform would refuse as another key's. The input is never overwritten, nor an
// output file already there.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { isAddressEqual, recoverMessageAddress, type Address } from "viem";
import type { Keyring } from "./keys/keyring.ts";
import type { OwnershipMessage } from "./message.ts";
import type { Io } from "./prompt.ts";
import { distinct, fmtUtc, plural, rowLines, table, type RowNote } from "./report.ts";
import { checkRow, FileError, readMessagesFile, withSignatures, type MessageRow } from "./rows.ts";

export interface SignInput {
  file: string;
  out?: string;
  domain: string;
  now: Date;
  /** The keys of the addresses given, asked for only once some row is to sign. */
  keys: (wanted: Set<string>) => Promise<Keyring>;
}

/** Shown before asking; the rest are listed once signing is done. */
const LISTED_BEFORE = 10;

export function signedPath(file: string): string {
  const ext = extname(file);
  return join(dirname(file), `${basename(file, ext)}-signed${ext || ".csv"}`);
}

interface ToSign {
  row: MessageRow;
  message: OwnershipMessage;
}

export async function runSign(input: SignInput, io: Io): Promise<number> {
  const file = readMessagesFile(readFileSync(input.file, "utf8"));
  const out = input.out ?? signedPath(input.file);
  if (existsSync(out)) throw new FileError(`${out} already exists: move it, or name another file with --out.`);

  const ready: ToSign[] = [];
  const notSigned: (RowNote & { outcome: string })[] = [];
  for (const row of file.rows) {
    const check = checkRow(row, { domain: input.domain, now: input.now, signing: true });
    if (check.ok) ready.push({ row, message: check.message });
    else notSigned.push({ row: row.row, address: row.address, reason: check.reason, outcome: check.outcome });
  }

  const wanted = new Set(ready.map((r) => r.row.address.toLowerCase()));
  const keyring = wanted.size ? await input.keys(wanted) : { accounts: new Map(), notes: [] };
  const toSign = ready.filter((r) => keyring.accounts.has(r.row.address.toLowerCase()));
  for (const r of ready) {
    if (!keyring.accounts.has(r.row.address.toLowerCase())) {
      notSigned.push({ row: r.row.row, address: r.row.address, reason: "No key found for this address", outcome: "skipped" });
    }
  }
  notSigned.sort((a, b) => a.row - b.row);

  const refusedCount = notSigned.filter((n) => n.outcome === "refused").length;
  const counts = [
    `${toSign.length} to sign`,
    refusedCount && `${refusedCount} refused`,
    notSigned.length - refusedCount && `${notSigned.length - refusedCount} skipped`,
  ].filter(Boolean);
  const earliest = toSign.map((r) => r.row.acceptUntil).sort()[0];
  const pairs: [string, string][] = [["Domain", input.domain]];
  if (ready.length) {
    pairs.push(["Organization", distinct(ready.map((r) => r.message.organization))]);
    pairs.push(["Project", distinct(ready.map((r) => r.message.projectId))]);
  }
  pairs.push(["Rows", `${file.rows.length}: ${counts.join(", ")}`]);
  if (earliest) pairs.push(["Accept until", `${fmtUtc(earliest)} (the earliest)`]);
  io.print(table(pairs).join("\n"));
  for (const note of keyring.notes) io.print(note);
  if (notSigned.length) io.print(["Not to sign:", ...rowLines(notSigned, LISTED_BEFORE)].join("\n"));
  const listedBefore = notSigned.length;

  if (!toSign.length) {
    io.print("Nothing to sign.");
    return 1;
  }
  if (!(await io.confirm(`Sign ${plural(toSign.length, "message")}? [y/N] `))) {
    io.print("Nothing signed.");
    return 1;
  }

  const signatures = new Map<number, string>();
  for (const { row } of toSign) {
    const account = keyring.accounts.get(row.address.toLowerCase())!;
    const signature = await account.signMessage({ message: row.message });
    const signer = await recoverMessageAddress({ message: row.message, signature });
    if (!isAddressEqual(signer, row.address as Address)) {
      notSigned.push({ row: row.row, address: row.address, reason: "Its signature did not check out", outcome: "refused" });
      continue;
    }
    signatures.set(row.row, signature);
  }
  writeFileSync(out, withSignatures(file, signatures), { flag: "wx" });

  io.print(`Signed ${signatures.size} of ${plural(file.rows.length, "row")}. Wrote ${out}.`);
  // In full, unless the list before asking already showed every row.
  if (notSigned.length > LISTED_BEFORE || notSigned.length !== listedBefore) {
    io.print(["Not signed:", ...rowLines(notSigned.sort((a, b) => a.row - b.row))].join("\n"));
  }
  io.print(`Send it to your Client Admin, for Import signatures before ${fmtUtc(earliest!)}.`);
  return 0;
}
