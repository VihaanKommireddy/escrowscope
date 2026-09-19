// engine/validate.js — checks what the person typed BEFORE any math runs.
//
// Two kinds of finding (SPEC B3):
//   errors   — the math cannot run (or would be nonsense). These block.
//   warnings — "are you sure?" nudges. These NEVER block. A tool that refuses
//              to run because of a hunch is a tool nobody trusts.
//
// Every finding is { field, message }:
//   field   — a dotted path to the input, e.g. "disbursements.0.amountCents"
//             (row 0 = the first bill), so the page can put the message next
//             to the right box.
//   message — plain English a 7th grader can read. It never repeats what was
//             typed, so it is always safe to show.

import { MAX_MONEY_CENTS, divideRoundHalfUp } from "./money.js";

const MAX_BILLS = 100;

// THE one limit on how long a bill's name may be, for the whole project (QA
// audit #13). The page's name box uses it as its `maxlength`, a loaded numbers
// file is held to it, and this file enforces it. No other file in engine/ has
// a label-length number of its own (tests/purity.test.js checks).
//
// HOW LENGTH IS COUNTED: with JavaScript's `.length`, which counts UTF-16
// units. Most characters are 1 unit; an emoji is usually 2. That is on purpose:
// it is exactly how a browser counts for an HTML `maxlength`, so whatever the
// name box lets someone type, this check accepts, and the two can never
// disagree. Counting "real" characters instead would accept names from a
// loaded file that the box itself could not hold.
export const MAX_BILL_LABEL_LENGTH = 60;

const MAX_SPREAD_MONTHS = 360; // 30 years; nobody spreads a shortage longer than the loan

const SMALL_BILL_CENTS = 10000; // $100 — below this for a whole year, ask "monthly or yearly?"
const LARGE_TOTAL_CENTS = 10000000; // $100,000 a year in escrow bills is possible, but worth a second look

const CLAIMED_KINDS = ["surplus", "shortage", "deficiency", "none"];

// ---------- small helpers ----------

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissing(value) {
  return value === undefined || value === null;
}

function isWholeNumber(value) {
  return typeof value === "number" && Number.isInteger(value);
}

function isMonth(value) {
  return isWholeNumber(value) && value >= 1 && value <= 12;
}

function finding(field, message) {
  return { field: field, message: message };
}

// ---------- validateAccount ----------

export function validateAccount(account) {
  const errors = [];
  const warnings = [];

  if (!isPlainObject(account)) {
    errors.push(finding("account", "Something went wrong reading the form. Please reload the page and try again."));
    return { errors: errors, warnings: warnings };
  }

  // First month of the escrow year.
  if (!isMonth(account.startMonth)) {
    errors.push(finding("startMonth", "Pick the first month of your new escrow year. It is the first month in your statement's 12-month table."));
  }

  // Starting balance. It may be negative (that is a deficiency), so only
  // "missing", "not money" and "absurdly large" are errors.
  if (isMissing(account.startingBalanceCents)) {
    errors.push(finding("startingBalanceCents", "Type your escrow balance at the start of the new 12 months. Your statement may call it the beginning balance."));
  } else if (!isWholeNumber(account.startingBalanceCents)) {
    errors.push(finding("startingBalanceCents", "The starting balance needs to be a dollar amount, like 1234.50."));
  } else if (Math.abs(account.startingBalanceCents) > MAX_MONEY_CENTS) {
    errors.push(finding("startingBalanceCents", "That starting balance is too large for this tool. The most it can handle is $10,000,000."));
  }

  // Cushion months: 2 is the federal maximum. Mortgage papers or state law can
  // set it lower. 12 CFR 1024.17(c)(8). Leaving it out means 2.
  if (account.cushionMonths !== undefined) {
    const allowed = account.cushionMonths === 0 || account.cushionMonths === 1 || account.cushionMonths === 2;
    if (!allowed) {
      errors.push(finding("cushionMonths", "The cushion can be 0, 1 or 2 months of escrow payments. 2 months is the most federal law allows."));
    }
  }

  // Is the borrower current on payments? Leaving it out means yes.
  if (account.borrowerCurrent !== undefined && typeof account.borrowerCurrent !== "boolean") {
    errors.push(finding("borrowerCurrent", "Tell us yes or no: are you more than 30 days behind on a payment?"));
  }

  // The bills.
  const bills = account.disbursements;
  if (!Array.isArray(bills) || bills.length === 0) {
    errors.push(finding("disbursements", "Add at least one bill that gets paid from escrow, like property tax or homeowners insurance."));
  } else if (bills.length > MAX_BILLS) {
    errors.push(finding("disbursements", "That is more bills than this tool can handle. Please use 100 rows or fewer."));
  } else {
    for (let index = 0; index < bills.length; index++) {
      checkOneBill(bills[index], index, errors);
    }
  }

  // Last year's numbers (optional; only the test vectors use them today).
  if (!isMissing(account.priorYear)) {
    checkPriorYear(account.priorYear, errors);
  }

  // Nudges only make sense once the numbers themselves are usable.
  if (errors.length === 0) {
    addAccountWarnings(account, warnings);
  }

  return { errors: errors, warnings: warnings };
}

