# EscrowScope — independent math audit

Date: 2026-09-19. Auditor: a separate agent that rebuilt the math from the
regulation **before** it was allowed to read the engine. Harness and exact
commands: `audit/README.md`.

## The short version

- **The core math is right.** A second implementation, written blind from
  12 CFR 1024.17 and Appendix E, agrees with the engine on all 30 test vectors
  and on **150,000 random accounts** (plus 3,000 extreme ones), field by field
  and row by row. Zero disagreements, zero crashes, zero broken invariants.
- **No wrong answers were found in `analyze`.** The defects below are in the
  comparison flags and the words: one false accusation at the edge of a
  tolerance, and several sentences that say a little more than the law does.
- The biggest single fix: the letter calls itself a **"Notice of error"** in
  cases where nothing is wrong (a refund that may simply be on its way, a figure
  that is "too close to call").

**Stage 3 update (same day, engine at f686075):** all 15 Stage 2 defects are
verified fixed, and the engine still matches the oracle on 100,000 fresh fuzz
cases. Re-verification found 5 new items, 2 of them wrong-answer misses: a
genuinely over-cushioned statement can come out green because of the low-point
nudge (N1), and a not-current borrower with any deficiency has no upper limit on
the payment (N2). Details in section 8.

## 1. Where the law was checked

| Source | What it confirmed |
|---|---|
| eCFR, official XML, § 1024.17 and Appendix E (text as of 2026-09-17; section last amended 2017-10-19) | 1/12 payment (c)(1)(ii); 1/6 cushion cap (c)(5); lower cushion in the loan documents wins (c)(8); the three steps (d)(2)(i)(A)–(C); lowest target balance ≤ cushion (d)(2)(ii); surplus / shortage / deficiency definitions (b); surplus of $50 **or more** refunded within 30 days of the analysis, only if the borrower is current (f)(2); shortage tiers (f)(3) — no "current" condition; deficiency tiers (f)(4), which apply only if the borrower is current (f)(4)(iii); every number in the Appendix E example ($1,560 → $130 → low −$780 in December → add $780 → cushion $260 → start $1,040). |
| CFPB interactive Regulation X, and Cornell LII | Same text and same Appendix E numbers. |
| HUD Federal Register notices on govinfo.gov: 59 FR 53890 (1994), 60 FR 8812 (1995) | Guidance, not regulation: amounts may be rounded to the nearest dollar; "deficiency first, then the remaining shortage" (page 8813, running onto 8814); a projected dip is not a deficiency. |
| eCFR §§ 1024.35 and 1024.36 (Stage 2) | Notice of error: written, names the borrower, identifies the loan, states the error believed to have occurred (a); servicer may set an exclusive address (c); acknowledge within 5 business days (d); respond within 30 business days (e)(3)(i)(C), plus 15 if it says so in writing with reasons before the 30 run out (e)(3)(ii); no fee (h). Information request: 5 / 30 (+15) business days, no fee. |
| CFPB Mortgage Servicing FAQs, escrow shortages #4 (last updated June 2, 2021) | The "repayment options are exclusive / no lump-sum option on the annual statement for a shortage of one month or more" wording quoted in research doc 01 §6 is there, word for word. |

Not verified: HUD's example statements (Appendix I-8, Appendix M, used by TV03
and TV04) exist only as scanned images. Their arithmetic is self-consistent.

## 2. Stage 1 findings (all adopted as SPEC Part E)

1. **The identity "low point − cushion = difference" is not always true.** With
   the payment rounded to the cent, 12 payments can be up to 6 cents more than
   the year's bills. If no bill outruns the deposits before month 12, every
   Step 1 balance is positive, the Step 2 add is floored at $0, and the identity
   is off by that lowest balance (1–6 cents). About 4.5% of plain random
   accounts. Fix the test, keep the floor. Pinned by TV25.
2. **Deficiency + borrower not current** had no classification. (f)(4)(iii)
   hands repayment to the mortgage documents. Now
   `DEFICIENCY_BORROWER_NOT_CURRENT` (TV22, TV23). Shortage rules do not change
   (TV24).
