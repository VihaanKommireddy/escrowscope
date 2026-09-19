// engine/compare.js — "your statement says" vs "the federal math says".
//
// analyze.js never looks at the servicer's numbers. This file is the only
// place they meet the federal math, line by line, with the gap in dollars.
//
// GROUND RULES
// 1. Everything the regulation's method produces is a CEILING — (d)(1): "The
//    steps set forth in this section result in maximum limits. Servicers may
//    use accounting procedures that result in lower target balances." So a
//    servicer at or UNDER a limit is fine. We only say "over-limit" when a
//    number is over.
// 2. A mismatch is NOT proof of a mistake. The servicer may know about a newer
//    tax bill than the one typed in. Every sentence here is a calm statement
//    of arithmetic, never an accusation.
// 3. Tolerances (choices, not law): $7.00 on balances, and $1.00 on a monthly
//    payment FOR EACH separately rounded part of it ($1 / $2 / $3 — see
//    paymentToleranceCents in analyze.js). Why: HUD's 1995 guidance says
//    dollar amounts may be rounded to the nearest dollar (60 FR 8812). That is
//    guidance, not regulation text, so the words on the page say "HUD's 1995
//    guidance says…", never that rounding is settled law.
//
// WHAT COMES BACK
//   provided  did we have at least one thing we could check?
//   rows      one per statement number the person filled in:
//             { key, label, statementCents, federalCents, gapCents, status, note }
//             status: "match" | "differs" | "over-limit" | "not-compared".
//             gap = statement − federal.  "not-compared" is only ever used
//             for the cushion row, together with a nudge (see below).
//   nudges    ALWAYS present (empty when none): { kind, field, message, letterLine }.
//             A nudge is a "please double-check what you typed" note. It is
//             never a flag: it cannot make `overall` "look-here", and a
//             not-compared row cannot make it "matches" on its own.
//   flags     { kind, rowKey?, amountCents, perYearCents?, cite, sentence, letterLine }
//             `sentence` talks to the homeowner ("Your statement…").
//             `letterLine` says the same thing in the homeowner's own voice
//             ("The statement…, by my math…") for the letter in letter.js.
//             `amountCents` is "the dollars this flag is about":
//               CUSHION_OVER_CAP   how far the statement's cushion is over the cap
//               AMOUNT_DIFFERS     the gap between the two figures
//               KIND_DIFFERS       the gap between the two figures
//               PAYMENT_ABOVE_MAX  how far over, PER MONTH (perYearCents = × 12)
//               SPREAD_TOO_SHORT   the shortage being repaid
//               LUMP_SUM_OFFERED   the shortage being repaid
//   overall   "look-here" if there is any flag, else "matches" if we checked
//             something, else "not-provided".
// Every row that is not a "match" has a flag pointing at it (`rowKey`), so the
// table and the verdict can never disagree.

import { TOLERANCE_BALANCE_CENTS, paymentToleranceCents, countPaymentParts, splitDifference } from "./analyze.js";
import { formatCents, divideRoundHalfUp, noNegativeZero, MAX_MONEY_CENTS } from "./money.js";

const CITE_PREFIX = "12 CFR 1024.17";
const CLAIM_CITE = CITE_PREFIX + "(b) + " + CITE_PREFIX + "(d)(2)";
const PAYMENT_CITE = CITE_PREFIX + "(c)(1)(ii)";
const REFUND_THRESHOLD_CENTS = 5000;

// ---------- reading the statement defensively ----------
// The page validates first, but this function should never crash on a
// half-filled statement. A field that is not usable is treated as not given.

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Usable money: a whole number of cents from $0 up to the tool's $10,000,000
// limit. Anything else — NaN, Infinity, 1e20, a negative, a fraction, text —
// counts as "not given", so absurd input can never make the math throw or
// lose exactness (math audit A14).
function isGivenCents(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_MONEY_CENTS;
}

const MAX_SPREAD_MONTHS = 360; // same limit validateStatement uses

function readSpreadMonths(statement) {
  const months = statement.shortageSpreadMonths;
  if (Number.isSafeInteger(months) && months >= 1 && months <= MAX_SPREAD_MONTHS) return months;
  return null; // not given
}

