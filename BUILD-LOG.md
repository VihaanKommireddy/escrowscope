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
