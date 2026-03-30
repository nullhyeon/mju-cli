---
name: mju-library
version: 1.0.0
description: "스터디룸, 열람실, 좌석 예약 흐름을 다루는 도서관 기본 skill."
metadata:
  openclaw:
    category: "service"
    domain: "education"
    requires:
      bins: ["mju"]
      skills: ["mju-shared"]
---

# MJU Library

## 자주 쓰는 명령
- 스터디룸 목록: `mju library study-rooms list --campus 자연`
- 스터디룸 상세: `mju library study-rooms get --room-id ROOM_ID --date YYYY-MM-DD`
- 열람실 목록: `mju library reading-rooms list --campus 자연`
- 열람실 상세: `mju library reading-rooms get --room-id ROOM_ID`
- 좌석 예약 목록: `mju library seats list-reservations`

## helper
- 내 예약 통합 보기: `mju library +my-reservations`
- 좌석 위치 설명: `mju library +seat-position --room-id ROOM_ID --seat-code SEAT_CODE`
