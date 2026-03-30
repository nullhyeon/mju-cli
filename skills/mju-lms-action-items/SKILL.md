---
name: mju-lms-action-items
version: 1.0.0
description: "LMS에서 지금 해야 할 일을 빠르게 추리는 helper skill."
metadata:
  openclaw:
    category: "helper"
    domain: "education"
    requires:
      bins: ["mju"]
      skills: ["mju-shared", "mju-lms"]
---

# LMS Action Items

## 추천 흐름
1. 전체 액션 보기: `mju lms +action-items`
2. 미제출 과제만 보기: `mju lms +unsubmitted`
3. 특정 강의 digest 보기: `mju lms +digest --course COURSE_NAME`
