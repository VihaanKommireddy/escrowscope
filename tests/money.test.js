// tests/money.test.js — dollars in, whole cents out, and back again.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  parseDollars,
  formatCents,
  calendarToEscrowMonth,
  escrowToCalendarMonth,
  MONTH_NAMES,
} from "../engine/index.js";
import { divideRoundDown, divideRoundHalfUp, MAX_MONEY_CENTS } from "../engine/money.js";

const MINUS = "−"; // the real minus sign, not a hyphen

// ---------- parseDollars: things it must accept ----------

const GOOD = [
  ["0", 0],
  ["0.00", 0],
  ["12", 1200],
  ["12.3", 1230],
  ["12.34", 1234],
  ["1234.50", 123450],
  ["1,234.50", 123450],
  ["$1234.5", 123450],
  ["$1,234.50", 123450],
  ["  $1,234.50  ", 123450],
  ["-200", -20000],
  [MINUS + "200", -20000],
  ["-$200", -20000],
  ["$-200", -20000],
  [MINUS + "$200.00", -20000],
  ["(200.00)", -20000],
  ["($1,200)", -120000],
  [".50", 50],
  ["0.5", 50],
  ["12.", 1200],
  ["007", 700],
  ["10,000,000", 1000000000],
  ["10000000.00", 1000000000],
  ["-10,000,000.00", -1000000000],
  ["1,000", 100000],
  ["999,999.99", 99999999],
  // These are the classic floating-point traps: 0.1 + 0.2, 1.005, 4.35 × 100.
  ["0.30", 30],
  ["1.00", 100],
  ["4.35", 435],
  ["1.15", 115],
  ["8.95", 895],
  ["19.99", 1999],
  ["1234567.89", 123456789],
];

for (const [text, cents] of GOOD) {
  test("parseDollars accepts " + JSON.stringify(text) + " → " + cents, () => {
    assert.deepStrictEqual(parseDollars(text), { ok: true, cents: cents });
  });
}

test("parseDollars never produces negative zero", () => {
  for (const text of ["-0", "-0.00", MINUS + "0", "(0.00)", "-$0"]) {
    const parsed = parseDollars(text);
    assert.equal(parsed.ok, true);
    assert.ok(Object.is(parsed.cents, 0), text + " gave negative zero");
  }
});

test("parseDollars agrees with whole-cent counting for every cent from $0.00 to $50.00", () => {
  // Build each string from digits, so floats never touch this test either.
  for (let cents = 0; cents <= 5000; cents++) {
    const dollars = (cents - (cents % 100)) / 100;
    const rest = cents % 100;
    const text = String(dollars) + "." + (rest < 10 ? "0" : "") + String(rest);
    assert.deepStrictEqual(parseDollars(text), { ok: true, cents: cents }, text);
  }
});

// ---------- parseDollars: things it must reject, in plain English ----------

const BAD = [
  "",
  "   ",
  "abc",
  "$",
  "-",
  ".",
  "-.",
  "12.345",
  "0.001",
  "1.2.3",
  "1,23",
  "12,34.00",
  "1,2345",
  ",123",
  "1234,50",
  "1 234",
  "12e3",
  "1e2",
  "0x10",
  "Infinity",
  "NaN",
  "--5",
  "-" + MINUS + "5",
  "$$5",
  "5$",
  "+5",
  "(5",
  "5)",
  "(-5)",
  "10,000,000.01",
  "10000001",
  "99999999999999999999",
  "-10,000,000.01",
  "١٢٣", // Arabic-Indic digits: not accepted, plain 0–9 only
  "12.5%",
  "<b>5</b>",
];

for (const text of BAD) {
  test("parseDollars rejects " + JSON.stringify(text), () => {
    const parsed = parseDollars(text);
    assert.equal(parsed.ok, false);
    assert.equal(typeof parsed.problem, "string");
    assert.ok(parsed.problem.length > 10, "the problem should be a real sentence");
    assert.equal("cents" in parsed, false);
  });
}

