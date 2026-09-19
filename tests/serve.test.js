// tests/serve.test.js — the local preview server must not crash or leak files.
//
// Why this exists: the independent QA audit (docs/verification/qa-audit.md,
// defect 11) found two problems in serve.mjs:
//   1. One request for "/%" threw a URIError and killed the whole process.
//   2. The "stay inside the app folder" check used startsWith(ROOT) with no
//      trailing slash, so a SIBLING folder whose name merely starts with the
//      app folder's name (escrowscope-v1-backup) would have passed.
//
// serve.mjs is dev-only and listens on 127.0.0.1, so neither was a risk to
// visitors. But a tester whose server silently died is a tester looking at
// nothing, so it gets a regression test like everything else.
//
// These tests call the path logic directly. They never open a port, so they
// cannot collide with a preview server that is already running.

import test from "node:test";
import assert from "node:assert/strict";
import { join, sep } from "node:path";
import { resolveRequestPath } from "../serve.mjs";

// A made-up app folder. Nothing is read from disk here: resolveRequestPath
// only decides WHICH file a URL points at, it does not open it.
const ROOT = join(sep, "home", "someone", "escrowscope-v1");

test("a normal file URL resolves inside the app folder", () => {
  const answer = resolveRequestPath("/styles.css", ROOT);
  assert.equal(answer.status, 200);
  assert.equal(answer.filePath, join(ROOT, "styles.css"));
});

test("a folder URL (ends with a slash) serves that folder's index.html", () => {
  assert.equal(resolveRequestPath("/", ROOT).filePath, join(ROOT, "index.html"));
  assert.equal(resolveRequestPath("/engine/", ROOT).filePath, join(ROOT, "engine", "index.html"));
});

test("a query string is ignored when picking the file (the service worker adds ?v=...)", () => {
  const answer = resolveRequestPath("/app.js?v=escrowscope-v1-abc123", ROOT);
  assert.equal(answer.status, 200);
  assert.equal(answer.filePath, join(ROOT, "app.js"));
});

test("percent-encoded names are decoded (a space in a file name)", () => {
  const answer = resolveRequestPath("/docs/some%20file.md", ROOT);
  assert.equal(answer.status, 200);
  assert.equal(answer.filePath, join(ROOT, "docs", "some file.md"));
});

test("AUDIT 11: a malformed percent sign is a 400, never an exception", () => {
  for (const badUrl of ["/%", "/%zz", "/a%2", "/%E0%A4%A", "/ok/%"]) {
    let answer;
    assert.doesNotThrow(() => {
      answer = resolveRequestPath(badUrl, ROOT);
    }, "resolveRequestPath threw on " + badUrl);
    assert.equal(answer.status, 400, badUrl + " should be a 400");
    assert.equal(answer.filePath, undefined, badUrl + " must not resolve to a file");
  }
});

test("a NUL byte in the path is a 400 (the file system would throw on it)", () => {
  const answer = resolveRequestPath("/app.js%00.png", ROOT);
  assert.equal(answer.status, 400);
});

test("nonsense that is not a URL at all is a 400, never an exception", () => {
  for (const badUrl of [undefined, null, "", 42, {}]) {
    let answer;
    assert.doesNotThrow(() => {
      answer = resolveRequestPath(badUrl, ROOT);
    });
    assert.equal(answer.status, 400);
  }
});

test("'..' can never climb out of the app folder", () => {
  for (const sneaky of ["/../secret.txt", "/engine/../../secret.txt", "/%2e%2e/secret.txt", "/..%2fsecret.txt", "/a/b/../../../secret.txt"]) {
    const answer = resolveRequestPath(sneaky, ROOT);
    if (answer.status === 200) {
      // URL parsing may have already squashed the ".." harmlessly. Then the
      // file it points at must still be inside the app folder.
      assert.ok(answer.filePath.startsWith(ROOT + sep), sneaky + " escaped to " + answer.filePath);
    } else {
      assert.equal(answer.status, 403, sneaky + " should be refused");
    }
  }
});

test("AUDIT 11: a SIBLING folder whose name starts with the app folder's name is refused", () => {
  // /home/someone/escrowscope-v1-backup/secret.txt starts with the text
  // "/home/someone/escrowscope-v1" but it is NOT inside that folder.
  const answer = resolveRequestPath("/..%2fescrowscope-v1-backup/secret.txt", ROOT);
  assert.equal(answer.status, 403);
  assert.equal(answer.filePath, undefined);
});

test("the app folder itself resolves to its index.html, not to a 403", () => {
  // Exactly ROOT (no trailing separator) must still count as "inside".
  const answer = resolveRequestPath("/.", ROOT);
  assert.equal(answer.status, 200);
  assert.ok(answer.filePath === join(ROOT, "index.html") || answer.filePath === ROOT, "got " + answer.filePath);
});

test("importing serve.mjs does not start a server (port 4173 stays free for the owner)", async () => {
  // The real proof is that this test run EXITS: an open server keeps a Node
  // process alive, so if the import at the top of this file had started one,
  // `npm test` would hang here until it timed out. The flag below is worked out
  // by serve.mjs from how it was launched; it is not a hard-coded "false".
  const serveModule = await import("../serve.mjs");
  assert.equal(typeof serveModule.resolveRequestPath, "function");
  assert.equal(typeof serveModule.startServer, "function");
  assert.equal(serveModule.startedServerOnLoad, false);
});
