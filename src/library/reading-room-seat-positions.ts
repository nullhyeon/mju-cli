import type {
  LibraryReadingRoomDetail,
  LibraryReadingRoomEntrance,
  LibraryReadingRoomSeatPositionResult,
  LibrarySeatSummary
} from "./types.js";

interface SeatGroup {
  zoneKey: string;
  zoneLabel: string;
  orderFromTop: number;
  rows: string[][];
}

interface SeatGroupMatch {
  group: SeatGroup;
  rowIndex: number;
  seatIndexInRow: number;
}

interface ReadingRoomSeatLayout {
  roomId: number;
  entrances: LibraryReadingRoomEntrance[];
  groups: SeatGroup[];
  describe(match: SeatGroupMatch, entrance: LibraryReadingRoomEntrance): string;
}

function ordinalKorean(value: number): string {
  switch (value) {
    case 1:
      return "첫 번째";
    case 2:
      return "두 번째";
    case 3:
      return "세 번째";
    case 4:
      return "네 번째";
    case 5:
      return "다섯 번째";
    case 6:
      return "여섯 번째";
    case 7:
      return "일곱 번째";
    case 8:
      return "여덟 번째";
    case 9:
      return "아홉 번째";
    case 10:
      return "열 번째";
    default:
      return `${value}번째`;
  }
}

function describeSeatEdge(row: string[], seatIndexInRow: number): string {
  const fromLeft = seatIndexInRow + 1;
  const fromRight = row.length - seatIndexInRow;

  if (row.length === 1) {
    return "유일한 좌석";
  }

  if (row.length === 2) {
    return fromLeft === 1 ? "왼쪽 자리" : "오른쪽 자리";
  }

  if (fromRight < fromLeft) {
    return `오른쪽 ${ordinalKorean(fromRight)} 좌석`;
  }

  return `왼쪽 ${ordinalKorean(fromLeft)} 좌석`;
}

function describeDeskRow(rows: string[][], rowIndex: number): string | undefined {
  if (rows.length <= 1) {
    return undefined;
  }

  if (rows.length === 2) {
    return rowIndex === 0 ? "윗줄" : "아랫줄";
  }

  return `${ordinalKorean(rowIndex + 1)} 줄`;
}

function createDistancePhrase(orderFromEntrance: number, total: number): string {
  if (orderFromEntrance === 1) {
    return "문 바로 앞";
  }

  if (orderFromEntrance === total) {
    return "문에서 가장 먼";
  }

  return `문에서 안쪽으로 ${ordinalKorean(orderFromEntrance)}`;
}

function buildSeatGroupMatch(groups: SeatGroup[], seatCode: string): SeatGroupMatch | undefined {
  for (const group of groups) {
    for (const [rowIndex, row] of group.rows.entries()) {
      const seatIndexInRow = row.indexOf(seatCode);
      if (seatIndexInRow >= 0) {
        return {
          group,
          rowIndex,
          seatIndexInRow
        };
      }
    }
  }

  return undefined;
}

function pairRows(
  zoneKey: string,
  zoneLabel: string,
  rows: string[][][],
  startOrder = 1
): SeatGroup[] {
  return rows.map((groupRows, index) => ({
    zoneKey,
    zoneLabel,
    orderFromTop: startOrder + index,
    rows: groupRows
  }));
}

function createRoom12Groups(): SeatGroup[] {
  return [
    ...pairRows("left-small", "왼쪽 작은 책상", [
      [["50", "52"], ["49", "51"]],
      [["38", "40"], ["37", "39"]],
      [["26", "28"], ["25", "27"]],
      [["14", "16"], ["13", "15"]],
      [["2", "4"], ["1", "3"]]
    ]),
    ...pairRows("center-big", "가운데 큰 책상", [
      [["54", "56", "58", "60"], ["53", "55", "57", "59"]],
      [["42", "44", "46", "48"], ["41", "43", "45", "47"]],
      [["30", "32", "34", "36"], ["29", "31", "33", "35"]],
      [["18", "20", "22", "24"], ["17", "19", "21", "23"]],
      [["6", "8", "10", "12"], ["5", "7", "9", "11"]]
    ])
  ];
}

