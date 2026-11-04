// Writes dist/por-sign.mjs, the file each release ships and the npm package holds (CONTRIBUTING.md › Releases):
// por-sign and the code of the packages it uses, in one file of JavaScript a key holder can read. The same commit
// builds to the same bytes on any system, so anyone can check a release against the source. test/offline.test.ts
// checks what the file holds.
//
// The file carries the license of each package in it, as MIT asks. esbuild keeps those that @noble's and @scure's
// files state in a comment; por-sign's and viem's, which no file states, are added at its end.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { build, type BuildOptions } from "esbuild";

const viem = dirname(createRequire(import.meta.url).resolve("viem/package.json"));
const licenses = [
  ["por-sign", join(import.meta.dirname, "LICENSE")],
  ["viem", join(viem, "LICENSE")],
].map(([name, file]) => `/*! ${name}\n\n${readFileSync(file!, "utf8").trim()}\n*/`);

export const BUNDLE = {
  absWorkingDir: import.meta.dirname,
  entryPoints: ["src/cli.ts"],
  outfile: "dist/por-sign.mjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  footer: { js: licenses.join("\n") },
} satisfies BuildOptions;

if (process.argv[1] === import.meta.filename) await build(BUNDLE);
