// selfcheck-ui.js — "Don't take our word for it" (SPEC D1).
//
// One button runs the page's own calculator against every worked case in
// engine/vectors.js, right here in the visitor's browser, and shows every
// number: what went in, what the regulation math says, and what the engine
// produced.
//
// The number of cases is never written down in this file. The button text comes
// from VECTORS.length and the summary line from the counts runSelfCheck returns,
// so the page stays right when more cases are added.
//
// Two rules this file keeps:
//   1. It LOADS nothing. The engine and the cases are ordinary imports at the top
//      of this file, so they arrive with the page. Pressing the button only runs
//      code that is already here. That is why the privacy panel's network counter
//      stays at 0.
//   2. It never hides a failure. Pass or not comes from the engine's own
//      runSelfCheck (the same function `npm test` runs). If a case does not
//      match, its row says so in words and lists every differing number.

import { el, svgEl, clear, scrollRegion } from "./dom.js";
import {
  runSelfCheck,
  VECTORS,
  DOC_ONLY_EXPECTED_KEYS,
  formatCents,
  MONTH_NAMES,
  escrowToCalendarMonth,
} from "./engine/index.js";

// The two cases that get a tag and a sentence, and sit at the top of the list.
const PINNED_IDS = ["TV02", "TV01"];
const CALLOUTS = {
  TV02: {
    tag: "From the regulation",
    sentence: "The worked example printed in the regulation itself (Appendix E).",
  },
  TV01: {
    tag: "Worked by hand",
    sentence: "Worked by hand from the regulation before any code existed.",
  },
};

// Plain-English names for the engine's result keys. The key itself is always
// shown too, so anyone reading the source can match them up.
const PLAIN_LABELS = {
  annualDisbursementsCents: "All bills for the year",
  baseMonthlyPaymentCents: "Base monthly payment (the bills divided by 12)",
  cushionCapCents: "Largest cushion the rule allows",
  stepTwoAddCents: "Step 2: amount that lifts the lowest month up to $0",
  requiredStartingBalanceCents: "Starting balance the rule calls for",
  differenceCents: "Real starting balance minus the one the rule calls for",
  surplusCents: "Surplus (money above the target)",
  shortageCents: "Shortage (money below the target)",
  deficiencyCents: "Deficiency (a balance below $0)",
  "lowPoint.projectedBalanceCents": "Lowest projected balance of the year",
  "lowPoint.month": "Month of the low point (counted from the start of the escrow year)",
  "lowPoint.calendarMonth": "Month of the low point (calendar month)",
  "lowPoint.lowestTargetBalanceCents": "Lowest target balance of the year",
  classification: "Verdict code",
  cite: "Paragraph of the regulation",
  nearLine: "Too close to a legal line to call?",
  "nearLine.line": "Too close to call: which line",
  "nearLine.distanceCents": "Too close to call: distance from the line",
  "nearLine.toleranceCents": "Too close to call: how close counts",
  "newMonthlyEscrowPayment.baseMonthlyCents": "New payment: base amount",
  "newMonthlyEscrowPayment.shortageSpreadOver12Cents": "New payment: shortage spread over 12 months",
  "newMonthlyEscrowPayment.deficiencySpreadCents": "New payment: deficiency repayment per month",
  "newMonthlyEscrowPayment.deficiencySpreadMonths": "New payment: months of deficiency repayment",
  "newMonthlyEscrowPayment.monthlyEscrowWhileRepayingDeficiencyCents":
    "New payment: total while the deficiency is being repaid",
  "newMonthlyEscrowPayment.monthlyEscrowAfterDeficiencyRepaidCents":
    "New payment: total after the deficiency is repaid",
  "paymentJumpDecomposition.oldMonthlyEscrowCents": "Payment change: old monthly escrow",
  "paymentJumpDecomposition.newMonthlyEscrowCents": "Payment change: new monthly escrow",
  "paymentJumpDecomposition.billsWentUpCents": "Payment change: part caused by bigger bills",
  "paymentJumpDecomposition.shortageRepaymentCents": "Payment change: part that repays the shortage",
  "paymentJumpDecomposition.shortageBreakdown.cushionRoseCents": "Shortage: part from a bigger cushion",
  "paymentJumpDecomposition.shortageBreakdown.timingNeedRoseCents": "Shortage: part from bill timing",
  "paymentJumpDecomposition.shortageBreakdown.lastYearCameInUnderProjectionCents":
    "Shortage: part from last year ending lower than planned",
};

