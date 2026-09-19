// tests/letter.test.js — buildLetter: a neutral, pre-filled letter. Pure text.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  analyze, compareWithStatement, buildLetter, letterKind, nextSteps, accountFromVector, validateAccount, VECTORS, MAX_BILL_LABEL_LENGTH,
} from "../engine/index.js";
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
  assert.ok(letter.includes("The numbers I used, taken from the statement's projection for the next 12 months:"));
  assert.ok(letter.includes("- Escrow balance at the start of the next 12 months: $1,800.00"));
  assert.ok(letter.includes("- First of those 12 months: April"));
  assert.ok(letter.includes("    Homeowners insurance, June: $2,400.00"));
  assert.ok(letter.includes("    Property tax, October: $2,400.00"));
  assert.ok(letter.includes("    Property tax, March: $2,400.00"));
  assert.ok(letter.includes("  Total for the 12 months: $7,200.00"));
  // what the method gives
  assert.ok(letter.includes("- Monthly escrow payment (total ÷ 12): $600.00"));
  assert.ok(letter.includes("- Most cushion allowed (2 months of escrow payments): $1,200.00"));
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
  // The statement matches and the 30 days may not have run, so this asks; it does not assert an error (audit A2).
  assert.ok(letter.includes("Re: Request for information under 12 C.F.R. § 1024.36"));
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
  assert.ok(letter.includes("- Most cushion allowed (1 month of escrow payments): $400.00"));
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

// =====================================================================
// FIX ORDER 2, QA #6: the letter uses the analysis date the visitor typed.
// The page makes the letter editable and tells the visitor to fill in the
// parts in [brackets]. There are no name or address boxes on the page (the
// director's ruling), so those always arrive empty and must stay bracketed.
// =====================================================================

// Every "[...]" blank in a letter, in the order they appear.
function blanksIn(letter) {
  const blanks = [];
  let from = letter.indexOf("[");
  while (from !== -1) {
    const to = letter.indexOf("]", from);
    blanks.push(letter.slice(from, to + 1));
    from = letter.indexOf("[", to);
  }
  return blanks;
}

test("QA #6: an analysis date that was given is printed in words, and its blank is gone", () => {
  const letter = letterFor("holding-too-much", { analysisDate: "2026-09-01" });
  assert.ok(letter.includes("I am writing about the annual escrow account statement dated September 1, 2026 for the property above."));
  assert.equal(letter.includes("[date on the statement]"), false);
  assert.equal(letter.includes("2026-09-01"), false, "the date is written in words, not as typed");
});

test("QA #6: each example's own details reach the letter (only holding-too-much carries a date)", () => {
  for (const example of EXAMPLES) {
    const letter = letterFor(example.id, example.details);
    const hasDate = typeof example.details.analysisDate === "string";
    assert.equal(letter.includes("[date on the statement]"), !hasDate, example.id);
  }
  assert.ok(letterFor("holding-too-much", EXAMPLES.find((item) => item.id === "holding-too-much").details).includes("dated September 1, 2026 for"));
});

test("QA #6: no analysis date → the visible blank stays", () => {
  for (const details of [undefined, null, {}, { analysisDate: "" }, { analysisDate: "   " }, { analysisDate: undefined }]) {
    const letter = letterFor("holding-too-much", details);
    assert.ok(letter.includes("statement dated [date on the statement] for the property above."));
  }
});

test("QA #6: a garbage analysis date → the visible blank, never a throw, and none of the garbage in the letter", () => {
  const garbage = ["2026-02-30", "<b>x</b>", "x".repeat(5000), null, 42, {}, [], true, "2026-9-1", "09/01/2026", "2026-09-01T00:00", "September 1, 2026"];
  const clean = letterFor("holding-too-much", {});
  for (const analysisDate of garbage) {
    const letter = letterFor("holding-too-much", { analysisDate: analysisDate });
    assert.equal(letter, clean, String(analysisDate).slice(0, 20));
  }
});

