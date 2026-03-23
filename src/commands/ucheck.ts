import { Command } from "commander";

import { AuthManager } from "../auth/auth-manager.js";
import { resolveLmsRuntimeConfig } from "../lms/config.js";
import { printData } from "../output/print.js";
import type { GlobalOptions } from "../types.js";
import { MjuUcheckClient } from "../ucheck/client.js";
import { resolveUcheckRuntimeConfig } from "../ucheck/config.js";
import {
  getUcheckAccountInfo,
  getUcheckCourseAttendance,
  listUcheckLectures
} from "../ucheck/services.js";

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

async function createUcheckClientWithCredentials(globals: GlobalOptions): Promise<{
  client: MjuUcheckClient;
  credentials: Awaited<ReturnType<AuthManager["resolveCredentials"]>>;
}> {
  const authManager = new AuthManager(resolveLmsRuntimeConfig({ appDataDir: globals.appDir }));
  const credentials = await authManager.resolveCredentials();
  const client = new MjuUcheckClient(resolveUcheckRuntimeConfig({ appDataDir: globals.appDir }));

  return { client, credentials };
}

export function createUcheckCommand(getGlobals: () => GlobalOptions): Command {
  const ucheck = new Command("ucheck").description("Attendance by course");

  ucheck
    .command("summary")
    .description("Show the planned command surface for UCheck")
    .action(() => {
      const globals = getGlobals();
      printData(
        {
          service: "ucheck",
          implemented: {
            account: ["get"],
            lectures: ["list"],
            attendance: ["get"]
          },
          planned: {}
        },
        globals.format
      );
    });

  ucheck
    .command("account")
    .description("Get UCheck account info")
    .action(async () => {
      const globals = getGlobals();
      const { client, credentials } = await createUcheckClientWithCredentials(globals);
      const result = await getUcheckAccountInfo(client, credentials);
      printData(result, globals.format);
    });

  const lectures = new Command("lectures").description("Read UCheck lecture list");
  lectures
    .command("list")
    .description("List UCheck lectures")
    .option("--year <year>", "target lecture year")
    .option("--term <term>", "target lecture term")
    .action(async (options: { year?: string; term?: string }) => {
      const globals = getGlobals();
      const { client, credentials } = await createUcheckClientWithCredentials(globals);
      const account = await getUcheckAccountInfo(client, credentials);
      const year = parseOptionalInt(options.year, "year") ?? account.baseYearTerm.lectureYear;
      const term = parseOptionalInt(options.term, "term") ?? account.baseYearTerm.lectureTerm;
      const result = await listUcheckLectures(client, credentials, year, term);
      printData(
        {
          year,
          term,
          lectures: result
        },
        globals.format
      );
    });

  ucheck
    .command("attendance")
    .description("Get attendance status for a course")
    .option("--course <query>", "course title, course code, or lecture number")
    .option("--lecture-no <number>", "explicit lecture number")
    .option("--year <year>", "target lecture year")
    .option("--term <term>", "target lecture term")
    .action(
      async (options: {
        course?: string;
        lectureNo?: string;
        year?: string;
        term?: string;
      }) => {
        const globals = getGlobals();
        const { client, credentials } = await createUcheckClientWithCredentials(globals);
        const lectureNo = parseOptionalInt(options.lectureNo, "lecture-no");
        const year = parseOptionalInt(options.year, "year");
        const term = parseOptionalInt(options.term, "term");
        const result = await getUcheckCourseAttendance(client, credentials, {
          ...(options.course ? { course: options.course } : {}),
          ...(lectureNo !== undefined ? { lectureNo } : {}),
          ...(year !== undefined ? { year } : {}),
          ...(term !== undefined ? { term } : {})
        });

        printData(result, globals.format);
      }
    );

  ucheck.addCommand(lectures);

  return ucheck;
}
