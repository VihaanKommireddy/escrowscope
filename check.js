// check.js — the script for check.html, the tool. (It was app.js while the whole
// site was one page.) DOM wiring only: read the form → pipeline.runCheck →
// render. No math lives here. Everything about dollars, months and the federal
// rule is behind pipeline.js (which calls the engine), so Node can test that
// same path.
//
// The form is four short steps and the result is six tabs. Both rows of tabs are
// written in check.html; this file wires them up with tabs.js. Every box keeps
// the id it always had, so reading the form, showing errors and the sample
// statement all work exactly as they did on one long page.
//
// Every module the page will ever need is imported right here, up front. There
// is no lazy loading anywhere, which is what keeps the "requests since load"
// counter under the form honestly at 0 whatever gets clicked (SPEC D1).

import { el, clear } from "./dom.js";
import { EXAMPLES } from "./examples.js";
import { MONTH_NAMES } from "./engine/index.js";
import {
  BILL_KINDS,
  MAX_BILL_ROWS,
  MAX_BILL_NAME_LENGTH,
  MAX_FILE_CHARACTERS,
  emptyValues,
  emptyBill,
  exampleToValues,
  runCheck,
  billsTotal,
  looksUnfinished,
  valuesToFileText,
  fileTextToValues,
} from "./pipeline.js";
import {
  renderResults,
  renderLetterOnly,
  announceVerdict,
  announceStale,
  setStale,
  flashVerdict,
} from "./render.js";
import { initGuide, renumberBoxes } from "./guide.js";
import { initRequestLine } from "./proof.js";
import { wireTabs } from "./tabs.js";
import { initSite } from "./site.js";
import { exampleNumberFromHash } from "./example-link.js";

const LIVE_EDIT_DELAY_MS = 250;

function byId(id) {
  return document.getElementById(id);
}

// ─────────────────────────── when something breaks ───────────────────────────
// check.html carries a plain paragraph ("If the buttons on this page do
// nothing…"). start() hides it as its very last line, so it stays visible if
// start-up never finishes. These two listeners bring it back if anything
// throws later on. They are registered first, before anything else can fail.

function showPageProblem() {
  const note = byId("page-problem");
  if (!note) return;
  note.hidden = false;
  note.classList.add("is-shown");
}

window.addEventListener("error", showPageProblem);
window.addEventListener("unhandledrejection", showPageProblem);

const form = byId("escrow-form");
const billRows = byId("bill-rows");

// Page state. It lives in memory only and is gone when the tab closes.
let hasCheckedOnce = false; // live what-if starts after the first good check
let lastGoodCheck = null;
let nextBillNumber = 1; // keeps ids unique even after rows are removed
let liveEditTimer = null;
let letterWasEdited = false; // once true, live what-if stops rewriting the letter
let valuesBeforeClear = null; // what "Put my numbers back" restores
let pageIsFramed = false;

// ─────────────────────────── small helpers ───────────────────────────

function fillMonthOptions(select, placeholder) {
  clear(select);
  select.append(el("option", { text: placeholder, attrs: { value: "" } }));
  MONTH_NAMES.forEach(function (name, index) {
    select.append(el("option", { text: name, attrs: { value: String(index + 1) } }));
  });
}

function todayInWords() {
  const now = new Date();
  return MONTH_NAMES[now.getMonth()] + " " + now.getDate() + ", " + now.getFullYear();
}

// SPEC B2: the first month defaults to next month, because a statement usually
// arrives shortly before its new 12 months begin. The visitor can change it.
function nextCalendarMonth() {
  const thisMonth = new Date().getMonth() + 1; // 1..12
  return String(thisMonth === 12 ? 1 : thisMonth + 1);
}

function blankFormValues() {
  const values = emptyValues();
  values.startMonth = nextCalendarMonth();
  return values;
}

// Jumps to the error box and to the verdict are instant, never animated. That
// respects "reduce motion" for everyone, and an animated scroll can stall when
// a tab is in the background, which would leave the result out of sight.
// ("instant" and not "auto": "auto" would hand the choice back to the CSS,
// which asks for smooth scrolling on in-page links.)
function scrollBehavior() {
  return "instant";
}

// ─────────────────────────── the four steps, the six result tabs ───────────────────────────
// Both rows of tabs are plain HTML in check.html. wireTabs (tabs.js) gives them
// the keyboard rules: one Tab stop, arrow keys, Home and End.

let stepTabs = null;
let resultTabs = null;

function wireTabRow(listSelector, tabSelector, panelSelector, onSelect) {
  const list = document.querySelector(listSelector);
  const tabs = Array.from(list.querySelectorAll(tabSelector));
  const panels = tabs.map(function (tab) {
    return byId(tab.getAttribute("aria-controls"));
  });
  if (document.querySelectorAll(panelSelector).length !== panels.length) {
    throw new Error("check.html: the tabs and their panels do not line up");
  }
  return wireTabs({ list: list, tabs: tabs, panels: panels, onSelect: onSelect });
}

