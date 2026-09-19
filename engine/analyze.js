// engine/analyze.js — the federal escrow math: 12 CFR 1024.17 ("Regulation X"),
// following the worked example the regulation itself prints in Appendix E.
//
// THE METHOD IN ONE PARAGRAPH
// Add up next year's bills (D). The most the servicer may collect each month
// is D ÷ 12 (P). The most cushion it may hold is 2 months of that, D ÷ 6 (C).
// Pretend the account starts at $0 and run 12 months: + P, − that month's
// bills (Step 1). Find the worst month. Lift every month by just enough to
// bring that worst month up to $0 (Step 2), then lift every month again by the
// cushion (Step 3). Now the worst month sits exactly on the cushion, and the
// first number in the column is the most the servicer may hold at the start of
// the year. Compare the REAL starting balance to that: more = surplus,
// less = shortage, below zero = deficiency.
//
// THE BIG RULE OF THIS FILE
// The monthly deposit used in the projection is COMPUTED here as bills ÷ 12.
// It is never typed in. The regulation defines it that way — (d)(2)(i)(A):
// "the borrower will make monthly payments equal to one-twelfth of the
// estimated total annual escrow account disbursements". Projecting with last
// year's payment, or with a new payment that already includes shortage
// repayment, gives an answer that is wrong by hundreds of dollars (test vector
// TV18). Whatever the servicer's statement says is only ever COMPARED against
// this math (see compare.js).
//
// ROUNDING — CHOICES, NOT LAW
// The regulation never mentions cents; every number in Appendix E is a whole
// dollar. HUD's 1995 guidance (60 FR 8812) lets servicers round to the dollar.
// So these are engineering choices, written down in the test vectors:
//   • P: bills ÷ 12, rounded to the nearest cent, halves up.
//   • C: rounded DOWN, because the law says "no greater than" — a cap must
//        never be rounded up past the limit.
//   • The 12-month table runs in whole cents using the rounded P.
//   • Spreading a shortage over 12 months or a deficiency over 2: nearest
//     cent, halves up.
//   • Two months tie for lowest → the earliest month is reported.
// The drift this can cause is a few cents. compare.js forgives $7.00.

import { validateAccount } from "./validate.js";
import {
  MAX_MONEY_CENTS,
  divideRoundDown,
  divideRoundHalfUp,
  escrowToCalendarMonth,
  noNegativeZero,
} from "./money.js";

// How far apart two numbers may be before we say they differ.
// A servicer that rounds every figure to whole dollars (allowed, per HUD 1995)
// can drift 50¢ × 12 months + 50¢ on the cushion = $6.50. So: $7.00 on
// balances. A monthly payment is one rounded figure, so $1.00 there.
export const TOLERANCE_BALANCE_CENTS = 700;
export const TOLERANCE_PAYMENT_CENTS = 100;

// A surplus of $50.00 or more must be refunded. 12 CFR 1024.17(f)(2)(i):
// "greater than or equal to 50 dollars".
const REFUND_THRESHOLD_CENTS = 5000;

const CITE_PREFIX = "12 CFR 1024.17";

// ---------------------------------------------------------------------------
// Small steps
// ---------------------------------------------------------------------------

// D: every bill expected in the coming 12 months, added up.
function addUpBills(bills) {
  let total = 0;
  for (const bill of bills) {
    total = total + bill.amountCents;
  }
  return total;
}

// A list where slot m holds everything paid in escrow month m.
// Slot 0 is unused so that slot numbers match month numbers.
// Two bills in one month are simply added: balances are MONTH-END balances,
// so the order of things inside a month does not matter (Appendix E's own
// July row nets a payment and a bill the same way).
function billsForEachMonth(bills) {
  const totals = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const bill of bills) {
    totals[bill.month] = totals[bill.month] + bill.amountCents;
  }
  return totals;
}

// Appendix E, Step 1 — the "trial running balance". Start at $0. Each month
// add the payment and take away that month's bills. Returns 12 month-end
// balances (slot 0 = month 1).
function stepOneTrialBalances(monthlyPaymentCents, billsByMonth) {
  const balances = [];
  let balance = 0;
  for (let month = 1; month <= 12; month++) {
    balance = balance + monthlyPaymentCents - billsByMonth[month];
    balances.push(balance);
  }
  return balances;
}

