import fs from "node:fs/promises";
import path from "node:path";

import { load } from "cheerio";
import got, { type Response } from "got";
import { CookieJar } from "tough-cookie";

import type { DecodedResponse, SsoForm } from "../lms/types.js";
import { decodeHtml } from "../lms/encoding.js";
import { SessionStore } from "../lms/session-store.js";
import {
  encryptPasswordForSso,
  encryptSessionKeyForSso,
  genSsoKeyMaterial
} from "../lms/sso-crypto.js";
import { looksLoggedIn } from "./auth-heuristics.js";
import {
  MSI_BASE,
  MSI_LOGIN_SECURITY_URL,
  MSI_MAIN_URL,
  MSI_SECURITY_CHECK_URL
} from "./constants.js";
import type { MsiMenuItem } from "./types.js";
import type { MsiRuntimeConfig } from "./config.js";

interface RequestOptions {
  headers?: Record<string, string>;
  followRedirect?: boolean;
}

function toDecodedResponse(response: Response<Buffer>): DecodedResponse {
  return {
    statusCode: response.statusCode,
    url: response.url,
    text: decodeHtml(response.rawBody, response.headers),
    rawBody: response.rawBody,
    headers: response.headers
  };
}

function resolveRedirectUrl(
  response: Pick<DecodedResponse, "url" | "headers">,
  baseUrl: string
): string | undefined {
  const locationHeader = response.headers.location;
  const location =
    typeof locationHeader === "string" ? locationHeader : locationHeader?.[0];

  return location ? new URL(location, baseUrl).toString() : undefined;
}

function resolveLoginContinuationUrl(
  response: Pick<DecodedResponse, "url" | "headers">,
  baseUrl: string
): string | undefined {
  if (response.url.includes("code=")) {
    return response.url;
  }

  return resolveRedirectUrl(response, baseUrl);
}

export class MjuMsiClient {
  private cookieJar = new CookieJar();
  private http;
  private readonly sessionStore: SessionStore;

  constructor(private readonly config: MsiRuntimeConfig) {
    this.sessionStore = new SessionStore(config.sessionFile);
    this.http = this.buildHttpClient();
  }

  private buildHttpClient() {
    return got.extend({
      cookieJar: this.cookieJar,
      followRedirect: true,
      throwHttpErrors: false,
      retry: { limit: 0 },
      headers: {
        "user-agent": this.config.userAgent
      },
      responseType: "buffer"
    });
  }

  private resetHttpState(): void {
    this.cookieJar = new CookieJar();
    this.http = this.buildHttpClient();
  }

  async restoreSavedSession(userId: string): Promise<boolean> {
    const restored = await this.sessionStore.load(userId);
    if (!restored) {
      return false;
    }

    this.cookieJar = restored.cookieJar;
    this.http = this.buildHttpClient();
    return true;
  }

  async clearSavedSession(): Promise<boolean> {
    this.resetHttpState();
    return this.sessionStore.remove();
  }

  async getPage(
    url: string | URL,
    options: RequestOptions = {}
  ): Promise<DecodedResponse> {
    const response = await this.http.get(url.toString(), {
      responseType: "buffer",
      ...(options.headers ? { headers: options.headers } : {}),
      ...(options.followRedirect !== undefined
        ? { followRedirect: options.followRedirect }
        : {})
    });
    return toDecodedResponse(response);
  }

  async postForm(
    url: string | URL,
    form: Record<string, string>,
    options: RequestOptions = {}
  ): Promise<DecodedResponse> {
    const response = await this.http.post(url.toString(), {
      responseType: "buffer",
      form,
      ...(options.headers ? { headers: options.headers } : {}),
      ...(options.followRedirect !== undefined
        ? { followRedirect: options.followRedirect }
        : {})
    });
    return toDecodedResponse(response);
  }

  async fetchMainPage(): Promise<DecodedResponse> {
    return this.getPage(MSI_MAIN_URL);
  }

  async saveMainHtml(html: string): Promise<void> {
    await fs.mkdir(path.dirname(this.config.mainHtmlFile), { recursive: true });
    await fs.writeFile(this.config.mainHtmlFile, html, "utf8");
  }

  async saveMenuSnapshot(menuItems: MsiMenuItem[]): Promise<void> {
    await fs.mkdir(path.dirname(this.config.menuSnapshotFile), {
      recursive: true
    });
    await fs.writeFile(
      this.config.menuSnapshotFile,
      JSON.stringify(menuItems, null, 2),
      "utf8"
    );
  }