function readClaimedKind(statement) {
  const kind = statement.claimedKind;
  if (kind === "surplus" || kind === "shortage" || kind === "deficiency" || kind === "none") return kind;
  return null;
}

// ---------- the servicer's view ----------
// If the statement uses a SMALLER cushion than the cap, that is allowed, and
// the servicer's shortage is smaller by the same amount. Checking their
// shortage against OUR maximum would flag them for being generous. So every
// balance comparison below uses "the federal math, run with the cushion the
// statement uses — but never more than the cap".

// A likely mix-up (math audit B2): someone types their LOWEST PROJECTED
// BALANCE into "required minimum balance". On most statements those are two
// different lines. If the typed number is over the cap AND is the same as the
// federal low point (within $7.00), we cannot tell a mix-up from a real
// oversized cushion, so we do not accuse: no CUSHION_OVER_CAP flag, the row is
// "not-compared", and a two-sided nudge keeps the dollars visible.
// Known limit, on purpose: a servicer really holding an oversized cushion,
// with the balance sitting exactly on it, also lands here — which is why the
// nudge spells out "if your statement really does list $X…".
function typedMinimumLooksLikeLowPoint(result, typedCents) {
  const isOverTheCap = typedCents - result.cushionCapCents > TOLERANCE_BALANCE_CENTS;
  const isTheLowPoint = Math.abs(typedCents - result.lowPoint.projectedBalanceCents) <= TOLERANCE_BALANCE_CENTS;
  return isOverTheCap && isTheLowPoint;
}

function buildServicerView(result, statement) {
  const capCents = result.cushionCapCents;
  let cushionUsedCents = capCents;
  let extraCushionCents = 0;

  if (isGivenCents(statement.requiredMinimumBalanceCents)) {
    const theirs = statement.requiredMinimumBalanceCents;
    if (theirs < capCents) cushionUsedCents = theirs;
    if (theirs - capCents > TOLERANCE_BALANCE_CENTS) extraCushionCents = theirs - capCents;
    // If the number is probably the low point, do not blame an "extra cushion" anywhere.
    if (typedMinimumLooksLikeLowPoint(result, theirs)) extraCushionCents = 0;
  }

  const startingBalanceCents = result.inputs.startingBalanceCents;
  const requiredStartCents = result.requiredStartingBalanceCents - (capCents - cushionUsedCents);

  return {
    usesSmallerCushion: cushionUsedCents < capCents,
    cushionUsedCents: cushionUsedCents,
    extraCushionCents: extraCushionCents,
    differenceCents: startingBalanceCents - requiredStartCents,
    amounts: splitDifference(startingBalanceCents, requiredStartCents),
  };
}

// Which side of "one month's escrow payment" is this shortage on?
// HUD's 1995 guidance says dollar amounts may be rounded to the nearest dollar
// (60 FR 8812). Within $7.00 of the line, a servicer rounding that way could
// land on either side (SPEC E3), so we answer "too-close" and the flags that
// depend on the tier stay quiet.
function shortageTier(shortageCents, oneMonthPaymentCents) {
  if (Math.abs(shortageCents - oneMonthPaymentCents) <= TOLERANCE_BALANCE_CENTS) return "too-close";
  if (shortageCents < oneMonthPaymentCents) return "small";
  return "large";
}

// ---------- words ----------

function describeAmounts(amounts) {
  if (amounts.surplusCents > 0) return "a surplus of " + formatCents(amounts.surplusCents);
  if (amounts.deficiencyCents > 0 && amounts.shortageCents > 0) {
    return "a deficiency of " + formatCents(amounts.deficiencyCents) + " plus a shortage of " + formatCents(amounts.shortageCents);
  }
  if (amounts.deficiencyCents > 0) return "a deficiency of " + formatCents(amounts.deficiencyCents);
  if (amounts.shortageCents > 0) return "a shortage of " + formatCents(amounts.shortageCents);
  return "no shortage and no surplus (the account is right on target)";
}

