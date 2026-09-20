// stage2-compare-checks.mjs — independent checks of the engine pieces the oracle does not cover (part D):
//   projectWithPayment, paymentJumpDecomposition, explainJump, compareWithStatement flags, refundDeadline.
// Method for compareWithStatement: SIMULATED SERVICERS. A lawful servicer's statement must draw no
// accusing flag (false accusation); an unlawful one must draw the right flag (miss).
// Updated in Stage 3 to the engine's deliberate new rules, so it PASSES on correct behavior and FAILS on a regression:
//   A1  payment tolerance is $1.00 per separately rounded part of the maximum ($1 / $2 / $3)
//   A3  explainJump never blames deficiency collection when the borrower is not current
//   A12 paymentJumpDecomposition has FOUR parts that must add up to exactly (new - old)
//   B2  (superseded in Stage 4 by N1, below)
// Updated again in Stage 4 to fix order 3 (commits fa578c0, 3f67d12):
//   N1  an over-the-cap minimum that equals the federal low point (within $7) is decided by the rest of what was typed:
//       (a) a claim that MATCHES the federal math -> mix-up: nudge only, row 'not-compared', no flag
//       (b) a claim that is off by about (typed minimum - cap), signed -> the real CUSHION_OVER_CAP
//       (c) anything else -> amber CUSHION_MAYBE_OVER_CAP, row 'differs', overall 'look-here', letter stays a request for information
//   N2  borrower not current + deficiency: ceiling = base + shortage/12 + the WHOLE deficiency, tolerance $1 per rounded part
// Usage: node stage2-compare-checks.mjs [path-to-engine/index.js] [--n 20000]
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import { analyze as oracle } from './oracle.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const ni = argv.indexOf('--n'); const N = ni >= 0 ? Number(argv[ni + 1]) : 20000;
const pathArg = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--n');
const E = await import(pathToFileURL(resolve(process.cwd(), pathArg ?? join(here, '../engine/index.js'))).href);

