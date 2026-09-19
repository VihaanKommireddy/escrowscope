// tests/properties.test.js — randomized checks (SPEC C5 + Part E).
//
// Instead of a few hand-picked cases, this builds thousands of random accounts
// and checks rules that must hold for ALL of them. The random numbers come
// from a tiny seeded generator, so a failure can be replayed exactly:
//     SEED=12345 node --test tests/properties.test.js
// Every failure message carries the seed and the account that broke the rule.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  analyze,
  projectWithPayment,
  compareWithStatement,
  explainVerdict,
  explainJump,
  explainServicerLine,
  nextSteps,
  buildLetter,
  accountFromVector,
  VECTORS,
  TOLERANCE_BALANCE_CENTS,
} from "../engine/index.js";
import { EXAMPLES } from "../examples.js";

const SEED = process.env.SEED ? Number(process.env.SEED) : 20260919;
const HOW_MANY = 3000;

// ---------- a tiny seeded random-number generator (mulberry32) ----------
// Same seed → same sequence, on every computer. Tests only; the engine itself
// never uses randomness.
function makeRandom(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeHelpers(random) {
  const whole = (low, high) => low + Math.floor(random() * (high - low + 1));
  const pick = (list) => list[whole(0, list.length - 1)];
  return { whole: whole, pick: pick };
}

// ---------- random accounts ----------

function randomAccount(random, index) {
  const { whole, pick } = makeHelpers(random);
  const account = {
    startMonth: whole(1, 12),
    startingBalanceCents: 0,
    cushionMonths: pick([2, 2, 2, 1, 0]),
    borrowerCurrent: random() < 0.85,
    disbursements: [],
  };

  // Every 10th account is the SPEC E1 shape on purpose: one late bill whose
  // amount does not divide by 12, so Step 1 never goes below zero.
  if (index % 10 === 0) {
    account.disbursements.push({ label: "Property tax", month: 12, amountCents: 12 * whole(1000, 900000) + whole(7, 11) });
  } else {
    const billCount = whole(1, 8);
    for (let bill = 0; bill < billCount; bill++) {
      account.disbursements.push({
        label: pick(["Property tax", "Homeowners insurance", "Flood insurance", "PMI", ""]),
        month: whole(1, 12),
        amountCents: pick([whole(1, 5000), whole(5000, 400000), whole(100000, 3000000), 100 * whole(100, 9000)]),
      });
    }
    if (random() < 0.15) {
      const monthly = whole(1000, 30000);
      for (let month = 1; month <= 12; month++) account.disbursements.push({ label: "PMI", month: month, amountCents: monthly });
    }
  }

  const total = account.disbursements.reduce((sum, bill) => sum + bill.amountCents, 0);
  const style = whole(1, 10);
  if (style <= 5) account.startingBalanceCents = whole(0, total);
  if (style === 6) account.startingBalanceCents = whole(total, 2 * total);
  if (style === 7) account.startingBalanceCents = -whole(1, total);
  if (style === 8) account.startingBalanceCents = 0;
  // Styles 9 and 10: land right around a legal line, to hammer the tiers and nearLine.
  if (style >= 9) {
    const probe = analyze(account); // balance 0 → tells us the required start
    const base = probe.baseMonthlyPaymentCents;
    const nudge = whole(-800, 800);
    account.startingBalanceCents = style === 9
      ? probe.requiredStartingBalanceCents + 5000 + nudge // surplus ≈ $50
      : probe.requiredStartingBalanceCents - base + nudge; // shortage ≈ one month
  }
  return account;
}

function describe(account) {
  return "\nSEED=" + SEED + "\naccount=" + JSON.stringify(account);
}

// ---------- walking every number in a value ----------

function everyNumberIn(value, path, visit) {
  if (typeof value === "number") visit(value, path);
  else if (Array.isArray(value)) value.forEach((item, index) => everyNumberIn(item, path + "[" + index + "]", visit));
  else if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value)) everyNumberIn(value[key], path + "." + key, visit);
  }
}

function assertWholeAndNoNegativeZero(value, name, context) {
  let seen = 0;
  everyNumberIn(value, name, (number, path) => {
    seen = seen + 1;
    assert.ok(Number.isInteger(number), path + " is not a whole number: " + number + context);
    assert.equal(Object.is(number, -0), false, path + " is negative zero" + context);
  });
  return seen;
}

