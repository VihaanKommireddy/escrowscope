// tools/stamp-sw.mjs — writes the CACHE_NAME line in sw.js, so that nobody has
// to remember to change it by hand.
//
// Run it by hand from the project folder, after your last change to the site:
//
//     node tools/stamp-sw.mjs            rewrite the CACHE_NAME line if it is stale
//     node tools/stamp-sw.mjs --check    change nothing; exit with an error if it is stale
//
// WHY this exists (read this once, it explains the whole file):
//
// sw.js is the service worker. It saves a copy of the site's files in a box the
// browser calls a cache, and from then on it hands back the SAVED copies first.
// That is what makes the page open offline. It also means a returning visitor
// keeps getting the saved files until the browser notices that sw.js itself has
// changed. The browser compares sw.js byte by byte. If app.js changes but sw.js
// does not, the browser sees "same worker as before", installs nothing, and the
// visitor is stuck on the OLD app.js, possibly for good. This really happened
// twice during the build: two commits changed site files and shipped with the
// same cache name, with every test green.
//
// The fix is to make the cache name depend on the files. This tool computes a
// HASH of every file on the worker's list and writes the start of it into the
// name:  const CACHE_NAME = "escrowscope-v1-3fa9c2d41b07";
//
// What a hash is: a function that turns any amount of data into a short
// fingerprint (here 64 hex characters, from the SHA-256 function). The same
// bytes always give the same fingerprint, and changing a single character
// anywhere gives a completely different one. Nothing about the files can be
// worked out from the fingerprint. It is only good for one question: "is this
// exactly the same data as before?"
//
// So: any file changes → the fingerprint changes → the CACHE_NAME line changes →
// sw.js is a different file → the browser installs the new worker → the new
// worker saves fresh copies under the new name and deletes the old box.
//
// tests/shell.test.js imports the two functions below and FAILS when the name in
// sw.js is not the one this tool would write. That is the reminder to run it.
//
// Zero dependencies: only tools that come with Node. This file is not part of
// the site: it is never saved by sw.js and never loaded by the page (the shell
// test checks both).

import { createHash } from "node:crypto";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The start of every cache name. The fingerprint goes after the last dash.
export const CACHE_NAME_PREFIX = "escrowscope-v1-";

// How much of the 64-character fingerprint goes into the name. Twelve hex
// characters is 48 bits: far more than enough to tell two versions of one small
// site apart, and short enough to read.
const FINGERPRINT_LENGTH = 12;

// The one line this tool is allowed to rewrite. It must look exactly like this
// in sw.js (start of a line, double quotes, a semicolon).
const CACHE_NAME_LINE = /^const CACHE_NAME = "([^"]*)";[ \t]*$/m;

const toolsFolder = path.dirname(fileURLToPath(import.meta.url));
const defaultRootFolder = path.join(toolsFolder, "..");

function readServiceWorker(rootFolder) {
  return readFileSync(path.join(rootFolder, "sw.js"), "utf8");
}

// Pull the PRECACHE_URLS list out of the text of sw.js. The list is written one
// quoted URL per line, which keeps this a simple line-by-line read.
export function readPrecacheUrls(serviceWorkerText) {
  const start = serviceWorkerText.indexOf("const PRECACHE_URLS = [");
  if (start === -1) {
    throw new Error("sw.js has no list that starts with: const PRECACHE_URLS = [");
  }
  const end = serviceWorkerText.indexOf("];", start);
  if (end === -1) {
    throw new Error("The PRECACHE_URLS list in sw.js never ends with ];");
  }
  const firstLineEnd = serviceWorkerText.indexOf("\n", start);
  const body = serviceWorkerText.slice(firstLineEnd + 1, end);

  const urls = [];
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("//")) continue;
    const match = /^["']([^"']+)["'],?$/.exec(line);
    if (match === null) {
      throw new Error("This line in PRECACHE_URLS is not a single quoted URL: " + line);
    }
    urls.push(match[1]);
  }
  return urls;
}