function checkOneBill(bill, index, errors) {
  const row = isPlainObject(bill) ? bill : {};
  const amountField = "disbursements." + index + ".amountCents";
  const monthField = "disbursements." + index + ".month";
  const labelField = "disbursements." + index + ".label";

  if (isMissing(row.amountCents)) {
    errors.push(finding(amountField, "Type the amount of this bill for the year, like 1800.00."));
  } else if (!isWholeNumber(row.amountCents)) {
    errors.push(finding(amountField, "This bill's amount needs to be a dollar amount, like 1800.00."));
  } else if (row.amountCents <= 0) {
    errors.push(finding(amountField, "A bill's amount has to be more than $0. Remove the row if this bill does not apply to you."));
  } else if (row.amountCents > MAX_MONEY_CENTS) {
    errors.push(finding(amountField, "That bill is too large for this tool. The most it can handle is $10,000,000."));
  }

  if (!isMonth(row.month)) {
    errors.push(finding(monthField, "Pick the month this bill gets paid."));
  }

  if (row.label !== undefined) {
    if (typeof row.label !== "string") {
      errors.push(finding(labelField, "The name of this bill needs to be plain text."));
    } else if (row.label.length > MAX_BILL_LABEL_LENGTH) {
      // The field is this row's NAME box, so the page can put the message
      // right under it. The limit is written from the constant, so the words
      // can never drift away from the number.
      errors.push(finding(labelField, "That name is too long. Please keep it to " + MAX_BILL_LABEL_LENGTH + " characters or fewer, spaces included."));
    }
  }
}

function checkPriorYear(priorYear, errors) {
  if (!isPlainObject(priorYear)) {
    errors.push(finding("priorYear", "Last year's numbers could not be read. Leave them out or type them again."));
    return;
  }
  const names = ["annualDisbursementsCents", "monthlyEscrowCents", "cushionCents", "stepTwoAddCents"];
  for (const name of names) {
    const value = priorYear[name];
    const usable = isWholeNumber(value) && value >= 0 && value <= MAX_MONEY_CENTS;
    if (!usable) {
      errors.push(finding("priorYear." + name, "Each of last year's numbers needs to be a dollar amount of $0 or more."));
    }
  }
}

// A person may enter a monthly bill (like mortgage insurance) as 12 small rows.
// That is fine. So "a bill under $100" means: all the rows with the same name
// add up to under $100 for the year.
function yearlyTotalForSameName(bills, index) {
  const label = bills[index].label;
  if (typeof label !== "string" || label.trim() === "") {
    return bills[index].amountCents; // unnamed rows stand alone
  }
  const name = label.trim().toLowerCase();
  let total = 0;
  for (const bill of bills) {
    if (typeof bill.label === "string" && bill.label.trim().toLowerCase() === name) {
      total = total + bill.amountCents;
    }
  }
  return total;
}

function addAccountWarnings(account, warnings) {
  const bills = account.disbursements;

  if (account.startingBalanceCents < 0) {
    warnings.push(finding("startingBalanceCents", "A starting balance below $0 is rare. It is called a deficiency: the servicer paid a bill with its own money. Check that your statement really shows a negative number here."));
  }

  if (bills.length === 1) {
    warnings.push(finding("disbursements", "You entered one bill. Most statements list property tax AND homeowners insurance. Check your statement for a second bill."));
  }

  let annualTotal = 0;
  for (let index = 0; index < bills.length; index++) {
    annualTotal = annualTotal + bills[index].amountCents;
    if (yearlyTotalForSameName(bills, index) < SMALL_BILL_CENTS) {
      warnings.push(finding("disbursements." + index + ".amountCents", "This bill is under $100 for the whole year. If that is a monthly amount, enter it once for each month it is paid."));
    }
  }

  if (annualTotal > LARGE_TOTAL_CENTS) {
    warnings.push(finding("disbursements", "Your bills add up to more than $100,000 for the year. Check each amount for an extra digit."));
  }
}

