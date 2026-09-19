// tests/compare.test.js — "your statement says" vs "the federal math says".

import { test } from "node:test";
import assert from "node:assert/strict";

import { analyze, compareWithStatement, formatCents, letterKind, buildLetter, explainVerdict, nextSteps, accountFromVector, VECTORS } from "../engine/index.js";
import { paymentToleranceCents, countPaymentParts } from "../engine/analyze.js";
import { claimPointsToARealCushion } from "../engine/compare.js";
import { FLAGS_THAT_ASSERT_A_DISCREPANCY } from "../engine/letter.js";

// ---------- accounts used below ----------

// Build-contract example 1 (= TV18): D $5,700 · P $475 · cap $950 · shortage $300 (< one month).
function smallShortageAccount() {
  return {
    startMonth: 1,
    startingBalanceCents: 112500,
    cushionMonths: 2,
    borrowerCurrent: true,
    disbursements: [
      { label: "Property tax", month: 5, amountCents: 210000 },
      { label: "Homeowners insurance", month: 7, amountCents: 150000 },
      { label: "Property tax", month: 11, amountCents: 210000 },
    ],
  };
}

// TV11: D $5,760 · P $480 · cap $960 · required start $2,400 · shortage $1,200 (≥ one month).
function largeShortageAccount() {
  return {
    startMonth: 1,
    startingBalanceCents: 120000,
    cushionMonths: 2,
    borrowerCurrent: true,
    disbursements: [
      { label: "Homeowners insurance", month: 3, amountCents: 144000 },
      { label: "Property tax", month: 9, amountCents: 432000 },
    ],
  };
}

// TV01: D $4,800 · P $400 · cap $800 · surplus $300.
function surplusAccount() {
  return {
    startMonth: 1,
    startingBalanceCents: 150000,
    cushionMonths: 2,
    borrowerCurrent: true,
    disbursements: [
      { label: "Property tax", month: 5, amountCents: 180000 },
      { label: "Homeowners insurance", month: 7, amountCents: 120000 },
      { label: "Property tax", month: 11, amountCents: 180000 },
    ],
  };
}

// Build-contract example 3: D $7,200 · P $600 · cap $1,200 · on target.
function onTargetAccount() {
  return {
    startMonth: 4,
    startingBalanceCents: 180000,
    cushionMonths: 2,
    borrowerCurrent: true,
    disbursements: [
      { label: "Homeowners insurance", month: 3, amountCents: 240000 },
      { label: "Property tax", month: 7, amountCents: 240000 },
      { label: "Property tax", month: 12, amountCents: 240000 },
    ],
  };
}

// TV04 (HUD Appendix M): balance −$2,400 · P $500 · deficiency $2,400 + shortage $3,300.
// Lawful maximum: $500 + $275 + $1,200 = $1,975 for two months, then $775.
function deficiencyAndShortageAccount() {
  return {
    startMonth: 9,
    startingBalanceCents: -240000,
    cushionMonths: 2,
    borrowerCurrent: true,
    disbursements: [
      { label: "Insurance", month: 2, amountCents: 80000 },
      { label: "Taxes", month: 3, amountCents: 300000 },
      { label: "Taxes", month: 10, amountCents: 220000 },
    ],
  };
}

function kindsOf(comparison) {
  return comparison.flags.map((flag) => flag.kind).sort();
}

function rowByKey(comparison, key) {
  return comparison.rows.find((row) => row.key === key);
}

function flagByKind(comparison, kind) {
  return comparison.flags.find((flag) => flag.kind === kind);
}

function assertWellFormed(comparison) {
  assert.equal(typeof comparison.provided, "boolean");
  assert.ok(["matches", "look-here", "not-provided"].includes(comparison.overall));
  for (const row of comparison.rows) {
    assert.equal(typeof row.key, "string");
    assert.ok(row.label.length > 3);
    assert.ok(Number.isInteger(row.statementCents));
    assert.ok(Number.isInteger(row.federalCents));
    assert.equal(row.gapCents, row.statementCents - row.federalCents);
    assert.ok(["match", "differs", "over-limit", "not-compared"].includes(row.status));
    assert.ok(row.note.length > 10);
  }
  for (const flag of comparison.flags) {
    assert.ok(Number.isInteger(flag.amountCents) && flag.amountCents >= 0);
    assert.ok(flag.cite.startsWith("12 CFR 1024.17("));
    assert.ok(flag.sentence.includes(flag.cite), "the sentence should carry its cite: " + flag.sentence);
    assert.ok(flag.sentence.includes("$"), "the sentence should carry the dollars: " + flag.sentence);
  }
  // Every row that is not a match has a flag pointing at it, and the other way round.
  for (const row of comparison.rows) {
    const flagged = comparison.flags.some((flag) => flag.rowKey === row.key);
    const needsFlag = row.status === "differs" || row.status === "over-limit";
    assert.equal(flagged, needsFlag, "row " + row.key + " status " + row.status);
  }
  if (comparison.flags.length > 0) assert.equal(comparison.overall, "look-here");
  if (!comparison.provided) assert.equal(comparison.overall, "not-provided");
}

// ---------- TV04 sanity: the account above really is HUD's Appendix M ----------

test("the deficiency + shortage account reproduces HUD's $1,975 then $775", () => {
  const result = analyze(deficiencyAndShortageAccount());
  assert.equal(result.deficiencyCents, 240000);
  assert.equal(result.shortageCents, 330000);
  assert.equal(result.newMonthlyEscrowPayment.monthlyEscrowWhileRepayingDeficiencyCents, 197500);
  assert.equal(result.newMonthlyEscrowPayment.monthlyEscrowAfterDeficiencyRepaidCents, 77500);
});

// ---------- nothing to compare ----------

test("no statement, an empty statement, or only the current payment → not-provided", () => {
  const result = analyze(smallShortageAccount());
  for (const statement of [undefined, null, {}, { currentMonthlyEscrowCents: 40000 }, { shortageSpreadMonths: 12 }]) {
    const comparison = compareWithStatement(result, statement);
    assert.deepStrictEqual(comparison, { provided: false, rows: [], flags: [], nudges: [], overall: "not-provided" });
  }
});

// ---------- the common case: everything matches ----------

test("a statement that agrees with the federal math → three matching rows, no flags, 'matches'", () => {
  const result = analyze(smallShortageAccount());
  const comparison = compareWithStatement(result, {
    currentMonthlyEscrowCents: 40000,
    newMonthlyEscrowCents: 50000,
    requiredMinimumBalanceCents: 95000,
    claimedKind: "shortage",
    claimedAmountCents: 30000,
    shortageSpreadMonths: 12,
    lumpSumOfferedOnStatement: false,
  });
  assertWellFormed(comparison);
  assert.equal(comparison.provided, true);
  assert.equal(comparison.overall, "matches");
  assert.deepStrictEqual(comparison.flags, []);
  assert.deepStrictEqual(comparison.rows.map((row) => row.key), ["requiredMinimumBalance", "claimedAmount", "newMonthlyEscrow"]);
  assert.deepStrictEqual(comparison.rows.map((row) => row.status), ["match", "match", "match"]);
  assert.equal(rowByKey(comparison, "newMonthlyEscrow").federalCents, 50000);
  assert.equal(rowByKey(comparison, "claimedAmount").federalCents, 30000);
  assert.equal(rowByKey(comparison, "requiredMinimumBalance").federalCents, 95000);
});

test("only the rows the user filled in appear", () => {
  const result = analyze(smallShortageAccount());
  const comparison = compareWithStatement(result, { newMonthlyEscrowCents: 50000 });
  assertWellFormed(comparison);
  assert.deepStrictEqual(comparison.rows.map((row) => row.key), ["newMonthlyEscrow"]);
  assert.equal(comparison.overall, "matches");
});

test("a servicer that rounds to whole dollars still matches (tolerance $7 on balances, $1 on the payment)", () => {
  const result = analyze(smallShortageAccount());
  const comparison = compareWithStatement(result, {
    newMonthlyEscrowCents: 50100, // $1.00 off
    requiredMinimumBalanceCents: 95700, // $7.00 over
    claimedKind: "shortage",
    claimedAmountCents: 30700, // $7.00 off
  });
  assertWellFormed(comparison);
  assert.equal(comparison.overall, "matches");
});

test("one cent past each tolerance is flagged", () => {
  const result = analyze(smallShortageAccount());
  // The maximum here has two rounded parts (bills ÷ 12 + shortage ÷ 12), so the payment tolerance is $2.00 (audit A1).
  assert.deepStrictEqual(kindsOf(compareWithStatement(result, { newMonthlyEscrowCents: 50200 })), []);
  assert.deepStrictEqual(kindsOf(compareWithStatement(result, { newMonthlyEscrowCents: 50201 })), ["PAYMENT_ABOVE_MAX"]);
  assert.deepStrictEqual(kindsOf(compareWithStatement(result, { requiredMinimumBalanceCents: 95701 })), ["CUSHION_OVER_CAP"]);
  assert.deepStrictEqual(kindsOf(compareWithStatement(result, { claimedKind: "shortage", claimedAmountCents: 30701 })), ["AMOUNT_DIFFERS"]);
  assert.deepStrictEqual(kindsOf(compareWithStatement(result, { claimedKind: "shortage", claimedAmountCents: 29299 })), ["AMOUNT_DIFFERS"]);
});

