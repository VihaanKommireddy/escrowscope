// sw.js — the service worker: it keeps an offline copy of EscrowScope (SPEC A5).
//
// What it does, in plain words:
//   1. The first time you visit, it saves a copy of this site's own files
//      (the "app shell") in a storage box the browser calls a cache.
//   2. After that, when the page asks for one of those files, it hands back
//      the saved copy. So in most browsers the page opens with the wifi off.
//   3. It touches nothing else. It only answers GET requests, only for this
//      site, and only for the files on the list below. Nothing in this file
//      reads a request's body, adds anything to an address, or talks to any
//      other website.
//
// One honest limit: the rule at the top of index.html (its
// Content-Security-Policy) governs the page, not this file. What keeps this file
// from contacting another website is that its code never does, and
// tests/shell.test.js and tests/sw.test.js fail the build if that changes.
//
// After the site is updated, a returning visitor sees the old version for one
// more visit: the saved copy opens first, and the browser saves the new files in
// the background for next time.

// The name of the storage box. `node tools/stamp-sw.mjs` writes this line: the
// end of the name is a fingerprint of every file on the list below. When any of
// those files changes, the name changes, the browser sees a different sw.js,
// builds a fresh box and throws the old one away (see "activate"). Do not edit
// this line by hand. tests/shell.test.js fails when it is out of date.
const CACHE_NAME = "escrowscope-v1-396da21883c5";

// The app shell: site files only. Never docs/, tests/, v0/ or tools/.
// One relative URL per line (the shell test and the stamp tool parse this list).
// The site is four pages. All four are saved on the first visit to ANY of them,
// so every page opens offline afterwards, not just the one that was visited.
// The site's folder address ("./") is not on the list: the fetch handler below
// answers it with the saved ./index.html.
const PRECACHE_URLS = [
  "./index.html",
  "./check.html",
  "./proof.html",
  "./privacy.html",
  "./styles.css",
  "./site.css",
  "./motion.css",
  "./chart.css",
  "./guide.css",
  "./selfcheck.css",
  "./landing.js",
  "./check.js",
  "./proof-page.js",
  "./privacy-page.js",
  "./site.js",
  "./example-link.js",
  "./render.js",
  "./pipeline.js",
  "./dom.js",
  "./chart.js",
  "./guide.js",
  "./proof.js",
  "./selfcheck-ui.js",
  "./sw-register.js",
  "./tabs.js",
  "./preview.js",
  "./motion.js",
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
  "./assets/fonts/Fraunces-Variable.woff2",
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

// The address the saved copy of one file is fetched from. The "?v=…" on the end
// is a cache-buster: GitHub's servers may hand back a copy of a file that is up
// to ten minutes old, and an address they have never seen before forces a fresh
// one. It carries the cache name and nothing else.
function freshAddressFor(relativeUrl) {
  return relativeUrl + "?v=" + CACHE_NAME;
}

async function saveOneFile(cache, relativeUrl) {
  // "reload" means: skip the browser's ordinary disk cache too.
  const response = await fetch(new Request(freshAddressFor(relativeUrl), { cache: "reload" }));
  if (!response.ok) {
    throw new Error("could not save " + relativeUrl + " (status " + response.status + ")");
  }
  // Saved under its PLAIN address, which is the one the page will ask for.
  await cache.put(relativeUrl, response);
}

async function saveAppShell() {
  const cache = await caches.open(CACHE_NAME);
  const downloads = [];
  for (const relativeUrl of PRECACHE_URLS) {
    downloads.push(saveOneFile(cache, relativeUrl));
  }
  // All or nothing: if one file is missing, this promise fails, the install
  // fails, and the browser tries again on a later visit. A half-saved shell is
  // never put to use.
  await Promise.all(downloads);
}

self.addEventListener("install", (event) => {
  event.waitUntil(saveAppShell());
  // Do not wait for old tabs to close before the new version takes over. This
  // is safe here because the page loads every script up front, so one tab never
  // mixes files from two versions.
  self.skipWaiting();
});

// ---------- activate: throw away old versions ----------

// Every storage box this site has ever made starts with these letters.
const CACHE_FAMILY = "escrowscope-";

// GitHub Pages serves every project of one account from the same web address
// (name.github.io), and the browser shares its storage boxes across that whole
// address. So this only ever deletes boxes from this site's own family. A box
// that belongs to another project is left alone.
async function deleteOldCaches() {
  const names = await caches.keys();
  for (const name of names) {
    if (name.startsWith(CACHE_FAMILY) && name !== CACHE_NAME) {
      await caches.delete(name);
    }
  }
}

self.addEventListener("activate", (event) => {
  // Delete this site's older boxes, then start serving the tabs that are already
  // open (clients.claim) instead of waiting for a reload.
  event.waitUntil(deleteOldCaches().then(() => self.clients.claim()));
});

// ---------- fetch: answer only for this site's own shell files ----------

// Turn a request's address into the address of a saved shell file, or null
// when the request is not for a shell file.
function shellUrlFor(requestUrl) {
  // Drop any "?query" or "#hash": ./check.html?nosw#example-2 is still
  // ./check.html. (The "#…" part never reaches a service worker at all.)
  let plainUrl = requestUrl.origin + requestUrl.pathname;
  // Opening the site's folder ("…/escrowscope/") means opening index.html.
  if (plainUrl === SITE_ROOT_URL) {
    plainUrl = INDEX_URL;
  }
  if (SHELL_URLS.has(plainUrl)) {
    return plainUrl;
  }
  // GitHub Pages also answers a page's address without its ending
  // ("…/escrowscope/check" for check.html). Offline, that address gets the same
  // saved page. Only for a page on the list: anything else is still left alone.
  if (SHELL_URLS.has(plainUrl + ".html")) {
    return plainUrl + ".html";
  }
  return null;
}

async function cacheFirst(shellUrl) {
  const cache = await caches.open(CACHE_NAME);
  const saved = await cache.match(shellUrl);
  if (saved) {
    return saved;
  }
  // The saved copy is missing (the browser may have cleared its storage), so
  // fall back to the network. Only the PLAIN address of a file on the list is
  // ever asked for here: whatever "?query" the request carried is left behind.
  return fetch(shellUrl);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Only plain reads (GET). Any other kind of request is left to the browser,
  // untouched.
  if (request.method !== "GET") return;

  // Only this site. Requests to any other origin are never touched or saved.
  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;

  // Only files on the list. For anything else this function returns WITHOUT
  // answering, and the browser carries on as if this service worker did not
  // exist.
  const shellUrl = shellUrlFor(requestUrl);
  if (shellUrl === null) return;

  event.respondWith(cacheFirst(shellUrl));
});
