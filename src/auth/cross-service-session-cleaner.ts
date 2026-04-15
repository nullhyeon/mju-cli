import fs from "node:fs/promises";

import { resolveLibraryRuntimeConfig } from "../library/config.js";
import { resolveMsiRuntimeConfig } from "../msi/config.js";
import { resolveUcheckRuntimeConfig } from "../ucheck/config.js";

async function removeFiles(filePaths: string[]): Promise<string[]> {
  const deletedFiles = await Promise.all(
    filePaths.map(async (filePath) => {
      try {
        await fs.rm(filePath);
        return filePath;
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return null;
        }

        throw error;
      }
    })
  );

  return deletedFiles.filter((filePath): filePath is string => filePath !== null);
}

export interface CrossServiceSessionCleanupResult {
  sessionFiles: string[];
  deletedFiles: string[];
}

export class CrossServiceSessionCleaner {
  constructor(private readonly appDataDir: string) {}

  getSessionFiles(): string[] {
    return [
      resolveLibraryRuntimeConfig({ appDataDir: this.appDataDir }).sessionFile,
      resolveMsiRuntimeConfig({ appDataDir: this.appDataDir }).sessionFile,
      resolveUcheckRuntimeConfig({ appDataDir: this.appDataDir }).sessionFile
    ];
  }

  async clearCrossServiceSessions(): Promise<CrossServiceSessionCleanupResult> {
    const sessionFiles = this.getSessionFiles();
    const deletedFiles = await removeFiles(sessionFiles);

    return {
      sessionFiles,
      deletedFiles
    };
  }
}
