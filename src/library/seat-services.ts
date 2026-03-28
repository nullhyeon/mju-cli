import type { ResolvedLmsCredentials } from "../auth/types.js";
import {
  LIBRARY_BRANCH_GROUPS,
  LIBRARY_HOMEPAGE_ID,
  LIBRARY_SMUF_METHOD_CODE,
  type LibraryCampusKey
} from "./constants.js";
import { MjuLibraryClient } from "./client.js";
import { describeReadingRoomSeatPosition } from "./reading-room-seat-positions.js";
import type {
  LibraryReadingRoomCampusAvailability,
  LibraryReadingRoomDetail,
  LibraryReadingRoomSeatPositionResult,
  LibraryReadingRoomSummary,
  LibrarySeatReservationSummary,
  LibrarySeatReservableDate,
  LibrarySeatSummary,
  LibrarySeatType,
  LibraryUserInfo
} from "./types.js";

interface RawBranch {
  id?: number;
  name?: string;
  alias?: string;
}

interface RawRoomType {
  id?: number;
  name?: string;
}

interface RawSeatCounts {
  total?: number;
  occupied?: number;
  waiting?: number;
  available?: number;
}

interface RawSeatRoomSummary {
  id?: number;
  name?: string;
  roomType?: RawRoomType;
  branch?: RawBranch;
  isChargeable?: boolean;
  unableMessage?: string;
  seats?: RawSeatCounts;
}

interface RawSeatReservableDate {
  date?: string;
  beginTime?: string;
  endTime?: string;
}

interface RawSeatRoomDetail {
  name?: string;
  description?: string;
  attention?: string;
  seatTypes?: Array<{
    id?: number;
    name?: string;
  }> | null;
  reservable?: boolean;
  reservableDates?: RawSeatReservableDate[] | null;
}

interface RawSeatRoomRef {
  id?: number;
  name?: string;
}

interface RawSeatSummary {
  id?: number;
  room?: RawSeatRoomRef;
  code?: string;
  isActive?: boolean;
  isReservable?: boolean;
  isOccupied?: boolean;
  remainingTime?: number;
  chargeTime?: number;
}

interface RawSeatChargeSummary {
  id?: number;
  room?: RawSeatRoomRef;
  seat?: {
    id?: number;
    code?: string;
  };
  state?: {
    code?: string;
    name?: string;
  };
  reservationTime?: string;
  beginTime?: string;
  endTime?: string;
  isCheckinable?: boolean;
  checkinExpiryDate?: string;
  arrivalConfirmMethods?: string[] | null;
  isReturnable?: boolean;
  isRenewable?: boolean;
  renewalLimit?: number;
  renewableCnt?: number;
  dateCreated?: string;
}

interface RawListResponse<T> {
  totalCount?: number;
  list?: T[] | null;
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function cleanNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return undefined;
  }

  return value;
}

function ensureString(value: string | undefined, message: string): string {
  if (!value) {
    throw new Error(message);
  }

  return value;
}

function ensureNumber(value: number | undefined, message: string): number {
  if (value === undefined) {
    throw new Error(message);
  }

  return value;
}

function resolveCampusKey(input: string | undefined): LibraryCampusKey | "all" {
  const normalized = input?.trim().toLowerCase();
  if (!normalized || normalized === "all" || normalized === "전체") {
    return "all";
  }

  if (normalized === "자연" || normalized === "자연캠퍼스" || normalized === "nature") {
    return "nature";
  }

  if (normalized === "인문" || normalized === "인문캠퍼스" || normalized === "humanities") {
    return "humanities";
  }

  throw new Error("campus 는 인문, 자연, all 중 하나여야 합니다.");
}

function formatCompactTime(value: string | undefined): string | undefined {
  const compact = cleanString(value);
  if (!compact) {
    return undefined;
  }

  const match = /^(\d{2})(\d{2})$/.exec(compact);
  if (!match) {
    return compact;
  }

  return `${match[1]}:${match[2]}`;
}