// Back is hidden on the first step and Next on the last. "Check the math" is
// always there.
function syncStepButtons(index) {
  byId("step-back").hidden = index === 0;
  byId("step-next").hidden = index === stepTabs.tabs.length - 1;
}

// Which step holds this box? -1 for a box that sits outside the steps (the
// "More" section under them).
function stepIndexOf(node) {
  const panel = node.closest(".step-panel");
  return panel ? stepTabs.panels.indexOf(panel) : -1;
}

// Bring the step that holds `node` forward, so the box can be seen and focused.
function revealBox(node) {
  if (!node || !stepTabs) return;
  const index = stepIndexOf(node);
  if (index !== -1 && index !== stepTabs.selectedIndex()) stepTabs.select(index, false);
}

// Back / Next: show the step and move focus to its heading, so a screen reader
// says "Step 2 of 4, Your balance" and a keyboard user starts at the top of it.
function goToStep(index) {
  if (index < 0 || index >= stepTabs.tabs.length) return;
  stepTabs.select(index, false);
  const heading = byId("step-heading-" + (index + 1));
  heading.scrollIntoView({ behavior: scrollBehavior(), block: "nearest" });
  heading.focus({ preventScroll: true });
}

// A small mark on the tab of every step that has a box to fix. The words are
// for screen readers; the dot (site.css) is for everyone else.
function markStepsWithErrors(indexes) {
  stepTabs.tabs.forEach(function (tab, index) {
    const hasError = indexes.includes(index);
    tab.classList.toggle("has-error", hasError);
    tab.querySelector(".step-tab-flag").textContent = hasError ? " (has a box to fix)" : "";
  });
}

// ─────────────────────────── bill rows ───────────────────────────

function billRowElements() {
  return Array.from(billRows.querySelectorAll(".bill-row"));
}

function renumberBillRows() {
  const rows = billRowElements();
  rows.forEach(function (row, index) {
    row.querySelector(".bill-legend").textContent = "Bill " + (index + 1);
    const removeButton = row.querySelector(".bill-remove");
    // Starts with the words on the button, so "click Remove this bill" works
    // for people who use their voice (WCAG 2.5.3, Label in Name).
    removeButton.setAttribute("aria-label", "Remove this bill (bill " + (index + 1) + ")");
  });
  byId("add-bill").disabled = rows.length >= MAX_BILL_ROWS;
}

function syncBillNameField(row) {
  const kind = row.querySelector(".bill-kind").value;
  row.querySelector(".field-name").hidden = kind !== "other";
}

function addBillRow(bill) {
  const number = nextBillNumber;
  nextBillNumber = nextBillNumber + 1;
  const prefix = "bill-" + number;
  const data = bill || emptyBill("property-tax");

  const kindSelect = el("select", {
    className: "input input-select bill-kind",
    attrs: { id: prefix + "-kind", "aria-describedby": prefix + "-kind-error" },
  });
  for (const kind of BILL_KINDS) {
    kindSelect.append(el("option", { text: kind.label, attrs: { value: kind.value } }));
  }
  let knownKind = "other";
  for (const kind of BILL_KINDS) {
    if (kind.value === data.kind) knownKind = kind.value;
  }
  kindSelect.value = knownKind;

  const nameInput = el("input", {
    className: "input bill-name",
    attrs: {
      id: prefix + "-name",
      type: "text",
      autocomplete: "off",
      maxlength: String(MAX_BILL_NAME_LENGTH),
      "aria-describedby": prefix + "-name-error",
    },
  });
  nameInput.value = data.name || "";

  const amountInput = el("input", {
    className: "input input-money bill-amount",
    attrs: {
      id: prefix + "-amount",
      type: "text",
      inputmode: "decimal",
      autocomplete: "off",
      spellcheck: "false",
      "aria-required": "true",
      "aria-describedby": prefix + "-amount-error",
    },
  });
  amountInput.value = data.amount || "";

  const monthSelect = el("select", {
    className: "input input-select bill-month",
    attrs: { id: prefix + "-month", "aria-required": "true", "aria-describedby": prefix + "-month-error" },
  });
  fillMonthOptions(monthSelect, "Pick a month");
  monthSelect.value = data.month || "";

  const removeButton = el("button", {
    className: "btn btn-quiet bill-remove",
    text: "Remove this bill",
    attrs: { type: "button" },
  });

  const row = el("fieldset", { className: "bill-row", attrs: { "data-bill": String(number) } }, [
    el("legend", { className: "bill-legend", text: "Bill" }),
    el("div", { className: "bill-grid" }, [
      el("div", { className: "field field-kind" }, [
        el("label", { className: "field-label", text: "What it is", attrs: { for: prefix + "-kind" } }),
        kindSelect,
        el("p", { className: "field-error", attrs: { id: prefix + "-kind-error" } }),
      ]),
      el("div", { className: "field field-amount" }, [
        el("label", { className: "field-label", text: "Amount", attrs: { for: prefix + "-amount" } }),
        el("div", { className: "money" }, [amountInput]),
        el("p", { className: "field-error", attrs: { id: prefix + "-amount-error" } }),
      ]),
      el("div", { className: "field field-month" }, [
        el("label", { className: "field-label", text: "Month it is paid", attrs: { for: prefix + "-month" } }),
        monthSelect,
        el("p", { className: "field-error", attrs: { id: prefix + "-month-error" } }),
      ]),
      el("div", { className: "field field-name" }, [
        el("label", { className: "field-label", text: "Name of this bill", attrs: { for: prefix + "-name" } }),
        nameInput,
        el("p", { className: "field-error", attrs: { id: prefix + "-name-error" } }),
      ]),
      el("div", { className: "bill-remove-cell" }, [removeButton]),
    ]),
  ]);

  kindSelect.addEventListener("change", function () {
    syncBillNameField(row);
  });
  removeButton.addEventListener("click", function () {
    removeBillRow(row);
  });

  billRows.append(row);
  syncBillNameField(row);
  renumberBillRows();
  return row;
}