// ---------- CUSHION_OVER_CAP ----------

test("CUSHION_OVER_CAP: a 3-month cushion is $600 over the $1,200 cap; row status is 'over-limit'", () => {
  const result = analyze(onTargetAccount());
  const comparison = compareWithStatement(result, { requiredMinimumBalanceCents: 180000 });
  assertWellFormed(comparison);
  const row = rowByKey(comparison, "requiredMinimumBalance");
  assert.equal(row.status, "over-limit");
  assert.equal(row.federalCents, 120000);
  assert.equal(row.gapCents, 60000);
  const flag = flagByKind(comparison, "CUSHION_OVER_CAP");
  assert.equal(flag.amountCents, 60000);
  assert.equal(flag.cite, "12 CFR 1024.17(c)(5)");
  assert.ok(flag.sentence.includes("$1,800.00"));
  assert.ok(flag.sentence.includes("$1,200.00"));
  assert.ok(flag.sentence.includes("$600.00"));
});

test("when the mortgage documents set a lower cushion, the cite points to (c)(8)", () => {
  const account = onTargetAccount();
  account.cushionMonths = 1; // cap $600
  // ($1,500, not $1,200: $1,200 is this account's low point, which would be the audit-B2 nudge instead.)
  const comparison = compareWithStatement(analyze(account), { requiredMinimumBalanceCents: 150000 });
  const flag = flagByKind(comparison, "CUSHION_OVER_CAP");
  assert.equal(flag.amountCents, 90000);
  assert.equal(flag.cite, "12 CFR 1024.17(c)(8)");
});

// ---------- a SMALLER cushion than the maximum is allowed ----------

test("a servicer using a smaller cushion is not flagged, and its smaller shortage is checked against ITS cushion", () => {
  // Federal maximum: cap $950, required start $1,425, shortage $300.
  // This servicer keeps only a 1-month cushion, $475. With that cushion the
  // required start is $950 and the balance of $1,125 is a $175 SURPLUS.
  const result = analyze(smallShortageAccount());
  const comparison = compareWithStatement(result, {
    requiredMinimumBalanceCents: 47500,
    claimedKind: "surplus",
    claimedAmountCents: 17500,
    newMonthlyEscrowCents: 47500,
  });
  assertWellFormed(comparison);
  assert.deepStrictEqual(comparison.flags, []);
  assert.equal(comparison.overall, "matches");
  assert.equal(rowByKey(comparison, "requiredMinimumBalance").status, "match");
  assert.equal(rowByKey(comparison, "claimedAmount").federalCents, 17500);
  assert.match(rowByKey(comparison, "requiredMinimumBalance").note, /allowed/i);
});

test("the smaller-cushion courtesy never stretches past the cap: an oversized cushion is compared at the cap", () => {
  const result = analyze(smallShortageAccount());
  const comparison = compareWithStatement(result, {
    requiredMinimumBalanceCents: 142500, // 3 months
    claimedKind: "shortage",
    claimedAmountCents: 77500, // $300 + the extra $475 of cushion
  });
  assertWellFormed(comparison);
  assert.deepStrictEqual(kindsOf(comparison), ["AMOUNT_DIFFERS", "CUSHION_OVER_CAP"]);
  const amountFlag = flagByKind(comparison, "AMOUNT_DIFFERS");
  assert.equal(amountFlag.amountCents, 47500);
  // The sentence connects the two: the gap is the same size as the extra cushion.
  assert.match(amountFlag.sentence, /same size as the extra cushion/);
});

// ---------- AMOUNT_DIFFERS / KIND_DIFFERS ----------

test("same kind, different dollars → AMOUNT_DIFFERS with the gap", () => {
  const result = analyze(smallShortageAccount());
  const comparison = compareWithStatement(result, { claimedKind: "shortage", claimedAmountCents: 50000 });
  assertWellFormed(comparison);
  const flag = flagByKind(comparison, "AMOUNT_DIFFERS");
  assert.equal(flag.amountCents, 20000);
  assert.equal(flag.rowKey, "claimedAmount");
  assert.equal(rowByKey(comparison, "claimedAmount").status, "differs");
  assert.ok(flag.sentence.includes("$500.00") && flag.sentence.includes("$300.00") && flag.sentence.includes("$200.00"));
});

test("statement says shortage, federal math says on target → KIND_DIFFERS", () => {
  const result = analyze(onTargetAccount());
  const comparison = compareWithStatement(result, { claimedKind: "shortage", claimedAmountCents: 60000 });
  assertWellFormed(comparison);
  assert.deepStrictEqual(kindsOf(comparison), ["KIND_DIFFERS"]);
  assert.equal(flagByKind(comparison, "KIND_DIFFERS").amountCents, 60000);
});

test("statement says shortage, federal math says surplus → KIND_DIFFERS by the full distance between them", () => {
  const result = analyze(surplusAccount()); // surplus $300
  const comparison = compareWithStatement(result, { claimedKind: "shortage", claimedAmountCents: 20000 });
  assertWellFormed(comparison);
  const flag = flagByKind(comparison, "KIND_DIFFERS");
  assert.equal(flag.amountCents, 50000); // −$200 vs +$300
  assert.equal(rowByKey(comparison, "claimedAmount").federalCents, -30000); // "a shortage of −$300" = a surplus
});

test("statement says 'none' but the federal math finds a surplus → KIND_DIFFERS; within $7 → match", () => {
  const big = compareWithStatement(analyze(surplusAccount()), { claimedKind: "none" });
  assertWellFormed(big);
  assert.deepStrictEqual(kindsOf(big), ["KIND_DIFFERS"]);
  assert.equal(flagByKind(big, "KIND_DIFFERS").amountCents, 30000);

  const account = surplusAccount();
  account.startingBalanceCents = 120300; // $3.00 surplus
  const tiny = compareWithStatement(analyze(account), { claimedKind: "none" });
  assertWellFormed(tiny);
  assert.equal(tiny.overall, "matches");
});

test("tiny opposite-sign noise is a match: statement surplus $2, federal shortage $4", () => {
  const account = surplusAccount();
  account.startingBalanceCents = 119600;
  const comparison = compareWithStatement(analyze(account), { claimedKind: "surplus", claimedAmountCents: 200 });
  assertWellFormed(comparison);
  assert.equal(comparison.overall, "matches");
});

test("statement calls it a DEFICIENCY but the balance is not below $0 → KIND_DIFFERS that explains the difference (TV19)", () => {
  const account = surplusAccount();
  account.startingBalanceCents = 10000; // TV19: projected dip below zero, but a shortage of $1,100
  const result = analyze(account);
  assert.equal(result.classification, "SHORTAGE_GE_ONE_MONTH");
  const comparison = compareWithStatement(result, { claimedKind: "deficiency", claimedAmountCents: 110000 });
  assertWellFormed(comparison);
  const flag = flagByKind(comparison, "KIND_DIFFERS");
  assert.equal(flag.amountCents, 110000);
  assert.match(flag.sentence, /below \$0/);
  assert.match(flag.sentence, /12 months/);
});

test("statement calls a real deficiency a 'shortage' for the same dollars → match (the servicer is being gentler, not harsher)", () => {
  const account = {
    startMonth: 1,
    startingBalanceCents: -15000,
    cushionMonths: 0,
    borrowerCurrent: true,
    disbursements: [{ label: "Annual property tax", month: 12, amountCents: 240000 }],
  }; // TV12: pure deficiency of $150
  const comparison = compareWithStatement(analyze(account), { claimedKind: "shortage", claimedAmountCents: 15000 });
  assertWellFormed(comparison);
  assert.equal(comparison.overall, "matches");
});

test("deficiency + shortage together: the statement may name either part, or the total", () => {
  const result = analyze(deficiencyAndShortageAccount());
  const claims = [
    { claimedKind: "deficiency", claimedAmountCents: 240000 },
    { claimedKind: "shortage", claimedAmountCents: 330000 },
    { claimedKind: "shortage", claimedAmountCents: 570000 },
    { claimedKind: "deficiency", claimedAmountCents: 570000 },
  ];
  for (const claim of claims) {
    const comparison = compareWithStatement(result, claim);
    assertWellFormed(comparison);
    assert.equal(comparison.overall, "matches", JSON.stringify(claim));
  }
  const wrong = compareWithStatement(result, { claimedKind: "shortage", claimedAmountCents: 450000 });
  assert.deepStrictEqual(kindsOf(wrong), ["AMOUNT_DIFFERS"]);
  assert.equal(flagByKind(wrong, "AMOUNT_DIFFERS").amountCents, 120000); // measured to the CLOSER figure ($3,300 vs $5,700)
});

