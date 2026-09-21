// sw-register.js — turns on the offline copy (SPEC A5).
//
// A "service worker" is a small script the browser keeps next to the page. This
// site's worker (sw.js) saves a copy of this site's own files, so in most
// browsers the page opens after one visit even with the wifi off.
//
// The offline copy is a bonus, never a blocker: if anything here fails, the page
// still works exactly the same while you are online. So errors are swallowed.
//
// The ?nosw switch, for anyone testing the site: open the page with ?nosw on the
// end of its address (for example localhost:4173/?nosw) and this file does the
// opposite of its normal job. It registers nothing and it removes the
// worker that is already there. Why: sw.js hands back SAVED files first, so
// after a file is edited a tester could be looking at the old copy without
// knowing it. There is deliberately NO special case for localhost: the offline
// copy has to be testable on the owner's own computer too.

// The path is relative ("./sw.js") so it also works when the site lives in a
// sub-folder, like GitHub Pages' /escrowscope/.
const SERVICE_WORKER_URL = "./sw.js";
const SERVICE_WORKER_SCOPE = "./";

// ---------- telling the privacy panel ----------

// The privacy panel (proof.js) shows an "Offline copy" line. It asks to be told
// whenever the worker's state may have changed, so that line never goes stale.
const changeListeners = [];

export function onServiceWorkerChange(callback) {
  changeListeners.push(callback);
}

function tellListeners() {
  for (const callback of changeListeners) {
    callback();
  }
}

// ---------- the ?nosw switch ----------

// Does this address carry the switch? `search` is the "?…" part of the page
// address. It is a plain function of its input so it can be tested in Node.
export function addressSaysNoServiceWorker(search) {
  const params = new URLSearchParams(String(search));
  return params.has("nosw");
}

// The same question, asked about the page that is open right now.
export function serviceWorkerSwitchedOff() {
  return addressSaysNoServiceWorker(window.location.search);
}

// How was this page opened? The browser keeps that in its own navigation entry:
// "navigate" for a typed address or a link, "reload" for a reload.
function pageWasOpenedByReload() {
  if (typeof performance === "undefined") return false;
  if (typeof performance.getEntriesByType !== "function") return false;
  const navigationEntries = performance.getEntriesByType("navigation");
  if (navigationEntries.length === 0) return false;
  return navigationEntries[0].type === "reload";
}

// If a worker was already answering for this page when it opened, the files on
// screen came from its SAVED copy and may be old. Removing the worker only takes
// effect on the next load, so load the page once more, straight from the site.
// The guard: a page that is itself the result of a reload is never reloaded
// again, so this cannot loop. Nothing has to be stored to know that.
function reloadOnceIfWorkerAnsweredThisLoad() {
  if (!navigator.serviceWorker.controller) return;
  if (pageWasOpenedByReload()) return;
  window.location.reload();
}

function unregister() {
  navigator.serviceWorker
    .getRegistration(SERVICE_WORKER_SCOPE)
    .then((registration) => {
      if (!registration) return false;
      return registration.unregister();
    })
    .then(() => {
      tellListeners();
      reloadOnceIfWorkerAnsweredThisLoad();
    })
    .catch(() => {
      // Nothing to remove, or the browser refused. Either way nothing is
      // registered by this visit.
      tellListeners();
    });
}

// ---------- the normal path ----------

function register() {
  navigator.serviceWorker
    .register(SERVICE_WORKER_URL, { scope: SERVICE_WORKER_SCOPE })
    .then((registration) => {
      tellListeners();
      // A worker that is still saving the files reports every step it takes
      // ("installing", "installed", "activating", "activated").
      if (registration.installing) {
        registration.installing.addEventListener("statechange", tellListeners);
      }
    })
    .catch(() => {
      // Private windows and some locked-down browsers refuse service workers.
      // That is fine. The page just will not open offline there.
      tellListeners();
    });
}

// app.js calls this once when the page starts.
export function registerServiceWorker() {
  // Old browsers do not have service workers at all. Nothing to do.
  if (!("serviceWorker" in navigator)) return;

  if (serviceWorkerSwitchedOff()) {
    unregister();
    return;
  }

  // Wait until the page has finished loading, so saving the offline copy never
  // slows down the first paint.
  if (document.readyState === "complete") {
    register();
  } else {
    window.addEventListener("load", register, { once: true });
  }
}
