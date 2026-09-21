// tests/purity.test.js — reads the engine's SOURCE TEXT and fails if the
// engine could be impure (SPEC A1.5: no DOM, no clock, no globals, no network)
// or if money could pick up a fraction (SPEC A1.4).
//
// Comments and the insides of "strings" are blanked out first, so the word
// "document" in the phrase "mortgage documents" is not a false alarm, while
// `document.getElementById` in real code would be caught.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

import * as engine from "../engine/index.js";

const ENGINE_FOLDER = new URL("../engine/", import.meta.url);

// The exact file list pinned by docs/BUILD-CONTRACT.md section 2. The page's
// service worker precaches exactly these, so adding or removing an engine file
// has to be a deliberate, announced change.
const EXPECTED_FILES = [
  "analyze.js", "compare.js", "dates.js", "explain.js", "index.js", "letter.js",
  "money.js", "selfcheck.js", "validate.js", "vectors.js",
];

const EXPECTED_EXPORTS = [
  "parseDollars", "formatCents", "calendarToEscrowMonth", "escrowToCalendarMonth", "MONTH_NAMES",
  "validateAccount", "validateStatement", "MAX_BILL_LABEL_LENGTH", "MAX_SPREAD_MONTHS",
  "analyze", "projectWithPayment", "TOLERANCE_BALANCE_CENTS", "TOLERANCE_PAYMENT_CENTS",
  "compareWithStatement",
  "explainVerdict", "explainSteps", "explainJump", "nextSteps", "explainServicerLine",
  "buildLetter", "letterKind",
  "refundDeadline",
  "VECTORS", "VECTORS_META", "REFERENCE_ONLY",
  "runSelfCheck", "accountFromVector", "DOC_ONLY_EXPECTED_KEYS",
];

function readEngineFile(name) {
  return readFileSync(new URL(name, ENGINE_FOLDER), "utf8");
}

// Replace every comment and every string's contents with spaces, keeping line
// breaks so line numbers still line up. Handles // and /* */ comments,
// 'single', "double" and `template` strings (including ${ code } inside
// templates, which is kept as code).
function codeOnly(source) {
  let out = "";
  let index = 0;
  const templateDepths = []; // brace depth at which each open ${ ... } closes
  let braceDepth = 0;

  function blank(character) {
    return character === "\n" ? "\n" : " ";
  }

  function skipQuoted(quote) {
    out += quote;
    index += 1;
    while (index < source.length && source[index] !== quote) {
      if (source[index] === "\\") {
        out += "  ";
        index += 2;
        continue;
      }
      out += blank(source[index]);
      index += 1;
    }
    out += quote;
    index += 1;
  }

  function skipTemplate() {
    // We are just past a backtick, or just past the } that closed a ${ }.
    while (index < source.length) {
      if (source[index] === "\\") {
        out += "  ";
        index += 2;
      } else if (source[index] === "`") {
        out += "`";
        index += 1;
        return;
      } else if (source[index] === "$" && source[index + 1] === "{") {
        out += "${";
        index += 2;
        templateDepths.push(braceDepth);
        braceDepth += 1;
        return; // back to reading code until the matching }
      } else {
        out += blank(source[index]);
        index += 1;
      }
    }
  }

  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1];
    if (character === "/" && next === "/") {
      while (index < source.length && source[index] !== "\n") {
        out += " ";
        index += 1;
      }
    } else if (character === "/" && next === "*") {
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) {
        out += blank(source[index]);
        index += 1;
      }
      out += "  ";
      index += 2;
    } else if (character === '"' || character === "'") {
      skipQuoted(character);
    } else if (character === "`") {
      out += "`";
      index += 1;
      skipTemplate();
    } else if (character === "{") {
      braceDepth += 1;
      out += character;
      index += 1;
    } else if (character === "}") {
      braceDepth -= 1;
      out += character;
      index += 1;
      if (templateDepths.length > 0 && templateDepths[templateDepths.length - 1] === braceDepth) {
        templateDepths.pop();
        skipTemplate();
      }
    } else {
      out += character;
      index += 1;
    }
  }
  return out;
}

const FILES = readdirSync(ENGINE_FOLDER).filter((name) => !name.startsWith(".")).sort();
const CODE = new Map(FILES.map((name) => [name, codeOnly(readEngineFile(name))]));

