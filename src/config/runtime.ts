import { buildAppStorageDirs, resolveDefaultAppDataDir } from "./paths.js";

export interface RuntimeConfig {
  appDir: string;
  storage: ReturnType<typeof buildAppStorageDirs>;
}

export function resolveRuntimeConfig(options?: { appDir?: string }): RuntimeConfig {
  const appDir = resolveDefaultAppDataDir(options?.appDir);

  return {
    appDir,
    storage: buildAppStorageDirs(appDir)
  };
}
