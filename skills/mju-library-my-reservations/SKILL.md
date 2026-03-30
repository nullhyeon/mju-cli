---
name: mju-library-my-reservations
version: 1.0.0
description: "스터디룸과 좌석 예약을 한 번에 확인하는 helper skill."
metadata:
  openclaw:
    category: "helper"
    domain: "education"
    requires:
      bins: ["mju"]
      skills: ["mju-shared", "mju-library"]
---

# Library My Reservations

`mju library +my-reservations`로 스터디룸과 열람실 예약을 한 번에 확인합니다.

## 관련 명령
- 스터디룸 예약만 보기: `mju library study-rooms list-reservations`
- 좌석 예약만 보기: `mju library seats list-reservations`
