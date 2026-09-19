// engine/index.js — the engine's front door. The web page imports from here
// and nowhere else in engine/. This file only re-exports; it has no logic.
//
// All money in and out is WHOLE CENTS. Months are 1–12 in escrow-year order;
// `startMonth` is the calendar month (1 = January) of escrow-year month 1.

// money.js — dollars-as-text ↔ whole cents, and month helpers
export { parseDollars, formatCents, calendarToEscrowMonth, escrowToCalendarMonth, MONTH_NAMES } from "./money.js";

// validate.js — plain-English problems with what was typed
export { validateAccount, validateStatement } from "./validate.js";

// analyze.js — the 12 CFR 1024.17 math
export { analyze, projectWithPayment, TOLERANCE_BALANCE_CENTS, TOLERANCE_PAYMENT_CENTS } from "./analyze.js";

// compare.js — "your statement says" vs "the federal math says"
export { compareWithStatement } from "./compare.js";

// explain.js — the words
export { explainVerdict, explainSteps, explainJump, nextSteps, explainServicerLine } from "./explain.js";

// letter.js — the pre-filled letter
export { buildLetter, letterKind } from "./letter.js";

// dates.js — the 30-day refund clock
export { refundDeadline } from "./dates.js";

// vectors.js (GENERATED) + selfcheck.js — the page proves its own math
export { VECTORS, VECTORS_META, REFERENCE_ONLY } from "./vectors.js";
export { runSelfCheck, accountFromVector, DOC_ONLY_EXPECTED_KEYS } from "./selfcheck.js";