// "./engine/index.js" → the full path of that file inside the project folder.
function filePathFor(rootFolder, url) {
  if (!url.startsWith("./") || url.includes("..") || url.endsWith("/")) {
    throw new Error('PRECACHE_URLS entry "' + url + '" must be a plain ./path to a file.');
  }
  return path.join(rootFolder, url.slice(2));
}

// The name sw.js carries right now, or null when the line is missing.
export function currentCacheName(rootFolder = defaultRootFolder) {
  const match = CACHE_NAME_LINE.exec(readServiceWorker(rootFolder));
  if (match === null) return null;
  return match[1];
}

// The name sw.js SHOULD carry, worked out from the files as they are on disk.
export function expectedCacheName(rootFolder = defaultRootFolder) {
  const serviceWorkerText = readServiceWorker(rootFolder);
  const urls = readPrecacheUrls(serviceWorkerText);
  const hash = createHash("sha256");

  // 1. The list itself, so adding, removing or reordering a file counts.
  hash.update(urls.join("\n"));

  // 2. The bytes of every file on the list, in list order.
  for (const url of urls) {
    hash.update(readFileSync(filePathFor(rootFolder, url)));
  }

  // 3. sw.js itself, WITHOUT its CACHE_NAME line. The line has to be left out:
  //    if the name were part of what is hashed, writing the name would change
  //    the hash, which would change the name, and it could never settle.
  hash.update(serviceWorkerText.replace(CACHE_NAME_LINE, ""));

  const fingerprint = hash.digest("hex");
  return CACHE_NAME_PREFIX + fingerprint.slice(0, FINGERPRINT_LENGTH);
}

// Rewrite ONLY the CACHE_NAME line. Returns what happened, and writes nothing
// when the name is already right.
export function stampServiceWorker(rootFolder = defaultRootFolder) {
  const serviceWorkerText = readServiceWorker(rootFolder);
  const match = CACHE_NAME_LINE.exec(serviceWorkerText);
  if (match === null) {
    throw new Error('sw.js needs a line exactly like: const CACHE_NAME = "' + CACHE_NAME_PREFIX + '000000000000";');
  }
  const before = match[1];
  const after = expectedCacheName(rootFolder);
  if (before === after) {
    return { changed: false, before: before, after: after };
  }
  const newLine = 'const CACHE_NAME = "' + after + '";';
  // A function as the replacement, so nothing in the new line is read as a
  // special "$" pattern by replace().
  const newText = serviceWorkerText.replace(CACHE_NAME_LINE, () => newLine);
  writeFileSync(path.join(rootFolder, "sw.js"), newText);
  return { changed: true, before: before, after: after };
}

// ---------- the command line ----------

// Everything above can be imported by a test without anything happening. The
// part below runs only when this file is the one Node was asked to run
// ("node tools/stamp-sw.mjs"), not when another file imports it.
function isRunDirectly() {
  if (process.argv.length < 2 || !process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch (error) {
    return false;
  }
}

function main() {
  const checkOnly = process.argv.includes("--check");

  if (checkOnly) {
    const current = currentCacheName();
    const expected = expectedCacheName();
    if (current === expected) {
      console.log("sw.js is up to date: " + current);
      return;
    }
    console.error("sw.js is STALE.");
    console.error("  it says:   " + current);
    console.error("  expected:  " + expected);
    console.error("Run this, then commit sw.js:   node tools/stamp-sw.mjs");
    process.exitCode = 1;
    return;
  }

  const result = stampServiceWorker();
  if (result.changed) {
    console.log("sw.js stamped: " + result.after + "   (was " + result.before + ")");
  } else {
    console.log("sw.js is already up to date: " + result.after);
  }
}

if (isRunDirectly()) {
  try {
    main();
  } catch (error) {
    console.error("stamp-sw: " + error.message);
    process.exitCode = 1;
  }
}
