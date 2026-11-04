import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { recoverMessageAddress, type Hex } from "viem";
import { parseCsv } from "../src/csv.ts";
import { findKeys } from "../src/keys/keyring.ts";
import { readKeystores } from "../src/keys/keystore.ts";
import { expandPath } from "../src/keys/paths.ts";
import { FileError } from "../src/rows.ts";
import { runSign, signedPath, type SignInput } from "../src/sign.ts";
import { runVerify } from "../src/verify.ts";
import { ANVIL, DOMAIN, exportCsv, KEYSTORES, MNEMONIC, NOW, ownershipMessage, PASSWORD, STRANGER, tempFile, testIo } from "./support.ts";

const keys: SignInput["keys"] = (wanted) =>
  findKeys(
    {
      mnemonic: { words: MNEMONIC, passphrase: "", paths: expandPath("m/44'/60'/0'/0/{0..9}") },
      keystores: readKeystores(KEYSTORES).keystores,
      password: async () => PASSWORD,
      passwordOf: async () => null,
    },
    wanted,
  );

/** Every case a file can hold: rows to sign from each key source, and each reason a row is not signed. */
const mixed = () =>
  exportCsv([
    { address: ANVIL[0] },
    { address: ANVIL[1] },
    { address: ANVIL[3] },
    { address: ANVIL[5] },
    { address: STRANGER },
    { address: ANVIL[2], message: ownershipMessage({ address: ANVIL[2] }).replace("any transaction", "every transaction") },
    { address: ANVIL[2], message: ownershipMessage({ address: ANVIL[2], domain: "evil.example" }) },
    { address: ANVIL[2], signature: "0x1234" },
    { address: ANVIL[2], acceptUntil: "2026-11-01T00:00:00.000Z" },
    { address: "not-evm", family: "other" },
  ]);

describe("sign", () => {
  it("signs the rows it has keys for, and changes nothing else", async () => {
    const text = mixed();
    const file = tempFile("acme-messages.csv", text);
    const io = testIo();
    expect(await runSign({ file, domain: DOMAIN, now: NOW, keys }, io)).toBe(0);

    expect(readFileSync(file, "utf8")).toBe(text);
    const before = parseCsv(text);
    const after = parseCsv(readFileSync(signedPath(file), "utf8"));
    expect(after.map((r) => r.slice(0, 4))).toEqual(before.map((r) => r.slice(0, 4)));
    const signed = after.slice(1).map((r) => r[4]);
    expect(signed.slice(0, 4).every((s) => /^0x[0-9a-f]{130}$/.test(s!))).toBe(true);
    expect(signed.slice(4)).toEqual(before.slice(5).map((r) => r[4]));
    for (const r of after.slice(1, 5)) {
      expect(await recoverMessageAddress({ message: r[2]!, signature: r[4] as Hex })).toBe(r[0]);
    }

    const out = io.printed.join("\n");
    expect(out).toContain("Organization  Acme Exchange, Inc.");
    expect(out).toContain("Rows          10: 4 to sign, 2 refused, 4 skipped");
    expect(out).toContain("Accept until  Nov 10, 2026 · 09:00 UTC (the earliest)");
    expect(out).toContain(`Row 6  ${STRANGER}  No key found for this address`);
    expect(out).toContain("Row 7  0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC  Not the platform's message: line 6 differs");
    expect(out).toContain("Signed 4 of 10 rows.");
    expect(io.asked).toEqual(["Sign 4 messages? [y/N] "]);
  });

  it("signs nothing when the answer is no", async () => {
    const file = tempFile("m.csv", exportCsv([{ address: ANVIL[0] }]));
    const io = testIo({ confirm: false });
    expect(await runSign({ file, domain: DOMAIN, now: NOW, keys }, io)).toBe(1);
    expect(existsSync(signedPath(file))).toBe(false);
    expect(io.printed).toContain("Nothing signed.");
  });

  it("asks for no key when no row is to sign", async () => {
    const file = tempFile("m.csv", exportCsv([{ address: ANVIL[0], message: ownershipMessage({ address: ANVIL[0], domain: "evil.example" }) }]));
    const never = vi.fn(keys);
    const io = testIo();
    expect(await runSign({ file, domain: DOMAIN, now: NOW, keys: never }, io)).toBe(1);
    expect(never).not.toHaveBeenCalled();
    expect(io.asked).toEqual([]);
  });

  it("never overwrites a signed file already there", async () => {
    const file = tempFile("m.csv", exportCsv([{ address: ANVIL[0] }]));
    await runSign({ file, domain: DOMAIN, now: NOW, keys }, testIo());
    await expect(runSign({ file, domain: DOMAIN, now: NOW, keys }, testIo())).rejects.toThrow(FileError);
  });
});

describe("verify", () => {
  async function signedFile() {
    const file = tempFile("m.csv", exportCsv([{ address: ANVIL[0] }, { address: ANVIL[1] }, { address: STRANGER }]));
    await runSign({ file, domain: DOMAIN, now: NOW, keys }, testIo());
    return { file: signedPath(file), rows: parseCsv(readFileSync(signedPath(file), "utf8")) };
  }

  it("passes a file por-sign signed", async () => {
    const { file } = await signedFile();
    const io = testIo();
    expect(await runVerify({ file, domain: DOMAIN }, io)).toBe(0);
    expect(io.printed[0]).toBe("3 rows: 2 valid, 0 failed, 1 not signed.");
  });

  it("names each row that fails, and why", async () => {
    const { rows } = await signedFile();
    const [, a, b] = rows;
    const swapped = exportCsv([
      { address: a![0]!, signature: b![4]! },
      { address: b![0]!, signature: "0x1234" },
      { address: a![0]!, signature: a![4]!, message: ownershipMessage({ address: a![0]!, nonce: "f".repeat(32) }) },
    ]);
    const io = testIo();
    expect(await runVerify({ file: tempFile("x.csv", swapped) }, io)).toBe(1);
    const out = io.printed.join("\n");
    expect(out).toContain(`Row 2  ${ANVIL[0]}  Signed by another address, `);
    expect(out).toContain("Row 3  0x70997970C51812dc3A010C7d01b50e0d17dc79C8  Not an EVM signature");
    expect(out).toMatch(/Row 4 {2}0xf39F\S+ {2}Signed by another address/);
  });

  it("fails a file with no signature", async () => {
    const io = testIo();
    expect(await runVerify({ file: tempFile("m.csv", exportCsv([{ address: ANVIL[0] }])) }, io)).toBe(1);
    expect(io.printed).toContain("No signature to check.");
  });
});
