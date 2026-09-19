// engine/selfcheck.js — "Don't take our word for it" (SPEC D1).
//
// Runs every test vector through the real engine and compares EVERY expected
// number, string and table row. The web page calls this when a visitor presses
// the button, and `npm test` calls this very same function — so the proof in
// the browser and the test suite are one check, not two.
//
// Pure: no page, no clock, no network. It gets the vectors handed to it.

import { analyze } from "./analyze.js";

// Two keys inside the vectors' `expected` blocks are DOCUMENTATION, not engine
// output, so they are skipped — and the report says so out loud:
//   exactArithmeticReference (TV15) — what you would get with no rounding at all
//   whatGoesWrong (TV18)            — what a WRONG engine would print
// (tests/selfcheck.test.js still verifies both of them another way.)
export const DOC_ONLY_EXPECTED_KEYS = ["exactArithmeticReference", "whatGoesWrong"];

// In the research file, `startMonth` sits at the top of each vector and the
// rest of the account sits in `inputs`. The engine wants them side by side.
export function accountFromVector(vector) {
  return { startMonth: vector.startMonth, ...vector.inputs };
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Walk through `expected` and write down every place `actual` differs.
// Strict: 30000 and "30000" are different. A list must have the same length.
// Only keys that appear in `expected` are checked, so the engine may return
// extra helpful fields without failing.
function collectMismatches(expected, actual, path, mismatches) {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) {
      const actualLength = Array.isArray(actual) ? actual.length : undefined;
      mismatches.push({ path: path + ".length", expected: expected.length, actual: actualLength });
      return;
    }
    for (let index = 0; index < expected.length; index++) {
      collectMismatches(expected[index], actual[index], path + "[" + index + "]", mismatches);
    }
    return;
  }

  if (isPlainObject(expected)) {
    if (!isPlainObject(actual)) {
      mismatches.push({ path: path, expected: expected, actual: actual });
      return;
    }
    for (const key of Object.keys(expected)) {
      const deeperPath = path === "" ? key : path + "." + key;
      collectMismatches(expected[key], actual[key], deeperPath, mismatches);
    }
    return;
  }

  // Numbers, strings, true/false, null.
  if (expected !== actual) {
    mismatches.push({ path: path, expected: expected, actual: actual });
  }
}

// TV02 carries the three tables PRINTED in Appendix E of the regulation.
// TV03 and TV04 carry the Step 3 column HUD printed. Each column is 13
// numbers: the starting row, then months 1–12. Rebuild the same columns from
// the engine's result so they can be compared number for number.
function rebuildPrintedColumns(result) {
  const step1 = [0];
  const step2 = [result.stepTwoAddCents];
  const step3 = [result.requiredStartingBalanceCents];
  for (const row of result.table) {
    step1.push(row.step1TrialBalanceCents);
    step2.push(row.step1TrialBalanceCents + result.stepTwoAddCents);
    step3.push(row.targetBalanceCents);
  }
  return { step1: step1, step2: step2, step3: step3 };
}

function checkOneVector(vector) {
  const account = accountFromVector(vector);
  const mismatches = [];
  const skippedKeys = [];
  let actual = null;

  try {
    actual = analyze(account);
  } catch (error) {
    mismatches.push({ path: "(engine)", expected: "a result", actual: "the engine refused: " + error.message });
  }

  if (actual !== null) {
    for (const key of Object.keys(vector.expected)) {
      if (DOC_ONLY_EXPECTED_KEYS.includes(key)) {
        skippedKeys.push(key);
        continue;
      }
      collectMismatches(vector.expected[key], actual[key], key, mismatches);
    }

    if (isPlainObject(vector.publishedTables)) {
      const rebuilt = rebuildPrintedColumns(actual);
      for (const column of ["step1", "step2", "step3"]) {
        const printed = vector.publishedTables[column];
        if (Array.isArray(printed)) {
          collectMismatches(printed, rebuilt[column], "publishedTables." + column, mismatches);
        }
      }
    }
  }

  return {
    id: vector.id,
    title: vector.title,
    source: vector.source,
    ok: mismatches.length === 0,
    mismatches: mismatches,
    skippedKeys: skippedKeys,
    account: account,
    expected: vector.expected,
    actual: actual,
  };
}

export function runSelfCheck(vectors) {
  const results = [];
  let passed = 0;
  let failed = 0;
  const skippedSomewhere = [];

  for (const vector of vectors) {
    const row = checkOneVector(vector);
    results.push(row);
    if (row.ok) {
      passed = passed + 1;
    } else {
      failed = failed + 1;
    }
    for (const key of row.skippedKeys) {
      if (!skippedSomewhere.includes(key)) skippedSomewhere.push(key);
    }
  }

  // Report the skipped keys in the same order as DOC_ONLY_EXPECTED_KEYS.
  const skippedKeys = DOC_ONLY_EXPECTED_KEYS.filter((key) => skippedSomewhere.includes(key));

  return {
    total: vectors.length,
    passed: passed,
    failed: failed,
    skippedKeys: skippedKeys,
    results: results,
  };
}
