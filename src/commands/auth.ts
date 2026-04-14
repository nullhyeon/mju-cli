import { Command } from "commander";

import { AuthManager } from "../auth/auth-manager.js";
import { resolveLmsRuntimeConfig } from "../lms/config.js";
import { printData } from "../output/print.js";
import type { GlobalOptions } from "../types.js";

function normalizePasswordInput(value: string): string {
  return value.trim();
}

async function readPasswordFromStdin(): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const password = normalizePasswordInput(Buffer.concat(chunks).toString("utf8"));
  if (!password) {
    throw new Error("표준입력에서 비밀번호를 읽지 못했습니다.");
  }

  return password;
}

async function promptHiddenPassword(label: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      "대화형 비밀번호 입력을 사용할 수 없습니다. --password 또는 --password-stdin 을 사용해주세요."
    );
  }

  const stdin = process.stdin;
  const stdout = process.stdout;
  const wasRaw = stdin.isRaw === true;

  return new Promise<string>((resolve, reject) => {
    let password = "";
    let settled = false;

    const cleanup = (writeNewline: boolean) => {
      stdin.off("data", handleData);
      stdin.off("error", handleError);
      stdin.pause();
      if (stdin.setRawMode) {
        stdin.setRawMode(wasRaw);
      }
      if (writeNewline) {
        stdout.write("\n");
      }
    };

    const finish = (result: string) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup(true);
      resolve(result);
    };

    const fail = (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup(true);
      reject(error);
    };

    const handleError = (error: Error) => {
      fail(error);
    };

    const handleData = (chunk: string | Buffer) => {
      const text = chunk.toString("utf8");

      for (const character of text) {
        if (character === "\u0003") {
          fail(new Error("비밀번호 입력이 취소되었습니다."));
          return;
        }

        if (character === "\r" || character === "\n") {
          const normalized = normalizePasswordInput(password);
          if (!normalized) {
            fail(new Error("비밀번호를 입력해주세요."));
            return;
          }

          finish(normalized);
          return;
        }

        if (character === "\u0008" || character === "\u007f") {
          password = password.slice(0, -1);
          continue;
        }

        password += character;
      }
    };

    stdout.write(label);
    stdin.setEncoding("utf8");
    if (stdin.setRawMode) {
      stdin.setRawMode(true);
    }
    stdin.resume();
    stdin.on("data", handleData);
    stdin.on("error", handleError);
  });
}

async function resolveLoginPassword(options: {
  password?: string;
  passwordStdin?: boolean;
}): Promise<string> {
  const password = options.password?.trim();
  const passwordStdin = options.passwordStdin === true;

  if (password && passwordStdin) {
    throw new Error("--password 와 --password-stdin 은 동시에 사용할 수 없습니다.");
  }

  if (password) {
    return password;
  }

  if (passwordStdin) {
    return readPasswordFromStdin();
  }

  return promptHiddenPassword("MJU password: ");
}

export function createAuthCommand(getGlobals: () => GlobalOptions): Command {
  const auth = new Command("auth").description("Authenticate and manage saved LMS credentials");

  auth
    .command("login")
    .description("Log in to LMS and save credentials")
    .requiredOption("--id <id>", "MJU user id")
    .option("--password <password>", "MJU password (warning: may be visible in shell history)")
    .option("--password-stdin", "Read MJU password from stdin")
    .action(async (options: { id: string; password?: string; passwordStdin?: boolean }) => {
      const globals = getGlobals();
      const password = await resolveLoginPassword(options);
      const config = resolveLmsRuntimeConfig({
        appDataDir: globals.appDir,
        userId: options.id,
        password
      });
      const authManager = new AuthManager(config);
      const result = await authManager.loginAndStore(options.id, password);

      printData(
        {
          profile: result.profile,
          profileFile: result.profileFile,
          credentialTarget: result.credentialTarget,
          sessionFile: result.sessionFile,
          snapshot: result.snapshot
        },
        globals.format
      );
    });

  auth
    .command("status")
    .description("Show stored authentication status")
    .action(async () => {
      const globals = getGlobals();
      const authManager = new AuthManager(resolveLmsRuntimeConfig({ appDataDir: globals.appDir }));
      printData(await authManager.status(), globals.format);
    });

  auth
    .command("logout")
    .description("Delete saved LMS session only")
    .action(async () => {
      const globals = getGlobals();
      const authManager = new AuthManager(resolveLmsRuntimeConfig({ appDataDir: globals.appDir }));
      printData(await authManager.logout(), globals.format);
    });

  auth
    .command("forget")
    .description("Delete saved credentials and LMS session")
    .action(async () => {
      const globals = getGlobals();
      const authManager = new AuthManager(resolveLmsRuntimeConfig({ appDataDir: globals.appDir }));
      printData(await authManager.forget(), globals.format);
    });

  return auth;
}
