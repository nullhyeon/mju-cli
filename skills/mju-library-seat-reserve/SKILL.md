---
name: mju-library-seat-reserve
version: 1.0.0
description: "열람실 좌석 예약 preview, 생성, 취소를 안전하게 수행하는 helper skill."
metadata:
  openclaw:
    category: "helper"
    domain: "education"
    requires:
      bins: ["mju"]
      skills: ["mju-shared", "mju-library"]
---

# Library Seat Reserve

## 안전한 예약 흐름
1. preview: `mju library seats reserve-preview --room-id ROOM_ID --seat-id SEAT_ID`
2. 실제 예약: `mju library seats reserve --room-id ROOM_ID --seat-id SEAT_ID --confirm`
3. 예약 확인: `mju library seats list-reservations`
4. 취소 preview: `mju library seats cancel-preview --reservation-id RESERVATION_ID`
5. 실제 취소: `mju library seats cancel --reservation-id RESERVATION_ID --confirm`
