// stage4-measure.mjs: Stage 4. MEASURES the three-case N1 rule (fix order 3, commits fa578c0 + 3f67d12).
//   (i)   servicers that REALLY hold an over-the-cap cushion, account at steady state: how often is the result green?
//   (ii)  LAWFUL servicers whose homeowner mistypes the lowest projected balance as the required minimum: how often a hard accusation?
//   (iii) the known overlap of cases (a) and (b), and what the other order, (b) before (a), would cost.
// "green" = overall "matches" with no flag at all.   "hard accusation" = CUSHION_OVER_CAP, or a letter of kind NOTICE_OF_ERROR.
// Usage: node stage4-measure.mjs [path-to-engine/index.js] [--n 20000]
// Lines: ok / FAIL = a hard expectation.   NOTE = a measurement or a finding to read.
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import { analyze as oracle } from './oracle.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const ni = argv.indexOf('--n'); const N = ni >= 0 ? Number(argv[ni + 1]) : 20000;
const pathArg = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--n');
const enginePath = resolve(process.cwd(), pathArg ?? join(here, '../engine/index.js'));
const E = await import(pathToFileURL(enginePath).href);
// claimPointsToARealCushion is exported by compare.js for tests only; used here ONLY to replay the other order, (b) before (a).
const compareModule = await import(pathToFileURL(join(dirname(enginePath), 'compare.js')).href);
const C = { claimPointsToARealCushion: typeof compareModule.claimPointsToARealCushion === 'function' ? compareModule.claimPointsToARealCushion : () => false }; // an older engine has no such export

