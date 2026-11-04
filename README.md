# por-sign

Signs the PoR Reports Platform's **Export messages** file on the key holder's own machine, offline, and writes it back with the `signature` column filled in, ready for **Import signatures**. One command signs every row whose key you give it.

- **Only the platform's message**, for the domain you name with `--domain`. Any other text is refused.
- **No network code.** It runs offline and never contacts the platform.
- **Your keys stay with you.** You type them at a hidden prompt, or por-sign reads them from a file. They are never taken as arguments, and never printed, saved or sent.

For now it signs EVM messages (EIP-191), with keys from a BIP-39 recovery phrase or keystore files.

> **Key holders:** follow the steps in your platform's docs, on *Sign with por-sign* (`https://<domain>/docs/key-holders/sign-with-por-sign`). Ask your Client Admin for the domain, and confirm it through a different channel from the one that brought the file.

## Contents

- [Quick start](#quick-start)
- [Install](#install)
  - [Check the download](#check-the-download)
  - [Run it](#run-it)
  - [With npm](#with-npm)
  - [Build from source](#build-from-source)
- [Sign](#sign)
- [Check before you send it](#check-before-you-send-it)
- [Keys and options](#keys-and-options)
- [What it refuses or skips](#what-it-refuses-or-skips)
- [Not supported](#not-supported)
- [Exit codes](#exit-codes)
- [Check a release against the source](#check-a-release-against-the-source)
- [License](#license)

## Quick start

```bash
por-sign sign messages.csv --domain por.example.com --mnemonic   # asks, then writes messages-signed.csv
por-sign verify messages-signed.csv --domain por.example.com     # checks the signatures
```

Then send `messages-signed.csv` to your Client Admin. `messages.csv` is the file from Export messages, and `por.example.com` stands for the domain your Client Admin confirmed. With keystore files, use `--keystore <folder>` instead of `--mnemonic`.

## Install

> Releases are not published yet. Until they are, [build it from source](#build-from-source).

Download a file from the [Releases page](https://github.com/huyleqtvn/por-sign/releases) on a connected machine. If you can, sign on an offline machine: check the file, then copy it and the CSV file across.

| File | For |
| --- | --- |
| `por-sign.mjs` | Any system with Node.js 22 or later: one file of JavaScript, which you can read |
| `por-sign-macos-arm64` | macOS, Apple silicon |
| `por-sign-macos-x64` | macOS, Intel |
| `por-sign-linux-x64` | Linux, x64 |
| `por-sign-linux-arm64` | Linux, ARM64 |
| `por-sign-windows-x64.exe` | Windows, x64 |

The programs need nothing else installed. They are `por-sign.mjs` compiled with Bun, which adds its own runtime, so they can't be read as text.

### Check the download

Compare the file's checksum with its line in `SHA256SUMS`, then verify its attestation with the [GitHub CLI](https://cli.github.com). Use your file's name in place of `por-sign.mjs`:

```bash
shasum -a 256 por-sign.mjs     # Linux: sha256sum · Windows: Get-FileHash, in capitals
gh attestation verify por-sign.mjs --repo huyleqtvn/por-sign
```

The attestation proves that this repository's release workflow built the file, and names the commit it built it from.

### Run it

With `por-sign.mjs`, type `node por-sign.mjs` where the examples say `por-sign`.

With a program, on macOS or Linux:

```bash
mv por-sign-macos-arm64 por-sign && chmod +x por-sign
xattr -d com.apple.quarantine por-sign   # macOS only, if a browser downloaded it
./por-sign --version
```

On Windows, in PowerShell:

```powershell
Rename-Item por-sign-windows-x64.exe por-sign.exe
Unblock-File por-sign.exe                # if a browser downloaded it
.\por-sign --version
```

`xattr` and `Unblock-File` lift the block that macOS and Windows put on a downloaded program from an unknown publisher. Run them only after the checks pass.

### With npm

```bash
npm install --global por-sign    # Node.js 22 or later
```

It installs the same `por-sign.mjs` and no other package. Its page on npmjs.com links it to the commit and the workflow that built it.

### Build from source

With git and Node.js 22, in a clone of this repository:

```bash
corepack enable                  # provides pnpm, at the version package.json names
pnpm install --frozen-lockfile
pnpm build                       # writes dist/por-sign.mjs
node dist/por-sign.mjs --version
```

Type `node dist/por-sign.mjs` where the examples say `por-sign`. On an offline machine, that one file is all por-sign needs, besides Node.js. To change the code, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Sign

```bash
# Keys from a recovery phrase, typed at a hidden prompt
por-sign sign messages.csv --domain por.example.com --mnemonic

# Keys from keystore files: Foundry's folder, geth's, or single files
por-sign sign messages.csv --domain por.example.com --keystore ~/.foundry/keystores
```

In PowerShell, the commands are the same, with Windows paths such as `$HOME\.foundry\keystores`.

**Type `--domain` yourself; never copy it from the file.** A forged file names a lookalike domain, such as `por-example.com`, and por-sign refuses every row whose message names a domain other than yours.

por-sign checks each row, shows what it will sign, and asks first:

```text
Domain        por.example.com
Organization  Acme Exchange
Project       01a1a084-d1e3-71a8-94a4-f71398b6649c
Rows          5: 4 to sign, 1 skipped
Accept until  Nov 10, 2026 · 08:27 UTC (the earliest)
Mnemonic: 4 of the file's addresses found in 199 paths derived.
Not to sign:
  Row 6  0x000000000000000000000000000000000000dEaD  No key found for this address
Sign 4 messages? [y/N] y
Signed 4 of 5 rows. Wrote messages-signed.csv.
Send it to your Client Admin, for Import signatures before Nov 10, 2026 · 08:27 UTC.
```

Check the domain, organization and project before you answer `y`. **Accept until** is the earliest deadline among the rows to sign, in UTC. The signed file goes next to the input, or to `--out`; por-sign never overwrites a file.

## Check before you send it

```bash
por-sign verify messages-signed.csv --domain por.example.com
```

```text
5 rows: 4 valid, 0 failed, 1 not signed.
```

It checks each signature against its row's address and message, as the platform will, with no key. Exit code 0 means every signature is valid. Your Client Admin can run it too.

## Keys and options

| Option | What it does |
| --- | --- |
| `--mnemonic` | Type the recovery phrase, on one line, at a hidden prompt |
| `--mnemonic-file <path>` | Read the recovery phrase from a file |
| `--passphrase` | Type the recovery phrase's BIP-39 passphrase at a hidden prompt |
| `--paths <pattern>` | The derivation paths to search, with ranges, such as `m/44'/60'/0'/0/{0..499}`; repeatable. Default: the first 100 of `m/44'/60'/0'/0/{i}` (MetaMask and most wallets) and of `m/44'/60'/{i}'/0/0` (Ledger Live) |
| `--keystore <path>` | A keystore file, or a folder of them, scrypt or PBKDF2; repeatable |
| `--password-file <path>` | Read the keystores' password from a file. Without it, por-sign asks once, and again for any file that password doesn't open |
| `--out <path>` | Where to write the signed file. Default: `<file>-signed.csv`, next to the input |

- Prefer the hidden prompt to a file: a recovery phrase or password saved in a file can survive in backups, or on the disk after you delete it. If you do use a file, delete it once you're done.
- Put a `--paths` pattern in double quotes, so the shell leaves its `'` and `{…}` alone: `--paths "m/44'/60'/0'/0/{0..499}"`.

## What it refuses or skips

**Refused**, because the row isn't what the platform exported. Ask your Client Admin to export the messages again:

- a message that isn't the platform's, word for word, or whose line breaks were changed, often by a spreadsheet;
- a message for another domain than `--domain`;
- a message naming another address or chain family than its row;
- an address that isn't an EVM address, or an `accept_until` that isn't a date.

**Skipped**, as there is nothing to sign now:

- a row already signed;
- a row past its `accept_until`: ask your Client Admin for a new export;
- a row whose key you didn't give: *No key found for this address*;
- a row whose `chain_family` isn't `evm`, as this version signs EVM messages only.

## Not supported

These pages are in the platform's docs, under *For key holders*.

- **Hardware wallets** (Ledger, Trezor): not yet. Never type a hardware wallet's recovery phrase into a computer. Sign each message on the device instead, as *Sign with your wallet* shows.
- **A plain private key:** make a keystore of it first, with `cast wallet import <name> --interactive`.
- **Custody and MPC platforms:** use their own message signing, as *Sign with your wallet* describes.
- **Safe and other contract wallets** are not in the file. They prove ownership with a designated transaction: see *Send a designated transaction*.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Done |
| `1` | Nothing signed, or a check failed |
| `2` | A mistake in the command |
| `130` | Interrupted |

## Check a release against the source

Build `por-sign.mjs` again from the release's tag. The same tag gives the same bytes on any system:

```bash
git clone https://github.com/huyleqtvn/por-sign.git && cd por-sign
git checkout v0.1.0              # the release's version
corepack enable
pnpm install --frozen-lockfile
pnpm build
shasum -a 256 dist/por-sign.mjs  # must match por-sign.mjs in SHA256SUMS
```

The programs are this file compiled with Bun, and the same release workflow attests them all. To read the file: each part starts with a comment naming the file it comes from, either por-sign's own (`// src/…`) or a package's (`// node_modules/…`).

## License

MIT, in [LICENSE](LICENSE). The code of viem, `@noble` and `@scure` that `por-sign.mjs` holds is under MIT too, and their licenses are at the end of the file.
