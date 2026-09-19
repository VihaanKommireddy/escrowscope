// tests/analyze.test.js — the parts of analyze.js the 22 vectors do not pin
// down on their own: defaults, refusing bad input, the combined deficiency +
// shortage tiers, rounding edge cases, and projectWithPayment (SPEC D5).

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  analyze,
  projectWithPayment,
  TOLERANCE_BALANCE_CENTS,
  TOLERANCE_PAYMENT_CENTS,
} from "../engine/index.js";
import { splitDifference } from "../engine/analyze.js";

function tv01Account() {
  return {
    startMonth: 1,
    startingBalanceCents: 150000,
    cushionMonths: 2,
    borrowerCurrent: true,
    disbursements: [
      { label: "Property tax 1st half", month: 5, amountCents: 180000 },
      { label: "Homeowners insurance", month: 7, amountCents: 120000 },
      { label: "Property tax 2nd half", month: 11, amountCents: 180000 },
    ],
  };
}

// ---------- the constants the page and compare.js share ----------

test("tolerances: $7.00 on balances, $1.00 on a monthly payment", () => {
  assert.equal(TOLERANCE_BALANCE_CENTS, 700);
  assert.equal(TOLERANCE_PAYMENT_CENTS, 100);
});

// ---------- the owner's hand-worked case, spelled out ----------

test("test case #1 by hand: $4,800 bills → $400 a month, $800 cap, low $1,100 in November, $300 surplus", () => {
  const result = analyze(tv01Account());
  assert.equal(result.annualDisbursementsCents, 480000);
  assert.equal(result.baseMonthlyPaymentCents, 40000);
  assert.equal(result.cushionCapCents, 80000);
  assert.equal(result.lowPoint.projectedBalanceCents, 110000);
  assert.equal(result.lowPoint.month, 11);
  assert.equal(result.surplusCents, 30000);
  assert.equal(result.classification, "SURPLUS_REFUND_REQUIRED");
});

// ---------- defaults and refusing bad input ----------

test("cushionMonths defaults to 2 and borrowerCurrent defaults to true", () => {
  const account = tv01Account();
  delete account.cushionMonths;
  delete account.borrowerCurrent;
  const result = analyze(account);
  assert.equal(result.cushionCapCents, 80000);
  assert.equal(result.classification, "SURPLUS_REFUND_REQUIRED");
  assert.equal(result.inputs.cushionMonths, 2);
  assert.equal(result.inputs.borrowerCurrent, true);
});

test("analyze throws when validateAccount finds errors, and carries the list", () => {
  const account = tv01Account();
  account.disbursements = [];
  assert.throws(
    () => analyze(account),
    (error) => {
      assert.ok(error instanceof Error);
      assert.equal(error.errors.length, 1);
      assert.equal(error.errors[0].field, "disbursements");
      return true;
    }
  );
  assert.throws(() => analyze(undefined), Error);
  assert.throws(() => analyze({}), Error);
});

test("analyze does NOT throw for warnings", () => {
  const account = tv01Account();
  account.disbursements = [{ label: "Property tax", month: 11, amountCents: 360000 }]; // one bill → warning only
  assert.doesNotThrow(() => analyze(account));
});

test("analyze never changes the account it is given", () => {
  const account = tv01Account();
  const before = JSON.stringify(account);
  analyze(account);
  assert.equal(JSON.stringify(account), before);
});

test("the result echoes the inputs it used, including each bill's calendar month", () => {
  const account = tv01Account();
  account.startMonth = 7;
  const result = analyze(account);
  assert.equal(result.inputs.startMonth, 7);
  assert.equal(result.inputs.startingBalanceCents, 150000);
  assert.deepStrictEqual(result.inputs.disbursements[0], {
    label: "Property tax 1st half",
    month: 5,
    calendarMonth: 11,
    amountCents: 180000,
  });
  // The echo is a copy: changing it cannot reach back into the caller's account.
  result.inputs.disbursements[0].amountCents = 1;
  assert.equal(account.disbursements[0].amountCents, 180000);
});

