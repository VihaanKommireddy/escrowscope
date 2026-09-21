// tests/shell.test.js — the safety net for the app shell (SPEC A1, A4, A5 and
// BUILD-CONTRACT section 5).
//
// The page makes careful promises: it makes no background connections, the
// numbers a visitor types are never put into an address, and in most browsers
// the page opens offline. This file checks the FILES for the things that keep
// those promises true: the exact Content-Security-Policy line, no inline code,
// no network calls, every path relative, a service worker list that matches the
// real files, and a cache name that changes whenever a file changes.
//
// What kind of check this is: almost everything here is a SOURCE SCAN. It reads
// the files as text. It does not open a browser. A source scan can prove that a
// word is absent; it cannot prove how code behaves. The one place behaviour
// matters most, the service worker, has its own executable test: tests/sw.test.js.
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

import { currentCacheName, expectedCacheName } from "../tools/stamp-sw.mjs";
import { caseGroups, caseOriginSentences } from "../selfcheck-ui.js";
import { describeRequest, offlineCopySentence, offlineCopyState } from "../proof.js";
import { addressSaysNoServiceWorker } from "../sw-register.js";
import { VECTORS } from "../engine/index.js";

// The project folder (one level up from tests/).
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// The exact policy the page must carry (SPEC A4). Each line is one directive.
// The test demands EXACTLY these ten: one more directive is as much a failure
// as one fewer, because an added "script-src-elem https://…" would quietly undo
// the line above it.
//
// The tenth, font-src 'self', was added on 2026-09-21 with the serif heading
// font. It allows ONE kind of thing, a font file, from ONE place, this site's
// own folder. It must never grow a second source: a test below pins the single
// font file the page may load.
const REQUIRED_CSP_DIRECTIVES = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
];

