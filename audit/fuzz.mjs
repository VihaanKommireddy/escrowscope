// fuzz.mjs — differential fuzz + oracle-free invariant checks for an EscrowScope engine.
//
//   node fuzz.mjs [path-to-engine-module] [--n 5000] [--seed 20260919] [--show 10] [--quiet] [--family name]
//   (no path given -> ../engine/index.js next to this folder, i.e. the repo's engine)
//
// The engine module must export analyze(account) (named export, or on the default export).
// Every random account is run through (1) the engine under test and (2) the independent oracle
// (oracle.mjs), and diffed field by field. Then a set of invariants that need no oracle is checked.
// Exit code: 0 = clean, 1 = at least one hard disagreement / invariant failure / engine throw,
//            3 = math is clean but the engine's nearLine CONVENTIONS differ from the oracle's (spec decision).
import { pathToFileURL } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze as oracle } from './oracle.mjs';
import { compareResults } from './compare.mjs';

// ---------- CLI ----------
const args = process.argv.slice(2);
const enginePath = args.find((a, i) => !a.startsWith('--') && !['--n', '--seed', '--show', '--family'].includes(args[i - 1]));
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? Number(args[i + 1]) : dflt; };
const N = opt('n', 5000);
const SEED = opt('seed', 20260919);
const SHOW = opt('show', 10);
const QUIET = args.includes('--quiet');
const FAMILY = (() => { const i = args.indexOf('--family'); return i >= 0 ? args[i + 1] : null; })(); // force one generator family
const engineFile = enginePath ? resolve(process.cwd(), enginePath) : join(dirname(fileURLToPath(import.meta.url)), '../engine/index.js');
const mod = await import(pathToFileURL(engineFile).href);
const engine = mod.analyze ?? mod.default?.analyze ?? (typeof mod.default === 'function' ? mod.default : undefined);
if (typeof engine !== 'function') { console.error(`no analyze() export found in ${enginePath} (exports: ${Object.keys(mod).join(', ')})`); process.exit(2); }

// ---------- seeded PRNG (mulberry32) ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rnd = mulberry32(SEED);
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1)); // inclusive
const pick = (arr) => arr[int(0, arr.length - 1)];
const chance = (p) => rnd() < p;

// ---------- generators ----------
const MIN_AMT = 100; const MAX_AMT = 3_000_000;         // $1 .. $30,000
const MIN_BAL = -500_000; const MAX_BAL = 4_000_000;    // -$5,000 .. +$40,000
const AWKWARD = [1, 7, 33, 49, 50, 51, 67, 99];

function amount(maxCents = MAX_AMT) {
  const r = rnd(); let a;
  if (r < 0.40) a = int(MIN_AMT, maxCents);                          // any cents
  else if (r < 0.58) a = int(1, Math.floor(maxCents / 100)) * 100;   // round dollars
  else if (r < 0.73) a = int(MIN_AMT, Math.min(5000, maxCents));     // tiny bills
  else if (r < 0.83) a = int(Math.floor(maxCents * 0.66), maxCents); // big bills
  else a = int(1, Math.floor(maxCents / 100) - 1) * 100 + pick(AWKWARD); // awkward cents
  return Math.max(MIN_AMT, Math.min(maxCents, a));
}

