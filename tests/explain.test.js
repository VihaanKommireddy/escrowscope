// tests/explain.test.js — the words. Two jobs:
//   1. VOICE: run every research vector (counted from the file) and every
//      built-in example through every function that produces text, and scan
//      all of it for words the brand guide bans.
//   2. RULES: the verdict tones (SPEC C4), the too-close-to-call softening
//      (SPEC E3), the six steps, the payment-jump split, and the next steps.

import { test } from "node:test";
import assert from "node:assert/strict";

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
  validateAccount,
  validateStatement,
  accountFromVector,
  formatCents,
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
  return [undefined, {}, agrees, tooMuch, tooLittle, oddOnes];
}

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
    buildLetter(result, comparison, { servicerName: "Example Servicing", loanNumber: "0001234567", borrowerName: "Pat Homeowner", propertyAddress: "1 Main St, Cary, NC", date: "September 19, 2026" }),
    validateAccount(account),
    validateStatement(statement, account),
  ];
  return collectStrings(produced, []);
}

const SITUATIONS = allSituations();

test("the scan covers every vector in the file and all three examples", () => {
  const names = new Set(SITUATIONS.map((situation) => situation.name));
  assert.ok(VECTORS.length >= 30);
  assert.equal(names.size, VECTORS.length + 3);
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
  let scanned = 0;
  for (const situation of SITUATIONS) {
    for (const text of everyWordFor(situation)) {
      scanned = scanned + 1;
      for (const pattern of BANNED) {
        assert.equal(pattern.test(text), false, situation.name + ": " + pattern + " in: " + text);
      }
    }
  }
  assert.ok(scanned > 5000, "scanned only " + scanned + " strings");
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
  assert.ok(step.plain.startsWith("The regular monthly payment is one-twelfth of the year's bills. Repaying a shortage or deficiency can be added on top."));
  assert.equal(step.plain.includes("The most a servicer may collect"), false);
  assert.match(step.plain, /our choice/);
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
