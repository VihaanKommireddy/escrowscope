// stage3-reverify.mjs — Stage 3: independent re-verification of the 15 audit fixes (A1–A15) and the
// director's B2 rule, against the engine's real code paths and generated text.
// Updated in Stage 4 to fix order 3 (commits fa578c0, 3f67d12): the B2 nudge-only rule is replaced by the
// three-case N1 rule, and N2 (payment ceiling when not current), N3 ("It shows"), N4 (letter headings) and
// N5 ("line up") are now hard checks instead of NOTE lines. It passes on the fixed engine and fails on fa578c0^.
// Usage: node stage3-reverify.mjs [path-to-engine/index.js] [--n 20000]
// Lines:  ok / FAIL = a fix verified or not.   NOTE = a measurement or a new finding to read.
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import { analyze as oracle } from './oracle.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const ni = argv.indexOf('--n'); const N = ni >= 0 ? Number(argv[ni + 1]) : 20000;
const pathArg = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--n');
const enginePath = resolve(process.cwd(), pathArg ?? join(here, '../engine/index.js'));
const E = await import(pathToFileURL(enginePath).href);
const { EXAMPLES } = await import(pathToFileURL(join(dirname(enginePath), '../examples.js')).href);

let seed = 3;
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
const DISCREPANCY = ['CUSHION_OVER_CAP', 'PAYMENT_ABOVE_MAX', 'KIND_DIFFERS', 'SPREAD_TOO_SHORT'];
const asserts = (c) => c.flags.some((f) => DISCREPANCY.includes(f.kind) || (f.kind === 'AMOUNT_DIFFERS' && f.rowKey === 'claimedAmount'));

function randomAccount(opts = {}) {
  const n = int(1, 6); const d = [];
  for (let k = 0; k < n; k++) d.push({ label: 'Bill ' + (k + 1), month: int(1, 12), amountCents: int(5000, 900000) });
  return { startMonth: int(1, 12), startingBalanceCents: int(-300000, 1500000), cushionMonths: opts.cushionMonths ?? 2, borrowerCurrent: opts.current ?? true, disbursements: d };
}

// everything the engine can say about one (account, statement), as one bag of strings
function allText(account, statement, details = {}) {
  const r = E.analyze(account); const c = E.compareWithStatement(r, statement ?? null);
  const v = E.explainVerdict(r, c); const steps = E.explainSteps(r); const next = E.nextSteps(r, c);
  const jump = statement ? E.explainJump(r, statement) : null; const line = statement ? E.explainServicerLine(r, account, statement) : null;
  const letter = E.buildLetter(r, c, details);
  const strings = [v.headline, v.body, v.label, ...steps.flatMap((s) => [s.title, s.plain, s.math, s.cite]), ...next.flatMap((s) => [s.title, s.body, s.phone ?? '']), ...c.flags.flatMap((f) => [f.sentence, f.letterLine]), ...(c.nudges ?? []).flatMap((n) => [n.message, n.letterLine]), ...c.rows.map((x) => x.note), ...(jump ? [jump.note, ...jump.parts.flatMap((p) => [p.label, p.sentence])] : []), ...(line ? [line.label, line.sentence] : []), letter];
  return { r, c, v, steps, next, jump, line, letter, strings };
}