function describeClaim(kind, amountCents) {
  if (kind === "none") return "no shortage and no surplus";
  if (amountCents === null) return "a " + kind;
  return "a " + kind + " of " + formatCents(amountCents);
}

function kindsFound(amounts) {
  const kinds = [];
  if (amounts.surplusCents > 0) kinds.push("surplus");
  if (amounts.deficiencyCents > 0) kinds.push("deficiency");
  if (amounts.shortageCents > 0) kinds.push("shortage");
  return kinds;
}

function closestTo(target, candidates) {
  let best = candidates[0];
  for (const candidate of candidates) {
    if (Math.abs(target - candidate) < Math.abs(target - best)) best = candidate;
  }
  return best;
}

// ---------- row 1: the cushion ----------
// (c)(5): "The cushion must be no greater than one-sixth (1/6) of the estimated
// total annual disbursements". (c)(8): mortgage documents or state law may set
// a lower limit, and then that lower limit applies.

function compareCushion(result, statement, rows, flags, nudges) {
  if (!isGivenCents(statement.requiredMinimumBalanceCents)) return;

  const theirs = statement.requiredMinimumBalanceCents;
  const capCents = result.cushionCapCents;
  const gapCents = theirs - capCents;
  const months = result.inputs.cushionMonths;
  const cite = months === 2 ? CITE_PREFIX + "(c)(5)" : CITE_PREFIX + "(c)(8)";

  // Audit B2: probably the low point typed into the wrong box. Ask, do not flag.
  if (typedMinimumLooksLikeLowPoint(result, theirs)) {
    const typed = formatCents(theirs);
    rows.push({
      key: "requiredMinimumBalance",
      label: "Required minimum balance (the cushion)",
      statementCents: theirs,
      federalCents: capCents,
      gapCents: gapCents,
      status: "not-compared",
      note: "This was not compared, because the number typed is the same as your lowest projected balance. Please check which line of the statement it came from.",
    });
    nudges.push({
      kind: "MINIMUM_LOOKS_LIKE_LOW_POINT",
      field: "statement.requiredMinimumBalanceCents",
      message:
        "The number you typed as the required minimum balance (" + typed + ") is the same as your lowest projected balance. On most statements those are two different lines, so please check which one you typed. If your statement really does list " +
        typed + " as the required minimum, that is " + formatCents(gapCents) + " above the most the rule allows here (" + formatCents(capCents) + "), and it is worth asking your servicer about (" + cite + ").",
      letterLine:
        "The statement lists a required minimum balance of " + typed + ". By my math, the most cushion " + cite + " allows here is " +
        formatCents(capCents) + ". Please confirm the required minimum balance (cushion) you used and how it was worked out.",
    });
    return;
  }

  let status = "match";
  let note = "This matches the most cushion the federal rule allows here.";
  if (gapCents > TOLERANCE_BALANCE_CENTS) {
    status = "over-limit";
    note = "This is more cushion than the federal rule allows here.";
  } else if (gapCents < -TOLERANCE_BALANCE_CENTS) {
    note = "Your servicer keeps a smaller cushion than the most the rule allows. That is allowed. The rule sets a ceiling, not a required amount.";
  }

  rows.push({
    key: "requiredMinimumBalance",
    label: "Required minimum balance (the cushion)",
    statementCents: theirs,
    federalCents: capCents,
    gapCents: gapCents,
    status: status,
    note: note,
  });

  if (status !== "over-limit") return;

  let limitWords = "2 months of escrow payments (one-sixth of your yearly bills)";
  if (months === 1) limitWords = "1 month of escrow payments, the limit you told us your mortgage documents set";
  if (months === 0) limitWords = "no cushion at all, the limit you told us your mortgage documents set";

  flags.push({
    kind: "CUSHION_OVER_CAP",
    rowKey: "requiredMinimumBalance",
    amountCents: gapCents,
    cite: cite,
    sentence:
      "Your statement keeps a cushion of " + formatCents(theirs) + ". The most the federal rule allows here is " +
      formatCents(capCents) + ": " + limitWords + ". That is " + formatCents(gapCents) + " over the limit. (" + cite + ")",
    letterLine:
      "The statement uses a required minimum balance (cushion) of " + formatCents(theirs) + ". By my math, the most " + cite +
      " allows here is " + formatCents(capCents) + ". That is " + formatCents(gapCents) + " more.",
  });
}

