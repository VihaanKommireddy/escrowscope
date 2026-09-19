// tests/compare.test.js — "your statement says" vs "the federal math says".

import { test } from "node:test";
import assert from "node:assert/strict";

import { analyze, compareWithStatement, formatCents, letterKind, buildLetter } from "../engine/index.js";
import { paymentToleranceCents, countPaymentParts } from "../engine/analyze.js";

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

// ---------- B2: "required minimum" that is really the LOW POINT ----------

test("B2: TV01 mix-up — typing the $1,100 low point as the required minimum gives a nudge, not CUSHION_OVER_CAP", () => {
  const result = analyze(surplusAccount()); // cap $800, low point $1,100
  const comparison = compareWithStatement(result, { requiredMinimumBalanceCents: 110000 });
  assertWellFormed(comparison);
  assert.deepStrictEqual(comparison.flags, []);
  assert.equal(rowByKey(comparison, "requiredMinimumBalance").status, "not-compared");
  assert.equal(comparison.nudges.length, 1);
  const nudge = comparison.nudges[0];
  assert.equal(nudge.kind, "MINIMUM_LOOKS_LIKE_LOW_POINT");
  assert.equal(nudge.field, "statement.requiredMinimumBalanceCents");
  // two-sided, with the dollars visible
  assert.ok(nudge.message.includes("$1,100.00"));
  assert.match(nudge.message, /lowest projected balance/);
  assert.match(nudge.message, /check which one you typed/);
  assert.ok(nudge.message.includes("$300.00") && nudge.message.includes("$800.00"));
  assert.match(nudge.message, /worth asking your servicer/);
  // a not-compared row alone is not "matches", and a nudge is never "look-here"
  assert.equal(comparison.overall, "not-provided");
  assert.equal(comparison.provided, false);
  assert.equal(letterKind(result, comparison), "REQUEST_FOR_INFORMATION");

  const withMore = compareWithStatement(result, { requiredMinimumBalanceCents: 110000, claimedKind: "surplus", claimedAmountCents: 30000, newMonthlyEscrowCents: 40000 });
  assertWellFormed(withMore);
  assert.equal(withMore.overall, "matches");
  assert.equal(withMore.nudges.length, 1);
});

test("B2: a genuine over-cap cushion that is NOT the low point still fires CUSHION_OVER_CAP, with no nudge (example 3)", () => {
  const comparison = compareWithStatement(analyze(onTargetAccount()), { requiredMinimumBalanceCents: 180000 }); // low point $1,200
  assert.deepStrictEqual(kindsOf(comparison), ["CUSHION_OVER_CAP"]);
  assert.deepStrictEqual(comparison.nudges, []);
});

test("B2: the case the rule could hide — a real 3-month cushion with the balance sitting on it — keeps both sides and the $600 visible", () => {
  const account = onTargetAccount();
  account.startingBalanceCents = 240000; // federal low point becomes $1,800 = the statement's minimum; cap $1,200
  const result = analyze(account);
  assert.equal(result.lowPoint.projectedBalanceCents, 180000);
  const comparison = compareWithStatement(result, { requiredMinimumBalanceCents: 180000 });
  assert.deepStrictEqual(comparison.flags, []);
  const message = comparison.nudges[0].message;
  assert.ok(message.includes("$1,800.00") && message.includes("$600.00") && message.includes("$1,200.00"));
  assert.match(message, /If your statement really does list/);
});

test("B2 boundaries: |typed − low point| = $7.00 → nudge; $7.01 → flag; typed within $7 of the cap → match, no nudge, no flag", () => {
  const result = analyze(surplusAccount()); // cap 80000, low point 110000
  for (const typed of [110700, 109300]) {
    const comparison = compareWithStatement(result, { requiredMinimumBalanceCents: typed });
    assert.deepStrictEqual(comparison.flags, [], String(typed));
    assert.equal(comparison.nudges.length, 1, String(typed));
  }
  for (const typed of [110701, 109299]) {
    const comparison = compareWithStatement(result, { requiredMinimumBalanceCents: typed });
    assert.deepStrictEqual(kindsOf(comparison), ["CUSHION_OVER_CAP"], String(typed));
    assert.deepStrictEqual(comparison.nudges, []);
  }
  const account = surplusAccount();
  account.startingBalanceCents = 120500; // low point $805: within $7 of the cap AND of the typed value
  const nearCap = compareWithStatement(analyze(account), { requiredMinimumBalanceCents: 80500 });
  assert.equal(rowByKey(nearCap, "requiredMinimumBalance").status, "match");
  assert.deepStrictEqual(nearCap.nudges, []);
  assert.deepStrictEqual(nearCap.flags, []);
});

test("B2: when the nudge applies, other sentences do not blame an 'extra cushion'", () => {
  const result = analyze(surplusAccount());
  const comparison = compareWithStatement(result, { requiredMinimumBalanceCents: 110000, claimedKind: "none" });
  const flag = flagByKind(comparison, "KIND_DIFFERS");
  assert.equal(flag.sentence.includes("extra cushion"), false);
});

test("nudges is ALWAYS present, and empty when there is nothing to nudge", () => {
  assert.deepStrictEqual(compareWithStatement(analyze(surplusAccount()), undefined).nudges, []);
  assert.deepStrictEqual(compareWithStatement(analyze(surplusAccount()), { newMonthlyEscrowCents: 40000 }).nudges, []);
});
