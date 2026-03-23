import type { DecodedResponse } from "./types.js";

const LOGIN_FAILURE_MARKERS = [
  "login_form.acl",
  "sso/auth",
  "다시 로그인",
  "통합로그인",
  "일반 로그인",
  'window.top.location.href="/ilos/main/member/login_form.acl"'
];

const LOGIN_SUCCESS_MARKERS = ["/ilos/main/main_form.acl", "top1menu", "logout"];

function hasFailureMarker(url: string, text: string): boolean {
  return LOGIN_FAILURE_MARKERS.some((marker) => url.includes(marker) || text.includes(marker));
}

export function looksLoggedIn(response: DecodedResponse): boolean {
  const url = response.url.toLowerCase();
  const text = response.text;
  const lowerText = text.toLowerCase();

  if (hasFailureMarker(url, text)) {
    return false;
  }

  return LOGIN_SUCCESS_MARKERS.some(
    (marker) => url.includes(marker) || lowerText.includes(marker)
  );
}
