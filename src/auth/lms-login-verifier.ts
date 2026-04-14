import type { LmsRuntimeConfig } from "../lms/config.js";
import type { LoginSnapshotResult } from "../lms/types.js";
import { MjuLmsSsoClient } from "../lms/sso-client.js";

export class LmsLoginVerifier {
  private readonly clientFactory: () => MjuLmsSsoClient;

  constructor(
    _config: LmsRuntimeConfig,
    clientFactory?: () => MjuLmsSsoClient
  ) {
    this.clientFactory = clientFactory ?? (() => new MjuLmsSsoClient(_config));
  }

  async authenticateAndSnapshot(
    userId: string,
    password: string
  ): Promise<LoginSnapshotResult> {
    return this.clientFactory().authenticateAndSnapshot(userId, password, {
      preferSavedSession: false
    });
  }

  async clearSavedSession(): Promise<boolean> {
    return this.clientFactory().clearSavedSession();
  }
}
