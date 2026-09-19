// tests/letter.test.js — buildLetter: a neutral, pre-filled letter. Pure text.

import { test } from "node:test";
import assert from "node:assert/strict";

import { analyze, compareWithStatement, buildLetter, accountFromVector, VECTORS } from "../engine/index.js";
import { EXAMPLES } from "../examples.js";

function letterFor(exampleId, details) {
  const example = EXAMPLES.find((item) => item.id === exampleId);
  const result = analyze(example.account);
  const comparison = compareWithStatement(result, example.statement);
  return buildLetter(result, comparison, details);
}

test("it is plain text, and every vector and example produces one without leftovers", () => {
  const accounts = VECTORS.map((vector) => accountFromVector(vector)).concat(EXAMPLES.map((example) => example.account));
  for (const account of accounts) {
    const result = analyze(account);
    const letter = buildLetter(result, compareWithStatement(result, undefined), undefined);
    assert.equal(typeof letter, "string");
    assert.ok(letter.length > 800);
    for (const leak of ["undefined", "NaN", "[object", "null"]) assert.equal(letter.includes(leak), false, leak);
  }
});

test("missing details become visible blanks", () => {
  for (const details of [undefined, null, {}, "details", { servicerName: "", loanNumber: "   ", borrowerName: 42 }]) {
    const letter = letterFor("cushion-too-big", details);
    assert.ok(letter.includes("[today's date]"));
    assert.ok(letter.includes("To: [your servicer's name]"));
    assert.ok(letter.includes("Mortgage loan number: [your loan number]"));
    assert.ok(letter.includes("From: [your full name]"));
    assert.ok(letter.includes("[your property address]"));
    assert.ok(letter.includes("[date on the statement]"));
    assert.ok(letter.includes("[your phone number or email]"));
  }
});

test("details that are given are filled in, and the blanks for them disappear", () => {
  const letter = letterFor("cushion-too-big", {
    servicerName: "Example Servicing",
    loanNumber: "0001234567",
    borrowerName: "Pat Homeowner",
    propertyAddress: "1 Main St, Cary, NC 27511",
    date: "September 19, 2026",
  });
  assert.ok(letter.startsWith("September 19, 2026\n"));
  assert.ok(letter.includes("To: Example Servicing"));
  assert.ok(letter.includes("Mortgage loan number: 0001234567"));
  assert.ok(letter.includes("From: Pat Homeowner"));
  assert.ok(letter.includes("Property: 1 Main St, Cary, NC 27511"));
  assert.ok(letter.endsWith("Sincerely,\nPat Homeowner"));
  for (const blank of ["[today's date]", "[your servicer's name]", "[your loan number]", "[your full name]", "[your property address]"]) {
    assert.equal(letter.includes(blank), false, blank);
  }
});

test("it carries its own 'arithmetic, not legal conclusions' line and the real deadlines", () => {
  for (const id of ["jumped-ok", "holding-too-much", "cushion-too-big"]) {
    const letter = letterFor(id, {});
    assert.ok(letter.includes("This letter states arithmetic, not legal conclusions. I am not a lawyer."));
    assert.match(letter, /5 business days/);
    assert.match(letter, /30 business days/);
    assert.match(letter, /newer bill amounts/);
  }
});

