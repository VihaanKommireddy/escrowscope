// engine/explain.js — turns the numbers into plain-English sentences.
//
// VOICE RULES (from the brand guide — binding, and enforced by
// tests/explain.test.js, which scans every sentence this file can produce):
//   • Calm, never alarmed. Many payment jumps are lawful: real tax and
//     insurance increases running through a correctly-run account. ("Many",
//     not a bigger word: we have no source for how many.)
//   • Show the math: every claim carries its dollars.
//   • Plain words first; the citation is the footnote. Define jargon the
//     moment it appears. 6th–8th grade reading level, short sentences.
//   • Servicer-neutral. A mismatch is not proof of a mistake.
//   • We never promise a refund, never tell anyone what they "should" do,
//     and this is math, not legal advice.
//   • "This page", never "we / us / our", in any sentence a visitor can see
//     (QA audit #14). The page's promise is that nobody is told anything, so
//     "You told us" is the wrong phrase: say "You ticked …", "you chose …",
//     "this page …". Comments like this one may still say "we".
//   • One name for one thing: "escrow payment" (or "the regular escrow
//     payment", to tell it apart from a shortage or deficiency add-on) and
//     "the next 12 months".
//
// "TOO CLOSE TO CALL" (SPEC E3): the soft wording is used if and only if
// `result.nearLine` is set. This file never works out "near" on its own.
//
// Every function here is pure: numbers in, words out.

import { formatCents, MONTH_NAMES, MAX_MONEY_CENTS } from "./money.js";
import { projectWithPayment, TOLERANCE_PAYMENT_CENTS, paymentToleranceCents, countPaymentParts } from "./analyze.js";
import { letterKind } from "./letter.js";

// Official pages only. Every URL below appears in the research docs' source lists.
const URL_ECFR = "https://www.ecfr.gov/current/title-12/chapter-X/part-1024/subpart-B/section-1024.17";
const URL_CFPB_RULE = "https://www.consumerfinance.gov/rules-policy/regulations/1024/17/";
const URL_APPENDIX_E = "https://www.consumerfinance.gov/rules-policy/regulations/1024/e/";
const URL_HUD_1995 = "https://www.govinfo.gov/content/pkg/FR-1995-02-15/html/95-3683.htm";
const URL_ERROR_RULE = "https://www.consumerfinance.gov/rules-policy/regulations/1024/35/";
const URL_INFO_RULE = "https://www.consumerfinance.gov/rules-policy/regulations/1024/36/";
const URL_COMPLAINT = "https://www.consumerfinance.gov/complaint/";
const URL_COUNSELOR = "https://www.consumerfinance.gov/find-a-housing-counselor/";
// Contact details: only ones printed on the official page we link to. The
// CFPB complaint page prints this number. The housing-counselor finder page
// does not print a phone number, so that step carries its link and no phone.
const PHONE_CFPB = "855-411-2372";

const HUD_GUIDANCE_CITE = "HUD guidance, 60 FR 8812, 8813–14";

const CAVEAT =
  "A mismatch is not proof of a mistake. Your servicer may have newer bill amounts than the ones typed here.";

function monthName(calendarMonth) {
  return MONTH_NAMES[calendarMonth - 1];
}

function startWithCapital(text) {
  return text.slice(0, 1).toUpperCase() + text.slice(1);
}

function joinSentences(sentences) {
  return sentences.join(" ");
}

// ---------------------------------------------------------------------------
// What the federal math found, in sentences. Shared by the verdict and the
// next steps. `near` is result.nearLine (or null).
// ---------------------------------------------------------------------------

// Whole-dollar rounding comes from HUD's 1995 guidance, not from the text of
// the regulation, so the sentence says whose statement it is (math audit A6).
export const TOO_CLOSE_SENTENCE =
  "That is too close to call. HUD's 1995 guidance says dollar amounts may be rounded to the nearest dollar (60 FR 8812), so a servicer's figure could land on either side of the line.";

