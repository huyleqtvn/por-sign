# por-sign

For key holders: signs the PoR Reports Platform's **Export messages** file on your own machine, offline. It writes the file back with the `signature` column filled in, ready for your Client Admin to upload with **Import signatures**. One command signs every row whose key you give it, instead of one message at a time.

- It signs only the platform's ownership message, for the platform you name with `--domain`. It refuses any other text.
- It has no network code: it runs on an offline machine and never contacts the platform.
- Your keys stay on your machine. You type your recovery phrase or password at a hidden prompt, or por-sign reads it from a file. It never takes them as command-line arguments, and never prints, saves or sends them.

For now it signs EVM messages (EIP-191), with keys from a BIP-39 recovery phrase (mnemonic) or keystore files.

**The steps are in the platform's docs**, on the page *Sign with por-sign*, at `https://<domain>/docs/key-holders/sign-with-por-sign`: where the file comes from, what to check before you sign, and how to send the file back. Ask your Client Admin for the platform's domain, and confirm it through a different channel from the one that brought the file. This page is the reference for the tool itself. Its examples use `por.example.com` for the domain, and `messages.csv` for the file, named `<project ID>-messages-<YYYY-MM-DD>.csv`.

## Install

Releases are not published yet. Until they are, [build it from source](#build-from-source).

Sign on a machine that is offline, if you can: download and check por-sign on a connected machine, then copy it and the file across.

### Download a release

Each release on the [Releases page](../../releases) has por-sign in two forms, and a `SHA256SUMS` file with the checksum of each file:

- **`por-sign.mjs`**, for any system with Node.js 22 or later: one file of JavaScript, holding por-sign's code and that of the packages it uses. You can read it, and anyone can [build it again from the source](#check-it-against-the-source) to the same bytes.
- **A program for each system**, which needs nothing else installed: the same file, compiled with Bun, which adds its own runtime. It can't be read as text, so its checksum and attestation are what check it.

| System | Program |
| --- | --- |
| macOS, Apple silicon | `por-sign-macos-arm64` |
| macOS, Intel | `por-sign-macos-x64` |
| Linux, x64 | `por-sign-linux-x64` |
| Linux, ARM64 | `por-sign-linux-arm64` |
| Windows, x64 | `por-sign-windows-x64.exe` |

Check the file before you run it:

```bash
shasum -a 256 por-sign.mjs     # must match its line in SHA256SUMS
gh attestation verify por-sign.mjs --repo huyleqtvn/por-sign
```

The attestation proves that this repository's release workflow built the file, and names the commit it built it from, so nobody swapped in another file. On Windows, `Get-FileHash por-sign.mjs` in PowerShell prints the checksum.

With `por-sign.mjs`, type `node por-sign.mjs` wherever the examples below say `por-sign`.

With a program, name it `por-sign` and make it runnable:

```bash
mv por-sign-macos-arm64 por-sign
chmod +x por-sign
xattr -d com.apple.quarantine por-sign   # macOS, if a browser downloaded it
```

macOS won't open a program downloaded with a browser unless Apple has checked it. The `xattr` command removes that block, so run it only after the checks above pass.

The examples below run it as `por-sign`. Either move it to a folder on your `PATH`, or run it from its own folder as `./por-sign`.

### Check it against the source

To check that `por-sign.mjs` holds the release's source code and nothing else, build it again from the release's tag, with Node.js 22 and git:

```bash
git clone https://github.com/huyleqtvn/por-sign.git
cd por-sign
git checkout v0.1.0              # the release's version
corepack enable                  # provides pnpm, at the version package.json names
pnpm install --frozen-lockfile
pnpm build
shasum -a 256 dist/por-sign.mjs  # must match por-sign.mjs in SHA256SUMS
```

The same tag builds to the same bytes on any system. To read the file: each part starts with a comment naming the file it comes from, either por-sign's own, such as `// src/message.ts`, or one of viem and `@scure/bip39` and the `@noble` and `@scure` packages they use, under `// node_modules/`.

### With npm

With Node.js 22 or later:

```bash
npm install --global por-sign
```

The package holds the same `por-sign.mjs`, and no other package is installed with it. Its page on npmjs.com links it to the commit and the workflow that built it.

### Build from source

With Node.js 22, clone this repository, then in its folder:

```bash
corepack enable                  # provides pnpm, at the version package.json names
pnpm install --frozen-lockfile
pnpm build
alias por-sign="node $PWD/dist/por-sign.mjs"
```

The alias lasts until you close the terminal. On Windows, type `node dist\por-sign.mjs` wherever the examples say `por-sign`. To sign on an offline machine, copy `dist/por-sign.mjs` across: with Node.js, it is all por-sign needs. To change the code, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Sign

```bash
# Keys from a recovery phrase, typed at a hidden prompt
por-sign sign messages.csv --domain por.example.com --mnemonic

# Keys from keystore files: Foundry's folder, geth's, or single files
por-sign sign messages.csv --domain por.example.com --keystore ~/.foundry/keystores
```

`--domain` is the domain your Client Admin confirmed. Type it yourself; don't copy it from the file. A forged file names a lookalike domain, such as `por-example.com`, and this check is what catches it: every row whose message names another domain is refused.

por-sign checks each row, shows what it will sign, and asks before signing anything:

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

Check the domain, organization and project before you answer `y`. **Accept until** is the earliest deadline among the rows to sign, in UTC.

It writes `messages-signed.csv` next to the input, or to the path `--out` names. It never overwrites the input, nor a signed file already there.

## Check before you send it

```bash
por-sign verify messages-signed.csv --domain por.example.com
```

```text
5 rows: 4 valid, 0 failed, 1 not signed.
```

It checks each signature against its row's address and message, as the platform will, with no key. Exit code 0 means every signature is valid. Your Client Admin can run it too, before Import signatures.

## Keys and options

| Option | What it does |
| --- | --- |
| `--mnemonic` | Type the recovery phrase, on one line, at a hidden prompt |
| `--mnemonic-file <path>` | Read the recovery phrase from a file |
| `--passphrase` | The recovery phrase has a BIP-39 passphrase: type it at a hidden prompt |
| `--paths <pattern>` | The derivation paths to search, with ranges, such as `m/44'/60'/0'/0/{0..499}`; repeatable. By default, the first 100 addresses of the standard path `m/44'/60'/0'/0/{i}`, which MetaMask and most wallets use, and of Ledger Live's `m/44'/60'/{i}'/0/0` |
| `--keystore <path>` | A keystore file, or a folder of them; repeatable. Scrypt and PBKDF2 files are both read |
| `--password-file <path>` | Read the keystores' password from a file. Without it, por-sign asks for the password once, and asks again for any file that password doesn't open |
| `--out <path>` | Where to write the signed file. By default, `<file>-signed.csv` next to the input |

Prefer the hidden prompt to `--mnemonic-file` and `--password-file`: a recovery phrase or password saved in a file can survive in backups, or on the disk after you delete the file. If you do use a file, delete it once you're done.

Put a `--paths` pattern in double quotes, so the shell leaves its `'` and `{…}` alone:

```bash
por-sign sign messages.csv --domain por.example.com --mnemonic --paths "m/44'/60'/0'/0/{0..499}"
```

On Windows, the commands are the same in PowerShell, with Windows paths such as `$HOME\.foundry\keystores`.

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

- **Hardware wallets** (Ledger, Trezor): por-sign can't sign with one yet. Never type a hardware wallet's recovery phrase into a computer: that removes the protection the device gives you. Sign each message on the device instead, as the platform's *Sign with your wallet* shows, at `https://<domain>/docs/key-holders/sign-with-your-wallet`.
- **A plain private key:** make a keystore of it first, with `cast wallet import <name> --interactive`.
- **Custody and MPC platforms** sign with their own message signing, as *Sign with your wallet* describes. **Safe and other contract wallets** are not in the file: they prove ownership with a designated transaction, as the platform's *Send a designated transaction* describes, at `https://<domain>/docs/key-holders/send-designated-transaction`.

## Exit codes

`0` done; `1` nothing signed, or a check failed; `2` a mistake in the command; `130` interrupted.

## License

MIT, in [LICENSE](LICENSE). `por-sign.mjs` and the programs also hold the code of viem, `@noble` and `@scure`, all under MIT; their licenses are at the end of `por-sign.mjs`.
