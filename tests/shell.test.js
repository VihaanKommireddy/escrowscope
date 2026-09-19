// tests/shell.test.js — the safety net for the app shell (SPEC A1, A4, A5 and
// BUILD-CONTRACT section 5).
//
// The page makes a big promise: it cannot send your numbers anywhere, and it
// works offline. This file checks the FILES for the things that keep that
// promise true: the Content-Security-Policy line, no inline code, no network
// calls, every path relative, and a service worker list that matches the real
// files. It is pure text and file-system checks: no browser, no dependencies.
//
// Run it from the project folder:   node --test tests/shell.test.js
//
// If index.html (or any other file) is missing, the tests FAIL with a plain
// message. They never crash.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// The project folder (one level up from tests/).
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// The exact policy the page must carry (SPEC A4). Each line is one directive.
const REQUIRED_CSP_DIRECTIVES = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "manifest-src 'self'",
  "worker-src 'self'",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
];

// Things the app shell must never contain. Each is a plain text search; the
// "\b" only stops a longer word (like "prefetch(") from counting by accident.
const BANNED_IN_SHELL = [
  { name: "innerHTML", pattern: /innerHTML/ },
  { name: "insertAdjacentHTML", pattern: /insertAdjacentHTML/ },
  { name: "outerHTML", pattern: /outerHTML/ },
  { name: "document.write", pattern: /document\.write/ },
  { name: "eval(", pattern: /\beval\(/ },
  { name: "new Function", pattern: /new Function/ },
  { name: "fetch(", pattern: /\bfetch\(/ },
  { name: "XMLHttpRequest", pattern: /XMLHttpRequest/ },
  { name: "WebSocket", pattern: /WebSocket/ },
  { name: "sendBeacon", pattern: /sendBeacon/ },
  { name: "localStorage", pattern: /localStorage/ },
  { name: "sessionStorage", pattern: /sessionStorage/ },
  { name: "document.cookie", pattern: /document\.cookie/ },
  { name: "import( (a dynamic import)", pattern: /\bimport\(/ },
  { name: "the browser cache storage (only sw.js may use it)", pattern: /\bcaches\.(open|match|keys|delete|has)\b/ },
];

// sw.js is the one file allowed to use fetch( and the cache storage. Everything
// else on the list above is still banned there, plus a few worker-only doors.
const ALLOWED_ONLY_IN_SERVICE_WORKER = ["fetch(", "the browser cache storage (only sw.js may use it)"];
const EXTRA_BANNED_IN_SERVICE_WORKER = [
  { name: "importScripts (pulling in more code)", pattern: /importScripts/ },
  { name: "a \"message\" listener (the page must not be able to hand data to the worker)", pattern: /["']message["']/ },
  { name: "the address of another website (http:// or https://)", pattern: /https?:\/\// },
];

// Folders that are not part of the site and must never be saved for offline use.
const NOT_SITE_FOLDERS = ["docs/", "tests/", "v0/", "tools/"];

// ───────────────────────── small helpers ─────────────────────────

// Read a project file as text. Returns null when the file does not exist.
function readText(relativePath) {
  const fullPath = path.join(ROOT, relativePath);
  if (!existsSync(fullPath)) return null;
  if (!statSync(fullPath).isFile()) return null;
  return readFileSync(fullPath, "utf8");
}

function fileExists(relativePath) {
  const fullPath = path.join(ROOT, relativePath);
  return existsSync(fullPath) && statSync(fullPath).isFile();
}

// "engine\\index.js" or "engine/index.js"  →  "./engine/index.js"
function toDotSlash(relativePath) {
  return "./" + relativePath.split(path.sep).join("/");
}

// Line numbers (1-based) where `pattern` shows up in `text`.
function linesMatching(text, pattern) {
  const found = [];
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    if (pattern.test(lines[index])) found.push(index + 1);
  }
  return found;
}

// Swap every HTML comment for spaces of the same length, so positions in the
// file stay the same but commented-out markup is ignored.
function blankOutHtmlComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, (comment) => " ".repeat(comment.length));
}

// Find every opening tag in a piece of HTML.
// Returns [{ name, attrs: { name: value }, index }] with lower-case names.
// It walks the text by hand so a ">" inside a quoted attribute cannot fool it.
function findTags(html) {
  const tags = [];
  let position = 0;
  while (position < html.length) {
    const open = html.indexOf("<", position);
    if (open === -1) break;
    const firstChar = html[open + 1] || "";
    if (!/[a-zA-Z]/.test(firstChar)) {
      // A closing tag, a doctype, or a stray "<" in text.
      position = open + 1;
      continue;
    }
    // Walk to the ">" that ends this tag, skipping over quoted values.
    let end = open + 1;
    let quote = null;
    while (end < html.length) {
      const char = html[end];
      if (quote !== null) {
        if (char === quote) quote = null;
      } else if (char === '"' || char === "'") {
        quote = char;
      } else if (char === ">") {
        break;
      }
      end += 1;
    }
    const inside = html.slice(open + 1, end);
    const nameMatch = /^[^\s/>]+/.exec(inside);
    const name = nameMatch ? nameMatch[0].toLowerCase() : "";
    const attrs = {};
    // One attribute: a name, then optionally = and a "double", 'single' or bare value.
    const attributePattern = /([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    const attributeText = inside.slice(name.length);
    let match = attributePattern.exec(attributeText);
    while (match !== null) {
      const attributeName = match[1].toLowerCase();
      let value = "";
      if (match[2] !== undefined) value = match[2];
      else if (match[3] !== undefined) value = match[3];
      else if (match[4] !== undefined) value = match[4];
      attrs[attributeName] = value;
      match = attributePattern.exec(attributeText);
    }
    tags.push({ name: name, attrs: attrs, index: open });
    position = end + 1;
  }
  return tags;
}

// What is wrong with this URL, if it is meant to be a relative path to one of
// our own files? Returns a short reason, or null when it is fine.
function relativeUrlProblem(url) {
  if (url.startsWith("//")) return "is protocol-relative (starts with //)";
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) return "has a scheme (like http: or https:)";
  if (url.startsWith("/")) return "is an absolute path (starts with /). Use ./ so the site works in a sub-folder";
  return null;
}

// "./styles.css?v=2#top" → "styles.css" (relative to the project folder), or
// null if it points outside the project. `fromFile` is the file holding the URL.
function resolveInsideProject(url, fromFile) {
  let clean = url.split("#")[0].split("?")[0];
  if (clean === "" || clean.endsWith("/")) clean = clean + "index.html";
  const fromFolder = path.dirname(path.join(ROOT, fromFile));
  const fullPath = path.resolve(fromFolder, clean);
  const relativePath = path.relative(ROOT, fullPath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) return null;
  return relativePath;
}

// ───────────────────────── reading index.html ─────────────────────────

const indexHtmlRaw = readText("index.html");
const indexHtml = indexHtmlRaw === null ? null : blankOutHtmlComments(indexHtmlRaw);
const indexTags = indexHtml === null ? [] : findTags(indexHtml);

function requireIndexHtml() {
  assert.ok(indexHtml !== null, "index.html is missing from the project folder, so this check cannot run.");
}

// Every file index.html asks the browser to load: scripts, stylesheets, icons,
// the manifest, images. (Links the visitor clicks, <a href>, are checked apart.)
function findResourceReferences() {
  const references = [];
  for (const tag of indexTags) {
    if (tag.name === "a") continue;
    if (tag.attrs.src !== undefined) {
      references.push({ tag: tag.name, attribute: "src", url: tag.attrs.src });
    }
    if (tag.name === "link" && tag.attrs.href !== undefined) {
      references.push({ tag: tag.name, attribute: "href", url: tag.attrs.href, rel: (tag.attrs.rel || "").toLowerCase() });
    }
    // <use href="./icons.svg#x"> loads a file; <use href="#x"> does not.
    if (tag.name === "use" && tag.attrs.href !== undefined && !tag.attrs.href.startsWith("#")) {
      references.push({ tag: tag.name, attribute: "href", url: tag.attrs.href });
    }
  }
  return references;
}

const resourceReferences = findResourceReferences();

// The stylesheets index.html links, as project-relative paths.
function findLinkedStylesheets() {
  const sheets = [];
  for (const tag of indexTags) {
    if (tag.name !== "link" || tag.attrs.href === undefined) continue;
    const rel = (tag.attrs.rel || "").toLowerCase().split(/\s+/);
    if (!rel.includes("stylesheet")) continue;
    if (relativeUrlProblem(tag.attrs.href) !== null) continue;
    const resolved = resolveInsideProject(tag.attrs.href, "index.html");
    if (resolved !== null) sheets.push(resolved);
  }
  return sheets;
}

const linkedStylesheets = findLinkedStylesheets();

// ───────────────────────── the static import graph ─────────────────────────

// The three shapes a static import can take. Each pattern only matches at the
// start of a line, so an import written inside a comment or a string is ignored.
const IMPORT_PATTERNS = [
  // import name from "x";  import * as name from "x";  import { a, b } from "x";  import name, { a } from "x";
  /^[ \t]*import\s*(?:[\w$]+\s*,\s*)?(?:[\w$]+|\*\s*as\s+[\w$]+|\{[^}]*\})\s*from\s*["']([^"']+)["']/gm,
  // import "x";
  /^[ \t]*import\s*["']([^"']+)["']/gm,
  // export { a, b } from "x";  export * from "x";  export * as name from "x";
  /^[ \t]*export\s*(?:\*(?:\s*as\s+[\w$]+)?|\{[^}]*\})\s*from\s*["']([^"']+)["']/gm,
];

function findImportSpecifiers(source) {
  const specifiers = [];
  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    let match = pattern.exec(source);
    while (match !== null) {
      specifiers.push(match[1]);
      match = pattern.exec(source);
    }
  }
  return specifiers;
}

// Start at the module scripts in index.html and follow every import.
// Returns { files: [project-relative paths], problems: [plain sentences] }.
function walkImportGraph() {
  const files = [];
  const problems = [];
  const queue = [];

  for (const tag of indexTags) {
    if (tag.name !== "script" || tag.attrs.src === undefined) continue;
    if (relativeUrlProblem(tag.attrs.src) !== null) continue; // reported by another test
    const resolved = resolveInsideProject(tag.attrs.src, "index.html");
    if (resolved !== null) queue.push({ file: resolved, importedBy: "index.html" });
  }

  while (queue.length > 0) {
    const next = queue.shift();
    if (files.includes(next.file)) continue;
    const source = readText(next.file);
    if (source === null) {
      problems.push(next.importedBy + " imports " + toDotSlash(next.file) + ", but that file does not exist.");
      continue;
    }
    files.push(next.file);
    for (const specifier of findImportSpecifiers(source)) {
      if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
        problems.push(
          next.file + ' imports "' + specifier + '". Every import must be a relative path that starts with ./ or ../'
        );
        continue;
      }
      const resolved = resolveInsideProject(specifier, next.file);
      if (resolved === null) {
        problems.push(next.file + ' imports "' + specifier + '", which points outside the project folder.');
        continue;
      }
      queue.push({ file: resolved, importedBy: next.file });
    }
  }
  return { files: files, problems: problems };
}

