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

// ---------- SPEC E2: a deficiency when the borrower is NOT current, (f)(4)(iii) ----------

test("E2: borrower not current + deficiency + shortage → DEFICIENCY_BORROWER_NOT_CURRENT_AND_SHORTAGE_*, no invented schedule", () => {
  const account = negativeBalanceAccount(-10000);
  account.borrowerCurrent = false;
  const result = analyze(account);
  // The dollars do not change …
  assert.equal(result.deficiencyCents, 10000);
  assert.equal(result.shortageCents, 120000);
  // … the label, the cite and the options do.
  assert.equal(result.classification, "DEFICIENCY_BORROWER_NOT_CURRENT_AND_SHORTAGE_GE_ONE_MONTH");
  assert.equal(result.cite, "12 CFR 1024.17(f)(4)(iii) + 12 CFR 1024.17(f)(3)(ii)");
  assert.deepStrictEqual(result.servicerOptions, [
    "deficiency: servicer may recover the deficiency pursuant to the loan documents",
    "shortage: do nothing",
    "shortage: require repayment in equal monthly payments over at least 12 months",
  ]);
  // The regulation sets no repayment schedule here, so the engine does not make one up.
  assert.deepStrictEqual(result.newMonthlyEscrowPayment, {
    baseMonthlyCents: 40000,
    shortageSpreadOver12Cents: 10000,
    deficiencySpreadCents: 0,
    deficiencySpreadMonths: 0,
    monthlyEscrowWhileRepayingDeficiencyCents: 50000,
    monthlyEscrowAfterDeficiencyRepaidCents: 50000,
  });
});

test("E2: the small-shortage combined form, and the deficiency-only form", () => {
  const account = negativeBalanceAccount(-5000);
  account.borrowerCurrent = false;
  account.cushionMonths = 0;
  account.disbursements = [
    { label: "Tax", month: 5, amountCents: 59000 },
    { label: "Insurance", month: 12, amountCents: 60000 },
  ];
  const both = analyze(account);
  assert.equal(both.classification, "DEFICIENCY_BORROWER_NOT_CURRENT_AND_SHORTAGE_LT_ONE_MONTH");
  assert.equal(both.cite, "12 CFR 1024.17(f)(4)(iii) + 12 CFR 1024.17(f)(3)(i)");

  account.disbursements = [{ label: "Annual property tax", month: 12, amountCents: 240000 }];
  account.startingBalanceCents = -15000; // TV12's account, but not current
  const only = analyze(account);
  assert.equal(only.classification, "DEFICIENCY_BORROWER_NOT_CURRENT");
  assert.equal(only.cite, "12 CFR 1024.17(f)(4)(iii)");
  assert.deepStrictEqual(only.servicerOptions, ["deficiency: servicer may recover the deficiency pursuant to the loan documents"]);
  assert.equal(only.newMonthlyEscrowPayment.deficiencySpreadCents, 0);
  assert.equal(only.newMonthlyEscrowPayment.deficiencySpreadMonths, 0);
  assert.equal(only.newMonthlyEscrowPayment.monthlyEscrowWhileRepayingDeficiencyCents, 20000);
});

test("E2: there is no tier when not current — a huge and a tiny deficiency get the same label", () => {
  for (const balance of [-1, -39999, -40000, -500000]) {
    const account = negativeBalanceAccount(balance);
    account.borrowerCurrent = false;
    assert.equal(analyze(account).classification, "DEFICIENCY_BORROWER_NOT_CURRENT_AND_SHORTAGE_GE_ONE_MONTH");
  }
});

