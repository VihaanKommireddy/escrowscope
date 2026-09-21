// tests/examples.test.js — the three built-in examples run through the REAL
// engine, so an example can never quietly disagree with the math (SPEC D3).
// The hand-worked numbers asserted here are the Build Chief's, from
// docs/BUILD-CONTRACT.md section 3.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  analyze,
  compareWithStatement,
  explainVerdict,
  explainJump,
  validateAccount,
  validateStatement,
  refundDeadline,
} from "../engine/index.js";
import { EXAMPLES } from "../examples.js";

function run(example) {
  const result = analyze(example.account);
  const comparison = compareWithStatement(result, example.statement);
  const verdict = explainVerdict(result, comparison);
  return { result: result, comparison: comparison, verdict: verdict };
}

test("there are exactly three examples with the contract's ids, in order", () => {
  assert.deepStrictEqual(EXAMPLES.map((example) => example.id), ["jumped-ok", "holding-too-much", "cushion-too-big"]);
  for (const example of EXAMPLES) {
    assert.deepStrictEqual(Object.keys(example), ["id", "tab", "title", "blurb", "account", "statement", "details", "expect"]);
    // `tab` is the short name on the example's tab. Three of them share one row,
    // so it has to stay short (the panel underneath carries the full `title`).
    assert.ok(typeof example.tab === "string" && example.tab.length > 0 && example.tab.length <= 28, example.id + ": `tab` must be 1 to 28 characters.");
    assert.deepStrictEqual(Object.keys(example.expect), ["classification", "overall", "tone", "flagKinds"]);
  }
});

for (const example of EXAMPLES) {
  test(example.id + ": the engine agrees with `expect`", () => {
    const { result, comparison, verdict } = run(example);
    assert.equal(result.classification, example.expect.classification);
    assert.equal(comparison.overall, example.expect.overall);
    assert.equal(verdict.tone, example.expect.tone);
    assert.deepStrictEqual(comparison.flags.map((flag) => flag.kind).sort(), example.expect.flagKinds);
    assert.deepStrictEqual(example.expect.flagKinds, [...example.expect.flagKinds].sort(), "flagKinds must be sorted");
  });

  test(example.id + ": valid input, no warnings, whole cents only", () => {
    assert.deepStrictEqual(validateAccount(example.account), { errors: [], warnings: [] });
    assert.deepStrictEqual(validateStatement(example.statement, example.account), { errors: [], warnings: [] });
  });
}

test("example 1, number by number: D $5,700 · P $475 · cap $950 · add $475 · required $1,425 · shortage $300 · low $650 in November", () => {
  const { result, comparison } = run(EXAMPLES[0]);
  assert.equal(result.annualDisbursementsCents, 570000);
  assert.equal(result.baseMonthlyPaymentCents, 47500);
  assert.equal(result.cushionCapCents, 95000);
  assert.equal(result.stepTwoAddCents, 47500);
  assert.equal(result.requiredStartingBalanceCents, 142500);
  assert.equal(result.shortageCents, 30000);
  assert.ok(result.shortageCents < result.baseMonthlyPaymentCents, "smaller than one month's payment");
  assert.equal(result.lowPoint.projectedBalanceCents, 65000);
  assert.equal(result.lowPoint.calendarMonth, 11);
  assert.equal(result.nearLine, null);
  assert.deepStrictEqual(comparison.rows.map((row) => row.status), ["match", "match", "match"]);

  const jump = explainJump(result, EXAMPLES[0].statement);
  assert.deepStrictEqual(jump.parts.map((part) => part.cents), [7500, 2500, 0, 0]);
});

test("example 2 is the owner's test case #1 (TV01): $4,800 · $400 · cap $800 · low $1,100 in November · surplus $300; refund clock → October 1, 2026", () => {
  const { result, verdict } = run(EXAMPLES[1]);
  assert.equal(result.annualDisbursementsCents, 480000);
  assert.equal(result.baseMonthlyPaymentCents, 40000);
  assert.equal(result.cushionCapCents, 80000);
  assert.equal(result.lowPoint.projectedBalanceCents, 110000);
  assert.equal(result.lowPoint.calendarMonth, 11);
  assert.equal(result.surplusCents, 30000);
  assert.equal(verdict.tooCloseToCall, false);
  assert.deepStrictEqual(refundDeadline(EXAMPLES[1].details.analysisDate), { ok: true, isoDate: "2026-10-01", display: "October 1, 2026" });
});

test("example 3, number by number: starts in April · D $7,200 · P $600 · cap $1,200 · Step-1 low −$600 (months 3 and 7 tie → month 3) · on target · low $1,200 in June", () => {
  const { result, comparison } = run(EXAMPLES[2]);
  assert.equal(result.annualDisbursementsCents, 720000);
  assert.equal(result.baseMonthlyPaymentCents, 60000);
  assert.equal(result.cushionCapCents, 120000);
  assert.equal(result.table[2].step1TrialBalanceCents, -60000);
  assert.equal(result.table[6].step1TrialBalanceCents, -60000);
  assert.equal(result.stepTwoAddCents, 60000);
  assert.equal(result.requiredStartingBalanceCents, 180000);
  assert.equal(result.lowPoint.month, 3);
  assert.equal(result.lowPoint.calendarMonth, 6);
  assert.equal(result.lowPoint.projectedBalanceCents, 120000);
  assert.deepStrictEqual(result.inputs.disbursements.map((bill) => bill.calendarMonth), [6, 10, 3]);

  const cushion = comparison.flags.find((flag) => flag.kind === "CUSHION_OVER_CAP");
  const payment = comparison.flags.find((flag) => flag.kind === "PAYMENT_ABOVE_MAX");
  assert.equal(cushion.amountCents, 60000); // $600 over the cap
  assert.equal(payment.amountCents, 5000); // $50.00 a month
  assert.equal(payment.perYearCents, 60000); // $600.00 a year
});
