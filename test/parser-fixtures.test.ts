import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { parseAssignmentListHtml } from "../src/lms/assignments.ts";
import { parseNoticeListHtml } from "../src/lms/notices.ts";
import { parseOnlineWeekListHtml } from "../src/lms/online.ts";
import {
  parseCurrentGradesPage,
  parseGraduationPage,
  parseTimetablePage
} from "../src/msi/services.ts";
import {
  parseUcheckAccountInfoResponse,
  parseUcheckLectureListResponse
} from "../src/ucheck/services.ts";

async function readFixture(relativePath: string): Promise<string> {
  return fs.readFile(new URL(`./fixtures/${relativePath}`, import.meta.url), "utf8");
}

test("LMS notice fixture parses into structured notice summaries", async () => {
  const html = await readFixture("lms/notices-list.html");
  const result = parseNoticeListHtml(html);

  assert.equal(result.total, 2);
  assert.equal(result.notices.length, 2);
  assert.deepEqual(result.notices[0], {
    articleId: 9618277,
    title: "중간고사 안내",
    previewText: "시험 범위와 준비물을 확인하세요.",
    postedAt: "2026-04-15",
    viewCount: 123,
    isUnread: true,
    isExpired: false
  });
  assert.equal(result.notices[1]?.isExpired, true);
});

test("LMS assignment activity fixture parses submission indicators and week metadata", async () => {
  const html = await readFixture("lms/assignments-list.html");
  const result = parseAssignmentListHtml(html);

  assert.equal(result.length, 2);
  assert.equal(result[0]?.rtSeq, 8709455);
  assert.equal(result[0]?.week, 4);
  assert.equal(result[0]?.weekLabel, "4주차");
  assert.equal(result[0]?.isSubmitted, false);
  assert.equal(result[1]?.isSubmitted, true);
});

test("LMS online week fixture parses lecture week summaries", async () => {
  const html = await readFixture("lms/online-weeks.html");
  const result = parseOnlineWeekListHtml(html);

  assert.equal(result.length, 1);
  assert.deepEqual(result[0], {
    lectureWeeks: 9921329,
    title: "5주차 온라인 학습",
    week: 5,
    weekLabel: "5주차",
    statusLabel: "학습상태",
    statusText: "학습 중"
  });
});

test("MSI timetable fixture parses selected term and entry metadata", async () => {
  const html = await readFixture("msi/timetable.html");
  const result = parseTimetablePage(html);

  assert.equal(result.year, 2026);
  assert.equal(result.termCode, "11");
  assert.equal(result.termLabel, "2026-1학기");
  assert.equal(result.entries.length, 1);
  assert.deepEqual(result.entries[0], {
    dayOfWeek: 1,
    dayLabel: "월",
    courseTitle: "운영체제",
    location: "공학관 101",
    professor: "홍길동",
    timeRange: "09:00~10:15",
    curiNum: "CURI001",
    courseCls: "01",
    topPercent: 10,
    heightPercent: 15
  });
});

test("MSI current grades fixture parses grade rows into structured items", async () => {
  const html = await readFixture("msi/current-grades.html");
  const result = parseCurrentGradesPage(html);

  assert.equal(result.year, 2026);
  assert.equal(result.termLabel, "1학기");
  assert.equal(result.items.length, 1);
  assert.deepEqual(result.items[0], {
    courseCode: "CS101",
    courseClass: "01",
    courseTitle: "운영체제",
    credits: 3,
    grade: "A+",
    publicStatus: "공개",
    lectureEvaluationStatus: "완료"
  });
});

test("MSI graduation fixture parses earned credits, required credits, and gaps", async () => {
  const html = await readFixture("msi/graduation.html");
  const result = parseGraduationPage(html);

  assert.equal(result.studentInfo["학번"], "60123456");
  assert.equal(result.studentInfo["학과"], "컴퓨터공학과");
  assert.deepEqual(result.creditGaps, [
    {
      label: "전공",
      earned: 60,
      required: 66,
      gap: 6
    },
    {
      label: "교양",
      earned: 30,
      required: 30,
      gap: 0
    }
  ]);
  assert.deepEqual(result.notes, ["캡스톤 교과목 이수 필요"]);
});

test("UCheck account info fixture parses base term and available terms", async () => {
  const text = await readFixture("ucheck/account-info.json");
  const result = parseUcheckAccountInfoResponse(text);

  assert.equal(result.accountId, "60123456");
  assert.equal(result.name, "홍길동");
  assert.equal(result.studentNo, "60123456");
  assert.deepEqual(result.baseYearTerm, {
    lectureYear: 2026,
    lectureTerm: 1
  });
  assert.deepEqual(result.availableYearTerms, [
    { lectureYear: 2026, lectureTerm: 1 },
    { lectureYear: 2025, lectureTerm: 2 }
  ]);
});

test("UCheck lecture list fixture filters invalid rows and normalizes schedule text", async () => {
  const text = await readFixture("ucheck/lecture-list.json");
  const result = parseUcheckLectureListResponse(text);

  assert.equal(result.length, 1);
  assert.deepEqual(result[0], {
    lectureNo: 12345,
    lectureYear: 2026,
    lectureTerm: 1,
    courseCode: "CS101",
    courseTitle: "운영체제",
    classCode: "01",
    professor: "홍길동",
    department: "컴퓨터공학과",
    scheduleSummary: "monday/09:00~10:15/공학관 101\nwednesday/09:00~10:15/공학관 101"
  });
});
