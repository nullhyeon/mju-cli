import fs from "node:fs/promises";
import path from "node:path";

import { Command } from "commander";

import { AuthManager } from "../auth/auth-manager.js";
import { resolveRuntimeConfig } from "../config/runtime.js";
import { resolveLibraryRuntimeConfig } from "../library/config.js";
import { resolveLmsRuntimeConfig } from "../lms/config.js";
import { resolveMsiRuntimeConfig } from "../msi/config.js";
import { printData } from "../output/print.js";
import type { GlobalOptions } from "../types.js";
import { resolveUcheckRuntimeConfig } from "../ucheck/config.js";

type CheckStatus = "pass" | "warn" | "error";

interface DoctorCheck {
  id: string;
  area: string;
  status: CheckStatus;
  summary: string;
  details?: string;
  path?: string;
  suggestedFix?: string;
  suggestedCommand?: string;
}

interface DoctorResult {
  ok: boolean;
  node: string;
  platform: NodeJS.Platform;
  appDir: string;
  summary: {
    passed: number;
    warnings: number;
    errors: number;
  };
  checks: DoctorCheck[];
  nextSteps: string[];
}

const STATUS_LABELS: Record<CheckStatus, string> = {
  pass: "정상",
  warn: "주의",
  error: "오류"
};

function createCheck(
  status: CheckStatus,
  id: string,
  area: string,
  summary: string,
  details?: string,
  filePath?: string,
  guidance: {
    suggestedFix?: string;
    suggestedCommand?: string;
  } = {}
): DoctorCheck {
  return {
    id,
    area,
    status,
    summary,
    ...(details ? { details } : {}),
    ...(filePath ? { path: filePath } : {}),
    ...(guidance.suggestedFix ? { suggestedFix: guidance.suggestedFix } : {}),
    ...(guidance.suggestedCommand ? { suggestedCommand: guidance.suggestedCommand } : {})
  };
}

function getPasswordVaultSupport(): { supported: boolean; label: string } {
  if (process.platform === "win32") {
    return { supported: true, label: "windows-credential-manager" };
  }

  if (process.platform === "darwin") {
    return { supported: true, label: "macos-keychain" };
  }

  return { supported: false, label: "unsupported" };
}

function summarizeChecks(checks: DoctorCheck[]): DoctorResult["summary"] {
  return checks.reduce(
    (summary, check) => {
      if (check.status === "pass") {
        summary.passed += 1;
      } else if (check.status === "warn") {
        summary.warnings += 1;
      } else {
        summary.errors += 1;
      }

      return summary;
    },
    { passed: 0, warnings: 0, errors: 0 }
  );
}

export function buildNextSteps(checks: DoctorCheck[]): string[] {
  const seen = new Set<string>();
  const steps: string[] = [];

  for (const check of checks) {
    if (!check.suggestedFix && !check.suggestedCommand) {
      continue;
    }

    const line = [
      check.suggestedFix,
      check.suggestedCommand ? `추천 명령: ${check.suggestedCommand}` : undefined
    ]
      .filter(Boolean)
      .join(" | ");

    if (!line || seen.has(line)) {
      continue;
    }

    seen.add(line);
    steps.push(line);
  }

  return steps;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function ensureStorageReady(runtime: ReturnType<typeof resolveRuntimeConfig>): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  const storageEntries = Object.entries(runtime.storage);
  const createdPaths: string[] = [];

  for (const [name, dirPath] of storageEntries) {
    const existed = await pathExists(dirPath);
    await fs.mkdir(dirPath, { recursive: true });
    if (!existed) {
      createdPaths.push(`${name}=${dirPath}`);
    }
  }

  checks.push(
    createCheck(
      "pass",
      "storage-directories",
      "storage",
      "필수 저장 디렉터리를 확인했습니다.",
      createdPaths.length > 0
        ? `새로 생성된 경로: ${createdPaths.join(", ")}`
        : "모든 저장 디렉터리가 이미 준비되어 있었습니다.",
      runtime.appDir
    )
  );

  const probeFile = path.join(runtime.storage.stateDir, `.doctor-write-${process.pid}-${Date.now()}.tmp`);
  try {
    await fs.writeFile(probeFile, "ok", "utf8");
    const content = await fs.readFile(probeFile, "utf8");
    await fs.rm(probeFile);
    checks.push(
      createCheck(
        content === "ok" ? "pass" : "error",
        "storage-write",
        "storage",
        content === "ok"
          ? "상태 저장 디렉터리에 읽기/쓰기가 가능합니다."
          : "상태 저장 디렉터리 쓰기 검증 결과가 예상과 다릅니다.",
        undefined,
        runtime.storage.stateDir
      )
    );
  } catch (error: unknown) {
    await fs.rm(probeFile, { force: true }).catch(() => undefined);
    checks.push(
      createCheck(
        "error",
        "storage-write",
        "storage",
        "상태 저장 디렉터리에 쓰기 검증에 실패했습니다.",
        error instanceof Error ? error.message : String(error),
        runtime.storage.stateDir,
        {
          suggestedFix:
            "쓰기 가능한 경로를 사용하도록 앱 데이터 디렉터리를 바꾸거나 현재 경로 권한을 확인하세요.",
          suggestedCommand: "mju --app-dir <쓰기 가능한 경로> doctor"
        }
      )
    );
  }

  return checks;
}

