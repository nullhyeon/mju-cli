import type { ResolvedLmsCredentials } from "../auth/types.js";
import {
  LIBRARY_BRANCH_GROUPS,
  LIBRARY_HOMEPAGE_ID,
  LIBRARY_SMUF_METHOD_CODE,
  LIBRARY_STUDY_ROOM_TYPE_ID,
  type LibraryCampusKey
} from "./constants.js";
import { MjuLibraryClient } from "./client.js";
import type {
  LibraryBlockedTimeRange,
  LibraryCampusAvailability,
  LibraryCompanion,
  LibraryCompanionInput,
  LibraryReservationMutationPreview,
  LibraryReservationMutationResult,
  LibraryReservationRequestInput,
  LibraryRoomReservationDetail,
  LibraryRoomReservationSummary,
  LibraryStudyRoomDetail,
  LibraryStudyRoomSummary,
  LibraryTimeSlot,
  LibraryUseSection,
  LibraryUserInfo
} from "./types.js";

interface RawBranch {
  id?: number;
  name?: string;
  alias?: string;
}

interface RawFloor {
  value?: number;
  label?: string;
}

interface RawRoomType {
  id?: number;
  name?: string;
}

interface RawRoomRule {
  timeUnit?: string;
  useCompanionRegistration?: boolean;
  useOutsiderRegistration?: boolean;
  minTime?: number;
  maxTime?: number;
}

interface RawEquipment {
  id?: number;
  name?: string;
}

interface RawExpansionField {
  code?: string;
  name?: string;
  isMandatory?: boolean;
}

interface RawRoomSummary {
  id?: number;
  name?: string;
  roomType?: RawRoomType;
  floor?: RawFloor;
  minQuota?: number;
  maxQuota?: number;
  quota?: number;
  isChargeable?: boolean;
  unableMessage?: string;
}

interface RawRoomDetail extends RawRoomSummary {
  branch?: RawBranch;
  building?: {
    name?: string;
  };
  description?: string;
  attention?: string;
  note?: string;
  timeLine?: unknown;
  reservableDates?: string[] | null;
  reservableMonths?: string[] | null;
  rule?: RawRoomRule;
  equipments?: RawEquipment[] | null;
  expansionFields?: RawExpansionField[] | null;
}

interface RawListResponse<T> {
  totalCount?: number;
  list?: T[] | null;
}

interface RawUseSection {
  id?: number;
  code?: string;
  name?: string;
}

interface RawFloorsAndDates {
  floors?: RawFloor[] | null;
  reservableDates?: string[] | null;
  reservableMonths?: string[] | null;
}

interface RawPatron {
  id?: number;
  name?: string;
  memberNo?: string;
}

interface RawRoomChargeSummary {
  id?: number;
  companionCnt?: number;
  useSection?: RawUseSection;
  reservationTime?: string;
  beginTime?: string;
  endTime?: string;
  state?: { code?: string; name?: string };
  room?: {
    id?: number;
    name?: string;
    branch?: RawBranch;
  };
}

interface RawRoomChargeDetail {
  id?: number;
  reservationTime?: string;
  beginTime?: string;
  endTime?: string;
  patron?: RawPatron;
  room?: RawRoomDetail;
  useSection?: RawUseSection;
  state?: { code?: string; name?: string };
  isEditable?: boolean;
  companionCnt?: number;
  patronMessage?: string;
  workerMessage?: string;
  dateCreated?: string;
  companions?: RawPatron[] | null;
  outsiders?: Array<{ name?: string; belong?: string }> | null;
  equipments?: RawEquipment[] | null;
  logs?: Array<Record<string, unknown>> | null;
  expansionValues?: Array<Record<string, unknown>> | null;
  isCheckinable?: boolean;
  isReturnable?: boolean;
  isRenewable?: boolean;
}