test("QA #6: with nothing given, the blanks are exactly these, and every one is in [brackets]", () => {
  for (const id of ["jumped-ok", "holding-too-much", "cushion-too-big"]) {
    const blanks = blanksIn(letterFor(id, {}));
    assert.deepStrictEqual(blanks, [
      "[today's date]",
      "[your servicer's name]",
      "[the address your servicer lists for error notices and information requests. Check your statement or the servicer's website. It is often not the payment address.]",
      "[your full name]",
      "[your property address]",
      "[your loan number]",
      "[your property address]",
      "[date on the statement]",
      "[your phone number or email]",
      "[your full name]",
    ], id);
  }
});

test("QA #6: borrowerName and propertyAddress are still supported, and an empty one stays a blank", () => {
  const filled = letterFor("jumped-ok", { borrowerName: "Pat Homeowner", propertyAddress: "1 Main St, Cary, NC 27511" });
  assert.ok(filled.includes("From: Pat Homeowner"));
  assert.ok(filled.includes("Property: 1 Main St, Cary, NC 27511"));
  const empty = letterFor("jumped-ok", { borrowerName: "", propertyAddress: "" });
  assert.ok(empty.includes("From: [your full name]"));
  assert.ok(empty.includes("Property: [your property address]"));
});

// =====================================================================
// FIX ORDER 2, QA #13: one bill-name limit. The letter has no second cap of
// its own: a name the engine accepts is printed whole.
// =====================================================================

test("QA #13: the longest bill name the engine accepts is printed whole in the letter", () => {
  const example = EXAMPLES.find((item) => item.id === "jumped-ok");
  const account = JSON.parse(JSON.stringify(example.account));
  const longName = "n".repeat(MAX_BILL_LABEL_LENGTH);
  account.disbursements[0].label = longName;
  assert.deepStrictEqual(validateAccount(account).errors, []);
  const result = analyze(account);
  const letter = buildLetter(result, compareWithStatement(result, example.statement), {});
  assert.ok(letter.includes("    " + longName + ", "));
});

// =====================================================================
// FIX ORDER 1, A2: notice of error ONLY when a flag asserts a discrepancy
// =====================================================================

const NOTICE = "NOTICE_OF_ERROR";
const REQUEST = "REQUEST_FOR_INFORMATION";

function accountById(id) {
  return accountFromVector(VECTORS.find((vector) => vector.id === id));
}

test("A2 table: every vector with no statement → request for information (refund due, too close to call, or nothing to ask)", () => {
  for (const vector of VECTORS) {
    const result = analyze(accountFromVector(vector));
    const comparison = compareWithStatement(result, undefined);
    assert.equal(letterKind(result, comparison), REQUEST, vector.id);
    const letter = buildLetter(result, comparison, {});
    assert.ok(letter.includes("Re: Request for information under 12 C.F.R. § 1024.36"), vector.id);
    assert.equal(letter.includes("Notice of error"), false, vector.id);
    assert.equal(letter.includes("I believe the statement contains the error"), false, vector.id);
  }
});

test("A2 table: the named cases — a matching statement + refund due, and every nearLine vector, are requests that still carry their question", () => {
  for (const id of ["TV01", "TV03", "TV13", "TV16", "TV17", "TV25", "TV29"]) {
    const result = analyze(accountById(id));
    const agrees = { claimedKind: "surplus", claimedAmountCents: result.surplusCents, newMonthlyEscrowCents: result.baseMonthlyPaymentCents };
    const comparison = compareWithStatement(result, agrees);
    assert.equal(comparison.overall, "matches", id);
    assert.equal(letterKind(result, comparison), REQUEST, id);
    const letter = buildLetter(result, comparison, {});
    assert.ok(letter.includes("What I am asking about:"), id);
    assert.match(letter, /If the refund has been sent, please tell me the date/, id);
  }
  for (const id of ["TV06", "TV07", "TV10", "TV10b", "TV26", "TV27", "TV28"]) {
    const result = analyze(accountById(id));
    const comparison = compareWithStatement(result, undefined);
    assert.equal(letterKind(result, comparison), REQUEST, id);
    assert.match(buildLetter(result, comparison, {}), /rounding could put your figure on either side/, id);
  }
});

