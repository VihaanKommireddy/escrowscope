// tests/pipeline.test.js — the exact path the page uses, with no browser.
//
// app.js reads the form into plain strings and calls pipeline.runCheck(). These
// tests feed runCheck the same kind of strings: the three built-in examples,
// garbage, hostile text, negative balances, non-January escrow years, the
// "too close to call" band (SPEC E3), and a numbers-file round trip (SPEC D7).
//
// Run:  node --test tests/pipeline.test.js

import { test } from "node:test";
import assert from "node:assert/strict";

import { EXAMPLES } from "../examples.js";
import { VECTORS, accountFromVector } from "../engine/index.js";
import { letterPanelWords, statusWords, dialableDigits, flagTag } from "../render.js";
import { GUIDE_REGIONS, numberVisibleRegions } from "../guide.js";
import {
  BILL_KINDS,
  MAX_BILL_NAME_LENGTH,
  looksUnfinished,
  emptyValues,
  exampleToValues,
  readInputs,
  runCheck,
  billsTotal,
  valuesToFileText,
  fileTextToValues,
} from "../pipeline.js";

const HOSTILE = "<img src=x onerror=alert(1)>";

function exampleById(id) {
  const found = EXAMPLES.find((example) => example.id === id);
  assert.ok(found, "examples.js should have an example with id " + id);
  return found;
}

// A small valid form to bend in each test: TV01's numbers.
function goodValues() {
  const values = emptyValues();
  values.startMonth = "1";
  values.startingBalance = "1,500.00";
  values.bills = [
    { kind: "property-tax", name: "", amount: "1,800", month: "5" },
    { kind: "homeowners-insurance", name: "", amount: "1200.00", month: "7" },
    { kind: "property-tax", name: "", amount: "$1,800.00", month: "11" },
  ];
  return values;
}

function fieldsOf(check) {
  return check.errors.map((error) => error.field);
}

// ─────────────────────────── the three examples ───────────────────────────

test("there are exactly three built-in examples", () => {
  assert.equal(EXAMPLES.length, 3);
});

for (const example of EXAMPLES) {
  test("example '" + example.id + "' gives the verdict examples.js promises", () => {
    const check = runCheck(exampleToValues(example));
    assert.equal(check.ok, true, "errors: " + JSON.stringify(check.errors));
    assert.equal(check.result.classification, example.expect.classification);
    assert.equal(check.comparison.overall, example.expect.overall);
    assert.equal(check.verdict.tone, example.expect.tone);
    const flagKinds = check.comparison.flags.map((flag) => flag.kind).sort();
    assert.deepEqual(flagKinds, example.expect.flagKinds.slice().sort());
  });

  test("example '" + example.id + "' survives the trip through the form unchanged", () => {
    // values are strings and calendar months; reading them back must rebuild
    // the exact account and statement the example started from.
    const inputs = readInputs(exampleToValues(example));
    assert.deepEqual(inputs.errors, []);
    assert.deepEqual(inputs.account, example.account);
    assert.deepEqual(inputs.statement, example.statement);
    if (example.details.analysisDate) {
      assert.equal(inputs.details.analysisDate, example.details.analysisDate);
    }
  });

  test("example '" + example.id + "' fills every part of the results view", () => {
    const check = runCheck(exampleToValues(example));
    assert.equal(check.result.table.length, 12);
    assert.ok(check.verdict.label.length > 0);
    assert.ok(check.verdict.headline.length > 0);
    assert.ok(check.verdict.body.length > 0);
    assert.ok(check.steps.length >= 3, "show-the-math needs its steps");
    for (const step of check.steps) {
      assert.ok(step.title && step.plain && step.cite, "every step has a title, plain words and a cite");
    }
    assert.ok(check.next.length >= 1, "there is always a next step");
    assert.ok(check.letter.length > 200, "the letter has text");
    assert.equal(check.comparison.provided, true);
    assert.ok(check.comparison.rows.length >= 1);
  });
}

test("example 1: the jump from $400 to $500 is split into bills + shortage, nothing unexplained", () => {
  const check = runCheck(exampleToValues(exampleById("jumped-ok")));
  assert.ok(check.jump, "both payments were typed, so the jump is explained");
  assert.equal(check.jump.oldCents, 40000);
  assert.equal(check.jump.newCents, 50000);
  let total = 0;
  for (const part of check.jump.parts) {
    assert.equal(typeof part.sentence, "string");
    total = total + part.cents;
  }
  assert.equal(total, 10000, "the parts add up to the whole jump");
});

