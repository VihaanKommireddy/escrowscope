// sw-register.js — turns on offline support (SPEC A5).
//
// A "service worker" is a small script the browser keeps next to the page. Ours
// (sw.js) saves a copy of this site's own files, so after one visit the page
// opens even with the wifi off.
//
// Offline support is a bonus, never a blocker: if anything here fails, the page
// still works exactly the same while you are online. So errors are swallowed.

// The path is relative ("./sw.js") so it also works when the site lives in a
// sub-folder, like GitHub Pages' /escrowscope/.
const SERVICE_WORKER_URL = "./sw.js";
const SERVICE_WORKER_SCOPE = "./";

function register() {
  navigator.serviceWorker
    .register(SERVICE_WORKER_URL, { scope: SERVICE_WORKER_SCOPE })
    .catch(() => {
      // Private windows and some locked-down browsers refuse service workers.
      // That is fine. The page just will not work offline there.
    });
}

// app.js calls this once when the page starts.
export function registerServiceWorker() {
  // Old browsers do not have service workers at all. Nothing to do.
  if (!("serviceWorker" in navigator)) return;

  // Wait until the page has finished loading, so saving the offline copy never
  // slows down the first paint.
  if (document.readyState === "complete") {
    register();
  } else {
    window.addEventListener("load", register, { once: true });
  }
}