function surplusSentences(result) {
  const amount = formatCents(result.surplusCents);
  const near = result.nearLine;

  if (!result.inputs.borrowerCurrent) {
    return [
      "There is a surplus of " + amount + ": the account starts the next 12 months with that much more than the federal math calls for.",
      "The refund rule applies only when payments are current. You ticked that a payment was more than 30 days late, so the servicer may keep the surplus in the account, under the terms of your mortgage documents (" + result.cite + ").",
    ];
  }
  if (near !== null) {
    return [
      "By this page's math, to the cent, there is a surplus of " + amount + ".",
      "The rule draws a line at $50.00. At $50 or more, the surplus is refunded within 30 days of the escrow analysis. Under $50, the servicer may refund it or credit it toward next year's escrow payments (" + result.cite + ").",
      "This page's figure is within " + formatCents(near.toleranceCents) + " of that line. " + TOO_CLOSE_SENTENCE,
    ];
  }
  if (result.classification === "SURPLUS_REFUND_REQUIRED") {
    return [
      "There is a surplus of " + amount + ": the account starts the next 12 months with that much more than the federal math calls for.",
      "The rule says a surplus of $50 or more is refunded within 30 days of the date of the escrow analysis, as long as payments are current (" + result.cite + ").",
    ];
  }
  return [
    "There is a small surplus of " + amount + ".",
    "For a surplus under $50, the servicer may refund it or credit it toward next year's escrow payments (" + result.cite + ").",
  ];
}

function deficiencySentences(result) {
  const amount = formatCents(result.deficiencyCents);
  const payment = result.newMonthlyEscrowPayment;
  const near = result.nearLine;
  const sentences = [
    "Your account starts the next 12 months " + amount + " below $0. That is called a deficiency: the servicer paid a bill with its own money.",
  ];

  if (!result.inputs.borrowerCurrent) {
    sentences.push("You ticked that a payment was more than 30 days late. In that case this rule does not set how the deficiency is collected. Your mortgage documents control that (12 CFR 1024.17(f)(4)(iii)).");
    return sentences;
  }

  sentences.push("The servicer may collect it back in 2 or more equal monthly payments. At the fastest, that is " + formatCents(payment.deficiencySpreadCents) + " a month for 2 months.");
  if (near !== null && near.appliesTo === "deficiency") {
    sentences.push("This page's deficiency figure is within " + formatCents(near.toleranceCents) + " of one month's escrow payment (" + formatCents(near.lineCents) + "). " + TOO_CLOSE_SENTENCE + " It matters for one thing only: whether the servicer may ask for the whole deficiency within 30 days.");
  } else if (result.deficiencyCents < result.baseMonthlyPaymentCents) {
    sentences.push("Because it is smaller than one month's escrow payment, the servicer may instead ask for it within 30 days.");
  }
  return sentences;
}

function shortageSentences(result) {
  const amount = formatCents(result.shortageCents);
  const payment = result.newMonthlyEscrowPayment;
  const oneMonth = formatCents(result.baseMonthlyPaymentCents);
  const near = result.nearLine;
  const sentences = [];

  if (result.deficiencyCents > 0) {
    sentences.push("On top of that, there is a shortage of " + amount + ", measured from $0 up to the target. Splitting the two this way follows " + HUD_GUIDANCE_CITE + ", so no dollar is counted twice.");
  } else {
    sentences.push("There is a shortage of " + amount + ": the account starts the next 12 months that far below the target.");
  }
  sentences.push("Spread over 12 months, that adds " + formatCents(payment.shortageSpreadOver12Cents) + " a month. That is allowed.");

  if (near !== null && near.appliesTo === "shortage") {
    sentences.push("This page's shortage figure is within " + formatCents(near.toleranceCents) + " of one month's escrow payment (" + oneMonth + "). " + TOO_CLOSE_SENTENCE + " It matters for one thing only: whether the servicer may ask for the whole shortage within 30 days.");
  } else if (result.shortageCents < result.baseMonthlyPaymentCents) {
    sentences.push("Because the shortage is smaller than one month's escrow payment (" + oneMonth + "), the servicer may instead ask for it within 30 days, or leave it alone.");
  } else {
    sentences.push("Because the shortage is at least one month's escrow payment (" + oneMonth + "), the rule lists two choices: spread it over at least 12 months, or leave it alone.");
  }
  return sentences;
}

function outcomeSentences(result) {
  if (result.surplusCents > 0) return surplusSentences(result);

  let sentences = [];
  if (result.deficiencyCents > 0) sentences = sentences.concat(deficiencySentences(result));
  if (result.shortageCents > 0) sentences = sentences.concat(shortageSentences(result));
  if (sentences.length === 0) {
    sentences.push("Your starting balance is exactly what the federal math calls for: no shortage and no surplus.");
  }
  return sentences;
}