  private extractSsoForm(response: DecodedResponse): SsoForm {
    const $ = load(response.text);
    const action = $("#signin-form").attr("action")?.replace(/&amp;/g, "&");
    const cRt = $('input[name="c_r_t"]').attr("value");
    const publicKey = $("#public-key").attr("value");

    if (!action || !cRt || !publicKey) {
      throw new Error("MSI SSO 로그인 폼을 파싱하지 못했습니다.");
    }

    return {
      action,
      c_r_t: cRt,
      publicKey
    };
  }

  async login(userId: string, password: string): Promise<DecodedResponse> {
    let response = await this.getPage(MSI_BASE, { followRedirect: true });
    let $ = load(response.text);
    let csrf = $('input[name="_csrf"]').attr("value") ?? "";

    response = await this.postForm(
      MSI_LOGIN_SECURITY_URL,
      {
        code: "",
        _csrf: csrf
      },
      { followRedirect: false }
    );

    const ssoEntryUrl =
      /location\.href\s*=\s*"([^"]+)"/.exec(response.text)?.[1] ??
      resolveRedirectUrl(response, MSI_BASE);
    if (!ssoEntryUrl) {
      throw new Error("MSI 로그인 초기 브리지에서 SSO 이동 URL을 찾지 못했습니다.");
    }

    const ssoPage = await this.getPage(ssoEntryUrl, { followRedirect: true });
    const ssoForm = this.extractSsoForm(ssoPage);
    const { keyStr, key, iv } = genSsoKeyMaterial();
    const encsymka = encryptSessionKeyForSso(
      `${keyStr},${Date.now()}`,
      ssoForm.publicKey
    );
    const pwEnc = encryptPasswordForSso(password.trim(), key, iv);
    const loginUrl = new URL(ssoForm.action, ssoPage.url).toString();

    const ssoLoginResponse = await this.postForm(
      loginUrl,
      {
        user_id: userId,
        pw: "",
        user_id_enc: "",
        pw_enc: pwEnc,
        encsymka,
        c_r_t: ssoForm.c_r_t
      },
      { followRedirect: false }
    );

    const callbackUrl = resolveLoginContinuationUrl(ssoLoginResponse, loginUrl);
    if (!callbackUrl) {
      throw new Error("MSI SSO 로그인 후 callback URL을 찾지 못했습니다.");
    }

    response = await this.getPage(callbackUrl, { followRedirect: true });
    $ = load(response.text);
    const code = $('input[name="code"]').attr("value") ?? "";
    csrf = $('input[name="_csrf"]').attr("value") ?? "";
    if (!code || !csrf) {
      throw new Error("MSI callback 단계에서 code/_csrf 를 찾지 못했습니다.");
    }

    response = await this.postForm(
      MSI_LOGIN_SECURITY_URL,
      {
        code,
        _csrf: csrf
      },
      { followRedirect: false }
    );

    $ = load(response.text);
    const securityCsrf = $('input[name="_csrf"]').attr("value") ?? "";
    const normalizedUserId = $('input[name="user_id"]').attr("value") ?? userId;
    if (!securityCsrf) {
      throw new Error("MSI login_security 후반 단계에서 _csrf 를 찾지 못했습니다.");
    }

    const securityCheckResponse = await this.postForm(
      MSI_SECURITY_CHECK_URL,
      {
        user_id: normalizedUserId,
        _csrf: securityCsrf
      },
      { followRedirect: false }
    );

    const postSecurityUrl =
      resolveRedirectUrl(securityCheckResponse, MSI_BASE) ?? MSI_MAIN_URL;
    const mainResponse = await this.getPage(postSecurityUrl, {
      followRedirect: true
    });

    return mainResponse;
  }

  async ensureAuthenticated(
    userId: string,
    password: string,
    options: { preferSavedSession?: boolean } = {}
  ): Promise<{ mainResponse: DecodedResponse; usedSavedSession: boolean }> {
    if (options.preferSavedSession !== false && (await this.restoreSavedSession(userId))) {
      const mainFromSavedSession = await this.fetchMainPage();
      if (looksLoggedIn(mainFromSavedSession)) {
        return {
          mainResponse: mainFromSavedSession,
          usedSavedSession: true
        };
      }

      await this.clearSavedSession();
    }

    const mainResponse = await this.login(userId, password);
    if (looksLoggedIn(mainResponse)) {
      await this.sessionStore.save(this.cookieJar, userId);
    } else {
      await this.clearSavedSession();
    }

    return {
      mainResponse,
      usedSavedSession: false
    };
  }
}