function removeBillRow(row) {
  const rows = billRowElements();
  const index = rows.indexOf(row);
  row.remove();
  renumberBillRows();
  updateBillsTotal();

  // Keep keyboard focus somewhere sensible: the next row, or the add button.
  const remaining = billRowElements();
  const neighbor = remaining[index] || remaining[index - 1];
  if (neighbor) neighbor.querySelector(".bill-kind").focus();
  else byId("add-bill").focus();

  scheduleLiveEdit();
}

function setBillRows(bills) {
  clear(billRows);
  for (const bill of bills.slice(0, MAX_BILL_ROWS)) {
    addBillRow(bill);
  }
  renumberBillRows();
}

// ─────────────────────────── form ⇄ values ───────────────────────────

function checkedRadioValue(name) {
  const picked = form.querySelector('input[name="' + name + '"]:checked');
  return picked ? picked.value : "";
}

function readFormValues() {
  const values = emptyValues();
  values.currentPayment = byId("f-current-payment").value;
  values.newPayment = byId("f-new-payment").value;
  values.startingBalance = byId("f-starting-balance").value;
  values.balanceNegative = byId("f-balance-negative").checked ? "yes" : "";
  values.startMonth = byId("f-start-month").value;
  values.requiredMinimum = byId("f-required-minimum").value;
  values.claimedKind = byId("f-claimed-kind").value;
  values.claimedAmount = byId("f-claimed-amount").value;
  values.spreadMonths = byId("f-spread-months").value;
  values.lumpSumOffered = checkedRadioValue("lumpSumOffered");
  values.analysisDate = byId("f-analysis-date").value;
  values.cushionMonths = byId("f-cushion-months").value;
  values.behind = byId("f-behind").checked ? "yes" : "";
  values.servicerName = byId("f-servicer-name").value;
  values.loanNumber = byId("f-loan-number").value;
  values.letterDate = todayInWords();

  values.bills = billRowElements().map(function (row) {
    return {
      kind: row.querySelector(".bill-kind").value,
      name: row.querySelector(".bill-name").value,
      amount: row.querySelector(".bill-amount").value,
      month: row.querySelector(".bill-month").value,
    };
  });
  return values;
}

// Values reach the form ONLY through .value / .checked, never as HTML. This is
// the path both the example buttons and a loaded numbers file go through.
function writeFormValues(values) {
  byId("f-current-payment").value = values.currentPayment;
  byId("f-new-payment").value = values.newPayment;
  byId("f-starting-balance").value = values.startingBalance;
  byId("f-balance-negative").checked = values.balanceNegative === "yes";
  byId("f-start-month").value = values.startMonth;
  byId("f-required-minimum").value = values.requiredMinimum;
  byId("f-claimed-kind").value = values.claimedKind;
  byId("f-claimed-amount").value = values.claimedAmount;
  byId("f-spread-months").value = values.spreadMonths;
  byId("f-analysis-date").value = values.analysisDate;
  byId("f-cushion-months").value = values.cushionMonths;
  byId("f-behind").checked = values.behind === "yes";

  let lumpSumId = "f-lump-sum-unsure";
  if (values.lumpSumOffered === "yes") lumpSumId = "f-lump-sum-yes";
  if (values.lumpSumOffered === "no") lumpSumId = "f-lump-sum-no";
  byId(lumpSumId).checked = true;

  // A select quietly ignores a value it does not have; fall back to the default.
  if (byId("f-cushion-months").value === "") byId("f-cushion-months").value = "2";

  setBillRows(values.bills);
  syncConditionalFields();
  updateBillsTotal();

  // Anything unusual is ticked → open that section so it is not hidden from view.
  if (values.cushionMonths !== "2" || values.behind === "yes") byId("less-common").open = true;
}