test("a kind with no amount: compared by kind only", () => {
  const agree = compareWithStatement(analyze(smallShortageAccount()), { claimedKind: "shortage" });
  assert.deepStrictEqual(agree, { provided: false, rows: [], flags: [], nudges: [], overall: "not-provided" });

  const disagree = compareWithStatement(analyze(surplusAccount()), { claimedKind: "shortage" });
  assert.deepStrictEqual(kindsOf(disagree), ["KIND_DIFFERS"]);
  assert.equal(disagree.rows.length, 0);
  assert.equal(disagree.overall, "look-here");
});

test("an amount with no kind cannot be compared and is skipped", () => {
  const comparison = compareWithStatement(analyze(smallShortageAccount()), { claimedAmountCents: 30000 });
  assert.deepStrictEqual(comparison, { provided: false, rows: [], flags: [], nudges: [], overall: "not-provided" });
});

// ---------- the monthly payment ----------

test("PAYMENT_ABOVE_MAX: $650 when the most the math supports is $600 → $50.00 a month, $600.00 a year", () => {
  const result = analyze(onTargetAccount());
  const comparison = compareWithStatement(result, { newMonthlyEscrowCents: 65000 });
  assertWellFormed(comparison);
  const flag = flagByKind(comparison, "PAYMENT_ABOVE_MAX");
  assert.equal(flag.amountCents, 5000);
  assert.equal(flag.perYearCents, 60000);
  assert.equal(flag.cite, "12 CFR 1024.17(c)(1)(ii)");
  assert.ok(flag.sentence.includes("$50.00") && flag.sentence.includes("$600.00"));
  const row = rowByKey(comparison, "newMonthlyEscrow");
  assert.equal(row.status, "over-limit");
  assert.equal(row.federalCents, 60000);
});

test("the base payment alone is a match even when there is a shortage (lump sum, or the servicer chose to do nothing)", () => {
  const result = analyze(smallShortageAccount());
  const comparison = compareWithStatement(result, { newMonthlyEscrowCents: 47500 });
  assertWellFormed(comparison);
  assert.equal(comparison.overall, "matches");
  assert.equal(rowByKey(comparison, "newMonthlyEscrow").federalCents, 47500);
});

test("a longer spread lowers the expected add-on: $300 over 24 months = $12.50", () => {
  const result = analyze(smallShortageAccount());
  const comparison = compareWithStatement(result, { newMonthlyEscrowCents: 48750, shortageSpreadMonths: 24 });
  assertWellFormed(comparison);
  assert.equal(comparison.overall, "matches");
  assert.equal(rowByKey(comparison, "newMonthlyEscrow").federalCents, 48750);
});

test("a payment that fits no lawful figure but is UNDER the maximum → 'differs' + AMOUNT_DIFFERS that says lower is allowed", () => {
  const result = analyze(smallShortageAccount());
  for (const payment of [45000, 48900]) {
    const comparison = compareWithStatement(result, { newMonthlyEscrowCents: payment });
    assertWellFormed(comparison);
    assert.equal(rowByKey(comparison, "newMonthlyEscrow").status, "differs");
    const flag = flagByKind(comparison, "AMOUNT_DIFFERS");
    assert.equal(flag.rowKey, "newMonthlyEscrow");
    assert.equal(flag.cite, "12 CFR 1024.17(c)(1)(ii)");
    assert.match(flag.sentence, /allowed/);
  }
});

test("a surplus under $50 may be credited against next year's payments, so a slightly lower payment matches", () => {
  const account = surplusAccount();
  account.startingBalanceCents = 124800; // surplus $48.00 → credit of $4.00 a month
  const result = analyze(account);
  assert.equal(result.classification, "SURPLUS_UNDER_50");
  assert.equal(compareWithStatement(result, { newMonthlyEscrowCents: 39600 }).overall, "matches");
  assert.equal(compareWithStatement(result, { newMonthlyEscrowCents: 40000 }).overall, "matches");
  assert.equal(compareWithStatement(result, { newMonthlyEscrowCents: 39000 }).overall, "look-here");
});

test("with a deficiency the servicer picks the number of months (2 or more), so anything from the base up to the maximum matches", () => {
  const result = analyze(deficiencyAndShortageAccount()); // base $500, max $1,975
  // Three rounded parts here, so the payment tolerance is $3.00 (audit A1).
  for (const payment of [49700, 50000, 77500, 100000, 150000, 197500, 197800]) {
    const comparison = compareWithStatement(result, { newMonthlyEscrowCents: payment });
    assertWellFormed(comparison);
    assert.equal(comparison.overall, "matches", String(payment));
  }
  const over = compareWithStatement(result, { newMonthlyEscrowCents: 197801 });
  assert.deepStrictEqual(kindsOf(over), ["PAYMENT_ABOVE_MAX"]);
  assert.equal(flagByKind(over, "PAYMENT_ABOVE_MAX").amountCents, 301);
  const under = compareWithStatement(result, { newMonthlyEscrowCents: 49699 });
  assert.deepStrictEqual(kindsOf(under), ["AMOUNT_DIFFERS"]);
});

test("borrower not current + deficiency: (f)(4) does not cap the repayment, so PAYMENT_ABOVE_MAX is not raised", () => {
  const account = deficiencyAndShortageAccount();
  account.borrowerCurrent = false;
  const comparison = compareWithStatement(analyze(account), { newMonthlyEscrowCents: 300000 });
  assertWellFormed(comparison);
  assert.deepStrictEqual(comparison.flags, []);
  assert.match(rowByKey(comparison, "newMonthlyEscrow").note, /not current|30 days/i);
});

// ---------- D6: SPREAD_TOO_SHORT ----------

test("SPREAD_TOO_SHORT, large shortage: anything under 12 months, cite (f)(3)(ii)", () => {
  const result = analyze(largeShortageAccount()); // shortage $1,200 ≥ P $480
  for (const months of [1, 2, 6, 11]) {
    const comparison = compareWithStatement(result, { claimedKind: "shortage", claimedAmountCents: 120000, shortageSpreadMonths: months });
    assertWellFormed(comparison);
    const flag = flagByKind(comparison, "SPREAD_TOO_SHORT");
    assert.ok(flag, "expected a flag at " + months + " months");
    assert.equal(flag.cite, "12 CFR 1024.17(f)(3)(ii)");
    assert.equal(flag.amountCents, 120000);
    assert.match(flag.sentence, /at least 12 months/);
  }
  for (const months of [12, 13, 24, 360]) {
    const comparison = compareWithStatement(result, { claimedKind: "shortage", claimedAmountCents: 120000, shortageSpreadMonths: months });
    assert.equal(flagByKind(comparison, "SPREAD_TOO_SHORT"), undefined, String(months));
  }
});

test("SPREAD_TOO_SHORT, small shortage: 2–11 months is off the list, but 1 month (a 30-day lump sum) is allowed; cite (f)(3)(i)", () => {
  const result = analyze(smallShortageAccount()); // shortage $300 < P $475
  for (const months of [2, 6, 11]) {
    const comparison = compareWithStatement(result, { shortageSpreadMonths: months });
    assertWellFormed(comparison);
    const flag = flagByKind(comparison, "SPREAD_TOO_SHORT");
    assert.ok(flag, "expected a flag at " + months + " months");
    assert.equal(flag.cite, "12 CFR 1024.17(f)(3)(i)");
    assert.match(flag.sentence, /30 days/);
  }
  for (const months of [1, 12, 18]) {
    const comparison = compareWithStatement(result, { shortageSpreadMonths: months });
    assert.equal(flagByKind(comparison, "SPREAD_TOO_SHORT"), undefined, String(months));
  }
});

test("SPREAD_TOO_SHORT needs a shortage, and is skipped when the statement is about a surplus, a deficiency, or nothing", () => {
  const noShortage = compareWithStatement(analyze(surplusAccount()), { shortageSpreadMonths: 6 });
  assert.equal(flagByKind(noShortage, "SPREAD_TOO_SHORT"), undefined);

  const result = analyze(largeShortageAccount());
  for (const kind of ["surplus", "deficiency", "none"]) {
    const comparison = compareWithStatement(result, { claimedKind: kind, claimedAmountCents: 120000, shortageSpreadMonths: 6 });
    assert.equal(flagByKind(comparison, "SPREAD_TOO_SHORT"), undefined, kind);
  }
});