// ---------- THE SECOND ORACLE ----------
// A differently-written check of the same law, living here and NOT in the
// engine. It uses the closed form from the reg notes — "cushion + the worst
// cumulative gap between bills paid and deposits made" — instead of building
// a table row by row, and it does its arithmetic in BigInt (true integers), so
// it shares no code, no loop shape and no number type with analyze.js.

function oracle(account) {
  const B = BigInt(account.startingBalanceCents);
  const cushionMonths = BigInt(account.cushionMonths === undefined ? 2 : account.cushionMonths);
  const current = account.borrowerCurrent !== false;
  const paidBy = (month) => account.disbursements
    .filter((bill) => bill.month <= month)
    .reduce((sum, bill) => sum + BigInt(bill.amountCents), 0n);

  const D = paidBy(12);
  const P = (D + 6n) / 12n; // round half up, the vectors' written rule
  const C = (D * cushionMonths) / 12n; // BigInt division drops the remainder: round down

  const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const gaps = months.map((month) => paidBy(month) - BigInt(month) * P); // how far bills have outrun deposits
  const worstGap = gaps.reduce((worst, gap) => (gap > worst ? gap : worst));
  const lowMonth = gaps.indexOf(worstGap) + 1; // indexOf → the EARLIEST month with the worst gap
  const add = worstGap > 0n ? worstGap : 0n;
  const required = C + add;
  const difference = B - required;

  const deficiency = B < 0n ? -B : 0n;
  const surplus = difference > 0n ? difference : 0n;
  const shortage = difference < 0n ? required - (B > 0n ? B : 0n) : 0n;

  const tier = (amount) => (amount < P ? "LT_ONE_MONTH" : "GE_ONE_MONTH");
  let classification = "ON_TARGET";
  if (surplus > 0n) {
    classification = !current ? "SURPLUS_BORROWER_NOT_CURRENT" : surplus >= 5000n ? "SURPLUS_REFUND_REQUIRED" : "SURPLUS_UNDER_50";
  } else {
    const parts = [];
    if (deficiency > 0n) parts.push(current ? "DEFICIENCY_" + tier(deficiency) : "DEFICIENCY_BORROWER_NOT_CURRENT");
    if (shortage > 0n) parts.push("SHORTAGE_" + tier(shortage));
    if (parts.length > 0) classification = parts.join("_AND_");
  }

  const abs = (x) => (x < 0n ? -x : x);
  let nearLine = null;
  const band = 700n;
  if (surplus > 0n) {
    if (current && abs(surplus - 5000n) <= band) nearLine = { line: "SURPLUS_50", distanceCents: Number(abs(surplus - 5000n)) };
  } else if (deficiency > 0n && current && abs(deficiency - P) <= band) {
    nearLine = { line: "ONE_MONTH_PAYMENT", distanceCents: Number(abs(deficiency - P)) };
  } else if (shortage > 0n && abs(shortage - P) <= band) {
    nearLine = { line: "ONE_MONTH_PAYMENT", distanceCents: Number(abs(shortage - P)) };
  }

  const shortageSpread = (shortage + 6n) / 12n;
  const deficiencySpread = deficiency > 0n && current ? (deficiency + 1n) / 2n : 0n;

  // Exact arithmetic, no rounding at all, scaled ×12 to stay in whole numbers.
  const exactGaps12 = months.map((month) => 12n * paidBy(month) - BigInt(month) * D);
  const worstExact12 = exactGaps12.reduce((worst, gap) => (gap > worst ? gap : worst), 0n);
  const exactRequiredTimes12 = cushionMonths * D + worstExact12;

  return {
    annualDisbursementsCents: Number(D),
    baseMonthlyPaymentCents: Number(P),
    cushionCapCents: Number(C),
    stepTwoAddCents: Number(add),
    requiredStartingBalanceCents: Number(required),
    differenceCents: Number(difference),
    surplusCents: Number(surplus),
    shortageCents: Number(shortage),
    deficiencyCents: Number(deficiency),
    lowMonth: lowMonth,
    lowProjectedCents: Number(B - gaps[lowMonth - 1]),
    lowestStepOneCents: Number(-worstGap),
    classification: classification,
    nearLine: nearLine,
    whileRepaying: Number(P + shortageSpread + deficiencySpread),
    afterRepaid: Number(P + shortageSpread),
    driftTimes12: Number(abs(12n * required - exactRequiredTimes12)),
  };
}

