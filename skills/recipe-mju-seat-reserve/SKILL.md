---
name: recipe-mju-seat-reserve
version: 1.0.0
description: "열람실 좌석을 preview 후 예약하고 검증까지 마무리하는 recipe."
metadata:
  openclaw:
    category: "recipe"
    domain: "education"
    requires:
      bins: ["mju"]
      skills: ["mju-library-seat-reserve"]
---

# Reserve Library Seat

## Steps
1. 열람실 목록 확인: `mju library reading-rooms list --campus 자연`
2. 예약 preview: `mju library seats reserve-preview --room-id ROOM_ID --seat-id SEAT_ID`
3. 실제 예약: `mju library seats reserve --room-id ROOM_ID --seat-id SEAT_ID --confirm`
4. 예약 목록 확인: `mju library seats list-reservations`
5. 필요 시 취소: `mju library seats cancel --reservation-id RESERVATION_ID --confirm`
