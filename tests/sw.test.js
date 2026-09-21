// tests/sw.test.js — RUNS sw.js (the service worker) and watches what it does.
//
// tests/shell.test.js only READS sw.js as text. That cannot prove the worker
// behaves. This file loads the real sw.js into a sealed box (Node's built-in
// node:vm) where the three doors a worker has to the outside world are fakes
// that write down everything that goes through them:
//
//     fetch(...)   the network      → every address asked for is recorded
//     caches       the saved files  → a plain in-memory Map
//     self         the worker       → collects the install / activate / fetch
//                                     listeners so the test can fire them
//
// The worker is told it lives at https://example.github.io/escrowscope/sw.js,
// which is the shape of the real GitHub Pages address (a site inside a
// sub-folder). That is the case a test on localhost cannot show.
//
// Zero dependencies: no browser, no jsdom.
//
// Run it from the project folder:   node --test tests/sw.test.js

import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVICE_WORKER_SOURCE = readFileSync(path.join(ROOT, "sw.js"), "utf8");

const WORKER_URL = "https://example.github.io/escrowscope/sw.js";
const SITE_FOLDER = "https://example.github.io/escrowscope/";
const SITE_ORIGIN = "https://example.github.io";

// ───────────────────────── the fake world ─────────────────────────

// Build one sealed box with sw.js running inside it.
// `options.brokenUrls`: plain addresses the fake network answers with a 404.
// `options.deadUrls`:   plain addresses the fake network cannot reach at all.
function startWorker(options = {}) {
  const brokenUrls = options.brokenUrls || [];
  const deadUrls = options.deadUrls || [];

  const world = {
    listeners: {}, // "install" → the function sw.js registered
    fetched: [], // every full address the worker asked the network for, in order
    boxes: new Map(), // cache name → Map(full address → response)
    skipWaitingCalls: 0,
    claimCalls: 0,
  };

  // A request is just an address and a method here.
  class FakeRequest {
    constructor(input, init = {}) {
      const address = typeof input === "string" ? input : input.url;
      this.url = new URL(address, WORKER_URL).href;
      this.method = init.method || (typeof input === "string" ? "GET" : input.method) || "GET";
      this.cache = init.cache;
    }
  }

  class FakeResponse {
    constructor(body, init = {}) {
      this.body = body;
      this.status = init.status === undefined ? 200 : init.status;
      this.ok = this.status >= 200 && this.status <= 299;
      this.url = init.url || "";
    }
  }

  // The real Cache API looks a saved file up by its FULL address, query string
  // included. The fake does the same, so "saved under the plain address" is a
  // real check and not an accident of the fake.
  function fullAddress(requestOrUrl) {
    if (typeof requestOrUrl === "string") return new URL(requestOrUrl, WORKER_URL).href;
    return requestOrUrl.url;
  }

  function openBox(name) {
    if (!world.boxes.has(name)) world.boxes.set(name, new Map());
    const box = world.boxes.get(name);
    return {
      async put(request, response) {
        box.set(fullAddress(request), response);
      },
      async match(request) {
        return box.get(fullAddress(request));
      },
      async keys() {
        return Array.from(box.keys());
      },
      async delete(request) {
        return box.delete(fullAddress(request));
      },
    };
  }

  const fakeCaches = {
    async open(name) {
      return openBox(name);
    },
    async keys() {
      return Array.from(world.boxes.keys());
    },
    async delete(name) {
      return world.boxes.delete(name);
    },
    async has(name) {
      return world.boxes.has(name);
    },
    async match(request) {
      for (const box of world.boxes.values()) {
        if (box.has(fullAddress(request))) return box.get(fullAddress(request));
      }
      return undefined;
    },
  };

  async function fakeFetch(input) {
    const request = input instanceof FakeRequest ? input : new FakeRequest(input);
    world.fetched.push(request.url);
    const plain = request.url.split("?")[0];
    if (deadUrls.includes(plain)) throw new TypeError("Failed to fetch (the fake network is down for this file)");
    if (brokenUrls.includes(plain)) return new FakeResponse("not found", { status: 404, url: request.url });
    return new FakeResponse("the bytes of " + plain, { status: 200, url: request.url });
  }

  const fakeSelf = {
    location: new URL(WORKER_URL),
    addEventListener(type, listener) {
      assert.equal(world.listeners[type], undefined, 'sw.js registered two "' + type + '" listeners.');
      world.listeners[type] = listener;
    },
    skipWaiting() {
      world.skipWaitingCalls += 1;
      return Promise.resolve();
    },
    clients: {
      claim() {
        world.claimCalls += 1;
        return Promise.resolve();
      },
    },
  };

  // Only these names exist inside the box. There is no `process`, no `require`,
  // no real network: if sw.js reached for anything else it would crash here.
  const context = vm.createContext({
    self: fakeSelf,
    caches: fakeCaches,
    fetch: fakeFetch,
    Request: FakeRequest,
    Response: FakeResponse,
    URL: URL,
  });
  vm.runInContext(SERVICE_WORKER_SOURCE, context, { filename: "sw.js" });

  // Top-level constants of sw.js can be read by running one more line in the
  // same box.
  world.cacheName = vm.runInContext("CACHE_NAME", context);
  world.precacheUrls = Array.from(vm.runInContext("PRECACHE_URLS", context));
  world.FakeResponse = FakeResponse;
  return world;
}

