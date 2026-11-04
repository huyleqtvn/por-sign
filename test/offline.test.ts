// The tool has no network code (CONTRIBUTING.md › Code): src/ imports only what this list allows, none of
// which opens a connection in the parts used. A new import must be added here, on purpose. The bundle a release ships,
// dist/por-sign.mjs, is checked too, as it holds the code of these packages: only the packages listed below, each
// with its license, and no network call.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "esbuild";
import { expect, it } from "vitest";
import { BUNDLE } from "../build.ts";

const ALLOWED = new Set([
  "node:crypto",
  "node:fs",
  "node:path",
  "node:readline",
  "node:util",
  "viem",
  "viem/accounts",
  "@scure/bip39",
  "@scure/bip39/wordlists/english",
  "../package.json",
]);

/** The packages in dist/por-sign.mjs: viem and @scure/bip39, and those they use in the parts por-sign uses. */
const BUNDLED = ["@noble/curves", "@noble/hashes", "@scure/base", "@scure/bip32", "@scure/bip39", "viem"];

const SRC = join(import.meta.dirname, "..", "src");

it("imports nothing that reaches the network", () => {
  const files = readdirSync(SRC, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".ts"));
  const imports = files.flatMap((f) =>
    [...readFileSync(join(SRC, f), "utf8").matchAll(/(?:from|import)\s*\(?\s*"([^"]+)"/g)].map((m) => m[1]!),
  );
  const outside = imports.filter((i) => !i.startsWith("./") && !(i.startsWith("../") && i.endsWith(".ts")) && !ALLOWED.has(i));
  expect(outside).toEqual([]);
  expect(files.some((f) => /\bfetch\(/.test(readFileSync(join(SRC, f), "utf8")))).toBe(false);
});

it("bundles only the packages listed, with their licenses, and no network call", async () => {
  const { metafile, outputFiles } = await build({ ...BUNDLE, write: false, metafile: true });
  const [output] = Object.values(metafile.outputs);
  // The files with code in the bundle, not those read and then shaken out, such as viem's WebSocket transport. A
  // file's package is the one under its last node_modules/.
  const packages = Object.entries(output!.inputs).flatMap(([path, { bytesInOutput }]) => {
    const found = bytesInOutput ? /.*node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(path) : null;
    return found ? [found[1]!] : [];
  });
  expect([...new Set(packages)].sort()).toEqual(BUNDLED);
  const external = output!.imports.map((i) => i.path);
  expect(external.filter((i) => !ALLOWED.has(i))).toEqual([]);
  const text = outputFiles[0]!.text;
  expect(text).not.toMatch(/\bfetch\(|WebSocket|XMLHttpRequest|EventSource/);
  // As build.ts puts them: from @noble's and @scure's own comments, and viem's and por-sign's at the end.
  const licenses = BUNDLED.map((p) => (p === "viem" ? "/*! viem\n" : `*! ${p.slice(1).replace("/", "-")} - MIT License`));
  for (const license of ["/*! por-sign\n", ...licenses]) expect(text).toContain(license);
});
