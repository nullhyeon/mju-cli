import type { ActionItemsResult } from "../lms/helpers.js";
import type { MsiGraduationRequirementsResult } from "../msi/types.js";
import type { UcheckCourseAttendanceResult } from "../ucheck/types.js";
import type { LibraryReservationTimelineItem } from "../library/helpers.js";
import type {
  LibraryRoomReservationSummary,
  LibrarySeatReservationSummary,
  LibraryUserInfo
} from "../library/types.js";

type TableCell = string | number | boolean | null | undefined;
type TableRow = Record<string, TableCell>;

type KnownTableFormatter = (data: unknown) => boolean;

interface LibraryMyReservationsResult {
  user: LibraryUserInfo;
  counts: {
    studyRooms: number;
    seats: number;
    total: number;
  };
  studyRoomReservations: LibraryRoomReservationSummary[];
  seatReservations: LibrarySeatReservationSummary[];
  reservations: LibraryReservationTimelineItem[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPrimitive(value: unknown): value is string | number | boolean | null | undefined {
  return (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function renderTableValue(value: unknown): TableCell {
  if (isPrimitive(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "";
    }

    if (value.every(isPrimitive)) {
      return value.map((item) => String(item ?? "")).join(", ");
    }

    return `${value.length} items`;
  }

  if (isRecord(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return "";
    }

    const preview = entries
      .slice(0, 3)
      .map(([key, item]) => `${key}=${renderTableValue(item) ?? ""}`)
      .join(", ");
    return entries.length > 3 ? `${preview} +${entries.length - 3}` : preview;
  }

  return String(value);
}

function flattenRow(value: Record<string, unknown>): TableRow {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, renderTableValue(item)])
  );
}

function printSection(title: string): void {
  console.log(`\n[${title}]`);
}

function printRows(title: string, rows: TableRow[]): void {
  printSection(title);
  if (rows.length === 0) {
    console.log("(none)");
    return;
  }

  console.table(rows);
}

function printSingleRow(title: string, row: TableRow): void {
  printRows(title, [row]);
}

function printStringList(title: string, values: string[]): void {
  printSection(title);
  if (values.length === 0) {
    console.log("(none)");
    return;
  }

  console.table(values.map((value, index) => ({ index: index + 1, value })));
}

function isActionItemsResult(data: unknown): data is ActionItemsResult {
  return (
    isRecord(data) &&
    isRecord(data.counts) &&
    Array.isArray(data.unsubmittedAssignments) &&
    Array.isArray(data.dueAssignments) &&
    Array.isArray(data.unreadNotices) &&
    Array.isArray(data.incompleteOnlineWeeks)
  );
}

function isUcheckCourseAttendanceResult(data: unknown): data is UcheckCourseAttendanceResult {
  return (
    isRecord(data) &&
    isRecord(data.course) &&
    isRecord(data.summary) &&
    Array.isArray(data.sessions) &&
    typeof data.studentName === "string"
  );
}

function isMsiGraduationRequirementsResult(
  data: unknown
): data is MsiGraduationRequirementsResult {
  return (
    isRecord(data) &&
    isRecord(data.studentInfo) &&
    Array.isArray(data.earnedCredits) &&
    Array.isArray(data.requiredCredits) &&
    Array.isArray(data.creditGaps) &&
    Array.isArray(data.notes)
  );
}

function isLibraryMyReservationsResult(data: unknown): data is LibraryMyReservationsResult {
  return (
    isRecord(data) &&
    isRecord(data.user) &&
    isRecord(data.counts) &&
    Array.isArray(data.studyRoomReservations) &&
    Array.isArray(data.seatReservations) &&
    Array.isArray(data.reservations)
  );
}

function printActionItemsResult(data: ActionItemsResult): boolean {
  printSingleRow("요약", {
    scope: data.scope,
    dueWindowDays: data.dueWindowDays,
    unsubmittedAssignments: data.counts.unsubmittedAssignments,
    dueAssignments: data.counts.dueAssignments,
    unreadNotices: data.counts.unreadNotices,
    incompleteOnlineWeeks: data.counts.incompleteOnlineWeeks
  });

  printRows(
    "미제출 과제",
    data.unsubmittedAssignments.map((item) => ({
      courseTitle: item.courseTitle ?? "",
      title: item.title,
      weekLabel: item.weekLabel ?? "",
      statusLabel: item.statusLabel ?? "",
      statusText: item.statusText ?? ""
    }))
  );

  printRows(
    "마감 임박 과제",
    data.dueAssignments.map((item) => ({
      courseTitle: item.courseTitle ?? "",
      title: item.title,
      dueAt: item.dueAt,
      hoursUntilDue: item.hoursUntilDue,
      statusLabel: item.statusLabel ?? ""
    }))
  );

  printRows(
    "안 읽은 공지",
    data.unreadNotices.map((item) => ({
      courseTitle: item.courseTitle ?? "",
      title: item.title,
      postedAt: item.postedAt ?? "",
      previewText: item.previewText
    }))
  );

  printRows(
    "미완료 온라인 학습",
    data.incompleteOnlineWeeks.map((item) => ({
      courseTitle: item.courseTitle ?? "",
      title: item.title,
      weekLabel: item.weekLabel ?? "",
      incompleteItems: item.incompleteItems,
      totalItems: item.totalItems,
      statusLabel: item.statusLabel ?? ""
    }))
  );

  return true;
}

function printUcheckCourseAttendanceResult(data: UcheckCourseAttendanceResult): boolean {
  printSingleRow("출석 요약", {
    studentName: data.studentName,
    studentNo: data.studentNo ?? "",
    resolvedBy: data.resolvedBy,
    lectureNo: data.course.lectureNo,
    courseTitle: data.course.courseTitle,
    summaryAttended: data.summary.attendedCount,
    summaryTardy: data.summary.tardyCount,
    summaryEarlyLeave: data.summary.earlyLeaveCount,
    summaryAbsent: data.summary.absentCount,
    totalSessions: data.totalSessions,
    completedSessions: data.completedSessions
  });

  printRows(
    "회차별 출석",
    data.sessions.map((session) => ({
      week: session.week,
      classNo: session.classNo,
      sessionLabel: session.sessionLabel,
      dateLabel: session.dateLabel ?? session.date ?? "",
      timeRange: session.timeRange ?? "",
      classroom: session.classroom ?? "",
      statusLabel: session.statusLabel ?? "",
      attendAt: session.attendAt ?? "",
      leaveAt: session.leaveAt ?? "",
      isPast: session.isPast
    }))
  );

  return true;
}

function printMsiGraduationRequirementsResult(
  data: MsiGraduationRequirementsResult
): boolean {
  printSingleRow("학생 정보", flattenRow(data.studentInfo));

  printRows(
    "학점 부족 현황",
    data.creditGaps.map((item) => ({
      label: item.label,
      earned: item.earned ?? "",
      required: item.required ?? "",
      gap: item.gap ?? ""
    }))
  );

  printRows(
    "이수 학점",
    data.earnedCredits.map((item) => ({
      label: item.label,
      credits: item.credits ?? "",
      rawValue: item.rawValue
    }))
  );

  printRows(
    "요구 학점",
    data.requiredCredits.map((item) => ({
      label: item.label,
      credits: item.credits ?? "",
      rawValue: item.rawValue
    }))
  );

  printStringList("비고", data.notes);
  return true;
}

function printLibraryMyReservationsResult(
  data: LibraryMyReservationsResult
): boolean {
  printSingleRow("예약 요약", {
    userName: data.user.name,
    memberNo: data.user.memberNo,
    branchAlias: data.user.branchAlias ?? data.user.branchName ?? "",
    studyRooms: data.counts.studyRooms,
    seats: data.counts.seats,
    total: data.counts.total
  });

  printRows(
    "예약 타임라인",
    data.reservations.map((item) => ({
      kind: item.kind,
      roomName: item.roomName,
      seatCode: item.seatCode ?? "",
      campusAlias: item.campusAlias ?? "",
      beginTime: item.beginTime ?? "",
      endTime: item.endTime ?? "",
      stateLabel: item.stateLabel ?? "",
      isCheckinable:
        item.isCheckinable === undefined ? "" : item.isCheckinable,
      companionCount: item.companionCount ?? ""
    }))
  );

  return true;
}

const knownFormatters: KnownTableFormatter[] = [
  (data) => (isActionItemsResult(data) ? printActionItemsResult(data) : false),
  (data) =>
    isUcheckCourseAttendanceResult(data)
      ? printUcheckCourseAttendanceResult(data)
      : false,
  (data) =>
    isMsiGraduationRequirementsResult(data)
      ? printMsiGraduationRequirementsResult(data)
      : false,
  (data) =>
    isLibraryMyReservationsResult(data)
      ? printLibraryMyReservationsResult(data)
      : false
];

export function printKnownTableFormat(data: unknown): boolean {
  for (const formatter of knownFormatters) {
    if (formatter(data)) {
      return true;
    }
  }

  return false;
}

export function printGenericTable(data: unknown): void {
  if (Array.isArray(data)) {
    if (data.length === 0) {
      console.log("(empty)");
      return;
    }

    if (data.every(isRecord)) {
      console.table(data.map((item) => flattenRow(item)));
      return;
    }

    console.table(
      data.map((item, index) => ({
        index,
        value: renderTableValue(item)
      }))
    );
    return;
  }

  if (isRecord(data)) {
    console.table([flattenRow(data)]);
    return;
  }

  console.log(String(data));
}
