// app.js — DOM wiring only: read the form → pipeline.runCheck → render.
// No math lives here. Everything about dollars, months and the federal rule is
// behind pipeline.js (which calls the engine), so Node can test that same path.
//
// Every module the page will ever need is imported right here, up front. There
// is no lazy loading anywhere, which is what keeps the privacy panel's
// "requests since load" counter honestly at 0 whatever gets clicked (SPEC D1).

import { el, clear } from "./dom.js";
import { EXAMPLES } from "./examples.js";
import { MONTH_NAMES } from "./engine/index.js";
import {
  BILL_KINDS,
  MAX_BILL_ROWS,
  MAX_FILE_CHARACTERS,
  emptyValues,
  emptyBill,
  exampleToValues,
  runCheck,
  billsTotal,
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
import { initGuide } from "./guide.js";
import { initProofPanel } from "./proof.js";
import { initSelfCheck } from "./selfcheck-ui.js";
import { registerServiceWorker } from "./sw-register.js";

const LIVE_EDIT_DELAY_MS = 250;

function byId(id) {
  return document.getElementById(id);
}

const form = byId("escrow-form");
const billRows = byId("bill-rows");

// Page state. It lives in memory only and is gone when the tab closes.
let hasCheckedOnce = false; // live what-if starts after the first good check
let lastGoodCheck = null;
let nextBillNumber = 1; // keeps ids unique even after rows are removed
let liveEditTimer = null;

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

// ─────────────────────────── bill rows ───────────────────────────

function billRowElements() {
  return Array.from(billRows.querySelectorAll(".bill-row"));
}

function renumberBillRows() {
  const rows = billRowElements();
  rows.forEach(function (row, index) {
    row.querySelector(".bill-legend").textContent = "Bill " + (index + 1);
    const removeButton = row.querySelector(".bill-remove");
    removeButton.setAttribute("aria-label", "Remove bill " + (index + 1));
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
    attrs: { id: prefix + "-name", type: "text", autocomplete: "off", maxlength: "60" },
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

// "How much?", "spread over" and the pay-in-full question only make sense for
// some answers, so they appear only then.
function syncConditionalFields() {
  const kind = byId("f-claimed-kind").value;
  const owesMoney = kind === "shortage" || kind === "deficiency";
  byId("claimed-amount-field").hidden = !(owesMoney || kind === "surplus");
  byId("spread-months-field").hidden = !owesMoney;
  byId("lump-sum-field").hidden = kind !== "shortage";
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
    if (parts[2] === "label") return row.querySelector(".bill-kind").id;
    return row.querySelector(".bill-amount").id;
  }
  return "";
}

// Where the inline message for a control goes.
function errorSlotFor(field, controlId) {
  if (String(field) === "disbursements") return byId("bills-error");
  return controlId ? byId(controlId + "-error") : null;
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
    }

    let linkText = error.message;
    const row = control ? control.closest(".bill-row") : null;
    if (row) linkText = row.querySelector(".bill-legend").textContent + ": " + error.message;
    else if (controlId && labelTextFor(controlId)) linkText = labelTextFor(controlId) + ": " + error.message;

    const item = el("li");
    if (controlId) item.append(el("a", { text: linkText, attrs: { href: "#" + controlId } }));
    else item.append(linkText);
    list.append(item);
  }

  if (!withSummary) return;
  const count = errors.length;
  byId("error-summary-title").textContent =
    count === 1 ? "One box needs fixing before the math can run" : count + " boxes need fixing before the math can run";
  const summary = byId("error-summary");
  summary.hidden = false;
  summary.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
  summary.focus({ preventScroll: true });
}

// A link in the error summary (or a nudge) moves focus INTO the box, not just near it.
function handleJumpLinkClick(event) {
  const link = event.target.closest('a[href^="#f-"], a[href^="#bill-"], a[href="#add-bill"]');
  if (!link) return;
  const target = byId(link.getAttribute("href").slice(1));
  if (!target) return;
  event.preventDefault();
  const closedSection = target.closest("details:not([open])");
  if (closedSection) closedSection.open = true;
  target.scrollIntoView({ behavior: scrollBehavior(), block: "center" });
  target.focus({ preventScroll: true });
}

// ─────────────────────────── checking ───────────────────────────

function showResults(check, moveFocus) {
  lastGoodCheck = check;
  hasCheckedOnce = true;
  byId("results").hidden = false;
  byId("print-date").textContent = "Made on " + todayInWords() + ". Math, not legal advice.";
  setStale(false);
  renderResults(check, { fieldToId: fieldToId });

  if (moveFocus) {
    const heading = byId("verdict-heading");
    byId("results").scrollIntoView({ behavior: scrollBehavior(), block: "start" });
    heading.focus({ preventScroll: true });
  }
}

// A real press of "Check the math" (or an example button).
function checkNow() {
  window.clearTimeout(liveEditTimer);
  const check = runCheck(readFormValues());
  if (!check.ok) {
    showErrors(check.errors, true);
    if (hasCheckedOnce) setStale(true);
    return;
  }
  clearErrors();
  showResults(check, true);
}

// Live what-if (SPEC D4): after the first good check, any edit re-runs the math.
function liveEdit() {
  if (!hasCheckedOnce) return;
  const check = runCheck(readFormValues());
  if (!check.ok) {
    showErrors(check.errors, false);
    setStale(true);
    announceStale();
    return;
  }
  clearErrors();
  showResults(check, false);
  announceVerdict(check);
  flashVerdict();
}

function scheduleLiveEdit() {
  if (!hasCheckedOnce) return;
  window.clearTimeout(liveEditTimer);
  liveEditTimer = window.setTimeout(liveEdit, LIVE_EDIT_DELAY_MS);
}

// ─────────────────────────── examples ───────────────────────────

function buildExampleButtons() {
  const holder = byId("example-buttons");
  clear(holder);
  EXAMPLES.forEach(function (example, index) {
    const button = el("button", { className: "example-card", attrs: { type: "button", "aria-pressed": "false" } }, [
      el("span", { className: "example-index", text: "Example " + (index + 1) }),
      el("span", { className: "example-title", text: example.title }),
      el("span", { className: "example-blurb", text: example.blurb }),
      el("span", { className: "example-go", text: "Fill in the form and check it" }),
    ]);
    button.addEventListener("click", function () {
      for (const other of holder.querySelectorAll(".example-card")) {
        other.setAttribute("aria-pressed", "false");
      }
      button.setAttribute("aria-pressed", "true");
      byId("f-servicer-name").value = "";
      byId("f-loan-number").value = "";
      writeFormValues(exampleToValues(example));
      checkNow();
    });
    holder.append(button);
  });
}

// A link such as ./#example-2 opens the page with that example already run.
// Handy for sharing "look at this case" and for demos. Nothing is read from the
// address except that one small number.
function runExampleFromAddress() {
  const hash = window.location.hash;
  if (!hash.startsWith("#example-")) return;
  const number = Number(hash.slice("#example-".length));
  const buttons = byId("example-buttons").querySelectorAll(".example-card");
  if (Number.isInteger(number) && buttons[number - 1]) buttons[number - 1].click();
}

function unpressExamples() {
  for (const button of byId("example-buttons").querySelectorAll(".example-card")) {
    button.setAttribute("aria-pressed", "false");
  }
}

// ─────────────────────────── letter + printing ───────────────────────────

function refreshLetter() {
  if (!lastGoodCheck) return;
  const check = runCheck(readFormValues());
  if (check.ok) {
    lastGoodCheck = check;
    renderLetterOnly(check);
  }
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
    setStatus("copy-status", "The letter is selected. Press Ctrl+C (or ⌘C on a Mac) to copy it.");
  };
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    navigator.clipboard.writeText(box.value).then(done, fallback);
  } else {
    fallback();
  }
}