let seed = 20260919;
const rnd = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const pick = (a) => a[int(0, a.length - 1)];
const halfUp = (n, d) => { const q = Math.floor(n / d); return (n - q * d) * 2 >= d ? q + 1 : q; };
let failures = 0;
const section = (t) => console.log(`\n=== ${t} ===`);
const check = (ok, label, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? '  ' + detail : ''}`); };
const finding = (label, detail = '') => console.log(`NOTE ${label}${detail ? '  ' + detail : ''}`);

// A1: $1.00 for each separately rounded part of OUR maximum: bills/12, + shortage/12 if any, + deficiency/2 if any.
const paymentTolerance = (r) => 100 * (1 + (r.newMonthlyEscrowPayment.shortageSpreadOver12Cents > 0 ? 1 : 0) + (r.newMonthlyEscrowPayment.deficiencySpreadCents > 0 ? 1 : 0));

function randomAccount(opts = {}) {
  const n = int(1, 6); const d = [];
  for (let k = 0; k < n; k++) d.push({ label: 'Bill ' + (k + 1), month: int(1, 12), amountCents: opts.roundDollars ? int(50, 9000) * 100 : int(5000, 900000) });
  return { startMonth: int(1, 12), startingBalanceCents: int(-300000, 1500000), cushionMonths: opts.cushionMonths ?? 2, borrowerCurrent: opts.current ?? rnd() < 0.85, disbursements: d };
}
// aim the balance so the account has a chosen outcome
function withOutcome(a, kind) {
  const r = oracle(a); const req = r.requiredStartingBalanceCents; const P = r.baseMonthlyPaymentCents;
  if (kind === 'bigShortage') a.startingBalanceCents = Math.max(0, req - P - int(5000, 200000));
  if (kind === 'smallShortage') a.startingBalanceCents = req - int(1500, Math.max(1600, P - 1500));
  if (kind === 'surplus') a.startingBalanceCents = req + int(8000, 200000);
  if (kind === 'deficiency') a.startingBalanceCents = -int(1000, 300000);
  if (a.startingBalanceCents < 0 && kind !== 'deficiency') a.startingBalanceCents = 0;
  return a;
}

// ---------------------------------------------------------------------------
section('projectWithPayment');
{
  let bad = 0;
  for (let i = 0; i < 5000; i++) {
    const a = randomAccount(); const pay = int(0, 500000);
    const got = E.projectWithPayment(a, pay);
    let bal = a.startingBalanceCents; const want = [];
    for (let m = 1; m <= 12; m++) { bal += pay - a.disbursements.filter((b) => b.month === m).reduce((s, b) => s + b.amountCents, 0); want.push(bal); }
    if (JSON.stringify(got) !== JSON.stringify(want) || got.some((x) => Object.is(x, -0))) bad++;
    const r = E.analyze(a); const same = E.projectWithPayment(a, r.baseMonthlyPaymentCents);
    if (JSON.stringify(same) !== JSON.stringify(r.table.map((row) => row.projectedBalanceCents))) bad++;
  }
  check(bad === 0, '5,000 random accounts: equals an independent month-by-month sum; with payment = bills/12 it equals the table\'s projected column; no -0');
  const a = randomAccount();
  for (const p of [-1, 1.5, NaN, Infinity, '500', null, undefined, 1000000001]) { let threw = false; try { E.projectWithPayment(a, p); } catch { threw = true; } check(threw, `refuses a payment of ${String(p)}`); }
  let threw = false; try { E.projectWithPayment({ ...a, startMonth: 13 }, 100); } catch { threw = true; } check(threw, 'refuses an invalid account');
}

// ---------------------------------------------------------------------------
section('paymentJumpDecomposition (analyze, needs priorYear)');
{
  let sumBad = 0; let sumBadWhenOldIsPlain = 0; let breakdownBad = 0; let deficiencyNewOmitsSpread = 0; let cases = 0; let example = null;
  for (let i = 0; i < N; i++) {
    const a = randomAccount(); const oldD = int(100000, 1500000); const oldBase = halfUp(oldD, 12);
    const oldHadShortageAddOn = rnd() < 0.5; const oldMonthly = oldBase + (oldHadShortageAddOn ? int(100, 20000) : 0);
    a.priorYear = { annualDisbursementsCents: oldD, monthlyEscrowCents: oldMonthly, cushionCents: Math.floor(oldD / 6), stepTwoAddCents: int(0, 300000) };
    const r = E.analyze(a); const j = r.paymentJumpDecomposition; cases++;
    const parts = j.billsWentUpCents + j.shortageRepaymentCents + j.deficiencyRepaymentCents + j.lastYearAddOnDroppedOffCents; const jump = j.newMonthlyEscrowCents - j.oldMonthlyEscrowCents;
    if (parts !== jump) { sumBad++; if (!oldHadShortageAddOn) sumBadWhenOldIsPlain++; if (!example) example = { old: oldMonthly, oldBillsDiv12: oldBase, new: j.newMonthlyEscrowCents, billsWentUp: j.billsWentUpCents, shortageRepayment: j.shortageRepaymentCents, partsSum: parts, realJump: jump }; }
    const b = j.shortageBreakdown; const bsum = b.cushionRoseCents + b.timingNeedRoseCents + b.lastYearCameInUnderProjectionCents;
    if (bsum !== r.requiredStartingBalanceCents - a.startingBalanceCents) breakdownBad++;
    if (j.newMonthlyEscrowCents !== r.newMonthlyEscrowPayment.monthlyEscrowWhileRepayingDeficiencyCents) deficiencyNewOmitsSpread++;
  }
  check(breakdownBad === 0, `${cases} cases: shortageBreakdown's three pieces add up exactly to (required start - balance)`);
  check(sumBad === 0, `A12: ${cases} cases (half with an add-on in last year's payment): billsWentUp + shortageRepayment + deficiencyRepayment + lastYearAddOnDroppedOff == new - old, exactly`, sumBad ? `${sumBad} wrong, e.g. ${JSON.stringify(example)}` : '');
  check(deficiencyNewOmitsSpread === 0, 'A12: its "new payment" is the payment while a deficiency is being repaid (base + shortage/12 + deficiency/2)', deficiencyNewOmitsSpread ? `${deficiencyNewOmitsSpread} wrong` : '');
}

