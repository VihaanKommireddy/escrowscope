// tests/explain.test.js — the words. Two jobs:
//   1. VOICE: run every research vector (counted from the file) and every
//      built-in example through every function that produces text, and scan
//      all of it for words the brand guide bans. Then read the engine's own
//      SOURCE for string literals and scan those too, so a sentence on a
//      rarely reached branch cannot hide.
//   2. RULES: the verdict tones (SPEC C4), the too-close-to-call softening
//      (SPEC E3), the six steps, the payment-jump split, and the next steps.
//
// THE "THIS PAGE" VOICE (QA audit #14, the director's ruling): no "we", "us"
// or "our" in anything a visitor can see. On a page whose promise is that
// nobody is told anything, "You told us" is the wrong phrase. It is "You
// ticked …" and "this page …". Code COMMENTS may keep "we"; only strings a
// visitor can see must change.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

import {
  analyze,
  compareWithStatement,
  explainVerdict,
  explainSteps,
  explainJump,
  nextSteps,
  explainServicerLine,
  buildLetter,
  projectWithPayment,
  letterKind,
  validateAccount,
  validateStatement,
  accountFromVector,
  formatCents,
  parseDollars,
  refundDeadline,
  VECTORS,
} from "../engine/index.js";
import { EXAMPLES } from "../examples.js";
import { TOO_CLOSE_SENTENCE } from "../engine/explain.js";

// ---------- building lots of realistic situations ----------

// For one account, several statements: none, one that agrees, and several that do not.
function statementsFor(result) {
  const pay = result.newMonthlyEscrowPayment;
  let kind = "none";
  let amount = 0;
  if (result.surplusCents > 0) { kind = "surplus"; amount = result.surplusCents; }
  if (result.shortageCents > 0) { kind = "shortage"; amount = result.shortageCents; }
  if (result.deficiencyCents > 0 && result.shortageCents === 0) { kind = "deficiency"; amount = result.deficiencyCents; }

  const agrees = {
    currentMonthlyEscrowCents: result.baseMonthlyPaymentCents - 2500,
    newMonthlyEscrowCents: pay.monthlyEscrowAfterDeficiencyRepaidCents,
    requiredMinimumBalanceCents: result.cushionCapCents,
    claimedKind: kind,
    claimedAmountCents: amount,
    shortageSpreadMonths: 12,
    lumpSumOfferedOnStatement: false,
  };
  const tooMuch = {
    currentMonthlyEscrowCents: result.baseMonthlyPaymentCents,
    newMonthlyEscrowCents: pay.monthlyEscrowWhileRepayingDeficiencyCents + 7500,
    requiredMinimumBalanceCents: result.cushionCapCents + 60000,
    claimedKind: "shortage",
    claimedAmountCents: result.shortageCents + 60000,
    shortageSpreadMonths: 6,
    lumpSumOfferedOnStatement: true,
  };
  const tooLittle = {
    currentMonthlyEscrowCents: result.baseMonthlyPaymentCents + 5000,
    newMonthlyEscrowCents: result.baseMonthlyPaymentCents > 3000 ? result.baseMonthlyPaymentCents - 3000 : 0,
    requiredMinimumBalanceCents: 0,
    claimedKind: "deficiency",
    claimedAmountCents: 12345,
    shortageSpreadMonths: 1,
  };
  const oddOnes = { claimedKind: "none", newMonthlyEscrowCents: result.baseMonthlyPaymentCents, lumpSumOfferedOnStatement: true };

  // Statements aimed at sentences the six above do not reach (fix order 2).
  // Each one fills in ONE thing, so the branch for that thing is what speaks.
  const base = result.baseMonthlyPaymentCents;
  const most = pay.monthlyEscrowWhileRepayingDeficiencyCents;
  const lowPointTypedAsMinimum = { requiredMinimumBalanceCents: result.lowPoint.projectedBalanceCents > 0 ? result.lowPoint.projectedBalanceCents : 0 };
  const basePaymentOnly = { newMonthlyEscrowCents: base };
  const halfwayToTheMost = { currentMonthlyEscrowCents: base, newMonthlyEscrowCents: base + Math.floor((most - base) / 2) };
  const aHairOverTheMost = { currentMonthlyEscrowCents: base, newMonthlyEscrowCents: most + 50 };
  const kindsWithNoAmount = ["surplus", "shortage", "deficiency", "none"].map((claimedKind) => ({ claimedKind: claimedKind }));
  const amountWithNoKind = { claimedAmountCents: 30000 };
  const spreadOnly = [1, 6, 11, 24].map((months) => ({ shortageSpreadMonths: months }));
  const lumpSumOnly = { lumpSumOfferedOnStatement: true };

  return [undefined, {}, agrees, tooMuch, tooLittle, oddOnes]
    .concat([lowPointTypedAsMinimum, basePaymentOnly, halfwayToTheMost, aHairOverTheMost, amountWithNoKind, lumpSumOnly])
    .concat(kindsWithNoAmount)
    .concat(spreadOnly);
}

// Accounts the vectors and examples do not include: no cushion at all, a
// 1-month cushion, a payment more than 30 days late, a balance below $0.
function extraAccounts() {
  const bills = [
    { label: "Property tax", month: 5, amountCents: 180000 },
    { label: "Homeowners insurance", month: 7, amountCents: 120000 },
    { label: "Property tax", month: 11, amountCents: 180000 },
  ];
  const extras = [];
  for (const cushionMonths of [0, 1, 2]) {
    for (const borrowerCurrent of [true, false]) {
      // −$398.00 is a deficiency within $7.00 of one month's escrow payment
      // ($400.00): the too-close-to-call wording for a deficiency, which no
      // research vector reaches.
      for (const startingBalanceCents of [-50000, -39800, 20000, 150000]) {
        extras.push({
          name: "extra: cushion " + cushionMonths + ", current " + borrowerCurrent + ", start " + startingBalanceCents,
          account: { startMonth: 1, startingBalanceCents: startingBalanceCents, cushionMonths: cushionMonths, borrowerCurrent: borrowerCurrent, disbursements: bills },
        });
      }
    }
  }
  return extras;
}

const EXTRA_ACCOUNTS = extraAccounts();

function allSituations() {
  const situations = [];
  for (const vector of VECTORS) {
    const account = accountFromVector(vector);
    const result = analyze(account);
    for (const statement of statementsFor(result)) {
      situations.push({ name: vector.id, account: account, result: result, statement: statement });
    }
  }
  for (const example of EXAMPLES) {
    situations.push({ name: example.id, account: example.account, result: analyze(example.account), statement: example.statement });
  }
  for (const extra of EXTRA_ACCOUNTS) {
    const result = analyze(extra.account);
    for (const statement of statementsFor(result)) {
      situations.push({ name: extra.name, account: extra.account, result: result, statement: statement });
    }
  }
  return situations;
}

