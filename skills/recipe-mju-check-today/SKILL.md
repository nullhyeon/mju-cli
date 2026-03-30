---
name: recipe-mju-check-today
version: 1.0.0
description: "오늘 처리할 LMS 액션과 도서관 예약 상황을 함께 확인하는 daily recipe."
metadata:
  openclaw:
    category: "recipe"
    domain: "education"
    requires:
      bins: ["mju"]
      skills: ["mju-lms-action-items", "mju-library-my-reservations"]
---

# Check Today

## Steps
1. LMS 액션 확인: `mju lms +action-items`
2. 도서관 예약 확인: `mju library +my-reservations`
3. 필요한 경우 강의 digest 확인: `mju lms +digest --course COURSE_NAME`
