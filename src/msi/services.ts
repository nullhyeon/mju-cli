import { load } from "cheerio";

import type { ResolvedLmsCredentials } from "../auth/types.js";
import type { MjuMsiClient } from "./client.js";
import { MSI_BASE } from "./constants.js";
import { openMsiMenu } from "./menu.js";
import type {
  MsiCreditBucket,
  MsiCurrentGradeItem,
  MsiCurrentGradesResult,
  MsiGradeHistoryCourse,
  MsiGradeHistoryResult,
  MsiGradeHistoryRow,
  MsiGradeHistoryTermRecord,
  MsiGraduationCreditGap,
  MsiGraduationCreditItem,
  MsiGraduationRequirementsResult,
  MsiMenuSpec,
  MsiTimetableEntry,
  MsiTimetableResult,
  MsiTimetableTermOption
} from "./types.js";

export const MSI_TIMETABLE_MENU: MsiMenuSpec = {
  name: "수강과목시간표",
  urlPath: "/servlet/su/sug/Sug00Svl07getTimeTable",
  folderDiv: "102",
  pgmid: "W_SUG016"
};

export const MSI_CURRENT_GRADES_MENU: MsiMenuSpec = {
  name: "수강성적조회",
  urlPath: "/servlet/su/suh/Suh00Svl01showCurrentGrade",
  folderDiv: "104",
  pgmid: "W_SUH005"
};

export const MSI_GRADE_HISTORY_MENU: MsiMenuSpec = {
  name: "성적조회",
  urlPath: "/servlet/su/suh/Suh00Svl02studentGradeList",
  folderDiv: "104",
  pgmid: "W_SUH015"
};

export const MSI_GRADUATION_REQUIREMENTS_MENU: MsiMenuSpec = {
  name: "졸업학점조회",
  urlPath: "/servlet/su/sui/Sui00Svl01getGdtRequire",
  folderDiv: "104",
  pgmid: "W_SUI005"
};