3. **Rounding can flip a verdict at a legal line.** Cent rounding moves the
   required balance by −6 to +5 cents against exact arithmetic, and a servicer
   rounding to whole dollars can lawfully be about $7 away. Example: bills of
   $3,000.05 and $1,800, balance $1,450.04 → $49.99 by the cents, $50.0067
   exactly. Now `nearLine` (TV26–TV29).
4. The deficiency/shortage split is **HUD guidance**, not regulation text. The
   pin cite is 60 FR 8812, 8813–14.
5. **Negative zero.** `-min` of 0 is −0 in JavaScript. Caught by the harness in
   the auditor's own mock engine first.

The research notes were otherwise accurate: 61 quotes checked word for word
against eCFR, and every paragraph cite checked.

## 3. Stage 2 — fuzzing the real engine

| Run | Cases | Threw | Disagree with oracle | Invariant failures | Soft diffs (cite / options text) | nearLine convention diffs |
|---|---:|---:|---:|---:|---:|---:|
| Mixed families, seeds 20260919, 1, 7, 424242, 987654321 × 20,000 | 100,000 | 0 | 0 | 0 | 0 | 0 |
| One family each × 5,000 (seed 31337): b50, bTier, bDef, tie, sameMonth, late, onTarget, near, bothNear, uniform | 50,000 | 0 | 0 | 0 | 0 | 0 |
| Extreme amounts: up to 100 bills of $10,000,000, balances ±$10,000,000 | 3,000 | 0 | 0 | — | 0 | — |
| Test vectors, engine vs vectors and oracle vs vectors | 30 + 30 | — | 0 | — | 0 | — |

Every case is five engine calls: the account, the same account with a random
amount added to the balance (difference must move by exactly that), shuffled
bills (nothing but the `inputs` echo may change), a repeat call (same output),
and a call that checks the input was not modified.

Invariants checked on every result: whole cents only; no −0; 12 rows; each
row's deposit is the base payment; each row's bills are that month's bills; the
three balance columns add up from $0 / required start / real balance; the last
Step 1 row is 12P − D; |12P − D| ≤ 6; cushion never above the legal cap and
exactly the rounded-down cap; add ≥ 0; required = add + cushion; lowest target
balance (opening row included) equals the cushion; low point is the earliest
lowest month; the E1 form of the identity; surplus − shortage − deficiency =
difference; deficiency only from a real negative balance; classification,
spreads and `nearLine` agree with the engine's own numbers.

The fuzzer itself was proved first: it passes two correct engines and fails all
12 planted bugs (`node prove-harness.mjs`).

## 4. Stage 2 — code review of `engine/*.js`

Came back clean:

- **Float leaks:** the only two `/` operators in the engine are inside
  `divideRoundDown` / `divideRoundHalfUp`, and both divide an exact multiple.
  No `Math.round`, `toFixed`, `parseFloat`, `parseInt`. The half-up helper
  refuses negative numbers, and no caller passes one.
- **`parseDollars`:** reads characters, never converts through a decimal.
  Rejects `1e5`, `0x10`, `1,23`, `1234,50`, `12.345`, `1.2.3`, `--5`, `$$5`,
  `+5`, `5-`, `(200`, `(-200)`, Arabic and full-width digits, en/em dashes,
  over-limit amounts, non-strings. Accepts `" 12 "`, `12.`, `.5`, `-0` (as 0,
  not −0), `−200` (Unicode minus), `$-5`, `-$5`, `(200)`, `($200.00)`,
  `1,234,567.89`. Error text never echoes the input. 20,000 random amounts
  survive `formatCents` → `parseDollars` unchanged. `formatCents(-0)` is `$0.00`.
- **Months:** all 144 (start month, month) pairs convert and round-trip; table
  rows and echoed bills carry the right calendar month for every start month.
