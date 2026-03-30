---
name: mju-lms
version: 1.0.0
description: "명지 LMS의 강의, 공지, 자료, 과제, 온라인 학습 흐름을 다루는 기본 skill."
metadata:
  openclaw:
    category: "service"
    domain: "education"
    requires:
      bins: ["mju"]
      skills: ["mju-shared"]
---

# MJU LMS

## 자주 쓰는 명령
- 강의 목록: `mju lms courses list`
- 공지 목록: `mju lms notices list --course COURSE_NAME`
- 자료 목록: `mju lms materials list --course COURSE_NAME`
- 과제 목록: `mju lms assignments list --course COURSE_NAME`
- 온라인 목록: `mju lms online list --course COURSE_NAME`

## helper
- 액션 아이템: `mju lms +action-items`
- 강의 digest: `mju lms +digest --course COURSE_NAME`