// ---------------------------------------------------------------------------
section('explainJump: four parts must add up to exactly (new - old), always');
{
  let bad = 0; let negJumps = 0; let defCases = 0; let notCurrentDeficiencyBlamed = 0; let ex = null;
  for (let i = 0; i < N; i++) {
    const a = withOutcome(randomAccount(), pick(['bigShortage', 'smallShortage', 'surplus', 'deficiency', 'none']));
    const r = E.analyze(a); const st = { currentMonthlyEscrowCents: int(0, 300000), newMonthlyEscrowCents: int(0, 300000) };
    if (rnd() < 0.3) st.newMonthlyEscrowCents = r.newMonthlyEscrowPayment.monthlyEscrowWhileRepayingDeficiencyCents + pick([0, 0, 1, -1, 100, 101, 5000]);
    const j = E.explainJump(r, st); const sum = j.parts.reduce((s, p) => s + p.cents, 0);
    if (sum !== st.newMonthlyEscrowCents - st.currentMonthlyEscrowCents || j.changeCents !== sum || j.parts.some((p) => !Number.isSafeInteger(p.cents) || Object.is(p.cents, -0))) bad++;
    if (j.changeCents < 0) negJumps++; if (r.deficiencyCents > 0) defCases++;
    // not current + deficiency: the rule sets no cap on deficiency collection ((f)(4)(iii)) - does the text still call the extra "more than the federal math supports"?
    if (r.deficiencyCents > 0 && !a.borrowerCurrent) {
      const st2 = { currentMonthlyEscrowCents: r.baseMonthlyPaymentCents, newMonthlyEscrowCents: r.newMonthlyEscrowPayment.monthlyEscrowAfterDeficiencyRepaidCents + Math.ceil(r.deficiencyCents / 2) };
      const j2 = E.explainJump(r, st2); const un = j2.parts.find((p) => p.key === 'unexplained');
      if (j2.parts.some((p) => /more than the federal math supports/.test(p.sentence))) { notCurrentDeficiencyBlamed++; if (!ex) ex = { account: a, statement: st2, sentence: un.sentence }; }
    }
  }
  check(bad === 0, `${N} random old/new payments (${negJumps} negative jumps, ${defCases} deficiency accounts): parts sum exactly, whole cents, no -0`);
  check(notCurrentDeficiencyBlamed === 0, 'A3: borrower not current + deficiency collected through the payment is never labelled "more than the federal math supports" ((f)(4)(iii))', notCurrentDeficiencyBlamed ? `${notCurrentDeficiencyBlamed} cases, e.g. ${JSON.stringify(ex).slice(0, 400)}` : '');
  check(E.explainJump({}, null) === null && E.explainJump(E.analyze(randomAccount()), { newMonthlyEscrowCents: 5 }) === null, 'returns null without both payments');
}

// ---------------------------------------------------------------------------
section('compareWithStatement vs SIMULATED LAWFUL servicers (any accusing flag = false accusation)');
const ACCUSING = ['CUSHION_OVER_CAP', 'PAYMENT_ABOVE_MAX', 'KIND_DIFFERS', 'SPREAD_TOO_SHORT', 'LUMP_SUM_OFFERED'];
function tally(map, k) { map[k] = (map[k] || 0) + 1; }
function lawfulExactStatement(a, r) {
  const cap = r.cushionCapCents; const P = r.baseMonthlyPaymentCents;
  const cushion = pick([cap, cap, cap, Math.max(0, cap - int(1, cap || 1)), 0, Math.floor(cap / 2)]);
  const req = r.stepTwoAddCents + cushion; const S = a.startingBalanceCents;
  const deficiency = S < 0 ? -S : 0; const surplus = S > req ? S - req : 0; const shortage = S < req ? req - Math.max(S, 0) : 0;
  const st = { requiredMinimumBalanceCents: cushion, currentMonthlyEscrowCents: int(10000, 200000) };
  let pay = P; const how = {};
  if (shortage > 0) {
    const small = shortage < P; const choice = pick(small ? ['spread', 'spread', 'nothing', 'lump30'] : ['spread', 'spread', 'spread', 'nothing']);
    how.shortage = choice;
    if (choice === 'spread') { const n = pick([12, 12, 12, 13, 18, 24, 36, 60]); st.shortageSpreadMonths = n; pay += halfUp(shortage, n); }
    if (choice === 'lump30') { st.shortageSpreadMonths = 1; st.lumpSumOfferedOnStatement = true; }
  }
  if (deficiency > 0) {
    if (a.borrowerCurrent) { const small = deficiency < P; const choice = pick(small ? ['spread', 'nothing', 'lump30'] : ['spread', 'spread', 'nothing']); how.deficiency = choice; if (choice === 'spread') pay += halfUp(deficiency, pick([2, 2, 3, 6, 12])); }
    else { how.deficiency = 'loan-documents'; pay += halfUp(deficiency, pick([1, 1, 2, 3])); } // (f)(4)(iii): whatever the mortgage documents allow
  }
  if (surplus > 0 && surplus < 5000 && a.borrowerCurrent && rnd() < 0.5) { pay -= halfUp(surplus, 12); how.surplus = 'credit'; }
  st.newMonthlyEscrowCents = pay;
  if (surplus > 0) { st.claimedKind = 'surplus'; st.claimedAmountCents = surplus; }
  else if (deficiency > 0 && shortage > 0) { const c = pick([['shortage', shortage], ['shortage', shortage + deficiency], ['deficiency', deficiency], ['deficiency', shortage + deficiency]]); st.claimedKind = c[0]; st.claimedAmountCents = c[1]; }
  else if (deficiency > 0) { st.claimedKind = 'deficiency'; st.claimedAmountCents = deficiency; }
  else if (shortage > 0) { st.claimedKind = 'shortage'; st.claimedAmountCents = shortage; }
  else st.claimedKind = 'none';
  return { st, how };
}
{
  const flagsSeen = {}; const softSeen = {}; let accused = 0; const examples = [];
  for (let i = 0; i < N; i++) {
    const a = withOutcome(randomAccount({ cushionMonths: pick([2, 2, 2, 1, 0]) }), pick(['bigShortage', 'smallShortage', 'surplus', 'deficiency', 'none', 'none']));
    const r = E.analyze(a); const { st, how } = lawfulExactStatement(a, r);
    const c = E.compareWithStatement(r, st);
    let bad = (c.nudges ?? []).length > 0; if (bad) tally(flagsSeen, 'NUDGE');
    for (const f of c.flags) { const accusing = ACCUSING.includes(f.kind) || (f.kind === 'AMOUNT_DIFFERS' && f.rowKey !== 'newMonthlyEscrow'); if (accusing) { bad = true; tally(flagsSeen, f.kind + (f.rowKey ? ':' + f.rowKey : '')); } else tally(softSeen, f.kind + ':' + f.rowKey); }
    if (bad) { accused++; if (examples.length < 4) examples.push({ account: a, statement: st, how, flags: c.flags.map((f) => f.kind + ' ' + f.sentence.slice(0, 160)) }); }
  }
  check(accused === 0, `${N} statements from a servicer that follows the rule to the cent (smaller cushions, 12-60 month spreads, 30-day requests for small amounts, 2+ month deficiency plans, loan-document recovery when not current, under-$50 credits, every way of wording a deficiency+shortage): none accused`, accused ? `${accused} accused: ${JSON.stringify(flagsSeen)}` : '');
  examples.forEach((e) => console.log('     example: ' + JSON.stringify(e).slice(0, 900)));
  finding(`soft "your payment is lower than expected" flags on those lawful statements: ${JSON.stringify(softSeen)} (tone is amber "look here"; wording says lower is allowed)`);
}