function bills(family) {
  const out = [];
  const n = int(1, 8);
  if (family === 'late') {                       // everything at the end of the year (rounding-artifact probe)
    const k = int(1, 3);
    for (let i = 0; i < k; i++) out.push({ month: chance(0.8) ? 12 : 11, amountCents: amount() });
  } else if (family === 'sameMonth') {           // several bills in one month + month 1 + month 12
    const m = int(1, 12);
    for (let i = 0; i < Math.max(2, n - 2); i++) out.push({ month: m, amountCents: amount() });
    out.push({ month: 1, amountCents: amount() });
    out.push({ month: 12, amountCents: amount() });
  } else if (family === 'tie') {                 // equal periodic bills -> equal lows in several months
    const per = pick([2, 3, 4, 6]);              // number of installments
    const each = int(1, 5000) * 300;             // divisible so D/12 is exact
    const first = int(1, 12 / per);
    for (let i = 0; i < per; i++) out.push({ month: first + i * (12 / per), amountCents: each });
    if (chance(0.4)) for (let m = 1; m <= 12; m++) out.push({ month: m, amountCents: 5000 }); // monthly PMI
  } else if (family === 'bothNear') {            // one bill in month 12, divisible by 12; with a 1-month cushion the required start equals one payment
    out.push({ month: 12, amountCents: int(1, 300) * 1200 });
  } else if (family === 'small') {               // keeps P small so -P fits in the balance range
    for (let i = 0; i < n; i++) out.push({ month: int(1, 12), amountCents: amount(400_000) });
  } else {
    for (let i = 0; i < n; i++) {
      let m = int(1, 12);
      if (i > 0 && chance(0.2)) m = out[i - 1].month; // repeat a month
      if (chance(0.08)) m = 1;
      if (chance(0.08)) m = 12;
      out.push({ month: m, amountCents: amount() });
    }
  }
  return out.slice(0, family === 'tie' ? 18 : 8).map((b, i) => ({ label: `Bill ${i + 1}`, ...b }));
}

function makeAccount(i) {
  const family = FAMILY ?? pick(['uniform', 'uniform', 'uniform', 'b50', 'bTier', 'bDef', 'late', 'sameMonth', 'tie', 'onTarget', 'near', 'near', 'bothNear']);
  const billFamily = { b50: 'uniform', bTier: 'uniform', bDef: 'small', onTarget: 'uniform', near: 'small', bothNear: 'bothNear' }[family] ?? family;
  const account = {
    startMonth: int(1, 12),
    startingBalanceCents: int(MIN_BAL, MAX_BAL),
    cushionMonths: family === 'bothNear' ? 1 : pick([0, 1, 2, 2, 2]),
    borrowerCurrent: chance(0.8),
    disbursements: bills(billFamily),
  };
  // Aim the starting balance at a legal boundary, using the oracle only to find where the boundary is.
  const ref = oracle(account);
  const req = ref.requiredStartingBalanceCents; const P = ref.baseMonthlyPaymentCents;
  let aimed;
  if (family === 'b50') aimed = req + pick([4999, 5000, 5001, 4993, 5007, 1, 49]);
  if (family === 'bTier') aimed = req - P + pick([-1, 0, 1, -6, 6]);
  if (family === 'bDef') aimed = pick([-P, -P + 1, -P - 1, -1, 0, 1]);
  if (family === 'onTarget') aimed = req + pick([0, 0, -1, 1]);
  // SPEC E3 band edges: 699 / 700 / 701 cents either side of each legal line.
  const EDGE = [0, 1, -1, 300, -300, 699, -699, 700, -700, 701, -701];
  if (family === 'near') aimed = pick([req + 5000 + pick(EDGE), req - (P + pick(EDGE)), -(P + pick(EDGE))]);
  if (family === 'bothNear') aimed = -(P + pick(EDGE)); // deficiency near P while the shortage (= required start = P) sits exactly on the line
  if (family === 'late' && chance(0.5)) aimed = req + pick([0, 5000, 4999, -1, 3]);
  if (aimed !== undefined && aimed >= MIN_BAL && aimed <= MAX_BAL) account.startingBalanceCents = aimed;
  return { family, account };
}