// ---------- the scanner itself must be trustworthy ----------

test("the scanner blanks comments and strings but keeps real code", () => {
  const sample = [
    'const a = "window.fetch(1 / 2)"; // document.write',
    "const b = 'it\\'s localStorage'; /* Math.random() */",
    "const c = `x ${ total / 2 } Date.now()`;",
    "const d = a / b;",
  ].join("\n");
  const code = codeOnly(sample);
  assert.equal(code.split("\n").length, 4, "line count is kept");
  for (const hidden of ["window", "fetch", "document", "localStorage", "Math.random", "Date.now"]) {
    assert.equal(code.includes(hidden), false, hidden + " should have been blanked");
  }
  assert.ok(code.includes("total / 2"), "code inside ${ } is still code");
  assert.ok(code.includes("a / b"));
  assert.equal(code.split("/").length - 1, 2, "exactly the two real divisions survive");
});

// ---------- the file list and the public API ----------

test("engine/ holds exactly the files pinned in the build contract", () => {
  assert.deepStrictEqual(FILES, EXPECTED_FILES);
});

test("engine/index.js exports exactly the contract's names, and only re-exports", () => {
  assert.deepStrictEqual(Object.keys(engine).sort(), [...EXPECTED_EXPORTS].sort());
  const code = CODE.get("index.js");
  assert.equal(/\bfunction\b|=>|\bconst\b|\blet\b/.test(code), false, "index.js should contain no logic");
});

// ---------- purity ----------