section('compareWithStatement vs a lawful servicer that ROUNDS EVERY FIGURE TO WHOLE DOLLARS (HUD 1995: allowed)');
{
  const flagsSeen = {}; let accused = 0; let maxPayGap = 0; const examples = []; let total = 0;
  for (let i = 0; i < N; i++) {
    const fam = pick(['bigShortage', 'bigShortage', 'smallShortage', 'surplus', 'none', 'nearZero', 'nearZero', 'deficiency']);
    const a = withOutcome(randomAccount({ current: true }), fam);
    if (fam === 'nearZero') a.startingBalanceCents = Math.max(0, oracle(a).requiredStartingBalanceCents + int(-900, 900));
    if (a.startingBalanceCents < 0 && fam !== 'deficiency') continue; total++;
    const r = E.analyze(a); const D = r.annualDisbursementsCents;
    const P$ = halfUp(D, 1200) * 100; // bills / 12, to the nearest dollar
    let t = 0; let min = 0; for (let m = 1; m <= 12; m++) { t += P$ - r.table[m - 1].disbursementCents; if (t < min) min = t; }
    const cushion$ = pick([halfUp(D, 600) * 100, 2 * P$]); // one-sixth to the nearest dollar, or two of the rounded payments
    const req$ = -min + cushion$; const S = a.startingBalanceCents;
    const st = { requiredMinimumBalanceCents: cushion$, shortageSpreadMonths: 12 };
    let pay = P$;
    if (S < 0) { const def$ = halfUp(-S, 100) * 100; const sh$ = halfUp(req$, 100) * 100; st.claimedKind = 'deficiency'; st.claimedAmountCents = def$; pay += halfUp(sh$, 1200) * 100 + halfUp(def$, 200) * 100; }
    else if (S < req$) { const sh$ = halfUp(req$ - S, 100) * 100; st.claimedKind = 'shortage'; st.claimedAmountCents = sh$; pay += halfUp(sh$, 1200) * 100; }
    else if (S > req$) { st.claimedKind = 'surplus'; st.claimedAmountCents = halfUp(S - req$, 100) * 100; }
    else st.claimedKind = 'none';
    st.newMonthlyEscrowCents = pay;
    const c = E.compareWithStatement(r, st);
    const acc = c.flags.filter((f) => ACCUSING.includes(f.kind) || (f.kind === 'AMOUNT_DIFFERS' && f.rowKey !== 'newMonthlyEscrow'));
    if (acc.length) { accused++; acc.forEach((f) => tally(flagsSeen, f.kind)); const pf = acc.find((f) => f.kind === 'PAYMENT_ABOVE_MAX'); if (pf) maxPayGap = Math.max(maxPayGap, pf.amountCents); if (examples.length < 2) examples.push({ account: a, statement: st, flags: acc.map((f) => f.sentence.slice(0, 230)) }); }
  }
  check(accused === 0, `A1: ${total} whole-dollar statements (big, small and zero-ish shortages, surpluses, deficiencies): none accused`, accused ? `${accused} accused: ${JSON.stringify(flagsSeen)}, largest over-the-maximum gap ${maxPayGap} cents` : '');
  examples.forEach((e) => console.log('     example: ' + JSON.stringify(e).slice(0, 1000)));
}