// ---------------------------------------------------------------------------
section('A1 — scaled payment tolerance ($1 per separately rounded part)');
{
  const a = { startMonth: 1, startingBalanceCents: 49550, cushionMonths: 2, borrowerCurrent: true, disbursements: [{ label: 'Property tax', month: 12, amountCents: 480600 }] };
  const st = { requiredMinimumBalanceCents: 80100, claimedKind: 'shortage', claimedAmountCents: 30600, shortageSpreadMonths: 12, newMonthlyEscrowCents: 42700 };
  const t = allText(a, st);
  check(!has(t.c, 'PAYMENT_ABOVE_MAX') && t.c.overall === 'matches', 'Stage 2 repro ($4,806.00 bill, whole-dollar servicer, payment $427 vs max $425.96) is no longer flagged', `overall=${t.c.overall} flags=${t.c.flags.map((f) => f.kind)}`);
  check(E.letterKind(t.r, t.c) === 'REQUEST_FOR_INFORMATION' && /^Re: Request for information/m.test(t.letter) && !/Notice of error/.test(t.letter), '...and its letter is a request for information');

  const mk = (S, cm, current = true, bills = [{ label: 'T', month: 3, amountCents: 216000 }, { label: 'I', month: 6, amountCents: 144000 }, { label: 'T', month: 9, amountCents: 216000 }]) => E.analyze({ startMonth: 1, startingBalanceCents: S, cushionMonths: cm, borrowerCurrent: current, disbursements: bills });
  const cases = [['1 part  (surplus, no add-ons)', mk(300000, 2), 100], ['2 parts (shortage)', mk(120000, 2), 200], ['2 parts (deficiency only)', mk(-30000, 0, true, [{ label: 'T', month: 12, amountCents: 240000 }]), 200], ['3 parts (deficiency + shortage)', mk(-30000, 2), 300]];
  for (const [name, r, tol] of cases) {
    const max = r.newMonthlyEscrowPayment.monthlyEscrowWhileRepayingDeficiencyCents;
    const at = has(E.compareWithStatement(r, { newMonthlyEscrowCents: max + tol }), 'PAYMENT_ABOVE_MAX'); const over = has(E.compareWithStatement(r, { newMonthlyEscrowCents: max + tol + 1 }), 'PAYMENT_ABOVE_MAX');
    check(!at && over, `${name}: max + ${$(tol)} passes, max + ${$(tol + 1)} is flagged`, `at=${at} over=${over}`);
  }

  // simulated lawful whole-dollar servicers, including the families Stage 2 did not aim at
  const stats = { total: 0, accused: 0, byParts: { 1: 0, 2: 0, 3: 0 }, worst: { 1: 0, 2: 0, 3: 0 }, accusedByParts: { 1: 0, 2: 0, 3: 0 } }; const examples = [];
  for (let i = 0; i < N; i++) {
    const a = randomAccount(); const ref = oracle(a); const fam = pick(['big', 'small', 'surplus', 'nearZero', 'nearZero', 'deficiency']);
    if (fam === 'big') a.startingBalanceCents = Math.max(0, ref.requiredStartingBalanceCents - ref.baseMonthlyPaymentCents - int(5000, 200000));
    if (fam === 'small') a.startingBalanceCents = Math.max(0, ref.requiredStartingBalanceCents - int(1500, Math.max(1600, ref.baseMonthlyPaymentCents - 1500)));
    if (fam === 'surplus') a.startingBalanceCents = ref.requiredStartingBalanceCents + int(8000, 200000);
    if (fam === 'nearZero') a.startingBalanceCents = Math.max(0, ref.requiredStartingBalanceCents + int(-900, 900));
    if (fam === 'deficiency') a.startingBalanceCents = -int(1000, 300000);
    const r = E.analyze(a); const D = r.annualDisbursementsCents; const S = a.startingBalanceCents;
    const P$ = halfUp(D, 1200) * 100; let t = 0; let min = 0; for (let m = 1; m <= 12; m++) { t += P$ - r.table[m - 1].disbursementCents; if (t < min) min = t; }
    const cushion$ = pick([halfUp(D, 600) * 100, 2 * P$]); const req$ = -min + cushion$;
    const def$ = S < 0 ? halfUp(-S, 100) * 100 : 0; const sh$ = S < req$ ? halfUp(req$ - Math.max(S, 0), 100) * 100 : 0;
    const pay = P$ + halfUp(sh$, 1200) * 100 + (def$ > 0 ? halfUp(def$, 200) * 100 : 0);
    const c = E.compareWithStatement(r, { newMonthlyEscrowCents: pay, shortageSpreadMonths: 12 });
    const parts = 1 + (r.newMonthlyEscrowPayment.shortageSpreadOver12Cents > 0 ? 1 : 0) + (r.newMonthlyEscrowPayment.deficiencySpreadCents > 0 ? 1 : 0);
    const over = pay - r.newMonthlyEscrowPayment.monthlyEscrowWhileRepayingDeficiencyCents;
    stats.total++; stats.byParts[parts]++; if (over > stats.worst[parts]) stats.worst[parts] = over;
    if (has(c, 'PAYMENT_ABOVE_MAX')) { stats.accused++; stats.accusedByParts[parts]++; if (examples.length < 2) examples.push({ account: a, servicer: { payment$: P$ / 100, shortage$: sh$ / 100, deficiency$: def$ / 100, pays: pay }, ours: { base: r.baseMonthlyPaymentCents, shortage: r.shortageCents, spread: r.newMonthlyEscrowPayment.shortageSpreadOver12Cents, max: r.newMonthlyEscrowPayment.monthlyEscrowWhileRepayingDeficiencyCents, parts }, flag: c.flags.find((f) => f.kind === 'PAYMENT_ABOVE_MAX').sentence.slice(0, 200) }); }
  }
  note(`whole-dollar servicers (${stats.total} statements; big / small / zero-ish shortages, surpluses, deficiencies): ${stats.accused} still accused of PAYMENT_ABOVE_MAX. By number of parts in OUR maximum: ${JSON.stringify(stats.accusedByParts)} of ${JSON.stringify(stats.byParts)}. Largest lawful overshoot seen, in cents a month: ${JSON.stringify(stats.worst)}.`);
  examples.forEach((e) => console.log('     residual example: ' + JSON.stringify(e)));
  note('what the wider tolerance can let through, worst case: a payment that really is over the maximum by up to $2.00 a month (shortage accounts) or $3.00 a month (deficiency + shortage) now passes. That is $24.00 / $36.00 a year at most, up from $12.00 before. It stays in the escrow account and comes back as a surplus at the next analysis.');
}