const importGraph = walkImportGraph();

// The app shell = index.html + every script it (directly or indirectly) imports
// + every stylesheet it links.
function shellFiles() {
  const files = ["index.html"];
  for (const file of importGraph.files) files.push(file);
  for (const file of linkedStylesheets) {
    if (!files.includes(file)) files.push(file);
  }
  return files;
}

// url(...) references inside a stylesheet, minus data: images.
function findCssUrls(css) {
  const urls = [];
  const pattern = /url\(\s*["']?([^"')]+)["']?\s*\)/g;
  let match = pattern.exec(css);
  while (match !== null) {
    const url = match[1].trim();
    if (!url.startsWith("data:")) urls.push(url);
    match = pattern.exec(css);
  }
  return urls;
}

// ───────────────────────── reading sw.js ─────────────────────────

const serviceWorkerSource = readText("sw.js");

function requireServiceWorker() {
  assert.ok(serviceWorkerSource !== null, "sw.js is missing from the project folder, so this check cannot run.");
}

// Pull the PRECACHE_URLS list out of sw.js. The list must be written one URL
// per line so this stays a simple line-by-line read.
function parsePrecacheList() {
  const result = { found: false, urls: [], badLines: [] };
  if (serviceWorkerSource === null) return result;
  const start = serviceWorkerSource.indexOf("const PRECACHE_URLS = [");
  if (start === -1) return result;
  const end = serviceWorkerSource.indexOf("];", start);
  if (end === -1) return result;
  result.found = true;
  const firstLineEnd = serviceWorkerSource.indexOf("\n", start);
  const body = serviceWorkerSource.slice(firstLineEnd + 1, end);
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("//")) continue;
    const match = /^["']([^"']+)["'],?$/.exec(line);
    if (match === null) {
      result.badLines.push(line);
    } else {
      result.urls.push(match[1]);
    }
  }
  return result;
}

