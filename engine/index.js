// engine/index.js — (growing) public API
export { parseDollars, formatCents, calendarToEscrowMonth, escrowToCalendarMonth, MONTH_NAMES } from "./money.js";
export { validateAccount, validateStatement } from "./validate.js";
export { analyze, projectWithPayment, TOLERANCE_BALANCE_CENTS, TOLERANCE_PAYMENT_CENTS } from "./analyze.js";
export { compareWithStatement } from "./compare.js";
export { VECTORS, VECTORS_META, REFERENCE_ONLY } from "./vectors.js";
export { runSelfCheck, accountFromVector, DOC_ONLY_EXPECTED_KEYS } from "./selfcheck.js";
