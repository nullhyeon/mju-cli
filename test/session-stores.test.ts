import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { CookieJar } from "tough-cookie";

import { LibrarySessionStore } from "../src/library/session-store.ts";
import { SessionStore } from "../src/lms/session-store.ts";

async function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

test("LMS session store binds sessions to the expected user", async (t) => {
  const tempDir = await makeTempDir("mju-lms-session-");
  t.after(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const sessionFile = path.join(tempDir, "lms-session.json");
  const store = new SessionStore(sessionFile);
  const jar = new CookieJar();
  await jar.setCookie(
    "JSESSIONID=abc123; Domain=example.com; Path=/; HttpOnly",
    "https://example.com"
  );

  await store.save(jar, "60123456");

  const matched = await store.load("60123456");
  assert.ok(matched);
  assert.equal(matched.userId, "60123456");
  assert.equal(matched.cookieJar.serializeSync().cookies.length, 1);

  const mismatched = await store.load("60999999");
  assert.equal(mismatched, null);

  await fs.writeFile(
    sessionFile,
    JSON.stringify(
      {
        savedAt: new Date().toISOString(),
        cookies: jar.serializeSync()
      },
      null,
      2
    ),
    "utf8"
  );

  const legacy = await store.load("60123456");
  assert.equal(legacy, null);
});

test("Library session store rejects mismatched or legacy sessions", async (t) => {
  const tempDir = await makeTempDir("mju-library-session-");
  t.after(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const sessionFile = path.join(tempDir, "library-session.json");
  const store = new LibrarySessionStore(sessionFile);

  await store.save({
    savedAt: new Date().toISOString(),
    userId: "60123456",
    accessToken: "token-123"
  });

  const matched = await store.load("60123456");
  assert.ok(matched);
  assert.equal(matched.userId, "60123456");
  assert.equal(matched.accessToken, "token-123");

  const mismatched = await store.load("60999999");
  assert.equal(mismatched, null);

  await fs.writeFile(
    sessionFile,
    JSON.stringify(
      {
        savedAt: new Date().toISOString(),
        accessToken: "token-123"
      },
      null,
      2
    ),
    "utf8"
  );

  const legacy = await store.load("60123456");
  assert.equal(legacy, null);
});
