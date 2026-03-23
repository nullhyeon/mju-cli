import path from "node:path";

import { buildAppStorageDirs, resolveDefaultAppDataDir } from "../config/paths.js";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0 Safari/537.36";

export interface LmsRuntimeConfig {
  appDataDir: string;
  userId: string | undefined;
  password: string | undefined;
  profileFile: string;
  sessionFile: string;
  mainHtmlFile: string;
  coursesFile: string;
  downloadsDir: string;
  credentialServiceName: string;
  userAgent: string;
}

export interface LmsRuntimeConfigOverrides {
  appDataDir?: string;
  userId?: string;
  password?: string;
  profileFile?: string;
  sessionFile?: string;
  mainHtmlFile?: string;
  coursesFile?: string;
  downloadsDir?: string;
  credentialServiceName?: string;
  userAgent?: string;
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function resolveLmsRuntimeConfig(
  overrides: LmsRuntimeConfigOverrides = {}
): LmsRuntimeConfig {
  const appDataDir = path.resolve(clean(overrides.appDataDir) ?? resolveDefaultAppDataDir());
  const storageDirs = buildAppStorageDirs(appDataDir);

  return {
    appDataDir,
    userId: clean(overrides.userId),
    password: clean(overrides.password),
    profileFile: path.resolve(
      clean(overrides.profileFile) ?? path.join(storageDirs.stateDir, "profile.json")
    ),
    sessionFile: path.resolve(
      clean(overrides.sessionFile) ?? path.join(storageDirs.stateDir, "lms-session.json")
    ),
    mainHtmlFile: path.resolve(
      clean(overrides.mainHtmlFile) ?? path.join(storageDirs.snapshotDir, "lms-main.html")
    ),
    coursesFile: path.resolve(
      clean(overrides.coursesFile) ?? path.join(storageDirs.snapshotDir, "lms-courses.json")
    ),
    downloadsDir: path.resolve(
      clean(overrides.downloadsDir) ?? path.join(storageDirs.downloadsDir, "lms")
    ),
    credentialServiceName: clean(overrides.credentialServiceName) ?? "mju-cli",
    userAgent: clean(overrides.userAgent) ?? DEFAULT_USER_AGENT
  };
}