function collectStrings(value, found) {
  if (typeof value === "string") found.push(value);
  else if (Array.isArray(value)) for (const item of value) collectStrings(item, found);
  else if (value !== null && typeof value === "object") for (const key of Object.keys(value)) collectStrings(value[key], found);
  return found;
}

// Everything the engine can say about one situation.
function everyWordFor(situation) {
  const { account, result, statement } = situation;
  const comparison = compareWithStatement(result, statement);
  const produced = [
    comparison,
    explainVerdict(result, comparison),
    explainSteps(result),
    explainJump(result, statement),
    nextSteps(result, comparison),
    explainServicerLine(result, account, statement),
    buildLetter(result, comparison, {}),
    buildLetter(result, comparison, { servicerName: "Example Servicing", loanNumber: "0001234567", borrowerName: "Pat Homeowner", propertyAddress: "1 Main St, Cary, NC", date: "September 19, 2026", analysisDate: "2026-09-01" }),
    validateAccount(account),
    validateStatement(statement, account),
    // Pinned by the research vectors, so never reworded; scanned all the same.
    result.servicerOptions,
    result.cite,
  ];
  return collectStrings(produced, []);
}

// Words that do not depend on a situation: what the engine says about input it
// cannot use, the refund clock, and the examples' own titles and blurbs.
function everyWordNotTiedToASituation() {
  const goodBill = { label: "Property tax", month: 5, amountCents: 180000 };
  const tooManyBills = [];
  for (let count = 0; count < 101; count++) tooManyBills.push(goodBill);

  const brokenAccounts = [
    undefined, null, "account", [], {},
    { startMonth: 13, startingBalanceCents: 1.5, cushionMonths: 3, borrowerCurrent: "yes", disbursements: [] },
    { startMonth: 1, startingBalanceCents: 99999999999, disbursements: tooManyBills },
    { startMonth: 1, startingBalanceCents: 0, disbursements: "bills" },
    { startMonth: 1, startingBalanceCents: 0, priorYear: "last year", disbursements: [
      {}, null, { month: 0, amountCents: "12" }, { month: 5, amountCents: 0 }, { month: 5, amountCents: -5 },
      { month: 5, amountCents: 99999999999 }, { month: 5, amountCents: 100, label: 42 }, { month: 5, amountCents: 100, label: "x".repeat(61) },
    ] },
    { startMonth: 1, startingBalanceCents: 0, priorYear: { annualDisbursementsCents: -1 }, disbursements: [goodBill] },
    // Usable numbers that draw every "are you sure?" nudge.
    { startMonth: 1, startingBalanceCents: -5000, disbursements: [{ label: "Flood insurance", month: 3, amountCents: 9000 }] },
    { startMonth: 1, startingBalanceCents: 0, disbursements: [{ month: 3, amountCents: 900000000 }, { month: 4, amountCents: 900000000 }] },
  ];
  const goodAccount = { startMonth: 1, startingBalanceCents: 150000, disbursements: [goodBill, { label: "Homeowners insurance", month: 7, amountCents: 120000 }] };
  const brokenStatements = [
    "statement", [], 42,
    { currentMonthlyEscrowCents: "1", newMonthlyEscrowCents: -5, requiredMinimumBalanceCents: 99999999999, claimedAmountCents: 1.5 },
    { claimedKind: "refund", shortageSpreadMonths: 0, lumpSumOfferedOnStatement: "yes" },
    { claimedAmountCents: 30000 },
    { claimedKind: "shortage" },
    { currentMonthlyEscrowCents: 200000, newMonthlyEscrowCents: 250000 },
  ];

  const produced = [];
  for (const account of brokenAccounts) produced.push(validateAccount(account));
  for (const statement of brokenStatements) {
    produced.push(validateStatement(statement, goodAccount));
    produced.push(validateStatement(statement, undefined));
  }
  for (const typed of [undefined, "", "   ", "abc", "12.345", "1,23", "1.234,56", "(5", "1.2.3", "99999999999", "$"]) {
    const answer = parseDollars(typed);
    assert.equal(answer.ok, false, "expected a problem for: " + typed);
    produced.push(answer);
  }
  produced.push(refundDeadline("2026-09-01"));
  produced.push(refundDeadline("not a date"));
  for (const example of EXAMPLES) produced.push([example.title, example.blurb]);
  return collectStrings(produced, []);
}

const SITUATIONS = allSituations();

// Every string the runtime scan can reach, each with a note of where it came from.
function allTexts() {
  const texts = [];
  for (const situation of SITUATIONS) {
    for (const text of everyWordFor(situation)) texts.push({ where: situation.name, text: text });
  }
  for (const text of everyWordNotTiedToASituation()) texts.push({ where: "no situation", text: text });
  return texts;
}

const ALL_TEXTS = allTexts();

test("the scan covers every vector in the file, all three examples, and the extra accounts", () => {
  const names = new Set(SITUATIONS.map((situation) => situation.name));
  assert.ok(VECTORS.length >= 30);
  assert.equal(names.size, VECTORS.length + 3 + EXTRA_ACCOUNTS.length);
});

test("the scan reaches both kinds of letter, every flag kind, the mix-up nudge, and every verdict tone", () => {
  const letterKinds = new Set();
  const flagKinds = new Set();
  const nudgeKinds = new Set();
  const tones = new Set();
  const rowStatuses = new Set();
  for (const situation of SITUATIONS) {
    const comparison = compareWithStatement(situation.result, situation.statement);
    letterKinds.add(letterKind(situation.result, comparison));
    tones.add(explainVerdict(situation.result, comparison).tone);
    for (const flag of comparison.flags) flagKinds.add(flag.kind);
    for (const nudge of comparison.nudges) nudgeKinds.add(nudge.kind);
    for (const row of comparison.rows) rowStatuses.add(row.status);
  }
  assert.deepStrictEqual([...letterKinds].sort(), ["NOTICE_OF_ERROR", "REQUEST_FOR_INFORMATION"]);
  assert.deepStrictEqual([...flagKinds].sort(), ["AMOUNT_DIFFERS", "CUSHION_OVER_CAP", "KIND_DIFFERS", "LUMP_SUM_OFFERED", "PAYMENT_ABOVE_MAX", "SPREAD_TOO_SHORT"]);
  assert.deepStrictEqual([...nudgeKinds], ["MINIMUM_LOOKS_LIKE_LOW_POINT"]);
  assert.deepStrictEqual([...tones].sort(), ["clear", "flag", "info"]);
  assert.deepStrictEqual([...rowStatuses].sort(), ["differs", "match", "not-compared", "over-limit"]);
});

// ---------- 1. voice ----------

// Word-start matches, so "issue" does not trip "sue" and "problem" does not trip "rob".
const BANNED = [
  /\bscam/i, /\bfraud/i, /\bsteal/i, /\bstole/i, /\btheft/i, /\brobb/i, /\bcrook/i, /\bscandal/i, /\bcheat/i,
  /\bguarantee/i, /\billegal/i, /\bunlawful/i, /\bviolat/i, /\bovercharg/i, /\brip.?off/i,
  /\bsue\b/i, /\blawsuit/i, /\battorney/i, /\btrust us\b/i, /\ball servicers\b/i, /\bmost servicers\b/i,
  /\byou should\b/i, /\byou must\b/i, /\byou will get\b/i, /\byou'll get\b/i, /\bwill be refunded\b/i, /\bowed to you\b/i,
  /\bALERT\b/, /!!/,
];