// The lowest of 12 month-end numbers, and which month it happens in.
// `<` (not `<=`) means a later month only wins if it is strictly lower, so a
// tie goes to the EARLIEST month. That tie rule is a choice, not law (TV21).
function findLowest(monthEndValues) {
  let lowestValue = monthEndValues[0];
  let lowestMonth = 1;
  for (let index = 1; index < monthEndValues.length; index++) {
    if (monthEndValues[index] < lowestValue) {
      lowestValue = monthEndValues[index];
      lowestMonth = index + 1;
    }
  }
  return { value: lowestValue, month: lowestMonth };
}

// Surplus, shortage and deficiency, from the real balance and the target.
// 12 CFR 1024.17(b):
//   surplus    = "an amount by which the current escrow account balance
//                 exceeds the target balance"
//   shortage   = "an amount by which a current escrow account balance falls
//                 short of the target balance"
//   deficiency = "the amount of a negative balance in an escrow account"
//
// A deficiency is a REAL negative balance today — never a dip the projection
// predicts for later (HUD 1994: the rule "does not allow servicers to
// anticipate deficiencies"; TV19).
//
// When the balance is negative it is below zero AND below target, so read
// literally the (b) definitions overlap. To avoid counting the same dollars
// twice: deficiency first (the part below $0), then the REMAINING shortage,
// measured from $0 up to the target.
//   *** THIS SPLIT IS HUD GUIDANCE, NOT REGULATION TEXT. ***
// Source: HUD's 1995 Federal Register notice, 60 FR 8812, 8813–14
// (clarification (l): "The servicer first computes the deficiency and then
// computes the remaining shortage"), and HUD's worked example in its
// Appendix M (TV04). It is the only reading that does not double-charge, but
// it is guidance, and the page says so wherever it shows this step.
export function splitDifference(startingBalanceCents, requiredStartingBalanceCents) {
  let surplusCents = 0;
  let shortageCents = 0;
  let deficiencyCents = 0;

  if (startingBalanceCents < 0) {
    deficiencyCents = noNegativeZero(-startingBalanceCents);
  }

  if (startingBalanceCents > requiredStartingBalanceCents) {
    surplusCents = startingBalanceCents - requiredStartingBalanceCents;
  } else if (startingBalanceCents < requiredStartingBalanceCents) {
    const measuredFrom = startingBalanceCents < 0 ? 0 : startingBalanceCents;
    shortageCents = requiredStartingBalanceCents - measuredFrom;
  }

  return { surplusCents: surplusCents, shortageCents: shortageCents, deficiencyCents: deficiencyCents };
}

// (f)(3) and (f)(4) both have two tiers: "less than one month's escrow account
// payment" and "greater than or equal to". EXACTLY one month's payment is in
// the greater-or-equal tier (TV10); one cent less is not (TV10b).
// "One month's payment" here is the NEW base payment, bills ÷ 12. The
// regulation does not say old or new; this is the vectors' written choice.
function isLessThanOneMonth(amountCents, oneMonthPaymentCents) {
  return amountCents < oneMonthPaymentCents;
}

function shortageRules(shortageCents, oneMonthPaymentCents) {
  if (isLessThanOneMonth(shortageCents, oneMonthPaymentCents)) {
    return {
      name: "SHORTAGE_LT_ONE_MONTH",
      cite: CITE_PREFIX + "(f)(3)(i)",
      options: [
        "shortage: do nothing",
        "shortage: require repayment within 30 days",
        "shortage: require repayment in equal monthly payments over at least 12 months",
      ],
    };
  }
  // No 30-day demand in this tier.
  return {
    name: "SHORTAGE_GE_ONE_MONTH",
    cite: CITE_PREFIX + "(f)(3)(ii)",
    options: [
      "shortage: do nothing",
      "shortage: require repayment in equal monthly payments over at least 12 months",
    ],
  };
}

