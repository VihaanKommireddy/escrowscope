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

**Stage 4 update (same day, engine at bb43bf9):** N1 to N5 are verified fixed.
Two new items were found. **N6 is a miss and is open:** an over-the-cap cushion
of any size still comes out green if the homeowner picks "deficiency" and types
$0.00 to $7.00. N7 is a false accusation from the same typing mix-up on the
other side of the cap. Details in section 9.

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

> **Superseded (Stage 4).** The numbers in this subsection describe the old
> nudge-only rule at f686075. Fix order 3 (fa578c0) replaced it with the
> three-case rule, and the same simulation now gives 0 green. Current numbers
> are in section 9. This table is kept only as the record of why the rule changed.

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

## 9. Stage 4: fix order 3 re-verified (2026-09-19, engine at bb43bf9)

A second auditor finished the audit after the first was cut off. Everything
here was checked by running the engine and reading what it generates. New
script: `audit/stage4-measure.mjs`. "Green" below means `overall` is "matches"
and there is no flag at all. "Hard accusation" means `CUSHION_OVER_CAP`, or a
letter of kind "NOTICE_OF_ERROR".

### Most important: N6, an unlawful statement that still comes out green (OPEN)

**N6 (wrong-answer, miss, open).** Case (a) of the new N1 rule accepts any
matching claim as proof that the statement agrees with the federal math. A
**deficiency** claim proves nothing about the cushion. When the N1 trigger is
met the balance is always above $0, so the federal deficiency is always $0.00,
and a claimed deficiency of $0.00 to $7.00 always "matches".

*Minimal repro:* the Stage 3 account (bills $3,600 in June and $3,600 in
December, balance $1,800.00, a payment was more than 30 days late; the cap is
$1,200.00). Statement: required minimum $1,800.00, new payment $600.00, claimed
kind "deficiency", amount $0.00. Engine: cushion row "not-compared", claimed
row "match", payment row "match", no flags, one nudge, `overall` "matches",
banner green "Matches: Your statement's math matches the federal method." The
cushion is $600.00 over the legal limit. The claimed row's note reads "The
federal math finds a surplus of $600.00. That matches your statement."

*How often:* in the steady-state simulation of part (i) below, typing the
minimum, the payment and "deficiency $0.00" turned **77,842 of 80,000**
genuinely over-the-cap statements green (the other 2,158 drew a flag for a
different reason, mostly `PAYMENT_ABOVE_MAX` on a whole-dollar payment). The
largest was $4,090.77 over the cap. There is no upper bound.

*How likely:* the page offers "A deficiency (balance below zero)" with an
amount box, and `validateStatement` accepts $0.00 with no warning. A homeowner
whose statement prints "Deficiency: $0.00" can do this. It is not the common
path, but it is reachable, silent and unbounded.

*Fix:* in `decideCushionCase`, case (a) and case (b) should only listen to a
claim about the surplus / shortage / "none". A "deficiency" claim while the
federal deficiency is $0.00 goes to case (c). Same root, no cushion typed at
all: "deficiency $0.00" by itself is a "match" that turns the page green, and
its note says a $200.00 shortage "matches your statement" (balance $1,000.00
on the same bills). That row should not make `overall` "matches", and the note
should say the federal math finds no deficiency and does find a shortage. This
second part is older than fix order 3 (it behaves the same at fa578c0^).

### N1 to N5

| # | Status | Evidence |
|---|---|---|
| N1 | **Fixed for surplus / shortage / "none" claims. Still open through N6.** | The three cases behave as ruled. TV01 (cap $800.00, low point $1,100.00): minimum alone, or with a matching payment, gives `CUSHION_MAYBE_OVER_CAP`, row "differs", `overall` "look-here", a request for information whose line only asks the servicer to confirm the number. Minimum plus a matching surplus of $300.00 gives one `MINIMUM_LOOKS_LIKE_LOW_POINT` nudge, row "not-compared", no flag. Minimum plus "none" gives `CUSHION_OVER_CAP` and `KIND_DIFFERS` with "the cushion is the likely reason", a notice of error. The Stage 3 repro ($600 over, payment typed) is now amber for a current and a not-current borrower. |
| N2 | **Fixed** | Ceiling worked out from the oracle, not the engine: bills ÷ 12 + shortage ÷ 12 + the whole deficiency, $1.00 per rounded part. On 20,000 not-current deficiency accounts: exactly ceiling + tolerance is a match and green, one cent more is `PAYMENT_ABOVE_MAX` and amber, every time. The same 20,000 accounts with the borrower current keep the old ceiling (deficiency ÷ 2). The $10.00 repro: $510.00 to $513.00 passes, $513.01, $1,000.00 and $5,000.00 are flagged with "at least $490.00 a month more" and no yearly figure. `explainJump` gives the deficiency part the whole $10.00 and calls the other $490.00 "more than the federal math supports"; on 20,000 cases its parts add up to exactly new − old and the deficiency part never exceeds the deficiency (it did in 15,011 of 20,000 before the fix). TV23 at $300 to $550 is still a match: $150 shortage repayment, $100 deficiency repayment, $0 unexplained. |
| N3 | **Fixed** | TV01 with only the payment typed: "The numbers you typed match the federal math. The federal math also finds a surplus of $300.00…". With the surplus typed and matching: "Your statement matches the federal math. It shows a surplus of $300.00…". On 20,000 random statements "It shows a surplus" was said 1,179 times, each time with a surplus typed and matching within $7.00, and never otherwise. |
| N4 | **Fixed** | Notice of error plus a lump-sum question: the payment error is item 1 under "I believe the statement contains the error(s) described below.", the question is item 1 under "I also have these questions:", and the closing adds "Please also answer the question above." Across every notice generated in the run, only discrepancy flags sit under "I believe…". No request for information uses either heading. |
| N5 | **Fixed** | Nothing typed: the letter says only "For my records, please send me the escrow analysis worksheet…". "My numbers line up with the statement." appears only when `overall` is "matches" and there is nothing to ask. |

