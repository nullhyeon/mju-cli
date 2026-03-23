export interface UcheckYearTerm {
  lectureYear: number;
  lectureTerm: number;
}

export interface UcheckAccountInfo {
  accountId: string;
  accountRole: string;
  name: string;
  studentNo?: string;
  baseYearTerm: UcheckYearTerm;
  availableYearTerms: UcheckYearTerm[];
}

export interface UcheckLectureSummary {
  lectureNo: number;
  lectureYear: number;
  lectureTerm: number;
  courseCode: string;
  courseTitle: string;
  classCode?: string;
  professor?: string;
  department?: string;
  scheduleSummary?: string;
}

export interface UcheckAttendanceSummary {
  attendedCount: number;
  tardyCount: number;
  earlyLeaveCount: number;
  absentCount: number;
}

export interface UcheckAttendanceSession {
  week: number;
  classNo: number;
  sessionLabel: string;
  date?: string;
  dateLabel?: string;
  timeRange?: string;
  classroom?: string;
  isPast: boolean;
  statusCode?: string;
  statusLabel?: string;
  attendAt?: string;
  leaveAt?: string;
}

export interface UcheckCourseAttendanceResult {
  studentNo?: string;
  studentName: string;
  resolvedBy: "lecture-no" | "course-title" | "course-code" | "course-search";
  course: UcheckLectureSummary;
  summary: UcheckAttendanceSummary;
  totalSessions: number;
  completedSessions: number;
  sessions: UcheckAttendanceSession[];
}
