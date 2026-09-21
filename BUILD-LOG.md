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

| 3.7 | SPEC E3a.6 landed (`5f301d4`) minutes after relay 3.6: extra descriptive keys on `nearLine` and the `result.inputs` echo are allowed; vectors pin only three keys. Build Chief sent both builders a correction, told the Engine Builder to prove with deliberately broken fake results that `runSelfCheck` ignores extra keys but still fails on missing keys, wrong values, null-vs-object, wrong table length and `-0`, and rewrote contract 4b to match. | Build Chief |

**The `nearLine.side` back-and-forth, stated plainly (3.4 → 3.7):** the first
Part E relay floated an optional `side` field; relay 3.6 retracted it, reading
E3a's "the shape stays `{ line, distanceCents, toleranceCents }`" as "exactly
three keys"; E3a.6 then ruled extras are fine, so relay 3.7 reversed the
retraction. Net effect on the code should be nil (the engine shipped `side`
throughout), but the Engine Builder received a wrong instruction for a few
minutes. Phase 4 should confirm the four extra keys are present and that the
explain text still uses them.

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

### Phase 4 — Verify, and Fix Order 1 (2026-09-19)

The checkers did not write the code they checked. Rows are added as the work
happens. "Verified by" says who actually ran it, not who claimed it.

| # | What | Who |
|---|---|---|
| 4.1 | Independent math audit, Stage 2 (`06c2a77`): a blind oracle written from the regulation, a fuzz harness in `audit/`, 150,000 random accounts with **zero disagreements in `analyze`**, and 15 defects logged in `docs/verification/math-audit.md` §5 — all in `compareWithStatement` flags and plain-English wording, none in the core math. | Independent math auditor (did not see the engine while building its oracle); committed by the director |
| 4.2 | Director's own pass: `npm test` 475/475; real browser — three examples correct, 30/30 live proof, request counter 0, XSS attempts inert on every free-text path, works with the server killed, no page-level sideways scroll at 320px. Fixed `package.json` (`node --test tests/` fails on Node 26; now a glob). Found B1–B6. | Director |
| 4.3 | Build Chief re-ran the suite rather than take 4.2 on trust: `npm test` → 475 tests, 475 pass, 0 fail; working tree clean; all `_dev-*` scratch files gone and never committed. Took a pre-fix baseline of the auditor's harness at engine commit `63e498d`: `node fuzz.mjs --n 20000 --seed 99` → `RESULT: PASS`; `node stage2-compare-checks.mjs` → `ALL HARD CHECKS PASSED`. | Build Chief |
| 4.4 | Fix Order 1 dispatched. Engine Builder: all 15 audit defects (A1–A15) + the engine half of B2, each with a named regression test. UI Builder: B1, B3, B4, B5, the page half of A2 / A10 / A11 / A15 / B2. B6 (README still the v0.2 text) is left for the director in Phase 5 on his instruction. | Build Chief |

**Build Chief's calls inside Fix Order 1 (4.4):**

- **A15, checked, not guessed.** Director's rule: keep only contact details
  printed on the official page we link. Build Chief fetched the pages:
  `consumerfinance.gov/complaint/` prints "(855) 411-2372" → stays, on the
  complaint step only. `consumerfinance.gov/find-a-housing-counselor/` does not
  show 888-995-HOPE in its fetched text (same result the auditor got) →
  removed; the counselor step keeps its link and carries no phone. Two honest
  limits: that page is partly script-rendered, so a plain fetch may not see
  everything; and the number is real — a *different* official CFPB page (the
  "What is a HUD-approved housing counseling agency" explainer) lists it. It
  could come back later by linking that page instead. `hud.gov`'s counselor
  page returned almost nothing to a plain fetch, so nothing was taken from it.