A4 is intact after the wording sweep: Step 2 reads "The regular escrow payment
each month is one-twelfth of the year's bills. Repaying a shortage or
deficiency can be added on top." No step calls one-twelfth a maximum.

### The three measurements (20,000 simulated statements each)

**(i) Servicers that really hold a cushion over the cap, account at steady
state** (balance within $7.00 of the servicer's own target; over the cap by
$7.01 to a full extra month). Green counts:

| Servicer | Minimum only | + new payment | + claim | All three |
|---|---:|---:|---:|---:|
| To the cent, borrower current | 0 of 20,000 | 0 | 0 | 0 |
| To the cent, borrower not current | 0 of 20,000 | 0 | 0 | 0 |
| Whole dollars, borrower current | 0 of 20,000 | 0 | 67 | 65 |
| Whole dollars, borrower not current | 0 of 20,000 | 0 | 67 | 64 |

Without a claim the result is `CUSHION_MAYBE_OVER_CAP` (19,996 to 20,000 of
20,000; the rest are plain `CUSHION_OVER_CAP`). With the claim the servicer
would print, it is `CUSHION_OVER_CAP`: 20,000 of 20,000 to the cent, 19,933 of
20,000 in whole dollars. The 263 green cases (of 320,000 comparisons) are all
whole-dollar servicers over the cap by **$7.01 to $7.48**: the $7.00 tolerance
plus up to 50¢ of the servicer's own rounding. The same simulation on the
pre-fix engine gives 78,105 green, the largest $4,090.77 over the cap.

**(ii) Lawful servicers, homeowner mistypes the lowest projected balance as
the required minimum.** Hard accusations:

| World | Minimum only | + new payment | + claim | All three |
|---|---:|---:|---:|---:|
| To the cent, low point over the cap | 0 of 20,000 | 0 | 0 | 0 |
| Whole dollars, low point over the cap | 0 of 19,046 | 0 | 0 | 0 |
| To the cent, low point **under** the cap (a shortage account) | 0 of 19,923 | 0 | **19,922** | **19,922** |

Over the cap the rule does what it should: amber `CUSHION_MAYBE_OVER_CAP` with
no claim, one nudge and nothing else with a claim. The third row is N7, below.

**(iii) The known overlap.** A servicer $7.01 to $14.00 over the cap, within
$7.00 of its own target, whose statement says "none": 5,058 of 20,000 (25.3%)
have a federal surplus of $7.00 or less, read as case (a), and come out green
("matches", one nudge). Both (a) and (b) are true in exactly those 5,058. The
most held over the cap in any of them is **$13.93**; the bound is $14.00. When
the servicer prints its real shortage or surplus instead of "none", the overlap
does not happen (0 of 11,602 to-the-cent cases in that band).

*Is that acceptable? Yes.* The money at stake is at most $14.00, it stays in the
escrow account, and the page already lets $7.00 over the cap pass in silence.
Putting (b) before (a) is the wrong cure: it would turn 747 of 19,046 (3.9%)
lawful whole-dollar servicers whose homeowner made the mix-up from a nudge into
a hard `CUSHION_OVER_CAP` and a notice of error, and for a "none" claim (b) is
true whenever the trigger is met, so every such mix-up would be accused. If the
director wants zero green here, the change that fits the ruling is "when both
(a) and (b) are true, answer (c)": never green, never a hard accusation. Its
whole cost is those 747 lawful statements going from green with a nudge to
amber with a question.

### N7, the same mix-up on the other side of the cap (OPEN)

**N7 (wrong-answer, false accusation, open; older than fix order 3).** N1 only
covers a mistyped low point that is over the cap. In a shortage account the low
point is under the cap. Typed as the required minimum, it is read as "the
servicer uses a smaller cushion", the shortage disappears from the federal
side, and the lawful statement's real shortage draws `KIND_DIFFERS` and a
notice of error. No nudge is offered. A shortage is the usual reason someone
opens this page.

