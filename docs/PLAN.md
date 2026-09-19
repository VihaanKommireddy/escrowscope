# EscrowScope v1 — build plan (2026-09-19)

Five phases. Director: Claude Fable 5.1, with sub-agents. Spec: `docs/SPEC.md`.
All work happens on the `v1` branch in `~/Research Project/escrowscope-v1/`.
`main` (the live site) is not touched until the owner says ship.

## Phase 1 — Research ✅
| Agent | Output |
|---|---|
| Regulation researcher | `docs/research/01-reg-math.md` (every quote cross-checked across eCFR / CFPB / Cornell LII) + `01-test-vectors.json` (22 vectors, incl. the official Appendix E example) |
| Competitor researcher | `docs/research/02-competitors-and-differentiation.md` |
| Statement-anatomy researcher | `docs/research/03-statement-anatomy-and-next-steps.md` |

## Phase 2 — Plan ✅
`docs/SPEC.md` (architecture, product behavior, engine contract) + this file.

## Phase 3 — Build (two agents in parallel, against the contract in SPEC Part C)
| Agent | Owns | Done means |
|---|---|---|
| **Engine builder** | `engine/*`, `tests/*` | Test-first. All 22 vectors pass unedited; unit + property tests pass; `npm test` green; zero dependencies; zero floats in money paths; every function commented with its regulation cite |
| **UI builder** | `index.html`, `styles.css`, `app.js`, `render.js`, `sw.js`, `manifest.webmanifest` | The page in SPEC Part B, brand kit applied, strict CSP with no inline script/style, works offline, WCAG AA, print stylesheet, no `innerHTML` with user data |

## Phase 4 — Verify (independent agents that did NOT write the code)
| Agent | Job |
|---|---|
| **Math auditor** | Writes its own oracle from the regulation notes WITHOUT reading `analyze.js`, fuzzes thousands of random accounts against the engine, re-derives vectors by hand, hunts for float leaks and off-by-one months |
| **QA + accessibility + security** | Drives the real page in a browser: example flow, every verdict kind, keyboard-only, 320px mobile, dark mode, print, offline after first load, network log stays at 0 requests, XSS attempts through bill names, CSP violations in the console |

Director fixes or re-dispatches on every finding, then re-runs the suite.

## Phase 5 — Execute
- `docs/VERIFICATION.md` — the math mapped to regulation paragraphs, with the vectors.
- `docs/HOW-IT-WORKS.md` — a walkthrough of the code, file by file, so the owner can explain every part.
- `README.md`, `BUILD-LOG.md` (who built what, honestly).
- Commit on `v1`. Local preview: `node serve.mjs`.
- **Shipping to the live site (merge `v1` → `main` + push) waits for the owner's yes.** It is public and permanent, so it is his click.