const precache = parsePrecacheList();

// ───────────────────────── reading the manifest ─────────────────────────

function readManifest() {
  const text = readText("manifest.webmanifest");
  if (text === null) return { text: null, json: null, error: "manifest.webmanifest is missing." };
  try {
    return { text: text, json: JSON.parse(text), error: null };
  } catch (error) {
    return { text: text, json: null, error: "manifest.webmanifest is not valid JSON: " + error.message };
  }
}

const manifest = readManifest();

function manifestIconPaths() {
  const paths = [];
  if (manifest.json === null || !Array.isArray(manifest.json.icons)) return paths;
  for (const iconEntry of manifest.json.icons) {
    if (typeof iconEntry.src !== "string") continue;
    if (iconEntry.src.startsWith("data:")) continue; // written into the manifest itself: no file
    if (relativeUrlProblem(iconEntry.src) !== null) continue;
    const resolved = resolveInsideProject(iconEntry.src, "manifest.webmanifest");
    if (resolved !== null) paths.push(resolved);
  }
  return paths;
}

// ═════════════════════════ 1. The Content-Security-Policy ═════════════════════════

function findCspTag() {
  for (const tag of indexTags) {
    if (tag.name !== "meta") continue;
    if ((tag.attrs["http-equiv"] || "").toLowerCase() === "content-security-policy") return tag;
  }
  return null;
}

