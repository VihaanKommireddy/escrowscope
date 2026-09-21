// proof.js — the privacy proof panel (SPEC A4: "provable, not promised").
//
// The panel shows one live number: how many files this page has asked for since
// it finished loading. Checking the math needs nothing from the internet, so the
// number should sit at 0 whatever the visitor types or presses.
//
// Where the number comes from: every browser keeps its own performance log of
// the files a page requests. This file only READS that log. It never makes a
// request of its own (that would spoil the very thing it measures).
//
// What the number does NOT prove, and the panel says so in plain words: the log
// covers this page only. It does not list the service worker's background
// downloads of this site's own files, a link the visitor clicks, a new window,
// the browser's own probes, or anything after the log is full. Every sentence in
// this file is meant to claim exactly what the mechanism shows and no more.
//
// Screen readers: the number is NOT a live region, on purpose. A counter that
// announced itself would chatter. The "Offline copy" line is not one either.
// Only the line under the "Count again" button speaks, and only because the
// visitor pressed that button.

import { el, svgEl, clear } from "./dom.js";
import { onServiceWorkerChange, serviceWorkerSwitchedOff } from "./sw-register.js";

// ---------- reading the browser's log ----------

// Very old browsers have no performance log. Then the panel says so instead of
// guessing.
function browserHasPerformanceLog() {
  if (typeof performance === "undefined") return false;
  return typeof performance.getEntriesByType === "function";
}

// The moment the page finished loading, in milliseconds since it started.
// The browser fills this in only after the "load" event has ended; until then
// it is 0.
function readLoadFinishedTime() {
  const navigationEntries = performance.getEntriesByType("navigation");
  if (navigationEntries.length === 0) return 0;
  return navigationEntries[0].loadEventEnd;
}

// Run `callback` once the page has finished loading.
function whenLoadFinished(callback) {
  if (readLoadFinishedTime() > 0) {
    callback();
    return;
  }
  // One tick after the "load" event, so the browser has written loadEventEnd.
  function afterOneTick() {
    setTimeout(callback, 0);
  }
  if (document.readyState === "complete") {
    afterOneTick();
  } else {
    window.addEventListener("load", afterOneTick, { once: true });
  }
}

// Every file this page asked for AFTER it finished loading.
function readRequestsSinceLoad(loadFinishedAt) {
  const requests = [];
  for (const entry of performance.getEntriesByType("resource")) {
    if (entry.startTime > loadFinishedAt) {
      requests.push(entry);
    }
  }
  return requests;
}

// The address of one request, written out in full. A request to this site loses
// only the site's own name from the front ("/escrowscope/styles.css?x=1"); a
// request to any other site keeps everything. Nothing is shortened, because the
// point of the list is that the visitor can see every part of what was asked for.
export function describeRequest(entry, pageOrigin) {
  let url;
  try {
    url = new URL(entry.name);
  } catch (error) {
    return String(entry.name);
  }
  if (url.origin === pageOrigin) {
    return url.pathname + url.search;
  }
  return url.href;
}

// Is this request the small picture shown in the browser tab? Some browsers ask
// for it by themselves right after a page loads and log it like any other file.
// If that ever shows up in the list, the visitor deserves to know what it is.
function isTabIconRequest(entry) {
  for (const link of document.querySelectorAll("link[rel~='icon']")) {
    if (link.href === entry.name) return true;
  }
  return false;
}

// Tell `onChange` whenever the browser logs a new request, so the number stays
// live without anyone pressing anything.
function watchForNewRequests(onChange) {
  if (typeof PerformanceObserver === "undefined") return;
  function handleEntries() {
    onChange();
  }
  try {
    const observer = new PerformanceObserver(handleEntries);
    observer.observe({ type: "resource", buffered: true });
  } catch (error) {
    // Older browsers only understand the older option name.
    try {
      const olderObserver = new PerformanceObserver(handleEntries);
      olderObserver.observe({ entryTypes: ["resource"] });
    } catch (secondError) {
      // No live updates here. The "Count again" button still works.
    }
  }
}

// ---------- small drawing helpers ----------

