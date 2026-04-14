import assert from "node:assert/strict";
import test from "node:test";

import { getLibraryMyReservations } from "../src/library/helpers.ts";
import { LIBRARY_HOMEPAGE_ID } from "../src/library/constants.ts";

test("library reservation helper authenticates once and reuses the auth context", async () => {
  let ensureAuthenticatedCalls = 0;

  const client = {
    async ensureAuthenticated() {
      ensureAuthenticatedCalls += 1;
      return {
        myInfo: {
          id: 1,
          name: "홍길동",
          memberNo: "60123456",
          branch: {
            id: 10,
            name: "인문캠퍼스",
            alias: "인문"
          }
        },
        usedSavedSession: true
      };
    },
    async getApiData<T>(url: string): Promise<T> {
      if (url === `/${LIBRARY_HOMEPAGE_ID}/api/room-charges`) {
        return {
          list: [
            {
              id: 101,
              companionCnt: 2,
              reservationTime: "2026-04-14 15:00",
              beginTime: "2026-04-14 15:00",
              endTime: "2026-04-14 17:00",
              state: { code: "reserved", name: "예약완료" },
              room: {
                id: 201,
                name: "스터디룸 2",
                branch: { alias: "인문" }
              }
            }
          ]
        } as T;
      }

      if (url === `/${LIBRARY_HOMEPAGE_ID}/api/seat-charges`) {
        return {
          list: [
            {
              id: 102,
              reservationTime: "2026-04-14 18:00",
              beginTime: "2026-04-14 18:00",
              endTime: "2026-04-14 20:00",
              isCheckinable: false,
              state: { code: "using", name: "사용중" },
              room: {
                id: 301,
                name: "열람실 A"
              },
              seat: {
                id: 401,
                code: "54"
              },
              arrivalConfirmMethods: []
            }
          ]
        } as T;
      }

      throw new Error(`unexpected url: ${url}`);
    }
  };

  const result = await getLibraryMyReservations(client as never, {
    userId: "60123456",
    password: "secret",
    source: "os-store"
  });

  assert.equal(ensureAuthenticatedCalls, 1);
  assert.equal(result.user.memberNo, "60123456");
  assert.equal(result.counts.studyRooms, 1);
  assert.equal(result.counts.seats, 1);
  assert.equal(result.counts.total, 2);
  assert.equal(result.reservations.length, 2);
});