// ---------- the run ----------

const random = makeRandom(SEED);
const ACCOUNTS = [];
for (let index = 0; index < HOW_MANY; index++) ACCOUNTS.push(randomAccount(random, index));

test("at least 2,000 random accounts, and the generator reaches every outcome", () => {
  assert.ok(ACCOUNTS.length >= 2000);
  const seen = new Set(ACCOUNTS.map((account) => analyze(account).classification));
  for (const needed of [
    "SURPLUS_REFUND_REQUIRED", "SURPLUS_UNDER_50", "SURPLUS_BORROWER_NOT_CURRENT", "ON_TARGET",
    "SHORTAGE_LT_ONE_MONTH", "SHORTAGE_GE_ONE_MONTH", "DEFICIENCY_GE_ONE_MONTH_AND_SHORTAGE_GE_ONE_MONTH",
    "DEFICIENCY_BORROWER_NOT_CURRENT_AND_SHORTAGE_GE_ONE_MONTH",
  ]) {
    assert.ok(seen.has(needed), "the generator never produced " + needed + " (SEED=" + SEED + ")");
  }
});

test("E1 identity: lowPoint − cushionCap == difference when min(step 1) <= 0; otherwise the gap is exactly min(step 1), 1–6 cents", () => {
  let exactBranch = 0;
  let floorBranch = 0;
  for (const account of ACCOUNTS) {
    const result = analyze(account);
    const minStepOne = Math.min(...result.table.map((row) => row.step1TrialBalanceCents));
    const gap = result.lowPoint.projectedBalanceCents - result.cushionCapCents - result.differenceCents;
    if (minStepOne <= 0) {
      exactBranch = exactBranch + 1;
      assert.equal(gap, 0, "identity should be exact" + describe(account));
    } else {
      floorBranch = floorBranch + 1;
      assert.equal(gap, minStepOne, describe(account));
      assert.ok(minStepOne >= 1 && minStepOne <= 6, "min step 1 = " + minStepOne + describe(account));
      assert.equal(result.stepTwoAddCents, 0, "the step-2 add never goes below 0" + describe(account));
    }
    // The row-by-row form holds in BOTH branches.
    assert.equal(result.lowPoint.projectedBalanceCents - result.lowPoint.lowestTargetBalanceCents, result.differenceCents, describe(account));
    assert.ok(result.stepTwoAddCents >= 0);
  }
  assert.ok(exactBranch > 1000, "exact branch hit only " + exactBranch + " times");
  assert.ok(floorBranch >= 1, "the floor branch (SPEC E1) was never exercised");
});

test("adding $x to the starting balance moves differenceCents by exactly $x", () => {
  const { whole } = makeHelpers(makeRandom(SEED + 1));
  for (const account of ACCOUNTS) {
    const x = whole(-500000, 500000);
    const shifted = { ...account, startingBalanceCents: account.startingBalanceCents + x };
    const before = analyze(account);
    const after = analyze(shifted);
    assert.equal(after.differenceCents - before.differenceCents, x, "x=" + x + describe(account));
    assert.equal(after.requiredStartingBalanceCents, before.requiredStartingBalanceCents);
    assert.equal(after.lowPoint.month, before.lowPoint.month);
  }
});

test("permuting the bill order changes nothing (result.inputs is the one field excluded, by name)", () => {
  const shuffle = makeRandom(SEED + 2);
  for (const account of ACCOUNTS) {
    const bills = [...account.disbursements];
    for (let index = bills.length - 1; index > 0; index--) {
      const other = Math.floor(shuffle() * (index + 1));
      [bills[index], bills[other]] = [bills[other], bills[index]];
    }
    const a = analyze(account);
    const b = analyze({ ...account, disbursements: bills });
    // `inputs` is an echo of what was typed, in the order it was typed, so it
    // is SUPPOSED to follow the bill order (SPEC E3a.6). Every other field —
    // the full table and nearLine included — must be identical.
    const { inputs: inputsA, ...mathA } = a;
    const { inputs: inputsB, ...mathB } = b;
    assert.deepStrictEqual(mathB, mathA, describe(account));
    assert.ok("table" in mathA && "nearLine" in mathA);
    assert.deepStrictEqual(projectWithPayment({ ...account, disbursements: bills }, 12345), projectWithPayment(account, 12345));
  }
});