// A 24px line icon. The words next to it always carry the meaning, so the icon
// itself is hidden from screen readers.
function icon(kind) {
  const shapes = [svgEl("circle", { attrs: { cx: 12, cy: 12, r: 9.25 } })];
  if (kind === "check") {
    shapes.push(svgEl("path", { attrs: { d: "M7.5 12.4l3.1 3.1 5.9-6.6" } }));
  } else {
    // "info": a lowercase i
    shapes.push(svgEl("path", { attrs: { d: "M12 11v5.5" } }));
    shapes.push(svgEl("path", { attrs: { d: "M12 7.6v0.1" } }));
  }
  return svgEl(
    "svg",
    {
      className: "trust-icon",
      attrs: { viewBox: "0 0 24 24", width: 24, height: 24, "aria-hidden": "true", focusable: "false" },
    },
    shapes
  );
}

function explainer(title, paragraphs) {
  const block = el("div", { className: "proof-note" }, [el("h3", { className: "proof-note-title", text: title })]);
  for (const paragraph of paragraphs) {
    block.append(paragraph);
  }
  return block;
}

function bulletList(sentences) {
  const list = el("ul", { className: "proof-note-list" });
  for (const sentence of sentences) {
    list.append(el("li", { text: sentence }));
  }
  return list;
}

// ---------- the words on the meter ----------

// tests/shell.test.js checks that these two lines are in this file word for
// word. They were rewritten after an independent audit: the old zero line said
// more than a page's own request log can show.
const COUNT_LABEL = "Requests made by this page since it finished loading";
const ZERO_LINE = "0: this page has not asked the network for anything since it loaded";

// The one kind of download the number cannot see. It sits directly under the
// number, so nobody reads the 0 without it.
const BACKGROUND_COPY_SENTENCE =
  "Not in this count: the first time you visit, your browser saves a copy of this site’s own files in the " +
  "background, so the page can open offline. On later visits it checks whether those files have changed. " +
  "Both steps download this site’s files. Neither one sends anything you type.";

// ---------- the "Offline copy" line ----------

// Page code is not allowed to open the browser's saved-files box (only sw.js
// may; the shell test enforces it). So this line reads the STATE of the service
// worker instead, and the panel says that this is what it reads.
//
// `registration` is what navigator.serviceWorker.getRegistration() gave back
// (undefined when nothing is registered). A worker only becomes "active" after
// every file on its list was saved, which is why "active" can be read as "saved".
// A plain function of its inputs, so it can be tested in Node.
export function offlineCopyState(registration, pageHasController) {
  if (!registration) return "none";
  if (registration.active) {
    return pageHasController ? "saved" : "saved-for-next-load";
  }
  if (registration.installing || registration.waiting) return "saving";
  return "none";
}

const OFFLINE_COPY_SENTENCES = {
  checking: "Offline copy: checking.",
  saved: "Offline copy: saved (a service worker is active for this page).",
  "saved-for-next-load":
    "Offline copy: saved (a service worker is installed; it starts answering for this page the next time " +
    "the page loads).",
  saving: "Offline copy: being saved (your browser is downloading this site’s own files in the background).",
  none:
    "Offline copy: not saved (this browser refused or does not support it; the page still works while you " +
    "are online).",
  off:
    "Offline copy: switched off for this visit, because the page address has ?nosw in it. Nothing is being " +
    "saved, and the service worker from an earlier visit is removed, so its saved files are no longer used.",
};

export function offlineCopySentence(state) {
  if (OFFLINE_COPY_SENTENCES[state] === undefined) return OFFLINE_COPY_SENTENCES.none;
  return OFFLINE_COPY_SENTENCES[state];
}