test("example 1: the servicer's line is drawn from the typed new payment (SPEC D5)", () => {
  const check = runCheck(exampleToValues(exampleById("jumped-ok")));
  assert.ok(check.servicerLine, "a new payment was typed");
  assert.equal(check.servicerLine.balancesCents.length, 12);
  assert.equal(typeof check.servicerLine.label, "string");
  assert.equal(typeof check.servicerLine.sentence, "string");
  assert.equal(check.servicerLine.includesShortageAddOn, true, "$500 = $475 base + $25 shortage add-on");
});

test("no new payment typed → no servicer line, no jump, and nothing breaks", () => {
  // $1,200.00 is exactly what TV01's bills need, so the account is on target.
  // (With a required refund the banner is amber even with nothing to compare: SPEC C4.)
  const values = goodValues();
  values.startingBalance = "1,200.00";
  const check = runCheck(values);
  assert.equal(check.ok, true);
  assert.equal(check.result.classification, "ON_TARGET");
  assert.equal(check.servicerLine, null);
  assert.equal(check.jump, null);
  assert.equal(check.comparison.overall, "not-provided");
  assert.equal(check.verdict.tone, "info");
});

test("example 2: the refund clock shows 30 days after the analysis date (SPEC D8)", () => {
  const check = runCheck(exampleToValues(exampleById("holding-too-much")));
  assert.ok(check.refund, "SURPLUS_REFUND_REQUIRED + a date → a deadline");
  assert.equal(check.refund.isoDate, "2026-10-01");
  assert.equal(typeof check.refund.display, "string");
});

test("the refund clock stays off without a date, and off for other verdicts", () => {
  const noDate = exampleToValues(exampleById("holding-too-much"));
  noDate.analysisDate = "";
  assert.equal(runCheck(noDate).refund, null);

  const shortage = exampleToValues(exampleById("jumped-ok"));
  shortage.analysisDate = "2026-09-01";
  assert.equal(runCheck(shortage).refund, null);
});

// ─────────────────────────── months ───────────────────────────

test("example 3: calendar months become escrow-year months when the year starts in April", () => {
  const values = exampleToValues(exampleById("cushion-too-big"));
  assert.equal(values.startMonth, "4");
  assert.deepEqual(values.bills.map((bill) => bill.month), ["6", "10", "3"], "the form shows June, October, March");

  const inputs = readInputs(values);
  assert.deepEqual(inputs.account.disbursements.map((bill) => bill.month), [3, 7, 12]);

  const check = runCheck(values);
  assert.equal(check.result.lowPoint.calendarMonth, 6, "the low point is in June");
  assert.equal(check.result.table[0].calendarMonth, 4, "the table starts in April");
});

// ─────────────────────────── garbage in ───────────────────────────

test("an empty form gives plain errors on the required boxes and never throws", () => {
  const check = runCheck(emptyValues());
  assert.equal(check.ok, false);
  const fields = fieldsOf(check);
  assert.ok(fields.includes("startMonth"));
  assert.ok(fields.includes("startingBalanceCents"));
  assert.ok(fields.includes("disbursements.0.amountCents"));
  assert.ok(fields.includes("disbursements.0.month"));
  assert.ok(fields.includes("disbursements.1.amountCents"));
  assert.equal(check.result, null);
  for (const error of check.errors) {
    assert.equal(typeof error.message, "string");
    assert.ok(error.message.length > 0);
  }
});

test("garbage in each money box is reported against that box", () => {
  const cases = [
    ["startingBalance", "abc", "startingBalanceCents"],
    ["startingBalance", "12.345", "startingBalanceCents"],
    ["startingBalance", "1.2.3", "startingBalanceCents"],
    ["startingBalance", "99999999999", "startingBalanceCents"],
    ["startingBalance", "1e5", "startingBalanceCents"],
    ["startingBalance", "NaN", "startingBalanceCents"],
    ["startingBalance", "Infinity", "startingBalanceCents"],
    ["currentPayment", "four hundred", "statement.currentMonthlyEscrowCents"],
    ["newPayment", "5oo", "statement.newMonthlyEscrowCents"],
    ["requiredMinimum", "12,34", "statement.requiredMinimumBalanceCents"],
  ];
  for (const [key, typed, field] of cases) {
    const values = goodValues();
    values[key] = typed;
    const check = runCheck(values);
    assert.equal(check.ok, false, key + " = " + typed + " should be refused");
    assert.ok(fieldsOf(check).includes(field), key + " = " + typed + " should point at " + field);
  }
});