- **B2, the "typed my low point as the required minimum" mix-up.** Director
  left the design open. Call: it is a **nudge, not a flag** —
  `comparison.nudges[]`, kind `MINIMUM_LOOKS_LIKE_LOW_POINT`; the cushion row
  gets the new status `"not-compared"` (neither a match nor over the limit);
  `overall` is computed from the other rows only; a nudge can never turn the
  banner amber or turn the letter into a notice of error; the page shows it
  through the existing inline-warning path. **Known limit, stated on purpose:**
  a servicer genuinely holding a 3-month cushion, with the balance sitting
  exactly on it, makes the *federal* low point equal the typed minimum (example
  3's bills with a $2,400 balance: low point $1,800 = typed $1,800, cap
  $1,200). The rule cannot tell that apart from a mix-up, so the message is
  two-sided and keeps the dollars visible: check which line you typed; if the
  statement really lists that figure as the required minimum, it is $X above
  one-sixth of the year's bills and worth asking about. Phase 4 QA should read
  that sentence critically.
- **A2, one rule not two.** The engine exports a single `letterKind(result,
  comparison)`; `buildLetter`, `nextSteps` and the page's letter-panel title all
  read it, so the letter, the next steps and the heading cannot disagree.
- **B5 and parallel work.** The cache name will be derived from a hash of the
  precached files, engine files included, so every engine edit makes the stamp
  stale until `node tools/stamp-sw.mjs` runs. The builders were told to expect
  that one red shell test; the Build Chief re-stamps last, at integration.

#### Fix Order 2 — the independent QA / accessibility / security audit