// ---------------------------------------------------------------------------
section('A2 — which letter: notice of error only when a discrepancy flag fires');
const corpus = [];
{
  let noe = 0; let rfi = 0; let bad = 0; const rows = [];
  const base = { startMonth: 1, startingBalanceCents: 120000, cushionMonths: 2, borrowerCurrent: true, disbursements: [{ label: 'Tax 1', month: 3, amountCents: 216000 }, { label: 'Insurance', month: 6, amountCents: 144000 }, { label: 'Tax 2', month: 9, amountCents: 216000 }] };
  const rb = E.analyze(base); const max = rb.newMonthlyEscrowPayment.monthlyEscrowWhileRepayingDeficiencyCents;
  const tv = (id) => E.accountFromVector(E.VECTORS.find((v) => v.id === id));
  const scenarios = [
    ...E.VECTORS.map((v) => ['vector ' + v.id, E.accountFromVector(v), null, null]),
    ...EXAMPLES.map((x) => ['example ' + x.id, x.account, x.statement, null]),
    ['flag alone: CUSHION_OVER_CAP', base, { requiredMinimumBalanceCents: rb.cushionCapCents + 50000 }, ['CUSHION_OVER_CAP']],
    ['flag alone: PAYMENT_ABOVE_MAX', base, { newMonthlyEscrowCents: max + 5000 }, ['PAYMENT_ABOVE_MAX']],
    ['flag alone: KIND_DIFFERS', base, { claimedKind: 'surplus', claimedAmountCents: 10000 }, ['KIND_DIFFERS']],
    ['flag alone: AMOUNT_DIFFERS (claimed amount)', base, { claimedKind: 'shortage', claimedAmountCents: rb.shortageCents + 20000 }, ['AMOUNT_DIFFERS']],
    ['flag alone: SPREAD_TOO_SHORT', base, { shortageSpreadMonths: 6 }, ['SPREAD_TOO_SHORT']],
    ['flag alone: AMOUNT_DIFFERS (payment lower than expected)', base, { newMonthlyEscrowCents: rb.baseMonthlyPaymentCents - 5000 }, ['AMOUNT_DIFFERS']],
    ['flag alone: LUMP_SUM_OFFERED', base, { lumpSumOfferedOnStatement: true }, ['LUMP_SUM_OFFERED']],
    // N1, the three-case rule. TV01: cap $800.00, federal low point $1,100.00, federal surplus $300.00.
    ['N1 (c) cannot tell: over-the-cap minimum that is also the low point, nothing else typed', tv('TV01'), { requiredMinimumBalanceCents: 110000 }, ['CUSHION_MAYBE_OVER_CAP']],
    ['N1 (c) cannot tell, with a matching payment', tv('TV01'), { requiredMinimumBalanceCents: 110000, newMonthlyEscrowCents: 40000 }, ['CUSHION_MAYBE_OVER_CAP']],
    ['N1 (a) mix-up: same minimum, and the statement\'s surplus matches the federal math (nudge alone)', tv('TV01'), { requiredMinimumBalanceCents: 110000, claimedKind: 'surplus', claimedAmountCents: 30000 }, []],
    ['N1 (b) real cushion: same minimum, statement says "none" where the federal math finds $300.00', tv('TV01'), { requiredMinimumBalanceCents: 110000, claimedKind: 'none' }, ['CUSHION_OVER_CAP', 'KIND_DIFFERS']],
    ['refund due + statement matches', tv('TV01'), { claimedKind: 'surplus', claimedAmountCents: 30000, newMonthlyEscrowCents: 40000 }, []],
    ['too close to call + statement matches', tv('TV27'), { claimedKind: 'shortage', claimedAmountCents: 34600 }, []],
    ['question + discrepancy together', base, { lumpSumOfferedOnStatement: true, newMonthlyEscrowCents: max + 5000 }, ['PAYMENT_ABOVE_MAX', 'LUMP_SUM_OFFERED']],
  ];
  for (const [name, account, statement, expectFlags] of scenarios) {
    const t = allText(account, statement); corpus.push({ name, ...t });
    const kind = E.letterKind(t.r, t.c); const shouldBeNotice = asserts(t.c);
    const titleIsNotice = /^Re: Notice of error under 12 C\.F\.R\. § 1024\.35/m.test(t.letter); const titleIsRequest = /^Re: Request for information under 12 C\.F\.R\. § 1024\.36$/m.test(t.letter);
    const believes = /I believe the statement contains the error/.test(t.letter); const stepIsThere = t.next.some((s) => /notice of error/i.test(s.title));
    let ok = (kind === 'NOTICE_OF_ERROR') === shouldBeNotice && titleIsNotice === shouldBeNotice && titleIsRequest === !shouldBeNotice && believes === shouldBeNotice && stepIsThere === shouldBeNotice;
    if (expectFlags) ok = ok && JSON.stringify(t.c.flags.map((f) => f.kind).sort()) === JSON.stringify([...expectFlags].sort());
    if (shouldBeNotice) noe++; else rfi++; if (!ok) { bad++; console.log(`     WRONG: ${name}: kind=${kind} flags=${t.c.flags.map((f) => f.kind)} title notice=${titleIsNotice} believes=${believes} step=${stepIsThere}`); }
    if (expectFlags) rows.push(`${name} -> ${kind === 'NOTICE_OF_ERROR' ? 'notice of error' : 'request for information'}`);
  }
  check(bad === 0, `${scenarios.length} letters (30 vectors, 3 examples, every flag alone, the three N1 cushion cases, refund-due-but-matching, too-close-but-matching, mixed): "Notice of error" title + "I believe the statement contains the error(s)" + the notice-of-error next step appear exactly when a discrepancy flag fires (${noe} notices, ${rfi} requests)`);
  rows.forEach((x) => console.log('     ' + x));
  const nudgeCase = corpus.find((x) => x.name.startsWith('N1 (a)')); const maybeCase = corpus.find((x) => x.name === 'N1 (c) cannot tell, with a matching payment');
  check(nudgeCase.c.nudges.length === 1 && nudgeCase.c.nudges[0].kind === 'MINIMUM_LOOKS_LIKE_LOW_POINT' && nudgeCase.c.rows[0].status === 'not-compared' && nudgeCase.c.overall === 'matches', 'N1 (a): the mix-up draws exactly one nudge, the cushion row is "not-compared", and overall comes from the other rows');
  check(maybeCase.c.rows[0].status === 'differs' && maybeCase.c.nudges.length === 0 && maybeCase.c.overall === 'look-here' && maybeCase.v.tone === 'flag' && /Please confirm the required minimum balance/.test(maybeCase.letter) && !/I believe/.test(maybeCase.letter), 'N1 (c): cannot-tell is amber "Look here" even with a matching payment; its letter only asks the servicer to confirm the number');

  // N4: in a notice of error, errors and questions sit under separate headings
  const mixed = corpus.find((x) => x.name === 'question + discrepancy together'); const L = mixed.letter;
  const iBelieve = L.indexOf('I believe the statement contains the error(s) described below.'); const iAsk = L.indexOf('I also have these questions:');
  const errLine = mixed.c.flags.find((f) => f.kind === 'PAYMENT_ABOVE_MAX').letterLine; const qLine = mixed.c.flags.find((f) => f.kind === 'LUMP_SUM_OFFERED').letterLine;
  check(iBelieve >= 0 && iAsk > iBelieve && L.indexOf('1. ' + errLine) > iBelieve && L.indexOf('1. ' + errLine) < iAsk && L.indexOf('1. ' + qLine) > iAsk && /Please also answer the question above\./.test(L), 'N4: notice of error + a pure question: the error is item 1 under "I believe…", the question is item 1 under "I also have these questions:"');
  let n4bad = 0; let n4seen = 0;
  for (const x of corpus) { const kind = E.letterKind(x.r, x.c); if (kind !== 'NOTICE_OF_ERROR') { if (/I believe|I also have these questions/.test(x.letter)) n4bad++; continue; } n4seen++;
    const head = x.letter.indexOf('I believe the statement contains'); const q = x.letter.indexOf('I also have these questions:'); const errSection = x.letter.slice(head, q >= 0 ? q : x.letter.indexOf('Please review this calculation'));
    for (const f of x.c.flags) { const asserting = DISCREPANCY.includes(f.kind) || (f.kind === 'AMOUNT_DIFFERS' && f.rowKey === 'claimedAmount'); if (errSection.includes(f.letterLine) !== asserting) n4bad++; }
    for (const n of x.c.nudges) if (errSection.includes(n.letterLine)) n4bad++;
    if (/By my math the account has a surplus|within a few dollars/.test(errSection)) n4bad++; }
  check(n4bad === 0 && n4seen > 0, `N4: across the ${n4seen} notices of error generated so far, only discrepancy flags sit under "I believe…"; no question, nudge, refund-timing or too-close item does; no request-for-information letter uses either heading`, `${n4bad} wrong`);

  // N5: "My numbers line up with the statement." only when something was compared and overall is "matches"
  let n5bad = 0; let n5said = 0; for (const x of corpus) { const says = /My numbers line up with the statement/.test(x.letter); if (says) n5said++; if (says && x.c.overall !== 'matches') n5bad++; }
  const blank = corpus.find((x) => x.name === 'vector TV02');
  check(n5bad === 0 && !/line up/.test(blank.letter) && /^For my records, please send me the escrow analysis worksheet/m.test(blank.letter) && blank.c.overall === 'not-provided', `N5: with nothing typed from the statement the letter says only "For my records, please send me…"; "My numbers line up" never appears unless overall is "matches" (${n5said} letters say it so far)`, `${n5bad} wrong`);
  const plain = { startMonth: 1, startingBalanceCents: 120000, cushionMonths: 2, borrowerCurrent: true, disbursements: [{ label: 'Tax', month: 6, amountCents: 480000 }] }; const rp = E.analyze(plain);
  const fullMatch = allText(plain, { newMonthlyEscrowCents: rp.newMonthlyEscrowPayment.monthlyEscrowAfterDeficiencyRepaidCents, claimedKind: 'shortage', claimedAmountCents: rp.shortageCents });
  check(rp.nearLine === null && fullMatch.c.overall === 'matches' && /^My numbers line up with the statement\. For my records, please send me/m.test(fullMatch.letter), 'N5: a compared, matching statement with nothing to ask still says "My numbers line up with the statement."', `overall=${fullMatch.c.overall} shortage=${rp.shortageCents}`);
}

