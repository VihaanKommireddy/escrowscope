// tests/validate.test.js — validateAccount and validateStatement (SPEC B3).
// Hard errors block the math. Soft warnings never do.

import { test } from "node:test";
import assert from "node:assert/strict";

import { validateAccount, validateStatement } from "../engine/index.js";
import { VECTORS } from "../engine/vectors.js";
import { accountFromVector } from "../engine/index.js";
import { EXAMPLES } from "../examples.js";

function goodAccount() {
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

function fieldsOf(list) {
  return list.map((item) => item.field);
}

function assertPlainEnglish(list) {
  for (const item of list) {
    assert.equal(typeof item.field, "string");
    assert.equal(typeof item.message, "string");
    assert.ok(item.message.length >= 15, "too short to be a sentence: " + item.message);
    assert.ok(item.message.endsWith(".") || item.message.endsWith("?"), "should end like a sentence: " + item.message);
    // No programmer words in messages a homeowner will read.
    for (const jargon of ["integer", "undefined", "null", "NaN", "array", "object", "boolean", "Cents"]) {
      assert.equal(item.message.includes(jargon), false, "jargon `" + jargon + "` in: " + item.message);
    }
  }
}

// ---------- validateAccount: the happy path ----------

test("a good account has no errors and no warnings", () => {
  assert.deepStrictEqual(validateAccount(goodAccount()), { errors: [], warnings: [] });
});

test("every research vector and every built-in example is a valid account", () => {
  for (const vector of VECTORS) {
    assert.deepStrictEqual(validateAccount(accountFromVector(vector)).errors, [], vector.id);
  }
  for (const example of EXAMPLES) {
    assert.deepStrictEqual(validateAccount(example.account).errors, [], example.id);
  }
});

test("cushionMonths and borrowerCurrent may be left out (defaults: 2 months, current)", () => {
  const account = goodAccount();
  delete account.cushionMonths;
  delete account.borrowerCurrent;
  assert.deepStrictEqual(validateAccount(account).errors, []);
});

test("a bill's label may be left out", () => {
  const account = goodAccount();
  delete account.disbursements[0].label;
  assert.deepStrictEqual(validateAccount(account).errors, []);
});

test("a zero starting balance is fine", () => {
  const account = goodAccount();
  account.startingBalanceCents = 0;
  assert.deepStrictEqual(validateAccount(account).errors, []);
});

// ---------- validateAccount: hard errors ----------

test("not an account at all", () => {
  for (const bad of [undefined, null, 5, "account", []]) {
    const { errors } = validateAccount(bad);
    assert.deepStrictEqual(fieldsOf(errors), ["account"]);
    assertPlainEnglish(errors);
  }
});

test("missing starting balance", () => {
  for (const missing of [undefined, null]) {
    const account = goodAccount();
    account.startingBalanceCents = missing;
    const { errors } = validateAccount(account);
    assert.deepStrictEqual(fieldsOf(errors), ["startingBalanceCents"]);
    assertPlainEnglish(errors);
  }
});

test("starting balance that is not a whole number of cents", () => {
  for (const bad of [1500.5, NaN, Infinity, "150000", true]) {
    const account = goodAccount();
    account.startingBalanceCents = bad;
    assert.deepStrictEqual(fieldsOf(validateAccount(account).errors), ["startingBalanceCents"]);
  }
});

test("starting balance beyond $10,000,000 either way", () => {
  for (const bad of [1000000001, -1000000001]) {
    const account = goodAccount();
    account.startingBalanceCents = bad;
    const { errors } = validateAccount(account);
    assert.deepStrictEqual(fieldsOf(errors), ["startingBalanceCents"]);
    assert.match(errors[0].message, /10,000,000/);
  }
  const edge = goodAccount();
  edge.startingBalanceCents = -1000000000;
  assert.deepStrictEqual(validateAccount(edge).errors, []);
});

test("start month missing or outside 1–12", () => {
  for (const bad of [undefined, null, 0, 13, 1.5, "4", -1]) {
    const account = goodAccount();
    account.startMonth = bad;
    const { errors } = validateAccount(account);
    assert.deepStrictEqual(fieldsOf(errors), ["startMonth"]);
    assertPlainEnglish(errors);
  }
});

test("cushion months other than 0, 1 or 2", () => {
  for (const bad of [3, -1, 1.5, "2", null]) {
    const account = goodAccount();
    account.cushionMonths = bad;
    assert.deepStrictEqual(fieldsOf(validateAccount(account).errors), ["cushionMonths"]);
  }
  for (const good of [0, 1, 2]) {
    const account = goodAccount();
    account.cushionMonths = good;
    assert.deepStrictEqual(validateAccount(account).errors, []);
  }
});

test("borrowerCurrent that is not yes/no", () => {
  const account = goodAccount();
  account.borrowerCurrent = "yes";
  assert.deepStrictEqual(fieldsOf(validateAccount(account).errors), ["borrowerCurrent"]);
});

test("no bills", () => {
  for (const bad of [undefined, null, [], "taxes", {}]) {
    const account = goodAccount();
    account.disbursements = bad;
    const { errors } = validateAccount(account);
    assert.deepStrictEqual(fieldsOf(errors), ["disbursements"]);
    assertPlainEnglish(errors);
  }
});

test("more than 100 bills", () => {
  const account = goodAccount();
  account.disbursements = [];
  for (let index = 0; index < 101; index++) {
    account.disbursements.push({ label: "Bill", month: 1, amountCents: 100000 });
  }
  assert.deepStrictEqual(fieldsOf(validateAccount(account).errors), ["disbursements"]);
  account.disbursements.pop();
  assert.deepStrictEqual(validateAccount(account).errors, []);
});

test("bill with no amount, zero, negative, fractional, or absurd amount — field names carry the row number", () => {
  for (const bad of [undefined, null, 0, -5000, 1200.5, NaN, "120000", 1000000001]) {
    const account = goodAccount();
    account.disbursements[1].amountCents = bad;
    const { errors } = validateAccount(account);
    assert.deepStrictEqual(fieldsOf(errors), ["disbursements.1.amountCents"], String(bad));
    assertPlainEnglish(errors);
  }
});

test("bill month missing or outside 1–12", () => {
  for (const bad of [undefined, null, 0, 13, 2.5, "5"]) {
    const account = goodAccount();
    account.disbursements[2].month = bad;
    const { errors } = validateAccount(account);
    assert.deepStrictEqual(fieldsOf(errors), ["disbursements.2.month"], String(bad));
    assertPlainEnglish(errors);
  }
});

test("bill label that is not text, or is far too long", () => {
  const account = goodAccount();
  account.disbursements[0].label = 42;
  assert.deepStrictEqual(fieldsOf(validateAccount(account).errors), ["disbursements.0.label"]);
  account.disbursements[0].label = "x".repeat(101);
  assert.deepStrictEqual(fieldsOf(validateAccount(account).errors), ["disbursements.0.label"]);
  account.disbursements[0].label = "x".repeat(100);
  assert.deepStrictEqual(validateAccount(account).errors, []);
});

test("a label that looks like HTML is just a label (the engine never treats text as markup)", () => {
  const account = goodAccount();
  account.disbursements[0].label = "<img src=x onerror=alert(1)>";
  assert.deepStrictEqual(validateAccount(account).errors, []);
});

test("a bill row that is not a row at all reports both missing pieces", () => {
  const account = goodAccount();
  account.disbursements[0] = null;
  assert.deepStrictEqual(fieldsOf(validateAccount(account).errors), [
    "disbursements.0.amountCents",
    "disbursements.0.month",
  ]);
});

test("several problems at once are all reported, in form order", () => {
  const account = goodAccount();
  account.startMonth = 0;
  account.startingBalanceCents = undefined;
  account.disbursements[0].amountCents = 0;
  account.disbursements[2].month = 99;
  assert.deepStrictEqual(fieldsOf(validateAccount(account).errors), [
    "startMonth",
    "startingBalanceCents",
    "disbursements.0.amountCents",
    "disbursements.2.month",
  ]);
});

test("priorYear, when given, needs its four whole-cent numbers", () => {
  const account = goodAccount();
  account.priorYear = { annualDisbursementsCents: 480000, monthlyEscrowCents: 40000, cushionCents: 80000, stepTwoAddCents: 40000 };
  assert.deepStrictEqual(validateAccount(account).errors, []);
  account.priorYear = { annualDisbursementsCents: 480000, monthlyEscrowCents: 40000.5, cushionCents: -1 };
  assert.deepStrictEqual(fieldsOf(validateAccount(account).errors), [
    "priorYear.monthlyEscrowCents",
    "priorYear.cushionCents",
    "priorYear.stepTwoAddCents",
  ]);
  account.priorYear = "last year";
  assert.deepStrictEqual(fieldsOf(validateAccount(account).errors), ["priorYear"]);
});

test("validateAccount never changes the account it is given", () => {
  const account = goodAccount();
  const before = JSON.stringify(account);
  validateAccount(account);
  assert.equal(JSON.stringify(account), before);
});

// ---------- validateAccount: soft warnings ----------

test("only one bill → a nudge, not an error", () => {
  const account = goodAccount();
  account.disbursements = [{ label: "Property tax", month: 11, amountCents: 360000 }];
  const { errors, warnings } = validateAccount(account);
  assert.deepStrictEqual(errors, []);
  assert.deepStrictEqual(fieldsOf(warnings), ["disbursements"]);
  assert.match(warnings[0].message, /insurance/i);
  assertPlainEnglish(warnings);
});

test("a bill under $100 for the year → 'monthly vs. yearly?' nudge on that row", () => {
  const account = goodAccount();
  account.disbursements.push({ label: "Flood insurance", month: 3, amountCents: 9999 });
  const { errors, warnings } = validateAccount(account);
  assert.deepStrictEqual(errors, []);
  assert.deepStrictEqual(fieldsOf(warnings), ["disbursements.3.amountCents"]);
  assertPlainEnglish(warnings);
});

test("small MONTHLY rows that add up to $100 or more for the year are not nagged (TV21's $50 PMI × 12)", () => {
  const tv21 = VECTORS.find((vector) => vector.id === "TV21");
  const { errors, warnings } = validateAccount(accountFromVector(tv21));
  assert.deepStrictEqual(errors, []);
  assert.deepStrictEqual(warnings, []);
});

test("annual total above $100,000 → nudge", () => {
  const account = goodAccount();
  account.disbursements[0].amountCents = 9800001;
  const { errors, warnings } = validateAccount(account);
  assert.deepStrictEqual(errors, []);
  assert.deepStrictEqual(fieldsOf(warnings), ["disbursements"]);
  assert.match(warnings[0].message, /100,000/);
});

test("a negative starting balance → nudge that explains 'deficiency'", () => {
  const account = goodAccount();
  account.startingBalanceCents = -15000;
  const { errors, warnings } = validateAccount(account);
  assert.deepStrictEqual(errors, []);
  assert.deepStrictEqual(fieldsOf(warnings), ["startingBalanceCents"]);
  assert.match(warnings[0].message, /deficiency/i);
  assertPlainEnglish(warnings);
});

test("warnings are only worked out once the hard errors are gone", () => {
  const account = goodAccount();
  account.disbursements = [{ label: "Property tax", month: 99, amountCents: 360000 }];
  const { errors, warnings } = validateAccount(account);
  assert.equal(errors.length, 1);
  assert.deepStrictEqual(warnings, []);
});

// ---------- validateStatement ----------

function goodStatement() {
  return {
    currentMonthlyEscrowCents: 40000,
    newMonthlyEscrowCents: 40000,
    requiredMinimumBalanceCents: 80000,
    claimedKind: "surplus",
    claimedAmountCents: 30000,
    shortageSpreadMonths: 12,
    lumpSumOfferedOnStatement: false,
  };
}

test("a good statement has no errors and no warnings", () => {
  assert.deepStrictEqual(validateStatement(goodStatement(), goodAccount()), { errors: [], warnings: [] });
});

test("every built-in example's statement is valid", () => {
  for (const example of EXAMPLES) {
    assert.deepStrictEqual(validateStatement(example.statement, example.account), { errors: [], warnings: [] }, example.id);
  }
});

test("an empty or missing statement is fine — every field is optional", () => {
  for (const nothing of [undefined, null, {}]) {
    assert.deepStrictEqual(validateStatement(nothing, goodAccount()), { errors: [], warnings: [] });
  }
});

test("a statement that is not a statement", () => {
  for (const bad of [5, "statement", []]) {
    assert.deepStrictEqual(fieldsOf(validateStatement(bad, goodAccount()).errors), ["statement"]);
  }
});

test("statement money must be whole cents, not below $0, not absurd — field names start with 'statement.'", () => {
  const moneyFields = [
    "currentMonthlyEscrowCents",
    "newMonthlyEscrowCents",
    "requiredMinimumBalanceCents",
    "claimedAmountCents",
  ];
  for (const name of moneyFields) {
    for (const bad of [-1, 10.5, NaN, "500", 1000000001]) {
      const statement = goodStatement();
      statement[name] = bad;
      const { errors } = validateStatement(statement, goodAccount());
      assert.deepStrictEqual(fieldsOf(errors), ["statement." + name], name + " = " + String(bad));
      assertPlainEnglish(errors);
    }
  }
});

test("claimedKind must be one of the four choices", () => {
  const statement = goodStatement();
  statement.claimedKind = "overage";
  assert.deepStrictEqual(fieldsOf(validateStatement(statement, goodAccount()).errors), ["statement.claimedKind"]);
  for (const kind of ["surplus", "shortage", "deficiency"]) {
    statement.claimedKind = kind;
    assert.deepStrictEqual(validateStatement(statement, goodAccount()).errors, []);
  }
});

test("shortageSpreadMonths must be a whole number of months from 1 to 360", () => {
  for (const bad of [0, -12, 1.5, "12", 361]) {
    const statement = goodStatement();
    statement.shortageSpreadMonths = bad;
    assert.deepStrictEqual(fieldsOf(validateStatement(statement, goodAccount()).errors), ["statement.shortageSpreadMonths"]);
  }
  for (const good of [1, 2, 12, 24, 360]) {
    const statement = goodStatement();
    statement.shortageSpreadMonths = good;
    assert.deepStrictEqual(validateStatement(statement, goodAccount()).errors, []);
  }
});

test("lumpSumOfferedOnStatement must be yes/no", () => {
  const statement = goodStatement();
  statement.lumpSumOfferedOnStatement = "yes";
  assert.deepStrictEqual(fieldsOf(validateStatement(statement, goodAccount()).errors), ["statement.lumpSumOfferedOnStatement"]);
});

test("nudge: the new escrow payment looks like a whole mortgage payment (more than double bills ÷ 12)", () => {
  const statement = goodStatement();
  statement.newMonthlyEscrowCents = 80001; // bills ÷ 12 is $400.00
  const { errors, warnings } = validateStatement(statement, goodAccount());
  assert.deepStrictEqual(errors, []);
  assert.deepStrictEqual(fieldsOf(warnings), ["statement.newMonthlyEscrowCents"]);
  assert.match(warnings[0].message, /escrow part/i);
  assertPlainEnglish(warnings);

  statement.newMonthlyEscrowCents = 80000; // exactly double: no nudge
  assert.deepStrictEqual(validateStatement(statement, goodAccount()).warnings, []);
});

test("nudge: same check on the current escrow payment", () => {
  const statement = goodStatement();
  statement.currentMonthlyEscrowCents = 215000;
  assert.deepStrictEqual(fieldsOf(validateStatement(statement, goodAccount()).warnings), ["statement.currentMonthlyEscrowCents"]);
});

test("the whole-payment nudge is skipped quietly when the account itself is not valid yet", () => {
  const statement = goodStatement();
  statement.newMonthlyEscrowCents = 500000;
  const brokenAccount = goodAccount();
  brokenAccount.disbursements = [];
  assert.deepStrictEqual(validateStatement(statement, brokenAccount), { errors: [], warnings: [] });
  assert.deepStrictEqual(validateStatement(statement, undefined), { errors: [], warnings: [] });
});

test("nudge: an amount with no kind picked, and a kind with no amount", () => {
  const amountOnly = goodStatement();
  delete amountOnly.claimedKind;
  assert.deepStrictEqual(fieldsOf(validateStatement(amountOnly, goodAccount()).warnings), ["statement.claimedKind"]);

  const kindOnly = goodStatement();
  delete kindOnly.claimedAmountCents;
  assert.deepStrictEqual(fieldsOf(validateStatement(kindOnly, goodAccount()).warnings), ["statement.claimedAmountCents"]);

  const noneNeedsNoAmount = goodStatement();
  noneNeedsNoAmount.claimedKind = "none";
  delete noneNeedsNoAmount.claimedAmountCents;
  assert.deepStrictEqual(validateStatement(noneNeedsNoAmount, goodAccount()).warnings, []);
});

test("typing a required minimum equal to the low point says nothing (SPEC B3)", () => {
  const statement = goodStatement();
  statement.requiredMinimumBalanceCents = 110000; // TV01's low point
  assert.deepStrictEqual(validateStatement(statement, goodAccount()).warnings, []);
});
