// Keys from a BIP-39 mnemonic (README.md › Keys and options): the seed is worked out once, then each
// path's key derived from it, until every address the file asks for is found. The mnemonic is never printed, nor
// any part of it, even in an error.

import { mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { toHex } from "viem";
import { HDKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";

export class MnemonicError extends Error {}

/** As typed or saved: any spacing and case, one line or several. */
export function normalizeMnemonic(text: string): string {
  return text.normalize("NFKD").trim().toLowerCase().split(/\s+/).join(" ");
}

export interface Derived {
  /** By lower-case address, the accounts found among those wanted. */
  found: Map<string, PrivateKeyAccount>;
  /** How many paths were derived before every address was found, or all of them. */
  derived: number;
}

export function mnemonicAccounts(
  mnemonic: string,
  passphrase: string,
  paths: string[],
  wanted: Set<string>,
): Derived {
  const words = normalizeMnemonic(mnemonic);
  if (!validateMnemonic(words, wordlist)) {
    throw new MnemonicError("This is not a valid BIP-39 mnemonic in English: check its words and their order.");
  }
  const root = HDKey.fromMasterSeed(mnemonicToSeedSync(words, passphrase));
  const found = new Map<string, PrivateKeyAccount>();
  let derived = 0;
  for (const path of paths) {
    if (found.size === wanted.size) break;
    const key = root.derive(path).privateKey;
    derived++;
    if (!key) continue;
    const account = privateKeyToAccount(toHex(key));
    const address = account.address.toLowerCase();
    if (wanted.has(address)) found.set(address, account);
  }
  return { found, derived };
}
