import { getCourseAssignment, listCourseAssignments } from "./assignments.js";
import { resolveCourseReference } from "./course-resolver.js";
import { listRegularTakenCourses } from "./courses.js";
import type { MjuLmsSsoClient } from "./sso-client.js";
import type { AssignmentSummary, CourseSummary } from "./types.js";
import type { ResolvedLmsCredentials } from "../auth/types.js";

const DEFAULT_DUE_DAYS = 7;

export interface ScopedCourse {
  kjkey: string;
  courseTitle?: string;
  courseCode?: string;
  year?: number;
  term?: number;
  termLabel?: string;
}

export interface CourseScopeResult {
  mode: "single" | "all-courses";
  courses: ScopedCourse[];
}

export interface AggregateAssignmentItem {
  kjkey: string;
  courseTitle?: string;
  rtSeq: number;
  title: string;
  week?: number;
  weekLabel?: string;
  statusLabel?: string;
  statusText?: string;
  isSubmitted: boolean;
}

export interface DueAssignmentItem extends AggregateAssignmentItem {
  dueAt: string;
  dueAtIso: string;
  hoursUntilDue: number;
}

export interface UnsubmittedAssignmentsResult {
  scope: CourseScopeResult["mode"];
  count: number;
  assignments: AggregateAssignmentItem[];
}

export interface DueAssignmentsResult {
  scope: CourseScopeResult["mode"];
  days: number;
  includeSubmitted: boolean;
  count: number;
  assignments: DueAssignmentItem[];
}

interface ResolveCourseScopeOptions {
  course?: string;
  kjkey?: string;
  allCourses?: boolean;
}

interface CollectDueAssignmentsOptions {
  days?: number;
  includeSubmitted?: boolean;
}

function compareCourseTerm(
  left: { year?: number; term?: number },
  right: { year?: number; term?: number }
): number {
  const leftYear = left.year ?? 0;
  const rightYear = right.year ?? 0;
  if (leftYear !== rightYear) {
    return leftYear - rightYear;
  }

  const leftTerm = left.term ?? 0;
  const rightTerm = right.term ?? 0;
  return leftTerm - rightTerm;
}

