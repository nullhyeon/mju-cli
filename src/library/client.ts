import got, { type Response } from "got";

import {
  LIBRARY_API_BASE_URL,
  LIBRARY_AUTH_HEADER,
  LIBRARY_HOMEPAGE_ID
} from "./constants.js";
import type { LibraryRuntimeConfig } from "./config.js";
import { LibrarySessionStore } from "./session-store.js";
import type { LibraryApiEnvelope, LibrarySessionPayload } from "./types.js";

interface JsonRequestOptions {
  headers?: Record<string, string>;
  json?: unknown;
  searchParams?: Record<string, string | number | boolean | undefined>;
  useAuth?: boolean;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatApiError(
  action: string,
  payload: Pick<LibraryApiEnvelope<unknown>, "code" | "message">
): Error {
  const parts = [action];
  if (payload.message) {
    parts.push(payload.message);
  }
  if (payload.code) {
    parts.push(`[${payload.code}]`);
  }
  return new Error(parts.join(" "));
}

export class MjuLibraryClient {
  private readonly http;

  private readonly sessionStore: LibrarySessionStore;

  private accessToken: string | undefined;

  constructor(private readonly config: LibraryRuntimeConfig) {
    this.sessionStore = new LibrarySessionStore(config.sessionFile);
    this.http = got.extend({
      followRedirect: true,
      throwHttpErrors: false,
      retry: { limit: 0 },
      headers: {
        "user-agent": config.userAgent
      }
    });
  }

  private buildHeaders(
    useAuth: boolean,
    headers: Record<string, string> = {}
  ): Record<string, string> {
    return {
      accept: "application/json",
      ...(useAuth && this.accessToken
        ? { [LIBRARY_AUTH_HEADER]: this.accessToken }
        : {}),
      ...headers
    };
  }

  private parseJsonEnvelope<T>(
    response: Response<unknown>,
    url: string
  ): LibraryApiEnvelope<T> {
    if (!isObject(response.body)) {
      throw new Error(`도서관 API JSON 응답을 파싱하지 못했습니다: ${url}`);
    }

    return response.body as LibraryApiEnvelope<T>;
  }

  private async requestJson<T>(
    method: "GET" | "POST" | "DELETE",
    url: string,
    options: JsonRequestOptions = {}
  ): Promise<LibraryApiEnvelope<T>> {
    const response = await this.http(url, {
      method,
      responseType: "json",
      resolveBodyOnly: false,
      headers: this.buildHeaders(options.useAuth !== false, options.headers),
      ...(options.json !== undefined ? { json: options.json } : {}),
      ...(options.searchParams ? { searchParams: options.searchParams } : {})
    });

    return this.parseJsonEnvelope<T>(response, url);
  }

  async restoreSavedSession(): Promise<boolean> {
    const session = await this.sessionStore.load();
    if (!session?.accessToken) {
      return false;
    }

    this.accessToken = session.accessToken;
    return true;
  }

  async clearSavedSession(): Promise<boolean> {
    this.accessToken = undefined;
    return this.sessionStore.remove();
  }

  private async saveSession(accessToken: string): Promise<void> {
    const payload: LibrarySessionPayload = {
      savedAt: new Date().toISOString(),
      accessToken
    };

    this.accessToken = accessToken;
    await this.sessionStore.save(payload);
  }

  async login(userId: string, password: string): Promise<string> {
    const response = await this.requestJson<{ accessToken?: string }>(
      "POST",
      `${LIBRARY_API_BASE_URL}/api/login`,
      {
        useAuth: false,
        headers: {
          "content-type": "application/json"
        },
        json: {
          loginId: userId,
          password,
          isFamilyLogin: false,
          isMobile: false
        }
      }
    );

    const accessToken = response.data?.accessToken;
    if (!response.success || !accessToken) {
      throw formatApiError("도서관 로그인에 실패했습니다.", response);
    }

    await this.saveSession(accessToken);
    return accessToken;
  }

  async fetchMyInfo<T>(): Promise<T | null> {
    const response = await this.requestJson<T>(
      "GET",
      `${LIBRARY_API_BASE_URL}/${LIBRARY_HOMEPAGE_ID}/api/my-info`
    );
    if (!response.success || response.data === undefined) {
      return null;
    }

    return response.data;
  }

  async ensureAuthenticated<T>(
    userId: string,
    password: string,
    options: { preferSavedSession?: boolean } = {}
  ): Promise<{ myInfo: T; usedSavedSession: boolean }> {
    if (options.preferSavedSession !== false && (await this.restoreSavedSession())) {
      const myInfo = await this.fetchMyInfo<T>();
      if (myInfo) {
        return { myInfo, usedSavedSession: true };
      }

      await this.clearSavedSession();
    }

    await this.login(userId, password);
    const myInfo = await this.fetchMyInfo<T>();
    if (!myInfo) {
      await this.clearSavedSession();
      throw new Error("도서관 로그인 후 사용자 정보를 확인하지 못했습니다.");
    }

    return {
      myInfo,
      usedSavedSession: false
    };
  }

  async getApiData<T>(
    path: string,
    options: Omit<JsonRequestOptions, "json"> = {}
  ): Promise<T> {
    const response = await this.requestJson<T>(
      "GET",
      `${LIBRARY_API_BASE_URL}${path}`,
      options
    );
    if (!response.success || response.data === undefined) {
      throw formatApiError("도서관 조회 요청에 실패했습니다.", response);
    }

    return response.data;
  }

  async postApiData<T>(
    path: string,
    body: unknown,
    options: Omit<JsonRequestOptions, "json"> = {}
  ): Promise<T> {
    const response = await this.requestJson<T>(
      "POST",
      `${LIBRARY_API_BASE_URL}${path}`,
      {
        headers: {
          "content-type": "application/json",
          ...(options.headers ?? {})
        },
        ...options,
        json: body
      }
    );
    if (!response.success || response.data === undefined) {
      throw formatApiError("도서관 쓰기 요청에 실패했습니다.", response);
    }

    return response.data;
  }

  async deleteApiData(
    path: string,
    options: Omit<JsonRequestOptions, "json"> = {}
  ): Promise<void> {
    const response = await this.requestJson<unknown>(
      "DELETE",
      `${LIBRARY_API_BASE_URL}${path}`,
      options
    );
    if (!response.success) {
      throw formatApiError("도서관 삭제 요청에 실패했습니다.", response);
    }
  }
}