test("paymentJumpDecomposition appears only when priorYear is given", () => {
  const without = analyze(tv01Account());
  assert.equal("paymentJumpDecomposition" in without, false);

  const account = tv01Account();
  account.priorYear = { annualDisbursementsCents: 420000, monthlyEscrowCents: 35000, cushionCents: 70000, stepTwoAddCents: 35000 };
  const withPrior = analyze(account);
  assert.equal(withPrior.paymentJumpDecomposition.oldMonthlyEscrowCents, 35000);
  assert.equal(withPrior.paymentJumpDecomposition.billsWentUpCents, 5000);
});

test("the shortage breakdown's three pieces always add up to required start − starting balance", () => {
  const account = tv01Account();
  account.startingBalanceCents = 90000;
  account.priorYear = { annualDisbursementsCents: 433300, monthlyEscrowCents: 36108, cushionCents: 72216, stepTwoAddCents: 31234 };
  const result = analyze(account);
  const pieces = result.paymentJumpDecomposition.shortageBreakdown;
  const sum = pieces.cushionRoseCents + pieces.timingNeedRoseCents + pieces.lastYearCameInUnderProjectionCents;
  assert.equal(sum, result.requiredStartingBalanceCents - 90000);
  assert.equal(sum, -result.differenceCents);
});

// ---------- splitDifference: surplus / shortage / deficiency ----------

test("splitDifference: the three amounts for every kind of balance", () => {
  // balance above target → surplus
  assert.deepStrictEqual(splitDifference(150000, 120000), { surplusCents: 30000, shortageCents: 0, deficiencyCents: 0 });
  // on target
  assert.deepStrictEqual(splitDifference(120000, 120000), { surplusCents: 0, shortageCents: 0, deficiencyCents: 0 });
  // positive but below target → shortage only
  assert.deepStrictEqual(splitDifference(10000, 120000), { surplusCents: 0, shortageCents: 110000, deficiencyCents: 0 });
  // zero balance → shortage only (zero is not negative)
  assert.deepStrictEqual(splitDifference(0, 120000), { surplusCents: 0, shortageCents: 120000, deficiencyCents: 0 });
  // negative → deficiency first, then the shortage from $0 up to target (HUD Appendix M, TV04)
  assert.deepStrictEqual(splitDifference(-240000, 330000), { surplusCents: 0, shortageCents: 330000, deficiencyCents: 240000 });
  // negative with a $0 target → deficiency only (TV12)
  assert.deepStrictEqual(splitDifference(-15000, 0), { surplusCents: 0, shortageCents: 0, deficiencyCents: 15000 });
});

// ---------- tiers the vectors do not reach ----------

function negativeBalanceAccount(startingBalanceCents) {
  // Bills $4,800 → one month's payment is $400, cap $800, required start $1,200.
  const account = tv01Account();
  account.startingBalanceCents = startingBalanceCents;
  return account;
}

test("small deficiency + large shortage: each part gets its own tier, cite and options", () => {
  const result = analyze(negativeBalanceAccount(-10000)); // −$100
  assert.equal(result.deficiencyCents, 10000);
  assert.equal(result.shortageCents, 120000);
  assert.equal(result.differenceCents, -130000);
  assert.equal(result.classification, "DEFICIENCY_LT_ONE_MONTH_AND_SHORTAGE_GE_ONE_MONTH");
  assert.equal(result.cite, "12 CFR 1024.17(f)(4)(i) + 12 CFR 1024.17(f)(3)(ii)");
  assert.deepStrictEqual(result.servicerOptions, [
    "deficiency: do nothing",
    "deficiency: require repayment within 30 days",
    "deficiency: require repayment in 2 or more equal monthly payments",
    "shortage: do nothing",
    "shortage: require repayment in equal monthly payments over at least 12 months",
  ]);
  assert.deepStrictEqual(result.newMonthlyEscrowPayment, {
    baseMonthlyCents: 40000,
    shortageSpreadOver12Cents: 10000,
    deficiencySpreadCents: 5000,
    deficiencySpreadMonths: 2,
    monthlyEscrowWhileRepayingDeficiencyCents: 55000,
    monthlyEscrowAfterDeficiencyRepaidCents: 50000,
  });
});