test("bad bill rows point at the right row and the right box", () => {
  const values = goodValues();
  values.bills[1].amount = "lots";
  values.bills[2].month = "13";
  const check = runCheck(values);
  assert.equal(check.ok, false);
  assert.deepEqual(fieldsOf(check).sort(), ["disbursements.1.amountCents", "disbursements.2.month"]);
});

test("a bill of zero or less is refused by the engine's validation, against its row", () => {
  for (const typed of ["0", "0.00", "-50"]) {
    const values = goodValues();
    values.bills[0].amount = typed;
    const check = runCheck(values);
    assert.equal(check.ok, false, "a bill of " + typed + " should be refused");
    assert.ok(fieldsOf(check).includes("disbursements.0.amountCents"));
  }
});

test("no bill rows at all → one list-level error", () => {
  const values = goodValues();
  values.bills = [];
  const check = runCheck(values);
  assert.equal(check.ok, false);
  assert.ok(fieldsOf(check).includes("disbursements"));
});

test("bad first month, cushion, claimed kind, spread months and date are each caught", () => {
  const cases = [
    ["startMonth", "0", "startMonth"],
    ["startMonth", "13", "startMonth"],
    ["startMonth", "July", "startMonth"],
    ["cushionMonths", "3", "cushionMonths"],
    ["cushionMonths", "-1", "cushionMonths"],
    ["claimedKind", "jackpot", "statement.claimedKind"],
    ["analysisDate", "not a date", "details.analysisDate"],
    ["analysisDate", "2026-02-31", "details.analysisDate"],
  ];
  for (const [key, typed, field] of cases) {
    const values = goodValues();
    values[key] = typed;
    const check = runCheck(values);
    assert.equal(check.ok, false, key + " = " + typed + " should be refused");
    assert.ok(fieldsOf(check).includes(field), key + " = " + typed + " should point at " + field);
  }

  const values = goodValues();
  values.claimedKind = "shortage";
  values.claimedAmount = "300";
  values.spreadMonths = "a year";
  const check = runCheck(values);
  assert.ok(fieldsOf(check).includes("statement.shortageSpreadMonths"));
});

test("runCheck never throws, whatever it is handed", () => {
  const nasty = [
    undefined,
    null,
    42,
    "a string",
    [],
    {},
    { bills: "nope" },
    { bills: [null, 7, "x", {}] },
    { startMonth: {}, startingBalance: [], bills: [{ amount: {}, month: [] }] },
    { startMonth: "1", startingBalance: "100", bills: [{ kind: "__proto__", name: "constructor", amount: "5", month: "1" }] },
  ];
  for (const values of nasty) {
    let check;
    assert.doesNotThrow(() => {
      check = runCheck(values);
    });
    assert.equal(typeof check.ok, "boolean");
    assert.ok(Array.isArray(check.errors));
  }
});

// ─────────────────────────── hostile text ───────────────────────────

test("an <img onerror> bill name stays inert text in the account and in the letter", () => {
  const values = exampleToValues(exampleById("holding-too-much"));
  values.bills[0].kind = "other";
  values.bills[0].name = HOSTILE;
  values.servicerName = HOSTILE;
  values.loanNumber = "<script>alert(2)</script>";

  const check = runCheck(values);
  assert.equal(check.ok, true, "odd characters in a name are not an error: " + JSON.stringify(check.errors));
  assert.equal(check.account.disbursements[0].label, HOSTILE, "kept exactly as typed: not stripped, not escaped");
  assert.equal(check.details.servicerName, HOSTILE);
  assert.equal(typeof check.letter, "string", "the letter is a plain string that the page shows with .value");
  assert.ok(check.letter.includes(HOSTILE), "the servicer name appears in the letter as the same plain text");
  assert.equal(check.result.classification, "SURPLUS_REFUND_REQUIRED", "and the math is unchanged");
});

test("bill names: presets keep their label, 'other' uses the typed name, blank falls back", () => {
  const values = goodValues();
  values.bills[0] = { kind: "flood-insurance", name: "ignored", amount: "600", month: "3" };
  values.bills[1] = { kind: "other", name: "  Windstorm policy  ", amount: "450", month: "8" };
  values.bills[2] = { kind: "other", name: "", amount: "100", month: "9" };
  const labels = readInputs(values).account.disbursements.map((bill) => bill.label);
  assert.deepEqual(labels, ["Flood insurance", "Windstorm policy", "Other bill"]);
  assert.ok(BILL_KINDS.some((kind) => kind.value === "mortgage-insurance"), "PMI/MIP is offered by name");
});