// Fire one event the way a browser would and wait for everything the worker
// promised to do. Returns whether it answered, and with what.
async function fire(world, type, eventFields = {}) {
  const listener = world.listeners[type];
  assert.equal(typeof listener, "function", 'sw.js has no "' + type + '" listener.');
  const waits = [];
  let answered = false;
  let answer;
  const event = {
    ...eventFields,
    waitUntil(promise) {
      waits.push(promise);
    },
    respondWith(promise) {
      assert.equal(answered, false, "sw.js called respondWith twice for one request.");
      answered = true;
      answer = promise;
    },
  };
  listener(event);
  await Promise.all(waits);
  return { answered: answered, response: answered ? await answer : undefined };
}

function getRequest(address) {
  return { request: { method: "GET", url: address } };
}

function plainAddressOf(relativeUrl) {
  return new URL(relativeUrl, WORKER_URL).href;
}

// A worker that has already been installed and activated.
async function startInstalledWorker(options) {
  const world = startWorker(options);
  await fire(world, "install");
  await fire(world, "activate");
  return world;
}

// ───────────────────────── install ─────────────────────────

test("sw.js registers exactly three listeners: install, activate, fetch (and no way for the page to hand it data)", () => {
  const world = startWorker();
  assert.deepEqual(Object.keys(world.listeners).sort(), ["activate", "fetch", "install"]);
});

test("install: every precache URL is fetched with the ?v=<CACHE_NAME> cache-buster, and nothing else is fetched", async () => {
  const world = startWorker();
  assert.ok(world.precacheUrls.length > 0, "PRECACHE_URLS is empty.");
  await fire(world, "install");

  const expected = [];
  for (const relativeUrl of world.precacheUrls) {
    expected.push(plainAddressOf(relativeUrl) + "?v=" + world.cacheName);
  }
  assert.deepEqual(
    world.fetched.slice().sort(),
    expected.sort(),
    "Install must fetch each file on the list exactly once, as <plain address>?v=<CACHE_NAME>."
  );
  assert.equal(world.skipWaitingCalls, 1, "install should call self.skipWaiting() once.");
});

test("install: each file is saved under its PLAIN address (no ?v=), in the box named CACHE_NAME", async () => {
  const world = startWorker();
  await fire(world, "install");

  assert.deepEqual(Array.from(world.boxes.keys()), [world.cacheName], "Install should create exactly one box, named CACHE_NAME.");
  const box = world.boxes.get(world.cacheName);
  const expectedKeys = world.precacheUrls.map(plainAddressOf).sort();
  assert.deepEqual(Array.from(box.keys()).sort(), expectedKeys);
  for (const key of box.keys()) {
    assert.ok(!key.includes("?"), "Saved under an address with a query string: " + key);
    // The saved response is the one that came from the ?v= download of the SAME file.
    assert.equal(box.get(key).url, key + "?v=" + world.cacheName);
  }
});

test("install: one missing file (a 404) makes the whole install fail", async () => {
  const world = startWorker({ brokenUrls: [SITE_FOLDER + "styles.css"] });
  await assert.rejects(fire(world, "install"), /styles\.css/, "A 404 on one file must reject the install, as addAll did.");
});

test("install: one unreachable file (the network is down) makes the whole install fail", async () => {
  const world = startWorker({ deadUrls: [SITE_FOLDER + "engine/index.js"] });
  await assert.rejects(fire(world, "install"));
});

// ───────────────────────── activate ─────────────────────────

test("activate: this site's old boxes are deleted, the current one stays, and open tabs are claimed", async () => {
  const world = startWorker();
  world.boxes.set("escrowscope-v1-2026-09-19a", new Map([["old", "old"]]));
  world.boxes.set("escrowscope-v1-000000000000", new Map());
  await fire(world, "install");
  await fire(world, "activate");

  const names = Array.from(world.boxes.keys());
  assert.ok(names.includes(world.cacheName), "The current box was deleted.");
  assert.ok(!names.includes("escrowscope-v1-2026-09-19a"), "An old box survived activate.");
  if (world.cacheName !== "escrowscope-v1-000000000000") {
    assert.ok(!names.includes("escrowscope-v1-000000000000"), "An old box survived activate.");
  }
  assert.equal(world.claimCalls, 1, "activate should call self.clients.claim() once.");
});