interface RawCheckedCompanion {
  id?: number;
  name?: string;
  memberNo?: string;
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

function ensureNumber(value: number | undefined, message: string): number {
  if (value === undefined) {
    throw new Error(message);
  }

  return value;
}

function ensureString(value: string | undefined, message: string): string {
  if (!value) {
    throw new Error(message);
  }

  return value;
}

function sortUniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
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

function mapRoomSummary(raw: RawRoomSummary): LibraryStudyRoomSummary {
  const roomId = ensureNumber(raw.id, "도서관 방 id 를 찾지 못했습니다.");
  const roomName = ensureString(raw.name, "도서관 방 이름을 찾지 못했습니다.");
  const roomTypeName = cleanString(raw.roomType?.name);
  const floorValue = cleanNumber(raw.floor?.value);
  const floorLabel = cleanString(raw.floor?.label);
  const minQuota = cleanNumber(raw.minQuota);
  const maxQuota = cleanNumber(raw.maxQuota);
  const quota = cleanNumber(raw.quota);
  const unableMessage = cleanString(raw.unableMessage);

  return {
    roomId,
    roomName,
    ...(roomTypeName !== undefined ? { roomTypeName } : {}),
    ...(floorValue !== undefined ? { floorValue } : {}),
    ...(floorLabel !== undefined ? { floorLabel } : {}),
    ...(minQuota !== undefined ? { minQuota } : {}),
    ...(maxQuota !== undefined ? { maxQuota } : {}),
    ...(quota !== undefined ? { quota } : {}),
    isChargeable: raw.isChargeable === true,
    ...(unableMessage !== undefined ? { unableMessage } : {})
  };
}

function mapUseSection(raw: RawUseSection): LibraryUseSection {
  return {
    id: ensureNumber(raw.id, "도서관 이용 목적 id 를 찾지 못했습니다."),
    code: ensureString(raw.code, "도서관 이용 목적 code 를 찾지 못했습니다."),
    name: ensureString(raw.name, "도서관 이용 목적 이름을 찾지 못했습니다.")
  };
}

function mapCompanion(raw: RawPatron): LibraryCompanion {
  return {
    id: ensureNumber(raw.id, "동행자 id 를 찾지 못했습니다."),
    name: ensureString(raw.name, "동행자 이름을 찾지 못했습니다."),
    memberNo: ensureString(raw.memberNo, "동행자 학번을 찾지 못했습니다.")
  };
}

function parseTimeLabel(value: string): number {
  const match = /^(\d{2,3}):(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`시간 형식이 올바르지 않습니다: ${value}`);
  }

  return Number.parseInt(match[1], 10) * 60 + Number.parseInt(match[2], 10);
}

function formatTimeLabel(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function formatReservationDateTime(date: string, time: string): string {
  const [yearText, monthText, dayText] = date.split("-");
  const year = Number.parseInt(yearText ?? "", 10);
  const month = Number.parseInt(monthText ?? "", 10);
  const day = Number.parseInt(dayText ?? "", 10);
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    throw new Error(`날짜 형식이 올바르지 않습니다: ${date}`);
  }

  const totalMinutes = parseTimeLabel(time);
  const result = new Date(Date.UTC(year, month - 1, day, 0, totalMinutes));

  return `${result.getUTCFullYear()}-${String(result.getUTCMonth() + 1).padStart(2, "0")}-${String(result.getUTCDate()).padStart(2, "0")} ${String(result.getUTCHours()).padStart(2, "0")}:${String(result.getUTCMinutes()).padStart(2, "0")}`;
}

function flattenTimeLineEntry(value: unknown, target: LibraryTimeSlot[]): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      flattenTimeLineEntry(item, target);
    }
    return;
  }

  if (
    typeof value !== "object" ||
    value === null ||
    !("hour" in value) ||
    !("minutes" in value)
  ) {
    return;
  }

  const hour = cleanNumber((value as { hour?: unknown }).hour);
  const minutes = (value as { minutes?: unknown }).minutes;
  if (hour === undefined || !Array.isArray(minutes) || minutes.length === 0) {
    return;
  }

  const stepMinutes = Math.floor(60 / minutes.length);
  minutes.forEach((minute, index) => {
    const className =
      typeof minute === "object" &&
      minute !== null &&
      "class" in minute &&
      typeof (minute as { class?: unknown }).class === "string"
        ? (minute as { class?: string }).class ?? ""
        : "";
    const selectable =
      typeof minute === "object" &&
      minute !== null &&
      "selectable" in minute &&
      typeof (minute as { selectable?: unknown }).selectable === "boolean"
        ? ((minute as { selectable?: boolean }).selectable ?? false)
        : false;

    target.push({
      time: formatTimeLabel(hour * 60 + index * stepMinutes),
      className,
      selectable,
      stepMinutes
    });
  });
}

function flattenTimeLine(raw: unknown): LibraryTimeSlot[] {
  const slots: LibraryTimeSlot[] = [];
  flattenTimeLineEntry(raw, slots);
  return slots.sort((left, right) => parseTimeLabel(left.time) - parseTimeLabel(right.time));
}

function deriveBlockedRanges(slots: LibraryTimeSlot[]): LibraryBlockedTimeRange[] {
  const ranges: LibraryBlockedTimeRange[] = [];
  let current: LibraryBlockedTimeRange | undefined;

  for (const slot of slots) {
    const blocked = slot.className.length > 0 || !slot.selectable;
    if (!blocked) {
      if (current) {
        ranges.push(current);
        current = undefined;
      }
      continue;
    }

    const slotEndTime = formatTimeLabel(parseTimeLabel(slot.time) + slot.stepMinutes);
    if (current && current.className === slot.className && current.endTime === slot.time) {
      current.endTime = slotEndTime;
      continue;
    }

    if (current) {
      ranges.push(current);
    }

    current = {
      startTime: slot.time,
      endTime: slotEndTime,
      className: slot.className || "blocked"
    };
  }

  if (current) {
    ranges.push(current);
  }

  return ranges;
}

function deriveReservableStartTimes(slots: LibraryTimeSlot[]): string[] {
  return slots
    .filter((slot) => slot.className.length === 0 && slot.selectable)
    .map((slot) => slot.time);
}