test("a deficiency of EXACTLY one month's payment is in the greater-or-equal tier, one cent less is not", () => {
  assert.equal(analyze(negativeBalanceAccount(-40000)).classification, "DEFICIENCY_GE_ONE_MONTH_AND_SHORTAGE_GE_ONE_MONTH");
  assert.equal(analyze(negativeBalanceAccount(-39999)).classification, "DEFICIENCY_LT_ONE_MONTH_AND_SHORTAGE_GE_ONE_MONTH");
});

test("small deficiency + small shortage (zero cushion keeps the target low)", () => {
  const account = negativeBalanceAccount(-5000); // −$50.00
  account.cushionMonths = 0;

  // Part 1. Bills: $600 in month 6 and $600 in month 12. D = $1,200, P = $100.
  // Step 1 touches $0 in months 6 and 12 but never goes below it, so the
  // step-2 add is $0 and (with no cushion) the required start is $0.
  // Only the deficiency is left.
  account.disbursements = [
    { label: "Tax", month: 6, amountCents: 60000 },
    { label: "Insurance", month: 12, amountCents: 60000 },
  ];
  const onlyDeficiency = analyze(account);
  assert.equal(onlyDeficiency.classification, "DEFICIENCY_LT_ONE_MONTH");
  assert.equal(onlyDeficiency.shortageCents, 0);

  // Part 2. Move the first bill a month earlier and make it $590.
  // D = $1,190, P = $99.17. Month 5: 5 × $99.17 − $590 = −$94.15 → step-2 add
  // $94.15 → required start $94.15. That is a shortage smaller than P.
  account.disbursements[0].month = 5;
  account.disbursements[0].amountCents = 59000;
  const both = analyze(account);
  assert.equal(both.baseMonthlyPaymentCents, 9917);
  assert.equal(both.stepTwoAddCents, 9415);
  assert.equal(both.deficiencyCents, 5000);
  assert.equal(both.shortageCents, 9415);
  assert.equal(both.classification, "DEFICIENCY_LT_ONE_MONTH_AND_SHORTAGE_LT_ONE_MONTH");
  assert.equal(both.cite, "12 CFR 1024.17(f)(4)(i) + 12 CFR 1024.17(f)(3)(i)");
});

test("borrower not current + deficiency: the (f)(4) repayment options do not bind the servicer", () => {
  const account = negativeBalanceAccount(-10000);
  account.borrowerCurrent = false;
  const result = analyze(account);
  // The math and the classification stay the same …
  assert.equal(result.classification, "DEFICIENCY_LT_ONE_MONTH_AND_SHORTAGE_GE_ONE_MONTH");
  // … but the cite and the options say that (f)(4)(iii) applies to the deficiency part.
  assert.equal(result.cite, "12 CFR 1024.17(f)(4)(iii) + 12 CFR 1024.17(f)(3)(ii)");
  assert.deepStrictEqual(result.servicerOptions, [
    "deficiency: borrower is not current, so the servicer may recover it pursuant to the loan documents",
    "shortage: do nothing",
    "shortage: require repayment in equal monthly payments over at least 12 months",
  ]);
});

test("borrower not current does not change a plain shortage: (f)(3) has no 'current' condition", () => {
  const account = tv01Account();
  account.startingBalanceCents = 100000;
  account.borrowerCurrent = false;
  const result = analyze(account);
  assert.equal(result.classification, "SHORTAGE_LT_ONE_MONTH");
  assert.equal(result.cite, "12 CFR 1024.17(f)(3)(i)");
});

