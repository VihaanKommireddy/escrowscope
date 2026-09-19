# EscrowScope v1 — Phase 3 build contract (2026-09-19)

Written by the Build Chief before any code, so the Engine Builder and the UI
Builder can work **at the same time in the same folder** without colliding.
`docs/SPEC.md` is still the boss (Part D wins over A–C). This file only pins the
things the spec leaves open. If this file and the spec disagree, the spec wins —
tell the Build Chief.

## 1. Who owns which files (never edit a file you don't own)

| Owner | Files |
|---|---|
| **Engine Builder** | `engine/*`, `examples.js`, `tools/make-vectors.mjs`, and these tests: `tests/vectors.test.js`, `tests/vectors-sync.test.js`, `tests/selfcheck.test.js`, `tests/money.test.js`, `tests/validate.test.js`, `tests/analyze.test.js`, `tests/compare.test.js`, `tests/explain.test.js`, `tests/letter.test.js`, `tests/properties.test.js`, `tests/examples.test.js`, `tests/dates.test.js`, `tests/purity.test.js` |
| **UI Builder** | `index.html`, `styles.css`, `app.js`, `render.js`, `pipeline.js`, `guide.js`, `chart.js`, `proof.js`, any other root-level UI module it needs, `sw.js`, `manifest.webmanifest`, and these tests: `tests/shell.test.js`, `tests/pipeline.test.js` |
| **Build Chief** | `BUILD-LOG.md`, `AI-DISCLOSURE-LOG.md`, this file, integration fixes anywhere after both land |
| Nobody | `v0/*` (owner's hand-typed code, read-only), `docs/research/*` (never edited to make a test pass), `assets/*` (done), `serve.mjs`, `package.json` |

Git: commit often on `v1`, **only your own files, by explicit path**
(`git add engine/ tests/money.test.js …`, never `git add -A` or `git add .`).
If `git` says the index is locked, the other builder is mid-commit: wait a few
seconds and retry. Never push, never switch branches, never `git stash`, never
`git reset`. Every commit message ends with the trailer
`Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

While both builders are mid-build, `npm test` may show the *other* builder's
tests red. Run your own files by name (`node --test tests/money.test.js …`).
Do not "fix" the other builder's files; report problems to the Build Chief.

Ports: Build Chief 4188 · UI Builder 4189 (helpers 4190–4195) · 4173 stays free.
`PORT=4189 node serve.mjs` from this folder. Always stop your server when done.

## 2. Engine: what `engine/index.js` exports (SPEC C2 + Part D)

Exact file list (the service worker precaches exactly these — if the Engine
Builder needs one more engine file, it must tell the Build Chief):

```
engine/index.js      re-exports everything below, nothing else
engine/money.js      parseDollars, formatCents, calendarToEscrowMonth, escrowToCalendarMonth, MONTH_NAMES
engine/validate.js   validateAccount, validateStatement
engine/analyze.js    analyze, projectWithPayment, TOLERANCE_BALANCE_CENTS (700), TOLERANCE_PAYMENT_CENTS (100)
engine/compare.js    compareWithStatement
engine/explain.js    explainVerdict, explainSteps, explainJump, nextSteps, explainServicerLine
engine/letter.js     buildLetter
engine/dates.js      refundDeadline           (D8 helper; cut it cleanly if it isn't clean)
engine/vectors.js    VECTORS, VECTORS_META, REFERENCE_ONLY   (GENERATED — never hand-edited)
engine/selfcheck.js  runSelfCheck, accountFromVector, DOC_ONLY_EXPECTED_KEYS
```

Pinned details:

- **Vector → account.** In the research JSON, `startMonth` sits at the top level
  of each vector and the rest sits in `inputs`. So
  `accountFromVector(v) = { startMonth: v.startMonth, ...v.inputs }`.
- **Doc-only expected keys.** Two keys inside `expected` are documentation, not
  part of the C2 `result` shape: `exactArithmeticReference` (TV15) and
  `whatGoesWrong` (TV18). `runSelfCheck` compares **every other** expected key,
  deep, including every table row, and returns the skipped list as
  `skippedKeys` so the page can say so out loud. A test must assert that
  `DOC_ONLY_EXPECTED_KEYS` is exactly those two and that no other expected key
  in any vector is missing from the engine's `result`. `whatGoesWrong` must
  still be verified in `tests/` through `projectWithPayment` (low point of the
  wrong-deposit projection minus the cushion cap = `bogusSurplusCents`).
- **`paymentJumpDecomposition`** appears on `result` only when
  `account.priorYear` is given; shape exactly as TV18's expected block.
- **`projectWithPayment(account, monthlyCents)`** → array of 12 integers
  (month-end balances in escrow-year order): `startingBalance + Σ(monthly − bills)`.
- **`explainServicerLine(result, account, statement)`** → `null` when no
  `newMonthlyEscrowCents`, else `{ balancesCents:[12], lowPoint:{ balanceCents,
  month, calendarMonth }, aboveCushionCents, includesShortageAddOn: boolean,
  label, sentence }` — the words for SPEC D5 (incl. "this payment already
  includes a shortage add-on" when it does).
- **`validateStatement(statement, account)`** → `{ errors, warnings }` — same
  shape as `validateAccount`. Home of the B3 nudge "this looks like a whole
  mortgage payment". (Addition to C2; C2's `validateAccount(account)` stays.)
- **`statement`** = C2 fields + `lumpSumOfferedOnStatement` (boolean, optional).
- **`refundDeadline(analysisDate)`** — input `"YYYY-MM-DD"` string, output
  `{ ok:true, isoDate, display }` (30 days later, e.g. "October 19, 2026") or
  `{ ok:false, problem }`. No `Date.now()`, no `new Date()` without arguments.
- **Error/warning `field` names** are dotted paths into the objects, so the UI
  can map them to inputs: `startMonth`, `startingBalanceCents`, `cushionMonths`,
  `disbursements` (list-level), `disbursements.0.amountCents`,
  `disbursements.0.month`, `disbursements.0.label`,
  `statement.newMonthlyEscrowCents`, `statement.claimedAmountCents`, … (index is
  the row's position in the array).
- **`comparison.rows[*].label`, every `sentence`, every `message`** come from
  the engine already in plain English, so the UI renders them as-is
  (`textContent`) and never invents math wording of its own.
- **`runSelfCheck(vectors)`** result shape per SPEC D1, plus per-row
  `account` (what went in), `expected`, `actual` so the UI can show
  inputs → expected → produced without re-running anything, plus top-level
  `skippedKeys`.

## 3. `examples.js` (repo root, owned by Engine Builder — write it FIRST, it is small)

```js
export const EXAMPLES = [ { id, title, blurb, account, statement, details, expect } × 3 ];
// account   = exactly the C2 `account` shape (integer cents, months in escrow-year order)
// statement = exactly the C2/D6 `statement` shape
// details   = { analysisDate: "YYYY-MM-DD" } or {}
// expect    = { classification, overall, tone, flagKinds: [sorted strings] }   ← asserted by tests
```

Director's hand-worked numbers (Engine Builder: verify every one through the
engine; if the engine disagrees, stop and tell the Build Chief — do not quietly
change either side):

1. `id: "jumped-ok"` — **"My payment jumped, and the math checks out"** (= TV18's
   account, without `priorYear`). startMonth 1 · start $1,125.00 · bills:
   property tax $2,100 (May), homeowners insurance $1,500 (July), property tax
   $2,100 (Nov) → D $5,700 · P $475 · cap $950 · Step-2 add $475 · required
   start $1,425 · **shortage $300** (< one month) · low point $650 in Nov.
   Statement: current $400.00 · new $500.00 · required minimum $950.00 ·
   claimed shortage $300.00 over 12 months · lump sum offered: false.
   Expect: `SHORTAGE_LT_ONE_MONTH`, overall `matches`, tone `clear`, no flags.
   Jump: $400 → $500 = bills +$75, shortage repayment +$25, unexplained $0.
2. `id: "holding-too-much"` — **"They're holding too much"** (= TV01).
   startMonth 1 · start $1,500 · tax $1,800 (May), insurance $1,200 (July), tax
   $1,800 (Nov) → D $4,800 · P $400 · cap $800 · low point $1,100 in Nov ·
   **surplus $300**. Statement: current $400 · new $400 · required minimum $800 ·
   claimed surplus $300. details.analysisDate "2026-09-01" (refund clock →
   2026-10-01). Expect: `SURPLUS_REFUND_REQUIRED`, overall `matches`, tone
   `flag` (C4: the 30-day refund rule always surfaces in amber), no flags.
3. `id: "cushion-too-big"` — **"The cushion is too big"**. startMonth 4 (April) ·
   start $1,800 · bills (calendar months): homeowners insurance $2,400 (June),
   property tax $2,400 (October), property tax $2,400 (March) → escrow months
   3, 7, 12 · D $7,200 · P $600 · cap $1,200 · Step-1 low −$600 (months 3 and 7
   tie → month 3) · Step-2 add $600 · required start $1,800 → **ON_TARGET**,
   low point $1,200 in June. Statement: current $580 · new $650 · required
   minimum $1,800 (a 3-month cushion) · claimed shortage $600 over 12 months.
   Expect: `ON_TARGET`, overall `look-here`, tone `flag`, flags include
   `CUSHION_OVER_CAP` ($600 over the cap) and `PAYMENT_ABOVE_MAX` ($50.00 a
   month = $600.00 a year); `KIND_DIFFERS` / `AMOUNT_DIFFERS` may also fire —
   list exactly what the engine produces in `expect.flagKinds`.

## 4. The seam the UI must keep testable: `pipeline.js` (UI Builder, DOM-free)

`app.js` touches the DOM. `pipeline.js` never does, so Node can test the exact
path the page uses. `app.js` must call these and nothing else for the math:

```js
exampleToValues(example) → values      // what the "Try an example" buttons put in the form (dollar strings, calendar months)
readInputs(values)       → { errors, account, statement, details }   // parseDollars + calendar→escrow months; parse errors use the §2 field names
runCheck(values)         → { ok, errors, warnings, account, statement, details,
                             result, comparison, verdict, steps, jump, next, servicerLine, refund }
                         // = readInputs → validateAccount + validateStatement → analyze → compareWithStatement → explain*
```

`values` is a plain object of **strings exactly as typed** (UI Builder picks the
key names). `tests/pipeline.test.js` runs all three `EXAMPLES` through
`exampleToValues → runCheck` and asserts `expect`, plus: garbage strings,
`<img onerror>` bill names, negative balances, a file-load round trip if D7 ships.

Form fields the engine needs that SPEC B2 doesn't list — put them in a collapsed
"Less common situations" group: cushion months (2 / 1 / 0, default 2: "my
mortgage documents allow a smaller cushion") and "I'm more than 30 days behind
on a payment" (→ `borrowerCurrent:false`). The user picks **calendar** months
everywhere; conversion to escrow-year order happens in `readInputs` only.

## 4b. SPEC Part E addendum (math audit, added mid-build — Part E wins over everything above)

- **E1.** The property `lowPoint − cushionCap === difference` is exact only when
  `min(step1) <= 0`; otherwise the gap equals `min(step1)` (1–6 cents). The
  property test asserts both branches and proves the second branch was hit.
  The never-below-0 floor on the Step 2 add stays.
- **E2.** New classifications `DEFICIENCY_BORROWER_NOT_CURRENT` and
  `DEFICIENCY_BORROWER_NOT_CURRENT_AND_SHORTAGE_LT_ONE_MONTH` / `…_GE_ONE_MONTH`
  ((f)(4)(iii)): deficiency spread fields 0, `deficiencySpreadMonths: 0`, text
  says the mortgage documents control collection. Shortage handling never
  depends on `borrowerCurrent`. **Vectors for these are written by the
  independent auditor and appended to the research JSON by the director** — no
  builder writes them. After an append, the Engine Builder re-runs
  `node tools/make-vectors.mjs`. Nothing anywhere hard-codes "22".
- **E3.** `result.nearLine` = `null` or `{ line: "SURPLUS_50" |
  "ONE_MONTH_PAYMENT", distanceCents, toleranceCents: 700 }`. `classification`
  stays cent-exact. Inside the band, `explainVerdict` / `nextSteps` /
  `buildLetter` soften, and the UI never shows refund-required banner styling
  or the D8 refund date. The UI styles from the verdict object + `nearLine`,
  never from `classification` alone.
- **E3a (director's rulings, `da5b2b3`).** `nearLine` is set for a surplus or a
  deficiency only when `borrowerCurrent` is true; for a shortage always.
  `distanceCents` is absolute. The band is inclusive (≤ 700: TV28 in, TV29 out).
  Order: surplus → deficiency → shortage (both in the band → report the
  deficiency). The $0 line is not a `nearLine`. The soft wording and the UI's calm banner are
  gated on `result.nearLine !== null` and nothing else; nobody re-derives "near".
- **E3a.6 (`5f301d4`).** The vectors pin only `line`, `distanceCents`,
  `toleranceCents`. The engine may carry descriptive extras on `nearLine`
  (`appliesTo`, `side`, `amountCents`, `lineCents`) and an echo of the
  normalized account at `result.inputs`; extra keys are not a mismatch. So
  `runSelfCheck` compares **every expected key, recursively** — extra actual
  keys ignored at every depth; a missing key, a different value or type, null
  vs object, or `-0` vs `0` is a mismatch; arrays (`table`, `servicerOptions`)
  stay strict on length and order. `result.inputs` follows typed bill order, so
  it alone is excluded, by name, from the bill-permutation property. The UI
  never branches on the extra keys and never computes pass/fail itself.
- **Vectors are now 30** (TV22–TV29 appended by the director from the auditor's
  hand derivations). TV25 pins the Step 2 floor and shows that
  `lowPoint.lowestTargetBalanceCents` is the target **at the low month**
  (Step 1 + Step 2 add + cushion = 20,007), not the cushion cap (20,001).
  Callouts for TV01/TV02 are found by `id`, never by position; no file
  hard-codes a vector count.
- **E4.** The deficiency/shortage split is HUD 1995 guidance (60 FR 8812,
  8813–14), labeled as guidance in comments, `explainSteps`, and the
  show-the-math panel. `result.cite` strings expected by the vectors don't change.
- **E5.** No `-0` in any output; `formatCents(-0)` → "$0.00"; a test walks every
  numeric output across vectors, examples and randomized runs. The UI never
  negates a cents value or builds a money string itself.

## 5. Shell rules the tests will enforce (`tests/shell.test.js`, UI Builder)

Everything in the Build Chief brief's "Quality bar" and "shell test" paragraphs,
plus: the test walks the **static import graph** starting at the scripts in
`index.html` and fails if any imported file is missing on disk or missing from
the `sw.js` precache list; fails on any `import(` (dynamic import) in the shell.