// The first month is pre-filled with a guess (next month). A wrong guess would
// quietly change the answer, so the box says it was guessed until the visitor
// picks a month, loads an example, or loads a file.
function setMonthGuessNote(isGuess) {
  byId("f-start-month-guess").hidden = !isGuess;
}

// "How much?", "spread over" and the pay-in-full question only make sense for
// some answers, so they appear only then.
function syncConditionalFields() {
  const kind = byId("f-claimed-kind").value;
  const owesMoney = kind === "shortage" || kind === "deficiency";
  byId("claimed-amount-field").hidden = !(owesMoney || kind === "surplus");
  byId("spread-months-field").hidden = !owesMoney;
  byId("lump-sum-field").hidden = kind !== "shortage";

  // A box just appeared or disappeared, so count the visible boxes again. The
  // little numbers on the form and on the sample statement change together.
  renumberBoxes({ panel: byId("guide-panel"), form: form });
}

function updateBillsTotal() {
  byId("bills-total").textContent = billsTotal(readFormValues()).text;
}

// ─────────────────────────── errors ───────────────────────────

// The engine names the box with a dotted path ("disbursements.1.amountCents").
// This turns that path into the id of the matching control on the page.
const FIELD_IDS = {
  startMonth: "f-start-month",
  startingBalanceCents: "f-starting-balance",
  cushionMonths: "f-cushion-months",
  borrowerCurrent: "f-behind",
  "statement.currentMonthlyEscrowCents": "f-current-payment",
  "statement.newMonthlyEscrowCents": "f-new-payment",
  "statement.requiredMinimumBalanceCents": "f-required-minimum",
  "statement.claimedKind": "f-claimed-kind",
  "statement.claimedAmountCents": "f-claimed-amount",
  "statement.shortageSpreadMonths": "f-spread-months",
  "statement.lumpSumOfferedOnStatement": "f-lump-sum-unsure",
  "details.analysisDate": "f-analysis-date",
};

function fieldToId(field) {
  const name = String(field || "");
  if (FIELD_IDS[name]) return FIELD_IDS[name];

  const parts = name.split(".");
  if (parts[0] === "disbursements") {
    const rows = billRowElements();
    if (parts.length === 1) {
      return rows.length > 0 ? rows[0].querySelector(".bill-amount").id : "add-bill";
    }
    const row = rows[Number(parts[1])];
    if (!row) return "add-bill";
    if (parts[2] === "month") return row.querySelector(".bill-month").id;
    if (parts[2] === "label") {
      const usesOwnName = row.querySelector(".bill-kind").value === "other";
      return usesOwnName ? row.querySelector(".bill-name").id : row.querySelector(".bill-kind").id;
    }
    return row.querySelector(".bill-amount").id;
  }
  return "";
}

// Where the inline message for a control goes.
function errorSlotFor(field, controlId) {
  if (String(field) === "disbursements") return byId("bills-error");
  if (controlId && byId(controlId + "-error")) return byId(controlId + "-error");
  // No box to point at: the message goes just above "Check the math", so the
  // page never says "fix the box marked above" with nothing marked.
  return byId("general-error");
}

function clearErrors() {
  for (const slot of document.querySelectorAll(".field-error")) {
    slot.textContent = "";
  }
  for (const control of document.querySelectorAll('[aria-invalid="true"]')) {
    control.removeAttribute("aria-invalid");
  }
  byId("error-summary").hidden = true;
  clear(byId("error-summary-list"));
  if (stepTabs) markStepsWithErrors([]);
}

function labelTextFor(controlId) {
  const label = document.querySelector('label[for="' + controlId + '"]');
  if (!label) return "";
  let text = "";
  for (const node of label.childNodes) {
    // Skip the little number badge and the "required" tag inside the label.
    if (node.nodeType === Node.TEXT_NODE) text = text + node.textContent;
  }
  return text.trim();
}

// Inline messages always; the summary box (which takes focus) only on a real
// "Check the math" press, so live editing never yanks focus away.
function showErrors(errors, withSummary) {
  clearErrors();
  const list = byId("error-summary-list");
  const stepsWithErrors = [];

  for (const error of errors) {
    const controlId = fieldToId(error.field);
    const control = controlId ? byId(controlId) : null;
    const slot = errorSlotFor(error.field, controlId);

    if (control && control.tagName !== "BUTTON") control.setAttribute("aria-invalid", "true");
    if (slot) {
      slot.textContent = slot.textContent === "" ? error.message : slot.textContent + " " + error.message;
    }
    // Make sure a broken box is never hidden inside a closed section.
    if (control) {
      const closedSection = control.closest("details:not([open])");
      if (closedSection) closedSection.open = true;
      const stepIndex = stepIndexOf(control);
      if (stepIndex !== -1 && !stepsWithErrors.includes(stepIndex)) stepsWithErrors.push(stepIndex);
    }

    let linkText = error.message;
    const row = control ? control.closest(".bill-row") : null;
    if (row) linkText = row.querySelector(".bill-legend").textContent + ": " + error.message;
    else if (controlId && labelTextFor(controlId)) linkText = labelTextFor(controlId) + ": " + error.message;

    const item = el("li");
    if (controlId) item.append(el("a", { text: linkText, attrs: { href: "#" + controlId } }));
    else item.append(el("a", { text: linkText, attrs: { href: "#check-button" } }));
    list.append(item);
  }

  markStepsWithErrors(stepsWithErrors);

  if (!withSummary) return;
  // A real press of "Check the math": bring the FIRST step with a mistake
  // forward, whichever step was showing. (Live editing never changes the step
  // under someone's hands; it only marks the tabs.)
  if (stepsWithErrors.length > 0) {
    const firstStep = Math.min.apply(null, stepsWithErrors);
    if (firstStep !== stepTabs.selectedIndex()) stepTabs.select(firstStep, false);
  }
  const count = errors.length;
  byId("error-summary-title").textContent =
    count === 1 ? "One box needs fixing before the math can run" : count + " boxes need fixing before the math can run";
  const summary = byId("error-summary");
  summary.hidden = false;
  summary.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
  summary.focus({ preventScroll: true });
}

