// oracle.mjs — INDEPENDENT oracle for EscrowScope.
// Written from 12 CFR 1024.17 and Appendix E to Part 1024 (eCFR text as of 2026-09-17),
// without looking at the production engine. Zero dependencies. Node >= 18, ES modules.
//
// Deliberately NOT the obvious implementation:
//   * all money is BigInt cents internally;
//   * the required (target) starting balance is found by SEARCH: the smallest opening
//     balance for which a month-by-month simulation of the account never lets any
//     balance in the year (the opening row included, as Appendix E prints it) fall
//     below the cushion. No "minus the minimum" formula is used anywhere;
//   * the three tables (Step 1 trial, Step 3 target, projected) are three runs of the
//     same simulator from three different opening balances (0, required, actual).
//
// Reg map:
//   (c)(1)(ii)      monthly payment = 1/12 of estimated annual disbursements
//   (c)(5), (c)(8)  cushion <= 1/6 of annual disbursements, or less if docs / state law say so
//   (d)(2)(i)(A)-(C), Appendix E Steps 1-3   trial balance -> lift lowest to zero -> add cushion
//   (b)             surplus / shortage = current balance vs target balance; deficiency = negative balance
//   (f)(2)          surplus: >= $50 refund within 30 days, < $50 refund or credit, only if borrower current
//   (f)(3)          shortage tiers (< one month's payment / >= one month's payment)
//   (f)(4)          deficiency tiers, only if borrower current ((f)(4)(iii))
//
// Rounding is NOT in the regulation. These follow SPEC.md C1 "choices, not law":
//   payment: half-up to the cent; cushion cap: rounded DOWN; rows use the rounded payment;
//   spreads: half-up; tie for low month: earliest month.

const FIFTY_DOLLARS = 5000n;
// SPEC E3 'too close to call' band, inclusive: |amount - line| <= 700 cents.
const NEAR_TOLERANCE = 700n;
// AUDITOR'S CHOICE (differs from the literal E3 wording, see report): only flag a line that is legally
// operative. When the borrower is not current the $50 refund line ((f)(2)(ii)) and the deficiency
// one-month line ((f)(4)(iii)) decide nothing, so nearLine stays null for them. Shortage lines always count.
export const NEARLINE_ONLY_WHEN_LINE_IS_OPERATIVE = true;

function big(n, name) {
  if (!Number.isSafeInteger(n)) throw new TypeError(`${name} must be a safe integer number of cents, got ${n}`);
  return BigInt(n);
}

// n / d rounded half-up, for n >= 0, d > 0. Done with quotient + remainder, not (n + d/2) / d.
function halfUp(n, d) {
  if (n < 0n || d <= 0n) throw new RangeError('halfUp expects n >= 0 and d > 0');
  const q = n / d;
  const r = n % d;
  return r * 2n >= d ? q + 1n : q;
}

// Largest whole-cent c with 12*c <= D*months  (i.e. D*months/12 rounded DOWN).
function cushionCap(D, months) {
  const c = (D * months) / 12n;
  if (!(12n * c <= D * months && 12n * (c + 1n) > D * months)) throw new Error('cushion cap self-check failed');
  return c;
}

// One escrow year, month by month: deposit comes in, that month's bills go out.
function simulate(opening, deposit, billsByMonth) {
  const ends = [];
  let bal = opening;
  for (let m = 1; m <= 12; m++) {
    bal = bal + deposit - billsByMonth[m];
    ends.push(bal);
  }
  return ends; // index 0 => month 1
}

function neverBelow(opening, floor, deposit, billsByMonth) {
  if (opening < floor) return false; // the opening row is a "monthly balance" in Appendix E
  for (const b of simulate(opening, deposit, billsByMonth)) if (b < floor) return false;
  return true;
}

// Smallest opening balance that keeps every balance of the year >= floor. Binary search.
function smallestSafeOpening(floor, deposit, billsByMonth, D) {
  let lo = floor;                       // cannot be lower: the opening row itself must be >= floor
  let hi = floor + D + 12n * deposit;   // certainly safe
  if (!neverBelow(hi, floor, deposit, billsByMonth)) throw new Error('search upper bound not safe');
  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    if (neverBelow(mid, floor, deposit, billsByMonth)) hi = mid; else lo = mid + 1n;
  }
  return lo;
}

function calMonth(startMonth, escrowMonth) {
  return ((startMonth - 1 + (escrowMonth - 1)) % 12) + 1;
}

