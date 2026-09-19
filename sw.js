// sw.js — the service worker: it makes EscrowScope work offline (SPEC A5).
//
// What it does, in plain words:
//   1. The first time you visit, it saves a copy of this site's own files
//      (the "app shell") in a storage box the browser calls a cache.
//   2. After that, when the page asks for one of those files, it hands back
//      the saved copy. So the page opens with the wifi off.
//   3. It touches nothing else. It only answers GET requests, only for this
//      site, and only for the files on the list below. It never sees what you
//      type: your numbers never travel in a request, so there is nothing here
//      for it to see.
//
// tests/shell.test.js reads this file and fails the build if the list drifts
// away from the real files, or if the safety checks below are removed.

// Change this name whenever ANY file on the list changes. A new name makes the
// browser build a fresh box and throw the old one away (see "activate").
const CACHE_NAME = "escrowscope-v1-2026-09-19b";

// The app shell: site files only. Never docs/, tests/, v0/ or tools/.
// One relative URL per line (the shell test parses this list).
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./styles.css",
  "./chart.css",
  "./guide.css",
  "./selfcheck.css",
  "./app.js",
  "./render.js",
  "./pipeline.js",
  "./dom.js",
  "./chart.js",
  "./guide.js",
  "./proof.js",
  "./selfcheck-ui.js",
  "./sw-register.js",
  "./examples.js",
  "./engine/index.js",
  "./engine/money.js",
  "./engine/validate.js",
  "./engine/analyze.js",
  "./engine/compare.js",
  "./engine/explain.js",
  "./engine/letter.js",
  "./engine/dates.js",
  "./engine/vectors.js",
  "./engine/selfcheck.js",
  "./manifest.webmanifest",
  "./assets/favicon.svg",
  "./assets/logo.svg",
];

// This file sits in the site's top folder, so "./" means "the site's folder",
// wherever the site is hosted (localhost, or /escrowscope/ on GitHub Pages).
const SITE_ROOT_URL = new URL("./", self.location.href).href;
const INDEX_URL = new URL("./index.html", self.location.href).href;

// The same list as full addresses, so an incoming request can be looked up.
const SHELL_URLS = new Set();
for (const relativeUrl of PRECACHE_URLS) {
  SHELL_URLS.add(new URL(relativeUrl, self.location.href).href);
}

// ---------- install: save the app shell ----------

async function saveAppShell() {
  const cache = await caches.open(CACHE_NAME);
  const requests = [];
  for (const relativeUrl of PRECACHE_URLS) {
    // "reload" means: get a fresh copy from the site, not a stale one from the
    // browser's ordinary disk cache.
    requests.push(new Request(relativeUrl, { cache: "reload" }));
  }
  // addAll is all-or-nothing: if one file is missing, nothing is saved and the
  // browser tries again on a later visit. We never keep a half-saved shell.
  await cache.addAll(requests);
}

self.addEventListener("install", (event) => {
  event.waitUntil(saveAppShell());
  // Do not wait for old tabs to close before the new version takes over. This
  // is safe here because the page loads every script up front, so one tab never
  // mixes files from two versions.
  self.skipWaiting();
});

// ---------- activate: throw away old versions ----------

async function deleteOldCaches() {
  const names = await caches.keys();
  for (const name of names) {
    if (name !== CACHE_NAME) {
      await caches.delete(name);
    }
  }
}

self.addEventListener("activate", (event) => {
  // Delete every cache that is not the current version, then start serving the
  // tabs that are already open (clients.claim) instead of waiting for a reload.
  event.waitUntil(deleteOldCaches().then(() => self.clients.claim()));
});

// ---------- fetch: answer only for our own shell files ----------

// Turn a request's address into the address of a saved shell file, or null
// when the request is not for a shell file.
function shellUrlFor(requestUrl) {
  // Drop any "?query" or "#hash": ./index.html?x=1 is still ./index.html.
  let plainUrl = requestUrl.origin + requestUrl.pathname;
  // Opening the site's folder ("…/escrowscope/") means opening index.html.
  if (plainUrl === SITE_ROOT_URL) {
    plainUrl = INDEX_URL;
  }
  if (SHELL_URLS.has(plainUrl)) {
    return plainUrl;
  }
  return null;
}

async function cacheFirst(shellUrl, request) {
  const cache = await caches.open(CACHE_NAME);
  const saved = await cache.match(shellUrl);
  if (saved) {
    return saved;
  }
  // The saved copy is missing (the browser may have cleared its storage), so
  // fall back to the network. This only ever happens for a shell file.
  return fetch(request);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Only plain reads. This site never sends anything, so there is nothing else
  // to handle.
  if (request.method !== "GET") return;

  // Only this site. Requests to any other origin are never touched or saved.
  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;

  // Only files on the list. For anything else we return WITHOUT answering, and
  // the browser carries on as if this service worker did not exist.
  const shellUrl = shellUrlFor(requestUrl);
  if (shellUrl === null) return;

  event.respondWith(cacheFirst(shellUrl, request));
});
