# Standards

How por-sign applies each standard it relies on, and where it stops. The [README](../README.md) says what to run; this page is for those who check what happens underneath.

| Group | Standard | What por-sign uses it for |
| --- | --- | --- |
| [Signing](#signing) | [EIP-191](https://eips.ethereum.org/EIPS/eip-191) | Signing the message, and checking a signature |
| | [EIP-55](https://eips.ethereum.org/EIPS/eip-55) | Addresses, in either case |
| [Keys](#keys) | [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) | Recovery phrases |
| | [BIP-32](https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki), [BIP-44](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki), [SLIP-44](https://github.com/satoshilabs/slips/blob/master/slip-0044.md) | Derivation paths |
| | [Web3 Secret Storage](https://ethereum.org/en/developers/docs/data-structures-and-encoding/web3-secret-storage/), version 3, with [scrypt](https://www.rfc-editor.org/rfc/rfc7914) or [PBKDF2](https://www.rfc-editor.org/rfc/rfc8018) | Keystore files and their passwords |
| [The file](#the-file) | [RFC 4180](https://www.rfc-editor.org/rfc/rfc4180) | The CSV file |

## Signing

### EIP-191: the message and its signature

- **The hash:** por-sign signs each message as an EIP-191 personal message (version `0x45`, the one `personal_sign` uses). That is the Keccak-256 hash of `"\x19Ethereum Signed Message:\n"`, then the message's length **in bytes** (not characters), then the message.
- **The signature:** 65 bytes, `r ‖ s ‖ v`, written as `0x` followed by 130 hexadecimal characters. por-sign writes `v` as 27 or 28 (`1b` or `1c`).
- **The check:** before it writes a signature, por-sign recovers its signer and compares it with the row's address. `verify` does the same for every signed row, as the platform does.
- **The text it signs:** only the platform's ownership message. Its fields recall [EIP-4361](https://eips.ethereum.org/EIPS/eip-4361) (Sign-In with Ethereum): Nonce, Issued At, Expiration Time. It is not a Sign-In with Ethereum message, though: it is the platform's own text, which por-sign checks line by line. Only the values may differ.
- **Not made:** typed data ([EIP-712](https://eips.ethereum.org/EIPS/eip-712)), signatures of a raw hash (`eth_sign`), and contract wallets' signatures ([EIP-1271](https://eips.ethereum.org/EIPS/eip-1271)). The platform refuses all three. A contract wallet proves ownership with a designated transaction instead.
- **Library:** viem's `signMessage` and `recoverMessageAddress`, on secp256k1 from `@noble/curves`.

### EIP-55: addresses

An EVM address is the last 20 bytes of the Keccak-256 hash of a secp256k1 public key. EIP-55 writes it in mixed case, as a checksum. por-sign compares addresses whatever their case, so it accepts an address with or without that checksum.

## Keys

### BIP-39: recovery phrases

- **The phrase:** 12, 15, 18, 21 or 24 words from BIP-39's **English** word list; other lists are not read. Its last bits are a checksum. If a word, the word order or the checksum is wrong, por-sign refuses the phrase, without saying which word.
- **Normalizing:** before use, the words are normalized (Unicode NFKD, lower case, one space between words), so spacing and case don't matter.
- **The seed:** PBKDF2-HMAC-SHA512 of the phrase, with the salt `"mnemonic"` followed by the passphrase, 2,048 iterations, 64 bytes.
- **The passphrase:** BIP-39's optional passphrase changes every address. A wrong passphrase gives other valid addresses, not an error, so the rows then show *No key found for this address*.
- **Library:** `@scure/bip39`.

### BIP-32, BIP-44 and SLIP-44: derivation paths

- **The tree:** BIP-32 derives a tree of keys from the seed, and a path picks one of them, such as `m/44'/60'/0'/0/5`. `'` marks a hardened index, and `h` is read the same.
- **The layout:** BIP-44 lays a path out as `m / 44' / coin' / account' / change / index`. SLIP-44 gives Ether coin type 60.
- **Which index moves:** wallets differ. MetaMask and most others move the last one: `m/44'/60'/0'/0/{i}`. Ledger Live moves the account: `m/44'/60'/{i}'/0/0`.
- **The default search:** the first 100 paths of each. That makes 199 paths, as the two share `m/44'/60'/0'/0/0`. The search stops as soon as the address of every row to sign is found.
- **Ranges:** the `{a..b}` notation of `--paths` is por-sign's own, not a standard. A search takes at most 100,000 paths.
- **Library:** viem's `HDKey`, from `@scure/bip32`.

### Web3 Secret Storage, version 3: keystore files

- **The file:** a JSON file holding one private key, encrypted with a key derived from a password. Only version 3 is read, with its `crypto` field, or `Crypto` in older files. The `address` field is optional: when present, por-sign opens the file only if a row to sign has that address.
- **Key derivation:**
  - [scrypt](https://www.rfc-editor.org/rfc/rfc7914), with the file's `n`, `r`, `p` and salt;
  - or [PBKDF2](https://www.rfc-editor.org/rfc/rfc8018) with HMAC-SHA256, with its `c` and salt.

  Any other function is refused.
- **The password check:** the MAC is the Keccak-256 hash of bytes 16 to 31 of the derived key, followed by the ciphertext. por-sign compares it in constant time before decrypting. If it differs, the password is wrong.
- **Decryption:** AES-128-CTR, with the first 16 bytes of the derived key and the file's IV. Any other cipher is refused.
- **Library:** Node's own `crypto` (`scryptSync`, `pbkdf2Sync`, `createDecipheriv`), and viem's Keccak-256.

## The file

### RFC 4180: the CSV file

- **Reading:** a field in double quotes may hold commas, line breaks, and quotes written twice. Records end with LF or CRLF. A byte-order mark at the start, as Excel writes, is dropped.
- **Line breaks in a message:** a quoted message is kept byte for byte. If it holds a CR, a spreadsheet saved the file again, and the row is refused.
- **Columns:** found by their header: `address`, `chain_family`, `message`, `accept_until` and `signature`. Other columns are kept as they are.
- **Writing:** with the same quoting rules, LF between records. Only the `signature` column changes.
- **Times:** in UTC, as ISO 8601. The message's Issued At and Expiration Time are written as `YYYY-MM-DDTHH:MM:SS.sssZ`.
