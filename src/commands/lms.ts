import fs from "node:fs/promises";

import { Command } from "commander";

import { AuthManager } from "../auth/auth-manager.js";
import { printData } from "../output/print.js";
import type { GlobalOptions } from "../types.js";
import { resolveLmsRuntimeConfig } from "../lms/config.js";
import { checkAssignmentSubmission } from "../lms/assignment-submission-check.js";
import { getCourseAssignment, listCourseAssignments } from "../lms/assignments.js";
import {
  downloadAssignmentAttachment,
  downloadAssignmentAttachments,
  downloadNoticeAttachment,
  downloadNoticeAttachments
} from "../lms/attachment-downloads.js";
import { listRegularTakenCourses } from "../lms/courses.js";
import { resolveCourseReference } from "../lms/course-resolver.js";
import {
  getActionItems,
  getCourseDigest,
  getDueAssignments,
  getIncompleteOnlineWeeks,
  getUnreadNotices,
  getUnsubmittedAssignments
} from "../lms/helpers.js";
import { getCourseMaterial, listCourseMaterials } from "../lms/materials.js";
import { getCourseNotice, listCourseNotices } from "../lms/notices.js";
import { getCourseOnlineWeek, listCourseOnlineWeeks } from "../lms/online.js";
import { MjuLmsSsoClient } from "../lms/sso-client.js";

function parseOptionalInt(value: string | undefined, label: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`${label} 는 정수여야 합니다.`);
  }

  return parsed;
}

async function createLmsClientWithCredentials(globals: GlobalOptions): Promise<{
  config: ReturnType<typeof resolveLmsRuntimeConfig>;
  client: MjuLmsSsoClient;
  credentials: Awaited<ReturnType<AuthManager["resolveCredentials"]>>;
}> {
  const config = resolveLmsRuntimeConfig({ appDataDir: globals.appDir });
  const authManager = new AuthManager(config);
  const credentials = await authManager.resolveCredentials();
  const client = new MjuLmsSsoClient(config);

  return { config, client, credentials };
}

function parseCommaSeparatedList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parsePositiveIntList(value: string | undefined, label: string): number[] {
  return parseCommaSeparatedList(value).map((item) => {
    const parsed = Number.parseInt(item, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      throw new Error(`${label} 는 1 이상의 정수 목록이어야 합니다.`);
    }

    return parsed;
  });
}

async function resolveDraftText(
  inlineText: string | undefined,
  textFilePath: string | undefined
): Promise<string | undefined> {
  const text = inlineText?.trim();
  const filePath = textFilePath?.trim();

  if (text && filePath) {
    throw new Error("text 와 text-file-path 는 동시에 사용할 수 없습니다.");
  }

  if (filePath) {
    return fs.readFile(filePath, "utf8");
  }

  return text || undefined;
}