// Keep the "Offline copy" line in step with the service worker.
function watchOfflineCopy(lineNode) {
  function show(state) {
    lineNode.textContent = offlineCopySentence(state);
  }

  if (!("serviceWorker" in navigator)) {
    show("none");
    return;
  }
  if (serviceWorkerSwitchedOff()) {
    show("off");
    return;
  }

  // On a first visit nothing is registered for the first second or so, because
  // sw-register.js waits for the page to finish loading. "Not saved" would be
  // the wrong thing to say before it has even tried.
  let registerHasTried = false;

  function refresh() {
    navigator.serviceWorker
      .getRegistration()
      .then((registration) => {
        const state = offlineCopyState(registration, Boolean(navigator.serviceWorker.controller));
        if (state === "none" && !registerHasTried) {
          show("checking");
        } else {
          show(state);
        }
      })
      .catch(() => {
        show("none");
      });
  }

  show("checking");
  refresh();
  // sw-register.js calls this when registering worked, when it failed, and at
  // every step the new worker takes while it saves the files.
  onServiceWorkerChange(() => {
    registerHasTried = true;
    refresh();
  });
  // The browser fires this when a worker starts answering for this page.
  navigator.serviceWorker.addEventListener("controllerchange", refresh);
}

// ---------- the panel ----------