async function inspectAuth(appDir: string): Promise<DoctorCheck[]> {
  const lmsConfig = resolveLmsRuntimeConfig({ appDataDir: appDir });
  const authManager = new AuthManager(lmsConfig);
  const checks: DoctorCheck[] = [];
  const vaultSupport = getPasswordVaultSupport();

  checks.push(
    createCheck(
      vaultSupport.supported ? "pass" : "warn",
      "password-vault",
      "auth",
      vaultSupport.supported
        ? "운영체제 비밀번호 저장소를 사용할 수 있습니다."
        : "현재 운영체제는 저장 로그인 비밀번호 보관소를 지원하지 않습니다.",
      `provider=${vaultSupport.label}`,
      undefined,
      vaultSupport.supported
        ? {}
        : {
            suggestedFix:
              "저장 로그인 기능이 제한될 수 있습니다. 가능하면 지원 운영체제에서 다시 설정하세요."
          }
    )
  );

  try {
    const status = await authManager.status();

    checks.push(
      createCheck(
        status.profileExists ? "pass" : "warn",
        "auth-profile",
        "auth",
        status.profileExists
          ? "저장된 로그인 프로필을 찾았습니다."
          : "저장된 로그인 프로필이 없습니다.",
        status.profileExists ? `userId=${status.storedUserId}` : undefined,
        status.profileFile,
        status.profileExists
          ? {}
          : {
              suggestedFix: "학교 계정으로 다시 로그인해 저장 프로필을 만드세요.",
              suggestedCommand: "mju auth login --id <학번>"
            }
      )
    );

    checks.push(
      createCheck(
        status.profileExists
          ? status.passwordStored
            ? "pass"
            : "warn"
          : "warn",
        "auth-password",
        "auth",
        status.profileExists
          ? status.passwordStored
            ? "운영체제 저장소에 비밀번호가 보관되어 있습니다."
            : "운영체제 저장소에 비밀번호가 없습니다."
          : "저장된 로그인 정보가 없어 비밀번호도 아직 없습니다.",
        status.credentialTarget ? `target=${status.credentialTarget}` : "먼저 `mju auth login`을 실행해주세요.",
        undefined,
        status.profileExists && !status.passwordStored
          ? {
              suggestedFix: "비밀번호가 저장되어 있지 않습니다. 다시 로그인해 비밀번호를 저장하세요.",
              suggestedCommand: "mju auth login --id <학번>"
            }
          : !status.profileExists
            ? {
                suggestedFix: "학교 계정으로 다시 로그인해 저장 프로필을 만드세요.",
                suggestedCommand: "mju auth login --id <학번>"
              }
            : {}
      )
    );
  } catch (error: unknown) {
    checks.push(
      createCheck(
        "error",
        "auth-status",
        "auth",
        "저장 로그인 상태를 읽지 못했습니다.",
        error instanceof Error ? error.message : String(error),
        lmsConfig.profileFile,
        {
          suggestedFix: "저장된 로그인 상태를 초기화한 뒤 다시 로그인해 보세요.",
          suggestedCommand: "mju auth forget"
        }
      )
    );
  }

  return checks;
}

