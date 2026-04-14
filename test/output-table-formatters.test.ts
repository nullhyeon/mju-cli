import assert from "node:assert/strict";
import test from "node:test";

import { printData } from "../src/output/print.ts";

function captureConsole() {
  const tableCalls: unknown[] = [];
  const logCalls: string[] = [];

  const originalTable = console.table;
  const originalLog = console.log;

  console.table = ((data: unknown) => {
    tableCalls.push(data);
  }) as typeof console.table;

  console.log = ((...args: unknown[]) => {
    logCalls.push(args.map((arg) => String(arg)).join(" "));
  }) as typeof console.log;

  return {
    tableCalls,
    logCalls,
    restore() {
      console.table = originalTable;
      console.log = originalLog;
    }
  };
}

test("generic table output flattens nested objects and arrays", () => {
  const capture = captureConsole();

  try {
    printData(
      {
        service: "demo",
        user: { id: "60123456", name: "홍길동" },
        counts: { total: 3, unread: 1 },
        tags: ["alpha", "beta"],
        items: [{ id: 1 }, { id: 2 }]
      },
      "table"
    );

    assert.equal(capture.logCalls.length, 0);
    assert.equal(capture.tableCalls.length, 1);

    const [row] = capture.tableCalls[0] as Array<Record<string, unknown>>;
    assert.equal(row.service, "demo");
    assert.equal(row.user, "id=60123456, name=홍길동");
    assert.equal(row.counts, "total=3, unread=1");
    assert.equal(row.tags, "alpha, beta");
    assert.equal(row.items, "2 items");
  } finally {
    capture.restore();
  }
});

test("action items table output renders summary and section tables", () => {
  const capture = captureConsole();

  try {
    printData(
      {
        scope: "all-courses",
        dueWindowDays: 7,
        counts: {
          unsubmittedAssignments: 1,
          dueAssignments: 1,
          unreadNotices: 1,
          incompleteOnlineWeeks: 1
        },
        unsubmittedAssignments: [
          {
            kjkey: "K1",
            courseTitle: "데이터통신",
            rtSeq: 1,
            title: "4주차 과제",
            weekLabel: "4주차",
            statusLabel: "미제출",
            statusText: "제출 전",
            isSubmitted: false
          }
        ],
        dueAssignments: [
          {
            kjkey: "K2",
            courseTitle: "운영체제",
            rtSeq: 2,
            title: "프로젝트 제안서",
            dueAt: "2026-04-15 23:59",
            dueAtIso: "2026-04-15T23:59:00+09:00",
            hoursUntilDue: 18,
            statusLabel: "미제출",
            statusText: "제출 전",
            isSubmitted: false
          }
        ],
        unreadNotices: [
          {
            kjkey: "K3",
            articleId: 3,
            courseTitle: "컴파일러",
            title: "중간고사 안내",
            previewText: "시험 범위 공지",
            postedAt: "2026-04-14",
            isUnread: true,
            isExpired: false
          }
        ],
        incompleteOnlineWeeks: [
          {
            kjkey: "K4",
            lectureWeeks: 5,
            courseTitle: "알고리즘",
            title: "5주차 온라인 학습",
            weekLabel: "5주차",
            statusLabel: "학습 중",
            incompleteItems: 1,
            totalItems: 3
          }
        ]
      },
      "table"
    );

    assert.ok(capture.logCalls.some((line) => line.includes("[요약]")));
    assert.ok(capture.logCalls.some((line) => line.includes("[미제출 과제]")));
    assert.ok(capture.logCalls.some((line) => line.includes("[마감 임박 과제]")));
    assert.ok(capture.logCalls.some((line) => line.includes("[안 읽은 공지]")));
    assert.ok(capture.logCalls.some((line) => line.includes("[미완료 온라인 학습]")));

    assert.equal(capture.tableCalls.length, 5);

    const [summaryRow] = capture.tableCalls[0] as Array<Record<string, unknown>>;
    assert.equal(summaryRow.scope, "all-courses");
    assert.equal(summaryRow.unsubmittedAssignments, 1);

    const [assignmentRow] = capture.tableCalls[1] as Array<Record<string, unknown>>;
    assert.equal(assignmentRow.courseTitle, "데이터통신");
    assert.equal(assignmentRow.title, "4주차 과제");
  } finally {
    capture.restore();
  }
});
