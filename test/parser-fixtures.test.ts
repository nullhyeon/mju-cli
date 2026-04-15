import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { parseAssignmentListHtml } from "../src/lms/assignments.ts";
import { parseActivityListItems } from "../src/lms/activity-list.ts";
import {
  parseDeleteSpec,
  parseSubmitButton,
  parseSubmitPopupSpec
} from "../src/lms/assignment-submission-check.ts";
import { parseAssignmentDetailHtml } from "../src/lms/assignments.ts";
import { parseAttachmentsFromHtml } from "../src/lms/attachments.ts";
import {
  parseAvailableTermsFromCourseForm,
  parseCoursesFromRegisterList
} from "../src/lms/courses.ts";
import {
  parseMaterialDetailHtml,
  parseMaterialListHtml
} from "../src/lms/materials.ts";
import { parseNoticeListHtml } from "../src/lms/notices.ts";
import { parseNoticeDetailHtml } from "../src/lms/notices.ts";
import {
  parseOnlineWeekDetailHtml,
  parseOnlineWeekListHtml
} from "../src/lms/online.ts";
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

test("LMS material list fixture parses open board material summaries", async () => {
  const html = await readFixture("lms/materials-list.html");
  const result = parseMaterialListHtml(html);

  assert.equal(result.total, 3);
  assert.equal(result.materials.length, 3);
  assert.deepEqual(result.materials[0], {
    articleId: 8723729,
    title: "Web - 수업참여 9/24",
    author: "박주영",
    postedAt: "2024년 9월 24일 (화) 오후 1:36",
    viewCount: 94,
    commentCount: 0,
    isUnread: false
  });
});

test("LMS material detail fixture parses body and metadata without attachment noise", async () => {
  const html = await readFixture("lms/materials-detail.html");
  const result = parseMaterialDetailHtml(html);

  assert.equal(result.title, "Web - 수업참여 9/24");
  assert.equal(result.author, "박주영");
  assert.equal(result.postedAt, "2024년 9월 24일 (화) 오후 1:36");
  assert.equal(result.viewCount, 95);
  assert.match(result.bodyHtml, /docs\.google\.com/);
  assert.match(result.bodyText, /docs\.google\.com/);
  assert.equal(result.bodyHtml.includes("attach_container"), false);
  assert.equal(result.qnaTarget, undefined);
});

test("LMS notice detail fixture parses metadata and content body", async () => {
  const html = await readFixture("lms/notice-detail.html");
  const result = parseNoticeDetailHtml(html);

  assert.deepEqual(result, {
    title: "수업 운영 안내",
    bodyHtml: "<p>공지 본문입니다.</p>",
    bodyText: "공지 본문입니다.",
    author: "김교수",
    postedAt: "2026-04-15",
    expireAt: "2026-04-30",
    viewCount: 77
  });
});

test("LMS assignment detail fixture parses prompt meta and existing submission state", async () => {
  const html = await readFixture("lms/assignment-detail.html");
  const result = parseAssignmentDetailHtml(html, {
    attachments: [
      {
        name: "assignment-guide.pdf",
        downloadUrl: "https://lms.mju.ac.kr/files/guide.pdf"
      }
    ],
    submissionAttachments: [
      {
        name: "my-report.pdf",
        downloadUrl: "https://lms.mju.ac.kr/files/report.pdf"
      }
    ]
  });

  assert.equal(result.title, "4주차 과제");
  assert.equal(result.submissionMethod, "온라인");
  assert.equal(result.submissionFormat, "텍스트, 파일");
  assert.equal(result.openAt, "2026-04-10 09:00");
  assert.equal(result.dueAt, "2026-04-20 23:59");
  assert.equal(result.points, "10");
  assert.equal(result.scoreVisibility, "예");
  assert.equal(result.contentSeq, "PROMPT123");
  assert.equal(result.attachments.length, 1);
  assert.deepEqual(result.submission, {
    status: "제출완료",
    submittedAt: "2026-04-14 12:30",
    text: "기존 제출 본문입니다.",
    contentSeq: "SUBMIT456",
    attachments: [
      {
        name: "my-report.pdf",
        downloadUrl: "https://lms.mju.ac.kr/files/report.pdf"
      }
    ]
  });
});

test("LMS attachment fixture parses downloadable attachments", async () => {
  const html = await readFixture("lms/attachments.html");
  const result = parseAttachmentsFromHtml(html);

  assert.deepEqual(result, [
    {
      name: "강의계획서.pdf",
      downloadUrl: "https://lms.mju.ac.kr/ilos/co/download.acl?file=1",
      previewUrl: "https://lms.mju.ac.kr/ilos/co/preview.acl?file=1",
      sizeLabel: "120 KB",
      fileType: "pdf"
    }
  ]);
});

test("LMS course form fixture parses available terms", async () => {
  const html = await readFixture("lms/course-form.html");
  const result = parseAvailableTermsFromCourseForm(html);

  assert.deepEqual(result, [
    { order: 0, year: 2026, term: 1, key: "2026-1" },
    { order: 1, year: 2025, term: 2, key: "2025-2" }
  ]);
});