- **Tie-breaking:** strict `<`, earliest month wins; 5,000 tie-family cases clean.
- **Negative zero:** none, including a starting balance of −0 (which
  `JSON.parse("-0")` can produce from a loaded file).
- **Mutation / purity:** every public function runs on deep-frozen inputs and
  deep-frozen results; results share no objects with the caller; no `Date`,
  `Math.random`, globals, I/O or module-level mutable state anywhere in
  `engine/`. `dates.js` is a hand-made calendar and matches JavaScript's UTC
  calendar on all 401,767 dates from 1900 to 2999.
- **Validation:** 152 single-field corruptions (month 0 / 13 / 1.5 / NaN /
  Infinity / strings / null / objects, amounts ≤ 0, over $10,000,000, 2^53,
  1e21, empty list, non-object rows…): every bad value is rejected by
  `validateAccount` **and** makes `analyze` throw; 101 bills refused, 100
  accepted; duplicate labels in one month are added, not overwritten.

## 5. Defects found in Stage 2

Severity: **wrong-answer** (a number or flag is wrong) · **misleading-text** ·
**cosmetic**. None affects `analyze`.

1. **wrong-answer (rare) — a lawful whole-dollar statement gets
   `PAYMENT_ABOVE_MAX`.** The $1.00 payment tolerance assumes the payment is one
   rounded figure. It is a sum of two or three (base + shortage ÷ 12 +
   deficiency ÷ 2), each rounded separately, and the shortage itself can drift
   $7. Worst case ≈ $1.58 (≈ $2.08 with a deficiency). Seen in 3 of 20,000
   simulated whole-dollar statements.
   *Repro:* one bill of $4,806.00 in month 12, balance $495.50, cushion 2.
   Engine: payment $400.50, shortage $305.50, maximum $425.96. A servicer
   rounding each figure to the dollar prints cushion $801, shortage $306, new
   payment $401 + $26 = **$427** → flagged "$1.04 a month more", and the letter
   becomes a notice of error.
   *Fix:* allow $1.00 per rounded part of the maximum (100 / 200 / 300 cents),
   or treat a gap up to about $2–3 as "could be whole-dollar rounding" instead
   of `over-limit`.
2. **misleading-text — the letter is a "Notice of error under § 1024.35"
   whenever it has any question at all.** That includes: every
   `SURPLUS_REFUND_REQUIRED` account even when the statement **matches** and the
   30 days may not have run (built-in example "holding-too-much"; TV01, TV03,
   TV13, TV16, TV17, TV25, TV29); every `nearLine` "too close to call" case
   (TV06, TV07, TV10, TV10b, TV26, TV27, TV28); `LUMP_SUM_OFFERED` alone (SPEC D6
   says it is a question, never a finding); and "your payment is lower than
   expected" alone (the text itself says lower is allowed). § 1024.35(a) is for
   a notice that asserts an error.
   *Fix:* notice of error only when a flag asserts a discrepancy
   (`CUSHION_OVER_CAP`, `PAYMENT_ABOVE_MAX`, `KIND_DIFFERS`, `AMOUNT_DIFFERS` on
   the claimed amount, `SPREAD_TOO_SHORT`); otherwise a § 1024.36 information
   request that carries the same questions. When it is a notice of error, add one
   plain sentence such as "I believe the statement contains the error(s)
   described below", because (a) asks for "the error the borrower believes has
   occurred".
3. **misleading-text — `explainJump` contradicts `compareWithStatement` for a
   borrower who is not current and has a deficiency.** compare.js (correctly)
   says the rule does not limit how that deficiency is collected; explainJump
   labels the same dollars "more than the federal math supports … worth asking
   your servicer what it covers."
   *Repro:* TV23's account, old payment $300, new payment $550 → compare row
   "match", explainJump "unexplained $100.00".
   *Fix:* when the borrower is not current and there is a deficiency, label the
   remainder as deficiency repayment "set by your mortgage documents, not by
   this rule" ((f)(4)(iii)).
