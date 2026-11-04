// What the commands ask of the person running them, kept behind one interface so the tests answer in their place.
// Secrets are typed with nothing shown, and only in a terminal: piped in, they would sit in the shell's history or a
// script (README.md › Keys and options), so a pipe gets null and the command asks for a file instead. A yes or
// no can come through a pipe, one line per question.

import { createInterface, type Interface } from "node:readline";

export class Interrupted extends Error {}

export interface Io {
  print(text: string): void;
  /** No, unless the answer is y or yes. */
  confirm(question: string): Promise<boolean>;
  /** Typed with nothing shown; null when the input is not a terminal. */
  secret(question: string): Promise<string | null>;
  close(): void;
}

function readSecret(question: string): Promise<string> {
  const { stdin, stderr } = process;
  return new Promise((resolve, reject) => {
    let value = "";
    const end = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stderr.write("\n");
    };
    const onData = (chunk: string) => {
      for (const c of chunk) {
        if (c === "\r" || c === "\n") {
          end();
          return resolve(value);
        }
        if (c === "\u0003") {
          end();
          return reject(new Interrupted());
        }
        if (c === "\u007f" || c === "\b") value = value.slice(0, -1);
        else if (c >= " ") value += c;
      }
    };
    stderr.write(question);
    stdin.setEncoding("utf8");
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

export function terminalIo(): Io {
  let piped: Interface | undefined;
  let lines: AsyncIterator<string> | undefined;
  const nextLine = async (): Promise<string | null> => {
    piped ??= createInterface({ input: process.stdin, terminal: false });
    lines ??= piped[Symbol.asyncIterator]();
    const next = await lines.next();
    return next.done ? null : next.value;
  };
  const ask = (question: string) =>
    new Promise<string>((resolve) => {
      const rl = createInterface({ input: process.stdin, output: process.stderr });
      rl.on("SIGINT", () => {
        rl.close();
        process.exit(130);
      });
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
    });

  return {
    print: (text) => void process.stdout.write(`${text}\n`),
    async confirm(question) {
      let answer: string | null;
      if (process.stdin.isTTY) answer = await ask(question);
      else {
        process.stderr.write(question);
        answer = await nextLine();
        process.stderr.write("\n");
      }
      return /^\s*(y|yes)\s*$/i.test(answer ?? "");
    },
    secret: (question) => (process.stdin.isTTY ? readSecret(question) : Promise.resolve(null)),
    close: () => piped?.close(),
  };
}
