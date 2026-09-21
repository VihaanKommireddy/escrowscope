// check-vectors.mjs — run every test vector through the independent oracle and diff everything.
// Usage: node check-vectors.mjs [path-to-01-test-vectors.json] [--engine path-to-engine-module]
//   default: vectors vs the independent oracle.   --engine: vectors vs that engine's analyze().
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { analyze as oracleAnalyze } from './oracle.mjs';
import { compareResults } from './compare.mjs';

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT = join(HERE, '../docs/research/01-test-vectors.json'); // the repo's vector file
const argv = process.argv.slice(2);
const ei = argv.indexOf('--engine');
// '--engine' alone means the repo's engine, ../engine/index.js
const enginePath = ei >= 0 ? (argv[ei + 1] && !argv[ei + 1].startsWith('--') ? argv[ei + 1] : join(HERE, '../engine/index.js')) : null;
const file = argv.find((a, i) => !a.startsWith('--') && (ei < 0 || i !== ei + 1)) || DEFAULT;
const doc = JSON.parse(readFileSync(file, 'utf8'));
let analyze = oracleAnalyze;
if (enginePath) {
  const mod = await import(pathToFileURL(resolve(process.cwd(), enginePath)).href);
  analyze = mod.analyze ?? mod.default?.analyze ?? mod.default;
  if (typeof analyze !== 'function') { console.error('no analyze() export in ' + enginePath); process.exit(2); }
}
const WHO = enginePath ? 'engine' : 'oracle';

// Appendix E, Example I, as I read it myself from the official eCFR XML (2026-09-17), in DOLLARS.
// 13 entries: the opening "Jun" row, then Jul..Jun.
const APPENDIX_E_OFFICIAL = {
  step1: [0, -370, -240, -470, -340, -210, -780, -650, -520, -390, -260, -130, 0],
  step2: [780, 410, 540, 310, 440, 570, 0, 130, 260, 390, 520, 650, 780],
  step3: [1040, 670, 800, 570, 700, 830, 260, 390, 520, 650, 780, 910, 1040],
};

let matched = 0;
const problems = [];

for (const v of doc.vectors) {
  const account = { startMonth: v.startMonth, ...v.inputs };
  const got = analyze(account);
  const { hard, soft } = compareResults(v.expected, got);

  const extra = [];
  // Tables published by the source (TV02 official; TV03/TV04 HUD guidance).
  if (v.publishedTables) {
    const mine = {
      step1: [0, ...got.table.map((r) => r.step1TrialBalanceCents)],
      step2: [got.stepTwoAddCents, ...got.table.map((r) => r.step1TrialBalanceCents + got.stepTwoAddCents)],
      step3: [got.requiredStartingBalanceCents, ...got.table.map((r) => r.targetBalanceCents)],
    };
    for (const k of ['step1', 'step2', 'step3']) {
      const pub = v.publishedTables[k];
      if (!pub) continue;
      pub.forEach((x, i) => { if (x !== mine[k][i]) extra.push({ path: `publishedTables.${k}[${i}]`, expected: x, actual: mine[k][i] }); });
    }
    if (v.id === 'TV02') {
      for (const k of ['step1', 'step2', 'step3']) {
        APPENDIX_E_OFFICIAL[k].forEach((dollars, i) => {
          if (dollars * 100 !== mine[k][i]) extra.push({ path: `OFFICIAL eCFR Appendix E ${k}[${i}]`, expected: dollars * 100, actual: mine[k][i] });
          if (v.publishedTables[k] && v.publishedTables[k][i] !== dollars * 100) extra.push({ path: `vector file misquotes Appendix E ${k}[${i}]`, expected: dollars * 100, actual: v.publishedTables[k][i] });
        });
      }
    }
  }

  // Oracle-free sanity on the vector itself.
  const e = v.expected;
  if (e.table.length !== 12) extra.push({ path: 'vector table length', expected: 12, actual: e.table.length });
  // SPEC E1 form of the identity: exact when min(step1) <= 0, otherwise off by exactly min(step1).
  const minS1 = Math.min(...e.table.map((r) => r.step1TrialBalanceCents));
  const gap = e.lowPoint.projectedBalanceCents - e.cushionCapCents - e.differenceCents;
  if (gap !== Math.max(0, minS1)) extra.push({ path: 'vector identity (E1 form) lowPoint - C - difference == max(0, min step1)', expected: Math.max(0, minS1), actual: gap });
  // Oracle-free row bookkeeping of the vector's own table.
  let s1 = 0; let tg = e.requiredStartingBalanceCents; let pj = account.startingBalanceCents;
  e.table.forEach((r, i) => {
    const step = r.depositCents - r.disbursementCents; s1 += step; tg += step; pj += step;
    if (r.step1TrialBalanceCents !== s1 || r.targetBalanceCents !== tg || r.projectedBalanceCents !== pj) extra.push({ path: `vector row ${i + 1} does not add up`, expected: [s1, tg, pj], actual: [r.step1TrialBalanceCents, r.targetBalanceCents, r.projectedBalanceCents] });
    if (r.calendarMonth !== ((v.startMonth - 1 + i) % 12) + 1) extra.push({ path: `vector row ${i + 1} calendarMonth`, expected: ((v.startMonth - 1 + i) % 12) + 1, actual: r.calendarMonth });
  });

  const all = [...hard, ...soft, ...extra];
  if (all.length === 0) {
    matched++;
    console.log(`ok    ${v.id.padEnd(6)} ${e.classification}`);
  } else {
    problems.push({ id: v.id, all });
    console.log(`DIFF  ${v.id.padEnd(6)} ${all.length} field(s) differ`);
    for (const d of all.slice(0, 12)) console.log(`        ${d.path}: vector=${JSON.stringify(d.expected)} ${WHO}=${JSON.stringify(d.actual)}`);
  }
}

console.log(`\n${matched} of ${doc.vectors.length} vectors match the ${WHO} on every numeric field, classification, cite and all 12 table rows.`);
process.exit(problems.length ? 1 : 0);