function deficiencyRules(deficiencyCents, oneMonthPaymentCents, borrowerCurrent) {
  // (f)(4)(iii): the repayment choices in (f)(4)(i)–(ii) "apply if the borrower
  // is current". If a payment came in more than 30 days late, "the servicer
  // may recover the deficiency pursuant to the terms of the federally related
  // mortgage loan documents". So the regulation sets NO schedule here, and we
  // do not invent one: there are no tiers, and the mortgage documents — not
  // this rule — control how the amount is collected. (SPEC E2.)
  // NOTE: this "is the borrower current?" condition exists only for surpluses
  // ((f)(2)(ii)) and deficiencies ((f)(4)(iii)). Shortages ((f)(3)) have no
  // such condition, so shortageRules never looks at it.
  if (!borrowerCurrent) {
    return {
      name: "DEFICIENCY_BORROWER_NOT_CURRENT",
      cite: CITE_PREFIX + "(f)(4)(iii)",
      options: ["deficiency: servicer may recover the deficiency pursuant to the loan documents"],
    };
  }

  let name = "DEFICIENCY_GE_ONE_MONTH";
  let cite = CITE_PREFIX + "(f)(4)(ii)";
  let options = [
    "deficiency: do nothing",
    "deficiency: require repayment in 2 or more equal monthly payments",
  ];
  if (isLessThanOneMonth(deficiencyCents, oneMonthPaymentCents)) {
    name = "DEFICIENCY_LT_ONE_MONTH";
    cite = CITE_PREFIX + "(f)(4)(i)";
    options = [
      "deficiency: do nothing",
      "deficiency: require repayment within 30 days",
      "deficiency: require repayment in 2 or more equal monthly payments",
    ];
  }
  return { name: name, cite: cite, options: options };
}

// Which of the regulation's outcomes this account is, which paragraph says so,
// and what that paragraph lets the servicer do.
function classify(amounts, oneMonthPaymentCents, borrowerCurrent) {
  if (amounts.surplusCents > 0) {
    // (f)(2)(ii): the refund rule applies "if the borrower is current".
    if (!borrowerCurrent) {
      return {
        classification: "SURPLUS_BORROWER_NOT_CURRENT",
        cite: CITE_PREFIX + "(f)(2)(ii)",
        servicerOptions: ["servicer may retain the surplus in the escrow account pursuant to the loan documents"],
      };
    }
    if (amounts.surplusCents >= REFUND_THRESHOLD_CENTS) {
      return {
        classification: "SURPLUS_REFUND_REQUIRED",
        cite: CITE_PREFIX + "(f)(2)(i)",
        servicerOptions: ["refund the surplus to the borrower within 30 days from the date of the analysis"],
      };
    }
    return {
      classification: "SURPLUS_UNDER_50",
      cite: CITE_PREFIX + "(f)(2)(i)",
      servicerOptions: [
        "refund the surplus to the borrower",
        "credit the surplus against next year's escrow payments",
      ],
    };
  }

  const hasDeficiency = amounts.deficiencyCents > 0;
  const hasShortage = amounts.shortageCents > 0;

  if (hasDeficiency && hasShortage) {
    const deficiency = deficiencyRules(amounts.deficiencyCents, oneMonthPaymentCents, borrowerCurrent);
    const shortage = shortageRules(amounts.shortageCents, oneMonthPaymentCents);
    return {
      classification: deficiency.name + "_AND_" + shortage.name,
      cite: deficiency.cite + " + " + shortage.cite,
      servicerOptions: deficiency.options.concat(shortage.options),
    };
  }
  if (hasDeficiency) {
    const deficiency = deficiencyRules(amounts.deficiencyCents, oneMonthPaymentCents, borrowerCurrent);
    return { classification: deficiency.name, cite: deficiency.cite, servicerOptions: deficiency.options };
  }
  if (hasShortage) {
    const shortage = shortageRules(amounts.shortageCents, oneMonthPaymentCents);
    return { classification: shortage.name, cite: shortage.cite, servicerOptions: shortage.options };
  }

  return { classification: "ON_TARGET", cite: CITE_PREFIX + "(d)(2)", servicerOptions: [] };
}

// "Too close to call" (SPEC E3).
// Two lines in the rule turn on an exact dollar figure:
//   • a surplus of $50.00 or more must be refunded            (f)(2)(i)
//   • a shortage or deficiency of one month's payment or more
//     loses the "repay within 30 days" option                 (f)(3), (f)(4)
// Our cent rounding can move a figure by a few cents, and HUD lets a servicer
// round any figure to whole dollars, so a lawful statement can sit up to about
// $7 away from ours. If our figure is within $7.00 of one of those lines, a
// servicer could lawfully land on EITHER side of it. `classification` stays
// cent-exact, and this block tells the words (explain.js, letter.js) and the
// page to soften: state the figure, say it is too close to call.
//
// Returns null, or:
//   line           "SURPLUS_50" | "ONE_MONTH_PAYMENT"
//   distanceCents  how far our figure is from the line (never negative)
//   toleranceCents 700
//   appliesTo      "surplus" | "deficiency" | "shortage"  — which figure is near
//   side           "below" | "at-or-above"                — which side OUR figure is on
//   amountCents    our cent-exact figure
//   lineCents      where the line is ($50.00, or one month's payment)
// If a deficiency and a shortage are BOTH near the line, the deficiency is
// reported (it is the first part HUD's guidance works out). When the borrower
// is not current the $50 line and the deficiency tiers do not apply at all
// ((f)(2)(ii), (f)(4)(iii)), so they cannot be "near". The shortage line still
// can: (f)(3) does not depend on being current.
function nearLineOrNull(line, appliesTo, amountCents, lineCents) {
  const distanceCents = Math.abs(amountCents - lineCents);
  if (distanceCents > TOLERANCE_BALANCE_CENTS) return null;
  return {
    line: line,
    distanceCents: distanceCents,
    toleranceCents: TOLERANCE_BALANCE_CENTS,
    appliesTo: appliesTo,
    side: amountCents < lineCents ? "below" : "at-or-above",
    amountCents: amountCents,
    lineCents: lineCents,
  };
}