const CITE = {
  SURPLUS_REFUND_REQUIRED: '12 CFR 1024.17(f)(2)(i)',
  SURPLUS_UNDER_50: '12 CFR 1024.17(f)(2)(i)',
  SURPLUS_BORROWER_NOT_CURRENT: '12 CFR 1024.17(f)(2)(ii)',
  ON_TARGET: '12 CFR 1024.17(d)(2)',
  SHORTAGE_LT_ONE_MONTH: '12 CFR 1024.17(f)(3)(i)',
  SHORTAGE_GE_ONE_MONTH: '12 CFR 1024.17(f)(3)(ii)',
  DEFICIENCY_LT_ONE_MONTH: '12 CFR 1024.17(f)(4)(i)',
  DEFICIENCY_GE_ONE_MONTH: '12 CFR 1024.17(f)(4)(ii)',
  DEFICIENCY_BORROWER_NOT_CURRENT: '12 CFR 1024.17(f)(4)(iii)',
};

export function analyze(account) {
  if (account === null || typeof account !== 'object') throw new TypeError('account must be an object');
  const startMonth = account.startMonth;
  if (!Number.isInteger(startMonth) || startMonth < 1 || startMonth > 12) throw new RangeError('startMonth must be 1..12');
  const cushionMonths = account.cushionMonths === undefined ? 2 : account.cushionMonths;
  if (![0, 1, 2].includes(cushionMonths)) throw new RangeError('cushionMonths must be 0, 1 or 2');
  const current = account.borrowerCurrent === undefined ? true : account.borrowerCurrent;
  if (typeof current !== 'boolean') throw new TypeError('borrowerCurrent must be boolean');
  if (!Array.isArray(account.disbursements) || account.disbursements.length === 0) throw new RangeError('need at least one disbursement');

  const S = big(account.startingBalanceCents, 'startingBalanceCents');
  const bills = Array.from({ length: 13 }, () => 0n); // 1..12
  let D = 0n;
  for (const d of account.disbursements) {
    if (!Number.isInteger(d.month) || d.month < 1 || d.month > 12) throw new RangeError('disbursement month must be 1..12');
    const amt = big(d.amountCents, 'amountCents');
    if (amt <= 0n) throw new RangeError('amountCents must be > 0');
    bills[d.month] += amt;
    D += amt;
  }

  // (c)(1)(ii): one-twelfth. Half-up to the cent is a SPEC choice.
  const P = halfUp(D, 12n);
  // (c)(5)/(c)(8): cap, rounded down so it can never exceed the legal limit.
  const C = cushionCap(D, BigInt(cushionMonths));

  // Appendix E Step 3 opening balance, found by search (see header).
  const required = smallestSafeOpening(C, P, bills, D);
  const stepTwoAdd = required - C; // Appendix E Step 2 amount (>= 0 by construction)

  const step1 = simulate(0n, P, bills);
  const target = simulate(required, P, bills);
  const projected = simulate(S, P, bills);

  // Internal consistency: target - projected is the same in every row.
  for (let i = 0; i < 12; i++) {
    if (target[i] - projected[i] !== required - S) throw new Error('row gap not constant');
    if (target[i] - step1[i] !== required) throw new Error('target/step1 gap not constant');
  }

  // Low point of the PROJECTED account over months 1..12; strict "<" keeps the earliest month on a tie.
  let lowIdx = 0;
  for (let i = 1; i < 12; i++) if (projected[i] < projected[lowIdx]) lowIdx = i;
  let lowestTarget = target[0];
  for (let i = 1; i < 12; i++) if (target[i] < lowestTarget) lowestTarget = target[i];

  // (b) definitions.
  const difference = S - required;
  const surplus = difference > 0n ? difference : 0n;
  const deficiency = S < 0n ? -S : 0n;                      // a REAL negative balance today
  const floorOfBalance = S < 0n ? 0n : S;
  const shortage = difference < 0n ? required - floorOfBalance : 0n; // HUD 60 FR 8813-14 (l): deficiency first, then the remaining shortage
  if (surplus - shortage - deficiency !== difference) throw new Error('surplus/shortage/deficiency do not add up');

  // Tiers. "One month's escrow account payment" = the new base payment (SPEC C3 choice; reg does not say old vs new).
  const tier = (amt) => (amt < P ? 'LT' : 'GE');
  let classification;
  let cite;
  if (deficiency > 0n) {
    // SPEC E2 / (f)(4)(iii): the deficiency tiers only exist for a borrower who is current.
    const defKey = current ? `DEFICIENCY_${tier(deficiency)}_ONE_MONTH` : 'DEFICIENCY_BORROWER_NOT_CURRENT';
    if (shortage > 0n) {
      const shKey = `SHORTAGE_${tier(shortage)}_ONE_MONTH`;
      classification = `${defKey}_AND_${shKey}`;
      cite = `${CITE[defKey]} + ${CITE[shKey]}`;
    } else {
      classification = defKey;
      cite = CITE[defKey];
    }
  } else if (surplus > 0n) {
    classification = !current ? 'SURPLUS_BORROWER_NOT_CURRENT' : surplus >= FIFTY_DOLLARS ? 'SURPLUS_REFUND_REQUIRED' : 'SURPLUS_UNDER_50';
    cite = CITE[classification];
  } else if (shortage > 0n) {
    classification = `SHORTAGE_${tier(shortage)}_ONE_MONTH`;
    cite = CITE[classification];
  } else {
    classification = 'ON_TARGET';
    cite = CITE.ON_TARGET;
  }

  const shortageSpread = halfUp(shortage, 12n);          // (f)(3): at least 12 months -> 12 is the fastest
  // (f)(4): 2 or more -> 2 is the fastest. E2: no schedule at all when the borrower is not current.
  const scheduleDeficiency = deficiency > 0n && current;
  const deficiencyMonths = scheduleDeficiency ? 2n : 0n;
  const deficiencySpread = scheduleDeficiency ? halfUp(deficiency, 2n) : 0n;

  // servicerOptions: same wording as the 22 original vectors; one new sentence for E2.
  const shortageOptions = (pre) => (shortage < P
    ? [`${pre}do nothing`, `${pre}require repayment within 30 days`, `${pre}require repayment in equal monthly payments over at least 12 months`]
    : [`${pre}do nothing`, `${pre}require repayment in equal monthly payments over at least 12 months`]);
  let servicerOptions = [];
  if (deficiency > 0n) {
    if (!current) servicerOptions.push('deficiency: servicer may recover the deficiency pursuant to the loan documents');
    else if (deficiency < P) servicerOptions.push('deficiency: do nothing', 'deficiency: require repayment within 30 days', 'deficiency: require repayment in 2 or more equal monthly payments');
    else servicerOptions.push('deficiency: do nothing', 'deficiency: require repayment in 2 or more equal monthly payments');
    if (shortage > 0n) servicerOptions.push(...shortageOptions('shortage: '));
  } else if (surplus > 0n) {
    if (!current) servicerOptions = ['servicer may retain the surplus in the escrow account pursuant to the loan documents'];
    else if (surplus >= FIFTY_DOLLARS) servicerOptions = ['refund the surplus to the borrower within 30 days from the date of the analysis'];
    else servicerOptions = ['refund the surplus to the borrower', "credit the surplus against next year's escrow payments"];
  } else if (shortage > 0n) servicerOptions = shortageOptions('shortage: ');

  // SPEC E3 nearLine. First line in band wins, in the same order the classification is built:
  // surplus, then deficiency, then shortage. distanceCents is the ABSOLUTE gap to the line.
  const absDiff = (a, b) => (a > b ? a - b : b - a);
  const gate = (needsCurrent) => !NEARLINE_ONLY_WHEN_LINE_IS_OPERATIVE || !needsCurrent || current;
  let nearLine = null;
  if (surplus > 0n && gate(true) && absDiff(surplus, FIFTY_DOLLARS) <= NEAR_TOLERANCE) nearLine = { line: 'SURPLUS_50', distanceCents: Number(absDiff(surplus, FIFTY_DOLLARS)), toleranceCents: Number(NEAR_TOLERANCE) };
  else if (deficiency > 0n && gate(true) && absDiff(deficiency, P) <= NEAR_TOLERANCE) nearLine = { line: 'ONE_MONTH_PAYMENT', distanceCents: Number(absDiff(deficiency, P)), toleranceCents: Number(NEAR_TOLERANCE) };
  else if (shortage > 0n && absDiff(shortage, P) <= NEAR_TOLERANCE) nearLine = { line: 'ONE_MONTH_PAYMENT', distanceCents: Number(absDiff(shortage, P)), toleranceCents: Number(NEAR_TOLERANCE) };

  const regCaveats = [];
  const nearCandidates = [];
  if (surplus > 0n && absDiff(surplus, FIFTY_DOLLARS) <= NEAR_TOLERANCE) nearCandidates.push({ subject: 'surplus', needsCurrent: true, line: 'SURPLUS_50', distanceCents: Number(absDiff(surplus, FIFTY_DOLLARS)), signedCents: Number(surplus - FIFTY_DOLLARS) });
  if (deficiency > 0n && absDiff(deficiency, P) <= NEAR_TOLERANCE) nearCandidates.push({ subject: 'deficiency', needsCurrent: true, line: 'ONE_MONTH_PAYMENT', distanceCents: Number(absDiff(deficiency, P)), signedCents: Number(deficiency - P) });
  if (shortage > 0n && absDiff(shortage, P) <= NEAR_TOLERANCE) nearCandidates.push({ subject: 'shortage', needsCurrent: false, line: 'ONE_MONTH_PAYMENT', distanceCents: Number(absDiff(shortage, P)), signedCents: Number(shortage - P) });
  let minStep1 = step1[0];
  for (const b of step1) if (b < minStep1) minStep1 = b;
  if (minStep1 > 0n) regCaveats.push(`rounding artifact: every Step 1 month-end balance is positive (lowest +${minStep1} cents) because 12 x rounded payment > annual bills; lowPoint - cushionCap exceeds differenceCents by ${minStep1} cents.`);

  const N = (x) => Number(x);
  const table = [];
  for (let m = 1; m <= 12; m++) {
    table.push({
      month: m,
      calendarMonth: calMonth(startMonth, m),
      depositCents: N(P),
      disbursementCents: N(bills[m]),
      step1TrialBalanceCents: N(step1[m - 1]),
      targetBalanceCents: N(target[m - 1]),
      projectedBalanceCents: N(projected[m - 1]),
    });
  }

  return {
    annualDisbursementsCents: N(D),
    baseMonthlyPaymentCents: N(P),
    cushionCapCents: N(C),
    stepTwoAddCents: N(stepTwoAdd),
    requiredStartingBalanceCents: N(required),
    differenceCents: N(difference),
    surplusCents: N(surplus),
    shortageCents: N(shortage),
    deficiencyCents: N(deficiency),
    lowPoint: {
      projectedBalanceCents: N(projected[lowIdx]),
      month: lowIdx + 1,
      calendarMonth: calMonth(startMonth, lowIdx + 1),
      lowestTargetBalanceCents: N(lowestTarget),
    },
    classification,
    cite,
    servicerOptions,
    nearLine,
    newMonthlyEscrowPayment: {
      baseMonthlyCents: N(P),
      shortageSpreadOver12Cents: N(shortageSpread),
      deficiencySpreadCents: N(deficiencySpread),
      deficiencySpreadMonths: N(deficiencyMonths),
      monthlyEscrowWhileRepayingDeficiencyCents: N(P + shortageSpread + deficiencySpread),
      monthlyEscrowAfterDeficiencyRepaidCents: N(P + shortageSpread),
    },
    table,
    // Extras for the audit only (not part of SPEC C2; the differ ignores them).
    audit: {
      minStep1Cents: N(minStep1),
      nearCandidates, // every amount inside the E3 band, gated or not (lets fuzz.mjs name convention differences)
      strictIdentityHolds: projected[lowIdx] - C === difference,
      // Exact (no rounding) arithmetic, in units of 1/12 cent, for verdict-flip analysis.
      exact: exactTwelfths(S, D, bills, BigInt(cushionMonths)),
      regCaveats,
    },
  };
}

// Exact rational version of the same method, scaled by 12 so everything stays an integer.
// Units: twelfths of a cent. P = D/12 cents  ->  D twelfths.
function exactTwelfths(S, D, bills, months) {
  let t = 0n;
  let minT = 0n; // opening row counts
  let cum = 0n;
  for (let m = 1; m <= 12; m++) {
    cum += bills[m];
    t = BigInt(m) * D - 12n * cum;
    if (t < minT) minT = t;
  }
  const A = -minT;
  const C = D * months;
  const required = A + C;
  const difference = 12n * S - required;
  const surplus = difference > 0n ? difference : 0n;
  const shortage = difference < 0n ? required - 12n * (S < 0n ? 0n : S) : 0n;
  return {
    requiredStartingBalanceCentsExact: Number(required) / 12,
    differenceCentsExact: Number(difference) / 12,
    surplusAtLeast50: surplus >= 12n * FIFTY_DOLLARS,
    shortageAtLeastOneMonth: shortage >= D, // one month's payment = D twelfths
    deficiencyAtLeastOneMonth: (S < 0n ? -S : 0n) * 12n >= D,
  };
}

export default { analyze };
