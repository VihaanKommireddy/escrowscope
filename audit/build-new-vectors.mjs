// build-new-vectors.mjs — assembles new-vectors.json from numbers I worked out BY HAND (below).
// This file does NOT import the oracle: every number is a literal typed from the hand arithmetic in
// the comments. check-vectors.mjs then validates the result against the oracle as a separate step.
//   node build-new-vectors.mjs && node check-vectors.mjs ./new-vectors.json
import { writeFileSync } from 'node:fs';

const OPT = {
  refund30: ['refund the surplus to the borrower within 30 days from the date of the analysis'],
  shortageLT: ['shortage: do nothing', 'shortage: require repayment within 30 days', 'shortage: require repayment in equal monthly payments over at least 12 months'],
  shortageGE: ['shortage: do nothing', 'shortage: require repayment in equal monthly payments over at least 12 months'],
  defNotCurrent: ['deficiency: servicer may recover the deficiency pursuant to the loan documents'],
};

function vector({ id, title, startMonth, inputs, cal, step1, target, projected, head, lowPoint, classification, cite, servicerOptions, nearLine, payment }) {
  const byMonth = Array(13).fill(0);
  for (const d of inputs.disbursements) byMonth[d.month] += d.amountCents;
  const table = step1.map((s, i) => ({
    month: i + 1, calendarMonth: cal[i], depositCents: head.baseMonthlyPaymentCents, disbursementCents: byMonth[i + 1],
    step1TrialBalanceCents: s, targetBalanceCents: target[i], projectedBalanceCents: projected[i],
  }));
  return { id, title, source: 'DERIVED', startMonth, inputs, expected: { ...head, lowPoint, classification, cite, servicerOptions, nearLine, newMonthlyEscrowPayment: payment, table } };
}
const JAN = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const vectors = [
  // TV22 — D = 3,600.00. P = 3,600/12 = 300.00. Cushion months 0 -> C = 0.
  // Step 1: +300 a month: 300, 600, ... 3,300 (month 11); month 12: 3,600 - 3,600 = 0. Lowest (opening row counts) = 0 -> add A = 0.
  // Required start = 0 + 0 = 0. Balance -450.00 -> difference -450.00. Deficiency = 450.00 (real negative balance). Shortage = 0 - max(-450, 0) = 0.
  // Borrower NOT current -> (f)(4)(iii): tiers do not apply -> DEFICIENCY_BORROWER_NOT_CURRENT, no repayment schedule (0 / 0 months).
  // Projected = -450 + step 1: -150, 150, ... 2,850, then -450 in month 12 -> low point -450.00 in month 12 = February (year starts March).
  // nearLine: deficiency 450 vs one month 300 is 150.00 away -> null.
  vector({
    id: 'TV22', title: 'Pure deficiency, borrower NOT current - (f)(4)(iii): no tier, no repayment schedule (audit, SPEC E2)', startMonth: 3,
    inputs: { startingBalanceCents: -45000, cushionMonths: 0, borrowerCurrent: false, disbursements: [{ label: 'Property tax (annual)', month: 12, amountCents: 360000 }] },
    cal: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2],
    step1: [30000, 60000, 90000, 120000, 150000, 180000, 210000, 240000, 270000, 300000, 330000, 0],
    target: [30000, 60000, 90000, 120000, 150000, 180000, 210000, 240000, 270000, 300000, 330000, 0],
    projected: [-15000, 15000, 45000, 75000, 105000, 135000, 165000, 195000, 225000, 255000, 285000, -45000],
    head: { annualDisbursementsCents: 360000, baseMonthlyPaymentCents: 30000, cushionCapCents: 0, stepTwoAddCents: 0, requiredStartingBalanceCents: 0, differenceCents: -45000, surplusCents: 0, shortageCents: 0, deficiencyCents: 45000 },
    lowPoint: { projectedBalanceCents: -45000, month: 12, calendarMonth: 2, lowestTargetBalanceCents: 0 },
    classification: 'DEFICIENCY_BORROWER_NOT_CURRENT', cite: '12 CFR 1024.17(f)(4)(iii)', servicerOptions: OPT.defNotCurrent, nearLine: null,
    payment: { baseMonthlyCents: 30000, shortageSpreadOver12Cents: 0, deficiencySpreadCents: 0, deficiencySpreadMonths: 0, monthlyEscrowWhileRepayingDeficiencyCents: 30000, monthlyEscrowAfterDeficiencyRepaidCents: 30000 },
  }),

  // TV23 — D = 2,400 + 1,200 = 3,600.00. P = 300.00. C = 3,600/6 = 600.00.
  // Step 1: 300, 600, 900, (1,200 - 2,400 =) -1,200, -900, -600, -300, 0, (300 - 1,200 =) -900, -600, -300, 0. Lowest -1,200 in month 4 -> A = 1,200.
  // Required start = 1,200 + 600 = 1,800.00. Balance -200.00 -> difference -2,000.00.
  // HUD split: deficiency = 200.00 (below $0); remaining shortage = $0 up to 1,800 = 1,800.00. Check: 0 - 1,800 - 200 = -2,000.
  // Not current -> deficiency part has no tier/schedule. Shortage 1,800 >= 300 -> GE tier, and that does NOT depend on being current ((f)(3)).
  // Shortage spread 1,800/12 = 150.00 -> escrow payment 450.00 (no deficiency add-on). Low point -200 - 1,200 = -1,400.00 in month 4.
  vector({
    id: 'TV23', title: 'Deficiency + shortage, borrower NOT current - deficiency has no tier, shortage tier unchanged (audit, SPEC E2)', startMonth: 1,
    inputs: { startingBalanceCents: -20000, cushionMonths: 2, borrowerCurrent: false, disbursements: [{ label: 'Property tax', month: 4, amountCents: 240000 }, { label: 'Homeowners insurance', month: 9, amountCents: 120000 }] },
    cal: JAN,
    step1: [30000, 60000, 90000, -120000, -90000, -60000, -30000, 0, -90000, -60000, -30000, 0],
    target: [210000, 240000, 270000, 60000, 90000, 120000, 150000, 180000, 90000, 120000, 150000, 180000],
    projected: [10000, 40000, 70000, -140000, -110000, -80000, -50000, -20000, -110000, -80000, -50000, -20000],
    head: { annualDisbursementsCents: 360000, baseMonthlyPaymentCents: 30000, cushionCapCents: 60000, stepTwoAddCents: 120000, requiredStartingBalanceCents: 180000, differenceCents: -200000, surplusCents: 0, shortageCents: 180000, deficiencyCents: 20000 },
    lowPoint: { projectedBalanceCents: -140000, month: 4, calendarMonth: 4, lowestTargetBalanceCents: 60000 },
    classification: 'DEFICIENCY_BORROWER_NOT_CURRENT_AND_SHORTAGE_GE_ONE_MONTH', cite: '12 CFR 1024.17(f)(4)(iii) + 12 CFR 1024.17(f)(3)(ii)',
    servicerOptions: [...OPT.defNotCurrent, ...OPT.shortageGE], nearLine: null,
    payment: { baseMonthlyCents: 30000, shortageSpreadOver12Cents: 15000, deficiencySpreadCents: 0, deficiencySpreadMonths: 0, monthlyEscrowWhileRepayingDeficiencyCents: 45000, monthlyEscrowAfterDeficiencyRepaidCents: 45000 },
  }),

  // TV24 — D = 1,500 + 900 + 1,500 = 3,900.00. P = 325.00. C = 650.00.
  // Step 1: 325, (650 - 1,500 =) -850, -525, -200, 125, (450 - 900 =) -450, -125, (200 - 1,500 =) -1,300, -975, -650, -325, 0. Lowest -1,300 in month 8 -> A = 1,300.
  // Required start = 1,950.00. Balance 1,800.00 -> shortage 150.00 < 325.00 -> SHORTAGE_LT_ONE_MONTH, exactly as for a current borrower:
  // (f)(3) has no "borrower is current" condition. Spread 150/12 = 12.50 -> payment 337.50. Low 1,800 - 1,300 = 500.00 in month 8 = May (year starts October).
  vector({
    id: 'TV24', title: 'SHORTAGE with borrower NOT current - shortage tiers and options do not change, (f)(3) has no current test (audit, SPEC E2)', startMonth: 10,
    inputs: { startingBalanceCents: 180000, cushionMonths: 2, borrowerCurrent: false, disbursements: [{ label: 'Property tax 1st half', month: 2, amountCents: 150000 }, { label: 'Homeowners insurance', month: 6, amountCents: 90000 }, { label: 'Property tax 2nd half', month: 8, amountCents: 150000 }] },
    cal: [10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    step1: [32500, -85000, -52500, -20000, 12500, -45000, -12500, -130000, -97500, -65000, -32500, 0],
    target: [227500, 110000, 142500, 175000, 207500, 150000, 182500, 65000, 97500, 130000, 162500, 195000],
    projected: [212500, 95000, 127500, 160000, 192500, 135000, 167500, 50000, 82500, 115000, 147500, 180000],
    head: { annualDisbursementsCents: 390000, baseMonthlyPaymentCents: 32500, cushionCapCents: 65000, stepTwoAddCents: 130000, requiredStartingBalanceCents: 195000, differenceCents: -15000, surplusCents: 0, shortageCents: 15000, deficiencyCents: 0 },
    lowPoint: { projectedBalanceCents: 50000, month: 8, calendarMonth: 5, lowestTargetBalanceCents: 65000 },
    classification: 'SHORTAGE_LT_ONE_MONTH', cite: '12 CFR 1024.17(f)(3)(i)', servicerOptions: OPT.shortageLT, nearLine: null,
    payment: { baseMonthlyCents: 32500, shortageSpreadOver12Cents: 1250, deficiencySpreadCents: 0, deficiencySpreadMonths: 0, monthlyEscrowWhileRepayingDeficiencyCents: 33750, monthlyEscrowAfterDeficiencyRepaidCents: 33750 },
  }),

  // TV25 — D = 1,200.06 = 120,006 cents. 120,006 / 12 = 10,000 remainder 6 -> 10,000.5 -> half-up P = 10,001 cents. C = floor(120,006 / 6) = 20,001.
  // Step 1: 10,001 x m for months 1-11 (10,001 ... 110,011); month 12: 120,012 - 120,006 = +6. EVERY month-end is positive; the opening row is 0,
  // so the lowest monthly balance is 0 and the Step 2 add is 0 (floored, SPEC E1). Required start = 0 + 20,001 = 20,001.
  // Balance 30,000 -> difference +9,999 -> surplus 99.99 >= 50.00 -> refund required. Low point = 30,000 + 6 = 30,006 in month 12.
  // Identity check: low point - cushion = 30,006 - 20,001 = 10,005 = difference + 6 (the lowest Step 1 balance). Lowest target row = 20,001 + 6 = 20,007.
  vector({
    id: 'TV25', title: 'All-positive Step 1 (rounding artifact): one bill of $1,200.06 in month 12 - pins the floor on the Step 2 add (audit, SPEC E1)', startMonth: 1,
    inputs: { startingBalanceCents: 30000, cushionMonths: 2, borrowerCurrent: true, disbursements: [{ label: 'Property tax (annual)', month: 12, amountCents: 120006 }] },
    cal: JAN,
    step1: [10001, 20002, 30003, 40004, 50005, 60006, 70007, 80008, 90009, 100010, 110011, 6],
    target: [30002, 40003, 50004, 60005, 70006, 80007, 90008, 100009, 110010, 120011, 130012, 20007],
    projected: [40001, 50002, 60003, 70004, 80005, 90006, 100007, 110008, 120009, 130010, 140011, 30006],
    head: { annualDisbursementsCents: 120006, baseMonthlyPaymentCents: 10001, cushionCapCents: 20001, stepTwoAddCents: 0, requiredStartingBalanceCents: 20001, differenceCents: 9999, surplusCents: 9999, shortageCents: 0, deficiencyCents: 0 },
    lowPoint: { projectedBalanceCents: 30006, month: 12, calendarMonth: 12, lowestTargetBalanceCents: 20007 },
    classification: 'SURPLUS_REFUND_REQUIRED', cite: '12 CFR 1024.17(f)(2)(i)', servicerOptions: OPT.refund30, nearLine: null,
    payment: { baseMonthlyCents: 10001, shortageSpreadOver12Cents: 0, deficiencySpreadCents: 0, deficiencySpreadMonths: 0, monthlyEscrowWhileRepayingDeficiencyCents: 10001, monthlyEscrowAfterDeficiencyRepaidCents: 10001 },
  }),

  // TV26 — D = 1,350 + 900 + 1,350 = 3,600.00. P = 300.00. C = 600.00.
  // Step 1: 300, 600, (900 - 1,350 =) -450, -150, (150 - 900 =) -750, -450, -150, 150, (450 - 1,350 =) -900, -600, -300, 0. Lowest -900 in month 9 -> A = 900.
  // Required start = 1,500.00. Balance 1,552.00 -> surplus 52.00 >= 50.00 -> SURPLUS_REFUND_REQUIRED stays cent-exact.
  // nearLine: |52.00 - 50.00| = 2.00 <= 7.00 -> { SURPLUS_50, 200, 700 }. Low 1,552 - 900 = 652.00 in month 9 = February (year starts June).
  vector({
    id: 'TV26', title: 'Surplus $52.00 - refund required by the cents, but inside the $7 too-close-to-call band (audit, SPEC E3)', startMonth: 6,
    inputs: { startingBalanceCents: 155200, cushionMonths: 2, borrowerCurrent: true, disbursements: [{ label: 'Property tax 1st half', month: 3, amountCents: 135000 }, { label: 'Homeowners insurance', month: 5, amountCents: 90000 }, { label: 'Property tax 2nd half', month: 9, amountCents: 135000 }] },
    cal: [6, 7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5],
    step1: [30000, 60000, -45000, -15000, -75000, -45000, -15000, 15000, -90000, -60000, -30000, 0],
    target: [180000, 210000, 105000, 135000, 75000, 105000, 135000, 165000, 60000, 90000, 120000, 150000],
    projected: [185200, 215200, 110200, 140200, 80200, 110200, 140200, 170200, 65200, 95200, 125200, 155200],
    head: { annualDisbursementsCents: 360000, baseMonthlyPaymentCents: 30000, cushionCapCents: 60000, stepTwoAddCents: 90000, requiredStartingBalanceCents: 150000, differenceCents: 5200, surplusCents: 5200, shortageCents: 0, deficiencyCents: 0 },
    lowPoint: { projectedBalanceCents: 65200, month: 9, calendarMonth: 2, lowestTargetBalanceCents: 60000 },
    classification: 'SURPLUS_REFUND_REQUIRED', cite: '12 CFR 1024.17(f)(2)(i)', servicerOptions: OPT.refund30, nearLine: { line: 'SURPLUS_50', distanceCents: 200, toleranceCents: 700 },
    payment: { baseMonthlyCents: 30000, shortageSpreadOver12Cents: 0, deficiencySpreadCents: 0, deficiencySpreadMonths: 0, monthlyEscrowWhileRepayingDeficiencyCents: 30000, monthlyEscrowAfterDeficiencyRepaidCents: 30000 },
  }),

  // TV27 — D = 1,200 + 3,000 = 4,200.00. P = 350.00. C = 700.00.
  // Step 1: 350, (700 - 1,200 =) -500, -150, 200, 550, 900, 1,250, 1,600, 1,950, 2,300, (2,650 - 3,000 =) -350, 0. Lowest -500 in month 2 -> A = 500.
  // Required start = 1,200.00. Balance 854.00 -> shortage 346.00 < 350.00 -> SHORTAGE_LT_ONE_MONTH (30-day demand is an allowed option).
  // nearLine: |346.00 - 350.00| = 4.00 <= 7.00 -> { ONE_MONTH_PAYMENT, 400, 700 }. Spread 34,600 / 12 = 2,883.33 -> 2,883 cents -> payment 378.83.
  // Low 854 - 500 = 354.00 in month 2.
  vector({
    id: 'TV27', title: 'Shortage $346.00, $4.00 under one month\'s payment ($350.00) - small tier by the cents, but too close to call (audit, SPEC E3)', startMonth: 1,
    inputs: { startingBalanceCents: 85400, cushionMonths: 2, borrowerCurrent: true, disbursements: [{ label: 'Homeowners insurance', month: 2, amountCents: 120000 }, { label: 'Property tax (annual)', month: 11, amountCents: 300000 }] },
    cal: JAN,
    step1: [35000, -50000, -15000, 20000, 55000, 90000, 125000, 160000, 195000, 230000, -35000, 0],
    target: [155000, 70000, 105000, 140000, 175000, 210000, 245000, 280000, 315000, 350000, 85000, 120000],
    projected: [120400, 35400, 70400, 105400, 140400, 175400, 210400, 245400, 280400, 315400, 50400, 85400],
    head: { annualDisbursementsCents: 420000, baseMonthlyPaymentCents: 35000, cushionCapCents: 70000, stepTwoAddCents: 50000, requiredStartingBalanceCents: 120000, differenceCents: -34600, surplusCents: 0, shortageCents: 34600, deficiencyCents: 0 },
    lowPoint: { projectedBalanceCents: 35400, month: 2, calendarMonth: 2, lowestTargetBalanceCents: 70000 },
    classification: 'SHORTAGE_LT_ONE_MONTH', cite: '12 CFR 1024.17(f)(3)(i)', servicerOptions: OPT.shortageLT, nearLine: { line: 'ONE_MONTH_PAYMENT', distanceCents: 400, toleranceCents: 700 },
    payment: { baseMonthlyCents: 35000, shortageSpreadOver12Cents: 2883, deficiencySpreadCents: 0, deficiencySpreadMonths: 0, monthlyEscrowWhileRepayingDeficiencyCents: 37883, monthlyEscrowAfterDeficiencyRepaidCents: 37883 },
  }),

  // TV28 / TV29 (EXTRA, not asked for) — same bills as TV26 (required start 1,500.00). They pin whether "within $7.00" includes exactly $7.00.
  // TV28: balance 1,557.00 -> surplus 57.00 -> |57 - 50| = 7.00 -> inside the band (inclusive) -> distance 700.
  // TV29: balance 1,557.01 -> surplus 57.01 -> 7.01 away -> nearLine null.
  ...[[155700, 5700, { line: 'SURPLUS_50', distanceCents: 700, toleranceCents: 700 }, 'TV28', 'Surplus $57.00 - exactly $7.00 above the $50 line: still inside the band, the band is inclusive (audit, SPEC E3, optional)'],
    [155701, 5701, null, 'TV29', 'Surplus $57.01 - one cent outside the band: nearLine is null (audit, SPEC E3, optional)']].map(([S, surplus, nearLine, id, title]) => vector({
    id, title, startMonth: 6,
    inputs: { startingBalanceCents: S, cushionMonths: 2, borrowerCurrent: true, disbursements: [{ label: 'Property tax 1st half', month: 3, amountCents: 135000 }, { label: 'Homeowners insurance', month: 5, amountCents: 90000 }, { label: 'Property tax 2nd half', month: 9, amountCents: 135000 }] },
    cal: [6, 7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5],
    step1: [30000, 60000, -45000, -15000, -75000, -45000, -15000, 15000, -90000, -60000, -30000, 0],
    target: [180000, 210000, 105000, 135000, 75000, 105000, 135000, 165000, 60000, 90000, 120000, 150000],
    projected: S === 155700
      ? [185700, 215700, 110700, 140700, 80700, 110700, 140700, 170700, 65700, 95700, 125700, 155700]
      : [185701, 215701, 110701, 140701, 80701, 110701, 140701, 170701, 65701, 95701, 125701, 155701],
    head: { annualDisbursementsCents: 360000, baseMonthlyPaymentCents: 30000, cushionCapCents: 60000, stepTwoAddCents: 90000, requiredStartingBalanceCents: 150000, differenceCents: surplus, surplusCents: surplus, shortageCents: 0, deficiencyCents: 0 },
    lowPoint: { projectedBalanceCents: S - 90000, month: 9, calendarMonth: 2, lowestTargetBalanceCents: 60000 },
    classification: 'SURPLUS_REFUND_REQUIRED', cite: '12 CFR 1024.17(f)(2)(i)', servicerOptions: OPT.refund30, nearLine,
    payment: { baseMonthlyCents: 30000, shortageSpreadOver12Cents: 0, deficiencySpreadCents: 0, deficiencySpreadMonths: 0, monthlyEscrowWhileRepayingDeficiencyCents: 30000, monthlyEscrowAfterDeficiencyRepaidCents: 30000 },
  })),
];

const doc = {
  meta: {
    name: 'EscrowScope NEW test vectors from the independent math audit (SPEC Part E)',
    generated: '2026-09-19',
    appendTo: 'docs/research/01-test-vectors.json -> vectors[] (append only; no existing vector is edited)',
    howTheseWereMade: 'Every number was worked out by hand from 12 CFR 1024.17 and Appendix E under the SPEC C1 rounding choices (arithmetic is in the comments of build-new-vectors.mjs and in the audit report), typed in as literals, then validated field by field and row by row against the independent oracle (check-vectors.mjs).',
    newKeys: 'expected.nearLine (SPEC E3): null or { line, distanceCents, toleranceCents }. distanceCents is the ABSOLUTE gap between the amount and the line; the band is inclusive (<= 700).',
    optional: 'TV28 and TV29 were not requested; they pin the inclusive edge of the $7.00 band. Drop them if the director prefers an exclusive band.',
  },
  vectors,
};
writeFileSync(new URL('./new-vectors.json', import.meta.url), JSON.stringify(doc, null, 2) + '\n');
console.log(`wrote new-vectors.json with ${vectors.length} vectors: ${vectors.map((v) => v.id).join(', ')}`);