test("index.html carries the Content-Security-Policy, with every directive exactly as the spec says", () => {
  requireIndexHtml();
  const cspTag = findCspTag();
  assert.ok(cspTag !== null, 'index.html has no <meta http-equiv="Content-Security-Policy"> tag.');

  // "a 'b';  c 'd'" → ["a 'b'", "c 'd'"], with runs of spaces squeezed to one.
  const directives = [];
  for (const piece of (cspTag.attrs.content || "").split(";")) {
    const tidy = piece.trim().replace(/\s+/g, " ");
    if (tidy !== "") directives.push(tidy);
  }
  for (const required of REQUIRED_CSP_DIRECTIVES) {
    assert.ok(
      directives.includes(required),
      "The Content-Security-Policy must contain exactly `" + required + "`. It has: " + directives.join("; ")
    );
  }
  assert.ok(
    !(cspTag.attrs.content || "").includes("unsafe"),
    "The Content-Security-Policy must not contain any 'unsafe-…' keyword."
  );
});

test("the Content-Security-Policy sits in <head>, before any <script> or <link>", () => {
  requireIndexHtml();
  const cspTag = findCspTag();
  assert.ok(cspTag !== null, "index.html has no Content-Security-Policy <meta> tag.");

  const headStart = indexHtml.search(/<head[\s>]/i);
  const headEnd = indexHtml.search(/<\/head>/i);
  assert.ok(headStart !== -1 && headEnd !== -1, "index.html needs a <head> … </head>.");
  assert.ok(
    cspTag.index > headStart && cspTag.index < headEnd,
    "The Content-Security-Policy <meta> must be inside <head>."
  );
  for (const tag of indexTags) {
    if (tag.name !== "script" && tag.name !== "link") continue;
    assert.ok(
      tag.index > cspTag.index,
      "A <" + tag.name + "> comes before the Content-Security-Policy <meta>. The policy only protects what comes after it, so it must come first."
    );
  }
});

// ═════════════════════════ 2. No inline code in index.html ═════════════════════════

test('index.html starts with <html lang="en">', () => {
  requireIndexHtml();
  const htmlTag = indexTags.find((tag) => tag.name === "html");
  assert.ok(htmlTag !== undefined, "index.html has no <html> tag.");
  assert.equal(htmlTag.attrs.lang, "en", 'The <html> tag must say lang="en" (screen readers use it to pick a voice).');
});

test("index.html has no inline scripts: every <script> has a src and an empty body", () => {
  requireIndexHtml();
  for (const tag of indexTags) {
    if (tag.name !== "script") continue;
    assert.ok(
      tag.attrs.src !== undefined && tag.attrs.src !== "",
      "A <script> in index.html has no src. Inline scripts are blocked by the Content-Security-Policy."
    );
  }
  const scriptBodies = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let match = scriptBodies.exec(indexHtml);
  while (match !== null) {
    assert.equal(
      match[1].trim(),
      "",
      "A <script> in index.html has code between its tags. Move it into a .js file: " + match[1].trim().slice(0, 60)
    );
    match = scriptBodies.exec(indexHtml);
  }
});

test("index.html has no <style>, no style= attributes and no on…= handler attributes", () => {
  requireIndexHtml();
  for (const tag of indexTags) {
    assert.notEqual(tag.name, "style", "index.html has a <style> block. All CSS belongs in .css files.");
    for (const attributeName of Object.keys(tag.attrs)) {
      assert.notEqual(
        attributeName,
        "style",
        "A <" + tag.name + "> in index.html has a style= attribute. The Content-Security-Policy blocks inline styles; use a class."
      );
      assert.ok(
        !attributeName.startsWith("on"),
        "A <" + tag.name + "> in index.html has the inline handler " + attributeName + "=. Use addEventListener in a .js file."
      );
    }
  }
});