export function initProofPanel(container) {
  clear(container);

  // The meter: label, big number, state line, the note about the background
  // copy, the "Offline copy" line, the list of requests, the button.
  const label = el("p", {
    className: "proof-label",
    text: COUNT_LABEL,
    attrs: { id: "proof-count-label" },
  });
  const countNode = el("p", { className: "proof-count num", text: "–" });
  const stateNode = el("p", { className: "proof-state" });
  const backgroundCopyNote = el("p", { className: "proof-under small", text: BACKGROUND_COPY_SENTENCE });
  // Deliberately NOT a live region: it changes by itself a moment after the page
  // opens, and a screen reader should not be interrupted by that.
  const offlineCopyLine = el("p", { className: "proof-offline", text: offlineCopySentence("checking") });
  const offlineCopyNote = el("p", {
    className: "proof-under small",
    text:
      "That line reads the state of the service worker, the small script that keeps the saved copy. It does " +
      "not look inside the saved files. With a saved copy, this page opens with the internet off in most " +
      "browsers. After this site is updated, a returning visitor sees the old version for one more visit, " +
      "while the browser saves the new files in the background.",
  });
  const listIntro = el("p", {
    className: "proof-list-intro small",
    text: "Here is exactly what was requested:",
    attrs: { hidden: true },
  });
  const listNode = el("ul", { className: "proof-list", attrs: { hidden: true } });
  const recountButton = el("button", {
    className: "btn btn-secondary proof-recount",
    text: "Count again",
    attrs: { type: "button" },
  });
  // The one line in this panel that talks to screen readers. It changes only
  // when the visitor presses "Count again".
  const recountNote = el("p", { className: "proof-recount-note small muted", attrs: { role: "status" } });

  const meter = el(
    "div",
    { className: "proof-meter", attrs: { role: "group", "aria-labelledby": "proof-count-label" } },
    [
      el("span", { className: "eyebrow", text: "Live reading from your browser" }),
      label,
      countNode,
      el("div", { className: "proof-ticks", attrs: { "aria-hidden": "true" } }),
      stateNode,
      backgroundCopyNote,
      listIntro,
      listNode,
      el("div", { className: "proof-actions" }, [recountButton, recountNote]),
      el("div", { className: "proof-offline-block" }, [offlineCopyLine, offlineCopyNote]),
    ]
  );

  // The explanations: what it measures, what it cannot, the stronger rule, and
  // a test the visitor can run without trusting any of this.
  const notes = el("div", { className: "proof-notes" }, [
    explainer("What this number is", [
      el("p", {
        text:
          "Your browser keeps its own log of every file a page asks for. This panel reads that log " +
          "and counts the files this page asked for after it finished loading. Checking your numbers " +
          "needs nothing from the internet, so the count should stay at 0 whatever you type or press.",
      }),
    ]),
    explainer("What it cannot see", [
      el("p", { text: "The log covers background requests made by this page, and nothing else. It cannot see:" }),
      bulletList([
        "Other tabs, other apps, or browser extensions you have installed.",
        "A link you click that opens another website, or a new window. Opening a page is not a background " +
          "request, so the log does not list it.",
        "Anything that happens after the browser’s log is full. It holds about 250 entries.",
        "The browser’s own probes, such as looking for a tab icon. Some browsers log those and some do not.",
        "The service worker’s own downloads: the background copy of this site’s files described under the number.",
      ]),
    ]),
    explainer("The stronger protection", [
      el("p", {}, [
        "The stronger protection is a rule near the top of this page’s code, called a " +
          "Content-Security-Policy. It includes the line ",
        el("code", { className: "proof-code", text: "connect-src 'none'" }),
        ". In plain words: your browser blocks this page from making background connections to any website. " +
          "That is the way pages normally send data out without you noticing. It does not stop a link you " +
          "click from opening another site, and it cannot stop this site’s own files from being downloaded. " +
          "The code on this page never puts your numbers into either of those, and the code is open for " +
          "anyone to read.",
      ]),
      el("p", {}, [
        "You can confirm it. Right-click the page, choose View Page Source, and look for ",
        el("code", { className: "proof-code", text: "connect-src 'none'" }),
        " near the top.",
      ]),
    ]),
    explainer("Test it yourself", [
      el("p", {
        text:
          "With this page open, turn on airplane mode (or switch off wifi). Then type new numbers and press " +
          "Check the math. It still works, because checking your numbers needs nothing from the internet.",
      }),
    ]),
  ]);

  container.append(el("div", { className: "proof" }, [meter, notes]));

  // The "Offline copy" line does not depend on the performance log.
  watchOfflineCopy(offlineCopyLine);

  // No performance log in this browser: say so plainly and stop.
  if (!browserHasPerformanceLog()) {
    stateNode.replaceChildren(
      icon("info"),
      el("span", {
        text:
          "This browser does not share its network log with pages, so this counter cannot run here. " +
          "The rule described under “The stronger protection” still applies.",
      })
    );
    recountButton.disabled = true;
    return;
  }

  // Filled in once the page has finished loading.
  let loadFinishedAt = null;

  function showWaiting() {
    countNode.textContent = "–";
    stateNode.replaceChildren(icon("info"), el("span", { text: "Waiting for the page to finish loading." }));
  }

  // Read the log and redraw. Returns the count, or null while still loading.
  function readAndShow() {
    if (loadFinishedAt === null) {
      showWaiting();
      return null;
    }
    const requests = readRequestsSinceLoad(loadFinishedAt);
    const count = requests.length;
    countNode.textContent = String(count);
    meter.classList.toggle("has-requests", count > 0);

    clear(listNode);
    if (count === 0) {
      stateNode.replaceChildren(icon("check"), el("span", { text: ZERO_LINE }));
      listIntro.hidden = true;
      listNode.hidden = true;
      return count;
    }

    const sentence =
      count === 1
        ? "1: this page asked for 1 file after it finished loading."
        : count + ": this page asked for " + count + " files after it finished loading.";
    stateNode.replaceChildren(
      icon("info"),
      el("span", {
        text:
          sentence +
          " Asking for a file is a download. Each address is listed in full below, so you can check that " +
          "none of them carries your numbers.",
      })
    );
    for (const request of requests) {
      let line = describeRequest(request, window.location.origin);
      if (isTabIconRequest(request)) {
        line = line + " (the small icon in your browser tab; the browser asks for it by itself)";
      }
      listNode.append(el("li", { className: "num", text: line }));
    }
    listIntro.hidden = false;
    listNode.hidden = false;
    return count;
  }

  recountButton.addEventListener("click", () => {
    const count = readAndShow();
    const time = new Date().toLocaleTimeString();
    if (count === null) {
      recountNote.textContent = "The page is still loading. Try again in a moment.";
    } else if (count === 1) {
      recountNote.textContent = "Counted again at " + time + ". The count is 1 request.";
    } else {
      recountNote.textContent = "Counted again at " + time + ". The count is " + count + " requests.";
    }
  });

  showWaiting();
  whenLoadFinished(() => {
    loadFinishedAt = readLoadFinishedTime();
    if (!(loadFinishedAt > 0)) {
      // A browser that never fills in loadEventEnd: count from this moment.
      loadFinishedAt = performance.now();
    }
    readAndShow();
    watchForNewRequests(readAndShow);
  });
}
