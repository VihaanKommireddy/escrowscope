# EscrowScope v1 — spec (2026-09-19)

**One paragraph:** EscrowScope is a free web page where a homeowner types the
numbers from their yearly mortgage escrow statement and finds out whether their
servicer followed the federal rule that limits how much escrow money can be
collected (RESPA Regulation X, 12 CFR 1024.17). It is for ordinary homeowners who
just got a "your payment is going up" letter and have no way to check it. "Done"
means: someone who has never heard of RESPA types their numbers and, in under two
minutes, gets a verdict they understand, the lawful new monthly payment, a
plain-English "why did it jump", and a next step — on a page that cannot send
their data anywhere and works with wifi off.

> v1 is built on the `v1` branch. v0.1–v0.3 (the original hand-typed engine and
> page) are kept in `v0/`. Who built what is recorded in `BUILD-LOG.md`.

---

## Part A — Architecture (fixed)

### A1. Hard constraints

1. **Static files only.** No server, no database, no accounts, no analytics, no
   external fonts, no CDNs, no third-party scripts. It deploys to GitHub Pages
   straight from the repo root. Every path is relative (`./`) so it works under
   the `/escrowscope/` sub-path.
2. **No build step, no framework, no dependencies.** Plain HTML + CSS + ES
   modules. Tests use Node's built-in `node:test`. `npm install` is never needed.
3. **Readable by a beginner.** The owner is learning JavaScript and must be able
   to explain every line of the engine to anyone who asks. So: small pure functions,
   plain names, no clever one-liners, no classes unless they earn it, comments
   that say *why* and cite the regulation paragraph, no regex golf.
4. **Money is integer cents.** Never floats. Parsing and formatting dollars
   happens only at the edges (`money.js`).
5. **The engine is pure.** `engine/` has zero DOM access, zero `Date.now()`, zero
   globals. Same input → same output, in Node and in the browser. The UI imports
   the engine; the engine never imports the UI.
6. **User text is never HTML.** Anything the user types (bill names, servicer
   name) reaches the page only through `textContent` / `value`. No `innerHTML`
   with user data, ever.

### A2. File layout

```
index.html                 ← one page: intro → form → results
styles.css                 ← design tokens + components + print styles
app.js                     ← DOM wiring only (read form → call engine → render)
render.js                  ← builds the results DOM + the SVG chart
engine/
  money.js                 ← parseDollars(), formatCents(), month helpers
  validate.js              ← validateAccount() → list of plain-English problems
  analyze.js               ← the 12 CFR 1024.17 math (trial balance → verdict)
  compare.js               ← "your statement says" vs "the federal math says"
  explain.js               ← plain-English sentences + "why did it jump" split
  letter.js                ← notice-of-error letter text from the results
  index.js                 ← re-exports the public API
sw.js                      ← service worker: cache the app shell for offline
manifest.webmanifest
assets/                    ← logo.svg, logo-mono.svg, favicon.svg
tests/
  vectors.json             ← hand-derived + official Appendix E test vectors
  *.test.js                ← node:test suites
docs/                      ← research, this spec, plan, verification, walkthrough
v0/                        ← the original hand-typed v0.1–v0.3 engine + page
serve.mjs                  ← local preview server (zero deps)
```

### A3. The seam (why the layout looks like this)

All the logic sits behind one import (`engine/index.js`) with a small documented
contract (Part C). The page only reads the form, calls the engine, and draws the
result. That keeps the math testable in Node with no browser, keeps the UI
swappable, and means anyone checking the tool's honesty has exactly one folder
to read.

### A4. Privacy model — provable, not promised

- `<meta http-equiv="Content-Security-Policy">` with `default-src 'none'`,
  `script-src 'self'`, `style-src 'self'`, `img-src 'self' data:`,
  `manifest-src 'self'`, `worker-src 'self'`, **`connect-src 'none'`**,
  `form-action 'none'`, `base-uri 'none'`. With `connect-src 'none'` the browser
  itself refuses `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon` from the
  page. The page could not leak data even if the code tried.