test("no banned word appears in anything the engine can say", () => {
  for (const { where, text } of ALL_TEXTS) {
    for (const pattern of BANNED) {
      assert.equal(pattern.test(text), false, where + ": " + pattern + " in: " + text);
    }
  }
  assert.ok(ALL_TEXTS.length > 5000, "scanned only " + ALL_TEXTS.length + " strings");
});

// ---------- 1b. the "this page" voice, and one name for one thing (QA #14) ----------

// WHOLE WORDS ONLY, in any mix of capitals. "us" is banned; "status", "bonus"
// and "house" are not, and neither is "U.S." (the periods split it into "u"
// and "s"). A bare "US" with no periods WOULD trip it: write "U.S.".
const VOICE_BANNED = [
  // the director's list
  "we", "us", "our", "ours", "we'll", "we've", "let's", "told us", "tell us",
  "lawful payment", "escrow year", "computation year", "12-month period", "refund due", "Most payment jumps",
  // the same family, added so a contraction cannot slip past a whole-word match
  "we're", "we'd",
  // one name for one thing: "escrow payment" is the name. ("the regular escrow
  // payment" where it has to be told apart from a shortage or deficiency add-on.)
  "monthly escrow deposit", "escrow deposit", "base payment", "paid in", "monthly payment",
];