test("index.html never submits anywhere: no <form action>, no formaction, no javascript: URLs", () => {
  requireIndexHtml();
  for (const tag of indexTags) {
    if (tag.name === "form") {
      assert.ok(tag.attrs.action === undefined, "A <form> in index.html has an action= attribute. The form must never submit anywhere.");
    }
    assert.ok(tag.attrs.formaction === undefined, "A <" + tag.name + "> in index.html has a formaction= attribute.");
    for (const attributeName of Object.keys(tag.attrs)) {
      assert.ok(
        !/^\s*javascript:/i.test(tag.attrs[attributeName]),
        "A <" + tag.name + "> in index.html uses a javascript: URL in " + attributeName + "=."
      );
    }
  }
});

// ═════════════════════════ 3. Every path is relative and real ═════════════════════════

test("every file index.html loads is a relative path and exists on disk", () => {
  requireIndexHtml();
  assert.ok(resourceReferences.length > 0, "index.html loads no scripts or stylesheets at all. That cannot be right.");
  for (const reference of resourceReferences) {
    const where = "<" + reference.tag + " " + reference.attribute + '="' + reference.url + '">';
    // The policy allows data: images, and a data: image loads nothing from
    // anywhere. That is allowed for an <img> and for the tab icon (a data: tab
    // icon is what keeps the privacy counter at an honest 0: browsers fetch a
    // file-based tab icon by themselves right after the page loads).
    const isTabIcon = reference.tag === "link" && (reference.rel || "").split(/\s+/).includes("icon");
    if ((reference.tag === "img" || isTabIcon) && reference.url.startsWith("data:")) continue;
    const problem = relativeUrlProblem(reference.url);
    assert.equal(problem, null, where + " " + problem + ". Every file the page loads must be a relative path.");
    const resolved = resolveInsideProject(reference.url, "index.html");
    assert.ok(resolved !== null, where + " points outside the project folder.");
    assert.ok(fileExists(resolved), where + " points to a file that does not exist: " + resolved);
  }
});

test("links the visitor can click: outside links carry rel=noopener noreferrer, local links exist", () => {
  requireIndexHtml();
  for (const tag of indexTags) {
    if (tag.name !== "a" || tag.attrs.href === undefined) continue;
    const href = tag.attrs.href;
    assert.ok(!href.startsWith("//"), '<a href="' + href + '"> is protocol-relative. Write the full https:// address.');
    if (/^https?:/i.test(href)) {
      const rel = (tag.attrs.rel || "").toLowerCase().split(/\s+/);
      assert.ok(
        rel.includes("noopener") && rel.includes("noreferrer"),
        '<a href="' + href + '"> leaves the site, so it needs rel="noopener noreferrer".'
      );
      continue;
    }
    // In-page jumps (#results) and phone / mail links need no file.
    if (href.startsWith("#") || /^(tel|mailto):/i.test(href)) continue;
    const problem = relativeUrlProblem(href);
    assert.equal(problem, null, '<a href="' + href + '"> ' + problem + ".");
    const resolved = resolveInsideProject(href, "index.html");
    assert.ok(resolved !== null && fileExists(resolved), '<a href="' + href + '"> points to a file that does not exist.');
  }
});