function findNearLine(amounts, oneMonthPaymentCents, borrowerCurrent) {
  if (amounts.surplusCents > 0) {
    if (!borrowerCurrent) return null;
    return nearLineOrNull("SURPLUS_50", "surplus", amounts.surplusCents, REFUND_THRESHOLD_CENTS);
  }
  if (amounts.deficiencyCents > 0 && borrowerCurrent) {
    const near = nearLineOrNull("ONE_MONTH_PAYMENT", "deficiency", amounts.deficiencyCents, oneMonthPaymentCents);
    if (near !== null) return near;
  }
  if (amounts.shortageCents > 0) {
    return nearLineOrNull("ONE_MONTH_PAYMENT", "shortage", amounts.shortageCents, oneMonthPaymentCents);
  }
  return null;
}

// The MOST the monthly escrow line can lawfully be (reg notes §8):
//     bills ÷ 12                                   (c)(1)(ii)
//   + shortage ÷ 12     "at least a 12-month period" → 12 is the fastest   (f)(3)
//   + deficiency ÷ 2    "2 or more equal monthly payments" → 2 is the fastest   (f)(4)
// The deficiency part lasts only 2 months, so there are two totals: while it
// is being repaid, and after. The cushion is NOT in this formula on purpose:
// Appendix E shows the same $130 payment in all three steps. The cushion lives
// in the balance, so it gets funded through the shortage.
//
// Borrower NOT current + a deficiency: (f)(4)(iii) hands the repayment terms
// to the mortgage documents, so the regulation gives us no "÷ 2" to apply.
// The deficiency fields stay 0 and the two totals are the same. (SPEC E2.)
function buildNewMonthlyPayment(baseMonthlyCents, amounts, borrowerCurrent) {
  const shortageSpreadOver12Cents = divideRoundHalfUp(amounts.shortageCents, 12);

  let deficiencySpreadCents = 0;
  let deficiencySpreadMonths = 0;
  if (amounts.deficiencyCents > 0 && borrowerCurrent) {
    deficiencySpreadMonths = 2;
    deficiencySpreadCents = divideRoundHalfUp(amounts.deficiencyCents, deficiencySpreadMonths);
  }

  return {
    baseMonthlyCents: baseMonthlyCents,
    shortageSpreadOver12Cents: shortageSpreadOver12Cents,
    deficiencySpreadCents: deficiencySpreadCents,
    deficiencySpreadMonths: deficiencySpreadMonths,
    monthlyEscrowWhileRepayingDeficiencyCents: baseMonthlyCents + shortageSpreadOver12Cents + deficiencySpreadCents,
    monthlyEscrowAfterDeficiencyRepaidCents: baseMonthlyCents + shortageSpreadOver12Cents,
  };
}