// ---------- row 2: the shortage / surplus / deficiency the statement found ----------
// (b): surplus and shortage are "current balance vs. target balance"; a
// deficiency is "the amount of a negative balance".

function compareClaim(result, statement, view, rows, flags) {
  const kind = readClaimedKind(statement);
  if (kind === null) return; // an amount with no kind cannot be compared

  const amounts = view.amounts;
  const found = kindsFound(amounts);
  const kindsAgree = kind === "none" ? found.length === 0 : found.includes(kind);
  const hasAmount = kind === "none" || isGivenCents(statement.claimedAmountCents);

  // A kind with no amount: all we can compare is the kind.
  if (!hasAmount) {
    const clearlyDifferent = !kindsAgree && Math.abs(view.differenceCents) > TOLERANCE_BALANCE_CENTS;
    if (clearlyDifferent) {
      flags.push({
        kind: "KIND_DIFFERS",
        amountCents: Math.abs(view.differenceCents),
        cite: CLAIM_CITE,
        sentence:
          "Your statement shows " + describeClaim(kind, null) + ". From the numbers you typed, the federal math finds " +
          describeAmounts(amounts) + " instead. (" + CLAIM_CITE + ")",
        letterLine:
          "The statement shows " + describeClaim(kind, null) + ". By my math, using the method in " + CLAIM_CITE +
          ", the account has " + describeAmounts(amounts) + ".",
      });
    }
    return;
  }

  const claimedCents = kind === "none" ? 0 : statement.claimedAmountCents;

  // What the federal math has to say about THIS kind of amount.
  //   surplus    → the signed difference (negative means: a shortage instead)
  //   shortage   → the shortage (negative means: a surplus instead)
  //   deficiency → the deficiency ($0 when the balance is not below $0)
  //   none       → the signed difference
  // When a deficiency AND a shortage both exist, a statement may name one part
  // or the total. We compare with whichever is closer, so a statement is never
  // flagged just for how it words the split.
  const totalBelowTarget = amounts.deficiencyCents + amounts.shortageCents;
  let federalCents = view.differenceCents;
  let label = "Surplus (+) or shortage (−)";
  if (kind === "surplus") {
    label = "Surplus";
  }
  if (kind === "shortage") {
    label = "Shortage";
    federalCents = noNegativeZero(-view.differenceCents);
    if (amounts.deficiencyCents > 0) federalCents = closestTo(claimedCents, [amounts.shortageCents, totalBelowTarget]);
  }
  if (kind === "deficiency") {
    label = "Deficiency";
    federalCents = closestTo(claimedCents, [amounts.deficiencyCents, totalBelowTarget]);
    if (amounts.deficiencyCents === 0) federalCents = 0;
  }

  const gapCents = claimedCents - federalCents;
  const isMatch = Math.abs(gapCents) <= TOLERANCE_BALANCE_CENTS;

  let note = "The federal math finds " + describeAmounts(amounts) + ". That matches your statement.";
  if (!isMatch) note = "The federal math finds " + describeAmounts(amounts) + ".";
  if (view.usesSmallerCushion) note = note + " (Worked out with the smaller cushion your statement uses.)";

  rows.push({
    key: "claimedAmount",
    label: label,
    statementCents: claimedCents,
    federalCents: federalCents,
    gapCents: gapCents,
    status: isMatch ? "match" : "differs",
    note: note,
  });

  if (isMatch) return;

  const sizeOfGap = Math.abs(gapCents);
  let sentence =
    "Your statement shows " + describeClaim(kind, claimedCents) + ". From the numbers you typed, the federal math finds " +
    describeAmounts(amounts) + (kindsAgree ? "" : " instead") + ". That is a gap of " + formatCents(sizeOfGap) + ". (" + CLAIM_CITE + ")";

  if (view.usesSmallerCushion) {
    sentence = sentence + " This was worked out with the smaller cushion your statement uses.";
  }
  if (view.extraCushionCents > 0 && Math.abs(sizeOfGap - view.extraCushionCents) <= TOLERANCE_BALANCE_CENTS) {
    sentence = sentence + " This gap is the same size as the extra cushion, so the cushion is the likely reason.";
  }
  if (kind === "deficiency" && amounts.deficiencyCents === 0) {
    // The choices for a shortage depend on its size, (f)(3)(i)–(ii), so say
    // them correctly for this tier (math audit A5). A deficiency, by
    // contrast, may be collected in as few as 2 monthly payments, (f)(4).
    const tier = shortageTier(amounts.shortageCents, result.baseMonthlyPaymentCents);
    let choices = "leave it alone, or spread it over at least 12 months (a shortage smaller than one month's escrow payment may also be asked for within 30 days)";
    if (tier === "small") choices = "leave it alone, ask for it within 30 days, or spread it over at least 12 months";
    if (tier === "large") choices = "leave it alone, or spread it over at least 12 months";
    sentence =
      sentence + " A deficiency means the balance is below $0. The starting balance typed here is not below $0, so the federal math counts this as a shortage. The label matters, because the rule lists different choices for each. For this shortage the servicer may " +
      choices + ". A deficiency may be collected faster, in as few as 2 monthly payments. One caution: if your balance really was below $0 on the day of the analysis, the statement can correctly call that part a deficiency, even though the projected starting balance typed here is positive.";
  }

  flags.push({
    kind: kindsAgree ? "AMOUNT_DIFFERS" : "KIND_DIFFERS",
    rowKey: "claimedAmount",
    amountCents: sizeOfGap,
    cite: CLAIM_CITE,
    sentence: sentence,
    letterLine:
      "The statement shows " + describeClaim(kind, claimedCents) + ". By my math, using the method in " + CLAIM_CITE +
      ", the account has " + describeAmounts(amounts) + ". That is a gap of " + formatCents(sizeOfGap) + ".",
  });
}

