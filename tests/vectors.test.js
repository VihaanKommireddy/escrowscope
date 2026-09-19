// tests/vectors.test.js — the engine must reproduce EVERY research vector,
// cent for cent, with the research JSON untouched (SPEC C5 + D1).
// The count comes from the file (22 at first; the independent auditor may
// append more). Nothing here hard-codes it.
//
// This file checks the vectors TWO ways on purpose:
//   1. through runSelfCheck — the very same function the web page runs when a
//      visitor presses "Don't take our word for it", so the browser proof and
//      `npm test` are one check, not two;
//   2. directly with Node's own assert.deepStrictEqual — so a bug in
//      runSelfCheck's comparing code could not make a wrong engine look right.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { VECTORS } from "../engine/vectors.js";
import {
  runSelfCheck,
  accountFromVector,
  DOC_ONLY_EXPECTED_KEYS,
  analyze,
} from "../engine/index.js";

const jsonUrl = new URL("../docs/research/01-test-vectors.json", import.meta.url);
const research = JSON.parse(readFileSync(jsonUrl, "utf8"));

// ---------- 1. through runSelfCheck (what the page runs) ----------

const report = runSelfCheck(VECTORS);

const HOW_MANY = research.vectors.length;

test("runSelfCheck: every vector in the research file passes (" + HOW_MANY + " of " + HOW_MANY + ")", () => {
  assert.ok(HOW_MANY >= 22, "the original 22 vectors must all still be there");
  assert.equal(report.total, HOW_MANY);
  assert.equal(report.passed, HOW_MANY, describeFailures(report));
  assert.equal(report.failed, 0);
});

test("the original 22 vectors are all still present, by id", () => {
  const original = ["TV01", "TV02", "TV03", "TV04", "TV05", "TV06", "TV07", "TV08", "TV09", "TV10", "TV10b",
    "TV11", "TV12", "TV13", "TV14", "TV15", "TV16", "TV17", "TV18", "TV19", "TV20", "TV21"];
  const ids = research.vectors.map((vector) => vector.id);
  for (const id of original) assert.ok(ids.includes(id), id + " is missing");
});

for (const row of report.results) {
  test("runSelfCheck " + row.id + " — " + row.title, () => {
    assert.deepStrictEqual(row.mismatches, [], describeRow(row));
    assert.equal(row.ok, true);
  });
}

test("runSelfCheck gives the same verdict on the research JSON read straight from disk", () => {
  const fromDisk = runSelfCheck(research.vectors);
  assert.equal(fromDisk.total, HOW_MANY);
  assert.equal(fromDisk.passed, HOW_MANY, describeFailures(fromDisk));
});

// ---------- 2. directly, without runSelfCheck's comparing code ----------

for (const vector of research.vectors) {
  test("direct " + vector.id + ": every expected field, every table row", () => {
    const result = analyze(accountFromVector(vector));
    for (const key of Object.keys(vector.expected)) {
      if (DOC_ONLY_EXPECTED_KEYS.includes(key)) continue;
      assert.ok(key in result, vector.id + ": the engine's result has no `" + key + "`");
      assert.deepStrictEqual(result[key], vector.expected[key], vector.id + " → " + key);
    }
    assert.equal(result.table.length, 12);
  });
}

// ---------- 3. the tables printed in the official sources ----------
// TV02 carries the three tables printed in Appendix E itself. TV03 and TV04
// carry HUD's printed Step 3 column. 13 numbers each: the starting row, then
// months 1–12.

for (const vector of research.vectors) {
  if (!vector.publishedTables) continue;
  test("published tables " + vector.id + ": the engine reproduces the printed columns", () => {
    const result = analyze(accountFromVector(vector));
    const printed = vector.publishedTables;

    const step1 = [0];
    const step2 = [result.stepTwoAddCents];
    const step3 = [result.requiredStartingBalanceCents];
    for (const row of result.table) {
      step1.push(row.step1TrialBalanceCents);
      step2.push(row.step1TrialBalanceCents + result.stepTwoAddCents);
      step3.push(row.targetBalanceCents);
    }

    if (printed.step1) assert.deepStrictEqual(step1, printed.step1);
    if (printed.step2) assert.deepStrictEqual(step2, printed.step2);
    if (printed.step3) assert.deepStrictEqual(step3, printed.step3);
    assert.ok(printed.step1 || printed.step2 || printed.step3, "nothing printed to compare");
  });
}

// ---------- 4. the negative example: aggregate, never single-item ----------

test("TV02 needs $1,040 to start (aggregate), not the $1,130 the banned single-item method gives", () => {
  const tv02 = research.vectors.find((vector) => vector.id === "TV02");
  const result = analyze(accountFromVector(tv02));
  const reference = research.referenceOnly[0];
  assert.equal(result.requiredStartingBalanceCents, 104000);
  assert.notEqual(result.requiredStartingBalanceCents, reference.singleItemStartingBalanceCents);
});

// ---------- helpers for readable failure messages ----------

function describeRow(row) {
  const lines = [row.id + " mismatches:"];
  for (const mismatch of row.mismatches) {
    lines.push(
      "  " + mismatch.path + ": expected " + JSON.stringify(mismatch.expected) +
        ", engine produced " + JSON.stringify(mismatch.actual)
    );
  }
  return lines.join("\n");
}

function describeFailures(someReport) {
  const lines = [];
  for (const row of someReport.results) {
    if (!row.ok) lines.push(describeRow(row));
  }
  return lines.join("\n");
}