// "Why did my payment jump?" with last year's numbers in hand (reg notes §8,
// TV18). Only built when the account carries a `priorYear` block.
// The three breakdown pieces are exact algebra:
//   (C_new − C_old) + (A_new − A_old) + (C_old + A_old − balance)
//     = (C_new + A_new) − balance = required start − balance.
// "C_old + A_old" is last year's required start, which is also where last
// year's projection said the year would END (first row = last row).
function buildPaymentJumpDecomposition(priorYear, pieces) {
  // Both bases are rounded the same way, so the difference is in whole cents
  // and we never have to divide a negative number.
  const lastYearBaseCents = divideRoundHalfUp(priorYear.annualDisbursementsCents, 12);
  const lastYearTargetEndCents = priorYear.stepTwoAddCents + priorYear.cushionCents;

  return {
    oldMonthlyEscrowCents: priorYear.monthlyEscrowCents,
    newMonthlyEscrowCents: pieces.baseMonthlyCents + pieces.shortageSpreadOver12Cents,
    billsWentUpCents: pieces.baseMonthlyCents - lastYearBaseCents,
    shortageRepaymentCents: pieces.shortageSpreadOver12Cents,
    shortageBreakdown: {
      cushionRoseCents: pieces.cushionCapCents - priorYear.cushionCents,
      timingNeedRoseCents: pieces.stepTwoAddCents - priorYear.stepTwoAddCents,
      lastYearCameInUnderProjectionCents: lastYearTargetEndCents - pieces.startingBalanceCents,
    },
  };
}

// A tidy copy of what went in, with defaults filled and calendar months added.
// A copy, so nothing downstream can change the caller's account.
function copyInputs(account, cushionMonths, borrowerCurrent, startingBalanceCents) {
  const bills = [];
  for (const bill of account.disbursements) {
    bills.push({
      label: typeof bill.label === "string" ? bill.label : "",
      month: bill.month,
      calendarMonth: escrowToCalendarMonth(bill.month, account.startMonth),
      amountCents: bill.amountCents,
    });
  }
  return {
    startMonth: account.startMonth,
    startingBalanceCents: startingBalanceCents,
    cushionMonths: cushionMonths,
    borrowerCurrent: borrowerCurrent,
    disbursements: bills,
  };
}

function refuseIfInvalid(account) {
  const errors = validateAccount(account).errors;
  if (errors.length > 0) {
    const error = new Error("The math cannot run yet: " + errors[0].message);
    error.errors = errors;
    throw error;
  }
}

// ---------------------------------------------------------------------------
// analyze(account) → result.   Throws only if validateAccount finds errors.
// ---------------------------------------------------------------------------