- No `localStorage` / cookies by default. Numbers live in memory and vanish on
  reload. (An explicit "remember on this device" toggle may be added; off by
  default.)
- No `<form action>`; the form never submits anywhere.
- A visible **privacy proof** panel: how many network requests the page has made
  since it finished loading (read from the Performance API) — expected 0 — plus
  "turn on airplane mode and try it".
- No inline scripts or inline styles (CSP forbids them), so the CSP is strict
  and real, not decorative.

### A5. Offline model

Service worker precaches the app shell (the site files listed in A2 — not `docs/`, `tests/`, or `v0/`), cache-first,
versioned cache name. After one visit the page works with no connection. The
service worker handles only same-origin GETs for the shell; nothing else.

### A6. Accessibility bar (WCAG 2.1 AA, checked in Phase 4)

- Every input has a visible `<label>`; groups use `<fieldset>/<legend>`; helper
  text is tied with `aria-describedby`.
- Errors: an error summary at the top of the form (focus moves to it), plus
  inline messages next to each field; never color alone.
- Results region is announced (`aria-live="polite"`), and focus moves to the
  verdict heading.
- The chart has a text alternative: the same data as a real `<table>`.
- Full keyboard operation; visible focus rings; 44px touch targets;
  `prefers-reduced-motion` respected; works at 200% zoom and 320px width.
- Contrast: brand palette is already computed AA/AAA
  (`escrowscope-buildrun-2026-07-08/brand/brand-guide.md`).
- Reading level: 6th–8th grade. Jargon gets defined the moment it appears.

### A7. Design direction

Reuse the existing brand kit: Scope Teal `#0C5460`, ink on paper, **amber (not
red) for "look here"**, green for "matches", system font stack, monospace +
tabular figures for every number. Light + dark via `prefers-color-scheme`. Voice
rules from the brand guide are binding: calm, never alarmed; show the math;
servicer-neutral ("most payment jumps are lawful"); never "legal advice"; never
promise a refund. Verdicts never rely on color alone.

---

## Part B — Product behavior

Sources: `docs/research/02-competitors-and-differentiation.md` (the gap + bets)
and `docs/research/03-statement-anatomy-and-next-steps.md` (fields, labels,
help text, next steps, letter).

### B1. What makes it different (the five bets we are building)