// ─────────────────────────── negative balances ───────────────────────────

test("a negative starting balance can be typed with a minus, brackets, or the tick box", () => {
  const typedWays = [
    { startingBalance: "-200", balanceNegative: "" },
    { startingBalance: "−200.00", balanceNegative: "" },
    { startingBalance: "(200.00)", balanceNegative: "" },
    { startingBalance: "200", balanceNegative: "yes" },
    { startingBalance: "-200", balanceNegative: "yes" },
  ];
  for (const way of typedWays) {
    const values = goodValues();
    values.startingBalance = way.startingBalance;
    values.balanceNegative = way.balanceNegative;
    const check = runCheck(values);
    assert.equal(check.ok, true, JSON.stringify(way) + " → " + JSON.stringify(check.errors));
    assert.equal(check.account.startingBalanceCents, -20000, JSON.stringify(way));
    assert.ok(check.result.deficiencyCents > 0, "a balance below zero is a deficiency");
    assert.ok(check.result.classification.startsWith("DEFICIENCY"));
  }
});

test("a zero balance with the 'below zero' box ticked is plain zero, never negative zero (SPEC E5)", () => {
  const values = goodValues();
  values.startingBalance = "0.00";
  values.balanceNegative = "yes";
  const inputs = readInputs(values);
  assert.ok(Object.is(inputs.account.startingBalanceCents, 0));
});

test("behind on payments + a negative balance → the engine's own classification renders (SPEC E2)", () => {
  const values = goodValues();
  values.startingBalance = "200";
  values.balanceNegative = "yes";
  values.behind = "yes";
  const check = runCheck(values);
  assert.equal(check.ok, true, JSON.stringify(check.errors));
  assert.equal(check.account.borrowerCurrent, false);
  assert.ok(check.result.classification.startsWith("DEFICIENCY_BORROWER_NOT_CURRENT"), check.result.classification);
  assert.equal(check.result.newMonthlyEscrowPayment.deficiencySpreadMonths, 0, "the rule sets no schedule here");
  assert.ok(check.verdict.headline.length > 0 && check.verdict.body.length > 0);
});

// ─────────────────────────── too close to call (SPEC E3) ───────────────────────────

// TV01's bills need $1,200 to start. Any extra is surplus.
function surplusValues(startingBalance) {
  const values = goodValues();
  values.startingBalance = startingBalance;
  values.analysisDate = "2026-09-01";
  return values;
}

test("a $52.00 surplus is too close to the $50 line: no refund-required treatment, no refund date", () => {
  const check = runCheck(surplusValues("1,252.00"));
  assert.equal(check.ok, true, JSON.stringify(check.errors));
  assert.equal(check.result.surplusCents, 5200);
  assert.ok(check.result.nearLine, "within $7.00 of the $50.00 line");
  assert.equal(check.result.nearLine.line, "SURPLUS_50");
  assert.notEqual(check.verdict.tone, "flag", "the amber refund-required banner must not be used inside the band");
  assert.equal(check.refund, null, "no 'refund by' date when it is too close to call");
});

test("a $300.00 surplus is nowhere near the line: refund required, in amber, with its date", () => {
  const check = runCheck(surplusValues("1,500.00"));
  assert.equal(check.result.surplusCents, 30000);
  assert.equal(check.result.nearLine, null);
  assert.equal(check.result.classification, "SURPLUS_REFUND_REQUIRED");
  assert.equal(check.verdict.tone, "flag");
  assert.ok(check.refund);
  assert.equal(check.refund.isoDate, "2026-10-01");
});

// The same band, straight from the auditor's vectors (found by id, never by
// position). Each vector's account is typed into the form the way an example
// button would type it, with an analysis date, and run through the page's path.
function checkVector(id) {
  const vector = VECTORS.find((entry) => entry.id === id);
  assert.ok(vector, "engine/vectors.js should have " + id);
  const asExample = { account: accountFromVector(vector), statement: {}, details: { analysisDate: "2026-09-01" } };
  const check = runCheck(exampleToValues(asExample));
  assert.equal(check.ok, true, id + ": " + JSON.stringify(check.errors));
  return check;
}