function hasAvailableTimeRange(
  slots: LibraryTimeSlot[],
  beginTime: string,
  endTime: string
): boolean {
  const beginMinutes = parseTimeLabel(beginTime);
  const endMinutes = parseTimeLabel(endTime);
  if (endMinutes <= beginMinutes) {
    return false;
  }

  const rangeSlots = slots.filter((slot) => {
    const minutes = parseTimeLabel(slot.time);
    return beginMinutes <= minutes && minutes < endMinutes;
  });

  if (rangeSlots.length === 0) {
    return false;
  }

  return rangeSlots.every((slot) => slot.className.length === 0 && slot.selectable);
}

function deriveReservableEndTimes(
  slots: LibraryTimeSlot[],
  beginTime: string,
  minDurationMinutes: number,
  maxDurationMinutes: number
): string[] {
  const baseSlot = slots.find((slot) => slot.time === beginTime);
  const stepMinutes = baseSlot?.stepMinutes ?? 10;
  const endTimes: string[] = [];
  const beginMinutes = parseTimeLabel(beginTime);

  for (
    let duration = minDurationMinutes;
    duration <= maxDurationMinutes;
    duration += stepMinutes
  ) {
    const endTime = formatTimeLabel(beginMinutes + duration);
    if (!hasAvailableTimeRange(slots, beginTime, endTime)) {
      break;
    }

    endTimes.push(endTime);
  }

  return endTimes;
}

function resolveDate(preferredDate: string | undefined, availableDates: string[]): string {
  const requested = preferredDate?.trim();
  if (requested) {
    if (!availableDates.includes(requested)) {
      throw new Error(
        `선택한 날짜 ${requested} 는 예약 가능 날짜가 아닙니다. 가능 날짜: ${availableDates.join(", ")}`
      );
    }

    return requested;
  }

  const firstDate = availableDates[0];
  if (!firstDate) {
    throw new Error("예약 가능한 날짜를 찾지 못했습니다.");
  }

  return firstDate;
}

function mapCampusAvailability(
  campus: LibraryCampusKey,
  rawFloorsAndDates: RawFloorsAndDates,
  rawRooms: RawListResponse<RawRoomSummary>,
  selectedDate: string
): LibraryCampusAvailability {
  const branchGroup = LIBRARY_BRANCH_GROUPS[campus];

  return {
    campus,
    branchGroupId: branchGroup.id,
    branchName: branchGroup.name,
    branchAlias: branchGroup.alias,
    selectedDate,
    availableDates: sortUniqueStrings(rawFloorsAndDates.reservableDates ?? []),
    floors: (rawFloorsAndDates.floors ?? [])
      .map((floor) => ({
        value: ensureNumber(floor.value, "도서관 층 value 를 찾지 못했습니다."),
        label: ensureString(floor.label, "도서관 층 label 을 찾지 못했습니다.")
      }))
      .sort((left, right) => left.value - right.value),
    rooms: (rawRooms.list ?? []).map(mapRoomSummary)
  };
}

