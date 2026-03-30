import { Command } from "commander";

import { AuthManager } from "../auth/auth-manager.js";
import { resolveLmsRuntimeConfig } from "../lms/config.js";
import { MjuLibraryClient } from "../library/client.js";
import { resolveLibraryRuntimeConfig } from "../library/config.js";
import { getLibraryMyReservations } from "../library/helpers.js";
import {
  cancelLibraryRoomReservation,
  createLibraryRoomReservation,
  getLibraryStudyRoomDetail,
  listLibraryRoomReservations,
  listLibraryStudyRooms,
  previewLibraryRoomReservation,
  previewLibraryRoomReservationCancel,
  previewLibraryRoomReservationUpdate,
  updateLibraryRoomReservation
} from "../library/services.js";
import {
  cancelLibrarySeatReservation,
  createLibrarySeatReservation,
  explainLibraryReadingRoomSeatPosition,
  getLibraryReadingRoomDetail,
  listLibraryReadingRooms,
  listLibrarySeatReservations,
  previewLibrarySeatReservation,
  previewLibrarySeatReservationCancel
} from "../library/seat-services.js";
import type { LibraryCompanionInput, LibraryReservationRequestInput } from "../library/types.js";
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

function ensureConfirmFlag(confirm: boolean | undefined, actionLabel: string): void {
  if (confirm !== true) {
    throw new Error(`${actionLabel} 는 실제 쓰기 작업입니다. 진행하려면 --confirm 을 함께 지정해주세요.`);
  }
}

function parseCsv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parseCompanionToken(token: string): LibraryCompanionInput {
  const [left, ...rest] = token.split(":");
  const right = rest.join(":").trim();
  const normalizedLeft = left?.trim() ?? "";
  if (!normalizedLeft || !right) {
    throw new Error(
      "companions 는 `학번:이름,학번:이름` 또는 `이름:학번,이름:학번` 형식이어야 합니다."
    );
  }

  if (/^\d+$/.test(normalizedLeft)) {
    return {
      memberNo: normalizedLeft,
      name: right
    };
  }

  if (/^\d+$/.test(right)) {
    return {
      name: normalizedLeft,
      memberNo: right
    };
  }

  throw new Error(
    "companions 각 항목은 `학번:이름` 또는 `이름:학번` 형식이어야 합니다."
  );
}

function parseCompanions(value: string | undefined): LibraryCompanionInput[] | undefined {
  const items = parseCsv(value);
  if (items.length === 0) {
    return undefined;
  }

  return items.map(parseCompanionToken);
}

function parseEquipmentIds(value: string | undefined): number[] | undefined {
  const items = parseCsv(value);
  if (items.length === 0) {
    return undefined;
  }

  return items.map((item) => {
    const parsed = Number.parseInt(item, 10);
    if (Number.isNaN(parsed)) {
      throw new Error("equipment-ids 는 쉼표로 구분한 정수 목록이어야 합니다.");
    }
    return parsed;
  });
}