// ─────────────────────────── soft warnings under a box ───────────────────────────
// Warnings never block the check. Each one is shown in the results AND right
// under the box it is about, tied to that box for screen readers.

function describedByTokens(control) {
  const current = control.getAttribute("aria-describedby") || "";
  return current.split(" ").filter(function (token) {
    return token !== "";
  });
}

function clearWarnings() {
  for (const note of Array.from(document.querySelectorAll(".field-warning"))) {
    const control = byId(note.getAttribute("data-for"));
    if (control) {
      const kept = describedByTokens(control).filter(function (token) {
        return token !== note.id;
      });
      control.setAttribute("aria-describedby", kept.join(" "));
    }
    note.remove();
  }
}

function showWarnings(warnings) {
  clearWarnings();
  for (const warning of warnings) {
    const controlId = fieldToId(warning.field);
    const control = controlId ? byId(controlId) : null;
    const slot = errorSlotFor(warning.field, controlId);
    if (!control || !slot) continue;

    const noteId = controlId + "-warning";
    let note = byId(noteId);
    if (!note) {
      note = el("p", { className: "field-warning", attrs: { id: noteId, "data-for": controlId } });
      slot.after(note);
      control.setAttribute("aria-describedby", describedByTokens(control).concat([noteId]).join(" "));
    }
    note.textContent = note.textContent === "" ? warning.message : note.textContent + " " + warning.message;
  }
}

// A link in the error summary (or a nudge) moves focus INTO the box, not just near it.
function handleJumpLinkClick(event) {
  const link = event.target.closest('a[href^="#f-"], a[href^="#bill-"], a[href="#add-bill"], a[href="#check-button"]');
  if (!link) return;
  const target = byId(link.getAttribute("href").slice(1));
  if (!target) return;
  event.preventDefault();
  const closedSection = target.closest("details:not([open])");
  if (closedSection) closedSection.open = true;
  // The box may be in a step that is not showing: switch to it first.
  revealBox(target);
  target.scrollIntoView({ behavior: scrollBehavior(), block: "center" });
  target.focus({ preventScroll: true });
}

// ─────────────────────────── checking ───────────────────────────

function showResults(check, moveFocus) {
  lastGoodCheck = check;
  hasCheckedOnce = true;
  byId("results").hidden = false;
  byId("print-date").textContent = "Made on " + todayInWords() + ". Math, not legal advice.";
  // The chart measures the box it is drawn into, and a tab that is not showing
  // has no width. So every panel is laid out while the results are drawn, and
  // the tabs are put back before the browser paints anything: nobody sees it,
  // and the chart is the right size the first time its tab is opened.
  const showing = resultTabs.selectedIndex();
  for (const panel of resultTabs.panels) panel.hidden = false;
  const everyStepDrew = renderResults(check, { fieldToId: fieldToId, keepLetter: letterWasEdited });
  resultTabs.select(showing, false);
  // Only call the results fresh when ALL of them were redrawn.
  setStale(!everyStepDrew);
  showWarnings(check.warnings);

  if (moveFocus) {
    // A real check always lands on the Verdict tab, with focus on the verdict.
    // (Live what-if leaves the visitor on whichever tab they were reading.)
    resultTabs.select(0, false);
    const heading = byId("verdict-heading");
    byId("results").scrollIntoView({ behavior: scrollBehavior(), block: "start" });
    heading.focus({ preventScroll: true });
  }
  // The verdict eases in once for every check: a press of the button, an
  // example, or a live what-if edit.
  flashVerdict();
}

// A real press of "Check the math" (or an example button).
function checkNow() {
  window.clearTimeout(liveEditTimer);
  const check = runCheck(readFormValues());
  if (!check.ok) {
    showErrors(check.errors, true);
    if (hasCheckedOnce) setStale(true);
    return false;
  }
  clearErrors();
  showResults(check, true);
  return true;
}