// ---------- row 3: the new monthly escrow payment ----------
// The MOST the monthly escrow line can lawfully be (reg notes §8):
//     bills ÷ 12  +  shortage ÷ 12  +  deficiency ÷ 2 (first 2 months only)
// analyze.js already worked that out: monthlyEscrowWhileRepayingDeficiencyCents.
//
// But the maximum is not the only lawful figure. The servicer may also:
//   • collect a small shortage as one payment within 30 days, or do nothing
//     about a shortage at all → the monthly line is just bills ÷ 12
//   • spread the shortage over MORE than 12 months → a smaller add-on
//     (the statement's "spread over ___ months" tells us which)
//   • credit a surplus under $50 against next year's payments → slightly less
//   • pick any number of months (2 or more) for a deficiency → anything from
//     the base up to the maximum
// So: over the maximum → "over-limit". Equal to one of the lawful figures →
// "match". Anything else is under the maximum, which is allowed, but it means
// the numbers typed and the statement do not line up → "differs", with a
// sentence that says lower is allowed.

function lawfulPaymentFigures(result, view, spreadMonths) {
  const baseCents = result.baseMonthlyPaymentCents;
  const figures = [baseCents];

  // A spread of 1 month is a lump sum: it is not part of the monthly line.
  if (spreadMonths >= 2) {
    if (view.amounts.shortageCents > 0) {
      figures.push(baseCents + divideRoundHalfUp(view.amounts.shortageCents, spreadMonths));
    }
    if (result.shortageCents > 0) {
      figures.push(baseCents + divideRoundHalfUp(result.shortageCents, spreadMonths));
    }
  }

  // (f)(2)(i): a surplus under $50 may be credited "against the next year's
  // escrow payments". The rule does not say how; we assume 12 equal credits.
  const surplusCents = view.amounts.surplusCents;
  if (surplusCents > 0 && surplusCents < REFUND_THRESHOLD_CENTS && result.inputs.borrowerCurrent) {
    figures.push(baseCents - divideRoundHalfUp(surplusCents, 12));
  }

  figures.push(result.newMonthlyEscrowPayment.monthlyEscrowAfterDeficiencyRepaidCents);
  figures.push(result.newMonthlyEscrowPayment.monthlyEscrowWhileRepayingDeficiencyCents);
  return figures;
}