async function inspectSessionFile(
  id: string,
  label: string,
  sessionFile: string,
  expectedUserId: string | undefined,
  validator: (payload: Record<string, unknown>) => string | null
): Promise<DoctorCheck> {
  if (!(await pathExists(sessionFile))) {
    return createCheck(
      "warn",
      id,
      "sessions",
      `${label} 세션 파일이 없습니다.`,
      "필요 시 로그인 시점에 새로 생성됩니다.",
      sessionFile,
      expectedUserId
        ? {
            suggestedFix: `${label} 관련 명령을 처음 실행하면 세션이 자동으로 다시 생성됩니다.`
          }
        : {}
    );
  }

  try {
    const raw = await fs.readFile(sessionFile, "utf8");
    const payload = JSON.parse(raw) as Record<string, unknown>;
    const validationError = validator(payload);
    if (validationError) {
      return createCheck(
        "error",
        id,
        "sessions",
        `${label} 세션 파일 형식이 올바르지 않습니다.`,
        validationError,
        sessionFile,
        {
          suggestedFix: "손상되었거나 오래된 세션일 수 있습니다. 세션을 지우고 다시 로그인하세요.",
          suggestedCommand: "mju auth forget"
        }
      );
    }

    const storedUserId = typeof payload.userId === "string" ? payload.userId : undefined;
    if (expectedUserId && storedUserId && storedUserId !== expectedUserId) {
      return createCheck(
        "error",
        id,
        "sessions",
        `${label} 세션이 현재 로그인 사용자와 일치하지 않습니다.`,
        `stored=${storedUserId}, expected=${expectedUserId}`,
        sessionFile,
        {
          suggestedFix:
            "다른 사용자 세션이 남아 있습니다. 모든 저장 세션을 지우고 현재 계정으로 다시 로그인하세요.",
          suggestedCommand: "mju auth forget"
        }
      );
    }

    return createCheck(
      "pass",
      id,
      "sessions",
      `${label} 세션 파일을 재사용할 수 있습니다.`,
      storedUserId ? `userId=${storedUserId}` : undefined,
      sessionFile
    );
  } catch (error: unknown) {
    return createCheck(
      "error",
      id,
      "sessions",
      `${label} 세션 파일을 읽지 못했습니다.`,
      error instanceof Error ? error.message : String(error),
      sessionFile,
      {
        suggestedFix: "세션 파일을 초기화한 뒤 다시 로그인해 상태를 복구하세요.",
        suggestedCommand: "mju auth forget"
      }
    );
  }
}

async function inspectServiceSessions(appDir: string): Promise<DoctorCheck[]> {
  const authManager = new AuthManager(resolveLmsRuntimeConfig({ appDataDir: appDir }));
  let expectedUserId: string | undefined;

  try {
    expectedUserId = (await authManager.status()).storedUserId;
  } catch {
    expectedUserId = undefined;
  }

  const lmsConfig = resolveLmsRuntimeConfig({ appDataDir: appDir });
  const libraryConfig = resolveLibraryRuntimeConfig({ appDataDir: appDir });
  const msiConfig = resolveMsiRuntimeConfig({ appDataDir: appDir });
  const ucheckConfig = resolveUcheckRuntimeConfig({ appDataDir: appDir });

  return Promise.all([
    inspectSessionFile(
      "lms-session-owner",
      "LMS",
      lmsConfig.sessionFile,
      expectedUserId,
      (payload) => {
        if (typeof payload.userId !== "string") {
          return "session payload에 userId가 없습니다.";
        }

        if (!payload.cookies || typeof payload.cookies !== "object") {
          return "session payload에 cookies가 없습니다.";
        }

        return null;
      }
    ),
    inspectSessionFile(
      "library-session-owner",
      "도서관",
      libraryConfig.sessionFile,
      expectedUserId,
      (payload) => {
        if (typeof payload.userId !== "string") {
          return "session payload에 userId가 없습니다.";
        }

        if (typeof payload.accessToken !== "string" || payload.accessToken.length === 0) {
          return "session payload에 accessToken이 없습니다.";
        }

        return null;
      }
    ),
    inspectSessionFile(
      "msi-session-owner",
      "MSI",
      msiConfig.sessionFile,
      expectedUserId,
      (payload) => {
        if (typeof payload.userId !== "string") {
          return "session payload에 userId가 없습니다.";
        }

        if (!payload.cookies || typeof payload.cookies !== "object") {
          return "session payload에 cookies가 없습니다.";
        }

        return null;
      }
    ),
    inspectSessionFile(
      "ucheck-session-owner",
      "UCheck",
      ucheckConfig.sessionFile,
      expectedUserId,
      (payload) => {
        if (typeof payload.userId !== "string") {
          return "session payload에 userId가 없습니다.";
        }

        if (!payload.cookies || typeof payload.cookies !== "object") {
          return "session payload에 cookies가 없습니다.";
        }

        return null;
      }
    )
  ]);
}