// ---------- validateStatement ----------
// The statement is what the servicer's letter says. Every field is optional:
// "the more you fill in, the more we can check."

export function validateStatement(statement, account) {
  const errors = [];
  const warnings = [];

  if (isMissing(statement)) {
    return { errors: errors, warnings: warnings };
  }
  if (!isPlainObject(statement)) {
    errors.push(finding("statement", "Something went wrong reading the statement numbers. Please reload the page and try again."));
    return { errors: errors, warnings: warnings };
  }

  checkStatementMoney(statement, "currentMonthlyEscrowCents", "Your current monthly escrow payment", errors);
  checkStatementMoney(statement, "newMonthlyEscrowCents", "Your new monthly escrow payment", errors);
  checkStatementMoney(statement, "requiredMinimumBalanceCents", "The required minimum balance", errors);
  checkStatementMoney(statement, "claimedAmountCents", "The shortage or surplus amount", errors);

  if (!isMissing(statement.claimedKind) && !CLAIMED_KINDS.includes(statement.claimedKind)) {
    errors.push(finding("statement.claimedKind", "Pick one: shortage, surplus, deficiency, or none of these."));
  }

  if (!isMissing(statement.shortageSpreadMonths)) {
    const months = statement.shortageSpreadMonths;
    if (!isWholeNumber(months) || months < 1 || months > MAX_SPREAD_MONTHS) {
      errors.push(finding("statement.shortageSpreadMonths", "Type how many months the shortage is spread over, as a whole number from 1 to 360. Most statements use 12."));
    }
  }

  if (!isMissing(statement.lumpSumOfferedOnStatement) && typeof statement.lumpSumOfferedOnStatement !== "boolean") {
    errors.push(finding("statement.lumpSumOfferedOnStatement", "Tell us yes or no: does the statement offer a pay-it-all-at-once option?"));
  }

  if (errors.length === 0) {
    addStatementWarnings(statement, account, warnings);
  }

  return { errors: errors, warnings: warnings };
}

function checkStatementMoney(statement, name, humanName, errors) {
  const value = statement[name];
  if (isMissing(value)) return;
  const field = "statement." + name;
  if (!isWholeNumber(value)) {
    errors.push(finding(field, humanName + " needs to be a dollar amount, like 450.00."));
  } else if (value < 0) {
    errors.push(finding(field, humanName + " cannot be below $0. Type it without a minus sign."));
  } else if (value > MAX_MONEY_CENTS) {
    errors.push(finding(field, humanName + " is too large for this tool. The most it can handle is $10,000,000."));
  }
}

function addStatementWarnings(statement, account, warnings) {
  const hasKind = !isMissing(statement.claimedKind);
  const hasAmount = !isMissing(statement.claimedAmountCents);

  if (hasAmount && !hasKind) {
    warnings.push(finding("statement.claimedKind", "You typed an amount but did not pick whether it is a shortage, a surplus or a deficiency. We skipped that comparison."));
  }
  if (hasKind && statement.claimedKind !== "none" && !hasAmount) {
    warnings.push(finding("statement.claimedAmountCents", "You picked what the statement found but did not type the amount. Add it and we can compare the dollars too."));
  }

  // The most common entry mistake (research doc 03 §5): typing the WHOLE
  // mortgage payment instead of just the escrow part. The escrow part should
  // be close to bills ÷ 12. More than double that is worth a question.
  // This needs the bills, so it is skipped until the account itself is valid.
  if (validateAccount(account).errors.length > 0) return;

  let annualTotal = 0;
  for (const bill of account.disbursements) {
    annualTotal = annualTotal + bill.amountCents;
  }
  const billsDividedBy12 = divideRoundHalfUp(annualTotal, 12);
  const looksTooBig = 2 * billsDividedBy12;

  const question = " is more than double your yearly bills divided by 12. Is it the escrow part only, not your whole mortgage payment? A large shortage or deficiency can also cause this.";
  if (!isMissing(statement.currentMonthlyEscrowCents) && statement.currentMonthlyEscrowCents > looksTooBig) {
    warnings.push(finding("statement.currentMonthlyEscrowCents", "Your current escrow payment" + question));
  }
  if (!isMissing(statement.newMonthlyEscrowCents) && statement.newMonthlyEscrowCents > looksTooBig) {
    warnings.push(finding("statement.newMonthlyEscrowCents", "Your new escrow payment" + question));
  }
}