function mapRoomDetail(
  rawRoom: RawRoomDetail,
  useSections: LibraryUseSection[],
  date: string,
  beginTime?: string
): LibraryStudyRoomDetail {
  const timeline = flattenTimeLine(rawRoom.timeLine);
  const campusId = cleanNumber(rawRoom.branch?.id);
  const campusName = cleanString(rawRoom.branch?.name);
  const campusAlias = cleanString(rawRoom.branch?.alias);
  const buildingName = cleanString(rawRoom.building?.name);
  const floorValue = cleanNumber(rawRoom.floor?.value);
  const floorLabel = cleanString(rawRoom.floor?.label);
  const roomTypeName = cleanString(rawRoom.roomType?.name);
  const minQuota = cleanNumber(rawRoom.minQuota);
  const maxQuota = cleanNumber(rawRoom.maxQuota);
  const quota = cleanNumber(rawRoom.quota);
  const description = cleanString(rawRoom.description);
  const attention = cleanString(rawRoom.attention);
  const note = cleanString(rawRoom.note);
  const timeUnit = cleanString(rawRoom.rule?.timeUnit);
  const minDurationMinutes = cleanNumber(rawRoom.rule?.minTime);
  const maxDurationMinutes = cleanNumber(rawRoom.rule?.maxTime);

  return {
    roomId: ensureNumber(rawRoom.id, "도서관 방 id 를 찾지 못했습니다."),
    roomName: ensureString(rawRoom.name, "도서관 방 이름을 찾지 못했습니다."),
    ...(campusId !== undefined ? { campusId } : {}),
    ...(campusName !== undefined ? { campusName } : {}),
    ...(campusAlias !== undefined ? { campusAlias } : {}),
    ...(buildingName !== undefined ? { buildingName } : {}),
    ...(floorValue !== undefined ? { floorValue } : {}),
    ...(floorLabel !== undefined ? { floorLabel } : {}),
    ...(roomTypeName !== undefined ? { roomTypeName } : {}),
    ...(minQuota !== undefined ? { minQuota } : {}),
    ...(maxQuota !== undefined ? { maxQuota } : {}),
    ...(quota !== undefined ? { quota } : {}),
    isChargeable: rawRoom.isChargeable === true,
    ...(description !== undefined ? { description } : {}),
    ...(attention !== undefined ? { attention } : {}),
    ...(note !== undefined ? { note } : {}),
    date,
    availableDates: sortUniqueStrings(rawRoom.reservableDates ?? []),
    availableMonths: sortUniqueStrings(rawRoom.reservableMonths ?? []),
    ...(timeUnit !== undefined ? { timeUnit } : {}),
    ...(minDurationMinutes !== undefined ? { minDurationMinutes } : {}),
    ...(maxDurationMinutes !== undefined ? { maxDurationMinutes } : {}),
    useCompanionRegistration: rawRoom.rule?.useCompanionRegistration === true,
    useOutsiderRegistration: rawRoom.rule?.useOutsiderRegistration === true,
    equipments: (rawRoom.equipments ?? [])
      .map((equipment) => {
        const id = cleanNumber(equipment.id);
        const name = cleanString(equipment.name);
        return id !== undefined && name ? { id, name } : null;
      })
      .filter((equipment): equipment is { id: number; name: string } => equipment !== null),
    expansionFields: (rawRoom.expansionFields ?? [])
      .map((field) => {
        const code = cleanString(field.code);
        const name = cleanString(field.name);
        return code && name
          ? { code, name, isMandatory: field.isMandatory === true }
          : null;
      })
      .filter(
        (field): field is { code: string; name: string; isMandatory: boolean } =>
          field !== null
      ),
    useSections,
    timeline,
    blockedRanges: deriveBlockedRanges(timeline),
    reservableStartTimes: deriveReservableStartTimes(timeline),
    ...(beginTime && minDurationMinutes !== undefined && maxDurationMinutes !== undefined
      ? {
          reservableEndTimes: deriveReservableEndTimes(
            timeline,
            beginTime,
            minDurationMinutes,
            maxDurationMinutes
          )
        }
      : {})
  };
}

function mapRoomReservationSummary(raw: RawRoomChargeSummary): LibraryRoomReservationSummary {
  const roomId = cleanNumber(raw.room?.id);
  const campusName = cleanString(raw.room?.branch?.name);
  const campusAlias = cleanString(raw.room?.branch?.alias);
  const useSectionName = cleanString(raw.useSection?.name);
  const stateCode = cleanString(raw.state?.code);
  const stateLabel = cleanString(raw.state?.name);
  const beginTime = cleanString(raw.beginTime);
  const endTime = cleanString(raw.endTime);

  return {
    reservationId: ensureNumber(raw.id, "예약 id 를 찾지 못했습니다."),
    ...(roomId !== undefined ? { roomId } : {}),
    roomName: ensureString(raw.room?.name, "예약 공간 이름을 찾지 못했습니다."),
    ...(campusName !== undefined ? { campusName } : {}),
    ...(campusAlias !== undefined ? { campusAlias } : {}),
    ...(useSectionName !== undefined ? { useSectionName } : {}),
    ...(stateCode !== undefined ? { stateCode } : {}),
    ...(stateLabel !== undefined ? { stateLabel } : {}),
    reservationTime:
      ensureString(raw.reservationTime, "예약 시간 문자열을 찾지 못했습니다."),
    ...(beginTime !== undefined ? { beginTime } : {}),
    ...(endTime !== undefined ? { endTime } : {}),
    companionCount: cleanNumber(raw.companionCnt) ?? 0
  };
}

function mapExpansionValues(
  values: Array<Record<string, unknown>> | null | undefined
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const item of values ?? []) {
    for (const [key, value] of Object.entries(item)) {
      const normalized = cleanString(value);
      if (normalized) {
        result[key] = normalized;
      }
    }
  }

  return result;
}