test("surplus / shortage / deficiency are never negative and always consistent with each other", () => {
  for (const account of ACCOUNTS) {
    const r = analyze(account);
    assert.ok(r.surplusCents >= 0 && r.shortageCents >= 0 && r.deficiencyCents >= 0, describe(account));
    assert.equal(r.surplusCents - r.shortageCents - r.deficiencyCents, r.differenceCents, describe(account));
    if (r.surplusCents > 0) assert.equal(r.shortageCents + r.deficiencyCents, 0, describe(account));
    assert.equal(r.deficiencyCents, account.startingBalanceCents < 0 ? -account.startingBalanceCents : 0, describe(account));
    assert.equal(r.deficiencyCents > 0, account.startingBalanceCents < 0, "a deficiency is a REAL negative balance, never a projected dip");
    assert.equal(r.differenceCents, account.startingBalanceCents - r.requiredStartingBalanceCents);
  }
});

test("the table: 12 rows, deposits of bills ÷ 12, bills add up, target − projected never changes", () => {
  for (const account of ACCOUNTS) {
    const r = analyze(account);
    assert.equal(r.table.length, 12);
    let bills = 0;
    let running = 0;
    for (const row of r.table) {
      bills = bills + row.disbursementCents;
      running = running + row.depositCents - row.disbursementCents;
      assert.equal(row.depositCents, r.baseMonthlyPaymentCents);
      assert.equal(row.step1TrialBalanceCents, running, describe(account));
      // (Written as projected − target so the test itself never makes a negative zero.)
      assert.equal(row.projectedBalanceCents - row.targetBalanceCents, r.differenceCents, describe(account));
      assert.ok(row.targetBalanceCents >= r.cushionCapCents, "no target month is ever below the cushion");
    }
    assert.equal(bills, r.annualDisbursementsCents);
    assert.equal(r.lowPoint.projectedBalanceCents, Math.min(...r.table.map((row) => row.projectedBalanceCents)));
  }
});

test("projectWithPayment(account, base payment) equals the table's projected balances", () => {
  for (const account of ACCOUNTS) {
    const r = analyze(account);
    assert.deepStrictEqual(projectWithPayment(account, r.baseMonthlyPaymentCents), r.table.map((row) => row.projectedBalanceCents), describe(account));
  }
});

test("THE SECOND ORACLE agrees on every number, the low month, the classification, nearLine and the new payment", () => {
  let worstDrift = 0;
  for (const account of ACCOUNTS) {
    const r = analyze(account);
    const o = oracle(account);
    const context = describe(account);
    for (const key of [
      "annualDisbursementsCents", "baseMonthlyPaymentCents", "cushionCapCents", "stepTwoAddCents",
      "requiredStartingBalanceCents", "differenceCents", "surplusCents", "shortageCents", "deficiencyCents", "classification",
    ]) {
      assert.equal(r[key], o[key], key + context);
    }
    assert.equal(r.lowPoint.month, o.lowMonth, "low month" + context);
    assert.equal(r.lowPoint.projectedBalanceCents, o.lowProjectedCents, "low point" + context);
    assert.equal(r.newMonthlyEscrowPayment.monthlyEscrowWhileRepayingDeficiencyCents, o.whileRepaying, context);
    assert.equal(r.newMonthlyEscrowPayment.monthlyEscrowAfterDeficiencyRepaidCents, o.afterRepaid, context);
    if (o.nearLine === null) {
      assert.equal(r.nearLine, null, "nearLine" + context);
    } else {
      assert.equal(r.nearLine.line, o.nearLine.line, context);
      assert.equal(r.nearLine.distanceCents, o.nearLine.distanceCents, context);
      assert.equal(r.nearLine.toleranceCents, TOLERANCE_BALANCE_CENTS);
    }
    // Cent rounding never moves the required balance more than 7 cents from exact arithmetic.
    assert.ok(o.driftTimes12 <= 12 * 7, "drift " + o.driftTimes12 / 12 + " cents" + context);
    if (o.driftTimes12 > worstDrift) worstDrift = o.driftTimes12;
  }
  assert.ok(worstDrift > 0, "the generator should produce totals that do not divide by 12");
});

