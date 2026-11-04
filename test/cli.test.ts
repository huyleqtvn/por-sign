// The command line as a key holder runs it, in a child process: secrets from files, the answer piped in. With
// POR_SIGN naming a built por-sign, a release's por-sign.mjs or one of its programs, these tests run it in place of
// the sources (CONTRIBUTING.md › Releases).

import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { signedPath } from "../src/sign.ts";
import { ANVIL, DOMAIN, exportCsv, KEYSTORES, MNEMONIC, PASSWORD, tempFile } from "./support.ts";

const ROOT = join(import.meta.dirname, "..");
const BUILT = process.env.POR_SIGN && resolve(process.env.POR_SIGN);
const COMMAND = !BUILT
  ? [process.execPath, "--import", "tsx", join(ROOT, "src", "cli.ts")]
  : BUILT.endsWith(".mjs")
    ? [process.execPath, BUILT]
    : [BUILT];

function cli(args: string[], input = "") {
  const run = spawnSync(COMMAND[0]!, [...COMMAND.slice(1), ...args], {
    cwd: ROOT,
    input,
    encoding: "utf8",
  });
  return { code: run.status, out: run.stdout, err: run.stderr };
}

describe("the command line", () => {
  it("signs with a mnemonic file and a keystore folder, then verifies what it wrote", () => {
    const file = tempFile("acme-messages.csv", exportCsv([{ address: ANVIL[1] }, { address: ANVIL[3] }]));
    const mnemonic = tempFile("words.txt", `${MNEMONIC}\n`);
    const password = tempFile("password.txt", `${PASSWORD}\n`);
    const args = ["sign", file, "--domain", DOMAIN, "--mnemonic-file", mnemonic, "--keystore", KEYSTORES, "--password-file", password];

    const signed = cli(args, "y\n");
    expect(signed.err).toContain("Sign 2 messages? [y/N]");
    expect(signed.out).toContain("Signed 2 of 2 rows.");
    expect(signed.code).toBe(0);
    expect(signed.out + signed.err).not.toContain("junk");
    expect(signed.out + signed.err).not.toContain(PASSWORD);

    const checked = cli(["verify", signedPath(file), "--domain", DOMAIN]);
    expect(checked.out).toContain("2 rows: 2 valid, 0 failed.");
    expect(checked.code).toBe(0);
  });

  it("writes nothing unless the answer is yes", () => {
    const file = tempFile("m.csv", exportCsv([{ address: ANVIL[1] }]));
    const mnemonic = tempFile("words.txt", MNEMONIC);
    const run = cli(["sign", file, "--domain", DOMAIN, "--mnemonic-file", mnemonic], "\n");
    expect(run.code).toBe(1);
    expect(run.out).toContain("Nothing signed.");
    expect(readdirSync(dirname(file))).toEqual(["m.csv"]);
  });

  it("asks for a file when the mnemonic cannot be typed", () => {
    const file = tempFile("m.csv", exportCsv([{ address: ANVIL[1] }]));
    const run = cli(["sign", file, "--domain", DOMAIN, "--mnemonic"]);
    expect(run.code).toBe(2);
    expect(run.err).toContain("Not a terminal, so nothing can be typed: use --mnemonic-file.");
  });

  it.each([
    [["sign", "m.csv", "--mnemonic"], "--domain names the platform"],
    [["sign", "m.csv", "--domain", "https://por.example.com", "--mnemonic"], "--domain is a host"],
    [["sign", "m.csv", "--domain", DOMAIN], "Name the keys"],
    [["sign", "m.csv", "--domain", DOMAIN, "--keystore", KEYSTORES, "--paths", "m/0"], "--paths and --passphrase go with a mnemonic"],
    [["sign", "m.csv", "--domain", DOMAIN, "--mnemonic", "--paths", "44'/60'"], "is not a derivation path"],
    [["verify", "m.csv", "--mnemonic"], "verify needs no keys"],
    [["send", "m.csv"], 'Unknown command "send"'],
    [["sign", "m.csv", "--private-key", "0x1"], "Unknown option '--private-key'"],
  ])("refuses %j", (args, message) => {
    const run = cli(args);
    expect(run.err).toContain(message);
    expect(run.code).toBe(message.includes("derivation") ? 1 : 2);
  });

  it("keeps the input as it was", () => {
    const text = exportCsv([{ address: ANVIL[1] }]);
    const file = tempFile("m.csv", text);
    cli(["sign", file, "--domain", DOMAIN, "--mnemonic-file", tempFile("w.txt", MNEMONIC)], "y\n");
    expect(readFileSync(file, "utf8")).toBe(text);
  });
});