function mapRoomReservationDetail(raw: RawRoomChargeDetail): LibraryRoomReservationDetail {
  const campusName = cleanString(raw.room?.branch?.name);
  const campusAlias = cleanString(raw.room?.branch?.alias);
  const buildingName = cleanString(raw.room?.building?.name);
  const floorLabel = cleanString(raw.room?.floor?.label);
  const stateCode = cleanString(raw.state?.code);
  const stateLabel = cleanString(raw.state?.name);
  const patronMessage = cleanString(raw.patronMessage);
  const workerMessage = cleanString(raw.workerMessage);
  const dateCreated = cleanString(raw.dateCreated);
  const timeUnit = cleanString(raw.room?.rule?.timeUnit);
  const minDurationMinutes = cleanNumber(raw.room?.rule?.minTime);
  const maxDurationMinutes = cleanNumber(raw.room?.rule?.maxTime);
  const minQuota = cleanNumber(raw.room?.minQuota);
  const maxQuota = cleanNumber(raw.room?.maxQuota);

  return {
    reservationId: ensureNumber(raw.id, "예약 상세 id 를 찾지 못했습니다."),
    roomId: ensureNumber(raw.room?.id, "예약 상세의 room id 를 찾지 못했습니다."),
    roomName: ensureString(raw.room?.name, "예약 상세의 room 이름을 찾지 못했습니다."),
    ...(campusName !== undefined ? { campusName } : {}),
    ...(campusAlias !== undefined ? { campusAlias } : {}),
    ...(buildingName !== undefined ? { buildingName } : {}),
    ...(floorLabel !== undefined ? { floorLabel } : {}),
    reservationTime:
      ensureString(raw.reservationTime, "예약 상세 시간 문자열을 찾지 못했습니다."),
    beginTime: ensureString(raw.beginTime, "예약 시작 시각을 찾지 못했습니다."),
    endTime: ensureString(raw.endTime, "예약 종료 시각을 찾지 못했습니다."),
    ...(stateCode !== undefined ? { stateCode } : {}),
    ...(stateLabel !== undefined ? { stateLabel } : {}),
    ...(raw.useSection ? { useSection: mapUseSection(raw.useSection) } : {}),
    isEditable: raw.isEditable === true,
    isCheckinable: raw.isCheckinable === true,
    isReturnable: raw.isReturnable === true,
    isRenewable: raw.isRenewable === true,
    companionCount: cleanNumber(raw.companionCnt) ?? 0,
    companions: (raw.companions ?? []).map(mapCompanion),
    ...(patronMessage !== undefined ? { patronMessage } : {}),
    ...(workerMessage !== undefined ? { workerMessage } : {}),
    ...(dateCreated !== undefined ? { dateCreated } : {}),
    ...(timeUnit !== undefined ? { timeUnit } : {}),
    ...(minDurationMinutes !== undefined ? { minDurationMinutes } : {}),
    ...(maxDurationMinutes !== undefined ? { maxDurationMinutes } : {}),
    ...(minQuota !== undefined ? { minQuota } : {}),
    ...(maxQuota !== undefined ? { maxQuota } : {}),
    useCompanionRegistration: raw.room?.rule?.useCompanionRegistration === true,
    useOutsiderRegistration: raw.room?.rule?.useOutsiderRegistration === true,
    equipmentIds: (raw.equipments ?? [])
      .map((equipment) => cleanNumber(equipment.id))
      .filter((id): id is number => id !== undefined),
    additionalInfoValues: mapExpansionValues(raw.expansionValues)
  };
}