let seed = 4;
const rnd = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const pick = (a) => a[int(0, a.length - 1)];
const halfUp = (n, d) => { const q = Math.floor(n / d); return (n - q * d) * 2 >= d ? q + 1 : q; };
const $ = (c) => E.formatCents(c);
let failures = 0;
const section = (t) => console.log(`\n=== ${t} ===`);
const check = (ok, label, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? '  ' + detail : ''}`); return ok; };
const note = (label, detail = '') => console.log(`NOTE ${label}${detail ? '  ' + detail : ''}`);
const has = (c, kind) => c.flags.some((f) => f.kind === kind);
const isGreen = (c) => c.overall === 'matches' && c.flags.length === 0;
const isHard = (r, c) => has(c, 'CUSHION_OVER_CAP') || E.letterKind(r, c) === 'NOTICE_OF_ERROR';
const pad = (x, n = 6) => String(x).padStart(n);

function randomAccount(current) {
  const n = int(1, 6); const d = [];
  for (let k = 0; k < n; k++) d.push({ label: 'Bill ' + (k + 1), month: int(1, 12), amountCents: int(5000, 900000) });
  return { startMonth: int(1, 12), startingBalanceCents: 0, cushionMonths: pick([2, 2, 2, 2, 1]), borrowerCurrent: current, disbursements: d };
}
// what a servicer prints for its own signed difference (above 0 = surplus), to the cent
const printed = (diff) => (diff < 0 ? { claimedKind: 'shortage', claimedAmountCents: -diff } : diff > 0 ? { claimedKind: 'surplus', claimedAmountCents: diff } : { claimedKind: 'none' });
const newBucket = () => ({ n: 0, green: 0, overCap: 0, maybe: 0, nudgeOnly: 0, otherFlagOnly: 0, hard: 0, worstGreenExtra: 0, example: null });
function record(b, r, c, extra, account, st) {
  b.n++; if (has(c, 'CUSHION_OVER_CAP')) b.overCap++; else if (has(c, 'CUSHION_MAYBE_OVER_CAP')) b.maybe++; else if ((c.nudges ?? []).length > 0 && c.flags.length === 0) b.nudgeOnly++; else if (c.flags.length > 0) b.otherFlagOnly++;
  if (isHard(r, c)) b.hard++;
  if (isGreen(c)) { b.green++; if (extra > b.worstGreenExtra) { b.worstGreenExtra = extra; b.example = { account, statement: st, overTheCapBy: extra }; } }
}
const line = (k, b) => console.log(`       ${k.padEnd(46)}: n ${pad(b.n)} | GREEN ${pad(b.green)} | CUSHION_OVER_CAP ${pad(b.overCap)} | MAYBE ${pad(b.maybe)} | nudge only ${pad(b.nudgeOnly)} | hard accusation ${pad(b.hard)}`);

// ---------------------------------------------------------------------------
section(`(i) servicers that REALLY hold a cushion over the cap, account at steady state (${N} each)`);
let deficiencyZeroGreen = 0; let deficiencyZeroN = 0; let defExample = null;
{
  const typedNames = ['minimum only', 'minimum + new payment', 'minimum + claim (as the servicer prints it)', 'all three'];
  let greenTotal = 0; let nTotal = 0; let centGreen = 0; let worstGreen = 0;
  for (const [wname, current, dollars] of [['to-the-cent servicer, borrower current', true, false], ['to-the-cent servicer, borrower NOT current', false, false], ['whole-dollar servicer, borrower current', true, true], ['whole-dollar servicer, borrower NOT current', false, true]]) {
    const typed = Object.fromEntries(typedNames.map((k) => [k, newBucket()])); const band = newBucket(); let triggerMet = 0;
    for (let i = 0; i < N; i++) {
      const a = randomAccount(current); const ref = oracle(a); const cap = ref.cushionCapCents; const A = ref.stepTwoAddCents; const P = ref.baseMonthlyPaymentCents;
      let extra = pick([int(701, 1400), int(701, 5000), int(5001, 60000), Math.max(701, P)]); // a little (the overlap band), some, a lot, or a whole extra month
      let X = cap + extra; if (dollars) { X = Math.max(halfUp(X, 100) * 100, (Math.floor((cap + 700) / 100) + 1) * 100); extra = X - cap; }
      const noise = int(-700, 700); a.startingBalanceCents = A + X + noise; // steady state: the balance sits on the servicer's OWN target, within $7.00
      const r = E.analyze(a); if (Math.abs(X - r.lowPoint.projectedBalanceCents) <= 700) triggerMet++;
      const diff = dollars ? halfUp(Math.abs(noise), 100) * 100 * Math.sign(noise) : noise; const claim = printed(diff);
      const pay = (dollars ? halfUp(P, 100) * 100 : P) + (diff < 0 ? (dollars ? halfUp(-diff, 1200) * 100 : halfUp(-diff, 12)) : 0);
      const variants = { 'minimum only': { requiredMinimumBalanceCents: X }, 'minimum + new payment': { requiredMinimumBalanceCents: X, newMonthlyEscrowCents: pay }, 'minimum + claim (as the servicer prints it)': { requiredMinimumBalanceCents: X, ...claim }, 'all three': { requiredMinimumBalanceCents: X, newMonthlyEscrowCents: pay, ...claim } };
      for (const [k, st] of Object.entries(variants)) { const c = E.compareWithStatement(r, st); record(typed[k], r, c, extra, a, st); if (extra <= 1400 && k === 'all three') record(band, r, c, extra, a, st); }
      // probe: the statement prints "Deficiency: $0.00" and the homeowner picks "deficiency" and types 0
      { const st = { requiredMinimumBalanceCents: X, newMonthlyEscrowCents: pay, claimedKind: 'deficiency', claimedAmountCents: 0 }; const c = E.compareWithStatement(r, st); deficiencyZeroN++; if (isGreen(c)) { deficiencyZeroGreen++; if (!defExample || extra > defExample.overTheCapBy) defExample = { account: a, statement: st, overTheCapBy: extra, banner: E.explainVerdict(r, c).label }; } }
    }
    console.log(`  -- ${wname}: trigger met (typed minimum within $7.00 of the federal low point) in ${triggerMet} of ${N}`);
    for (const k of typedNames) { line('homeowner typed ' + k, typed[k]); greenTotal += typed[k].green; nTotal += typed[k].n; if (!dollars) centGreen += typed[k].green; if (typed[k].worstGreenExtra > worstGreen) worstGreen = typed[k].worstGreenExtra; }
    line('   of which over the cap by $7.01-$14.00, all three', band);
    for (const k of typedNames) if (typed[k].green) console.log(`       worst green (${k}): over the cap by ${$(typed[k].worstGreenExtra)}  ` + JSON.stringify(typed[k].example.statement));
  }
  note(`(i) total: ${greenTotal} green out of ${nTotal} comparisons of a genuinely over-the-cap cushion typed the way the servicer prints it. Most held over the cap in any green case: ${$(worstGreen)}.`);
  check(centGreen === 0, '(i) a to-the-cent servicer with a genuinely over-the-cap cushion is never green, whatever the homeowner types with it');
  check(worstGreen <= 750, '(i) a whole-dollar servicer can only come out green when it is over the cap by $7.50 or less (the $7.00 tolerance plus half a dollar of its own rounding)', `worst ${$(worstGreen)}`);
}

// ---------------------------------------------------------------------------
section(`(ii) LAWFUL servicers; the homeowner mistypes the LOWEST PROJECTED BALANCE as the required minimum (${N} each)`);
const overlapLawful = {}; // per world: how many claim-typed mix-ups have BOTH (a) and (b) true
{
  for (const [wname, dollars, side] of [['to-the-cent servicer, low point OVER the cap (the N1 trigger)', false, 'over'], ['whole-dollar servicer, low point OVER the cap (the N1 trigger)', true, 'over'], ['to-the-cent servicer, low point UNDER the cap (a shortage account; outside the N1 rule)', false, 'under']]) {
    const typedNames = ['minimum only', 'minimum + new payment', 'minimum + claim', 'all three']; const typed = Object.fromEntries(typedNames.map((k) => [k, newBucket()])); let skipped = 0; let ex = null;
    for (let i = 0; i < N; i++) {
      const a = randomAccount(rnd() < 0.85); const ref = oracle(a); const cap = ref.cushionCapCents; const A = ref.stepTwoAddCents; const P = ref.baseMonthlyPaymentCents;
      a.startingBalanceCents = side === 'over' ? ref.requiredStartingBalanceCents + pick([int(701, 1400), int(701, 4999), int(5000, 300000)]) : Math.max(0, ref.requiredStartingBalanceCents - pick([int(701, 5000), int(5001, Math.max(5002, cap))]));
      const r = E.analyze(a); const S = a.startingBalanceCents; let L; let claim; let pay;
      if (!dollars) { L = r.lowPoint.projectedBalanceCents; const diff = S - ref.requiredStartingBalanceCents; claim = printed(diff); pay = P + (diff < 0 ? halfUp(-diff, 12) : 0); }
      else { const P$ = halfUp(ref.annualDisbursementsCents, 1200) * 100; let t = 0; let min = 0; for (let m = 1; m <= 12; m++) { t += P$ - r.table[m - 1].disbursementCents; if (t < min) min = t; } const cushion$ = a.cushionMonths === 2 ? pick([halfUp(ref.annualDisbursementsCents, 600) * 100, 2 * P$]) : P$; /* lawful: never more months than the account allows */ const req$ = -min + cushion$; const diff$ = halfUp(Math.abs(S - req$), 100) * 100 * Math.sign(S - req$); L = halfUp(S + min, 100) * 100; claim = printed(diff$); pay = P$ + (diff$ < 0 ? halfUp(-diff$, 1200) * 100 : 0); }
      if (L < 0 || (side === 'over' && L - cap <= 700) || (side === 'under' && L >= cap)) { skipped++; continue; }
      const variants = { 'minimum only': { requiredMinimumBalanceCents: L }, 'minimum + new payment': { requiredMinimumBalanceCents: L, newMonthlyEscrowCents: pay }, 'minimum + claim': { requiredMinimumBalanceCents: L, ...claim }, 'all three': { requiredMinimumBalanceCents: L, newMonthlyEscrowCents: pay, shortageSpreadMonths: 12, ...claim } };
      for (const [k, st] of Object.entries(variants)) { const c = E.compareWithStatement(r, st); record(typed[k], r, c, L - cap, a, st); if (isHard(r, c) && !ex) ex = { account: a, statement: st, flags: c.flags.map((f) => f.kind) }; }
      // replay the other order on the claim variant: would (b) also have been true?
      if (side === 'over' && Math.abs(L - r.lowPoint.projectedBalanceCents) <= 700 && claim.claimedKind) { const c = E.compareWithStatement(r, variants['minimum + claim']); const row = c.rows.find((x) => x.key === 'claimedAmount'); const aTrue = row && row.status === 'match'; const bTrue = C.claimPointsToARealCushion(r, claim.claimedKind, claim.claimedAmountCents ?? 0, L - cap); const o = (overlapLawful[wname] ??= { both: 0, n: 0 }); o.n++; if (aTrue && bTrue) o.both++; }
    }
    console.log(`  -- ${wname} (${skipped} skipped: the low point was not on that side of the cap, or was below $0)`);
    for (const k of typedNames) line('homeowner typed ' + k, typed[k]);
    if (ex) console.log('       first hard accusation: ' + JSON.stringify(ex).slice(0, 700));
    if (side === 'over') check(typedNames.every((k) => typed[k].hard === 0), `(ii) ${wname}: no CUSHION_OVER_CAP and no notice of error, with or without a claim`);
    else note(`(ii) under the cap, the mistyped number is read as "the servicer uses a smaller cushion". With a claim typed, hard accusations: ${typed['minimum + claim'].hard} of ${typed['minimum + claim'].n} (claim only) and ${typed['all three'].hard} of ${typed['all three'].n} (all three). Without a claim: ${typed['minimum only'].hard} and ${typed['minimum + new payment'].hard}.`);
  }
}

// ---------------------------------------------------------------------------
section(`(iii) the overlap of (a) and (b): a servicer only $7.01-$14.00 over the cap whose statement says "none" (${N})`);
{
  const now = newBucket(); let bothTrue = 0; let aOnly = 0; let bOnly = 0; let neither = 0; let worst = 0; let worstEx = null; let fedSurplusLe7 = 0; let fedSurplusLe7Green = 0;
  for (let i = 0; i < N; i++) {
    const a = randomAccount(rnd() < 0.85); const ref = oracle(a); const cap = ref.cushionCapCents; const extra = int(701, 1400); const X = cap + extra;
    const noise = int(-700, 700); a.startingBalanceCents = ref.stepTwoAddCents + X + noise; const r = E.analyze(a); // the servicer's own difference is `noise`; it prints "none" (it does nothing about a few dollars)
    const st = { requiredMinimumBalanceCents: X, claimedKind: 'none', newMonthlyEscrowCents: ref.baseMonthlyPaymentCents }; const c = E.compareWithStatement(r, st); record(now, r, c, extra, a, st);
    const fed = r.differenceCents; const aTrue = Math.abs(fed) <= 700; const bTrue = C.claimPointsToARealCushion(r, 'none', 0, extra);
    if (aTrue && bTrue) bothTrue++; else if (aTrue) aOnly++; else if (bTrue) bOnly++; else neither++;
    if (fed >= 0 && fed <= 700) { fedSurplusLe7++; if (isGreen(c)) fedSurplusLe7Green++; }
    if (isGreen(c) && extra > worst) { worst = extra; worstEx = { account: a, statement: st, overTheCapBy: extra, federalSurplus: fed }; }
  }
  line('"none" + minimum + payment, as the engine decides now', now);
  console.log(`       (a) and (b) both true ${bothTrue} | only (a) ${aOnly} | only (b) ${bOnly} | neither ${neither}`);
  console.log(`       federal surplus $0.00-$7.00: ${fedSurplusLe7}, of which green ${fedSurplusLe7Green}. Most dollars over the cap in any green case: ${$(worst)}`);
  if (worstEx) console.log('       worst green: ' + JSON.stringify(worstEx));
  note(`(iii) with (a) first, ${now.green} of ${N} such statements (${(100 * now.green / N).toFixed(1)}%) read as a mix-up and come out green; the most held over the cap in any of them is ${$(worst)}. With (b) first those ${bothTrue} would be CUSHION_OVER_CAP instead.`);
  for (const [w, o] of Object.entries(overlapLawful)) note(`(iii) the price of (b) first, on LAWFUL servicers with a mistyped low point and a claim [${w}]: ${o.both} of ${o.n} would flip from a nudge to a hard CUSHION_OVER_CAP (both (a) and (b) true).`);
  check(worst <= 1400, '(iii) no green case holds more than $14.00 over the cap');
}

// ---------------------------------------------------------------------------
section('NEW: a "deficiency" claim of $0.00 to $7.00 is read as case (a) and turns any over-the-cap cushion green');
{
  note(`in world (i), typing the minimum + the payment + claimed kind "deficiency" with $0.00: ${deficiencyZeroGreen} of ${deficiencyZeroN} genuinely over-the-cap statements came out GREEN.`, defExample ? 'largest: ' + JSON.stringify(defExample).slice(0, 600) : '');
  const a = { startMonth: 1, startingBalanceCents: 180000, cushionMonths: 2, borrowerCurrent: false, disbursements: [{ label: 'Property tax', month: 6, amountCents: 360000 }, { label: 'Homeowners insurance', month: 12, amountCents: 360000 }] };
  const r = E.analyze(a); const st = { requiredMinimumBalanceCents: 180000, newMonthlyEscrowCents: 60000, claimedKind: 'deficiency', claimedAmountCents: 0 }; const c = E.compareWithStatement(r, st); const v = E.explainVerdict(r, c);
  console.log(`     minimal repro: the Stage 3 account (bills $3,600 June + $3,600 December, balance $1,800.00, a payment was 30+ days late; cap ${$(r.cushionCapCents)}). Statement: required minimum $1,800.00, new payment $600.00, "deficiency" $0.00.`);
  console.log(`       engine: rows ${c.rows.map((x) => x.key + ':' + x.status).join(' ')} | flags [${c.flags.map((f) => f.kind)}] | nudges ${c.nudges.length} | overall "${c.overall}" | banner ${v.tone} "${v.label}": ${v.headline}`);
  console.log(`       claimed row note: "${c.rows.find((x) => x.key === 'claimedAmount').note}"`);
  if (isGreen(c)) note('NEW N6 (wrong-answer, miss): OPEN. Case (a) accepts a matching DEFICIENCY claim as proof that the statement agrees with the federal math. When the trigger is met the balance is above $0, so the federal deficiency is always $0.00 and any claimed deficiency of $0.00-$7.00 "matches". A deficiency claim says nothing about the cushion (compare.js says so itself, in claimPointsToARealCushion).');
  else check(true, 'N6: an over-the-cap minimum + "deficiency $0.00" is no longer green');
  // the same root, with no cushion typed at all: "deficiency $0.00" alone is a "match" and turns the page green, and the row note says a shortage "matches your statement"
  const b = { startMonth: 1, startingBalanceCents: 100000, cushionMonths: 2, borrowerCurrent: false, disbursements: a.disbursements }; const rb = E.analyze(b); const cb = E.compareWithStatement(rb, { claimedKind: 'deficiency', claimedAmountCents: 0 }); const vb = E.explainVerdict(rb, cb);
  console.log(`     same root, nothing else typed: balance $1,000.00 (federal shortage ${$(rb.shortageCents)}), statement "deficiency $0.00" -> overall "${cb.overall}", banner ${vb.tone} "${vb.label}", row note: "${cb.rows[0].note}"`);
}

// ---------------------------------------------------------------------------
section('NEW: the same typing mix-up on the OTHER side of the cap (a shortage account) accuses a lawful servicer');
{
  const a = { startMonth: 1, startingBalanceCents: 100000, cushionMonths: 2, borrowerCurrent: true, disbursements: [{ label: 'Property tax', month: 6, amountCents: 360000 }, { label: 'Homeowners insurance', month: 12, amountCents: 360000 }] };
  const r = E.analyze(a); const right = { requiredMinimumBalanceCents: 120000, claimedKind: 'shortage', claimedAmountCents: 20000, shortageSpreadMonths: 12, newMonthlyEscrowCents: 61667 }; const mistyped = { ...right, requiredMinimumBalanceCents: r.lowPoint.projectedBalanceCents };
  const c1 = E.compareWithStatement(r, right); const c2 = E.compareWithStatement(r, mistyped);
  console.log(`     minimal repro: bills $3,600 June + $3,600 December, balance $1,000.00. A LAWFUL statement: required minimum ${$(r.cushionCapCents)}, lowest projected balance ${$(r.lowPoint.projectedBalanceCents)}, shortage ${$(r.shortageCents)}, new payment $616.67.`);
  console.log(`       typed correctly:                  overall "${c1.overall}", flags [${c1.flags.map((f) => f.kind)}], letter ${E.letterKind(r, c1)}`);
  console.log(`       low point typed as the minimum:   overall "${c2.overall}", flags [${c2.flags.map((f) => f.kind)}], nudges ${c2.nudges.length}, letter ${E.letterKind(r, c2)}`);
  c2.flags.forEach((f) => console.log('         > ' + f.sentence));
  if (isHard(r, c2)) note('NEW N7 (wrong-answer, false accusation): OPEN. Under the cap the mistyped low point is read as "the servicer uses a smaller cushion", the shortage then disappears from the federal side, and the lawful statement\'s real shortage draws KIND_DIFFERS and a notice of error. No nudge is offered on this side. See the "UNDER the cap" world in (ii) for how often.');
  else check(true, 'N7: a low point under the cap typed as the minimum no longer accuses a lawful servicer');
}

console.log(`\n${failures === 0 ? 'ALL STAGE 4 EXPECTATIONS MET' : failures + ' STAGE 4 EXPECTATION(S) NOT MET'} (NOTE lines are measurements and findings)`);
process.exit(failures ? 1 : 0);