test("something to ask about → a notice of error under § 1024.35, pre-filled with the numbers and each gap", () => {
  const letter = letterFor("cushion-too-big", {});
  assert.ok(letter.includes("Re: Notice of error under 12 C.F.R. § 1024.35, and request for information under 12 C.F.R. § 1024.36"));
  // the numbers typed
  assert.ok(letter.includes("- Escrow balance at the start of the year: $1,800.00"));
  assert.ok(letter.includes("- First month of the escrow year: April"));
  assert.ok(letter.includes("    Homeowners insurance, June: $2,400.00"));
  assert.ok(letter.includes("    Property tax, October: $2,400.00"));
  assert.ok(letter.includes("    Property tax, March: $2,400.00"));
  assert.ok(letter.includes("  Total for the year: $7,200.00"));
  // what the method gives
  assert.ok(letter.includes("- Monthly payment (total ÷ 12): $600.00"));
  assert.ok(letter.includes("- Most cushion allowed (2 months of payments): $1,200.00"));
  assert.ok(letter.includes("- Lowest projected month-end balance: $1,200.00 in June"));
  assert.ok(letter.includes("- Target starting balance: $1,800.00"));
  assert.ok(letter.includes("- Result: no shortage and no surplus"));
  // each gap, numbered, in the homeowner's own voice
  assert.ok(letter.includes("1. The statement uses a required minimum balance (cushion) of $1,800.00."));
  assert.ok(letter.includes("2. The statement shows a shortage of $600.00."));
  assert.ok(letter.includes("3. The statement sets the new monthly escrow payment at $650.00."));
  assert.ok(letter.includes("$50.00 a month more, or $600.00 over 12 months"));
  assert.match(letter, /either confirm it is correct and explain why, or correct it/);
  assert.equal(letter.includes("Your statement"), false, "the letter speaks as the homeowner, not to the homeowner");
});

test("a refund that looks due → the letter asks about it without demanding or promising anything", () => {
  const letter = letterFor("holding-too-much", {});
  assert.ok(letter.includes("Re: Notice of error under 12 C.F.R. § 1024.35"));
  assert.ok(letter.includes("1. By my math the account has a surplus of $300.00."));
  assert.match(letter, /If the refund has been sent, please tell me the date/);
});

test("everything lines up → a plain request for information under § 1024.36, not a notice of 'error'", () => {
  const letter = letterFor("jumped-ok", {});
  assert.ok(letter.includes("Re: Request for information under 12 C.F.R. § 1024.36"));
  assert.equal(letter.includes("Notice of error"), false);
  assert.equal(letter.includes("What I am asking about:"), false);
  assert.ok(letter.includes("My numbers line up with the statement."));
  assert.ok(letter.includes("- Result: a shortage of $300.00"));
});

test("a deficiency + shortage result names HUD's guidance for the split (SPEC E4)", () => {
  const result = analyze(accountFromVector(VECTORS.find((vector) => vector.id === "TV04")));
  const letter = buildLetter(result, compareWithStatement(result, undefined), {});
  assert.ok(letter.includes("a deficiency of $2,400.00 and a remaining shortage of $3,300.00"));
  assert.ok(letter.includes("60 FR 8812, 8813–14"));
});

test("unnamed bills are numbered; a 1-month cushion reads '1 month'", () => {
  const account = accountFromVector(VECTORS.find((vector) => vector.id === "TV16"));
  account.disbursements = account.disbursements.map((bill) => ({ month: bill.month, amountCents: bill.amountCents }));
  const result = analyze(account);
  const letter = buildLetter(result, compareWithStatement(result, undefined), {});
  assert.ok(letter.includes("    Bill 1, May: $1,800.00"));
  assert.ok(letter.includes("- Most cushion allowed (1 month of payments): $400.00"));
});

test("what the person typed stays TEXT: markup is copied as-is, line breaks are flattened, length is capped", () => {
  const letter = letterFor("cushion-too-big", {
    servicerName: "<img src=x onerror=alert(1)>",
    loanNumber: "123\n\nRe: something else\r\n456\t789",
    borrowerName: "x".repeat(5000),
  });
  assert.ok(letter.includes("To: <img src=x onerror=alert(1)>"), "pure text out; the page shows it through .value");
  assert.ok(letter.includes("Mortgage loan number: 123  Re: something else  456 789"));
  assert.equal(letter.includes("x".repeat(201)), false);
  assert.ok(letter.includes("x".repeat(200)));
});

test("buildLetter is repeatable and changes nothing it is given", () => {
  const example = EXAMPLES[2];
  const result = analyze(example.account);
  const comparison = compareWithStatement(result, example.statement);
  const details = { servicerName: "Example Servicing" };
  const before = JSON.stringify([result, comparison, details]);
  const first = buildLetter(result, comparison, details);
  assert.equal(buildLetter(result, comparison, details), first);
  assert.equal(JSON.stringify([result, comparison, details]), before);
});