test("index.html and its stylesheets load nothing from another website", () => {
  requireIndexHtml();
  const outsideInHtml = /<(?:link|script|img)\b[^>]*\s(?:src|href)\s*=\s*["']?\s*(?:https?:|\/\/)/i;
  assert.ok(
    !outsideInHtml.test(indexHtml),
    "index.html has a <link>, <script> or <img> that points at another website (http…, https… or //…)."
  );
  for (const sheet of linkedStylesheets) {
    const css = readText(sheet);
    assert.ok(css !== null, "index.html links " + sheet + ", but that file does not exist.");
    assert.deepEqual(linesMatching(css, /@import/), [], sheet + " uses @import. Link every stylesheet from index.html instead. Lines:");
    assert.deepEqual(
      linesMatching(css, /url\(\s*["']?\s*(?:https?:|\/\/)/i),
      [],
      sheet + " has a url(...) that points at another website. Lines:"
    );
    for (const url of findCssUrls(css)) {
      const problem = relativeUrlProblem(url);
      assert.equal(problem, null, sheet + ": url(" + url + ") " + problem + ".");
      const resolved = resolveInsideProject(url, sheet);
      assert.ok(resolved !== null && fileExists(resolved), sheet + ": url(" + url + ") points to a file that does not exist.");
    }
  }
});

// ═════════════════════════ 4. The static import graph ═════════════════════════

test("every static import is a relative path to a file that exists", () => {
  requireIndexHtml();
  assert.ok(importGraph.files.length > 0, "index.html has no <script src> to start from, so there is no app to check.");
  assert.deepEqual(importGraph.problems, [], "Problems found while following the imports:\n" + importGraph.problems.join("\n"));
});

test("the trust pieces are wired into the page (sw-register.js, proof.js, selfcheck-ui.js are imported)", () => {
  requireIndexHtml();
  for (const needed of ["sw-register.js", "proof.js", "selfcheck-ui.js"]) {
    assert.ok(
      importGraph.files.includes(needed),
      needed + " is not imported by anything the page loads, so that feature never runs. (app.js should import it.)"
    );
  }
});

// ═════════════════════════ 5. Nothing in the shell can phone home ═════════════════════════

test("no file in the app shell contains a banned call (network, storage, HTML injection, dynamic import)", () => {
  requireIndexHtml();
  const problems = [];
  for (const file of shellFiles()) {
    const source = readText(file);
    if (source === null) continue; // a missing file is reported by the import-graph test
    for (const banned of BANNED_IN_SHELL) {
      const lines = linesMatching(source, banned.pattern);
      if (lines.length > 0) {
        problems.push(file + " contains " + banned.name + " on line " + lines.join(", "));
      }
    }
  }
  assert.deepEqual(problems, [], "Banned text found (even a mention in a comment counts, because this is a plain text search):\n" + problems.join("\n"));
});

test('no file in the app shell sets a style attribute from script (setAttribute("style", …))', () => {
  requireIndexHtml();
  const problems = [];
  for (const file of shellFiles()) {
    const source = readText(file);
    if (source === null) continue;
    const lines = linesMatching(source, /setAttribute\(\s*["']style["']/);
    if (lines.length > 0) problems.push(file + " line " + lines.join(", "));
  }
  assert.deepEqual(problems, [], "The Content-Security-Policy blocks inline styles. Use a class instead:\n" + problems.join("\n"));
});

// ═════════════════════════ 6. The service worker ═════════════════════════

test("sw.js has a versioned CACHE_NAME", () => {
  requireServiceWorker();
  const match = /const\s+CACHE_NAME\s*=\s*["']([^"']+)["']/.exec(serviceWorkerSource);
  assert.ok(match !== null, 'sw.js needs a line like: const CACHE_NAME = "escrowscope-v1-2026-09-19a";');
  assert.ok(
    /^escrowscope-/.test(match[1]) && /\d/.test(match[1]),
    'CACHE_NAME is "' + match[1] + '". It must start with "escrowscope-" and carry a version (some digits), so a new release replaces the old saved files.'
  );
});

test("sw.js PRECACHE_URLS: one relative URL per line, no repeats, nothing from docs/ tests/ v0/ tools/", () => {
  requireServiceWorker();
  assert.ok(precache.found, "sw.js needs a list that starts with: const PRECACHE_URLS = [");
  assert.deepEqual(precache.badLines, [], "These lines in PRECACHE_URLS are not a single quoted URL:\n" + precache.badLines.join("\n"));
  assert.ok(precache.urls.length > 0, "PRECACHE_URLS is empty.");
  const seen = [];
  for (const url of precache.urls) {
    assert.ok(url.startsWith("./"), 'PRECACHE_URLS entry "' + url + '" must start with ./ so the site works in a sub-folder.');
    assert.ok(!seen.includes(url), 'PRECACHE_URLS lists "' + url + '" twice.');
    seen.push(url);
    for (const folder of NOT_SITE_FOLDERS) {
      assert.ok(!url.startsWith("./" + folder), 'PRECACHE_URLS entry "' + url + '" is under ' + folder + ", which is not part of the site.");
    }
  }
});

test("sw.js PRECACHE_URLS: every entry exists on disk", () => {
  requireServiceWorker();
  assert.ok(precache.found, "sw.js has no PRECACHE_URLS list.");
  const missing = [];
  for (const url of precache.urls) {
    const resolved = resolveInsideProject(url, "sw.js");
    if (resolved === null || !fileExists(resolved)) missing.push(url);
  }
  assert.deepEqual(
    missing,
    [],
    "These PRECACHE_URLS entries have no file. One missing file makes the whole offline install fail:\n" + missing.join("\n")
  );
});

test("sw.js PRECACHE_URLS covers the whole app: the import graph, everything index.html loads, the manifest and its icons", () => {
  requireServiceWorker();
  requireIndexHtml();
  assert.ok(precache.found, "sw.js has no PRECACHE_URLS list.");

  // Build the list of everything the page needs to open offline.
  const needed = ["./", "./index.html"];
  const reasons = { "./": "the site's folder address", "./index.html": "the page itself" };
  function need(relativePath, why) {
    const url = toDotSlash(relativePath);
    if (needed.includes(url)) return;
    needed.push(url);
    reasons[url] = why;
  }
  for (const file of importGraph.files) need(file, "imported by the page's scripts");
  for (const reference of resourceReferences) {
    if (relativeUrlProblem(reference.url) !== null) continue;
    const resolved = resolveInsideProject(reference.url, "index.html");
    if (resolved !== null) need(resolved, "loaded by index.html");
  }
  for (const sheet of linkedStylesheets) {
    const css = readText(sheet);
    if (css === null) continue;
    for (const url of findCssUrls(css)) {
      if (relativeUrlProblem(url) !== null) continue;
      const resolved = resolveInsideProject(url, sheet);
      if (resolved !== null) need(resolved, "used by " + sheet);
    }
  }
  if (fileExists("manifest.webmanifest")) need("manifest.webmanifest", "the web app manifest");
  for (const iconPath of manifestIconPaths()) need(iconPath, "an icon named in the manifest");

  const missing = [];
  for (const url of needed) {
    if (!precache.urls.includes(url)) missing.push(url + "   (" + reasons[url] + ")");
  }
  assert.deepEqual(
    missing,
    [],
    "The page needs these files, but sw.js PRECACHE_URLS does not list them, so the page would break offline:\n" + missing.join("\n")
  );
});

test("sw.js only answers same-origin GET requests, deletes old caches, and claims open tabs", () => {
  requireServiceWorker();
  assert.ok(
    /\.method\s*[!=]==\s*["']GET["']/.test(serviceWorkerSource),
    'The fetch handler in sw.js must check the request method against "GET".'
  );
  const comparesOrigin =
    /\.origin\s*[!=]==\s*self\.location\.origin/.test(serviceWorkerSource) ||
    /self\.location\.origin\s*[!=]==\s*[\w$.]+\.origin/.test(serviceWorkerSource);
  assert.ok(comparesOrigin, "The fetch handler in sw.js must compare the request's origin with self.location.origin.");
  assert.ok(/addEventListener\(\s*["']install["']/.test(serviceWorkerSource), 'sw.js needs an "install" listener that saves the app shell.');
  assert.ok(/addEventListener\(\s*["']activate["']/.test(serviceWorkerSource), 'sw.js needs an "activate" listener.');
  assert.ok(/addEventListener\(\s*["']fetch["']/.test(serviceWorkerSource), 'sw.js needs a "fetch" listener.');
  assert.ok(
    /caches\.keys\(/.test(serviceWorkerSource) && /caches\.delete\(/.test(serviceWorkerSource),
    "sw.js must delete old caches on activate (caches.keys() then caches.delete())."
  );
  assert.ok(/clients\.claim\(/.test(serviceWorkerSource), "sw.js must call clients.claim() on activate.");
});

test("sw.js contains nothing banned except fetch( and the cache storage", () => {
  requireServiceWorker();
  const problems = [];
  const checks = [];
  for (const banned of BANNED_IN_SHELL) {
    if (!ALLOWED_ONLY_IN_SERVICE_WORKER.includes(banned.name)) checks.push(banned);
  }
  for (const banned of EXTRA_BANNED_IN_SERVICE_WORKER) checks.push(banned);
  for (const banned of checks) {
    const lines = linesMatching(serviceWorkerSource, banned.pattern);
    if (lines.length > 0) problems.push("sw.js contains " + banned.name + " on line " + lines.join(", "));
  }
  assert.deepEqual(problems, [], problems.join("\n"));
});

test("sw-register.js registers ./sw.js with a relative URL and scope, only when the browser supports it", () => {
  const source = readText("sw-register.js");
  assert.ok(source !== null, "sw-register.js is missing.");
  assert.ok(source.includes('"./sw.js"'), 'sw-register.js must register the relative URL "./sw.js".');
  assert.ok(/scope/.test(source) && source.includes('"./"'), 'sw-register.js must pass a relative scope: { scope: "./" }.');
  assert.ok(source.includes('"serviceWorker" in navigator'), 'sw-register.js must check: "serviceWorker" in navigator.');
  assert.ok(/export function registerServiceWorker\(/.test(source), "sw-register.js must export registerServiceWorker().");
});

// ═════════════════════════ 7. The manifest ═════════════════════════

test("manifest.webmanifest is valid JSON with relative start_url and scope, standalone display, and real icons", () => {
  assert.equal(manifest.error, null, manifest.error || "");
  const json = manifest.json;
  assert.equal(json.start_url, "./", 'manifest start_url must be "./" so the site works in a sub-folder.');
  assert.equal(json.scope, "./", 'manifest scope must be "./".');
  assert.equal(json.display, "standalone", 'manifest display must be "standalone".');
  assert.ok(Array.isArray(json.icons) && json.icons.length > 0, "manifest needs at least one icon.");
  for (const iconEntry of json.icons) {
    assert.equal(typeof iconEntry.src, "string", "Every manifest icon needs a src.");
    // A data: icon is a picture written into the manifest itself. It has no file.
    if (iconEntry.src.startsWith("data:image/")) continue;
    const shortSrc = iconEntry.src.slice(0, 60);
    const problem = relativeUrlProblem(iconEntry.src);
    assert.equal(problem, null, 'manifest icon "' + shortSrc + '" ' + problem + ".");
    const resolved = resolveInsideProject(iconEntry.src, "manifest.webmanifest");
    assert.ok(resolved !== null && fileExists(resolved), 'manifest icon "' + shortSrc + '" does not exist on disk.');
  }
});

// Measured in real Chrome (2026-09-19): when the tab icon is a FILE, named either
// by <link rel="icon"> or by the manifest's icons, Chrome fetches that file by
// itself a few milliseconds AFTER the page has finished loading, and logs it in
// the page's own performance log. The privacy panel then reads "1" instead of
// "0" on every visit. A data: icon is part of the page, so nothing is fetched
// and the counter stays at an honest 0. Do not "tidy" these back into files.
test("the tab icon and the manifest icons are data: URIs, so the privacy counter can honestly read 0", () => {
  requireIndexHtml();
  assert.equal(manifest.error, null, manifest.error || "");
  let tabIcons = 0;
  for (const tag of indexTags) {
    if (tag.name !== "link") continue;
    const rel = (tag.attrs.rel || "").toLowerCase().split(/\s+/);
    if (!rel.includes("icon") && !rel.includes("apple-touch-icon") && !rel.includes("mask-icon")) continue;
    tabIcons += 1;
    assert.ok(
      (tag.attrs.href || "").startsWith("data:image/"),
      '<link rel="' + tag.attrs.rel + '"> points at a file. Browsers fetch a file-based tab icon after the page loads, which makes the privacy counter read 1. Use a data:image/svg+xml,… URI.'
    );
  }
  assert.ok(tabIcons > 0, 'index.html needs a <link rel="icon"> with a data: URI. Without one, browsers go looking for /favicon.ico after the page loads.');
  for (const iconEntry of manifest.json.icons || []) {
    assert.ok(
      typeof iconEntry.src === "string" && iconEntry.src.startsWith("data:image/"),
      "A manifest icon points at a file. Chrome fetches manifest icons after the page loads, which makes the privacy counter read 1. Use a data:image/svg+xml,… URI."
    );
  }
});

// ═════════════════════════ 8. Nothing goes stale ═════════════════════════

// The number of worked cases grows over time, so no file may write it down.
// The page reads the real count from the engine (VECTORS.length and the totals
// runSelfCheck returns).
const STALE_COUNT_PHRASES = ["22 cases", "22 test", "all 22", "22 vectors"];

test("no shell file writes down the number of test cases (it would go stale when cases are added)", () => {
  requireIndexHtml();
  const files = shellFiles();
  files.push("sw.js");
  const problems = [];
  for (const file of files) {
    const source = readText(file);
    if (source === null) continue;
    const lines = source.toLowerCase().split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      for (const phrase of STALE_COUNT_PHRASES) {
        if (lines[index].includes(phrase)) {
          problems.push(file + " line " + (index + 1) + ' says "' + phrase + '"');
        }
      }
    }
  }
  assert.deepEqual(
    problems,
    [],
    "Do not write the case count into the page. Say it without a number, or build it from VECTORS.length:\n" + problems.join("\n")
  );
});

test('no scratch file (a name that starts with "_") is loaded by index.html or saved by sw.js', () => {
  requireIndexHtml();
  requireServiceWorker();
  const problems = [];
  function isScratchPath(url) {
    const clean = url.split("#")[0].split("?")[0];
    for (const piece of clean.split("/")) {
      if (piece.startsWith("_")) return true;
    }
    return false;
  }
  for (const reference of resourceReferences) {
    if (reference.url.startsWith("data:")) continue;
    if (isScratchPath(reference.url)) problems.push("index.html loads " + reference.url);
  }
  for (const file of importGraph.files) {
    if (isScratchPath(file)) problems.push("the page imports " + file);
  }
  for (const url of precache.urls) {
    if (isScratchPath(url)) problems.push("sw.js PRECACHE_URLS lists " + url);
  }
  assert.deepEqual(problems, [], 'Files whose name starts with "_" are scratch files and never ship:\n' + problems.join("\n"));
});

// ═════════════════════════ 9. Housekeeping ═════════════════════════

test("no _dev-* scratch files are left in the project folder", () => {
  const leftovers = [];
  for (const name of readdirSync(ROOT)) {
    if (name.startsWith("_dev-")) leftovers.push(name);
  }
  assert.deepEqual(leftovers, [], "Helpers must delete their scratch files before finishing:\n" + leftovers.join("\n"));
});