// ---------- helpers ----------
const canon = (x) => JSON.stringify(x, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((kk) => [kk, v[kk]])) : v));
function shuffled(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = int(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function firstDifference(a, b, path = 'result') {
  if (path === 'result.inputs') return '';
  if (a && b && typeof a === 'object' && typeof b === 'object') { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const d = firstDifference(a[k], b[k], path + '.' + k); if (d) return d; } return ''; }
  return a === b ? '' : path + ': ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b);
}
function nonIntegers(x, path = 'result', out = []) {
  if (typeof x === 'number') { if (!Number.isSafeInteger(x)) out.push(`${path}=${x}`); }
  else if (Array.isArray(x)) x.forEach((v, i) => nonIntegers(v, `${path}[${i}]`, out));
  else if (x && typeof x === 'object') for (const k of Object.keys(x)) nonIntegers(x[k], `${path}.${k}`, out);
  return out;
}

// -0 is an integer to Number.isSafeInteger, equals 0 under ===, prints as "0" in JSON, but fails
// assert.deepStrictEqual against 0 and can render as "-$0.00". Typical source: `add = -min` when min is 0.
function negativeZeros(x, path = 'result', out = []) {
  if (typeof x === 'number') { if (Object.is(x, -0)) out.push(path); }
  else if (Array.isArray(x)) x.forEach((v, i) => negativeZeros(v, `${path}[${i}]`, out));
  else if (x && typeof x === 'object') for (const k of Object.keys(x)) negativeZeros(x[k], `${path}.${k}`, out);
  return out;
}

// ---------- invariants that need no oracle ----------
function invariants(account, r) {
  const fail = []; const info = [];
  const bad = (name, detail) => fail.push({ name, detail });
  const S = account.startingBalanceCents; const cm = account.cushionMonths;
  const Din = account.disbursements.reduce((s, d) => s + d.amountCents, 0);

  const ni = nonIntegers({ ...r, audit: undefined });
  if (ni.length) bad('all-outputs-integers', ni.slice(0, 5).join(', '));
  const nz = negativeZeros({ ...r, audit: undefined });
  if (nz.length) bad('no-negative-zero-outputs', nz.slice(0, 5).join(', '));

  const t = r.table;
  if (!Array.isArray(t) || t.length !== 12) { bad('table-12-rows', `length=${t?.length}`); return { fail, info }; }
  const D = r.annualDisbursementsCents; const P = r.baseMonthlyPaymentCents; const C = r.cushionCapCents;
  const A = r.stepTwoAddCents; const req = r.requiredStartingBalanceCents; const diff = r.differenceCents;

  if (D !== Din) bad('annual-total-equals-sum-of-inputs', `${D} vs ${Din}`);
  let s1 = 0; let tg = req; let pj = S; let sumDisb = 0;
  for (let i = 0; i < 12; i++) {
    const row = t[i]; const m = i + 1;
    const want = account.disbursements.filter((d) => d.month === m).reduce((s, d) => s + d.amountCents, 0);
    if (row.month !== m) bad('row-month', `row ${i} month=${row.month}`);
    if (row.calendarMonth !== ((account.startMonth - 1 + i) % 12) + 1) bad('row-calendar-month', `row ${i} cal=${row.calendarMonth}`);
    if (row.depositCents !== P) bad('row-deposit-is-base-payment', `row ${i} deposit=${row.depositCents} P=${P}`);
    if (row.disbursementCents !== want) bad('row-disbursement-is-sum-of-that-months-bills', `row ${i} ${row.disbursementCents} vs ${want}`);
    s1 += row.depositCents - row.disbursementCents; tg += row.depositCents - row.disbursementCents; pj += row.depositCents - row.disbursementCents;
    sumDisb += row.disbursementCents;
    if (row.step1TrialBalanceCents !== s1) bad('bookkeeping-step1', `row ${i} ${row.step1TrialBalanceCents} vs ${s1}`);
    if (row.targetBalanceCents !== tg) bad('bookkeeping-target', `row ${i} ${row.targetBalanceCents} vs ${tg}`);
    if (row.projectedBalanceCents !== pj) bad('bookkeeping-projected', `row ${i} ${row.projectedBalanceCents} vs ${pj}`);
    if (row.targetBalanceCents - row.projectedBalanceCents !== -diff) bad('target-minus-projected-constant', `row ${i}`);
  }
  if (sumDisb !== D) bad('table-disbursements-sum-to-annual', `${sumDisb} vs ${D}`);
  if (t[11].step1TrialBalanceCents !== 12 * P - D) bad('final-step1-is-12P-minus-D', `${t[11].step1TrialBalanceCents} vs ${12 * P - D}`);
  if (Math.abs(12 * P - D) > 6) bad('payment-is-one-twelfth-to-the-cent', `P=${P} D=${D}`);
  if (12 * C > D * cm) bad('LAW-cushion-above-cap (c)(5)', `C=${C} D=${D} months=${cm}`);
  if (12 * (C + 1) <= D * cm) bad('cushion-cap-not-floor', `C=${C} D=${D} months=${cm}`);
  if (A < 0) bad('step-two-add-negative', `A=${A}`);
  if (req !== A + C) bad('required-equals-add-plus-cushion', `${req} vs ${A}+${C}`);
  if (diff !== S - req) bad('difference-equals-balance-minus-required', `${diff} vs ${S - req}`);
  const lowestTargetInclOpening = Math.min(req, ...t.map((x) => x.targetBalanceCents));
  if (lowestTargetInclOpening !== C) bad('lowest-target-balance-equals-cushion (d)(2)(ii)', `${lowestTargetInclOpening} vs ${C}`);

  // low point
  const proj = t.map((x) => x.projectedBalanceCents); const minProj = Math.min(...proj);
  if (r.lowPoint?.projectedBalanceCents !== minProj) bad('lowpoint-is-min-projected', `${r.lowPoint?.projectedBalanceCents} vs ${minProj}`);
  if (r.lowPoint?.month !== proj.indexOf(minProj) + 1) bad('lowpoint-earliest-month-on-tie', `${r.lowPoint?.month} vs ${proj.indexOf(minProj) + 1}`);

  // identity lowPoint - C == difference. Exact unless EVERY Step 1 month-end balance is positive,
  // which can only happen when the rounded payment makes 12P > D (D mod 12 >= 6) and no bill
  // outruns the deposits before month 12. Then it is off by min(step1) = 1..6 cents.
  const minS1 = Math.min(...t.map((x) => x.step1TrialBalanceCents));
  const gap = minProj - C - diff;
  if (gap !== 0) {
    if (minS1 > 0 && gap === minS1 && gap <= 6) info.push('identity-off-by-rounding-artifact');
    else bad('identity-lowpoint-minus-cushion-equals-difference', `gap=${gap} minStep1=${minS1}`);
  }

  // surplus / shortage / deficiency
  if (r.surplusCents !== Math.max(0, diff)) bad('surplus-is-positive-part-of-difference', `${r.surplusCents}`);
  if (r.deficiencyCents !== Math.max(0, -S)) bad('deficiency-is-real-negative-balance-only (b)', `${r.deficiencyCents} vs ${Math.max(0, -S)}`);
  if (r.surplusCents - r.shortageCents - r.deficiencyCents !== diff) bad('surplus-shortage-deficiency-add-up', `${r.surplusCents}-${r.shortageCents}-${r.deficiencyCents} vs ${diff}`);
  if (r.shortageCents < 0 || r.surplusCents < 0 || r.deficiencyCents < 0) bad('amounts-non-negative', '');

  // classification vs numbers
  const c = r.classification; const cur = account.borrowerCurrent;
  const expectTier = (x) => (x < P ? 'LT' : 'GE');
  let want;
  if (r.deficiencyCents > 0) want = (cur ? `DEFICIENCY_${expectTier(r.deficiencyCents)}_ONE_MONTH` : 'DEFICIENCY_BORROWER_NOT_CURRENT') + (r.shortageCents > 0 ? `_AND_SHORTAGE_${expectTier(r.shortageCents)}_ONE_MONTH` : ''); // SPEC E2
  else if (r.surplusCents > 0) want = !cur ? 'SURPLUS_BORROWER_NOT_CURRENT' : r.surplusCents >= 5000 ? 'SURPLUS_REFUND_REQUIRED' : 'SURPLUS_UNDER_50';
  else if (r.shortageCents > 0) want = `SHORTAGE_${expectTier(r.shortageCents)}_ONE_MONTH`;
  else want = 'ON_TARGET';
  if (c !== want) bad('classification-consistent-with-own-numbers', `${c} vs ${want}`);
  if (!cur && r.deficiencyCents > 0) info.push('covered: deficiency + borrower not current (SPEC E2)');

  // payment block
  const n = r.newMonthlyEscrowPayment || {};
  if (n.baseMonthlyCents !== P) bad('payment-base', `${n.baseMonthlyCents}`);
  if (n.monthlyEscrowAfterDeficiencyRepaidCents !== P + n.shortageSpreadOver12Cents) bad('payment-after', '');
  if (n.monthlyEscrowWhileRepayingDeficiencyCents !== P + n.shortageSpreadOver12Cents + n.deficiencySpreadCents) bad('payment-while', '');
  if (Math.abs(12 * n.shortageSpreadOver12Cents - r.shortageCents) > 6) bad('shortage-spread-is-one-twelfth', `${n.shortageSpreadOver12Cents} of ${r.shortageCents}`);
  const scheduled = r.deficiencyCents > 0 && cur; // SPEC E2: no invented schedule when the borrower is not current
  if (n.deficiencySpreadMonths !== (scheduled ? 2 : 0)) bad('deficiency-spread-months', `${n.deficiencySpreadMonths}`);
  if (scheduled ? Math.abs(2 * n.deficiencySpreadCents - r.deficiencyCents) > 1 : n.deficiencySpreadCents !== 0) bad('deficiency-spread-is-half-or-zero-when-not-current', `${n.deficiencySpreadCents} of ${r.deficiencyCents}`);

  // SPEC E3 nearLine: shape + agreement with the engine's OWN numbers (convention-independent parts only).
  const nl = r.nearLine;
  const band = (x, line) => x > 0 && Math.abs(x - line) <= 700;
  if (nl === undefined) bad('nearLine-key-present', 'missing');
  else if (nl !== null) {
    if (typeof nl !== 'object' || nl.toleranceCents !== 700 || !['SURPLUS_50', 'ONE_MONTH_PAYMENT'].includes(nl.line)) bad('nearLine-shape', JSON.stringify(nl));
    else {
      const d = Math.abs(nl.distanceCents);
      const fits = nl.line === 'SURPLUS_50' ? band(r.surplusCents, 5000) && d === Math.abs(r.surplusCents - 5000)
        : (band(r.deficiencyCents, P) && d === Math.abs(r.deficiencyCents - P)) || (band(r.shortageCents, P) && d === Math.abs(r.shortageCents - P));
      if (!fits) bad('nearLine-matches-own-numbers', JSON.stringify(nl));
    }
  } else if (band(r.shortageCents, P) || (cur && (band(r.surplusCents, 5000) || band(r.deficiencyCents, P)))) {
    // strictly inside the band is unambiguous; exactly 700 is the inclusive-edge convention, handled in the oracle diff
    const strictly = (x, line) => x > 0 && Math.abs(x - line) < 700;
    if (strictly(r.shortageCents, P) || (cur && (strictly(r.surplusCents, 5000) || strictly(r.deficiencyCents, P)))) bad('nearLine-null-but-an-operative-amount-is-inside-the-band', `surplus=${r.surplusCents} shortage=${r.shortageCents} deficiency=${r.deficiencyCents} P=${P}`);
  }
  return { fail, info };
}

function metamorphic(account, r) {
  const fail = [];
  // adding X cents to the starting balance moves differenceCents by exactly X and nothing about the target.
  let X = int(-100_000, 100_000); if (X === 0) X = 1;
  try {
    const r2 = engine({ ...structuredClone(account), startingBalanceCents: account.startingBalanceCents + X });
    if (r2.differenceCents !== r.differenceCents + X) fail.push({ name: 'add-X-moves-difference-by-X', detail: `X=${X}: ${r.differenceCents} -> ${r2.differenceCents}` });
    if (r2.requiredStartingBalanceCents !== r.requiredStartingBalanceCents) fail.push({ name: 'add-X-leaves-required-balance-alone', detail: `X=${X}` });
    for (let i = 0; i < 12; i++) if (r2.table?.[i]?.projectedBalanceCents !== r.table[i].projectedBalanceCents + X || r2.table?.[i]?.targetBalanceCents !== r.table[i].targetBalanceCents) { fail.push({ name: 'add-X-shifts-projected-rows-only', detail: `X=${X} row ${i}` }); break; }
  } catch (e) { fail.push({ name: 'add-X-threw', detail: String(e?.message ?? e) }); }
  // shuffling bill order changes nothing.
  try {
    const r3 = engine({ ...structuredClone(account), disbursements: shuffled(structuredClone(account.disbursements)) });
    // SPEC E3a.6: result.inputs is an echo of the typed account (typed bill order), so it is excluded. Every other field must be order-proof.
    const noEcho = (x) => canon({ ...x, inputs: undefined });
    if (noEcho(r3) !== noEcho(r)) fail.push({ name: 'shuffle-bills-changes-nothing', detail: firstDifference(r, r3) });
  } catch (e) { fail.push({ name: 'shuffle-threw', detail: String(e?.message ?? e) }); }
  // same input twice -> same output.
  try { if (canon(engine(structuredClone(account))) !== canon(r)) fail.push({ name: 'deterministic', detail: '' }); } catch (e) { fail.push({ name: 'repeat-threw', detail: String(e?.message ?? e) }); }
  return fail;
}

// ---------- main loop ----------
const stats = { cases: 0, threw: 0, hardCases: 0, softCases: 0, invariantCases: 0, clean: 0, conventionCases: 0 };
const byConvention = new Map(); const conventionShown = [];

// Explains a nearLine disagreement as one of the known open convention choices, or returns null (= real disagreement).
function nearLineConvention(expected, actual, current) {
  const e = expected.nearLine; const a = actual.nearLine; const cands = expected.audit.nearCandidates;
  const same = (x, c, signed) => x && typeof x === 'object' && x.line === c.line && x.toleranceCents === 700 && x.distanceCents === (signed ? c.signedCents : c.distanceCents);
  if (e === null && a && cands.some((c) => c.needsCurrent && !current && (same(a, c, false) || same(a, c, true)))) return 'gating: engine flags a line that decides nothing because the borrower is not current';
  if (e && a === null && e.distanceCents === 700) return 'band edge: engine treats exactly 700 cents as OUTSIDE the band (oracle: inclusive)';
  if (e && a && cands.some((c) => c.signedCents < 0 && same(a, c, true))) return 'distance sign: engine reports a SIGNED distance (oracle: absolute)';
  if (e && a && cands.length > 1 && cands.some((c) => same(a, c, false) && !(c.line === e.line && c.distanceCents === e.distanceCents))) return 'pick: deficiency and shortage are both in the band and the engine reports the other one (oracle: deficiency first)';
  return null;
}
const byField = new Map(); const byInvariant = new Map(); const bySoft = new Map(); const byInfo = new Map(); const byFamily = new Map(); const byClass = new Map();
const bump = (map, k) => map.set(k, (map.get(k) || 0) + 1);
const shown = [];

for (let i = 0; i < N; i++) {
  const { family, account } = makeAccount(i);
  stats.cases++; bump(byFamily, family);
  const expected = oracle(account);
  bump(byClass, expected.classification);
  const before = canon(account);
  let actual; let threw = null;
  try { actual = engine(structuredClone(account)); } catch (e) { threw = String(e?.stack ?? e).split('\n').slice(0, 3).join(' | '); }
  if (threw) {
    stats.threw++;
    if (shown.length < SHOW) shown.push({ case: i, family, kind: 'ENGINE THREW on a valid account', error: threw, account });
    continue;
  }
  const cmp = compareResults(expected, actual);
  const soft = cmp.soft;
  // nearLine differences that are a SPEC convention question, not a math error, get their own bucket.
  const nearDiffs = cmp.hard.filter((d) => d.path.startsWith('nearLine'));
  let hard = cmp.hard;
  if (nearDiffs.length) {
    const why = nearLineConvention(expected, actual, account.borrowerCurrent);
    if (why) { hard = cmp.hard.filter((d) => !d.path.startsWith('nearLine')); bump(byConvention, why); stats.conventionCases++; if (conventionShown.length < 3) conventionShown.push({ case: i, why, account, oracleNearLine: expected.nearLine, engineNearLine: actual.nearLine, inBand: expected.audit.nearCandidates }); }
  }
  const inv = invariants(account, actual);
  const meta = metamorphic(account, actual);
  // did the engine mutate its input?
  const probe = structuredClone(account); try { engine(probe); } catch { /* counted above */ }
  if (canon(probe) !== before) meta.push({ name: 'engine-mutates-its-input', detail: '' });

  for (const d of hard) bump(byField, d.path.replace(/\[\d+\]/, '[]'));
  for (const d of soft) bump(bySoft, d.path);
  for (const f of [...inv.fail, ...meta]) bump(byInvariant, f.name);
  for (const s of inv.info) bump(byInfo, s);
  if (hard.length) stats.hardCases++;
  if (soft.length) stats.softCases++;
  if (inv.fail.length || meta.length) stats.invariantCases++;
  if (!hard.length && !inv.fail.length && !meta.length) stats.clean++;
  else if (shown.length < SHOW) {
    shown.push({ case: i, family, account, oracleSays: { ...expected, table: undefined, audit: expected.audit.regCaveats }, fieldDiffs: hard.slice(0, 8), moreFieldDiffs: Math.max(0, hard.length - 8), invariantFailures: [...inv.fail, ...meta].slice(0, 8) });
  }
}

// ---------- report ----------
const table = (map) => [...map.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `    ${String(v).padStart(6)}  ${k}`).join('\n') || '    (none)';
if (!QUIET && shown.length) {
  console.log(`=== first ${shown.length} disagreement(s), full inputs ===`);
  shown.forEach((s, k) => { console.log(`\n--- #${k + 1} (case ${s.case}, family ${s.family}) ---`); console.log(JSON.stringify(s, null, 1)); });
  console.log('');
}
console.log(`=== fuzz summary: engine=${enginePath ?? '../engine/index.js'}${FAMILY ? ' family=' + FAMILY : ''} seed=${SEED} cases=${stats.cases} ===`);
console.log(`  clean cases:                         ${stats.clean}`);
console.log(`  engine threw on a valid account:     ${stats.threw}`);
console.log(`  cases disagreeing with the oracle:   ${stats.hardCases}`);
console.log(`  cases failing an invariant:          ${stats.invariantCases}`);
console.log(`  cases with soft-only diffs (cite / servicerOptions / lowestTargetBalanceCents): ${stats.softCases}`);
console.log(`  nearLine CONVENTION differences (spec decision needed, not math errors): ${stats.conventionCases}`);
if (stats.conventionCases) { console.log(table(byConvention)); if (!QUIET) console.log('  examples: ' + JSON.stringify(conventionShown, null, 1)); }
console.log(`  field disagreements by field:\n${table(byField)}`);
console.log(`  invariant failures by name:\n${table(byInvariant)}`);
console.log(`  soft diffs by field:\n${table(bySoft)}`);
console.log(`  informational (not failures):\n${table(byInfo)}`);
console.log(`  coverage by generator family:\n${table(byFamily)}`);
console.log(`  coverage by oracle classification:\n${table(byClass)}`);
const failed = stats.threw + stats.hardCases + stats.invariantCases > 0;
const conventionOnly = !failed && stats.conventionCases > 0;
console.log(failed ? '\nRESULT: FAIL' : conventionOnly ? '\nRESULT: MATH PASS, but nearLine conventions differ from the oracle (see above) - needs a SPEC decision (exit 3)' : '\nRESULT: PASS (engine agrees with the independent oracle on every case and holds every invariant)');
process.exit(failed ? 1 : conventionOnly ? 3 : 0);