function createRoom16Groups(): SeatGroup[] {
  const left: SeatGroup[] = [];
  for (let index = 0; index < 6; index += 1) {
    const base = index * 10 + 1;
    left.push({
      zoneKey: "left-column",
      zoneLabel: "왼쪽 열 책상",
      orderFromTop: index + 1,
      rows: [
        Array.from({ length: 5 }, (_, offset) => String(base + offset)),
        Array.from({ length: 5 }, (_, offset) => String(base + 9 - offset))
      ]
    });
  }

  const rightSpecs = [
    { start: 61, width: 8 },
    { start: 77, width: 7 },
    { start: 91, width: 7 },
    { start: 105, width: 7 },
    { start: 119, width: 7 },
    { start: 133, width: 7 },
    { start: 147, width: 7 },
    { start: 161, width: 7 }
  ];
  const right = rightSpecs.map((spec, index) => ({
    zoneKey: "right-column",
    zoneLabel: index === 0 ? "오른쪽 상단 큰 책상" : "오른쪽 열 책상",
    orderFromTop: index + 1,
    rows: [
      Array.from({ length: spec.width }, (_, offset) => String(spec.start + offset)),
      Array.from(
        { length: spec.width },
        (_, offset) => String(spec.start + spec.width * 2 - 1 - offset)
      )
    ]
  }));

  return [...left, ...right];
}

function createRoom17Groups(): SeatGroup[] {
  return [
    ...pairRows("left-wall", "왼쪽 벽면 좌석칸", [
      [["68", "67"]],
      [["66", "65"]],
      [["64", "63"]],
      [["62", "61"]],
      [["60", "59"]],
      [["58", "57"]],
      [["56", "55"]]
    ]),
    ...pairRows("center-big", "중앙 큰 책상", [
      [["18", "17", "16", "15"], ["19", "20", "21", "22"]],
      [["26", "25", "24", "23"], ["27", "28", "29", "30"]],
      [["34", "33", "32", "31"], ["35", "36", "37", "38"]],
      [["42", "41", "40", "39"], ["43", "44", "45", "46"]],
      [["50", "49", "48", "47"], ["51", "52", "53", "54"]]
    ]),
    ...pairRows("right-aux", "오른쪽 보조 책상", [
      [["14", "13"], ["11", "12"]],
      [["10", "9"], ["7", "8"]],
      [["5", "6"]],
      [["4", "3"], ["1", "2"]]
    ])
  ];
}

function createRoom18Groups(): SeatGroup[] {
  const groups: SeatGroup[] = [];
  for (let band = 0; band < 9; band += 1) {
    const start = band * 36 + 1;
    const topRow = Array.from({ length: 18 }, (_, offset) => String(start + offset));
    const bottomRow = Array.from({ length: 18 }, (_, offset) => String(start + 35 - offset));

    groups.push({
      zoneKey: "left-large",
      zoneLabel: "왼쪽 큰 책상",
      orderFromTop: band + 1,
      rows: [topRow.slice(0, 9), bottomRow.slice(0, 9)]
    });
    groups.push({
      zoneKey: "center-small",
      zoneLabel: "가운데 작은 책상",
      orderFromTop: band + 1,
      rows: [topRow.slice(9, 12), bottomRow.slice(9, 12)]
    });
    groups.push({
      zoneKey: "right-large",
      zoneLabel: "오른쪽 큰 책상",
      orderFromTop: band + 1,
      rows: [topRow.slice(12), bottomRow.slice(12)]
    });
  }

  return groups;
}

