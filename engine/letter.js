// engine/letter.js — a neutral "please explain this calculation" letter,
// pre-filled with the numbers (SPEC B1 bet 4).
//
// WHICH LETTER  (decided in ONE place: letterKind, below)
//   • A flag asserts a discrepancy between the statement and the federal
//     math → a NOTICE OF ERROR under 12 CFR 1024.35, which also asks for the
//     worksheet under 12 CFR 1024.36.
//   • Anything else (a question, a too-close-to-call figure, a refund that
//     looks due on a statement that matches, or nothing at all) → asserting an
//     "error" would be wrong, so it is a REQUEST FOR INFORMATION under
//     12 CFR 1024.36 that carries the same questions.
// Both carry their own "this letter states arithmetic, not legal conclusions"
// line (research doc 03 §4). Written fresh in our own words, shaped like the
// model letter in that doc.
//
// PURE TEXT OUT. The page puts this string in a text box through `.value`, so
// nothing in it is ever treated as HTML. Anything the person typed (names,
// loan number) is tidied — line breaks flattened, length capped — and missing
// details become visible blanks like [your loan number].
//
// "TOO CLOSE TO CALL" (SPEC E3): softened if and only if result.nearLine is set.

import { formatCents, MONTH_NAMES } from "./money.js";

const MAX_DETAIL_LENGTH = 200;

function monthName(calendarMonth) {
  return MONTH_NAMES[calendarMonth - 1];
}

// Use what the person typed, or a visible blank.
function detailOrBlank(details, name, blank) {
  const value = details[name];
  if (typeof value !== "string") return blank;
  // Flatten line breaks and tabs to spaces so one field stays on one line.
  let tidy = "";
  for (const character of value) {
    const isLineBreakOrTab = character === "\n" || character === "\r" || character === "\t";
    tidy = tidy + (isLineBreakOrTab ? " " : character);
  }
  tidy = tidy.trim();
  if (tidy === "") return blank;
  if (tidy.length > MAX_DETAIL_LENGTH) tidy = tidy.slice(0, MAX_DETAIL_LENGTH);
  return tidy;
}

function describeResult(result) {
  if (result.surplusCents > 0) return "a surplus of " + formatCents(result.surplusCents);
  if (result.deficiencyCents > 0 && result.shortageCents > 0) {
    return "a deficiency of " + formatCents(result.deficiencyCents) + " and a remaining shortage of " + formatCents(result.shortageCents) + " (split the way HUD's 1995 guidance describes, 60 FR 8812, 8813–14)";
  }
  if (result.deficiencyCents > 0) return "a deficiency of " + formatCents(result.deficiencyCents);
  if (result.shortageCents > 0) return "a shortage of " + formatCents(result.shortageCents);
  return "no shortage and no surplus";
}

function billLines(result) {
  const lines = [];
  const bills = result.inputs.disbursements;
  for (let index = 0; index < bills.length; index++) {
    const bill = bills[index];
    const name = bill.label.trim() === "" ? "Bill " + (index + 1) : bill.label.trim();
    lines.push("    " + name + ", " + monthName(bill.calendarMonth) + ": " + formatCents(bill.amountCents));
  }
  return lines;
}

// ---------------------------------------------------------------------------
// letterKind — THE one rule for which letter this is (math audit A2).
// buildLetter below and nextSteps in explain.js both call it; nobody else
// decides.
//
// 12 CFR 1024.35(a) is for a notice that ASSERTS an error: it must include
// "the error the borrower believes has occurred". So the letter is a notice of
// error only when a flag asserts a discrepancy between the statement and the
// federal math:
//     CUSHION_OVER_CAP · PAYMENT_ABOVE_MAX · KIND_DIFFERS · SPREAD_TOO_SHORT ·
//     AMOUNT_DIFFERS on the claimed shortage/surplus amount
// Everything else only ASKS, so it is a request for information (12 CFR
// 1024.36) that carries the same questions:
//     a refund that looks due while the statement matches (the 30 days may not
//     have run) · every too-close-to-call case · LUMP_SUM_OFFERED (SPEC D6: a
//     question, never a finding) · a payment LOWER than expected (lower is
//     allowed) · the "is that really the required minimum?" nudge · nothing
//     to ask at all.
// ---------------------------------------------------------------------------

const FLAGS_THAT_ASSERT_A_DISCREPANCY = ["CUSHION_OVER_CAP", "PAYMENT_ABOVE_MAX", "KIND_DIFFERS", "SPREAD_TOO_SHORT"];

export function letterKind(result, comparison) {
  for (const flag of comparison.flags) {
    if (FLAGS_THAT_ASSERT_A_DISCREPANCY.includes(flag.kind)) return "NOTICE_OF_ERROR";
    if (flag.kind === "AMOUNT_DIFFERS" && flag.rowKey === "claimedAmount") return "NOTICE_OF_ERROR";
  }
  return "REQUEST_FOR_INFORMATION";
}