*Minimal repro:* bills $3,600 in June and $3,600 in December, balance
$1,000.00, borrower current. A lawful statement: required minimum $1,200.00,
lowest projected balance $1,000.00, shortage $200.00 over 12 months, new
payment $616.67. Typed correctly: "matches", no flags. With $1,000.00 typed as
the required minimum: `KIND_DIFFERS` ("Your statement shows a shortage of
$200.00. … the federal math finds no shortage and no surplus … instead"),
`overall` "look-here", letter kind "NOTICE_OF_ERROR".

*Fix:* mirror N1. When the typed minimum is under the cap and within $7.00 of
the federal low point, let the claim decide: if it matches the federal math at
the full cap, it is a mix-up (nudge, compare the claim at the cap); if it
matches only with the smaller cushion, the smaller cushion is real; otherwise
keep today's behavior and add the nudge.

### Scripts

`stage2-compare-checks.mjs` and `stage3-reverify.mjs` had 4 failing checks on
the fixed engine. All 4 were confirmed to be the scripts, not the engine: three
encoded the old nudge-only rule and one was a regex pinned to the old Step 2
sentence. Both scripts now encode the three-case rule and N2 to N5 as hard
checks. They still catch regressions: against the pre-fix engine (fa578c0^ =
e750774, extracted read-only with `git archive`) stage2 fails 7 hard checks,
stage3 fails 16 and stage4 fails 2.

### Re-run, exact counts (engine at bb43bf9)

| Run | Result |
|---|---|
| `check-vectors.mjs` | 30 of 30 vs the oracle; 30 of 30 vs the engine |
| `prove-harness.mjs --n 5000` | 2 correct engines pass; 12 of 12 planted bugs caught; 4 of 4 `nearLine` convention variants named (exit 3) |
| `fuzz.mjs`, seeds 20260919, 1, 424242 × 20,000 | **60,000 cases: 0 threw, 0 disagree with the oracle, 0 invariant failures, 0 soft diffs, 0 convention diffs** |
| `stage2-code-checks.mjs` | 109 of 109 pass |
| `stage2-compare-checks.mjs --n 20000` | 70 of 70 hard checks pass; lawful to-the-cent servicers 0 of 20,000 accused; whole-dollar servicers 0 of 20,000 accused |
| `stage3-reverify.mjs --n 20000` | 52 of 52 pass |
| `stage4-measure.mjs --n 20000` | 5 of 5 expectations met; N6 and N7 print as open NOTE lines with their repros |

## 10. Director's addendum: N6 and N7 fixed (2026-09-19, after Stage 4)

This section was written by the director agent, not by an auditor. The auditors'
text above is unchanged.

Both open findings from Stage 4 were fixed in `engine/compare.js`, test first,
using the auditor's repros typed in before any engine change (6 new tests red,
then green; 3 guard tests green throughout). The director wrote the fix, so the
fix is NOT independently reviewed line by line. What stands behind it is the
auditor's own scripts, which the director did not write or edit.

- **N6.** Only a claim about the target (surplus, shortage, "none") may decide
  the cushion case. A deficiency claim falls through to case (c). A deficiency
  line of about $0 when the balance is not below $0 is now a "not-compared" row
  with an honest note, so it can never turn the page green by itself.
- **N7.** New trigger: the typed minimum is under the cap by more than $7.00 and
  within $7.00 of the federal low point. If the claim fits only the smaller
  cushion, the smaller cushion is real and nothing changes. Otherwise it is
  read as a typing mix-up: everything is compared at the full cap, the cushion
  row is "not-compared", and a nudge asks which line was typed. No flag.

Results from the auditor's scripts on the fixed engine:

| Script | Result |
|---|---|
| `stage4-measure.mjs` | ALL STAGE 4 EXPECTATIONS MET. N6: 0 of 80,000 over-the-cap statements green (was 77,842). N7: 0 of 19,923 lawful servicers accused, with a claim and with all three typed (was 19,922). |
| `stage3-reverify.mjs --n 20000` | ALL FIX CHECKS PASSED |
| `stage2-compare-checks.mjs --n 20000` | ALL HARD CHECKS PASSED |
| `stage2-code-checks.mjs` | ALL CODE CHECKS PASSED |
| `fuzz.mjs`, seeds 99 and 20260919 × 20,000 | PASS, 0 disagreements |
| `check-vectors.mjs` | 30 of 30 |
| `prove-harness.mjs` | every planted bug still caught |
| `npm test` | 646 of 646 |

Still true after the fix, measured by the auditor and accepted: 263 of 320,000
whole-dollar over-cushioners come out green, every one of them only $7.01 to
$7.48 over the cap (the $7.00 tolerance plus the servicer's own rounding), and
the $7.01 to $14.00 "none" overlap, with at most $13.93 at stake.
