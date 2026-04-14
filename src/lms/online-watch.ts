import type { BrowserContext, Frame, Page } from "playwright";

import { CliError } from "../errors.js";
import type { LmsRuntimeConfig } from "./config.js";
import {
  LMS_BASE,
  MAIN_URL,
  STUDENT_CLASSROOM_ENTER_PATH,
  STUDENT_CLASSROOM_RETURN_URI,
  STUDENT_ONLINE_VIEW_URL
} from "./constants.js";
import { getCourseOnlineWeek } from "./online.js";
import { SessionStore } from "./session-store.js";
import { MjuLmsSsoClient } from "./sso-client.js";
import type {
  OnlineLearningItem,
  OnlineWatchEvent,
  OnlineWatchPlayerSnapshot,
  OnlineWatchResult
} from "./types.js";

const PLAYER_FRAME_URL_PART = "/ilos/cls/st/online/online_learning.acl";
const DEFAULT_POLL_INTERVAL_MS = 5_000;
const FRAME_WAIT_TIMEOUT_MS = 120_000;
const NO_PROGRESS_RESUME_MS = 30_000;
const NO_PROGRESS_FAIL_MS = 180_000;
const PLAYBACK_RATE = 1;

interface SerializedSessionCookie {
  key: string;
  value: string;
  domain?: string;
  path?: string;
  httpOnly?: boolean;
  secure?: boolean;
  expires?: string;
}

interface ResolvedOnlineItem {
  item: OnlineLearningItem;
  itemIndex: number;
  resolvedBy: OnlineWatchResult["resolvedBy"];
}

type ContextCookie = Parameters<BrowserContext["addCookies"]>[0][number];

export interface WatchCourseOnlineItemOptions {
  userId: string;
  password: string;
  kjkey: string;
  lectureWeeks: number;
  linkSeq?: number;
  itemIndex?: number;
  headless?: boolean;
  pollIntervalMs?: number;
}

interface WatchEventLog {
  events: OnlineWatchEvent[];
  log: (
    event: OnlineWatchEvent["event"],
    extra?: Partial<Omit<OnlineWatchEvent, "ts" | "elapsedSec" | "event">>
  ) => void;
}

