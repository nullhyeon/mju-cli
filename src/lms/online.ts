import { load, type CheerioAPI } from "cheerio";

import { parseActivityListItems } from "./activity-list.js";
import {
  LMS_BASE,
  STUDENT_ONLINE_LEARNING_FORM_URL,
  STUDENT_ONLINE_VIEW_URL
} from "./constants.js";
import { enterStudentClassroom } from "./classroom.js";
import { MjuLmsSsoClient } from "./sso-client.js";
import type {
  OnlineLearningItem,
  OnlineLearningLaunchForm,
  OnlineWeekListResult,
  OnlineWeekDetailResult,
  OnlineWeekSummary
} from "./types.js";

export interface ListOnlineWeeksOptions {
  userId: string;
  password: string;
  kjkey: string;
}

export interface GetOnlineWeekOptions {
  userId: string;
  password: string;
  kjkey: string;
  lectureWeeks: number;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return undefined;
  }

  return parsed;
}

function parseDecimal(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed)) {
    return undefined;
  }

  return parsed;
}

function parsePercentFromStyle(styleValue: string | undefined): number | undefined {
  const match = styleValue?.match(/width:\s*([0-9.]+)%/i);
  return parseDecimal(match?.[1]);
}

function parseLinkSeq(onclickValue: string | undefined): number | undefined {
  const matched = onclickValue?.match(/learningGo\('(\d+)'/);
  return parsePositiveInt(matched?.[1]);
}

function parseBackgroundImageUrl(styleValue: string | undefined): string | undefined {
  const match = styleValue?.match(/background-image:\s*url\(([^)]+)\)/i);
  const rawUrl = match?.[1]?.replace(/^['"]|['"]$/g, "");
  if (!rawUrl) {
    return undefined;
  }

  return new URL(rawUrl, LMS_BASE).toString();
}

function parseOnlineInfoMap(html: string): Map<string, string> {
  const $ = load(html);
  const meta = new Map<string, string>();

  $(".online_info_left .online_info").each((_, element) => {
    const item = $(element);
    const title = normalizeText(item.find(".online_info_title").first().text());
    const text = normalizeText(item.find(".online_info_text").first().text());

    if (title && text) {
      meta.set(title, text);
    }
  });

  return meta;
}

function parseWarningMessages(html: string): string[] {
  const $ = load(html);
  return $(".zoom_caution_list li")
    .map((_, element) => normalizeText($(element).text()))
    .get()
    .filter(Boolean);
}

function parseLaunchForm(html: string): OnlineLearningLaunchForm {
  const $ = load(html);
  const form = $('form[name="learningForm"]').first();
  const lectureWeeks = parsePositiveInt(form.find('input[name="lecture_weeks"]').attr("value"));
  const kjkey = form.find('input[name="_KJKEY"]').attr("value")?.trim();
  const kjLectType = form.find('input[name="kj_lect_type"]').attr("value")?.trim();
  const action = form.attr("action")?.trim();

  if (!lectureWeeks || !kjkey) {
    throw new Error("온라인 학습 진입 폼을 읽지 못했습니다.");
  }

  return {
    action: action
      ? new URL(action, LMS_BASE).toString()
      : STUDENT_ONLINE_LEARNING_FORM_URL,
    lectureWeeks,
    kjkey,
    ...(kjLectType ? { kjLectType } : {})
  };
}

function parseBadgeValue(
  $: CheerioAPI,
  item: ReturnType<CheerioAPI>,
  label: string
): string | undefined {
  const badge = item
    .find(".online_contents_badge")
    .filter((_, element) => {
      const spans = $(element).find("span");
      const title = normalizeText(spans.eq(0).text());
      return title === label;
    })
    .first();

  if (badge.length === 0) {
    return undefined;
  }

  const spans = badge.find("span");
  return normalizeText(spans.eq(1).text()) || undefined;
}

function parseOnlineItems(html: string): OnlineLearningItem[] {
  const $ = load(html);
  const items: OnlineLearningItem[] = [];

  $(".online_contents_list").each((_, element) => {
    const item = $(element);
    const button = item.find("button.online_contents_wrap").first();
    const linkSeq = parseLinkSeq(button.attr("onclick"));
    const title = normalizeText(item.find(".video_title").first().text());

    if (!linkSeq || !title) {
      return;
    }

    const qnaCount = parsePositiveInt(
      normalizeText(item.find(".online_info_text.qna").siblings(".online_info_cnt").first().text())
    );
    const stampCount = parsePositiveInt(
      normalizeText(item.find(".online_info_text.stamp").siblings(".online_info_cnt").first().text())
    );
    const progressPercent = parseDecimal(
      normalizeText(item.find(".percent").first().text()).replace(/%/g, "")
    );
    const inPeriodProgressPercent = parsePercentFromStyle(
      item.find(".attend_progress_bar").not(".ex").first().attr("style")
    );
    const outOfPeriodProgressPercent = parsePercentFromStyle(
      item.find(".attend_progress_bar.ex").first().attr("style")
    );
    const thumbnailUrl = parseBackgroundImageUrl(
      item.find(".video_thumbnail").first().attr("style")
    );
    const learningTime = parseBadgeValue($, item, "학습시간");
    const attendanceTime = parseBadgeValue($, item, "출석인정");

    items.push({
      linkSeq,
      title,
      ...(progressPercent !== undefined ? { progressPercent } : {}),
      ...(inPeriodProgressPercent !== undefined
        ? { inPeriodProgressPercent }
        : {}),
      ...(outOfPeriodProgressPercent !== undefined
        ? { outOfPeriodProgressPercent }
        : {}),
      ...(learningTime ? { learningTime } : {}),
      ...(attendanceTime ? { attendanceTime } : {}),
      ...(qnaCount !== undefined ? { qnaCount } : {}),
      ...(stampCount !== undefined ? { stampCount } : {}),
      ...(thumbnailUrl ? { thumbnailUrl } : {})
    });
  });

  return items;
}

export function parseOnlineWeekListHtml(html: string): OnlineWeekSummary[] {
  return parseActivityListItems(html)
    .filter((item) => item.menuId === "lecture_weeks")
    .map((item) => ({
      lectureWeeks: item.activityId,
      title: item.title,
      ...(item.week !== undefined ? { week: item.week } : {}),
      ...(item.weekLabel ? { weekLabel: item.weekLabel } : {}),
      ...(item.statusLabel ? { statusLabel: item.statusLabel } : {}),
      ...(item.statusText ? { statusText: item.statusText } : {})
    }));
}

export async function listCourseOnlineWeeks(
  client: MjuLmsSsoClient,
  options: ListOnlineWeeksOptions
): Promise<OnlineWeekListResult> {
  await client.ensureAuthenticated(options.userId, options.password);
  const classroom = await enterStudentClassroom(client, options.kjkey);
  const courseTitle = classroom.courseTitle;

  return {
    kjkey: options.kjkey,
    weeks: parseOnlineWeekListHtml(classroom.mainHtml),
    ...(courseTitle ? { courseTitle } : {})
  };
}

export async function getCourseOnlineWeek(
  client: MjuLmsSsoClient,
  options: GetOnlineWeekOptions
): Promise<OnlineWeekDetailResult> {
  await client.ensureAuthenticated(options.userId, options.password);
  const classroom = await enterStudentClassroom(client, options.kjkey);
  const summary = parseOnlineWeekListHtml(classroom.mainHtml).find(
    (item) => item.lectureWeeks === options.lectureWeeks
  );
  const response = await client.getPage(
    `${STUDENT_ONLINE_VIEW_URL}?LECTURE_WEEKS=${options.lectureWeeks}`
  );
  const meta = parseOnlineInfoMap(response.text);
  const launchForm = parseLaunchForm(response.text);
  const warningMessages = parseWarningMessages(response.text);
  const items = parseOnlineItems(response.text);
  const courseTitle = classroom.courseTitle;
  const attendanceLabel = meta.get("출석부 반영일");
  const studyPeriod = meta.get("학습인정기간");

  return {
    kjkey: options.kjkey,
    lectureWeeks: options.lectureWeeks,
    warningMessages,
    launchForm,
    items,
    ...(courseTitle ? { courseTitle } : {}),
    ...(summary?.title ? { title: summary.title } : {}),
    ...(summary?.week !== undefined ? { week: summary.week } : {}),
    ...(summary?.weekLabel ? { weekLabel: summary.weekLabel } : {}),
    ...(summary?.statusLabel ? { statusLabel: summary.statusLabel } : {}),
    ...(summary?.statusText ? { statusText: summary.statusText } : {}),
    ...(attendanceLabel ? { attendanceLabel } : {}),
    ...(studyPeriod ? { studyPeriod } : {})
  };
}