function cleanText(value: string | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function parseNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.replace(/[^\d.-]/g, "");
  if (!normalized) {
    return undefined;
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function parseInteger(value: string | undefined): number | undefined {
  const parsed = parseNumber(value);
  return parsed === undefined ? undefined : Math.trunc(parsed);
}

function parseKeyValueCard(cardHtml: string): Record<string, string> {
  const $ = load(cardHtml);
  const result: Record<string, string> = {};

  $(".flex-table-item").each((_, element) => {
    const title = cleanText($(element).find(".item-title").first().text());
    const valueContainer = $(element).find(".item-data").first().clone();
    valueContainer.find(".tooltip").remove();
    const value = cleanText(valueContainer.text());
    if (title) {
      result[title] = value;
    }
  });

  return result;
}

function parseCreditItems(sectionHtml: string): MsiCreditBucket[] {
  const $ = load(sectionHtml);
  const result: MsiCreditBucket[] = [];

  $(".flex-table-item").each((_, element) => {
    const title = cleanText($(element).find(".item-title").first().text());
    if (!title) {
      return;
    }

    const valueContainer = $(element).find(".item-data").first().clone();
    valueContainer.find(".tooltip").remove();
    const rawValue = cleanText(valueContainer.text());
    const credits = parseNumber(rawValue);
    const item: MsiCreditBucket = {
      label: title,
      rawValue
    };
    if (credits !== undefined) {
      item.credits = credits;
    }

    result.push(item);
  });

  return result;
}

function parseTimetableEntries(html: string): MsiTimetableEntry[] {
  const $ = load(html);
  const dayLabelMap: Record<number, string> = {
    1: "월",
    2: "화",
    3: "수",
    4: "목",
    5: "금",
    6: "토",
    7: "일"
  };

  return $('.detail-item[data-lectureday]')
    .map((_, element) => {
      const dayOfWeek = parseInteger($(element).attr("data-lectureday"));
      const style = $(element).attr("style") ?? "";
      const topPercent = /top:\s*([\d.]+)%/.exec(style)?.[1];
      const heightPercent = /height:\s*([\d.]+)%/.exec(style)?.[1];
      const onclick = $(element).attr("onclick") ?? $(element).attr("onClick") ?? "";
      const courseMatch = /openSyllabi\('([^']+)'\s*,\s*'([^']+)'\)/.exec(onclick);

      return {
        dayOfWeek: dayOfWeek ?? 0,
        dayLabel: dayLabelMap[dayOfWeek ?? 0] ?? "",
        courseTitle: cleanText($(element).find(".name").first().text()),
        ...(cleanText($(element).find(".code").first().text())
          ? { location: cleanText($(element).find(".code").first().text()) }
          : {}),
        ...(cleanText($(element).attr("data-tooltip") ?? "")
          ? { professor: cleanText($(element).attr("data-tooltip") ?? "") }
          : {}),
        ...(cleanText($(element).attr("data-tooltip2") ?? "")
          ? { timeRange: cleanText($(element).attr("data-tooltip2") ?? "") }
          : {}),
        ...(courseMatch?.[1] ? { curiNum: courseMatch[1] } : {}),
        ...(courseMatch?.[2] ? { courseCls: courseMatch[2] } : {}),
        ...(topPercent ? { topPercent: Number.parseFloat(topPercent) } : {}),
        ...(heightPercent ? { heightPercent: Number.parseFloat(heightPercent) } : {})
      };
    })
    .get()
    .filter((entry) => entry.courseTitle);
}

export function parseTimetablePage(html: string): MsiTimetableResult {
  const $ = load(html);
  const year = parseInteger(
    $('form[name="form1"] input[name="year"]').first().attr("value")
  );
  const termOptions: MsiTimetableTermOption[] = $('form[name="form1"] select[name="smt"] option')
    .map((_, element) => ({
      code: cleanText($(element).attr("value") ?? ""),
      label: cleanText($(element).text()),
      selected: $(element).is("[selected]") || $(element).is(":selected")
    }))
    .get();
  const selectedTerm = termOptions.find((option) => option.selected) ?? termOptions[0];

  return {
    year: year ?? 0,
    termCode: selectedTerm?.code ?? "",
    termLabel: selectedTerm?.label ?? "",
    termOptions,
    entries: parseTimetableEntries(html)
  };
}

function extractCurrentGradesTitleMeta(html: string): {
  year?: number;
  termLabel?: string;
} {
  const $ = load(html);
  const title = cleanText($(".con-title").first().text());
  const match = /수강 성적조회 \((\d{4})\s+([^)]+)\)/.exec(title);
  if (!match) {
    return {};
  }

  const result: { year?: number; termLabel?: string } = {};
  const year = parseInteger(match[1]);
  const termLabel = cleanText(match[2]);

  if (year !== undefined) {
    result.year = year;
  }
  if (termLabel) {
    result.termLabel = termLabel;
  }

  return result;
}

export function parseCurrentGradesPage(html: string): MsiCurrentGradesResult {
  const $ = load(html);
  const items: MsiCurrentGradeItem[] = [];

  $("tbody.ov").each((_, body) => {
    const row = $(body).find("tr").first();
    const cells = row.find("td");
    if (cells.length < 2) {
      return;
    }

    const courseClass = cleanText(cells.eq(0).text());
    const courseTitle = cleanText(cells.eq(1).text());
    const credits = parseNumber(cleanText(cells.eq(2).text()));
    const hiddenCourseCode =
      cleanText($(body).find('input[name="list_curiNum"]').first().attr("value") ?? "") ||
      undefined;
    const hiddenCourseClass =
      cleanText($(body).find('input[name="list_courseCls"]').first().attr("value") ?? "") ||
      undefined;
    const tailCells = cells.slice(3);
    const tailTexts = tailCells
      .map((__, cell) => cleanText($(cell).text()))
      .get()
      .filter(Boolean);

    const item: MsiCurrentGradeItem = {
      courseTitle,
      ...(hiddenCourseCode ? { courseCode: hiddenCourseCode } : {}),
      ...(hiddenCourseClass || courseClass
        ? { courseClass: hiddenCourseClass ?? courseClass }
        : {}),
      ...(credits !== undefined ? { credits } : {})
    };
    const [firstTailText, secondTailText, thirdTailText] = tailTexts;

    if (tailTexts.length === 1 && tailCells.first().attr("colspan") && firstTailText) {
      item.statusMessage = firstTailText;
    } else {
      if (firstTailText) {
        item.grade = firstTailText;
      }
      if (secondTailText) {
        item.publicStatus = secondTailText;
      }
      if (thirdTailText) {
        item.lectureEvaluationStatus = thirdTailText;
      }
    }

    items.push(item);
  });

  return {
    ...extractCurrentGradesTitleMeta(html),
    items
  };
}

function parseHistorySummaryMetrics(text: string): {
  requestedCredits?: number;
  earnedCredits?: number;
  totalPoints?: number;
  gpa?: number;
} {
  const requestedMatch = /신청학점\s*:\s*([\d.]+)/.exec(text);
  const earnedMatch = /취득학점\s*:\s*([\d.]+)/.exec(text);
  const totalPointsMatch = /전체평점\s*:\s*([\d.]+)/.exec(text);
  const gpaMatch = /평점평균\s*:\s*([\d.]+)/.exec(text);

  const result: {
    requestedCredits?: number;
    earnedCredits?: number;
    totalPoints?: number;
    gpa?: number;
  } = {};
  const requestedCredits = requestedMatch?.[1] ? parseNumber(requestedMatch[1]) : undefined;
  const earnedCredits = earnedMatch?.[1] ? parseNumber(earnedMatch[1]) : undefined;
  const totalPoints = totalPointsMatch?.[1] ? parseNumber(totalPointsMatch[1]) : undefined;
  const gpa = gpaMatch?.[1] ? parseNumber(gpaMatch[1]) : undefined;

  if (requestedCredits !== undefined) {
    result.requestedCredits = requestedCredits;
  }
  if (earnedCredits !== undefined) {
    result.earnedCredits = earnedCredits;
  }
  if (totalPoints !== undefined) {
    result.totalPoints = totalPoints;
  }
  if (gpa !== undefined) {
    result.gpa = gpa;
  }

  return result;
}

function parseGradeHistoryTermCards(html: string): MsiGradeHistoryTermRecord[] {
  const $ = load(html);
  const result: MsiGradeHistoryTermRecord[] = [];

  $(".card-item.basic").each((_, card) => {
    const title = cleanText($(card).children(".data-title").first().text());
    const titleMatch = /^(\d{4})년도\s+(.+)\s+성적$/.exec(title);
    if (!titleMatch) {
      return;
    }

    const detailText = cleanText(
      $(card).children(".data-title.small.font-color-blue").first().text()
    );
    const courses: MsiGradeHistoryCourse[] = $(card)
      .find("table tbody tr")
      .map((__, row) => {
        const cells = $(row).find("td");
        if (cells.length < 5) {
          return null;
        }

        const credits = parseNumber(cleanText(cells.eq(3).text()));
        const course: MsiGradeHistoryCourse = {
          category: cleanText(cells.eq(0).text()),
          courseCode: cleanText(cells.eq(1).text()),
          courseTitle: cleanText(cells.eq(2).text()),
          grade: cleanText(cells.eq(4).text())
        };
        if (credits !== undefined) {
          course.credits = credits;
        }

        return course;
      })
      .get()
      .filter((course): course is MsiGradeHistoryCourse => course !== null);

    const year = parseInteger(titleMatch[1]);
    const record: MsiGradeHistoryTermRecord = {
      title,
      termLabel: cleanText(titleMatch[2]),
      courses
    };
    if (year !== undefined) {
      record.year = year;
    }

    const metrics = parseHistorySummaryMetrics(detailText);
    if (metrics.requestedCredits !== undefined) {
      record.requestedCredits = metrics.requestedCredits;
    }
    if (metrics.earnedCredits !== undefined) {
      record.earnedCredits = metrics.earnedCredits;
    }
    if (metrics.totalPoints !== undefined) {
      record.totalPoints = metrics.totalPoints;
    }
    if (metrics.gpa !== undefined) {
      record.gpa = metrics.gpa;
    }

    result.push(record);
  });

  return result;
}

function parseComprehensiveGradeRows(html: string): MsiGradeHistoryRow[] {
  const $ = load(html);
  const table = $("table")
    .filter((_, element) => {
      const headers = $(element)
        .find("thead th")
        .map((__, th) => cleanText($(th).text()))
        .get();
      return headers.join("|") === "년도|학기|이수구분|교과목명|교과코드|학점|성적|중복코드";
    })
    .first();

  if (table.length === 0) {
    return [];
  }

  return table
    .find("tbody tr")
    .map((_, row) => {
      const cells = $(row).find("td");
      if (cells.length < 7) {
        return null;
      }

      const year = parseInteger(cleanText(cells.eq(0).text()));
      const credits = parseNumber(cleanText(cells.eq(5).text()));
      const rowData: MsiGradeHistoryRow = {
        termLabel: cleanText(cells.eq(1).text()),
        category: cleanText(cells.eq(2).text()),
        courseTitle: cleanText(cells.eq(3).text()),
        courseCode: cleanText(cells.eq(4).text()),
        grade: cleanText(cells.eq(6).text())
      };
      const duplicateCode = cleanText(cells.eq(7).text());

      if (year !== undefined) {
        rowData.year = year;
      }
      if (credits !== undefined) {
        rowData.credits = credits;
      }
      if (duplicateCode) {
        rowData.duplicateCode = duplicateCode;
      }

      return rowData;
    })
    .get()
    .filter((row): row is MsiGradeHistoryRow => row !== null);
}

function parseGradeHistoryPage(html: string): MsiGradeHistoryResult {
  const $ = load(html);
  const studentInfoCard = $(".basic-group .card-item.basic").first();
  const overviewCard = $(".card-item.basic")
    .filter(
      (_, card) =>
        cleanText($(card).children(".data-title").first().text()) === "전체취득학점"
    )
    .first();
  const creditCard = $(".card-item.basic")
    .filter(
      (_, card) =>
        cleanText($(card).children(".data-title").first().text()) === "이수구분별 취득학점"
    )
    .first();

  const overview: Record<string, string> = {};
  overviewCard.find("thead th").each((index, th) => {
    const label = cleanText($(th).text());
    const value = cleanText(overviewCard.find("tbody td").eq(index).text());
    if (label) {
      overview[label] = value;
    }
  });

  return {
    studentInfo: parseKeyValueCard(studentInfoCard.html() ?? ""),
    overview,
    creditsByCategory: parseCreditItems(creditCard.html() ?? ""),
    termRecords: parseGradeHistoryTermCards(html),
    allRows: parseComprehensiveGradeRows(html)
  };
}

function parseGraduationCreditItems(sectionHtml: string): MsiGraduationCreditItem[] {
  const buckets = parseCreditItems(sectionHtml);
  return buckets.map((bucket) => ({
    label: bucket.label,
    rawValue: bucket.rawValue,
    ...(bucket.credits !== undefined ? { credits: bucket.credits } : {})
  }));
}

export function parseGraduationPage(html: string): MsiGraduationRequirementsResult {
  const $ = load(html);
  const personalCard = $(".card-item.basic")
    .filter(
      (_, card) =>
        cleanText($(card).children(".data-title").first().text()) === "기본인적사항"
    )
    .first();
  const earnedCard = $(".card-item.basic")
    .filter(
      (_, card) =>
        cleanText($(card).children(".data-title").first().text()) === "이수학점내역"
    )
    .first();
  const requiredCard = $(".card-item.basic")
    .filter(
      (_, card) =>
        cleanText($(card).children(".data-title").first().text()) === "졸업필요학점계"
    )
    .first();
  const notes = $("ol li")
    .map((_, element) => cleanText($(element).text()))
    .get()
    .filter(Boolean);
  const earnedCredits = parseGraduationCreditItems(
    earnedCard.find("#studentCdt").html() ?? earnedCard.html() ?? ""
  );
  const requiredCredits = parseGraduationCreditItems(
    requiredCard.find("#requireCdt").html() ?? requiredCard.html() ?? ""
  );

  const earnedMap = new Map(earnedCredits.map((item) => [item.label, item.credits]));
  const requiredMap = new Map(requiredCredits.map((item) => [item.label, item.credits]));
  const labels = new Set([...earnedMap.keys(), ...requiredMap.keys()]);
  const creditGaps: MsiGraduationCreditGap[] = [...labels]
    .map((label) => {
      const earned = earnedMap.get(label);
      const required = requiredMap.get(label);
      const gap =
        earned !== undefined && required !== undefined
          ? Math.max(required - earned, 0)
          : undefined;

      return {
        label,
        ...(earned !== undefined ? { earned } : {}),
        ...(required !== undefined ? { required } : {}),
        ...(gap !== undefined ? { gap } : {})
      };
    })
    .filter((item) => item.earned !== undefined || item.required !== undefined);

  return {
    studentInfo: parseKeyValueCard(personalCard.html() ?? ""),
    earnedCredits,
    requiredCredits,
    creditGaps,
    notes
  };
}

function extractFormFields(html: string, selector: string): {
  action: string;
  fields: Record<string, string>;
} {
  const $ = load(html);
  const form = $(selector).first();
  const action = cleanText(form.attr("action") ?? "");
  if (!action) {
    throw new Error("MSI 조회 폼 action 을 찾지 못했습니다.");
  }

  const fields: Record<string, string> = {};
  form.find("input[name], select[name], textarea[name]").each((_, element) => {
    const name = $(element).attr("name");
    if (!name) {
      return;
    }

    if ($(element).is("select")) {
      fields[name] = cleanText(
        $(element).find("option:selected").attr("value") ??
          $(element).find("option").first().attr("value") ??
          ""
      );
      return;
    }

    if ($(element).is("textarea")) {
      fields[name] = $(element).text();
      return;
    }

    fields[name] = $(element).attr("value") ?? "";
  });

  return { action, fields };
}

export async function getMsiTimetable(
  client: MjuMsiClient,
  credentials: ResolvedLmsCredentials,
  options: {
    year?: number;
    termCode?: number;
  } = {}
): Promise<MsiTimetableResult> {
  const { pageResponse } = await openMsiMenu(client, credentials, MSI_TIMETABLE_MENU);
  let currentHtml = pageResponse.text;

  if (options.year !== undefined || options.termCode !== undefined) {
    const { action, fields } = extractFormFields(currentHtml, 'form[name="form1"]');
    const queryResponse = await client.postForm(new URL(action, MSI_BASE).toString(), {
      ...fields,
      ...(options.year !== undefined ? { year: String(options.year) } : {}),
      ...(options.termCode !== undefined ? { smt: String(options.termCode) } : {})
    });
    currentHtml = queryResponse.text;
  }

  return parseTimetablePage(currentHtml);
}

export async function getMsiCurrentTermGrades(
  client: MjuMsiClient,
  credentials: ResolvedLmsCredentials
): Promise<MsiCurrentGradesResult> {
  const { pageResponse } = await openMsiMenu(client, credentials, MSI_CURRENT_GRADES_MENU);
  return parseCurrentGradesPage(pageResponse.text);
}

export async function getMsiGradeHistory(
  client: MjuMsiClient,
  credentials: ResolvedLmsCredentials
): Promise<MsiGradeHistoryResult> {
  const { pageResponse } = await openMsiMenu(client, credentials, MSI_GRADE_HISTORY_MENU);
  return parseGradeHistoryPage(pageResponse.text);
}

export async function getMsiGraduationRequirements(
  client: MjuMsiClient,
  credentials: ResolvedLmsCredentials
): Promise<MsiGraduationRequirementsResult> {
  const { pageResponse } = await openMsiMenu(
    client,
    credentials,
    MSI_GRADUATION_REQUIREMENTS_MENU
  );
  return parseGraduationPage(pageResponse.text);
}
