import { Command } from "commander";

import { AuthManager } from "../auth/auth-manager.js";
import { printData } from "../output/print.js";
import type { GlobalOptions } from "../types.js";
import { resolveLmsRuntimeConfig } from "../lms/config.js";
import { getCourseAssignment, listCourseAssignments } from "../lms/assignments.js";
import { listRegularTakenCourses } from "../lms/courses.js";
import { resolveCourseReference } from "../lms/course-resolver.js";
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
  client: MjuLmsSsoClient;
  credentials: Awaited<ReturnType<AuthManager["resolveCredentials"]>>;
}> {
  const config = resolveLmsRuntimeConfig({ appDataDir: globals.appDir });
  const authManager = new AuthManager(config);
  const credentials = await authManager.resolveCredentials();
  const client = new MjuLmsSsoClient(config);

  return { client, credentials };
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
            assignments: ["list", "get"],
            online: ["list", "get"]
          },
          planned: {
            attachments: ["download", "download-bulk"]
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

  lms.addCommand(courses);
  lms.addCommand(notices);
  lms.addCommand(materials);
  lms.addCommand(assignments);
  lms.addCommand(online);

  return lms;
}
