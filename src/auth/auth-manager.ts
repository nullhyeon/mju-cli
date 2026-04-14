import type { LmsRuntimeConfig } from "../lms/config.js";
import type { LoginSnapshotResult } from "../lms/types.js";
import { MjuLmsSsoClient } from "../lms/sso-client.js";
import type { PasswordVault } from "./password-vault.js";
import { CrossServiceSessionCleaner } from "./cross-service-session-cleaner.js";
import { LmsLoginVerifier } from "./lms-login-verifier.js";
import { createDefaultPasswordVault, StoredCredentialService } from "./stored-credential-service.js";
import type {
  AuthStatus,
  ForgetResult,
  LoginStoreResult,
  LogoutResult,
  ResolvedLmsCredentials
} from "./types.js";

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export interface AuthManagerDependencies {
  passwordVault?: PasswordVault;
  clientFactory?: () => MjuLmsSsoClient;
}

export interface StoredLoginResult extends LoginStoreResult {
  snapshot: LoginSnapshotResult;
}

export class AuthManager {
  private readonly storedCredentialService: StoredCredentialService;
  private readonly loginVerifier: LmsLoginVerifier;
  private readonly sessionCleaner: CrossServiceSessionCleaner;

  constructor(
    private readonly config: LmsRuntimeConfig,
    dependencies: AuthManagerDependencies = {}
  ) {
    const passwordVault = dependencies.passwordVault ?? createDefaultPasswordVault();

    this.storedCredentialService = new StoredCredentialService({
      profileFile: config.profileFile,
      credentialServiceName: config.credentialServiceName,
      passwordVault
    });
    this.loginVerifier = new LmsLoginVerifier(config, dependencies.clientFactory);
    this.sessionCleaner = new CrossServiceSessionCleaner(config.appDataDir);
  }

  async resolveCredentials(): Promise<ResolvedLmsCredentials> {
    return this.storedCredentialService.resolveCredentials();
  }

  async loginAndStore(userId: string, password: string): Promise<StoredLoginResult> {
    const normalizedUserId = clean(userId);
    const normalizedPassword = clean(password);

    if (!normalizedUserId || !normalizedPassword) {
      throw new Error("아이디와 비밀번호를 모두 제공해야 합니다.");
    }

    const existingProfile = await this.storedCredentialService.loadProfile();
    const snapshot = await this.loginVerifier.authenticateAndSnapshot(
      normalizedUserId,
      normalizedPassword
    );

    if (!snapshot.loggedIn) {
      throw new Error("SSO 로그인에 실패했습니다. 아이디와 비밀번호를 다시 확인해주세요.");
    }

    if (existingProfile && existingProfile.userId !== normalizedUserId) {
      await this.storedCredentialService.deletePasswordForUser(existingProfile.userId);
      await this.sessionCleaner.clearCrossServiceSessions();
    }

    const storedLogin = await this.storedCredentialService.saveLogin(
      normalizedUserId,
      normalizedPassword,
      existingProfile
    );

    return {
      snapshot,
      ...storedLogin,
      sessionFile: this.config.sessionFile
    };
  }

  async status(): Promise<AuthStatus> {
    return this.storedCredentialService.status({
      appDataDir: this.config.appDataDir,
      sessionFile: this.config.sessionFile
    });
  }

  async logout(): Promise<LogoutResult> {
    const deletedSession = await this.loginVerifier.clearSavedSession();

    return {
      sessionFile: this.config.sessionFile,
      deletedSession
    };
  }

  async forget(): Promise<ForgetResult> {
    const logoutResult = await this.logout();
    const storedLogin = await this.storedCredentialService.forgetStoredLogin();

    return {
      ...logoutResult,
      ...storedLogin
    };
  }

  getCredentialTarget(userId: string): string {
    return this.storedCredentialService.getCredentialTarget(userId);
  }
}