// Live what-if (SPEC D4): after the first good check, any edit re-runs the math.
function liveEdit() {
  if (!hasCheckedOnce) return;
  const check = runCheck(readFormValues());
  if (!check.ok) {
    // "1," on the way to "1,234" is not a mistake yet. Say nothing and wait for
    // the next key. (A real press of "Check the math" still checks everything.)
    const typingIn = document.activeElement;
    if (typingIn && typingIn.classList.contains("input-money") && looksUnfinished(typingIn.value)) return;
    showErrors(check.errors, false);
    setStale(true);
    announceStale();
    return;
  }
  clearErrors();
  showResults(check, false);
  announceVerdict(check);
}

function scheduleLiveEdit() {
  if (!hasCheckedOnce) return;
  window.clearTimeout(liveEditTimer);
  liveEditTimer = window.setTimeout(liveEdit, LIVE_EDIT_DELAY_MS);
}

// ─────────────────────────── examples ───────────────────────────

// Three small buttons above the form. Each one fills in the form with that
// example's numbers and checks the math, exactly as a visitor's own numbers
// would be checked. (The landing page shows the same three with their stories;
// its buttons are links that end in "#example-2", read further down.)

function runExample(index) {
  const example = EXAMPLES[index];
  if (!example || pageIsFramed) return;
  byId("f-servicer-name").value = "";
  byId("f-loan-number").value = "";
  forgetLetterEdits();
  writeFormValues(exampleToValues(example));
  setMonthGuessNote(false);
  byId("undo-clear").hidden = true;
  stepTabs.select(0, false);
  markLoadedExample(index);
  setStatus("form-status", "Example " + (index + 1) + " is in the form. Change any number to see what happens.");
  checkNow();
}

function markLoadedExample(index) {
  byId("example-buttons").querySelectorAll(".example-load").forEach(function (button, position) {
    button.classList.toggle("is-loaded", position === index);
  });
}

function buildExampleButtons() {
  const holder = byId("example-buttons");
  clear(holder);
  EXAMPLES.forEach(function (example, index) {
    const button = el("button", { className: "btn btn-secondary example-load", attrs: { type: "button" } }, [
      el("span", { className: "example-load-num", text: String(index + 1), attrs: { "aria-hidden": "true" } }),
      el("span", { text: example.tab }),
    ]);
    button.addEventListener("click", function () {
      runExample(index);
    });
    holder.append(button);
  });
}

// A link such as ./check.html#example-2 opens the tool with that example already
// run. Handy for the landing page's buttons, for sharing "look at this case" and
// for demos. Nothing is read from the address except that one small number
// (example-link.js).
function runExampleFromAddress() {
  const number = exampleNumberFromHash(window.location.hash, EXAMPLES.length);
  if (number !== null) runExample(number - 1);
}

// The numbers are the visitor's own from the first keystroke, so no example is
// "the one in the form" any more.
function unpressExamples() {
  markLoadedExample(-1);
}

// ─────────────────────────── letter + printing ───────────────────────────

function refreshLetter() {
  if (!lastGoodCheck) return;
  const check = runCheck(readFormValues());
  if (check.ok) {
    lastGoodCheck = check;
    renderLetterOnly(check, letterWasEdited);
  }
}

// The visitor typed in the letter: from now on it is theirs. Live what-if keeps
// updating the results but no longer rewrites the letter, and says so.
function rememberLetterEdit() {
  if (letterWasEdited) return;
  letterWasEdited = true;
  byId("reset-letter").hidden = false;
  setStatus(
    "letter-status",
    "You have edited the letter, so this page no longer rewrites it when the numbers change. “Start the letter over” writes a fresh one from the current numbers."
  );
}

function forgetLetterEdits() {
  letterWasEdited = false;
  byId("reset-letter").hidden = true;
  setStatus("letter-status", "");
}

function startLetterOver() {
  forgetLetterEdits();
  refreshLetter();
  setStatus("letter-status", "The letter was written again from the current numbers.");
  byId("letter-text").focus();
}

function setStatus(id, message) {
  byId(id).textContent = message;
}

function copyLetter() {
  const box = byId("letter-text");
  const done = function () {
    setStatus("copy-status", "Copied. Paste it into an email or a document.");
  };
  const fallback = function () {
    box.focus();
    box.select();
    // iPhones and iPads ignore select() here; this does the same job there.
    box.setSelectionRange(0, box.value.length);
    setStatus("copy-status", "The letter is selected. Press Ctrl+C (or ⌘C on a Mac) to copy it.");
  };
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    navigator.clipboard.writeText(box.value).then(done, fallback);
  } else {
    fallback();
  }
}

// Closed <details> do not print, so the math steps and the five limits are
// opened for the printout and put back the way they were afterwards. (Which
// result TAB is showing does not matter: the print styles lay every needed
// panel out on the one page.)
const PRINTED_DETAILS = "#steps-body details, #limits-details";
let stepsOpenBeforePrint = null;