test("TV26 (surplus $52.00): refund-required by the cents, but inside the band → calm, no refund date", () => {
  const check = checkVector("TV26");
  assert.equal(check.result.classification, "SURPLUS_REFUND_REQUIRED", "classification stays cent-exact");
  assert.notEqual(check.result.nearLine, null);
  assert.equal(check.result.nearLine.line, "SURPLUS_50");
  assert.equal(check.result.nearLine.distanceCents, 200);
  assert.equal(check.result.nearLine.toleranceCents, 700);
  assert.notEqual(check.verdict.tone, "flag");
  assert.equal(check.refund, null);
});

test("TV28 (surplus $57.00, exactly $7.00 from the line): still inside the band", () => {
  const check = checkVector("TV28");
  assert.notEqual(check.result.nearLine, null);
  assert.equal(check.result.nearLine.distanceCents, 700);
  assert.notEqual(check.verdict.tone, "flag");
  assert.equal(check.refund, null);
});

test("TV29 (surplus $57.01): outside the band → the normal refund-required treatment and date", () => {
  const check = checkVector("TV29");
  assert.equal(check.result.nearLine, null);
  assert.equal(check.result.classification, "SURPLUS_REFUND_REQUIRED");
  assert.equal(check.verdict.tone, "flag");
  assert.ok(check.refund);
  assert.equal(check.refund.isoDate, "2026-10-01");
});

test("TV27 (shortage $346.00 against a $350.00 month): inside the one-month band", () => {
  const check = checkVector("TV27");
  assert.notEqual(check.result.nearLine, null);
  assert.equal(check.result.nearLine.line, "ONE_MONTH_PAYMENT");
  assert.equal(check.result.nearLine.distanceCents, 400);
  assert.equal(check.refund, null);
  assert.ok(check.verdict.headline.length > 0 && check.verdict.body.length > 0);
});

test("every research vector runs through the page's path without an error", () => {
  for (const vector of VECTORS) {
    const check = checkVector(vector.id);
    assert.equal(check.result.classification, vector.expected.classification, vector.id);
    assert.equal(check.result.lowPoint.projectedBalanceCents, vector.expected.lowPoint.projectedBalanceCents, vector.id);
    assert.ok(check.verdict.headline.length > 0, vector.id + " has a verdict headline");
    assert.ok(check.letter.length > 0, vector.id + " has a letter");
  }
});

// ─────────────────────────── running total ───────────────────────────

test("the live yearly total adds the good rows and quietly skips unfinished ones", () => {
  const values = goodValues();
  assert.deepEqual(billsTotal(values), { cents: 480000, counted: 3, text: "$4,800.00" });
  values.bills[1].amount = "12.";
  values.bills[2].amount = "oops";
  values.bills.push({ kind: "other", name: "", amount: "", month: "" });
  const total = billsTotal(values);
  assert.equal(total.cents, 181200);
  assert.equal(total.counted, 2);
  assert.doesNotThrow(() => billsTotal(undefined));
});

// ─────────────────────────── D7: the numbers file ───────────────────────────

test("download → load gives back the same numbers and the same verdict", () => {
  for (const example of EXAMPLES) {
    const before = exampleToValues(example);
    const loaded = fileTextToValues(valuesToFileText(before));
    assert.equal(loaded.ok, true);
    assert.deepEqual(loaded.values, before);
    assert.equal(runCheck(loaded.values).result.classification, example.expect.classification);
  }
});

test("the numbers file never holds the servicer name or the loan number", () => {
  const values = goodValues();
  values.servicerName = "Sample Servicing LLC";
  values.loanNumber = "0012345678";
  const text = valuesToFileText(values);
  assert.ok(!text.includes("Sample Servicing LLC"));
  assert.ok(!text.includes("0012345678"));
  const loaded = fileTextToValues(text);
  assert.equal(loaded.values.servicerName, "");
  assert.equal(loaded.values.loanNumber, "");
});