function outcomeHeadline(result) {
  if (result.surplusCents > 0) return "The federal math finds a surplus of " + formatCents(result.surplusCents) + ".";
  if (result.deficiencyCents > 0 && result.shortageCents > 0) {
    return "The federal math finds a deficiency of " + formatCents(result.deficiencyCents) + " and a shortage of " + formatCents(result.shortageCents) + ".";
  }
  if (result.deficiencyCents > 0) return "The federal math finds a deficiency of " + formatCents(result.deficiencyCents) + ".";
  if (result.shortageCents > 0) return "The federal math finds a shortage of " + formatCents(result.shortageCents) + ".";
  return "The federal math finds your account right on target.";
}

// One short phrase per flag, for the verdict's "what to look at" line.
// (The full sentence for each flag is comparison.flags[n].sentence.)
function shortFlagPhrase(flag) {
  const amount = formatCents(flag.amountCents);
  if (flag.kind === "CUSHION_OVER_CAP") return "the cushion is " + amount + " over the most the rule allows";
  if (flag.kind === "PAYMENT_ABOVE_MAX") {
    return "the new payment is " + amount + " a month above the most the federal math supports (" + formatCents(flag.perYearCents) + " over 12 months)";
  }
  if (flag.kind === "SPREAD_TOO_SHORT") return "the shortage is being repaid faster than the choices the rule lists";
  if (flag.kind === "LUMP_SUM_OFFERED") return "the statement offers a lump-sum choice the rule's list leaves out";
  if (flag.rowKey === "newMonthlyEscrow") return "the new payment is " + amount + " a month lower than the bills typed here call for";
  return "the shortage or surplus figure is " + amount + " apart";
}

// ---------------------------------------------------------------------------
// explainVerdict — the banner (SPEC C4 + E3).
// Two separate questions:  1. what does the federal math say?  (result)
//                          2. does the statement agree?        (comparison)
//
//   tone "flag"  (amber) any flag; or a refund-required surplus that is NOT in
//                        the too-close band — the 30-day rule always shows.
//   tone "info"  (teal)  nothing to compare; or the surplus is too close to
//                        the $50 line to call (never the refund banner there).
//   tone "clear" (green) the statement was checked and everything lines up.
//   tooCloseToCall       true exactly when result.nearLine is set.
// ---------------------------------------------------------------------------

export function explainVerdict(result, comparison) {
  const tooCloseToCall = result.nearLine !== null;
  const hasFlags = comparison.overall === "look-here";
  const matches = comparison.overall === "matches";
  const refundRequired = result.classification === "SURPLUS_REFUND_REQUIRED" && !tooCloseToCall;
  const nearTheFiftyLine = tooCloseToCall && result.nearLine.line === "SURPLUS_50";

  let tone = "info";
  if (matches) tone = "clear";
  if (nearTheFiftyLine) tone = "info";
  if (refundRequired) tone = "flag";
  if (hasFlags) tone = "flag";

  let icon = "i";
  let label = tooCloseToCall ? "Too close to call" : "Federal math only";
  if (tone === "clear") {
    icon = "✓";
    label = "Matches";
  }
  if (tone === "flag") {
    icon = "!";
    label = "Look here";
  }

  let headline = outcomeHeadline(result);
  if (matches) headline = "Your statement's math matches the federal method.";
  if (matches && refundRequired) {
    headline = "Your statement matches the federal math. It shows a surplus of " + formatCents(result.surplusCents) + ", which the rule says is refunded within 30 days.";
  }
  if (nearTheFiftyLine && !hasFlags) {
    headline = "The federal math finds a surplus of " + formatCents(result.surplusCents) + ". That is too close to the $50 line to call.";
  }
  if (hasFlags) {
    const count = comparison.flags.length;
    headline = count === 1 ? "One thing on your statement is worth a closer look." : count + " things on your statement are worth a closer look.";
  }

  const sentences = outcomeSentences(result);
  if (hasFlags) {
    sentences.push("Here is what to look at.");
    for (const flag of comparison.flags) {
      sentences.push(startWithCapital(shortFlagPhrase(flag)) + ".");
    }
    sentences.push(CAVEAT);
  }
  if (matches && (result.shortageCents > 0 || result.deficiencyCents > 0)) {
    sentences.push("Many payment jumps are lawful. They come from real tax and insurance increases.");
  }
  if (comparison.overall === "not-provided") {
    sentences.push("Add the numbers from your statement to see whether your servicer's math agrees.");
  }

  return {
    tone: tone,
    icon: icon,
    label: label,
    headline: headline,
    body: joinSentences(sentences),
    tooCloseToCall: tooCloseToCall,
  };
}