// ---------- rounding edge: the step-2 add never goes below zero ----------

test("when rounding leaves step 1 a few cents ABOVE zero all year, the step-2 add is $0, not negative", () => {
  // One bill of $5,000.00 in month 12. P = $416.67, so 12 payments = $5,000.04.
  // Step 1 ends the year at +4 cents and never dips below zero.
  const account = {
    startMonth: 1,
    startingBalanceCents: 100000,
    cushionMonths: 2,
    borrowerCurrent: true,
    disbursements: [{ label: "Property tax", month: 12, amountCents: 500000 }],
  };
  const result = analyze(account);
  assert.equal(result.baseMonthlyPaymentCents, 41667);
  assert.equal(result.stepTwoAddCents, 0);
  assert.equal(result.requiredStartingBalanceCents, result.cushionCapCents);
  assert.equal(result.lowPoint.month, 12);
  assert.equal(result.lowPoint.projectedBalanceCents, 100004);
  // The lowest target sits 4 cents above the cap — a rounding leftover, far inside the $7 tolerance.
  assert.equal(result.lowPoint.lowestTargetBalanceCents, result.cushionCapCents + 4);
  // The row-by-row identity still holds exactly.
  assert.equal(
    result.lowPoint.projectedBalanceCents - result.lowPoint.lowestTargetBalanceCents,
    result.differenceCents
  );
});

test("a tie for the lowest month goes to the EARLIEST month", () => {
  const account = {
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
  const result = analyze(account);
  assert.equal(result.table[2].step1TrialBalanceCents, -60000);
  assert.equal(result.table[6].step1TrialBalanceCents, -60000);
  assert.equal(result.lowPoint.month, 3);
  assert.equal(result.lowPoint.calendarMonth, 6);
});

// ---------- the table ----------

test("table rows: deposit is always bills ÷ 12, bills land in their month, target − projected never changes", () => {
  const result = analyze(tv01Account());
  assert.equal(result.table.length, 12);
  let billsSeen = 0;
  for (let index = 0; index < 12; index++) {
    const row = result.table[index];
    assert.equal(row.month, index + 1);
    assert.equal(row.depositCents, result.baseMonthlyPaymentCents);
    assert.equal(row.targetBalanceCents - row.projectedBalanceCents, -result.differenceCents);
    billsSeen = billsSeen + row.disbursementCents;
  }
  assert.equal(billsSeen, result.annualDisbursementsCents);
});

test("two bills in the same month are added together in that month's row", () => {
  const account = tv01Account();
  account.disbursements.push({ label: "Flood insurance", month: 7, amountCents: 60000 });
  const result = analyze(account);
  assert.equal(result.table[6].disbursementCents, 180000);
});

// ---------- projectWithPayment (SPEC D5) ----------

test("projectWithPayment: starting balance + (payment − bills), month by month", () => {
  const balances = projectWithPayment(tv01Account(), 45000);
  assert.equal(balances.length, 12);
  assert.equal(balances[0], 150000 + 45000);
  assert.equal(balances[4], 150000 + 5 * 45000 - 180000);
  assert.equal(balances[11], 150000 + 12 * 45000 - 480000);
});

test("projectWithPayment at the base payment equals the table's projected balances", () => {
  const account = tv01Account();
  const result = analyze(account);
  const balances = projectWithPayment(account, result.baseMonthlyPaymentCents);
  assert.deepStrictEqual(balances, result.table.map((row) => row.projectedBalanceCents));
});

test("projectWithPayment accepts a $0 payment and refuses nonsense", () => {
  assert.equal(projectWithPayment(tv01Account(), 0)[11], 150000 - 480000);
  for (const bad of [-1, 450.5, NaN, "45000", undefined, null, 1000000001]) {
    assert.throws(() => projectWithPayment(tv01Account(), bad), RangeError, String(bad));
  }
  assert.throws(() => projectWithPayment({}, 45000), Error);
});