// The columns of the 12-row month table, in the order they are shown.
const MONTH_TABLE_COLUMNS = [
  { key: "depositCents", label: "Deposit" },
  { key: "disbursementCents", label: "Bills paid" },
  { key: "step1TrialBalanceCents", label: "Step 1 trial balance" },
  { key: "targetBalanceCents", label: "Target balance" },
  { key: "projectedBalanceCents", label: "Projected balance" },
];

// ---------- small helpers ----------

// A 24px line icon. The words next to it always carry the meaning, so the icon
// is hidden from screen readers.
function icon(kind) {
  const shapes = [svgEl("circle", { attrs: { cx: 12, cy: 12, r: 9.25 } })];
  if (kind === "check") {
    shapes.push(svgEl("path", { attrs: { d: "M7.5 12.4l3.1 3.1 5.9-6.6" } }));
  } else {
    // "differs": a not-equal sign
    shapes.push(svgEl("path", { attrs: { d: "M7.75 10h8.5" } }));
    shapes.push(svgEl("path", { attrs: { d: "M7.75 14h8.5" } }));
    shapes.push(svgEl("path", { attrs: { d: "M14.25 7.25l-4.5 9.5" } }));
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

// Pass / Does not match: always an icon AND words, never color alone.
// `passWord` is "Pass" for a whole case and "Same" for one number inside it.
function matchMark(ok, passWord) {
  if (ok) {
    return el("span", { className: "selfcheck-mark is-pass" }, [icon("check"), passWord]);
  }
  return el("span", { className: "selfcheck-mark is-differs" }, [icon("differs"), "Does not match"]);
}

function monthName(calendarMonth) {
  const name = MONTH_NAMES[calendarMonth - 1];
  if (name === undefined) return "month " + calendarMonth;
  return name;
}

// The last piece of a path: "table[10].projectedBalanceCents" → "projectedBalanceCents".
function lastKeyOf(path) {
  const pieces = String(path).split(".");
  return pieces[pieces.length - 1];
}

// Money keys end in "Cents" and hold whole numbers; everything else is shown as
// plain text.
function formatValue(path, value) {
  if (value === undefined) return "(nothing)";
  if (value === null) return "(none)";
  const key = lastKeyOf(path);
  // The printed tables copied from the regulation are whole cents too.
  const isMoneyKey = key.endsWith("Cents") || String(path).startsWith("publishedTables.");
  if (typeof value === "number" && Number.isInteger(value) && isMoneyKey) {
    return formatCents(value);
  }
  if (key === "calendarMonth" && typeof value === "number") {
    return value + " (" + monthName(value) + ")";
  }
  if (typeof value === "object") {
    if (Object.keys(value).length === 0) return "(none)";
    return JSON.stringify(value);
  }
  return String(value);
}

// Numbers get the monospace face and never wrap; words (a verdict code, a
// sentence, an error message) use the text face and may wrap.
function valueCellClass(value) {
  if (typeof value === "number") return "selfcheck-value num";
  return "selfcheck-value";
}

// Turn nested data into flat rows. Paths are written exactly the way the
// engine's runSelfCheck writes them, so the two can be matched up:
//   { lowPoint: { month: 11 } }   →  path "lowPoint.month"
//   { servicerOptions: ["a"] }    →  path "servicerOptions[0]"
// Each row also keeps its list of keys (["servicerOptions", 0]) for readKeys.
// There is no list of "known" keys here: whatever the data holds gets a row.
function flatten(value, path, keys, rows) {
  const isContainer = value !== null && typeof value === "object";
  if (!isContainer || Object.keys(value).length === 0) {
    // A single value, or an empty list / empty object: one row.
    rows.push({ path: path, keys: keys, value: value });
    return;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      flatten(value[index], path + "[" + index + "]", keys.concat([index]), rows);
    }
    return;
  }
  for (const key of Object.keys(value)) {
    const childPath = path === "" ? key : path + "." + key;
    flatten(value[key], childPath, keys.concat([key]), rows);
  }
}

// Follow a list of keys into an object: readKeys(result, ["lowPoint", "month"]).
function readKeys(source, keys) {
  let current = source;
  for (const key of keys) {
    if (current === null || current === undefined) return undefined;
    current = current[key];
  }
  return current;
}

// Is `inner` the same place as `outer`, or somewhere inside it?
//   "table[2].depositCents" is inside "table[2]" and inside "table".
function isSameOrInside(inner, outer) {
  return inner === outer || inner.startsWith(outer + ".") || inner.startsWith(outer + "[");
}

// Did the ENGINE report a difference at this path? This file never compares
// numbers itself: every pass mark on the page comes from runSelfCheck's own
// `ok` and `mismatches`, the same ones `npm test` reads.
function engineReportsDifference(mismatches, path) {
  for (const mismatch of mismatches) {
    const where = String(mismatch.path);
    // "(engine)" means the engine produced no result at all for this case.
    if (where === "(engine)") return true;
    // The difference is this value, something inside it, or something around it.
    if (isSameOrInside(where, path) || isSameOrInside(path, where)) return true;
    // A list of the wrong length is reported as "servicerOptions.length".
    if (where.endsWith(".length")) {
      const listPath = where.slice(0, where.length - ".length".length);
      if (isSameOrInside(path, listPath)) return true;
    }
  }
  return false;
}

function plainLabelFor(path) {
  if (PLAIN_LABELS[path] !== undefined) return PLAIN_LABELS[path];
  if (path.startsWith("servicerOptions[")) {
    const number = Number(path.slice("servicerOptions[".length, path.length - 1)) + 1;
    return "What the servicer may do (" + number + ")";
  }
  return null;
}

// A wide table inside its own scrolling box, so the page never scrolls sideways.
function scrollBox(label, table) {
  return scrollRegion(label, [table]);
}

function headerRow(cells) {
  const row = el("tr");
  for (const cell of cells) {
    row.append(el("th", { className: cell.numeric ? "num" : "", text: cell.text, attrs: { scope: "col" } }));
  }
  return el("thead", {}, [row]);
}

function blockHeading(text) {
  return el("h3", { className: "selfcheck-block-title eyebrow", text: text });
}

// ---------- block 1: what went in ----------

function factRow(term, value, isNumber) {
  return el("div", { className: "selfcheck-fact" }, [
    el("dt", { text: term }),
    el("dd", { className: isNumber ? "num" : "", text: value }),
  ]);
}

function buildInputsBlock(caseId, account) {
  const block = el("section", { className: "selfcheck-block" }, [blockHeading("What went in")]);
  if (account === undefined || account === null) {
    block.append(el("p", { text: "The inputs for this case could not be read." }));
    return block;
  }

  const cushion = account.cushionMonths === 1 ? "1 month of bills" : account.cushionMonths + " months of bills";
  block.append(
    el("dl", { className: "selfcheck-facts" }, [
      factRow("First month of the escrow year", monthName(account.startMonth), false),
      factRow("Starting balance", formatCents(account.startingBalanceCents), true),
      factRow("Cushion allowed", cushion, false),
      factRow("Borrower up to date on payments", account.borrowerCurrent ? "Yes" : "No", false),
    ])
  );

  const body = el("tbody");
  for (const bill of account.disbursements) {
    const calendarMonth = escrowToCalendarMonth(bill.month, account.startMonth);
    body.append(
      el("tr", {}, [
        el("th", { text: bill.label, attrs: { scope: "row" } }),
        el("td", { text: monthName(calendarMonth) + " (month " + bill.month + " of the escrow year)" }),
        el("td", { className: "num", text: formatCents(bill.amountCents) }),
      ])
    );
  }
  const billsTable = el("table", { className: "data-table" }, [
    el("caption", { text: "The bills paid out of escrow during the year" }),
    headerRow([{ text: "Bill" }, { text: "Month paid" }, { text: "Amount", numeric: true }]),
    body,
  ]);
  block.append(scrollBox("Bills that went into case " + caseId, billsTable));

  // Only one case (the "why did my payment jump" one) carries last year's numbers.
  if (account.priorYear) {
    const prior = account.priorYear;
    block.append(
      el("p", {
        className: "small",
        text: "This case also takes last year’s numbers. They are used only to explain a payment change.",
      }),
      el("dl", { className: "selfcheck-facts" }, [
        factRow("Last year’s bills", formatCents(prior.annualDisbursementsCents), true),
        factRow("Last year’s monthly escrow payment", formatCents(prior.monthlyEscrowCents), true),
        factRow("Last year’s cushion", formatCents(prior.cushionCents), true),
        factRow("Last year’s Step 2 amount", formatCents(prior.stepTwoAddCents), true),
      ])
    );
  }
  return block;
}

// ---------- block 2: regulation math vs. this page's engine ----------

function keyNameCell(path) {
  const cell = el("th", { className: "selfcheck-key", attrs: { scope: "row" } });
  const plainLabel = plainLabelFor(path);
  if (plainLabel !== null) {
    cell.append(el("span", { className: "selfcheck-key-plain", text: plainLabel }));
  }
  cell.append(el("code", { className: "selfcheck-key-code", text: path }));
  return cell;
}

// Values the engine produced that the test file does not list (for example the
// echo of the inputs). They are shown as they are, and clearly NOT marked as
// checked, because nothing in the test file says what they should be.
function buildExtraOutputs(row, expectedPaths) {
  if (row.actual === null || row.actual === undefined) return null;
  const extraRows = [];
  for (const key of Object.keys(row.actual)) {
    if (key === "table") continue; // the month table has its own block below
    const produced = [];
    flatten(row.actual[key], key, [key], produced);
    for (const producedRow of produced) {
      if (!expectedPaths.includes(producedRow.path)) extraRows.push(producedRow);
    }
  }
  if (extraRows.length === 0) return null;

  const body = el("tbody");
  for (const extraRow of extraRows) {
    body.append(
      el("tr", {}, [
        keyNameCell(extraRow.path),
        el("td", { className: valueCellClass(extraRow.value), text: formatValue(extraRow.path, extraRow.value) }),
      ])
    );
  }
  const table = el("table", { className: "data-table selfcheck-compare" }, [
    el("caption", {
      text: "The test file does not list these, so there is nothing to compare them with. They are shown as the engine produced them.",
    }),
    headerRow([{ text: "What it is" }, { text: "What this page’s engine produced", numeric: true }]),
    body,
  ]);
  const word = extraRows.length === 1 ? " more value" : " more values";
  return el("details", { className: "selfcheck-months" }, [
    el("summary", {
      className: "selfcheck-months-toggle",
      text: "Show " + extraRows.length + word + " the engine produced (not compared)",
    }),
    scrollBox("Other values the engine produced for case " + row.id, table),
  ]);
}

function buildComparisonBlock(row, skippedKeys) {
  const block = el("section", { className: "selfcheck-block" }, [
    blockHeading("What the regulation math says vs. what this page’s engine produced"),
  ]);

  // Every top-level expected key except the month table (it has its own block
  // below) and the documentation-only keys (listed under the table).
  const expectedRows = [];
  const skippedHere = [];
  for (const key of Object.keys(row.expected)) {
    if (key === "table") continue;
    if (skippedKeys.includes(key)) {
      skippedHere.push(key);
      continue;
    }
    flatten(row.expected[key], key, [key], expectedRows);
  }

  const body = el("tbody");
  const expectedPaths = [];
  for (const expectedRow of expectedRows) {
    expectedPaths.push(expectedRow.path);
    const actualValue = readKeys(row.actual, expectedRow.keys);
    // The mark comes from the engine's own list of differences, never from a
    // comparison made here.
    const same = !engineReportsDifference(row.mismatches, expectedRow.path);
    body.append(
      el("tr", { className: same ? "" : "is-differs" }, [
        keyNameCell(expectedRow.path),
        el("td", { className: valueCellClass(expectedRow.value), text: formatValue(expectedRow.path, expectedRow.value) }),
        el("td", { className: valueCellClass(actualValue), text: formatValue(expectedRow.path, actualValue) }),
        el("td", {}, [matchMark(same, "Same")]),
      ])
    );
  }

  const table = el("table", { className: "data-table selfcheck-compare" }, [
    el("caption", { text: "Every result of case " + row.id + " that the test file lists, side by side" }),
    headerRow([
      { text: "What was checked" },
      { text: "What the regulation math says", numeric: true },
      { text: "What this page’s engine produced", numeric: true },
      { text: "Same?" },
    ]),
    body,
  ]);
  block.append(scrollBox("Side by side results for case " + row.id, table));

  if (skippedHere.length > 0) {
    block.append(
      el("p", { className: "small muted" }, [
        "Not compared in this case, on purpose: ",
        el("code", { text: skippedHere.join(", ") }),
        ". It is a note for human readers, not a number the engine produces.",
      ])
    );
  }

  const extras = buildExtraOutputs(row, expectedPaths);
  if (extras !== null) {
    block.append(extras);
  }
  return block;
}

// ---------- block 3: the monthly rows ----------

// Three cases (the regulation's Appendix E example and two HUD examples) also
// carry columns of numbers exactly as PRINTED in the source document. The engine
// compares those too and reports any difference under "publishedTables…". This
// note says so, and uses the engine's own finding for pass or not.
function buildPrintedNumbersNote(row) {
  let vector = null;
  for (const candidate of VECTORS) {
    if (candidate.id === row.id) vector = candidate;
  }
  if (vector === null || !vector.publishedTables) return null;

  let printedCount = 0;
  for (const key of Object.keys(vector.publishedTables)) {
    if (Array.isArray(vector.publishedTables[key])) {
      printedCount += vector.publishedTables[key].length;
    }
  }
  const printedDiffer = engineReportsDifference(row.mismatches, "publishedTables");

  let sentence =
    " This case also carries " +
    printedCount +
    " numbers exactly as printed in the source document. The engine’s month-by-month columns are compared " +
    "with those printed numbers too. ";
  if (printedDiffer) {
    sentence = sentence + "Some of them do not match. They are in the list at the top of this case.";
  } else {
    sentence = sentence + "All of them match.";
  }
  return el("p", { className: "selfcheck-months-summary" }, [matchMark(!printedDiffer, "Same"), sentence]);
}

function buildMonthsBlock(row) {
  const expectedTable = Array.isArray(row.expected.table) ? row.expected.table : [];
  const actualTable = row.actual && Array.isArray(row.actual.table) ? row.actual.table : [];
  const monthCount = expectedTable.length;
  const block = el("section", { className: "selfcheck-block" }, [
    blockHeading("The " + monthCount + " monthly rows"),
  ]);

  // Which months did the ENGINE report as different? ("table[2].depositCents"…)
  const problems = [];
  for (let index = 0; index < monthCount; index += 1) {
    if (!engineReportsDifference(row.mismatches, "table[" + index + "]")) continue;
    const labels = [];
    for (const column of MONTH_TABLE_COLUMNS) {
      if (engineReportsDifference(row.mismatches, "table[" + index + "]." + column.key)) {
        labels.push(column.label.toLowerCase());
      }
    }
    if (engineReportsDifference(row.mismatches, "table[" + index + "].month")) labels.push("month number");
    if (engineReportsDifference(row.mismatches, "table[" + index + "].calendarMonth")) labels.push("calendar month");
    const name = monthName(expectedTable[index].calendarMonth);
    problems.push("Month " + expectedTable[index].month + " (" + name + "): " + labels.join(", "));
  }

  if (problems.length === 0) {
    block.append(
      el("p", { className: "selfcheck-months-summary" }, [
        matchMark(true, "Same"),
        " All " + monthCount + " monthly rows match, in every column.",
      ])
    );
  } else {
    block.append(
      el("p", { className: "selfcheck-months-summary" }, [
        matchMark(false, "Same"),
        " " + problems.length + " of " + monthCount + " monthly rows do not match:",
      ])
    );
    const list = el("ul", { className: "selfcheck-problem-list" });
    for (const problem of problems) {
      list.append(el("li", { text: problem }));
    }
    block.append(list);
  }

  const printedNote = buildPrintedNumbersNote(row);
  if (printedNote !== null) {
    block.append(printedNote);
  }

  // The full table, one level deeper. Each cell shows the engine's number; a
  // cell the engine reported as different shows both numbers, in words.
  const body = el("tbody");
  for (let index = 0; index < monthCount; index += 1) {
    const expectedMonth = expectedTable[index];
    const actualMonth = actualTable[index];
    const tableRow = el("tr", {}, [
      el("th", {
        text: expectedMonth.month + " · " + monthName(expectedMonth.calendarMonth),
        attrs: { scope: "row" },
      }),
    ]);
    for (const column of MONTH_TABLE_COLUMNS) {
      const expectedValue = expectedMonth[column.key];
      const actualValue = actualMonth ? actualMonth[column.key] : undefined;
      const cellPath = "table[" + index + "]." + column.key;
      if (!engineReportsDifference(row.mismatches, cellPath)) {
        tableRow.append(el("td", { className: "num", text: formatValue(column.key, actualValue) }));
      } else {
        tableRow.append(
          el("td", { className: "num is-differs" }, [
            el("span", { className: "selfcheck-cell-line", text: "Regulation: " + formatValue(column.key, expectedValue) }),
            el("span", { className: "selfcheck-cell-line", text: "Engine: " + formatValue(column.key, actualValue) }),
          ])
        );
      }
    }
    body.append(tableRow);
  }

  const headerCells = [{ text: "Month" }];
  for (const column of MONTH_TABLE_COLUMNS) {
    headerCells.push({ text: column.label, numeric: true });
  }
  let caption = "The regulation math and this page’s engine agree on every number in this table.";
  if (problems.length > 0) {
    caption = "Cells that differ show both numbers.";
  }
  const table = el("table", { className: "data-table" }, [
    el("caption", { text: caption }),
    headerRow(headerCells),
    body,
  ]);

  const nested = el("details", { className: "selfcheck-months" }, [
    el("summary", { className: "selfcheck-months-toggle", text: "Show all " + monthCount + " months" }),
    scrollBox("Month by month numbers for case " + row.id, table),
  ]);
  // If something differs, the table is already open: a failure is never tucked away.
  if (problems.length > 0) {
    nested.open = true;
  }
  block.append(nested);
  return block;
}

// ---------- the engine's own list of differences ----------

function buildMismatchBlock(row) {
  const block = el("section", { className: "selfcheck-block selfcheck-mismatches" }, [
    blockHeading("Every number that does not match"),
  ]);
  const body = el("tbody");
  for (const mismatch of row.mismatches) {
    body.append(
      el("tr", { className: "is-differs" }, [
        el("th", { className: "selfcheck-where", attrs: { scope: "row" } }, [el("code", { text: mismatch.path })]),
        el("td", { className: valueCellClass(mismatch.expected), text: formatValue(mismatch.path, mismatch.expected) }),
        el("td", { className: valueCellClass(mismatch.actual), text: formatValue(mismatch.path, mismatch.actual) }),
      ])
    );
  }
  const table = el("table", { className: "data-table" }, [
    el("caption", { text: "Reported by the engine’s own checking function for case " + row.id }),
    headerRow([
      { text: "Where" },
      { text: "What the regulation math says", numeric: true },
      { text: "What this page’s engine produced", numeric: true },
    ]),
    body,
  ]);
  block.append(scrollBox("Numbers that do not match in case " + row.id, table));
  return block;
}

// ---------- one case = one <details> row ----------

function buildCaseBody(row, skippedKeys) {
  const parts = [];
  parts.push(el("p", { className: "selfcheck-source small muted", text: "Where this case comes from: " + row.source }));
  if (!row.ok && row.mismatches.length > 0) {
    parts.push(buildMismatchBlock(row));
  }
  parts.push(buildInputsBlock(row.id, row.account));
  if (row.expected) {
    parts.push(buildComparisonBlock(row, skippedKeys));
    parts.push(buildMonthsBlock(row));
  }
  return parts;
}

function buildCase(row, skippedKeys) {
  const callout = CALLOUTS[row.id];

  const summary = el("summary", { className: "selfcheck-summary" }, [
    matchMark(row.ok, "Pass"),
    el("span", { className: "selfcheck-id num", text: row.id }),
    el("span", { className: "selfcheck-title", text: row.title }),
  ]);
  if (callout) {
    summary.append(
      el("span", { className: "selfcheck-callout" }, [
        el("span", { className: "selfcheck-tag", text: callout.tag }),
        el("span", { className: "selfcheck-callout-text", text: callout.sentence }),
      ])
    );
  }

  const body = el("div", { className: "selfcheck-body" });
  const details = el("details", { className: row.ok ? "selfcheck-case" : "selfcheck-case is-differs" }, [
    summary,
    body,
  ]);

  // Dozens of rows with big tables would be a lot of page to build at once. So
  // the inside of a row is built the first time it is opened. This is only
  // drawing: nothing is loaded.
  let built = false;
  function buildOnce() {
    if (built) return;
    built = true;
    for (const part of buildCaseBody(row, skippedKeys)) {
      body.append(part);
    }
  }
  details.addEventListener("toggle", () => {
    if (details.open) buildOnce();
  });

  // A case that does not match starts open, so nobody has to go looking for it.
  if (!row.ok) {
    buildOnce();
    details.open = true;
  }
  return el("li", { className: "selfcheck-item" }, [details]);
}

// Pinned cases first (TV02, then TV01), then the rest in their normal order.
function orderResults(results) {
  const ordered = [];
  for (const id of PINNED_IDS) {
    for (const row of results) {
      if (row.id === id) ordered.push(row);
    }
  }
  for (const row of results) {
    if (!PINNED_IDS.includes(row.id)) ordered.push(row);
  }
  return ordered;
}

// ---------- the section ----------

function buildSkippedNote(skippedKeys) {
  const note = el("p", { className: "selfcheck-skipped small" });
  if (skippedKeys.length === 0) {
    note.textContent = "Every entry in the test file is compared, including every monthly row.";
    return note;
  }
  note.append("Left out on purpose: ");
  for (let index = 0; index < skippedKeys.length; index += 1) {
    if (index > 0) note.append(index === skippedKeys.length - 1 ? " and " : ", ");
    note.append(el("code", { text: skippedKeys[index] }));
  }
  const these = skippedKeys.length === 2 ? "These two are" : "These are";
  note.append(
    ". " +
      these +
      " notes for human readers inside the test file, not numbers the engine produces, so they are not " +
      "compared. Everything else is, including every monthly row."
  );
  return note;
}

export function initSelfCheck(container) {
  clear(container);
  const total = VECTORS.length;

  const intro = el("div", { className: "selfcheck-intro" }, [
    el("p", {
      text:
        "The expected numbers in these cases were worked out from the regulation’s own method before this " +
        "page’s calculator existed. The calculator had to match them, not the other way around.",
    }),
    el("p", {}, [
      "In the source code the cases live in the file ",
      el("code", { text: "docs/research/01-test-vectors.json" }),
      ", and the project’s test command, ",
      el("code", { text: "npm test" }),
      ", runs this exact same function. Pressing the button loads nothing new. The cases are already part " +
        "of this page, so the network counter at the bottom of the page stays at 0.",
    ]),
  ]);

  const runButton = el("button", {
    className: "btn btn-primary selfcheck-run",
    text: "Run all " + total + " checks on this device",
    attrs: { type: "button" },
  });

  // The summary line is announced to screen readers when it changes. It is in
  // the page from the start (empty), which is what makes the announcement work.
  const status = el("p", { className: "selfcheck-status", attrs: { role: "status" } });
  const output = el("div", { className: "selfcheck-output" });

  function run() {
    const report = runSelfCheck(VECTORS);
    const skippedKeys = Array.isArray(report.skippedKeys) ? report.skippedKeys : DOC_ONLY_EXPECTED_KEYS;

    // 1. The summary line.
    let sentence = report.passed + " of " + report.total + " checks passed on this device, just now.";
    if (report.failed > 0) {
      const verb = report.failed === 1 ? " did not match. It is" : " did not match. They are";
      sentence =
        sentence + " " + report.failed + verb + " marked “Does not match” and opened below, with every number that differs.";
    }
    status.className = report.failed === 0 ? "selfcheck-status is-pass" : "selfcheck-status is-differs";
    status.replaceChildren(icon(report.failed === 0 ? "check" : "differs"), el("span", { text: sentence }));

    // 2. What was left out, said out loud, then the list.
    const list = el("ol", { className: "selfcheck-list" });
    for (const row of orderResults(report.results)) {
      list.append(buildCase(row, skippedKeys));
    }
    output.replaceChildren(
      buildSkippedNote(skippedKeys),
      el("p", {
        className: "small muted",
        text: "Open any row to see what went in, what the regulation math says, and what this page’s engine produced.",
      }),
      list
    );

    runButton.textContent = "Run all " + total + " checks again";
  }

  runButton.addEventListener("click", run);

  container.append(
    el("div", { className: "selfcheck" }, [
      intro,
      el("div", { className: "selfcheck-actions" }, [runButton]),
      status,
      output,
    ])
  );
}
