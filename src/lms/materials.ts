import { load } from "cheerio";

import {
  STUDENT_OPEN_MATERIAL_LIST_URL,
  STUDENT_OPEN_MATERIAL_VIEW_URL
} from "./constants.js";
import {
  extractAttachmentRequestParams,
  fetchAttachments
} from "./attachments.js";
import { enterStudentClassroom } from "./classroom.js";
import { MjuLmsSsoClient } from "./sso-client.js";
import type {
  ActivityQnaTarget,
  MaterialDetailResult,
  MaterialListResult,
  MaterialSummary
} from "./types.js";

export interface ListMaterialsOptions {
  userId: string;
  password: string;
  kjkey: string;
  search?: string;
}

export interface GetMaterialOptions {
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

export function parseMaterialListHtml(
  html: string
): { total: number; materials: MaterialSummary[] } {
  const $ = load(html);
  const materials: MaterialSummary[] = [];

  $("button.board_list_wrap[data-num]").each((_, element) => {
    const item = $(element);
    const articleId = parsePositiveInt(item.attr("data-num"));
    const title = normalizeText(item.find(".board_title").first().text());

    if (articleId === undefined || !title) {
      return;
    }

    const authorText = normalizeText(item.find(".reg_nm").first().text());
    const metaItems = item.find(".board_title_bottom > div");
    const postedAt = normalizeText(metaItems.eq(1).text()) || undefined;
    const viewCount = parsePositiveInt(
      normalizeText(item.find(".view_cnt").first().text())
    );
    const commentCount = parsePositiveInt(
      normalizeText(item.find(".board_list_info > div").last().text())
    );

    materials.push({
      articleId,
      title,
      ...(authorText ? { author: authorText.replace(/\(\d+\)\s*$/, "").trim() } : {}),
      ...(postedAt ? { postedAt } : {}),
      ...(viewCount !== undefined ? { viewCount } : {}),
      ...(commentCount !== undefined ? { commentCount } : {}),
      isUnread: item.find(".is_read.unread").length > 0
    });
  });

  const total =
    parsePositiveInt(html.match(/total_num"\)\.text\('(\d+)'\)/)?.[1]) ??
    materials.length;

  return {
    total,
    materials
  };
}

function parseMaterialGroupId(classroomHtml: string): string | undefined {
  return classroomHtml.match(
    /\/ilos\/cls\/st\/board\/open_material_list_form\.acl\?ARTL_GRP_ID=(\d+)/
  )?.[1];
}

function parseMaterialDetailMeta(html: string): {
  author?: string;
  postedAt?: string;
  viewCount?: number;
} {
  const $ = load(html);
  const infoItems = $(".question_title_info > div");
  const authorText = normalizeText(infoItems.eq(0).text()) || undefined;
  const postedAt = normalizeText(infoItems.eq(1).text()) || undefined;
  const viewCount = parsePositiveInt(
    normalizeText($(".question_title_info .view_cnt").first().text())
  );

  return {
    ...(authorText ? { author: authorText.replace(/\(\d+\)\s*$/, "").trim() } : {}),
    ...(postedAt ? { postedAt } : {}),
    ...(viewCount !== undefined ? { viewCount } : {})
  };
}

function parseMaterialBody(html: string): {
  title: string;
  bodyHtml: string;
  bodyText: string;
} {
  const $ = load(html);
  const title =
    normalizeText($(".question_title").first().text()) ||
    normalizeText($(".dialog_header_title").first().text());
  const bodyNode = $(".question_body").first();
  const bodyHtml =
    bodyNode
      .clone()
      .find(".attach_container")
      .remove()
      .end()
      .html()
      ?.trim() ?? "";
  const bodyText = normalizeText(
    bodyNode
      .clone()
      .find(".attach_container")
      .remove()
      .end()
      .text()
  );

  return {
    title,
    bodyHtml,
    bodyText
  };
}

function extractQnaTarget(html: string): ActivityQnaTarget | undefined {
  const match = html.match(
    /T_MENU_ID\s*:\s*"([^"]+)"[\s\S]*?T_ARTL_NUM\s*:\s*"([^"]+)"[\s\S]*?T_SUB_ARTL_NUM\s*:\s*"([^"]*)"/
  );
  const menuId = match?.[1]?.trim();
  const articleId = parsePositiveInt(match?.[2]);
  const subArticleId = match?.[3]?.trim();

  if (!menuId || articleId === undefined) {
    return undefined;
  }

  return {
    menuId,
    articleId,
    ...(subArticleId ? { subArticleId } : {})
  };
}

export async function listCourseMaterials(
  client: MjuLmsSsoClient,
  options: ListMaterialsOptions
): Promise<MaterialListResult> {
  await client.ensureAuthenticated(options.userId, options.password);
  const classroom = await enterStudentClassroom(client, options.kjkey);
  const materialGroupId = parseMaterialGroupId(classroom.mainHtml);
  if (!materialGroupId) {
    throw new Error("자료 게시판 식별자를 강의실에서 찾지 못했습니다.");
  }

  const search = options.search?.trim() ?? "";
  const response = await client.postForm(STUDENT_OPEN_MATERIAL_LIST_URL, {
    start: "1",
    display: "100",
    ARTL_GRP_ID: materialGroupId,
    SCH_VALUE: search,
    ODR: "",
    encoding: "utf-8"
  });

  const parsed = parseMaterialListHtml(response.text);
  const courseTitle = classroom.courseTitle;

  return {
    kjkey: options.kjkey,
    materials: parsed.materials,
    ...(courseTitle ? { courseTitle } : {}),
    ...(search ? { search } : {}),
    total: parsed.total
  };
}

export async function getCourseMaterial(
  client: MjuLmsSsoClient,
  options: GetMaterialOptions
): Promise<MaterialDetailResult> {
  await client.ensureAuthenticated(options.userId, options.password);
  const classroom = await enterStudentClassroom(client, options.kjkey);
  const materialGroupId = parseMaterialGroupId(classroom.mainHtml);
  if (!materialGroupId) {
    throw new Error("자료 게시판 식별자를 강의실에서 찾지 못했습니다.");
  }

  const response = await client.postForm(STUDENT_OPEN_MATERIAL_VIEW_URL, {
    ARTL_NUM: String(options.articleId),
    ARTL_GRP_ID: materialGroupId,
    encoding: "utf-8"
  });

  const meta = parseMaterialDetailMeta(response.text);
  const body = parseMaterialBody(response.text);
  if (!body.title) {
    throw new Error(`자료 상세를 읽지 못했습니다. articleId=${options.articleId}`);
  }

  const attachmentRequest = extractAttachmentRequestParams(response.text);
  const attachments = attachmentRequest
    ? await fetchAttachments(client, attachmentRequest)
    : [];
  const courseTitle = classroom.courseTitle;
  const contentSeq = attachmentRequest?.contentSeq;
  const qnaTarget = extractQnaTarget(response.text);

  return {
    kjkey: options.kjkey,
    articleId: options.articleId,
    title: body.title,
    bodyHtml: body.bodyHtml,
    bodyText: body.bodyText,
    attachments,
    ...(courseTitle ? { courseTitle } : {}),
    ...(meta.postedAt ? { openAt: meta.postedAt } : {}),
    ...(meta.author ? { author: meta.author } : {}),
    ...(meta.postedAt ? { postedAt: meta.postedAt } : {}),
    ...(meta.viewCount !== undefined ? { viewCount: meta.viewCount } : {}),
    ...(contentSeq ? { contentSeq } : {}),
    ...(qnaTarget ? { qnaTarget } : {})
  };
}