4. **misleading-text — Step 2 of the show-the-math panel:** "The most a servicer
   may collect each month is one-twelfth of the year's bills." (c)(1)(ii) also
   allows shortage and deficiency repayment on top, and the page's own "lawful
   payment" is higher. *Fix:* "The regular monthly payment is one-twelfth of the
   year's bills. Repaying a shortage or deficiency can be added on top."
5. **misleading-text — `KIND_DIFFERS` sentence for a claimed "deficiency":** "a
   shortage has to be spread over at least 12 months." A small shortage may be
   asked for within 30 days, and the servicer may do nothing ((f)(3)(i)). Also
   worth a caveat: if the balance really was below $0 on the day of the
   analysis, the statement can correctly call that part a deficiency even
   though the projected starting balance typed here is positive.
6. **misleading-text — "a servicer may lawfully round to whole dollars"** (the
   too-close-to-call sentence) states HUD's 1995 guidance as settled law. Same
   spirit as SPEC E4. *Fix:* "HUD's 1995 guidance says dollar amounts may be
   rounded to the nearest dollar (60 FR 8812), so …".
7. **misleading-text (minor) — the chart sentence "Held above the legal
   cushion: $300.00"** appears even when that $300 is the surplus the statement
   itself shows as refundable (example "holding-too-much"). After the refund the
   line sits on the cushion. *Fix:* add "before any surplus refund".
8. **misleading-text (minor) — the § 1024.36 next step** gives "30 business days
   to answer" without the 15-day extension in (d)(2)(ii); the § 1024.35 step
   includes it. Both state the clocks as unconditional; the rules have
   exceptions (early correction; duplicative, overbroad or untimely notices —
   more than a year after a servicing transfer or payoff). "Generally" is
   enough.
9. **cosmetic — "When the math checks out, the cost is the bills"** is shown
   when no statement numbers were entered, so nothing has been checked. Show it
   only when `comparison.overall === "matches"`.
10. **cosmetic — "Most payment jumps are lawful."** is an unsourced factual
    claim. "Many" is safer, or cite a source.
11. **cosmetic — "That date is printed on your statement."** § 1024.17(i)(1)
    does not require an analysis date on the statement. "Usually".
12. **cosmetic / latent — `paymentJumpDecomposition`** (only reachable through
    `priorYear`, which today only TV18 and the self-check use): its two parts do
    not add up to new − old whenever last year's payment carried its own
    shortage add-on (10,134 of 20,000 simulated), and its "new payment" leaves
    out deficiency repayment. The homeowner-facing `explainJump` is exact in all
    20,000 cases (9,822 negative jumps, 3,984 deficiency accounts). Add a
    remainder part before exposing `priorYear` in the form.
13. **cosmetic — `explainJump` label "Your bills changed"** is base payment
    minus the OLD PAYMENT. If the old payment included a shortage add-on it can
    show a negative number although bills rose. The sentence under it is
    accurate; the label is not.
14. **cosmetic — `compareWithStatement` and `explainJump` throw** on absurd
    unvalidated numbers (2^53, 1e20). Unreachable from the page, which runs
    `validateStatement` first. `isGivenCents` could also cap at `MAX_MONEY_CENTS`.
15. **cosmetic — 888-995-HOPE** was not found in the text of the linked CFPB
    counselor page when fetched (the page and all seven other links return 200;
    855-411-2372 is confirmed). Worth a manual check.

## 6. What `compareWithStatement` got right

Simulated servicers, 20,000 statements each (`stage2-compare-checks.mjs`):

- **Lawful to the cent — 0 accused.** Smaller cushions than the cap, 12–60
  month shortage spreads, 30-day requests for small amounts, deficiency plans of
  2–12 months, loan-document recovery when the borrower is not current, under-$50
  credits, surplus retained when not current, and every way a statement might
  word a deficiency + shortage (either part, or the total).
- **Unlawful — all caught:** cushion over the cap by more than $7.00; payment
  over the maximum by more than $1.00 (borrower current or not, when there is
  no deficiency); large shortage spread over 1–11 months; small shortage spread
  over 2–11 months; lump-sum option printed for a large shortage; claimed
  shortage inflated by more than $7.00; a projected dip labelled "deficiency";
  "shortage" or "none" claimed when the math finds a surplus.
