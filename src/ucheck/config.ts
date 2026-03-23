import path from "node:path";

import { buildAppStorageDirs, resolveDefaultAppDataDir } from "../config/paths.js";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0 Safari/537.36";

export interface UcheckRuntimeConfig {
  appDataDir: string;
  sessionFile: string;
  mainHtmlFile: string;
  userAgent: string;
}

export interface UcheckRuntimeConfigOverrides {
  appDataDir?: string;
  sessionFile?: string;
  mainHtmlFile?: string;
  userAgent?: string;
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function resolveUcheckRuntimeConfig(
  overrides: UcheckRuntimeConfigOverrides = {}
): UcheckRuntimeConfig {
  const appDataDir = path.resolve(
    clean(overrides.appDataDir) ?? resolveDefaultAppDataDir()
  );
  const storageDirs = buildAppStorageDirs(appDataDir);

  return {
    appDataDir,
    sessionFile: path.resolve(
      clean(overrides.sessionFile) ?? path.join(storageDirs.stateDir, "ucheck-session.json")
    ),
    mainHtmlFile: path.resolve(
      clean(overrides.mainHtmlFile) ?? path.join(storageDirs.snapshotDir, "ucheck-main.html")
    ),
    userAgent: clean(overrides.userAgent) ?? DEFAULT_USER_AGENT
  };
}