test("the second oracle also agrees with all the research vectors (so the oracle itself is trustworthy)", () => {
  for (const vector of VECTORS) {
    const o = oracle(accountFromVector(vector));
    const e = vector.expected;
    for (const key of ["annualDisbursementsCents", "baseMonthlyPaymentCents", "cushionCapCents", "stepTwoAddCents", "requiredStartingBalanceCents", "differenceCents", "surplusCents", "shortageCents", "deficiencyCents", "classification"]) {
      assert.equal(o[key], e[key], vector.id + " " + key);
    }
    assert.equal(o.lowMonth, e.lowPoint.month, vector.id);
    assert.equal(o.lowProjectedCents, e.lowPoint.projectedBalanceCents, vector.id);
    assert.equal(o.whileRepaying, e.newMonthlyEscrowPayment.monthlyEscrowWhileRepayingDeficiencyCents, vector.id);
    assert.deepStrictEqual(o.nearLine === null ? null : { ...o.nearLine, toleranceCents: 700 }, e.nearLine, vector.id);
  }
});

test("E2: shortage handling is identical whether or not the borrower is current — (f)(3) has no such condition", () => {
  const shortagePart = (result) => ({
    shortageCents: result.shortageCents,
    spread: result.newMonthlyEscrowPayment.shortageSpreadOver12Cents,
    options: result.servicerOptions.filter((option) => option.startsWith("shortage:")),
    tier: result.classification.includes("SHORTAGE_") ? result.classification.slice(result.classification.indexOf("SHORTAGE_")) : "",
    cite: result.cite.split(" + ").filter((cite) => cite.includes("(f)(3)")),
  });
  let withShortage = 0;
  for (const account of ACCOUNTS) {
    const current = analyze({ ...account, borrowerCurrent: true });
    const notCurrent = analyze({ ...account, borrowerCurrent: false });
    assert.deepStrictEqual(shortagePart(notCurrent), shortagePart(current), describe(account));
    assert.deepStrictEqual(notCurrent.table, current.table);
    assert.equal(notCurrent.differenceCents, current.differenceCents);
    if (current.shortageCents > 0) withShortage = withShortage + 1;
    if (notCurrent.deficiencyCents > 0) {
      assert.ok(notCurrent.classification.startsWith("DEFICIENCY_BORROWER_NOT_CURRENT"), describe(account));
      assert.equal(notCurrent.newMonthlyEscrowPayment.deficiencySpreadCents, 0);
      assert.equal(notCurrent.newMonthlyEscrowPayment.deficiencySpreadMonths, 0);
    }
  }
  assert.ok(withShortage > 500);
});

// A statement built from the account, sometimes agreeing, sometimes not.
function randomStatement(result, randomNumber) {
  const { whole, pick } = makeHelpers(randomNumber);
  const pay = result.newMonthlyEscrowPayment;
  return {
    currentMonthlyEscrowCents: whole(0, 2 * result.baseMonthlyPaymentCents),
    newMonthlyEscrowCents: pick([pay.monthlyEscrowAfterDeficiencyRepaidCents, pay.monthlyEscrowWhileRepayingDeficiencyCents, result.baseMonthlyPaymentCents, whole(0, 3 * result.baseMonthlyPaymentCents)]),
    requiredMinimumBalanceCents: pick([result.cushionCapCents, whole(0, 2 * result.cushionCapCents + 1000)]),
    claimedKind: pick(["surplus", "shortage", "deficiency", "none"]),
    claimedAmountCents: pick([result.surplusCents, result.shortageCents, result.deficiencyCents, whole(0, 500000)]),
    shortageSpreadMonths: pick([12, 12, 1, 6, 24]),
    lumpSumOfferedOnStatement: randomNumber() < 0.3,
  };
}

