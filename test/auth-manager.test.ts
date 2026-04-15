import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { AuthManager } from "../src/auth/auth-manager.ts";
import type { PasswordVault } from "../src/auth/password-vault.ts";
import { resolveLibraryRuntimeConfig } from "../src/library/config.ts";
import { resolveLmsRuntimeConfig } from "../src/lms/config.ts";
import type { LoginSnapshotResult } from "../src/lms/types.ts";
import { resolveMsiRuntimeConfig } from "../src/msi/config.ts";
import { resolveUcheckRuntimeConfig } from "../src/ucheck/config.ts";

class MemoryPasswordVault implements PasswordVault {
  readonly authMode = "windows-credential-manager" as const;
  private readonly passwords = new Map<string, string>();

  async savePassword(targetName: string, _userName: string, password: string): Promise<void> {
    this.passwords.set(targetName, password);
  }

  async getPassword(targetName: string): Promise<string | null> {
    return this.passwords.get(targetName) ?? null;
  }

  async deletePassword(targetName: string): Promise<boolean> {
    return this.passwords.delete(targetName);
  }

  async hasPassword(targetName: string): Promise<boolean> {
    return this.passwords.has(targetName);
  }
}

function createSnapshot(sessionPath: string, mainHtmlPath: string, coursesPath: string): LoginSnapshotResult {
  return {
    loggedIn: true,
    usedSavedSession: false,
    mainFinalUrl: "https://lms.example.com/main",
    cookieCount: 3,
    courseCandidatesCount: 2,
    sessionPath,
    mainHtmlPath,
    coursesPath
  };
}

test("AuthManager delegates storage and clears cross-service sessions on account switch", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mju-auth-manager-"));
  t.after(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const config = resolveLmsRuntimeConfig({ appDataDir: tempDir });
  const vault = new MemoryPasswordVault();
  let loginCalls = 0;

  const authManager = new AuthManager(config, {
    passwordVault: vault,
    clientFactory: () =>
      ({
        async authenticateAndSnapshot() {
          loginCalls += 1;
          return createSnapshot(config.sessionFile, config.mainHtmlFile, config.coursesFile);
        },
        async clearSavedSession() {
          return false;
        }
      }) as never
  });

  await authManager.loginAndStore("60123456", "first-secret");

  const librarySession = resolveLibraryRuntimeConfig({ appDataDir: tempDir }).sessionFile;
  const msiSession = resolveMsiRuntimeConfig({ appDataDir: tempDir }).sessionFile;
  const ucheckSession = resolveUcheckRuntimeConfig({ appDataDir: tempDir }).sessionFile;

  await Promise.all(
    [librarySession, msiSession, ucheckSession].map(async (filePath) => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, "stale-session", "utf8");
    })
  );

  const result = await authManager.loginAndStore("60999999", "second-secret");

  assert.equal(loginCalls, 2);
  assert.equal(result.profile.userId, "60999999");
  assert.equal(await vault.getPassword(authManager.getCredentialTarget("60123456")), null);
  assert.equal(
    await vault.getPassword(authManager.getCredentialTarget("60999999")),
    "second-secret"
  );

  const profileRaw = await fs.readFile(config.profileFile, "utf8");
  assert.equal(JSON.parse(profileRaw).userId, "60999999");

  for (const filePath of [librarySession, msiSession, ucheckSession]) {
    await assert.rejects(fs.access(filePath), /ENOENT/);
  }
});

test("AuthManager.forget clears saved credentials and every service session", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mju-auth-forget-"));
  t.after(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const config = resolveLmsRuntimeConfig({ appDataDir: tempDir });
  const vault = new MemoryPasswordVault();
  const authManager = new AuthManager(config, {
    passwordVault: vault,
    clientFactory: () =>
      ({
        async authenticateAndSnapshot() {
          return createSnapshot(config.sessionFile, config.mainHtmlFile, config.coursesFile);
        },
        async clearSavedSession() {
          await fs.rm(config.sessionFile);
          return true;
        }
      }) as never
  });

  await authManager.loginAndStore("60123456", "forget-secret");

  const sessionFiles = [
    config.sessionFile,
    resolveLibraryRuntimeConfig({ appDataDir: tempDir }).sessionFile,
    resolveMsiRuntimeConfig({ appDataDir: tempDir }).sessionFile,
    resolveUcheckRuntimeConfig({ appDataDir: tempDir }).sessionFile
  ];

  await Promise.all(
    sessionFiles.map(async (filePath) => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, "saved-session", "utf8");
    })
  );

  const result = await authManager.forget();

  assert.equal(result.deletedSession, true);
  assert.equal(result.deletedProfile, true);
  assert.equal(result.deletedPassword, true);
  assert.equal(result.forgottenUserId, "60123456");
  assert.deepEqual(
    result.crossServiceSessionFiles.sort(),
    sessionFiles.slice(1).sort()
  );
  assert.deepEqual(
    result.deletedCrossServiceSessions.sort(),
    sessionFiles.slice(1).sort()
  );
  assert.equal(await vault.getPassword(authManager.getCredentialTarget("60123456")), null);

  await assert.rejects(fs.access(config.profileFile), /ENOENT/);
  for (const filePath of sessionFiles) {
    await assert.rejects(fs.access(filePath), /ENOENT/);
  }
});