section('compareWithStatement vs UNLAWFUL statements (no flag = a miss) and the tolerance edges');
{
  const miss = {}; const hit = {}; const edge = {};
  const has = (c, kind) => c.flags.some((f) => f.kind === kind);
  // N1 case (c), exactly as the contract words it: the amber flag, row "differs", no nudge, no hard cushion flag, overall "look-here"
  const isMaybe = (c) => has(c, 'CUSHION_MAYBE_OVER_CAP') && !has(c, 'CUSHION_OVER_CAP') && (c.nudges ?? []).length === 0 && c.rows[0].key === 'requiredMinimumBalance' && c.rows[0].status === 'differs' && c.overall === 'look-here';
  const score = (name, ok) => tally(ok ? hit : miss, name);
  for (let i = 0; i < Math.floor(N / 4); i++) {
    // 1. cushion over the cap
    { const a = withOutcome(randomAccount({ cushionMonths: pick([2, 1, 0]) }), 'bigShortage'); const r = E.analyze(a);
      { const typed = r.cushionCapCents + int(701, 90000); const c = E.compareWithStatement(r, { requiredMinimumBalanceCents: typed }); const isLowPoint = Math.abs(typed - r.lowPoint.projectedBalanceCents) <= 700; const maybe = isMaybe(c);
        score('cushion over cap by > $7.00 -> CUSHION_OVER_CAP, or (N1 case c) the amber CUSHION_MAYBE_OVER_CAP when the typed number is also the federal low point', isLowPoint ? maybe && !has(c, 'CUSHION_OVER_CAP') : has(c, 'CUSHION_OVER_CAP') && (c.nudges ?? []).length === 0); }
      tally(edge, 'cushion over by exactly $7.00 flagged: ' + has(E.compareWithStatement(r, { requiredMinimumBalanceCents: r.cushionCapCents + 700 }), 'CUSHION_OVER_CAP'));
      { const c = E.compareWithStatement(r, { requiredMinimumBalanceCents: r.cushionCapCents + 701 }); tally(edge, 'cushion over by $7.01 flagged (CUSHION_OVER_CAP, or the amber CUSHION_MAYBE_OVER_CAP when it equals the low point): ' + (has(c, 'CUSHION_OVER_CAP') || isMaybe(c))); } }
    // 1b. N1: a servicer that REALLY holds an oversized cushion X, with the balance sitting on the servicer's own target (so the federal low point equals X)
    { const a = randomAccount({ current: pick([true, false]) }); const ref = oracle(a); const X = ref.cushionCapCents + int(701, 90000); const noise = int(-700, 700); a.startingBalanceCents = ref.stepTwoAddCents + X + noise; const r = E.analyze(a);
      const claim = noise < 0 ? { claimedKind: 'shortage', claimedAmountCents: -noise } : noise > 0 ? { claimedKind: 'surplus', claimedAmountCents: noise } : { claimedKind: 'none' };
      const pay = r.baseMonthlyPaymentCents + (noise < 0 ? halfUp(-noise, 12) : 0);
      const alone = E.compareWithStatement(r, { requiredMinimumBalanceCents: X }); const withPay = E.compareWithStatement(r, { requiredMinimumBalanceCents: X, newMonthlyEscrowCents: pay }); const withClaim = E.compareWithStatement(r, { requiredMinimumBalanceCents: X, ...claim }); const all3 = E.compareWithStatement(r, { requiredMinimumBalanceCents: X, newMonthlyEscrowCents: pay, ...claim });
      score('N1 (c): real over-the-cap minimum that equals the federal low point, nothing else typed -> amber CUSHION_MAYBE_OVER_CAP, row "differs", no nudge, no CUSHION_OVER_CAP, overall "look-here", letter stays a request for information', isMaybe(alone) && E.letterKind(r, alone) === 'REQUEST_FOR_INFORMATION');
      score('N1 (c): ...same with a matching new payment typed: still amber, NEVER overall "matches"', isMaybe(withPay) && withPay.overall === 'look-here' && E.letterKind(r, withPay) === 'REQUEST_FOR_INFORMATION');
      score('N1 (b): ...and when the servicer\'s own shortage / surplus / "none" is typed too -> the real CUSHION_OVER_CAP, no nudge, notice of error', [withClaim, all3].every((c) => has(c, 'CUSHION_OVER_CAP') && !has(c, 'CUSHION_MAYBE_OVER_CAP') && (c.nudges ?? []).length === 0 && c.overall === 'look-here' && E.letterKind(r, c) === 'NOTICE_OF_ERROR'));
      score('N1: a real oversized cushion is never green, whatever was typed with it', [alone, withPay, withClaim, all3].every((c) => c.overall !== 'matches' && c.flags.length > 0)); }
    // 1c. N1 (a): a LAWFUL servicer (cushion exactly at the cap); the homeowner types the LOWEST PROJECTED BALANCE into "required minimum"
    { const a = randomAccount({ current: pick([true, false]) }); const ref = oracle(a); const over = int(701, 90000); a.startingBalanceCents = ref.requiredStartingBalanceCents + over; const r = E.analyze(a); const L = r.lowPoint.projectedBalanceCents;
      const claim = { claimedKind: 'surplus', claimedAmountCents: over }; const pay = r.baseMonthlyPaymentCents;
      const withClaim = E.compareWithStatement(r, { requiredMinimumBalanceCents: L, ...claim }); const all3 = E.compareWithStatement(r, { requiredMinimumBalanceCents: L, newMonthlyEscrowCents: pay, ...claim }); const alone = E.compareWithStatement(r, { requiredMinimumBalanceCents: L });
      score('N1 (a): lawful servicer, low point mistyped as the minimum, the statement\'s surplus typed and matching -> ONE nudge (MINIMUM_LOOKS_LIKE_LOW_POINT), row "not-compared", no flag at all, letter is a request for information', [withClaim, all3].every((c) => (c.nudges ?? []).length === 1 && c.nudges[0].kind === 'MINIMUM_LOOKS_LIKE_LOW_POINT' && c.rows[0].status === 'not-compared' && c.flags.length === 0 && c.overall === 'matches' && E.letterKind(r, c) === 'REQUEST_FOR_INFORMATION'));
      score('N1 (c): same mistype with no claim typed -> amber CUSHION_MAYBE_OVER_CAP only: never the hard CUSHION_OVER_CAP, never a notice of error', isMaybe(alone) && E.letterKind(r, alone) === 'REQUEST_FOR_INFORMATION'); }
    // 2. payment above the lawful maximum (current borrower, and NOT-current borrower with a shortage only)
    for (const current of [true, false]) { const a = withOutcome(randomAccount({ current }), pick(['bigShortage', 'smallShortage', 'surplus', 'none'])); const r = E.analyze(a); const max = r.newMonthlyEscrowPayment.monthlyEscrowWhileRepayingDeficiencyCents;
      const tol = paymentTolerance(r);
      score(`payment above the maximum by more than the scaled tolerance (borrower current=${current}, no deficiency) -> PAYMENT_ABOVE_MAX`, has(E.compareWithStatement(r, { newMonthlyEscrowCents: max + tol + int(1, 30000) }), 'PAYMENT_ABOVE_MAX'));
      score(`A1 edge, ${tol / 100} part(s): exactly ${tol / 100}.00 over is NOT flagged`, !has(E.compareWithStatement(r, { newMonthlyEscrowCents: max + tol }), 'PAYMENT_ABOVE_MAX'));
      score(`A1 edge, ${tol / 100} part(s): ${tol / 100}.01 over IS flagged`, has(E.compareWithStatement(r, { newMonthlyEscrowCents: max + tol + 1 }), 'PAYMENT_ABOVE_MAX')); }
    { const a = withOutcome(randomAccount({ current: true }), 'deficiency'); const r = E.analyze(a); const max = r.newMonthlyEscrowPayment.monthlyEscrowWhileRepayingDeficiencyCents; const tol = paymentTolerance(r);
      score(`A1 edge, deficiency account (${tol / 100} parts), borrower current: exactly the tolerance passes, one cent more is flagged`, !has(E.compareWithStatement(r, { newMonthlyEscrowCents: max + tol }), 'PAYMENT_ABOVE_MAX') && has(E.compareWithStatement(r, { newMonthlyEscrowCents: max + tol + 1 }), 'PAYMENT_ABOVE_MAX')); }
    // 3. shortage repaid too fast
    for (const current of [true, false]) { const a = withOutcome(randomAccount({ current }), 'bigShortage'); const r = E.analyze(a); if (r.shortageCents <= r.baseMonthlyPaymentCents + 700) continue; const m = int(1, 11);
      score(`large shortage spread over 1-11 months (current=${current}) -> SPREAD_TOO_SHORT`, has(E.compareWithStatement(r, { shortageSpreadMonths: m, claimedKind: pick(['shortage', undefined]), claimedAmountCents: r.shortageCents, newMonthlyEscrowCents: r.baseMonthlyPaymentCents + halfUp(r.shortageCents, m) }), 'SPREAD_TOO_SHORT'));
      const fasterBy = halfUp(r.shortageCents, m) - halfUp(r.shortageCents, 12); // only expect the payment flag when the faster plan costs more than the scaled tolerance
      if (fasterBy > paymentTolerance(r)) score(`...and the faster payment itself (above the 12-month plan by more than the tolerance) -> PAYMENT_ABOVE_MAX`, has(E.compareWithStatement(r, { shortageSpreadMonths: m, newMonthlyEscrowCents: r.baseMonthlyPaymentCents + halfUp(r.shortageCents, m) }), 'PAYMENT_ABOVE_MAX'));
      score('lump sum printed on the statement for a large shortage -> LUMP_SUM_OFFERED', has(E.compareWithStatement(r, { lumpSumOfferedOnStatement: true }), 'LUMP_SUM_OFFERED')); }
    { const a = withOutcome(randomAccount(), 'smallShortage'); const r = E.analyze(a); if (r.shortageCents > 700 && r.shortageCents < r.baseMonthlyPaymentCents - 700 && r.deficiencyCents === 0) {
      score('small shortage spread over 2-11 months -> SPREAD_TOO_SHORT (SPEC D6)', has(E.compareWithStatement(r, { shortageSpreadMonths: int(2, 11) }), 'SPREAD_TOO_SHORT'));
      tally(edge, 'small shortage, 1-month (30-day) request flagged: ' + has(E.compareWithStatement(r, { shortageSpreadMonths: 1, lumpSumOfferedOnStatement: true }), 'SPREAD_TOO_SHORT')); } }
    // 4. wrong amount / wrong kind
    { const a = withOutcome(randomAccount(), 'bigShortage'); const r = E.analyze(a); if (r.deficiencyCents === 0) {
      score('claimed shortage inflated by > $7.00 -> AMOUNT_DIFFERS', has(E.compareWithStatement(r, { claimedKind: 'shortage', claimedAmountCents: r.shortageCents + int(701, 90000) }), 'AMOUNT_DIFFERS'));
      tally(edge, 'claimed shortage off by exactly $7.00 flagged: ' + (E.compareWithStatement(r, { claimedKind: 'shortage', claimedAmountCents: r.shortageCents + 700 }).flags.length > 0));
      score('statement calls a projected dip a "deficiency" though the balance is not below $0 -> KIND_DIFFERS', has(E.compareWithStatement(r, { claimedKind: 'deficiency', claimedAmountCents: r.shortageCents }), 'KIND_DIFFERS')); } }
    { const a = withOutcome(randomAccount(), 'surplus'); const r = E.analyze(a);
      score('statement says shortage, math says surplus (> $80) -> KIND_DIFFERS', has(E.compareWithStatement(r, { claimedKind: 'shortage', claimedAmountCents: int(1000, 50000) }), 'KIND_DIFFERS'));
      score('statement says "none", math says surplus (> $80) -> KIND_DIFFERS', has(E.compareWithStatement(r, { claimedKind: 'none' }), 'KIND_DIFFERS')); }
    // 5. N2: not current + deficiency. (f)(4)(iii) hands the SCHEDULE to the mortgage documents, not an unlimited amount.
    //    Ceiling, worked out here from the oracle and not from the engine: bills/12 + shortage/12 + the WHOLE deficiency, tolerance $1 per rounded part.
    { const a = withOutcome(randomAccount({ current: false }), 'deficiency'); const ref = oracle(a); const r = E.analyze(a);
      const sh12 = halfUp(ref.shortageCents, 12); const ceiling = ref.baseMonthlyPaymentCents + sh12 + ref.deficiencyCents; const tol = 100 * (1 + (sh12 > 0 ? 1 : 0) + 1);
      const at = E.compareWithStatement(r, { newMonthlyEscrowCents: ceiling + tol }); const past = E.compareWithStatement(r, { newMonthlyEscrowCents: ceiling + tol + 1 }); const far = E.compareWithStatement(r, { newMonthlyEscrowCents: ceiling + tol + int(2, 500000) });
      const inside = E.compareWithStatement(r, { newMonthlyEscrowCents: ref.baseMonthlyPaymentCents + sh12 + int(0, ref.deficiencyCents) });
      score('N2: NOT current + deficiency, payment anywhere from base + shortage/12 up to the ceiling (+ the whole deficiency) -> never PAYMENT_ABOVE_MAX, row "match"', !has(inside, 'PAYMENT_ABOVE_MAX') && inside.rows[0].status === 'match' && inside.overall === 'matches');
      score('N2 edge: exactly ceiling + tolerance passes; one cent more -> PAYMENT_ABOVE_MAX', !has(at, 'PAYMENT_ABOVE_MAX') && has(past, 'PAYMENT_ABOVE_MAX') && past.overall === 'look-here');
      score('N2: payment far above the ceiling -> PAYMENT_ABOVE_MAX, never green', has(far, 'PAYMENT_ABOVE_MAX') && far.overall === 'look-here' && E.letterKind(r, far) === 'NOTICE_OF_ERROR'); }
  }
  for (const [k, v] of Object.entries(hit)) check(!(k in miss), `${k}: caught ${v}${miss[k] ? ', MISSED ' + miss[k] : ''}`);
  for (const [k, v] of Object.entries(miss)) if (!(k in hit)) check(false, `${k}: MISSED all ${v}`);
  console.log('     tolerance edges: ' + JSON.stringify(edge, null, 1).replace(/\n/g, '\n     '));
}

