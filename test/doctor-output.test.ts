import assert from "node:assert/strict";
import test from "node:test";

import { buildNextSteps, toTableRows } from "../src/commands/doctor.ts";

test("doctor next steps deduplicate repeated recovery guidance", () => {
  const nextSteps = buildNextSteps([
    {
      id: "auth-profile",
      area: "auth",
      status: "warn",
      summary: "저장된 로그인 프로필이 없습니다.",
      suggestedFix: "학교 계정으로 다시 로그인해 저장 프로필을 만드세요.",
      suggestedCommand: "mju auth login --id <학번>"
    },
    {
      id: "auth-password",
      area: "auth",
      status: "warn",
      summary: "운영체제 저장소에 비밀번호가 없습니다.",
      suggestedFix: "학교 계정으로 다시 로그인해 저장 프로필을 만드세요.",
      suggestedCommand: "mju auth login --id <학번>"
    },
    {
      id: "playwright-browser",
      area: "browser",
      status: "warn",
      summary: "Chromium 브라우저가 준비되지 않았습니다.",
      suggestedFix: "동영상 재생 기능이 필요하면 Chromium 브라우저 런타임을 설치하세요.",
      suggestedCommand: "npx playwright install chromium"
    }
  ]);

  assert.deepEqual(nextSteps, [
    "학교 계정으로 다시 로그인해 저장 프로필을 만드세요. | 추천 명령: mju auth login --id <학번>",
    "동영상 재생 기능이 필요하면 Chromium 브라우저 런타임을 설치하세요. | 추천 명령: npx playwright install chromium"
  ]);
});

test("doctor table rows expose Korean recovery columns", () => {
  const rows = toTableRows({
    ok: false,
    node: "v22.0.0",
    platform: "win32",
    appDir: "C:/tmp/mju-cli",
    summary: {
      passed: 0,
      warnings: 1,
      errors: 1
    },
    nextSteps: ["세션을 지우고 다시 로그인하세요. | 추천 명령: mju auth forget"],
    checks: [
      {
        id: "lms-session-owner",
        area: "sessions",
        status: "error",
        summary: "LMS 세션이 현재 로그인 사용자와 일치하지 않습니다.",
        details: "stored=other, expected=60123456",
        suggestedFix: "다른 사용자 세션이 남아 있습니다. 모든 저장 세션을 지우고 현재 계정으로 다시 로그인하세요.",
        suggestedCommand: "mju auth forget",
        path: "C:/tmp/mju-cli/state/lms-session.json"
      }
    ]
  });

  assert.deepEqual(rows, [
    {
      상태: "오류",
      영역: "sessions",
      항목: "lms-session-owner",
      요약: "LMS 세션이 현재 로그인 사용자와 일치하지 않습니다.",
      세부: "stored=other, expected=60123456",
      "다음 조치":
        "다른 사용자 세션이 남아 있습니다. 모든 저장 세션을 지우고 현재 계정으로 다시 로그인하세요.",
      "추천 명령": "mju auth forget",
      경로: "C:/tmp/mju-cli/state/lms-session.json"
    }
  ]);
});