// ---------------------------------------------------------------------------
section('A3 — explainJump when the borrower is not current and has a deficiency');
{
  const a = E.accountFromVector(E.VECTORS.find((v) => v.id === 'TV23')); const r = E.analyze(a); const st = { currentMonthlyEscrowCents: 30000, newMonthlyEscrowCents: 55000 };
  const j = E.explainJump(r, st); const un = j.parts.find((p) => p.key === 'unexplained'); const de = j.parts.find((p) => p.key === 'deficiencyRepayment'); const row = E.compareWithStatement(r, st).rows.find((x) => x.key === 'newMonthlyEscrow');
  check(un.cents === 0 && de.cents === 10000 && /mortgage documents/.test(de.sentence) && /\(f\)\(4\)\(iii\)/.test(de.sentence) && row.status === 'match', 'TV23, $300 -> $550: the $100 is deficiency repayment "set by your mortgage documents" ((f)(4)(iii)), unexplained is $0, and compare.js agrees (match)', `${de.cents}/${un.cents}`);
  let blamed = 0; let sumBad = 0; let cases = 0;
  for (let i = 0; i < N; i++) { const acc = randomAccount({ current: false }); acc.startingBalanceCents = -int(1000, 300000); const rr = E.analyze(acc); const after = rr.newMonthlyEscrowPayment.monthlyEscrowAfterDeficiencyRepaidCents; const s2 = { currentMonthlyEscrowCents: int(0, 200000), newMonthlyEscrowCents: after + int(1, rr.deficiencyCents) }; const jj = E.explainJump(rr, s2); cases++; if (jj.parts.reduce((s, p) => s + p.cents, 0) !== s2.newMonthlyEscrowCents - s2.currentMonthlyEscrowCents) sumBad++; if (jj.parts.some((p) => /more than the federal math supports/.test(p.sentence))) blamed++; }
  check(blamed === 0 && sumBad === 0, `${cases} not-current deficiency accounts collecting up to the whole deficiency in a month: never called "more than the federal math supports"; parts still add up exactly`);
  // NEW probe: can "deficiency repayment" exceed the entire deficiency?
  const tiny = { startMonth: 1, startingBalanceCents: -1000, cushionMonths: 2, borrowerCurrent: false, disbursements: [{ label: 'Tax', month: 6, amountCents: 360000 }] };
  const rt = E.analyze(tiny); const stT = { currentMonthlyEscrowCents: 30000, newMonthlyEscrowCents: rt.newMonthlyEscrowPayment.monthlyEscrowAfterDeficiencyRepaidCents + 50000 };
  const ct = E.compareWithStatement(rt, stT); const jt = E.explainJump(rt, stT); const vt = E.explainVerdict(rt, ct);
  const rowT = ct.rows.find((x) => x.key === 'newMonthlyEscrow'); const deT = jt.parts.find((p) => p.key === 'deficiencyRepayment');
  const unT = jt.parts.find((p) => p.key === 'unexplained');
  check(rowT.status === 'over-limit' && has(ct, 'PAYMENT_ABOVE_MAX') && ct.overall === 'look-here' && vt.tone === 'flag' && deT.cents === rt.deficiencyCents && unT.cents === 50000 - rt.deficiencyCents && E.letterKind(rt, ct) === 'NOTICE_OF_ERROR',
    `N2: borrower not current, deficiency only ${$(rt.deficiencyCents)}, new payment = base + shortage/12 + $500.00 -> PAYMENT_ABOVE_MAX, amber; explainJump gives the deficiency part the whole ${$(rt.deficiencyCents)} and calls the other ${$(50000 - rt.deficiencyCents)} unexplained`, `row=${rowT.status} overall=${ct.overall} deficiencyPart=${deT.cents} unexplained=${unT.cents}`);
  // N2 edges, with the ceiling worked out from the ORACLE: bills/12 + shortage/12 + the WHOLE deficiency, tolerance $1 for each rounded part
  let edgeBad = 0; let sumBad2 = 0; let partBad = 0; let curChanged = 0; let ex2 = null;
  for (let i = 0; i < N; i++) {
    const acc = randomAccount({ current: false }); if (rnd() < 0.5) acc.disbursements = [acc.disbursements[0]]; acc.startingBalanceCents = -int(1, 300000); const ref = oracle(acc); const rr = E.analyze(acc);
    const sh12 = halfUp(ref.shortageCents, 12); const ceiling = ref.baseMonthlyPaymentCents + sh12 + ref.deficiencyCents; const tol = 100 * (2 + (sh12 > 0 ? 1 : 0));
    const at = E.compareWithStatement(rr, { newMonthlyEscrowCents: ceiling + tol }); const past = E.compareWithStatement(rr, { newMonthlyEscrowCents: ceiling + tol + 1 });
    if (has(at, 'PAYMENT_ABOVE_MAX') || at.overall !== 'matches' || !has(past, 'PAYMENT_ABOVE_MAX') || past.overall !== 'look-here') { edgeBad++; if (!ex2) ex2 = { acc, ceiling, tol }; }
    const s3 = { currentMonthlyEscrowCents: int(0, 300000), newMonthlyEscrowCents: pick([ceiling + tol, ceiling + tol + 1, ceiling + int(2, 400000), int(0, ceiling)]) }; const j3 = E.explainJump(rr, s3);
    if (j3.parts.reduce((s, p) => s + p.cents, 0) !== s3.newMonthlyEscrowCents - s3.currentMonthlyEscrowCents) sumBad2++;
    const d3 = j3.parts.find((p) => p.key === 'deficiencyRepayment'); if (d3 && d3.cents > ref.deficiencyCents) partBad++;
    // the same account with the borrower CURRENT must be judged by the old ceiling: base + shortage/12 + deficiency/2
    const cur = E.analyze({ ...acc, borrowerCurrent: true }); const oldMax = ref.baseMonthlyPaymentCents + sh12 + halfUp(ref.deficiencyCents, 2); const tolCur = 100 * (2 + (sh12 > 0 ? 1 : 0));
    if (has(E.compareWithStatement(cur, { newMonthlyEscrowCents: oldMax + tolCur }), 'PAYMENT_ABOVE_MAX') || !has(E.compareWithStatement(cur, { newMonthlyEscrowCents: oldMax + tolCur + 1 }), 'PAYMENT_ABOVE_MAX')) curChanged++;
  }
  check(edgeBad === 0, `N2: ${N} not-current deficiency accounts: a payment of exactly ceiling + tolerance is a match and green; one cent more is PAYMENT_ABOVE_MAX and amber`, edgeBad ? `${edgeBad} wrong, e.g. ${JSON.stringify(ex2)}` : '');
  check(sumBad2 === 0 && partBad === 0, `N2: on the same ${N} accounts explainJump's parts still add up to exactly new − old, and "deficiency repayment" is never more than the whole deficiency`, `sum wrong ${sumBad2}, part too big ${partBad}`);
  check(curChanged === 0, `N2: the same ${N} accounts with the borrower CURRENT keep the old ceiling (base + shortage/12 + deficiency/2, $1 per part)`, `${curChanged} wrong`);
}