// GitHub Pages serves every project of one account from one origin, and the
// browser's Cache Storage is shared per origin. Deleting "every box that is not
// mine" would wipe another project's offline copy.
test("activate: a box that belongs to another project on the same origin is left alone", async () => {
  const world = startWorker();
  world.boxes.set("some-other-project-v3", new Map([["theirs", "theirs"]]));
  await fire(world, "install");
  await fire(world, "activate");
  assert.ok(world.boxes.has("some-other-project-v3"), "activate deleted a box that is not from this site.");
});

// ───────────────────────── fetch ─────────────────────────

test("fetch: opening the site's FOLDER (…/escrowscope/) is answered with the saved index.html, with no network", async () => {
  const world = await startInstalledWorker();
  const before = world.fetched.length;
  const result = await fire(world, "fetch", getRequest(SITE_FOLDER));
  assert.equal(result.answered, true, "A navigation to the site's folder was not answered, so the page would not open offline.");
  assert.equal(result.response, world.boxes.get(world.cacheName).get(SITE_FOLDER + "index.html"));
  assert.equal(world.fetched.length, before, "Answering from the saved copy must not touch the network.");
});

test("fetch: opening …/escrowscope/index.html is answered with the saved index.html", async () => {
  const world = await startInstalledWorker();
  const result = await fire(world, "fetch", getRequest(SITE_FOLDER + "index.html"));
  assert.equal(result.answered, true);
  assert.equal(result.response, world.boxes.get(world.cacheName).get(SITE_FOLDER + "index.html"));
});

// The site is four pages. Each one must open offline, however its address is
// written: plain, with ?nosw, with a #hash (./check.html#example-2 is how the
// landing page opens an example), and without its ending, the way GitHub Pages
// also serves it.
test("fetch: each of the four pages is answered from its own saved copy, with a query, with a #hash, and without .html", async () => {
  const world = await startInstalledWorker();
  const before = world.fetched.length;
  const saved = world.boxes.get(world.cacheName);
  for (const page of ["index.html", "check.html", "proof.html", "privacy.html"]) {
    assert.ok(world.precacheUrls.includes("./" + page), page + " is not on the list sw.js saves.");
    const wanted = saved.get(SITE_FOLDER + page);
    assert.ok(wanted, page + " was not saved.");
    const name = page.replace(/\.html$/, "");
    for (const address of [page, page + "?nosw", page + "#example-2", page + "?nosw#example-2", name, name + "?nosw"]) {
      const result = await fire(world, "fetch", getRequest(SITE_FOLDER + address));
      assert.equal(result.answered, true, address + " was not answered, so that page would not open offline.");
      assert.equal(result.response, wanted, address + " was answered with the wrong page.");
    }
  }
  assert.equal(world.fetched.length, before, "Answering from the saved copy must not touch the network.");
});

test("fetch: the address-without-.html rule only ever reaches a page on the list", async () => {
  const world = await startInstalledWorker();
  const before = world.fetched.length;
  for (const address of ["styles", "styles.css.html", "secret", "engine/index", "docs/SPEC", "check.html.html", "check/"]) {
    const result = await fire(world, "fetch", getRequest(SITE_FOLDER + address));
    assert.equal(result.answered, false, address + " is not a saved page and must be left to the browser.");
  }
  assert.equal(world.fetched.length, before);
});

test("fetch: a shell file asked for WITH a query string (or a #hash) is still answered from the saved copy", async () => {
  const world = await startInstalledWorker();
  const before = world.fetched.length;
  const saved = world.boxes.get(world.cacheName);

  const withQuery = await fire(world, "fetch", getRequest(SITE_FOLDER + "styles.css?x=1"));
  assert.equal(withQuery.answered, true);
  assert.equal(withQuery.response, saved.get(SITE_FOLDER + "styles.css"));

  const folderWithQuery = await fire(world, "fetch", getRequest(SITE_FOLDER + "?offline=1#results"));
  assert.equal(folderWithQuery.answered, true);
  assert.equal(folderWithQuery.response, saved.get(SITE_FOLDER + "index.html"));

  const nested = await fire(world, "fetch", getRequest(SITE_FOLDER + "engine/index.js"));
  assert.equal(nested.answered, true);
  assert.equal(nested.response, saved.get(SITE_FOLDER + "engine/index.js"));

  assert.equal(world.fetched.length, before, "Answering from the saved copy must not touch the network.");
});