async function loadPlaywright() {
  return import("playwright");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createWatchEventLog(startedMs: number): WatchEventLog {
  const events: OnlineWatchEvent[] = [];

  return {
    events,
    log(event, extra = {}) {
      const entry: OnlineWatchEvent = {
        ts: new Date().toISOString(),
        elapsedSec: Math.round((Date.now() - startedMs) / 1000),
        event,
        ...extra
      };
      events.push(entry);
    }
  };
}

async function loadContextCookies(
  sessionFile: string,
  userId: string
): Promise<ContextCookie[]> {
  const session = await new SessionStore(sessionFile).load(userId);
  if (!session) {
    throw new CliError(
      "저장된 LMS 세션을 찾지 못했습니다. `mju auth login --id YOUR_ID --password YOUR_PASSWORD` 로 먼저 로그인해주세요."
    );
  }

  const now = Date.now();
  const serialized = session.cookieJar.serializeSync();
  if (!serialized) {
    throw new CliError("저장된 LMS 세션 쿠키를 읽지 못했습니다.");
  }
  const cookies = (serialized.cookies ?? []) as SerializedSessionCookie[];

  return cookies
    .filter((cookie) => {
      if (!cookie.expires) {
        return true;
      }

      const expiresMs = new Date(cookie.expires).getTime();
      return Number.isNaN(expiresMs) || expiresMs > now;
    })
    .map((cookie) => {
      if (!cookie.domain) {
        throw new CliError("저장된 LMS 세션 쿠키에서 domain 정보를 찾지 못했습니다.");
      }

      const result: ContextCookie = {
        name: cookie.key,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path || "/",
        httpOnly: Boolean(cookie.httpOnly),
        secure: Boolean(cookie.secure)
      };

      if (cookie.expires) {
        const expiresMs = new Date(cookie.expires).getTime();
        if (!Number.isNaN(expiresMs)) {
          result.expires = Math.floor(expiresMs / 1000);
        }
      }

      return result;
    });
}

function describeSelectableItems(items: OnlineLearningItem[]): string {
  return items
    .map((item, index) => `${index}: linkSeq ${item.linkSeq} - ${item.title}`)
    .join("; ");
}

function resolveOnlineItem(
  items: OnlineLearningItem[],
  options: Pick<WatchCourseOnlineItemOptions, "linkSeq" | "itemIndex">
): ResolvedOnlineItem {
  if (items.length === 0) {
    throw new CliError("선택한 온라인 주차에 재생 가능한 영상 항목이 없습니다.");
  }

  if (options.linkSeq !== undefined && options.itemIndex !== undefined) {
    throw new CliError("link-seq 와 item-index 는 동시에 사용할 수 없습니다.");
  }

  if (options.linkSeq !== undefined) {
    const itemIndex = items.findIndex((item) => item.linkSeq === options.linkSeq);
    if (itemIndex === -1) {
      throw new CliError(
        `link-seq ${options.linkSeq} 항목을 찾지 못했습니다. 가능한 항목: ${describeSelectableItems(items)}`
      );
    }

    return {
      item: items[itemIndex],
      itemIndex,
      resolvedBy: "linkSeq"
    };
  }

  if (options.itemIndex !== undefined) {
    if (options.itemIndex < 0 || options.itemIndex >= items.length) {
      throw new CliError(
        `item-index 범위를 벗어났습니다. 가능한 항목: ${describeSelectableItems(items)}`
      );
    }

    return {
      item: items[options.itemIndex],
      itemIndex: options.itemIndex,
      resolvedBy: "itemIndex"
    };
  }

  if (items.length === 1) {
    return {
      item: items[0],
      itemIndex: 0,
      resolvedBy: "single-item"
    };
  }

  throw new CliError(
    `이 주차에는 영상이 여러 개라서 --link-seq 또는 --item-index 가 필요합니다. 가능한 항목: ${describeSelectableItems(items)}`
  );
}

async function enterClassroomInPage(page: Page, kjkey: string): Promise<void> {
  await page.evaluate(
    async ({
      enterPath,
      kjkeyValue,
      lmsBase,
      returnUri
    }: {
      enterPath: string;
      kjkeyValue: string;
      lmsBase: string;
      returnUri: string;
    }) => {
      const body = new URLSearchParams({
        KJKEY: kjkeyValue,
        returnURI: returnUri
      });
      const response = await fetch(enterPath, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8"
        },
        body: body.toString(),
        credentials: "include"
      });
      const text = await response.text();
      let parsed: { isError?: boolean; message?: string; returnURL?: string };

      try {
        parsed = JSON.parse(text.trim()) as { isError?: boolean; message?: string; returnURL?: string };
      } catch (error) {
        throw new Error(
          `강의실 진입 응답을 해석하지 못했습니다: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      if (parsed.isError) {
        throw new Error(parsed.message || "강의실 진입에 실패했습니다.");
      }

      location.href = new URL(parsed.returnURL || returnUri, lmsBase).toString();
    },
    {
      enterPath: STUDENT_CLASSROOM_ENTER_PATH,
      kjkeyValue: kjkey,
      lmsBase: LMS_BASE,
      returnUri: STUDENT_CLASSROOM_RETURN_URI
    }
  );
}

async function launchOnlineItem(page: Page, linkSeq: number): Promise<void> {
  const launched = await page.evaluate((resolvedLinkSeq) => {
    const globalWindow = window as Window & {
      learningGo?: (linkSeqValue: string) => void;
    };

    if (typeof globalWindow.learningGo === "function") {
      globalWindow.learningGo(String(resolvedLinkSeq));
      return true;
    }

    const target = Array.from(
      document.querySelectorAll<HTMLButtonElement>("button.online_contents_wrap")
    ).find((button) => button.getAttribute("onclick")?.includes(`'${resolvedLinkSeq}'`));

    if (!target) {
      return false;
    }

    target.click();
    return true;
  }, linkSeq);

  if (!launched) {
    throw new CliError("온라인 영상 실행 버튼을 찾지 못했습니다.");
  }
}

async function findPlayerFrame(page: Page): Promise<Frame> {
  const startedMs = Date.now();

  while (Date.now() - startedMs < FRAME_WAIT_TIMEOUT_MS) {
    const frame = page
      .frames()
      .find((candidate) => candidate.url().includes(PLAYER_FRAME_URL_PART));

    if (frame) {
      return frame;
    }

    await delay(1_000);
  }

  throw new CliError("online_learning.acl 플레이어 iframe 을 찾지 못했습니다.");
}

async function waitForPlayer(frame: Frame): Promise<void> {
  await frame.waitForFunction(() => {
    const globalWindow = window as Window & {
      getPlayer?: () => unknown;
    };

    return typeof globalWindow.getPlayer === "function" && Boolean(globalWindow.getPlayer());
  });
}

async function preparePlayer(frame: Frame): Promise<void> {
  await frame.evaluate(async (playbackRate) => {
    const globalWindow = window as Window & {
      getPlayer?: () => {
        ready?: (callback: () => void) => void;
        play?: () => Promise<void> | void;
        playbackRate?: (value: number) => void;
      };
    };
    const player = globalWindow.getPlayer?.();

    if (!player) {
      throw new Error("플레이어 인스턴스를 찾지 못했습니다.");
    }

    if (typeof player.ready === "function") {
      await new Promise<void>((resolve) => player.ready?.(resolve));
    }

    const video = document.querySelector("video") as HTMLVideoElement | null;
    if (video) {
      video.muted = true;
      video.playbackRate = playbackRate;
    }

    if (typeof player.playbackRate === "function") {
      player.playbackRate(playbackRate);
    }

    if (typeof player.play === "function") {
      await player.play();
    }
  }, PLAYBACK_RATE);
}

async function resumePlayer(frame: Frame): Promise<void> {
  await frame.evaluate(async (playbackRate) => {
    const globalWindow = window as Window & {
      getPlayer?: () => {
        play?: () => Promise<void> | void;
        playbackRate?: (value: number) => void;
      };
    };
    const player = globalWindow.getPlayer?.();
    const video = document.querySelector("video") as HTMLVideoElement | null;

    if (video) {
      video.muted = true;
      video.playbackRate = playbackRate;
    }

    if (player && typeof player.playbackRate === "function") {
      player.playbackRate(playbackRate);
    }

    if (player && typeof player.play === "function") {
      await player.play();
      return;
    }

    await video?.play();
  }, PLAYBACK_RATE);
}

async function getPlayerSnapshot(frame: Frame): Promise<OnlineWatchPlayerSnapshot> {
  return frame.evaluate(() => {
    const globalWindow = window as Window & {
      getPlayer?: () => {
        currentTime?: () => number;
        duration?: () => number;
        paused?: () => boolean;
        ended?: () => boolean;
      };
    };
    const player = globalWindow.getPlayer?.();
    const video = document.querySelector("video") as HTMLVideoElement | null;

    return {
      currentTime:
        player && typeof player.currentTime === "function" ? player.currentTime() : null,
      duration: player && typeof player.duration === "function" ? player.duration() : null,
      paused: player && typeof player.paused === "function" ? player.paused() : null,
      ended: player && typeof player.ended === "function" ? player.ended() : null,
      playbackRate: video?.playbackRate ?? null,
      readyState: video?.readyState ?? null
    };
  });
}

async function exitLearning(page: Page, frame: Frame): Promise<boolean> {
  const exitFromPage = await page.evaluate(() => {
    const globalWindow = window as Window & {
      exitLearning?: (isForce: boolean) => void;
    };

    if (typeof globalWindow.exitLearning !== "function") {
      return false;
    }

    globalWindow.exitLearning(false);
    return true;
  });

  if (exitFromPage) {
    return true;
  }

  return frame
    .evaluate(() => {
      const globalWindow = window as Window & {
        exitLearning?: (isForce: boolean) => void;
      };

      if (typeof globalWindow.exitLearning !== "function") {
        return false;
      }

      globalWindow.exitLearning(false);
      return true;
    })
    .catch(() => false);
}

async function createBrowserContext(
  config: LmsRuntimeConfig,
  headless: boolean,
  userId: string
): Promise<{
  browser: Awaited<ReturnType<Awaited<ReturnType<typeof loadPlaywright>>["chromium"]["launch"]>>;
  context: BrowserContext;
}> {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    userAgent: config.userAgent,
    viewport: { width: 1440, height: 900 }
  });
  await context.addCookies(await loadContextCookies(config.sessionFile, userId));

  return { browser, context };
}

function findItemByLinkSeq(
  items: OnlineLearningItem[],
  linkSeq: number
): OnlineLearningItem | undefined {
  return items.find((item) => item.linkSeq === linkSeq);
}

export async function watchCourseOnlineItem(
  client: MjuLmsSsoClient,
  config: LmsRuntimeConfig,
  options: WatchCourseOnlineItemOptions
): Promise<OnlineWatchResult> {
  const headless = options.headless ?? true;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const detail = await getCourseOnlineWeek(client, {
    userId: options.userId,
    password: options.password,
    kjkey: options.kjkey,
    lectureWeeks: options.lectureWeeks
  });
  const resolvedItem = resolveOnlineItem(detail.items, options);
  const eventLog = createWatchEventLog(startedMs);
  const { browser, context } = await createBrowserContext(config, headless, options.userId);
  const page = await context.newPage();

  try {
    eventLog.log("open-main");
    await page.goto(MAIN_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60_000
    });

    eventLog.log("enter-classroom");
    await enterClassroomInPage(page, options.kjkey);
    await page.waitForLoadState("domcontentloaded", { timeout: 60_000 });

    eventLog.log("open-online-view");
    await page.goto(`${STUDENT_ONLINE_VIEW_URL}?LECTURE_WEEKS=${options.lectureWeeks}`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000
    });

    eventLog.log("launch-item");
    await launchOnlineItem(page, resolvedItem.item.linkSeq);

    const frame = await findPlayerFrame(page);
    await waitForPlayer(frame);

    eventLog.log("prepare-player", { frameUrl: frame.url() });
    await preparePlayer(frame);

    let lastLoggedMinute = -1;
    let lastObservedTime = -1;
    let lastAdvanceAt = Date.now();
    let lastResumeAt = 0;

    while (true) {
      const snapshot = await getPlayerSnapshot(frame);
      const currentTime = snapshot.currentTime ?? 0;
      const duration = snapshot.duration ?? 0;

      if (currentTime > lastObservedTime + 0.5) {
        lastObservedTime = currentTime;
        lastAdvanceAt = Date.now();
      }

      const currentMinute = Math.floor(currentTime / 60);
      if (currentMinute !== lastLoggedMinute) {
        lastLoggedMinute = currentMinute;
        eventLog.log("progress", snapshot);
      }

      if (snapshot.ended || (duration > 0 && currentTime >= duration - 2)) {
        eventLog.log("ended", snapshot);
        break;
      }

      const stalledMs = Date.now() - lastAdvanceAt;
      if ((snapshot.paused || stalledMs >= NO_PROGRESS_RESUME_MS) && Date.now() - lastResumeAt >= 15_000) {
        lastResumeAt = Date.now();
        eventLog.log(
          snapshot.paused ? "resume" : "resume-after-stall",
          {
            ...snapshot,
            ...(stalledMs >= NO_PROGRESS_RESUME_MS
              ? { stalledSec: Math.round(stalledMs / 1000) }
              : {})
          }
        );
        await resumePlayer(frame);
      }

      if (Date.now() - lastAdvanceAt >= NO_PROGRESS_FAIL_MS) {
        throw new CliError("재생 시간이 3분 이상 진행되지 않아 자동 종료했습니다.");
      }

      await delay(pollIntervalMs);
    }

    const exitCalled = await exitLearning(page, frame);
    eventLog.log("exit-learning");
    await page.waitForTimeout(10_000);

    const finalSnapshot = await getPlayerSnapshot(frame).catch(() => null);
    const refreshed = await getCourseOnlineWeek(client, {
      userId: options.userId,
      password: options.password,
      kjkey: options.kjkey,
      lectureWeeks: options.lectureWeeks
    });

    eventLog.log("done");

    return {
      kjkey: options.kjkey,
      lectureWeeks: options.lectureWeeks,
      selectedItem: resolvedItem.item,
      resolvedItemIndex: resolvedItem.itemIndex,
      resolvedBy: resolvedItem.resolvedBy,
      headless,
      playbackRate: PLAYBACK_RATE,
      watchStartedAt: startedAt,
      watchFinishedAt: new Date().toISOString(),
      elapsedSec: Math.round((Date.now() - startedMs) / 1000),
      finalPageUrl: page.url(),
      frameUrl: frame.url(),
      exitCalled,
      finalSnapshot,
      refreshedItem: findItemByLinkSeq(refreshed.items, resolvedItem.item.linkSeq),
      events: eventLog.events,
      ...(detail.courseTitle ? { courseTitle: detail.courseTitle } : {}),
      ...(detail.title ? { title: detail.title } : {})
    };
  } finally {
    await context.close();
    await browser.close();
  }
}
