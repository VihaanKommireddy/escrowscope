// stage2-code-checks.mjs — dynamic checks that back the Stage 2 code review (part C).
// Usage: node stage2-code-checks.mjs [path-to-engine/index.js]   (default ../engine/index.js)
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import { analyze as oracle } from './oracle.mjs';
import { compareResults } from './compare.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const enginePath = resolve(process.cwd(), process.argv[2] ?? join(here, '../engine/index.js'));
const E = await import(pathToFileURL(enginePath).href);
const engineDir = dirname(enginePath);

let failures = 0;
const section = (t) => console.log(`\n=== ${t} ===`);
const check = (ok, label, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? '  ' + detail : ''}`); };

// ---------- 1. parseDollars adversarial table ----------
section('parseDollars: adversarial inputs');
const REJECT = ['1e5', '0x10', '1,23', '12.345', '1.2.3', '', '   ', '.', '$', '-', '--5', '$$5', '+5', '5-', '(200', '200)', '-(200)', '(-200)', '1 000', '1,0000', ',5', '12,34.56', '1234,50', 'NaN', 'Infinity', '١٢٣', '１２', '12abc', '0b11', '1_000', '5e-1', '.123', '100000000', '10000000.01', '99,999,999.99', '–200', '—200', '- 5', '$ 5', null, undefined, 12, {}, [], true];
const ACCEPT = [[' 12 ', 1200], ['12', 1200], ['12.', 1200], ['12.5', 1250], ['.5', 50], ['.50', 50], ['0.05', 5], ['-0', 0], ['−200', -20000], ['-200', -20000], ['$-5', -500], ['-$5', -500], ['(200)', -20000], ['($200.00)', -20000], ['(0)', 0], ['1,234.50', 123450], ['$1,234.5', 123450], ['1,234,567.89', 123456789], ['0012', 1200], ['10000000', 1000000000], ['10,000,000.00', 1000000000], [' 12 ', 1200], ['-0.00', 0], ['−0', 0]];
for (const t of REJECT) { let r; try { r = E.parseDollars(t); } catch (e) { r = { threw: String(e) }; } check(r && r.ok === false && typeof r.problem === 'string' && !('cents' in r), `reject ${JSON.stringify(t) ?? String(t)}`, r && r.ok === false ? '' : JSON.stringify(r)); }
for (const [t, want] of ACCEPT) { const r = E.parseDollars(t); check(r.ok === true && r.cents === want && !Object.is(r.cents, -0), `accept ${JSON.stringify(t)} -> ${want}`, r.ok && r.cents === want ? '' : JSON.stringify(r)); }
// the problem text must never echo what was typed (it may be shown as-is)
check(!JSON.stringify(E.parseDollars('<img src=x onerror=alert(1)>')).includes('img'), 'problem text does not echo the input');

section('formatCents: round trip + negative zero');
let rtBad = 0; let s = 99; const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
for (let i = 0; i < 20000; i++) { const c = Math.floor(rnd() * 2000000001) - 1000000000; const back = E.parseDollars(E.formatCents(c)); if (!(back.ok && back.cents === c)) rtBad++; }
check(rtBad === 0, 'parseDollars(formatCents(x)) === x for 20,000 random amounts in +-$10,000,000', rtBad ? `${rtBad} failures` : '');
check(E.formatCents(-0) === '$0.00', 'formatCents(-0) prints $0.00', E.formatCents(-0));
check(E.formatCents(-20000) === '−$200.00' && E.formatCents(123450) === '$1,234.50' && E.formatCents(5) === '$0.05' && E.formatCents(100000000000) === '$1,000,000,000.00', 'formatCents basic cases');
for (const bad of [1.5, NaN, Infinity, '12', null]) { let threw = false; try { E.formatCents(bad); } catch { threw = true; } check(threw, `formatCents(${String(bad)}) throws`); }

// ---------- 2. months ----------
section('calendar <-> escrow month, every startMonth');
let monthBad = 0;
for (let start = 1; start <= 12; start++) for (let m = 1; m <= 12; m++) {
  const cal = E.escrowToCalendarMonth(m, start);
  // independent definition: walk forward m-1 months from the start month on a 12-hour-clock style dial
  let walk = start; for (let k = 1; k < m; k++) walk = walk === 12 ? 1 : walk + 1;
  if (cal !== walk || E.calendarToEscrowMonth(cal, start) !== m) monthBad++;
}
check(monthBad === 0, '144 of 144 (startMonth, month) pairs convert correctly and round-trip', monthBad ? `${monthBad} wrong` : '');
let tableMonthBad = 0;
for (let start = 1; start <= 12; start++) { const r = E.analyze({ startMonth: start, startingBalanceCents: 100000, disbursements: [{ label: 'x', month: 12, amountCents: 120000 }, { label: 'y', month: 1, amountCents: 60000 }] }); r.table.forEach((row, i) => { let walk = start; for (let k = 0; k < i; k++) walk = walk === 12 ? 1 : walk + 1; if (row.calendarMonth !== walk || row.month !== i + 1) tableMonthBad++; }); r.inputs.disbursements.forEach((b) => { if (b.calendarMonth !== E.escrowToCalendarMonth(b.month, start)) tableMonthBad++; }); }
check(tableMonthBad === 0, 'table rows and echoed bills carry the right calendar month for every startMonth');
for (const bad of [0, 13, 1.5, NaN, '3', null, undefined, -1, Infinity]) { let threw = 0; try { E.escrowToCalendarMonth(bad, 1); } catch { threw++; } try { E.calendarToEscrowMonth(1, bad); } catch { threw++; } check(threw === 2, `month helpers throw on ${String(bad)}`); }

// ---------- 3. validateAccount really guards analyze ----------
section('validateAccount blocks everything analyze assumes');
const good = () => ({ startMonth: 1, startingBalanceCents: 150000, cushionMonths: 2, borrowerCurrent: true, disbursements: [{ label: 'Tax', month: 5, amountCents: 180000 }, { label: 'Insurance', month: 7, amountCents: 120000 }] });
const BAD_VALUES = [0, 13, 1.5, -1, NaN, Infinity, -Infinity, '3', '', null, undefined, true, {}, [], 1e21, Number.MAX_SAFE_INTEGER, 2 ** 53, 1000000001, -1000000001];
const mutations = [];
for (const v of BAD_VALUES) {
  mutations.push(['startMonth', v, (a) => { a.startMonth = v; }, (v) => !(Number.isInteger(v) && v >= 1 && v <= 12)]);
  mutations.push(['bill.month', v, (a) => { a.disbursements[0].month = v; }, (v) => !(Number.isInteger(v) && v >= 1 && v <= 12)]);
  mutations.push(['bill.amountCents', v, (a) => { a.disbursements[0].amountCents = v; }, (v) => !(Number.isInteger(v) && v > 0 && v <= 1000000000)]);
  mutations.push(['startingBalanceCents', v, (a) => { a.startingBalanceCents = v; }, (v) => !(Number.isInteger(v) && Math.abs(v) <= 1000000000)]);
  mutations.push(['cushionMonths', v, (a) => { a.cushionMonths = v; }, (v) => !(v === undefined || v === 0 || v === 1 || v === 2)]);
  mutations.push(['borrowerCurrent', v, (a) => { a.borrowerCurrent = v; }, (v) => !(v === undefined || typeof v === 'boolean')]);
  mutations.push(['disbursements', v, (a) => { a.disbursements = v; }, () => true]);
  mutations.push(['bill (whole row)', v, (a) => { a.disbursements[1] = v; }, () => true]);
}
let guardBad = 0; let guardTotal = 0; let unguardedCrash = 0;
for (const [field, v, mutate, mustReject] of mutations) {
  const a = good(); mutate(a); guardTotal++;
  let errors; try { errors = E.validateAccount(a).errors; } catch (e) { errors = null; }
  let threw = false; let result; try { result = E.analyze(a); } catch { threw = true; }
  const rejected = Array.isArray(errors) && errors.length > 0;
  if (errors === null) { guardBad++; console.log(`     validateAccount THREW for ${field}=${String(v)}`); continue; }
  if (mustReject(v) && !rejected) { guardBad++; console.log(`     NOT rejected: ${field}=${String(v)}`); }
  if (rejected !== threw) { guardBad++; console.log(`     validate/analyze disagree for ${field}=${String(v)}: errors=${errors.length} threw=${threw}`); }
  if (!rejected && !threw) { const bad = JSON.stringify(result, (k, x) => (typeof x === 'number' && !Number.isSafeInteger(x) ? '__BAD__' : x)).includes('__BAD__'); if (bad) { unguardedCrash++; console.log(`     accepted but produced a non-integer: ${field}=${String(v)}`); } }
}
check(guardBad === 0 && unguardedCrash === 0, `${guardTotal} single-field corruptions: every bad value is rejected by validateAccount AND makes analyze throw; accepted values give whole-cent results`);
for (const acc of [null, undefined, 5, 'x', [], () => 1]) { let threw = false; try { E.analyze(acc); } catch { threw = true; } check(threw && E.validateAccount(acc).errors.length > 0, `non-object account ${String(acc)} is refused`); }
{ const a = good(); a.disbursements = Array.from({ length: 101 }, () => ({ label: 'b', month: 1, amountCents: 100 })); check(E.validateAccount(a).errors.length > 0, '101 bills refused'); a.disbursements.pop(); check(E.validateAccount(a).errors.length === 0, '100 bills accepted'); }
{ const a = good(); a.disbursements = [{ label: 'Tax', month: 3, amountCents: 100000 }, { label: 'Tax', month: 3, amountCents: 100000 }, { label: 'Tax', month: 9, amountCents: 50000 }]; const r = E.analyze(a); check(r.annualDisbursementsCents === 250000 && r.table[2].disbursementCents === 200000, 'duplicate labels in the same month are ADDED, not merged or overwritten'); }
{ const a = good(); a.disbursements[0].label = 'x'.repeat(101); check(E.validateAccount(a).errors.length > 0, 'label over 100 chars refused'); a.disbursements[0].label = 7; check(E.validateAccount(a).errors.length > 0, 'non-text label refused'); delete a.disbursements[0].label; check(E.validateAccount(a).errors.length === 0, 'missing label accepted'); }
{ const a = good(); a.startingBalanceCents = -0; a.cushionMonths = 0; a.disbursements = [{ label: 'Tax', month: 12, amountCents: 120000 }]; const r = E.analyze(a); const neg = JSON.stringify(r, (k, x) => (Object.is(x, -0) ? '__NEGZERO__' : x)).includes('__NEGZERO__'); check(!neg && r.classification === 'ON_TARGET', 'starting balance of -0 (possible from a loaded JSON file) never leaks a negative zero'); }

// ---------- 4. extreme magnitudes vs the BigInt oracle ----------
section('extreme magnitudes (up to 100 bills of $10,000,000) vs the BigInt oracle');
let xBad = 0; const XN = 3000;
for (let i = 0; i < XN; i++) {
  const n = 1 + Math.floor(rnd() * 100); const d = [];
  for (let k = 0; k < n; k++) d.push({ label: 'b' + k, month: 1 + Math.floor(rnd() * 12), amountCents: rnd() < 0.5 ? 1000000000 - Math.floor(rnd() * 1000) : 1 + Math.floor(rnd() * 1000000000) });
  const a = { startMonth: 1 + Math.floor(rnd() * 12), startingBalanceCents: Math.floor(rnd() * 2000000001) - 1000000000, cushionMonths: Math.floor(rnd() * 3), borrowerCurrent: rnd() < 0.8, disbursements: d };
  const { hard, soft } = compareResults(oracle(a), E.analyze(a)); if (hard.length || soft.length) { xBad++; if (xBad <= 3) console.log('     ', JSON.stringify(hard.slice(0, 3))); }
}
check(xBad === 0, `${XN} extreme accounts (annual totals up to $1,000,000,000): engine == oracle on every field`, xBad ? `${xBad} differ` : '');
{ const a = { startMonth: 1, startingBalanceCents: 0, cushionMonths: 2, disbursements: [{ label: 'a', month: 12, amountCents: 100 }] }; const r = E.analyze(a); check(r.baseMonthlyPaymentCents === 8 && r.cushionCapCents === 16 && r.requiredStartingBalanceCents === oracle(a).requiredStartingBalanceCents, 'tiniest account ($1.00 a year) matches the oracle'); }
{ const a = { startMonth: 1, startingBalanceCents: 0, cushionMonths: 2, disbursements: [{ label: 'a', month: 6, amountCents: 1 }] }; const { hard } = compareResults(oracle(a), E.analyze(a)); check(hard.length === 0, 'a 1-cent bill (payment rounds to $0.00) matches the oracle', JSON.stringify(hard.slice(0, 2))); }

// ---------- 5. no mutation, purity ----------
section('no mutation of caller inputs; purity');
const deepFreeze = (o) => { if (o && typeof o === 'object') { Object.values(o).forEach(deepFreeze); Object.freeze(o); } return o; };
{
  const a = deepFreeze({ ...good(), priorYear: { annualDisbursementsCents: 240000, monthlyEscrowCents: 20000, cushionCents: 40000, stepTwoAddCents: 20000 } });
  const st = deepFreeze({ currentMonthlyEscrowCents: 20000, newMonthlyEscrowCents: 30000, requiredMinimumBalanceCents: 60000, claimedKind: 'shortage', claimedAmountCents: 10000, shortageSpreadMonths: 6, lumpSumOfferedOnStatement: true });
  let ok = true; let why = '';
  try {
    const r = deepFreeze(E.analyze(a)); const c = deepFreeze(E.compareWithStatement(r, st));
    E.explainVerdict(r, c); E.explainSteps(r); E.explainJump(r, st); E.nextSteps(r, c); E.explainServicerLine(r, a, st); E.buildLetter(r, c, deepFreeze({ servicerName: 'X' })); E.projectWithPayment(a, 30000); E.validateAccount(a); E.validateStatement(st, a);
  } catch (e) { ok = false; why = String(e); }
  check(ok, 'every public function runs on deep-FROZEN inputs and deep-frozen results (so none of them writes to what it is given)', why);
  const r1 = JSON.stringify(E.analyze(a)); const r2 = JSON.stringify(E.analyze(a)); check(r1 === r2, 'same input twice -> byte-identical output');
  const ra = E.analyze(a); ra.table[0].depositCents = -1; ra.inputs.disbursements[0].amountCents = -1; check(E.analyze(a).table[0].depositCents !== -1 && a.disbursements[0].amountCents === 180000, 'results share no objects with the caller\'s account or with each other');
}
section('static scan of engine/*.js (code only, comments stripped)');
const files = readdirSync(engineDir).filter((f) => f.endsWith('.js') && f !== 'vectors.js');
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => { const i = l.indexOf('//'); if (i < 0) return l; const before = l.slice(0, i); return (before.split('"').length - 1) % 2 === 0 ? before : l; });
const patterns = { 'Date / time': /\bDate\b|performance\.|setTimeout|setInterval/, randomness: /Math\.random|crypto\./, 'globals / IO': /\bglobalThis\b|\bwindow\b|\bdocument\b|localStorage|sessionStorage|\bfetch\(|XMLHttpRequest|\bprocess\.|require\(|navigator\./, 'float-prone calls': /toFixed|parseFloat|parseInt|Math\.round|Math\.ceil|Math\.trunc|Number\(|\*\*|Math\.pow/, 'division operator': /[^/*]\/[^/*=]/, 'module-level mutable state': /^let\s|^var\s/ };
for (const [name, re] of Object.entries(patterns)) {
  const hits = [];
  for (const f of files) stripComments(readFileSync(join(engineDir, f), 'utf8')).forEach((line, i) => { const code = line.replace(/"(?:[^"\\]|\\.)*"/g, '""'); if (re.test(code)) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 110)}`); });
  console.log(`-- ${name}: ${hits.length} line(s)`); hits.forEach((h) => console.log('     ' + h));
}

console.log(`\n${failures === 0 ? 'ALL CODE CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exit(failures ? 1 : 0);
