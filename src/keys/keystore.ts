// Keystore files (Web3 Secret Storage, version 3), as Foundry (`cast wallet import`), geth and most wallets write
// them (README.md › Keys and options). Decrypted with Node's own crypto: scrypt or PBKDF2-SHA256, then
// AES-128-CTR, after the MAC (Keccak-256 of the key's second half and the ciphertext) shows the password is right.
// A file that names its address is opened only when the file being signed asks for that address, as scrypt is slow.

import { createDecipheriv, pbkdf2Sync, scryptSync, timingSafeEqual } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { keccak256, toHex, type Hex } from "viem";

export class KeystoreError extends Error {}

interface Crypto {
  cipher: string;
  cipherparams: { iv: string };
  ciphertext: string;
  kdf: string;
  kdfparams: Record<string, unknown>;
  mac: string;
}

export interface Keystore {
  file: string;
  /** Lower case with 0x, when the file names it. */
  address?: string;
  crypto: Crypto;
}

const strip = (hex: string) => hex.replace(/^0x/i, "");
const bytes = (hex: string) => Buffer.from(strip(hex), "hex");

function parse(file: string, text: string): Keystore | null {
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  // Some older files spell it Crypto.
  const crypto = (json.crypto ?? json.Crypto) as Crypto | undefined;
  if (json.version !== 3 || !crypto?.kdf) return null;
  const address = typeof json.address === "string" ? `0x${strip(json.address).toLowerCase()}` : undefined;
  return { file, address, crypto };
}

/** The keystores of a file or a folder; files there that are not keystores are listed as ignored. */
export function readKeystores(path: string): { keystores: Keystore[]; ignored: string[] } {
  const files = statSync(path).isDirectory()
    ? readdirSync(path)
        .filter((f) => !f.startsWith("."))
        .sort()
        .map((f) => join(path, f))
        .filter((f) => statSync(f).isFile())
    : [path];
  const keystores: Keystore[] = [];
  const ignored: string[] = [];
  for (const file of files) {
    const ks = parse(file, readFileSync(file, "utf8"));
    if (ks) keystores.push(ks);
    else ignored.push(basename(file));
  }
  if (!statSync(path).isDirectory() && !keystores.length) {
    throw new KeystoreError(`${path} is not a keystore file (version 3).`);
  }
  return { keystores, ignored };
}

function deriveKey({ kdf, kdfparams: p }: Crypto, password: string): Buffer {
  const salt = bytes(String(p.salt));
  const dklen = Number(p.dklen);
  if (kdf === "scrypt") {
    const N = Number(p.n);
    const r = Number(p.r);
    return scryptSync(password, salt, dklen, { N, r, p: Number(p.p), maxmem: 128 * N * r + 64 * 1024 * 1024 });
  }
  if (kdf === "pbkdf2") {
    if (p.prf !== "hmac-sha256") throw new KeystoreError(`PBKDF2 with ${String(p.prf)} is not supported.`);
    return pbkdf2Sync(password, salt, Number(p.c), dklen, "sha256");
  }
  throw new KeystoreError(`The key derivation ${kdf} is not supported.`);
}

/** The private key, or null when the password is wrong. */
export function decryptKeystore(ks: Keystore, password: string): Hex | null {
  const { crypto } = ks;
  if (crypto.cipher !== "aes-128-ctr") throw new KeystoreError(`The cipher ${crypto.cipher} is not supported.`);
  const key = deriveKey(crypto, password);
  const ciphertext = bytes(crypto.ciphertext);
  const mac = bytes(keccak256(Buffer.concat([key.subarray(16, 32), ciphertext])));
  const expected = bytes(crypto.mac);
  if (mac.length !== expected.length || !timingSafeEqual(mac, expected)) return null;
  const decipher = createDecipheriv("aes-128-ctr", key.subarray(0, 16), bytes(crypto.cipherparams.iv));
  return toHex(Buffer.concat([decipher.update(ciphertext), decipher.final()]));
}
