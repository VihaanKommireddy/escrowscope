// stage3-reverify.mjs — Stage 3: independent re-verification of the 15 audit fixes (A1–A15) and the
// director's B2 rule, against the engine's real code paths and generated text.
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
    ['nudge alone (B2)', tv('TV01'), { requiredMinimumBalanceCents: 110000 }, []],
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
  check(bad === 0, `${scenarios.length} letters (30 vectors, 3 examples, every flag alone, nudge alone, refund-due-but-matching, too-close-but-matching, mixed): "Notice of error" title + "I believe the statement contains the error(s)" + the notice-of-error next step appear exactly when a discrepancy flag fires (${noe} notices, ${rfi} requests)`);
  rows.forEach((x) => console.log('     ' + x));
  const mixed = corpus.find((x) => x.name === 'question + discrepancy together');
  if (/I believe the statement contains the error\(s\) described below/.test(mixed.letter)) note('in a notice of error that also carries a pure question (lump-sum, refund timing, too-close), every numbered item sits under "I believe the statement contains the error(s) described below". Cosmetic: the question items are not errors.');
  const blank = corpus.find((x) => x.name === 'vector TV02');
  if (/My numbers line up with the statement/.test(blank.letter)) note('with NO statement numbers typed (nothing compared), the letter still says "My numbers line up with the statement."', 'cosmetic, new');
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
  if (rowT.status === 'match' && deT.cents > rt.deficiencyCents) note(`NEW (wrong-answer, miss): borrower not current, deficiency only ${$(rt.deficiencyCents)}, new payment ${$(stT.newMonthlyEscrowCents)} = base + shortage/12 + $500.00. compare.js: "${rowT.status}" (overall ${ct.overall}, banner "${vt.label}"). explainJump: "${deT.sentence.slice(0, 140)}…". A $10.00 deficiency cannot explain $500.00 a month. (f)(4)(iii) removes the schedule, not the amount: the most that can be deficiency recovery in any month is the whole deficiency.`, JSON.stringify({ account: tiny, statement: stT }));
  else check(true, 'a payment add-on larger than the whole deficiency is not waved through');
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
  const step2 = corpus[0].steps[1].plain; check(/regular monthly payment is one-twelfth/.test(step2) && /shortage or deficiency can be added on top/.test(step2), 'A4: Step 2 now says the regular payment is one-twelfth and repayments can be added on top');
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
section('B2 — the "is that really the required minimum?" nudge: how often does it hide a REAL oversized cushion?');
{
  const tally = {}; const bump = (k) => { tally[k] = (tally[k] || 0) + 1; }; const greens = [];
  const world = (name, makeBalance, current) => {
    const out = { servicers: 0, nudged: 0, flagged: 0, neither: 0, typed: { 'minimum only': z(), 'minimum + new payment': z(), 'minimum + claimed shortage/surplus': z(), 'all three': z() } };
    function z() { return { hidden: 0, surfacedByAnotherFlag: 0, fullyGreen: 0, amberForAnotherReason: 0, neutral: 0 }; }
    for (let i = 0; i < N; i++) {
      const a = randomAccount({ current }); const ref = oracle(a); const A = ref.stepTwoAddCents; const cap = ref.cushionCapCents; const P = ref.baseMonthlyPaymentCents;
      const X = cap + pick([int(701, 5000), int(5001, 60000), Math.max(701, Math.floor(ref.annualDisbursementsCents / 12))]); // a cushion genuinely over the cap: a little, a lot, or 3 months instead of 2
      a.startingBalanceCents = Math.max(0, makeBalance(A + X, P)); const S = a.startingBalanceCents; const r = E.analyze(a);
      const reqS = A + X; const shS = S < reqS ? reqS - S : 0; const suS = S > reqS ? S - reqS : 0; const pay = P + halfUp(shS, 12);
      const claim = shS > 0 ? { claimedKind: 'shortage', claimedAmountCents: shS } : suS > 0 ? { claimedKind: 'surplus', claimedAmountCents: suS } : { claimedKind: 'none' };
      const variants = { 'minimum only': { requiredMinimumBalanceCents: X }, 'minimum + new payment': { requiredMinimumBalanceCents: X, newMonthlyEscrowCents: pay }, 'minimum + claimed shortage/surplus': { requiredMinimumBalanceCents: X, ...claim }, 'all three': { requiredMinimumBalanceCents: X, newMonthlyEscrowCents: pay, ...claim } };
      const first = E.compareWithStatement(r, variants['minimum only']); out.servicers++;
      const nudged = (first.nudges ?? []).length > 0; const flagged = has(first, 'CUSHION_OVER_CAP'); if (nudged) out.nudged++; if (flagged) out.flagged++; if (!nudged && !flagged) out.neither++;
      if (!nudged) continue;
      for (const [vname, st] of Object.entries(variants)) {
        const c = E.compareWithStatement(r, st); const v = E.explainVerdict(r, c); const t = out.typed[vname]; t.hidden++;
        if (asserts(c)) t.surfacedByAnotherFlag++; else if (c.overall === 'matches' && v.tone === 'clear') { t.fullyGreen++; if (greens.length < 1 && X - cap > 20000) greens.push({ account: a, statement: st, cushionOverCapBy: X - cap, overall: c.overall, banner: v.label + ': ' + v.headline, nudge: c.nudges[0].message.slice(0, 120) + '…' }); } else if (v.tone === 'flag') t.amberForAnotherReason++; else t.neutral++;
      }
    }
    console.log(`  -- ${name}: ${out.servicers} over-cushioning servicers -> CUSHION_OVER_CAP ${out.flagged}, hidden behind the nudge ${out.nudged} (${(100 * out.nudged / out.servicers).toFixed(1)}%), neither ${out.neither}`);
    for (const [k, t] of Object.entries(out.typed)) if (t.hidden) console.log(`       homeowner typed ${k.padEnd(34)}: another discrepancy flag fired ${String(t.surfacedByAnotherFlag).padStart(6)} | fully GREEN ${String(t.fullyGreen).padStart(6)} | amber for another reason (refund banner) ${String(t.amberForAnotherReason).padStart(6)} | neutral ${String(t.neutral).padStart(6)}`);
    bump(name); return out;
  };
  const steady = world('steady state: balance sits on the servicer\'s own target (within $7), borrower current', (target) => target + int(-700, 700), true);
  const steadyLate = world('steady state, borrower NOT current', (target) => target + int(-700, 700), false);
  const drift = world('balance within $100 of the servicer\'s target, borrower current', (target) => target + int(-10000, 10000), true);
  const anywhere = world('balance anywhere (a shortage or surplus of up to $3,000 against the servicer\'s target)', (target) => target + int(-300000, 300000), true);
  check(steady.neither + steadyLate.neither + drift.neither + anywhere.neither === 0, 'an oversized cushion always draws either CUSHION_OVER_CAP or the nudge (never silence)');
  const claimAlwaysSurfaces = [steady, steadyLate, drift, anywhere].every((w) => w.typed['minimum + claimed shortage/surplus'].surfacedByAnotherFlag === w.typed['minimum + claimed shortage/surplus'].hidden && w.typed['all three'].surfacedByAnotherFlag === w.typed['all three'].hidden);
  check(claimAlwaysSurfaces, 'whenever the homeowner also typed the claimed shortage / surplus / "none", KIND_DIFFERS or AMOUNT_DIFFERS still surfaces the problem (100% of hidden cases)');
  const payOnlyGreen = [steady, steadyLate, drift, anywhere].reduce((s, w) => s + w.typed['minimum + new payment'].fullyGreen, 0);
  if (payOnlyGreen > 0) { note(`NEW (wrong-answer, miss): when the homeowner typed the minimum and the new payment but NOT the claimed amount, ${payOnlyGreen} genuinely over-cushioned statements came out fully green ("Matches"). The payment does not catch it, because in the steady state the oversized cushion is already funded, so the payment is just bills ÷ 12.`); greens.forEach((g) => console.log('     example: ' + JSON.stringify(g))); }
  // minimal repro, hand-sized
  const a = { startMonth: 1, startingBalanceCents: 180000, cushionMonths: 2, borrowerCurrent: false, disbursements: [{ label: 'Property tax', month: 6, amountCents: 360000 }, { label: 'Homeowners insurance', month: 12, amountCents: 360000 }] };
  const r = E.analyze(a); const st = { requiredMinimumBalanceCents: 180000, newMonthlyEscrowCents: 60000 }; const c = E.compareWithStatement(r, st); const v = E.explainVerdict(r, c);
  console.log(`     minimal repro: bills $3,600 (June) + $3,600 (December), balance $1,800.00, a payment was 30+ days late. Statement: required minimum $1,800.00 (cap is ${$(r.cushionCapCents)}), new payment $600.00.`);
  console.log(`       engine: low point ${$(r.lowPoint.projectedBalanceCents)} | cushion row "${c.rows[0].status}" | flags [${c.flags.map((f) => f.kind)}] | nudges ${c.nudges.length} | overall "${c.overall}" | banner ${v.tone} "${v.label}": ${v.headline}`);
  const a2 = { ...a, borrowerCurrent: true }; const r2 = E.analyze(a2); const c2 = E.compareWithStatement(r2, st); const v2 = E.explainVerdict(r2, c2);
  console.log(`       same account, borrower current: banner ${v2.tone} "${v2.label}": ${v2.headline}`);
  if (/It shows a surplus/.test(v2.headline)) note('NEW (misleading-text): that headline says the STATEMENT "shows a surplus of $600.00". The homeowner typed no surplus; the surplus is the federal math\'s finding, caused by the oversized cushion the nudge just declined to flag.');
}

console.log(`\n${failures === 0 ? 'ALL FIX CHECKS PASSED' : failures + ' FIX CHECK(S) FAILED'} (NOTE lines are measurements and new findings)`);
process.exit(failures ? 1 : 0);