// Closed <details> do not print, so the math steps are opened for the printout
// and put back the way they were afterwards.
let stepsOpenBeforePrint = null;

function openStepsForPrint() {
  if (stepsOpenBeforePrint !== null) return;
  stepsOpenBeforePrint = [];
  for (const step of document.querySelectorAll("#steps-body details")) {
    stepsOpenBeforePrint.push(step.open);
    step.open = true;
  }
}

function restoreAfterPrint() {
  document.body.classList.remove("print-letter-mode");
  if (stepsOpenBeforePrint === null) return;
  const steps = document.querySelectorAll("#steps-body details");
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
    writeFormValues(loaded.values);
    setStatus("file-status", "Loaded your numbers from the file. Nothing was uploaded.");
    checkNow();
  });
  reader.addEventListener("error", function () {
    input.value = "";
    setStatus("file-status", "That file could not be read.");
  });
  reader.readAsText(file);
}

// ─────────────────────────── start ───────────────────────────

function clearForm() {
  window.clearTimeout(liveEditTimer);
  unpressExamples();
  byId("f-servicer-name").value = "";
  byId("f-loan-number").value = "";
  writeFormValues(blankFormValues());
  clearErrors();
  hasCheckedOnce = false;
  lastGoodCheck = null;
  byId("results").hidden = true;
  byId("verdict-live").textContent = "";
  setStatus("file-status", "");
  byId("form-heading").focus();
}

function start() {
  fillMonthOptions(byId("f-start-month"), "Pick a month");
  writeFormValues(blankFormValues());
  buildExampleButtons();

  // The form never submits anywhere (there is no action, and the CSP forbids one).
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    checkNow();
  });
  form.addEventListener("input", function () {
    updateBillsTotal();
    scheduleLiveEdit();
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
  initGuide({ panel: byId("guide-panel"), form: form, example: EXAMPLES[0] });
  initProofPanel(byId("proof-panel"));
  initSelfCheck(byId("selfcheck"));
  registerServiceWorker();

  runExampleFromAddress();
}

start();
