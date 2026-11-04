// The platform's ownership message (the platform's client docs › What you're asked to sign), checked line by line
// before anything is signed: only the values in it are free, so a file that was edited cannot get the key holder to
// sign other text (README.md › What it refuses or skips). When the platform changes its message, this release refuses
// the new one, which fails safe; a new release follows the platform's.

export interface OwnershipMessage {
  domain: string;
  address: string;
  organization: string;
  projectId: string;
  /** As the message names it, such as EVM. */
  chainFamily: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
}

export type MessageCheck = { ok: true; message: OwnershipMessage } | { ok: false; reason: string };

const ISO = String.raw`\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z`;

/** Each line of the message, as a pattern; a group is a value the platform fills in. */
const LINES: RegExp[] = [
  /^(\S+) wants you to sign this message to prove ownership of:$/,
  /^(\S+)$/,
  /^$/,
  /^I confirm that I control this address for the Proof of Reserves$/,
  /^engagement of (.+)\. This signature does not authorize$/,
  /^any transaction or transfer of funds\.$/,
  /^$/,
  /^Project: (\S+)$/,
  /^Chain family: (\S+)$/,
  /^Nonce: ([0-9a-f]{32})$/,
  new RegExp(`^Issued At: (${ISO})$`),
  new RegExp(`^Expiration Time: (${ISO})$`),
];

export const CHANGED_LINE_BREAKS = "The file was changed, perhaps by a spreadsheet: export it again";

export function checkMessage(text: string): MessageCheck {
  if (text.includes("\r")) return { ok: false, reason: CHANGED_LINE_BREAKS };
  const lines = text.split("\n");
  if (lines.length !== LINES.length) {
    return { ok: false, reason: `Not the platform's message: ${lines.length} lines where it has ${LINES.length}` };
  }
  const values: string[] = [];
  for (const [i, pattern] of LINES.entries()) {
    const found = pattern.exec(lines[i]!);
    if (!found) return { ok: false, reason: `Not the platform's message: line ${i + 1} differs` };
    values.push(...found.slice(1));
  }
  const [domain, address, organization, projectId, chainFamily, nonce, issuedAt, expiresAt] = values as [
    string, string, string, string, string, string, string, string,
  ];
  return { ok: true, message: { domain, address, organization, projectId, chainFamily, nonce, issuedAt, expiresAt } };
}
