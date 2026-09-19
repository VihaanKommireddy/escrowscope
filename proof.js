// proof.js — the privacy proof panel (SPEC A4: "provable, not promised").
//
// The panel shows one live number: how many files this page has asked for since
// it finished loading. Checking the math needs nothing from the internet, so the
// number should sit at 0 no matter what the visitor types or presses.
//
// Where the number comes from: every browser keeps its own performance log of
// the files a page requests. This file only READS that log. It never makes a
// request of its own (that would spoil the very thing it measures).
//
// Screen readers: the number is NOT a live region, on purpose. A counter that
// announced itself would chatter. Only the line under the "Count again" button
// speaks, and only because the visitor pressed that button.

import { el, svgEl, clear } from "./dom.js";

// ---------- reading the browser's log ----------

// Very old browsers have no performance log. Then we say so instead of guessing.
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

// "https://example.org/folder/logo.svg?x=1" becomes "logo.svg?x=1". The query
// part stays in, so the visitor sees everything that was part of the request.
function describeRequest(entry) {
  let url;
  try {
    url = new URL(entry.name);
  } catch (error) {
    return String(entry.name);
  }
  const segments = url.pathname.split("/");
  let fileName = segments[segments.length - 1];
  if (fileName === "") {
    fileName = "(the page itself)";
  }
  let description = fileName + url.search;
  if (url.origin !== window.location.origin) {
    description = description + " (from " + url.host + ")";
  }
  return description;
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

// ---------- the panel ----------

export function initProofPanel(container) {
  clear(container);

  // The meter: label, big number, state line, list of requests, button.
  const label = el("p", {
    className: "proof-label",
    text: "Network requests since this page finished loading:",
    attrs: { id: "proof-count-label" },
  });
  const countNode = el("p", { className: "proof-count num", text: "–" });
  const stateNode = el("p", { className: "proof-state" });
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
      listIntro,
      listNode,
      el("div", { className: "proof-actions" }, [recountButton, recountNote]),
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
      el("p", {
        text:
          "The log only covers this page. It cannot see other tabs, other apps, or browser extensions " +
          "you have installed.",
      }),
      el("p", {
        text:
          "One more thing, so nothing is left out: on your first visit, your browser saves a copy of this " +
          "site’s own files in the background so the page can work offline. On later visits it checks " +
          "whether those files have changed. Both steps download this site’s files. Neither one sends " +
          "anything you type.",
      }),
    ]),
    explainer("The stronger guarantee", [
      el("p", {}, [
        "A counter can only report what it sees. The stronger protection is a rule written near the top " +
          "of this page’s code, called a Content-Security-Policy. It includes the line ",
        el("code", { className: "proof-code", text: "connect-src 'none'" }),
        ". In plain words: the browser itself refuses any connection this page tries to open. Even if this " +
          "page’s code tried to send your numbers somewhere, the browser would block it.",
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
          "Turn on airplane mode (or switch off wifi), then type new numbers and press Check the math. " +
          "It still works, because nothing needs the internet.",
      }),
    ]),
  ]);

  container.append(el("div", { className: "proof" }, [meter, notes]));

  // No performance log in this browser: say so plainly and stop.
  if (!browserHasPerformanceLog()) {
    stateNode.replaceChildren(
      icon("info"),
      el("span", {
        text:
          "This browser does not share its network log with pages, so this counter cannot run here. " +
          "The rule described under “The stronger guarantee” still applies.",
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
      stateNode.replaceChildren(icon("check"), el("span", { text: "0: nothing has been sent or fetched" }));
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
        text: sentence + " Asking for a file is a download. It is not the same as sending your numbers.",
      })
    );
    for (const request of requests) {
      let line = describeRequest(request);
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