function describeMaximum(result) {
  const parts = ["bills ÷ 12"];
  if (result.newMonthlyEscrowPayment.shortageSpreadOver12Cents > 0) parts.push("shortage ÷ 12");
  if (result.newMonthlyEscrowPayment.deficiencySpreadCents > 0) parts.push("deficiency ÷ 2");
  return parts.join(" + ");
}

function comparePayment(result, statement, view, rows, flags) {
  if (!isGivenCents(statement.newMonthlyEscrowCents)) return;

  const paymentCents = statement.newMonthlyEscrowCents;
  const baseCents = result.baseMonthlyPaymentCents;
  const maximumCents = result.newMonthlyEscrowPayment.monthlyEscrowWhileRepayingDeficiencyCents;
  const spreadMonths = readSpreadMonths(statement) === null ? 12 : readSpreadMonths(statement);

  const figures = lawfulPaymentFigures(result, view, spreadMonths);
  const closestFigure = closestTo(paymentCents, figures);
  // $1.00 for each separately rounded part of the maximum: $1, $2 or $3 (audit A1).
  const toleranceCents = paymentToleranceCents(countPaymentParts(result.newMonthlyEscrowPayment));
  const matchesAFigure = Math.abs(paymentCents - closestFigure) <= toleranceCents;

  // (f)(4)(iii): when the borrower is not current, the rule does not limit how
  // a deficiency is collected — the mortgage documents do. So there is no
  // federal maximum to be "above" (SPEC E2).
  const deficiencyOutsideTheRule = result.deficiencyCents > 0 && !result.inputs.borrowerCurrent;
  const hasDeficiencyRange = result.deficiencyCents > 0 && result.inputs.borrowerCurrent;
  const atLeastBase = paymentCents >= baseCents - toleranceCents;

  const isOverMaximum = paymentCents > maximumCents + toleranceCents && !deficiencyOutsideTheRule;

  // What we expected to see: bills ÷ 12, plus the shortage spread the way the
  // statement says it is spread.
  let expectedCents = baseCents;
  if (spreadMonths >= 2 && view.amounts.shortageCents > 0) {
    expectedCents = baseCents + divideRoundHalfUp(view.amounts.shortageCents, spreadMonths);
  }

  let status = "differs";
  let federalCents = expectedCents;
  let note = "";

  // The over-the-maximum test comes FIRST. A statement that spreads a shortage
  // over 6 months produces a payment that "matches its own spread" — but that
  // figure is above the lawful maximum, so it must not count as a match.
  if (isOverMaximum) {
    status = "over-limit";
    federalCents = maximumCents;
    note = "This is more than the most the federal math supports from the numbers you typed.";
  } else if (matchesAFigure) {
    status = "match";
    federalCents = closestFigure;
    note = "This matches a payment the federal math supports.";
    if (closestFigure === baseCents && (result.shortageCents > 0 || result.deficiencyCents > 0)) {
      note = "This matches bills ÷ 12 alone. It means the shortage or deficiency is not being collected through the monthly payment.";
    }
  } else if (deficiencyOutsideTheRule && atLeastBase) {
    status = "match";
    federalCents = result.newMonthlyEscrowPayment.monthlyEscrowAfterDeficiencyRepaidCents;
    note = "You told us a payment was more than 30 days late. In that case the federal rule does not limit how the deficiency is collected. Your mortgage documents control that, so we cannot check the part above " + formatCents(federalCents) + ".";
  } else if (hasDeficiencyRange && atLeastBase) {
    status = "match";
    federalCents = maximumCents;
    note = "A deficiency may be repaid over any number of months (2 or more), so anything from " + formatCents(baseCents) + " up to " + formatCents(maximumCents) + " a month can be lawful. This is in that range.";
  } else {
    note = "This is lower than the federal math expects from the bills you typed. Collecting less is allowed.";
  }

  // Say out loud why a small gap is not a finding.
  if (status === "match") {
    note = note + " A gap of up to " + formatCents(toleranceCents) + " here can come from rounding each part of the payment to the dollar, which HUD's 1995 guidance allows (60 FR 8812).";
  }

  const gapCents = paymentCents - federalCents;
  rows.push({
    key: "newMonthlyEscrow",
    label: "New monthly escrow payment",
    statementCents: paymentCents,
    federalCents: federalCents,
    gapCents: gapCents,
    status: status,
    note: note,
  });

  if (status === "over-limit") {
    const perYearCents = gapCents * 12;
    let sentence =
      "Your statement's new escrow payment is " + formatCents(paymentCents) + " a month. From the numbers you typed, the most the federal math supports is " +
      formatCents(maximumCents) + " a month (" + describeMaximum(result) + "). That is " + formatCents(gapCents) +
      " a month more, or " + formatCents(perYearCents) + " over 12 months. (" + PAYMENT_CITE + ")";
    if (view.extraCushionCents > 0 && Math.abs(perYearCents - view.extraCushionCents) <= 12 * toleranceCents) {
      sentence = sentence + " Over 12 months that adds up to the extra cushion.";
    }
    flags.push({
      kind: "PAYMENT_ABOVE_MAX",
      rowKey: "newMonthlyEscrow",
      amountCents: gapCents,
      perYearCents: perYearCents,
      cite: PAYMENT_CITE,
      sentence: sentence,
      letterLine:
        "The statement sets the new monthly escrow payment at " + formatCents(paymentCents) + ". By my math, the most " + PAYMENT_CITE +
        " supports from these numbers is " + formatCents(maximumCents) + " a month (" + describeMaximum(result) + "). That is " +
        formatCents(gapCents) + " a month more, or " + formatCents(perYearCents) + " over 12 months.",
    });
  }

  if (status === "differs") {
    const sizeOfGap = Math.abs(gapCents);
    flags.push({
      kind: "AMOUNT_DIFFERS",
      rowKey: "newMonthlyEscrow",
      amountCents: sizeOfGap,
      cite: PAYMENT_CITE,
      sentence:
        "Your statement's new escrow payment (" + formatCents(paymentCents) + " a month) is " + formatCents(sizeOfGap) +
        " a month lower than the federal math expects from the bills you typed (" + formatCents(federalCents) +
        "). Collecting less is allowed. It can mean the servicer is planning on different bill amounts than the ones typed here, so double-check each bill. (" + PAYMENT_CITE + ")",
      letterLine:
        "The statement sets the new monthly escrow payment at " + formatCents(paymentCents) + ". From the bills listed above I expected " +
        formatCents(federalCents) + " a month. Please tell me which bill amounts and dates you used.",
    });
  }
}

