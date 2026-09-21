# AI disclosure log

Plain statement of who wrote what in this repository. No spin in either
direction. The running detail (which agent built which file, and when) is in
`BUILD-LOG.md`.

## What Vihaan Kommireddy wrote by hand

- Everything in `v0/`: `engine.js`, `tests.js`, `check.js`, `account.json`,
  `index.html` (v0.1–v0.3, July 2026). He typed it line by line. Claude
  explained, reviewed, and helped debug, but did not write that code.
- **Test case #1**, derived by hand from 12 CFR 1024.17 before any code existed:
  bills $4,800 → cushion cap $800 → low point $1,100 in November → $300 surplus
  → refund required. It is still the first test vector in v1 (`TV01`) and one
  of the three built-in examples on the page.

## What AI wrote

- **All of v1.** Every file outside `v0/`: the engine (`engine/`), the page
  (`index.html`, `styles.css`, and the root-level `.js` modules), the service
  worker, the tests (`tests/`), the tools (`tools/`), the research notes and
  test vectors (`docs/research/`), the spec, plan and build contract (`docs/`),
  and the logs including this one.
- Written by Claude Code agents (model: Claude Fable 5.1): a director agent, a
  Build Chief agent, and the sub-agents they spawned (regulation researcher,
  competitor researcher, statement-anatomy researcher, Engine Builder, Engine
  Finisher, UI Builder and its helpers, an independent math auditor, an
  independent QA auditor, a docs writer, and any others listed in
  `BUILD-LOG.md`).
- The logo and favicon in `assets/` came from an earlier AI-agent brand-kit run
  (2026-07-08).

## What Vihaan directed

- The idea, the goal, and who it is for.
- The five-phase structure: research → plan → build → verify → execute.
- The instruction for this run: change the plan wherever it makes the product
  much better and clearly different from anything else out there.
- The rules the agents worked under: $0, no dependencies, nothing leaves the
  browser, the engine must stay readable enough that he can explain every line,
  and shipping to the live site is his click, not an agent's.

## How the numbers were checked (so nobody has to take AI's word for it)

- There are 30 test vectors. 22 came from the research phase and include
  Vihaan's hand-derived test case #1, the worked example printed in the
  regulation itself (Appendix E) and two examples HUD published. 8 were added
  during verification by an independent auditor agent, derived by hand from the
  regulation without looking at the engine. Expected values come from the
  regulation's method, never from the engine's output.
- The page can re-run all 30 on the visitor's own device ("Don't take our word
  for it").
- The independent math auditor wrote a second implementation from eCFR before it
  was allowed to read the engine, then ran 150,000 random accounts through both.
  Zero disagreements. It also found 20 defects in the comparison flags and the
  wording, and all 20 were ordered fixed. Report: `docs/verification/math-audit.md`.
- The independent QA auditor found 14 defects. The two worst were the page
  claiming more privacy than its mechanism proves. Those were fixed by changing
  the words to say exactly what the browser enforces. Report:
  `docs/verification/qa-audit.md`.
- One miss was caused by the director agent itself: a rule it ordered (treat a
  "required minimum" that equals the lowest projected balance as a typing
  mix-up) let a genuinely over-cushioned statement come out green. The
  independent auditor caught it and the rule was replaced.
- Not verified by anyone: Safari, Firefox, a real phone, a screen reader. The
  page was tested in Chromium only.

## 2026-09-21: the Keepbook-style restyle

- AI wrote it. A Claude Code agent (model: Claude Fable 5.1) restyled the page on
  the branch `ui-keepbook`: the stylesheets, the new top and bottom of
  `index.html`, two small new modules (`tabs.js`, `preview.js`), a contrast tool
  and the tests that go with them. Details are in `BUILD-LOG.md`.
- Vihaan directed it: he chose the look ("like the Keepbook landing page", his
  own earlier project), and merging or shipping it is his call.
- The font (Fraunces) is not AI-made. It is an open-source typeface under the SIL
  Open Font License 1.1, copied from the Keepbook project.

## 2026-09-21: four pages instead of one

- AI wrote it. A Claude Code agent (model: Claude Fable 5.1) split the one long
  page into four on the branch `site-v2`: `index.html` (landing), `check.html` (the
  tool, with the form as four steps and the result as six tabs), `proof.html` and
  `privacy.html`, the new scripts and stylesheet that go with them, and the tests.
  The engine was not touched. Details are in `BUILD-LOG.md`.
- Vihaan directed it: the complaint ("everything is on one page I HATE THAT"), the
  model to copy (his own Keepbook landing page), and the structure were his.
  Merging or shipping it is his call.
- Not verified by anyone: Safari, Firefox, a real phone, a screen reader.

## 2026-09-21: the landing page moves

- AI wrote it. A Claude Code agent (model: Claude Fable 5.1) added the motion layer on
  the branch `site-v2`: `motion.js`, `motion.css`, the changes to `preview.js`,
  `tabs.js`, `site.css` and `styles.css` that go with them, and the tests
  (`tests/motion.test.js` is new). It used the `frontend-design` and `ui-ux-pro-max`
  skills. The engine was not touched. Details, and what was and was not checked,
  are in `BUILD-LOG.md`.
- Vihaan directed it: he picked the site to learn from (modalyst.co) and said what
  he liked about it, "the moving figures and the parallax". Merging or shipping it
  is his call.
- Not verified by anyone: Safari, Firefox, a real phone, a screen reader, and how
  the loop feels watched live (it was checked from measurements and screenshots in
  headless Chrome).
