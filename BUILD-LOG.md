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
