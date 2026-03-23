import fs from "node:fs/promises";
import path from "node:path";

import { load } from "cheerio";

import { looksLikeLoginPage } from "./auth-heuristics.js";
import { FILE_LIST_URL, LMS_BASE } from "./constants.js";
import { decodeHtml } from "./encoding.js";
import { MjuLmsSsoClient } from "./sso-client.js";
import type {
  AttachmentRequestParams,
  DownloadedAttachmentFile,
  LmsAttachment
} from "./types.js";

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toAbsoluteUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  return new URL(trimmed, LMS_BASE).toString();
}

function firstHeaderValue(
  value: string | string[] | undefined
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseFileNameFromContentDisposition(
  value: string | undefined
): string | undefined {
  if (!value) {
    return undefined;
  }

  const filenameStarMatch = value.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (filenameStarMatch?.[1]) {
    try {
      return decodeURIComponent(filenameStarMatch[1]);
    } catch {
      return filenameStarMatch[1];
    }
  }

  const filenameMatch = value.match(/filename\s*=\s*"([^"]+)"/i);
  if (filenameMatch?.[1]) {
    try {
      return decodeURIComponent(filenameMatch[1]);
    } catch {
      return filenameMatch[1];
    }
  }

  return undefined;
}

function sanitizeFileName(fileName: string): string {
  const sanitized = fileName
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");

  return sanitized || "attachment";
}

async function resolveUniqueFilePath(
  outputDir: string,
  preferredFileName: string
): Promise<string> {
  const parsed = path.parse(preferredFileName);
  const baseName = parsed.name || "attachment";
  const extension = parsed.ext;
  let attempt = 0;

  while (true) {
    const suffix = attempt === 0 ? "" : ` (${attempt})`;
    const candidate = path.join(outputDir, `${baseName}${suffix}${extension}`);
    try {
      await fs.access(candidate);
      attempt += 1;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return candidate;
      }

      throw error;
    }
  }
}

export function extractAttachmentRequestParams(
  html: string
): AttachmentRequestParams | undefined {
  const match = html.match(
    /url:\s*"\/ilos\/co\/efile_list\.acl"[\s\S]*?ud\s*:\s*"([^"]+)"[\s\S]*?ky\s*:\s*"([^"]+)"[\s\S]*?pf_st_flag\s*:\s*"([^"]+)"[\s\S]*?CONTENT_SEQ\s*:\s*"([^"]+)"/
  );

  if (!match) {
    return undefined;
  }

  const [, userId, kjkey, pfStFlag, contentSeq] = match;
  if (!userId || !kjkey || !pfStFlag || !contentSeq) {
    return undefined;
  }

  return {
    userId,
    kjkey,
    pfStFlag,
    contentSeq
  };
}

export function parseAttachmentsFromHtml(html: string): LmsAttachment[] {
  const $ = load(html);
  const attachments: LmsAttachment[] = [];

  $("ul.attach_list > li").each((_, element) => {
    const item = $(element);
    const downloadLink = item.find("a.file_down").first();
    const previewLink = item.find("a.icon_preview").first();
    const filename = normalizeText(downloadLink.text());
    const downloadUrl = toAbsoluteUrl(downloadLink.attr("href"));

    if (!filename || !downloadUrl) {
      return;
    }

    const attachment: LmsAttachment = {
      name: filename,
      downloadUrl
    };

    const previewUrl = toAbsoluteUrl(previewLink.attr("href"));
    if (previewUrl) {
      attachment.previewUrl = previewUrl;
    }

    const sizeLabel = normalizeText(item.find(".file_size").first().text());
    if (sizeLabel) {
      attachment.sizeLabel = sizeLabel;
    }

    const fileIconClass = item
      .find(".file_icon")
      .first()
      .attr("class")
      ?.split(/\s+/)
      .find((className) => className.startsWith("icon_"));
    if (fileIconClass) {
      attachment.fileType = fileIconClass.replace(/^icon_/, "");
    }

    attachments.push(attachment);
  });

  return attachments;
}

export async function fetchAttachments(
  client: MjuLmsSsoClient,
  params: AttachmentRequestParams
): Promise<LmsAttachment[]> {
  const response = await client.postForm(FILE_LIST_URL, {
    ud: params.userId,
    ky: params.kjkey,
    pf_st_flag: params.pfStFlag,
    CONTENT_SEQ: params.contentSeq,
    ...(params.turnitinSeq ? { TURNITIN_SEQ: params.turnitinSeq } : {}),
    encoding: "utf-8"
  });

  return parseAttachmentsFromHtml(response.text);
}

export function selectAttachmentByIndex(
  attachments: LmsAttachment[],
  index: number,
  label: string
): LmsAttachment {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`${label} 인덱스는 0 이상의 정수여야 합니다.`);
  }

  const attachment = attachments[index];
  if (!attachment) {
    throw new Error(
      `${label} 인덱스 ${index} 를 찾지 못했습니다. 현재 첨부 수는 ${attachments.length}개입니다.`
    );
  }

  return attachment;
}

export async function downloadAttachmentToDirectory(
  client: MjuLmsSsoClient,
  attachment: LmsAttachment,
  options: { outputDir: string }
): Promise<DownloadedAttachmentFile> {
  const response = await client.getBinary(attachment.downloadUrl);
  const contentDisposition = firstHeaderValue(response.headers["content-disposition"]);
  const contentType = firstHeaderValue(response.headers["content-type"]);

  if (response.statusCode >= 400) {
    throw new Error(
      `첨부 다운로드에 실패했습니다. status=${response.statusCode} url=${attachment.downloadUrl}`
    );
  }

  if (contentType?.toLowerCase().includes("text/html")) {
    const decodedHtml = decodeHtml(response.rawBody, response.headers);
    if (looksLikeLoginPage({ url: response.url, text: decodedHtml })) {
      throw new Error(
        "첨부 다운로드가 로그인 페이지로 리다이렉트되었습니다. 세션이 만료되었는지 확인해 주세요."
      );
    }
  }

  await fs.mkdir(options.outputDir, { recursive: true });

  const resolvedFileName = sanitizeFileName(
    parseFileNameFromContentDisposition(contentDisposition) ?? attachment.name
  );
  const savedPath = await resolveUniqueFilePath(options.outputDir, resolvedFileName);
  await fs.writeFile(savedPath, response.rawBody);

  const result: DownloadedAttachmentFile = {
    fileName: path.basename(savedPath),
    savedPath,
    finalUrl: response.url,
    sourceUrl: attachment.downloadUrl,
    byteLength: response.rawBody.length,
    statusCode: response.statusCode
  };

  if (contentType) {
    result.contentType = contentType;
  }
  if (contentDisposition) {
    result.contentDisposition = contentDisposition;
  }

  return result;
}