test("E5 + C5: every numeric output is a whole number and none is negative zero — randomized runs", () => {
  const randomNumber = makeRandom(SEED + 3);
  let numbersSeen = 0;
  for (const account of ACCOUNTS) {
    const context = describe(account);
    const result = analyze(account);
    const statement = randomStatement(result, randomNumber);
    const comparison = compareWithStatement(result, statement);
    numbersSeen += assertWholeAndNoNegativeZero(result, "result", context); // includes result.inputs
    numbersSeen += assertWholeAndNoNegativeZero(comparison, "comparison", context + "\nstatement=" + JSON.stringify(statement));
    numbersSeen += assertWholeAndNoNegativeZero(projectWithPayment(account, statement.newMonthlyEscrowCents), "projectWithPayment", context);
    numbersSeen += assertWholeAndNoNegativeZero(explainServicerLine(result, account, statement), "explainServicerLine", context);
    const jump = explainJump(result, statement);
    numbersSeen += assertWholeAndNoNegativeZero(jump, "explainJump", context);
    assert.equal(jump.parts.reduce((sum, part) => sum + part.cents, 0), statement.newMonthlyEscrowCents - statement.currentMonthlyEscrowCents, "jump parts must add up" + context);

    // The comparison can never contradict itself.
    // (A "not-compared" row — audit B2 — asserts nothing, so it neither needs a flag nor counts as a match.)
    const comparedRows = comparison.rows.filter((row) => row.status !== "not-compared");
    let expectedOverall = "not-provided";
    if (comparedRows.length > 0) expectedOverall = "matches";
    if (comparison.flags.length > 0) expectedOverall = "look-here";
    assert.equal(comparison.overall, expectedOverall, context + "\nstatement=" + JSON.stringify(statement));
    assert.ok(Array.isArray(comparison.nudges));
    assert.ok(comparison.nudges.length <= 1);
    for (const row of comparison.rows) {
      assert.equal(row.gapCents, row.statementCents - row.federalCents);
      const needsFlag = row.status === "differs" || row.status === "over-limit";
      assert.equal(comparison.flags.some((flag) => flag.rowKey === row.key), needsFlag, row.key + context);
    }
    // And the words never crash.
    const verdict = explainVerdict(result, comparison);
    assert.equal(verdict.tooCloseToCall, result.nearLine !== null);
    assert.ok(nextSteps(result, comparison).length >= 3); // at least: information request, CFPB complaint, housing counselor
    assert.equal(typeof buildLetter(result, comparison, {}), "string");
  }
  assert.ok(numbersSeen > 300000, "only " + numbersSeen + " numbers were checked");
});