function parseKoreanDateTime(value: string | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }

  const match = value.match(
    /(\d{4})\.(\d{2})\.(\d{2}).*?(오전|오후)\s*(\d{1,2}):(\d{2})/
  );
  if (!match) {
    return undefined;
  }

  const year = Number.parseInt(match[1] ?? "", 10);
  const month = Number.parseInt(match[2] ?? "", 10);
  const day = Number.parseInt(match[3] ?? "", 10);
  const meridiem = match[4];
  const rawHour = Number.parseInt(match[5] ?? "", 10);
  const minute = Number.parseInt(match[6] ?? "", 10);
  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    Number.isNaN(rawHour) ||
    Number.isNaN(minute)
  ) {
    return undefined;
  }

  let hour = rawHour % 12;
  if (meridiem === "오후") {
    hour += 12;
  }

  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function parseEnglishDateTime(value: string | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }

  const match = value.match(
    /(?:[A-Za-z]{3},\s+)?([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i
  );
  if (!match) {
    return undefined;
  }

  const monthName = (match[1] ?? "").toLowerCase();
  const monthMap: Record<string, number> = {
    january: 0,
    jan: 0,
    february: 1,
    feb: 1,
    march: 2,
    mar: 2,
    april: 3,
    apr: 3,
    may: 4,
    june: 5,
    jun: 5,
    july: 6,
    jul: 6,
    august: 7,
    aug: 7,
    september: 8,
    sep: 8,
    sept: 8,
    october: 9,
    oct: 9,
    november: 10,
    nov: 10,
    december: 11,
    dec: 11
  };
  const month = monthMap[monthName];
  const day = Number.parseInt(match[2] ?? "", 10);
  const year = Number.parseInt(match[3] ?? `${new Date().getFullYear()}`, 10);
  const rawHour = Number.parseInt(match[4] ?? "", 10);
  const minute = Number.parseInt(match[5] ?? "", 10);
  const meridiem = (match[6] ?? "").toUpperCase();
  if (
    month === undefined ||
    Number.isNaN(day) ||
    Number.isNaN(year) ||
    Number.isNaN(rawHour) ||
    Number.isNaN(minute)
  ) {
    return undefined;
  }

  let hour = rawHour % 12;
  if (meridiem === "PM") {
    hour += 12;
  }

  return new Date(year, month, day, hour, minute, 0, 0);
}

function parseDueDateTime(value: string | undefined): Date | undefined {
  return parseKoreanDateTime(value) ?? parseEnglishDateTime(value);
}

function hoursUntil(target: Date, base: Date): number {
  return Math.round(((target.getTime() - base.getTime()) / (60 * 60 * 1000)) * 10) / 10;
}

function toScopedCourse(course: CourseSummary): ScopedCourse {
  return {
    kjkey: course.kjkey,
    courseTitle: course.title,
    courseCode: course.courseCode,
    year: course.year,
    term: course.term,
    termLabel: course.termLabel
  };
}

function toAggregateAssignment(
  course: ScopedCourse,
  assignment: AssignmentSummary,
  courseTitleOverride?: string
): AggregateAssignmentItem {
  return {
    kjkey: course.kjkey,
    ...(courseTitleOverride ?? course.courseTitle
      ? { courseTitle: courseTitleOverride ?? course.courseTitle }
      : {}),
    rtSeq: assignment.rtSeq,
    title: assignment.title,
    ...(assignment.week !== undefined ? { week: assignment.week } : {}),
    ...(assignment.weekLabel ? { weekLabel: assignment.weekLabel } : {}),
    ...(assignment.statusLabel ? { statusLabel: assignment.statusLabel } : {}),
    ...(assignment.statusText ? { statusText: assignment.statusText } : {}),
    isSubmitted: assignment.isSubmitted
  };
}

export async function resolveHelperCourseScope(
  client: MjuLmsSsoClient,
  credentials: ResolvedLmsCredentials,
  options: ResolveCourseScopeOptions = {}
): Promise<CourseScopeResult> {
  const hasCourseSelector = Boolean(options.course?.trim() || options.kjkey?.trim());
  if (options.allCourses && hasCourseSelector) {
    throw new Error("--all-courses 와 --course/--kjkey 는 동시에 사용할 수 없습니다.");
  }

  if (options.allCourses || !hasCourseSelector) {
    const result = await listRegularTakenCourses(client, {
      userId: credentials.userId,
      password: credentials.password,
      allTerms: true
    });
    const latestCourse = result.courses.reduce<CourseSummary | undefined>((latest, course) => {
      if (!latest || compareCourseTerm(course, latest) > 0) {
        return course;
      }

      return latest;
    }, undefined);
    const latestCourses = latestCourse
      ? result.courses.filter(
          (course) =>
            course.year === latestCourse.year && course.term === latestCourse.term
        )
      : [];
    return {
      mode: "all-courses",
      courses: latestCourses.map(toScopedCourse)
    };
  }

  const resolvedCourse = await resolveCourseReference(client, credentials, {
    ...(options.course ? { course: options.course } : {}),
    ...(options.kjkey ? { kjkey: options.kjkey } : {})
  });

  return {
    mode: "single",
    courses: [
      {
        kjkey: resolvedCourse.kjkey,
        ...(resolvedCourse.courseTitle ? { courseTitle: resolvedCourse.courseTitle } : {}),
        ...(resolvedCourse.courseCode ? { courseCode: resolvedCourse.courseCode } : {}),
        ...(resolvedCourse.year !== undefined ? { year: resolvedCourse.year } : {}),
        ...(resolvedCourse.term !== undefined ? { term: resolvedCourse.term } : {}),
        ...(resolvedCourse.termLabel ? { termLabel: resolvedCourse.termLabel } : {})
      }
    ]
  };
}

export async function collectUnsubmittedAssignments(
  client: MjuLmsSsoClient,
  credentials: ResolvedLmsCredentials,
  courses: ScopedCourse[]
): Promise<AggregateAssignmentItem[]> {
  const aggregated: AggregateAssignmentItem[] = [];

  for (const course of courses) {
    const result = await listCourseAssignments(client, {
      userId: credentials.userId,
      password: credentials.password,
      kjkey: course.kjkey
    });

    aggregated.push(
      ...result.assignments
        .filter((assignment) => assignment.isSubmitted === false)
        .map((assignment) =>
          toAggregateAssignment(course, assignment, result.courseTitle)
        )
    );
  }

  return aggregated;
}

export async function collectDueAssignments(
  client: MjuLmsSsoClient,
  credentials: ResolvedLmsCredentials,
  courses: ScopedCourse[],
  options: CollectDueAssignmentsOptions = {}
): Promise<DueAssignmentItem[]> {
  const effectiveDays = options.days ?? DEFAULT_DUE_DAYS;
  const includeSubmitted = options.includeSubmitted ?? false;
  const now = new Date();
  const deadline = new Date(now.getTime() + effectiveDays * 24 * 60 * 60 * 1000);
  const aggregated: DueAssignmentItem[] = [];

  for (const course of courses) {
    const result = await listCourseAssignments(client, {
      userId: credentials.userId,
      password: credentials.password,
      kjkey: course.kjkey
    });

    const candidates = result.assignments.filter(
      (assignment) => includeSubmitted || assignment.isSubmitted === false
    );

    for (const assignment of candidates) {
      const detail = await getCourseAssignment(client, {
        userId: credentials.userId,
        password: credentials.password,
        kjkey: course.kjkey,
        rtSeq: assignment.rtSeq
      });
      const dueDate = parseDueDateTime(detail.dueAt);
      if (!detail.dueAt || !dueDate) {
        continue;
      }
      if (dueDate < now || dueDate > deadline) {
        continue;
      }

      aggregated.push({
        ...toAggregateAssignment(course, assignment, detail.courseTitle ?? result.courseTitle),
        dueAt: detail.dueAt,
        dueAtIso: dueDate.toISOString(),
        hoursUntilDue: hoursUntil(dueDate, now)
      });
    }
  }

  return aggregated.sort((left, right) => left.dueAtIso.localeCompare(right.dueAtIso));
}

export async function getUnsubmittedAssignments(
  client: MjuLmsSsoClient,
  credentials: ResolvedLmsCredentials,
  options: ResolveCourseScopeOptions = {}
): Promise<UnsubmittedAssignmentsResult> {
  const scope = await resolveHelperCourseScope(client, credentials, options);
  const assignments = await collectUnsubmittedAssignments(client, credentials, scope.courses);

  return {
    scope: scope.mode,
    count: assignments.length,
    assignments
  };
}

export async function getDueAssignments(
  client: MjuLmsSsoClient,
  credentials: ResolvedLmsCredentials,
  options: ResolveCourseScopeOptions & CollectDueAssignmentsOptions = {}
): Promise<DueAssignmentsResult> {
  const scope = await resolveHelperCourseScope(client, credentials, options);
  const effectiveDays = options.days ?? DEFAULT_DUE_DAYS;
  const includeSubmitted = options.includeSubmitted ?? false;
  const assignments = await collectDueAssignments(client, credentials, scope.courses, {
    days: effectiveDays,
    includeSubmitted
  });

  return {
    scope: scope.mode,
    days: effectiveDays,
    includeSubmitted,
    count: assignments.length,
    assignments
  };
}
