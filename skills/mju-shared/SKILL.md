---
name: mju-shared
version: 1.0.0
description: "명지대학교 CLI 공통 인증, 출력, 안전 규칙을 설명하는 기본 skill."
metadata:
  openclaw:
    category: "shared"
    domain: "education"
    requires:
      bins: ["mju"]
---

# MJU Shared

`mju`를 사용할 때 공통으로 지켜야 할 규칙입니다.

## 기본 원칙
1. 먼저 로그인 상태를 확인합니다: `mju auth status`
2. 필요한 경우 로그인합니다: `mju auth login --id YOUR_ID --password YOUR_PASSWORD`
3. 기본 출력은 JSON을 유지합니다.
4. 실제 변경이 있는 명령은 preview를 먼저 보고 `--confirm`으로 실행합니다.

## 주요 표면
- LMS: `mju lms ...`
- MSI: `mju msi ...`
- UCheck: `mju ucheck ...`
- Library: `mju library ...`
- Skills catalog: `mju skills list`
