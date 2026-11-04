// What the tests share: the well-known test mnemonic and its addresses (Anvil's accounts, and others from `cast wallet
// address`), the platform's message, written out here apart from src/message.ts so that a change to either shows, the
// file Export messages writes, and an Io that answers in place of a person.

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toCsv } from "../src/csv.ts";
import type { Io } from "../src/prompt.ts";

export const MNEMONIC = "test test test test test test test test test test test junk";
export const PASSWORD = "por-sign-test";
export const KEYSTORES = join(import.meta.dirname, "fixtures", "keystores");

/** m/44'/60'/0'/0/i of the test mnemonic: Anvil's first accounts. */
export const ANVIL = [
  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  // The keystores: anvil-3 (cast, scrypt), anvil-4-ethers.json (ethers, scrypt, names its address),
  // anvil-5-pbkdf2.json (PBKDF2, opened by ethers to check it).
  "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
  "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
  "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
] as const;

/** From `cast wallet address --mnemonic … --mnemonic-derivation-path`. */
export const LEDGER_LIVE_1 = "0x8C8d35429F74ec245F8Ef2f4Fd1e551cFF97d650"; // m/44'/60'/1'/0/0
export const LEDGER_LIVE_7 = "0xAF4311d557fBC876059e39306ec1f3343753df29"; // m/44'/60'/7'/0/0
export const STANDARD_150 = "0x280b23F871E8679970CeC204Bc67d19840CEfeD0"; // m/44'/60'/0'/0/150
export const WITH_PASSPHRASE = "0x32de12bBA8e7d0a22A7e14E0D45AFd28B7F63599"; // m/44'/60'/0'/0/0, "extra words"

/** An address no test key holds. */
export const STRANGER = "0x000000000000000000000000000000000000dEaD";

export const DOMAIN = "por.example.com";

export interface MessageInput {
  domain?: string;
  address: string;
  organization?: string;
  projectId?: string;
  nonce?: string;
}

export function ownershipMessage(m: MessageInput): string {
  return [
    `${m.domain ?? DOMAIN} wants you to sign this message to prove ownership of:`,
    m.address,
    "",
    "I confirm that I control this address for the Proof of Reserves",
    `engagement of ${m.organization ?? "Acme Exchange, Inc."}. This signature does not authorize`,
    "any transaction or transfer of funds.",
    "",
    `Project: ${m.projectId ?? "0199f1c2-7a4b-7c3d-9e8f-123456789abc"}`,
    "Chain family: EVM",
    `Nonce: ${m.nonce ?? "0123456789abcdef0123456789abcdef"}`,
    `Issued At: 2026-11-03T09:00:00.000Z`,
    `Expiration Time: 2027-02-01T09:00:00.000Z`,
  ].join("\n");
}

export const NOW = new Date("2026-11-04T00:00:00.000Z");
export const ACCEPT_UNTIL = "2026-11-10T09:00:00.000Z";

export interface ExportRow {
  address: string;
  /** The chain_family column: evm unless given. */
  family?: string;
  message?: string;
  acceptUntil?: string;
  signature?: string;
}

/** The file Export messages downloads. */
export function exportCsv(rows: ExportRow[]): string {
  return toCsv([
    ["address", "chain_family", "message", "accept_until", "signature"],
    ...rows.map((r) => [
      r.address,
      r.family ?? "evm",
      r.message ?? ownershipMessage({ address: r.address }),
      r.acceptUntil ?? ACCEPT_UNTIL,
      r.signature ?? "",
    ]),
  ]);
}

export function tempFile(name: string, text: string): string {
  const path = join(mkdtempSync(join(tmpdir(), "por-sign-")), name);
  writeFileSync(path, text);
  return path;
}

export interface TestIo extends Io {
  printed: string[];
  asked: string[];
}

/** Answers yes or no, and the secrets given in turn; null once they run out, as a pipe would. */
export function testIo(answer: { confirm?: boolean; secrets?: string[] } = {}): TestIo {
  const secrets = [...(answer.secrets ?? [])];
  const io: TestIo = {
    printed: [],
    asked: [],
    print: (text) => void io.printed.push(text),
    confirm: async (q) => (io.asked.push(q), answer.confirm ?? true),
    secret: async (q) => (io.asked.push(q), secrets.shift() ?? null),
    close: () => {},
  };
  return io;
}
