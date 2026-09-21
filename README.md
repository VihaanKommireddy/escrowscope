# EscrowScope

EscrowScope answers one question that homeowners can't easily answer, which is
why did my mortgage payment just jump?

The page is live at https://vihaankommireddy.github.io/escrowscope/ and it is free.

About 40 million US households pay into an escrow account, where the mortgage
servicer collects extra money each month to pay property taxes and insurance.
Once a year the servicer runs an escrow analysis and mails out a statement that
almost nobody can read. The math behind that statement is federal law (RESPA,
12 CFR 1024.17), and the cushion the servicer is allowed to hold is capped at
one sixth of the year's bills.

You type the numbers from your statement into the page, and it redoes the math
the rule requires and tells you in plain English what it found. Many payment
jumps are lawful because tax and insurance bills went up, and the page says so
when that is the case. When a number on the statement does not match the federal
math, the page shows the gap in dollars and gives you a calm letter you can send
to ask about it.

## What it does

- Compares what your statement says with what the federal math says, line by line
- Splits a payment jump into bills going up, shortage repayment, and anything the math can't explain
- Draws your balance month by month with the legal cushion limit and your servicer's payment on the same chart
- Shows every step of the math with the paragraph of the rule it comes from
- Writes a letter to your servicer from your numbers, which you can edit, copy or print
- Shows you where each number lives on a sample statement, so you can find it on yours
- Says "too close to call" when a result sits within a few dollars of a legal line, as servicers are allowed to round

## The math

1. Add up the bills the servicer will pay in the next 12 months.
2. Divide by 12, which gives the regular monthly escrow payment.
3. Take one sixth of the yearly bills, which is the most cushion the rule allows (two months).
4. Run the 12 months, adding the payment and subtracting each bill in the month it is paid, and find the lowest month.
5. The balance the account should start with is whatever keeps that lowest month exactly at the cushion.
6. Compare that with the real starting balance. More is a surplus (at $50 or more the rule says it is refunded within 30 days), less is a shortage, and a balance below zero is a deficiency.

All money is whole cents inside the engine, so there are no floating point surprises.

## Privacy

Everything runs in your browser. There is no account and no tracking, and
nothing is stored. The page carries a rule near the top of its code (a
Content-Security-Policy with `connect-src 'none'`) that makes your browser block
the page from opening background connections, which is how pages normally send
data out. The files are hosted on GitHub Pages, which like any web host can see
that your browser downloaded them, and it never sees what you type. After your
first visit the page works with the internet turned off in most browsers.

## How I know the math is right

I pulled 12 CFR 1024.17 from the official eCFR site and worked a full 12 month
trial balance by hand before I wrote any code. That is test case #1, with $4,800
in bills, an $800 cushion cap, a low point of $1,100 in November and a $300
surplus. The first engine I typed matched it exactly on the first run, and it is
still the first of the test cases today.

There are 30 test cases now. They include the worked example printed in the
regulation itself (Appendix E) and two examples HUD published. The page can rerun
all 30 on your own device with one button, so you do not have to take my word
for it.

An independent audit also rebuilt the math from the regulation without looking
at the engine, and then ran 150,000 random accounts through both. They agreed on
every one. That harness is in `audit/` and the report is in
`docs/verification/math-audit.md`.

## Who built what

I typed every line of v0.1 to v0.3 myself, and that code is kept in `v0/`.

For v1 I directed a team of AI agents (Claude Code) through five phases, which
were research, plan, build, verify and execute. The agents wrote the v1 code,
the tests, the research notes and the docs. I set the goal, the structure and
the rules they worked under. `BUILD-LOG.md` and `AI-DISCLOSURE-LOG.md` say who
did what, and I keep them honest on purpose.

## Run it on your own computer

You need Node and nothing else. There are no dependencies to install.

```
node serve.mjs
```

Then open http://localhost:4173

```
npm test
```

```
cd audit
node fuzz.mjs --n 20000 --seed 99
```

## What it can't tell you

This is math and it is not legal advice. It is only as good as the numbers typed
in, and your servicer may have a newer tax bill or insurance premium than the one
on your statement, so a mismatch is a question to ask and it is not proof of a
mistake. It only checks the escrow rule, and some loans (like home equity lines
of credit) are not covered by that rule at all.

## Where things are

| Path | What it is |
|---|---|
| `index.html` + `landing.js` | The landing page: the pitch, a sample result, the three examples |
| `motion.js`, `motion.css` | What moves on the landing page. The sample result plays the three examples, with a Pause button. None of it runs if your device asks for less motion |
| `check.html` + `check.js` | The tool: the form in four steps, the result in six tabs (`render.js`, `chart.js`, `guide.js`, `tabs.js` do the drawing) |
| `proof.html` + `proof-page.js` | The self check, run on your device as the page opens (`selfcheck-ui.js`) |
| `privacy.html` + `privacy-page.js` | The privacy panel (`proof.js`), what the site can't tell you, how it works, the glossary |
| `site.js`, `site.css` | The top bar, footer and menu every page shares, and the styles for the four page layout |
| `sw.js` | The service worker. It saves all four pages, so each one opens offline |
| `engine/` | The math, with no page code in it, so it runs the same in Node and in the browser |
| `styles.css`, `assets/fonts/` | The look, and the one font file (Fraunces, for headings) with its license notice |
| `tests/` | The test suite (`npm test`) |
| `audit/` | The independent second implementation and the fuzzer |
| `docs/research/` | The regulation notes, the 30 test cases, and the research on what else exists |
| `docs/SPEC.md` | The full spec, including every correction the audits forced |
| `docs/HOW-IT-WORKS.md` | A walk through the code, file by file |
| `docs/VERIFICATION.md` | Each piece of the math matched to its paragraph of the rule |
| `v0/` | My original hand typed engine and page |
