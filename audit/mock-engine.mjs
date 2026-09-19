// mock-engine.mjs — a stand-in "production engine" written the OBVIOUS way (plain Numbers,
// running minimum, closed form), used only to prove that fuzz.mjs works.
//   BUG unset  -> correct; must agree with the oracle on every case.
//   BUG=<name> -> one deliberate, realistic bug; fuzz.mjs must catch it.
// Bugs: ge50 | tier | capup | paytrunc | tie | dipdef | order | nofloor | float | spread | negzero | e2
// nearLine convention variants (not math bugs): nearexcl | nearsigned | nearnogate | nearpick
const BUG = process.env.BUG || '';

export function analyze(account) {
  const { startMonth, startingBalanceCents: S } = account;
  const cm = account.cushionMonths ?? 2;
  const current = account.borrowerCurrent ?? true;

  const bills = Array(13).fill(0);
  let D = 0;
  for (const d of account.disbursements) {
    if (BUG === 'order') bills[d.month] = d.amountCents; // classic overwrite bug: last bill in a month wins
    else bills[d.month] += d.amountCents;
    D += d.amountCents;
  }

  let P = Math.floor((D + 6) / 12);
  if (BUG === 'paytrunc') P = Math.floor(D / 12);
  if (BUG === 'float') P = D / 12; // floating-point dollars-style bug: never rounded
  let C = Math.floor((D * cm) / 12);
  if (BUG === 'capup') C = Math.ceil((D * cm) / 12); // rounds the CAP up past the legal limit

  const step1 = [];
  let t = 0;
  let minT = 0; // opening row counts, so A is never below 0
  if (BUG === 'nofloor') minT = Infinity;
  for (let m = 1; m <= 12; m++) {
    t += P - bills[m];
    step1.push(t);
    if (t < minT) minT = t;
  }
  const A = BUG === 'negzero' ? -minT : 0 - minT; // `-minT` yields -0 when minT is 0 (my own first draft did this)
  const required = A + C;
  const difference = S - required;

  let lowIdx = 0;
  for (let i = 1; i < 12; i++) {
    if (BUG === 'tie' ? step1[i] <= step1[lowIdx] : step1[i] < step1[lowIdx]) lowIdx = i;
  }
  const lowProjected = S + step1[lowIdx];

  const surplus = Math.max(0, difference);
  let deficiency = Math.max(0, -S);
  if (BUG === 'dipdef') deficiency = Math.max(0, -lowProjected); // wrong: a projected dip is not a deficiency
  const shortage = difference < 0 ? (BUG === 'dipdef' ? -difference - deficiency : required - Math.max(S, 0)) : 0;

  const lt = (x) => (BUG === 'tier' ? x <= P : x < P);
  const tier = (x) => (lt(x) ? 'LT' : 'GE');
  const CITE = {
    SURPLUS_REFUND_REQUIRED: '12 CFR 1024.17(f)(2)(i)', SURPLUS_UNDER_50: '12 CFR 1024.17(f)(2)(i)',
    SURPLUS_BORROWER_NOT_CURRENT: '12 CFR 1024.17(f)(2)(ii)', ON_TARGET: '12 CFR 1024.17(d)(2)',
    SHORTAGE_LT_ONE_MONTH: '12 CFR 1024.17(f)(3)(i)', SHORTAGE_GE_ONE_MONTH: '12 CFR 1024.17(f)(3)(ii)',
    DEFICIENCY_LT_ONE_MONTH: '12 CFR 1024.17(f)(4)(i)', DEFICIENCY_GE_ONE_MONTH: '12 CFR 1024.17(f)(4)(ii)',
    DEFICIENCY_BORROWER_NOT_CURRENT: '12 CFR 1024.17(f)(4)(iii)',
  };
  let classification; let cite;
  if (deficiency > 0) {
    const e2 = !current && BUG !== 'e2'; // SPEC E2: no deficiency tier when the borrower is not current
    const dk = e2 ? 'DEFICIENCY_BORROWER_NOT_CURRENT' : `DEFICIENCY_${tier(deficiency)}_ONE_MONTH`;
    if (shortage > 0) { const sk = `SHORTAGE_${tier(shortage)}_ONE_MONTH`; classification = `${dk}_AND_${sk}`; cite = `${CITE[dk]} + ${CITE[sk]}`; }
    else { classification = dk; cite = CITE[dk]; }
  } else if (surplus > 0) {
    const big = BUG === 'ge50' ? surplus > 5000 : surplus >= 5000;
    classification = !current ? 'SURPLUS_BORROWER_NOT_CURRENT' : big ? 'SURPLUS_REFUND_REQUIRED' : 'SURPLUS_UNDER_50';
    cite = CITE[classification];
  } else if (shortage > 0) { classification = `SHORTAGE_${tier(shortage)}_ONE_MONTH`; cite = CITE[classification]; }
  else { classification = 'ON_TARGET'; cite = CITE.ON_TARGET; }

  const halfUp = (n, d) => Math.floor((2 * n + d) / (2 * d));
  const sSpread = BUG === 'spread' ? Math.floor(shortage / 12) : halfUp(shortage, 12);
  const schedule = deficiency > 0 && (current || BUG === 'e2');
  const dSpread = schedule ? halfUp(deficiency, 2) : 0;

  // SPEC E3 nearLine (auditor convention: inclusive band, absolute distance, operative lines only, surplus > deficiency > shortage)
  const inBand = (x, line) => (BUG === 'nearexcl' ? Math.abs(x - line) < 700 : Math.abs(x - line) <= 700);
  const dist = (x, line) => (BUG === 'nearsigned' ? x - line : Math.abs(x - line));
  const gate = BUG === 'nearnogate' ? true : current;
  let nearLine = null;
  const cands = [];
  if (surplus > 0 && gate && inBand(surplus, 5000)) cands.push({ line: 'SURPLUS_50', distanceCents: dist(surplus, 5000), toleranceCents: 700 });
  if (deficiency > 0 && gate && inBand(deficiency, P)) cands.push({ line: 'ONE_MONTH_PAYMENT', distanceCents: dist(deficiency, P), toleranceCents: 700 });
  if (shortage > 0 && inBand(shortage, P)) cands.push({ line: 'ONE_MONTH_PAYMENT', distanceCents: dist(shortage, P), toleranceCents: 700 });
  if (cands.length) nearLine = BUG === 'nearpick' ? cands[cands.length - 1] : cands[0];

  const cal = (m) => ((startMonth - 1 + (m - 1)) % 12) + 1;
  const table = step1.map((s1, i) => ({
    month: i + 1, calendarMonth: cal(i + 1), depositCents: P, disbursementCents: bills[i + 1],
    step1TrialBalanceCents: s1, targetBalanceCents: s1 + required, projectedBalanceCents: s1 + S,
  }));

  return {
    annualDisbursementsCents: D, baseMonthlyPaymentCents: P, cushionCapCents: C, stepTwoAddCents: A,
    requiredStartingBalanceCents: required, differenceCents: difference,
    surplusCents: surplus, shortageCents: shortage, deficiencyCents: deficiency,
    lowPoint: { projectedBalanceCents: lowProjected, month: lowIdx + 1, calendarMonth: cal(lowIdx + 1), lowestTargetBalanceCents: Math.min(...table.map((r) => r.targetBalanceCents)) },
    classification, cite, nearLine,
    newMonthlyEscrowPayment: {
      baseMonthlyCents: P, shortageSpreadOver12Cents: sSpread, deficiencySpreadCents: dSpread,
      deficiencySpreadMonths: schedule ? 2 : 0,
      monthlyEscrowWhileRepayingDeficiencyCents: P + sSpread + dSpread,
      monthlyEscrowAfterDeficiencyRepaidCents: P + sSpread,
    },
    table,
  };
}
