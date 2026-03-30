---
name: mju-msi
version: 1.0.0
description: "시간표, 성적, 졸업요건을 조회하는 MSI 기본 skill."
metadata:
  openclaw:
    category: "service"
    domain: "education"
    requires:
      bins: ["mju"]
      skills: ["mju-shared"]
---

# MJU MSI

## 자주 쓰는 명령
- 시간표 조회: `mju msi timetable get`
- 현재 학기 성적: `mju msi grades current`
- 성적 이력: `mju msi grades history`
- 졸업 요건: `mju msi graduation requirements`
