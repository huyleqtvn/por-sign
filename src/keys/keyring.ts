// The keys of the addresses the file asks for, from every source given (README.md › Keys and options):
// the mnemonic first, then the keystores. The keystores' password is asked once, only if a keystore must be opened,
// and tried on each; a file it does not open asks for its own when the terminal can, and is skipped otherwise.

import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { basename } from "node:path";
import { decryptKeystore, KeystoreError, type Keystore } from "./keystore.ts";
import { mnemonicAccounts } from "./mnemonic.ts";

export interface KeySources {
  mnemonic?: { words: string; passphrase: string; paths: string[] };
  keystores: Keystore[];
  /** The keystores' password, asked when first needed. */
  password: () => Promise<string>;
  /** Asks the password of one file; null when it cannot ask. */
  passwordOf: (file: string) => Promise<string | null>;
}

export interface Keyring {
  /** By lower-case address. */
  accounts: Map<string, PrivateKeyAccount>;
  /** What each source found, for the summary. */
  notes: string[];
}

export async function findKeys(sources: KeySources, wanted: Set<string>): Promise<Keyring> {
  const accounts = new Map<string, PrivateKeyAccount>();
  const notes: string[] = [];
  if (sources.mnemonic) {
    const { words, passphrase, paths } = sources.mnemonic;
    const { found, derived } = mnemonicAccounts(words, passphrase, paths, wanted);
    for (const [address, account] of found) accounts.set(address, account);
    notes.push(`Mnemonic: ${found.size} of the file's addresses found in ${derived} paths derived.`);
  }

  let shared: string | undefined;
  const password = async () => (shared ??= await sources.password());
  const open = sources.keystores.filter((ks) => !ks.address || (wanted.has(ks.address) && !accounts.has(ks.address)));
  let opened = 0;
  for (const ks of open) {
    const name = basename(ks.file);
    try {
      let key = decryptKeystore(ks, await password());
      if (!key) {
        const own = await sources.passwordOf(name);
        key = own === null ? null : decryptKeystore(ks, own);
      }
      if (!key) {
        notes.push(`Keystore ${name}: wrong password, skipped.`);
        continue;
      }
      opened++;
      const account = privateKeyToAccount(key);
      const address = account.address.toLowerCase();
      if (wanted.has(address) && !accounts.has(address)) accounts.set(address, account);
    } catch (e) {
      if (!(e instanceof KeystoreError)) throw e;
      notes.push(`Keystore ${name}: ${e.message} Skipped.`);
    }
  }
  if (sources.keystores.length) {
    const unneeded = sources.keystores.length - open.length;
    notes.push(
      `Keystores: ${opened} opened of ${sources.keystores.length}` +
        (unneeded ? `; ${unneeded} not opened, as their addresses are not to sign.` : "."),
    );
  }
  return { accounts, notes };
}