test("a loaded file is untrusted: wrong files are refused, odd contents are boxed in", () => {
  const refused = ["", "not json", "[]", "null", "42", '{"kind":"something-else","version":1,"values":{}}',
    '{"kind":"escrowscope-numbers","version":99,"values":{}}', '{"kind":"escrowscope-numbers","version":1}',
    '{"kind":"escrowscope-numbers","version":1,"values":[]}', "x".repeat(200001)];
  for (const text of refused) {
    const loaded = fileTextToValues(text);
    assert.equal(loaded.ok, false);
    assert.equal(typeof loaded.problem, "string");
  }
  assert.equal(fileTextToValues(undefined).ok, false);

  const sneaky = {
    kind: "escrowscope-numbers",
    version: 1,
    values: {
      startMonth: { toString: "nope" },
      startingBalance: HOSTILE,
      unknownKey: "dropped",
      __proto__: { polluted: true },
      bills: [{ kind: HOSTILE, name: "n".repeat(5000), amount: ["1"], month: 5, extra: "dropped" }, null, "row"],
    },
  };
  const loaded = fileTextToValues(JSON.stringify(sneaky));
  assert.equal(loaded.ok, true);
  assert.equal(loaded.values.startMonth, "", "objects are not accepted as text");
  assert.equal(loaded.values.startingBalance, HOSTILE, "text stays text; the page only ever puts it in .value");
  assert.equal(loaded.values.unknownKey, undefined);
  assert.equal({}.polluted, undefined);
  assert.equal(loaded.values.bills.length, 1);
  assert.equal(loaded.values.bills[0].name.length, MAX_BILL_NAME_LENGTH, "a long name is cut to the one name limit");
  assert.equal(loaded.values.bills[0].amount, "");
  assert.equal(loaded.values.bills[0].month, "5");
  assert.equal(loaded.values.bills[0].extra, undefined);

  // And it then fails validation like anything typed by hand, instead of running.
  const check = runCheck(loaded.values);
  assert.equal(check.ok, false);
  assert.ok(fieldsOf(check).includes("startingBalanceCents"));

  const tooManyRows = { kind: "escrowscope-numbers", version: 1, values: { bills: [] } };
  for (let count = 0; count < 500; count++) tooManyRows.values.bills.push({ amount: "1", month: "1" });
  assert.equal(fileTextToValues(JSON.stringify(tooManyRows)).values.bills.length, 24);
});

// ─────────────────────────── fix orders 1 and 2 (2026-09-19) ───────────────────────────

// A2: the letter is only called a notice of error when the engine says it is one.
test("A2: which letter it is comes from the engine, and the panel is worded from that", () => {
  const explain = runCheck(exampleToValues(exampleById("holding-too-much")));
  assert.equal(explain.letterKind, "REQUEST_FOR_INFORMATION");
  const error = runCheck(exampleToValues(exampleById("cushion-too-big")));
  assert.equal(error.letterKind, "NOTICE_OF_ERROR");

  const asking = letterPanelWords("REQUEST_FOR_INFORMATION");
  assert.equal(asking.title, "A letter asking your servicer to explain");
  assert.ok(!/notice of error/i.test(asking.title + asking.lede), "a please-explain letter is never called a notice of error");
  assert.ok(/request for information/i.test(asking.lede));

  const notice = letterPanelWords("NOTICE_OF_ERROR");
  assert.ok(/notice of error/i.test(notice.lede));

  for (const odd of [undefined, "", null, "SOMETHING_NEW", 7]) {
    const words = letterPanelWords(odd);
    assert.ok(words.title.length > 0 && words.lede.length > 0, "never blank");
    assert.ok(!/notice of error/i.test(words.title + words.lede), "an unknown kind never claims an error");
  }
  for (const words of [asking, notice, letterPanelWords("")]) {
    assert.ok(words.lede.includes("[brackets]"), "the lede tells people to fill in the parts in [brackets]");
  }
  assert.equal(runCheck(emptyValues()).letterKind, "", "no letter kind when there are no results");
});

// B2 + fix order 3: a typed "required minimum" that equals the federal low point.
// The engine's rule has three cases; these tests pin the two the page cares about
// by field name, flag kind, status and tone, never by the engine's sentences.
const CUSHION_KINDS = ["CUSHION_OVER_CAP", "CUSHION_MAYBE_OVER_CAP"];

test("B2 case (a): low point typed as the minimum AND a matching claim → a warning under that box, no cushion flag", () => {
  const values = exampleToValues(exampleById("holding-too-much")); // TV01: low point $1,100, cap $800, surplus $300 claimed
  const before = runCheck(values);
  values.requiredMinimum = "1,100.00";
  const check = runCheck(values);
  assert.equal(check.ok, true);

  const onTheBox = check.warnings.filter((warning) => warning.field === "statement.requiredMinimumBalanceCents");
  assert.equal(onTheBox.length, 1, "exactly one warning, mapped to the required-minimum box");
  assert.ok(onTheBox[0].message.length > 0);
  assert.ok(!check.comparison.flags.some((flag) => CUSHION_KINDS.includes(flag.kind)), "no cushion flag of either kind");
  const row = check.comparison.rows.find((entry) => entry.key === "requiredMinimumBalance");
  assert.equal(row.status, "not-compared");
  assert.equal(check.comparison.overall, before.comparison.overall, "the mix-up does not turn the comparison into look-here");
  assert.equal(check.verdict.tone, before.verdict.tone, "and does not change the banner's tone");
});

