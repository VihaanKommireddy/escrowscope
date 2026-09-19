// tests/selfcheck.test.js — tests for the checker itself (engine/selfcheck.js).
// A self-check that always says "pass" would be worse than none, so most of
// these tests feed it WRONG expectations and make sure it notices.

import { test } from "node:test";
import assert from "node:assert/strict";

import { VECTORS } from "../engine/vectors.js";
import { findMismatches } from "../engine/selfcheck.js";
import {
  runSelfCheck,
  accountFromVector,
  DOC_ONLY_EXPECTED_KEYS,
  analyze,
  projectWithPayment,
} from "../engine/index.js";

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

// Vectors are always looked up by id, never by their position in the file.
function byId(id) {
  const vector = VECTORS.find((item) => item.id === id);
  assert.ok(vector, "no vector with id " + id);
  return vector;
}

test("DOC_ONLY_EXPECTED_KEYS is exactly the two documentation keys", () => {
  assert.deepStrictEqual(DOC_ONLY_EXPECTED_KEYS, ["exactArithmeticReference", "whatGoesWrong"]);
});

test("every other expected key in every vector exists on the engine's result", () => {
  for (const vector of VECTORS) {
    const result = analyze(accountFromVector(vector));
    for (const key of Object.keys(vector.expected)) {
      if (DOC_ONLY_EXPECTED_KEYS.includes(key)) continue;
      assert.ok(key in result, vector.id + ": result is missing `" + key + "`");
    }
  }
});

test("accountFromVector lifts startMonth next to the inputs", () => {
  const account = accountFromVector(byId("TV02")); // escrow year starts in July
  assert.equal(account.startMonth, 7);
  assert.equal(account.startingBalanceCents, 104000);
  assert.equal(account.disbursements.length, 3);
});

test("report shape: totals, skippedKeys, and per-row account / expected / actual", () => {
  const report = runSelfCheck(VECTORS);
  assert.equal(report.total, VECTORS.length);
  assert.equal(report.passed + report.failed, report.total);
  assert.deepStrictEqual(report.skippedKeys, ["exactArithmeticReference", "whatGoesWrong"]);
  assert.equal(report.results.length, VECTORS.length);

  const first = report.results.find((row) => row.id === "TV01");
  assert.ok(first, "TV01 should be in the report");
  assert.equal(typeof first.title, "string");
  assert.equal(typeof first.source, "string");
  assert.equal(first.ok, true);
  assert.deepStrictEqual(first.mismatches, []);
  assert.equal(first.account.startingBalanceCents, 150000);
  assert.equal(first.expected.surplusCents, 30000);
  assert.equal(first.actual.surplusCents, 30000);
});

test("rows say which documentation keys they skipped", () => {
  const report = runSelfCheck(VECTORS);
  const tv15 = report.results.find((row) => row.id === "TV15");
  const tv18 = report.results.find((row) => row.id === "TV18");
  const tv01 = report.results.find((row) => row.id === "TV01");
  assert.deepStrictEqual(tv15.skippedKeys, ["exactArithmeticReference"]);
  assert.deepStrictEqual(tv18.skippedKeys, ["whatGoesWrong"]);
  assert.deepStrictEqual(tv01.skippedKeys, []);
});

test("a wrong top-level number is caught, with its path", () => {
  const broken = copy(byId("TV01"));
  broken.expected.surplusCents = 30001;
  const report = runSelfCheck([broken]);
  assert.equal(report.passed, 0);
  assert.equal(report.failed, 1);
  assert.equal(report.results[0].ok, false);
  assert.deepStrictEqual(report.results[0].mismatches, [
    { path: "surplusCents", expected: 30001, actual: 30000 },
  ]);
});

test("a wrong number deep inside a table row is caught", () => {
  const broken = copy(byId("TV01"));
  broken.expected.table[10].projectedBalanceCents = 1;
  const report = runSelfCheck([broken]);
  assert.equal(report.results[0].ok, false);
  assert.deepStrictEqual(report.results[0].mismatches, [
    { path: "table[10].projectedBalanceCents", expected: 1, actual: 110000 },
  ]);
});

test("a wrong classification string, cite, or option list is caught", () => {
  const broken = copy(byId("TV01"));
  broken.expected.classification = "ON_TARGET";
  broken.expected.cite = "12 CFR 1024.17(d)(2)";
  broken.expected.servicerOptions = [];
  const report = runSelfCheck([broken]);
  const paths = report.results[0].mismatches.map((mismatch) => mismatch.path);
  assert.deepStrictEqual(paths, ["classification", "cite", "servicerOptions.length"]);
});

test("a missing table row is caught (the table must have all 12 rows)", () => {
  const broken = copy(byId("TV01"));
  broken.expected.table.push(copy(broken.expected.table[0]));
  const report = runSelfCheck([broken]);
  assert.equal(report.results[0].ok, false);
});

