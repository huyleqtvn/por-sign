import { describe, expect, it } from "vitest";
import { CsvError, parseCsv, toCsv } from "../src/csv.ts";
import { CHANGED_LINE_BREAKS, checkMessage } from "../src/message.ts";
import { checkRow, FileError, readMessagesFile, withSignatures } from "../src/rows.ts";
import { ACCEPT_UNTIL, ANVIL, DOMAIN, exportCsv, NOW, ownershipMessage } from "./support.ts";

describe("CSV", () => {
  it("reads back what it writes: quotes, commas and line breaks", () => {
    const records = [
      ["a", "b,c", 'say "hi"'],
      ["line\nbreak", "", "x"],
    ];
    expect(parseCsv(toCsv(records))).toEqual(records);
  });

  it("drops a byte-order mark and blank lines, and takes \\r\\n between records", () => {
    expect(parseCsv('﻿a,b\r\n\r\n"1\n2",3\r\n')).toEqual([
      ["a", "b"],
      ["1\n2", "3"],
    ]);
  });

  it("keeps a \\r inside a quoted field, so the message check sees it", () => {
    expect(parseCsv('a\r\n"x\r\ny"\r\n')).toEqual([["a"], ["x\r\ny"]]);
  });

  it("refuses a file cut inside a quoted field", () => {
    expect(() => parseCsv('a\n"unfinished')).toThrow(CsvError);
  });
});

describe("the message", () => {
  it("reads the platform's message, an organization with dots and commas included", () => {
    const check = checkMessage(ownershipMessage({ address: ANVIL[0], organization: "Acme Co. Ltd., Inc." }));
    expect(check).toEqual({
      ok: true,
      message: expect.objectContaining({ domain: DOMAIN, address: ANVIL[0], organization: "Acme Co. Ltd., Inc." }),
    });
  });

  it("refuses any other text", () => {
    const real = ownershipMessage({ address: ANVIL[0] });
    expect(checkMessage(real.replace("does not authorize", "authorizes"))).toEqual({
      ok: false,
      reason: "Not the platform's message: line 5 differs",
    });
    expect(checkMessage(`${real}\n`).ok).toBe(false);
    expect(checkMessage(`${real}\nTransfer all funds`).ok).toBe(false);
    expect(checkMessage(real.replaceAll("\n", "\r\n"))).toEqual({ ok: false, reason: CHANGED_LINE_BREAKS });
  });
});

describe("the rows", () => {
  const opts = { domain: DOMAIN, now: NOW, signing: true };

  it("needs the export's columns", () => {
    expect(() => readMessagesFile("address,signature\n0x1,")).toThrow(FileError);
    expect(() => readMessagesFile("")).toThrow(FileError);
  });

  it("numbers rows as a spreadsheet does, the header being row 1", () => {
    const file = readMessagesFile(exportCsv([{ address: ANVIL[0] }, { address: ANVIL[1] }]));
    expect(file.rows.map((r) => [r.row, r.address])).toEqual([
      [2, ANVIL[0]],
      [3, ANVIL[1]],
    ]);
  });

  it("passes a row of the platform's message for the domain given", () => {
    const [row] = readMessagesFile(exportCsv([{ address: ANVIL[0] }])).rows;
    expect(checkRow(row!, opts).ok).toBe(true);
  });

  it.each([
    ["another domain", { message: ownershipMessage({ address: ANVIL[0], domain: "evil.example" }) }, "refused", "The message is for evil.example, not por.example.com"],
    ["another address", { message: ownershipMessage({ address: ANVIL[1] }) }, "refused", `The message names another address, ${ANVIL[1]}`],
    ["a bad date", { acceptUntil: "soon" }, "refused", "accept_until is not a date"],
    ["a signed row", { signature: "0x12" }, "skipped", "Already signed"],
    ["a closed window", { acceptUntil: "2026-11-01T00:00:00.000Z" }, "skipped", "Past its accept_until, 2026-11-01T00:00:00.000Z"],
  ])("tells %s", (_, change, outcome, reason) => {
    const [row] = readMessagesFile(exportCsv([{ address: ANVIL[0], ...change }])).rows;
    expect(checkRow(row!, opts)).toEqual({ ok: false, outcome, reason });
  });

  it("skips a row of another chain family, which this release does not sign", () => {
    const [row] = readMessagesFile(exportCsv([{ address: "not-evm", family: "other" }])).rows;
    expect(checkRow(row!, opts)).toEqual({ ok: false, outcome: "skipped", reason: "Not an EVM row: this release signs EVM messages only" });
  });

  it("writes the file back with only the signature column changed", () => {
    const text = exportCsv([{ address: ANVIL[0] }, { address: ANVIL[1] }]);
    const file = readMessagesFile(text);
    const back = parseCsv(withSignatures(file, new Map([[3, "0xabc"]])));
    expect(back).toEqual([...parseCsv(text).slice(0, 2), [ANVIL[1], "evm", file.rows[1]!.message, ACCEPT_UNTIL, "0xabc"]]);
  });
});