| # | What | Who |
|---|---|---|
| 4.5 | Independent code-level QA audit (`docs/verification/qa-audit.md`, committed by the director as `96c6144`): 14 numbered defects, 2 of them **blockers**, both about the honesty of the privacy claim rather than about a leak. (1) The "stronger guarantee" text said the browser would block the page from sending data "even if its code tried". A `<meta>` CSP with `connect-src 'none'` blocks background connections (fetch, XHR, WebSocket, beacon). It does not block a clicked or scripted navigation, same-origin file requests, or anything inside the service worker, which a `<meta>` policy does not govern. (2) The counter's "0: nothing has been sent or fetched" is false on a first visit: the service worker downloads the 29 shell files after load, and the page's own resource log cannot see a worker's requests. The auditor also listed a long "checked and clean" section (XSS, hostile input, numbers-file loading, CSP placement, storage, form semantics, live region, chart alternative, reflow). | Independent QA auditor (did not write the code); SPEC A4 corrected by the director |
| 4.6 | Fix Order 2 dispatched and folded into the round already running. Engine Builder: the analysis date into the letter (#6), one bill-name length limit exported from the engine (#13), "this page" instead of "we/us/our" and one term per thing in every engine string, the `parseDollars` message agreeing that commas are fine (#14), and a sweep of engine strings for privacy over-claims (#1–#3) and refund promises (#7). UI Builder: everything page-side in #1–#14, staged by file group because most items touch the same five files. | Build Chief |
| 4.7 | QA #11 (second half) and the `.nojekyll` part of #10, done by the Build Chief to take load off the UI Builder (`0464b38`). **Reproduced first:** on a private port a healthy `serve.mjs` answered 200, then one `GET /%` returned 000 and the process was dead. Fix: the path logic is now a pure exported function `resolveRequestPath(url, root)` that never throws (400 for a malformed `%`, a NUL byte or a non-URL; 403 for leaving the folder; the inside-the-folder check is "is ROOT, or starts with ROOT + separator", so a sibling folder like `escrowscope-v1-backup` is refused), the whole request handler is wrapped so no request can stop the server, and the server only starts when the file is run directly — importing the old file in a test would have bound port 4173. Test written first and watched fail (`tests/serve.test.js`, 11 tests, no port opened). Verified live afterwards: `/%` → 400, encoded `..` → 403, missing file → 404, every shell file → 200 with the right content type including `?v=…` and `?nosw` URLs; process still alive; server stopped, port clear. Empty `.nojekyll` added so GitHub Pages does not run Jekyll (which would blank the 16 `{{placeholder}}` tags in a research doc and silently drop any future file starting with `_`, 404-ing a precache URL and killing offline install). | Build Chief |

**Director's rulings on Fix Order 2, recorded so the code and the log agree:**
auditor's wording for the privacy paragraph and the View-Source comment; the
counter line is "0: this page has not asked the network for anything since it
loaded" under the label "Requests made by this page since it finished
loading", with the service-worker sentence directly under the number; "no
account and no tracking … hosted on GitHub Pages, which like any web host can
see that your browser downloaded the files. It never sees what you type";
offline "in most browsers"; stale-cache defect #4 is the same single mechanism
as B5 (hash-derived cache name + a failing test); the letter becomes editable
with a "Start the letter over" button and **no** name/address boxes (less
personal data typed into the page is better); the refund eyebrow is "If this
surplus is right, the 30-day refund window ends", never "Refund due by"; a
`?nosw` switch with **no** localhost bypass (offline must stay testable
locally); "this page", never "we/us/our"; "The payment the federal math
gives", not "Your lawful payment".

**How DOM behavior is verified (QA #9).** Zero dependencies stands, so there
is no jsdom. `tests/shell.test.js` checks the shell by reading source text and
the file system; `tests/pipeline.test.js` runs the exact DOM-free path the page
uses. Focus management, the live region, error wiring, the error boundary, the
editable letter, the framed-page guard and everything else that needs a real
DOM are verified by **real-browser runs** (the builders', the Build Chief's at
integration, and the director's), not by unit tests. The one executable
exception is the service worker, which can be driven in Node's built-in
`node:vm` with stub `self` / `caches` / `fetch`. A green `npm test` therefore
does not by itself prove the page behaves; the browser runs listed in this log
are part of the evidence.

**Notes for the README (Phase 5 is the director's).** *Offline is a goal;
install-to-home-screen is not.* The manifest's only icon is an SVG `data:` URI
(kept inline so the page makes no extra request and the privacy counter stays
at 0). Chrome's install prompt wants 192/512 PNG icons and iOS wants an
`apple-touch-icon`; we ship neither on purpose and generate no binary assets.
The page still works with the network off after one visit, in most browsers.
After an update, a returning visitor sees the old version for one more visit
(cache-first), then the new one.

| # | What | Who |
|---|---|---|
| 4.8 | Fix Order 1, engine half, landed as `0677461` (A1–A15 + B2, a named regression test for each). **Verified by the Build Chief from a clean `git archive` snapshot of that commit**, so other agents' in-flight edits could not affect the result: engine-owned tests 448 / 448 pass; `node fuzz.mjs --n 20000 --seed 99` → exit 0, `RESULT: PASS`; `node stage2-compare-checks.mjs` → exit 1, "4 HARD CHECK(S) FAILED", 50 `ok` lines. | Engine Builder built it; Build Chief verified it |
| 4.9 | Fix Order 1 + 2, page half: `734d2d3`, `b33dc11`, `213b4db` landed (UI Builder reports `tests/pipeline.test.js` 48/48 and a real headless-Chrome pass at 1280 and 320). The trust-panel / service-worker half (`proof.js`, `sw.js`, `sw-register.js`, manifest, `tools/stamp-sw.mjs`, and all the new shell tests) was still uncommitted with a UI helper at the time of this row; whole-suite `npm test` was 530 / 532, both red tests being that unfinished shell work. | UI Builder + its trust helper; counts run by Build Chief |
| 4.10 | The original Engine Builder ran out of working context after Fix Order 1 and did not start Fix Order 2's engine half (it declined to act on a relayed order it could no longer verify, which was the right call). Build Chief confirmed the gaps on disk (`engine/validate.js` still had a private `MAX_LABEL_LENGTH = 100` and no `MAX_BILL_LABEL_LENGTH` export; engine strings still said "You told us", "By our math", "Tell us yes or no") and spawned a **fresh Engine Finisher** with SPEC Parts C–E, the build contract, the QA audit and the existing test conventions, for: the analysis date in the letter (#6), one exported bill-name limit (#13), the "this page" voice and one-term-per-thing sweep plus the `parseDollars` message (#14), and the over-claim / refund-promise sweeps (#1–#3, #7), each with a runtime scan and a source scan. | Build Chief; Engine Finisher (fresh agent) |

**The deliberate stage2 disagreements after Fix Order 1, exactly as observed
(4.8).** The auditor's `stage2-compare-checks.mjs` is seeded
(`seed = 20260919`), so these reproduce. The director ruled each one correct
new behavior; nobody edited `audit/`; the independent auditor is updating its
own checks. This is the fixed baseline the Build Chief compares against after
integration — anything beyond it is a new finding.

- **A1, scaled payment tolerance — three hard FAIL lines, one root cause.**
  "payment above the maximum by > $1.00 → PAYMENT_ABOVE_MAX": missed 11 of
  5,000 with the borrower current, 11 of 5,000 not current; and "the faster
  payment itself (more than $1.00 a month above the 12-month plan)": missed 6
  of about 10,000. In that third case `SPREAD_TOO_SHORT` still fires, so the
  visitor still gets a look-here. All are payments $1.01–$3.00 over a maximum
  built from two or three separately rounded parts.
- **A12, four-part jump decomposition — one hard FAIL plus a NOTE.** The
  auditor's check still sums two parts.
- **B2, the low-point mix-up nudge — NOT a hard failure.** It appears only in
  the edge tally: with the required minimum typed at exactly cap + $7.01,
  4,937 of 5,000 are flagged and 63 are not. Those 63 are accounts on or near
  target, where the federal low point is within $7 of the cap, so the typed
  figure also sits within $7 of the low point. That is the known limit written
  down in 4.4. The main check, "cushion over cap by > $7.00", still catches
  5,000 of 5,000.

#### Fix Order 3 — the auditor's Stage 3 re-verification

| # | What | Who |
|---|---|---|
| 4.11 | Stage 3 re-verification (`docs/verification/math-audit.md` §8, committed by the director as `6176424`, engine at `f686075`): **all 15 Stage 2 defects verified fixed** against the running code and its generated text, not against commit messages; 100,000 fuzz cases over five seeds with 0 throws, 0 disagreements, 0 invariant failures; the auditor updated its own `stage2-compare-checks.mjs` to the A1 / A3 / A12 / B2 rules and added `stage3-reverify.mjs` (35 checks). It also found **5 new things, two of them wrong answers**: N1 (an over-cushioned statement can come out green) and N2 (no payment ceiling for a not-current borrower with any deficiency), plus N3–N5 (wording). | Independent math auditor |
| 4.12 | Fix Order 3 dispatched: N1–N5 to the fresh Engine Finisher, each with a named regression test built from the auditor's repro, after it finishes Fix Order 2 (c)–(d). The page-facing part (the new flag kind `CUSHION_MAYBE_OVER_CAP`; the UI's own TV01 mix-up pipeline test, which encodes the old rule and must split into two) to the UI Builder. Before relaying, the Build Chief checked the director's three-case rule for holes and pinned two things the ruling left open: the **order** (a) → (b) → (c), because for an excess of $7.01–$14.00 cases (a) and (b) are both true; and **signed** arithmetic for "disagrees by about (typed minimum − cap)", so a statement claiming a shortage where the math finds a surplus is read correctly (federal +$300, statement −$300, excess $600 → gap exactly $600 → case (b)). | Build Chief |

**N1, told straight — whose mistake it was.** The *trigger* for the low-point
mix-up rule came from the director (Fix Order 1, B2: when the typed required
minimum equals the federal low point within $7 and is above the cap, do not
accuse). The *design* of what happens next was the Build Chief's: a nudge
instead of a flag, a "not-compared" cushion row, and `overall` computed from the
other rows. The Build Chief **saw the collision case at the time** — a servicer
genuinely holding a 3-month cushion with the balance sitting exactly on it
makes the federal low point equal the typed minimum — and wrote it into this
log (row 4.4) as a "known limit, stated on purpose", answered only with
two-sided wording. That judgment was wrong in two ways. First, it treated the
case as a corner. The independent auditor measured it: for a servicer that
over-cushions as a habit, an account sitting on that servicer's own target is
the *normal* state, and the rule fired in **19,996 of 20,000** such accounts.
Second, the Build Chief's rule "a not-compared row never makes `overall`
matches by itself" left the door open for any *other* matching row to do it:
type the required minimum and the new payment, and a statement with a cushion
$600 over the legal limit came out **green, "Your statement's math matches the
federal method."** For a not-current borrower that happened 19,997 times in
19,997. A tool whose one job is to catch an over-the-cap cushion was hiding
exactly that, in the common case, behind a polite note. Nobody who wrote the
rule caught it; the independent auditor did, by simulating the servicer instead
of the user. That is what Phase 4 is for.

The replacement (director's ruling): once the trigger is met, (a) a typed claim
that **matches** the federal math proves the servicer's real cushion is within
the cap → mix-up, nudge only; (b) a typed claim that disagrees by about (typed
minimum − cap) proves the typed minimum is real → the ordinary
`CUSHION_OVER_CAP`; (c) anything else cannot be told apart, so it is never
green and never a hard accusation → a new two-sided amber flag
`CUSHION_MAYBE_OVER_CAP`, `overall` "look-here", letter = a request for
information asking the servicer to confirm the required minimum it used.

**N2** was pre-existing and missed by everyone including the Stage 2 audit:
when the borrower is not current, (f)(4)(iii) hands the *schedule* for a
deficiency to the mortgage documents, and the engine read that as "no limit on
the amount", so a $5,000 payment against a $10 deficiency was a green "match".
New ceiling: base + shortage ÷ 12 + the **whole** deficiency (the fastest any
document could collect it is all at once); above that, `PAYMENT_ABOVE_MAX`, and
`explainJump` calls the excess unexplained.

| # | What | Who |
|---|---|---|
| 4.13 | UI Builder finished Fix Orders 1–3 (page side): `734d2d3`, `b33dc11`, `213b4db`, `3bffdfd`, `d69ab76`. **Claims checked against the tree by the Build Chief, not taken on trust:** nothing uncommitted; no file starting with `_` in the root; no listeners on ports 4188–4197; no headless browsers left running; 26 precache entries. Build Chief's own `npm test`: 606 tests, 603 pass, 3 fail — all three expected: the UI Builder's two N1 tests written ahead of the engine change ("B2 case (c)…", "B2 auditor's repro…"), and "sw.js CACHE_NAME is up to date", red because the Engine Finisher committed after the UI's last stamp. That third failure is the new B5 / QA #4 mechanism catching exactly what it exists to catch. | UI Builder + trust helper; verified by Build Chief |
| 4.14 | Engine Finisher landed all four Fix Order 2 engine items: `5174332` (analysis date in the letter, #6), `f686075` (one `MAX_BILL_LABEL_LENGTH = 60`, #13), `a192d60` ("this page" voice, one term per thing, #14), `5989797` (privacy-claim and refund-promise sweeps, #1–#3, #7). Fix Order 3 (N1–N5) not landed at the time of this row. | Engine Finisher |
| 4.15 | **First real-browser pass by the Build Chief** (port 4188, `?nosw`, the pane's Chromium), done before the engine's Fix Order 3 so page problems would surface while the UI Builder could still be resumed. Console: **no messages at all**, on load and after every action (no CSP violations). All 25 buttons have an accessible name (checked by computing names in the page, after a listing tool showed some as blank — it was the tool). **Example 1** → green "Matches", focus on the verdict heading with a visible ring, $300.00 shortage / $25.00 a month / $475.00 month, letter panel titled as a request to explain. **Example 2** → amber "Look here", all three rows "Matches", eyebrow exactly "If this surplus is right, the 30-day refund window ends" + October 1, 2026, letter = request for information under § 1024.36 and prints "dated September 1, 2026". **Example 3** → amber, three flags with the hand-worked dollars ($600.00 over the cushion limit; $600.00 different conclusion; $50.00 a month = $600.00 over 12 months), first month April, letter = notice of error with "I believe the statement contains the error(s) described below." **Live proof:** "30 of 30 checks passed on this device, just now", TV02 and TV01 called out first, provenance reads "22 of these cases came first … 8 more were added later by an independent checker who had not seen the calculator's code". **Privacy panel:** new label and counter line, counter at 0 after clicking all three examples and running the proof, the service-worker sentence directly under the number, the auditor's "stronger protection" paragraph, the GitHub Pages hosting sentence, "Offline copy: switched off for this visit, because the page address has ?nosw in it"; both old false sentences and "no server" are gone from the page text. **320px, dark:** document width 320 = viewport (no sideways page scroll), zero elements overflowing outside the scroll regions, both scrolling tables are named focusable regions, brand dark colors applied. One screenshot came back as a blank dark frame; checked rather than assumed: the verdict was on screen, visible, full opacity, real text under three sample points, and the next capture painted normally — a capture artifact after a scripted scroll, not a page bug. | Build Chief |

**Not re-checked in 4.15 (so nobody reads more into it than is there):** the N1
and N2 repros (the engine fix had not landed), offline behavior (the pass used
`?nosw` on purpose), print, 200% zoom, forced colors, keyboard-only operation
end to end, the framed-page guard, the error-boundary paragraph, the numbers
file download/load, and any browser other than Chromium. The UI Builder reports
checking most of those in headless Chrome; Safari, Firefox, a real phone and a
screen reader have been checked by nobody.

**UI Builder's own list of deviations and judgment calls (from its final
report, recorded as reported):** four CSS files instead of the one in SPEC A2
(`styles.css`, `chart.css`, `guide.css`, `selfcheck.css`); extra root modules
beyond A2 (`dom.js`, `pipeline.js`, `guide.js`, `chart.js`, `proof.js`,
`selfcheck-ui.js`, `sw-register.js`); the tab icon and manifest icons are
`data:` URIs so the request counter can honestly read 0; a "balance is below
zero" tick box because phone keypads have no minus key; a blank bill row is an
error rather than skipped; the shortage-only boxes appear only when relevant;
the big figure in the verdict banner is the UI's pick (largest flag gap, else
the surplus / shortage / deficiency); its own SVG icons rather than the
engine's glyphs; no manual theme toggle (it would need storage); the printed
report omits the chart picture, the jump section, the payment receipts and the
step prose to fit one page; the fallback "your browser may be too old"
paragraph is folded by CSS for 6 seconds rather than hidden in markup; the
View-Source comment says "web sockets" and "beacons" instead of the director's
literal "WebSocket, beacon", because the literal API names are banned tokens in
the shell scan; developer comments in `chart.js` still say "we" (comments are
outside the voice scan). **SHOULD items:** D7 (download / load my numbers)
shipped; D8 (refund clock) shipped and hidden inside the too-close band.
Extras nobody asked for: `#example-N` links, dialable `tel:` links, a glossary.

### Phase 4 close-out and Phase 5 — Execute (2026-09-19, evening)

The Build Chief and the first math auditor were both cut off by the account's
usage limit before they finished (the Chief before its closing drill, the
auditor during Stage 4). Resuming them would have replayed very large contexts,
so the director did the close-out by hand and used one small fresh agent for the
part that has to stay independent.

| Row | What | Who |
|---|---|---|
| 5.1 | Fix Order 3, engine: N1 (three-case cushion rule, new flag `CUSHION_MAYBE_OVER_CAP`), N2 (payment ceiling for a borrower who is not current), N3–N5 wording. Commits `fa578c0`, `3f67d12`. | Engine Finisher agent |
| 5.2 | Ran the auditor's N1, N2 and N3 repros through the engine by hand before accepting the fix: N1 repro amber with a request-for-information letter; cases (a), (b), (c) each behave; N2 flags $1,000, passes at the $510 ceiling, flags past the tolerance; N3 headline corrected. | Director |
| 5.3 | `docs/HOW-IT-WORKS.md` (code walkthrough for the owner, 29 real snippets, 10 exercises, 20 hard questions) and `docs/VERIFICATION.md` (every number and flag mapped to its paragraph of the rule, marked REG / HUD GUIDANCE / OUR CHOICE). The writer read every file and reported two real inconsistencies, fixed in 5.4. | Docs Writer agent |
| 5.4 | Leftovers: one spread-month limit (`MAX_SPREAD_MONTHS`, the page used 120 while the engine allowed 360) with a regression test; comment drift in `compare.js`; "when a refund is due" reworded; example 3 blurb uses "escrow payments"; `AI-DISCLOSURE-LOG.md` brought up to 30 vectors and the Phase 4 agents; `docs/BUILD-CONTRACT.md` §6 lists what Phase 4 added; `README.md` rewritten for v1; `npm test` script fixed for Node 26; service worker re-stamped. | Director |
| 5.5 | Stage 4 of the math audit (scripts updated to the three-case rule, the rule measured against simulated servicers, N1–N5 verified independently). Result recorded in `docs/verification/math-audit.md`, "Stage 4". | Fresh independent auditor agent |
| 5.6 | Stage 4 found two more: **N6** (a "deficiency $0.00" claim unlocked the green path for an over-the-cap cushion of any size: 77,842 of 80,000 simulated) and **N7** (the low point mistyped as the required minimum UNDER the cap drew a notice of error against a lawful statement: 19,922 of 19,923). Both fixed in `engine/compare.js`, test first with the auditor's repros. The auditor's own `stage4-measure.mjs` now reports 0 of 80,000 and 0 of 19,923. The director wrote this fix, so it has script evidence behind it but no independent line-by-line review. | Director |

**Final numbers, run by the director on the final commit:** `npm test` 646 of
646; `audit/check-vectors.mjs` 30 of 30; `audit/fuzz.mjs --n 20000 --seed 99`
PASS; `audit/stage2-code-checks.mjs` ALL PASSED.

**Final real-browser pass (Chromium, by the director):** three examples correct;
live proof 30 of 30; the N1 over-cushion case typed through the real form is
amber with the two-sided sentence; a $52.00 surplus reads "Too close to call"
with no refund date; the "page problem" note is hidden on a healthy load; the
privacy panel carries the corrected wording and the "Offline copy: saved" line;
with the server stopped the page still loads, checks Example 3, passes its own
30 checks, and the request counter reads 0; script injection through every
free-text box stays inert text; no sideways page scroll at 320px; console clean
throughout.

**A trap the director fell into, worth keeping:** the first re-check after the
fixes showed OLD code. The browser still had the service worker from hours
earlier, which serves saved files first, and the old saved `sw-register.js` did
not know the `?nosw` switch yet. One more load let the new hash-stamped worker
replace it. That is the exact failure the QA audit predicted for returning
visitors (defect #4), seen live, and it is also the evidence that the hash stamp
fixes it: the old cache was replaced without anyone bumping a name by hand.

**Accepted, not fixed:** with the (a)-before-(b) order, a servicer only
$7.01–$14.00 over the cap, with "none" claimed and a federal surplus of $7 or
less, reads as a typing mix-up and comes out "matches". Under $14 of cushion is
at stake. The install-to-home-screen prompt is not a goal (the manifest icon is
an SVG data URI so the request counter stays at 0); offline is.

**Verified by nobody:** Safari, Firefox, a real phone, a screen reader,
forced-colors mode on Windows, the `blob:` download under this CSP in Safari.
Chromium only. DOM behavior has no unit tests (no jsdom, zero dependencies
stands); it is checked by real-browser runs.

**Not done on purpose:** nothing was pushed, `main` was not touched, the live
site is unchanged. Shipping is the owner's click.

### 2026-09-21: co-author lines removed from the commit messages

At the owner's request, the `Co-Authored-By: Claude ...` line that ended 55 of
the 60 commit messages was removed. That meant rewriting those commit messages
and force-pushing. The files are byte-identical before and after, the authors
and dates are unchanged, and the five original hand-typed code commits kept
their IDs. GitHub no longer lists Claude in the contributors sidebar because of
this. Who wrote what has not changed, and it is recorded here and in
`AI-DISCLOSURE-LOG.md`: AI agents wrote all of v1, and Vihaan typed everything
in `v0/`.

### 2026-09-21: live site tested at phone size, one fix

The director agent opened the live site in a phone-sized, touch-emulated Chromium
(375x812, mobile user agent). Not a real iPhone: this Mac has no iOS simulator.
Passed: the three examples, the 30 live checks, request counter at 0, service
worker active on the `/escrowscope/` path with 26 files saved, number keypads on
all 9 money boxes, every "Where is this on my statement?" helper fits the screen,
wide tables scroll inside their own boxes, no sideways page scroll, dark mode,
clean console. One bug found and fixed by the director: the editable letter box
was 14px, and iPhone Safari zooms the page in when a text box under 16px is
tapped. Now 1rem, with a regression test that was shown to fail on the old value.
Still verified by nobody: a real iPhone, Safari's engine, a screen reader.