test("a 6-month spread also shows up in the payment: $1,200 ÷ 6 = $200 a month is $100 above the $580 maximum", () => {
  const result = analyze(largeShortageAccount());
  const comparison = compareWithStatement(result, { newMonthlyEscrowCents: 68000, shortageSpreadMonths: 6 });
  assertWellFormed(comparison);
  assert.deepStrictEqual(kindsOf(comparison), ["PAYMENT_ABOVE_MAX", "SPREAD_TOO_SHORT"]);
  assert.equal(flagByKind(comparison, "PAYMENT_ABOVE_MAX").amountCents, 10000);
});

// ---------- D6: LUMP_SUM_OFFERED ----------

test("LUMP_SUM_OFFERED: large shortage + the statement offers a lump sum → a QUESTION to ask, never an accusation", () => {
  const result = analyze(largeShortageAccount());
  const comparison = compareWithStatement(result, { lumpSumOfferedOnStatement: true });
  assertWellFormed(comparison);
  assert.equal(comparison.provided, true);
  assert.equal(comparison.overall, "look-here");
  const flag = flagByKind(comparison, "LUMP_SUM_OFFERED");
  assert.equal(flag.cite, "12 CFR 1024.17(f)(3)(ii)");
  assert.equal(flag.amountCents, 120000);
  assert.match(flag.sentence, /ask/i);
  assert.ok(flag.sentence.includes("?"), "it should contain the question itself");
  assert.match(flag.sentence, /CFPB/);
  for (const harsh of ["violat", "illegal", "broke the", "against the law", "not allowed to"]) {
    assert.equal(flag.sentence.toLowerCase().includes(harsh), false, harsh);
  }
});

test("LUMP_SUM_OFFERED stays quiet for a small shortage (a 30-day lump sum is on the list there), for no shortage, and when not offered", () => {
  assert.deepStrictEqual(compareWithStatement(analyze(smallShortageAccount()), { lumpSumOfferedOnStatement: true }).flags, []);
  assert.deepStrictEqual(compareWithStatement(analyze(surplusAccount()), { lumpSumOfferedOnStatement: true }).flags, []);
  assert.deepStrictEqual(compareWithStatement(analyze(largeShortageAccount()), { lumpSumOfferedOnStatement: false }).flags, []);
});

test("SPEC E3: within $7.00 of one month's payment the tier is too close to call, so the tier-dependent flags stay quiet", () => {
  // P = $480.00. A servicer rounding to whole dollars could lawfully put a
  // $480.00 shortage in EITHER tier, so we do not flag a lump-sum offer or a
  // 1-month demand until the shortage is clearly (more than $7.00) past the line.
  function withShortage(cents) {
    const account = largeShortageAccount(); // required start $2,400.00
    account.startingBalanceCents = 240000 - cents;
    return analyze(account);
  }
  for (const cents of [47999, 48000, 48700]) {
    assert.deepStrictEqual(kindsOf(compareWithStatement(withShortage(cents), { lumpSumOfferedOnStatement: true })), [], String(cents));
    assert.deepStrictEqual(kindsOf(compareWithStatement(withShortage(cents), { shortageSpreadMonths: 1 })), [], String(cents));
  }
  // One cent past the band: clearly the large tier.
  assert.deepStrictEqual(kindsOf(compareWithStatement(withShortage(48701), { lumpSumOfferedOnStatement: true })), ["LUMP_SUM_OFFERED"]);
  assert.deepStrictEqual(kindsOf(compareWithStatement(withShortage(48701), { shortageSpreadMonths: 1 })), ["SPREAD_TOO_SHORT"]);

  // A 2–11 month spread is off the list in BOTH tiers, so it is still flagged
  // inside the band — citing (f)(3) as a whole, since we cannot say which tier.
  const inBand = compareWithStatement(withShortage(48000), { shortageSpreadMonths: 6 });
  assert.deepStrictEqual(kindsOf(inBand), ["SPREAD_TOO_SHORT"]);
  assert.equal(flagByKind(inBand, "SPREAD_TOO_SHORT").cite, "12 CFR 1024.17(f)(3)");
  assert.match(flagByKind(inBand, "SPREAD_TOO_SHORT").sentence, /either/i);
});

test("the D6 tier uses the shortage measured with the servicer's own (smaller) cushion, so generosity is never flagged", () => {
  // Federal maximum shortage: $1,200 (large tier). This servicer keeps a $100
  // cushion instead of $960, so by its own analysis the shortage is $340 —
  // smaller than one month's payment, where a lump sum IS on the list.
  const result = analyze(largeShortageAccount());
  const comparison = compareWithStatement(result, {
    requiredMinimumBalanceCents: 10000,
    claimedKind: "shortage",
    claimedAmountCents: 34000,
    lumpSumOfferedOnStatement: true,
    shortageSpreadMonths: 1,
  });
  assertWellFormed(comparison);
  assert.deepStrictEqual(comparison.flags, []);
  assert.equal(comparison.overall, "matches");
});

// ---------- the three built-in examples' flag sets are pinned in tests/examples.test.js ----------

test("example 3's shape: cushion over cap + kind differs + payment above max, in cause → effect order", () => {
  const result = analyze(onTargetAccount());
  const comparison = compareWithStatement(result, {
    currentMonthlyEscrowCents: 58000,
    newMonthlyEscrowCents: 65000,
    requiredMinimumBalanceCents: 180000,
    claimedKind: "shortage",
    claimedAmountCents: 60000,
    shortageSpreadMonths: 12,
  });
  assertWellFormed(comparison);
  assert.deepStrictEqual(comparison.flags.map((flag) => flag.kind), ["CUSHION_OVER_CAP", "KIND_DIFFERS", "PAYMENT_ABOVE_MAX"]);
  assert.match(flagByKind(comparison, "KIND_DIFFERS").sentence, /same size as the extra cushion/);
  assert.match(flagByKind(comparison, "PAYMENT_ABOVE_MAX").sentence, /extra cushion/);
});

// ---------- purity ----------

test("compareWithStatement changes neither the result nor the statement, and repeats exactly", () => {
  const result = analyze(onTargetAccount());
  const statement = { newMonthlyEscrowCents: 65000, requiredMinimumBalanceCents: 180000, claimedKind: "shortage", claimedAmountCents: 60000 };
  const resultBefore = JSON.stringify(result);
  const statementBefore = JSON.stringify(statement);
  const first = compareWithStatement(result, statement);
  const second = compareWithStatement(result, statement);
  assert.equal(JSON.stringify(result), resultBefore);
  assert.equal(JSON.stringify(statement), statementBefore);
  assert.deepStrictEqual(first, second);
});

test("every dollar figure in a sentence is written by formatCents (spot check)", () => {
  const result = analyze(onTargetAccount());
  const comparison = compareWithStatement(result, { requiredMinimumBalanceCents: 180000 });
  assert.ok(comparison.flags[0].sentence.includes(formatCents(180000)));
});

// =====================================================================
// FIX ORDER 1 (math audit, docs/verification/math-audit.md section 5)
// =====================================================================

// ---------- A1: the payment tolerance is $1.00 per separately rounded part ----------

test("A1 helper: paymentToleranceCents is 100 / 200 / 300 for 1 / 2 / 3 rounded parts", () => {
  assert.equal(paymentToleranceCents(1), 100);
  assert.equal(paymentToleranceCents(2), 200);
  assert.equal(paymentToleranceCents(3), 300);
  assert.equal(countPaymentParts(analyze(onTargetAccount()).newMonthlyEscrowPayment), 1);
  assert.equal(countPaymentParts(analyze(smallShortageAccount()).newMonthlyEscrowPayment), 2);
  assert.equal(countPaymentParts(analyze(deficiencyAndShortageAccount()).newMonthlyEscrowPayment), 3);
});

test("A1 repro: a lawful whole-dollar statement ($401 + $26 = $427 vs our $425.96) is NOT flagged, and the letter is not a notice of error", () => {
  const account = {
    startMonth: 1,
    startingBalanceCents: 49550,
    cushionMonths: 2,
    borrowerCurrent: true,
    disbursements: [{ label: "Property tax", month: 12, amountCents: 480600 }],
  };
  const result = analyze(account);
  assert.equal(result.baseMonthlyPaymentCents, 40050);
  assert.equal(result.shortageCents, 30550);
  assert.equal(result.newMonthlyEscrowPayment.monthlyEscrowWhileRepayingDeficiencyCents, 42596);
  const statement = { newMonthlyEscrowCents: 42700, requiredMinimumBalanceCents: 80100, claimedKind: "shortage", claimedAmountCents: 30600, shortageSpreadMonths: 12 };
  const comparison = compareWithStatement(result, statement);
  assertWellFormed(comparison);
  assert.deepStrictEqual(comparison.flags, []);
  assert.equal(comparison.overall, "matches");
  assert.match(rowByKey(comparison, "newMonthlyEscrow").note, /rounding/i);
  assert.match(rowByKey(comparison, "newMonthlyEscrow").note, /60 FR 8812/);
  assert.equal(letterKind(result, comparison), "REQUEST_FOR_INFORMATION");
  assert.equal(buildLetter(result, comparison, {}).includes("Notice of error"), false);
});