// ---------------------------------------------------------------------------
// explainSteps — the "show the math" panel: steps 1–6 with this account's own
// numbers, the paragraph each step comes from, and the official page.
// ---------------------------------------------------------------------------

function billsAsSum(result) {
  const bills = result.inputs.disbursements;
  const total = formatCents(result.annualDisbursementsCents);
  if (bills.length > 6) return bills.length + " bills add up to " + total;
  const amounts = bills.map((bill) => formatCents(bill.amountCents));
  if (amounts.length === 1) return amounts[0] + " (one bill)";
  return amounts.join(" + ") + " = " + total;
}

export function explainSteps(result) {
  const total = formatCents(result.annualDisbursementsCents);
  const monthly = formatCents(result.baseMonthlyPaymentCents);
  const cushion = formatCents(result.cushionCapCents);
  const add = formatCents(result.stepTwoAddCents);
  const required = formatCents(result.requiredStartingBalanceCents);
  const balance = formatCents(result.inputs.startingBalanceCents);
  const months = result.inputs.cushionMonths;

  let lowestStepOne = result.table[0];
  for (const row of result.table) {
    if (row.step1TrialBalanceCents < lowestStepOne.step1TrialBalanceCents) lowestStepOne = row;
  }

  let stepFourMath = "Starting from $0, the account never drops below $0, so nothing needs to be added.";
  if (result.stepTwoAddCents > 0) {
    stepFourMath = "Starting from $0, the lowest month is " + monthName(lowestStepOne.calendarMonth) + " at " + formatCents(lowestStepOne.step1TrialBalanceCents) + ". Add " + add + " to bring it up to $0.";
  }

  let cushionPlain = "A cushion is extra padding the servicer may hold for surprises. The most the rule allows is one-sixth of the year's bills, which is 2 months of escrow payments. This page rounds this one down, because it is a cap.";
  let cushionCite = "12 CFR 1024.17(c)(5)";
  if (months < 2) {
    cushionPlain = "A cushion is extra padding the servicer may hold for surprises. The federal limit is 2 months of escrow payments, but you chose " + (months === 1 ? "1 month" : "no cushion") + " as the limit in your mortgage documents, and the lower limit wins.";
    cushionCite = "12 CFR 1024.17(c)(8)";
  }

  let stepSixPlain = "Compare your real starting balance with the target. More than the target is a surplus. Less is a shortage.";
  let stepSixMath = balance + " − " + required + " = " + formatCents(result.differenceCents) + ". " + outcomeHeadline(result);
  let stepSixCite = "12 CFR 1024.17(b); " + result.cite;
  let stepSixUrl = URL_CFPB_RULE;
  if (result.deficiencyCents > 0) {
    stepSixPlain = "Your starting balance is below $0. The part below $0 is the deficiency. The shortage is then measured from $0 up to the target, so no dollar is counted twice. That split is HUD guidance from 1995, not the text of the regulation itself.";
    stepSixMath = "Deficiency: " + formatCents(result.deficiencyCents) + " (the part below $0). Shortage: " + required + " − $0.00 = " + formatCents(result.shortageCents) + ".";
    stepSixCite = HUD_GUIDANCE_CITE + "; 12 CFR 1024.17(b); " + result.cite;
    stepSixUrl = URL_HUD_1995;
  }

  return [
    {
      title: "Step 1. Add up next year's bills",
      plain: "Start with every bill your servicer expects to pay from escrow in the next 12 months. Escrow is the account your servicer uses to pay your property tax and insurance for you.",
      math: billsAsSum(result),
      cite: "12 CFR 1024.17(d)(2)(i)(A)",
      url: URL_ECFR,
    },
    {
      title: "Step 2. Divide by 12 to get the escrow payment",
      plain: "The regular escrow payment each month is one-twelfth of the year's bills. Repaying a shortage or deficiency can be added on top. If it does not divide evenly, this page rounds to the nearest cent. That rounding is this page's choice. The rule does not mention cents.",
      math: total + " ÷ 12 = " + monthly,
      cite: "12 CFR 1024.17(c)(1)(ii)",
      url: URL_CFPB_RULE,
    },
    {
      title: "Step 3. Find the most cushion allowed",
      plain: cushionPlain,
      math: total + " × " + months + " ÷ 12 = " + cushion,
      cite: cushionCite,
      url: URL_CFPB_RULE,
    },
    {
      title: "Step 4. Run the 12 months and find the lowest one",
      plain: "Pretend the account starts at $0. Each month, add the escrow payment and take away that month's bills. Then add just enough to lift the lowest month up to $0.",
      math: stepFourMath,
      cite: "12 CFR 1024.17(d)(2)(i)(A)–(B); Appendix E, Steps 1–2",
      url: URL_APPENDIX_E,
    },
    {
      title: "Step 5. Add the cushion to get the target",
      plain: "Add the cushion on top. The answer is the target: the most the servicer may hold at the start of the next 12 months. With that much, the lowest month lands right on the cushion.",
      math: add + " + " + cushion + " = " + required,
      cite: "12 CFR 1024.17(d)(2)(i)(C); Appendix E, Step 3",
      url: URL_APPENDIX_E,
    },
    {
      title: "Step 6. Compare with your real balance",
      plain: stepSixPlain,
      math: stepSixMath,
      cite: stepSixCite,
      url: stepSixUrl,
    },
  ];
}