async function inspectPlaywrightRuntime(): Promise<DoctorCheck> {
  try {
    const playwright = await import("playwright");
    const executablePath = playwright.chromium.executablePath();
    if (!executablePath) {
      return createCheck(
        "warn",
        "playwright-browser",
        "browser",
        "Playwright는 설치되어 있지만 Chromium 실행 경로를 찾지 못했습니다."
        ,
        undefined,
        undefined,
        {
          suggestedFix: "브라우저 런타임을 다시 설치해 동영상 재생 기능을 복구하세요.",
          suggestedCommand: "npx playwright install chromium"
        }
      );
    }

    if (!(await pathExists(executablePath))) {
      return createCheck(
        "warn",
        "playwright-browser",
        "browser",
        "Playwright 패키지는 있지만 Chromium 브라우저가 준비되지 않았습니다.",
        "필요하면 `npx playwright install chromium` 으로 브라우저를 설치해주세요.",
        executablePath,
        {
          suggestedFix: "동영상 재생 기능이 필요하면 Chromium 브라우저 런타임을 설치하세요.",
          suggestedCommand: "npx playwright install chromium"
        }
      );
    }

    return createCheck(
      "pass",
      "playwright-browser",
      "browser",
      "Playwright Chromium 런타임을 사용할 수 있습니다.",
      undefined,
      executablePath
    );
  } catch (error: unknown) {
    return createCheck(
      "warn",
      "playwright-browser",
      "browser",
      "Playwright 런타임을 불러오지 못했습니다.",
      error instanceof Error ? error.message : String(error),
      undefined,
      {
        suggestedFix:
          "의존성 설치 상태를 확인한 뒤 Playwright 브라우저 런타임을 다시 설치하세요.",
        suggestedCommand: "npm install && npx playwright install chromium"
      }
    );
  }
}

async function runDoctor(appDir: string | undefined): Promise<DoctorResult> {
  const runtime = resolveRuntimeConfig({ appDir });
  const checks: DoctorCheck[] = [];
  const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);

  checks.push(
      createCheck(
        nodeMajor >= 22 ? "pass" : "error",
        "node-version",
        "environment",
        nodeMajor >= 22
          ? "지원되는 Node.js 버전입니다."
          : "Node.js 22 이상이 필요합니다.",
        `current=${process.version}`,
        undefined,
        nodeMajor >= 22
          ? {}
          : {
              suggestedFix: "Node.js 런타임을 22 이상으로 업데이트한 뒤 다시 실행하세요."
            }
      )
    );

  checks.push(
    createCheck(
      "pass",
      "runtime-path",
      "environment",
      "런타임 경로를 확인했습니다.",
      `platform=${process.platform}`,
      runtime.appDir
    )
  );

  checks.push(...(await ensureStorageReady(runtime)));
  checks.push(...(await inspectAuth(runtime.appDir)));
  checks.push(...(await inspectServiceSessions(runtime.appDir)));
  checks.push(await inspectPlaywrightRuntime());

  const summary = summarizeChecks(checks);

  return {
    ok: summary.errors === 0,
    node: process.version,
    platform: process.platform,
    appDir: runtime.appDir,
    summary,
    checks,
    nextSteps: buildNextSteps(
      checks.filter((check) => check.status === "error" || check.status === "warn")
    )
  };
}

export function toTableRows(result: DoctorResult): Array<Record<string, string>> {
  return result.checks.map((check) => ({
    상태: STATUS_LABELS[check.status],
    영역: check.area,
    항목: check.id,
    요약: check.summary,
    세부: check.details ?? "",
    "다음 조치": check.suggestedFix ?? "",
    "추천 명령": check.suggestedCommand ?? "",
    경로: check.path ?? ""
  }));
}

export function createDoctorCommand(getGlobals: () => GlobalOptions): Command {
  return new Command("doctor")
    .description("Check local runtime prerequisites")
    .action(async () => {
      const globals = getGlobals();
      const result = await runDoctor(globals.appDir);

      if (globals.format === "table") {
        printData(toTableRows(result), "table");
        if (result.nextSteps.length > 0) {
          console.log("\n[권장 복구 순서]");
          for (const [index, step] of result.nextSteps.entries()) {
            console.log(`${index + 1}. ${step}`);
          }
        }
        return;
      }

      printData(result, globals.format);
    });
}
