import { Command } from "commander";

import { AuthManager } from "../auth/auth-manager.js";
import { resolveLmsRuntimeConfig } from "../lms/config.js";
import { MjuLibraryClient } from "../library/client.js";
import { resolveLibraryRuntimeConfig } from "../library/config.js";
import { getLibraryMyReservations } from "../library/helpers.js";
import {
  getLibraryStudyRoomDetail,
  listLibraryRoomReservations,
  listLibraryStudyRooms
} from "../library/services.js";
import {
  explainLibraryReadingRoomSeatPosition,
  getLibraryReadingRoomDetail,
  listLibraryReadingRooms,
  listLibrarySeatReservations
} from "../library/seat-services.js";
import { printData } from "../output/print.js";
import type { GlobalOptions } from "../types.js";

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

async function createLibraryClientWithCredentials(globals: GlobalOptions): Promise<{
  client: MjuLibraryClient;
  credentials: Awaited<ReturnType<AuthManager["resolveCredentials"]>>;
}> {
  const authManager = new AuthManager(resolveLmsRuntimeConfig({ appDataDir: globals.appDir }));
  const credentials = await authManager.resolveCredentials();
  const client = new MjuLibraryClient(
    resolveLibraryRuntimeConfig({ appDataDir: globals.appDir })
  );

  return { client, credentials };
}

export function createLibraryCommand(getGlobals: () => GlobalOptions): Command {
  const library = new Command("library").description(
    "Study rooms, reading rooms, and seat reservations"
  );

  library
    .command("summary")
    .description("Show the planned command surface for the library")
    .action(() => {
      const globals = getGlobals();
      printData(
        {
          service: "library",
          implemented: {
            "study-rooms": ["list", "get", "list-reservations"],
            "reading-rooms": ["list", "get"],
            seats: ["list-reservations"],
            helpers: ["+my-reservations", "+seat-position"]
          },
          planned: {
            "study-rooms": ["reserve", "update-reservation", "cancel-reservation"],
            seats: ["reserve", "cancel"]
          }
        },
        globals.format
      );
    });

  library
    .command("+seat-position")
    .description("Explain a reading room seat position from seat code or seat id")
    .requiredOption("--room-id <id>", "reading room id")
    .option("--seat-id <id>", "seat id")
    .option("--seat-code <code>", "seat code like 54")
    .option("--hope-date <value>", "target datetime like 2026-03-23 09:00")
    .action(
      async (options: {
        roomId: string;
        seatId?: string;
        seatCode?: string;
        hopeDate?: string;
      }) => {
        const globals = getGlobals();
        const { client, credentials } = await createLibraryClientWithCredentials(globals);
        const roomId = parseOptionalInt(options.roomId, "room-id");
        const seatId = parseOptionalInt(options.seatId, "seat-id");
        const seatCode = options.seatCode?.trim();
        if (roomId === undefined) {
          throw new Error("room-id 는 필수입니다.");
        }

        if (seatId === undefined && !seatCode) {
          throw new Error("seat-id 또는 seat-code 중 하나는 필수입니다.");
        }

        const result = await explainLibraryReadingRoomSeatPosition(client, credentials, {
          roomId,
          ...(seatId !== undefined ? { seatId } : {}),
          ...(seatCode ? { seatCode } : {}),
          ...(options.hopeDate ? { hopeDate: options.hopeDate } : {})
        });

        printData(
          {
            user: result.user,
            room: {
              roomId: result.room.roomId,
              roomName: result.room.roomName,
              hopeDate: result.room.hopeDate,
              totalSeatCount: result.room.totalSeatCount,
              occupiedSeatCount: result.room.occupiedSeatCount,
              reservableSeatCount: result.room.reservableSeatCount
            },
            seat: result.seat,
            position: result.position
          },
          globals.format
        );
      }
    );

  library
    .command("+my-reservations")
    .description("Show study room and seat reservations together")
    .action(async () => {
      const globals = getGlobals();
      const { client, credentials } = await createLibraryClientWithCredentials(globals);
      const result = await getLibraryMyReservations(client, credentials);

      printData(result, globals.format);
    });

  const studyRooms = new Command("study-rooms").description(
    "Read study room availability and reservations"
  );

  studyRooms
    .command("list")
    .description("List library study rooms")
    .option("--campus <campus>", "인문, 자연, all")
    .option("--date <date>", "target date like 2026-03-23")
    .action(async (options: { campus?: string; date?: string }) => {
      const globals = getGlobals();
      const { client, credentials } = await createLibraryClientWithCredentials(globals);
      const result = await listLibraryStudyRooms(client, credentials, {
        ...(options.campus ? { campus: options.campus } : {}),
        ...(options.date ? { date: options.date } : {})
      });

      printData(result, globals.format);
    });

  studyRooms
    .command("get")
    .description("Get a specific study room detail")
    .requiredOption("--room-id <id>", "study room id")
    .requiredOption("--date <date>", "target date like 2026-03-23")
    .option("--begin-time <time>", "calculate end times from a start time like 16:00")
    .action(
      async (options: { roomId: string; date: string; beginTime?: string }) => {
        const globals = getGlobals();
        const { client, credentials } = await createLibraryClientWithCredentials(globals);
        const roomId = parseOptionalInt(options.roomId, "room-id");
        if (roomId === undefined) {
          throw new Error("room-id 는 필수입니다.");
        }

        const result = await getLibraryStudyRoomDetail(client, credentials, {
          roomId,
          date: options.date,
          ...(options.beginTime ? { beginTime: options.beginTime } : {})
        });

        printData(result, globals.format);
      }
    );

  studyRooms
    .command("list-reservations")
    .description("List current study room reservations")
    .action(async () => {
      const globals = getGlobals();
      const { client, credentials } = await createLibraryClientWithCredentials(globals);
      const result = await listLibraryRoomReservations(client, credentials);

      printData(result, globals.format);
    });

  const readingRooms = new Command("reading-rooms").description(
    "Read reading room availability"
  );

  readingRooms
    .command("list")
    .description("List library reading rooms")
    .option("--campus <campus>", "인문, 자연, all")
    .action(async (options: { campus?: string }) => {
      const globals = getGlobals();
      const { client, credentials } = await createLibraryClientWithCredentials(globals);
      const result = await listLibraryReadingRooms(client, credentials, {
        ...(options.campus ? { campus: options.campus } : {})
      });

      printData(result, globals.format);
    });

  readingRooms
    .command("get")
    .description("Get a specific reading room detail")
    .requiredOption("--room-id <id>", "reading room id")
    .option("--hope-date <value>", "target datetime like 2026-03-23 09:00")
    .action(async (options: { roomId: string; hopeDate?: string }) => {
      const globals = getGlobals();
      const { client, credentials } = await createLibraryClientWithCredentials(globals);
      const roomId = parseOptionalInt(options.roomId, "room-id");
      if (roomId === undefined) {
        throw new Error("room-id 는 필수입니다.");
      }

      const result = await getLibraryReadingRoomDetail(client, credentials, {
        roomId,
        ...(options.hopeDate ? { hopeDate: options.hopeDate } : {})
      });

      printData(result, globals.format);
    });

  const seats = new Command("seats").description("Read current seat reservations");

  seats
    .command("list-reservations")
    .description("List current seat reservations")
    .action(async () => {
      const globals = getGlobals();
      const { client, credentials } = await createLibraryClientWithCredentials(globals);
      const result = await listLibrarySeatReservations(client, credentials);

      printData(result, globals.format);
    });

  library.addCommand(studyRooms);
  library.addCommand(readingRooms);
  library.addCommand(seats);

  return library;
}
