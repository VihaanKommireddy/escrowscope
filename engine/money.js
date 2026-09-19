// engine/money.js — the edges of the engine: dollars-as-text in, whole cents
// out, and whole cents back to dollars-as-text. Plus the month helpers.
//
// THE ONE RULE: inside the engine, money is always a whole number of cents
// (an integer). $1,234.50 is 123450. We never store dollars as a decimal
// number, because computers cannot store most decimals exactly:
// 0.1 + 0.2 is 0.30000000000000004 in JavaScript. With whole cents, every
// add, subtract and compare is exact.
//
// That is also why parseDollars reads the text ONE CHARACTER AT A TIME instead
// of turning "12.34" into the number 12.34 first. Going through a decimal
// number would bring the rounding problem right back in.

// The largest amount this tool accepts: $10,000,000.00 (SPEC B3, "absurd
// magnitude"). Written in cents.
export const MAX_MONEY_CENTS = 1000000000;

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// The real minus sign (Unicode U+2212). It is wider than a hyphen and is what
// typeset documents use, so some people will paste it in. We also print it.
const MINUS_SIGN = "\u2212";

const DIGITS = "0123456789";

// ---------------------------------------------------------------------------
// No negative zero. JavaScript has TWO zeros: 0 and -0. They are equal with
// ===, but -0 shows up when you flip the sign of 0 (`-x` when x is 0), and it
// can print as "-0" and fails strict test comparisons. Money has one zero.
// Every place in the engine that flips a sign passes the answer through here.
// (SPEC E5.)  How it works: -0 === 0 is true, so we hand back a plain 0.
// ---------------------------------------------------------------------------

export function noNegativeZero(number) {
  if (number === 0) return 0;
  return number;
}

// ---------------------------------------------------------------------------
// Whole-number division. EVERY division of money in the engine goes through
// one of these two helpers, so there is exactly one place where a fraction
// could appear — and both helpers are written so that it never does.
// ---------------------------------------------------------------------------

function checkDivisionInputs(cents, divisor) {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new RangeError("Division helpers need a whole, non-negative number of cents.");
  }
  if (!Number.isSafeInteger(divisor) || divisor < 1) {
    throw new RangeError("Division helpers need a whole divisor of 1 or more.");
  }
}

// Divide and DROP any leftover (round down).
// Used for the cushion cap: the law says "no greater than" one-sixth, so a cap
// must never be rounded UP past the limit. 12 CFR 1024.17(c)(5).
//
// How it avoids fractions: `cents % divisor` is the leftover. Take the leftover
// away first, and what remains is an exact multiple of the divisor, so the
// division comes out to a whole number with nothing to round.
//   Example: 1000000 ÷ 12 → leftover 4 → 999996 ÷ 12 = 83333 exactly.
export function divideRoundDown(cents, divisor) {
  checkDivisionInputs(cents, divisor);
  const leftover = cents % divisor;
  return (cents - leftover) / divisor;
}

// Divide and round to the NEAREST cent; an exact half goes up.
// Used for the monthly payment (bills ÷ 12) and for spreading a shortage or
// deficiency over months. The regulation is silent on cents, so this is a
// CHOICE, not law — it is the convention written down in the test vectors
// (meta.choicesThatAreNotLaw: "round half up: floor((D + 6) / 12)").
//   Example: 500000 ÷ 12 = 41666 with 8 left over. 8 is more than half of 12,
//   so round up → 41667.
export function divideRoundHalfUp(cents, divisor) {
  checkDivisionInputs(cents, divisor);
  const leftover = cents % divisor;
  const roundedDown = (cents - leftover) / divisor;
  if (leftover * 2 >= divisor) {
    return roundedDown + 1;
  }
  return roundedDown;
}

// ---------------------------------------------------------------------------
// parseDollars: text the person typed → whole cents.
//   parseDollars("1,234.50") → { ok: true, cents: 123450 }
//   parseDollars("12.345")   → { ok: false, problem: "Use at most 2 digits…" }
// Accepts: "1234.5", "$1,234.50", "-200", "−200" (real minus sign), "-$200",
// "$-200", "(200.00)" (accountants' way of writing a negative), ".50".
// The problem text never repeats what was typed, so it is always safe to show.
// ---------------------------------------------------------------------------

const PROBLEM_EMPTY = "Please type a dollar amount, like 1234.50.";
const PROBLEM_NOT_MONEY = "That doesn't look like a dollar amount. Use digits only, like 1234.50.";
const PROBLEM_TOO_MANY_DECIMALS =
  "Use at most 2 digits after the decimal point. Dollars and cents, like 1234.50.";
const PROBLEM_COMMAS =
  "Check the commas. They go between every three digits, like 1,234.50. Use a period before the cents.";
const PROBLEM_TOO_LARGE =
  "That amount is too large for this tool. The most it can handle is $10,000,000.";

function isDigit(character) {
  return character.length === 1 && DIGITS.includes(character);
}

function isAllDigits(text) {
  for (const character of text) {
    if (!isDigit(character)) return false;
  }
  return true;
}

// "12,345" → are the commas in the right places? First group 1–3 digits, every
// later group exactly 3. This also catches the European style "1234,50", which
// would otherwise be misread as one hundred times too big.
function commasAreWellPlaced(groups) {
  if (groups[0].length < 1 || groups[0].length > 3) return false;
  for (let index = 1; index < groups.length; index++) {
    if (groups[index].length !== 3) return false;
  }
  return true;
}

function removeLeadingZeros(digits) {
  let start = 0;
  while (start < digits.length - 1 && digits[start] === "0") {
    start = start + 1;
  }
  return digits.slice(start);
}