// ---------------------------------------------------------------------------
// explainJump — "why did my payment jump?" Needs the old AND the new payment.
//
// Four parts that ALWAYS add up to exactly (new − old):
//   1. bills changed        = bills ÷ 12 (this year) − the old payment
//   2. shortage repayment   = whatever the new payment has above bills ÷ 12,
//                             up to the most the rule allows (shortage ÷ 12)
//   3. deficiency repayment = whatever is left above that, up to deficiency ÷ 2
//   4. unexplained          = whatever is still left. Above zero: more than the
//                             federal math supports. Below zero: the new
//                             payment is lower than the bills typed call for.
// Part 4 is worked out by subtraction, which is what makes the sum exact.
// ---------------------------------------------------------------------------

function smallerOf(a, b) {
  return a < b ? a : b;
}

// A usable payment: whole cents from $0 up to the tool's $10,000,000 limit.
// Anything else (NaN, Infinity, 1e20, negatives, fractions, text) counts as
// "not given", so absurd input can never make these functions throw (audit A14).
function isUsableCents(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_MONEY_CENTS;
}

export function explainJump(result, statement) {
  if (statement === null || typeof statement !== "object") return null;
  const oldCents = statement.currentMonthlyEscrowCents;
  const newCents = statement.newMonthlyEscrowCents;
  const bothGiven = isUsableCents(oldCents) && isUsableCents(newCents);
  if (!bothGiven) return null;

  const base = result.baseMonthlyPaymentCents;
  const payment = result.newMonthlyEscrowPayment;
  const changeCents = newCents - oldCents;

  const billsChangedCents = base - oldCents;

  let shortagePartCents = 0;
  let deficiencyPartCents = 0;
  const aboveBase = newCents - base;
  // Borrower not current + a deficiency: (f)(4)(iii) lets the mortgage
  // documents, not this rule, set how the deficiency is collected. So there is
  // no federal "deficiency ÷ 2" ceiling to measure against, and whatever sits
  // above base + shortage repayment is deficiency repayment — NOT "more than
  // the federal math supports". This keeps explainJump in step with
  // compare.js, which calls the same payment a match (math audit A3).
  const deficiencySetByMortgageDocuments = result.deficiencyCents > 0 && !result.inputs.borrowerCurrent;
  if (aboveBase > 0) {
    shortagePartCents = smallerOf(aboveBase, payment.shortageSpreadOver12Cents);
    const stillLeft = aboveBase - shortagePartCents;
    deficiencyPartCents = deficiencySetByMortgageDocuments ? stillLeft : smallerOf(stillLeft, payment.deficiencySpreadCents);
  }
  const unexplainedCents = changeCents - billsChangedCents - shortagePartCents - deficiencyPartCents;

  let billsSentence = "Your yearly bills divided by 12 come to " + formatCents(base) + " a month. That is the same as your old escrow payment.";
  if (billsChangedCents > 0) billsSentence = "Your yearly bills divided by 12 come to " + formatCents(base) + " a month. That is " + formatCents(billsChangedCents) + " more than your old escrow payment.";
  if (billsChangedCents < 0) billsSentence = "Your yearly bills divided by 12 come to " + formatCents(base) + " a month. That is " + formatCents(-billsChangedCents) + " less than your old escrow payment.";

  let shortageSentence = "None of the new payment is shortage repayment.";
  if (shortagePartCents > 0) shortageSentence = formatCents(shortagePartCents) + " a month goes to repaying the shortage of " + formatCents(result.shortageCents) + ". This part stops once the shortage is repaid.";

  let deficiencySentence = "None of the new payment is deficiency repayment.";
  if (deficiencyPartCents > 0) deficiencySentence = formatCents(deficiencyPartCents) + " a month goes to repaying the deficiency of " + formatCents(result.deficiencyCents) + ". A deficiency is a balance below $0.";
  if (deficiencyPartCents > 0 && deficiencySetByMortgageDocuments) {
    deficiencySentence = formatCents(deficiencyPartCents) + " a month is above the bills and the shortage repayment. With a deficiency of " + formatCents(result.deficiencyCents) + " and a payment more than 30 days late, this is deficiency repayment set by your mortgage documents, not by this rule (12 CFR 1024.17(f)(4)(iii)).";
  }

  // "Small enough to be rounding" uses the same scaled tolerance compare.js
  // uses for the same purpose: $1.00 per separately rounded part (audit A1).
  const roundingCents = paymentToleranceCents(countPaymentParts(payment));
  let unexplainedSentence = "Nothing is left over. The federal math explains the whole change.";
  if (unexplainedCents > roundingCents) unexplainedSentence = formatCents(unexplainedCents) + " a month is more than the federal math supports from the numbers typed here. It is worth asking your servicer what it covers.";
  if (unexplainedCents > 0 && unexplainedCents <= roundingCents) unexplainedSentence = formatCents(unexplainedCents) + " a month is left over. That is small enough to be whole-dollar rounding, which HUD's 1995 guidance describes (60 FR 8812).";
  if (unexplainedCents < 0) unexplainedSentence = "The new payment is " + formatCents(-unexplainedCents) + " a month lower than the bills typed here call for. Collecting less is allowed.";

  let note = "Many payment jumps are lawful. They come from real tax and insurance increases.";
  if (changeCents <= 0) note = "Your escrow payment did not go up.";
  if (shortagePartCents > 0) note = "About " + formatCents(shortagePartCents) + " of the new payment is shortage repayment. It should drop off after the shortage is repaid, if your bills stay the same.";

  return {
    oldCents: oldCents,
    newCents: newCents,
    changeCents: changeCents,
    parts: [
      // The label says what this number really is: this year's bills ÷ 12 minus
      // the OLD PAYMENT. If the old payment carried a shortage add-on, this can
      // be negative even though the bills themselves went up (math audit A13).
      { key: "billsChanged", label: "Bills now versus your old payment", cents: billsChangedCents, sentence: billsSentence },
      { key: "shortageRepayment", label: "Repaying a shortage", cents: shortagePartCents, sentence: shortageSentence },
      { key: "deficiencyRepayment", label: "Repaying a deficiency", cents: deficiencyPartCents, sentence: deficiencySentence },
      { key: "unexplained", label: "Not explained by the federal math", cents: unexplainedCents, sentence: unexplainedSentence },
    ],
    note: note,
  };
}