function parseAdditionalInfoValues(
  value: string | undefined
): Record<string, string> | undefined {
  const items = parseCsv(value);
  if (items.length === 0) {
    return undefined;
  }

  const result: Record<string, string> = {};
  for (const item of items) {
    const index = item.indexOf("=");
    if (index <= 0 || index === item.length - 1) {
      throw new Error("additional-info 는 `key=value,key=value` 형식이어야 합니다.");
    }

    const key = item.slice(0, index).trim();
    const parsedValue = item.slice(index + 1).trim();
    if (!key || !parsedValue) {
      throw new Error("additional-info 는 비어 있지 않은 key=value 쌍이어야 합니다.");
    }

    result[key] = parsedValue;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function buildRoomReservationInput(
  options: {
    roomId?: string;
    date: string;
    beginTime: string;
    endTime: string;
    useSectionId?: string;
    useSectionCode?: string;
    useSectionName?: string;
    companionCount?: string;
    companions?: string;
    patronMessage?: string;
    equipmentIds?: string;
    additionalInfo?: string;
  },
  options2: { requireRoomId: boolean; requireUseSection: boolean }
): LibraryReservationRequestInput {
  const roomId = parseOptionalInt(options.roomId, "room-id");
  const useSectionId = parseOptionalInt(options.useSectionId, "use-section-id");
  const companionCount = parseOptionalInt(options.companionCount, "companion-count");
  const companions = parseCompanions(options.companions);
  const equipmentIds = parseEquipmentIds(options.equipmentIds);
  const additionalInfoValues = parseAdditionalInfoValues(options.additionalInfo);

  if (options2.requireRoomId && roomId === undefined) {
    throw new Error("room-id 는 필수입니다.");
  }

  if (
    options2.requireUseSection &&
    useSectionId === undefined &&
    !options.useSectionCode?.trim() &&
    !options.useSectionName?.trim()
  ) {
    throw new Error(
      "use-section-id, use-section-code, use-section-name 중 하나는 필수입니다."
    );
  }

  return {
    roomId: roomId ?? -1,
    date: options.date,
    beginTime: options.beginTime,
    endTime: options.endTime,
    ...(useSectionId !== undefined ? { useSectionId } : {}),
    ...(options.useSectionCode?.trim() ? { useSectionCode: options.useSectionCode.trim() } : {}),
    ...(options.useSectionName?.trim() ? { useSectionName: options.useSectionName.trim() } : {}),
    ...(companionCount !== undefined ? { companionCount } : {}),
    ...(companions ? { companions } : {}),
    ...(options.patronMessage?.trim() ? { patronMessage: options.patronMessage.trim() } : {}),
    ...(equipmentIds ? { equipmentIds } : {}),
    ...(additionalInfoValues ? { additionalInfoValues } : {})
  };
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
            "study-rooms": [
              "list",
              "get",
              "list-reservations",
              "reserve-preview",
              "reserve",
              "update-preview",
              "update-reservation",
              "cancel-preview",
              "cancel-reservation"
            ],
            "reading-rooms": ["list", "get"],
            seats: [
              "list-reservations",
              "reserve-preview",
              "reserve",
              "cancel-preview",
              "cancel"
            ],
            helpers: ["+my-reservations", "+seat-position"]
          },
          planned: {}
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

  studyRooms
    .command("reserve-preview")
    .description("Preview a study room reservation without writing")
    .requiredOption("--room-id <id>", "study room id")
    .requiredOption("--date <date>", "target date like 2026-03-31")
    .requiredOption("--begin-time <time>", "start time like 18:00")
    .requiredOption("--end-time <time>", "end time like 18:30")
    .option("--use-section-id <id>", "use section id")
    .option("--use-section-code <code>", "use section code like STUDY")
    .option("--use-section-name <name>", "use section name like 학습")
    .option("--companion-count <count>", "companion count")
    .option(
      "--companions <items>",
      "comma-separated companions like 60212255:최진원,60212216:이윤형"
    )
    .option("--patron-message <text>", "message shown on reservation detail")
    .option("--equipment-ids <ids>", "comma-separated equipment ids")
    .option("--additional-info <pairs>", "comma-separated key=value pairs")
    .action(
      async (options: {
        roomId: string;
        date: string;
        beginTime: string;
        endTime: string;
        useSectionId?: string;
        useSectionCode?: string;
        useSectionName?: string;
        companionCount?: string;
        companions?: string;
        patronMessage?: string;
        equipmentIds?: string;
        additionalInfo?: string;
      }) => {
        const globals = getGlobals();
        const { client, credentials } = await createLibraryClientWithCredentials(globals);
        const input = buildRoomReservationInput(options, {
          requireRoomId: true,
          requireUseSection: true
        });
        const result = await previewLibraryRoomReservation(client, credentials, input);

        printData(result, globals.format);
      }
    );

  studyRooms
    .command("reserve")
    .description("Create a study room reservation")
    .requiredOption("--room-id <id>", "study room id")
    .requiredOption("--date <date>", "target date like 2026-03-31")
    .requiredOption("--begin-time <time>", "start time like 18:00")
    .requiredOption("--end-time <time>", "end time like 18:30")
    .option("--use-section-id <id>", "use section id")
    .option("--use-section-code <code>", "use section code like STUDY")
    .option("--use-section-name <name>", "use section name like 학습")
    .option("--companion-count <count>", "companion count")
    .option(
      "--companions <items>",
      "comma-separated companions like 60212255:최진원,60212216:이윤형"
    )
    .option("--patron-message <text>", "message shown on reservation detail")
    .option("--equipment-ids <ids>", "comma-separated equipment ids")
    .option("--additional-info <pairs>", "comma-separated key=value pairs")
    .option("--confirm", "actually create the reservation")
    .action(
      async (options: {
        roomId: string;
        date: string;
        beginTime: string;
        endTime: string;
        useSectionId?: string;
        useSectionCode?: string;
        useSectionName?: string;
        companionCount?: string;
        companions?: string;
        patronMessage?: string;
        equipmentIds?: string;
        additionalInfo?: string;
        confirm?: boolean;
      }) => {
        ensureConfirmFlag(options.confirm, "library study-rooms reserve");

        const globals = getGlobals();
        const { client, credentials } = await createLibraryClientWithCredentials(globals);
        const input = buildRoomReservationInput(options, {
          requireRoomId: true,
          requireUseSection: true
        });
        const result = await createLibraryRoomReservation(client, credentials, input);

        printData(result, globals.format);
      }
    );

  studyRooms
    .command("update-preview")
    .description("Preview a study room reservation update without writing")
    .requiredOption("--reservation-id <id>", "study room reservation id")
    .requiredOption("--date <date>", "target date like 2026-03-31")
    .requiredOption("--begin-time <time>", "start time like 18:00")
    .requiredOption("--end-time <time>", "end time like 18:30")
    .option("--use-section-id <id>", "use section id")
    .option("--use-section-code <code>", "use section code like STUDY")
    .option("--use-section-name <name>", "use section name like 학습")
    .option("--companion-count <count>", "companion count")
    .option(
      "--companions <items>",
      "comma-separated companions like 60212255:최진원,60212216:이윤형"
    )
    .option("--patron-message <text>", "message shown on reservation detail")
    .option("--equipment-ids <ids>", "comma-separated equipment ids")
    .option("--additional-info <pairs>", "comma-separated key=value pairs")
    .action(
      async (options: {
        reservationId: string;
        date: string;
        beginTime: string;
        endTime: string;
        useSectionId?: string;
        useSectionCode?: string;
        useSectionName?: string;
        companionCount?: string;
        companions?: string;
        patronMessage?: string;
        equipmentIds?: string;
        additionalInfo?: string;
      }) => {
        const globals = getGlobals();
        const { client, credentials } = await createLibraryClientWithCredentials(globals);
        const reservationId = parseOptionalInt(options.reservationId, "reservation-id");
        if (reservationId === undefined) {
          throw new Error("reservation-id 는 필수입니다.");
        }

        const input = buildRoomReservationInput(options, {
          requireRoomId: false,
          requireUseSection: false
        });
        const result = await previewLibraryRoomReservationUpdate(client, credentials, reservationId, {
          date: input.date,
          beginTime: input.beginTime,
          endTime: input.endTime,
          ...(input.useSectionId !== undefined ? { useSectionId: input.useSectionId } : {}),
          ...(input.useSectionCode ? { useSectionCode: input.useSectionCode } : {}),
          ...(input.useSectionName ? { useSectionName: input.useSectionName } : {}),
          ...(input.companionCount !== undefined ? { companionCount: input.companionCount } : {}),
          ...(input.companions ? { companions: input.companions } : {}),
          ...(input.patronMessage ? { patronMessage: input.patronMessage } : {}),
          ...(input.equipmentIds ? { equipmentIds: input.equipmentIds } : {}),
          ...(input.additionalInfoValues
            ? { additionalInfoValues: input.additionalInfoValues }
            : {})
        });

        printData(result, globals.format);
      }
    );

  studyRooms
    .command("update-reservation")
    .description("Update a study room reservation")
    .requiredOption("--reservation-id <id>", "study room reservation id")
    .requiredOption("--date <date>", "target date like 2026-03-31")
    .requiredOption("--begin-time <time>", "start time like 18:00")
    .requiredOption("--end-time <time>", "end time like 18:30")
    .option("--use-section-id <id>", "use section id")
    .option("--use-section-code <code>", "use section code like STUDY")
    .option("--use-section-name <name>", "use section name like 학습")
    .option("--companion-count <count>", "companion count")
    .option(
      "--companions <items>",
      "comma-separated companions like 60212255:최진원,60212216:이윤형"
    )
    .option("--patron-message <text>", "message shown on reservation detail")
    .option("--equipment-ids <ids>", "comma-separated equipment ids")
    .option("--additional-info <pairs>", "comma-separated key=value pairs")
    .option("--confirm", "actually update the reservation")
    .action(
      async (options: {
        reservationId: string;
        date: string;
        beginTime: string;
        endTime: string;
        useSectionId?: string;
        useSectionCode?: string;
        useSectionName?: string;
        companionCount?: string;
        companions?: string;
        patronMessage?: string;
        equipmentIds?: string;
        additionalInfo?: string;
        confirm?: boolean;
      }) => {
        ensureConfirmFlag(options.confirm, "library study-rooms update-reservation");

        const globals = getGlobals();
        const { client, credentials } = await createLibraryClientWithCredentials(globals);
        const reservationId = parseOptionalInt(options.reservationId, "reservation-id");
        if (reservationId === undefined) {
          throw new Error("reservation-id 는 필수입니다.");
        }

        const input = buildRoomReservationInput(options, {
          requireRoomId: false,
          requireUseSection: false
        });
        const result = await updateLibraryRoomReservation(client, credentials, reservationId, {
          date: input.date,
          beginTime: input.beginTime,
          endTime: input.endTime,
          ...(input.useSectionId !== undefined ? { useSectionId: input.useSectionId } : {}),
          ...(input.useSectionCode ? { useSectionCode: input.useSectionCode } : {}),
          ...(input.useSectionName ? { useSectionName: input.useSectionName } : {}),
          ...(input.companionCount !== undefined ? { companionCount: input.companionCount } : {}),
          ...(input.companions ? { companions: input.companions } : {}),
          ...(input.patronMessage ? { patronMessage: input.patronMessage } : {}),
          ...(input.equipmentIds ? { equipmentIds: input.equipmentIds } : {}),
          ...(input.additionalInfoValues
            ? { additionalInfoValues: input.additionalInfoValues }
            : {})
        });

        printData(result, globals.format);
      }
    );

  studyRooms
    .command("cancel-preview")
    .description("Preview a study room reservation cancel without writing")
    .requiredOption("--reservation-id <id>", "study room reservation id")
    .action(async (options: { reservationId: string }) => {
      const globals = getGlobals();
      const { client, credentials } = await createLibraryClientWithCredentials(globals);
      const reservationId = parseOptionalInt(options.reservationId, "reservation-id");
      if (reservationId === undefined) {
        throw new Error("reservation-id 는 필수입니다.");
      }

      const result = await previewLibraryRoomReservationCancel(client, credentials, reservationId);
      printData(result, globals.format);
    });

  studyRooms
    .command("cancel-reservation")
    .description("Cancel a study room reservation")
    .requiredOption("--reservation-id <id>", "study room reservation id")
    .option("--confirm", "actually cancel the reservation")
    .action(async (options: { reservationId: string; confirm?: boolean }) => {
      ensureConfirmFlag(options.confirm, "library study-rooms cancel-reservation");

      const globals = getGlobals();
      const { client, credentials } = await createLibraryClientWithCredentials(globals);
      const reservationId = parseOptionalInt(options.reservationId, "reservation-id");
      if (reservationId === undefined) {
        throw new Error("reservation-id 는 필수입니다.");
      }

      const result = await cancelLibraryRoomReservation(client, credentials, reservationId);
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

  seats
    .command("reserve-preview")
    .description("Preview a seat reservation without writing")
    .requiredOption("--room-id <id>", "reading room id")
    .requiredOption("--seat-id <id>", "seat id")
    .action(async (options: { roomId: string; seatId: string }) => {
      const globals = getGlobals();
      const { client, credentials } = await createLibraryClientWithCredentials(globals);
      const roomId = parseOptionalInt(options.roomId, "room-id");
      const seatId = parseOptionalInt(options.seatId, "seat-id");
      if (roomId === undefined || seatId === undefined) {
        throw new Error("room-id 와 seat-id 는 필수입니다.");
      }

      const result = await previewLibrarySeatReservation(client, credentials, {
        roomId,
        seatId
      });

      printData(result, globals.format);
    });

  seats
    .command("reserve")
    .description("Create a seat reservation")
    .requiredOption("--room-id <id>", "reading room id")
    .requiredOption("--seat-id <id>", "seat id")
    .option("--confirm", "actually create the reservation")
    .action(async (options: { roomId: string; seatId: string; confirm?: boolean }) => {
      ensureConfirmFlag(options.confirm, "library seats reserve");

      const globals = getGlobals();
      const { client, credentials } = await createLibraryClientWithCredentials(globals);
      const roomId = parseOptionalInt(options.roomId, "room-id");
      const seatId = parseOptionalInt(options.seatId, "seat-id");
      if (roomId === undefined || seatId === undefined) {
        throw new Error("room-id 와 seat-id 는 필수입니다.");
      }

      const result = await createLibrarySeatReservation(client, credentials, {
        roomId,
        seatId
      });

      printData(result, globals.format);
    });

  seats
    .command("cancel-preview")
    .description("Preview a seat reservation cancel without writing")
    .requiredOption("--reservation-id <id>", "seat reservation id")
    .action(async (options: { reservationId: string }) => {
      const globals = getGlobals();
      const { client, credentials } = await createLibraryClientWithCredentials(globals);
      const reservationId = parseOptionalInt(options.reservationId, "reservation-id");
      if (reservationId === undefined) {
        throw new Error("reservation-id 는 필수입니다.");
      }

      const result = await previewLibrarySeatReservationCancel(client, credentials, reservationId);

      printData(result, globals.format);
    });

  seats
    .command("cancel")
    .description("Cancel a seat reservation")
    .requiredOption("--reservation-id <id>", "seat reservation id")
    .option("--confirm", "actually cancel the reservation")
    .action(async (options: { reservationId: string; confirm?: boolean }) => {
      ensureConfirmFlag(options.confirm, "library seats cancel");

      const globals = getGlobals();
      const { client, credentials } = await createLibraryClientWithCredentials(globals);
      const reservationId = parseOptionalInt(options.reservationId, "reservation-id");
      if (reservationId === undefined) {
        throw new Error("reservation-id 는 필수입니다.");
      }

      const result = await cancelLibrarySeatReservation(client, credentials, reservationId);

      printData(result, globals.format);
    });

  library.addCommand(studyRooms);
  library.addCommand(readingRooms);
  library.addCommand(seats);

  return library;
}