// "1234" → 1234, one digit at a time. Whole numbers only, so no fractions.
function digitsToNumber(digits) {
  let value = 0;
  for (const character of digits) {
    value = value * 10 + DIGITS.indexOf(character);
  }
  return value;
}

function problem(text) {
  return { ok: false, problem: text };
}

export function parseDollars(text) {
  if (typeof text !== "string") return problem(PROBLEM_EMPTY);

  let rest = text.trim();
  if (rest === "") return problem(PROBLEM_EMPTY);

  let negative = false;

  // (200.00) means −200.00.
  let insideParentheses = false;
  if (rest.startsWith("(") || rest.endsWith(")")) {
    if (!(rest.startsWith("(") && rest.endsWith(")"))) return problem(PROBLEM_NOT_MONEY);
    insideParentheses = true;
    negative = true;
    rest = rest.slice(1, rest.length - 1).trim();
  }

  // Up to one minus sign and up to one "$", in either order, at the front.
  let position = 0;
  let sawSign = false;
  let sawDollarSign = false;
  while (position < rest.length) {
    const character = rest[position];
    const isMinus = character === "-" || character === MINUS_SIGN;
    if (isMinus && !sawSign && !insideParentheses) {
      sawSign = true;
      negative = true;
      position = position + 1;
    } else if (character === "$" && !sawDollarSign) {
      sawDollarSign = true;
      position = position + 1;
    } else {
      break;
    }
  }
  const body = rest.slice(position);

  // Split into the part before the decimal point and the part after it.
  const pieces = body.split(".");
  if (pieces.length > 2) return problem(PROBLEM_NOT_MONEY);
  const wholeText = pieces[0];
  const centsText = pieces.length === 2 ? pieces[1] : "";
  if (wholeText === "" && centsText === "") return problem(PROBLEM_NOT_MONEY);

  // After the point: 0, 1 or 2 digits.
  if (!isAllDigits(centsText)) return problem(PROBLEM_NOT_MONEY);
  if (centsText.length > 2) return problem(PROBLEM_TOO_MANY_DECIMALS);

  // Before the point: digits, with optional well-placed commas.
  const groups = wholeText.split(",");
  for (const group of groups) {
    if (!isAllDigits(group)) return problem(PROBLEM_NOT_MONEY);
  }
  if (groups.length > 1 && !commasAreWellPlaced(groups)) return problem(PROBLEM_COMMAS);

  // $10,000,000 has 8 digits. Anything longer is too large, and refusing it
  // here means we never build a number too big to be exact.
  const wholeDigits = removeLeadingZeros(groups.join(""));
  if (wholeDigits.length > 8) return problem(PROBLEM_TOO_LARGE);

  const dollars = digitsToNumber(wholeDigits);
  let extraCents = digitsToNumber(centsText);
  if (centsText.length === 1) {
    extraCents = extraCents * 10; // "12.5" means 50 cents, not 5
  }

  const total = dollars * 100 + extraCents;
  if (total > MAX_MONEY_CENTS) return problem(PROBLEM_TOO_LARGE);

  // `total === 0` check: never hand back "negative zero".
  if (negative && total !== 0) return { ok: true, cents: -total };
  return { ok: true, cents: total };
}

// ---------------------------------------------------------------------------
// formatCents: whole cents → text.
//   formatCents(123450) → "$1,234.50"      formatCents(-20000) → "−$200.00"
// Built with whole-number math only. The minus is the real minus sign.
// ---------------------------------------------------------------------------

export function formatCents(cents) {
  if (!Number.isInteger(cents)) {
    throw new TypeError("formatCents needs a whole number of cents.");
  }

  const isNegative = cents < 0;
  const size = Math.abs(cents);

  const dollars = divideRoundDown(size, 100);
  const leftoverCents = size % 100;

  // Put a comma before every group of three digits, working from the right.
  const dollarDigits = String(dollars);
  let withCommas = "";
  for (let index = 0; index < dollarDigits.length; index++) {
    const digitsRemaining = dollarDigits.length - index;
    if (index > 0 && digitsRemaining % 3 === 0) {
      withCommas = withCommas + ",";
    }
    withCommas = withCommas + dollarDigits[index];
  }

  let centsDigits = String(leftoverCents);
  if (leftoverCents < 10) {
    centsDigits = "0" + centsDigits;
  }

  const text = "$" + withCommas + "." + centsDigits;
  if (isNegative) return MINUS_SIGN + text;
  return text;
}

// ---------------------------------------------------------------------------
// Months. An escrow year does not have to start in January: the regulation's
// own example (Appendix E) runs July to June. Inside the engine, month 1 is
// always the FIRST MONTH OF THE ESCROW YEAR. `startMonth` says which calendar
// month that is (1 = January). 12 CFR 1024.17(b), "escrow account computation
// year".
// ---------------------------------------------------------------------------

function checkMonth(month) {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError("A month must be a whole number from 1 to 12.");
  }
}

// Escrow year starts in July (7): escrow month 6 → December (12).
export function escrowToCalendarMonth(escrowMonth, startMonth) {
  checkMonth(escrowMonth);
  checkMonth(startMonth);
  const monthsAfterJanuary = startMonth - 1 + (escrowMonth - 1);
  return (monthsAfterJanuary % 12) + 1;
}

// Escrow year starts in April (4): June (6) → escrow month 3.
export function calendarToEscrowMonth(calendarMonth, startMonth) {
  checkMonth(calendarMonth);
  checkMonth(startMonth);
  const monthsAfterStart = (calendarMonth - startMonth + 12) % 12;
  return monthsAfterStart + 1;
}
