#!/usr/bin/env node
// The command line (README.md › Sign, › Check before you send it): `sign` and `verify`. Secrets never come as
// arguments, which the shell keeps in its history: they are typed at a hidden prompt or read from a file, and asked for
// only once the file has a row to sign (README.md › Keys and options). Exit codes (README.md › Exit codes): 0 done,
// 1 nothing done or a check failed, 2 a mistake in the command, 130 interrupted.

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import pkg from "../package.json" with { type: "json" };
import { CsvError } from "./csv.ts";
import { findKeys } from "./keys/keyring.ts";
import { KeystoreError, readKeystores, type Keystore } from "./keys/keystore.ts";
import { MnemonicError } from "./keys/mnemonic.ts";
import { DEFAULT_PATHS, expandPaths, PathError } from "./keys/paths.ts";
import { Interrupted, terminalIo, type Io } from "./prompt.ts";
import { plural } from "./report.ts";
import { FileError } from "./rows.ts";
import { runSign } from "./sign.ts";
import { runVerify } from "./verify.ts";

class UsageError extends Error {}

const USAGE = `por-sign ${pkg.version}: signs the PoR Reports Platform's Export messages file, offline.

Usage:
  por-sign sign <file> --domain <host> <keys>   sign every row whose key is given
  por-sign verify <file> [--domain <host>]     check the signatures of a signed file

Keys, one source or several:
  --mnemonic               type a BIP-39 mnemonic, on one line, at a hidden prompt
  --mnemonic-file <path>   read the mnemonic from a file
  --passphrase             the mnemonic has a BIP-39 passphrase: type it at a hidden prompt
  --paths <pattern>        derivation paths to search, with ranges; repeatable
                           (default: m/44'/60'/0'/0/{0..99} and m/44'/60'/{0..99}'/0/0)
  --keystore <path>        a keystore file, or a folder of them; repeatable
  --password-file <path>   read the keystores' password from a file

Options:
  --domain <host>          the platform's host the messages are for, such as por.example.com
  --out <path>             where to write the signed file (default: <file>-signed.csv)
  -h, --help               show this help
  --version                show the version`;

const OPTIONS = {
  domain: { type: "string" },
  mnemonic: { type: "boolean" },
  "mnemonic-file": { type: "string" },
  passphrase: { type: "boolean" },
  paths: { type: "string", multiple: true },
  keystore: { type: "string", multiple: true },
  "password-file": { type: "string" },
  out: { type: "string" },
  help: { type: "boolean", short: "h" },
  version: { type: "boolean" },
} as const;

type Values = ReturnType<typeof parseArgs<{ options: typeof OPTIONS; allowPositionals: true }>>["values"];

/** A secret file's text, without the line break an editor adds at its end. */
const readSecretFile = (path: string) => readFileSync(path, "utf8").replace(/\r?\n$/, "");

async function secret(io: Io, question: string, instead: string): Promise<string> {
  const value = await io.secret(question);
  if (value === null) throw new UsageError(`Not a terminal, so nothing can be typed: ${instead}.`);
  return value;
}

function checkDomain(domain: string | undefined): string | undefined {
  if (domain !== undefined && !/^[a-z0-9.-]+(:\d+)?$/i.test(domain)) {
    throw new UsageError(`--domain is a host, such as por.example.com, with no https:// nor path.`);
  }
  return domain;
}

async function sign(file: string, v: Values, io: Io): Promise<number> {
  const domain = checkDomain(v.domain);
  if (!domain) throw new UsageError("--domain names the platform the messages are for, such as por.example.com.");
  if (v.mnemonic && v["mnemonic-file"]) throw new UsageError("Give the mnemonic once: --mnemonic or --mnemonic-file.");
  const hasMnemonic = v.mnemonic || v["mnemonic-file"] !== undefined;
  if (!hasMnemonic && !v.keystore?.length) {
    throw new UsageError("Name the keys: --mnemonic, --mnemonic-file or --keystore.");
  }
  if (!hasMnemonic && (v.paths || v.passphrase)) {
    throw new UsageError("--paths and --passphrase go with a mnemonic: add --mnemonic or --mnemonic-file.");
  }
  const paths = hasMnemonic ? expandPaths(v.paths ?? DEFAULT_PATHS) : [];
  const keystores: Keystore[] = [];
  for (const path of v.keystore ?? []) {
    const { keystores: found, ignored } = readKeystores(path);
    keystores.push(...found);
    if (ignored.length) io.print(`${path}: ${plural(ignored.length, "file")} ignored, not a keystore.`);
  }

  const passwordFile = v["password-file"];
  return runSign(
    {
      file,
      out: v.out,
      domain,
      now: new Date(),
      keys: async (wanted) => {
        const words = !hasMnemonic
          ? undefined
          : v["mnemonic-file"] !== undefined
            ? readSecretFile(v["mnemonic-file"])
            : await secret(io, "Mnemonic (not shown): ", "use --mnemonic-file");
        const passphrase = v.passphrase
          ? await secret(io, "BIP-39 passphrase (not shown): ", "run por-sign in a terminal to type it")
          : "";
        return findKeys(
          {
            mnemonic: words === undefined ? undefined : { words, passphrase, paths },
            keystores,
            password: async () =>
              passwordFile
                ? readSecretFile(passwordFile)
                : secret(io, "Keystore password (not shown): ", "use --password-file"),
            passwordOf: async (name) => (passwordFile ? null : io.secret(`Password of ${name} (not shown): `)),
          },
          wanted,
        );
      },
    },
    io,
  );
}

async function main(argv: string[], io: Io): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true });
  } catch (e) {
    throw new UsageError((e as Error).message);
  }
  const { values: v, positionals } = parsed;
  if (v.version || v.help || !positionals.length) {
    io.print(v.version ? pkg.version : USAGE);
    return v.version || v.help ? 0 : 2;
  }
  const [command, file, ...extra] = positionals;
  if (!file || extra.length) throw new UsageError(`${command} takes one file: the CSV from Export messages.`);
  if (command === "sign") return sign(file, v, io);
  if (command === "verify") {
    const keyOptions = ["mnemonic", "mnemonic-file", "passphrase", "paths", "keystore", "password-file", "out"] as const;
    const given = keyOptions.filter((k) => v[k] !== undefined);
    if (given.length) throw new UsageError(`verify needs no keys: drop --${given.join(", --")}.`);
    return runVerify({ file, domain: checkDomain(v.domain) }, io);
  }
  throw new UsageError(`Unknown command "${command}": sign or verify.`);
}

const KNOWN = [UsageError, FileError, CsvError, PathError, MnemonicError, KeystoreError];

async function run(): Promise<void> {
  const io = terminalIo();
  try {
    process.exitCode = await main(process.argv.slice(2), io);
  } catch (e) {
    if (e instanceof Interrupted) process.exitCode = 130;
    else if (KNOWN.some((k) => e instanceof k)) {
      process.stderr.write(`${(e as Error).message}\n`);
      if (e instanceof UsageError) process.stderr.write("Run por-sign --help for the options.\n");
      process.exitCode = e instanceof UsageError ? 2 : 1;
    } else if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      process.stderr.write(`No such file: ${(e as NodeJS.ErrnoException).path}\n`);
      process.exitCode = 1;
    } else throw e;
  } finally {
    io.close();
  }
}

await run();