test("B2 case (c): ONLY the low point typed as the minimum → amber CUSHION_MAYBE_OVER_CAP, no nudge, still a request for information", () => {
  const values = goodValues(); // TV01's account, nothing from the statement typed yet
  values.requiredMinimum = "1,100.00";
  const check = runCheck(values);
  assert.equal(check.ok, true);

  const kinds = check.comparison.flags.map((flag) => flag.kind);
  assert.ok(kinds.includes("CUSHION_MAYBE_OVER_CAP"), "got: " + JSON.stringify(kinds));
  assert.equal(check.verdict.tone, "flag");
  assert.equal(check.comparison.overall, "look-here");
  const fromNudge = check.warnings.filter((warning) => warning.field === "statement.requiredMinimumBalanceCents");
  assert.equal(fromNudge.length, 0, "a flag OR a nudge, never both");
  assert.equal(check.letterKind, "REQUEST_FOR_INFORMATION");
});

test("B2 auditor's repro: an over-the-cap cushion on a not-current account is amber, never 'matches'", () => {
  const values = emptyValues();
  values.startMonth = "1";
  values.startingBalance = "1,800.00";
  values.behind = "yes";
  values.requiredMinimum = "1,800.00";
  values.newPayment = "600.00";
  values.bills = [
    { kind: "property-tax", name: "", amount: "3,600", month: "6" },
    { kind: "property-tax", name: "", amount: "3,600", month: "12" },
  ];
  const check = runCheck(values);
  assert.equal(check.ok, true, JSON.stringify(check.errors));
  assert.notEqual(check.comparison.overall, "matches");
  assert.equal(check.verdict.tone, "flag");
  assert.ok(check.comparison.flags.some((flag) => CUSHION_KINDS.includes(flag.kind)), "the cushion finding is not hidden");
});

test("fix order 3: a flag kind the page has never heard of still gets a full label", () => {
  assert.equal(flagTag("CUSHION_MAYBE_OVER_CAP"), "Check this number");
  assert.equal(flagTag("CUSHION_OVER_CAP"), "Cushion above the limit");
  for (const odd of ["SOMETHING_NEW", "", undefined, null, "toString", "__proto__", 4]) {
    assert.equal(flagTag(odd), "Look here", "never blank, never borrowed from another kind");
  }
});

test("B2: a comparison status the page has never heard of is never blank and never a match", () => {
  assert.deepEqual(
    [statusWords("match").text, statusWords("differs").text, statusWords("over-limit").text, statusWords("not-compared").text],
    ["Matches", "Differs", "Over the limit", "Not compared"]
  );
  assert.equal(statusWords("not-compared").look, "neutral");
  assert.notEqual(statusWords("not-compared").iconName, "check");
  for (const odd of [undefined, null, "", "MATCH", "matches", "toString", "__proto__", "constructor", 3, {}]) {
    const words = statusWords(odd);
    assert.ok(words.text.length > 0, "never blank");
    assert.notEqual(words.text, "Matches");
    assert.notEqual(words.look, "match");
    assert.notEqual(words.iconName, "check");
  }
});

// A15: only contact details the engine really sent are shown.
test("A15: a next step without a phone number is fine, and no invented number appears", () => {
  for (const example of EXAMPLES) {
    const check = runCheck(exampleToValues(example));
    for (const step of check.next) {
      assert.ok(step.phone === undefined || (typeof step.phone === "string" && step.phone.trim() !== ""));
      assert.ok(!JSON.stringify(step).includes("HOPE"), "the counselor step carries a link, not the HOPE number");
    }
  }
  assert.equal(dialableDigits("855-411-2372"), "8554112372");
  for (const notDialable of [undefined, null, "", "call them", "888-995-HOPE", 8554112372, "411"]) {
    assert.equal(dialableDigits(notDialable), "", "shown as words, never as a broken tel: link");
  }
});