export function analyze(account) {
  refuseIfInvalid(account);

  // Defaults. 2 months is the federal maximum cushion; mortgage documents or
  // state law can set it lower, never higher. (c)(8), (d)(2)(i)(C).
  const cushionMonths = account.cushionMonths === undefined ? 2 : account.cushionMonths;
  const borrowerCurrent = account.borrowerCurrent === undefined ? true : account.borrowerCurrent;
  const startingBalanceCents = noNegativeZero(account.startingBalanceCents);

  // D — total bills for the coming 12 months.
  const annualDisbursementsCents = addUpBills(account.disbursements);

  // P — the base monthly payment, bills ÷ 12. (c)(1)(ii): "a monthly sum equal
  // to one-twelfth (1/12) of the total annual escrow payments".
  const baseMonthlyPaymentCents = divideRoundHalfUp(annualDisbursementsCents, 12);

  // C — the cushion cap. (c)(5): "no greater than one-sixth (1/6) of the
  // estimated total annual disbursements". One-sixth = 2 months out of 12, so
  // in general it is bills × cushionMonths ÷ 12. Rounded DOWN: it is a cap.
  const cushionCapCents = divideRoundDown(annualDisbursementsCents * cushionMonths, 12);

  // Step 1 — trial balance from $0. (d)(2)(i)(A).
  const billsByMonth = billsForEachMonth(account.disbursements);
  const stepOne = stepOneTrialBalances(baseMonthlyPaymentCents, billsByMonth);
  const lowestStepOne = findLowest(stepOne);

  // Step 2 — "an amount just sufficient to bring the lowest monthly trial
  // balance to zero". (d)(2)(i)(B). Appendix E titles this step "Increase
  // monthly balances to eliminate negative balances": it only ever ADDS.
  // With exact arithmetic the lowest Step 1 month can never be above $0
  // (12 payments = 12 months of bills, so the year ends at $0). With P rounded
  // to the cent the year can end up to 6 cents above $0, so if every bill
  // comes late in the year the "lowest" month can be +4¢. Nothing negative to
  // eliminate → add $0, never a negative amount.
  let stepTwoAddCents = 0;
  if (lowestStepOne.value < 0) {
    stepTwoAddCents = noNegativeZero(-lowestStepOne.value);
  }

  // Step 3 — add the cushion. (d)(2)(i)(C). The first row of that column is
  // the most the servicer may hold at the start of the year.
  const requiredStartingBalanceCents = stepTwoAddCents + cushionCapCents;

  // The (b) definitions: real balance compared with the target balance.
  const differenceCents = startingBalanceCents - requiredStartingBalanceCents;
  const amounts = splitDifference(startingBalanceCents, requiredStartingBalanceCents);

  // The 12-month table. Three balance columns:
  //   step1TrialBalance — starts from $0 (Appendix E Step 1)
  //   targetBalance     — Step 1 + step-2 add + cushion (Appendix E Step 3):
  //                       the most the servicer may hold at that month-end
  //   projectedBalance  — starts from the REAL balance: what the account will
  //                       actually do if the payment is exactly bills ÷ 12
  const table = [];
  for (let month = 1; month <= 12; month++) {
    const stepOneBalance = stepOne[month - 1];
    table.push({
      month: month,
      calendarMonth: escrowToCalendarMonth(month, account.startMonth),
      depositCents: baseMonthlyPaymentCents,
      disbursementCents: billsByMonth[month],
      step1TrialBalanceCents: stepOneBalance,
      targetBalanceCents: stepOneBalance + stepTwoAddCents + cushionCapCents,
      projectedBalanceCents: startingBalanceCents + stepOneBalance,
    });
  }

  // The low point: the lowest projected month-end balance. It is the same
  // month as the lowest Step 1 month, because the projected column is the
  // Step 1 column shifted by the starting balance. Searched over months 1–12
  // only (the starting row is not a month-end of the new year).
  const lowRow = table[lowestStepOne.month - 1];
  const lowPoint = {
    projectedBalanceCents: lowRow.projectedBalanceCents,
    month: lowRow.month,
    calendarMonth: lowRow.calendarMonth,
    lowestTargetBalanceCents: lowRow.targetBalanceCents,
  };

  const verdict = classify(amounts, baseMonthlyPaymentCents, borrowerCurrent);
  const newMonthlyEscrowPayment = buildNewMonthlyPayment(baseMonthlyPaymentCents, amounts, borrowerCurrent);
  const nearLine = findNearLine(amounts, baseMonthlyPaymentCents, borrowerCurrent);

  const result = {
    annualDisbursementsCents: annualDisbursementsCents,
    baseMonthlyPaymentCents: baseMonthlyPaymentCents,
    cushionCapCents: cushionCapCents,
    stepTwoAddCents: stepTwoAddCents,
    requiredStartingBalanceCents: requiredStartingBalanceCents,
    differenceCents: differenceCents,
    surplusCents: amounts.surplusCents,
    shortageCents: amounts.shortageCents,
    deficiencyCents: amounts.deficiencyCents,
    lowPoint: lowPoint,
    classification: verdict.classification,
    cite: verdict.cite,
    servicerOptions: verdict.servicerOptions,
    newMonthlyEscrowPayment: newMonthlyEscrowPayment,
    table: table,
    nearLine: nearLine,
    inputs: copyInputs(account, cushionMonths, borrowerCurrent, startingBalanceCents),
  };

  if (account.priorYear !== undefined && account.priorYear !== null) {
    result.paymentJumpDecomposition = buildPaymentJumpDecomposition(account.priorYear, {
      baseMonthlyCents: baseMonthlyPaymentCents,
      shortageSpreadOver12Cents: newMonthlyEscrowPayment.shortageSpreadOver12Cents,
      cushionCapCents: cushionCapCents,
      stepTwoAddCents: stepTwoAddCents,
      startingBalanceCents: startingBalanceCents,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// projectWithPayment(account, monthlyCents) → 12 month-end balances (SPEC D5).
//
// "What will my account actually hold if I pay what the STATEMENT says?"
// starting balance + (that payment − bills), month by month. This is the
// servicer's line on the chart. It is for DRAWING and COMPARING only — the
// verdict never uses it, for the reason in the header (TV18).
// ---------------------------------------------------------------------------

export function projectWithPayment(account, monthlyCents) {
  refuseIfInvalid(account);

  const usable = Number.isInteger(monthlyCents) && monthlyCents >= 0 && monthlyCents <= MAX_MONEY_CENTS;
  if (!usable) {
    throw new RangeError("The monthly payment must be a whole number of cents, from $0 up to $10,000,000.");
  }

  const billsByMonth = billsForEachMonth(account.disbursements);
  const balances = [];
  let balance = noNegativeZero(account.startingBalanceCents);
  for (let month = 1; month <= 12; month++) {
    balance = noNegativeZero(balance + monthlyCents - billsByMonth[month]);
    balances.push(balance);
  }
  return balances;
}
