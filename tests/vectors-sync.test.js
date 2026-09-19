// tests/vectors-sync.test.js — engine/vectors.js must be an exact copy of the
// research JSON (SPEC D1). If this fails: run `node tools/make-vectors.mjs`.
// Never "fix" it by editing either file by hand.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { VECTORS, VECTORS_META, REFERENCE_ONLY } from "../engine/vectors.js";

const jsonUrl = new URL("../docs/research/01-test-vectors.json", import.meta.url);
const research = JSON.parse(readFileSync(jsonUrl, "utf8"));

test("VECTORS is identical to the research JSON's vectors", () => {
  assert.deepStrictEqual(VECTORS, research.vectors);
});

test("VECTORS_META is identical to the research JSON's meta block", () => {
  assert.deepStrictEqual(VECTORS_META, research.meta);
});

test("REFERENCE_ONLY is identical to the research JSON's referenceOnly block", () => {
  assert.deepStrictEqual(REFERENCE_ONLY, research.referenceOnly);
});

test("same number of vectors as the research file (at least the original 22), each with a unique id", () => {
  assert.equal(VECTORS.length, research.vectors.length);
  assert.ok(VECTORS.length >= 22);
  const ids = VECTORS.map((vector) => vector.id);
  assert.equal(new Set(ids).size, VECTORS.length);
});

test("the generated file says it is generated", () => {
  const source = readFileSync(new URL("../engine/vectors.js", import.meta.url), "utf8");
  assert.ok(source.startsWith("// GENERATED — do not edit."));
});
