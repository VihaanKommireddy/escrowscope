// compare.mjs — field-by-field differ shared by check-vectors.mjs and fuzz.mjs.
// HARD fields: a mismatch means somebody's math is wrong.
// SOFT fields: wording / convention fields where the SPEC is not fully pinned down.

export const HARD_SCALARS = [
  'annualDisbursementsCents', 'baseMonthlyPaymentCents', 'cushionCapCents', 'stepTwoAddCents',
  'requiredStartingBalanceCents', 'differenceCents', 'surplusCents', 'shortageCents', 'deficiencyCents',
  'classification',
];
export const HARD_LOW = ['projectedBalanceCents', 'month', 'calendarMonth'];
export const SOFT_LOW = ['lowestTargetBalanceCents'];
export const HARD_PAYMENT = [
  'baseMonthlyCents', 'shortageSpreadOver12Cents', 'deficiencySpreadCents', 'deficiencySpreadMonths',
  'monthlyEscrowWhileRepayingDeficiencyCents', 'monthlyEscrowAfterDeficiencyRepaidCents',
];
export const ROW_FIELDS = [
  'month', 'calendarMonth', 'depositCents', 'disbursementCents',
  'step1TrialBalanceCents', 'targetBalanceCents', 'projectedBalanceCents',
];
export const SOFT_SCALARS = ['cite'];

// expected = the reference (oracle or vector), actual = the thing under test.
export function compareResults(expected, actual) {
  const hard = [];
  const soft = [];
  // Numeric equality uses ===, so -0 and 0 count as the same NUMBER here. A returned -0 is still a
  // bug worth knowing about (assert.deepStrictEqual(-0, 0) fails; a formatter may print "-$0.00"),
  // so fuzz.mjs reports it separately under the invariant "no-negative-zero-outputs".
  const push = (list, path, e, a) => { if (!(e === a)) list.push({ path, expected: e, actual: a }); };

  if (actual === null || typeof actual !== 'object') {
    hard.push({ path: '(result)', expected: 'object', actual: String(actual) });
    return { hard, soft };
  }
  for (const k of HARD_SCALARS) push(hard, k, expected[k], actual[k]);
  for (const k of SOFT_SCALARS) push(soft, k, expected[k], actual[k]);

  const el = expected.lowPoint || {};
  const al = actual.lowPoint || {};
  for (const k of HARD_LOW) push(hard, `lowPoint.${k}`, el[k], al[k]);
  for (const k of SOFT_LOW) push(soft, `lowPoint.${k}`, el[k], al[k]);

  // SPEC E3 nearLine: null, or { line, distanceCents, toleranceCents }. Skipped when the reference
  // has no such key at all (the 22 original vectors before the additive key is merged in).
  if ('nearLine' in expected) {
    const en = expected.nearLine; const an = actual.nearLine;
    if (en === null || an === null || en === undefined || an === undefined || typeof an !== 'object') {
      if (!(en === an)) hard.push({ path: 'nearLine', expected: en, actual: an === undefined ? '(missing)' : an });
    } else {
      for (const k of ['line', 'distanceCents', 'toleranceCents']) push(hard, `nearLine.${k}`, en[k], an[k]);
      // SPEC E3a.6: extra descriptive keys on nearLine (appliesTo, side, amountCents, lineCents, ...) are allowed and ignored.
    }
  }
  // servicerOptions is wording, so it is SOFT; compared only when both sides have it.
  if (Array.isArray(expected.servicerOptions) && Array.isArray(actual.servicerOptions)) {
    push(soft, 'servicerOptions', JSON.stringify(expected.servicerOptions), JSON.stringify(actual.servicerOptions));
  }

  const ep = expected.newMonthlyEscrowPayment || {};
  const ap = actual.newMonthlyEscrowPayment || {};
  for (const k of HARD_PAYMENT) push(hard, `newMonthlyEscrowPayment.${k}`, ep[k], ap[k]);

  const et = expected.table || [];
  const at = Array.isArray(actual.table) ? actual.table : [];
  push(hard, 'table.length', et.length, at.length);
  for (let i = 0; i < Math.min(et.length, at.length); i++) {
    for (const k of ROW_FIELDS) push(hard, `table[${i}].${k}`, et[i][k], at[i][k]);
  }
  return { hard, soft };
}