// ---------------------------------------------------------------------------
// explainServicerLine — the second line on the chart (SPEC D5): what the
// account will really hold if the person pays what the STATEMENT says.
// ---------------------------------------------------------------------------

export function explainServicerLine(result, account, statement) {
  if (statement === null || typeof statement !== "object") return null;
  const paymentCents = statement.newMonthlyEscrowCents;
  if (!isUsableCents(paymentCents)) return null;

  const balancesCents = projectWithPayment(account, paymentCents);

  // Lowest month; the earliest month wins a tie, same as analyze.js.
  let lowIndex = 0;
  for (let index = 1; index < balancesCents.length; index++) {
    if (balancesCents[index] < balancesCents[lowIndex]) lowIndex = index;
  }
  const lowPoint = {
    balanceCents: balancesCents[lowIndex],
    month: result.table[lowIndex].month,
    calendarMonth: result.table[lowIndex].calendarMonth,
  };

  // Signed on purpose: above zero = held above the legal cushion; below zero =
  // the low point dips under it.
  const aboveCushionCents = lowPoint.balanceCents - result.cushionCapCents;

  const owesSomething = result.shortageCents > 0 || result.deficiencyCents > 0;
  // This compares against bills ÷ 12 ALONE, which is one rounded figure, so
  // the single-part $1.00 tolerance is the right one here (not the scaled
  // $2–$3 used against the multi-part maximum; decided on its merits, audit A1).
  const includesShortageAddOn = owesSomething && paymentCents > result.baseMonthlyPaymentCents + TOLERANCE_PAYMENT_CENTS;

  let label = "With your statement's payment (" + formatCents(paymentCents) + " a month)";
  if (includesShortageAddOn) label = "With your statement's payment (" + formatCents(paymentCents) + " a month, which already includes shortage repayment)";

  let sentence = "Paying " + formatCents(paymentCents) + " a month, your lowest month-end balance would be " + formatCents(lowPoint.balanceCents) + " in " + monthName(lowPoint.calendarMonth) + ".";
  // With a surplus on the account, part of what sits above the cushion is the
  // surplus itself, which the statement may already show as refundable. After
  // a refund the line would sit lower, so say "before any surplus refund".
  // With no surplus there is no refund to mention (math audit A7).
  if (aboveCushionCents > 0 && result.surplusCents > 0) sentence = sentence + " Held above the legal cushion, before any surplus refund: " + formatCents(aboveCushionCents) + ".";
  if (aboveCushionCents > 0 && result.surplusCents === 0) sentence = sentence + " Held above the legal cushion: " + formatCents(aboveCushionCents) + ".";
  if (aboveCushionCents < 0) sentence = sentence + " That is " + formatCents(-aboveCushionCents) + " under the most cushion the rule allows.";
  if (aboveCushionCents === 0) sentence = sentence + " That lands right on the most cushion the rule allows.";
  if (includesShortageAddOn) sentence = sentence + " This payment already includes repayment of a shortage, so this line shows what the account will really hold.";

  return {
    balancesCents: balancesCents,
    lowPoint: lowPoint,
    aboveCushionCents: aboveCushionCents,
    includesShortageAddOn: includesShortageAddOn,
    label: label,
    sentence: sentence,
  };
}

