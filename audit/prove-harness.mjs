// prove-harness.mjs — shows that fuzz.mjs (a) passes a correct engine and (b) catches every planted bug.
// Usage: node prove-harness.mjs [--n 5000]
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const i = process.argv.indexOf('--n');
const n = i >= 0 ? process.argv[i + 1] : '5000';

const BUGS = {
  ge50: 'uses "> $50" instead of ">= $50" for the mandatory refund',
  tier: 'puts a shortage of EXACTLY one month\'s payment in the small tier',
  capup: 'rounds the cushion cap UP (can exceed the legal 1/6)',
  paytrunc: 'truncates the monthly payment instead of rounding half-up',
  tie: 'picks the LATEST month when two months tie for the low point',
  dipdef: 'calls a projected dip below $0 a deficiency',
  order: 'second bill in the same month overwrites the first',
  nofloor: 'lets the Step 2 add go negative',
  float: 'never rounds the payment (fractional cents)',
  spread: 'truncates shortage / 12 instead of rounding half-up',
  negzero: 'returns -0 for the Step 2 add',
  e2: 'ignores SPEC E2: still applies deficiency tiers and a 2-month schedule when the borrower is not current',
};
// Not math bugs: open nearLine conventions. fuzz.mjs must notice each one and NAME it (exit code 3).
const CONVENTIONS = {
  nearexcl: 'treats exactly 700 cents as outside the band',
  nearsigned: 'reports a signed distance',
  nearnogate: 'flags the $50 / deficiency line even when the borrower is not current',
  nearpick: 'reports the shortage instead of the deficiency when both are in the band',
};

function run(engine, bug) {
  const r = spawnSync(process.execPath, [join(here, 'fuzz.mjs'), join(here, engine), '--n', n, '--quiet'], { env: { ...process.env, BUG: bug ?? '' }, encoding: 'utf8' });
  const out = r.stdout || '';
  const grab = (re) => Number((out.match(re) || [0, 0])[1]);
  return { exit: r.status, conventionCases: grab(/CONVENTION differences[^:]*:\s+(\d+)/), oracleDiffCases: grab(/disagreeing with the oracle:\s+(\d+)/), invariantCases: grab(/failing an invariant:\s+(\d+)/), threw: grab(/threw on a valid account:\s+(\d+)/) };
}

let ok = true;
const line = (name, r, expectFail) => {
  const caught = r.exit !== 0;
  const good = caught === expectFail;
  if (!good) ok = false;
  console.log(`${good ? 'ok  ' : 'BAD '} ${name.padEnd(28)} exit=${r.exit} oracle-diff cases=${String(r.oracleDiffCases).padStart(5)} invariant-fail cases=${String(r.invariantCases).padStart(5)} threw=${r.threw}  -> ${expectFail ? (caught ? 'CAUGHT' : 'MISSED') : (caught ? 'FALSE ALARM' : 'passes, as it should')}`);
};

console.log(`fuzz cases per run: ${n}\n`);
line('oracle vs itself', run('oracle.mjs'), false);
line('correct mock engine', run('mock-engine.mjs'), false);
for (const [bug, what] of Object.entries(BUGS)) { line(`BUG=${bug}`, run('mock-engine.mjs', bug), true); console.log(`       (${what})`); }
for (const [bug, what] of Object.entries(CONVENTIONS)) {
  const r = run('mock-engine.mjs', bug); const good = r.exit === 3 && r.conventionCases > 0 && r.oracleDiffCases === 0; if (!good) ok = false;
  console.log(`${good ? 'ok  ' : 'BAD '} ${('CONVENTION=' + bug).padEnd(28)} exit=${r.exit} convention cases=${String(r.conventionCases).padStart(5)} oracle-diff cases=${String(r.oracleDiffCases).padStart(5)} invariant-fail cases=${String(r.invariantCases).padStart(5)}  -> ${good ? 'NAMED as a convention difference, not a math error' : 'NOT handled as expected'}`);
  console.log(`       (${what})`);
}
console.log(ok ? '\nHARNESS PROVEN: correct engines pass, every planted bug is caught.' : '\nHARNESS PROBLEM: see BAD lines above.');
process.exit(ok ? 0 : 1);
