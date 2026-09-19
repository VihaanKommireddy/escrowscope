// tools/make-vectors.mjs — turns the research test vectors (JSON) into a
// JavaScript module the web page can import.
//
// Run it by hand from the project folder:   node tools/make-vectors.mjs
//
// WHY this exists: the page has a "Don't take our word for it" button that
// re-runs all 22 test cases in the visitor's browser (SPEC D1). The page's
// privacy rules forbid fetch(), so the page cannot download the JSON file.
// An ES module, on the other hand, loads with the rest of the page. So we copy
// the JSON into engine/vectors.js.
//
// The research JSON stays the source of truth. It is NEVER edited to make a
// test pass. tests/vectors-sync.test.js fails if engine/vectors.js and the
// JSON ever stop being identical, which means: change the JSON → re-run this.
//
// Zero dependencies: only Node's built-in file tools.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const toolsFolder = dirname(fileURLToPath(import.meta.url));
const projectFolder = join(toolsFolder, "..");
const sourcePath = join(projectFolder, "docs", "research", "01-test-vectors.json");
const outputPath = join(projectFolder, "engine", "vectors.js");

const research = JSON.parse(readFileSync(sourcePath, "utf8"));

// JSON text is also valid JavaScript, so we can paste it straight in.
function asJavaScript(value) {
  return JSON.stringify(value, null, 2);
}

const lines = [
  "// GENERATED — do not edit.",
  "// Source of truth: docs/research/01-test-vectors.json",
  "// To regenerate:   node tools/make-vectors.mjs",
  "// tests/vectors-sync.test.js fails if this file and the JSON ever differ.",
  "",
  "// How the vectors were made, the rounding choices, and the sources.",
  "export const VECTORS_META = " + asJavaScript(research.meta) + ";",
  "",
  "// The 22 worked cases the engine must reproduce, cent for cent.",
  "export const VECTORS = " + asJavaScript(research.vectors) + ";",
  "",
  "// Reference material that is NOT run through the engine (the old, now-banned",
  "// single-item method from Appendix E, kept as a negative example).",
  "export const REFERENCE_ONLY = " + asJavaScript(research.referenceOnly) + ";",
  "",
];

writeFileSync(outputPath, lines.join("\n"), "utf8");

console.log("Wrote engine/vectors.js");
console.log("  vectors:        " + research.vectors.length);
console.log("  reference only: " + research.referenceOnly.length);