The closest competitor (AgentCalc's escrow calculator) computes what escrow
*should* be. Nothing found **checks what the servicer actually did**. So:

1. **"Your statement says" vs. "The federal math says"** — side by side, line by
   line, with the dollar gap. Worded as a math comparison, never an accusation.
2. **"Why did it jump?"** — splits the payment change into: bills went up /
   shortage being repaid / (anything the math can't explain).
3. **Show the work** — every number opens its derivation and the exact
   regulation paragraph it comes from, linking to the official eCFR/CFPB text.
4. **The letter** — a neutral, pre-filled "please explain this calculation"
   notice of error (12 CFR 1024.35) the homeowner can copy or print. Carries its
   own "this states arithmetic, not legal conclusions" line.
5. **Provable privacy** — CSP `connect-src 'none'`, live "network requests since
   load: 0" readout, works in airplane mode.

Plus: month-by-month chart with the cushion line and low point marked, a
printable one-page report for a housing counselor, inline jargon explainers, and
a 3-question "is this the right tool for me?" pre-check.

**Deliberately NOT in this build:** statement OCR / text parser (cut from the
scope 2026-09-19), Spanish toggle (can't verify legal-adjacent
translations — listed as a next bet), multi-year history, any AI call, any
storage.

### B2. The page, top to bottom

1. **Header** — logo, name, tagline "See why your mortgage payment jumped.",
   privacy chip ("Nothing you type leaves this page").
2. **Intro** — 2 sentences + "Try an example" button (loads test case #1, the
   owner's hand-derived case) + the pre-check (collapsed `<details>`).
3. **The form** — follows the order numbers appear on a typical statement
   (research doc 03 §5). Required fields are marked; the rest are "the more you
   fill in, the more we can check."
   - *Your payment:* current monthly escrow payment (optional), new monthly
     escrow payment (optional). Helper: "The escrow part only — not your whole
     mortgage payment."
   - *Your balance:* escrow balance at the start of the new 12 months
     (**required**); first month of the 12-month period (**required**, default
     = next month… shown as a month picker); required minimum balance / cushion
     the statement shows (optional).
   - *What the statement concluded:* shortage / surplus / deficiency amount +
     which one (optional); if shortage: "spread over ___ months" (default 12).
   - *Your bills for the next 12 months:* (**required**, ≥ 1 row) each row =
     what it is (preset list: property tax, homeowners insurance, flood
     insurance, mortgage insurance (PMI/MIP), other) + amount + month paid.
     Starts with 2 rows. "Add another bill" / remove row. Running annual total
     shown live.
   - Each field has its "also called…" aliases from the label dictionary
     (research doc 03 §1.5) in the helper text.
4. **Check the math** button → validation → results.
5. **Results** (focus moves here; `aria-live`):
   - **Verdict banner** — one of the verdict kinds in Part C, brand colors:
     green = matches, amber = look here. Icon + label + one plain sentence +
     the dollar figure. Never color alone.
   - **The three numbers** — annual bills, the most cushion the law allows
     (1/6), your lowest projected balance (and the month).
   - **Statement vs. federal math** table (only rows the user filled in).
   - **Chart** — 12 month-end balances as an SVG line/area, cushion cap as a
     dashed line, low point marked, surplus band shaded above the cushion at the
     low point. Followed by the same data as a `<table>`.
   - **Why did it jump?** (needs current + new payment) — stacked bar + 3
     sentences.
   - **Your lawful payment** — base (1/12 of bills) + shortage spread, and "if
     you pay the shortage in one lump sum the payment would be $X".
   - **Show the math** — collapsible steps 1–6, each with the reg cite + link.
   - **What you can do next** — by outcome (research doc 03 §3), with the real
     deadlines (5 business days to acknowledge, 30 business days to respond),
     CFPB complaint link, HUD counselor finder + phone.
   - **Letter** — generated text in a read-only box; Copy + Print buttons;
     asks for servicer name / loan number *locally* (optional, never stored).
   - **Print this report** — print stylesheet gives a clean one-pager.
6. **Honest limits** (always visible near results): math not legal advice; only
   as good as the numbers typed; your servicer may know something you don't
   (newer tax bill); only covers escrow; not every loan is covered by RESPA.
7. **Footer** — privacy proof panel, "how this works", source link, the reg link.

### B3. Validation (plain-English, never blocks on a hunch)

Hard errors (block): missing starting balance; no bills; bill with no amount or
amount ≤ 0; month outside 1–12; non-numeric money; more than 2 decimal places;
absurd magnitude (> $10,000,000).
Soft nudges (warn, don't block): escrow payment looks like a whole mortgage
payment (far above annual bills ÷ 12); a bill under $100/yr or the annual total
above $100,000 ("monthly vs. yearly?"); only one bill entered ("most statements
have property tax AND insurance"); required-minimum typed equal to the low point
is fine (say nothing).

## Part C — Engine contract

Source of truth for the law and the math: `docs/research/01-reg-math.md`.
Source of truth for expected numbers: `docs/research/01-test-vectors.json`
(22 vectors: the owner's hand-derived case #1, the official Appendix E example,
two HUD published examples, and 18 edge cases). **The engine must pass all 22
without the vectors being edited.** Field names below match the vectors.

### C0. The big correction (why the input changed)

The live v0.3 engine takes `monthlyDeposit` as an input and projects with it.
That equals the law's test **only** when the typed deposit is exactly bills ÷ 12.
Type last year's payment, or the new payment that already includes a shortage
add-on, and the answer is off by hundreds of dollars (vector TV18: −$1,125 or
−$25 when the truth is −$300). So: **the engine computes the deposit itself
(bills ÷ 12). Anything from the servicer's statement is comparison-only.**
The owner's test case #1 still produces exactly his numbers (TV01).

### C1. The method (12 CFR 1024.17(d)(2)(i), Appendix E Steps 1–3)

```
D  = sum of all bills for the coming 12 months
P  = D / 12                          base monthly payment     (c)(1)(ii)
C  = D × cushionMonths / 12          cushion cap, months = 2 unless docs/state law say less   (c)(5), (c)(8)
T(0)=0; T(m)=T(m−1)+P−bills(m)       Step 1 trial balance
A  = −min(T(1..12)), never below 0   Step 2 add
required start = A + C               Step 3 (target balance at month 0)
difference = startingBalance − required start     >0 surplus, <0 shortage   (b)
projected(m) = startingBalance + T(m);  low point = min projected(1..12)
deficiency = the part of startingBalance below $0 (a REAL negative balance, not a projected dip)   (b), (f)(4)
shortage   = from max(startingBalance, 0) up to the required start
```

Rounding — **choices, not law** (reg is silent; HUD 1995 lets servicers round to
the dollar): P rounds half-up to the cent; C rounds **down** (it's a cap); table
rows use the rounded P; spreads round half-up; tie for low month → earliest.
Comparison tolerance: **$7.00** on balances, **$1.00** on a monthly payment.

### C2. Public API — `engine/index.js`

All money in and out is **integer cents**. Months are 1–12 in **escrow-year
order**; `startMonth` is the calendar month (1 = Jan) of escrow-year month 1.

```js
// money.js
parseDollars(text)  → { ok: true, cents } | { ok: false, problem }   // "1,234.50", "$1234.5", "-200"
formatCents(cents)  → "$1,234.50"  (negative → "−$200.00")
calendarToEscrowMonth(calendarMonth, startMonth) → 1..12
escrowToCalendarMonth(escrowMonth, startMonth)   → 1..12
MONTH_NAMES → ["January", …]

// validate.js
validateAccount(account) → { errors: [{ field, message }], warnings: [{ field, message }] }

// analyze.js
analyze(account) → result          // throws only if validateAccount has errors

account = {
  startMonth,                       // 1..12
  startingBalanceCents,             // integer, may be negative
  cushionMonths,                    // 0 | 1 | 2   (default 2)
  borrowerCurrent,                  // boolean     (default true)
  disbursements: [{ label, month, amountCents }],   // month in escrow-year order
  priorYear: { annualDisbursementsCents, monthlyEscrowCents, cushionCents, stepTwoAddCents }  // optional
}

result = {
  annualDisbursementsCents, baseMonthlyPaymentCents, cushionCapCents,
  stepTwoAddCents, requiredStartingBalanceCents, differenceCents,
  surplusCents, shortageCents, deficiencyCents,
  lowPoint: { projectedBalanceCents, month, calendarMonth, lowestTargetBalanceCents },
  classification,                   // one of C3
  cite,                             // e.g. "12 CFR 1024.17(f)(2)(i)"
  servicerOptions: [string],
  newMonthlyEscrowPayment: { baseMonthlyCents, shortageSpreadOver12Cents,
      deficiencySpreadCents, deficiencySpreadMonths,
      monthlyEscrowWhileRepayingDeficiencyCents, monthlyEscrowAfterDeficiencyRepaidCents },
  table: [ { month, calendarMonth, depositCents, disbursementCents,
             step1TrialBalanceCents, targetBalanceCents, projectedBalanceCents } × 12 ],
  paymentJumpDecomposition          // only when priorYear is given (see TV18)
}

// compare.js  — "your statement says" vs "the federal math says"
compareWithStatement(result, statement) → comparison
statement = {                       // every field optional
  currentMonthlyEscrowCents, newMonthlyEscrowCents,
  requiredMinimumBalanceCents,      // the cushion the servicer is using
  claimedKind,                      // "surplus" | "shortage" | "deficiency" | "none"
  claimedAmountCents,
  shortageSpreadMonths              // default 12
}
comparison = {
  provided: boolean,                // did the user give us anything to compare?
  rows: [ { key, label, statementCents, federalCents, gapCents, status } ],   // status: "match" | "differs" | "over-limit"
  flags: [ { kind, amountCents, perYearCents?, cite, sentence } ],
      // kinds: "CUSHION_OVER_CAP", "PAYMENT_ABOVE_MAX", "AMOUNT_DIFFERS", "KIND_DIFFERS"
  overall: "matches" | "look-here" | "not-provided"
}

// explain.js — plain-English, brand voice (calm, servicer-neutral, no legal advice)
explainVerdict(result, comparison) → { tone: "clear"|"flag"|"info", icon, label, headline, body }
explainSteps(result)               → [ { title, plain, math, cite, url } ]     // the show-your-work panel
explainJump(result, statement)     → null | { oldCents, newCents, parts: [ { key, label, cents, sentence } ], note }
      // parts: bills changed (base − old), shortage repayment, deficiency repayment, unexplained remainder
nextSteps(result, comparison)      → [ { title, body, url?, phone? } ]

// letter.js
buildLetter(result, comparison, details) → string   // details = { servicerName, loanNumber, borrowerName, propertyAddress, date } all optional
```

### C3. Classifications (exactly these strings; cites from the vectors)

`SURPLUS_REFUND_REQUIRED` (≥ $50.00, borrower current — (f)(2)(i)) ·
`SURPLUS_UNDER_50` ((f)(2)(i), refund or credit) ·
`SURPLUS_BORROWER_NOT_CURRENT` ((f)(2)(ii)) · `ON_TARGET` ·
`SHORTAGE_LT_ONE_MONTH` ((f)(3)(i)) · `SHORTAGE_GE_ONE_MONTH` ((f)(3)(ii)) ·
`DEFICIENCY_LT_ONE_MONTH` ((f)(4)(i)) · `DEFICIENCY_GE_ONE_MONTH` ((f)(4)(ii)) ·
combined forms `DEFICIENCY_*_AND_SHORTAGE_*` (deficiency first, then the
remaining shortage from $0 up to target — HUD 60 FR 8814; vector TV04).
"One month's payment" = `baseMonthlyPaymentCents`. Exactly one month's payment
falls in the **GE** tier (TV10 / TV10b).

### C4. The verdict banner (two questions, kept separate)

1. *What does the federal math say about this account?* → `classification`.
2. *Does the statement agree?* → `comparison.overall`.

- statement given + everything within tolerance → **green "matches"**: "Your
  statement's math matches the federal method." then the classification sentence
  (e.g. "There is a $300 shortage, so the payment rises about $25 a month for 12
  months. That is allowed."). This is the most common real outcome and the page
  must be good at it — most payment jumps are lawful.
- any flag → **amber "look here"**: list each gap in dollars + the standing
  caveat: a mismatch is not proof of a mistake; the servicer may have newer bill
  amounts than the ones typed.
- nothing to compare → **teal "info"**: the classification, plus a nudge to add
  the statement's numbers.
- `SURPLUS_REFUND_REQUIRED` always surfaces the 30-day refund rule, in amber,
  even when the statement agrees.

### C5. Tests (node:test, zero deps)

`tests/vectors.test.js` (all 22 vectors, every expected field, every table row) ·
`tests/money.test.js` · `tests/validate.test.js` · `tests/compare.test.js` ·
`tests/explain.test.js` (no banned words: "scam", "fraud", "stealing",
"guaranteed", "legal advice" only in the negative) · `tests/properties.test.js`
(randomized: identity `lowPoint − C == difference`; adding $x to the balance
moves difference by exactly $x; permuting bill order changes nothing; all
outputs are integers; a second, differently-written oracle agrees).