// FIX ORDER 3, N1 (the auditor's Stage 3 finding): an over-the-cap "required
// minimum" must never come out green by accident. For every random account we
// type a minimum that is OVER the cap, half the time exactly the federal low
// point (the case the old mix-up rule hid), and we let the other statement
// boxes vary: a claim that matches, "none", a claim of another size, no claim.
test("N1 property: typed minimum over the cap → exactly ONE of {nudge, CUSHION_OVER_CAP, CUSHION_MAYBE_OVER_CAP}, and never 'matches' unless the claim itself matches (case a)", () => {
  const randomNumber = makeRandom(SEED + 11);
  const { whole, pick } = makeHelpers(randomNumber);
  const seen = { nudge: 0, overCap: 0, maybe: 0, greenOnlyInCaseA: 0, triggerMet: 0 };

  for (const account of ACCOUNTS) {
    const result = analyze(account);
    const capCents = result.cushionCapCents;
    const lowPointCents = result.lowPoint.projectedBalanceCents;

    // A typed minimum that is over the cap by more than the $7.00 tolerance.
    let typedCents = capCents + 701 + whole(0, 300000);
    if (lowPointCents - capCents > 700 && randomNumber() < 0.5) typedCents = lowPointCents + whole(-700, 700);
    if (typedCents - capCents <= 700) typedCents = capCents + 701;
    if (typedCents > 1000000000) continue; // past the tool's $10,000,000 limit: treated as not given

    let kind = "none";
    let amount = 0;
    if (result.surplusCents > 0) { kind = "surplus"; amount = result.surplusCents; }
    if (result.shortageCents > 0) { kind = "shortage"; amount = result.shortageCents; }
    const claim = pick([
      {}, // no claim typed
      { claimedKind: kind, claimedAmountCents: amount }, // matches the federal math
      { claimedKind: "none" },
      { claimedKind: pick(["surplus", "shortage"]), claimedAmountCents: whole(0, 400000) },
      { claimedKind: pick(["surplus", "shortage", "deficiency"]) }, // a kind with no amount
    ]);
    const payment = pick([{}, { newMonthlyEscrowCents: result.baseMonthlyPaymentCents }, { newMonthlyEscrowCents: result.newMonthlyEscrowPayment.monthlyEscrowAfterDeficiencyRepaidCents }]);
    const statement = { requiredMinimumBalanceCents: typedCents, ...claim, ...payment };
    const context = describe(account) + "\nstatement=" + JSON.stringify(statement);

    const comparison = compareWithStatement(result, statement);
    const nudges = comparison.nudges.length;
    const overCap = comparison.flags.filter((flag) => flag.kind === "CUSHION_OVER_CAP").length;
    const maybe = comparison.flags.filter((flag) => flag.kind === "CUSHION_MAYBE_OVER_CAP").length;
    assert.equal(nudges + overCap + maybe, 1, "exactly one cushion outcome" + context);
    seen.nudge += nudges;
    seen.overCap += overCap;
    seen.maybe += maybe;

    const triggerMet = Math.abs(typedCents - lowPointCents) <= 700;
    if (triggerMet) seen.triggerMet += 1;
    if (!triggerMet) assert.equal(overCap, 1, "trigger not met → the plain rule" + context);

    const claimRow = comparison.rows.find((row) => row.key === "claimedAmount");
    const claimMatches = claimRow !== undefined && claimRow.status === "match";
    assert.equal(nudges === 1, triggerMet && claimMatches, "a nudge exactly in case (a)" + context);

    const cushionRow = comparison.rows.find((row) => row.key === "requiredMinimumBalance");
    const expectedStatus = nudges === 1 ? "not-compared" : overCap === 1 ? "over-limit" : "differs";
    assert.equal(cushionRow.status, expectedStatus, context);

    if (comparison.overall === "matches") {
      assert.ok(triggerMet && claimMatches, "green with an over-the-cap minimum, outside case (a)" + context);
      seen.greenOnlyInCaseA += 1;
    }
    if (nudges === 0) {
      assert.equal(comparison.overall, "look-here", context);
      assert.equal(explainVerdict(result, comparison).tone, "flag", context);
    }
  }

  // The generator really reached all three outcomes, and the green case.
  assert.ok(seen.triggerMet > 500, JSON.stringify(seen));
  assert.ok(seen.nudge > 50 && seen.overCap > 500 && seen.maybe > 100, JSON.stringify(seen));
  assert.ok(seen.greenOnlyInCaseA > 20, JSON.stringify(seen));
});

test("E5 + C5: whole numbers and no negative zero across every research vector and every example", () => {
  const cases = VECTORS.map((vector) => ({ account: accountFromVector(vector), statement: undefined }));
  for (const example of EXAMPLES) cases.push({ account: example.account, statement: example.statement });
  const randomNumber = makeRandom(SEED + 4);
  for (const item of cases) {
    const result = analyze(item.account);
    for (const statement of [item.statement, randomStatement(result, randomNumber), { claimedKind: "shortage", claimedAmountCents: 0 }, { claimedKind: "none" }]) {
      const comparison = compareWithStatement(result, statement);
      const context = describe(item.account);
      assertWholeAndNoNegativeZero(result, "result", context);
      assertWholeAndNoNegativeZero(comparison, "comparison", context);
      assertWholeAndNoNegativeZero(explainServicerLine(result, item.account, statement), "servicerLine", context);
      assertWholeAndNoNegativeZero(explainJump(result, statement), "jump", context);
      assertWholeAndNoNegativeZero(projectWithPayment(item.account, 0), "projectWithPayment", context);
    }
  }
});

test("huge but allowed amounts stay exact: 100 bills of $10,000,000", () => {
  const account = { startMonth: 1, startingBalanceCents: -1000000000, cushionMonths: 2, borrowerCurrent: true, disbursements: [] };
  for (let index = 0; index < 100; index++) account.disbursements.push({ label: "Bill", month: (index % 12) + 1, amountCents: 1000000000 - index });
  const r = analyze(account);
  const o = oracle(account);
  assert.equal(r.annualDisbursementsCents, o.annualDisbursementsCents);
  assert.equal(r.requiredStartingBalanceCents, o.requiredStartingBalanceCents);
  assert.equal(r.differenceCents, o.differenceCents);
  assert.ok(Number.isSafeInteger(r.annualDisbursementsCents * 12), "even bills × 12 stays inside the exact range");
  assertWholeAndNoNegativeZero(r, "result", "");
});