const FORBIDDEN = [
  ["Date.now", /\bDate\s*\.\s*now\b/],
  ["new Date()", /\bnew\s+Date\b/],
  ["any use of Date", /\bDate\b/],
  ["Math.random", /\bMath\s*\.\s*random\b/],
  ["document", /\bdocument\b/],
  ["window", /\bwindow\b/],
  ["globalThis", /\bglobalThis\b/],
  ["self", /\bself\b/],
  ["navigator", /\bnavigator\b/],
  ["localStorage", /\blocalStorage\b/],
  ["sessionStorage", /\bsessionStorage\b/],
  ["indexedDB", /\bindexedDB\b/],
  ["fetch(", /\bfetch\s*\(/],
  ["XMLHttpRequest", /\bXMLHttpRequest\b/],
  ["WebSocket", /\bWebSocket\b/],
  ["sendBeacon", /\bsendBeacon\b/],
  ["innerHTML", /\binnerHTML\b/],
  ["outerHTML", /\bouterHTML\b/],
  ["insertAdjacentHTML", /\binsertAdjacentHTML\b/],
  ["eval(", /\beval\s*\(/],
  ["new Function", /\bnew\s+Function\b/],
  ["dynamic import(", /\bimport\s*\(/],
  ["require(", /\brequire\s*\(/],
  ["process.", /\bprocess\s*\./],
  ["console.", /\bconsole\s*\./],
  ["setTimeout / setInterval", /\bset(Timeout|Interval)\b/],
  ["parseFloat", /\bparseFloat\b/],
  ["parseInt", /\bparseInt\b/],
  ["toFixed", /\btoFixed\b/],
  ["toPrecision", /\btoPrecision\b/],
  ["toLocaleString", /\btoLocaleString\b/],
  ["Intl", /\bIntl\b/],
  ["Math.round", /\bMath\s*\.\s*round\b/],
  ["Math.floor", /\bMath\s*\.\s*floor\b/],
  ["Math.ceil", /\bMath\s*\.\s*ceil\b/],
  ["Math.trunc", /\bMath\s*\.\s*trunc\b/],
  ["class", /\bclass\b/],
];

for (const name of EXPECTED_FILES) {
  test("purity: engine/" + name + " uses nothing forbidden", () => {
    const code = CODE.get(name);
    for (const [label, pattern] of FORBIDDEN) {
      const match = pattern.exec(code);
      if (match !== null) {
        const line = code.slice(0, match.index).split("\n").length;
        assert.fail("engine/" + name + " line " + line + " uses " + label);
      }
    }
  });
}

test("purity: every import inside engine/ points at another engine file", () => {
  for (const name of EXPECTED_FILES) {
    const source = readEngineFile(name);
    const code = CODE.get(name);
    const lines = source.split("\n");
    const codeLines = code.split("\n");
    for (let index = 0; index < lines.length; index++) {
      // Only lines that are REAL code starting with import/export … from.
      const isImportLine = /^\s*(import|export)\b/.test(codeLines[index]) && /\bfrom\b|^\s*import\s*["']/.test(codeLines[index]);
      if (!isImportLine) continue;
      const specifier = /from\s+["']([^"']+)["']|^\s*import\s+["']([^"']+)["']/.exec(lines[index]);
      assert.ok(specifier, "could not read the import on line " + (index + 1) + " of " + name);
      const target = specifier[1] || specifier[2];
      assert.ok(target.startsWith("./"), name + " imports from outside engine/: " + target);
      assert.equal(target.includes(".."), false, name + " imports from outside engine/: " + target);
      assert.ok(EXPECTED_FILES.includes(target.slice(2)), name + " imports an unknown file: " + target);
    }
  }
});

// ---------- money never meets a fraction ----------

test("the division operator appears ONLY inside the two named helpers in money.js", () => {
  for (const name of EXPECTED_FILES) {
    let code = CODE.get(name);
    if (name === "money.js") {
      // Cut out the bodies of the two helpers, then nothing may be left.
      for (const helper of ["divideRoundDown", "divideRoundHalfUp"]) {
        const start = code.indexOf("export function " + helper + "(");
        assert.ok(start !== -1, "money.js must define " + helper);
        const end = code.indexOf("\n}\n", start);
        const body = code.slice(start, end);
        assert.equal(body.split("/").length - 1, 1, helper + " should contain exactly one division");
        assert.ok(body.includes("% divisor"), helper + " should take the leftover away first, so its division is exact");
        code = code.slice(0, start) + code.slice(end);
      }
    }
    const at = code.indexOf("/");
    if (at !== -1) {
      const line = code.slice(0, at).split("\n").length;
      assert.fail("engine/" + name + " line " + line + " divides without going through divideRoundDown / divideRoundHalfUp");
    }
  }
});

test("no decimal-point numbers and no exponent shortcuts in engine code (vectors.js is generated data and is exempt)", () => {
  for (const name of EXPECTED_FILES) {
    if (name === "vectors.js") continue;
    const code = CODE.get(name);
    const match = /\d\.\d|\d[eE][+-]?\d|\*\*/.exec(code);
    if (match !== null) {
      const line = code.slice(0, match.index).split("\n").length;
      assert.fail("engine/" + name + " line " + line + " has a non-whole number: " + match[0]);
    }
  }
});

// ---------- wording that must not come back (math audit, fix order 1) ----------
// These read the RAW source, comments included, because the orders cover both.

test("A10: no engine string or comment says 'Most payment jumps' (it is 'Many': an unsourced 'most' is a factual claim)", () => {
  for (const name of EXPECTED_FILES) {
    assert.equal(readEngineFile(name).includes("Most payment jumps"), false, "engine/" + name);
    assert.equal(readEngineFile(name).toLowerCase().includes("most payment jumps"), false, "engine/" + name);
  }
});

test("A6: nothing in engine/ states whole-dollar rounding as settled law ('lawfully round', 'may lawfully', 'could lawfully')", () => {
  for (const name of EXPECTED_FILES) {
    if (name === "vectors.js") continue; // generated research text, not ours to reword
    const match = /lawfully round|may lawfully|could lawfully/i.exec(readEngineFile(name));
    assert.equal(match, null, "engine/" + name + ": " + (match ? match[0] : ""));
  }
});

test("A15: the engine carries no housing-counselor phone number (only contact details printed on the linked official page)", () => {
  for (const name of EXPECTED_FILES) {
    if (name === "vectors.js") continue;
    const source = readEngineFile(name);
    // "888-995" and "4673", not a bare "995": the year 1995 (HUD's guidance, and its URL) is everywhere.
    for (const piece of ["HOPE", "888-995", "4673", "PHONE_COUNSELOR"]) {
      assert.equal(source.includes(piece), false, "engine/" + name + " contains " + piece);
    }
  }
});

// ---------- QA #13: one bill-name length limit, and no second one ----------
// Reads the engine's CODE (comments and string contents blanked, so a number
// inside a sentence is not a false alarm).
//
// WHAT THIS CAN MISS: a cap that never says "label" on its own line, for
// example `const name = bill.label;` on one line and `name.slice(0, 80)` on
// the next. It is a tripwire for the obvious way a second limit comes back,
// not a proof. The behavior tests in tests/validate.test.js (60 passes, 61
// fails) and tests/letter.test.js (a 60-character bill name is printed whole)
// are the real check.

// One file's code in → what it found. `definitions` are constants with LABEL
// in their name; `problems` are lines about a label that carry a number of 2
// or more digits (60, 100, 120, 200 …) or that cut the text short.
function scanForLabelLimits(name, code) {
  const definitions = [];
  const problems = [];
  const codeLines = code.split("\n");
  for (let index = 0; index < codeLines.length; index++) {
    const line = codeLines[index];
    if (!/label/i.test(line)) continue;
    const where = "engine/" + name + " line " + (index + 1) + ": " + line.trim();
    if (/\bconst\s+[A-Z_]*LABEL[A-Z_]*\s*=/.test(line)) {
      definitions.push(name + ": " + line.trim());
    } else if (/\d\d/.test(line)) {
      problems.push("a second label-length number? " + where);
    } else if (/\.(slice|substring|substr)\s*\(/.test(line)) {
      problems.push("a label is being cut short? " + where);
    }
  }
  return { definitions: definitions, problems: problems };
}

test("QA #13: the label-limit tripwire trips on the old code, and stays quiet on ordinary label code", () => {
  const oldStyle = codeOnly([
    "const MAX_LABEL_LENGTH = 100;",
    "if (row.label.length > 120) return;",
    "const shown = bill.label.slice(0, limit);",
    "const name = bill.label.trim() === \"\" ? \"Bill \" + (index + 1) : bill.label.trim(); // up to 100",
    "rows.push({ key: \"claimedAmount\", label: \"Over by 100 dollars\" });",
  ].join("\n"));
  const found = scanForLabelLimits("sample.js", oldStyle);
  assert.deepStrictEqual(found.definitions, ["sample.js: const MAX_LABEL_LENGTH = 100;"]);
  assert.equal(found.problems.length, 2);
  assert.match(found.problems[0], /line 2/);
  assert.match(found.problems[1], /line 3/);
});

test("QA #13: engine/ has ONE bill-label length limit: MAX_BILL_LABEL_LENGTH = 60 in validate.js, and no other label-length number", () => {
  let definitions = [];
  for (const name of EXPECTED_FILES) {
    if (name === "vectors.js") continue; // generated data
    const found = scanForLabelLimits(name, CODE.get(name));
    assert.deepStrictEqual(found.problems, []);
    definitions = definitions.concat(found.definitions);
  }
  assert.deepStrictEqual(definitions, ["validate.js: export const MAX_BILL_LABEL_LENGTH = 60;"]);

  // The letter's 200 is about a DIFFERENT thing (servicer name, loan number …)
  // and says so in its name.
  const letterCode = CODE.get("letter.js");
  assert.ok(letterCode.includes("const MAX_LETTER_DETAIL_LENGTH = 200;"));
  assert.equal(/\bMAX_DETAIL_LENGTH\b/.test(letterCode), false, "the old, vaguer name is gone");
  // The old private constant is gone too.
  assert.equal(/\bMAX_LABEL_LENGTH\b/.test(CODE.get("validate.js")), false);
});

test("the generated vectors file is data only: three exported constants and nothing else", () => {
  const code = CODE.get("vectors.js");
  assert.equal((code.match(/\bexport const\b/g) || []).length, 3);
  assert.equal(/\bfunction\b|=>|\bimport\b/.test(code), false);
});

test("the engine loads with no `document`, `window` or `fetch` defined, and the same input always gives the same output", () => {
  assert.equal(typeof globalThis.document, "undefined");
  assert.equal(typeof globalThis.window, "undefined");
  const first = JSON.stringify(engine.runSelfCheck(engine.VECTORS));
  const second = JSON.stringify(engine.runSelfCheck(engine.VECTORS));
  assert.equal(first, second);
});