// The numbered "what I am asking about" items.
function questionLines(result, comparison) {
  const items = [];
  for (const flag of comparison.flags) {
    items.push(flag.letterLine);
  }
  for (const nudge of comparison.nudges) {
    items.push(nudge.letterLine);
  }

  const near = result.nearLine;
  if (near !== null && near.line === "SURPLUS_50") {
    items.push("By my math the surplus is " + formatCents(near.amountCents) + " to the cent. That is within a few dollars of the $50 line in 12 CFR 1024.17(f)(2)(i), and I understand that rounding could put your figure on either side of it. Please tell me your exact surplus figure and how it is being handled.");
  } else if (near !== null) {
    items.push("By my math the " + near.appliesTo + " is " + formatCents(near.amountCents) + " to the cent, and one month's escrow payment is " + formatCents(near.lineCents) + ". Those are within a few dollars of each other, and I understand that rounding could put your figure on either side. Please tell me your exact figure and which repayment choices you are applying.");
  } else if (result.classification === "SURPLUS_REFUND_REQUIRED") {
    items.push("By my math the account has a surplus of " + formatCents(result.surplusCents) + ". 12 CFR 1024.17(f)(2)(i) says a surplus of $50 or more is refunded within 30 days of the escrow analysis. If the refund has been sent, please tell me the date and how it was sent. If not, please tell me when it will be.");
  }
  return items;
}

export function buildLetter(result, comparison, details) {
  const given = details !== null && typeof details === "object" ? details : {};

  const date = detailOrBlank(given, "date", "[today's date]");
  const servicerName = detailOrBlank(given, "servicerName", "[your servicer's name]");
  const loanNumber = detailOrBlank(given, "loanNumber", "[your loan number]");
  const borrowerName = detailOrBlank(given, "borrowerName", "[your full name]");
  const propertyAddress = detailOrBlank(given, "propertyAddress", "[your property address]");

  const questions = questionLines(result, comparison);
  const isNoticeOfError = letterKind(result, comparison) === "NOTICE_OF_ERROR";
  const inputs = result.inputs;
  const low = result.lowPoint;
  const cushionMonthsWords = inputs.cushionMonths === 1 ? "1 month" : inputs.cushionMonths + " months";

  const lines = [];
  lines.push(date);
  lines.push("");
  lines.push("To: " + servicerName);
  lines.push("    [the address your servicer lists for error notices and information requests. Check your statement or the servicer's website. It is often not the payment address.]");
  lines.push("");
  lines.push("From: " + borrowerName);
  lines.push("      " + propertyAddress);
  lines.push("");
  if (isNoticeOfError) {
    lines.push("Re: Notice of error under 12 C.F.R. § 1024.35, and request for information under 12 C.F.R. § 1024.36");
  } else {
    lines.push("Re: Request for information under 12 C.F.R. § 1024.36");
  }
  lines.push("Mortgage loan number: " + loanNumber);
  lines.push("Property: " + propertyAddress);
  lines.push("");
  lines.push("I am writing about the annual escrow account statement dated [date on the statement] for the property above. I checked its numbers against the method in 12 CFR 1024.17 and Appendix E to that part. I am asking you to review the calculation.");
  lines.push("");
  lines.push("The numbers I used, taken from the statement's projection for the coming year:");
  lines.push("- Escrow balance at the start of the year: " + formatCents(inputs.startingBalanceCents));
  lines.push("- First month of the escrow year: " + monthName(inputs.startMonth));
  lines.push("- Expected bills:");
  for (const line of billLines(result)) lines.push(line);
  lines.push("  Total for the year: " + formatCents(result.annualDisbursementsCents));
  lines.push("");
  lines.push("What the method in 12 CFR 1024.17(d)(2) gives from those numbers:");
  lines.push("- Monthly payment (total ÷ 12): " + formatCents(result.baseMonthlyPaymentCents));
  lines.push("- Most cushion allowed (" + cushionMonthsWords + " of payments): " + formatCents(result.cushionCapCents));
  lines.push("- Lowest projected month-end balance: " + formatCents(low.projectedBalanceCents) + " in " + monthName(low.calendarMonth));
  lines.push("- Target starting balance: " + formatCents(result.requiredStartingBalanceCents));
  lines.push("- Result: " + describeResult(result));
  lines.push("");

  if (questions.length > 0) {
    if (isNoticeOfError) {
      // 12 CFR 1024.35(a): a notice of error names "the error the borrower
      // believes has occurred". Say so in plain words.
      lines.push("I believe the statement contains the error(s) described below.");
      lines.push("");
    }
    lines.push("What I am asking about:");
    for (let index = 0; index < questions.length; index++) {
      lines.push(index + 1 + ". " + questions[index]);
    }
    lines.push("");
  }

  if (isNoticeOfError) {
    lines.push("Please review this calculation. Then either confirm it is correct and explain why, or correct it and send me an updated statement. If you used different bill amounts or dates than the ones above, please send them to me, along with the escrow analysis worksheet.");
  } else if (questions.length > 0) {
    lines.push("Please answer the question" + (questions.length === 1 ? "" : "s") + " above, and send me the escrow analysis worksheet for this statement, including the bill amounts and dates you used.");
  } else {
    lines.push("My numbers line up with the statement. For my records, please send me the escrow analysis worksheet for this statement, including the bill amounts and dates you used.");
  }
  lines.push("");
  lines.push("This letter states arithmetic, not legal conclusions. I am not a lawyer. You may have newer bill amounts than I do, and if so I would like to see them.");
  lines.push("");
  lines.push("I understand the rules give you 5 business days to tell me you received this letter, and 30 business days to respond.");
  lines.push("");
  lines.push("You can reach me at [your phone number or email].");
  lines.push("");
  lines.push("Sincerely,");
  lines.push(borrowerName);

  return lines.join("\n");
}