function formatLocalDateTime(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function mapSeatSummary(raw: RawSeatSummary): LibrarySeatSummary {
  const roomId = cleanNumber(raw.room?.id);
  const roomName = cleanString(raw.room?.name);

  return {
    seatId: ensureNumber(raw.id, "열람실 좌석 id 를 찾지 못했습니다."),
    ...(roomId !== undefined ? { roomId } : {}),
    ...(roomName !== undefined ? { roomName } : {}),
    seatCode: ensureString(raw.code, "열람실 좌석 번호를 찾지 못했습니다."),
    isActive: raw.isActive === true,
    isReservable: raw.isReservable === true,
    isOccupied: raw.isOccupied === true,
    remainingTime: cleanNumber(raw.remainingTime) ?? 0,
    chargeTime: cleanNumber(raw.chargeTime) ?? 0
  };
}

function mapSeatReservationSummary(
  raw: RawSeatChargeSummary
): LibrarySeatReservationSummary {
  const stateCode = cleanString(raw.state?.code);
  const stateLabel = cleanString(raw.state?.name);
  const checkinExpiryDate = cleanString(raw.checkinExpiryDate);
  const dateCreated = cleanString(raw.dateCreated);
  const renewalLimit = cleanNumber(raw.renewalLimit);
  const renewableCount = cleanNumber(raw.renewableCnt);

  return {
    reservationId: ensureNumber(raw.id, "열람실 예약 id 를 찾지 못했습니다."),
    roomId: ensureNumber(raw.room?.id, "열람실 예약 room id 를 찾지 못했습니다."),
    roomName: ensureString(raw.room?.name, "열람실 예약 room 이름을 찾지 못했습니다."),
    seatId: ensureNumber(raw.seat?.id, "열람실 좌석 id 를 찾지 못했습니다."),
    seatCode: ensureString(raw.seat?.code, "열람실 좌석 번호를 찾지 못했습니다."),
    reservationTime: ensureString(
      raw.reservationTime,
      "열람실 예약 시간 문자열을 찾지 못했습니다."
    ),
    beginTime: ensureString(raw.beginTime, "열람실 예약 시작 시각을 찾지 못했습니다."),
    endTime: ensureString(raw.endTime, "열람실 예약 종료 시각을 찾지 못했습니다."),
    ...(stateCode !== undefined ? { stateCode } : {}),
    ...(stateLabel !== undefined ? { stateLabel } : {}),
    isCheckinable: raw.isCheckinable === true,
    ...(checkinExpiryDate !== undefined ? { checkinExpiryDate } : {}),
    arrivalConfirmMethods: (raw.arrivalConfirmMethods ?? []).filter(
      (value): value is string => typeof value === "string" && value.length > 0
    ),
    isReturnable: raw.isReturnable === true,
    isRenewable: raw.isRenewable === true,
    ...(renewalLimit !== undefined ? { renewalLimit } : {}),
    ...(renewableCount !== undefined ? { renewableCount } : {}),
    ...(dateCreated !== undefined ? { dateCreated } : {})
  };
}

async function ensureAuthenticated(
  client: MjuLibraryClient,
  credentials: ResolvedLmsCredentials
): Promise<LibraryUserInfo> {
  const { myInfo } = await client.ensureAuthenticated<{
    id?: number;
    name?: string;
    memberNo?: string;
    branch?: RawBranch;
  }>(credentials.userId, credentials.password);
  const branchId = cleanNumber(myInfo.branch?.id);
  const branchName = cleanString(myInfo.branch?.name);
  const branchAlias = cleanString(myInfo.branch?.alias);

  return {
    id: ensureNumber(myInfo.id, "도서관 사용자 id 를 찾지 못했습니다."),
    name: ensureString(myInfo.name, "도서관 사용자 이름을 찾지 못했습니다."),
    memberNo: ensureString(myInfo.memberNo, "도서관 사용자 학번을 찾지 못했습니다."),
    ...(branchId !== undefined ? { branchId } : {}),
    ...(branchName !== undefined ? { branchName } : {}),
    ...(branchAlias !== undefined ? { branchAlias } : {})
  };
}

export async function listLibraryReadingRooms(
  client: MjuLibraryClient,
  credentials: ResolvedLmsCredentials,
  options: {
    campus?: string;
  } = {}
): Promise<{
  user: LibraryUserInfo;
  campuses: LibraryReadingRoomCampusAvailability[];
}> {
  const user = await ensureAuthenticated(client, credentials);
  const campusSelection = resolveCampusKey(options.campus);
  const campuses: LibraryCampusKey[] =
    campusSelection === "all" ? ["nature", "humanities"] : [campusSelection];

  const results: LibraryReadingRoomCampusAvailability[] = [];
  for (const campus of campuses) {
    const branchGroup = LIBRARY_BRANCH_GROUPS[campus];
    const raw = await client.getApiData<RawListResponse<RawSeatRoomSummary>>(
      `/${LIBRARY_HOMEPAGE_ID}/seat-rooms`,
      {
        searchParams: {
          branchGroupId: branchGroup.id,
          smufMethodCode: LIBRARY_SMUF_METHOD_CODE
        }
      }
    );

    const rooms: LibraryReadingRoomSummary[] = (raw.list ?? []).map((item) => {
      const roomTypeId = cleanNumber(item.roomType?.id);
      const roomTypeName = cleanString(item.roomType?.name);
      const branchId = cleanNumber(item.branch?.id);
      const branchName = cleanString(item.branch?.name);
      const branchAlias = cleanString(item.branch?.alias);
      const unableMessage = cleanString(item.unableMessage);

      return {
        roomId: ensureNumber(item.id, "열람실 id 를 찾지 못했습니다."),
        roomName: ensureString(item.name, "열람실 이름을 찾지 못했습니다."),
        ...(roomTypeId !== undefined ? { roomTypeId } : {}),
        ...(roomTypeName !== undefined ? { roomTypeName } : {}),
        ...(branchId !== undefined ? { branchId } : {}),
        ...(branchName !== undefined ? { branchName } : {}),
        ...(branchAlias !== undefined ? { branchAlias } : {}),
        isChargeable: item.isChargeable === true,
        ...(unableMessage !== undefined ? { unableMessage } : {}),
        seats: {
          total: cleanNumber(item.seats?.total) ?? 0,
          occupied: cleanNumber(item.seats?.occupied) ?? 0,
          waiting: cleanNumber(item.seats?.waiting) ?? 0,
          available: cleanNumber(item.seats?.available) ?? 0
        }
      };
    });

    results.push({
      campus,
      branchGroupId: branchGroup.id,
      branchName: branchGroup.name,
      branchAlias: branchGroup.alias,
      rooms
    });
  }

  return {
    user,
    campuses: results
  };
}

export async function getLibraryReadingRoomDetail(
  client: MjuLibraryClient,
  credentials: ResolvedLmsCredentials,
  options: {
    roomId: number;
    hopeDate?: string;
  }
): Promise<{
  user: LibraryUserInfo;
  room: LibraryReadingRoomDetail;
}> {
  const user = await ensureAuthenticated(client, credentials);
  const hopeDate = options.hopeDate?.trim() || formatLocalDateTime();
  const rawRoom = await client.getApiData<RawSeatRoomDetail>(
    `/${LIBRARY_HOMEPAGE_ID}/api/seat-rooms/${options.roomId}`,
    {
      searchParams: {
        smufMethodCode: LIBRARY_SMUF_METHOD_CODE
      }
    }
  );
  const rawSeats = await client.getApiData<RawListResponse<RawSeatSummary>>(
    `/${LIBRARY_HOMEPAGE_ID}/api/rooms/${options.roomId}/seats`,
    {
      searchParams: {
        hopeDate
      }
    }
  );
  const seats = (rawSeats.list ?? []).map(mapSeatSummary);
  const description = cleanString(rawRoom.description);
  const attention = cleanString(rawRoom.attention);

  return {
    user,
    room: {
      roomId: options.roomId,
      roomName: ensureString(rawRoom.name, "열람실 이름을 찾지 못했습니다."),
      ...(description !== undefined ? { description } : {}),
      ...(attention !== undefined ? { attention } : {}),
      reservable: rawRoom.reservable === true,
      reservableDates: (rawRoom.reservableDates ?? [])
        .map((item) => {
          const date = cleanString(item.date);
          const beginTime = formatCompactTime(item.beginTime);
          const endTime = formatCompactTime(item.endTime);
          return date && beginTime && endTime
            ? ({ date, beginTime, endTime } satisfies LibrarySeatReservableDate)
            : null;
        })
        .filter((item): item is LibrarySeatReservableDate => item !== null),
      seatTypes: (rawRoom.seatTypes ?? [])
        .map((item) => {
          const id = cleanNumber(item.id);
          const name = cleanString(item.name);
          return id !== undefined && name ? ({ id, name } satisfies LibrarySeatType) : null;
        })
        .filter((item): item is LibrarySeatType => item !== null),
      seats,
      hopeDate,
      totalSeatCount: seats.length,
      occupiedSeatCount: seats.filter((seat) => seat.isOccupied).length,
      reservableSeatCount: seats.filter((seat) => seat.isReservable).length
    }
  };
}

export async function explainLibraryReadingRoomSeatPosition(
  client: MjuLibraryClient,
  credentials: ResolvedLmsCredentials,
  options: {
    roomId: number;
    seatCode?: string;
    seatId?: number;
    hopeDate?: string;
  }
): Promise<{
  user: LibraryUserInfo;
  room: LibraryReadingRoomDetail;
  seat: LibrarySeatSummary;
  position: LibraryReadingRoomSeatPositionResult;
}> {
  const result = await getLibraryReadingRoomDetail(client, credentials, {
    roomId: options.roomId,
    ...(options.hopeDate ? { hopeDate: options.hopeDate } : {})
  });

  const normalizedSeatCode = options.seatCode?.trim();
  const seat = result.room.seats.find((item) => {
    if (options.seatId !== undefined && item.seatId === options.seatId) {
      return true;
    }

    if (normalizedSeatCode && item.seatCode === normalizedSeatCode) {
      return true;
    }

    return false;
  });

  if (!seat) {
    throw new Error("지정한 좌석을 열람실 좌석 목록에서 찾지 못했습니다.");
  }

  const position = describeReadingRoomSeatPosition(result.room, seat);

  return {
    user: result.user,
    room: result.room,
    seat,
    position
  };
}

export async function listLibrarySeatReservations(
  client: MjuLibraryClient,
  credentials: ResolvedLmsCredentials
): Promise<{
  user: LibraryUserInfo;
  reservations: LibrarySeatReservationSummary[];
}> {
  const user = await ensureAuthenticated(client, credentials);
  let raw: RawListResponse<RawSeatChargeSummary>;
  try {
    raw = await client.getApiData<RawListResponse<RawSeatChargeSummary>>(
      `/${LIBRARY_HOMEPAGE_ID}/api/seat-charges`
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("[success.noRecord]")) {
      raw = { list: [] };
    } else {
      throw error;
    }
  }

  return {
    user,
    reservations: (raw.list ?? []).map(mapSeatReservationSummary)
  };
}
