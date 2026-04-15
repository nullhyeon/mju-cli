import { getCourseAssignment, listCourseAssignments } from "./assignments.js";
import { resolveCourseReference } from "./course-resolver.js";
import { listRegularTakenCourses } from "./courses.js";
import { listCourseMaterials } from "./materials.js";
import { listCourseNotices } from "./notices.js";
import { getCourseOnlineWeek, listCourseOnlineWeeks } from "./online.js";
import type { MjuLmsSsoClient } from "./sso-client.js";
import type {
  AssignmentSummary,
  CourseSummary,
  MaterialSummary,
  NoticeSummary,
  OnlineWeekSummary
} from "./types.js";
import type { ResolvedLmsCredentials } from "../auth/types.js";

const DEFAULT_DUE_DAYS = 7;
const DEFAULT_DIGEST_LIMIT = 5;
const NOTICE_PAGE_SIZE = 50;
const MAX_NOTICE_PAGES = 20;

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

export interface AggregateNoticeItem {
  kjkey: string;
  courseTitle?: string;
  articleId: number;
  title: string;
  previewText: string;
  postedAt?: string;
  viewCount?: number;
  isUnread: boolean;
  isExpired: boolean;
}

export interface AggregateOnlineWeekItem {
  kjkey: string;
  courseTitle?: string;
  lectureWeeks: number;
  title: string;
  week?: number;
  weekLabel?: string;
  statusLabel?: string;
  statusText?: string;
  totalItems: number;
  incompleteItems: number;
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

export interface UnreadNoticesResult {
  scope: CourseScopeResult["mode"];
  count: number;
  notices: AggregateNoticeItem[];
}

export interface IncompleteOnlineWeeksResult {
  scope: CourseScopeResult["mode"];
  count: number;
  weeks: AggregateOnlineWeekItem[];
}

export interface ActionItemsResult {
  scope: CourseScopeResult["mode"];
  dueWindowDays: number;
  counts: {
    unsubmittedAssignments: number;
    dueAssignments: number;
    unreadNotices: number;
    incompleteOnlineWeeks: number;
  };
  unsubmittedAssignments: AggregateAssignmentItem[];
  dueAssignments: DueAssignmentItem[];
  unreadNotices: AggregateNoticeItem[];
  incompleteOnlineWeeks: AggregateOnlineWeekItem[];
}

export interface CourseDigestResult {
  kjkey: string;
  courseTitle?: string;
  courseCode?: string;
  year?: number;
  term?: number;
  termLabel?: string;
  days: number;
  limit: number;
  counts: {
    unreadNotices: number;
    materials: number;
    unsubmittedAssignments: number;
    dueAssignments: number;
    incompleteOnlineWeeks: number;
  };
  unreadNotices: AggregateNoticeItem[];
  materials: MaterialSummary[];
  unsubmittedAssignments: AggregateAssignmentItem[];
  dueAssignments: DueAssignmentItem[];
  incompleteOnlineWeeks: AggregateOnlineWeekItem[];
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

export interface AssignmentCourseContext {
  course: ScopedCourse;
  courseTitle?: string;
  assignments: AssignmentSummary[];
}

export interface LmsHelperDependencies {
  getCourseAssignment: typeof getCourseAssignment;
  getCourseOnlineWeek: typeof getCourseOnlineWeek;
  listCourseAssignments: typeof listCourseAssignments;
  listCourseMaterials: typeof listCourseMaterials;
  listCourseNotices: typeof listCourseNotices;
  listCourseOnlineWeeks: typeof listCourseOnlineWeeks;
  listRegularTakenCourses: typeof listRegularTakenCourses;
  resolveCourseReference: typeof resolveCourseReference;
}

const defaultHelperDependencies: LmsHelperDependencies = {
  getCourseAssignment,
  getCourseOnlineWeek,
  listCourseAssignments,
  listCourseMaterials,
  listCourseNotices,
  listCourseOnlineWeeks,
  listRegularTakenCourses,
  resolveCourseReference
};

function isIgnorableAssignmentDetailError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes("과제 상세를 읽지 못했습니다.")
  );
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

function toAggregateNotice(
  course: ScopedCourse,
  notice: NoticeSummary,
  courseTitleOverride?: string
): AggregateNoticeItem {
  return {
    kjkey: course.kjkey,
    ...(courseTitleOverride ?? course.courseTitle
      ? { courseTitle: courseTitleOverride ?? course.courseTitle }
      : {}),
    articleId: notice.articleId,
    title: notice.title,
    previewText: notice.previewText,
    ...(notice.postedAt ? { postedAt: notice.postedAt } : {}),
    ...(notice.viewCount !== undefined ? { viewCount: notice.viewCount } : {}),
    isUnread: notice.isUnread,
    isExpired: notice.isExpired
  };
}

function toAggregateOnlineWeek(
  course: ScopedCourse,
  week: OnlineWeekSummary,
  totalItems: number,
  incompleteItems: number,
  courseTitleOverride?: string
): AggregateOnlineWeekItem {
  return {
    kjkey: course.kjkey,
    ...(courseTitleOverride ?? course.courseTitle
      ? { courseTitle: courseTitleOverride ?? course.courseTitle }
      : {}),
    lectureWeeks: week.lectureWeeks,
    title: week.title,
    ...(week.week !== undefined ? { week: week.week } : {}),
    ...(week.weekLabel ? { weekLabel: week.weekLabel } : {}),
    ...(week.statusLabel ? { statusLabel: week.statusLabel } : {}),
    ...(week.statusText ? { statusText: week.statusText } : {}),
    totalItems,
    incompleteItems
  };
}

function isIncompleteOnlineWeek(items: { progressPercent?: number }[]): boolean {
  if (items.length === 0) {
    return true;
  }

  return items.some((item) => (item.progressPercent ?? 0) < 100);
}

export async function resolveHelperCourseScope(
  client: MjuLmsSsoClient,
  credentials: ResolvedLmsCredentials,
  options: ResolveCourseScopeOptions = {},
  dependencies: LmsHelperDependencies = defaultHelperDependencies
): Promise<CourseScopeResult> {
  const hasCourseSelector = Boolean(options.course?.trim() || options.kjkey?.trim());
  if (options.allCourses && hasCourseSelector) {
    throw new Error("--all-courses 와 --course/--kjkey 는 동시에 사용할 수 없습니다.");
  }

  if (options.allCourses || !hasCourseSelector) {
    const result = await dependencies.listRegularTakenCourses(client, {
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

  const resolvedCourse = await dependencies.resolveCourseReference(client, credentials, {
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

export async function loadAssignmentCourseContexts(
  client: MjuLmsSsoClient,
  credentials: ResolvedLmsCredentials,
  courses: ScopedCourse[],
  dependencies: LmsHelperDependencies = defaultHelperDependencies
): Promise<AssignmentCourseContext[]> {
  const contexts: AssignmentCourseContext[] = [];

  for (const course of courses) {
    const result = await dependencies.listCourseAssignments(client, {
      userId: credentials.userId,
      password: credentials.password,
      kjkey: course.kjkey
    });

    contexts.push({
      course,
      ...(result.courseTitle ? { courseTitle: result.courseTitle } : {}),
      assignments: result.assignments
    });
  }

  return contexts;
}

export function collectUnsubmittedAssignmentsFromContexts(
  contexts: AssignmentCourseContext[]
): AggregateAssignmentItem[] {
  return contexts.flatMap((context) =>
    context.assignments
      .filter((assignment) => assignment.isSubmitted === false)
      .map((assignment) =>
        toAggregateAssignment(context.course, assignment, context.courseTitle)
      )
  );
}

export async function collectUnsubmittedAssignments(
  client: MjuLmsSsoClient,
  credentials: ResolvedLmsCredentials,
  courses: ScopedCourse[],
  dependencies: LmsHelperDependencies = defaultHelperDependencies
): Promise<AggregateAssignmentItem[]> {
  const contexts = await loadAssignmentCourseContexts(client, credentials, courses, dependencies);
  return collectUnsubmittedAssignmentsFromContexts(contexts);
}

async function listAllNoticesForCourse(
  client: MjuLmsSsoClient,
  credentials: ResolvedLmsCredentials,
  course: ScopedCourse,
  dependencies: LmsHelperDependencies = defaultHelperDependencies
): Promise<{ courseTitle?: string; notices: NoticeSummary[] }> {
  const notices: NoticeSummary[] = [];
  const seen = new Set<number>();
  let discoveredCourseTitle: string | undefined;

  for (let page = 1; page <= MAX_NOTICE_PAGES; page += 1) {
    const result = await dependencies.listCourseNotices(client, {
      userId: credentials.userId,
      password: credentials.password,
      kjkey: course.kjkey,
      page,
      pageSize: NOTICE_PAGE_SIZE
    });

    discoveredCourseTitle = result.courseTitle ?? discoveredCourseTitle;
    const newItems = result.notices.filter((notice) => {
      if (seen.has(notice.articleId)) {
        return false;
      }

      seen.add(notice.articleId);
      return true;
    });

    notices.push(...newItems);

    if (result.notices.length < NOTICE_PAGE_SIZE || newItems.length === 0) {
      break;
    }
  }

  return {
    ...(discoveredCourseTitle ? { courseTitle: discoveredCourseTitle } : {}),
    notices
  };
}

export async function collectUnreadNotices(
  client: MjuLmsSsoClient,
  credentials: ResolvedLmsCredentials,
  courses: ScopedCourse[],
  dependencies: LmsHelperDependencies = defaultHelperDependencies
): Promise<AggregateNoticeItem[]> {
  const aggregated: AggregateNoticeItem[] = [];

  for (const course of courses) {
    const result = await listAllNoticesForCourse(client, credentials, course, dependencies);
    aggregated.push(
      ...result.notices
        .filter((notice) => notice.isUnread)
        .map((notice) => toAggregateNotice(course, notice, result.courseTitle))
    );
  }

  return aggregated;
}

export async function collectIncompleteOnlineWeeks(
  client: MjuLmsSsoClient,
  credentials: ResolvedLmsCredentials,
  courses: ScopedCourse[],
  dependencies: LmsHelperDependencies = defaultHelperDependencies
): Promise<AggregateOnlineWeekItem[]> {
  const aggregated: AggregateOnlineWeekItem[] = [];

  for (const course of courses) {
    const result = await dependencies.listCourseOnlineWeeks(client, {
      userId: credentials.userId,
      password: credentials.password,
      kjkey: course.kjkey
    });

    for (const week of result.weeks) {
      const detail = await dependencies.getCourseOnlineWeek(client, {
        userId: credentials.userId,
        password: credentials.password,
        kjkey: course.kjkey,
        lectureWeeks: week.lectureWeeks
      });
      if (!isIncompleteOnlineWeek(detail.items)) {
        continue;
      }

      const incompleteItems = detail.items.filter(
        (item) => (item.progressPercent ?? 0) < 100
      ).length;
      aggregated.push(
        toAggregateOnlineWeek(
          course,
          week,
          detail.items.length,
          incompleteItems,
          detail.courseTitle ?? result.courseTitle
        )
      );
    }
  }

  return aggregated;
}

export async function collectDueAssignmentsFromContexts(
  client: MjuLmsSsoClient,
  credentials: ResolvedLmsCredentials,
  contexts: AssignmentCourseContext[],
  options: CollectDueAssignmentsOptions = {},
  dependencies: LmsHelperDependencies = defaultHelperDependencies
): Promise<DueAssignmentItem[]> {
  const effectiveDays = options.days ?? DEFAULT_DUE_DAYS;
  const includeSubmitted = options.includeSubmitted ?? false;
  const now = new Date();
  const deadline = new Date(now.getTime() + effectiveDays * 24 * 60 * 60 * 1000);
  const aggregated: DueAssignmentItem[] = [];

  for (const context of contexts) {
    const candidates = context.assignments.filter(
      (assignment) => includeSubmitted || assignment.isSubmitted === false
    );

    for (const assignment of candidates) {
      let detail;
      try {
        detail = await dependencies.getCourseAssignment(client, {
          userId: credentials.userId,
          password: credentials.password,
          kjkey: context.course.kjkey,
          rtSeq: assignment.rtSeq
        });
      } catch (error) {
        if (isIgnorableAssignmentDetailError(error)) {
          continue;
        }

        throw error;
      }

      const dueDate = parseDueDateTime(detail.dueAt);
      if (!detail.dueAt || !dueDate) {
        continue;
      }
      if (dueDate < now || dueDate > deadline) {
        continue;
      }

      aggregated.push({
        ...toAggregateAssignment(
          context.course,
          assignment,
          detail.courseTitle ?? context.courseTitle
        ),
        dueAt: detail.dueAt,
        dueAtIso: dueDate.toISOString(),
        hoursUntilDue: hoursUntil(dueDate, now)
      });
    }
  }

  return aggregated.sort((left, right) => left.dueAtIso.localeCompare(right.dueAtIso));
}

export async function collectDueAssignments(
  client: MjuLmsSsoClient,
  credentials: ResolvedLmsCredentials,
  courses: ScopedCourse[],
  options: CollectDueAssignmentsOptions = {},
  dependencies: LmsHelperDependencies = defaultHelperDependencies
): Promise<DueAssignmentItem[]> {
  const contexts = await loadAssignmentCourseContexts(client, credentials, courses, dependencies);
  return collectDueAssignmentsFromContexts(client, credentials, contexts, options, dependencies);
}

export async function getUnsubmittedAssignments(
  client: MjuLmsSsoClient,
  credentials: ResolvedLmsCredentials,
  options: ResolveCourseScopeOptions = {},
  dependencies: LmsHelperDependencies = defaultHelperDependencies
): Promise<UnsubmittedAssignmentsResult> {
  const scope = await resolveHelperCourseScope(client, credentials, options, dependencies);
  const assignments = await collectUnsubmittedAssignments(
    client,
    credentials,
    scope.courses,
    dependencies
  );

  return {
    scope: scope.mode,
    count: assignments.length,
    assignments
  };
}

export async function getDueAssignments(
  client: MjuLmsSsoClient,
  credentials: ResolvedLmsCredentials,
  options: ResolveCourseScopeOptions & CollectDueAssignmentsOptions = {},
  dependencies: LmsHelperDependencies = defaultHelperDependencies
): Promise<DueAssignmentsResult> {
  const scope = await resolveHelperCourseScope(client, credentials, options, dependencies);
  const effectiveDays = options.days ?? DEFAULT_DUE_DAYS;
  const includeSubmitted = options.includeSubmitted ?? false;
  const assignments = await collectDueAssignments(
    client,
    credentials,
    scope.courses,
    {
      days: effectiveDays,
      includeSubmitted
    },
    dependencies
  );

  return {
    scope: scope.mode,
    days: effectiveDays,
    includeSubmitted,
    count: assignments.length,
    assignments
  };
}

export async function getUnreadNotices(
  client: MjuLmsSsoClient,
  credentials: ResolvedLmsCredentials,
  options: ResolveCourseScopeOptions = {},
  dependencies: LmsHelperDependencies = defaultHelperDependencies
): Promise<UnreadNoticesResult> {
  const scope = await resolveHelperCourseScope(client, credentials, options, dependencies);
  const notices = await collectUnreadNotices(client, credentials, scope.courses, dependencies);

  return {
    scope: scope.mode,
    count: notices.length,
    notices
  };
}

export async function getIncompleteOnlineWeeks(
  client: MjuLmsSsoClient,
  credentials: ResolvedLmsCredentials,
  options: ResolveCourseScopeOptions = {},
  dependencies: LmsHelperDependencies = defaultHelperDependencies
): Promise<IncompleteOnlineWeeksResult> {
  const scope = await resolveHelperCourseScope(client, credentials, options, dependencies);
  const weeks = await collectIncompleteOnlineWeeks(
    client,
    credentials,
    scope.courses,
    dependencies
  );

  return {
    scope: scope.mode,
    count: weeks.length,
    weeks
  };
}

export async function getActionItems(
  client: MjuLmsSsoClient,
  credentials: ResolvedLmsCredentials,
  options: ResolveCourseScopeOptions = {},
  dependencies: LmsHelperDependencies = defaultHelperDependencies
): Promise<ActionItemsResult> {
  const scope = await resolveHelperCourseScope(client, credentials, options, dependencies);
  const assignmentContexts = await loadAssignmentCourseContexts(
    client,
    credentials,
    scope.courses,
    dependencies
  );
  const unsubmittedAssignments = collectUnsubmittedAssignmentsFromContexts(assignmentContexts);
  const dueAssignments = await collectDueAssignmentsFromContexts(
    client,
    credentials,
    assignmentContexts,
    {
      days: DEFAULT_DUE_DAYS,
      includeSubmitted: false
    },
    dependencies
  );
  const unreadNotices = await collectUnreadNotices(
    client,
    credentials,
    scope.courses,
    dependencies
  );
  const incompleteOnlineWeeks = await collectIncompleteOnlineWeeks(
    client,
    credentials,
    scope.courses,
    dependencies
  );

  return {
    scope: scope.mode,
    dueWindowDays: DEFAULT_DUE_DAYS,
    counts: {
      unsubmittedAssignments: unsubmittedAssignments.length,
      dueAssignments: dueAssignments.length,
      unreadNotices: unreadNotices.length,
      incompleteOnlineWeeks: incompleteOnlineWeeks.length
    },
    unsubmittedAssignments,
    dueAssignments,
    unreadNotices,
    incompleteOnlineWeeks
  };
}

export async function getCourseDigest(
  client: MjuLmsSsoClient,
  credentials: ResolvedLmsCredentials,
  options: {
    course?: string;
    kjkey?: string;
    days?: number;
    limit?: number;
  },
  dependencies: LmsHelperDependencies = defaultHelperDependencies
): Promise<CourseDigestResult> {
  if (!options.course?.trim() && !options.kjkey?.trim()) {
    throw new Error("+digest 는 --course 또는 --kjkey 가 필요합니다.");
  }

  const resolvedCourse = await dependencies.resolveCourseReference(client, credentials, {
    ...(options.course ? { course: options.course } : {}),
    ...(options.kjkey ? { kjkey: options.kjkey } : {})
  });
  const scopedCourse: ScopedCourse = {
    kjkey: resolvedCourse.kjkey,
    ...(resolvedCourse.courseTitle ? { courseTitle: resolvedCourse.courseTitle } : {}),
    ...(resolvedCourse.courseCode ? { courseCode: resolvedCourse.courseCode } : {}),
    ...(resolvedCourse.year !== undefined ? { year: resolvedCourse.year } : {}),
    ...(resolvedCourse.term !== undefined ? { term: resolvedCourse.term } : {}),
    ...(resolvedCourse.termLabel ? { termLabel: resolvedCourse.termLabel } : {})
  };
  const digestDays = options.days ?? DEFAULT_DUE_DAYS;
  const digestLimit = options.limit ?? DEFAULT_DIGEST_LIMIT;

  const [assignmentContext] = await loadAssignmentCourseContexts(
    client,
    credentials,
    [scopedCourse],
    dependencies
  );
  const allUnreadNotices = await collectUnreadNotices(
    client,
    credentials,
    [scopedCourse],
    dependencies
  );
  const materialsResult = await dependencies.listCourseMaterials(client, {
    userId: credentials.userId,
    password: credentials.password,
    kjkey: scopedCourse.kjkey
  });
  const dueAssignments = await collectDueAssignmentsFromContexts(
    client,
    credentials,
    assignmentContext ? [assignmentContext] : [],
    {
      days: digestDays,
      includeSubmitted: false
    },
    dependencies
  );
  const incompleteOnlineWeeks = await collectIncompleteOnlineWeeks(client, credentials, [
    scopedCourse
  ], dependencies);
  const unsubmittedAssignments = collectUnsubmittedAssignmentsFromContexts(
    assignmentContext ? [assignmentContext] : []
  );
  const courseTitle =
    assignmentContext?.courseTitle ??
    materialsResult.courseTitle ??
    allUnreadNotices[0]?.courseTitle ??
    dueAssignments[0]?.courseTitle ??
    incompleteOnlineWeeks[0]?.courseTitle ??
    scopedCourse.courseTitle;

  return {
    kjkey: scopedCourse.kjkey,
    ...(courseTitle ? { courseTitle } : {}),
    ...(scopedCourse.courseCode ? { courseCode: scopedCourse.courseCode } : {}),
    ...(scopedCourse.year !== undefined ? { year: scopedCourse.year } : {}),
    ...(scopedCourse.term !== undefined ? { term: scopedCourse.term } : {}),
    ...(scopedCourse.termLabel ? { termLabel: scopedCourse.termLabel } : {}),
    days: digestDays,
    limit: digestLimit,
    counts: {
      unreadNotices: allUnreadNotices.length,
      materials: materialsResult.materials.length,
      unsubmittedAssignments: unsubmittedAssignments.length,
      dueAssignments: dueAssignments.length,
      incompleteOnlineWeeks: incompleteOnlineWeeks.length
    },
    unreadNotices: allUnreadNotices.slice(0, digestLimit),
    materials: materialsResult.materials.slice(0, digestLimit),
    unsubmittedAssignments: unsubmittedAssignments.slice(0, digestLimit),
    dueAssignments: dueAssignments.slice(0, digestLimit),
    incompleteOnlineWeeks: incompleteOnlineWeeks.slice(0, digestLimit)
  };
}