- **Tolerance edges behave as written:** exactly $7.00 over on the cushion or
  the claimed amount → no flag, $7.01 → flag; exactly $1.00 over on the payment
  → no flag, $1.01 → flag; a 1-month (30-day) request for a small shortage → no
  flag; not current + deficiency → never `PAYMENT_ABOVE_MAX`.

## 7. Notice-of-error facts in the page text, checked against § 1024.35

| Page says | Regulation | Verdict |
|---|---|---|
| Send it to the address the servicer lists for error notices, often not the payment address | (c): the servicer **may** designate an exclusive address and must then be used | Right |
| 5 business days to acknowledge | (d): five days excluding holidays, Saturdays, Sundays | Right |
| 30 business days to fix it or explain in writing why it found no error | (e)(1), (e)(3)(i)(C) | Right |
| 15 more business days if it tells you in writing first | (e)(3)(ii): before the 30 days end, in writing, with reasons | Right (leaves out "with reasons") |
| Information request: 5 and 30 business days, no fee | § 1024.36(c), (d)(2)(i)(B), (g)(1) | Right, but omits the 15-day extension in (d)(2)(ii) |
| What the letter contains | (a): borrower's name, loan identification, the error believed to have occurred | Name, loan number and property are there. It never says in words that it believes there is an error (see defect 2). |
| Whether an escrow-analysis dispute is a covered "error" | Not listed by name; (b)(11) "any other error relating to the servicing" | The page says "can send", which is the honest wording. |

## 8. Stage 3 — re-verification (2026-09-19, engine at commit f686075)

Every fix was checked against the running code and the text it generates, not
against commit messages. Script: `audit/stage3-reverify.mjs` (35 checks pass).

### The 15 defects and B2