// ---------- SPEC D6: how the shortage is being repaid ----------
// (f)(3)(i)  shortage < one month's payment:  do nothing / repay within 30 days
//            / equal monthly payments "over at least a 12-month period"
// (f)(3)(ii) shortage ≥ one month's payment:  do nothing / equal monthly
//            payments "over at least a 12-month period".  No 30-day demand.
// "At least 12" means 12 is the FASTEST allowed. 24 is fine. 6 is not on
// either list. 1 month (a lump sum) is on the first list only.

function statementIsAboutAShortage(statement) {
  const kind = readClaimedKind(statement);
  return kind === null || kind === "shortage";
}

function checkSpread(result, statement, view, flags) {
  const months = readSpreadMonths(statement);
  if (months === null || months >= 12) return;
  if (!statementIsAboutAShortage(statement)) return;

  const shortageCents = view.amounts.shortageCents;
  if (shortageCents <= TOLERANCE_BALANCE_CENTS) return;

  const tier = shortageTier(shortageCents, result.baseMonthlyPaymentCents);
  // One month = a lump sum within 30 days. That is on the list for a small
  // shortage, and when the tier is too close to call we do not guess.
  if (months === 1 && tier !== "large") return;

  let cite = CITE_PREFIX + "(f)(3)";
  let listWords =
    "Whether this shortage counts as smaller or larger than one month's escrow payment is too close to call, but either way a spread of 2 to 11 months is not one of the choices the rule lists: leave it alone, or spread it over at least 12 months (a small shortage may also be asked for within 30 days).";
  if (tier === "small") {
    cite = CITE_PREFIX + "(f)(3)(i)";
    listWords =
      "For a shortage smaller than one month's escrow payment, the rule lists three choices for the servicer: leave it alone, ask for it within 30 days, or spread it over at least 12 months. A spread of 2 to 11 months is not on that list.";
  }
  if (tier === "large") {
    cite = CITE_PREFIX + "(f)(3)(ii)";
    listWords =
      "For a shortage of one month's escrow payment or more, the rule lists two choices for the servicer: leave it alone, or spread it over at least 12 months.";
  }

  const monthWord = months === 1 ? "1 month" : months + " months";
  flags.push({
    kind: "SPREAD_TOO_SHORT",
    amountCents: shortageCents,
    cite: cite,
    sentence:
      "Your statement repays the shortage (" + formatCents(shortageCents) + " by the federal math) over " + monthWord + ". " +
      listWords + " It is worth asking your servicer about. (" + cite + ")",
    letterLine:
      "The statement repays the shortage over " + monthWord + ". " + cite +
      " lists repayment in equal monthly payments over at least 12 months. Please explain how this repayment period was chosen.",
  });
}