test("A2 table: the three examples", () => {
  const expected = { "jumped-ok": REQUEST, "holding-too-much": REQUEST, "cushion-too-big": NOTICE };
  for (const example of EXAMPLES) {
    const result = analyze(example.account);
    assert.equal(letterKind(result, compareWithStatement(result, example.statement)), expected[example.id], example.id);
  }
});

test("A2 table: each flag kind ALONE → the expected kind of letter", () => {
  const tv11 = accountById("TV11"); // shortage $1,200 ≥ one month's payment $480; cap $960; maximum $580
  const tv09 = accountById("TV09"); // shortage $240 < one month's payment
  const rows = [
    ["CUSHION_OVER_CAP", tv11, { requiredMinimumBalanceCents: 196000 }, NOTICE],
    ["PAYMENT_ABOVE_MAX", tv11, { newMonthlyEscrowCents: 70000 }, NOTICE],
    ["KIND_DIFFERS", tv11, { claimedKind: "surplus", claimedAmountCents: 5000 }, NOTICE],
    ["AMOUNT_DIFFERS", tv11, { claimedKind: "shortage", claimedAmountCents: 200000 }, NOTICE], // on the claimed amount
    ["SPREAD_TOO_SHORT", tv11, { shortageSpreadMonths: 6 }, NOTICE],
    ["LUMP_SUM_OFFERED", tv11, { lumpSumOfferedOnStatement: true }, REQUEST], // a question, never a finding (SPEC D6)
    ["AMOUNT_DIFFERS", tv09, { newMonthlyEscrowCents: 45000 }, REQUEST], // payment LOWER than expected: lower is allowed
  ];
  for (const [kind, account, statement, expectedKind] of rows) {
    const result = analyze(account);
    const comparison = compareWithStatement(result, statement);
    assert.deepStrictEqual(comparison.flags.map((flag) => flag.kind), [kind], kind);
    assert.equal(letterKind(result, comparison), expectedKind, kind);
    const letter = buildLetter(result, comparison, {});
    assert.ok(letter.includes("1. " + comparison.flags[0].letterLine), kind + ": the question is carried either way");
  }
});

test("A2: a notice of error says in plain words that the borrower believes the statement contains the error(s) — § 1024.35(a)", () => {
  const notice = letterFor("cushion-too-big", {});
  assert.ok(notice.includes("Re: Notice of error under 12 C.F.R. § 1024.35"));
  assert.ok(notice.includes("I believe the statement contains the error(s) described below."));
  assert.match(notice, /either confirm it is correct and explain why, or correct it/);

  const request = letterFor("holding-too-much", {});
  assert.ok(request.includes("Re: Request for information under 12 C.F.R. § 1024.36"));
  assert.equal(request.includes("error(s)"), false);
  assert.equal(request.includes("correct it and send me an updated statement"), false);
  assert.match(request, /Please answer the question/);
});

test("A2 + B2: the low-point mix-up nudge is a request for information that asks about the cushion", () => {
  const result = analyze(accountById("TV01"));
  const comparison = compareWithStatement(result, { requiredMinimumBalanceCents: 110000 });
  assert.equal(letterKind(result, comparison), REQUEST);
  const letter = buildLetter(result, comparison, {});
  assert.match(letter, /Please confirm the required minimum balance/);
  assert.equal(letter.includes("Notice of error"), false);
});

test("A2: letterKind is the one rule — nextSteps leads with the matching step", () => {
  for (const example of EXAMPLES) {
    const result = analyze(example.account);
    const comparison = compareWithStatement(result, example.statement);
    const titles = nextSteps(result, comparison).map((step) => step.title);
    const hasNoticeStep = titles.includes("Put it in writing: a notice of error");
    assert.equal(hasNoticeStep, letterKind(result, comparison) === NOTICE, example.id);
    assert.ok(titles.includes("Ask for the worksheet: a request for information"), example.id);
    if (!hasNoticeStep) {
      const ladder = titles.filter((title) => title.includes("request for information") || title.includes("complaint") || title.includes("counselor"));
      assert.equal(ladder[0], "Ask for the worksheet: a request for information", example.id);
    }
  }
});
