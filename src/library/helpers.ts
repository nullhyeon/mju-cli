import type { ResolvedLmsCredentials } from "../auth/types.js";
import { getLibraryAuthContext } from "./auth-context.js";
import { MjuLibraryClient } from "./client.js";
import { listLibrarySeatReservationsWithContext } from "./seat-services.js";
import { listLibraryRoomReservationsWithContext } from "./services.js";
import type {
  LibraryRoomReservationSummary,
  LibrarySeatReservationSummary,
  LibraryUserInfo
} from "./types.js";

export interface LibraryReservationTimelineItem {
  kind: "study-room" | "seat";
  reservationId: number;
  roomId?: number;
  roomName: string;
  seatId?: number;
  seatCode?: string;
  campusAlias?: string;
  reservationTime: string;
  beginTime?: string;
  endTime?: string;
  stateCode?: string;
  stateLabel?: string;
  companionCount?: number;
  isCheckinable?: boolean;
}

function sortByReservationTime<T extends { beginTime?: string; reservationTime: string }>(
  items: T[]
): T[] {
  return [...items].sort((left, right) => {
    const leftKey = left.beginTime ?? left.reservationTime;
    const rightKey = right.beginTime ?? right.reservationTime;
    return leftKey.localeCompare(rightKey, "ko");
  });
}

function mapStudyRoomTimelineItems(
  reservations: LibraryRoomReservationSummary[]
): LibraryReservationTimelineItem[] {
  return reservations.map((reservation) => ({
    kind: "study-room",
    reservationId: reservation.reservationId,
    ...(reservation.roomId !== undefined ? { roomId: reservation.roomId } : {}),
    roomName: reservation.roomName,
    ...(reservation.campusAlias !== undefined ? { campusAlias: reservation.campusAlias } : {}),
    reservationTime: reservation.reservationTime,
    ...(reservation.beginTime !== undefined ? { beginTime: reservation.beginTime } : {}),
    ...(reservation.endTime !== undefined ? { endTime: reservation.endTime } : {}),
    ...(reservation.stateCode !== undefined ? { stateCode: reservation.stateCode } : {}),
    ...(reservation.stateLabel !== undefined ? { stateLabel: reservation.stateLabel } : {}),
    companionCount: reservation.companionCount
  }));
}

function mapSeatTimelineItems(
  reservations: LibrarySeatReservationSummary[]
): LibraryReservationTimelineItem[] {
  return reservations.map((reservation) => ({
    kind: "seat",
    reservationId: reservation.reservationId,
    roomId: reservation.roomId,
    roomName: reservation.roomName,
    seatId: reservation.seatId,
    seatCode: reservation.seatCode,
    reservationTime: reservation.reservationTime,
    beginTime: reservation.beginTime,
    endTime: reservation.endTime,
    ...(reservation.stateCode !== undefined ? { stateCode: reservation.stateCode } : {}),
    ...(reservation.stateLabel !== undefined ? { stateLabel: reservation.stateLabel } : {}),
    isCheckinable: reservation.isCheckinable
  }));
}

function ensureSameUser(
  left: LibraryUserInfo,
  right: LibraryUserInfo
): LibraryUserInfo {
  if (left.id !== right.id || left.memberNo !== right.memberNo) {
    throw new Error("도서관 예약 집계 중 사용자 정보가 일치하지 않습니다.");
  }

  return left;
}

export async function getLibraryMyReservations(
  client: MjuLibraryClient,
  credentials: ResolvedLmsCredentials
): Promise<{
  user: LibraryUserInfo;
  counts: {
    studyRooms: number;
    seats: number;
    total: number;
  };
  studyRoomReservations: LibraryRoomReservationSummary[];
  seatReservations: LibrarySeatReservationSummary[];
  reservations: LibraryReservationTimelineItem[];
}> {
  const authContext = await getLibraryAuthContext(client, credentials);
  const [studyRoomResult, seatResult] = await Promise.all([
    listLibraryRoomReservationsWithContext(client, authContext),
    listLibrarySeatReservationsWithContext(client, authContext)
  ]);

  const user = ensureSameUser(studyRoomResult.user, seatResult.user);
  const studyRoomReservations = sortByReservationTime(studyRoomResult.reservations);
  const seatReservations = sortByReservationTime(seatResult.reservations);
  const reservations = sortByReservationTime([
    ...mapStudyRoomTimelineItems(studyRoomReservations),
    ...mapSeatTimelineItems(seatReservations)
  ]);

  return {
    user,
    counts: {
      studyRooms: studyRoomReservations.length,
      seats: seatReservations.length,
      total: studyRoomReservations.length + seatReservations.length
    },
    studyRoomReservations,
    seatReservations,
    reservations
  };
}
