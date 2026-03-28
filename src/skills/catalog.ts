import path from "node:path";
import { fileURLToPath } from "node:url";

export type SkillKind = "shared" | "service" | "helper" | "recipe";

export interface SkillCatalogEntry {
  name: string;
  kind: SkillKind;
  description: string;
  service?: "lms" | "msi" | "ucheck" | "library";
  requires?: string[];
  relativePath: string;
  absolutePath: string;
}

interface SkillCatalogSeed {
  name: string;
  kind: SkillKind;
  description: string;
  service?: "lms" | "msi" | "ucheck" | "library";
  requires?: string[];
}

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const SKILLS_ROOT_DIR = path.join(PROJECT_ROOT, "skills");

const SKILL_SEEDS: SkillCatalogSeed[] = [
  {
    name: "mju-shared",
    kind: "shared",
    description: "공통 인증, 출력, 안전 규칙, 캠퍼스/서비스 표면을 묶는 기본 skill"
  },
  {
    name: "mju-lms",
    kind: "service",
    service: "lms",
    description: "강의, 공지, 자료, 과제, 온라인 학습 흐름을 다루는 LMS 기본 skill",
    requires: ["mju-shared"]
  },
  {
    name: "mju-msi",
    kind: "service",
    service: "msi",
    description: "시간표, 성적, 졸업요건 조회를 다루는 MSI 기본 skill",
    requires: ["mju-shared"]
  },
  {
    name: "mju-ucheck",
    kind: "service",
    service: "ucheck",
    description: "출석 현황과 과목별 출결을 다루는 UCheck 기본 skill",
    requires: ["mju-shared"]
  },
  {
    name: "mju-library",
    kind: "service",
    service: "library",
    description: "스터디룸, 열람실, 좌석 예약 흐름을 다루는 도서관 기본 skill",
    requires: ["mju-shared"]
  },
  {
    name: "mju-lms-action-items",
    kind: "helper",
    service: "lms",
    description: "미제출 과제, 안읽은 공지, 미수강 온라인을 우선순위로 정리하는 helper skill",
    requires: ["mju-shared", "mju-lms"]
  },
  {
    name: "mju-library-my-reservations",
    kind: "helper",
    service: "library",
    description: "스터디룸과 좌석 예약을 한 번에 확인하는 helper skill",
    requires: ["mju-shared", "mju-library"]
  },
  {
    name: "mju-library-seat-position",
    kind: "helper",
    service: "library",
    description: "자연도서관 지원 열람실의 좌석 위치를 설명하는 helper skill",
    requires: ["mju-shared", "mju-library"]
  },
  {
    name: "mju-library-seat-reserve",
    kind: "helper",
    service: "library",
    description: "열람실 좌석 예약 preview, 생성, 취소 흐름을 안전하게 수행하는 helper skill",
    requires: ["mju-shared", "mju-library"]
  },
  {
    name: "recipe-mju-check-today",
    kind: "recipe",
    description: "오늘 처리할 LMS 액션과 도서관 예약 상황을 함께 확인하는 daily recipe",
    requires: ["mju-lms-action-items", "mju-library-my-reservations"]
  },
  {
    name: "recipe-mju-seat-reserve",
    kind: "recipe",
    description: "도서관 좌석을 preview 후 예약하고 검증까지 마무리하는 recipe",
    requires: ["mju-library-seat-reserve"]
  },
  {
    name: "recipe-mju-study-day-digest",
    kind: "recipe",
    description: "LMS digest와 도서관 좌석 흐름을 묶어 학습 준비를 한 번에 점검하는 recipe",
    requires: ["mju-lms", "mju-library"]
  }
];

export const SKILL_CATALOG: SkillCatalogEntry[] = SKILL_SEEDS.map((entry) => {
  const relativePath = path.join("skills", entry.name, "SKILL.md");
  return {
    ...entry,
    relativePath,
    absolutePath: path.join(PROJECT_ROOT, relativePath)
  };
});

export function findSkillCatalogEntry(name: string): SkillCatalogEntry | undefined {
  const normalized = name.trim().toLowerCase();
  return SKILL_CATALOG.find((entry) => entry.name.toLowerCase() === normalized);
}
