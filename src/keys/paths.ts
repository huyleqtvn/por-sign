// The derivation paths a mnemonic is searched along (README.md › Keys and options): BIP-32 paths with
// ranges, such as m/44'/60'/0'/0/{0..99}. By default the first 100 addresses of the standard path, which MetaMask and
// most wallets use, and of Ledger Live's, which moves the account index instead.

export class PathError extends Error {}

export const DEFAULT_PATHS = ["m/44'/60'/0'/0/{0..99}", "m/44'/60'/{0..99}'/0/0"];

/** The most paths a search takes, so a mistyped range cannot run for hours. */
export const MAX_PATHS = 100_000;

const HARDENED = 2 ** 31;
const SEGMENT = /^(?:(\d+)|\{(\d+)\.\.(\d+)\})(['h])?$/;

/** Every path a pattern names, in order: m/44'/60'/0'/0/{0..2} is …/0/0, …/0/1, …/0/2. */
export function expandPath(pattern: string): string[] {
  const [root, ...segments] = pattern.trim().split("/");
  if (root !== "m" || !segments.length) throw new PathError(`"${pattern}" is not a derivation path: it starts with m/`);
  let paths = ["m"];
  for (const segment of segments) {
    const found = SEGMENT.exec(segment);
    if (!found) throw new PathError(`"${pattern}": "${segment}" is not an index, a hardened index or a range {a..b}`);
    const [, one, from, to, hardened] = found;
    const first = Number(one ?? from);
    const last = Number(one ?? to);
    if (last < first) throw new PathError(`"${pattern}": the range {${from}..${to}} runs backwards`);
    if (last >= HARDENED) throw new PathError(`"${pattern}": an index is below ${HARDENED}`);
    const count = last - first + 1;
    if (paths.length * count > MAX_PATHS) throw new PathError(`"${pattern}" names more than ${MAX_PATHS} paths`);
    const mark = hardened ? "'" : "";
    paths = paths.flatMap((p) => Array.from({ length: count }, (_, k) => `${p}/${first + k}${mark}`));
  }
  return paths;
}

export function expandPaths(patterns: string[]): string[] {
  const all = [...new Set(patterns.flatMap(expandPath))];
  if (all.length > MAX_PATHS) throw new PathError(`The paths name more than ${MAX_PATHS} addresses`);
  return all;
}
