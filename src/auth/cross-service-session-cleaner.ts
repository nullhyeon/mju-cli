import fs from "node:fs/promises";

import { resolveLibraryRuntimeConfig } from "../library/config.js";
import { resolveMsiRuntimeConfig } from "../msi/config.js";
import { resolveUcheckRuntimeConfig } from "../ucheck/config.js";

async function removeFiles(filePaths: string[]): Promise<void> {
  await Promise.all(
    filePaths.map(async (filePath) => {
      try {
        await fs.rm(filePath);
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return;
        }

        throw error;
      }
    })
  );
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

  async clearCrossServiceSessions(): Promise<void> {
    await removeFiles(this.getSessionFiles());
  }
}