test("A1 edges: one part $1.00 ok / $1.01 flag; two parts $2.00 / $2.01; three parts $3.00 / $3.01", () => {
  const cases = [
    [onTargetAccount(), 60000, 100],
    [smallShortageAccount(), 50000, 200],
    [deficiencyAndShortageAccount(), 197500, 300],
  ];
  for (const [account, maximum, tolerance] of cases) {
    const result = analyze(account);
    assert.equal(result.newMonthlyEscrowPayment.monthlyEscrowWhileRepayingDeficiencyCents, maximum);
    const atEdge = compareWithStatement(result, { newMonthlyEscrowCents: maximum + tolerance });
    assertWellFormed(atEdge);
    assert.deepStrictEqual(atEdge.flags, [], "exactly at the edge: no flag");
    const pastEdge = compareWithStatement(result, { newMonthlyEscrowCents: maximum + tolerance + 1 });
    assert.deepStrictEqual(kindsOf(pastEdge), ["PAYMENT_ABOVE_MAX"]);
    assert.equal(flagByKind(pastEdge, "PAYMENT_ABOVE_MAX").amountCents, tolerance + 1);
  }
});

// ---------- A5: the 'deficiency' KIND_DIFFERS sentence states the choices correctly ----------

test("A5: a claimed deficiency on a positive balance — no 'has to be spread' claim; the right choices for the tier; the below-$0-on-analysis-day caveat", () => {
  const large = surplusAccount();
  large.startingBalanceCents = 10000; // shortage $1,100 ≥ one month ($400)
  const largeFlag = flagByKind(compareWithStatement(analyze(large), { claimedKind: "deficiency", claimedAmountCents: 110000 }), "KIND_DIFFERS");
  const small = surplusAccount();
  small.startingBalanceCents = 100000; // shortage $200 < one month
  const smallFlag = flagByKind(compareWithStatement(analyze(small), { claimedKind: "deficiency", claimedAmountCents: 20000 }), "KIND_DIFFERS");

  for (const flag of [largeFlag, smallFlag]) {
    assert.equal(flag.sentence.includes("has to be spread"), false);
    assert.match(flag.sentence, /really was below \$0 on the day of the analysis/);
    assert.match(flag.sentence, /even though the projected starting balance typed here is positive/);
  }
  assert.match(smallFlag.sentence, /within 30 days/);
  assert.equal(largeFlag.sentence.includes("within 30 days"), false);
  assert.match(largeFlag.sentence, /leave it alone, or spread it over at least 12 months/);
});

// ---------- A6: whole-dollar rounding is attributed to HUD guidance, never stated as settled law ----------

test("A6: no comparison text says a servicer 'may lawfully' round", () => {
  const result = analyze(largeShortageAccount());
  const comparison = compareWithStatement(result, { newMonthlyEscrowCents: 58000, shortageSpreadMonths: 6, requiredMinimumBalanceCents: 96000 });
  const everything = JSON.stringify(comparison);
  assert.equal(/lawfully/i.test(everything), false);
});

// ---------- A14: absurd, unvalidated numbers never make compare throw ----------

test("A14: absurd statement numbers are treated as not given — compareWithStatement never throws", () => {
  const absurd = [2 ** 53, 1e20, NaN, Infinity, -Infinity, -5, 1.5, "500", 1000000001, null, {}, []];
  const result = analyze(smallShortageAccount());
  const nothing = { provided: false, rows: [], flags: [], nudges: [], overall: "not-provided" };
  for (const value of absurd) {
    for (const field of ["newMonthlyEscrowCents", "requiredMinimumBalanceCents", "currentMonthlyEscrowCents"]) {
      assert.deepStrictEqual(compareWithStatement(result, { [field]: value }), nothing, field + " = " + String(value));
    }
    assert.deepStrictEqual(compareWithStatement(result, { claimedKind: "shortage", claimedAmountCents: value }), nothing, "claimedAmountCents = " + String(value));
    assert.doesNotThrow(() => compareWithStatement(result, { shortageSpreadMonths: value, lumpSumOfferedOnStatement: value, claimedKind: value }));
    assert.doesNotThrow(() => compareWithStatement(result, { newMonthlyEscrowCents: 50000, shortageSpreadMonths: value }));
  }
  assert.doesNotThrow(() => compareWithStatement(result, { shortageSpreadMonths: 1e20, newMonthlyEscrowCents: 50000 }));
  assert.equal(compareWithStatement(result, { newMonthlyEscrowCents: 1000000000 }).rows.length, 1, "exactly $10,000,000 is still accepted");
});

// =====================================================================
// B2 + FIX ORDER 3, N1: a typed "required minimum" that is over the cap AND
// is the same as the federal low point (within $7.00).
//
// The TRIGGER is unchanged. What happens once it is met is the director's
// three-case rule, decided in this order:
//   (a) a claim was typed and MATCHES the federal math → it is a mix-up:
//       nudge only, no flag, cushion row "not-compared".
//   (b) a claim was typed and DISAGREES by about (typed minimum − cap) → the
//       typed minimum is real: CUSHION_OVER_CAP, row "over-limit", no nudge.
//   (c) anything else → it cannot be told apart, so it is never green and
//       never a hard accusation: CUSHION_MAYBE_OVER_CAP, row "differs",
//       no nudge, overall "look-here".
// The old rule (always a nudge) let a $600-over-the-limit cushion come out
// fully green: the auditor's Stage 3 finding N1.
// =====================================================================

const CUSHION_FINDINGS = ["CUSHION_OVER_CAP", "CUSHION_MAYBE_OVER_CAP"];

// How many of the three cushion outcomes are present? It must never be two.
function cushionOutcomes(comparison) {
  const outcomes = [];
  for (const nudge of comparison.nudges) outcomes.push("nudge:" + nudge.kind);
  for (const flag of comparison.flags) {
    if (CUSHION_FINDINGS.includes(flag.kind)) outcomes.push("flag:" + flag.kind);
  }
  return outcomes;
}

// The auditor's N1 repro: bills $3,600 in June and December, balance
// $1,800.00, a payment more than 30 days late. Cap $1,200; low point $1,800.
function auditorN1Account() {
  return {
    startMonth: 1,
    startingBalanceCents: 180000,
    cushionMonths: 2,
    borrowerCurrent: false,
    disbursements: [
      { label: "Property tax", month: 6, amountCents: 360000 },
      { label: "Property tax", month: 12, amountCents: 360000 },
    ],
  };
}

test("N1 auditor's repro: a cushion $600 over the limit is amber CUSHION_MAYBE_OVER_CAP, never green, never 'matches'", () => {
  const result = analyze(auditorN1Account());
  assert.equal(result.cushionCapCents, 120000);
  assert.equal(result.lowPoint.projectedBalanceCents, 180000);

  const comparison = compareWithStatement(result, { requiredMinimumBalanceCents: 180000, newMonthlyEscrowCents: 60000 });
  assertWellFormed(comparison);
  assert.deepStrictEqual(kindsOf(comparison), ["CUSHION_MAYBE_OVER_CAP"]);
  assert.deepStrictEqual(comparison.nudges, []);
  assert.equal(comparison.overall, "look-here");
  assert.equal(rowByKey(comparison, "requiredMinimumBalance").status, "differs");
  assert.equal(rowByKey(comparison, "newMonthlyEscrow").status, "match", "the payment row itself still matches");

  const verdict = explainVerdict(result, comparison);
  assert.equal(verdict.tone, "flag");
  assert.equal(verdict.label, "Look here");
  assert.equal(/match/i.test(verdict.headline), false, verdict.headline);
  assert.equal(letterKind(result, comparison), "REQUEST_FOR_INFORMATION");
});

test("N1 auditor's repro with 'none' typed: federal surplus $600, typed minimum − cap = $600 → case (b), the real CUSHION_OVER_CAP", () => {
  const result = analyze(auditorN1Account());
  assert.equal(result.differenceCents, 60000);
  const comparison = compareWithStatement(result, { requiredMinimumBalanceCents: 180000, newMonthlyEscrowCents: 60000, claimedKind: "none" });
  assertWellFormed(comparison);
  assert.deepStrictEqual(kindsOf(comparison), ["CUSHION_OVER_CAP", "KIND_DIFFERS"]);
  assert.deepStrictEqual(comparison.nudges, []);
  assert.equal(rowByKey(comparison, "requiredMinimumBalance").status, "over-limit");
  assert.equal(flagByKind(comparison, "CUSHION_OVER_CAP").amountCents, 60000);
  assert.match(flagByKind(comparison, "KIND_DIFFERS").sentence, /the cushion is the likely reason/);
  assert.equal(comparison.overall, "look-here");
  assert.equal(letterKind(result, comparison), "NOTICE_OF_ERROR");
});

