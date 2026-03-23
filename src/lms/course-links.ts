import { load } from "cheerio";

import { LMS_BASE } from "./constants.js";
import type { CourseCandidate } from "./types.js";

const COURSE_LINK_PATTERN = /(class|course|subj|lecture|subject|eclass_room2)/i;

export function extractCourseCandidates(html: string): CourseCandidate[] {
  const $ = load(html);
  const results: CourseCandidate[] = [];
  const seen = new Set<string>();

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href || !COURSE_LINK_PATTERN.test(href)) {
      return;
    }

    const title = $(element).text().replace(/\s+/g, " ").trim();
    if (!title) {
      return;
    }

    let normalizedHref = href;
    try {
      normalizedHref = new URL(href, LMS_BASE).toString();
    } catch {
      normalizedHref = href;
    }

    const dedupeKey = `${normalizedHref}::${title}`;
    if (seen.has(dedupeKey)) {
      return;
    }

    seen.add(dedupeKey);
    results.push({ title, href: normalizedHref });
  });

  return results;
}
