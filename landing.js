// landing.js — the script for the landing page (index.html). The landing page
// sells; the tool lives on check.html. So this file loads only what the landing
// page shows: the framed sample result, the big figures, and the three examples.
// It never loads the results drawer, the chart or the statement guide.
//
// Every number it puts on the page is worked out here, on this device, by the
// same calculator the tool uses. Nothing is typed in by hand.

import { el } from "./dom.js";
import { EXAMPLES } from "./examples.js";
import { formatCents, VECTORS, runSelfCheck } from "./engine/index.js";
import { buildTabs } from "./tabs.js";
import { initHeroPreview } from "./preview.js";
import { watchRequestCount } from "./proof.js";
import { initSite } from "./site.js";

function byId(id) {
  return document.getElementById(id);
}

// ─────────────────────────── the big figures ───────────────────────────

// The worked cases: counted by running every one of them on this device, right
// now. If a case ever failed, the band would say so, with the real count. The
// motion layer reads data-count-to, so it is set here together with the text.
function showSelfCheckFigure() {
  const passedNode = byId("figure-passed");
  const totalNode = byId("figure-total");
  if (!passedNode || !totalNode) return;
  const report = runSelfCheck(VECTORS);
  passedNode.textContent = String(report.passed);
  passedNode.setAttribute("data-count-to", String(report.passed));
  totalNode.textContent = String(report.total);
}

// "0 requests": a live reading from the browser's own log, the same one the
// privacy page shows in full. If the log ever shows a request, this shows it.
function showRequestsFigure() {
  const node = byId("figure-requests");
  if (!node) return;
  watchRequestCount(function (count) {
    if (count === null) {
      node.textContent = "–";
      node.removeAttribute("data-count-to");
      byId("figure-requests-label").textContent =
        "This browser does not share its network log with pages, so this count cannot run here. The rule that blocks background connections still applies.";
      return;
    }
    node.textContent = String(count);
    node.setAttribute("data-count-to", String(count));
  });
}

// ─────────────────────────── the three examples ───────────────────────────

const CLAIMED_KIND_WORDS = { shortage: "A shortage of ", surplus: "A surplus of ", deficiency: "A deficiency of " };

// The numbers this example's statement carries, as a small slip. Every figure
// comes straight from examples.js, so the slip and the tool can never disagree.
function exampleSlip(example) {
  let billsCents = 0;
  for (const bill of example.account.disbursements) billsCents += bill.amountCents;
  const rows = [
    ["Current escrow payment", formatCents(example.statement.currentMonthlyEscrowCents)],
    ["New escrow payment", formatCents(example.statement.newMonthlyEscrowCents)],
    ["Escrow balance at the start", formatCents(example.account.startingBalanceCents)],
    ["Required minimum balance", formatCents(example.statement.requiredMinimumBalanceCents)],
    ["Bills for the next 12 months", formatCents(billsCents)],
  ];
  const kindWords = CLAIMED_KIND_WORDS[example.statement.claimedKind];
  const list = el("dl", { className: "example-slip-rows" });
  for (const row of rows) {
    list.append(el("div", { className: "example-slip-row" }, [el("dt", { text: row[0] }), el("dd", { text: row[1] })]));
  }
  if (kindWords) {
    list.append(
      el("div", { className: "example-slip-row is-total" }, [
        el("dt", { text: "The statement says there is" }),
        el("dd", { text: kindWords + formatCents(example.statement.claimedAmountCents) }),
      ])
    );
  }
  return el("div", { className: "example-slip" }, [
    el("p", { className: "example-slip-title", text: "What this example’s statement says" }),
    list,
  ]);
}

// Choosing a tab only SHOWS that example. Its button is a plain link to the
// tool, which opens with the example filled in and checked (check.js reads the
// "#example-2" on the end of the address).
function buildExampleTabs() {
  const items = EXAMPLES.map(function (example, index) {
    const openLink = el("a", {
      className: "btn btn-primary example-run",
      text: "Open this example in the tool",
      // The same shape example-link.js reads back on check.html.
      attrs: { href: "./check.html#example-" + (index + 1) },
    });
    const words = el("div", { className: "tab-panel-text" }, [
      el("p", { className: "eyebrow", text: "Example " + (index + 1) }),
      el("h3", { className: "example-title", text: example.title }),
      el("p", { className: "example-blurb", text: example.blurb }),
      openLink,
    ]);
    return { label: example.tab, content: [words, exampleSlip(example)] };
  });
  buildTabs({ holder: byId("example-buttons"), labelledBy: "examples-heading", idPrefix: "example", items: items });
}

// ─────────────────────────── start ───────────────────────────

function start() {
  initSite();
  buildExampleTabs();
  initHeroPreview(byId("hero-preview"));
  showSelfCheckFigure();
  showRequestsFigure();
}

start();