test("N1 case (a): TV01, the $1,100 low point typed as the minimum WITH a matching claimed surplus of $300 → nudge only", () => {
  const result = analyze(surplusAccount()); // cap $800, low point $1,100, surplus $300
  const comparison = compareWithStatement(result, { requiredMinimumBalanceCents: 110000, claimedKind: "surplus", claimedAmountCents: 30000 });
  assertWellFormed(comparison);
  assert.deepStrictEqual(comparison.flags, []);
  assert.equal(rowByKey(comparison, "requiredMinimumBalance").status, "not-compared");
  assert.equal(rowByKey(comparison, "claimedAmount").status, "match");
  assert.equal(comparison.nudges.length, 1);
  const nudge = comparison.nudges[0];
  assert.equal(nudge.kind, "MINIMUM_LOOKS_LIKE_LOW_POINT");
  assert.equal(nudge.field, "statement.requiredMinimumBalanceCents");
  assert.ok(nudge.message.includes("$1,100.00"));
  assert.match(nudge.message, /lowest projected balance/);
  assert.match(nudge.message, /check which one you typed/);
  assert.equal(comparison.overall, "matches", "the matching claim decides; the nudge does not change it");
  assert.equal(letterKind(result, comparison), "REQUEST_FOR_INFORMATION");

  const withPayment = compareWithStatement(result, { requiredMinimumBalanceCents: 110000, claimedKind: "surplus", claimedAmountCents: 30000, newMonthlyEscrowCents: 40000 });
  assertWellFormed(withPayment);
  assert.equal(withPayment.overall, "matches");
  assert.deepStrictEqual(cushionOutcomes(withPayment), ["nudge:MINIMUM_LOOKS_LIKE_LOW_POINT"]);
});

test("N1 case (c): TV01, the $1,100 low point typed as the minimum with NO claim → CUSHION_MAYBE_OVER_CAP, two-sided, with the dollars", () => {
  const result = analyze(surplusAccount());
  const comparison = compareWithStatement(result, { requiredMinimumBalanceCents: 110000 });
  assertWellFormed(comparison);
  assert.deepStrictEqual(kindsOf(comparison), ["CUSHION_MAYBE_OVER_CAP"]);
  assert.deepStrictEqual(comparison.nudges, []);
  assert.equal(comparison.overall, "look-here");
  assert.equal(comparison.provided, true);

  const row = rowByKey(comparison, "requiredMinimumBalance");
  assert.equal(row.status, "differs");
  assert.match(row.note, /lowest projected balance/);
  assert.match(row.note, /check which line/i);

  const flag = flagByKind(comparison, "CUSHION_MAYBE_OVER_CAP");
  assert.equal(flag.rowKey, "requiredMinimumBalance");
  assert.equal(flag.field, "statement.requiredMinimumBalanceCents");
  assert.equal(flag.amountCents, 30000);
  assert.equal(flag.cite, "12 CFR 1024.17(c)(5)");
  assert.equal("perYearCents" in flag, false);
  // Both sides, plainly, with every dollar figure.
  assert.ok(flag.sentence.includes("$1,100.00") && flag.sentence.includes("$300.00") && flag.sentence.includes("$800.00"));
  assert.match(flag.sentence, /one-sixth of your yearly bills/);
  assert.match(flag.sentence, /lowest projected balance/);
  assert.match(flag.sentence, /two different lines/);
  assert.match(flag.sentence, /check which line you typed/i);
  assert.match(flag.sentence, /If \$1,100\.00 really is the required minimum, it is \$300\.00 over the limit/);
  assert.match(flag.sentence, /worth asking your servicer about/);
  // The letter line ASKS the servicer to confirm; it asserts nothing.
  assert.match(flag.letterLine, /Please confirm the required minimum balance/);
  assert.equal(/error|over the limit|too (much|high)/i.test(flag.letterLine), false, flag.letterLine);
  assert.equal(letterKind(result, comparison), "REQUEST_FOR_INFORMATION");
});

test("N1 case (c) also covers a claim that disagrees by some OTHER amount, and a kind with no amount", () => {
  const result = analyze(surplusAccount()); // F = +$300; typed minimum − cap = $300
  // A servicer really using $1,100 would print "none". A claimed surplus of $120 fits neither (a) nor (b).
  const otherSize = compareWithStatement(result, { requiredMinimumBalanceCents: 110000, claimedKind: "surplus", claimedAmountCents: 12000 });
  assertWellFormed(otherSize);
  assert.deepStrictEqual(kindsOf(otherSize), ["AMOUNT_DIFFERS", "CUSHION_MAYBE_OVER_CAP"]);
  assert.equal(flagByKind(otherSize, "AMOUNT_DIFFERS").sentence.includes("extra cushion"), false, "case (c) never blames an 'extra cushion'");
  assert.deepStrictEqual(otherSize.nudges, []);

  const kindOnly = compareWithStatement(result, { requiredMinimumBalanceCents: 110000, claimedKind: "surplus" });
  assertWellFormed(kindOnly);
  assert.deepStrictEqual(kindsOf(kindOnly), ["CUSHION_MAYBE_OVER_CAP"]);
});

test("N1 case (b), the director's worked check, on the small named function: federal surplus $300, statement says SHORTAGE $300, typed minimum − cap = $600", () => {
  const result = analyze(surplusAccount()); // F = +$300
  assert.equal(result.differenceCents, 30000);
  // A servicer really using a cushion $600 over the cap would find $300 − $600 = −$300: a shortage of $300.
  assert.equal(claimPointsToARealCushion(result, "shortage", 30000, 60000), true);
  assert.equal(claimPointsToARealCushion(result, "shortage", 30700, 60000), true, "$7.00 off is still 'about'");
  assert.equal(claimPointsToARealCushion(result, "shortage", 30701, 60000), false);
  assert.equal(claimPointsToARealCushion(result, "surplus", 30000, 60000), false, "the sign matters: a SURPLUS of $300 is $600 away");
  assert.equal(claimPointsToARealCushion(result, "none", 0, 30000), true, "extra $300 → the servicer finds $0 → 'none'");
  assert.equal(claimPointsToARealCushion(result, "none", 0, 60000), false);
});

test("N1 case (b) with a real deficiency: a claimed shortage or deficiency may name the shortage part or the total", () => {
  const result = analyze(deficiencyAndShortageAccount()); // TV04: deficiency $2,400 + shortage $3,300, F = −$5,700
  assert.equal(result.differenceCents, -570000);
  const extra = 50000; // a cushion $500 over the cap: shortage part $3,800, total $6,200
  assert.equal(claimPointsToARealCushion(result, "shortage", 380000, extra), true, "the shortage part, from $0 up to the higher target");
  assert.equal(claimPointsToARealCushion(result, "shortage", 620000, extra), true, "the total below the higher target");
  assert.equal(claimPointsToARealCushion(result, "deficiency", 380000, extra), true);
  assert.equal(claimPointsToARealCushion(result, "deficiency", 620000, extra), true);
  assert.equal(claimPointsToARealCushion(result, "deficiency", 240000, extra), false, "the deficiency part alone says nothing about the cushion");
  assert.equal(claimPointsToARealCushion(result, "shortage", 330000, extra), false, "that is the FEDERAL shortage: no sign of a bigger cushion");
  assert.equal(claimPointsToARealCushion(result, "shortage", 400000, extra), false, "some other size → falls to case (c)");
});

test("N1 case (b) through the public function, with a KIND mismatch read by signed arithmetic", () => {
  // TV01: F = +$300.00, low point $1,100.00, cap $800.00. Typed minimum $1,107.00 (low point + $7.00,
  // so the trigger is met): extra = $307.00. A servicer really using it would find $300 − $307 = −$7:
  // a SHORTAGE of $7.00, where the federal math finds a SURPLUS.
  const result = analyze(surplusAccount());
  const comparison = compareWithStatement(result, { requiredMinimumBalanceCents: 110700, claimedKind: "shortage", claimedAmountCents: 700 });
  assertWellFormed(comparison);
  assert.deepStrictEqual(kindsOf(comparison), ["CUSHION_OVER_CAP", "KIND_DIFFERS"]);
  assert.deepStrictEqual(comparison.nudges, []);
  // $14.00 is still within $7.00 of that −$7.00; $14.01 is not → case (c).
  assert.deepStrictEqual(kindsOf(compareWithStatement(result, { requiredMinimumBalanceCents: 110700, claimedKind: "shortage", claimedAmountCents: 1400 })), ["CUSHION_OVER_CAP", "KIND_DIFFERS"]);
  assert.deepStrictEqual(kindsOf(compareWithStatement(result, { requiredMinimumBalanceCents: 110700, claimedKind: "shortage", claimedAmountCents: 1401 })), ["CUSHION_MAYBE_OVER_CAP", "KIND_DIFFERS"]);
});

