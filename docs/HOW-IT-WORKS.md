# How EscrowScope v1 works

This is the walkthrough for the person who has to explain it: you.

Straight facts first. You did not type v1. AI agents did, and you directed them. That is written down in `AI-DISCLOSURE-LOG.md` and `BUILD-LOG.md`. You typed everything in `v0/`, and you worked test case #1 by hand from the regulation before any code existed. That case is still the first test vector in v1 (`TV01`).

So this doc has one job: make v1 yours the only way that counts. You can explain every part of it, and you could rebuild the engine from a blank file.

How to use it:

1. Read it once with the code open next to it.
2. Do the 10 exercises in Part 8. They are where the understanding happens.
3. Practice the 20 questions in Part 9 out loud.

Every regulation cite in here is copied from `docs/research/01-reg-math.md` or `docs/verification/math-audit.md`. The law-to-code map lives in `docs/VERIFICATION.md`. Line counts and test counts are as of 2026-09-19. Other people's edits will move them a little, so trust `wc -l` and `npm test` over this page.

Two words you need before anything else:

- **Servicer**: the company you send your mortgage payment to.
- **Escrow account**: the side account the servicer keeps for you. It collects a bit extra every month and pays your property tax and insurance bills out of it.

---

## Part 1. The 60-second map

### What happens when someone presses "Check the math"

```
  The visitor presses "Check the math"
                |
                v
  check.js      readFormValues()         every box on the form becomes a plain string
                |
                v
  pipeline.js   runCheck(values)         the only door between the page and the engine
                |
                |   1. readInputs(values)
                |   2. validateAccount(account) + validateStatement(statement, account)
                |   3. analyze(account)
                |   4. compareWithStatement(result, statement)
                |   5. explainVerdict, explainSteps, explainJump, nextSteps,
                |      explainServicerLine, buildLetter
                v
  render.js     renderResults(check)     puts the answer on the page
                |
                v
  chart.js      the balance chart and the "why did it jump" bar
```

One sentence per box:

| Step | Where | What it does |
|---|---|---|
| read the form | `check.js` `readFormValues` | Copies what is in each box into one plain object of strings, exactly as typed. No math. |
| `runCheck` | `pipeline.js` | Runs steps 1 to 5 in order and hands back one object with everything the page needs. It never throws. |
| 1. `readInputs` | `pipeline.js` | Turns dollar strings into whole cents (using the engine's `parseDollars`) and calendar months into escrow-year months. |
| 2. `validate` | `engine/validate.js` | Finds problems in plain English. Errors stop the math. Warnings are "are you sure?" and never stop it. |
| 3. `analyze` | `engine/analyze.js` | The federal math. It only looks at the account (bills, starting balance, start month). It never sees the servicer's numbers. |
| 4. `compare` | `engine/compare.js` | The one place the servicer's numbers meet the federal math. Builds the side-by-side rows and the flags. |
| 5. `explain` and the letter | `engine/explain.js`, `engine/letter.js` | Turns numbers into sentences: the verdict banner, the six "show the math" steps, the payment-jump split, next steps, the letter. |
| `renderResults` | `render.js` | Builds the results part of the page out of what came back. It writes no math sentences of its own. |

### Every file

"Pure" means: no page, no clock, no network. Give it the same input and it gives the same output, in Node or in a browser. "DOM" means it touches the page. (DOM is the browser's live tree of everything on the page. `document.getElementById` is DOM.)

**The engine (`engine/`), all pure**

| File | Lines | What it is |
|---|---:|---|
| `engine/money.js` | about 300 | Dollars-as-text to whole cents and back. The two division helpers. Month conversion. |
| `engine/validate.js` | about 300 | `validateAccount`, `validateStatement`. Plain-English errors and warnings. |
| `engine/analyze.js` | about 640 | The 12 CFR 1024.17 math. The heart of the project. |
| `engine/compare.js` | about 840 | "Your statement says" against "the federal math says". Rows, flags, nudges. |
| `engine/explain.js` | about 650 | All the plain-English sentences. |
| `engine/letter.js` | about 280 | The pre-filled letter, and the one rule for which kind of letter it is. |
| `engine/dates.js` | about 110 | The 30-day refund clock. A hand-made calendar, no `Date`. |
| `engine/selfcheck.js` | about 170 | Runs every test vector through the real engine and lists every mismatch. |
| `engine/vectors.js` | about 5,480 | GENERATED. A copy of the research test vectors as a JavaScript module. Never edited by hand. |
| `engine/index.js` | about 30 | The front door. Only re-exports. No logic. |

**The page**

| File | Lines | Pure or DOM | What it is |
|---|---:|---|---|
| `index.html` | about 210 | page | The landing page: the pitch, the framed sample result, four big figures, how it works, the three examples, links to the proof and privacy pages. Short on purpose. |
| `check.html` | about 480 | page | The tool: the form as four steps in one card, the sample statement next to it, the result as six tabs, the honest limits. |
| `proof.html` | about 120 | page | "Don't take this page's word for it": the self-check, run on the visitor's device as the page opens. |
| `privacy.html` | about 170 | page | The privacy panel, the five limits in full, how the site works, the glossary. |
| `landing.js`, `check.js`, `proof-page.js`, `privacy-page.js` | about 120, 1,070, 15, 15 | DOM | One small script per page. Each imports only what its page shows. `check.js` is the old `app.js`. |
| `site.js` | about 40 | DOM | What every page does: the narrow-screen menu's Escape key, and turning the service worker on. |
| `example-link.js` | about 25 | pure | Reads the `#example-2` on the end of `check.html`'s address. One small whole number, nothing else. |
| `tabs.js` | about 120 | DOM | The ARIA tabs pattern: one Tab stop, arrow keys, Home and End. Used for the examples, the four steps and the six result tabs. |
| `preview.js` | about 185 | DOM | The framed sample result on the landing page. Every number in it comes from the engine. |
| `pipeline.js` | about 560 | pure | The seam. Strings in, everything the results need out. Also the numbers-file save and load. |
| `examples.js` | about 120 | pure (data) | The three built-in examples, each with what the engine is expected to conclude. |
| `dom.js` | about 80 | DOM | `el()` and `svgEl()`: the only way the scripts create page elements. No HTML strings. |
| `render.js` | about 690 | DOM | Draws the results. |
| `chart.js` | about 1,310 | DOM | The balance chart (SVG) plus the same data as a real table, and the jump bar. |
| `guide.js` | about 780 | DOM | The "Where do I find this?" sample statement. |
| `proof.js` | about 490 | DOM | The privacy panel on `privacy.html`: the request counter and the honest notes around it. It also hands the same count, as one number, to the slim status line on the other pages. |
| `selfcheck-ui.js` | about 880 | DOM | The self-check on `proof.html`: runs all the vectors in the visitor's browser and shows every number. |
| `sw-register.js` | about 130 | browser | Turns the service worker on (or off with `?nosw`). |
| `sw.js` | about 180 | service worker | Keeps an offline copy of the site's own files. |
| `styles.css`, `site.css`, `chart.css`, `guide.css`, `selfcheck.css` | about 5,400 together | styling | No inline styles anywhere, because the CSP forbids them. |
| `manifest.webmanifest` | about 20 | data | Name, colors, icon for the installed-page case. |

**Tools, tests, records**

| File | What it is |
|---|---|
| `serve.mjs` | A tiny local preview server. Node only. `npm run serve`. |
| `tools/make-vectors.mjs` | Copies `docs/research/01-test-vectors.json` into `engine/vectors.js`. |
| `tools/stamp-sw.mjs` | Writes the hash-based cache name into `sw.js`. |
| `tests/*.test.js` | 17 test files. See Part 6. |
| `audit/` | The independent auditor's second implementation and fuzzer. See Part 6. |
| `docs/research/` | The regulation notes and the 30 test vectors. The source of truth for the law and the expected numbers. |
| `docs/verification/` | The two independent audit reports. |
| `v0/` | Your hand-typed v0.1 to v0.3. Read-only. |

---

## Part 2. The one idea that holds it together

Three choices hold the whole project up. Each one exists because of a real bug on record.

### Choice 1. The engine is pure

Same input, same output. No page, no clock, no network, no hidden state. The page imports the engine. The engine never imports the page.

Why it matters:

- The math can be tested in Node with no browser. That is how 30 vectors, thousands of random accounts and an outside auditor's fuzzer can all run in a few seconds.
- The button on the page that says "don't take this page's word for it" calls the very same `runSelfCheck` function that `npm test` calls. One check, two places.
- Someone checking the tool's honesty has exactly one folder to read.

How it is enforced: `tests/purity.test.js` reads the engine's source text and fails if it finds `document`, `window`, `fetch`, `Date`, `Math.random` and friends in real code (it blanks out comments and strings first, so "mortgage documents" is not a false alarm). Even the refund date math in `engine/dates.js` is a hand-made calendar, because JavaScript's `Date` drags in time zones, and a time zone can shift a date by a day.

### Choice 2. Money is whole cents

Inside the engine, $1,234.50 is the integer `123450`. Never `1234.5`.

The bug this prevents is on record from the July review of your live v0 page: it could print a figure like `$297.8666666666679`, and the `surplus === 0` branch in `check.js` could never fire. The cause is that computers store most decimals inexactly. You can see it yourself with your own `v0/engine.js`. Change the insurance bill in test case #1 to $1,212.80 and you get:

```
cushionCap  802.1333333333333
lowPoint    1087.1999999999998
surplus     285.0666666666665
```

(The command for this is in Exercise 3.) The research notes list the same problem as v0 issue #6: `total / 6` gives `833.3333…` for $5,000 of bills.

With whole cents, every add, subtract and compare is exact. The only place a fraction could sneak in is division, so every division of money in the whole engine goes through two helpers in `money.js`, and a test fails if the `/` operator shows up anywhere else.

A cousin of this bug is **negative zero**. JavaScript has two zeros, `0` and `-0`. They are equal with `===`, but flipping the sign of `0` gives `-0`:

```
node -e 'const low = 0; const add = -low; console.log(add, Object.is(add, 0), add === 0);'
-0 false true
```

`-0` fails Node's strict test comparisons and can print as "−$0.00". The engine computes the Step 2 add as "minus the lowest balance", so an account whose lowest trial balance is exactly $0 would have produced `-0`. The independent auditor hit this first in its own mock engine. The fix is `noNegativeZero()` in `money.js`, used everywhere a sign gets flipped, plus a test that walks every number the engine can output.

### Choice 3. The deposit is computed, never typed in

This is the big correction from v0. Your v0 engine took `monthlyDeposit` as an input and projected the year with it. That matches the law only when the number typed is exactly bills ÷ 12. The regulation defines the deposit used in the projection, in (d)(2)(i)(A): the servicer "assumes that the borrower will make monthly payments equal to one-twelfth of the estimated total annual escrow account disbursements".

The real numbers, from test vector TV18 (bills rose from $4,800 to $5,700, starting balance $1,125, true shortage $300):

| What gets typed as "monthly deposit" | v0 says | Truth |
|---|---:|---:|
| last year's payment, $400 | **−$1,125** | −$300 |
| the new payment from the statement, $500 (it already includes a $25 shortage add-on) | **−$25** | −$300 |
| nothing typed; the engine computes $475 itself | −$300 | −$300 |

The first mistake overstates the shortage by $825 (11 months × $75 of drift). The second could hide real over-collection. So in v1 the engine computes the deposit, and anything from the servicer's statement is only ever compared against the math, in `compare.js`.

### One more: check before you compute

Also from the July review of v0: a bill with `month: 13` raised the total and the cushion cap but was never subtracted from any month, because the loop only runs 1 to 12. Test case #1 plus a $600 bill in "month 13" gives total $5,400, cap $900, low point still $1,100, surplus $200. A wrong answer with no warning.

In v1, `analyze` calls `validateAccount` first and refuses to run:

```
The math cannot run yet: Pick the month this bill gets paid.
```

### And the page only reads and draws

The page side never does math and never writes its own math sentences. Anything a person types reaches the page only as plain text (`textContent` or `.value`), never as HTML. Part 5 covers how.

---

## Part 3. `engine/analyze.js`, slowly

This is the file to know cold. We walk it in the order `analyze(account)` runs, using your test case #1 the whole way:

- Bills: property tax $1,800 in May, homeowners insurance $1,200 in July, property tax $1,800 in November
- Starting balance: $1,500
- Escrow year starts in January, cushion 2 months, borrower current

### The method in one paragraph

Add up next year's bills. Divide by 12 to get the monthly payment. One-sixth of the bills is the most cushion allowed. Pretend the account starts at $0 and run 12 months (Step 1). Find the worst month. Lift every month by just enough that the worst month sits at $0 (Step 2). Lift every month again by the cushion (Step 3). The first number in that last column is the most the servicer may hold at the start of the year. Compare the real starting balance with it.

### The whole thing as a table (real engine output)

| Month | Deposit | Bills paid | Step 1: trial balance from $0 | Target balance (Step 3) | Projected balance from your $1,500 |
|---|---:|---:|---:|---:|---:|
| start | | | $0 | **$1,200** | $1,500 |
| Jan | $400 | $0 | $400 | $1,600 | $1,900 |
| Feb | $400 | $0 | $800 | $2,000 | $2,300 |
| Mar | $400 | $0 | $1,200 | $2,400 | $2,700 |
| Apr | $400 | $0 | $1,600 | $2,800 | $3,100 |
| May | $400 | $1,800 | $200 | $1,400 | $1,700 |
| Jun | $400 | $0 | $600 | $1,800 | $2,100 |
| Jul | $400 | $1,200 | −$200 | $1,000 | $1,300 |
| Aug | $400 | $0 | $200 | $1,400 | $1,700 |
| Sep | $400 | $0 | $600 | $1,800 | $2,100 |
| Oct | $400 | $0 | $1,000 | $2,200 | $2,500 |
| **Nov** | $400 | $1,800 | **−$400** | **$800** | **$1,100** |
| Dec | $400 | $0 | $0 | $1,200 | $1,500 |

Read it like this:

- **Where −$400 comes from.** Starting at $0, by the end of November the account has taken in 11 × $400 = $4,400 and paid out $1,800 + $1,200 + $1,800 = $4,800. $4,400 − $4,800 = −$400. That is the worst month.
- **Why the add-back is $400.** Step 2 adds "an amount just sufficient to bring the lowest monthly trial balance to zero". −$400 needs +$400.
- **Why the required start is $1,200.** Step 2 add $400 + cushion $800 = $1,200. With that start, November lands exactly on the $800 cushion. That is the whole point of the method.
- **Why the projected low is $1,100.** The projected column is the Step 1 column shifted up by the real starting balance. $1,500 + (−$400) = $1,100.
- **Why that is a $300 surplus.** Two ways to the same number. The law's way: real balance − target = $1,500 − $1,200 = $300. Your v0 way: low point − cushion = $1,100 − $800 = $300. They agree because low point − cushion = (start − add) − cushion = start − (add + cushion). Same thing, rearranged. (There is a 1 to 6 cent exception caused by rounding. It is in Step 8 below.)

Now the code, step by step.

### Step 0. Refuse bad input

<!-- snippet: engine/analyze.js -->
```js
function refuseIfInvalid(account) {
  const errors = validateAccount(account).errors;
  if (errors.length > 0) {
    const error = new Error("The math cannot run yet: " + errors[0].message);
    error.errors = errors;
    throw error;
  }
}
```

Not a regulation paragraph. This is the guard that kills the month-13 class of bug: `analyze` cannot produce a quiet wrong answer from input that `validateAccount` would reject. Warnings do not stop it, only errors.

**v0:** no validation at all.

### Step 1. Defaults

`cushionMonths` defaults to 2 and `borrowerCurrent` defaults to `true`. Two months is the federal maximum. Mortgage documents or state law can set it lower, never higher: § 1024.17(c)(8) and (d)(2)(i)(C). The starting balance goes through `noNegativeZero` in case a loaded file carried `-0`.

**v0:** no cushion choice and no idea of "current". The research notes list that as v0 issue #3.

### Step 2. D, the year's bills

<!-- snippet: engine/analyze.js -->
```js
function addUpBills(bills) {
  let total = 0;
  for (const bill of bills) {
    total = total + bill.amountCents;
  }
  return total;
}
```

Test case #1: 180000 + 120000 + 180000 = **480000** cents ($4,800). This is the "estimated total annual escrow account disbursements" of (d)(2)(i)(A).

**v0:** `acct.bills.reduce((sum, bill) => sum + bill.amount, 0)`. Same idea, but in float dollars. v1 uses a plain loop on purpose. The spec says no clever one-liners in the engine, so every line can be read out loud.

### Step 3. P, the monthly payment, and C, the cushion cap

<!-- snippet: engine/analyze.js -->
```js
  const baseMonthlyPaymentCents = divideRoundHalfUp(annualDisbursementsCents, 12);
```

<!-- snippet: engine/analyze.js -->
```js
  const cushionCapCents = divideRoundDown(annualDisbursementsCents * cushionMonths, 12);
```

- P implements § 1024.17(c)(1)(ii): "a monthly sum equal to one-twelfth (1/12) of the total annual escrow payments". 480000 ÷ 12 = **40000** ($400).
- C implements (c)(5): "The cushion must be no greater than one-sixth (1/6) of the estimated total annual disbursements". One-sixth is 2 months out of 12, so in general it is bills × cushionMonths ÷ 12. 480000 × 2 ÷ 12 = **80000** ($800).

The two different rounding rules are this project's choices, not law. The regulation never mentions cents. P rounds to the nearest cent, halves up. C rounds **down**, because the law says "no greater than": a cap must never be rounded up past the limit. With $5,000 of bills, P is $416.67 and C is $833.33, never $833.34.

**v0:** `const cushionCap = total / 6;` in floats, and the deposit was typed in (`acct.monthlyDeposit`). See Choice 3 above for what that cost.

### Step 4. Put the bills into month slots

<!-- snippet: engine/analyze.js -->
```js
function billsForEachMonth(bills) {
  const totals = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const bill of bills) {
    totals[bill.month] = totals[bill.month] + bill.amountCents;
  }
  return totals;
}
```

Thirteen slots so that slot 5 is month 5 (slot 0 is unused). Two bills in the same month are added. Balances are month-end balances, so the order of things inside a month does not matter. Appendix E's own July row nets a $130 payment and a $500 bill the same way.

For test case #1: slot 5 = 180000, slot 7 = 120000, slot 11 = 180000.

**v0:** no slots. Inside each month it looped over every bill and checked `if (bill.month === month)`. That works for months 1 to 12, and it is exactly why a bill marked month 13 was silently skipped.

### Step 5. Step 1 of the law: the trial balance from $0

<!-- snippet: engine/analyze.js -->
```js
function stepOneTrialBalances(monthlyPaymentCents, billsByMonth) {
  const balances = [];
  let balance = 0;
  for (let month = 1; month <= 12; month++) {
    balance = balance + monthlyPaymentCents - billsByMonth[month];
    balances.push(balance);
  }
  return balances;
}
```

This implements (d)(2)(i)(A), "a trial running balance", and it is Appendix E's Step 1, which the appendix titles "Initial Trial Balance". It gives the Step 1 column of the table above.

**v0, side by side:**

```js
  let balance = acct.startingBalance;
  const monthEnds = [];
  for (let month = 1; month <= 12; month++) {
    balance = balance + acct.monthlyDeposit;
    for (const bill of acct.bills) {
      if (bill.month === month) balance = balance - bill.amount;
    }
    monthEnds.push(balance);
  }
```

Same loop shape. Two differences. v0 starts from the real balance, v1 starts from $0 the way Appendix E does (v1 gets your column back later by adding the real balance to each row). And v0 adds a typed deposit, v1 adds the computed P.

### Step 6. Find the lowest month

<!-- snippet: engine/analyze.js -->
```js
function findLowest(monthEndValues) {
  let lowestValue = monthEndValues[0];
  let lowestMonth = 1;
  for (let index = 1; index < monthEndValues.length; index++) {
    if (monthEndValues[index] < lowestValue) {
      lowestValue = monthEndValues[index];
      lowestMonth = index + 1;
    }
  }
  return { value: lowestValue, month: lowestMonth };
}
```

Test case #1: `{ value: -40000, month: 11 }`.

Look at the `<`. A later month only wins if it is strictly lower, so a tie goes to the earliest month. The regulation says nothing about ties. That rule is a choice, pinned by TV21 (months 6 and 11 tie, month 6 is reported).

**v0:** `const lowPoint = Math.min(...monthEnds);`. That gives the value but not the month. v1 needs the month for the chart, the sentences and the letter.

### Step 7. Step 2 of the law: lift the worst month to $0

<!-- snippet: engine/analyze.js -->
```js
  let stepTwoAddCents = 0;
  if (lowestStepOne.value < 0) {
    stepTwoAddCents = noNegativeZero(-lowestStepOne.value);
  }
```

This implements (d)(2)(i)(B): the servicer "adds to the first monthly balance an amount just sufficient to bring the lowest monthly trial balance to zero". Test case #1: **40000** ($400).

The `if` matters. Appendix E describes this step as "Increase monthly balances to eliminate negative balances". It only ever adds. With P rounded to the cent, 12 payments can be up to 6 cents more than the year's bills. If every bill comes late in the year, the lowest Step 1 month can be a few cents above $0, and then there is nothing to eliminate: add $0, never a negative amount. TV25 pins this.

### Step 8. Step 3 of the law: add the cushion, then compare

<!-- snippet: engine/analyze.js -->
```js
  const requiredStartingBalanceCents = stepTwoAddCents + cushionCapCents;
```

<!-- snippet: engine/analyze.js -->
```js
  const differenceCents = startingBalanceCents - requiredStartingBalanceCents;
  const amounts = splitDifference(startingBalanceCents, requiredStartingBalanceCents);
```

The first line is (d)(2)(i)(C) and Appendix E's Step 3, titled "Trial Balance With Cushion": 40000 + 80000 = **120000** ($1,200).

The second part is the (b) definitions. Surplus is "an amount by which the current escrow account balance exceeds the target balance". Shortage is the amount by which it "falls short of the target balance". 150000 − 120000 = **+30000**, a $300 surplus.

**v0:** `const surplus = lowPoint - cushionCap;`. As shown above, that is the same number when the deposit is exactly bills ÷ 12. v1 uses the law's own wording (real balance against target) and also reports the low point, so both views are on the page.

The small print (SPEC E1): "low point − cushion = difference" is exact only when the lowest Step 1 balance is $0 or below. When rounding leaves every Step 1 month a few cents above $0, the two differ by exactly that lowest balance, 1 to 6 cents. The auditor's example: one bill of $1,200.06 in month 12, balance $300. Difference is 9,999 cents. Low point minus cushion is 10,005 cents. The spec had claimed the identity always holds. The engine was right and the spec's test was wrong, so the test got fixed, not the engine.

### Step 9. Surplus, shortage, deficiency

<!-- snippet: engine/analyze.js -->
```js
export function splitDifference(startingBalanceCents, requiredStartingBalanceCents) {
  let surplusCents = 0;
  let shortageCents = 0;
  let deficiencyCents = 0;

  if (startingBalanceCents < 0) {
    deficiencyCents = noNegativeZero(-startingBalanceCents);
  }

  if (startingBalanceCents > requiredStartingBalanceCents) {
    surplusCents = startingBalanceCents - requiredStartingBalanceCents;
  } else if (startingBalanceCents < requiredStartingBalanceCents) {
    const measuredFrom = startingBalanceCents < 0 ? 0 : startingBalanceCents;
    shortageCents = requiredStartingBalanceCents - measuredFrom;
  }

  return { surplusCents: surplusCents, shortageCents: shortageCents, deficiencyCents: deficiencyCents };
}
```

Three definitions from § 1024.17(b):

- surplus: the real balance is above the target
- shortage: the real balance is below the target
- deficiency: "the amount of a negative balance in an escrow account"

A deficiency is a real negative balance today. It is never a dip the projection predicts for later. HUD's 1994 rule says the rule "does not allow servicers to anticipate deficiencies". TV19 pins that.

When the balance is negative it is below $0 and below the target, so read literally the two definitions overlap. The `measuredFrom` line handles that: deficiency first (the part below $0), then the remaining shortage from $0 up to the target. **That split is HUD guidance, not regulation text**: HUD's 1995 notice, 60 FR 8812, 8813-14, clarification (l), with a worked example in its Appendix M (TV04: balance −$2,400, target $3,300, so deficiency $2,400 and shortage $3,300). It is the only reading that does not count the same dollars twice, and the page labels it as guidance wherever it shows this step.

Test case #1: `{ surplusCents: 30000, shortageCents: 0, deficiencyCents: 0 }`.

**v0:** one number, `surplus`, where negative meant shortage. No deficiency at all.

### Step 10. The 12-row table and the low point

<!-- snippet: engine/analyze.js -->
```js
      step1TrialBalanceCents: stepOneBalance,
      targetBalanceCents: stepOneBalance + stepTwoAddCents + cushionCapCents,
      projectedBalanceCents: startingBalanceCents + stepOneBalance,
```

Three balance columns per row, all built from the Step 1 number. The target column is Appendix E's Step 3 column. The projected column is what your v0 produced.

The low point is read from the row of the lowest Step 1 month (same month in all three columns, because they are the same column shifted). `lowestTargetBalanceCents` is read from that row too, not copied from the cap. Normally they are equal. In the TV25 rounding case they are not: 6 + 0 + 20,001 = 20,007.

Test case #1: low point $1,100 in month 11 (November), target there $800.

### Step 11. Classify

<!-- snippet: engine/analyze.js -->
```js
  if (amounts.surplusCents > 0) {
    // (f)(2)(ii): the refund rule applies "if the borrower is current".
    if (!borrowerCurrent) {
      return {
        classification: "SURPLUS_BORROWER_NOT_CURRENT",
        cite: CITE_PREFIX + "(f)(2)(ii)",
        servicerOptions: ["servicer may retain the surplus in the escrow account pursuant to the loan documents"],
      };
    }
    if (amounts.surplusCents >= REFUND_THRESHOLD_CENTS) {
      return {
        classification: "SURPLUS_REFUND_REQUIRED",
        cite: CITE_PREFIX + "(f)(2)(i)",
        servicerOptions: ["refund the surplus to the borrower within 30 days from the date of the analysis"],
      };
    }
```

`REFUND_THRESHOLD_CENTS` is 5000. The `>=` is the law: § 1024.17(f)(2)(i) says the servicer shall refund "if the surplus is greater than or equal to 50 dollars". A surplus of exactly $50.00 must be refunded (TV06). $49.99 may be refunded or credited (TV07). Exercise 5 has you break this one character and watch the tests catch it.

Test case #1: $300 is at least $50 and the borrower is current, so **`SURPLUS_REFUND_REQUIRED`**, cite `12 CFR 1024.17(f)(2)(i)`.

The full list of outcomes:

| Classification | Paragraph | What the servicer may do |
|---|---|---|
| `SURPLUS_REFUND_REQUIRED` | (f)(2)(i) | refund within 30 days from the date of the analysis |
| `SURPLUS_UNDER_50` | (f)(2)(i) | refund it, or credit it against next year's payments |
| `SURPLUS_BORROWER_NOT_CURRENT` | (f)(2)(ii) | may keep it in the account under the loan documents |
| `ON_TARGET` | (d)(2) | nothing to do |
| `SHORTAGE_LT_ONE_MONTH` | (f)(3)(i) | do nothing, or ask for it within 30 days, or spread over at least 12 months |
| `SHORTAGE_GE_ONE_MONTH` | (f)(3)(ii) | do nothing, or spread over at least 12 months. No 30-day demand. |
| `DEFICIENCY_LT_ONE_MONTH` | (f)(4)(i) | do nothing, or 30 days, or 2 or more equal monthly payments |
| `DEFICIENCY_GE_ONE_MONTH` | (f)(4)(ii) | do nothing, or 2 or more equal monthly payments |
| `DEFICIENCY_BORROWER_NOT_CURRENT` | (f)(4)(iii) | the mortgage documents control it, not this rule |
| combined, like `DEFICIENCY_GE_ONE_MONTH_AND_SHORTAGE_GE_ONE_MONTH` | both cites | both option lists, deficiency first |

"One month's payment" means the new base payment, bills ÷ 12. The regulation does not say old or new. That is a written choice. Exactly one month's payment lands in the greater-or-equal tier (TV10). One cent less does not (TV10b).

One asymmetry worth knowing: "is the borrower current?" exists in the law for surpluses ((f)(2)(ii)) and deficiencies ((f)(4)(iii)). It does not exist for shortages ((f)(3)). So `shortageRules` never looks at it, and a test proves shortage handling is identical either way.

**v0:** the verdict lived in `check.js` as `if (r.surplus >= 50) … else if (r.surplus > 0) … else if (r.surplus === 0) …`. You had the `>=` right. What was missing: tiers, cites, deficiency, "current".

### Step 12. The most the new payment can lawfully be

`buildNewMonthlyPayment` works out:

```
  bills ÷ 12            (c)(1)(ii)
+ shortage ÷ 12         (f)(3): "at least a 12-month period", so 12 is the fastest
+ deficiency ÷ 2        (f)(4): "2 or more equal monthly payments", so 2 is the fastest
```

Because the deficiency part only lasts 2 months, there are two totals: `monthlyEscrowWhileRepayingDeficiencyCents` and `monthlyEscrowAfterDeficiencyRepaidCents`. HUD's own example (TV04) comes out to $1,975 for two months and then $775, and the engine reproduces both.

One special case. When the borrower is not current, (f)(4)(iii) hands the schedule for collecting a deficiency to the mortgage documents, so there is no "÷ 2" to apply and the deficiency fields stay 0. That does not make the amount unlimited: whatever the schedule, no single month can collect more than the whole deficiency. The exported helper `paymentCeiling(result)` works out that one-month ceiling (bills ÷ 12 + shortage ÷ 12 + the whole deficiency) for `compare.js` and `explainJump`. It was added after the auditor's Stage 3 finding N2. See Part 7.

The cushion is not in this formula, on purpose. Appendix E shows the same $130 payment in all three of its tables. The cushion is a level the balance must reach, so it gets funded through the shortage.

**v0:** did not compute a new payment at all. That was the third gap in the July review: the actual question, "why did my payment jump?", was unanswered by the math.

### Step 13. Too close to call (`nearLine`)

Two lines in the rule turn on an exact figure: a surplus of $50.00 or more must be refunded, and a shortage or deficiency of one month's payment or more loses the 30-day option. This engine's cent rounding can move a figure a few cents, and a servicer that rounds to whole dollars, which HUD's 1995 guidance allows, can be up to about $7 away. So when a figure is within $7.00 of one of those lines, `findNearLine` sets `result.nearLine`.

`classification` stays cent-exact. `nearLine` only tells the words and the page to soften: state the figure, say it is too close to call, and do not show the refund-required banner. The band is inclusive: a surplus of $57.00 is in (TV28), $57.01 is out (TV29).

### Step 14. The result

One plain object: the numbers, `lowPoint`, `classification`, `cite`, `servicerOptions`, `newMonthlyEscrowPayment`, the 12-row `table`, `nearLine`, and `inputs` (a tidy copy of what went in, so nothing downstream can change the caller's account). If the account carries a `priorYear` block it also gets `paymentJumpDecomposition`. Today only TV18 and the self-check use that.

### The other export: `projectWithPayment`

"What will my account actually hold if I pay what the statement says?" Starting balance + (that payment − bills), month by month. It returns 12 balances. It is for drawing the servicer's line on the chart and for comparing. The verdict never uses it, for the TV18 reason.

Fun fact: `projectWithPayment(account, 40000)` on test case #1 is your v0 engine's `monthEnds`, in cents.

### v0 to v1 at a glance

| | `v0/engine.js` (yours, 22 lines) | `engine/analyze.js` (v1) | Why it changed |
|---|---|---|---|
| Money | float dollars | whole cents | `$297.8666666666679` |
| Input check | none | `validateAccount` first | month 13 gave a quiet wrong answer |
| Deposit | typed in | computed, bills ÷ 12 | TV18: −$1,125 instead of −$300 |
| Cushion | `total / 6` | bills × months ÷ 12, rounded down, months can be 0, 1 or 2 | (c)(5) is a cap, (c)(8) allows lower |
| Projection | from the real balance | from $0, then shifted | follows Appendix E's printed steps, so its tables can be checked number for number |
| Low point | value only | value and month, earliest on a tie | the month is needed everywhere |
| Test | low point − cushion | real balance − target | the (b) definitions say "target balance" |
| Outcomes | one signed number | surplus, shortage, deficiency, 10+ classifications with cites | (f)(2), (f)(3), (f)(4) |
| New payment | not computed | base + shortage ÷ 12 + deficiency ÷ 2 | the question people actually have |

Your v0 got test case #1 exactly right on its first run. The research agent ran a read-only copy of it against the first 22 vectors: it agreed on 18 and differed exactly where expected (no lower-cushion input on TV12, TV16 and TV17, and float cents on TV15). The idea was right. v1 is the same idea with the edges closed.

---

## Part 4. The other engine files

### `engine/money.js`

**`parseDollars(text)`** returns `{ ok: true, cents }` or `{ ok: false, problem }`.

It reads the text one character at a time and never calls `parseFloat` or `Number` on a decimal. Here is why. The moment a dollar amount exists as a float, the rounding problem is back. Try `node -e 'console.log(parseFloat("19.99") * 100)'` and you get `1998.9999999999998`, not 1999. So instead it splits the text at the decimal point, checks both halves are digits, and builds the integer itself:

<!-- snippet: engine/money.js -->
```js
function digitsToNumber(digits) {
  let value = 0;
  for (const character of digits) {
    value = value * 10 + DIGITS.indexOf(character);
  }
  return value;
}
```

Then `dollars * 100 + extraCents`. Whole numbers the whole way.

It accepts `1234.5`, `$1,234.50`, `-200`, `−200` (the real minus sign, U+2212), `-$200`, `$-200`, `(200.00)` (accountants' negative) and `.50`. It rejects `1e5`, `0x10`, `12.345`, `1.2.3`, `--5`, and `1234,50` (European style, which would otherwise be read 100 times too big). Anything over $10,000,000 is refused, and that also means the engine never builds a number too big to be exact.

Two safety details. The problem message never repeats what was typed, so it is always safe to show on the page. And `-0` parses to plain `0`.

**The two division helpers**

<!-- snippet: engine/money.js -->
```js
export function divideRoundHalfUp(cents, divisor) {
  checkDivisionInputs(cents, divisor);
  const leftover = cents % divisor;
  const roundedDown = (cents - leftover) / divisor;
  if (leftover * 2 >= divisor) {
    return roundedDown + 1;
  }
  return roundedDown;
}
```

`%` is "remainder after dividing". Take the leftover away first and what remains is an exact multiple of the divisor, so the `/` always comes out to a whole number. Nothing to round, no fraction ever exists. Then: if the leftover is half the divisor or more, go up one.

Example: 500000 ÷ 12. Leftover 8. (500000 − 8) ÷ 12 = 41666 exactly. 8 × 2 = 16, which is at least 12, so the answer is 41667. That is $416.67.

`divideRoundDown` is the same without the last step. It is used for the cushion cap and inside `formatCents`.

These two functions hold the only two `/` operators in the engine. `tests/purity.test.js` has a test named "the division operator appears ONLY inside the two named helpers in money.js", and the auditor's own scan found the same two lines. If there is one place a fraction could appear, and that place is built so it never does, the whole engine is exact.

Both helpers refuse negative numbers, and no caller passes one. That is deliberate: rounding negatives "half up" is ambiguous, so the engine never has to decide.

**`formatCents(cents)`** builds `"$1,234.50"` with whole-number math, prints negatives with the real minus sign, and prints `-0` as `$0.00`.

**Month helpers.** Inside the engine, month 1 is always the first month of the escrow year. `startMonth` says which calendar month that is. `escrowToCalendarMonth(6, 7)` is 12: if the year starts in July, escrow month 6 is December. `calendarToEscrowMonth` is the reverse. A test runs all 144 combinations both ways.

### `engine/validate.js`

Two functions, same return shape: `{ errors: [{ field, message }], warnings: [{ field, message }] }`.

- **Errors block.** Missing starting balance, no bills, a bill of $0 or less, a month outside 1 to 12, money that is not a whole number of cents, anything over $10,000,000, a cushion that is not 0, 1 or 2, more than 100 bills, a bill name over 60 characters.
- **Warnings never block.** A negative starting balance ("rare, check your statement"), only one bill, a bill under $100 for the whole year ("is that a monthly amount?"), a total over $100,000, and in `validateStatement` a payment more than double bills ÷ 12 ("is that your whole mortgage payment?").

The rule behind the split is in the file's header: a tool that refuses to run because of a hunch is a tool nobody trusts.

`field` is a dotted path like `disbursements.0.amountCents` (row 0 is the first bill). The page uses it to put the message under the right box.

`MAX_BILL_LABEL_LENGTH = 60` is the one limit on a bill name's length for the whole project. The QA audit found four different limits in four files (60, 100, 120, 200). Now the form's `maxlength`, the file loader and the validator all read this one export, and a test fails if a second label-length number appears in `engine/`.

### `engine/compare.js`

`analyze.js` never looks at the servicer's numbers. `compare.js` is the only place they meet the federal math.

Three ground rules from the file header:

1. **Everything the method produces is a ceiling.** § 1024.17(d)(1): "The steps set forth in this section result in maximum limits. Servicers may use accounting procedures that result in lower target balances." So at or under a limit is fine. Only over is "over-limit".
2. **A mismatch is not proof of a mistake.** The servicer may know about a newer tax bill than the one typed in. Every sentence is calm arithmetic, never an accusation.
3. **Tolerances are choices, not law.**

`compareWithStatement(result, statement)` returns:

- `rows`: one per statement number the person filled in, with `statementCents`, `federalCents`, `gapCents` and a `status`
- `flags`: things worth a closer look
- `nudges`: "please double-check what you typed" notes. A nudge is never a flag.
- `overall`: `"look-here"` if there is any flag, else `"matches"` if something was really compared, else `"not-provided"`

Every row marked "differs" or "over-limit" has a flag pointing at it, so the table and the verdict cannot disagree.

**The flags**

| Flag | When it fires | Cite it carries |
|---|---|---|
| `CUSHION_OVER_CAP` | the statement's required minimum balance is more than $7.00 above the cap | (c)(5), or (c)(8) when the person picked a 1-month or zero cushion |
| `CUSHION_MAYBE_OVER_CAP` | the typed minimum is over the cap but also equals the federal low point, and nothing else typed settles which it is. Two-sided wording, amber, never green. See "The mix-up rule" below. | same as above |
| `PAYMENT_ABOVE_MAX` | the new payment is above bills ÷ 12 + shortage ÷ 12 + deficiency ÷ 2 by more than the payment tolerance. Carries the per-month and per-year dollars. For a borrower who is not current, the ceiling is bills ÷ 12 + shortage ÷ 12 + the whole deficiency (`paymentCeiling` in `analyze.js`), and no yearly figure is given. | (c)(1)(ii) |
| `AMOUNT_DIFFERS` | same kind of finding, different dollars (gap over $7.00). Also used when the payment is lower than expected, with wording that lower is allowed. | (b) + (d)(2), or (c)(1)(ii) for the payment |
| `KIND_DIFFERS` | the statement says shortage and the math says surplus, or it says "deficiency" when the balance is not below $0, and so on | (b) + (d)(2) |
| `SPREAD_TOO_SHORT` | a shortage is repaid over fewer months than the rule lists: under 12 for a large one, 2 to 11 for a small one (1 month is the 30-day option the rule lists for a small one) | (f)(3)(i), (f)(3)(ii), or (f)(3) when the tier itself is too close to call |
| `LUMP_SUM_OFFERED` | shortage of one month's payment or more, and the statement itself prints a pay-it-all option. Worded as a question to ask, never a finding. | (f)(3)(ii), plus the CFPB mortgage servicing FAQ |

A fairness detail that is easy to miss: if the statement uses a smaller cushion than the cap, that is allowed, and the servicer's shortage is smaller by the same amount. Checking their shortage against the federal maximum would flag them for being generous. So `buildServicerView` re-runs the comparison "with the cushion the statement uses, but never more than the cap".

**The mix-up rule.** If someone types their lowest projected balance into the "required minimum balance" box (two different lines on most statements), the typed number is over the cap and also equals the federal low point. But a servicer that really does hold an oversized cushion produces exactly the same pattern, because it sets the account up so the lowest month lands on its cushion. That number alone cannot settle it, so `decideCushionCase` looks at what else was typed, in this order:

| Case | What else was typed | What the engine concludes |
|---|---|---|
| (a) `MIX_UP` | the statement's shortage or surplus, and it **matches** the federal math | A statement that agrees with the federal math cannot be using a bigger cushion. So it is a typing mix-up: a nudge, no flag, the cushion row is "not-compared". |
| (b) `OVER_CAP` | the statement's shortage or surplus, and it **disagrees by about (typed minimum − cap)** | That is what a servicer really using that cushion would print. The typed minimum is real: ordinary `CUSHION_OVER_CAP`. |
| (c) `CANNOT_TELL` | anything else, including nothing | It cannot be told apart. Never green, never a hard accusation: `CUSHION_MAYBE_OVER_CAP`, amber, and the letter only asks the servicer to confirm the number. |

How this rule got here is the best story in Part 7. The first version of it let an over-cushioned statement come out green.

**Where $7 comes from.** HUD's 1995 guidance says "any dollar amount referenced in this rule may be rounded up or down to the nearest dollar" (60 FR 8812, clarification (a)). A servicer that rounds every figure to whole dollars can drift 50¢ × 12 months + 50¢ on the cushion = $6.50. So the tool says "matches" for gaps up to **$7.00** on balances (`TOLERANCE_BALANCE_CENTS = 700`). Exactly $7.00 over draws no flag. $7.01 does.

**Where $1, $2, $3 come from.** The first version allowed $1.00 on the monthly payment, treating it as one rounded figure. The auditor showed it is a sum of up to three parts, each rounded on its own:

<!-- snippet: engine/analyze.js -->
```js
export function paymentToleranceCents(partsInMaximum) {
  return TOLERANCE_PAYMENT_CENTS * partsInMaximum;
}
```

`countPaymentParts` counts them: bills ÷ 12 is always there (1), plus 1 if there is a shortage spread, plus 1 if there is a deficiency spread. So the tolerance is $1.00, $2.00 or $3.00. The auditor's repro: one bill of $4,806.00 in month 12, balance $495.50. The engine's maximum is $425.96. A servicer that rounds each part to the dollar, as HUD's guidance allows, prints $401 + $26 = $427, which the old rule flagged as "$1.04 a month more". The honest cost of the fix, in the auditor's words: a payment that really is over by up to $2 or $3 a month now passes, at most $24 or $36 a year, and that money comes back as a surplus at the next analysis.

Both tolerances are this project's choices. The regulation is silent on cents.

### `engine/explain.js`

Numbers in, words out. Five exports:

- `explainVerdict(result, comparison)`: the banner. `tone` is `"clear"` (green: the statement was checked and lines up), `"flag"` (amber: any flag, or a refund-required surplus that is not in the too-close band) or `"info"` (teal: nothing to compare, or a surplus too close to $50 to call). It answers two separate questions and keeps them separate: what does the federal math say, and does the statement agree.
- `explainSteps(result)`: the six "show the math" steps with this account's numbers, each with its cite and an official link. When there is a deficiency, step 6 says out loud that the split is HUD guidance.
- `explainJump(result, statement)`: "why did it jump?" Four parts that always add up to exactly new − old: bills now against the old payment, shortage repayment, deficiency repayment, and whatever is left. The last part is worked out by subtraction, which is what makes the sum exact.
- `explainServicerLine(result, account, statement)`: the words for the second line on the chart.
- `nextSteps(result, comparison)`: what a homeowner can do, with the real deadlines and official links only.

The voice rules are enforced by tests, not by hope. `tests/explain.test.js` runs every vector and every example through every function that produces text and scans all of it for banned words ("scam", "fraud", "stealing", "guaranteed"), for "legal advice" outside the negative, for leftover programmer text like `undefined`, and for sentences over 40 words. It also reads the engine's source for string literals, so a sentence on a rarely reached branch cannot hide.

### `engine/letter.js`

`buildLetter(result, comparison, details)` returns one plain string. The page puts it in a text box through `.value`, so nothing in it is ever treated as HTML. Missing details print as visible blanks like `[your loan number]`. Line breaks in typed details are flattened and each detail is capped at 200 characters.

The part to be able to explain is `letterKind`:

<!-- snippet: engine/letter.js -->
```js
export const FLAGS_THAT_ASSERT_A_DISCREPANCY = ["CUSHION_OVER_CAP", "PAYMENT_ABOVE_MAX", "KIND_DIFFERS", "SPREAD_TOO_SHORT"];
```

<!-- snippet: engine/letter.js -->
```js
function flagAssertsADiscrepancy(flag) {
  if (FLAGS_THAT_ASSERT_A_DISCREPANCY.includes(flag.kind)) return true;
  if (flag.kind === "AMOUNT_DIFFERS" && flag.rowKey === "claimedAmount") return true;
  return false;
}

export function letterKind(result, comparison) {
  for (const flag of comparison.flags) {
    if (flagAssertsADiscrepancy(flag)) return "NOTICE_OF_ERROR";
  }
  return "REQUEST_FOR_INFORMATION";
}
```

The list is explicit on purpose: a new flag kind is a question until someone adds it to the list. `CUSHION_MAYBE_OVER_CAP` is not on it, because the page cannot tell that case from a typing mix-up.

Two kinds of letter exist in Regulation X:

- A **notice of error**, 12 CFR 1024.35. Under (a) it must include "the error the borrower believes has occurred". It asserts something is wrong.
- A **request for information**, 12 CFR 1024.36. It only asks.

The first version of the letter called itself a notice of error whenever it had any question at all. That included a refund that may simply be on its way, every too-close-to-call case, and "your payment is lower than expected" (which the text itself says is allowed). The auditor caught it. Now the letter is a notice of error only when a flag asserts a discrepancy: `CUSHION_OVER_CAP`, `PAYMENT_ABOVE_MAX`, `KIND_DIFFERS`, `SPREAD_TOO_SHORT`, or `AMOUNT_DIFFERS` on the claimed amount. Everything else is a request for information that carries the same questions.

One rule in one place: `buildLetter`, `nextSteps` and the page's letter-panel title all read `letterKind`, so they cannot disagree.

Both letters carry the line "This letter states arithmetic, not legal conclusions."

### `engine/dates.js`

`refundDeadline("2026-09-01")` returns `{ ok: true, isoDate: "2026-10-01", display: "October 1, 2026" }`. It implements the clock in (f)(2)(i): "within 30 days from the date of the analysis".

It does not use JavaScript's `Date` at all. It reads the ten characters strictly, knows leap years (2024 yes, 2100 no, 2000 yes), adds 30 days and rolls over month ends and year ends by hand. The auditor checked it against JavaScript's UTC calendar on all 401,767 dates from 1900 to 2999.

The date is an input string. The engine never asks the computer what today is. That is what keeps it pure.

### `engine/selfcheck.js` and `engine/vectors.js`: how the page proves itself

The 30 test vectors live in `docs/research/01-test-vectors.json`. That file is the source of truth and is never edited to make a test pass (appending new vectors is allowed). The page cannot download a JSON file, because its own privacy rules forbid `fetch`. So `tools/make-vectors.mjs` copies the JSON into `engine/vectors.js`, which loads with the rest of the page. `tests/vectors-sync.test.js` fails if the two ever drift apart.

`runSelfCheck(vectors)` runs each vector through the real `analyze` and walks every expected key, at every depth, including all 12 table rows. The comparison at the bottom is:

<!-- snippet: engine/selfcheck.js -->
```js
  if (!Object.is(expected, actual)) {
    mismatches.push({ path: path, expected: expected, actual: actual });
  }
```

`Object.is` is `===` except that it also tells `0` from `-0`. And `30000` is never equal to `"30000"`.

Rules worth knowing:

- Extra keys on the engine's side are ignored (the engine may return more than the vectors pin). A missing key is a mismatch.
- Lists must match exactly in length and order. 12 table rows means 12.
- Two keys in the vectors are documentation, not engine output, and are skipped out loud: `exactArithmeticReference` (TV15) and `whatGoesWrong` (TV18). The report lists them as `skippedKeys` so the page can say so. Both are still verified another way in `tests/selfcheck.test.js`.
- For TV02, TV03 and TV04 it also rebuilds the printed Step 1, 2 and 3 columns and compares them number for number with what the regulation and HUD printed.

A checker that always says "pass" would be worse than none. So most of `tests/selfcheck.test.js` feeds it wrong expectations on purpose and makes sure it notices.

### `engine/index.js`

Thirty lines. It only re-exports. The page imports from here and nowhere else in `engine/`. A test checks that it exports exactly the names in the build contract and has no logic of its own.

---

## Part 5. The page side

### `dom.js`: why there is no `innerHTML` anywhere

`innerHTML` takes a string and parses it as HTML. If any part of that string came from the person typing, they can inject an element that runs code. That attack is called XSS (cross-site scripting). The classic test string, and the one pinned in this project's tests, is:

```
<img src=x onerror=alert(1)>
```

Put that through `innerHTML` and the browser creates a broken image and runs the `onerror` code. It is the constant `HOSTILE` in `tests/pipeline.test.js`, which checks that as a bill name it stays inert text in the account and in the letter. `tests/letter.test.js` does the same with it as a servicer name. The QA auditor ran harsher versions through the real pipeline (a servicer name containing a newline, `</textarea><script>` and 5,000 characters, and a loan number of `=HYPERLINK(...)`). The director's own browser pass is logged in `BUILD-LOG.md` row 4.2 as "XSS attempts inert on every free-text path". That row does not record the literal strings, so the test files are the record.

The fix is structural. Every element the scripts create goes through `el()` or `svgEl()`, and text only ever goes in like this:

<!-- snippet: dom.js -->
```js
  if (options.text !== undefined && options.text !== null) {
    node.textContent = String(options.text);
  }
```

`textContent` never parses. The string above shows up on the page as those literal characters.

And two attribute families are refused outright:

<!-- snippet: dom.js -->
```js
function assertSafeAttributeName(name) {
  const lower = String(name).toLowerCase();
  if (lower === "style" || lower.startsWith("on")) {
    throw new Error("dom.js refuses to set the attribute: " + name);
  }
}
```

`on…` attributes are inline event handlers. `style` would be blocked by the CSP anyway. `tests/shell.test.js` scans every shell file for `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `DOMParser` and the rest of a list of about 40 banned patterns, and each pattern is itself tested against an example it must catch and a look-alike it must leave alone.

### `pipeline.js`: the seam

`check.js` touches the DOM, so Node cannot run it. `pipeline.js` never touches the DOM, and `check.js` must go through it for all the math. So `tests/pipeline.test.js` runs the exact path the page uses, with strings exactly as a person would type them.

The core of `runCheck`:

<!-- snippet: pipeline.js -->
```js
    const result = engine.analyze(inputs.account);
    const comparison = engine.compareWithStatement(result, inputs.statement);
    const verdict = engine.explainVerdict(result, comparison);
    const steps = engine.explainSteps(result);
    const jump = engine.explainJump(result, inputs.statement);
    const next = engine.nextSteps(result, comparison);
```

Details worth knowing:

- People pick calendar months everywhere. Conversion to escrow-year order happens in `readInputs` and nowhere else.
- The "my balance is below zero" tick box exists because phone number pads have no minus key. It adds a `-` to the text and lets `parseDollars` decide the sign, so this file never negates a number (no negative zero).
- The whole thing sits in a `try`/`catch`. A surprise inside the engine comes back as one plain error instead of a dead page.
- The refund date is only produced when the classification is `SURPLUS_REFUND_REQUIRED`, `nearLine` is not set, and a date was typed.
- "Download my numbers" and "Load a numbers file" live here too. A loaded file is untrusted: only a fixed list of known keys is copied, every value is forced to a short string, and the result goes through `readInputs` and the engine's validation like anything typed by hand. The servicer name and loan number are never written to the file.

### `check.js` (it was `app.js` while the site was one page)

Wiring only. The interesting parts:

- The form's `submit` handler calls `event.preventDefault()` and then `checkNow()`. The form never submits anywhere. There is no `action`, and the CSP's `form-action 'none'` would block one anyway.
- **Live what-if.** After the first good check, any edit re-runs the math 250 ms after the last keystroke (`LIVE_EDIT_DELAY_MS = 250`). Waiting for a pause like that is called debouncing. While someone is mid-number ("1," on the way to "1,234"), `looksUnfinished` keeps it quiet instead of flashing an error. If an edit makes the input invalid, the last good results stay on screen, marked stale.
- **The error boundary.** `check.html` carries a plain paragraph that starts "If the buttons on this page do nothing…". The last line of `start()` hides it. If anything in start-up throws, that line never runs and the message stays visible. Listeners for `error` and `unhandledrejection` bring it back if something breaks later. Before the QA audit, a failed start-up meant a form whose button silently did nothing.
- **The framing guard.** If the page is shown inside another website's frame, it switches the form off and says why. A `<meta>` CSP cannot set `frame-ancestors`, so the code does it.
- Every module the page will ever need is imported at the top. No lazy loading anywhere. That is what keeps the privacy counter honestly at 0 no matter what gets clicked.

### Four pages, not one (2026-09-21)

Until now the whole site was one long page: about 10 screens before a result, about 19 with one. It is four pages now.

| Page | Its script | What it loads |
|---|---|---|
| `index.html` | `landing.js` | The sample result (`preview.js`), the engine for the figures and the examples, `tabs.js`. Never the results drawer, the chart or the guide. |
| `check.html` | `check.js` | Everything the tool needs: `pipeline.js`, `render.js`, `chart.js`, `guide.js`, `tabs.js`. |
| `proof.html` | `proof-page.js` | `selfcheck-ui.js` and the engine. |
| `privacy.html` | `privacy-page.js` | `proof.js`. No engine at all. |

Every page also loads `site.js` (the menu and the service worker) and `proof.js` (its own request count). `tests/shell.test.js` has a test called "each page loads only what it needs" that fails if, say, the landing page starts importing the chart.

Things worth knowing:

- **The top bar and the footer are copied, not generated.** Same markup on all four pages, and the only thing allowed to differ is `aria-current="page"` on the links to the page you are on. There is no build step to stamp them in, so a test compares them byte for byte.
- **The form is four steps, and they are real tabs.** Your payment, your balance, what the statement concluded, your bills. The row of tabs is written in `check.html` (so nothing jumps when the script starts) and `tabs.js` adds the keys. Back and Next move focus to the step's heading. "Check the math" is on every step. Every box kept its old `id`, so reading the form, errors and the sample statement needed almost no change.
- **A failed check goes to the mistake.** Press "Check the math" on step 1 with a blank bill on step 4: the page switches to step 4, marks that tab, and puts focus on the error summary. Each link in the summary switches to the right step and focuses the box.
- **One thing broke and got fixed:** `guide.js` used to treat any box inside a `hidden` element as switched off, and drop it from the numbering and the sample statement. A step that is waiting its turn is a hidden tab panel, so steps 2 to 4 lost their numbers. Now only `hidden` that is NOT a tab panel counts.
- **The result is six tabs.** Verdict, Compare, Chart, Why it jumped, The math, What next. Live what-if redraws all six in place, whichever one is showing. The one line that is read out while editing (`#verdict-live`) sits outside the tabs, because a line inside a hidden tab is never read out.
- **The chart needs a width.** It measures the box it is drawn into, and a tab that is not showing has no width. So `check.js` lays every panel out while `renderResults` runs and puts the tabs back before the browser paints. Nobody sees it.
- **Printing ignores the tabs.** On paper `site.css` hides the row of tabs and turns every panel into `display: contents`, so the same one-page report prints from any tab. Checked by printing example 3 from each of the six tabs with headless Chrome: one page every time, the same bytes every time.
- **`./check.html#example-2`** opens the tool with example 2 filled in and checked. That is how the landing page's example buttons work. `example-link.js` is the only code that reads the address, and all it takes is one digit that names a real example.
- **Offline covers all four.** `sw.js` saves every page and every file any page loads, on the first visit to any of them. It also answers a page's address without `.html`, the way GitHub Pages does.

### `render.js`

It draws. Every verdict, flag, step and letter line arrives from the engine already in plain English and is placed with `textContent`. `renderResults` runs its eleven drawing steps each inside its own `try`/`catch` and returns `true` only if every one worked, so one broken step cannot leave the page half new and half old without saying so.

The refund clock's heading reads "If this surplus is right, the 30-day refund window ends". It used to say "Refund due by". The QA audit called that a promise of money the tool cannot make.

### `chart.js`

Two pictures, both SVG built with `svgEl()`:

- The balance chart: the 12 federal month-end balances, the cushion cap as a dashed line, the low point marked. If the person typed the new payment, a second line shows what the account will really hold paying that (from `projectWithPayment`), with the gap above the legal cushion labeled.
- The "why did it jump" stacked bar.

The chart is followed by the same data as a real `<table>`, because a picture alone is useless to a screen reader. Series are told apart by texture as well as color. It measures its box and draws for that exact pixel width, so labels stay readable on a phone. It is the longest file mostly because of label placement (keeping labels from landing on top of each other). None of that is math. All the math wording comes from the engine.

### `guide.js`

The "Where do I find this?" helper. A made-up sample escrow statement drawn in plain HTML and CSS, with no real servicer's name or layout. Numbered regions match the form fields. Click a region and focus jumps to its box. Focus a box and its region lights up. On narrow screens each field gets a small disclosure instead. Every dollar figure on the sample comes from built-in example 1, so the guide cannot disagree with the example buttons.

### `proof.js`: be precise about this one

This panel is where the project over-claimed at first, and the QA audit caught it. Know exactly what is and is not proven.

**What the counter reads.** Every browser keeps a performance log of the files a page requests. The panel only reads that log:

<!-- snippet: proof.js -->
```js
function readRequestsSinceLoad(loadFinishedAt) {
  const requests = [];
  for (const entry of performance.getEntriesByType("resource")) {
    if (entry.startTime > loadFinishedAt) {
      requests.push(entry);
    }
  }
  return requests;
}
```

So the number is: files this page asked for after it finished loading. Checking the math needs nothing from the network, so it should sit at 0. If it is ever not 0, the panel lists each address in full so the visitor can see none of them carries their numbers.

| The counter CAN see | The counter CANNOT see |
|---|---|
| background requests made by this page after load: a `fetch`, an image, a script, a stylesheet, the manifest | the service worker's own downloads (saving the site's files on a first visit, checking for a new `sw.js` on later visits) |
| in some browsers, the browser asking for a tab icon (the panel labels that one) | a link you click, or a new window. Opening a page is a navigation, not a background request. |
| | other tabs, other apps, browser extensions |
| | anything after the browser's log fills up (about 250 entries) |

**What the CSP blocks.** The Content-Security-Policy is one `<meta>` line at the top of every page (the same bytes on all four, and `tests/shell.test.js` checks that), with ten directives (the tenth, `font-src 'self'`, was added on 2026-09-21 for the one serif font file, which comes from this site's own folder). `connect-src 'none'` makes the browser itself refuse background connections from the page: `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, `<a ping>`. `form-action 'none'` blocks form posts. `script-src 'self'` and `style-src 'self'` block inline and third-party scripts and styles. `default-src 'none'` blocks everything not listed.

**What the CSP does not block** (straight from the QA audit, defect 1):

1. A navigation. Code could set `location.href` to another site with data in the address, or call `window.open`. CSP has no shipped rule for that.
2. A same-origin GET with data in the query string. `img-src 'self'` allows asking this site for `./a.png?bal=…`, and that request would reach the host's logs.
3. The service worker. A `<meta>` CSP governs the document, not `sw.js`. A worker's policy comes from its own response headers, and GitHub Pages sends none.
4. Browser-dependent side channels (`dns-prefetch`, WebRTC).

Those gaps are closed by the code itself, and tests enforce that: `tests/shell.test.js` fails if any shell file contains `window.open`, `location.href =`, `new Image`, `fetch(` and so on (only `sw.js` may fetch and use the cache), and `tests/sw.test.js` actually runs `sw.js` in a sealed box and asserts nothing is ever fetched from another origin.

**The two over-claims that were fixed:**

- The panel used to say the browser would block the page from sending data "even if this page's code tried". False, for the four reasons above. It now says the browser blocks background connections, says what that does not cover, and says the code never uses those paths and is open to read.
- The zero line used to read "0: nothing has been sent or fetched". False on a first visit: the service worker downloads the site's files right after load, and the page's log cannot see a worker's requests. It now reads "0: this page has not asked the network for anything since it loaded", with the service-worker sentence directly under the number.

The lesson to carry: every sentence on the page must claim only what the mechanism proves.

One more honest line from the fix: the page no longer says "no server". The files are hosted on GitHub Pages, which like any web host can see that your browser downloaded them. It never sees what you type.

### `sw.js` and the hash stamp

A **service worker** is a small script the browser keeps next to a site. This one saves a copy of the site's own files in a storage box the browser calls a cache. After that it answers requests for those files from the saved copy first ("cache-first"). That is why the page opens with the wifi off, in most browsers.

It is deliberately narrow:

<!-- snippet: sw.js -->
```js
  if (request.method !== "GET") return;
```

<!-- snippet: sw.js -->
```js
  if (requestUrl.origin !== self.location.origin) return;
```

<!-- snippet: sw.js -->
```js
  const shellUrl = shellUrlFor(requestUrl);
  if (shellUrl === null) return;
```

Only GET. Only this site. Only files on its list. For anything else it returns without answering and the browser carries on as if the worker did not exist. It has no `message` listener, so the page cannot hand it data.

**The stale-cache trap.** The browser only installs a new worker when `sw.js` itself changes, byte for byte. If `check.js` changes and `sw.js` does not, the browser sees the same worker, installs nothing, and a returning visitor keeps getting the old saved `app.js`, possibly forever. The cache name used to be bumped by hand. The QA audit proved from this repo's own history that two commits changed site files and shipped with the same cache name, with every test green.

**The fix.** `tools/stamp-sw.mjs` makes the cache name depend on the files:

<!-- snippet: tools/stamp-sw.mjs -->
```js
  hash.update(urls.join("\n"));
```

<!-- snippet: tools/stamp-sw.mjs -->
```js
  for (const url of urls) {
    hash.update(readFileSync(filePathFor(rootFolder, url)));
  }
```

<!-- snippet: tools/stamp-sw.mjs -->
```js
  hash.update(serviceWorkerText.replace(CACHE_NAME_LINE, ""));
```

A **hash** turns any amount of data into a short fingerprint (here SHA-256). Same bytes, same fingerprint. Change one character anywhere and the fingerprint is completely different. The tool hashes the list of files, the bytes of every file on it, and `sw.js` without its own name line (if the name were part of what gets hashed, writing the name would change the hash, and it could never settle). The first 12 hex characters go into the name: `escrowscope-v1-` followed by the fingerprint.

So: any file changes, the fingerprint changes, the `CACHE_NAME` line changes, `sw.js` is a different file, the browser installs the new worker, and the new worker saves fresh copies under the new name and deletes the old box.

A test in `tests/shell.test.js` fails whenever the name in `sw.js` is not the one the tool would write. Its name tells you the fix: run `node tools/stamp-sw.mjs`. You will see that test go red in Exercise 5 the moment you edit an engine file. That is the tripwire working, not a bug.

Two smaller details. While saving, each file is fetched as `file?v=<cache name>` so GitHub's CDN cannot hand back a ten-minute-old copy, and saved under its plain address. And after an update, a returning visitor sees the old version for one more visit while the new files save in the background. The panel says so.

`sw-register.js` turns the worker on after the page has loaded. Opening the page with `?nosw` on the end does the opposite: it removes the worker and reloads once, so you are never testing against a stale saved copy. There is no special case for localhost, because offline has to be testable on your own computer too. **When you test locally, use `http://localhost:4173/?nosw`.**

---

## Part 6. The tests

Three layers, each written by someone who could not copy from the layer before.

```
  Layer 1   HAND-DERIVED VECTORS                 "Is the answer right on known cases?"
            30 cases worked from the regulation, not from the engine.
            TV01 is yours. TV02 is printed in the regulation itself.
                        |
  Layer 2   PROPERTY TESTS + A SECOND ORACLE      "Is it right on cases nobody picked?"
            thousands of random accounts, rules that must hold for all of them,
            and a differently written checker inside the test file
                        |
  Layer 3   THE INDEPENDENT AUDIT (audit/)        "Would a stranger agree?"
            a second implementation written BEFORE its author was allowed
            to read the engine. 150,000 random accounts. Zero disagreements.
```

**Layer 1.** The research agent derived each vector by hand from the method, then a throwaway script recomputed every case two independent ways and refused to output anything unless hand = method 1 = method 2. Your `v0/engine.js` was not used to produce any expected value. TV02 must reproduce all three tables printed in Appendix E. TV03 and TV04 must reproduce the tables HUD printed. TV22 to TV29 were added later by the independent auditor.

**Layer 2.** `tests/properties.test.js` builds random accounts from a seeded generator, so a failure can be replayed exactly (`SEED=12345 node --test tests/properties.test.js`). It checks rules that must hold for every account: adding $x to the starting balance moves the difference by exactly $x, shuffling the bill order changes nothing, every output is a whole number and none is `-0`. An **oracle** is a second, trusted way to get the answer that you compare against. The one in this file uses a closed-form formula ("cushion + the worst gap between bills paid and deposits made") instead of a table, and `BigInt` instead of ordinary numbers, so it shares no code, no loop shape and no number type with `analyze.js`.

**Layer 3.** The auditor wrote `audit/oracle.mjs` from the regulation text before being allowed to read `engine/`, `tests/` or `v0/`. It finds the required starting balance by searching for the smallest opening balance that never lets the year drop below the cushion, which is a third approach again. The fuzzer was itself proved first: it passes two correct engines and catches all 12 planted bugs (`node prove-harness.mjs`). Then: 5 seeds × 20,000 mixed accounts + 10 case families × 5,000 = **150,000 random accounts, 0 throws, 0 disagreements, 0 invariant failures**, plus 3,000 extreme ones. All 150,000 were re-run on 2026-09-19 while this doc was being written, with the same zeros. The commands are in `docs/VERIFICATION.md` Part 4.

### Each test file

Counts are from the last full run while this doc was being written (2026-09-19, engine at commit `3f67d12`): 636 tests in 17 files, 635 passing. The one failure was the cache-name tripwire in `tests/shell.test.js`, because engine files had changed since the last stamp. `node tools/stamp-sw.mjs` clears it. `npm test` prints the current total.

| File | Tests | What it proves | One assertion in plain words |
|---|---:|---|---|
| `tests/vectors.test.js` | 67 | The engine reproduces every research vector, cent for cent. Checked two ways: through `runSelfCheck`, and directly with Node's own `deepStrictEqual`, so a bug in the checker could not make a wrong engine look right. | "TV02 needs $1,040 to start, not the $1,130 the banned single-item method gives." |
| `tests/vectors-sync.test.js` | 5 | `engine/vectors.js` is an exact copy of the research JSON. | "VECTORS is identical to the research JSON's vectors." |
| `tests/selfcheck.test.js` | 27 | The checker itself catches wrong numbers, missing rows, wrong types, `-0`. | "A table with 11 or 13 rows fails against a real vector." |
| `tests/analyze.test.js` | 45 | What the vectors do not pin alone: defaults, refusing bad input, combined tiers, rounding edges, `projectWithPayment`, `nearLine`, and nine named "bug guards". | "A surplus of exactly $50.00 IS refund-required (>=, not >)." |
| `tests/money.test.js` | 102 | Parsing, formatting, the division helpers, month helpers. | "`parseDollars` agrees with whole-cent counting for every cent from $0.00 to $50.00." |
| `tests/validate.test.js` | 46 | Errors block, warnings never do, every vector and example is a valid account. | "A bill of $0 or less is an error against its own row." |
| `tests/compare.test.js` | 68 | Every flag, every tolerance edge, the smaller-cushion courtesy, the mix-up cases. | "A servicer that rounds to whole dollars still matches. One cent past each tolerance is flagged." |
| `tests/explain.test.js` | 60 | Voice (banned words, "this page" not "we"), verdict tones, too-close softening, the jump split always sums. | "No banned word appears in anything the engine can say." |
| `tests/letter.test.js` | 32 | Plain text, visible blanks, which letter kind, hostile text stays text. | "Everything lines up: a plain request for information, not a notice of 'error'." |
| `tests/dates.test.js` | 11 | The hand-made calendar. | "Agrees with JavaScript's own calendar for every day from 2023 through 2032." |
| `tests/examples.test.js` | 10 | The three built-in examples produce the verdicts they claim, number by number. | "Example 2 is the owner's test case #1: low $1,100 in November, surplus $300." |
| `tests/properties.test.js` | 14 | Layer 2. | "THE SECOND ORACLE agrees on every number, the low month, the classification, nearLine and the new payment." |
| `tests/purity.test.js` | 23 | The engine's source has no DOM, clock, network or globals, and `/` appears only in the two helpers. | "The engine loads with no `document`, `window` or `fetch` defined." |
| `tests/pipeline.test.js` | 51 | The exact path the page uses: examples, garbage, hostile text, negative balances, non-January years, file round trip. | "`runCheck` never throws, whatever it is handed." |
| `tests/shell.test.js` | 70 | The files keep the site's promises, on all four pages: exact CSP (the same bytes on each), no inline code, no banned calls, relative paths, every link between the pages lands on a real file and a real id, the top bar and footer match, the precache list matches the import graph from every page's script, cache name is fresh. | "Every page carries EXACTLY the ten directives of the spec, no more and no fewer." |
| `tests/sw.test.js` | 18 | Runs the real `sw.js` inside Node's `node:vm` with a fake network and fake cache, and watches what it does. | "Requests to another website are NEVER answered, and never cause a download." |
| `tests/serve.test.js` | 11 | The local preview server cannot be crashed or tricked into serving files outside the folder. | "A malformed percent sign is a 400, never an exception." |
| `tests/contrast.test.js` | 4 | Added 2026-09-21 with the Keepbook-style reskin. Every text and control color pair in `styles.css` clears WCAG 2.1 AA in the light and the dark theme, worked out by `tools/contrast.mjs` from the tokens themselves. | "Every text and control color pair clears WCAG 2.1 AA in the light and the dark theme." |
| `tests/preview.test.js` | 5 | Added 2026-09-21. The sample result pictured in the hero is built from the engine at load, never typed in; the example tabs wrap round with the arrow keys. | "The hero preview shows example 2, and every string in it is what the engine gives for example 2." |

One honest limit, written in `BUILD-LOG.md`: there is no browser in the test suite (zero dependencies, so no jsdom). Focus handling, the live region, the error boundary and the framing guard are verified by real-browser runs, not by unit tests. A green `npm test` does not by itself prove the page behaves.

---

## Part 7. What the audits caught

Phase 4 had two independent auditors who did not write the code they checked. They found real mistakes. This is the story to be able to tell, because it is the evidence that the checking has teeth.

| # | What was wrong | Who caught it | How it was fixed |
|---|---|---|---|
| 1 | **The spec overstated an identity.** It said low point − cushion always equals the difference. With cent rounding it can be off by 1 to 6 cents (about 4.5% of random accounts). | Math auditor, Stage 1 | The test was wrong, not the engine. The property test now asserts both branches. The "never below $0" floor on the Step 2 add stays. Pinned by TV25. |
| 2 | **A missing case: deficiency when the borrower is not current.** (f)(4)(iii) hands repayment to the mortgage documents. The engine had no classification for it and would have invented a 2-month schedule. | Math auditor, Stage 1 | New classifications `DEFICIENCY_BORROWER_NOT_CURRENT` and its combined forms. Deficiency spread fields are 0. Shortage rules do not change. TV22, TV23, TV24. |
| 3 | **Rounding can flip a verdict at a legal line.** Example: $49.99 by the cents, $50.0067 by exact arithmetic. | Math auditor, Stage 1 | `result.nearLine` and the "too close to call" wording inside a $7.00 band. No refund-required banner inside the band. TV26 to TV29. |
| 4 | **Guidance was labeled as law.** The deficiency-then-shortage split is HUD's 1995 guidance, not regulation text. | Math auditor, Stage 1 | Labeled as guidance, with the cite 60 FR 8812, 8813-14, in comments, the show-the-math panel and the letter. |
| 5 | **Negative zero.** | Math auditor (its harness caught it in its own mock engine first) | `noNegativeZero`, `formatCents(-0)` prints `$0.00`, and a test that walks every numeric output. |
| 6 | **The letter called itself a "Notice of error" when nothing was wrong.** Every refund-required account, every too-close case, and "your payment is lower than expected". | Math auditor, Stage 2 | One rule, `letterKind`. 44 generated letters re-checked: 7 notices, 37 requests, each the right kind. |
| 7 | **A statement that followed HUD's whole-dollar rounding got `PAYMENT_ABOVE_MAX`.** The $1.00 tolerance assumed one rounded figure. The payment is a sum of up to three. | Math auditor, Stage 2 | Scaled tolerance, $1.00 per rounded part. 20,000 simulated whole-dollar servicers: 0 accused (79 of 8,000 on the old engine). |
| 8 | **Two privacy over-claims.** "Even if its code tried" and "0: nothing has been sent or fetched". | QA auditor (both rated blockers) | Reworded to what the mechanism proves. SPEC A4 corrected. See Part 5. |
| 9 | **The stale-cache trap.** Returning visitors could be stuck on old code forever. Proved from this repo's own commit history. | QA auditor | Hash-derived cache name, `tools/stamp-sw.mjs`, and a test that fails when it is stale. |
| 10 | **No error boundary.** Several ways to get a dead page with no message. | QA auditor | The "if the buttons do nothing" paragraph that start-up hides last, `error` listeners, each render step guarded. |

There were more: 15 numbered math-audit defects and 14 QA defects in all, mostly wording that said a little more than the law does ("Most payment jumps are lawful" became "Many", because there is no source for "most"). The full lists are in `docs/verification/`.

**The one to tell straight, because it is about a fix that made things worse.** During Fix Order 1 the team added the "you may have typed your low point into the required-minimum box" rule: when the typed minimum is over the cap and equals the federal low point, do not accuse, show a nudge instead. The Build Chief saw the collision case (a servicer that really does hold an oversized cushion, with the balance sitting right on it) and wrote it down as a rare "known limit". The auditor then simulated servicers instead of users and measured it. For a servicer that over-cushions as a habit, that "rare" case is the normal state, and the rule hid the problem in 19,996 of 20,000 such accounts. Worse, if the person also typed the new payment, a statement with a cushion $600 over the legal limit came out green. That is finding N1 in `docs/verification/math-audit.md` section 8. `BUILD-LOG.md` records whose mistake it was, in plain words.

The replacement is the three-case rule in Part 4 (mix-up, over the cap, cannot tell). The key change: when the engine cannot tell, the result is never green. The auditor's exact repro is now a named test: bills of $3,600 in June and December, balance $1,800, a payment more than 30 days late, required minimum typed as $1,800 against a cap of $1,200, new payment $600. It used to say "Matches". It now raises `CUSHION_MAYBE_OVER_CAP`.

The same pass found N2, which everyone had missed, the Stage 2 audit included. For a borrower who is not current, (f)(4)(iii) hands the schedule for collecting a deficiency to the mortgage documents. The engine had read that as "no limit on the amount", so a $5,000 payment against a $10 deficiency was a green match. The fix is the one-month ceiling in `paymentCeiling`: bills ÷ 12 + shortage ÷ 12 + the whole deficiency. Both fixes landed together in commit `fa578c0`. See `docs/VERIFICATION.md` Part 5 for the status of every Stage 3 item.

What to take from it: nobody who wrote the rule caught it. A different checker, attacking from a different side, did. That is the argument for every layer in Part 6.

---

## Part 8. Try it yourself

Ten exercises, easiest first. Each has the exact command, what you should see, and what it teaches.

**Scratch copies keep the real code safe.** From Exercise 5 on you will break things on purpose. Do that in a copy, never in the repo. Run this from the project folder (the one with `package.json` in it):

```
rsync -a --exclude .git . /tmp/escrow-scratch/
cd /tmp/escrow-scratch
```

What it does: copies the whole project into a temporary folder, leaving out git's own data, and moves you into it. `rsync` comes with macOS. You should see no output from the first command, and `ls` in the new folder should show `engine`, `tests`, `audit` and the rest. macOS clears `/tmp` on restart, so nothing piles up. Everything you break in there stays in there. To get back to the real project, `cd` back to it.

Why `rsync --exclude .git` and not plain `cp -R`: this project folder is a git worktree, so its `.git` is a small file that points at the real repository. A plain copy would carry that pointer along, and then a git command typed inside the copy would act on the real `v1` branch. Leaving `.git` out makes the copy a plain folder that git knows nothing about. That is what you want for breaking things.

To start fresh later, make a new copy under a new name (`/tmp/escrow-scratch-2`). If you would rather delete the old one, the command is `rm -rf /tmp/escrow-scratch`. Read that path twice before you press Enter.

One thing you will notice in any scratch copy: the moment you edit a file the service worker saves (anything in `engine/`, for example), the test named "sw.js CACHE_NAME is up to date…" goes red. That is the stale-cache tripwire from Part 5 doing its job. Ignore it in scratch copies.

### Exercise 1. Run the tests and read the output

```
npm test
```

You should see a long list of check marks and then a summary with `tests`, `pass` and `fail` counts (more than 600 tests, in under 2 seconds). If `fail` is not 0 on the real repo, read the name of the failing test. Test names here are written as full sentences so the name alone tells you what broke.

Then run one file by itself and actually read the test names:

```
node --test tests/analyze.test.js
```

Teaches: where the tests live, what green looks like, and that the test names are documentation.

### Exercise 2. Put one account through the engine from the terminal

```
node --input-type=module -e 'import { analyze, formatCents } from "./engine/index.js"; const r = analyze({ startMonth: 1, startingBalanceCents: 150000, disbursements: [{ label: "tax", month: 5, amountCents: 180000 }, { label: "insurance", month: 7, amountCents: 120000 }, { label: "tax", month: 11, amountCents: 180000 }] }); console.log(r.classification, formatCents(r.surplusCents), formatCents(r.lowPoint.projectedBalanceCents));'
```

You should see:

```
SURPLUS_REFUND_REQUIRED $300.00 $1,100.00
```

That is your test case #1 through the v1 engine. Now change `console.log(...)` to `console.log(r.table)` and match the 12 rows against the table in Part 3.

Teaches: the engine is just a function. No page needed. That is what "pure" buys you.

### Exercise 3. Watch your v0 go wrong, three ways

The deposit bug (TV18):

```
node --input-type=module -e 'import { analyze } from "./v0/engine.js"; const bills = [{ name: "tax", amount: 2100, month: 5 }, { name: "insurance", amount: 1500, month: 7 }, { name: "tax", amount: 2100, month: 11 }]; for (const deposit of [400, 500, 475]) { const r = analyze({ startingBalance: 1125, monthlyDeposit: deposit, bills: bills }); console.log("deposit", deposit, "-> surplus", r.surplus); }'
```

You should see `-1125`, then `-25`, then `-300`. Only the last is true.

The month-13 bug:

```
node --input-type=module -e 'import { analyze } from "./v0/engine.js"; const bills = [{ name: "tax", amount: 1800, month: 5 }, { name: "insurance", amount: 1200, month: 7 }, { name: "tax", amount: 1800, month: 11 }, { name: "typo", amount: 600, month: 13 }]; const r = analyze({ startingBalance: 1500, monthlyDeposit: 400, bills: bills }); console.log(r.total, r.cushionCap, r.lowPoint, r.surplus);'
```

You should see `5400 900 1100 200`. The $600 raised the cap and was never subtracted. No warning.

Float money:

```
node --input-type=module -e 'import { analyze } from "./v0/engine.js"; const r = analyze({ startingBalance: 1500, monthlyDeposit: 400, bills: [{ name: "tax", amount: 1800, month: 5 }, { name: "insurance", amount: 1212.80, month: 7 }, { name: "tax", amount: 1800, month: 11 }] }); console.log(r.cushionCap, r.lowPoint, r.surplus);'
```

You should see `802.1333333333333 1087.1999999999998 285.0666666666665`.

Teaches: exactly why v1 made its three big choices. You can now show each bug live to anyone who asks.

### Exercise 4. Predict by hand, then press the button

```
npm run serve
```

Open `http://localhost:4173/?nosw`. Press the second example ("They're holding too much"). That is test case #1.

Now, before touching the form, take paper. You are going to add a fourth bill: **flood insurance, $600, September**. Work out by hand: the new yearly total, the monthly payment, the cushion cap, the Step 1 column, the lowest month, the Step 2 add, the required start, the surplus, and the projected low point.

Then add the bill on the page and check yourself. Answers: total $5,400, payment $450, cap $900, Step 1 low −$450 in November, add $450, required start $1,350, surplus $150, projected low $1,050 in November.

You will also see the banner turn amber with two things to look at. That is correct: the statement numbers in the example ($400 payment, $300 surplus) no longer fit the bills you changed. Stop the server with Ctrl+C when you are done.

Teaches: the method is small enough to do on paper. If you can do it on paper you can explain it.

### Exercise 5. Break one character and watch the tests catch it

In your scratch copy, open `engine/analyze.js`, find this line in `classify`:

```
    if (amounts.surplusCents >= REFUND_THRESHOLD_CENTS) {
```

Change `>=` to `>`. Save. Run:

```
node --test tests/analyze.test.js
```

You should see 2 failures out of 45. One is the test named "bug 1 guard: a surplus of exactly $50.00 IS refund-required (>=, not >)", with a message like:

```
+ 'SURPLUS_UNDER_50'
- 'SURPLUS_REFUND_REQUIRED'
```

Read it as: the engine said `SURPLUS_UNDER_50` (+ actual), the test expected `SURPLUS_REFUND_REQUIRED` (- expected). The other is the too-close-to-call test, which also puts a surplus at exactly $50.00.

Now run the whole suite with `npm test`. You should see 8 failures: those two, TV06 failing through three different routes (the self-check, the same check read straight from disk, and the direct comparison), the test that runs every vector through the page's path, the "every vector passes" total, and the cache-name tripwire.

Put the `>=` back and run `npm test` again.

Teaches: one character of law, "greater than or equal to", is guarded from several independent directions.

### Exercise 6. Let the stranger's fuzzer find your bug

Still in the scratch copy, break the `>=` again. Then:

```
cd audit
node fuzz.mjs --n 2000 --seed 1
```

You should see a list of disagreements with full inputs and, at the bottom, `RESULT: FAIL`. The auditor's oracle has never seen your change and disagrees with it. Fix the line, run it again, and you should see:

```
RESULT: PASS (engine agrees with the independent oracle on every case and holds every invariant)
```

Then see how the fuzzer itself was proved:

```
node prove-harness.mjs --n 5000
```

You should see two correct engines pass, then a list of planted bugs each marked `CAUGHT`, ending with `HARNESS PROVEN`. Open `audit/mock-engine.mjs` and find the line for `BUG === 'order'`. That is your Step 4 from Part 3 done wrong on purpose (a second bill in the same month overwrites the first).

Teaches: how you know a checker works. You plant bugs and make sure it catches them.

### Exercise 7. Write your own test case by hand

On paper, invent an account (three or four bills, a starting balance) and work every number by hand, like Exercise 4. Then in the scratch copy create `tests/mine.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { analyze } from "../engine/index.js";

test("my own case, worked by hand first", () => {
  const result = analyze({
    startMonth: 1,
    startingBalanceCents: 150000,
    disbursements: [
      { label: "Property tax", month: 5, amountCents: 180000 },
      { label: "Homeowners insurance", month: 7, amountCents: 120000 },
      { label: "Flood insurance", month: 9, amountCents: 60000 },
      { label: "Property tax", month: 11, amountCents: 180000 },
    ],
  });
  assert.equal(result.annualDisbursementsCents, 540000);
  assert.equal(result.baseMonthlyPaymentCents, 45000);
  assert.equal(result.cushionCapCents, 90000);
  assert.equal(result.stepTwoAddCents, 45000);
  assert.equal(result.requiredStartingBalanceCents, 135000);
  assert.equal(result.surplusCents, 15000);
  assert.equal(result.lowPoint.projectedBalanceCents, 105000);
  assert.equal(result.lowPoint.calendarMonth, 11);
});
```

(That one is Exercise 4's account, so you can see the shape. Replace it with yours.) Run:

```
node --test tests/mine.test.js
```

You should see one passing test. If it fails, find out who is wrong, you or the engine. It will almost always be the arithmetic on paper, and finding the slip is the exercise.

Harder version: pick a total that does not divide by 12 (say $5,000.10) and get the rounding right. P rounds half up. The cap rounds down.

Teaches: the expected numbers must come from outside the engine. A test that copies the engine's output proves nothing.

### Exercise 8. Re-type `divideRoundHalfUp` from a blank function

In the scratch copy, open `engine/money.js` and delete the whole body of `divideRoundHalfUp`, leaving:

```js
export function divideRoundHalfUp(cents, divisor) {
  // your code here
}
```

Run:

```
node --test tests/money.test.js
```

You should see 4 failures (the two `divideRoundHalfUp` tests and the two tests about both helpers). Run `npm test` and a couple of hundred tests fail, because every payment in the engine goes through this one function.

Now write it back without looking. The rules: whole numbers only, never produce a fraction, an exact half goes up, refuse negatives and bad divisors (there is already a helper, `checkDivisionInputs`). Hint: `%` gives the leftover. Run the money tests until all pass, then `npm test`.

Teaches: the single most important trick in the engine. Subtract the leftover first, then the division is exact.

### Exercise 9. Rebuild Steps 1 to 3 against the regulation's own example

In the scratch copy, create `my-steps.mjs`. Without looking at `analyze.js`, write a function that takes a list of bills (`{ month, amountCents }`) and returns the required starting balance, using only what Part 3 taught you. Test it on Appendix E's example at the bottom of the file:

```js
const bills = [
  { month: 1, amountCents: 50000 },
  { month: 3, amountCents: 36000 },
  { month: 6, amountCents: 70000 },
];
console.log(requiredStart(bills)); // should print 104000
```

```
node my-steps.mjs
```

You should see `104000`: the $1,040 printed in the regulation. If your Step 1 column is not `-37000, -24000, -47000, -34000, -21000, -78000, …`, print it and compare with the table in `docs/VERIFICATION.md` Part 2.

Teaches: you can reproduce federal law's own worked example from a blank file.

### Exercise 10. Re-type `analyze` from a blank file against all 30 vectors

The final one. In the scratch copy create `my-engine.mjs` that exports your own `analyze(account)`. You may import the helpers from `./engine/money.js`. Do not open `engine/analyze.js`. Start with this so the checker can run:

```js
export function analyze(account) {
  return { annualDisbursementsCents: 0, table: [] };
}
```

Check it against every vector with the auditor's tool:

```
cd audit
node check-vectors.mjs --engine ../my-engine.mjs
```

At first you should see `DIFF` for every vector, each listing the fields that differ, ending with `0 of 30 vectors match the engine…`. Work through the fields in Part 3's order: total, payment, cap, table, Step 2 add, required start, difference, the three amounts, low point, classification and cite, servicer options, new payment, nearLine. The expected shapes are in `docs/SPEC.md` Part C2 and in any vector in `docs/research/01-test-vectors.json`. Watch the score climb.

When you reach `30 of 30`, turn the fuzzer on your own engine:

```
node fuzz.mjs ../my-engine.mjs --n 20000 --seed 20260919
```

`RESULT: PASS` means a blind second implementation agrees with the engine you wrote, on 20,000 accounts you have never seen.

Teaches: everything. When this passes, the engine is yours.

---

## Part 9. Twenty questions a skeptical adult might ask

**1. How do you know the math is right?**
Three separate checks that could not copy from each other. First, 30 worked cases whose expected numbers came from the regulation's method, not from the code. One is the example printed in the regulation itself (Appendix E: $1,560 of bills, $130 a month, low of −$780 in December, $1,040 to start), and the engine reproduces all three of its printed tables number for number. Second, random testing against a differently written checker. Third, an independent auditor wrote a second implementation before being allowed to read ours, then ran 150,000 random accounts through both: zero disagreements. And the page can re-run all 30 cases in your own browser. I can show any of that running right now.

**2. What does the tool do when the servicer is right?**
It says so, in green: the statement's math matches the federal method, here is the shortage, here is what it adds per month, that is allowed. That is the most common real outcome and the page is built for it. Its wording is "Many payment jumps are lawful. They come from real tax and insurance increases."

**3. Can this page steal my data?**
Precise answer. The page has a browser-enforced rule (a Content-Security-Policy with `connect-src 'none'`) that blocks background connections: `fetch`, XHR, WebSocket, beacons. That is how pages normally send data out quietly. It does not block a link navigation with data in the address, a same-site file request with data in the query string, or the service worker. Those are closed by the code, which never does any of them, and by tests that fail the build if that changes. The code is open to read. Nothing is stored: no cookies, no local storage. The files are hosted on GitHub Pages, which like any host can see that your browser downloaded them. It never sees what you type. The test you can run yourself: open the page, turn on airplane mode, and check your numbers. It still works.

**4. Why not just use ChatGPT?**
Three reasons. A chatbot can make arithmetic mistakes and can give a different answer tomorrow. This engine is fixed code: same input, same output, tested against 30 pinned cases. Second, with a chatbot you paste your mortgage numbers into someone's server. Here nothing leaves the page. Third, every number here shows its work and the exact paragraph of the rule. And to be straight about it: AI wrote this code. But code that is written once, tested, audited and open is a different thing from asking an AI for a fresh answer each time.

**5. What happens if my escrow year starts in July?**
That works. You pick the first month and the engine numbers months 1 to 12 from there. The regulation's own example runs July to June, and it is one of the test vectors (TV02). Others start in September (TV03, TV04) and April (TV13). All 144 month conversions are tested both ways.

**6. What is the difference between a shortage and a deficiency?**
A deficiency is real and already happened: the account is below $0 because the servicer paid a bill with its own money. It can be collected fast, in as few as 2 monthly payments. A shortage is a forecast: the balance is positive but lower than it needs to be for next year. It has to be spread over at least 12 months, unless it is smaller than one month's payment. A projected dip below zero later in the year is not a deficiency. When both exist, the tool counts the part below $0 as deficiency and the rest, from $0 up to the target, as shortage. That split is HUD guidance from 1995, and the page says so.

**7. Who wrote this code?**
AI agents wrote all of v1: the engine, the page, the tests, the research notes. I directed it: the idea, who it is for, the phases, and the rules (no cost, no dependencies, nothing leaves the browser, the engine must stay readable enough that I can explain every line). What I typed myself is everything in `v0/`, and I derived test case #1 by hand from the regulation before any code existed. It is still the first test vector. All of that is in `AI-DISCLOSURE-LOG.md` and `BUILD-LOG.md`, including the agents' own mistakes. My job since then has been to understand it well enough to rebuild it, which is what the exercises in this doc are for.

**8. What does the $7 tolerance mean and where does it come from?**
The regulation never mentions cents. HUD's 1995 guidance says any dollar amount may be rounded to the nearest dollar (60 FR 8812). A servicer that rounds every figure that way can drift 50 cents a month for 12 months plus 50 cents on the cushion: $6.50. So the tool calls balances within $7.00 a match. It is this project's choice, not law, and it is labeled that way.

**9. And the $1, $2, $3 on the payment?**
The most a payment can lawfully be is a sum of up to three parts (bills ÷ 12, shortage ÷ 12, deficiency ÷ 2), and a whole-dollar servicer rounds each part separately. So the tool allows $1.00 per part. The first version allowed a flat $1.00, and the auditor showed a lawful statement getting flagged for being $1.04 over. The cost of the fix is that a payment truly over by $2 or $3 a month can pass: at most $24 or $36 a year, which comes back as a surplus at the next analysis.

**10. Is this legal advice?**
No. It is arithmetic with citations. It says so on the page, and the letter says "This letter states arithmetic, not legal conclusions." It never tells anyone what they should do and never promises a refund.

**11. Why does the tool compute the monthly deposit instead of letting me type mine?**
Because the regulation defines the deposit used in the projection as one-twelfth of the coming year's bills. My first version let you type it. Type last year's payment and a true $300 shortage shows up as $1,125. Type the new payment that already includes a shortage add-on and it shows up as $25. So the engine computes it, and your statement's payment is only compared against the math.

**12. Why whole cents? Isn't that overkill?**
Computers cannot store most decimals exactly: `0.1 + 0.2` is `0.30000000000000004`. My first version could print a dollar amount with thirteen decimal places, and its "exactly zero" check could never fire. In whole cents every add and compare is exact. Division is the only risky operation, so it lives in two small functions, and a test fails if division appears anywhere else in the engine.

**13. My servicer uses a smaller cushion than you calculated. Is that a problem?**
No. Everything the method produces is a ceiling. The rule says servicers "may use a cushion less than the permissible cushion or no cushion at all". The tool says that is allowed, and then checks the servicer's shortage figure using the servicer's own smaller cushion, so it does not get flagged for being generous.

**14. What does "too close to call" mean?**
Two lines in the rule turn on an exact figure: $50.00 for the refund, and one month's payment for the repayment options. If the tool's figure is within $7.00 of one of those lines, a servicer rounding to whole dollars, which HUD's guidance allows, could land on either side. The tool states its cent-exact figure, says it is too close to call, and does not show the refund-required banner. Overclaiming at a legal line would be worse than admitting the limit.

**15. Why is the letter sometimes a "notice of error" and sometimes a "request for information"?**
They are two different things in Regulation X. A notice of error (12 CFR 1024.35) has to state the error the borrower believes occurred. A request for information (12 CFR 1024.36) just asks. The tool writes a notice of error only when a number on the statement is over a limit or contradicts the math. If the statement matches, or the figure is too close to call, or the question is only "why is there a lump-sum option?", it writes a request for information. The first version got this wrong and the independent auditor caught it.

**16. What can't it do?**
It is only as good as the numbers typed in. The servicer may have a newer tax bill than you do, so a mismatch is not proof of a mistake. It covers escrow only, and only the federal ceiling: state law can be stricter. It does not model bills that come less often than yearly (a 3-year flood premium), biweekly payment plans, or loans RESPA does not cover. It checks the projection for the coming year, not whether last year's bills were paid correctly. And it cannot read a statement for you.

**17. AI wrote the tests too. How does a test suite written by the same AI prove anything?**
Fair question, and it is why the checks were built so they could not copy each other. The expected numbers come from the regulation, and one case is printed in the regulation itself. The auditor was a separate agent that had to write its implementation before it could read the engine, and its fuzzer was proved against 12 planted bugs before it was trusted. And the audits found real mistakes, in the spec, in the words and in the comparison rules. A rubber stamp finds nothing. Finally, you do not have to trust any agent: the cases are readable, the page re-runs them in your browser, and I can do test case #1 on paper in front of you.

**18. What happens if someone types garbage, or tries to attack it?**
Money text is read character by character and anything that is not a dollar amount gets a plain message that never repeats what was typed. Out-of-range months, zero bills and absurd amounts are errors before any math runs. For attacks: typed text only ever reaches the page as plain text. `<img src=x onerror=alert(1)>` as a bill name shows up as those literal characters. The scripts cannot set `on…` or `style` attributes at all, a test scans for `innerHTML` and dozens of similar calls, and the CSP forbids inline scripts even if something slipped through.

**19. Does it really work offline? What is the catch?**
After one visit, in most browsers, yes. A service worker saves the site's own files and serves them from the saved copy. The catches: private windows and some locked-down browsers refuse service workers, and after an update a returning visitor sees the old version for one more visit. There used to be a worse catch, where visitors could be stuck on old code forever. The cache name is now a hash of the files, and a test fails when it is stale.

**20. What did the audits find wrong, and is anything still open?**
They found the spec overstating a math identity, a missing legal case for borrowers who are behind, verdicts that could flip on rounding, a letter mislabeled as a notice of error, a tolerance that falsely flagged lawful statements, two privacy sentences that claimed more than the browser enforces, a cache trap, and no error handling on start-up. All fixed, each with a named regression test. The re-check then found that one of the fixes had opened a new hole where an over-cushioned statement could come out green, plus a missing payment ceiling for borrowers who are behind. Both are fixed now too, and the build log says in plain words whose mistake each one was. The state of every item, and the limits that are still real, are in `docs/VERIFICATION.md` Part 5. I would rather show you that list than pretend it is empty.