// "You told us — that's it." → ["you", "told", "us", "that's", "it"].
// A word is a run of letters, digits and apostrophes. Everything else (spaces,
// periods, hyphens, quote marks) splits words. Curly apostrophes count as
// straight ones, and an apostrophe at the very start or end of a word is a
// quote mark, so it is dropped.
function wordsOf(text) {
  const words = [];
  for (const piece of text.toLowerCase().replaceAll("’", "'").split(/[^a-z0-9']+/)) {
    let word = piece;
    while (word.startsWith("'")) word = word.slice(1);
    while (word.endsWith("'")) word = word.slice(0, word.length - 1);
    if (word !== "") words.push(word);
  }
  return words;
}

// Which banned entries appear in this text, as whole words in a row?
function voiceHits(text) {
  const spaced = " " + wordsOf(text).join(" ") + " ";
  return VOICE_BANNED.filter((banned) => spaced.includes(" " + wordsOf(banned).join(" ") + " "));
}

test("QA #14: the voice check matches WHOLE words only — status, bonus, trust, focus, house, four, hours, sour and U.S. are fine", () => {
  const innocent = [
    "The status of your bonus is a matter of trust.", "Focus on the house for four hours.", "A sour note.",
    "U.S. law", "the U.S. Department of Housing", "U. S. mail", "STATUS", "Housing counselors", "ourselves is one word", "owe", "use", "plus",
    "yours", "hours", "tour", "flour", "course", "welcome", "well", "weigh", "wed", "were", "lets go",
    "the 12 months", "a 12-month table", "refund is due", "refunds due dates", "the escrow payment", "equal monthly payments", "monthly escrow payment",
  ];
  for (const text of innocent) assert.deepStrictEqual(voiceHits(text), [], text);
});

test("QA #14: the voice check does trip on every banned entry: any capitals, either apostrophe, next to punctuation", () => {
  for (const banned of VOICE_BANNED) {
    const samples = [banned, banned.toUpperCase(), "Well, " + banned + ".", "(" + banned + ")", "\"" + banned + "\" it said", banned.replaceAll("'", "’") + "!"];
    for (const sample of samples) assert.ok(voiceHits(sample).includes(banned), banned + " was missed in: " + sample);
  }
  assert.deepStrictEqual(voiceHits("You told us."), ["us", "told us"]);
  assert.deepStrictEqual(voiceHits("By our math, we round."), ["we", "our"]);
  assert.deepStrictEqual(voiceHits("the escrow-year table"), ["escrow year"], "a hyphen joins nothing: the two words still sit in a row");
});

test("QA #14 (runtime): nothing the engine can say uses we / us / our, or a second name for the escrow payment or the next 12 months", () => {
  for (const { where, text } of ALL_TEXTS) {
    assert.deepStrictEqual(voiceHits(text), [], where + ": " + text);
  }
});

// ---------- 1c. the same check on the engine's SOURCE ----------
// The runtime scan only sees sentences some situation reaches. This reads the
// engine's .js files, pulls out the string literals, and checks those, so a
// sentence on a rarely reached branch cannot hide.
//
// The reader is simple on purpose. For each line of a file:
//   • skip the line if it is a comment line (it starts with //, /* or *);
//   • walk along it: a ", ' or ` opens a string and the same mark closes it;
//     a backslash keeps the character after it (so \" does not close it);
//   • stop at a // that is outside a string: the rest is a trailing comment.
//
// WHAT IT CAN MISS
//   • A sentence split across two literals, like "you told " + "us": each
//     piece is checked alone, so a banned PHRASE could hide across the join.
//     A banned single WORD cannot (unless it were split mid-word).
//   • A string that runs over more than one line (a multi-line `template`).
//     The engine has none; a test below keeps it that way.
//   • Words that are not literals at all: a month name picked from a list, a
//     dollar amount from formatCents. The runtime scan above covers those.
//   • A /* block comment */ whose middle lines do not start with "*" would be
//     read as code. The engine writes // comments only.
// engine/vectors.js is skipped: it is generated from the research file, which
// quotes the regulation and is never reworded.

const ENGINE_FOLDER = new URL("../engine/", import.meta.url);

function stringLiteralsOnLine(line) {
  const literals = [];
  let index = 0;
  while (index < line.length) {
    const character = line[index];
    if (character === "/" && line[index + 1] === "/") break; // trailing comment
    const opensAString = character === '"' || character === "'" || character === "`";
    if (!opensAString) {
      index = index + 1;
      continue;
    }
    let text = "";
    index = index + 1;
    while (index < line.length && line[index] !== character) {
      if (line[index] === "\\") index = index + 1; // keep whatever follows the backslash
      text = text + line[index];
      index = index + 1;
    }
    literals.push(text);
    index = index + 1; // step past the closing mark
  }
  return literals;
}

function isCommentLine(line) {
  const trimmed = line.trim();
  return trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*");
}

// Every string literal in the engine's own code: [{ where, text }].
function engineStringLiterals() {
  const found = [];
  const names = readdirSync(ENGINE_FOLDER).filter((name) => name.endsWith(".js") && name !== "vectors.js").sort();
  for (const name of names) {
    const lines = readFileSync(new URL(name, ENGINE_FOLDER), "utf8").split("\n");
    for (let index = 0; index < lines.length; index++) {
      if (isCommentLine(lines[index])) continue;
      for (const text of stringLiteralsOnLine(lines[index])) {
        found.push({ where: "engine/" + name + " line " + (index + 1), text: text });
      }
    }
  }
  return found;
}

const ENGINE_LITERALS = engineStringLiterals();

test("the string-literal reader: reads all three quote marks, keeps \\\" inside a string, and ignores comments", () => {
  assert.deepStrictEqual(stringLiteralsOnLine('const a = "You told us"; // "we" in a comment'), ["You told us"]);
  assert.deepStrictEqual(stringLiteralsOnLine("push('one', \"two\", `three`);"), ["one", "two", "three"]);
  assert.deepStrictEqual(stringLiteralsOnLine('body: "You can ask: \\"What is my balance?\\" " + CAVEAT,'), ['You can ask: "What is my balance?" ']);
  assert.deepStrictEqual(stringLiteralsOnLine('const URL_X = "https://www.ecfr.gov/current"; // official'), ["https://www.ecfr.gov/current"]);
  assert.equal(isCommentLine("  // we never promise a refund"), true);
  assert.equal(isCommentLine("   * we"), true);
  assert.equal(isCommentLine('  const a = "we";'), false);
});

test("the string-literal reader sees every engine string whole: no multi-line template strings in engine code", () => {
  const names = readdirSync(ENGINE_FOLDER).filter((name) => name.endsWith(".js") && name !== "vectors.js");
  for (const name of names) {
    const lines = readFileSync(new URL(name, ENGINE_FOLDER), "utf8").split("\n");
    for (let index = 0; index < lines.length; index++) {
      if (isCommentLine(lines[index])) continue;
      const beforeAnyComment = lines[index].split("//")[0];
      assert.equal(beforeAnyComment.includes("`"), false, "engine/" + name + " line " + (index + 1) + " uses a template string");
    }
  }
  // It found the sentences we know are there, so it is really reading the files.
  const all = ENGINE_LITERALS.map((literal) => literal.text);
  assert.ok(all.length > 300, "found only " + all.length + " literals");
  assert.ok(all.includes("Many payment jumps are lawful. They come from real tax and insurance increases."));
  assert.ok(all.includes("This letter states arithmetic, not legal conclusions. I am not a lawyer. You may have newer bill amounts than I do, and if so I would like to see them."));
});

test("QA #14 (source): no string literal in engine/ uses we / us / our, or a second name for the escrow payment or the next 12 months", () => {
  for (const { where, text } of ENGINE_LITERALS) {
    assert.deepStrictEqual(voiceHits(text), [], where + ": " + text);
  }
});

test("QA #14 (source): the older banned-word list holds for every string literal too, reached or not", () => {
  for (const { where, text } of ENGINE_LITERALS) {
    for (const pattern of BANNED) assert.equal(pattern.test(text), false, where + ": " + pattern + " in: " + text);
  }
});

test("QA #14: the new wording, sentence by sentence", () => {
  const all = ALL_TEXTS.map((entry) => entry.text).join("\n");
  for (const expected of [
    "You ticked that a payment was more than 30 days late",
    "You ticked that the statement offers a pay-it-all-at-once option.",
    "By this page's math, to the cent, there is a surplus of",
    "This page's figure is within $7.00 of that line.",
    "This page's deficiency figure is within",
    "This page's shortage figure is within",
    "This page's figure, to the cent, is",
    "This page rounds this one down, because it is a cap.",
    "this page rounds to the nearest cent. That rounding is this page's choice.",
    "but you chose 1 month as the limit in your mortgage documents, and the lower limit wins.",
    "but you chose no cushion as the limit in your mortgage documents, and the lower limit wins.",
    "1 month of escrow payments, the limit you chose as the one your mortgage documents set.",
    "no cushion at all, the limit you chose as the one your mortgage documents set.",
    "so this page cannot check the part above",
    "Choose yes or no: are you more than 30 days behind on a payment?",
    "Choose yes or no: does the statement offer a pay-it-all-at-once option?",
    "That comparison was skipped.",
    "Add it and this page can compare the dollars too.",
    "Either way, the regular escrow payment follows the bills.",
    "Many payment jumps are lawful. They come from real tax and insurance increases.", // an earlier ruling: this sentence stays exactly as it is
  ]) {
    assert.ok(all.includes(expected), "nothing the engine said included: " + expected);
  }
});

test("'legal advice' and 'financial advice' appear only in the negative", () => {
  let seen = 0;
  for (const situation of SITUATIONS) {
    for (const text of everyWordFor(situation)) {
      const lower = text.toLowerCase();
      for (const phrase of ["legal advice", "financial advice"]) {
        let from = lower.indexOf(phrase);
        while (from !== -1) {
          seen = seen + 1;
          assert.equal(lower.slice(from - 4, from), "not ", situation.name + ": '" + phrase + "' without 'not': " + text);
          from = lower.indexOf(phrase, from + 1);
        }
      }
    }
  }
  assert.ok(seen > 0, "the next steps should say 'math, not legal advice' somewhere");
});

test("no leftover programmer text: undefined, NaN, null, [object", () => {
  for (const situation of SITUATIONS) {
    for (const text of everyWordFor(situation)) {
      for (const leak of ["undefined", "NaN", "[object", "null", "Infinity", "-$", "$-"]) {
        assert.equal(text.includes(leak), false, situation.name + ": '" + leak + "' in: " + text);
      }
    }
  }
});

test("reading level: no sentence in a verdict, step, jump or next step runs past 40 words", () => {
  for (const situation of SITUATIONS) {
    const { account, result, statement } = situation;
    const comparison = compareWithStatement(result, statement);
    const texts = collectStrings([
      explainVerdict(result, comparison), explainSteps(result), explainJump(result, statement),
      nextSteps(result, comparison), explainServicerLine(result, account, statement),
    ], []);
    for (const text of texts) {
      for (const sentence of text.split(/(?<=[.?!])\s+/)) {
        const words = sentence.split(/\s+/).filter((word) => word.length > 0);
        assert.ok(words.length <= 40, situation.name + ": " + words.length + " words: " + sentence);
      }
    }
  }
});

// ---------- 2. explainVerdict (SPEC C4) ----------

function exampleById(id) {
  return EXAMPLES.find((example) => example.id === id);
}

function verdictFor(account, statement) {
  const result = analyze(account);
  const comparison = compareWithStatement(result, statement);
  return explainVerdict(result, comparison);
}

function vectorAccount(id) {
  return accountFromVector(VECTORS.find((vector) => vector.id === id));
}

test("verdict shape: tone, icon, label, headline, body, tooCloseToCall", () => {
  const verdict = verdictFor(exampleById("jumped-ok").account, exampleById("jumped-ok").statement);
  assert.deepStrictEqual(Object.keys(verdict), ["tone", "icon", "label", "headline", "body", "tooCloseToCall"]);
  for (const key of ["tone", "icon", "label", "headline", "body"]) assert.equal(typeof verdict[key], "string");
  assert.equal(typeof verdict.tooCloseToCall, "boolean");
});

test("statement agrees → green 'clear': matches the federal method, then the shortage sentence with its dollars", () => {
  const example = exampleById("jumped-ok");
  const verdict = verdictFor(example.account, example.statement);
  assert.equal(verdict.tone, "clear");
  assert.equal(verdict.label, "Matches");
  assert.equal(verdict.headline, "Your statement's math matches the federal method.");
  assert.ok(verdict.body.includes("$300.00"));
  assert.ok(verdict.body.includes("$25.00 a month"));
  assert.match(verdict.body, /That is allowed\./);
  assert.match(verdict.body, /Many payment jumps are lawful/);
});

test("any flag → amber 'flag': each gap in dollars, plus the standing caveat", () => {
  const example = exampleById("cushion-too-big");
  const verdict = verdictFor(example.account, example.statement);
  assert.equal(verdict.tone, "flag");
  assert.equal(verdict.label, "Look here");
  assert.equal(verdict.headline, "3 things on your statement are worth a closer look.");
  assert.ok(verdict.body.includes("The cushion is $600.00 over the most the rule allows."));
  assert.ok(verdict.body.includes("$50.00 a month above"));
  assert.match(verdict.body, /A mismatch is not proof of a mistake/);
  assert.match(verdict.body, /newer bill amounts/);
});

test("nothing to compare → teal 'info': the classification, plus a nudge to add the statement's numbers", () => {
  const verdict = verdictFor(exampleById("jumped-ok").account, {});
  assert.equal(verdict.tone, "info");
  assert.equal(verdict.headline, "The federal math finds a shortage of $300.00.");
  assert.match(verdict.body, /Add the numbers from your statement/);
});

test("SURPLUS_REFUND_REQUIRED always surfaces the 30-day rule in amber, even when the statement agrees (TV01)", () => {
  const example = exampleById("holding-too-much");
  for (const statement of [example.statement, {}, undefined]) {
    const verdict = verdictFor(example.account, statement);
    assert.equal(verdict.tone, "flag");
    assert.equal(verdict.tooCloseToCall, false);
    assert.match(verdict.headline + " " + verdict.body, /within 30 days/);
    assert.ok((verdict.headline + verdict.body).includes("$300.00"));
  }
});

test("a refund is described as what the RULE says, never promised", () => {
  const verdict = verdictFor(exampleById("holding-too-much").account, {});
  assert.match(verdict.body, /The rule says/);
  assert.match(verdict.body, /as long as payments are current/);
});

// ---------- SPEC E3: soften if and only if result.nearLine is set ----------

test("E3: TV26, TV27, TV28 (inside the band) get the softened wording and NO refund-required treatment", () => {
  for (const id of ["TV26", "TV27", "TV28", "TV06", "TV07", "TV10", "TV10b"]) {
    const account = vectorAccount(id);
    const result = analyze(account);
    assert.notEqual(result.nearLine, null, id);
    for (const statement of [undefined, statementsFor(result)[2]]) {
      const comparison = compareWithStatement(result, statement);
      const verdict = explainVerdict(result, comparison);
      assert.equal(verdict.tooCloseToCall, true, id);
      assert.match(verdict.body, /too close to call/, id);
      assert.match(verdict.body, /HUD's 1995 guidance says dollar amounts may be rounded to the nearest dollar/, id);
      assert.match(verdict.body, /either side/, id);
      assert.ok(verdict.body.includes(formatCents(result.nearLine.amountCents)), id + ": states our cent-exact figure");
      if (result.nearLine.line === "SURPLUS_50") {
        assert.equal(verdict.tone, "info", id + ": never the refund banner inside the band");
      }
      assert.notEqual(verdict.tone === "flag" && comparison.flags.length === 0, true, id + ": amber without a flag inside the band");

      const steps = nextSteps(result, comparison);
      assert.equal(steps[0].title, "This one is too close to call", id);
      assert.equal(steps.some((step) => step.title === "Watch for the refund"), false, id);

      const letter = buildLetter(result, comparison, {});
      assert.match(letter, /rounding could put your figure on either side/, id);
      assert.equal(letter.includes("is refunded within 30 days of the escrow analysis. If the refund has been sent"), false, id);
    }
  }
});

test("E3: TV29 (one cent outside the band) and TV01 get the normal refund-required treatment", () => {
  for (const id of ["TV29", "TV01"]) {
    const account = vectorAccount(id);
    const result = analyze(account);
    assert.equal(result.nearLine, null, id);
    const comparison = compareWithStatement(result, undefined);
    const verdict = explainVerdict(result, comparison);
    assert.equal(verdict.tone, "flag", id);
    assert.equal(verdict.tooCloseToCall, false, id);
    assert.equal(verdict.body.includes("too close to call"), false, id);
    assert.match(verdict.body, /refunded within 30 days/, id);
    assert.equal(nextSteps(result, comparison)[0].title, "Watch for the refund", id);
    assert.match(buildLetter(result, comparison, {}), /If the refund has been sent, please tell me the date/, id);
  }
});

test("E3: the softening follows result.nearLine and nothing else, for every vector", () => {
  for (const vector of VECTORS) {
    const result = analyze(accountFromVector(vector));
    const comparison = compareWithStatement(result, undefined);
    const verdict = explainVerdict(result, comparison);
    const isNear = result.nearLine !== null;
    assert.equal(verdict.tooCloseToCall, isNear, vector.id);
    assert.equal(verdict.body.includes("too close to call"), isNear, vector.id);
    assert.equal(nextSteps(result, comparison)[0].title === "This one is too close to call", isNear, vector.id);
    assert.equal(buildLetter(result, comparison, {}).includes("rounding could put your figure on either side"), isNear, vector.id);
  }
});

test("E2: a deficiency when the borrower is not current — the words say the mortgage documents control it", () => {
  for (const id of ["TV22", "TV23"]) {
    const result = analyze(vectorAccount(id));
    const verdict = explainVerdict(result, compareWithStatement(result, undefined));
    assert.match(verdict.body, /Your mortgage documents control that/, id);
    assert.equal(verdict.body.includes("2 or more equal monthly payments"), false, id);
  }
});

// ---------- explainSteps ----------

const ALLOWED_URLS = [
  "https://www.ecfr.gov/current/title-12/chapter-X/part-1024/subpart-B/section-1024.17",
  "https://www.consumerfinance.gov/rules-policy/regulations/1024/17/",
  "https://www.consumerfinance.gov/rules-policy/regulations/1024/e/",
  "https://www.govinfo.gov/content/pkg/FR-1995-02-15/html/95-3683.htm",
  "https://www.consumerfinance.gov/rules-policy/regulations/1024/35/",
  "https://www.consumerfinance.gov/rules-policy/regulations/1024/36/",
  "https://www.consumerfinance.gov/complaint/",
  "https://www.consumerfinance.gov/find-a-housing-counselor/",
];

test("explainSteps: six steps, each with a title, plain words, this account's math, a cite and an official URL", () => {
  for (const situation of SITUATIONS) {
    const steps = explainSteps(situation.result);
    assert.equal(steps.length, 6);
    for (let index = 0; index < 6; index++) {
      const step = steps[index];
      assert.deepStrictEqual(Object.keys(step), ["title", "plain", "math", "cite", "url"]);
      assert.ok(step.title.startsWith("Step " + (index + 1) + ". "));
      assert.ok(step.plain.length > 40);
      assert.ok(step.math.includes("$"));
      assert.match(step.cite, /12 CFR 1024\.17/);
      assert.ok(ALLOWED_URLS.includes(step.url), step.url);
    }
  }
});

test("explainSteps uses the real numbers (test case #1)", () => {
  const steps = explainSteps(analyze(vectorAccount("TV01")));
  assert.equal(steps[0].math, "$1,800.00 + $1,200.00 + $1,800.00 = $4,800.00");
  assert.equal(steps[1].math, "$4,800.00 ÷ 12 = $400.00");
  assert.equal(steps[2].math, "$4,800.00 × 2 ÷ 12 = $800.00");
  assert.match(steps[3].math, /November at −\$400\.00\. Add \$400\.00/);
  assert.equal(steps[4].math, "$400.00 + $800.00 = $1,200.00");
  assert.match(steps[5].math, /^\$1,500\.00 − \$1,200\.00 = \$300\.00\./);
  assert.match(steps[5].cite, /\(f\)\(2\)\(i\)/);
});

test("explainSteps: many bills are summarised; a lower cushion cites (c)(8); no step-2 add is said plainly", () => {
  assert.equal(explainSteps(analyze(vectorAccount("TV21")))[0].math, "17 bills add up to $4,200.00");
  const lower = explainSteps(analyze(vectorAccount("TV16")));
  assert.equal(lower[2].cite, "12 CFR 1024.17(c)(8)");
  assert.match(lower[2].plain, /mortgage documents/);
  assert.match(explainSteps(analyze(vectorAccount("TV25")))[3].math, /never drops below \$0/);
});

test("E4: the deficiency/shortage split is labelled HUD guidance, 60 FR 8812, 8813–14 — not as regulation text", () => {
  for (const id of ["TV04", "TV12", "TV22", "TV23"]) {
    const step = explainSteps(analyze(vectorAccount(id)))[5];
    assert.ok(step.cite.startsWith("HUD guidance, 60 FR 8812, 8813–14"), id + ": " + step.cite);
    assert.match(step.plain, /HUD guidance/, id);
    assert.match(step.plain, /not the text of the regulation/, id);
    assert.equal(step.url, "https://www.govinfo.gov/content/pkg/FR-1995-02-15/html/95-3683.htm");
  }
  const noDeficiency = explainSteps(analyze(vectorAccount("TV09")))[5];
  assert.equal(noDeficiency.cite.includes("HUD"), false);
  const verdict = explainVerdict(analyze(vectorAccount("TV04")), compareWithStatement(analyze(vectorAccount("TV04")), undefined));
  assert.match(verdict.body, /HUD guidance, 60 FR 8812, 8813–14/);
});

// ---------- explainJump ----------

test("explainJump is null unless BOTH the current and the new payment are given", () => {
  const result = analyze(exampleById("jumped-ok").account);
  assert.equal(explainJump(result, undefined), null);
  assert.equal(explainJump(result, null), null);
  assert.equal(explainJump(result, {}), null);
  assert.equal(explainJump(result, { currentMonthlyEscrowCents: 40000 }), null);
  assert.equal(explainJump(result, { newMonthlyEscrowCents: 50000 }), null);
  assert.equal(explainJump(result, { currentMonthlyEscrowCents: "400", newMonthlyEscrowCents: 50000 }), null);
  assert.notEqual(explainJump(result, { currentMonthlyEscrowCents: 0, newMonthlyEscrowCents: 0 }), null);
});

test("example 1's jump: $400 → $500 = bills +$75, shortage repayment +$25, nothing unexplained", () => {
  const example = exampleById("jumped-ok");
  const jump = explainJump(analyze(example.account), example.statement);
  assert.equal(jump.oldCents, 40000);
  assert.equal(jump.newCents, 50000);
  assert.equal(jump.changeCents, 10000);
  assert.deepStrictEqual(jump.parts.map((part) => [part.key, part.cents]), [
    ["billsChanged", 7500],
    ["shortageRepayment", 2500],
    ["deficiencyRepayment", 0],
    ["unexplained", 0],
  ]);
  assert.match(jump.note, /\$25\.00/);
  assert.match(jump.note, /drop off/);
});

test("example 3's jump: $580 → $650 = bills +$20, and $50 the federal math does not explain", () => {
  const example = exampleById("cushion-too-big");
  const jump = explainJump(analyze(example.account), example.statement);
  assert.deepStrictEqual(jump.parts.map((part) => part.cents), [2000, 0, 0, 5000]);
  assert.match(jump.parts[3].sentence, /\$50\.00 a month is more than the federal math supports/);
});

test("HUD's Appendix M case (TV04): $500 base + $275 shortage + $1,200 deficiency = $1,975", () => {
  const jump = explainJump(analyze(vectorAccount("TV04")), { currentMonthlyEscrowCents: 45000, newMonthlyEscrowCents: 197500 });
  assert.deepStrictEqual(jump.parts.map((part) => part.cents), [5000, 27500, 120000, 0]);
});

test("PROPERTY: the four parts add up to exactly new − old, for every vector and a wide grid of payments", () => {
  let checked = 0;
  for (const vector of VECTORS) {
    const result = analyze(accountFromVector(vector));
    const base = result.baseMonthlyPaymentCents;
    const interesting = [0, 1, base - 1, base, base + 1, base + 1234, 2 * base, 3 * base + 77, result.newMonthlyEscrowPayment.monthlyEscrowWhileRepayingDeficiencyCents, 999999];
    for (const oldCents of interesting) {
      for (const newCents of interesting) {
        if (oldCents < 0 || newCents < 0) continue;
        const jump = explainJump(result, { currentMonthlyEscrowCents: oldCents, newMonthlyEscrowCents: newCents });
        let sum = 0;
        for (const part of jump.parts) {
          assert.ok(Number.isInteger(part.cents));
          assert.equal(Object.is(part.cents, -0), false);
          sum = sum + part.cents;
        }
        assert.equal(sum, newCents - oldCents, vector.id + " " + oldCents + "→" + newCents);
        assert.equal(jump.changeCents, newCents - oldCents);
        assert.deepStrictEqual(jump.parts.map((part) => part.key), ["billsChanged", "shortageRepayment", "deficiencyRepayment", "unexplained"]);
        assert.ok(jump.parts[1].cents >= 0 && jump.parts[1].cents <= result.newMonthlyEscrowPayment.shortageSpreadOver12Cents);
        assert.ok(jump.parts[2].cents >= 0);
        // The "deficiency ÷ 2" ceiling only exists for a borrower who is current, (f)(4)(iii) (audit A3).
        const notCurrentDeficiency = result.deficiencyCents > 0 && !result.inputs.borrowerCurrent;
        if (!notCurrentDeficiency) assert.ok(jump.parts[2].cents <= result.newMonthlyEscrowPayment.deficiencySpreadCents);
        if (notCurrentDeficiency) assert.ok(jump.parts[3].cents <= 0, "nothing above the base is 'unexplained' when the mortgage documents set the deficiency repayment");
        checked = checked + 1;
      }
    }
  }
  assert.ok(checked > 2000);
});

test("a positive 'unexplained' part equals PAYMENT_ABOVE_MAX's per-month amount", () => {
  const example = exampleById("cushion-too-big");
  const result = analyze(example.account);
  const flag = compareWithStatement(result, example.statement).flags.find((item) => item.kind === "PAYMENT_ABOVE_MAX");
  assert.equal(explainJump(result, example.statement).parts[3].cents, flag.amountCents);
});

// ---------- nextSteps ----------

test("nextSteps always carries the real deadlines, the CFPB complaint link, and the HUD counselor finder + phone", () => {
  for (const situation of SITUATIONS) {
    const comparison = compareWithStatement(situation.result, situation.statement);
    const steps = nextSteps(situation.result, comparison);
    const everything = collectStrings(steps, []).join(" ");
    assert.match(everything, /5 business days/);
    assert.match(everything, /30 business days/);
    assert.match(everything, /15 more business days/);
    assert.match(everything, /12 CFR 1024\.35/);
    assert.match(everything, /12 CFR 1024\.36/);
    assert.ok(steps.some((step) => step.url === "https://www.consumerfinance.gov/complaint/" && step.phone === "855-411-2372"));
    assert.ok(steps.some((step) => step.url === "https://www.consumerfinance.gov/find-a-housing-counselor/" && !("phone" in step)));
    for (const step of steps) {
      assert.ok(step.title.length > 5 && step.body.length > 40);
      if (step.url !== undefined) assert.ok(ALLOWED_URLS.includes(step.url), step.url);
    }
  }
});

test("nextSteps by outcome", () => {
  const titlesFor = (example, statement) => {
    const result = analyze(example.account);
    return nextSteps(result, compareWithStatement(result, statement)).map((step) => step.title);
  };
  const ok = exampleById("jumped-ok");
  assert.ok(titlesFor(ok, ok.statement).includes("When the math checks out, the cost is the bills"));
  assert.equal(titlesFor(ok, ok.statement).includes("Call your servicer first"), false);
  assert.ok(titlesFor(ok, {}).includes("Add your statement's numbers"));

  const holding = exampleById("holding-too-much");
  assert.equal(titlesFor(holding, holding.statement)[0], "Watch for the refund");

  const cushion = exampleById("cushion-too-big");
  const flagged = titlesFor(cushion, cushion.statement);
  assert.equal(flagged[0], "Call your servicer first");
  assert.ok(flagged.includes("Ask about the cushion"));

  const tv11 = { account: vectorAccount("TV11") };
  assert.ok(titlesFor(tv11, { lumpSumOfferedOnStatement: true }).includes("Ask how the shortage is being repaid"));
});

// ---------- explainServicerLine (SPEC D5) ----------

test("explainServicerLine is null without a new monthly payment", () => {
  const example = exampleById("jumped-ok");
  const result = analyze(example.account);
  for (const statement of [undefined, null, {}, { currentMonthlyEscrowCents: 40000 }, { newMonthlyEscrowCents: -5 }, { newMonthlyEscrowCents: "500" }]) {
    assert.equal(explainServicerLine(result, example.account, statement), null);
  }
});

test("example 1: at $500 a month the low point is $925 in November, $25 under the cap, and the label says the payment includes shortage repayment", () => {
  const example = exampleById("jumped-ok");
  const result = analyze(example.account);
  const line = explainServicerLine(result, example.account, example.statement);
  assert.deepStrictEqual(Object.keys(line), ["balancesCents", "lowPoint", "aboveCushionCents", "includesShortageAddOn", "label", "sentence"]);
  assert.deepStrictEqual(line.balancesCents, projectWithPayment(example.account, 50000));
  assert.deepStrictEqual(line.lowPoint, { balanceCents: 92500, month: 11, calendarMonth: 11 });
  assert.equal(line.aboveCushionCents, -2500);
  assert.equal(line.includesShortageAddOn, true);
  assert.match(line.label, /already includes shortage repayment/);
  assert.match(line.sentence, /\$925\.00 in November/);
});

test("example 3: at $650 a month the account is held $150 above the legal cushion", () => {
  const example = exampleById("cushion-too-big");
  const line = explainServicerLine(analyze(example.account), example.account, example.statement);
  // $1,800 + 3 × $650 − $2,400 = $1,350 at the end of June; the cap is $1,200.
  assert.deepStrictEqual(line.lowPoint, { balanceCents: 135000, month: 3, calendarMonth: 6 });
  assert.equal(line.aboveCushionCents, 15000);
  assert.equal(line.includesShortageAddOn, false);
  assert.match(line.sentence, /Held above the legal cushion: \$150\.00\./);
});

test("the servicer line at exactly bills ÷ 12 is the federal line", () => {
  for (const vector of VECTORS) {
    const account = accountFromVector(vector);
    const result = analyze(account);
    const line = explainServicerLine(result, account, { newMonthlyEscrowCents: result.baseMonthlyPaymentCents });
    assert.deepStrictEqual(line.balancesCents, result.table.map((row) => row.projectedBalanceCents), vector.id);
    assert.equal(line.lowPoint.balanceCents, result.lowPoint.projectedBalanceCents);
    assert.equal(line.lowPoint.month, result.lowPoint.month);
    assert.equal(line.includesShortageAddOn, false);
  }
});

// =====================================================================
// FIX ORDER 1 (math audit, docs/verification/math-audit.md section 5)
// =====================================================================

test("A3: not current + deficiency — the dollars above base + shortage are 'deficiency repayment set by your mortgage documents', never 'unexplained' (TV23, $300 → $550)", () => {
  const result = analyze(vectorAccount("TV23"));
  const statement = { currentMonthlyEscrowCents: 30000, newMonthlyEscrowCents: 55000 };
  assert.equal(rowStatus(compareWithStatement(result, statement), "newMonthlyEscrow"), "match");
  const jump = explainJump(result, statement);
  assert.deepStrictEqual(jump.parts.map((part) => part.cents), [0, 15000, 10000, 0]);
  assert.match(jump.parts[2].sentence, /set by your mortgage documents, not by this rule/);
  assert.match(jump.parts[2].sentence, /12 CFR 1024\.17\(f\)\(4\)\(iii\)/);
  assert.equal(JSON.stringify(jump).includes("more than the federal math supports"), false);
  // Below the base, the remainder is still reported as "lower than the bills call for".
  const low = explainJump(result, { currentMonthlyEscrowCents: 30000, newMonthlyEscrowCents: 25000 });
  assert.deepStrictEqual(low.parts.map((part) => part.cents), [0, 0, 0, -5000]);
});

function rowStatus(comparison, key) {
  return comparison.rows.find((row) => row.key === key).status;
}

test("A1 in explainJump: a leftover inside the scaled payment tolerance reads as rounding; one cent more does not", () => {
  const example = exampleById("jumped-ok"); // two rounded parts → $2.00
  const result = analyze(example.account);
  const atEdge = explainJump(result, { currentMonthlyEscrowCents: 40000, newMonthlyEscrowCents: 50200 });
  assert.equal(atEdge.parts[3].cents, 200);
  assert.match(atEdge.parts[3].sentence, /rounding/);
  assert.match(atEdge.parts[3].sentence, /60 FR 8812/);
  const past = explainJump(result, { currentMonthlyEscrowCents: 40000, newMonthlyEscrowCents: 50201 });
  assert.match(past.parts[3].sentence, /more than the federal math supports/);
});

test("A4: step 2 says the REGULAR payment is one-twelfth, and that repayment can be added on top", () => {
  const step = explainSteps(analyze(vectorAccount("TV01")))[1];
  assert.equal(step.title, "Step 2. Divide by 12 to get the escrow payment");
  assert.ok(step.plain.startsWith("The regular escrow payment each month is one-twelfth of the year's bills. Repaying a shortage or deficiency can be added on top."));
  assert.equal(step.plain.includes("The most a servicer may collect"), false);
  assert.match(step.plain, /That rounding is this page's choice\. The rule does not mention cents\./);
});

test("A6: whole-dollar rounding is attributed to HUD's 1995 guidance (60 FR 8812), never stated as settled law", () => {
  assert.match(TOO_CLOSE_SENTENCE, /HUD's 1995 guidance says dollar amounts may be rounded to the nearest dollar \(60 FR 8812\), so /);
  for (const situation of SITUATIONS) {
    for (const text of everyWordFor(situation)) {
      assert.equal(/lawfully round|may lawfully/i.test(text), false, situation.name + ": " + text);
    }
  }
});

test("A7: 'held above the legal cushion' says 'before any surplus refund' when there is a surplus, and not otherwise", () => {
  const holding = exampleById("holding-too-much");
  const withSurplus = explainServicerLine(analyze(holding.account), holding.account, holding.statement);
  assert.equal(withSurplus.aboveCushionCents, 30000);
  assert.match(withSurplus.sentence, /Held above the legal cushion, before any surplus refund: \$300\.00\./);
  const cushion = exampleById("cushion-too-big");
  const noSurplus = explainServicerLine(analyze(cushion.account), cushion.account, cushion.statement);
  assert.match(noSurplus.sentence, /Held above the legal cushion: \$150\.00\./);
  assert.equal(noSurplus.sentence.includes("surplus"), false);
});

test("A8: both clocks say 'generally'; § 1024.36 carries its 15-business-day extension; § 1024.35's extension says 'with reasons'", () => {
  const flagged = exampleById("cushion-too-big");
  const result = analyze(flagged.account);
  const steps = nextSteps(result, compareWithStatement(result, flagged.statement));
  const notice = steps.find((step) => step.title === "Put it in writing: a notice of error");
  const request = steps.find((step) => step.title === "Ask for the worksheet: a request for information");
  for (const step of [notice, request]) {
    assert.match(step.body, /generally has 5 business days/);
    assert.match(step.body, /generally has 30 business days|generally 30 business days/);
    assert.match(step.body, /15 more business days/);
  }
  assert.match(notice.body, /with reasons/);
});

test("A9: 'When the math checks out…' shows only when the statement was actually checked and matches", () => {
  const example = exampleById("jumped-ok");
  const result = analyze(example.account);
  const title = "When the math checks out, the cost is the bills";
  const titles = (statement) => nextSteps(result, compareWithStatement(result, statement)).map((step) => step.title);
  assert.ok(titles(example.statement).includes(title));
  assert.equal(titles(undefined).includes(title), false);
  assert.equal(titles({}).includes(title), false);
});

test("A10: 'Many payment jumps are lawful' — never 'Most'", () => {
  const example = exampleById("jumped-ok");
  const verdict = verdictFor(example.account, example.statement);
  assert.match(verdict.body, /Many payment jumps are lawful/);
  for (const situation of SITUATIONS) {
    for (const text of everyWordFor(situation)) assert.equal(text.includes("Most payment jumps"), false);
  }
});

test("A11: the analysis date is 'usually' printed on the statement", () => {
  const result = analyze(vectorAccount("TV01"));
  const step = nextSteps(result, compareWithStatement(result, undefined))[0];
  assert.equal(step.title, "Watch for the refund");
  assert.match(step.body, /That date is usually printed on your statement\./);
});

test("A13: the first jump part is labelled for what it is: bills now versus the OLD PAYMENT", () => {
  const example = exampleById("jumped-ok");
  const jump = explainJump(analyze(example.account), example.statement);
  assert.equal(jump.parts[0].label, "Bills now versus your old payment");
});

test("A14: absurd, unvalidated numbers never make explainJump or explainServicerLine throw — they count as not given", () => {
  const example = exampleById("jumped-ok");
  const result = analyze(example.account);
  for (const value of [2 ** 53, 1e20, NaN, Infinity, -Infinity, -5, 1.5, "500", 1000000001, null, {}, []]) {
    assert.equal(explainJump(result, { currentMonthlyEscrowCents: value, newMonthlyEscrowCents: 50000 }), null, String(value));
    assert.equal(explainJump(result, { currentMonthlyEscrowCents: 40000, newMonthlyEscrowCents: value }), null, String(value));
    assert.equal(explainServicerLine(result, example.account, { newMonthlyEscrowCents: value }), null, String(value));
  }
  assert.notEqual(explainJump(result, { currentMonthlyEscrowCents: 1000000000, newMonthlyEscrowCents: 1000000000 }), null);
});

test("A15: only contact details printed on the linked official page — the counselor step has a link and NO phone", () => {
  for (const situation of SITUATIONS) {
    const comparison = compareWithStatement(situation.result, situation.statement);
    const steps = nextSteps(situation.result, comparison);
    const counselor = steps.find((step) => step.url === "https://www.consumerfinance.gov/find-a-housing-counselor/");
    const complaint = steps.find((step) => step.url === "https://www.consumerfinance.gov/complaint/");
    assert.equal("phone" in counselor, false);
    assert.equal(complaint.phone, "855-411-2372");
    assert.deepStrictEqual(steps.filter((step) => "phone" in step), [complaint]);
    for (const text of everyWordFor(situation)) {
      assert.equal(text.includes("HOPE"), false);
      assert.equal(text.includes("888-995"), false); // (a bare "995" would trip on the year 1995 in HUD's URL)
      assert.equal(text.includes("4673"), false);
    }
  }
});