test("N1 order: when the extra is between $7.01 and $14.00, (a) and (b) can both be true, and (a) wins", () => {
  const account = surplusAccount();
  account.startingBalanceCents = 121000; // low point $810 = cap + $10.00; F = +$10.00
  const result = analyze(account);
  assert.equal(result.lowPoint.projectedBalanceCents, 81000);
  assert.equal(result.differenceCents, 1000);
  // Claim: surplus $5.00. It matches the federal $10.00 within $7.00 → (a).
  // It also sits within $7.00 of what a servicer really using $810 would print ($0) → (b). (a) wins.
  const comparison = compareWithStatement(result, { requiredMinimumBalanceCents: 81000, claimedKind: "surplus", claimedAmountCents: 500 });
  assertWellFormed(comparison);
  assert.deepStrictEqual(comparison.flags, []);
  assert.deepStrictEqual(cushionOutcomes(comparison), ["nudge:MINIMUM_LOOKS_LIKE_LOW_POINT"]);
  assert.equal(rowByKey(comparison, "requiredMinimumBalance").status, "not-compared");
});

test("N1 trigger edges: |typed − low point| = $7.00 → the rule applies; $7.01 → plain CUSHION_OVER_CAP", () => {
  const result = analyze(surplusAccount()); // cap 80000, low point 110000
  for (const typed of [110700, 109300]) {
    const comparison = compareWithStatement(result, { requiredMinimumBalanceCents: typed });
    assert.deepStrictEqual(kindsOf(comparison), ["CUSHION_MAYBE_OVER_CAP"], String(typed));
    assert.deepStrictEqual(comparison.nudges, []);
  }
  for (const typed of [110701, 109299]) {
    const comparison = compareWithStatement(result, { requiredMinimumBalanceCents: typed });
    assert.deepStrictEqual(kindsOf(comparison), ["CUSHION_OVER_CAP"], String(typed));
    assert.equal(rowByKey(comparison, "requiredMinimumBalance").status, "over-limit");
    assert.deepStrictEqual(comparison.nudges, []);
  }
});

test("N1 trigger edges: typed − cap = $7.00 → cushion row 'match', no rule; $7.01 → the rule applies", () => {
  const account = surplusAccount();
  account.startingBalanceCents = 120700; // low point $807.00 = cap + $7.00
  const atTolerance = compareWithStatement(analyze(account), { requiredMinimumBalanceCents: 80700 });
  assert.equal(rowByKey(atTolerance, "requiredMinimumBalance").status, "match");
  assert.deepStrictEqual(atTolerance.nudges, []);
  assert.deepStrictEqual(atTolerance.flags, []);

  account.startingBalanceCents = 120701; // low point $807.01 = cap + $7.01
  const justOver = compareWithStatement(analyze(account), { requiredMinimumBalanceCents: 80701 });
  assert.deepStrictEqual(kindsOf(justOver), ["CUSHION_MAYBE_OVER_CAP"]);
  assert.equal(flagByKind(justOver, "CUSHION_MAYBE_OVER_CAP").amountCents, 701);
});

test("N1 case (b) edges: |(F − S) − (typed − cap)| = $7.00 → (b); $7.01 → (c)", () => {
  const result = analyze(auditorN1Account()); // F = +60000, typed − cap = 60000, so a real servicer prints $0
  // A claimed SURPLUS of $7.00 is $7.00 away from that $0 → still (b). $7.01 → (c).
  // (Neither matches the federal +$600, so (a) is out.)
  const atEdge = compareWithStatement(result, { requiredMinimumBalanceCents: 180000, claimedKind: "surplus", claimedAmountCents: 700 });
  assert.deepStrictEqual(kindsOf(atEdge), ["AMOUNT_DIFFERS", "CUSHION_OVER_CAP"]);
  const pastEdge = compareWithStatement(result, { requiredMinimumBalanceCents: 180000, claimedKind: "surplus", claimedAmountCents: 701 });
  assert.deepStrictEqual(kindsOf(pastEdge), ["AMOUNT_DIFFERS", "CUSHION_MAYBE_OVER_CAP"]);
  // The same on the shortage side: a claimed shortage of $7.00 → (b); $7.01 → (c).
  const shortageAtEdge = compareWithStatement(result, { requiredMinimumBalanceCents: 180000, claimedKind: "shortage", claimedAmountCents: 700 });
  assert.deepStrictEqual(kindsOf(shortageAtEdge), ["CUSHION_OVER_CAP", "KIND_DIFFERS"]);
  const shortagePastEdge = compareWithStatement(result, { requiredMinimumBalanceCents: 180000, claimedKind: "shortage", claimedAmountCents: 701 });
  assert.deepStrictEqual(kindsOf(shortagePastEdge), ["CUSHION_MAYBE_OVER_CAP", "KIND_DIFFERS"]);
});

test("N1: a genuine over-cap cushion that is NOT the low point still fires plain CUSHION_OVER_CAP, with no nudge (example 3)", () => {
  const comparison = compareWithStatement(analyze(onTargetAccount()), { requiredMinimumBalanceCents: 180000 }); // low point $1,200
  assert.deepStrictEqual(kindsOf(comparison), ["CUSHION_OVER_CAP"]);
  assert.deepStrictEqual(comparison.nudges, []);
});

test("N1: the case the old rule hid — a real 3-month cushion with the balance sitting on it — is now amber, with both sides and the $600", () => {
  const account = onTargetAccount();
  account.startingBalanceCents = 240000; // federal low point becomes $1,800 = the statement's minimum; cap $1,200
  const result = analyze(account);
  assert.equal(result.lowPoint.projectedBalanceCents, 180000);
  const comparison = compareWithStatement(result, { requiredMinimumBalanceCents: 180000 });
  assert.deepStrictEqual(kindsOf(comparison), ["CUSHION_MAYBE_OVER_CAP"]);
  const sentence = comparison.flags[0].sentence;
  assert.ok(sentence.includes("$1,800.00") && sentence.includes("$600.00") && sentence.includes("$1,200.00"));
  assert.match(sentence, /If \$1,800\.00 really is the required minimum/);
});

test("N1: in cases (a) and (c) no other sentence blames an 'extra cushion'; in case (b) the claim's sentence does", () => {
  const result = analyze(surplusAccount());
  const caseC = compareWithStatement(result, { requiredMinimumBalanceCents: 110000, claimedKind: "surplus", claimedAmountCents: 12000, newMonthlyEscrowCents: 99900 });
  for (const flag of caseC.flags) assert.equal(flag.sentence.includes("extra cushion"), false, flag.kind);

  const caseB = compareWithStatement(result, { requiredMinimumBalanceCents: 110000, claimedKind: "none" });
  assert.deepStrictEqual(kindsOf(caseB), ["CUSHION_OVER_CAP", "KIND_DIFFERS"]);
  assert.match(flagByKind(caseB, "KIND_DIFFERS").sentence, /This gap is the same size as the extra cushion, so the cushion is the likely reason\./);
});

test("N1: the flags that make a letter a NOTICE OF ERROR are an explicit list, and CUSHION_MAYBE_OVER_CAP is not on it", () => {
  assert.deepStrictEqual(FLAGS_THAT_ASSERT_A_DISCREPANCY, ["CUSHION_OVER_CAP", "PAYMENT_ABOVE_MAX", "KIND_DIFFERS", "SPREAD_TOO_SHORT"]);
  const result = analyze(surplusAccount());
  const alone = compareWithStatement(result, { requiredMinimumBalanceCents: 110000 });
  assert.equal(letterKind(result, alone), "REQUEST_FOR_INFORMATION");
  const letter = buildLetter(result, alone, {});
  assert.ok(letter.includes("Re: Request for information under 12 C.F.R. § 1024.36"));
  assert.equal(letter.includes("I believe the statement contains the error"), false);
  assert.match(letter, /1\. The statement lists a required minimum balance of \$1,100\.00\./);
  assert.match(letter, /Please confirm the required minimum balance/);
});

test("N1: explainVerdict and nextSteps with ONLY the maybe flag — amber, never 'matches', the request for information leads the letters", () => {
  const result = analyze(auditorN1Account());
  const comparison = compareWithStatement(result, { requiredMinimumBalanceCents: 180000, newMonthlyEscrowCents: 60000 });
  const verdict = explainVerdict(result, comparison);
  assert.equal(verdict.tone, "flag");
  assert.equal(verdict.headline, "One thing on your statement is worth a closer look.");
  assert.match(verdict.body, /The number typed as the required minimum is \$600\.00 above the most the rule allows/);
  assert.match(verdict.body, /lowest projected balance/);
  assert.equal(verdict.body.includes("the shortage or surplus figure"), false, "the maybe flag has its own phrase");

  const titles = nextSteps(result, comparison).map((step) => step.title);
  assert.ok(titles.includes("Check which line you typed"));
  assert.equal(titles.includes("Put it in writing: a notice of error"), false);
  const letterSteps = titles.filter((title) => title.includes("notice of error") || title.includes("request for information"));
  assert.equal(letterSteps[0], "Ask for the worksheet: a request for information");
});