test("fetch: every file on the list is answered once the worker is installed", async () => {
  const world = await startInstalledWorker();
  for (const relativeUrl of world.precacheUrls) {
    const result = await fire(world, "fetch", getRequest(plainAddressOf(relativeUrl)));
    assert.equal(result.answered, true, relativeUrl + " was not answered.");
    assert.ok(result.response && result.response.ok, relativeUrl + " was answered with nothing.");
  }
});

test("fetch: requests to another website are NEVER answered, and never cause a download", async () => {
  const world = await startInstalledWorker();
  const before = world.fetched.length;
  const elsewhere = [
    "https://evil.example/escrowscope/index.html",
    "https://evil.example/escrowscope/",
    "http://example.github.io/escrowscope/index.html", // same name, different scheme = different origin
    "https://example.github.io.evil.example/escrowscope/styles.css",
    "https://www.consumerfinance.gov/find-a-housing-counselor/",
  ];
  for (const address of elsewhere) {
    const result = await fire(world, "fetch", getRequest(address));
    assert.equal(result.answered, false, "The worker answered a request to another website: " + address);
  }
  assert.equal(world.fetched.length, before, "A cross-origin request made the worker download something.");
});

test("fetch: anything that is not a GET is NEVER answered", async () => {
  const world = await startInstalledWorker();
  const before = world.fetched.length;
  for (const method of ["POST", "PUT", "DELETE", "HEAD", "PATCH"]) {
    const result = await fire(world, "fetch", { request: { method: method, url: SITE_FOLDER + "index.html" } });
    assert.equal(result.answered, false, "The worker answered a " + method + " request.");
  }
  assert.equal(world.fetched.length, before);
});

test("fetch: same-origin files that are NOT on the list are left to the browser", async () => {
  const world = await startInstalledWorker();
  const before = world.fetched.length;
  const notShell = [
    SITE_FOLDER + "docs/SPEC.md",
    SITE_FOLDER + "tools/stamp-sw.mjs",
    SITE_FOLDER + "sw.js",
    SITE_FOLDER + "assets/logo.svg",
    SITE_ORIGIN + "/", // the account's own front page, outside this site's folder
    SITE_ORIGIN + "/another-project/index.html",
    SITE_ORIGIN + "/escrowscope", // no trailing slash: not the folder address
  ];
  for (const address of notShell) {
    const result = await fire(world, "fetch", getRequest(address));
    assert.equal(result.answered, false, "The worker answered for a file that is not on its list: " + address);
  }
  assert.equal(world.fetched.length, before);
});

test("fetch: when a saved copy has gone missing, the worker asks the network for the PLAIN address only (the query is left behind)", async () => {
  const world = await startInstalledWorker();
  world.boxes.get(world.cacheName).delete(SITE_FOLDER + "styles.css");
  const before = world.fetched.length;

  const result = await fire(world, "fetch", getRequest(SITE_FOLDER + "styles.css?balance=1200.00"));
  assert.equal(result.answered, true);
  assert.ok(result.response.ok);
  assert.deepEqual(world.fetched.slice(before), [SITE_FOLDER + "styles.css"]);
});

// ───────────────────────── the whole life of the worker ─────────────────────────

test("across install, activate and every kind of request, nothing is EVER fetched from another origin or from outside the site's folder", async () => {
  const world = await startInstalledWorker();
  // Empty the box, so every shell request below has to go to the network.
  world.boxes.get(world.cacheName).clear();

  const addresses = [
    SITE_FOLDER,
    SITE_FOLDER + "index.html?nosw",
    SITE_FOLDER + "check.js?next=https://evil.example/",
    SITE_FOLDER + "check.html?nosw#example-2",
    SITE_FOLDER + "privacy",
    "https://evil.example/collect?site=" + encodeURIComponent(SITE_FOLDER),
    SITE_ORIGIN + "/another-project/",
  ];
  for (const relativeUrl of world.precacheUrls) addresses.push(plainAddressOf(relativeUrl));
  for (const address of addresses) {
    await fire(world, "fetch", getRequest(address));
  }

  assert.ok(world.fetched.length > world.precacheUrls.length, "The fallback path was never exercised.");
  const allowedPlain = world.precacheUrls.map(plainAddressOf);
  for (const address of world.fetched) {
    const url = new URL(address);
    assert.equal(url.origin, SITE_ORIGIN, "The worker fetched from another origin: " + address);
    assert.ok(address.startsWith(SITE_FOLDER), "The worker fetched from outside the site's folder: " + address);
    assert.ok(allowedPlain.includes(url.origin + url.pathname), "The worker fetched a file that is not on its list: " + address);
    assert.ok(
      url.search === "" || url.search === "?v=" + world.cacheName,
      "The worker sent a query string other than its own ?v= cache-buster: " + address
    );
  }
});
