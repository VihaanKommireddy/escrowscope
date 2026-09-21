// tests/dates.test.js — refundDeadline (SPEC D8): analysis date + 30 days.
// The engine may not ask the computer what day it is, and it does its date
// math by hand. THIS file is allowed to use JavaScript's Date, so it uses it
// as an independent check on the hand-made calendar.

import { test } from "node:test";
import assert from "node:assert/strict";

import { refundDeadline } from "../engine/index.js";
import { dateInWords } from "../engine/dates.js";

test("the build contract's example: analysis on 2026-09-01 → refund due by October 1, 2026", () => {
  assert.deepStrictEqual(refundDeadline("2026-09-01"), {
    ok: true,
    isoDate: "2026-10-01",
    display: "October 1, 2026",
  });
});

test("crossing a year end", () => {
  assert.deepStrictEqual(refundDeadline("2026-12-15"), { ok: true, isoDate: "2027-01-14", display: "January 14, 2027" });
});

test("February: 28 days normally, 29 in a leap year", () => {
  assert.equal(refundDeadline("2027-02-01").isoDate, "2027-03-03");
  assert.equal(refundDeadline("2028-02-01").isoDate, "2028-03-02");
  assert.equal(refundDeadline("2026-01-31").isoDate, "2026-03-02");
  assert.equal(refundDeadline("2028-01-31").isoDate, "2028-03-01");
});

test("century rule: 2000 was a leap year, 1900 and 2100 are not", () => {
  assert.equal(refundDeadline("2000-02-28").isoDate, "2000-03-29");
  assert.equal(refundDeadline("1900-02-28").isoDate, "1900-03-30");
  assert.equal(refundDeadline("2100-02-28").isoDate, "2100-03-30");
  assert.equal(refundDeadline("2024-02-29").isoDate, "2024-03-30");
});

test("agrees with JavaScript's own calendar for every day from 2023 through 2032", () => {
  let checked = 0;
  for (let year = 2023; year <= 2032; year++) {
    for (let month = 1; month <= 12; month++) {
      const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
      for (let day = 1; day <= daysInMonth; day++) {
        const input = String(year) + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
        const expected = new Date(Date.UTC(year, month - 1, day + 30)).toISOString().slice(0, 10);
        assert.equal(refundDeadline(input).isoDate, expected, input);
        checked = checked + 1;
      }
    }
  }
  assert.equal(checked, 3653);
});

test("the display text uses the full month name and no leading zero", () => {
  assert.equal(refundDeadline("2026-05-10").display, "June 9, 2026");
  assert.equal(refundDeadline("2026-11-05").display, "December 5, 2026");
});

test("anything that is not a real YYYY-MM-DD date is refused in plain English", () => {
  const bad = [
    "", "   ", "2026-13-01", "2026-00-10", "2026-01-00", "2026-02-30", "2027-02-29", "2026-04-31",
    "09/01/2026", "2026-9-1", "2026-09-1", "20260901", "2026-09-01T00:00", "abcd-ef-gh", "2026_09_01",
    "1899-12-31", "3000-01-01", "-026-09-01", "2026-09-0١",
    null, undefined, 20260901, {}, [],
  ];
  for (const input of bad) {
    const answer = refundDeadline(input);
    assert.equal(answer.ok, false, String(input));
    assert.equal(typeof answer.problem, "string");
    assert.ok(answer.problem.length > 15);
    assert.equal("isoDate" in answer, false);
  }
});

test("refundDeadline is repeatable", () => {
  assert.deepStrictEqual(refundDeadline("2026-09-01"), refundDeadline("2026-09-01"));
});

// =====================================================================
// FIX ORDER 2, QA #6: dateInWords — the statement's date, for the letter.
// It is imported straight from engine/dates.js (only letter.js uses it, so it
// is not part of the page's front door, engine/index.js).
// =====================================================================

test("QA #6: dateInWords turns a real YYYY-MM-DD date into words, full month name, no leading zero", () => {
  assert.deepStrictEqual(dateInWords("2026-09-01"), { ok: true, display: "September 1, 2026" });
  assert.deepStrictEqual(dateInWords("2024-02-29"), { ok: true, display: "February 29, 2024" });
  assert.deepStrictEqual(dateInWords("2026-12-31"), { ok: true, display: "December 31, 2026" });
});

test("QA #6: dateInWords and refundDeadline read a date the same way: one is ok exactly when the other is", () => {
  const inputs = [
    "2026-09-01", "2026-02-28", "2028-02-29", "2026-02-30", "2027-02-29", "2026-13-01", "2026-9-1", "09/01/2026",
    "", "   ", "<b>x</b>", "x".repeat(5000), null, undefined, 42, {}, [],
  ];
  for (const input of inputs) {
    const words = dateInWords(input);
    assert.equal(words.ok, refundDeadline(input).ok, String(input).slice(0, 20));
    if (!words.ok) {
      assert.equal(typeof words.problem, "string");
      assert.equal("display" in words, false);
    }
  }
});

test("QA #6: dateInWords is repeatable", () => {
  assert.deepStrictEqual(dateInWords("2026-09-01"), dateInWords("2026-09-01"));
});