// =====================================================================
// FIX ORDER 3, N2: a borrower who is NOT current, with a deficiency, still has
// a payment ceiling. 12 CFR 1024.17(f)(4)(iii) hands the SCHEDULE for
// collecting a deficiency to the mortgage documents. It does not make the
// AMOUNT unlimited: no month can collect more than the WHOLE deficiency.
//   ceiling = bills ÷ 12 + shortage ÷ 12 + the whole deficiency
//   tolerance = $1.00 for each separately rounded part of that (audit A1)
// Before this fix ANY payment was a green "match" on such an account.
// =====================================================================

// The auditor's N2 repro: one bill of $3,600 in June, balance −$10.00, a
// payment more than 30 days late. Base $300.00, shortage $2,400.00 (÷ 12 =
// $200.00), deficiency $10.00. Ceiling $300 + $200 + $10 = $510.00, 3 parts.
function auditorN2Account() {
  return {
    startMonth: 1,
    startingBalanceCents: -1000,
    cushionMonths: 2,
    borrowerCurrent: false,
    disbursements: [{ label: "Property tax", month: 6, amountCents: 360000 }],
  };
}

test("N2 auditor's repro: $1,000.00 and $5,000.00 a month on a $10.00 deficiency are PAYMENT_ABOVE_MAX, not green", () => {
  const result = analyze(auditorN2Account());
  assert.equal(result.baseMonthlyPaymentCents, 30000);
  assert.equal(result.shortageCents, 240000);
  assert.equal(result.deficiencyCents, 1000);
  assert.equal(result.classification, "DEFICIENCY_BORROWER_NOT_CURRENT_AND_SHORTAGE_GE_ONE_MONTH");

  for (const paymentCents of [100000, 500000]) {
    const comparison = compareWithStatement(result, { newMonthlyEscrowCents: paymentCents });
    assertWellFormed(comparison);
    assert.deepStrictEqual(kindsOf(comparison), ["PAYMENT_ABOVE_MAX"], String(paymentCents));
    assert.equal(comparison.overall, "look-here");
    const row = rowByKey(comparison, "newMonthlyEscrow");
    assert.equal(row.status, "over-limit");
    assert.equal(row.federalCents, 51000);
    const flag = flagByKind(comparison, "PAYMENT_ABOVE_MAX");
    assert.equal(flag.amountCents, paymentCents - 51000);
    assert.equal(explainVerdict(result, comparison).tone, "flag");
    assert.equal(letterKind(result, comparison), "NOTICE_OF_ERROR");
  }
});

test("N2 wording: the ceiling is a ONE-MONTH allowance, so the flag says 'at least … a month' and makes no yearly claim", () => {
  const result = analyze(auditorN2Account());
  const comparison = compareWithStatement(result, { newMonthlyEscrowCents: 100000 });
  const flag = flagByKind(comparison, "PAYMENT_ABOVE_MAX");
  assert.equal("perYearCents" in flag, false, "no yearly figure: the whole-deficiency allowance applies to one month at most");
  assert.ok(flag.sentence.includes("$1,000.00") && flag.sentence.includes("$510.00") && flag.sentence.includes("$10.00"));
  assert.match(flag.sentence, /bills ÷ 12 \+ shortage ÷ 12 \+ the whole deficiency/);
  assert.match(flag.sentence, /at least \$490\.00 a month more/);
  assert.equal(/over 12 months|a year/.test(flag.sentence), false, flag.sentence);
  assert.match(flag.sentence, /12 CFR 1024\.17\(f\)\(4\)\(iii\)/);
  assert.match(flag.letterLine, /at least \$490\.00 a month more/);
  assert.equal(/over 12 months/.test(flag.letterLine), false);
  // The banner's short phrase copes with a flag that has no yearly figure.
  const verdict = explainVerdict(result, comparison);
  assert.match(verdict.body, /The new payment is at least \$490\.00 a month above the most the federal math supports in any one month\./);
  for (const leak of ["undefined", "NaN"]) assert.equal(verdict.body.includes(leak), false);
});

test("N2 edges: exactly the ceiling and ceiling + tolerance ($3.00 for 3 parts) are not flagged; one cent more is", () => {
  const result = analyze(auditorN2Account());
  for (const paymentCents of [51000, 51300]) {
    const comparison = compareWithStatement(result, { newMonthlyEscrowCents: paymentCents });
    assertWellFormed(comparison);
    assert.deepStrictEqual(comparison.flags, [], String(paymentCents));
    assert.equal(rowByKey(comparison, "newMonthlyEscrow").status, "match");
    assert.equal(comparison.overall, "matches");
  }
  const over = compareWithStatement(result, { newMonthlyEscrowCents: 51301 });
  assert.deepStrictEqual(kindsOf(over), ["PAYMENT_ABOVE_MAX"]);
  assert.equal(flagByKind(over, "PAYMENT_ABOVE_MAX").amountCents, 301);

  // With no shortage there are 2 parts (bills ÷ 12 and the whole deficiency): $2.00.
  const account = auditorN2Account();
  account.cushionMonths = 0;
  account.disbursements = [{ label: "Property tax", month: 12, amountCents: 360000 }]; // nothing outruns the deposits → no shortage
  const noShortage = analyze(account);
  assert.equal(noShortage.shortageCents, 0);
  assert.equal(noShortage.deficiencyCents, 1000);
  assert.equal(rowByKey(compareWithStatement(noShortage, { newMonthlyEscrowCents: 31200 }), "newMonthlyEscrow").status, "match");
  assert.deepStrictEqual(kindsOf(compareWithStatement(noShortage, { newMonthlyEscrowCents: 31201 })), ["PAYMENT_ABOVE_MAX"]);
});

test("N2: inside the ceiling the row note says what this page can and cannot check", () => {
  const result = analyze(auditorN2Account());
  const row = rowByKey(compareWithStatement(result, { newMonthlyEscrowCents: 50700 }), "newMonthlyEscrow");
  assert.equal(row.status, "match");
  assert.match(row.note, /You ticked that a payment was more than 30 days late/);
  assert.match(row.note, /does not set the schedule for collecting the deficiency/);
  assert.match(row.note, /no month can collect more than the whole deficiency \(\$10\.00\)/);
});

test("N2 must not regress A3: TV23 ($300 → $550, deficiency $200) is still a match", () => {
  const result = analyze(accountFromVector(VECTORS.find((vector) => vector.id === "TV23")));
  assert.equal(result.inputs.borrowerCurrent, false);
  assert.equal(result.deficiencyCents, 20000);
  assert.equal(result.newMonthlyEscrowPayment.monthlyEscrowAfterDeficiencyRepaidCents, 45000);
  const comparison = compareWithStatement(result, { currentMonthlyEscrowCents: 30000, newMonthlyEscrowCents: 55000 });
  assert.deepStrictEqual(comparison.flags, []);
  assert.equal(rowByKey(comparison, "newMonthlyEscrow").status, "match");
  // The ceiling for TV23 is $300 + $150 + $200 = $650.00 (+ $3.00).
  assert.equal(rowByKey(compareWithStatement(result, { newMonthlyEscrowCents: 65300 }), "newMonthlyEscrow").status, "match");
  assert.deepStrictEqual(kindsOf(compareWithStatement(result, { newMonthlyEscrowCents: 65301 })), ["PAYMENT_ABOVE_MAX"]);
});

test("N2: a CURRENT borrower's ceiling is unchanged — bills ÷ 12 + shortage ÷ 12 + deficiency ÷ 2, with its yearly figure", () => {
  const account = auditorN2Account();
  account.borrowerCurrent = true;
  const result = analyze(account);
  assert.equal(result.newMonthlyEscrowPayment.monthlyEscrowWhileRepayingDeficiencyCents, 50500); // $300 + $200 + $5
  assert.equal(rowByKey(compareWithStatement(result, { newMonthlyEscrowCents: 50800 }), "newMonthlyEscrow").status, "match");
  const over = compareWithStatement(result, { newMonthlyEscrowCents: 50801 });
  const flag = flagByKind(over, "PAYMENT_ABOVE_MAX");
  assert.equal(flag.amountCents, 301);
  assert.equal(flag.perYearCents, 3612);
  assert.match(flag.sentence, /bills ÷ 12 \+ shortage ÷ 12 \+ deficiency ÷ 2/);
  assert.match(flag.sentence, /over 12 months/);
});

test("nudges is ALWAYS present, and empty when there is nothing to nudge", () => {
  assert.deepStrictEqual(compareWithStatement(analyze(surplusAccount()), undefined).nudges, []);
  assert.deepStrictEqual(compareWithStatement(analyze(surplusAccount()), { newMonthlyEscrowCents: 40000 }).nudges, []);
});
