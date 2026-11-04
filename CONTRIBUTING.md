# Contributing

`por-sign` is the command-line tool key holders run to sign the PoR Reports Platform's Export messages file offline. What it does, for the key holders who run it, is in [README.md](README.md). The platform's client docs, at `/docs` on its domain, walk key holders through it (*Sign with por-sign*), and describe the message it signs (*What you're asked to sign*) and the file it reads (*Sign many wallets*).

## Commands

```bash
pnpm dev sign <file> …   # run from the sources (tsx)
pnpm build               # tsc checks types; build.ts bundles dist/por-sign.mjs
pnpm lint
pnpm test                # vitest; test/cli.test.ts runs the command line in a child process
POR_SIGN=dist/por-sign.mjs pnpm test test/cli.test.ts   # the same, on the bundle or a program
```

A task is done when `pnpm build`, `pnpm lint` and `pnpm test` pass.

## Code

- TypeScript ESM on Node 22. Imports name the `.ts` file, relatively.
- A `.ts` file has at most 300 lines (ESLint `max-lines`). Split a longer one by what it does.
- Each file in `src/` starts with a comment saying what it is for and why it works that way, citing README.md or this file by section, or the platform's client docs by page. Never the platform's source code or internal docs: this repository is public.
- **No network code.** `test/offline.test.ts` lists every import `src/` may use, and every package the bundle may hold; a new one is added there on purpose, and never one that opens a connection.
- **Secrets** (mnemonic, passphrase, password) are never arguments, never printed, never written, and never in an error message.
- **The message check** (`src/message.ts`) follows the platform's message line for line, as does `test/support.ts`. When the platform changes its message, change both and release.
- Test keys are the public test mnemonic and the keystores in `test/fixtures/keystores/` (password `por-sign-test`), written by `cast` and ethers. Never a real key.

## Dependencies

Key holders run por-sign on the machine that holds their keys, so the worst risk is a hijacked release of a package it uses. `pnpm-workspace.yaml` enforces these rules:

- **Few:** at run time, only viem and `@scure/bip39`, which the build bundles into `dist/por-sign.mjs` with the `@noble` and `@scure` packages they use, so a key holder can review what they run. The bundle carries each one's license (`build.ts`). A new runtime dependency is a design change: open an issue first. Add a dev dependency only when the existing tools can't do the job.
- **Exact versions** in `package.json`, with no `^` or `~` (`savePrefix: ''`). A version changes only through a commit.
- **Mature versions:** published at least 7 days ago (`minimumReleaseAge`). For a fix that can't wait, add the exact version to `minimumReleaseAgeExclude` with a comment saying why. Remove the entry once that version is 7 days old.
- **No trust downgrade** (`trustPolicy: no-downgrade`): the install fails on a version published with less evidence of its origin than an earlier one had, such as no provenance after versions with it. Before adding a version to `trustPolicyExclude`, check who published it, then add the exact version and the reason.
- **Registry only** (`blockExoticSubdeps`): no git, tarball or URL dependencies, direct or transitive.
- **No install scripts** (`strictDepBuilds`): a package with one is listed in `allowBuilds` as `false`.
- **The lockfile is reviewed like code.** CI and releases install with `pnpm install --frozen-lockfile`. If pnpm rejects the committed lockfile, someone installed without these rules: check what changed before rebuilding it.
- **Updates** are deliberate, never `pnpm update` across the board. Change one package per commit, or one set that moves together, such as eslint with `@eslint/js`. Read its changelog. For a runtime dependency, also read the code diff (`npm diff --diff=viem@2.57.7 --diff=viem@<new>`). viem is updated in step with the platform, which checks the signatures por-sign makes.
- **Before a release**, `pnpm audit --prod` finds nothing. The release workflow checks it too.

## Releases

A key holder runs a release on the machine that holds their keys, so anyone must be able to check it against the source ([README.md › Install](README.md#install)). Each release has:

- **`por-sign.mjs`**, the bundle `pnpm build` writes. The same commit builds to the same bytes on any system. The lockfile fixes every package, `packageManager` fixes pnpm (the bundle names files by pnpm's folders), and `.gitattributes` keeps line endings LF on Windows. Keep the build free of anything that depends on the machine, the folder or the time.
- **A program for each system**: the bundle, compiled with Bun at the version `release.yml` names.
- **`SHA256SUMS`**, and a build attestation for each file.
- **The npm package**: the same bundle, with no dependencies, published with provenance.

`.github/workflows/release.yml` makes them all from a version tag. On each system, it builds the bundle again, which must give the same bytes, and runs `test/cli.test.ts` on the bundle and the program.

To release:

1. Change `version` in package.json, in a commit of its own.
2. Tag that commit, signed, and push the tag: `git tag -s v0.1.0 -m v0.1.0`, then `git push origin v0.1.0`.
3. Approve the `release` environment's deployment, once the programs are built and tested.

Set up once, before the first release:

- **On GitHub:** the repository public, as key holders read its source and the build attestations need it on GitHub's Free, Pro and Team plans; a ruleset that protects `v*` tags; immutable releases, so a version's files never change once published; and the `release` environment, with a required reviewer.
- **On npmjs.com:** trusted publishing for `por-sign`, naming this repository, `release.yml` and the `release` environment, so no npm token is stored.

The workflows pin each action to a commit, and Bun to a version. Change them as you would a package (§ Dependencies): one per commit, after reading what changed.
