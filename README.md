# mju-cli - 명지대학교 주요 웹 서비스를 위한 통합 CLI

![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-339933?logo=nodedotjs&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white) ![Playwright](https://img.shields.io/badge/Playwright-Automation-2EAD33?logo=playwright&logoColor=white) ![Output JSON or Table](https://img.shields.io/badge/Output-JSON%20%7C%20Table-0F766E)

LMS, 도서관, MSI, UCheck에 흩어진 반복 작업을 하나의 명령 체계로 정리한 CLI입니다. 브라우저에서 여러 메뉴를 따라 들어가던 흐름을 터미널 명령으로 옮기고, 기본 JSON 출력, table 포맷, 운영체제 비밀번호 저장소 연동, 로컬 AI skill 카탈로그까지 함께 제공합니다.

명지대학교가 공식적으로 배포하거나 지원하는 도구는 아니며, 현재는 npm 레지스트리 배포본 없이 소스에서 직접 빌드해 사용하는 개발 단계 프로젝트입니다.

## ✨ 기능

- 🎓 **LMS 워크플로 통합**: 강의, 공지, 자료, 과제, 온라인 학습을 한 CLI 아래에서 조회하고 helper 명령으로 바로 묶어봅니다.
- 📚 **도서관 조회와 예약 흐름 정리**: 스터디룸, 열람실, 좌석, 내 예약 상태를 읽고 preview 기반 예약 흐름으로 안전하게 확인합니다.
- 📊 **MSI 학사 정보 조회**: 시간표, 현재 성적, 성적 이력, 졸업요건을 브라우저 대신 명령으로 확인합니다.
- ✅ **UCheck 출결 확인**: 강의 목록과 과목별 출결 상태를 빠르게 조회합니다.
- 🔐 **저장 로그인과 세션 재사용**: 운영체제 비밀번호 저장소와 로컬 세션 파일을 사용해 여러 서비스 흐름을 이어갑니다.
- 🧪 **런타임 진단 명령 포함**: `doctor`, `config`, `skills` 명령으로 환경, 저장 경로, 로컬 자산 상태를 점검합니다.
- 🤖 **AI 에이전트용 로컬 skills 포함**: [`skills/`](./skills)와 [docs/skills.md](./docs/skills.md)를 통해 서비스별 skill/recipe 자산을 함께 관리합니다.

## 🚀 빠른 시작

```bash
# 저장소를 클론합니다
git clone <repo-url> mju-cli
cd mju-cli

# 의존성을 설치하고 CLI를 빌드합니다
npm install
npm run build

# 로컬 바이너리를 `mju` 명령으로 연결합니다
npm link

# 런타임과 저장소 구성이 정상인지 확인합니다
mju --help
mju doctor

# 한 번 로그인한 뒤 주요 명령을 바로 써봅니다
mju auth login --id YOUR_ID --password YOUR_PASSWORD
mju lms courses list
mju lms +action-items --all-courses
mju library +my-reservations
```

## 🛠 설치

### 필요한 것

- Node.js 22 이상
- 명지대학교 계정
- 저장 로그인 비밀번호 보관소를 지원하는 운영체제
  - Windows: Credential Manager
  - macOS: Keychain

### 설치 절차

```bash
# 의존성을 설치합니다
npm install

# TypeScript를 dist/로 컴파일합니다
npm run build

# 셸에서 `mju` 명령을 사용할 수 있게 연결합니다
npm link
```

바로 실행만 해보고 싶다면 전역 연결 없이 `node dist/main.js --help`로 시작해도 됩니다.

## 🎓 LMS

강의, 공지, 자료, 과제, 온라인 학습을 조회할 수 있고, `+action-items`, `+digest` 같은 helper 명령도 제공합니다.

```bash
# 최신 학기 수강 강의 목록을 조회합니다
mju lms courses list

# 최신 학기 전체 기준 액션 아이템을 확인합니다
mju lms +action-items --all-courses

# 한 강의의 공지/과제/온라인 학습 요약을 봅니다
mju lms +digest --course "강의명" --days 7 --limit 5

# 온라인 학습 항목 하나를 끝까지 재생합니다
mju lms online watch --course "강의명" --lecture-weeks LECTURE_WEEKS --item-index 0
```

구현된 LMS 명령 표면을 확인하려면 아래 명령을 실행하세요.

```bash
# 구현된 LMS 명령 표면을 확인합니다
mju lms summary
```

## 📚 도서관

스터디룸, 열람실, 좌석, 현재 예약 상태를 조회할 수 있으며, 쓰기 작업은 `reserve-preview` 같은 미리보기 단계를 먼저 제공합니다.

```bash
# 특정 캠퍼스와 날짜의 스터디룸을 조회합니다
mju library study-rooms list --campus 자연 --date 2026-03-31

# 스터디룸과 좌석 예약 상태를 한 번에 확인합니다
mju library +my-reservations

# 실제 예약 전에 스터디룸 예약 내용을 미리 확인합니다
mju library study-rooms reserve-preview --room-id ROOM_ID --date 2026-03-31 --begin-time 18:00 --end-time 18:30 --use-section-code STUDY --companion-count 1

# 실제 예약 전에 좌석 예약 내용을 미리 확인합니다
mju library seats reserve-preview --room-id ROOM_ID --seat-id SEAT_ID
```

```bash
# 구현된 도서관 명령 표면을 확인합니다
mju library summary
```

## 📊 MSI

시간표, 현재 성적, 성적 이력, 졸업요건을 조회할 수 있습니다.

```bash
# 현재 시간표를 조회합니다
mju msi timetable

# 현재 학기 성적을 조회합니다
mju msi current-grades

# 졸업요건 충족 상태를 조회합니다
mju msi graduation
```

```bash
# 구현된 MSI 명령 표면을 확인합니다
mju msi summary
```

## ✅ UCheck

강의 목록과 과목별 출결 상태를 조회할 수 있습니다.

```bash
# UCheck 강의 목록을 조회합니다
mju ucheck lectures list

# 특정 과목의 출결 상태를 조회합니다
mju ucheck attendance --course "과목명"
```

```bash
# 구현된 UCheck 명령 표면을 확인합니다
mju ucheck summary
```

## 🔐 인증과 로컬 저장소

`mju auth login`으로 저장한 로그인 정보는 이후 LMS 세션을 확보하고, 다른 서비스에서도 같은 로컬 상태를 재사용하는 데 쓰입니다.

```bash
# 저장 로그인을 만들고 재사용 가능한 로컬 프로필을 생성합니다
mju auth login --id YOUR_ID --password YOUR_PASSWORD

# 저장된 인증 상태를 확인합니다
mju auth status

# 세션만 지웁니다
mju auth logout

# 비밀번호와 모든 서비스 세션을 함께 지웁니다
mju auth forget
```

기본 앱 데이터 경로는 운영체제에 따라 다음과 같이 결정됩니다.

- Windows: `%LOCALAPPDATA%\mju-cli`
- 그 외: `~/.mju-cli`

현재 실제 경로는 `config` 명령으로 확인할 수 있습니다.

```bash
# 실제 저장 디렉터리 경로를 확인합니다
mju config paths

# 현재 런타임 구성을 확인합니다
mju config show
```

별도 테스트 상태 디렉터리를 쓰고 싶다면 `--app-dir` 또는 환경 변수를 사용하세요.

```bash
# 테스트용으로 분리된 로컬 상태 디렉터리를 사용합니다
mju --app-dir .tmp/stage auth login --id YOUR_ID --password YOUR_PASSWORD
mju --app-dir .tmp/stage lms courses list
```

```bash
# bash/zsh에서 기본 앱 데이터 경로를 덮어씁니다
export MJU_CLI_APP_DIR=/path/to/mju-cli-data
```

```powershell
# PowerShell에서 기본 앱 데이터 경로를 덮어씁니다
$env:MJU_CLI_APP_DIR = "C:\path\to\mju-cli-data"
```

## 🤖 로컬 Skills

이 저장소는 [`skills/`](./skills) 아래에 서비스 skill, helper skill, recipe를 함께 포함합니다. skill 메타데이터를 수정하거나 새 자산을 추가했다면 인덱스 문서를 다시 생성하세요.

```bash
# 생성된 skill 인덱스를 다시 만듭니다
npm run docs:skills
```

```bash
# CLI에서 로컬 skills와 recipes를 확인합니다
mju skills summary
mju skills list
mju skills show --name mju-lms
mju skills verify
```

전체 인덱스는 [docs/skills.md](./docs/skills.md)에서 확인할 수 있습니다.

## 🩺 문제 해결

문제가 생기면 가장 먼저 아래 두 명령을 확인하세요.

```bash
# 런타임과 저장소 상태를 점검합니다
mju doctor

# 실제 로컬 디렉터리 경로를 확인합니다
mju config paths
```

`doctor`는 Node.js 버전, 저장 디렉터리 준비 상태, 운영체제 비밀번호 저장소 지원 여부, 세션 파일 상태, Playwright 브라우저 런타임까지 함께 점검합니다.

## 🧑‍💻 개발

```bash
# CLI를 빌드합니다
npm run build

# TypeScript 타입 검사를 실행합니다
npm run check

# 테스트 스위트를 실행합니다
npm test

# skills 문서를 다시 생성합니다
npm run docs:skills
```

```bash
# 개발 중에는 TypeScript 엔트리포인트를 직접 실행합니다
npx tsx src/main.ts --help
```
