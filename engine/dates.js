// engine/dates.js — the refund clock (SPEC D8).
//
// 12 CFR 1024.17(f)(2)(i): a surplus of $50 or more is refunded "within 30
// days from the date of the analysis". So: analysis date in, the date 30 days
// later out.
//
// The engine must be PURE: same input, same output, on any computer, on any
// day. So this file never asks the computer what today's date is, and it does
// not use JavaScript's Date object at all (Date drags in time zones, and a
// time zone can shift a date by a day). It is a tiny hand-made calendar:
// count forward 30 days, rolling over month ends and year ends.

import { MONTH_NAMES } from "./money.js";

const DAYS_TO_REFUND = 30;
const DIGITS = "0123456789";

const PROBLEM =
  "Type the analysis date as year-month-day, like 2026-09-01. It is printed on your escrow statement.";

// A year is a leap year if it divides by 4 — except century years, which must
// divide by 400. (2024 yes, 2100 no, 2000 yes.) `%` is "remainder after
// dividing", so `year % 4 === 0` means "divides evenly by 4".
function isLeapYear(year) {
  if (year % 400 === 0) return true;
  if (year % 100 === 0) return false;
  return year % 4 === 0;
}

function daysInMonth(year, month) {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  return 31;
}

function isAllDigits(text) {
  for (const character of text) {
    if (!DIGITS.includes(character)) return false;
  }
  return text.length > 0;
}

function twoDigits(number) {
  return number < 10 ? "0" + number : String(number);
}

// "2026-09-01" → { year: 2026, month: 9, day: 1 }, or null if it is not a
// real date written exactly that way.
function readIsoDate(text) {
  if (typeof text !== "string" || text.length !== 10) return null;
  if (text[4] !== "-" || text[7] !== "-") return null;

  const yearText = text.slice(0, 4);
  const monthText = text.slice(5, 7);
  const dayText = text.slice(8, 10);
  if (!isAllDigits(yearText) || !isAllDigits(monthText) || !isAllDigits(dayText)) return null;

  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (year < 1900 || year > 2999) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;

  return { year: year, month: month, day: day };
}

export function refundDeadline(analysisDate) {
  const start = readIsoDate(analysisDate);
  if (start === null) return { ok: false, problem: PROBLEM };

  let year = start.year;
  let month = start.month;
  let day = start.day + DAYS_TO_REFUND;

  // If we ran past the end of the month, move into the next month (and into
  // the next year after December). 30 days can cross at most two month ends.
  while (day > daysInMonth(year, month)) {
    day = day - daysInMonth(year, month);
    month = month + 1;
    if (month > 12) {
      month = 1;
      year = year + 1;
    }
  }

  return {
    ok: true,
    isoDate: year + "-" + twoDigits(month) + "-" + twoDigits(day),
    display: MONTH_NAMES[month - 1] + " " + day + ", " + year,
  };
}
