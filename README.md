# mju-cli

명지대학교 주요 서비스를 하나의 CLI로 다루기 위한 도구입니다.

LMS, 도서관, MSI, UCheck를 한 곳에서 조회하고, 자주 쓰는 학사 흐름은 helper 명령으로 줄였으며, AI 에이전트가 함께 쓸 수 있도록 로컬 skill 자산도 포함합니다.

> [!IMPORTANT]
> 이 프로젝트는 아직 빠르게 발전 중입니다. 명령 이름이나 출력 구조는 안정화 전까지 바뀔 수 있습니다.

## 목차

- 준비 사항
- 설치 방법
- 빠른 시작
- 왜 `mju`인가
- 인증
- 서비스별 기능
- Skills
- 고급 사용
- 개발

## 준비 사항

- Node.js 22+
- 대상 서비스에 접근 가능한 명지대학교 계정
- 저장 비밀번호를 OS 자격 증명 보관소에 넣고 싶다면 Windows 또는 macOS

## 설치 방법

현재는 패키지 배포본보다는 소스 빌드 기준으로 사용합니다.

```bash
git clone <repo-url> mju-cli
cd mju-cli
npm install
npm run build
```

로컬에서 바로 실행하려면:

```bash
node dist/main.js --help
```

셸에서 `mju` 명령으로 쓰고 싶다면:

```bash
npm link
mju --help
```

## 빠른 시작

한 번 로그인해서 인증 정보를 저장합니다:

```bash
mju auth login --id YOUR_ID --password YOUR_PASSWORD
```

LMS 강의 목록을 확인합니다:

```bash
mju lms courses list
```

지금 처리할 LMS 액션 아이템을 봅니다:

```bash
mju lms +action-items
```

도서관 예약 현황을 같이 확인합니다:

```bash
mju library +my-reservations
```

MSI 시간표를 조회합니다:

```bash
mju msi timetable
```

UCheck 출결을 확인합니다:

```bash
mju ucheck attendance --course COURSE_NAME
```

## 왜 `mju`인가

- 서비스마다 흩어진 브라우저 흐름과 개별 스크립트를 하나의 명령 표면으로 묶습니다.
- 기본 출력이 JSON이라 사람, 셸 스크립트, AI 에이전트가 모두 안정적으로 소비할 수 있습니다.
- `+action-items`, `+digest`, `+my-reservations`, `+seat-position`처럼 자주 쓰는 학습 흐름을 helper 명령으로 줄였습니다.
- 도서관 예약처럼 실제 쓰기 작업이 있는 경우 preview 우선, `--confirm` 명시 방식으로 더 안전하게 다룹니다.
- [`skills/`](./skills)에 로컬 skill 자산을 함께 두어 에이전트 환경에서도 일관되게 사용할 수 있습니다.

## 인증

현재 CLI는 LMS 계정을 공통 인증 기준으로 사용합니다.

로그인 후 인증 정보 저장:

```bash
mju auth login --id YOUR_ID --password YOUR_PASSWORD
```

현재 저장 상태 확인:

```bash
mju auth status
```

저장된 세션만 지우기:

```bash
mju auth logout
```

비밀번호와 세션을 모두 삭제:

```bash
mju auth forget
```

지원 플랫폼에서는 저장 비밀번호를 OS 자격 증명 보관소에 넣고, 세션 스냅샷과 기타 로컬 상태는 app data 디렉터리에 보관합니다.

## 서비스별 기능

### LMS

강의, 공지, 자료, 과제, 첨부, 온라인 학습을 조회할 수 있습니다:

```bash
mju lms courses list
mju lms notices list --course COURSE_NAME
mju lms materials list --course COURSE_NAME
mju lms assignments list --course COURSE_NAME
mju lms online list --course COURSE_NAME
```

helper 명령:

```bash
mju lms +unsubmitted
mju lms +due-assignments
mju lms +unread-notices
mju lms +incomplete-online
mju lms +action-items
mju lms +digest --course COURSE_NAME
```

온라인 영상 항목 하나를 끝까지 재생하고 종료:

```bash
mju lms online watch --kjkey KJKEY --lecture-weeks LECTURE_WEEKS --link-seq LINK_SEQ
```

### Library

스터디룸, 열람실, 좌석, 예약 정보를 조회할 수 있습니다:

```bash
mju library study-rooms list --campus 자연
mju library study-rooms get --room-id ROOM_ID --date YYYY-MM-DD
mju library reading-rooms list --campus 자연
mju library reading-rooms get --room-id ROOM_ID
mju library seats list-reservations
```

쓰기 작업은 preview 후 `--confirm`으로 실행합니다:

```bash
mju library study-rooms reserve-preview --room-id ROOM_ID --date YYYY-MM-DD --begin-time 18:00 --end-time 18:30 --use-section-name 학습
mju library study-rooms reserve --room-id ROOM_ID --date YYYY-MM-DD --begin-time 18:00 --end-time 18:30 --use-section-name 학습 --confirm

mju library seats reserve-preview --room-id ROOM_ID --seat-id SEAT_ID
mju library seats reserve --room-id ROOM_ID --seat-id SEAT_ID --confirm
```

helper 명령:

```bash
mju library +my-reservations
mju library +seat-position --room-id ROOM_ID --seat-code 54
```

### MSI

시간표, 성적, 졸업 요건을 조회할 수 있습니다:

```bash
mju msi timetable
mju msi current-grades
mju msi grade-history
mju msi graduation
```

### UCheck

계정, 강의 목록, 과목별 출결을 조회할 수 있습니다:

```bash
mju ucheck account
mju ucheck lectures list
mju ucheck attendance --course COURSE_NAME
```

## Skills

이 레포는 [`skills/`](./skills) 아래에 로컬 skill 자산을 포함합니다. 구조는 평평하게 유지합니다:

```text
skills/
  mju-shared/
    SKILL.md
  mju-lms/
    SKILL.md
  mju-library/
    SKILL.md
  ...
```

[docs/skills.md](./docs/skills.md)에서 생성된 인덱스를 볼 수 있습니다.

skill frontmatter를 바꾸거나 새 skill을 추가한 뒤에는 인덱스를 다시 생성합니다:

```bash
npm run docs:skills
```

CLI에서도 skill 자산을 확인할 수 있습니다:

```bash
mju skills summary
mju skills list
mju skills show --name mju-lms
mju skills verify
```

## 고급 사용

### 출력 형식

기본 출력은 JSON입니다:

```bash
mju lms courses list
```

터미널에서 빠르게 보고 싶다면 table 형식을 쓸 수 있습니다:

```bash
mju lms courses list --format table
```

### 사용자 지정 app data 디렉터리

테스트용으로 별도 로컬 상태 디렉터리를 쓰려면:

```bash
mju --app-dir .tmp/stage auth status
```

환경 변수로도 지정할 수 있습니다:

```bash
MJU_CLI_APP_DIR=/path/to/app-data
```

### config 와 doctor

현재 해석된 저장 경로를 확인하려면:

```bash
mju config show
mju config paths
```

현재 런타임 정보를 보려면:

```bash
mju doctor
```

## 개발

의존성 설치:

```bash
npm install
```

TypeScript 엔트리를 바로 실행:

```bash
npm run dev -- --help
```

빌드:

```bash
npm run build
```

출력 없이 타입 검사:

```bash
npm run check
```

skills 인덱스 다시 생성:

```bash
npm run docs:skills
```