function createRoom19Groups(): SeatGroup[] {
  return [
    ...pairRows("left-column", "왼쪽 책상", [
      [["52", "51", "50", "49"], ["53", "54", "55", "56"]],
      [["60", "59", "58", "57"], ["61", "62", "63", "64"]],
      [["68", "67", "66", "65"], ["69", "70", "71", "72"]],
      [["76", "75", "74", "73"], ["77", "78", "79", "80"]],
      [["84", "83", "82", "81"], ["85", "86", "87", "88"]]
    ]),
    ...pairRows("right-column", "오른쪽 책상", [
      [["48", "47", "46", "45"], ["41", "42", "43", "44"]],
      [["40", "39", "38", "37"], ["33", "34", "35", "36"]],
      [["32", "31", "30", "29"], ["25", "26", "27", "28"]],
      [["24", "23", "22", "21"], ["17", "18", "19", "20"]],
      [["16", "15", "14", "13"], ["9", "10", "11", "12"]],
      [["8", "7", "6", "5"], ["1", "2", "3", "4"]]
    ])
  ];
}

function describeRoom12(match: SeatGroupMatch): string {
  const rowLabel = describeDeskRow(match.group.rows, match.rowIndex);
  const row = match.group.rows[match.rowIndex]!;
  const seatEdge = describeSeatEdge(row, match.seatIndexInRow);
  const verticalLabels = [
    "문에서 위로 두 번째 줄",
    "문 위쪽 줄",
    "문 맞은편 줄",
    "문 아래쪽 줄",
    "문에서 아래로 두 번째 줄"
  ];
  const verticalLabel = verticalLabels[match.group.orderFromTop - 1] ?? "문 기준 줄";

  return `${verticalLabel}의 ${match.group.zoneLabel}${rowLabel ? `의 ${rowLabel}` : ""} ${seatEdge}`;
}

