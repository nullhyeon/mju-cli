---
name: recipe-mju-study-day-digest
version: 1.0.0
description: "LMS digest와 도서관 좌석 흐름을 묶어 학습 준비를 한 번에 점검하는 recipe."
metadata:
  openclaw:
    category: "recipe"
    domain: "education"
    requires:
      bins: ["mju"]
      skills: ["mju-lms", "mju-library"]
---

# Study Day Digest

## Steps
1. 강의 digest 확인: `mju lms +digest --course COURSE_NAME`
2. 액션 아이템 확인: `mju lms +action-items`
3. 도서관 좌석 위치나 예약 확인
   - 위치 설명: `mju library +seat-position --room-id ROOM_ID --seat-code SEAT_CODE`
   - 예약 흐름: `mju library seats reserve-preview --room-id ROOM_ID --seat-id SEAT_ID`