| # | Defect | Status | Evidence |
|---|---|---|---|
| A1 | Whole-dollar statement flagged `PAYMENT_ABOVE_MAX` | **Fixed** | Tolerance is now $1.00 per separately rounded part ($1 / $2 / $3). The $4,806.00 repro is no longer flagged and its letter is a request for information. Edges hold for every part count: max + $1.00 / $2.00 / $3.00 passes, one cent more is flagged. 20,000 simulated whole-dollar servicers, now including zero-ish shortages and deficiencies: **0 accused** (the same simulation accuses 79 of 8,000 on the pre-fix engine). Largest lawful overshoot seen: 50¢ / $1.06 / $1.68 for 1 / 2 / 3 parts; the theoretical worst is about $0.50 / $1.63 / $2.38, so the new tolerances cannot be tightened much. **Cost:** a payment that really is over the maximum by up to $2.00 a month (shortage) or $3.00 a month (deficiency + shortage) now passes: at most **$24 / $36 a year**, up from $12. That money stays in the escrow account and comes back as a surplus at the next analysis. |
| A2 | Letter called "Notice of error" for mere questions | **Fixed** | One rule, `letterKind`. 44 letters generated (30 vectors, 3 examples, each flag alone, the nudge alone, refund-due-but-matching, too-close-but-matching, a mix): the "Notice of error" title, the sentence "I believe the statement contains the error(s) described below", and the notice-of-error next step appear exactly when a discrepancy flag fires (7 notices, 37 requests). `LUMP_SUM_OFFERED`, "payment lower than expected", the nudge, a refund on a matching statement and every too-close case are requests for information. |
| A3 | `explainJump` blamed deficiency collection when the borrower is not current | **Fixed**, but see new defect N2 | TV23, $300 → $550: the $100 is "deficiency repayment set by your mortgage documents, not by this rule (12 CFR 1024.17(f)(4)(iii))", unexplained $0, compare row "match". 20,000 not-current deficiency accounts: never "more than the federal math supports"; parts still sum exactly. |
| A4 | Step 2 "the most a servicer may collect" | **Fixed** | "The regular monthly payment is one-twelfth of the year's bills. Repaying a shortage or deficiency can be added on top." |
| A5 | "a shortage has to be spread over at least 12 months" | **Fixed** | Tier-correct choices ((f)(3)(i) three, (f)(3)(ii) two), plus the caution that a balance really below $0 on the analysis date can correctly be called a deficiency. |
| A6 | "may lawfully round" stated as law | **Fixed** | "HUD's 1995 guidance says dollar amounts may be rounded to the nearest dollar (60 FR 8812)". The old phrase is gone from all generated text and from engine code. |
| A7 | "Held above the legal cushion" on a refundable surplus | **Fixed** | "…before any surplus refund" when there is a surplus; unchanged when there is none. |
| A8 | § 1024.36 step missed the 15-day extension; clocks stated as unconditional | **Fixed** | Both steps say "generally"; § 1024.35 adds "with reasons"; § 1024.36 now carries the 15 business days. |
| A9 | "When the math checks out" with nothing compared | **Fixed** | Shown only when `overall === "matches"`. |
| A10 | "Most payment jumps are lawful" | **Fixed** | "Many". |
| A11 | "That date is printed on your statement" | **Fixed** | "usually printed". |
| A12 | `paymentJumpDecomposition` parts did not sum | **Fixed** | Four parts (bills, shortage repayment, deficiency repayment, last year's add-on dropping off) sum to exactly new − old on 20,000 random `priorYear` blocks (10,069 with an add-on in last year's payment, 4,221 negative jumps, 3,336 deficiency accounts, 458 of them not current). "New" is now the payment while a deficiency is being repaid. TV18's pinned values are unchanged. |
| A13 | Label "Your bills changed" | **Fixed** | "Bills now versus your old payment". |
| A14 | Threw on absurd unvalidated numbers | **Fixed** | 45 absurd values in every statement field: nothing throws, none is treated as a real number. |
| A15 | 888-995-HOPE not on the linked page | **Fixed** | The counselor step carries its link and no phone; 855-411-2372 (printed on the CFPB page) stays. |
| B2 | Low-point mix-up nudge (director's rule) | **Works as written — and opens a real miss, see N1** | An over-the-cap minimum that equals the federal low point (within $7) draws one nudge and a "not-compared" row, never `CUSHION_OVER_CAP`; the nudge alone leaves `overall` at "not-provided". |

### B2, quantified

Simulated servicers that **really** hold a cushion over the cap (by $7.01 to
about a month's payment), 20,000 each:

| Where the balance sits | `CUSHION_OVER_CAP` hidden behind the nudge |
|---|---:|
| On the servicer's own target, within $7 (the normal state of an account whose bills came in as projected) | **100.0%** (19,996 of 20,000) |
| Within $100 of the servicer's target | 7.1% |
| Anywhere within $3,000 | 0.2% |

Why: a servicer that targets a cushion of X sets things up so the lowest month
lands on X. If last year went to plan, the federal low point **is** X. So for a
servicer that over-cushions as a habit, the mix-up rule fires almost every time.

When the flag is hidden, does something else catch it?

| The homeowner also typed | Caught by another discrepancy flag | Banner |
|---|---:|---|
| the claimed shortage / surplus / "none" | **100%** (`KIND_DIFFERS` or `AMOUNT_DIFFERS`) | amber |
| only the new payment | **0%** (`PAYMENT_ABOVE_MAX` never fires: the oversized cushion is already funded, so the payment is just bills ÷ 12) | **green "Matches"** for every not-current borrower (19,997 of 19,997) and for current borrowers when the excess is under about $43 (5,638 of 19,996); amber for the rest, but only because of the refund banner |
| nothing else | 0% | neutral (teal) |

### New defects found in Stage 3

**N1 — wrong-answer (miss): a genuinely over-cushioned statement comes out
fully green.** Caused by B2 plus "a matching payment row makes `overall`
matches".
*Repro:* bills $3,600 in June and $3,600 in December, balance $1,800.00, a
payment was more than 30 days late. Statement: required minimum $1,800.00 (the
cap is $1,200.00), new payment $600.00. Engine: cushion row "not-compared",
no flags, one nudge, `overall` "matches", banner green "Matches: Your
statement's math matches the federal method." The cushion is $600 over the
legal limit.
*Fix:* (1) while a nudge is open and no flag has fired, `overall` must not be
"matches" — use a neutral "one number to double-check" state, never green.
(2) If the claimed amount was typed and it disagrees with the federal figure by
about (typed minimum − cap), that is evidence the typed number IS the real
minimum: raise `CUSHION_OVER_CAP` and keep the "the cushion is the likely
reason" sentence.

**N2 — wrong-answer (miss): borrower not current + any deficiency = no upper
limit on the payment.** Pre-existing; missed in Stage 2.
*Repro:* one bill of $3,600 in June, balance −$10.00, a payment was 30+ days
late. Federal: base $300.00, shortage $2,400.00 (÷ 12 = $200.00), deficiency
$10.00. A new payment of $1,000.00 — or $5,000.00 — is a "match", `overall`
"matches", banner green, and `explainJump` calls $500.00 a month "deficiency
repayment set by your mortgage documents" for a $10.00 deficiency.
(f)(4)(iii) hands the **schedule** to the mortgage documents; it does not make
the amount unlimited. The most that can be deficiency recovery in any month is
the whole deficiency.
*Fix:* when not current, the ceiling is base + shortage ÷ 12 + the **whole**
deficiency (plus tolerance). Above that: `PAYMENT_ABOVE_MAX`, and in
`explainJump` the excess is "not explained".

**N3 — misleading-text: "Your statement matches the federal math. It shows a
surplus of $300.00, which the rule says is refunded within 30 days."** appears
whenever the compared rows match and the federal math finds a refundable
surplus — even when the homeowner typed only the payment and no surplus at all.
*Repro:* TV01's account with `{ newMonthlyEscrowCents: 40000 }`.
*Fix:* say "It shows" only when the claimed row is a surplus and matches;
otherwise "The numbers you typed match. The federal math also finds a surplus
of $300.00 …".

**N4 — cosmetic:** in a notice of error that also carries a pure question
(lump sum, refund timing, too close to call), every numbered item sits under
"I believe the statement contains the error(s) described below". Put questions
under their own "I also have a question" heading.

**N5 — cosmetic:** with no statement numbers typed, the letter still says "My
numbers line up with the statement." Nothing was compared. Say "For my
records, please send me…" only.

### Re-run, exact counts (engine at f686075)

| Run | Result |
|---|---|
| `check-vectors.mjs` | 30 of 30 vs the oracle; 30 of 30 vs the engine |
| `prove-harness.mjs --n 5000` | 2 correct engines pass; 12 of 12 planted bugs caught; 4 of 4 `nearLine` convention variants named (exit 3) |
| `fuzz.mjs`, seeds 20260919, 1, 7, 424242, 987654321 × 20,000 | **100,000 cases: 0 threw, 0 disagree with the oracle, 0 invariant failures, 0 soft diffs, 0 convention diffs** |
| `stage2-code-checks.mjs` | all pass (152 corruptions rejected; 3,000 extreme accounts equal the oracle) |
| `stage2-compare-checks.mjs --n 20000` (updated to A1 / A3 / A12 / B2) | all hard checks pass; lawful-to-the-cent servicers 0 of 20,000 accused; whole-dollar servicers 0 of 20,000 accused; every unlawful family caught. Run against the **pre-fix** engine (0677461^) the same script fails 7 hard checks, so it still catches regressions. |
| `stage3-reverify.mjs --n 20000` | 35 of 35 fix checks pass; 5 new findings above |

The project's own suite shows 575 of 577 passing; the two failures
("banned-text pattern is proven", "sw.js CACHE_NAME is up to date") belong to
uncommitted service-worker / page work in progress, not to `engine/` or
`audit/`.