function openStepsForPrint() {
  if (stepsOpenBeforePrint !== null) return;
  stepsOpenBeforePrint = [];
  for (const step of document.querySelectorAll(PRINTED_DETAILS)) {
    stepsOpenBeforePrint.push(step.open);
    step.open = true;
  }
}

function restoreAfterPrint() {
  document.body.classList.remove("print-letter-mode");
  if (stepsOpenBeforePrint === null) return;
  const steps = document.querySelectorAll(PRINTED_DETAILS);
  steps.forEach(function (step, index) {
    step.open = stepsOpenBeforePrint[index] === true;
  });
  stepsOpenBeforePrint = null;
}

function printReport() {
  document.body.classList.remove("print-letter-mode");
  openStepsForPrint();
  window.print();
}

function printLetter() {
  // The printed letter is whatever is in the box right now, edits included.
  // It is the visitor's own text, so it goes in as plain text only.
  byId("letter-print").textContent = byId("letter-text").value;
  document.body.classList.add("print-letter-mode");
  window.print();
}

// ─────────────────────────── D7: numbers file ───────────────────────────

function downloadNumbers() {
  const text = valuesToFileText(readFormValues());
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = el("a", { attrs: { href: url, download: "escrowscope-numbers.json" } });
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser a moment to start saving before the temporary address is dropped.
  window.setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 1000);
  setStatus("file-status", "Saved to your device as escrowscope-numbers.json. It was not sent anywhere.");
}

function loadNumbers(event) {
  const input = event.target;
  const file = input.files && input.files[0];
  if (!file) return;
  if (file.size > MAX_FILE_CHARACTERS) {
    setStatus("file-status", "That file is too large to be an EscrowScope numbers file.");
    input.value = "";
    return;
  }
  const reader = new FileReader();
  reader.addEventListener("load", function () {
    // The file is untrusted: fileTextToValues keeps only known keys as short
    // strings, and the normal check below validates every one of them.
    const loaded = fileTextToValues(String(reader.result));
    input.value = "";
    if (!loaded.ok) {
      setStatus("file-status", loaded.problem);
      return;
    }
    unpressExamples();
    forgetLetterEdits();
    writeFormValues(loaded.values);
    setMonthGuessNote(false);

    // A drop-down or a date box quietly refuses a value it does not know. Compare
    // what was written with what each box kept, and name the ones that differ.
    const lost = boxesThatLostTheirValue(loaded.values, readFormValues());
    let message = "Loaded your numbers from the file. Nothing was uploaded.";
    if (lost.length > 0) {
      message = "Loaded the file, but these boxes could not be restored and need checking: " + lost.join(", ") + ". Nothing was uploaded.";
    }
    setStatus("file-status", message);

    const worked = checkNow();
    if (!worked) {
      // The form now shows the file's numbers. Results from an earlier check
      // would describe different numbers, so they are taken down.
      byId("results").hidden = true;
      hasCheckedOnce = false;
      lastGoodCheck = null;
    }
  });
  reader.addEventListener("error", function () {
    input.value = "";
    setStatus("file-status", "That file could not be read.");
  });
  reader.readAsText(file);
}

// Which boxes did not keep the value a file tried to put in them?
function boxesThatLostTheirValue(wanted, kept) {
  const lost = [];
  const named = [
    ["startMonth", "First month"],
    ["claimedKind", "What the statement says there is"],
    ["cushionMonths", "Cushion months"],
    ["analysisDate", "Date of the analysis"],
  ];
  for (const pair of named) {
    if (String(wanted[pair[0]] || "") !== String(kept[pair[0]] || "")) lost.push(pair[1]);
  }
  wanted.bills.forEach(function (bill, index) {
    const keptBill = kept.bills[index];
    if (!keptBill) return;
    if (String(bill.month || "") !== String(keptBill.month || "")) lost.push("Bill " + (index + 1) + " month");
    if (String(bill.kind || "") !== String(keptBill.kind || "")) lost.push("Bill " + (index + 1) + " “What it is”");
  });
  return lost;
}

// Has the visitor typed anything that a reload would throw away?
function formHasContent() {
  const values = readFormValues();
  const typed = [values.currentPayment, values.newPayment, values.startingBalance, values.requiredMinimum, values.claimedAmount];
  for (const bill of values.bills) typed.push(bill.amount, bill.name);
  return typed.some(function (text) {
    return String(text).trim() !== "";
  });
}

// ─────────────────────────── start ───────────────────────────

function clearForm() {
  window.clearTimeout(liveEditTimer);
  valuesBeforeClear = formHasContent() ? readFormValues() : null;
  unpressExamples();
  forgetLetterEdits();
  byId("f-servicer-name").value = "";
  byId("f-loan-number").value = "";
  writeFormValues(blankFormValues());
  clearErrors();
  clearWarnings();
  hasCheckedOnce = false;
  lastGoodCheck = null;
  byId("results").hidden = true;
  byId("verdict-live").textContent = "";
  setStatus("file-status", "");
  setMonthGuessNote(true);
  setStatus("form-status", "Form cleared.");
  byId("undo-clear").hidden = valuesBeforeClear === null;
  goToStep(0);
}