// B3: only the boxes on the page get a number, and the form and the guide share one numbering.
test("B3: box numbers have no gaps whether the pay-in-full box is hidden or shown", () => {
  const allShown = numberVisibleRegions([]);
  const couponHidden = numberVisibleRegions(["lump-sum"]);
  for (const numbers of [allShown, couponHidden]) {
    const used = Object.values(numbers).sort((a, b) => a - b);
    assert.deepEqual(used, used.map((unused, index) => index + 1), "1, 2, 3… with no gaps and no repeats");
  }
  assert.equal(Object.keys(allShown).length, GUIDE_REGIONS.length);
  assert.equal(couponHidden["lump-sum"], undefined, "a hidden box has no number at all");
  assert.equal(couponHidden["claimed"], 6);
  assert.equal(couponHidden["analysis-date"], 7, "the box after the hidden one moves up: no jump from 6 to 8");
  assert.equal(couponHidden["bills"], 8);
  assert.equal(allShown["analysis-date"], 8);
  assert.doesNotThrow(() => numberVisibleRegions(undefined));
});

test("B3: the form in check.html lists its boxes in the same order as the guide numbers them", async () => {
  // A source scan: the numbering only reads right if the page order matches GUIDE_REGIONS.
  const { readFileSync } = await import("node:fs");
  // (The form lived in index.html while the site was one page. It is on check.html now.)
  const html = readFileSync(new URL("../check.html", import.meta.url), "utf8");
  const keysInPageOrder = [];
  for (const piece of html.split('data-guide-region="').slice(1)) {
    keysInPageOrder.push(piece.slice(0, piece.indexOf('"')));
  }
  assert.deepEqual(keysInPageOrder, GUIDE_REGIONS.map((region) => region.key));
});

// #12: a half-typed amount is not an error yet.
test("#12: amounts that are still being typed are recognised, finished ones are not", () => {
  for (const partial of ["1,", "1,2", "12,34", "1,234.", "-", "$", "(", "1,234,5"]) {
    assert.equal(looksUnfinished(partial), true, partial);
  }
  for (const done of ["", "1,234", "1234.5", "1,234.56", "abc", "12.345", "1.2.3"]) {
    assert.equal(looksUnfinished(done), false, done);
  }
  assert.doesNotThrow(() => looksUnfinished(undefined));
});

// #13: one name-length limit everywhere.
test("#13: a bill name has ONE length limit: typed, loaded from a file, and reported on the name", () => {
  assert.equal(MAX_BILL_NAME_LENGTH, 60);
  const values = goodValues();
  values.bills[0] = { kind: "other", name: "n".repeat(MAX_BILL_NAME_LENGTH), amount: "1,800", month: "5" };
  assert.equal(runCheck(values).ok, true, "exactly at the limit is fine");

  values.bills[0].name = "n".repeat(MAX_BILL_NAME_LENGTH + 1);
  const tooLong = runCheck(values);
  assert.equal(tooLong.ok, false);
  assert.ok(fieldsOf(tooLong).includes("disbursements.0.label"), "reported against the NAME, not the amount");

  const fromFile = fileTextToValues(valuesToFileText(values));
  assert.equal(fromFile.values.bills[0].name.length, MAX_BILL_NAME_LENGTH, "a file cannot smuggle in a longer name");
});

// #6: the analysis date reaches the letter's details.
test("#6: the typed analysis date is handed to the letter", () => {
  const inputs = readInputs(exampleToValues(exampleById("holding-too-much")));
  assert.equal(inputs.details.analysisDate, "2026-09-01");
});

// Docs-writer finding (Phase 5): pipeline.js used to refuse a spread over 120 months
// while the engine allowed 360. One limit now, owned by the engine.
test("spread months: the page and the engine share ONE limit (engine.MAX_SPREAD_MONTHS)", async () => {
  const engine = await import("../engine/index.js");
  const { exampleToValues, readInputs } = await import("../pipeline.js");
  const { EXAMPLES } = await import("../examples.js");
  const base = exampleToValues(EXAMPLES[0]);
  const atLimit = readInputs({ ...base, spreadMonths: String(engine.MAX_SPREAD_MONTHS) });
  assert.equal(atLimit.errors.filter((e) => e.field === "statement.shortageSpreadMonths").length, 0);
  assert.equal(atLimit.statement.shortageSpreadMonths, engine.MAX_SPREAD_MONTHS);
  const pastLimit = readInputs({ ...base, spreadMonths: String(engine.MAX_SPREAD_MONTHS + 1) });
  assert.equal(pastLimit.errors.filter((e) => e.field === "statement.shortageSpreadMonths").length, 1);
  const twoHundred = readInputs({ ...base, spreadMonths: "200" });
  assert.equal(twoHundred.errors.filter((e) => e.field === "statement.shortageSpreadMonths").length, 0, "200 months used to be refused by the page only");
});