function buildReservationTimeLabel(date: string, beginTime: string, endTime: string): string {
  return `${date} ${beginTime} ~ ${endTime}`;
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

async function fetchUseSections(
  client: MjuLibraryClient,
  roomId: number
): Promise<LibraryUseSection[]> {
  const response = await client.getApiData<RawListResponse<RawUseSection>>(
    `/${LIBRARY_HOMEPAGE_ID}/api/rooms/${roomId}/use-sections`
  );
  return (response.list ?? []).map(mapUseSection);
}

async function getLibraryStudyRoomDetailInternal(
  client: MjuLibraryClient,
  options: {
    roomId: number;
    date: string;
    beginTime?: string;
  }
): Promise<LibraryStudyRoomDetail> {
  const rawRoom = await client.getApiData<RawRoomDetail>(
    `/${LIBRARY_HOMEPAGE_ID}/api/rooms/${options.roomId}`,
    {
      searchParams: {
        hopeDate: options.date
      }
    }
  );
  const useSections = await fetchUseSections(client, options.roomId);
  return mapRoomDetail(rawRoom, useSections, options.date, options.beginTime);
}

async function getLibraryRoomReservationDetailInternal(
  client: MjuLibraryClient,
  reservationId: number
): Promise<LibraryRoomReservationDetail> {
  const raw = await client.getApiData<RawRoomChargeDetail>(
    `/${LIBRARY_HOMEPAGE_ID}/api/room-charges/${reservationId}`
  );
  return mapRoomReservationDetail(raw);
}

function resolveUseSection(
  useSections: LibraryUseSection[],
  input: Pick<
    LibraryReservationRequestInput,
    "useSectionId" | "useSectionCode" | "useSectionName"
  >,
  fallback?: LibraryUseSection
): LibraryUseSection {
  const candidates = useSections.filter((section) => {
    if (input.useSectionId !== undefined && section.id === input.useSectionId) {
      return true;
    }
    if (
      input.useSectionCode &&
      section.code.toLowerCase() === input.useSectionCode.trim().toLowerCase()
    ) {
      return true;
    }
    if (
      input.useSectionName &&
      section.name.toLowerCase() === input.useSectionName.trim().toLowerCase()
    ) {
      return true;
    }
    return false;
  });

  if (candidates.length === 1) {
    return candidates[0]!;
  }

  if (candidates.length > 1) {
    throw new Error("이용 목적이 여러 개로 해석되었습니다. id 또는 code 로 명시해주세요.");
  }

  if (fallback) {
    return fallback;
  }

  throw new Error(
    "이용 목적을 찾지 못했습니다. useSectionId/useSectionCode/useSectionName 중 하나를 지정해주세요."
  );
}

async function resolveCompanions(
  client: MjuLibraryClient,
  roomId: number,
  date: string,
  companions: LibraryCompanionInput[] | undefined,
  fallbackCompanions: LibraryCompanion[] = []
): Promise<LibraryCompanion[]> {
  if (!companions || companions.length === 0) {
    return fallbackCompanions;
  }

  const resolved: LibraryCompanion[] = [];
  for (const companion of companions) {
    const name = companion.name.trim();
    const memberNo = companion.memberNo.trim();
    if (!name || !memberNo) {
      throw new Error("동행자는 name 과 memberNo 를 모두 제공해야 합니다.");
    }

    const payload = await client.getApiData<RawCheckedCompanion>(
      `/api/rooms/${roomId}/check-companions`,
      {
        searchParams: {
          name,
          memberNo,
          hopeDate: date
        }
      }
    );
    resolved.push(mapCompanion(payload));
  }

  const uniqueIds = new Set(resolved.map((companion) => companion.id));
  if (uniqueIds.size !== resolved.length) {
    throw new Error("동행자 목록에 중복된 사용자가 포함되어 있습니다.");
  }

  return resolved;
}

function buildAdditionalInfoPayload(
  additionalInfoValues: Record<string, string> | undefined
): Array<Record<string, string>> {
  return Object.entries(additionalInfoValues ?? {}).map(([key, value]) => ({
    [key]: value
  }));
}

function validateCompanionCount(params: {
  companionCount: number;
  minQuota: number | undefined;
  maxQuota: number | undefined;
  resolvedCompanions: LibraryCompanion[];
  useCompanionRegistration: boolean;
}): void {
  const minCompanionCount =
    params.minQuota !== undefined ? Math.max(params.minQuota - 1, 0) : 0;
  const maxCompanionCount =
    params.maxQuota !== undefined ? Math.max(params.maxQuota - 1, 0) : Number.MAX_SAFE_INTEGER;

  if (params.companionCount < minCompanionCount) {
    throw new Error(`이 공간은 최소 ${minCompanionCount}명의 동행자가 필요합니다.`);
  }

  if (params.companionCount > maxCompanionCount) {
    throw new Error(`이 공간의 최대 동행자 수는 ${maxCompanionCount}명입니다.`);
  }

  if (
    params.useCompanionRegistration &&
    params.companionCount !== params.resolvedCompanions.length
  ) {
    throw new Error(
      `동행자 수(${params.companionCount})와 확인된 동행자 목록 수(${params.resolvedCompanions.length})가 일치하지 않습니다.`
    );
  }
}

async function buildReservationPreview(
  client: MjuLibraryClient,
  input: LibraryReservationRequestInput,
  options: {
    existingDetail?: LibraryRoomReservationDetail | undefined;
  } = {}
): Promise<LibraryReservationMutationPreview> {
  const detail = await getLibraryStudyRoomDetailInternal(client, {
    roomId: input.roomId,
    date: input.date,
    beginTime: input.beginTime
  });
  const existingDetail = options.existingDetail;

  const useSection = resolveUseSection(detail.useSections, input, existingDetail?.useSection);

  const resolvedCompanions = await resolveCompanions(
    client,
    input.roomId,
    input.date,
    input.companions,
    existingDetail?.companions ?? []
  );
  const companionCount =
    input.companionCount ?? existingDetail?.companionCount ?? resolvedCompanions.length;

  validateCompanionCount({
    companionCount,
    minQuota: detail.minQuota,
    maxQuota: detail.maxQuota,
    resolvedCompanions,
    useCompanionRegistration: detail.useCompanionRegistration
  });

  if (detail.minDurationMinutes !== undefined && detail.maxDurationMinutes !== undefined) {
    const endTimes = deriveReservableEndTimes(
      detail.timeline,
      input.beginTime,
      detail.minDurationMinutes,
      detail.maxDurationMinutes
    );
    if (!endTimes.includes(input.endTime)) {
      throw new Error(
        `선택한 종료 시각 ${input.endTime} 는 예약 가능 범위가 아닙니다. 가능 종료 시각: ${endTimes.join(", ")}`
      );
    }
  }

  if (!hasAvailableTimeRange(detail.timeline, input.beginTime, input.endTime)) {
    throw new Error("선택한 시간대에 이미 예약 또는 사용 불가 구간이 포함되어 있습니다.");
  }

  const approvalWarnings: string[] = [];
  if (!detail.isChargeable) {
    approvalWarnings.push("현재 공간 상세 응답 기준으로 isChargeable=false 입니다.");
  }

  return {
    roomId: detail.roomId,
    roomName: detail.roomName,
    ...(detail.campusName ? { campusName: detail.campusName } : {}),
    ...(detail.campusAlias ? { campusAlias: detail.campusAlias } : {}),
    date: input.date,
    beginTime: input.beginTime,
    endTime: input.endTime,
    reservationTime: buildReservationTimeLabel(input.date, input.beginTime, input.endTime),
    useSection,
    companionCount,
    resolvedCompanions,
    approvalWarnings
  };
}

function buildReservationPayload(
  preview: LibraryReservationMutationPreview,
  input: LibraryReservationRequestInput,
  detail: LibraryStudyRoomDetail
): Record<string, unknown> {
  return {
    roomId: preview.roomId,
    roomUseSectionId: preview.useSection.id,
    beginTime: formatReservationDateTime(input.date, input.beginTime),
    endTime: formatReservationDateTime(input.date, input.endTime),
    companionCnt: preview.companionCount,
    ...(detail.useCompanionRegistration
      ? {
          companionPatrons: preview.resolvedCompanions.map((companion) => companion.id)
        }
      : {}),
    roomChargeOutsiders: [],
    roomChargeEquipments: input.equipmentIds ?? [],
    patronMessage: input.patronMessage ?? "",
    smufMethodCode: LIBRARY_SMUF_METHOD_CODE,
    roomChargeAdditionInfos: buildAdditionalInfoPayload(input.additionalInfoValues)
  };
}

async function findMatchingRoomReservation(
  client: MjuLibraryClient,
  credentials: ResolvedLmsCredentials,
  input: LibraryReservationRequestInput
): Promise<LibraryRoomReservationSummary> {
  const { reservations } = await listLibraryRoomReservations(client, credentials);
  const expectedBeginTime = `${input.date} ${input.beginTime}:00`;
  const expectedEndTime = `${input.date} ${input.endTime}:00`;
  const matched = reservations
    .filter(
      (reservation) =>
        reservation.roomId === input.roomId &&
        reservation.beginTime === expectedBeginTime &&
        reservation.endTime === expectedEndTime
    )
    .sort((left, right) => right.reservationId - left.reservationId)[0];

  if (!matched) {
    throw new Error("생성된 예약을 예약 목록에서 다시 찾지 못했습니다.");
  }

  return matched;
}

export async function listLibraryStudyRooms(
  client: MjuLibraryClient,
  credentials: ResolvedLmsCredentials,
  options: {
    campus?: string;
    date?: string;
  } = {}
): Promise<{
  user: LibraryUserInfo;
  campuses: LibraryCampusAvailability[];
}> {
  const user = await ensureAuthenticated(client, credentials);
  const campusSelection = resolveCampusKey(options.campus);
  const campuses: LibraryCampusKey[] =
    campusSelection === "all" ? ["nature", "humanities"] : [campusSelection];

  const results: LibraryCampusAvailability[] = [];
  for (const campus of campuses) {
    const branchGroup = LIBRARY_BRANCH_GROUPS[campus];
    const floorsAndDates = await client.getApiData<RawFloorsAndDates>(
      `/${LIBRARY_HOMEPAGE_ID}/api/room-floors-and-chargeable-dates`,
      {
        searchParams: {
          roomTypeId: LIBRARY_STUDY_ROOM_TYPE_ID,
          branchGroupId: branchGroup.id
        }
      }
    );
    const availableDates = sortUniqueStrings(floorsAndDates.reservableDates ?? []);
    const selectedDate = resolveDate(options.date, availableDates);
    const rooms = await client.getApiData<RawListResponse<RawRoomSummary>>(
      `/${LIBRARY_HOMEPAGE_ID}/api/rooms`,
      {
        searchParams: {
          roomTypeId: LIBRARY_STUDY_ROOM_TYPE_ID,
          branchGroupId: branchGroup.id,
          smufMethodCode: LIBRARY_SMUF_METHOD_CODE
        }
      }
    );

    results.push(mapCampusAvailability(campus, floorsAndDates, rooms, selectedDate));
  }

  return {
    user,
    campuses: results
  };
}

export async function getLibraryStudyRoomDetail(
  client: MjuLibraryClient,
  credentials: ResolvedLmsCredentials,
  options: {
    roomId: number;
    date: string;
    beginTime?: string;
  }
): Promise<{
  user: LibraryUserInfo;
  room: LibraryStudyRoomDetail;
}> {
  const user = await ensureAuthenticated(client, credentials);
  return {
    user,
    room: await getLibraryStudyRoomDetailInternal(client, options)
  };
}

export async function listLibraryRoomReservations(
  client: MjuLibraryClient,
  credentials: ResolvedLmsCredentials
): Promise<{
  user: LibraryUserInfo;
  reservations: LibraryRoomReservationSummary[];
}> {
  const user = await ensureAuthenticated(client, credentials);
  let raw: RawListResponse<RawRoomChargeSummary>;
  try {
    raw = await client.getApiData<RawListResponse<RawRoomChargeSummary>>(
      `/${LIBRARY_HOMEPAGE_ID}/api/room-charges`
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
    reservations: (raw.list ?? []).map(mapRoomReservationSummary)
  };
}

export async function previewLibraryRoomReservation(
  client: MjuLibraryClient,
  credentials: ResolvedLmsCredentials,
  input: LibraryReservationRequestInput
): Promise<{
  user: LibraryUserInfo;
  preview: LibraryReservationMutationPreview;
}> {
  const user = await ensureAuthenticated(client, credentials);
  const preview = await buildReservationPreview(client, input);
  return { user, preview };
}

export async function createLibraryRoomReservation(
  client: MjuLibraryClient,
  credentials: ResolvedLmsCredentials,
  input: LibraryReservationRequestInput
): Promise<{
  user: LibraryUserInfo;
  result: LibraryReservationMutationResult;
}> {
  const user = await ensureAuthenticated(client, credentials);
  const preview = await buildReservationPreview(client, input);
  const roomDetail = await getLibraryStudyRoomDetailInternal(client, {
    roomId: input.roomId,
    date: input.date
  });
  const payload = buildReservationPayload(preview, input, roomDetail);
  const created = await client.postApiData<{ id?: number } | undefined>(
    `/${LIBRARY_HOMEPAGE_ID}/api/room-charges`,
    payload
  );
  const reservationId =
    cleanNumber(created?.id) ??
    (await findMatchingRoomReservation(client, credentials, input)).reservationId;
  const detail = await getLibraryRoomReservationDetailInternal(client, reservationId);

  return {
    user,
    result: {
      ...preview,
      reservationId,
      ...(detail.stateCode ? { stateCode: detail.stateCode } : {}),
      ...(detail.stateLabel ? { stateLabel: detail.stateLabel } : {})
    }
  };
}

export async function previewLibraryRoomReservationUpdate(
  client: MjuLibraryClient,
  credentials: ResolvedLmsCredentials,
  reservationId: number,
  input: Omit<LibraryReservationRequestInput, "roomId">
): Promise<{
  user: LibraryUserInfo;
  existingReservation: LibraryRoomReservationDetail;
  preview: LibraryReservationMutationPreview;
}> {
  const user = await ensureAuthenticated(client, credentials);
  const existingReservation = await getLibraryRoomReservationDetailInternal(client, reservationId);
  if (!existingReservation.isEditable) {
    throw new Error("현재 예약은 수정 가능한 상태가 아닙니다.");
  }

  const preview = await buildReservationPreview(
    client,
    {
      ...input,
      roomId: existingReservation.roomId,
      companionCount: input.companionCount ?? existingReservation.companionCount
    },
    {
      existingDetail: existingReservation
    }
  );

  return {
    user,
    existingReservation,
    preview
  };
}

export async function updateLibraryRoomReservation(
  client: MjuLibraryClient,
  credentials: ResolvedLmsCredentials,
  reservationId: number,
  input: Omit<LibraryReservationRequestInput, "roomId">
): Promise<{
  user: LibraryUserInfo;
  result: LibraryReservationMutationResult;
}> {
  const { user, existingReservation, preview } = await previewLibraryRoomReservationUpdate(
    client,
    credentials,
    reservationId,
    input
  );
  const roomDetail = await getLibraryStudyRoomDetailInternal(client, {
    roomId: existingReservation.roomId,
    date: input.date
  });
  const payload = buildReservationPayload(
    preview,
    {
      ...input,
      roomId: existingReservation.roomId
    },
    roomDetail
  );

  await client.putApiData(
    `/${LIBRARY_HOMEPAGE_ID}/api/room-charges/${reservationId}`,
    payload
  );
  const detail = await getLibraryRoomReservationDetailInternal(client, reservationId);

  return {
    user,
    result: {
      ...preview,
      reservationId,
      ...(detail.stateCode ? { stateCode: detail.stateCode } : {}),
      ...(detail.stateLabel ? { stateLabel: detail.stateLabel } : {})
    }
  };
}

export async function previewLibraryRoomReservationCancel(
  client: MjuLibraryClient,
  credentials: ResolvedLmsCredentials,
  reservationId: number
): Promise<{
  user: LibraryUserInfo;
  reservation: LibraryRoomReservationDetail;
}> {
  const user = await ensureAuthenticated(client, credentials);
  const reservation = await getLibraryRoomReservationDetailInternal(client, reservationId);
  return { user, reservation };
}

export async function cancelLibraryRoomReservation(
  client: MjuLibraryClient,
  credentials: ResolvedLmsCredentials,
  reservationId: number
): Promise<{
  user: LibraryUserInfo;
  cancelledReservation: LibraryRoomReservationDetail;
  remainingReservations: LibraryRoomReservationSummary[];
}> {
  const { user, reservation } = await previewLibraryRoomReservationCancel(
    client,
    credentials,
    reservationId
  );
  await client.deleteApiData(`/${LIBRARY_HOMEPAGE_ID}/api/room-charges/${reservationId}`);
  const remaining = await listLibraryRoomReservations(client, credentials);

  return {
    user,
    cancelledReservation: reservation,
    remainingReservations: remaining.reservations
  };
}