// ---------------------------------------------------------------------------
section('refundDeadline: every date 1900-01-01 .. 2999-12-31 against JavaScript\'s own UTC calendar');
{
  let bad = 0; let n = 0; const p2 = (x) => String(x).padStart(2, '0');
  for (let ms = Date.UTC(1900, 0, 1); ms <= Date.UTC(2999, 11, 31); ms += 86400000) {
    const d = new Date(ms); const iso = `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
    const w = new Date(ms + 30 * 86400000); const want = `${w.getUTCFullYear()}-${p2(w.getUTCMonth() + 1)}-${p2(w.getUTCDate())}`;
    const got = E.refundDeadline(iso); n++; if (!(got.ok && got.isoDate === want)) { bad++; if (bad < 4) console.log('     ', iso, JSON.stringify(got), 'want', want); }
  }
  check(bad === 0, `${n} dates: analysis date + 30 days is right on every one (month ends, leap years incl. 1900/2000/2100, year rollover)`);
  for (const [inp, want] of [['2024-01-30', '2024-02-29'], ['2023-01-30', '2023-03-01'], ['2026-12-15', '2027-01-14'], ['2100-01-30', '2100-03-01'], ['2000-01-30', '2000-02-29']]) check(E.refundDeadline(inp).isoDate === want, `${inp} + 30 days = ${want}`, E.refundDeadline(inp).isoDate);
  check(E.refundDeadline('2026-09-01').display === 'October 1, 2026', 'display text', E.refundDeadline('2026-09-01').display);
  for (const b of ['2026-02-30', '2025-02-29', '2026-13-01', '2026-00-10', '2026-04-31', '2026-9-1', '09/01/2026', '2026-09-01T00:00', ' 2026-09-01', '2026-09-0١', '1899-12-31', '3000-01-01', '', null, undefined, 20260901, {}, '2026-09-1a', '２０２６-09-01']) { const r = E.refundDeadline(b); check(r.ok === false && typeof r.problem === 'string', `invalid date ${JSON.stringify(b) ?? String(b)} is refused, not guessed`); }
}

console.log(`\n${failures === 0 ? 'ALL HARD CHECKS PASSED' : failures + ' HARD CHECK(S) FAILED'} (NOTE lines are findings to read)`);
process.exit(failures ? 1 : 0);
