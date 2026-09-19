# Build log — who built what

Kept honest on purpose. Written as the work happened, not reconstructed later.

## v0.1 – v0.3 (July 2026) — hand-typed

Everything in `v0/` — `engine.js`, `tests.js`, `check.js`, `account.json`,
`index.html` — was typed line by line by Vihaan Kommireddy. Claude explained,
reviewed, and helped debug, but did not write that code.

Test case #1 (bills $4,800 → cushion cap $800 → low point $1,100 in November →
$300 surplus → refund required) was derived by hand from 12 CFR 1024.17 before
any code existed. The v0.1 engine matched it exactly on its first run. That case
is still the first test vector in v1 (`TV01`).

## v1 (2026-09-19) — built by AI agents, directed by Vihaan

Vihaan set the goal and the five-phase structure (research → plan → build →
verify → execute). Claude Code (model: Claude Fable 5.1) ran as director and
spawned sub-agents. The v1 code, tests, research, and docs were written by those
agents.

| Phase | What | Who |
|---|---|---|
| 1 | Regulation research: `docs/research/01-reg-math.md`, `01-test-vectors.json`. Primary sources only (eCFR, CFPB, Cornell LII, HUD Federal Register notices). | Research agent |
| 1 | Competitor + differentiation research: `docs/research/02-…md` | Research agent |
| 1 | Statement anatomy + next steps research: `docs/research/03-…md` | Research agent |
| 2 | `docs/SPEC.md`, `docs/PLAN.md`, `serve.mjs`, `package.json` | Director |
| — | Logo + favicon in `assets/` | AI agents, from an earlier brand-kit run (2026-07-08) |

(Phases 3–5 appended below as they happen.)

### Phase 3 — Build (2026-09-19)

Run by a Build Chief agent (Claude Fable 5.1) that managed its own sub-agents.
Vihaan directed the project; he did not write v1 code. Rows are added as the
work happens, in order.

| # | What | Who |
|---|---|---|
| 3.1 | `docs/BUILD-CONTRACT.md` — written before any code so two builders could work in the same folder at once: file ownership, exact engine exports, the three examples' numbers (worked by hand by the Build Chief from the reg notes), the DOM-free `pipeline.js` seam, error field names, ports. | Build Chief |
| 3.2 | Engine Builder and UI Builder launched in parallel against SPEC Part C/D + the build contract. | Build Chief |

| 3.3 | Engine Builder's first commits seen on `v1`: `dda476d` (`examples.js`), `f17eda0` (`tools/make-vectors.mjs`, generated `engine/vectors.js`, sync test, vector + self-check tests — red on purpose, no engine yet). | Engine Builder |
| 3.4 | SPEC Part E arrived mid-build from the independent math audit (`c43d133`, written by the director). Build Chief read it in full, relayed E1–E5 plus the auditor's nine "bugs to not have" to the Engine Builder, relayed the page-facing parts (E3 banner rule, E2 new classifications, E4 guidance label, E5 no UI-side negation, vector count no longer fixed at 22) to the UI Builder, and added section 4b to `docs/BUILD-CONTRACT.md`. | Build Chief |

| 3.5 | Builder commits seen on `v1` since 3.4: `9af8504` engine core (money, validate, analyze, selfcheck), `842a6eb` UI shell (markup, tokens + components, pipeline seam, renderer, app wiring), `92ae611` Part E in analyze (E1–E5 + nine bug guards as named tests), `3b3293b` compare.js (six flag kinds incl. D6). Commit messages are the builders' own claims; the Build Chief has not yet run the suite against them. | Engine Builder, UI Builder |
| 3.6 | Director appended auditor-written vectors TV22–TV29 and the additive `expected.nearLine` key (`da5b2b3`), plus SPEC E3a. Build Chief checked the file (30 vectors; `engine/vectors.js` stale until regenerated), hand-checked TV25 against E1 (lowest Step 1 balance +6¢ → Step 2 add 0 → target at the low month 20,007¢), relayed regeneration + E3a + TV25 to the Engine Builder and the count / scratch-file rules to the UI Builder, and updated contract section 4b. No builder wrote or edited a vector. | Build Chief |

**A second correction of the Build Chief's own (3.6):** the first Part E relay
floated an optional `side` field on `nearLine`. SPEC E3a rules the shape is
exactly three keys, so that suggestion was retracted in the second relay.

**A mistake of the Build Chief's, caught by the audit (3.4):** the original
Engine Builder brief repeated SPEC C5's property `lowPoint − cushionCap ===
difference` as unconditional. The auditor showed it is exact only when the
lowest Step 1 balance is zero or below; otherwise it is off by that balance
(1–6 cents, from half-up rounding of the monthly payment). The test is what
changes, not the engine. Corrected in the relay and in the contract.

**Clarifications to the spec made in 3.1 (not silent):**

- SPEC D1 says the self-check "compares every expected field". Two keys inside
  the research vectors' `expected` blocks are documentation, not engine output:
  `exactArithmeticReference` (TV15, the no-rounding reference figures) and
  `whatGoesWrong` (TV18, what a *wrong* engine would print). The contract has
  `runSelfCheck` compare every other key, return those two as `skippedKeys`
  so the page says so out loud, and requires a test that the skip list is
  exactly those two. `whatGoesWrong` is still checked in `tests/` through
  `projectWithPayment`.
- SPEC C2 lists `validateAccount(account)` only. The B3 nudge "this looks like
  a whole mortgage payment" needs the statement's numbers, so the contract adds
  `validateStatement(statement, account)` with the same return shape.
- SPEC B2 doesn't list form fields for `cushionMonths` or `borrowerCurrent`,
  which the engine needs (TV16, TV17, TV20). The contract puts them in a
  collapsed "Less common situations" group, defaults 2 months / current.
- SPEC D3 example 2 (TV01) doesn't say what the statement claims. Build Chief's
  call: the statement agrees ($300 surplus), so the example shows the C4 rule
  "a required refund always surfaces in amber even when the statement agrees",
  and carries an analysis date so the D8 refund clock has something to show.
- Re-read reg notes §6–§7 against SPEC D6 as D6 instructs: no disagreement
  found. Small shortage = do nothing / 30-day lump sum / 12+ months, so a
  2–11 month spread is outside the listed options; large shortage = do nothing
  / 12+ months only; the CFPB FAQ quote supports wording `LUMP_SUM_OFFERED` as
  a question to ask.