test("an expected key the engine does not produce is caught, not skipped", () => {
  const broken = copy(byId("TV01"));
  broken.expected.someNewFieldCents = 5;
  const report = runSelfCheck([broken]);
  assert.deepStrictEqual(report.results[0].mismatches, [
    { path: "someNewFieldCents", expected: 5, actual: undefined },
  ]);
});

test("1 is not '1': the comparison is strict about types", () => {
  const broken = copy(byId("TV01"));
  broken.expected.surplusCents = "30000";
  const report = runSelfCheck([broken]);
  assert.equal(report.results[0].ok, false);
});

test("a wrong number in a published (printed) table is caught", () => {
  const broken = copy(byId("TV02")); // TV02 carries Appendix E's three printed tables
  broken.publishedTables.step3[6] = 26001;
  const report = runSelfCheck([broken]);
  assert.deepStrictEqual(report.results[0].mismatches, [
    { path: "publishedTables.step3[6]", expected: 26001, actual: 26000 },
  ]);
});

test("a vector the engine refuses (invalid account) is reported as a failure, not a crash", () => {
  const broken = copy(byId("TV01"));
  broken.inputs.disbursements = [];
  const report = runSelfCheck([broken]);
  assert.equal(report.failed, 1);
  assert.equal(report.results[0].ok, false);
  assert.equal(report.results[0].mismatches[0].path, "(engine)");
});

test("runSelfCheck does not change the vectors it is given", () => {
  const before = JSON.stringify(VECTORS);
  runSelfCheck(VECTORS);
  assert.equal(JSON.stringify(VECTORS), before);
});

test("runSelfCheck is repeatable: two runs give identical reports", () => {
  assert.deepStrictEqual(runSelfCheck(VECTORS), runSelfCheck(VECTORS));
});

// TV18's `whatGoesWrong` block is documentation (what a WRONG engine would
// print if it projected with a typed-in payment instead of bills ÷ 12). The
// self-check skips it, so it is verified here instead, through
// projectWithPayment: low point of the wrong-deposit projection − cushion cap.
test("TV18 whatGoesWrong: the bogus numbers are reproduced through projectWithPayment", () => {
  const tv18 = VECTORS.find((vector) => vector.id === "TV18");
  const account = accountFromVector(tv18);
  const result = analyze(account);
  const documented = tv18.expected.whatGoesWrong;

  const cases = [
    documented.ifLastYearsPaymentIsUsedAsDeposit,
    documented.ifNewTotalPaymentIncludingShortageSpreadIsUsed,
  ];
  for (const wrongCase of cases) {
    const balances = projectWithPayment(account, wrongCase.depositCents);
    const lowPoint = Math.min(...balances);
    assert.equal(lowPoint - result.cushionCapCents, wrongCase.bogusSurplusCents);
  }
  assert.equal(result.differenceCents, documented.correctDifferenceCents);
});

// TV15's `exactArithmeticReference` is the other documentation key: what you
// get with no rounding at all. Check the claim it documents — the whole-cent
// method drifts from exact arithmetic by only a few cents.
test("TV15 exactArithmeticReference: whole-cent rounding drifts by under 7 cents", () => {
  const tv15 = VECTORS.find((vector) => vector.id === "TV15");
  const result = analyze(accountFromVector(tv15));
  const exact = tv15.expected.exactArithmeticReference;
  const driftRequired = Math.abs(result.requiredStartingBalanceCents - exact.requiredStartingBalanceExactCents);
  const driftSurplus = Math.abs(result.surplusCents - exact.surplusExactCents);
  assert.ok(driftRequired < 7, "required start drifted " + driftRequired + " cents");
  assert.ok(driftSurplus < 7, "surplus drifted " + driftSurplus + " cents");
});

// ---------- can the checker be fooled? (SPEC E3a.6) ----------
// findMismatches is the comparing rule runSelfCheck uses. These tests hand it
// deliberately broken FAKE results. The browser proof is only worth something
// if the checker itself cannot be tricked.

function pathsOf(mismatches) {
  return mismatches.map((mismatch) => mismatch.path);
}

const EXPECTED_SAMPLE = {
  surplusCents: 5000,
  nearLine: { line: "SURPLUS_50", distanceCents: 0, toleranceCents: 700 },
  lowPoint: { projectedBalanceCents: 85000, month: 11 },
  servicerOptions: ["refund the surplus"],
  table: [{ month: 1, depositCents: 40000 }, { month: 2, depositCents: 40000 }],
};

function fakeResult() {
  return copy(EXPECTED_SAMPLE);
}

test("checker: an identical result has no mismatches", () => {
  assert.deepStrictEqual(findMismatches(EXPECTED_SAMPLE, fakeResult()), []);
});