// The CFPB's mortgage servicing FAQ (Escrow — shortages, last updated June
// 2021) says the rule's repayment choices are the only ones, so an annual
// statement cannot offer a lump-sum option for a shortage of one month's
// payment or more — though the borrower may always CHOOSE to pay it off.
// Many real statements print that coupon anyway. We raise it as a QUESTION TO
// ASK, never as a finding: we cannot see the statement, and the person may
// have misread it.
function checkLumpSum(result, statement, view, flags) {
  if (statement.lumpSumOfferedOnStatement !== true) return;
  if (!statementIsAboutAShortage(statement)) return;

  const shortageCents = view.amounts.shortageCents;
  if (shortageTier(shortageCents, result.baseMonthlyPaymentCents) !== "large") return;

  const cite = CITE_PREFIX + "(f)(3)(ii)";
  flags.push({
    kind: "LUMP_SUM_OFFERED",
    amountCents: shortageCents,
    cite: cite,
    sentence:
      "You told us the statement offers a pay-it-all-at-once option. By the federal math the shortage is " + formatCents(shortageCents) +
      ", which is more than one month's escrow payment. For a shortage that size, the rule lists two choices for the servicer: leave it alone, or spread it over at least 12 months. The CFPB's mortgage servicing FAQ says the annual statement itself should stick to those choices. You are always free to pay a shortage off early if you want to. A fair question to ask your servicer: \"Why does my annual escrow statement offer a lump-sum option for this shortage?\" (" + cite + ")",
    letterLine:
      "The statement offers a lump-sum option for the shortage. By my math the shortage is " + formatCents(shortageCents) +
      ", which is more than one month's escrow payment. Please explain how that option fits the choices listed in " + cite + ".",
  });
}

// ---------- the public function ----------

export function compareWithStatement(result, statement) {
  const rows = [];
  const flags = [];
  const nudges = [];

  if (isPlainObject(statement)) {
    const view = buildServicerView(result, statement);
    // Cause → effect order: the cushion drives the shortage, which drives the payment.
    compareCushion(result, statement, rows, flags, nudges);
    compareClaim(result, statement, view, rows, flags);
    comparePayment(result, statement, view, rows, flags);
    checkSpread(result, statement, view, flags);
    checkLumpSum(result, statement, view, flags);
  }

  // `overall` comes from the rows we actually compared, and the flags. A
  // nudge never makes it "look-here", and a "not-compared" row never makes it
  // "matches" by itself (audit B2).
  let comparedRows = 0;
  for (const row of rows) {
    if (row.status !== "not-compared") comparedRows = comparedRows + 1;
  }
  const provided = comparedRows > 0 || flags.length > 0;
  let overall = "not-provided";
  if (provided) overall = "matches";
  if (flags.length > 0) overall = "look-here";

  return { provided: provided, rows: rows, flags: flags, nudges: nudges, overall: overall };
}
