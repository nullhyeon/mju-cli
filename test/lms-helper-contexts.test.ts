import assert from "node:assert/strict";
import test from "node:test";

import {
  getActionItems,
  getCourseDigest,
  type LmsHelperDependencies
} from "../src/lms/helpers.ts";
import type { ResolvedLmsCredentials } from "../src/auth/types.ts";

function formatUpcomingDueAt(daysFromNow = 2): string {
  const target = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
  const year = target.getFullYear();
  const month = String(target.getMonth() + 1).padStart(2, "0");
  const day = String(target.getDate()).padStart(2, "0");
  const minute = String(target.getMinutes()).padStart(2, "0");
  const rawHour = target.getHours();
  const meridiem = rawHour >= 12 ? "오후" : "오전";
  const hour = rawHour % 12 || 12;
  const hourLabel = String(hour).padStart(2, "0");

  return `${year}.${month}.${day} ${meridiem} ${hourLabel}:${minute}`;
}

function createHelperDependencies(): {
  dependencies: LmsHelperDependencies;
  getAssignmentListCalls: () => number;
} {
  let assignmentListCalls = 0;

  const dependencies: LmsHelperDependencies = {
    async getCourseAssignment() {
      return {
        kjkey: "N2026B201",
        rtSeq: 101,
        title: "1주차 과제",
        dueAt: formatUpcomingDueAt(),
        bodyHtml: "",
        bodyText: "",
        attachments: [],
        courseTitle: "운영체제"
      };
    },
    async getCourseOnlineWeek() {
      return {
        kjkey: "N2026B201",
        lectureWeeks: 9001,
        items: []
      };
    },
    async listCourseAssignments() {
      assignmentListCalls += 1;
      return {
        kjkey: "N2026B201",
        courseTitle: "운영체제",
        assignments: [
          {
            rtSeq: 101,
            title: "1주차 과제",
            isSubmitted: false,
            week: 1,
            weekLabel: "1주차"
          }
        ]
      };
    },
    async listCourseMaterials() {
      return {
        kjkey: "N2026B201",
        courseTitle: "운영체제",
        materials: []
      };
    },
    async listCourseNotices() {
      return {
        kjkey: "N2026B201",
        courseTitle: "운영체제",
        search: "",
        page: 1,
        pageSize: 50,
        start: 0,
        total: 0,
        totalPages: 0,
        notices: []
      };
    },
    async listCourseOnlineWeeks() {
      return {
        kjkey: "N2026B201",
        courseTitle: "운영체제",
        weeks: []
      };
    },
    async listRegularTakenCourses() {
      return {
        mode: "taken",
        search: "",
        requested: {
          allTerms: true
        },
        availableTerms: [],
        selectedTerms: [],
        courses: []
      };
    },
    async resolveCourseReference() {
      return {
        kjkey: "N2026B201",
        courseTitle: "운영체제",
        courseCode: "CS101",
        year: 2026,
        term: 1,
        termLabel: "2026-1"
      };
    }
  };

  return {
    dependencies,
    getAssignmentListCalls: () => assignmentListCalls
  };
}

test("LMS action-items reuses assignment lists across unsubmitted and due sections", async () => {
  const credentials: ResolvedLmsCredentials = {
    userId: "60123456",
    password: "secret",
    source: "os-store"
  };
  const { dependencies, getAssignmentListCalls } = createHelperDependencies();

  const result = await getActionItems(
    {} as never,
    credentials,
    { kjkey: "N2026B201" },
    dependencies
  );

  assert.equal(getAssignmentListCalls(), 1);
  assert.equal(result.unsubmittedAssignments.length, 1);
  assert.equal(result.dueAssignments.length, 1);
});

test("LMS digest reuses the same assignment list for summary and due calculations", async () => {
  const credentials: ResolvedLmsCredentials = {
    userId: "60123456",
    password: "secret",
    source: "os-store"
  };
  const { dependencies, getAssignmentListCalls } = createHelperDependencies();

  const result = await getCourseDigest(
    {} as never,
    credentials,
    { kjkey: "N2026B201", days: 7, limit: 5 },
    dependencies
  );

  assert.equal(getAssignmentListCalls(), 1);
  assert.equal(result.unsubmittedAssignments.length, 1);
  assert.equal(result.dueAssignments.length, 1);
});