// ---------------------------------------------------------------------------
section('A4–A11, A13, A15 — wording, scanned over everything the engine generated above + engine source strings');
{
  // add more generated text: every vector with a plausible matching statement, a deficiency-claim mismatch, servicer-line cases
  for (const v of E.VECTORS) { const a = E.accountFromVector(v); const r = E.analyze(a); const st = { currentMonthlyEscrowCents: r.baseMonthlyPaymentCents - 2500, newMonthlyEscrowCents: r.newMonthlyEscrowPayment.monthlyEscrowWhileRepayingDeficiencyCents, requiredMinimumBalanceCents: r.cushionCapCents, claimedKind: r.surplusCents > 0 ? 'surplus' : r.shortageCents > 0 ? 'shortage' : r.deficiencyCents > 0 ? 'deficiency' : 'none', claimedAmountCents: r.surplusCents || r.shortageCents || r.deficiencyCents }; corpus.push({ name: 'matching ' + v.id, ...allText(a, st) }); corpus.push({ name: 'dip-as-deficiency ' + v.id, ...allText(a, { claimedKind: 'deficiency', claimedAmountCents: 50000 }) }); }
  const every = corpus.flatMap((x) => x.strings).join('\n');
  const src = readdirSync(dirname(enginePath)).filter((f) => f.endsWith('.js') && f !== 'vectors.js').map((f) => readFileSync(join(dirname(enginePath), f), 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')).join('\n');
  const banned = [['A4', 'The most a servicer may collect each month is one-twelfth'], ['A5', 'a shortage has to be spread over at least 12 months'], ['A6', 'may lawfully round'], ['A10', 'Most payment jumps'], ['A11', 'That date is printed on your statement'], ['A13', '"Your bills changed"'], ['A15', '888-995'], ['A15', 'HOPE (4673)']];
  for (const [id, phrase] of banned) check(!every.includes(phrase.replace(/"/g, '')) && !src.includes(phrase), `${id}: "${phrase.replace(/"/g, '')}" is gone from generated text and from engine code`);
  // A4: the wording sweep renamed the sentence ("regular escrow payment each month"). What matters is the substance:
  // one-twelfth is the REGULAR payment, repayments can sit on top, and no step calls one-twelfth "the most" a servicer may collect.
  const step2 = corpus[0].steps[1].plain; const allSteps = corpus.flatMap((x) => x.steps.map((s) => s.plain)).join('\n');
  check(/The regular escrow payment each month is one-twelfth of the year's bills\./.test(step2) && /Repaying a shortage or deficiency can be added on top\./.test(step2) && !/the most [^.]{0,60}one-twelfth|one-twelfth[^.]{0,60}(is the most|at most|no more than|may not collect more)/i.test(allSteps), 'A4: Step 2 says the regular escrow payment is one-twelfth of the year\'s bills and that repayments can be added on top; no step calls one-twelfth a maximum');
  const dip = corpus.find((x) => x.name === 'dip-as-deficiency TV11').c.flags.find((f) => f.kind === 'KIND_DIFFERS'); const dipSmall = corpus.find((x) => x.name === 'dip-as-deficiency TV09').c.flags.find((f) => f.kind === 'KIND_DIFFERS');
  check(dip && /leave it alone, or spread it over at least 12 months\./.test(dip.sentence) && !/within 30 days/.test(dip.sentence.split('For this shortage')[1].split('A deficiency may')[0]) && /if your balance really was below \$0 on the day of the analysis/.test(dip.sentence), 'A5: large shortage mislabelled as a deficiency -> the two (f)(3)(ii) choices, plus the "really below $0 on the analysis date" caution');
  check(dipSmall && /leave it alone, ask for it within 30 days, or spread it over at least 12 months/.test(dipSmall.sentence), 'A5: small shortage -> the three (f)(3)(i) choices');
  check(/HUD's 1995 guidance says dollar amounts may be rounded to the nearest dollar \(60 FR 8812\)/.test(E.explainVerdict(E.analyze(E.accountFromVector(E.VECTORS.find((v) => v.id === 'TV26'))), E.compareWithStatement(E.analyze(E.accountFromVector(E.VECTORS.find((v) => v.id === 'TV26'))), null)).body), 'A6: the too-close sentence attributes whole-dollar rounding to HUD\'s 1995 guidance (60 FR 8812)');
  const hold = corpus.find((x) => x.name === 'example holding-too-much'); check(/Held above the legal cushion, before any surplus refund: \$300\.00/.test(hold.line.sentence), 'A7: "holding-too-much" chart sentence says "before any surplus refund"', hold.line.sentence.slice(-80));
  const cush = corpus.find((x) => x.name === 'example cushion-too-big'); check(/Held above the legal cushion: /.test(cush.line.sentence) && !/before any surplus refund/.test(cush.line.sentence), 'A7: no refund wording when there is no surplus');
  const noe = corpus.find((x) => x.name === 'flag alone: PAYMENT_ABOVE_MAX').next; const s35 = noe.find((s) => /notice of error/i.test(s.title)).body; const s36 = noe.find((s) => /request for information/i.test(s.title)).body;
  check(/generally has 5 business days/.test(s35) && /generally has 30 business days/.test(s35) && /15 more business days if it tells you so in writing first, with reasons/.test(s35), 'A8: § 1024.35 step says "generally" and "with reasons"');
  check(/generally has 5 business days/.test(s36) && /generally has 30 business days/.test(s36) && /15 more business days/.test(s36) && /may not charge a fee/.test(s36), 'A8: § 1024.36 step says "generally" and now carries the 15-day extension');
  const a9none = corpus.find((x) => x.name === 'vector TV11').next.some((s) => /When the math checks out/.test(s.title)); const a9match = corpus.find((x) => x.name === 'matching TV11').next.some((s) => /When the math checks out/.test(s.title)); const a9flag = corpus.find((x) => x.name === 'flag alone: PAYMENT_ABOVE_MAX').next.some((s) => /When the math checks out/.test(s.title));
  check(!a9none && a9match && !a9flag, 'A9: "When the math checks out…" shows only when a statement was compared and matches', `none=${a9none} match=${a9match} flag=${a9flag}`);
  check(/Many payment jumps are lawful/.test(every), 'A10: says "Many payment jumps are lawful"');
  check(/That date is usually printed on your statement/.test(corpus.find((x) => x.name === 'vector TV01').next[0].body), 'A11: "usually printed"');
  check(corpus.find((x) => x.name === 'example jumped-ok').jump.parts[0].label === 'Bills now versus your old payment', 'A13: the first jump part is labelled "Bills now versus your old payment"');
  const counselor = corpus[0].next.find((s) => /housing counselor/i.test(s.title)); const cfpb = corpus[0].next.find((s) => /complaint/i.test(s.title));
  check(counselor && counselor.phone === undefined && cfpb.phone === '855-411-2372', 'A15: the counselor step carries its link and no phone; the CFPB complaint number (printed on the linked page) stays');
}

// ---------------------------------------------------------------------------
section(`A12 — paymentJumpDecomposition: four parts add up to exactly (new − old) on ${N} random priorYear blocks`);
{
  let bad = 0; let newBad = 0; let breakdownBad = 0; let negJumps = 0; let defCases = 0; let addOnCases = 0; let notCurrentDef = 0;
  for (let i = 0; i < N; i++) {
    const a = randomAccount({ current: rnd() < 0.85 }); const oldD = int(100000, 1500000); const oldBase = halfUp(oldD, 12); const addOn = rnd() < 0.5 ? int(100, 20000) : 0; if (addOn) addOnCases++;
    a.priorYear = { annualDisbursementsCents: oldD, monthlyEscrowCents: oldBase + addOn, cushionCents: Math.floor(oldD / 6), stepTwoAddCents: int(0, 300000) };
    const r = E.analyze(a); const j = r.paymentJumpDecomposition; const parts = [j.billsWentUpCents, j.shortageRepaymentCents, j.deficiencyRepaymentCents, j.lastYearAddOnDroppedOffCents];
    if (parts.some((x) => !Number.isSafeInteger(x) || Object.is(x, -0)) || parts.reduce((s, x) => s + x, 0) !== j.newMonthlyEscrowCents - j.oldMonthlyEscrowCents) bad++;
    if (j.newMonthlyEscrowCents !== r.newMonthlyEscrowPayment.monthlyEscrowWhileRepayingDeficiencyCents || j.oldMonthlyEscrowCents !== a.priorYear.monthlyEscrowCents) newBad++;
    const b = j.shortageBreakdown; if (b.cushionRoseCents + b.timingNeedRoseCents + b.lastYearCameInUnderProjectionCents !== r.requiredStartingBalanceCents - a.startingBalanceCents) breakdownBad++;
    if (j.newMonthlyEscrowCents < j.oldMonthlyEscrowCents) negJumps++; if (r.deficiencyCents > 0) { defCases++; if (!a.borrowerCurrent) notCurrentDef++; }
  }
  check(bad === 0 && newBad === 0 && breakdownBad === 0, `${N} blocks (${addOnCases} where last year's payment carried an add-on, ${negJumps} negative jumps, ${defCases} deficiency accounts of which ${notCurrentDef} not current): billsWentUp + shortageRepayment + deficiencyRepayment + lastYearAddOnDroppedOff == new − old every time; "new" is the payment while the deficiency is being repaid; the shortage breakdown still adds up`, `sum wrong ${bad}, new/old wrong ${newBad}, breakdown wrong ${breakdownBad}`);
  const tv18 = E.analyze(E.accountFromVector(E.VECTORS.find((v) => v.id === 'TV18'))).paymentJumpDecomposition; check(tv18.billsWentUpCents === 7500 && tv18.shortageRepaymentCents === 2500 && tv18.deficiencyRepaymentCents === 0 && tv18.lastYearAddOnDroppedOffCents === 0, 'TV18 keeps its pinned values; the two added parts are 0 there');
}

// ---------------------------------------------------------------------------
section('A14 — absurd, unvalidated statement numbers');
{
  const a = { startMonth: 1, startingBalanceCents: 100000, disbursements: [{ label: 'Tax', month: 6, amountCents: 360000 }] }; const r = E.analyze(a); let threw = 0; let treatedAsGiven = 0;
  for (const big of [1e300, 2 ** 53, 1e20, 1000000001, Infinity, NaN, -5, 1.5, '950']) for (const field of ['requiredMinimumBalanceCents', 'claimedAmountCents', 'newMonthlyEscrowCents', 'currentMonthlyEscrowCents', 'shortageSpreadMonths']) {
    const st = { claimedKind: 'shortage', newMonthlyEscrowCents: 40000, currentMonthlyEscrowCents: 30000, [field]: big };
    try { const c = E.compareWithStatement(r, st); E.explainJump(r, st); E.explainServicerLine(r, a, st); E.explainVerdict(r, c); E.nextSteps(r, c); E.buildLetter(r, c, {}); if (c.rows.some((row) => row.statementCents === big)) treatedAsGiven++; } catch { threw++; }
  }
  check(threw === 0 && treatedAsGiven === 0, '45 absurd values (1e300, 2^53, 1e20, over $10,000,000, Infinity, NaN, negative, fraction, text) in every statement field: nothing throws and none is treated as a real number');
}

// ---------------------------------------------------------------------------
section('N1 (was B2): a REAL oversized cushion that lands on the federal low point: the three-case rule, and is it ever green?');
{
  // Stage 3 measured the old rule (nudge only): 19,996 of 20,000 steady-state over-cushioning servicers were hidden and many came out green.
  // The rule is now: (a) a typed claim that matches the federal math -> mix-up nudge; (b) a claim off by about (typed - cap) -> CUSHION_OVER_CAP; (c) anything else -> amber CUSHION_MAYBE_OVER_CAP.
  // "hidden" below = the trigger was met (typed minimum over the cap AND within $7 of the federal low point), so the plain CUSHION_OVER_CAP rule did not decide it.
  const tally = {}; const bump = (k) => { tally[k] = (tally[k] || 0) + 1; }; const greens = [];
  const world = (name, makeBalance, current) => {
    const out = { servicers: 0, nudged: 0, flagged: 0, maybe: 0, neither: 0, typed: { 'minimum only': z(), 'minimum + new payment': z(), 'minimum + claimed shortage/surplus': z(), 'all three': z() } };
    function z() { return { hidden: 0, overCap: 0, maybe: 0, nudgeOnly: 0, silent: 0, surfacedByAnotherFlag: 0, fullyGreen: 0, amberForAnotherReason: 0, neutral: 0 }; }
    for (let i = 0; i < N; i++) {
      const a = randomAccount({ current }); const ref = oracle(a); const A = ref.stepTwoAddCents; const cap = ref.cushionCapCents; const P = ref.baseMonthlyPaymentCents;
      const X = cap + pick([int(701, 5000), int(5001, 60000), Math.max(701, Math.floor(ref.annualDisbursementsCents / 12))]); // a cushion genuinely over the cap: a little, a lot, or 3 months instead of 2
      a.startingBalanceCents = Math.max(0, makeBalance(A + X, P)); const S = a.startingBalanceCents; const r = E.analyze(a);
      const reqS = A + X; const shS = S < reqS ? reqS - S : 0; const suS = S > reqS ? S - reqS : 0; const pay = P + halfUp(shS, 12);
      const claim = shS > 0 ? { claimedKind: 'shortage', claimedAmountCents: shS } : suS > 0 ? { claimedKind: 'surplus', claimedAmountCents: suS } : { claimedKind: 'none' };
      const variants = { 'minimum only': { requiredMinimumBalanceCents: X }, 'minimum + new payment': { requiredMinimumBalanceCents: X, newMonthlyEscrowCents: pay }, 'minimum + claimed shortage/surplus': { requiredMinimumBalanceCents: X, ...claim }, 'all three': { requiredMinimumBalanceCents: X, newMonthlyEscrowCents: pay, ...claim } };
      const first = E.compareWithStatement(r, variants['minimum only']); out.servicers++;
      const nudged = (first.nudges ?? []).length > 0; const flagged = has(first, 'CUSHION_OVER_CAP'); const maybe = has(first, 'CUSHION_MAYBE_OVER_CAP'); if (nudged) out.nudged++; if (flagged) out.flagged++; if (maybe) out.maybe++; if (!nudged && !flagged && !maybe) out.neither++;
      const triggerMet = Math.abs(X - r.lowPoint.projectedBalanceCents) <= 700; // X is always over the cap by more than $7.00 here
      if (!triggerMet) continue;
      for (const [vname, st] of Object.entries(variants)) {
        const c = E.compareWithStatement(r, st); const v = E.explainVerdict(r, c); const t = out.typed[vname]; t.hidden++;
        if (has(c, 'CUSHION_OVER_CAP')) t.overCap++; else if (has(c, 'CUSHION_MAYBE_OVER_CAP')) t.maybe++; else if ((c.nudges ?? []).length > 0) t.nudgeOnly++; else t.silent++;
        // "green" = overall "matches" and no flag at all, whatever colour the banner takes for other reasons (a refund banner is amber but says nothing about the cushion)
        if (c.overall === 'matches' && c.flags.length === 0) { t.fullyGreen++; if (greens.length < 3) greens.push({ account: a, statement: st, cushionOverCapBy: X - cap, overall: c.overall, banner: v.label + ': ' + v.headline }); }
        else if (asserts(c)) t.surfacedByAnotherFlag++; else if (v.tone === 'flag') t.amberForAnotherReason++; else t.neutral++;
      }
    }
    console.log(`  -- ${name}: ${out.servicers} over-cushioning servicers, minimum only -> CUSHION_OVER_CAP ${out.flagged}, amber CUSHION_MAYBE_OVER_CAP ${out.maybe}, nudge ${out.nudged}, silence ${out.neither}`);
    for (const [k, t] of Object.entries(out.typed)) if (t.hidden) console.log(`       trigger met, homeowner typed ${k.padEnd(34)}: CUSHION_OVER_CAP ${String(t.overCap).padStart(6)} | CUSHION_MAYBE_OVER_CAP ${String(t.maybe).padStart(6)} | nudge only ${String(t.nudgeOnly).padStart(6)} | silent ${String(t.silent).padStart(6)} | GREEN (overall "matches", no flag) ${String(t.fullyGreen).padStart(6)}`);
    bump(name); return out;
  };
  const steady = world('steady state: balance sits on the servicer\'s own target (within $7), borrower current', (target) => target + int(-700, 700), true);
  const steadyLate = world('steady state, borrower NOT current', (target) => target + int(-700, 700), false);
  const drift = world('balance within $100 of the servicer\'s target, borrower current', (target) => target + int(-10000, 10000), true);
  const anywhere = world('balance anywhere (a shortage or surplus of up to $3,000 against the servicer\'s target)', (target) => target + int(-300000, 300000), true);
  const worlds = [steady, steadyLate, drift, anywhere]; const sumOver = (f) => worlds.reduce((s, w) => s + Object.values(w.typed).reduce((q, t) => q + f(t), 0), 0);
  check(worlds.every((w) => w.neither === 0 && w.nudged === 0), 'N1: an oversized cushion typed alone always draws CUSHION_OVER_CAP or the amber CUSHION_MAYBE_OVER_CAP: never silence, and never just the mix-up nudge');
  const noClaim = worlds.every((w) => ['minimum only', 'minimum + new payment'].every((k) => w.typed[k].maybe === w.typed[k].hidden));
  check(noClaim, 'N1 (c): trigger met and no claim typed (minimum only, or minimum + new payment) -> CUSHION_MAYBE_OVER_CAP every time');
  const claimAlwaysSurfaces = worlds.every((w) => ['minimum + claimed shortage/surplus', 'all three'].every((k) => w.typed[k].overCap === w.typed[k].hidden && w.typed[k].surfacedByAnotherFlag === w.typed[k].hidden));
  check(claimAlwaysSurfaces, 'N1 (b): trigger met and the servicer\'s own shortage / surplus / "none" typed -> the real CUSHION_OVER_CAP every time (a notice of error)');
  const greenTotal = sumOver((t) => t.fullyGreen); const silentTotal = sumOver((t) => t.silent + t.nudgeOnly);
  check(greenTotal === 0 && silentTotal === 0, `N1: across all four worlds and all four ways of typing it (${sumOver((t) => t.hidden)} trigger-met comparisons), a genuinely oversized cushion came out green ${greenTotal} times and silent or nudge-only ${silentTotal} times`);
  greens.forEach((g) => console.log('     GREEN example: ' + JSON.stringify(g)));
  // minimal repro, hand-sized
  const a = { startMonth: 1, startingBalanceCents: 180000, cushionMonths: 2, borrowerCurrent: false, disbursements: [{ label: 'Property tax', month: 6, amountCents: 360000 }, { label: 'Homeowners insurance', month: 12, amountCents: 360000 }] };
  const r = E.analyze(a); const st = { requiredMinimumBalanceCents: 180000, newMonthlyEscrowCents: 60000 }; const c = E.compareWithStatement(r, st); const v = E.explainVerdict(r, c);
  console.log(`     minimal repro: bills $3,600 (June) + $3,600 (December), balance $1,800.00, a payment was 30+ days late. Statement: required minimum $1,800.00 (cap is ${$(r.cushionCapCents)}), new payment $600.00.`);
  console.log(`       engine: low point ${$(r.lowPoint.projectedBalanceCents)} | cushion row "${c.rows[0].status}" | flags [${c.flags.map((f) => f.kind)}] | nudges ${c.nudges.length} | overall "${c.overall}" | banner ${v.tone} "${v.label}": ${v.headline}`);
  const a2 = { ...a, borrowerCurrent: true }; const r2 = E.analyze(a2); const c2 = E.compareWithStatement(r2, st); const v2 = E.explainVerdict(r2, c2);
  console.log(`       same account, borrower current: banner ${v2.tone} "${v2.label}": ${v2.headline}`);
  for (const [who, cc, vv, rr] of [['not current', c, v, r], ['current', c2, v2, r2]]) check(has(cc, 'CUSHION_MAYBE_OVER_CAP') && !has(cc, 'CUSHION_OVER_CAP') && cc.nudges.length === 0 && cc.rows[0].status === 'differs' && cc.overall === 'look-here' && vv.tone === 'flag' && E.letterKind(rr, cc) === 'REQUEST_FOR_INFORMATION', `N1: the Stage 3 repro (borrower ${who}) is no longer green: amber CUSHION_MAYBE_OVER_CAP, overall "look-here", letter a request for information`, `flags=${cc.flags.map((f) => f.kind)} overall=${cc.overall}`);
}

// ---------------------------------------------------------------------------
section('N3: "It shows a surplus…" only when a claimed surplus row was typed and matches');
{
  const tv01 = E.accountFromVector(E.VECTORS.find((x) => x.id === 'TV01'));
  const payOnly = allText(tv01, { newMonthlyEscrowCents: 40000 }); const withSurplus = allText(tv01, { claimedKind: 'surplus', claimedAmountCents: 30000, newMonthlyEscrowCents: 40000 });
  check(payOnly.c.overall === 'matches' && !/It shows/.test(payOnly.v.headline) && /^The numbers you typed match the federal math\. The federal math also finds a surplus of \$300\.00/.test(payOnly.v.headline), 'N3: TV01 with only the payment typed: "The numbers you typed match the federal math. The federal math also finds a surplus of $300.00…", no "It shows"', payOnly.v.headline);
  check(/^Your statement matches the federal math\. It shows a surplus of \$300\.00/.test(withSurplus.v.headline), 'N3: TV01 with the surplus typed and matching: "It shows a surplus of $300.00…"', withSurplus.v.headline);
  let bad = 0; let said = 0; let refundMatches = 0; let ex = null;
  for (let i = 0; i < N; i++) {
    const a = randomAccount({ current: rnd() < 0.8 }); const ref = oracle(a); a.startingBalanceCents = ref.requiredStartingBalanceCents + pick([int(5000, 300000), int(5000, 300000), int(1, 4999), -int(1, 100000)]); const r = E.analyze(a);
    const st = {}; if (rnd() < 0.7) st.newMonthlyEscrowCents = r.newMonthlyEscrowPayment.monthlyEscrowAfterDeficiencyRepaidCents; if (rnd() < 0.5) st.requiredMinimumBalanceCents = pick([r.cushionCapCents, r.lowPoint.projectedBalanceCents]);
    const k = pick(['surplus', 'surplus', 'shortage', 'none', null, null]); if (k) { st.claimedKind = k; if (k !== 'none') st.claimedAmountCents = pick([r.surplusCents, r.shortageCents, r.surplusCents + int(-900, 900), int(0, 300000)].filter((x) => x >= 0)); }
    const c = E.compareWithStatement(r, st); const v = E.explainVerdict(r, c); const says = /It shows a surplus/.test(v.headline);
    const typedMatchingSurplus = st.claimedKind === 'surplus' && Number.isSafeInteger(st.claimedAmountCents) && Math.abs(st.claimedAmountCents - r.surplusCents) <= 700 && r.surplusCents > 0;
    if (c.overall === 'matches' && r.classification === 'SURPLUS_REFUND_REQUIRED' && r.nearLine === null) refundMatches++;
    if (says) said++; if (says && !typedMatchingSurplus) { bad++; if (!ex) ex = { a, st, headline: v.headline }; }
    if (!says && typedMatchingSurplus && c.overall === 'matches' && r.classification === 'SURPLUS_REFUND_REQUIRED' && r.nearLine === null) { bad++; if (!ex) ex = { a, st, headline: v.headline, why: 'should have said It shows' }; }
  }
  check(bad === 0 && said > 0, `N3: ${N} random statements (${refundMatches} matching with a refundable surplus; "It shows a surplus" said ${said} times): said exactly when a surplus was typed and matches the federal surplus within $7.00`, bad ? `${bad} wrong, e.g. ${JSON.stringify(ex).slice(0, 500)}` : '');
}

console.log(`\n${failures === 0 ? 'ALL FIX CHECKS PASSED' : failures + ' FIX CHECK(S) FAILED'} (NOTE lines are measurements and new findings)`);
process.exit(failures ? 1 : 0);