// Things the app shell must never contain. Each is a text search over the whole
// file (so a call split over two lines is still found), tolerant of spaces:
// "fetch (" and "import\n(" count just like "fetch(" and "import(".
//
// Every entry carries two probe strings, and a test below proves the pattern
// against them: `hit` MUST match, `miss` must NOT. A pattern that cannot catch
// its own example is a test that checks nothing.
//
// Even a mention inside a comment counts. That is on purpose: it keeps this a
// plain search that a beginner can reason about.
const BANNED_IN_SHELL = [
  // ── turning a string into page content or code
  { name: "innerHTML", pattern: /innerHTML/, hit: "node.innerHTML = text;", miss: "node.textContent = text;" },
  { name: "insertAdjacentHTML", pattern: /insertAdjacentHTML/, hit: 'node.insertAdjacentHTML("beforeend", text);', miss: 'node.insertAdjacentElement("beforeend", child);' },
  { name: "outerHTML", pattern: /outerHTML/, hit: "node.outerHTML = text;", miss: "window.outerWidth" },
  { name: "setHTMLUnsafe", pattern: /setHTMLUnsafe/, hit: "node.setHTMLUnsafe(text);", miss: "node.setAttribute(name, value);" },
  { name: "document.write", pattern: /document\s*\.\s*write/, hit: "document . write(text);", miss: "document.body.append(node);" },
  { name: "DOMParser", pattern: /DOMParser/, hit: "new DOMParser().parseFromString(text, type);", miss: "JSON.parse(text);" },
  { name: "createContextualFragment", pattern: /createContextualFragment/, hit: "range.createContextualFragment(text);", miss: "document.createDocumentFragment();" },
  { name: "srcdoc", pattern: /srcdoc/i, hit: '<iframe srcdoc="<p>hi</p>">', miss: "the source document" },
  { name: "eval(", pattern: /\beval\s*\(/, hit: 'eval ("1 + 1");', miss: "retrieval(account);" },
  { name: "new Function", pattern: /new\s+Function/, hit: 'new  Function("a", "return a");', miss: "renewFunctionList();" },
  { name: "import( (a dynamic import)", pattern: /\bimport\s*\(/, hit: 'const m = await import\n  ("./x.js");', miss: 'import { el } from "./dom.js"; // important(' },
  { name: "a javascript: address", pattern: /javascript:/i, hit: 'link.setAttribute("href", "javascript:alert(1)");', miss: "plain JavaScript modules" },

  // ── background connections
  { name: "fetch(", pattern: /\bfetch\s*\(/, hit: 'fetch ("./data.json");', miss: 'prefetch("./data.json");' },
  { name: "XMLHttpRequest", pattern: /XMLHttpRequest/, hit: "new XMLHttpRequest();", miss: "new Request(url);" },
  { name: "WebSocket", pattern: /WebSocket/, hit: "new WebSocket(url);", miss: "a wall socket" },
  { name: "EventSource", pattern: /EventSource/, hit: "new EventSource(url);", miss: "event.source" },
  { name: "sendBeacon", pattern: /sendBeacon/, hit: "navigator.sendBeacon(url, data);", miss: "a lighthouse beacon" },
  { name: "RTCPeerConnection", pattern: /RTCPeerConnection/, hit: "new RTCPeerConnection(config);", miss: "a peer connection" },
  { name: "new Worker(", pattern: /new\s+Worker\s*\(/, hit: 'new Worker ("./w.js");', miss: 'navigator.serviceWorker.register("./sw.js");' },
  { name: "SharedWorker", pattern: /SharedWorker/, hit: 'new SharedWorker("./w.js");', miss: "a shared helper" },
  { name: "navigator.share", pattern: /navigator\s*\.\s*share\b/, hit: "navigator.share({ text: numbers });", miss: "navigator.serviceWorker" },
  { name: "dns-prefetch", pattern: /dns-prefetch/i, hit: '<link rel="dns-prefetch" href="//x.example">', miss: "a DNS lookup" },
  { name: "preconnect", pattern: /preconnect/i, hit: '<link rel="preconnect" href="https://x.example">', miss: "reconnect the wifi" },
  { name: "ping= (a link that reports its own clicks)", pattern: /\bping\s*[=:]/i, hit: '<a href="./x" ping="https://x.example/log">', miss: "const mapping = 1; shipping: 2" },

  // ── requests that carry data out inside an address (the policy allows
  //    same-origin images, so `new Image().src = "./a.png?balance=" + value`
  //    would reach the web host's logs)
  { name: "new Image", pattern: /new\s+Image\b/, hit: 'new Image().src = "./a.png?b=" + value;', miss: "new ImageData(1, 1);" },
  { name: ".src = (setting a file address from script)", pattern: /\.src\s*=(?!=)/, hit: 'picture.src = "./a.png?b=" + value;', miss: "if (picture.src === other.src) return;" },
  { name: 'setAttribute("src", …)', pattern: /setAttribute\(\s*["']src(?:set)?["']/, hit: 'picture.setAttribute("src", address);', miss: 'picture.setAttribute("alt", words);' },
  { name: "src: (a file address built through dom.js attrs)", pattern: /\bsrc(?:set)?\s*:/, hit: 'el("img", { attrs: { src: address } });', miss: "connect-src 'none'; resource: 1" },

  // ── leaving the page from script (the policy cannot stop a navigation)
  { name: "window.open", pattern: /\b(?:window|globalThis|self|top|parent)\s*\.\s*open\s*\(/, hit: 'window.open("https://x.example/?b=" + value);', miss: "details.open = true; box.open();" },
  { name: "location.href =", pattern: /location\s*\.\s*href\s*=(?!=)/, hit: 'window.location.href = "https://x.example/?b=" + value;', miss: 'new URL("./", self.location.href); if (location.href === a) {}' },
  { name: "location = (assigning an address)", pattern: /\blocation\s*=(?!=)/, hit: 'window.location = "https://x.example/";', miss: "if (window.location === other) {}" },
  { name: "location.assign", pattern: /location\s*\.\s*assign/, hit: "location.assign(address);", miss: "Object.assign(target, source);" },
  { name: "location.replace", pattern: /location\s*\.\s*replace/, hit: "window.location.replace(address);", miss: 'text.replace("a", "b");' },
  { name: ".href = (setting a link address from script; build links with dom.js attrs)", pattern: /\.href\s*=(?!=)/, hit: "link.href = address;", miss: "if (link.href === entry.name) return true;" },
  { name: 'setAttribute("href", …)', pattern: /setAttribute\(\s*["'](?:xlink:)?href["']/, hit: 'link.setAttribute("href", address);', miss: 'link.getAttribute("href");' },
  { name: "mailto:", pattern: /mailto:/i, hit: '<a href="mailto:someone@example.org?body=numbers">', miss: "mail it to your servicer" },

  // ── keeping anything on the device
  { name: "localStorage", pattern: /localStorage/, hit: 'localStorage.setItem("a", "b");', miss: "local storage box" },
  { name: "sessionStorage", pattern: /sessionStorage/, hit: 'sessionStorage.getItem("a");', miss: "this session" },
  { name: "indexedDB", pattern: /indexedDB/i, hit: 'indexedDB.open("numbers");', miss: "an indexed list" },
  { name: "document.cookie", pattern: /document\s*\.\s*cookie/, hit: 'document.cookie = "a=b";', miss: "document.title" },
  { name: "the browser cache storage (only sw.js may use it)", pattern: /\bcaches\b/, hit: "const box = await caches .open(name);", miss: "a cached copy; cachesize; the box the browser calls a cache" },
];

// The ONLY exceptions to the list above. Each one is a single file and a single
// entry. A test below asserts this list is exactly what is written here, so an
// exception can never be added quietly.
//
// sw.js has to download the site's files and keep them: that is its whole job.
// Every other entry on the list is banned in sw.js too, and tests/sw.test.js
// runs sw.js and proves where its downloads go.
//
// styles.css (added 2026-09-21 with the serif heading font): the "src:" entry is
// there to stop SCRIPT from building a file address out of what the visitor
// typed. A stylesheet cannot do that: it has no access to the form. But CSS has
// no other way to name a font file than the "src:" line inside @font-face. The
// test "the page uses exactly one font file" pins that line to one file in this
// site's own folder, so this exception cannot be used for anything else.
const BANNED_EXCEPTIONS = [
  { file: "sw.js", name: "fetch(" },
  { file: "sw.js", name: "the browser cache storage (only sw.js may use it)" },
  { file: "styles.css", name: "src: (a file address built through dom.js attrs)" },
];

// A few more doors that only a service worker has.
const EXTRA_BANNED_IN_SERVICE_WORKER = [
  { name: "importScripts (pulling in more code)", pattern: /importScripts/, hit: 'importScripts("./more.js");', miss: "import scripts by hand" },
  {
    name: 'a "message" listener (the page must not be able to hand data to the worker)',
    pattern: /["']message["']|\bonmessage\b/,
    hit: 'self.addEventListener("message", handler);',
    miss: "// a message for the reader",
  },
  { name: "the address of another website (http:// or https://)", pattern: /https?:\/\//, hit: 'fetch("https://x.example/");', miss: 'fetch("./index.html");' },
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

// Line numbers (1-based) where `pattern` shows up in `text`. The search runs
// over the WHOLE text, not line by line, so a call that is split over two lines
// ("import" on one line, "(" on the next) is still found.
function linesMatching(text, pattern) {
  const found = [];
  let flags = pattern.flags;
  if (!flags.includes("g")) flags = flags + "g";
  const everywhere = new RegExp(pattern.source, flags);
  let match = everywhere.exec(text);
  while (match !== null) {
    const lineNumber = text.slice(0, match.index).split("\n").length;
    if (!found.includes(lineNumber)) found.push(lineNumber);
    // An empty match would never move forward by itself.
    if (match[0] === "") everywhere.lastIndex += 1;
    match = everywhere.exec(text);
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

// "a 'b';  c 'd'" → ["a 'b'", "c 'd'"], sorted, with runs of spaces squeezed to one.
function parseCspDirectives(policy) {
  const directives = [];
  for (const piece of String(policy).split(";")) {
    const tidy = piece.trim().replace(/\s+/g, " ");
    if (tidy !== "") directives.push(tidy);
  }
  return directives.sort();
}

test("index.html carries the Content-Security-Policy: EXACTLY the ten directives of the spec, no more and no fewer", () => {
  requireIndexHtml();
  const cspTag = findCspTag();
  assert.ok(cspTag !== null, 'index.html has no <meta http-equiv="Content-Security-Policy"> tag.');

  const required = REQUIRED_CSP_DIRECTIVES.slice().sort();
  assert.deepEqual(
    parseCspDirectives(cspTag.attrs.content || ""),
    required,
    "The Content-Security-Policy must be exactly the ten directives in SPEC A4. An extra directive fails too: a later, more specific one can undo an earlier one."
  );
  assert.ok(
    !(cspTag.attrs.content || "").includes("unsafe"),
    "The Content-Security-Policy must not contain any 'unsafe-…' keyword."
  );
});

// Proof that the check above really is exact. The independent audit showed that
// the old version of this test passed a policy with three hostile directives
// added on the end, because it only looked for the nine it wanted.
test("the exact-match policy check rejects a policy with anything added, removed or loosened", () => {
  const good = REQUIRED_CSP_DIRECTIVES.join("; ");
  const required = REQUIRED_CSP_DIRECTIVES.slice().sort();
  assert.deepEqual(parseCspDirectives(good), required, "The spec's own policy must pass.");
  assert.deepEqual(parseCspDirectives("  " + REQUIRED_CSP_DIRECTIVES.slice().reverse().join(" ;  ") + " ; "), required, "Order and spacing must not matter.");

  const hostile = [
    good + "; script-src-elem 'self' https://evil.example; frame-src *",
    good.replace("font-src 'self'", "font-src https:"),
    good.replace("font-src 'self'", "font-src 'self' https://fonts.example"),
    good.replace("font-src 'self'", "font-src 'self' data:"),
    good + "; connect-src https://evil.example",
    good.replace("connect-src 'none'", "connect-src 'self'"),
    good.replace("; base-uri 'none'", ""),
    good.replace("img-src 'self' data:", "img-src *"),
  ];
  for (const policy of hostile) {
    assert.notDeepEqual(parseCspDirectives(policy), required, "This policy should have been rejected: " + policy);
  }
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
    // In-page jumps (#results) and phone links need no file. (Mail links are
    // banned outright further down: they can carry text out in their address.)
    if (href.startsWith("#") || /^tel:/i.test(href)) continue;
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

// ───────── the one font ─────────

// font-src 'self' opened one door on 2026-09-21: the serif heading font. These
// checks keep that door exactly one file wide.
//  - One @font-face, one font file, and it lives in this site's own folder.
//  - index.html preloads that same file, so it is downloaded WHILE the page
//    loads. A font first downloaded later (when a result paints a heading)
//    would make the privacy panel's "requests since load" counter read 1.
//  - The font's license notice travels with the file.
const THE_ONE_FONT = "assets/fonts/Fraunces-Variable.woff2";

test("the page uses exactly one font file, from its own folder, and preloads it so the privacy counter stays at 0", () => {
  requireIndexHtml();
  let fontFaceRules = 0;
  const fontUrls = [];
  for (const sheet of linkedStylesheets) {
    const css = (readText(sheet) || "").replace(/\/\*[\s\S]*?\*\//g, "");
    fontFaceRules += css.split("@font-face").length - 1;
    for (const url of findCssUrls(css)) {
      if (/\.(?:woff2?|ttf|otf|eot)(?:[?#]|$)/i.test(url)) {
        fontUrls.push(resolveInsideProject(url, sheet));
      }
    }
  }
  assert.equal(fontFaceRules, 1, "The stylesheets must declare exactly one @font-face.");
  assert.deepEqual(fontUrls, [THE_ONE_FONT], "The stylesheets must load exactly one font file: " + THE_ONE_FONT);
  assert.ok(fileExists(THE_ONE_FONT), THE_ONE_FONT + " is missing.");
  assert.ok(fileExists("assets/fonts/FRAUNCES-LICENSE.txt"), "The font's license notice (assets/fonts/FRAUNCES-LICENSE.txt) must sit next to the font file.");

  const preloads = indexTags.filter((tag) => tag.name === "link" && (tag.attrs.rel || "").toLowerCase().split(/\s+/).includes("preload"));
  assert.equal(preloads.length, 1, "index.html must have exactly one <link rel=\"preload\">: the font.");
  const preload = preloads[0];
  assert.equal(preload.attrs.as, "font", 'The preload must say as="font".');
  assert.equal(preload.attrs.type, "font/woff2", 'The preload must say type="font/woff2".');
  assert.ok(preload.attrs.crossorigin !== undefined, "A font preload needs the crossorigin attribute, or the browser downloads the font twice.");
  assert.equal(resolveInsideProject(preload.attrs.href || "", "index.html"), THE_ONE_FONT, "The preload must point at the same file the stylesheet uses.");
  assert.ok(precache.urls.includes("./" + THE_ONE_FONT), "sw.js must save the font, or headings lose their typeface offline.");
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

test("every banned-text pattern is proven: it matches its own example and leaves a look-alike alone", () => {
  const all = BANNED_IN_SHELL.concat(EXTRA_BANNED_IN_SERVICE_WORKER);
  const names = [];
  for (const banned of all) {
    assert.ok(!names.includes(banned.name), 'Two banned entries share the name "' + banned.name + '".');
    names.push(banned.name);
    assert.equal(typeof banned.hit, "string", banned.name + " has no `hit` probe.");
    assert.equal(typeof banned.miss, "string", banned.name + " has no `miss` probe.");
    assert.ok(linesMatching(banned.hit, banned.pattern).length > 0, "The pattern for " + banned.name + " does NOT catch its own example: " + banned.hit);
    assert.deepEqual(linesMatching(banned.miss, banned.pattern), [], "The pattern for " + banned.name + " wrongly catches: " + banned.miss);
  }
});

test("every probe the independent audit listed is on the banned list", () => {
  // The audit's 20 plain-text probes (qa-audit.md, defect 9) plus the ones the
  // fix order added. Each must be caught by at least one banned pattern.
  const auditProbes = [
    "new EventSource(url)",
    "new RTCPeerConnection()",
    'new Image().src = "./a.png?bal=" + v',
    'img.src = "./a.png"',
    'window.open("https://x.example")',
    'location.href = "https://x.example/?bal=" + v',
    "location.assign(url)",
    "location.replace(url)",
    'import ("./x.js")',
    'import\n("./x.js")',
    'fetch ("./x")',
    "frame.srcdoc = text",
    "range.createContextualFragment(text)",
    "new DOMParser()",
    "node.setHTMLUnsafe(text)",
    'indexedDB.open("x")',
    'new Worker("./w.js")',
    'new SharedWorker("./w.js")',
    "navigator.share({ text: t })",
    '<a href="mailto:a@example.org">',
    'link.setAttribute("href", "javascript:alert(1)")',
    '<link rel="dns-prefetch" href="//x.example">',
    '<link rel="preconnect" href="https://x.example">',
    '<a href="./x" ping="https://x.example">',
  ];
  for (const probe of auditProbes) {
    let caught = false;
    for (const banned of BANNED_IN_SHELL) {
      if (linesMatching(probe, banned.pattern).length > 0) caught = true;
    }
    assert.ok(caught, "Nothing on the banned list catches: " + probe);
  }
});

test("the list of exceptions to the banned list is exactly: sw.js may download and may use the cache storage, and styles.css may name its one font file", () => {
  assert.deepEqual(BANNED_EXCEPTIONS, [
    { file: "sw.js", name: "fetch(" },
    { file: "sw.js", name: "the browser cache storage (only sw.js may use it)" },
    { file: "styles.css", name: "src: (a file address built through dom.js attrs)" },
  ]);
  // The styles.css exception covers ONE line: the src inside the one @font-face.
  const styles = (readText("styles.css") || "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.equal(linesMatching(styles, /\bsrc(?:set)?\s*:/).length, 1, 'styles.css may contain "src:" exactly once (inside @font-face).');
  const names = BANNED_IN_SHELL.map((banned) => banned.name);
  for (const exception of BANNED_EXCEPTIONS) {
    assert.ok(names.includes(exception.name), 'The exception "' + exception.name + '" does not name an entry on the banned list.');
  }
});

function isException(file, bannedName) {
  for (const exception of BANNED_EXCEPTIONS) {
    if (exception.file === file && exception.name === bannedName) return true;
  }
  return false;
}

test("no file in the app shell contains banned text (network, storage, HTML injection, leaving the page, dynamic import)", () => {
  requireIndexHtml();
  const problems = [];
  for (const file of shellFiles()) {
    const source = readText(file);
    if (source === null) continue; // a missing file is reported by the import-graph test
    for (const banned of BANNED_IN_SHELL) {
      if (isException(file, banned.name)) continue;
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

// ───────── links built in JavaScript ─────────

// The scripts build links with dom.js:  el("a", { attrs: { href: …, rel: … } }).
// THIS IS A SOURCE SCAN: it reads the text of each module, finds every "href:"
// and looks at the { … } object it sits in. It does not run the page. It can be
// fooled by code written to fool it; it is here to catch an honest mistake.
//
// Rule: an href that could leave the site must sit in an object that also has
//       rel: "noopener noreferrer".
// Known-local forms need no rel:  href: "#…"  (a jump inside the page) and
//                                 href: "tel:…" (a phone number).
// One more form is allowed and listed by name: a link with a `download:` key is
// a file the page made itself (the visitor's own numbers, saved to their disk).

// The text of the innermost { … } around `position`.
function enclosingObjectText(source, position) {
  let depth = 0;
  let start = -1;
  for (let index = position; index >= 0; index -= 1) {
    const char = source[index];
    if (char === "}") depth += 1;
    if (char === "{") {
      if (depth === 0) {
        start = index;
        break;
      }
      depth -= 1;
    }
  }
  if (start === -1) return "";
  depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return source.slice(start);
}

// Returns { external: n, downloads: n, local: n, problems: [sentences] }.
function scanScriptLinks(file, source) {
  const result = { external: 0, downloads: 0, local: 0, problems: [] };
  const pattern = /\bhref\s*:\s*/g;
  let match = pattern.exec(source);
  while (match !== null) {
    const lineNumber = source.slice(0, match.index).split("\n").length;
    const afterColon = source.slice(match.index + match[0].length, match.index + match[0].length + 12);
    const objectText = enclosingObjectText(source, match.index);
    if (/^["'`](?:#|tel:)/.test(afterColon)) {
      result.local += 1;
    } else if (/\bdownload\s*:/.test(objectText)) {
      result.downloads += 1;
    } else {
      result.external += 1;
      if (!/\brel\s*:\s*["']noopener noreferrer["']/.test(objectText)) {
        result.problems.push(file + " line " + lineNumber + ': this href can leave the site, so the same object needs rel: "noopener noreferrer".');
      }
    }
    match = pattern.exec(source);
  }
  return result;
}

test("the link scan is proven: it flags a link without rel and accepts the safe forms", () => {
  const bad = scanScriptLinks("probe.js", 'el("a", { text: "x", attrs: { href: step.url } });');
  assert.equal(bad.problems.length, 1, "A link built from a variable with no rel must be flagged.");
  const badRel = scanScriptLinks("probe.js", 'el("a", { attrs: { href: step.url, rel: "noopener" } });');
  assert.equal(badRel.problems.length, 1, "rel must be the full noopener noreferrer.");
  const relElsewhere = scanScriptLinks("probe.js", 'const other = { rel: "noopener noreferrer" }; el("a", { attrs: { href: step.url } });');
  assert.equal(relElsewhere.problems.length, 1, "A rel in a DIFFERENT object must not count.");

  const good = scanScriptLinks("probe.js", 'el("a", { attrs: { href: step.url,\n  rel: "noopener noreferrer" } });');
  assert.deepEqual(good, { external: 1, downloads: 0, local: 0, problems: [] });
  const jump = scanScriptLinks("probe.js", 'el("a", { attrs: { href: "#" + id } }); el("a", { attrs: { href: "tel:+1" + digits } });');
  assert.deepEqual(jump, { external: 0, downloads: 0, local: 2, problems: [] });
  const download = scanScriptLinks("probe.js", 'el("a", { attrs: { href: url, download: "numbers.json" } });');
  assert.deepEqual(download, { external: 0, downloads: 1, local: 0, problems: [] });
});

test('links built in JavaScript: every href that can leave the site carries rel="noopener noreferrer" (a source scan)', () => {
  requireIndexHtml();
  const problems = [];
  const externalByFile = {};
  const downloadFiles = [];
  for (const file of importGraph.files) {
    const source = readText(file);
    if (source === null) continue;
    const found = scanScriptLinks(file, source);
    for (const problem of found.problems) problems.push(problem);
    if (found.external > 0) externalByFile[file] = found.external;
    if (found.downloads > 0) downloadFiles.push(file);
  }
  assert.deepEqual(problems, [], problems.join("\n"));
  // render.js builds the two links to official pages. If the scan stops seeing
  // them, the scan is broken (or the links moved and this line needs updating).
  assert.ok((externalByFile["render.js"] || 0) >= 2, "The scan should find at least two outside links in render.js. It found: " + JSON.stringify(externalByFile));
  // The one allowed link without rel: the "download your numbers" file in app.js.
  assert.deepEqual(downloadFiles, ["app.js"], "Only app.js may build a download link. Found in: " + downloadFiles.join(", "));
});

// ───────── scrolling table boxes ─────────

// A wide table scrolls sideways inside a box. A keyboard user can only scroll
// that box if it can take focus (tabindex="0"), and a screen reader user only
// knows what it is if it has a role and a name. dom.js has ONE function that
// makes the box with all three, so the rule is: nobody else may write the class
// name. THIS IS A SOURCE SCAN of the text of each module.
function sourceOfFunction(source, name) {
  const start = source.indexOf("export function " + name + "(");
  if (start === -1) return null;
  // The function ends at the first line that is just "}".
  const end = source.indexOf("\n}\n", start);
  if (end === -1) return null;
  return { start: start, end: end + 2, text: source.slice(start, end + 2) };
}

test('scrolling table boxes: the class "table-scroll" is written in exactly one place, scrollRegion() in dom.js, which sets tabindex, role and aria-label (a source scan)', () => {
  requireIndexHtml();
  const domSource = readText("dom.js");
  assert.ok(domSource !== null, "dom.js is missing.");
  const scrollRegion = sourceOfFunction(domSource, "scrollRegion");
  assert.ok(scrollRegion !== null, "dom.js must export function scrollRegion(label, children).");
  assert.ok(/className:\s*"table-scroll"/.test(scrollRegion.text), 'scrollRegion() must make the box with className: "table-scroll".');
  assert.ok(/tabindex:\s*"0"/.test(scrollRegion.text), 'scrollRegion() must set tabindex: "0" so the box can be scrolled with the keyboard.');
  assert.ok(/role:\s*"region"/.test(scrollRegion.text), 'scrollRegion() must set role: "region".');
  assert.ok(/"aria-label":\s*label/.test(scrollRegion.text), 'scrollRegion() must set "aria-label" to the name it was given.');
  assert.ok(/throw new Error/.test(scrollRegion.text), "scrollRegion() must refuse to make a box without a name.");

  const problems = [];
  for (const file of importGraph.files) {
    const source = readText(file);
    if (source === null) continue;
    let position = source.indexOf("table-scroll");
    while (position !== -1) {
      const insideScrollRegion = file === "dom.js" && position >= scrollRegion.start && position < scrollRegion.end;
      if (!insideScrollRegion) {
        const lineNumber = source.slice(0, position).split("\n").length;
        problems.push(file + " line " + lineNumber);
      }
      position = source.indexOf("table-scroll", position + 1);
    }
  }
  assert.deepEqual(
    problems,
    [],
    'Only scrollRegion() in dom.js may write "table-scroll". Call scrollRegion("what the table is", [table]) instead:\n' + problems.join("\n")
  );

  // The same box written straight into index.html needs the same three things.
  for (const tag of indexTags) {
    const classes = (tag.attrs.class || "").split(/\s+/);
    if (!classes.includes("table-scroll")) continue;
    assert.equal(tag.attrs.tabindex, "0", 'A class="table-scroll" box in index.html needs tabindex="0".');
    assert.equal(tag.attrs.role, "region", 'A class="table-scroll" box in index.html needs role="region".');
    assert.ok((tag.attrs["aria-label"] || tag.attrs["aria-labelledby"] || "") !== "", 'A class="table-scroll" box in index.html needs an aria-label.');
  }
});

// ═════════════════════════ 6. The service worker ═════════════════════════

test("sw.js has a CACHE_NAME line in the shape the stamp tool writes", () => {
  requireServiceWorker();
  const match = /^const CACHE_NAME = "([^"]+)";[ \t]*$/m.exec(serviceWorkerSource);
  assert.ok(match !== null, 'sw.js needs a line exactly like: const CACHE_NAME = "escrowscope-v1-0123456789ab";');
  assert.ok(
    /^escrowscope-v1-[0-9a-f]{12}$/.test(match[1]),
    'CACHE_NAME is "' + match[1] + '". It must be "escrowscope-v1-" plus 12 hex characters. Do not write it by hand. Run:   node tools/stamp-sw.mjs'
  );
  assert.equal(serviceWorkerSource.split("const CACHE_NAME =").length - 1, 1, "sw.js must define CACHE_NAME exactly once.");
});

// WHY this test exists: sw.js hands back SAVED files first. A returning visitor
// only gets new files when the browser sees that sw.js itself has changed. The
// cache name is a fingerprint (a hash) of every saved file, so changing any file
// changes sw.js. Twice during the build a site file changed, the name did not,
// and every test was green. This test is the one that would have been red.
test("sw.js CACHE_NAME is up to date with the files it saves (if this fails, run: node tools/stamp-sw.mjs)", () => {
  requireServiceWorker();
  const current = currentCacheName(ROOT);
  const expected = expectedCacheName(ROOT);
  assert.equal(
    current,
    expected,
    "\n\nA file that sw.js saves has changed since sw.js was last stamped, so returning visitors would keep the OLD files." +
      "\nFix it by running this from the project folder, then commit sw.js:" +
      "\n\n    node tools/stamp-sw.mjs\n\n" +
      "(sw.js says " + current + ", the files say " + expected + ".)\n"
  );
});

test("the stamp tool is a build tool, not part of the site: sw.js does not save it and the page does not load it", () => {
  requireIndexHtml();
  requireServiceWorker();
  assert.ok(fileExists("tools/stamp-sw.mjs"), "tools/stamp-sw.mjs is missing.");
  for (const url of precache.urls) {
    assert.ok(!url.includes("stamp-sw"), "sw.js PRECACHE_URLS lists the stamp tool: " + url);
  }
  for (const file of importGraph.files) {
    assert.ok(!file.startsWith("tools" + path.sep) && !file.includes("stamp-sw"), "The page imports a build tool: " + file);
  }
  for (const reference of resourceReferences) {
    assert.ok(!reference.url.includes("tools/"), "index.html loads something from tools/: " + reference.url);
  }
  const toolSource = readText("tools/stamp-sw.mjs");
  const allowedImports = ["node:crypto", "node:fs", "node:path", "node:url"];
  for (const specifier of findImportSpecifiers(toolSource)) {
    assert.ok(allowedImports.includes(specifier), 'tools/stamp-sw.mjs imports "' + specifier + '". It must stay zero-dependency: ' + allowedImports.join(", "));
  }
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

// Everything the page needs to open offline, as "./path" URLs with a reason each.
function filesThePageNeeds() {
  const needed = ["./index.html"];
  const reasons = { "./index.html": "the page itself" };
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
  return { needed: needed, reasons: reasons };
}

test("sw.js PRECACHE_URLS covers the whole app: the import graph, everything index.html loads, the manifest and its icons", () => {
  requireServiceWorker();
  requireIndexHtml();
  assert.ok(precache.found, "sw.js has no PRECACHE_URLS list.");

  const page = filesThePageNeeds();
  const missing = [];
  for (const url of page.needed) {
    if (!precache.urls.includes(url)) missing.push(url + "   (" + page.reasons[url] + ")");
  }
  assert.deepEqual(
    missing,
    [],
    "The page needs these files, but sw.js PRECACHE_URLS does not list them, so the page would break offline:\n" + missing.join("\n")
  );
});

test("sw.js PRECACHE_URLS saves nothing the page never reads (every extra file is one more way for the offline install to fail)", () => {
  requireServiceWorker();
  requireIndexHtml();
  const page = filesThePageNeeds();
  const extra = [];
  for (const url of precache.urls) {
    if (!page.needed.includes(url)) extra.push(url);
  }
  assert.deepEqual(extra, [], "sw.js saves these, but nothing the page loads ever asks for them:\n" + extra.join("\n"));
  // The site's folder address ("./") is answered with the saved index.html by
  // the fetch handler. tests/sw.test.js RUNS sw.js and proves that; this only
  // checks the two addresses it needs are still worked out.
  assert.ok(!precache.urls.includes("./"), 'PRECACHE_URLS should not list "./": the fetch handler maps the folder address to ./index.html.');
  assert.ok(/new URL\("\.\/", self\.location\.href\)/.test(serviceWorkerSource), 'sw.js must work out the site folder address with new URL("./", self.location.href).');
  assert.ok(/new URL\("\.\/index\.html", self\.location\.href\)/.test(serviceWorkerSource), "sw.js must work out the address of ./index.html the same way.");
});

test("sw.js downloads each file with the ?v=<CACHE_NAME> cache-buster and saves it under its plain address (a source scan; tests/sw.test.js runs it)", () => {
  requireServiceWorker();
  assert.ok(/\+\s*"\?v="\s*\+\s*CACHE_NAME/.test(serviceWorkerSource), 'sw.js must fetch url + "?v=" + CACHE_NAME, so the web host cannot hand back a ten-minute-old copy.');
  assert.ok(/cache\.put\(\s*relativeUrl\s*,/.test(serviceWorkerSource), "sw.js must save each download under its PLAIN address: cache.put(relativeUrl, response).");
  assert.ok(/response\.ok/.test(serviceWorkerSource), "sw.js must check response.ok, so one failed download fails the whole install.");
  assert.ok(!/addAll\s*\(/.test(serviceWorkerSource), "sw.js must not use addAll any more: it cannot add the cache-buster.");
  assert.ok(fileExists("tests/sw.test.js"), "tests/sw.test.js (the executable service worker test) is missing.");
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
    if (!isException("sw.js", banned.name)) checks.push(banned);
  }
  for (const banned of EXTRA_BANNED_IN_SERVICE_WORKER) checks.push(banned);
  assert.equal(checks.length, BANNED_IN_SHELL.length - 2 + EXTRA_BANNED_IN_SERVICE_WORKER.length, "sw.js should be excused from exactly two entries.");
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

// sw.js is cache-first, on localhost too. Without a switch, a tester who edits a
// file and reloads is looking at the OLD file and does not know it.
test("sw-register.js has the ?nosw switch: it unregisters instead of registering, and there is NO localhost bypass", () => {
  const source = readText("sw-register.js");
  assert.ok(source !== null, "sw-register.js is missing.");

  // The pure part runs right here in Node.
  assert.equal(addressSaysNoServiceWorker("?nosw"), true);
  assert.equal(addressSaysNoServiceWorker("?nosw=1&x=2"), true);
  assert.equal(addressSaysNoServiceWorker("?offline=1&nosw"), true);
  assert.equal(addressSaysNoServiceWorker(""), false);
  assert.equal(addressSaysNoServiceWorker("?offline=1"), false);
  assert.equal(addressSaysNoServiceWorker("?noswitch"), false, '"?noswitch" is not the switch.');
  assert.equal(addressSaysNoServiceWorker("?x=nosw"), false, "nosw as a VALUE is not the switch.");

  // The rest is a source scan.
  assert.ok(/\.unregister\(\)/.test(source), "With ?nosw, sw-register.js must unregister the existing worker.");
  assert.ok(/getRegistration\(/.test(source), "sw-register.js must look up the existing registration to remove it.");
  const switchedOff = source.indexOf("if (serviceWorkerSwitchedOff())");
  const registers = source.indexOf("register();", switchedOff);
  assert.ok(switchedOff !== -1 && registers > switchedOff, "registerServiceWorker() must check the ?nosw switch BEFORE it registers anything.");
  // Offline has to stay testable on the owner's own computer.
  assert.deepEqual(linesMatching(source, /location\s*\.\s*host/), [], "sw-register.js must not look at the host name: no localhost bypass. Lines:");
  assert.deepEqual(linesMatching(source, /127\.0\.0\.1/), [], "sw-register.js must not special-case 127.0.0.1. Lines:");
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

// The manifest description is shown by browsers and app launchers, so it is held
// to the same honesty rules as the page (QA audit, defect 3).
test("manifest.webmanifest description claims only what is true: a web host exists, and offline is \"in most browsers\"", () => {
  assert.equal(manifest.error, null, manifest.error || "");
  const description = String(manifest.json.description || "");
  assert.ok(description.length > 0, "The manifest needs a description.");
  assert.ok(description.length <= 320, "Keep the manifest description short (it is " + description.length + " characters).");
  assert.ok(!/no server/i.test(description), 'The manifest must never say "no server": GitHub Pages is a server and it logs the download.');
  assert.ok(/web host/i.test(description), "The manifest description should say plainly that the web host can see the files being downloaded.");
  assert.ok(/never sees what you type/i.test(description), 'The manifest description should say the host "never sees what you type".');
  if (/offline|internet (turned )?off/i.test(description)) {
    assert.ok(/in most browsers/i.test(description), 'Offline claims must say "in most browsers" (private windows and some older browsers refuse service workers).');
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

// ═════════════════════════ 8. Words that must not come back ═════════════════════════

// Phrases that were true once, or never, and were taken out on purpose. A plain,
// case-insensitive search over every file a visitor's browser receives.
//
//  - The number of worked cases grows over time, so no file may write it down.
//    The page reads the real count from the engine (VECTORS.length).
//  - The rest were removed after the independent audits: each one claimed more
//    than the page can prove, or promised money, or named a phone line the
//    linked official pages do not list.
const BANNED_PHRASES = [
  "22 cases",
  "22 test",
  "all 22",
  "22 vectors",
  "Most payment jumps",
  "995-HOPE",
  "Refund due",
  "nothing has been sent or fetched",
  "refuses any connection this page tries to open",
  "no server",
  "were worked out from the regulation's own method before this",
];

// Make text easy to search: lower case, curly quotes made straight, and the
// `" +` joints between pieces of one long JavaScript string closed up, so a
// sentence that is split over several source lines is still found.
function normalizeForPhraseSearch(text) {
  let tidy = text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
  tidy = tidy.replace(/"\s*\+\s*"/g, "");
  tidy = tidy.replace(/\s+/g, " ");
  return tidy.toLowerCase();
}

// Every file a visitor's browser receives: the import graph, index.html, the
// linked stylesheets, the service worker and the manifest.
function filesAVisitorReceives() {
  const files = shellFiles();
  for (const extra of ["sw.js", "manifest.webmanifest"]) {
    if (!files.includes(extra)) files.push(extra);
  }
  return files;
}

test("the phrase search is proven: it sees through curly quotes, capital letters and strings split over lines", () => {
  const split = 'text:\n  "The browser itself REFUSES any connection " +\n    "this page tries to open.",';
  assert.ok(normalizeForPhraseSearch(split).includes("refuses any connection this page tries to open"));
  const curly = "were worked out from the regulation’s own method before this page’s calculator existed";
  assert.ok(normalizeForPhraseSearch(curly).includes(normalizeForPhraseSearch("were worked out from the regulation's own method before this")));
  assert.ok(!normalizeForPhraseSearch("There is no account and no tracking.").includes("no server"));
});

test("no file a visitor receives contains a phrase that was removed on purpose (stale counts, over-claims, a promised refund)", () => {
  requireIndexHtml();
  const problems = [];
  for (const file of filesAVisitorReceives()) {
    const source = readText(file);
    if (source === null) continue;
    const tidy = normalizeForPhraseSearch(source);
    for (const phrase of BANNED_PHRASES) {
      if (tidy.includes(normalizeForPhraseSearch(phrase))) {
        problems.push(file + ' says "' + phrase + '"');
      }
    }
  }
  assert.deepEqual(
    problems,
    [],
    "These phrases were removed on purpose (see docs/verification/qa-audit.md). Say only what the mechanism proves, and never write the case count down:\n" +
      problems.join("\n")
  );
});

// ═════════════════════════ 9. The privacy panel says only what it can show ═════════════════════════

test("proof.js carries the audited counter wording, word for word", () => {
  const source = readText("proof.js");
  assert.ok(source !== null, "proof.js is missing.");
  assert.ok(
    source.includes('"0: this page has not asked the network for anything since it loaded"'),
    'proof.js must show exactly: "0: this page has not asked the network for anything since it loaded"'
  );
  assert.ok(
    source.includes('"Requests made by this page since it finished loading"'),
    'proof.js must label the number exactly: "Requests made by this page since it finished loading"'
  );
  const tidy = normalizeForPhraseSearch(source);
  assert.ok(tidy.includes("your browser blocks this page from making background connections to any website"), "proof.js must carry the audited Content-Security-Policy paragraph.");
  assert.ok(tidy.includes("it does not stop a link you click from opening another site, and it cannot stop this site's own files from being downloaded"), "proof.js must say what the policy does NOT stop.");
  assert.ok(tidy.includes("view page source"), "proof.js must keep the sentence that tells the visitor how to confirm the policy (View Page Source).");
  assert.ok(tidy.includes("about 250 entries"), 'proof.js must say the browser\'s log holds "about 250 entries".');
  assert.ok(tidy.includes("a returning visitor sees the old version for one more visit"), "proof.js must say that a returning visitor sees the old version for one more visit after an update.");
  assert.ok(tidy.includes("in most browsers"), 'Offline claims in proof.js must say "in most browsers".');
});

test('proof.js "Offline copy" line: the state comes from the service worker registration, never from the cache storage', () => {
  const active = { active: { state: "activated" }, installing: null, waiting: null };
  const installing = { active: null, installing: { state: "installing" }, waiting: null };
  const waiting = { active: null, installing: null, waiting: { state: "installed" } };
  const empty = { active: null, installing: null, waiting: null };

  assert.equal(offlineCopyState(active, true), "saved");
  assert.equal(offlineCopyState(active, false), "saved-for-next-load");
  assert.equal(offlineCopyState(installing, false), "saving");
  assert.equal(offlineCopyState(waiting, false), "saving");
  assert.equal(offlineCopyState(undefined, false), "none");
  assert.equal(offlineCopyState(empty, false), "none");

  for (const state of ["checking", "saved", "saved-for-next-load", "saving", "none", "off"]) {
    assert.ok(offlineCopySentence(state).startsWith("Offline copy: "), 'The sentence for "' + state + '" must start with "Offline copy: ".');
  }
  assert.ok(offlineCopySentence("saved").includes("a service worker is active for this page"));
  assert.ok(offlineCopySentence("none").includes("the page still works while you are online"));
  assert.equal(offlineCopySentence("something new"), offlineCopySentence("none"), "An unknown state must fall back to the most modest sentence.");

  // Not a live region: it changes by itself just after the page opens.
  const source = readText("proof.js");
  const lineStart = source.indexOf("const offlineCopyLine = el(");
  assert.ok(lineStart !== -1, "proof.js should build the line as: const offlineCopyLine = el(…)");
  const lineSource = source.slice(lineStart, source.indexOf(";", lineStart));
  assert.ok(!/role|aria-live/.test(lineSource), 'The "Offline copy" line must not be a live region.');
});

test("proof.js lists each request in full, so nothing that was part of a request is hidden from the visitor", () => {
  const origin = "https://example.github.io";
  assert.equal(
    describeRequest({ name: "https://example.github.io/escrowscope/img/a.png?balance=1200.00" }, origin),
    "/escrowscope/img/a.png?balance=1200.00"
  );
  assert.equal(
    describeRequest({ name: "https://evil.example/collect/1200.00?x=1" }, origin),
    "https://evil.example/collect/1200.00?x=1"
  );
  assert.equal(describeRequest({ name: "not a url" }, origin), "not a url");
});

// ═════════════════════════ 10. The self-check says where its cases came from ═════════════════════════

test("selfcheck-ui.js caseGroups: every current case is either original or from the independent checker, and an unknown id claims nothing", () => {
  const groups = caseGroups(VECTORS);
  assert.deepEqual(groups.other, [], "These cases are on neither list in selfcheck-ui.js, so the page says nothing about where they came from. Add each id to the right list:");
  assert.equal(groups.original.length + groups.independent.length, VECTORS.length, "Every case must land in exactly one bucket.");
  for (const id of groups.original) {
    assert.ok(!groups.independent.includes(id), id + " is in both buckets.");
  }
  assert.ok(groups.original.includes("TV01") && groups.original.includes("TV10b") && groups.original.includes("TV21"));
  assert.ok(groups.independent.includes("TV22") && groups.independent.includes("TV29"));
  assert.ok(!groups.original.includes("TV22"), "TV22 was added after the calculator existed. It must not be called original.");

  const invented = caseGroups([{ id: "TV01" }, { id: "TV22" }, { id: "TV99-invented" }]);
  assert.deepEqual(invented, { original: ["TV01"], independent: ["TV22"], other: ["TV99-invented"] });
});

test("selfcheck-ui.js prints each count from the lists, mentions a bucket only when it has something in it, and claims nothing for unknown cases", () => {
  const real = caseOriginSentences(caseGroups(VECTORS));
  const groups = caseGroups(VECTORS);
  assert.equal(real.length, 2, "With the current cases there are two sentences: the original ones and the independent checker's.");
  assert.ok(real[0].startsWith(groups.original.length + " of these cases came first."));
  assert.ok(real[1].startsWith(groups.independent.length + " more were added later by an independent checker"));

  assert.deepEqual(caseOriginSentences({ original: [], independent: [], other: [] }), []);
  assert.deepEqual(caseOriginSentences({ original: [], independent: [], other: ["X1"] }), ["1 was added later."]);
  const mixed = caseOriginSentences({ original: ["TV01"], independent: ["TV22"], other: ["X1", "X2"] });
  assert.equal(mixed.length, 3);
  assert.equal(mixed[2], "2 more were added later.", "The third bucket must make NO claim about where its cases came from.");
  assert.ok(mixed[0].startsWith("1 of these cases came first. Its expected numbers"));
  assert.ok(mixed[1].startsWith("1 more was added later by an independent checker"));

  // The counts must come from the lists: no digit may be typed into a sentence.
  const source = readText("selfcheck-ui.js");
  const start = source.indexOf("export function caseOriginSentences(");
  const end = source.indexOf("\n}\n", start);
  const functionSource = source.slice(start, end);
  const typedNumbers = functionSource.match(/"[^"\n]*\b(?:[2-9]|\d{2,})\b[^"\n]*"/g) || [];
  assert.deepEqual(typedNumbers, [], "caseOriginSentences() has a count typed into a string. Build it from the length of a list:");
  // The two callouts stay exactly as they were.
  assert.ok(source.includes('sentence: "The worked example printed in the regulation itself (Appendix E)."'), "The TV02 callout changed.");
  assert.ok(source.includes('sentence: "Worked by hand from the regulation before any code existed."'), "The TV01 callout changed.");
});

// ═════════════════════════ 11. One voice, one name for each thing ═════════════════════════

// The page promises that nobody is told anything. So it must never talk like a
// company that is listening: no "we", "us", "our". It says "this page". And one
// thing gets one name: "escrow payment" and "the next 12 months" (QA audit,
// defect 14).
//
// What is scanned: the words a visitor can see or hear in index.html, and every
// STRING LITERAL in the page's own scripts. Not comments, not variable names.
// Not engine/: the Engine Builder's tests run the same scan there.
// Whole words only, any capital letters.
const VOICE_WORDS = [
  "we",
  "us",
  "our",
  "ours",
  "told us",
  "tell us",
  "lawful payment",
  "escrow year",
  "computation year",
  "12-month period",
];

// The ONLY places those words may appear, each one named. They are all lists of
// names that SERVICERS print on their statements, quoted so the visitor can find
// the right box. (One servicer's heading really is "What We Expect to Pay".)
// A test below asserts this list is exactly what is written here.
const VOICE_EXEMPTIONS = [
  "guide.js: the lookFor lists of servicer names inside GUIDE_REGIONS",
  'index.html: the glossary term "Computation year"',
  'index.html: the quoted servicer names after "Also called"',
];

function voicePatternFor(words) {
  const escaped = words.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
  // "Whole word": not glued to a letter, a digit or a hyphen on either side, so
  // the class name "focus-us-here" or the locale "en-US" is not a hit.
  return new RegExp("(?<![\\w-])" + escaped + "(?![\\w-])", "i");
}

function voiceHitsIn(text) {
  const hits = [];
  for (const words of VOICE_WORDS) {
    if (voicePatternFor(words).test(text)) hits.push(words);
  }
  return hits;
}

// Pull every string literal out of JavaScript source, skipping comments.
// Returns [{ text, start, end, line }]. It is a small hand-written reader, not a
// full JavaScript parser: it knows comments, the three kinds of quotes, and
// enough about regular expressions not to mistake /["']/ for a string.
function extractStringLiterals(source) {
  const strings = [];
  let index = 0;
  let lastSignificant = ""; // the last character of code that was not a space
  let lastWord = ""; // the last run of letters, to spot "return /…/"
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (char === "/" && next === "/") {
      const lineEnd = source.indexOf("\n", index);
      index = lineEnd === -1 ? source.length : lineEnd;
      continue;
    }
    if (char === "/" && next === "*") {
      const commentEnd = source.indexOf("*/", index + 2);
      index = commentEnd === -1 ? source.length : commentEnd + 2;
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      let end = index + 1;
      let text = "";
      while (end < source.length && source[end] !== char) {
        if (source[end] === "\\" && end + 1 < source.length) {
          text += source[end + 1] === "n" ? "\n" : source[end + 1];
          end += 2;
        } else {
          text += source[end];
          end += 1;
        }
      }
      strings.push({ text: text, start: index, end: end + 1, line: source.slice(0, index).split("\n").length });
      index = end + 1;
      lastSignificant = char;
      lastWord = "";
      continue;
    }

    // A "/" that starts a regular expression (not a division): skip to its end.
    const regexMayStartHere = lastSignificant === "" || "(,=:[!&|?{};+-*%<>~^".includes(lastSignificant) || lastWord === "return";
    if (char === "/" && regexMayStartHere) {
      let end = index + 1;
      let inClass = false;
      while (end < source.length && source[end] !== "\n") {
        if (source[end] === "\\") {
          end += 2;
          continue;
        }
        if (source[end] === "[") inClass = true;
        else if (source[end] === "]") inClass = false;
        else if (source[end] === "/" && !inClass) break;
        end += 1;
      }
      index = end + 1;
      lastSignificant = "/";
      lastWord = "";
      continue;
    }

    if (/[A-Za-z_$]/.test(char)) {
      lastWord = /[A-Za-z_$]/.test(lastSignificant) && !/\s/.test(source[index - 1] || " ") ? lastWord + char : char;
    } else if (!/\s/.test(char)) {
      lastWord = "";
    }
    if (!/\s/.test(char)) lastSignificant = char;
    index += 1;
  }
  return strings;
}

// The text ranges of every `lookFor: [ … ]` list inside GUIDE_REGIONS.
function lookForRanges(source, literals) {
  const ranges = [];
  const regionsStart = source.indexOf("const GUIDE_REGIONS = [");
  if (regionsStart === -1) return ranges;
  const regionsEnd = source.indexOf("\n];", regionsStart);
  function insideALiteral(position) {
    for (const literal of literals) {
      if (position > literal.start && position < literal.end - 1) return true;
    }
    return false;
  }
  let position = source.indexOf("lookFor:", regionsStart);
  while (position !== -1 && position < regionsEnd) {
    const open = source.indexOf("[", position);
    // The list ends at the first "]" that is not inside a quoted name
    // (one of the names is "Effective [date]").
    let close = source.indexOf("]", open);
    while (close !== -1 && insideALiteral(close)) close = source.indexOf("]", close + 1);
    if (open === -1 || close === -1) break;
    ranges.push({ start: open, end: close });
    position = source.indexOf("lookFor:", close);
  }
  return ranges;
}

// The words a visitor can see or hear in index.html, as a list of pieces.
// `html` has its comments blanked out already.
function visiblePiecesOfHtml(html) {
  let text = html;
  // Exemption: the glossary TERM "Computation year" (its definition is still scanned).
  text = text.replace(/<dt>\s*Computation year\s*<\/dt>/g, " ");
  const pieces = [];
  // Words that are only in attributes, but are still read out or shown.
  for (const tag of findTags(text)) {
    for (const attributeName of ["aria-label", "title", "alt", "placeholder"]) {
      if (tag.attrs[attributeName]) pieces.push(tag.attrs[attributeName]);
    }
    if (tag.name === "meta" && (tag.attrs.name || "").toLowerCase() === "description" && tag.attrs.content) {
      pieces.push(tag.attrs.content);
    }
  }
  // Text between tags. Inline tags (<strong>, <a>…) are dropped without a break,
  // so one sentence stays one piece.
  const withoutInline = text.replace(/<\/?(?:strong|em|b|i|a|span|code|abbr|cite|q|small|sup|sub|mark|kbd)\b[^>]*>/gi, "");
  for (const piece of withoutInline.split(/<[^>]*>/)) {
    const tidy = piece
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (tidy !== "") pieces.push(tidy);
  }
  return pieces;
}

// Exemption: inside a sentence that starts "Also called", blank out every
// “quoted name”. The sentence ends at the first full stop outside quotes.
function blankAlsoCalledNames(piece) {
  let result = "";
  let index = 0;
  while (index < piece.length) {
    const start = piece.indexOf("Also called", index);
    if (start === -1) {
      result += piece.slice(index);
      break;
    }
    result += piece.slice(index, start);
    let position = start;
    let inQuote = false;
    while (position < piece.length) {
      const char = piece[position];
      if (char === "\u201C") inQuote = true;
      if (!inQuote) result += char;
      if (char === "\u201D") inQuote = false;
      position += 1;
      if (char === "." && !inQuote) break;
    }
    index = position;
  }
  return result;
}

// The page's own scripts: everything the page imports, except the engine.
function uiModules() {
  const files = [];
  for (const file of importGraph.files) {
    if (file.startsWith("engine" + path.sep) || file.startsWith("engine/")) continue;
    files.push(file);
  }
  return files;
}

test("the voice scan is proven: it reads strings and not comments, whole words only, and its exemptions are narrow", () => {
  const probe = [
    "// we never scan a comment, and our comments may say us",
    'const bonus = "bonus trust-us-button en-US"; // whole words only',
    "const pattern = /[\"']we[\"']/; const half = total / 2; // a regular expression is not a string",
    'const a = "You told us the payment.";',
    "const b = 'By our math';",
    "const c = `The 12-month period ends`;",
    'const d = "This page checks the next 12 months.";',
  ].join("\n");
  const literals = extractStringLiterals(probe);
  assert.deepEqual(
    literals.map((literal) => literal.text),
    ["bonus trust-us-button en-US", "You told us the payment.", "By our math", "The 12-month period ends", "This page checks the next 12 months."]
  );
  assert.deepEqual(literals.map((literal) => literal.line), [2, 4, 5, 6, 7]);
  assert.deepEqual(voiceHitsIn(literals[0].text), []);
  assert.deepEqual(voiceHitsIn(literals[1].text), ["us", "told us"]);
  assert.deepEqual(voiceHitsIn(literals[2].text), ["our"]);
  assert.deepEqual(voiceHitsIn(literals[3].text), ["12-month period"]);
  assert.deepEqual(voiceHitsIn(literals[4].text), []);
  assert.deepEqual(voiceHitsIn("WE round. Don\u2019t take OUR word. Tell  us yes or no. Your lawful payment. The escrow year. Ours."), [
    "we",
    "us",
    "our",
    "ours",
    "tell us",
    "lawful payment",
    "escrow year",
  ]);

  // The "Also called" exemption covers the quoted names and nothing else.
  const hint = "Every bill we list. Also called \u201CWhat We Expect to Pay\u201D, or \u201CEst. Our Bills\u201D. Tell us the month.";
  assert.equal(blankAlsoCalledNames(hint), "Every bill we list. Also called , or . Tell us the month.");
  assert.deepEqual(voiceHitsIn(blankAlsoCalledNames(hint)), ["we", "us", "tell us"]);

  // The glossary exemption covers the term, not its definition.
  const glossary = visiblePiecesOfHtml("<dl><div><dt>Computation year</dt><dd>The computation year is what we use.</dd></div></dl>");
  assert.deepEqual(glossary, ["The computation year is what we use."]);

  // The lookFor exemption covers the lists inside GUIDE_REGIONS and nothing else.
  const guideProbe = 'export const GUIDE_REGIONS = [\n  { name: "Our bills", lookFor: ["What We Expect to Pay", "Effective [date]", "Our Estimate"], where: "Ask us." },\n];\nconst other = { lookFor: ["we"] };';
  const guideLiterals = extractStringLiterals(guideProbe);
  const ranges = lookForRanges(guideProbe, guideLiterals);
  assert.equal(ranges.length, 1);
  const kept = guideLiterals.filter((literal) => !(literal.start > ranges[0].start && literal.end <= ranges[0].end + 1)).map((literal) => literal.text);
  assert.deepEqual(kept, ["Our bills", "Ask us.", "we"]);
});

test("the list of voice-scan exemptions is exactly the three lists of servicer names", () => {
  assert.deepEqual(VOICE_EXEMPTIONS, [
    "guide.js: the lookFor lists of servicer names inside GUIDE_REGIONS",
    'index.html: the glossary term "Computation year"',
    'index.html: the quoted servicer names after "Also called"',
  ]);
});

test('one voice, one name for each thing: no "we / us / our", no "escrow year", "computation year", "12-month period" or "lawful payment" in anything a visitor reads', () => {
  requireIndexHtml();
  const problems = [];

  for (const piece of visiblePiecesOfHtml(indexHtml)) {
    const hits = voiceHitsIn(blankAlsoCalledNames(piece));
    if (hits.length > 0) problems.push('index.html says "' + hits.join('", "') + '" in: ' + piece.slice(0, 110));
  }

  for (const file of uiModules()) {
    const source = readText(file);
    if (source === null) continue;
    const literals = extractStringLiterals(source);
    const exemptRanges = file === "guide.js" ? lookForRanges(source, literals) : [];
    for (const literal of literals) {
      let exempt = false;
      for (const range of exemptRanges) {
        if (literal.start > range.start && literal.end <= range.end + 1) exempt = true;
      }
      if (exempt) continue;
      const hits = voiceHitsIn(literal.text);
      if (hits.length > 0) problems.push(file + " line " + literal.line + ' says "' + hits.join('", "') + '" in: ' + literal.text.slice(0, 110));
    }
  }

  assert.deepEqual(
    problems,
    [],
    'Say "this page", never we / us / our. Say "escrow payment" and "the next 12 months". (Servicer names belong in a lookFor list or after "Also called".)\n' +
      problems.join("\n")
  );
});

// ═════════════════════════ 12. Housekeeping ═════════════════════════

// GitHub Pages runs every site through a tool called Jekyll unless a file named
// .nojekyll sits at the top. Jekyll silently DROPS any file or folder whose name
// starts with "_", and it blanks out {{ … }} tags in the docs. One dropped file
// on the service worker's list would make the whole offline install fail.
test(".nojekyll exists at the top of the project, so GitHub Pages serves the files exactly as they are", () => {
  assert.ok(fileExists(".nojekyll"), "Add an empty file named .nojekyll to the project folder (next to index.html).");
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

test("no _dev-* scratch files are left in the project folder", () => {
  const leftovers = [];
  for (const name of readdirSync(ROOT)) {
    if (name.startsWith("_dev-")) leftovers.push(name);
  }
  assert.deepEqual(leftovers, [], "Helpers must delete their scratch files before finishing:\n" + leftovers.join("\n"));
});

// Found testing the live site at phone size (2026-09-21): the editable letter box
// was 14px. iPhone Safari zooms the page in when a text-entry control under 16px
// gets focus. Checkboxes and radio buttons do not trigger that zoom, so this only
// looks at boxes people type in.
test("phone: no box people type in has a font size under 16px (iPhone Safari would zoom the page on tap)", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const root = fileURLToPath(new URL("../", import.meta.url));
  const cssFiles = readdirSync(root).filter((name) => name.endsWith(".css"));
  assert.ok(cssFiles.includes("styles.css"));
  const typedInto = /(textarea|\.letter-text|input\[type="?(text|date|number|search|email|tel)"?\]|\.money-input|\.text-input|select)/;
  const tooSmall = [];
  for (const name of cssFiles) {
    const css = readFileSync(root + name, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = rule[1].trim();
      if (!typedInto.test(selector)) continue;
      const size = rule[2].match(/font-size:\s*([0-9.]+)(px|rem)/);
      if (!size) continue;
      const pixels = size[2] === "rem" ? Number(size[1]) * 16 : Number(size[1]);
      if (pixels < 16) tooSmall.push(name + ": " + selector.split("\n").pop() + " is " + size[1] + size[2]);
    }
  }
  assert.deepEqual(tooSmall, []);
});