test("E2: shortage handling is IDENTICAL whether or not the borrower is current — (f)(3) has no such condition", () => {
  for (const balance of [100000, 80000, 0, -10000]) {
    const current = negativeBalanceAccount(balance);
    const notCurrent = negativeBalanceAccount(balance);
    notCurrent.borrowerCurrent = false;
    const a = analyze(current);
    const b = analyze(notCurrent);
    assert.equal(a.shortageCents, b.shortageCents);
    assert.equal(a.newMonthlyEscrowPayment.shortageSpreadOver12Cents, b.newMonthlyEscrowPayment.shortageSpreadOver12Cents);
    const shortageOptions = (result) => result.servicerOptions.filter((option) => option.startsWith("shortage:"));
    assert.deepStrictEqual(shortageOptions(a), shortageOptions(b));
    const shortageTier = (result) => result.classification.slice(result.classification.indexOf("SHORTAGE_"));
    assert.equal(shortageTier(a), shortageTier(b));
  }
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

test("E1 (auditor's example): one bill of $1,200.06 in month 12, balance $300 → difference 9,999¢ but low point − cushion = 10,005¢", () => {
  const account = {
    startMonth: 1,
    startingBalanceCents: 30000,
    cushionMonths: 2,
    borrowerCurrent: true,
    disbursements: [{ label: "Property tax", month: 12, amountCents: 120006 }],
  };
  const result = analyze(account);
  assert.equal(result.baseMonthlyPaymentCents, 10001); // 120006 ÷ 12 = 10000.5 → half up
  assert.equal(result.cushionCapCents, 20001);
  const lowestStepOne = Math.min(...result.table.map((row) => row.step1TrialBalanceCents));
  assert.equal(lowestStepOne, 6); // 12 × 10001 − 120006: never below zero all year
  assert.equal(result.stepTwoAddCents, 0); // the floor: never a negative add
  assert.ok(Object.is(result.stepTwoAddCents, 0), "and never negative zero");
  assert.equal(result.differenceCents, 9999);
  assert.equal(result.lowPoint.projectedBalanceCents - result.cushionCapCents, 10005);
  // The gap between the two is exactly the lowest Step 1 balance.
  assert.equal(result.lowPoint.projectedBalanceCents - result.cushionCapCents - result.differenceCents, lowestStepOne);
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
    assert.equal(row.projectedBalanceCents - row.targetBalanceCents, result.differenceCents);
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

// ---------- SPEC E3: nearLine — "too close to call" ----------

function surplusOf(cents) {
  const account = tv01Account(); // required start $1,200.00
  account.startingBalanceCents = 120000 + cents;
  return analyze(account);
}

function shortageOf(cents) {
  const account = tv01Account(); // one month's payment $400.00
  account.startingBalanceCents = 120000 - cents;
  return analyze(account);
}

test("E3: nearLine is null when nothing is near a line", () => {
  assert.equal(surplusOf(30000).nearLine, null); // TV01
  assert.equal(surplusOf(0).nearLine, null); // on target
  assert.equal(shortageOf(10000).nearLine, null);
  assert.equal(shortageOf(110000).nearLine, null); // TV19
});

test("E3: a surplus within $7.00 of $50.00 sets nearLine, and classification stays cent-exact", () => {
  const exactly50 = surplusOf(5000); // TV06
  assert.equal(exactly50.classification, "SURPLUS_REFUND_REQUIRED");
  assert.deepStrictEqual(exactly50.nearLine, {
    line: "SURPLUS_50",
    distanceCents: 0,
    toleranceCents: 700,
    appliesTo: "surplus",
    side: "at-or-above",
    amountCents: 5000,
    lineCents: 5000,
  });

  const oneCentUnder = surplusOf(4999); // TV07
  assert.equal(oneCentUnder.classification, "SURPLUS_UNDER_50");
  assert.equal(oneCentUnder.nearLine.distanceCents, 1);
  assert.equal(oneCentUnder.nearLine.side, "below");
});

test("E3: the band is $43.00 to $57.00 inclusive", () => {
  assert.equal(surplusOf(4299).nearLine, null);
  assert.equal(surplusOf(4300).nearLine.distanceCents, 700);
  assert.equal(surplusOf(5700).nearLine.distanceCents, 700);
  assert.equal(surplusOf(5701).nearLine, null);
});

test("E3: a shortage within $7.00 of one month's payment sets nearLine (TV10 / TV10b shape)", () => {
  const exactlyOneMonth = shortageOf(40000);
  assert.equal(exactlyOneMonth.classification, "SHORTAGE_GE_ONE_MONTH");
  assert.deepStrictEqual(exactlyOneMonth.nearLine, {
    line: "ONE_MONTH_PAYMENT",
    distanceCents: 0,
    toleranceCents: 700,
    appliesTo: "shortage",
    side: "at-or-above",
    amountCents: 40000,
    lineCents: 40000,
  });
  const oneCentLess = shortageOf(39999);
  assert.equal(oneCentLess.classification, "SHORTAGE_LT_ONE_MONTH");
  assert.equal(oneCentLess.nearLine.side, "below");
  assert.equal(shortageOf(39299).nearLine, null);
  assert.equal(shortageOf(40701).nearLine, null);
});

test("E3: a deficiency near one month's payment; when BOTH parts are near, the deficiency is reported", () => {
  const deficiencyNear = analyze(negativeBalanceAccount(-40300)); // deficiency $403, shortage $1,200
  assert.equal(deficiencyNear.nearLine.appliesTo, "deficiency");
  assert.equal(deficiencyNear.nearLine.distanceCents, 300);

  // Both near: zero cushion, required start $400 → shortage $400.00 and deficiency $399.00.
  const account = negativeBalanceAccount(-39900);
  account.cushionMonths = 0;
  const both = analyze(account);
  assert.equal(both.shortageCents, 40000);
  assert.equal(both.deficiencyCents, 39900);
  assert.equal(both.nearLine.appliesTo, "deficiency");
  assert.equal(both.nearLine.side, "below");

  // Only the shortage near.
  const shortageOnly = negativeBalanceAccount(-10000);
  shortageOnly.cushionMonths = 0;
  assert.equal(analyze(shortageOnly).nearLine.appliesTo, "shortage");
});

test("E3: lines that do not apply to a borrower who is not current cannot be 'near'", () => {
  const surplus = tv01Account();
  surplus.startingBalanceCents = 125000; // surplus $50.00
  surplus.borrowerCurrent = false;
  assert.equal(analyze(surplus).nearLine, null); // (f)(2)(ii): no $50 line

  const deficiency = negativeBalanceAccount(-40000);
  deficiency.borrowerCurrent = false;
  assert.equal(analyze(deficiency).nearLine, null); // (f)(4)(iii): no deficiency tier; shortage $1,200 is far

  const shortage = tv01Account();
  shortage.startingBalanceCents = 80000; // shortage $400.00
  shortage.borrowerCurrent = false;
  assert.equal(analyze(shortage).nearLine.appliesTo, "shortage"); // (f)(3) still applies
});

// ---------- SPEC E5: no negative zero ----------

test("E5: a starting balance of -0 is treated as plain 0 everywhere", () => {
  const account = tv01Account();
  account.startingBalanceCents = -0;
  account.cushionMonths = 0;
  account.disbursements = [{ label: "Tax", month: 12, amountCents: 120000 }]; // required start $0
  const result = analyze(account);
  assert.ok(Object.is(result.differenceCents, 0));
  assert.ok(Object.is(result.inputs.startingBalanceCents, 0));
  assert.ok(Object.is(result.deficiencyCents, 0));
  assert.ok(Object.is(result.stepTwoAddCents, 0));
  assert.equal(result.classification, "ON_TARGET");
  for (const balance of projectWithPayment(account, 0)) {
    assert.equal(Object.is(balance, -0), false);
  }
});

// ---------- the nine classic bugs, one named guard each ----------

test("bug 1 guard: a surplus of exactly $50.00 IS refund-required (>=, not >)", () => {
  assert.equal(surplusOf(5000).classification, "SURPLUS_REFUND_REQUIRED");
  assert.equal(surplusOf(4999).classification, "SURPLUS_UNDER_50");
});

test("bug 2 guard: a shortage of exactly one month's payment is in the GE tier", () => {
  assert.equal(shortageOf(40000).classification, "SHORTAGE_GE_ONE_MONTH");
  assert.equal(shortageOf(39999).classification, "SHORTAGE_LT_ONE_MONTH");
  assert.equal(shortageOf(40000).servicerOptions.includes("shortage: require repayment within 30 days"), false);
});

test("bug 3 guard: the cushion cap rounds DOWN ($5,000.00 × 2 ÷ 12 = $833.33, never $833.34)", () => {
  const account = tv01Account();
  account.disbursements = [{ label: "Tax", month: 10, amountCents: 500000 }];
  assert.equal(analyze(account).cushionCapCents, 83333);
  account.disbursements[0].amountCents = 500005; // × 2 ÷ 12 = 83334.17 → 83334
  assert.equal(analyze(account).cushionCapCents, 83334);
  account.disbursements[0].amountCents = 500003; // × 2 ÷ 12 = 83333.83 → still 83333
  assert.equal(analyze(account).cushionCapCents, 83333);
});

test("bug 4 guard: the monthly payment rounds HALF UP, it is not chopped ($5,000.00 ÷ 12 = $416.67)", () => {
  const account = tv01Account();
  account.disbursements = [{ label: "Tax", month: 10, amountCents: 500000 }];
  assert.equal(analyze(account).baseMonthlyPaymentCents, 41667);
  account.disbursements[0].amountCents = 120006; // exactly half a cent → up
  assert.equal(analyze(account).baseMonthlyPaymentCents, 10001);
  account.disbursements[0].amountCents = 120005; // just under half → down
  assert.equal(analyze(account).baseMonthlyPaymentCents, 10000);
});

test("bug 5 guard: on a low-point tie the EARLIEST month wins (TV21: month 6, not month 11)", () => {
  const account = {
    startMonth: 1,
    startingBalanceCents: 130000,
    cushionMonths: 2,
    borrowerCurrent: true,
    disbursements: [
      { label: "Tax", month: 6, amountCents: 210000 },
      { label: "Tax", month: 12, amountCents: 210000 },
    ],
  };
  const result = analyze(account); // P = $350. Months 6 and 12 both end Step 1 at exactly $0: a tie.
  assert.equal(result.table[5].step1TrialBalanceCents, result.table[11].step1TrialBalanceCents);
  assert.equal(result.lowPoint.month, 6);
});

test("bug 6 guard: a PROJECTED dip below $0 is a shortage, never a deficiency (TV19)", () => {
  const result = shortageOf(110000); // balance $100; the projection dips to −$300 in November
  assert.ok(result.lowPoint.projectedBalanceCents < 0);
  assert.equal(result.deficiencyCents, 0);
  assert.equal(result.shortageCents, 110000);
  assert.equal(result.classification, "SHORTAGE_GE_ONE_MONTH");
});

test("bug 7 guard: a second bill in the same month ADDS to the first, it does not replace it (TV14)", () => {
  const account = tv01Account();
  account.disbursements = [
    { label: "County tax", month: 7, amountCents: 110000 },
    { label: "City tax", month: 7, amountCents: 70000 },
  ];
  const result = analyze(account);
  assert.equal(result.table[6].disbursementCents, 180000);
  assert.equal(result.annualDisbursementsCents, 180000);
});

test("bug 8 guard: awkward totals never produce a fraction of a cent anywhere in the result", () => {
  const account = tv01Account();
  account.startingBalanceCents = 33333;
  account.disbursements = [
    { label: "Tax", month: 3, amountCents: 100001 },
    { label: "Insurance", month: 8, amountCents: 77777 },
  ];
  const result = analyze(account);
  const numbers = [];
  JSON.stringify(result, (key, value) => {
    if (typeof value === "number") numbers.push(value);
    return value;
  });
  assert.ok(numbers.length > 100);
  for (const number of numbers) assert.ok(Number.isInteger(number), String(number));
});

test("bug 9 guard: the shortage spread rounds HALF UP ($479.99 ÷ 12 = $40.00, $1,100 ÷ 12 = $91.67)", () => {
  const tv10b = {
    startMonth: 1,
    startingBalanceCents: 192001,
    cushionMonths: 2,
    borrowerCurrent: true,
    disbursements: [
      { label: "Homeowners insurance", month: 3, amountCents: 144000 },
      { label: "Property tax", month: 9, amountCents: 432000 },
    ],
  };
  assert.equal(analyze(tv10b).newMonthlyEscrowPayment.shortageSpreadOver12Cents, 4000); // chopping would give 3999
  assert.equal(shortageOf(110000).newMonthlyEscrowPayment.shortageSpreadOver12Cents, 9167); // chopping would give 9166
  // … and the deficiency spread too: $150.01 ÷ 2 = $75.01 (chopping would give $75.00)
  const account = tv01Account();
  account.startingBalanceCents = -15001;
  assert.equal(analyze(account).newMonthlyEscrowPayment.deficiencySpreadCents, 7501);
});
