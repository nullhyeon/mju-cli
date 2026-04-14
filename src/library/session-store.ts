import fs from "node:fs/promises";
import path from "node:path";

import type { LibrarySessionPayload } from "./types.js";

export class LibrarySessionStore {
  constructor(private readonly filePath: string) {}

  async load(expectedUserId?: string): Promise<LibrarySessionPayload | null> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const payload = JSON.parse(raw) as LibrarySessionPayload;
      if (!payload.accessToken || !payload.userId) {
        return null;
      }
      if (expectedUserId && payload.userId !== expectedUserId) {
        return null;
      }
      return payload;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }

      throw error;
    }
  }

  async save(payload: LibrarySessionPayload): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(payload, null, 2), "utf8");
  }

  async remove(): Promise<boolean> {
    try {
      await fs.rm(this.filePath);
      return true;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return false;
      }

      throw error;
    }
  }
}
