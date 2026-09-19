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
  competitor researcher, statement-anatomy researcher, Engine Builder, UI
  Builder, and any helpers listed in `BUILD-LOG.md`).
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

- The 22 test vectors' expected values were derived from the regulation's own
  method, not from the engine, and include the worked example printed in the
  regulation itself (Appendix E) and two examples HUD published.
- The page can re-run all 22 on the visitor's own device ("Don't take our word
  for it").
- Phase 4 of the build is an independent math audit and a browser
  QA / accessibility / security pass by agents that did not write the code.
  Their findings are recorded in `BUILD-LOG.md`.