test("parseDollars rejects things that are not text at all", () => {
  for (const notText of [undefined, null, 12.34, 1234, true, {}, [], () => "5"]) {
    const parsed = parseDollars(notText);
    assert.equal(parsed.ok, false);
    assert.equal(typeof parsed.problem, "string");
  }
});

test("parseDollars explains each kind of problem differently", () => {
  assert.match(parseDollars("").problem, /type/i);
  assert.match(parseDollars("12.345").problem, /2 digits|cents/i);
  assert.match(parseDollars("10,000,000.01").problem, /10,000,000/);
  assert.match(parseDollars("1234,50").problem, /comma|period/i);
  assert.match(parseDollars("abc").problem, /digits/i);
});

test("parseDollars never echoes what was typed back in the problem text", () => {
  const parsed = parseDollars("<img src=x onerror=alert(1)>");
  assert.equal(parsed.ok, false);
  assert.equal(parsed.problem.includes("<"), false);
});

// ---------- formatCents ----------

const FORMATTED = [
  [0, "$0.00"],
  [5, "$0.05"],
  [50, "$0.50"],
  [100, "$1.00"],
  [123450, "$1,234.50"],
  [99999, "$999.99"],
  [100000, "$1,000.00"],
  [100000000, "$1,000,000.00"],
  [1000000000, "$10,000,000.00"],
  [123456789, "$1,234,567.89"],
  [-20000, MINUS + "$200.00"],
  [-1, MINUS + "$0.01"],
  [-123456, MINUS + "$1,234.56"],
];

for (const [cents, text] of FORMATTED) {
  test("formatCents(" + cents + ") → " + text, () => {
    assert.equal(formatCents(cents), text);
  });
}

test("formatCents shows negative zero as plain $0.00", () => {
  assert.equal(formatCents(-0), "$0.00");
});

test("formatCents refuses anything that is not a whole number of cents", () => {
  for (const bad of [12.5, NaN, Infinity, "100", null, undefined]) {
    assert.throws(() => formatCents(bad), TypeError);
  }
});

test("parseDollars(formatCents(x)) gives x back, for a spread of amounts", () => {
  const samples = [0, 1, 9, 10, 99, 100, 101, 999, 1000, 12345, 99999, 100000, 123456789, 1000000000];
  for (const cents of samples) {
    assert.deepStrictEqual(parseDollars(formatCents(cents)), { ok: true, cents: cents });
    if (cents !== 0) {
      assert.deepStrictEqual(parseDollars(formatCents(-cents)), { ok: true, cents: -cents });
    }
  }
});

// ---------- the two division helpers every money path goes through ----------

test("divideRoundDown drops the leftover", () => {
  assert.equal(divideRoundDown(0, 12), 0);
  assert.equal(divideRoundDown(11, 12), 0);
  assert.equal(divideRoundDown(12, 12), 1);
  assert.equal(divideRoundDown(1000000, 12), 83333); // TV15's cushion cap: $10,000.00 ÷ 12 → $833.33
  assert.equal(divideRoundDown(500000 * 2, 12), 83333);
  assert.equal(divideRoundDown(7, 1), 7);
});

test("divideRoundHalfUp rounds to the nearest cent, halves go up", () => {
  assert.equal(divideRoundHalfUp(0, 12), 0);
  assert.equal(divideRoundHalfUp(5, 12), 0);
  assert.equal(divideRoundHalfUp(6, 12), 1); // exactly half → up
  assert.equal(divideRoundHalfUp(7, 12), 1);
  assert.equal(divideRoundHalfUp(500000, 12), 41667); // TV15's base payment
  assert.equal(divideRoundHalfUp(47999, 12), 4000); // TV10b
  assert.equal(divideRoundHalfUp(110000, 12), 9167); // TV19
  assert.equal(divideRoundHalfUp(15000, 2), 7500); // TV12
  assert.equal(divideRoundHalfUp(15001, 2), 7501); // odd cent split in two → up
  assert.equal(divideRoundHalfUp(10, 3), 3);
  assert.equal(divideRoundHalfUp(11, 3), 4);
});