// ---------------------------------------------------------------------------
// nextSteps — what a homeowner can do, by outcome (research doc 03 §3).
// Options, never orders. Real deadlines, official links only.
// ---------------------------------------------------------------------------

export function nextSteps(result, comparison) {
  const steps = [];
  const hasFlags = comparison.overall === "look-here";
  const near = result.nearLine;
  const flagKinds = comparison.flags.map((flag) => flag.kind);

  if (near !== null) {
    let what = "whether a refund is due (at $50 or more) or a refund or credit is the servicer's choice (under $50)";
    if (near.line === "ONE_MONTH_PAYMENT") what = "whether the servicer may ask for the whole " + near.appliesTo + " within 30 days";
    steps.push({
      title: "This one is too close to call",
      body: "This page's figure, to the cent, is " + formatCents(near.amountCents) + ". The line in the rule is " + formatCents(near.lineCents) + ". " + TOO_CLOSE_SENTENCE + " It decides " + what + ". You can ask your servicer for its exact figure.",
      url: URL_CFPB_RULE,
    });
  } else if (result.classification === "SURPLUS_REFUND_REQUIRED") {
    steps.push({
      title: "Watch for the refund",
      body: "The rule says a surplus of $50 or more is refunded within 30 days of the date of the escrow analysis. That date is usually printed on your statement. If it has passed and nothing has arrived, you can call your servicer and ask when the refund was sent.",
      url: URL_CFPB_RULE,
    });
  }

  if (hasFlags) {
    steps.push({
      title: "Call your servicer first",
      body: "Have your loan number ready. You can ask: \"What is my lowest projected balance, what is my required minimum balance, and which bill caused the change?\" " + CAVEAT,
    });
    if (flagKinds.includes("CUSHION_OVER_CAP")) {
      steps.push({
        title: "Ask about the cushion",
        body: "You can ask your servicer to point to the line where the cushion is worked out. The cap is one-sixth of the year's bills, unless your mortgage documents or state law set it lower (12 CFR 1024.17(c)(5)).",
        url: URL_CFPB_RULE,
      });
    }
    if (flagKinds.includes("SPREAD_TOO_SHORT") || flagKinds.includes("LUMP_SUM_OFFERED")) {
      steps.push({
        title: "Ask how the shortage is being repaid",
        body: "The rule lists the servicer's choices. Small shortage (under one month's escrow payment): leave it, ask for it within 30 days, or spread it over at least 12 months. Larger shortage: leave it, or spread it over at least 12 months (12 CFR 1024.17(f)(3)).",
        url: URL_CFPB_RULE,
      });
    }
  }

  // Only when the statement was actually checked and lines up. With no
  // statement numbers typed in, nothing has "checked out" yet (math audit A9).
  if (comparison.overall === "matches" && (result.shortageCents > 0 || result.deficiencyCents > 0)) {
    steps.push({
      title: "When the math checks out, the cost is the bills",
      body: "A higher payment usually means higher tax or insurance bills. Things people look into: shopping for homeowners insurance, a homestead exemption or a property tax appeal with the county, and whether to pay a shortage at once or let it spread. Either way, the regular escrow payment follows the bills.",
    });
  }

  if (comparison.overall === "not-provided") {
    steps.push({
      title: "Add your statement's numbers",
      body: "Type in the new payment, the required minimum balance, and the shortage or surplus from your statement. Then this page can check your servicer's math line by line.",
    });
  }

  // Which letter leads is decided by letterKind (letter.js) and nowhere else
  // (math audit A2). The notice-of-error step appears only when a flag asserts
  // a discrepancy; otherwise the request for information leads, because a
  // notice of error is for saying "I believe there is an error".
  // The clocks say "generally": the rules have exceptions (for example a
  // repeated or overbroad request, or one sent more than a year after the loan
  // was transferred or paid off) (math audit A8).
  const isNoticeOfError = letterKind(result, comparison) === "NOTICE_OF_ERROR";
  if (isNoticeOfError) {
    steps.push({
      title: "Put it in writing: a notice of error",
      body: "If the call does not settle it, you can send a written notice of error under 12 CFR 1024.35. Send it to the address your servicer lists for error notices, which is often not the payment address. The servicer generally has 5 business days to say it got your letter. It generally has 30 business days to fix the problem or explain in writing why it found none. It may take 15 more business days if it tells you so in writing first, with reasons. The letter on this page is a starting point.",
      url: URL_ERROR_RULE,
    });
  }
  const requestOpening = isNoticeOfError
    ? "You can also ask in writing for the full escrow analysis worksheet under 12 CFR 1024.36."
    : "You can ask in writing for the full escrow analysis worksheet, and ask any question about it, under 12 CFR 1024.36. The letter on this page is a starting point.";
  steps.push({
    title: "Ask for the worksheet: a request for information",
    body: requestOpening + " Send it to the address your servicer lists for information requests. The servicer generally has 5 business days to say it got your request. It generally has 30 business days to answer. It may take 15 more business days if it tells you so in writing first. It may not charge a fee for this. If the answer shows a mistake, a notice of error under 12 CFR 1024.35 is the next letter.",
    url: URL_INFO_RULE,
  });
  steps.push({
    title: "File a complaint with the CFPB",
    body: "The Consumer Financial Protection Bureau (CFPB) is the federal agency that enforces this rule. It sends your complaint to the company and asks for a response. It is free. Include everything the first time.",
    url: URL_COMPLAINT,
    phone: PHONE_CFPB,
  });
  steps.push({
    title: "Talk to a HUD-approved housing counselor",
    body: "A housing counselor gives free or low-cost, independent help with mortgage questions. You can bring a printout of this page. This page is math, not legal advice.",
    url: URL_COUNSELOR, // no phone: the linked page does not print one (math audit A15)
  });

  return steps;
}
