---
name: mju-ucheck
version: 1.0.0
description: "과목별 출석 현황을 확인하는 UCheck 기본 skill."
metadata:
  openclaw:
    category: "service"
    domain: "education"
    requires:
      bins: ["mju"]
      skills: ["mju-shared"]
---

# MJU UCheck

## 자주 쓰는 명령
- 출석 목록: `mju ucheck attendance list`
- 과목별 출석: `mju ucheck attendance get --course COURSE_NAME`