function undoClear() {
  if (valuesBeforeClear === null) return;
  writeFormValues(valuesBeforeClear);
  setMonthGuessNote(false);
  valuesBeforeClear = null;
  byId("undo-clear").hidden = true;
  setStatus("form-status", "Your numbers are back. Press “Check the math” to see the results again.");
  byId("check-button").focus();
}

// Shown inside another website? Then someone else controls what sits around (or
// on top of) this page. Switch the form off and say why.
function guardAgainstFraming() {
  try {
    pageIsFramed = window.top !== window.self;
  } catch (problem) {
    // A parent page on another site refuses the question: that means framed.
    pageIsFramed = true;
  }
  if (!pageIsFramed) return;
  byId("framed-warning").hidden = false;
  form.setAttribute("inert", "");
  for (const control of form.querySelectorAll("input, select, textarea, button")) {
    control.disabled = true;
  }
  for (const button of byId("example-buttons").querySelectorAll("button")) {
    button.disabled = true;
  }
}

function start() {
  initSite();
  stepTabs = wireTabRow(".steps-list", ".step-tab", ".step-panel", syncStepButtons);
  resultTabs = wireTabRow(".result-tabs-list", ".result-tab", ".result-panel", null);
  syncStepButtons(0);
  byId("step-back").addEventListener("click", function () {
    goToStep(stepTabs.selectedIndex() - 1);
  });
  byId("step-next").addEventListener("click", function () {
    goToStep(stepTabs.selectedIndex() + 1);
  });

  fillMonthOptions(byId("f-start-month"), "Pick a month");
  writeFormValues(blankFormValues());
  buildExampleButtons();

  // The form never submits anywhere (there is no action, and the CSP forbids one).
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    checkNow();
  });
  form.addEventListener("input", function () {
    // The numbers are the visitor's own from the first keystroke: the example
    // button is no longer "the one showing", and the undo offer has passed.
    unpressExamples();
    byId("undo-clear").hidden = true;
    setStatus("form-status", "");
    updateBillsTotal();
    scheduleLiveEdit();
  });
  byId("f-start-month").addEventListener("change", function () {
    setMonthGuessNote(false);
  });
  form.addEventListener("change", function () {
    syncConditionalFields();
    updateBillsTotal();
    scheduleLiveEdit();
  });

  byId("add-bill").addEventListener("click", function () {
    const row = addBillRow(emptyBill("other"));
    row.querySelector(".bill-kind").focus();
    scheduleLiveEdit();
  });
  byId("clear-button").addEventListener("click", clearForm);
  byId("undo-clear").addEventListener("click", undoClear);
  byId("letter-text").addEventListener("input", rememberLetterEdit);
  byId("reset-letter").addEventListener("click", startLetterOver);

  // Leaving or reloading throws the numbers away (nothing is stored), so the
  // browser asks first, but only when there is something to lose.
  window.addEventListener("beforeunload", function (event) {
    if (!formHasContent()) return;
    // Browsers only ever ask when the visitor has really touched the page. If
    // they have not (an example opened from a link, say), asking is pointless.
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    event.preventDefault();
    event.returnValue = "";
  });

  byId("f-servicer-name").addEventListener("input", refreshLetter);
  byId("f-loan-number").addEventListener("input", refreshLetter);
  byId("copy-letter").addEventListener("click", copyLetter);
  byId("print-letter").addEventListener("click", printLetter);
  byId("print-report").addEventListener("click", printReport);
  window.addEventListener("beforeprint", function () {
    if (!document.body.classList.contains("print-letter-mode")) openStepsForPrint();
  });
  window.addEventListener("afterprint", restoreAfterPrint);

  document.addEventListener("click", handleJumpLinkClick);

  byId("file-actions").hidden = false;
  byId("download-numbers").addEventListener("click", downloadNumbers);
  byId("load-numbers").addEventListener("change", loadNumbers);

  // The sample statement uses the first example's numbers, so every number on
  // the page agrees with every other number on the page (SPEC D2).
  // `reveal`: a click on the sample statement may point at a box in another step.
  initGuide({ panel: byId("guide-panel"), form: form, example: EXAMPLES[0], reveal: revealBox });
  initRequestLine(byId("request-count"));

  guardAgainstFraming();
  if (!pageIsFramed) {
    runExampleFromAddress();
    // The same link clicked while the page is already open only changes the "#"
    // part of the address, and browsers do not reload for that. Listen for it, so
    // ./check.html#example-2 works from anywhere, not just on a fresh load.
    window.addEventListener("hashchange", runExampleFromAddress);
  }

  // LAST line on purpose: if anything above threw, this never runs and the
  // "If the buttons on this page do nothing…" paragraph stays on the page.
  byId("page-problem").hidden = true;
}

start();