function describeRoom16(
  match: SeatGroupMatch,
  entrance: LibraryReadingRoomEntrance
): string {
  const zoneGroups = ROOM_LAYOUTS[16]!.groups.filter(
    (group) => group.zoneKey === match.group.zoneKey
  );
  const total = zoneGroups.length;
  const orderFromEntrance =
    entrance.key === "left-bottom"
      ? total - match.group.orderFromTop + 1
      : match.group.orderFromTop;
  const distance = createDistancePhrase(orderFromEntrance, total);
  const rowLabel = describeDeskRow(match.group.rows, match.rowIndex);
  const seatEdge = describeSeatEdge(match.group.rows[match.rowIndex]!, match.seatIndexInRow);

  return [ `${entrance.label} 기준, ${distance}`, match.group.zoneLabel, rowLabel, seatEdge ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ");
}

function describeRoom17(match: SeatGroupMatch): string {
  if (match.group.zoneKey === "center-big") {
    const total = 5;
    const orderFromEntrance = total - match.group.orderFromTop + 1;
    const distance = createDistancePhrase(orderFromEntrance, total);
    const rowLabel = describeDeskRow(match.group.rows, match.rowIndex);
    const seatEdge = describeSeatEdge(match.group.rows[match.rowIndex]!, match.seatIndexInRow);
    return `${distance} 중앙 큰 책상의 ${rowLabel} ${seatEdge}`;
  }

  if (match.group.zoneKey === "left-wall") {
    const total = 7;
    const orderFromEntrance = total - match.group.orderFromTop + 1;
    const row = match.group.rows[match.rowIndex]!;
    return `${createDistancePhrase(orderFromEntrance, total)} 왼쪽 벽면 좌석칸의 ${describeSeatEdge(row, match.seatIndexInRow)}`;
  }

  const total = 4;
  const orderFromEntrance = total - match.group.orderFromTop + 1;
  const rowLabel = describeDeskRow(match.group.rows, match.rowIndex);
  const seatEdge = describeSeatEdge(match.group.rows[match.rowIndex]!, match.seatIndexInRow);
  return `${createDistancePhrase(orderFromEntrance, total)} 오른쪽 보조 책상의 ${rowLabel ? `${rowLabel} ` : ""}${seatEdge}`;
}

function describeRoom18(
  match: SeatGroupMatch,
  entrance: LibraryReadingRoomEntrance
): string {
  const orderFromEntrance =
    entrance.key === "right-bottom"
      ? 10 - match.group.orderFromTop
      : match.group.orderFromTop;
  const distance = createDistancePhrase(orderFromEntrance, 9);
  const rowLabel = describeDeskRow(match.group.rows, match.rowIndex);
  const seatEdge = describeSeatEdge(match.group.rows[match.rowIndex]!, match.seatIndexInRow);

  return [ `${entrance.label} 기준, ${distance}`, match.group.zoneLabel, rowLabel, seatEdge ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ");
}

function describeRoom19(match: SeatGroupMatch): string {
  const zoneGroups = ROOM_LAYOUTS[19]!.groups.filter(
    (group) => group.zoneKey === match.group.zoneKey
  );
  const total = zoneGroups.length;
  const orderFromEntrance = total - match.group.orderFromTop + 1;
  const distance = createDistancePhrase(orderFromEntrance, total);
  const rowLabel = describeDeskRow(match.group.rows, match.rowIndex);
  const seatEdge = describeSeatEdge(match.group.rows[match.rowIndex]!, match.seatIndexInRow);
  return `${distance} ${match.group.zoneLabel}의 ${rowLabel} ${seatEdge}`;
}

const ROOM_LAYOUTS: Record<number, ReadingRoomSeatLayout> = {
  12: {
    roomId: 12,
    entrances: [{ key: "right-center", label: "오른쪽 중앙 출입구", side: "right-center" }],
    groups: createRoom12Groups(),
    describe(match) {
      return describeRoom12(match);
    }
  },
  16: {
    roomId: 16,
    entrances: [
      { key: "left-top", label: "왼쪽 상단 출입구", side: "left-top" },
      { key: "left-bottom", label: "왼쪽 하단 출입구", side: "left-bottom" }
    ],
    groups: createRoom16Groups(),
    describe(match, entrance) {
      return describeRoom16(match, entrance);
    }
  },
  17: {
    roomId: 17,
    entrances: [{ key: "bottom-right", label: "오른쪽 하단 출입구", side: "bottom-right" }],
    groups: createRoom17Groups(),
    describe(match) {
      return describeRoom17(match);
    }
  },
  18: {
    roomId: 18,
    entrances: [
      { key: "right-top", label: "오른쪽 상단 출입구", side: "right-top" },
      { key: "right-bottom", label: "오른쪽 하단 출입구", side: "right-bottom" }
    ],
    groups: createRoom18Groups(),
    describe(match, entrance) {
      return describeRoom18(match, entrance);
    }
  },
  19: {
    roomId: 19,
    entrances: [{ key: "bottom-left", label: "왼쪽 하단 출입구", side: "bottom-left" }],
    groups: createRoom19Groups(),
    describe(match) {
      return describeRoom19(match);
    }
  }
};

export function describeReadingRoomSeatPosition(
  room: LibraryReadingRoomDetail,
  seat: LibrarySeatSummary
): LibraryReadingRoomSeatPositionResult {
  const layout = ROOM_LAYOUTS[room.roomId];
  if (!layout) {
    throw new Error("현재 좌석 위치 설명은 자연도서관 열람실만 지원합니다.");
  }

  if (!seat.isActive) {
    throw new Error("현재 좌석 위치 설명은 실제 배치도에 보이는 활성 좌석만 지원합니다.");
  }

  const match = buildSeatGroupMatch(layout.groups, seat.seatCode);
  if (!match) {
    throw new Error(
      `열람실 ${room.roomName} 에서 좌석 ${seat.seatCode} 의 배치 규칙을 찾지 못했습니다.`
    );
  }

  return {
    roomId: room.roomId,
    roomName: room.roomName,
    supported: true,
    entrances: layout.entrances,
    seatId: seat.seatId,
    seatCode: seat.seatCode,
    descriptions: layout.entrances.map((entrance) => ({
      entranceKey: entrance.key,
      entranceLabel: entrance.label,
      description: layout.describe(match, entrance)
    }))
  };
}
