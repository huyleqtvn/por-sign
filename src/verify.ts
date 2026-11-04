// `por-sign verify` (README.md › Check before you send it): checks each signature of a signed file against its row's
// address and message, with no key and no network, as the platform will (EIP-191, a 65-byte signature: a contract
// wallet's is not accepted, the platform's client docs › Sign with your wallet). So a bad row is found before Import
// signatures.

import { readFileSync } from "node:fs";
import { isAddressEqual, recoverMessageAddress, type Hex } from "viem";
import type { Io } from "./prompt.ts";
import { plural, rowLines, type RowNote } from "./report.ts";
import { checkRow, readMessagesFile } from "./rows.ts";

export interface VerifyInput {
  file: string;
  /** When given, each message must be for it. */
  domain?: string;
}

const EVM_SIGNATURE = /^0x[0-9a-fA-F]{130}$/;

export async function runVerify(input: VerifyInput, io: Io): Promise<number> {
  const file = readMessagesFile(readFileSync(input.file, "utf8"));
  let valid = 0;
  let unsigned = 0;
  const failed: RowNote[] = [];
  for (const row of file.rows) {
    if (!row.signature) {
      unsigned++;
      continue;
    }
    const fail = (reason: string) => failed.push({ row: row.row, address: row.address, reason });
    const check = checkRow(row, { domain: input.domain, signing: false });
    if (!check.ok) {
      fail(check.reason);
      continue;
    }
    if (!EVM_SIGNATURE.test(row.signature)) {
      fail("Not an EVM signature: 0x followed by 130 hexadecimal characters");
      continue;
    }
    let signer: string;
    try {
      signer = await recoverMessageAddress({ message: row.message, signature: row.signature as Hex });
    } catch {
      fail("Not a valid signature");
      continue;
    }
    if (isAddressEqual(signer as Hex, row.address as Hex)) valid++;
    else fail(`Signed by another address, ${signer}`);
  }

  const parts = [`${valid} valid`, `${failed.length} failed`, unsigned && `${unsigned} not signed`].filter(Boolean);
  io.print(`${plural(file.rows.length, "row")}: ${parts.join(", ")}.`);
  if (failed.length) io.print(["Failed:", ...rowLines(failed)].join("\n"));
  if (!valid && !failed.length) io.print("No signature to check.");
  return valid && !failed.length ? 0 : 1;
}