test("checker: EXTRA keys on the actual side are ignored at every depth", () => {
  const actual = fakeResult();
  actual.inputs = { startMonth: 1 };
  actual.nearLine.side = "at-or-above";
  actual.nearLine.amountCents = 5000;
  actual.lowPoint.extra = true;
  actual.table[0].note = "hello";
  assert.deepStrictEqual(findMismatches(EXPECTED_SAMPLE, actual), []);
});

test("checker: a MISSING nested key fails", () => {
  const actual = fakeResult();
  delete actual.nearLine.toleranceCents;
  delete actual.lowPoint.month;
  assert.deepStrictEqual(pathsOf(findMismatches(EXPECTED_SAMPLE, actual)), ["nearLine.toleranceCents", "lowPoint.month"]);
});

test("checker: null where an object is expected fails, and an object where null is expected fails", () => {
  const gotNull = fakeResult();
  gotNull.nearLine = null;
  assert.deepStrictEqual(pathsOf(findMismatches(EXPECTED_SAMPLE, gotNull)), ["nearLine"]);

  const expectsNull = copy(EXPECTED_SAMPLE);
  expectsNull.nearLine = null;
  assert.deepStrictEqual(pathsOf(findMismatches(expectsNull, fakeResult())), ["nearLine"]);
  assert.deepStrictEqual(findMismatches(expectsNull, gotNull), []);

  const gotUndefined = fakeResult();
  delete gotUndefined.nearLine;
  assert.deepStrictEqual(pathsOf(findMismatches(expectsNull, gotUndefined)), ["nearLine"]);
});

test("checker: a table with one row too few or one too many fails", () => {
  const short = fakeResult();
  short.table.pop();
  assert.deepStrictEqual(pathsOf(findMismatches(EXPECTED_SAMPLE, short)), ["table.length"]);
  const long = fakeResult();
  long.table.push({ month: 3, depositCents: 40000 });
  assert.deepStrictEqual(pathsOf(findMismatches(EXPECTED_SAMPLE, long)), ["table.length"]);
});

test("checker: the real 12-row table — 11 or 13 rows fail against a real vector", () => {
  const vector = byId("TV01");
  const real = analyze(accountFromVector(vector));
  const eleven = copy(real);
  eleven.table.pop();
  const thirteen = copy(real);
  thirteen.table.push(copy(real.table[0]));
  assert.deepStrictEqual(findMismatches(vector.expected.table, real.table), []);
  assert.deepStrictEqual(pathsOf(findMismatches(vector.expected.table, eleven.table)), [".length"]);
  assert.deepStrictEqual(pathsOf(findMismatches(vector.expected.table, thirteen.table)), [".length"]);
});

test("checker: servicerOptions must match exactly — same length, same order", () => {
  const expected = { servicerOptions: ["a", "b"] };
  assert.deepStrictEqual(findMismatches(expected, { servicerOptions: ["a", "b"] }), []);
  assert.deepStrictEqual(pathsOf(findMismatches(expected, { servicerOptions: ["b", "a"] })), ["servicerOptions[0]", "servicerOptions[1]"]);
  assert.deepStrictEqual(pathsOf(findMismatches(expected, { servicerOptions: ["a", "b", "c"] })), ["servicerOptions.length"]);
  assert.deepStrictEqual(pathsOf(findMismatches(expected, { servicerOptions: "a,b" })), ["servicerOptions.length"]);
});

test("checker: -0 where 0 is expected fails (and the other way round)", () => {
  assert.deepStrictEqual(pathsOf(findMismatches({ stepTwoAddCents: 0 }, { stepTwoAddCents: -0 })), ["stepTwoAddCents"]);
  assert.deepStrictEqual(pathsOf(findMismatches({ stepTwoAddCents: -0 }, { stepTwoAddCents: 0 })), ["stepTwoAddCents"]);
  assert.deepStrictEqual(findMismatches({ stepTwoAddCents: 0 }, { stepTwoAddCents: 0 }), []);
});

test("checker: a differing type fails (number vs text, true vs 1, list vs object)", () => {
  assert.equal(findMismatches({ a: 1 }, { a: "1" }).length, 1);
  assert.equal(findMismatches({ a: true }, { a: 1 }).length, 1);
  assert.equal(findMismatches({ a: [1] }, { a: { 0: 1, length: 1 } }).length, 1);
  assert.equal(findMismatches({ a: { b: 1 } }, { a: [1] }).length, 1);
});

test("every vector's expected nearLine is matched by the engine (three pinned keys; extra describing keys allowed)", () => {
  for (const vector of VECTORS) {
    assert.ok("nearLine" in vector.expected, vector.id + " has no expected.nearLine");
    const result = analyze(accountFromVector(vector));
    assert.deepStrictEqual(findMismatches(vector.expected.nearLine, result.nearLine), [], vector.id);
    if (result.nearLine !== null) {
      assert.deepStrictEqual(Object.keys(result.nearLine), ["line", "distanceCents", "toleranceCents", "appliesTo", "side", "amountCents", "lineCents"]);
    }
  }
});