export function createLmsCommand(getGlobals: () => GlobalOptions): Command {
  const lms = new Command("lms").description(
    "Courses, notices, materials, assignments, and online learning"
  );

  lms
    .command("summary")
    .description("Show the planned command surface for LMS")
    .action(() => {
      const globals = getGlobals();
      printData(
        {
          service: "lms",
          implemented: {
            courses: ["list"],
            notices: ["list", "get"],
            materials: ["list", "get"],
            assignments: ["list", "get", "check-submission"],
            online: ["list", "get"],
            attachments: ["download", "download-bulk"],
            helpers: [
              "+unsubmitted",
              "+due-assignments",
              "+unread-notices",
              "+incomplete-online",
              "+action-items",
              "+digest"
            ]
          },
          planned: {
            assignments: ["submit", "delete-submission"]
          }
        },
        globals.format
      );
    });

  const courses = new Command("courses").description("Read LMS course information");

  courses
    .command("list")
    .description("List regular taken courses")
    .option("--year <year>", "filter by year")
    .option("--term <term>", "filter by term")
    .option("--search <query>", "search by course title, course code, or professor")
    .option("--all-terms", "search across all available terms")
    .action(async (options: { year?: string; term?: string; search?: string; allTerms?: boolean }) => {
      const globals = getGlobals();
      const { client, credentials } = await createLmsClientWithCredentials(globals);
      const result = await listRegularTakenCourses(client, {
        userId: credentials.userId,
        password: credentials.password,
        ...(parseOptionalInt(options.year, "year") !== undefined
          ? { year: parseOptionalInt(options.year, "year") }
          : {}),
        ...(parseOptionalInt(options.term, "term") !== undefined
          ? { term: parseOptionalInt(options.term, "term") }
          : {}),
        ...(options.search ? { search: options.search } : {}),
        ...(options.allTerms ? { allTerms: true } : {})
      });

      printData(result, globals.format);
    });

  const notices = new Command("notices").description("Read LMS course notices");

  notices
    .command("list")
    .description("List notices for a course")
    .option("--course <query>", "course title, course code, or kjkey")
    .option("--kjkey <kjkey>", "explicit course kjkey")
    .option("--page <page>", "page number")
    .option("--page-size <size>", "page size")
    .option("--search <query>", "search notice text")
    .action(
      async (options: {
        course?: string;
        kjkey?: string;
        page?: string;
        pageSize?: string;
        search?: string;
      }) => {
        const globals = getGlobals();
        const { client, credentials } = await createLmsClientWithCredentials(globals);
        const resolvedCourse = await resolveCourseReference(client, credentials, {
          course: options.course,
          kjkey: options.kjkey
        });
        const result = await listCourseNotices(client, {
          userId: credentials.userId,
          password: credentials.password,
          kjkey: resolvedCourse.kjkey,
          ...(parseOptionalInt(options.page, "page") !== undefined
            ? { page: parseOptionalInt(options.page, "page") }
            : {}),
          ...(parseOptionalInt(options.pageSize, "page-size") !== undefined
            ? { pageSize: parseOptionalInt(options.pageSize, "page-size") }
            : {}),
          ...(options.search ? { search: options.search } : {})
        });

        printData(result, globals.format);
      }
    );

  notices
    .command("get")
    .description("Get a specific notice for a course")
    .option("--course <query>", "course title, course code, or kjkey")
    .option("--kjkey <kjkey>", "explicit course kjkey")
    .requiredOption("--article-id <id>", "notice article id")
    .action(async (options: { course?: string; kjkey?: string; articleId: string }) => {
      const globals = getGlobals();
      const { client, credentials } = await createLmsClientWithCredentials(globals);
      const resolvedCourse = await resolveCourseReference(client, credentials, {
        course: options.course,
        kjkey: options.kjkey
      });
      const articleId = parseOptionalInt(options.articleId, "article-id");
      if (articleId === undefined) {
        throw new Error("article-id 는 필수입니다.");
      }

      const result = await getCourseNotice(client, {
        userId: credentials.userId,
        password: credentials.password,
        kjkey: resolvedCourse.kjkey,
        articleId
      });

      printData(result, globals.format);
    });

  const materials = new Command("materials").description("Read LMS course materials");

  materials
    .command("list")
    .description("List materials for a course")
    .option("--course <query>", "course title, course code, or kjkey")
    .option("--kjkey <kjkey>", "explicit course kjkey")
    .option("--search <query>", "search material text")
    .action(async (options: { course?: string; kjkey?: string; search?: string }) => {
      const globals = getGlobals();
      const { client, credentials } = await createLmsClientWithCredentials(globals);
      const resolvedCourse = await resolveCourseReference(client, credentials, {
        course: options.course,
        kjkey: options.kjkey
      });
      const result = await listCourseMaterials(client, {
        userId: credentials.userId,
        password: credentials.password,
        kjkey: resolvedCourse.kjkey,
        ...(options.search ? { search: options.search } : {})
      });

      printData(result, globals.format);
    });

  materials
    .command("get")
    .description("Get a specific material for a course")
    .option("--course <query>", "course title, course code, or kjkey")
    .option("--kjkey <kjkey>", "explicit course kjkey")
    .requiredOption("--article-id <id>", "material article id")
    .action(async (options: { course?: string; kjkey?: string; articleId: string }) => {
      const globals = getGlobals();
      const { client, credentials } = await createLmsClientWithCredentials(globals);
      const resolvedCourse = await resolveCourseReference(client, credentials, {
        course: options.course,
        kjkey: options.kjkey
      });
      const articleId = parseOptionalInt(options.articleId, "article-id");
      if (articleId === undefined) {
        throw new Error("article-id 는 필수입니다.");
      }

      const result = await getCourseMaterial(client, {
        userId: credentials.userId,
        password: credentials.password,
        kjkey: resolvedCourse.kjkey,
        articleId
      });

      printData(result, globals.format);
    });

  const assignments = new Command("assignments").description("Read LMS course assignments");

  assignments
    .command("list")
    .description("List assignments for a course")
    .option("--course <query>", "course title, course code, or kjkey")
    .option("--kjkey <kjkey>", "explicit course kjkey")
    .option("--week <week>", "filter by lecture week")
    .action(async (options: { course?: string; kjkey?: string; week?: string }) => {
      const globals = getGlobals();
      const { client, credentials } = await createLmsClientWithCredentials(globals);
      const resolvedCourse = await resolveCourseReference(client, credentials, {
        course: options.course,
        kjkey: options.kjkey
      });
      const week = parseOptionalInt(options.week, "week");
      const result = await listCourseAssignments(client, {
        userId: credentials.userId,
        password: credentials.password,
        kjkey: resolvedCourse.kjkey,
        ...(week !== undefined ? { week } : {})
      });

      printData(result, globals.format);
    });

  assignments
    .command("get")
    .description("Get a specific assignment for a course")
    .option("--course <query>", "course title, course code, or kjkey")
    .option("--kjkey <kjkey>", "explicit course kjkey")
    .requiredOption("--rt-seq <id>", "assignment rt_seq")
    .action(async (options: { course?: string; kjkey?: string; rtSeq: string }) => {
      const globals = getGlobals();
      const { client, credentials } = await createLmsClientWithCredentials(globals);
      const resolvedCourse = await resolveCourseReference(client, credentials, {
        course: options.course,
        kjkey: options.kjkey
      });
      const rtSeq = parseOptionalInt(options.rtSeq, "rt-seq");
      if (rtSeq === undefined) {
        throw new Error("rt-seq 는 필수입니다.");
      }

      const result = await getCourseAssignment(client, {
        userId: credentials.userId,
        password: credentials.password,
        kjkey: resolvedCourse.kjkey,
        rtSeq
      });

      printData(result, globals.format);
    });

  assignments
    .command("check-submission")
    .description("Check whether an assignment submission can proceed")
    .option("--course <query>", "course title, course code, or kjkey")
    .option("--kjkey <kjkey>", "explicit course kjkey")
    .requiredOption("--rt-seq <id>", "assignment rt_seq")
    .option("--text <value>", "draft text to validate")
    .option("--text-file-path <path>", "read draft text from a local file")
    .option("--local-files <paths>", "comma-separated local attachment paths")
    .action(
      async (options: {
        course?: string;
        kjkey?: string;
        rtSeq: string;
        text?: string;
        textFilePath?: string;
        localFiles?: string;
      }) => {
        const globals = getGlobals();
        const { client, credentials } = await createLmsClientWithCredentials(globals);
        const resolvedCourse = await resolveCourseReference(client, credentials, {
          course: options.course,
          kjkey: options.kjkey
        });
        const rtSeq = parseOptionalInt(options.rtSeq, "rt-seq");
        if (rtSeq === undefined) {
          throw new Error("rt-seq 는 필수입니다.");
        }
        const draftText = await resolveDraftText(options.text, options.textFilePath);

        const result = await checkAssignmentSubmission(client, {
          userId: credentials.userId,
          password: credentials.password,
          kjkey: resolvedCourse.kjkey,
          rtSeq,
          ...(draftText ? { text: draftText } : {}),
          ...(options.localFiles
            ? { localFiles: parseCommaSeparatedList(options.localFiles) }
            : {})
        });

        printData(result, globals.format);
      }
    );

  const online = new Command("online").description("Read LMS online learning weeks");

  online
    .command("list")
    .description("List online learning weeks for a course")
    .option("--course <query>", "course title, course code, or kjkey")
    .option("--kjkey <kjkey>", "explicit course kjkey")
    .action(async (options: { course?: string; kjkey?: string }) => {
      const globals = getGlobals();
      const { client, credentials } = await createLmsClientWithCredentials(globals);
      const resolvedCourse = await resolveCourseReference(client, credentials, {
        course: options.course,
        kjkey: options.kjkey
      });
      const result = await listCourseOnlineWeeks(client, {
        userId: credentials.userId,
        password: credentials.password,
        kjkey: resolvedCourse.kjkey
      });

      printData(result, globals.format);
    });

  online
    .command("get")
    .description("Get a specific online learning week for a course")
    .option("--course <query>", "course title, course code, or kjkey")
    .option("--kjkey <kjkey>", "explicit course kjkey")
    .requiredOption("--lecture-weeks <id>", "online learning lecture_weeks")
    .action(async (options: { course?: string; kjkey?: string; lectureWeeks: string }) => {
      const globals = getGlobals();
      const { client, credentials } = await createLmsClientWithCredentials(globals);
      const resolvedCourse = await resolveCourseReference(client, credentials, {
        course: options.course,
        kjkey: options.kjkey
      });
      const lectureWeeks = parseOptionalInt(options.lectureWeeks, "lecture-weeks");
      if (lectureWeeks === undefined) {
        throw new Error("lecture-weeks 는 필수입니다.");
      }

      const result = await getCourseOnlineWeek(client, {
        userId: credentials.userId,
        password: credentials.password,
        kjkey: resolvedCourse.kjkey,
        lectureWeeks
      });

      printData(result, globals.format);
    });

  const attachments = new Command("attachments").description("Download LMS attachments");

  attachments
    .command("download")
    .description("Download one attachment from a notice or assignment")
    .requiredOption("--kind <kind>", "notice, assignment")
    .option("--course <query>", "course title, course code, or kjkey")
    .option("--kjkey <kjkey>", "explicit course kjkey")
    .option("--article-id <id>", "notice article id")
    .option("--rt-seq <id>", "assignment rt_seq")
    .option("--attachment-index <index>", "0-based attachment index")
    .option("--attachment-kind <kind>", "assignment attachment kind: prompt or submission")
    .option("--output-dir <path>", "custom output directory")
    .action(
      async (options: {
        kind: string;
        course?: string;
        kjkey?: string;
        articleId?: string;
        rtSeq?: string;
        attachmentIndex?: string;
        attachmentKind?: string;
        outputDir?: string;
      }) => {
        const globals = getGlobals();
        const { config, client, credentials } = await createLmsClientWithCredentials(globals);
        const resolvedCourse = await resolveCourseReference(client, credentials, {
          course: options.course,
          kjkey: options.kjkey
        });
        const kind = options.kind.trim().toLowerCase();
        const attachmentIndex = parseOptionalInt(options.attachmentIndex, "attachment-index");
        const articleId = parseOptionalInt(options.articleId, "article-id");
        const rtSeq = parseOptionalInt(options.rtSeq, "rt-seq");
        const attachmentKind =
          options.attachmentKind?.trim().toLowerCase() === "submission"
            ? "submission"
            : options.attachmentKind?.trim().toLowerCase() === "prompt"
              ? "prompt"
              : undefined;

        let result;
        switch (kind) {
          case "notice":
            if (articleId === undefined) {
              throw new Error("notice 다운로드에는 article-id 가 필요합니다.");
            }
            result = await downloadNoticeAttachment(client, config, {
              userId: credentials.userId,
              password: credentials.password,
              kjkey: resolvedCourse.kjkey,
              articleId,
              ...(attachmentIndex !== undefined ? { attachmentIndex } : {}),
              ...(options.outputDir ? { outputDir: options.outputDir } : {})
            });
            break;
          case "assignment":
            if (rtSeq === undefined) {
              throw new Error("assignment 다운로드에는 rt-seq 가 필요합니다.");
            }
            result = await downloadAssignmentAttachment(client, config, {
              userId: credentials.userId,
              password: credentials.password,
              kjkey: resolvedCourse.kjkey,
              rtSeq,
              ...(attachmentIndex !== undefined ? { attachmentIndex } : {}),
              ...(attachmentKind ? { attachmentKind } : {}),
              ...(options.outputDir ? { outputDir: options.outputDir } : {})
            });
            break;
          default:
            throw new Error("kind 는 notice, assignment 중 하나여야 합니다.");
        }

        printData(result, globals.format);
      }
    );

  attachments
    .command("download-bulk")
    .description("Download attachments from multiple notices or assignments")
    .requiredOption("--kind <kind>", "notice, assignment")
    .option("--course <query>", "course title, course code, or kjkey")
    .option("--kjkey <kjkey>", "explicit course kjkey")
    .option("--article-ids <ids>", "comma-separated notice article ids")
    .option("--rt-seqs <ids>", "comma-separated assignment rt_seq values")
    .option("--attachment-kind <kind>", "assignment attachment kind: prompt or submission")
    .option("--output-dir <path>", "custom output directory")
    .action(
      async (options: {
        kind: string;
        course?: string;
        kjkey?: string;
        articleIds?: string;
        rtSeqs?: string;
        attachmentKind?: string;
        outputDir?: string;
      }) => {
        const globals = getGlobals();
        const { config, client, credentials } = await createLmsClientWithCredentials(globals);
        const resolvedCourse = await resolveCourseReference(client, credentials, {
          course: options.course,
          kjkey: options.kjkey
        });
        const kind = options.kind.trim().toLowerCase();
        const articleIds = parsePositiveIntList(options.articleIds, "article-ids");
        const rtSeqs = parsePositiveIntList(options.rtSeqs, "rt-seqs");
        const attachmentKind =
          options.attachmentKind?.trim().toLowerCase() === "submission"
            ? "submission"
            : options.attachmentKind?.trim().toLowerCase() === "prompt"
              ? "prompt"
              : undefined;

        let result;
        switch (kind) {
          case "notice":
            if (articleIds.length === 0) {
              throw new Error("notice bulk 다운로드에는 article-ids 가 필요합니다.");
            }
            result = await downloadNoticeAttachments(client, config, {
              userId: credentials.userId,
              password: credentials.password,
              kjkey: resolvedCourse.kjkey,
              articleIds,
              ...(options.outputDir ? { outputDir: options.outputDir } : {})
            });
            break;
          case "assignment":
            if (rtSeqs.length === 0) {
              throw new Error("assignment bulk 다운로드에는 rt-seqs 가 필요합니다.");
            }
            result = await downloadAssignmentAttachments(client, config, {
              userId: credentials.userId,
              password: credentials.password,
              kjkey: resolvedCourse.kjkey,
              rtSeqs,
              ...(attachmentKind ? { attachmentKind } : {}),
              ...(options.outputDir ? { outputDir: options.outputDir } : {})
            });
            break;
          default:
            throw new Error("kind 는 notice, assignment 중 하나여야 합니다.");
        }

        printData(result, globals.format);
      }
    );

  lms
    .command("+unsubmitted")
    .description("Show unsubmitted assignments for one course or the latest-term course set")
    .option("--course <query>", "course title, course code, or kjkey")
    .option("--kjkey <kjkey>", "explicit course kjkey")
    .option("--all-courses", "search across the latest term course set")
    .action(async (options: { course?: string; kjkey?: string; allCourses?: boolean }) => {
      const globals = getGlobals();
      const { client, credentials } = await createLmsClientWithCredentials(globals);
      const result = await getUnsubmittedAssignments(client, credentials, {
        ...(options.course ? { course: options.course } : {}),
        ...(options.kjkey ? { kjkey: options.kjkey } : {}),
        ...(options.allCourses ? { allCourses: true } : {})
      });

      printData(result, globals.format);
    });

  lms
    .command("+due-assignments")
    .description("Show assignments due soon for one course or the latest-term course set")
    .option("--course <query>", "course title, course code, or kjkey")
    .option("--kjkey <kjkey>", "explicit course kjkey")
    .option("--all-courses", "search across the latest term course set")
    .option("--days <days>", "due window in days")
    .option("--include-submitted", "include already submitted assignments")
    .action(
      async (options: {
        course?: string;
        kjkey?: string;
        allCourses?: boolean;
        days?: string;
        includeSubmitted?: boolean;
      }) => {
        const globals = getGlobals();
        const { client, credentials } = await createLmsClientWithCredentials(globals);
        const days = parseOptionalInt(options.days, "days");
        const result = await getDueAssignments(client, credentials, {
          ...(options.course ? { course: options.course } : {}),
          ...(options.kjkey ? { kjkey: options.kjkey } : {}),
          ...(options.allCourses ? { allCourses: true } : {}),
          ...(days !== undefined ? { days } : {}),
          ...(options.includeSubmitted ? { includeSubmitted: true } : {})
        });

        printData(result, globals.format);
      }
    );

  lms
    .command("+unread-notices")
    .description("Show unread notices for one course or the latest-term course set")
    .option("--course <query>", "course title, course code, or kjkey")
    .option("--kjkey <kjkey>", "explicit course kjkey")
    .option("--all-courses", "search across the latest term course set")
    .action(async (options: { course?: string; kjkey?: string; allCourses?: boolean }) => {
      const globals = getGlobals();
      const { client, credentials } = await createLmsClientWithCredentials(globals);
      const result = await getUnreadNotices(client, credentials, {
        ...(options.course ? { course: options.course } : {}),
        ...(options.kjkey ? { kjkey: options.kjkey } : {}),
        ...(options.allCourses ? { allCourses: true } : {})
      });

      printData(result, globals.format);
    });

  lms
    .command("+incomplete-online")
    .description("Show incomplete online learning weeks for one course or the latest-term course set")
    .option("--course <query>", "course title, course code, or kjkey")
    .option("--kjkey <kjkey>", "explicit course kjkey")
    .option("--all-courses", "search across the latest term course set")
    .action(async (options: { course?: string; kjkey?: string; allCourses?: boolean }) => {
      const globals = getGlobals();
      const { client, credentials } = await createLmsClientWithCredentials(globals);
      const result = await getIncompleteOnlineWeeks(client, credentials, {
        ...(options.course ? { course: options.course } : {}),
        ...(options.kjkey ? { kjkey: options.kjkey } : {}),
        ...(options.allCourses ? { allCourses: true } : {})
      });

      printData(result, globals.format);
    });

  lms
    .command("+action-items")
    .description("Show current LMS action items for one course or the latest-term course set")
    .option("--course <query>", "course title, course code, or kjkey")
    .option("--kjkey <kjkey>", "explicit course kjkey")
    .option("--all-courses", "search across the latest term course set")
    .action(async (options: { course?: string; kjkey?: string; allCourses?: boolean }) => {
      const globals = getGlobals();
      const { client, credentials } = await createLmsClientWithCredentials(globals);
      const result = await getActionItems(client, credentials, {
        ...(options.course ? { course: options.course } : {}),
        ...(options.kjkey ? { kjkey: options.kjkey } : {}),
        ...(options.allCourses ? { allCourses: true } : {})
      });

      printData(result, globals.format);
    });

  lms
    .command("+digest")
    .description("Show a combined digest for one course")
    .option("--course <query>", "course title, course code, or kjkey")
    .option("--kjkey <kjkey>", "explicit course kjkey")
    .option("--days <days>", "due window in days")
    .option("--limit <limit>", "max items per section")
    .action(
      async (options: {
        course?: string;
        kjkey?: string;
        days?: string;
        limit?: string;
      }) => {
        const globals = getGlobals();
        const { client, credentials } = await createLmsClientWithCredentials(globals);
        const days = parseOptionalInt(options.days, "days");
        const limit = parseOptionalInt(options.limit, "limit");
        const result = await getCourseDigest(client, credentials, {
          ...(options.course ? { course: options.course } : {}),
          ...(options.kjkey ? { kjkey: options.kjkey } : {}),
          ...(days !== undefined ? { days } : {}),
          ...(limit !== undefined ? { limit } : {})
        });

        printData(result, globals.format);
      }
    );

  lms.addCommand(courses);
  lms.addCommand(notices);
  lms.addCommand(materials);
  lms.addCommand(assignments);
  lms.addCommand(attachments);
  lms.addCommand(online);

  return lms;
}