test("LMS register list fixture parses structured course summaries", async () => {
  const html = await readFixture("lms/course-register-list.html");
  const result = parseCoursesFromRegisterList(html, {
    order: 0,
    year: 2026,
    term: 1,
    key: "2026-1"
  });

  assert.deepEqual(result, [
    {
      kjkey: "A20261CS1010101",
      title: "운영체제",
      courseCode: "CS101-01",
      professor: "홍길동",
      year: 2026,
      term: 1,
      termLabel: "2026년 1학기",
      classroomLabel: "강의실",
      enterPath: "/ilos/cls/st/co/eclass_room2.acl",
      coverImageUrl: "https://lms.mju.ac.kr/ext/ilos/images/cover/sample.png"
    }
  ]);
});

test("LMS online detail fixture parses launch form, warnings, and learning items", async () => {
  const html = await readFixture("lms/online-detail.html");
  const result = parseOnlineWeekDetailHtml(html);

  assert.equal(result.attendanceLabel, "학습 종료 후 반영");
  assert.equal(result.studyPeriod, "2026-04-14 ~ 2026-04-20");
  assert.deepEqual(result.warningMessages, ["모바일 학습은 일부 제한될 수 있습니다."]);
  assert.deepEqual(result.launchForm, {
    action: "https://lms.mju.ac.kr/ilos/cls/st/online/online_learning_form.acl",
    lectureWeeks: 9921329,
    kjkey: "A20261CS1010101",
    kjLectType: "NORMAL"
  });
  assert.deepEqual(result.items, [
    {
      linkSeq: 6,
      title: "1차시 강의",
      progressPercent: 75,
      inPeriodProgressPercent: 75,
      outOfPeriodProgressPercent: 100,
      learningTime: "15분 / 20분",
      attendanceTime: "15분",
      qnaCount: 2,
      stampCount: 1,
      thumbnailUrl: "https://lms.mju.ac.kr/thumbs/1.png"
    }
  ]);
});

test("LMS activity list fixture parses mixed activity entries", async () => {
  const html = await readFixture("lms/activity-list.html");
  const result = parseActivityListItems(html);

  assert.deepEqual(result, [
    {
      menuId: "report",
      activityId: 8709455,
      title: "4주차 과제",
      hasIndicator: true,
      week: 4,
      weekLabel: "4주차",
      statusLabel: "제출상태",
      statusText: "제출완료",
      attachmentCount: 1
    },
    {
      menuId: "lecture_weeks",
      activityId: 9921329,
      title: "5주차 온라인 학습",
      hasIndicator: false,
      week: 5,
      weekLabel: "5주차",
      statusLabel: "학습상태",
      statusText: "학습 중"
    }
  ]);
});

test("LMS assignment submit view fixture parses submit button and delete spec", async () => {
  const html = await readFixture("lms/assignment-submit-view.html");
  const submitButton = parseSubmitButton(html);
  const deleteSpec = parseDeleteSpec(html);

  assert.deepEqual(submitButton, {
    hasSubmitButton: true,
    submitButtonLabel: "수정하기",
    submitPopupUrl:
      "https://lms.mju.ac.kr/ilos/cls/st/report/report_update_pop.acl?RT_SEQ=8709455"
  });
  assert.deepEqual(deleteSpec, {
    hasDeleteButton: true,
    deleteButtonLabel: "삭제하기",
    submitCheckUrl:
      "https://lms.mju.ac.kr/ilos/cls/st/report/report_submit_check.acl",
    submitCheckDiv: "report",
    deleteUrl: "https://lms.mju.ac.kr/ilos/cls/st/report/report_delete.acl",
    deleteContentSeq: "CONTENT123"
  });
});

test("LMS assignment submit popup fixture parses update-submit spec", async () => {
  const html = await readFixture("lms/assignment-submit-popup.html");
  const result = parseSubmitPopupSpec(
    html,
    "https://lms.mju.ac.kr/ilos/cls/st/report/report_update_pop.acl?RT_SEQ=8709455",
    "수정하기"
  );

  assert.deepEqual(result, {
    mode: "update-submit",
    submitPopupUrl:
      "https://lms.mju.ac.kr/ilos/cls/st/report/report_update_pop.acl?RT_SEQ=8709455",
    submitButtonLabel: "수정하기",
    requiresTextInput: true,
    textFieldName: "TXT",
    hasFilePicker: true,
    uploadUrl: "https://lms.mju.ac.kr/ilos/co/efile_upload_multiple2.acl",
    uploadPath: "/2026/report",
    uploadPfStFlag: "2",
    submitCheckUrl:
      "https://lms.mju.ac.kr/ilos/cls/st/report/report_submit_check.acl",
    submitCheckDiv: "report",
    submitUrl: "https://lms.mju.ac.kr/ilos/cls/st/report/report_update.acl",
    submitContentSeq: "CONTENT123",
    existingFilesContentSeq: "CONTENT123",
    existingTextHtml: "기존 제출 본문",
    existingTextText: "기존 제출 본문"
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
