import { load, type CheerioAPI } from "cheerio";

import {
  STUDENT_NOTICE_LIST_URL,
  STUDENT_NOTICE_VIEW_URL
} from "./constants.js";
import {
  extractAttachmentRequestParams,
  fetchAttachments
} from "./attachments.js";
import { enterStudentClassroom } from "./classroom.js";
import { MjuLmsSsoClient } from "./sso-client.js";
import type {
  NoticeDetailResult,
  NoticeListResult,
  NoticeSummary
} from "./types.js";

const DEFAULT_NOTICE_PAGE_SIZE = 8;

export interface ListNoticesOptions {
  userId: string;
  password: string;
  kjkey: string;
  page?: number;
  pageSize?: number;
  search?: string;
}

export interface GetNoticeOptions {
  userId: string;
  password: string;
  kjkey: string;
  articleId: number;
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

function toPageStart(page: number, pageSize: number): number {
  return (page - 1) * pageSize + 1;
}

function parseNoticeTotal(html: string): number {
  const match = html.match(/total_num"\)\.text\('(\d+)'\)/);
  const totalText = match?.[1];
  return totalText ? Number.parseInt(totalText, 10) : 0;
}

function parseNoticeId(
  dataNum: string | undefined,
  onclickValue: string | undefined
): number | undefined {
  const directId = parsePositiveInt(dataNum);
  if (directId) {
    return directId;
  }

  const matched = onclickValue?.match(/noticeViewPop\((\d+)\)/);
  return parsePositiveInt(matched?.[1]);
}

function parseViewCount(
  $: CheerioAPI,
  item: ReturnType<CheerioAPI>
): number | undefined {
  let viewCount: number | undefined;

  item.find(".board_list_info").each((_, element) => {
    const block = $(element);
    if (normalizeText(block.find(".board_list_title").first().text()) !== "조회") {
      return;
    }

    viewCount = parsePositiveInt(
      normalizeText(block.find(".board_list_text").first().text())
    );
    return false;
  });

  return viewCount;
}

export function parseNoticeListHtml(html: string): {
  total: number;
  notices: NoticeSummary[];
} {
  const $ = load(html);
  const notices: NoticeSummary[] = [];

  $(".board_list_wrap").each((_, element) => {
    const item = $(element);
    const articleId = parseNoticeId(
      item.attr("data-num"),
      item.attr("onclick")
    );
    const title = normalizeText(item.find(".board_title .font_subtitle1").first().text());
    const postedAt = normalizeText(item.find(".reg_info").first().text()) || undefined;
    const viewCount = parseViewCount($, item);

    if (!articleId || !title) {
      return;
    }

    notices.push({
      articleId,
      title,
      previewText: normalizeText(item.find(".board_text").first().text()),
      isUnread: item.find(".is_read").first().hasClass("unread"),
      isExpired: item.hasClass("expired"),
      ...(postedAt ? { postedAt } : {}),
      ...(viewCount !== undefined ? { viewCount } : {})
    });
  });

  return {
    total: parseNoticeTotal(html),
    notices
  };
}

function parseDetailMeta(html: string): Map<string, string> {
  const $ = load(html);
  const meta = new Map<string, string>();

  $("table.bbsview tr").each((_, element) => {
    const row = $(element);
    const label = normalizeText(row.find("th").first().text());
    const value = normalizeText(row.find("td").first().text());

    if (label && value) {
      meta.set(label, value);
    }
  });

  return meta;
}

function parseNoticeBodyHtml(html: string): { title: string; bodyHtml: string; bodyText: string } {
  const $ = load(html);
  const title = normalizeText($(".view_title").first().text());
  const bodyNode = $("td.textviewer").first();
  const bodyHtml = bodyNode.html()?.trim() ?? "";
  const bodyText = normalizeText(bodyNode.text());

  return {
    title,
    bodyHtml,
    bodyText
  };
}

export function parseNoticeDetailHtml(html: string): {
  title: string;
  bodyHtml: string;
  bodyText: string;
  author?: string;
  postedAt?: string;
  expireAt?: string;
  viewCount?: number;
} {
  const meta = parseDetailMeta(html);
  const body = parseNoticeBodyHtml(html);
  const author = meta.get("작성자");
  const postedAt = meta.get("게시일");
  const expireAt = meta.get("공지 만료일");
  const viewCount = parsePositiveInt(meta.get("조회수"));

  return {
    title: body.title,
    bodyHtml: body.bodyHtml,
    bodyText: body.bodyText,
    ...(author ? { author } : {}),
    ...(postedAt ? { postedAt } : {}),
    ...(expireAt ? { expireAt } : {}),
    ...(viewCount !== undefined ? { viewCount } : {})
  };
}

export async function listCourseNotices(
  client: MjuLmsSsoClient,
  options: ListNoticesOptions
): Promise<NoticeListResult> {
  const page = options.page && options.page > 0 ? options.page : 1;
  const pageSize =
    options.pageSize && options.pageSize > 0
      ? options.pageSize
      : DEFAULT_NOTICE_PAGE_SIZE;
  const start = toPageStart(page, pageSize);
  const search = options.search?.trim() ?? "";

  await client.ensureAuthenticated(options.userId, options.password);
  const classroom = await enterStudentClassroom(client, options.kjkey);
  const response = await client.postForm(STUDENT_NOTICE_LIST_URL, {
    start: String(start),
    display: String(pageSize),
    SCH_VALUE: search,
    ODR: "",
    encoding: "utf-8"
  });

  const parsed = parseNoticeListHtml(response.text);
  const courseTitle = classroom.courseTitle;
  return {
    kjkey: options.kjkey,
    search,
    page,
    pageSize,
    start,
    total: parsed.total,
    totalPages: parsed.total === 0 ? 0 : Math.ceil(parsed.total / pageSize),
    notices: parsed.notices,
    ...(courseTitle ? { courseTitle } : {})
  };
}

export async function getCourseNotice(
  client: MjuLmsSsoClient,
  options: GetNoticeOptions
): Promise<NoticeDetailResult> {
  await client.ensureAuthenticated(options.userId, options.password);
  const classroom = await enterStudentClassroom(client, options.kjkey);
  const response = await client.postForm(STUDENT_NOTICE_VIEW_URL, {
    ARTL_NUM: String(options.articleId),
    encoding: "utf-8"
  });

  const parsed = parseNoticeDetailHtml(response.text);
  if (!parsed.title) {
    throw new Error(`공지 상세를 읽지 못했습니다. articleId=${options.articleId}`);
  }

  const attachmentRequest = extractAttachmentRequestParams(response.text);
  const attachments = attachmentRequest
    ? await fetchAttachments(client, attachmentRequest)
    : [];
  const courseTitle = classroom.courseTitle;
  const contentSeq = attachmentRequest?.contentSeq;

  return {
    kjkey: options.kjkey,
    articleId: options.articleId,
    title: parsed.title,
    bodyHtml: parsed.bodyHtml,
    bodyText: parsed.bodyText,
    attachments,
    ...(courseTitle ? { courseTitle } : {}),
    ...(parsed.author ? { author: parsed.author } : {}),
    ...(parsed.postedAt ? { postedAt: parsed.postedAt } : {}),
    ...(parsed.expireAt ? { expireAt: parsed.expireAt } : {}),
    ...(parsed.viewCount !== undefined ? { viewCount: parsed.viewCount } : {}),
    ...(contentSeq ? { contentSeq } : {})
  };
}
