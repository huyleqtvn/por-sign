import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { findKeys } from "../src/keys/keyring.ts";
import { decryptKeystore, readKeystores } from "../src/keys/keystore.ts";
import { MnemonicError, mnemonicAccounts } from "../src/keys/mnemonic.ts";
import { DEFAULT_PATHS, expandPath, expandPaths, PathError } from "../src/keys/paths.ts";
import {
  ANVIL,
  KEYSTORES,
  LEDGER_LIVE_1,
  LEDGER_LIVE_7,
  MNEMONIC,
  PASSWORD,
  STANDARD_150,
  STRANGER,
  WITH_PASSPHRASE,
} from "./support.ts";

const want = (...addresses: string[]) => new Set(addresses.map((a) => a.toLowerCase()));

describe("derivation paths", () => {
  it("expands ranges, hardened ones too", () => {
    expect(expandPath("m/44'/60'/0'/0/{0..2}")).toEqual(["m/44'/60'/0'/0/0", "m/44'/60'/0'/0/1", "m/44'/60'/0'/0/2"]);
    expect(expandPath("m/44h/60h/{3..4}h/0/0")).toEqual(["m/44'/60'/3'/0/0", "m/44'/60'/4'/0/0"]);
    expect(expandPaths(DEFAULT_PATHS)).toHaveLength(199); // m/44'/60'/0'/0/0 is in both
  });

  it.each(["44'/60'/0'/0/0", "m/44'/x/0", "m/{5..1}", "m/{0..999999}/{0..999999}", "m/2147483648"])(
    "refuses %s",
    (pattern) => expect(() => expandPath(pattern)).toThrow(PathError),
  );
});

describe("a mnemonic", () => {
  it("finds addresses on the standard path and Ledger Live's, as cast derives them", () => {
    const { found } = mnemonicAccounts(MNEMONIC, "", expandPaths(DEFAULT_PATHS), want(ANVIL[2], LEDGER_LIVE_7));
    expect([...found.values()].map((a) => a.address).sort()).toEqual([ANVIL[2], LEDGER_LIVE_7].sort());
  });

  it("stops deriving once every address is found", () => {
    const { derived } = mnemonicAccounts(MNEMONIC, "", expandPaths(DEFAULT_PATHS), want(ANVIL[1]));
    expect(derived).toBe(2);
  });

  it("searches only the paths given, with the passphrase given", () => {
    const paths = expandPaths(["m/44'/60'/0'/0/{140..160}", "m/44'/60'/{1..1}'/0/0"]);
    const { found } = mnemonicAccounts(MNEMONIC, "", paths, want(STANDARD_150, LEDGER_LIVE_1, ANVIL[0]));
    expect(found.size).toBe(2);
    const withPassphrase = mnemonicAccounts(` ${MNEMONIC.toUpperCase()}\n`, "extra words", ["m/44'/60'/0'/0/0"], want(WITH_PASSPHRASE));
    expect(withPassphrase.found.size).toBe(1);
  });

  it("refuses a wrong mnemonic without repeating it", () => {
    const wrong = MNEMONIC.replace("junk", "test");
    expect(() => mnemonicAccounts(wrong, "", ["m/0"], want(ANVIL[0]))).toThrow(MnemonicError);
    expect(() => mnemonicAccounts(wrong, "", ["m/0"], want(ANVIL[0]))).not.toThrow(/test/);
  });
});

describe("keystores", () => {
  it("opens the files of cast and ethers, scrypt and PBKDF2, and ignores the folder's other files", () => {
    const { keystores, ignored } = readKeystores(KEYSTORES);
    expect(ignored).toEqual(["notes.txt"]);
    expect(keystores.map((k) => k.address)).toEqual([undefined, ANVIL[4].toLowerCase(), undefined]);
    const keys = keystores.map((k) => decryptKeystore(k, PASSWORD));
    expect(keys.every((k) => k?.startsWith("0x"))).toBe(true);
  });

  it("tells a wrong password", () => {
    const [ks] = readKeystores(join(KEYSTORES, "anvil-5-pbkdf2.json")).keystores;
    expect(decryptKeystore(ks!, "wrong")).toBeNull();
  });
});

describe("the keyring", () => {
  const { keystores } = readKeystores(KEYSTORES);

  it("asks the password once, only when a keystore is to open", async () => {
    const password = vi.fn(async () => PASSWORD);
    const ring = await findKeys(
      { mnemonic: { words: MNEMONIC, passphrase: "", paths: ["m/44'/60'/0'/0/0"] }, keystores, password, passwordOf: async () => null },
      want(ANVIL[0], ANVIL[3], ANVIL[5], STRANGER),
    );
    expect([...ring.accounts.keys()].sort()).toEqual([ANVIL[0], ANVIL[3], ANVIL[5]].map((a) => a.toLowerCase()).sort());
    expect(password).toHaveBeenCalledTimes(1);
    expect(ring.notes).toContain("Keystores: 2 opened of 3; 1 not opened, as their addresses are not to sign.");

    const named = readKeystores(join(KEYSTORES, "anvil-4-ethers.json")).keystores;
    const never = vi.fn(async () => PASSWORD);
    await findKeys({ keystores: named, password: never, passwordOf: async () => null }, want(ANVIL[0]));
    expect(never).not.toHaveBeenCalled();
  });

  it("asks a file's own password when the shared one fails, and skips it when that fails too", async () => {
    const passwordOf = vi.fn(async () => PASSWORD);
    const ring = await findKeys({ keystores, password: async () => "wrong", passwordOf }, want(ANVIL[3]));
    expect(ring.accounts.has(ANVIL[3].toLowerCase())).toBe(true);
    const none = await findKeys({ keystores, password: async () => "wrong", passwordOf: async () => null }, want(ANVIL[3]));
    expect(none.accounts.size).toBe(0);
    expect(none.notes).toContain("Keystore anvil-3: wrong password, skipped.");
  });
});
