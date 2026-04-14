import fs from "node:fs/promises";

import { AuthProfileStore } from "./profile-store.js";
import { buildCredentialTarget, type PasswordVault } from "./password-vault.js";
import type {
  AuthStatus,
  ResolvedLmsCredentials,
  StoredAuthMode,
  StoredAuthProfile
} from "./types.js";
import { MacOsKeychainVault } from "./macos-keychain-vault.js";
import { WindowsCredentialVault } from "./windows-credential-vault.js";

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

class UnsupportedPasswordVault implements PasswordVault {
  readonly authMode = "unsupported" as const;

  async savePassword(): Promise<void> {
    throw new Error("현재 운영체제에서는 저장 로그인을 지원하지 않습니다.");
  }

  async getPassword(): Promise<string | null> {
    throw new Error("현재 운영체제에서는 저장된 비밀번호 읽기를 지원하지 않습니다.");
  }

  async deletePassword(): Promise<boolean> {
    return false;
  }

  async hasPassword(): Promise<boolean> {
    return false;
  }
}

export function createDefaultPasswordVault(): PasswordVault {
  if (process.platform === "win32") {
    return new WindowsCredentialVault();
  }

  if (process.platform === "darwin") {
    return new MacOsKeychainVault();
  }

  return new UnsupportedPasswordVault();
}

function resolveStoredAuthMode(vault: PasswordVault): StoredAuthMode {
  if (vault.authMode === "unsupported") {
    throw new Error("현재 운영체제에서는 저장 로그인 비밀번호 보관소를 지원하지 않습니다.");
  }

  return vault.authMode;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

export class StoredCredentialService {
  private readonly profileStore: AuthProfileStore;

  constructor(
    private readonly options: {
      profileFile: string;
      credentialServiceName: string;
      passwordVault: PasswordVault;
    }
  ) {
    this.profileStore = new AuthProfileStore(options.profileFile);
  }

  async loadProfile(): Promise<StoredAuthProfile | null> {
    return this.profileStore.load();
  }

  async resolveCredentials(): Promise<ResolvedLmsCredentials> {
    const profile = await this.profileStore.load();
    if (!profile) {
      throw new Error(
        "저장된 로그인 정보가 없습니다. `mju auth login --id YOUR_ID --password YOUR_PASSWORD` 로 먼저 로그인해주세요."
      );
    }

    const password = await this.options.passwordVault.getPassword(
      this.getCredentialTarget(profile.userId)
    );
    if (password === null) {
      throw new Error(
        "저장된 비밀번호를 읽지 못했습니다. `mju auth login --id YOUR_ID --password YOUR_PASSWORD` 로 다시 로그인해주세요."
      );
    }

    return {
      userId: profile.userId,
      password,
      source: "os-store"
    };
  }

  async saveLogin(
    userId: string,
    password: string,
    existingProfile: StoredAuthProfile | null
  ): Promise<{
    profile: StoredAuthProfile;
    profileFile: string;
    credentialTarget: string;
  }> {
    const normalizedUserId = clean(userId);
    const normalizedPassword = clean(password);
    if (!normalizedUserId || !normalizedPassword) {
      throw new Error("아이디와 비밀번호를 모두 제공해야 합니다.");
    }

    const credentialTarget = this.getCredentialTarget(normalizedUserId);
    await this.options.passwordVault.savePassword(
      credentialTarget,
      normalizedUserId,
      normalizedPassword
    );

    const now = new Date().toISOString();
    const profile: StoredAuthProfile = {
      userId: normalizedUserId,
      authMode: resolveStoredAuthMode(this.options.passwordVault),
      createdAt:
        existingProfile?.userId === normalizedUserId ? existingProfile.createdAt : now,
      updatedAt: now,
      lastLoginAt: now
    };

    await this.profileStore.save(profile);

    return {
      profile,
      profileFile: this.options.profileFile,
      credentialTarget
    };
  }

  async deletePasswordForUser(userId: string): Promise<boolean> {
    return this.options.passwordVault.deletePassword(this.getCredentialTarget(userId));
  }

  async status(runtime: {
    appDataDir: string;
    sessionFile: string;
  }): Promise<AuthStatus> {
    const profile = await this.profileStore.load();
    const sessionFileExists = await fileExists(runtime.sessionFile);
    const credentialTarget = profile ? this.getCredentialTarget(profile.userId) : undefined;

    return {
      appDataDir: runtime.appDataDir,
      profileFile: this.options.profileFile,
      sessionFile: runtime.sessionFile,
      credentialServiceName: this.options.credentialServiceName,
      ...(credentialTarget ? { credentialTarget } : {}),
      profileExists: profile !== null,
      ...(profile ? { storedUserId: profile.userId } : {}),
      ...(profile ? { authMode: profile.authMode } : {}),
      passwordStored:
        credentialTarget !== undefined
          ? await this.options.passwordVault.hasPassword(credentialTarget)
          : false,
      sessionFileExists
    };
  }

  async forgetStoredLogin(): Promise<{
    profileFile: string;
    deletedProfile: boolean;
    deletedPassword: boolean;
    forgottenUserId?: string;
  }> {
    const profile = await this.profileStore.load();
    const deletedProfile = await this.profileStore.clear();
    const deletedPassword = profile
      ? await this.options.passwordVault.deletePassword(this.getCredentialTarget(profile.userId))
      : false;

    return {
      profileFile: this.options.profileFile,
      deletedProfile,
      deletedPassword,
      ...(profile ? { forgottenUserId: profile.userId } : {})
    };
  }

  getCredentialTarget(userId: string): string {
    return buildCredentialTarget(this.options.credentialServiceName, userId);
  }
}