test("divideRoundHalfUp matches the vectors' written rule floor((D + 6) / 12) for every D up to $100", () => {
  for (let cents = 0; cents <= 10000; cents++) {
    assert.equal(divideRoundHalfUp(cents, 12), Math.floor((cents + 6) / 12));
  }
});

test("the division helpers always return whole numbers, even for huge amounts", () => {
  const huge = 100 * MAX_MONEY_CENTS; // 100 bills at the $10,000,000 limit
  for (const divisor of [1, 2, 7, 12, 13, 360]) {
    assert.ok(Number.isInteger(divideRoundDown(huge + 5, divisor)));
    assert.ok(Number.isInteger(divideRoundHalfUp(huge + 5, divisor)));
    // Check by multiplying back: the answer times the divisor is within one divisor of the input.
    const down = divideRoundDown(huge + 5, divisor);
    assert.ok(down * divisor <= huge + 5 && (down + 1) * divisor > huge + 5);
  }
});

test("the division helpers refuse negative amounts, fractions, and bad divisors", () => {
  assert.throws(() => divideRoundDown(-1, 12), RangeError);
  assert.throws(() => divideRoundHalfUp(-1, 12), RangeError);
  assert.throws(() => divideRoundDown(1.5, 12), RangeError);
  assert.throws(() => divideRoundDown(10, 0), RangeError);
  assert.throws(() => divideRoundDown(10, -2), RangeError);
  assert.throws(() => divideRoundHalfUp(10, 1.5), RangeError);
});

// ---------- months ----------

test("MONTH_NAMES has the 12 month names, January first", () => {
  assert.equal(MONTH_NAMES.length, 12);
  assert.equal(MONTH_NAMES[0], "January");
  assert.equal(MONTH_NAMES[11], "December");
});

test("escrowToCalendarMonth: Appendix E's year starts in July, so escrow month 6 is December", () => {
  assert.equal(escrowToCalendarMonth(1, 7), 7);
  assert.equal(escrowToCalendarMonth(6, 7), 12);
  assert.equal(escrowToCalendarMonth(7, 7), 1);
  assert.equal(escrowToCalendarMonth(12, 7), 6);
  assert.equal(escrowToCalendarMonth(11, 4), 2); // TV13
});

test("calendarToEscrowMonth is the reverse", () => {
  assert.equal(calendarToEscrowMonth(7, 7), 1);
  assert.equal(calendarToEscrowMonth(12, 7), 6);
  assert.equal(calendarToEscrowMonth(1, 7), 7);
  assert.equal(calendarToEscrowMonth(6, 7), 12);
  assert.equal(calendarToEscrowMonth(6, 4), 3); // build-contract example 3: June when the year starts in April
  assert.equal(calendarToEscrowMonth(10, 4), 7);
  assert.equal(calendarToEscrowMonth(3, 4), 12);
});

test("the two month helpers undo each other for all 144 combinations", () => {
  for (let startMonth = 1; startMonth <= 12; startMonth++) {
    const seen = new Set();
    for (let escrowMonth = 1; escrowMonth <= 12; escrowMonth++) {
      const calendarMonth = escrowToCalendarMonth(escrowMonth, startMonth);
      assert.ok(calendarMonth >= 1 && calendarMonth <= 12);
      assert.equal(calendarToEscrowMonth(calendarMonth, startMonth), escrowMonth);
      seen.add(calendarMonth);
    }
    assert.equal(seen.size, 12);
  }
});

test("the month helpers refuse months outside 1–12", () => {
  assert.throws(() => escrowToCalendarMonth(0, 1), RangeError);
  assert.throws(() => escrowToCalendarMonth(13, 1), RangeError);
  assert.throws(() => escrowToCalendarMonth(1, 0), RangeError);
  assert.throws(() => calendarToEscrowMonth(1.5, 1), RangeError);
  assert.throws(() => calendarToEscrowMonth("3", 1), RangeError);
});
