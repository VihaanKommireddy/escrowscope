# audit/ — the independent math audit harness

This folder is a second, separate implementation of the escrow math in
12 CFR 1024.17 and Appendix E, plus the tools that compare it with the real
engine in `../engine/`. It exists so the engine's numbers are checked by
something that does not share its code or its mistakes.

## What was written blind, and what was not

Written **without reading** `engine/`, `tests/` or `v0/` (Stages 1 and 1.5),
from the regulation text on eCFR, the CFPB site and Cornell LII:

| File | What it is |
|---|---|
| `oracle.mjs` | The independent oracle. BigInt cents. Finds the required starting balance by **searching** for the smallest opening balance that never lets the year drop below the cushion, instead of the usual "minus the minimum" formula. |
| `compare.mjs` | Field-by-field differ (hard fields = math, soft fields = wording). |
| `check-vectors.mjs` | Runs every test vector through the oracle (or the engine) and diffs every number, the classification, the cite and all 12 table rows. |
| `fuzz.mjs` | Seeded random accounts, engine vs oracle, plus invariants that need no oracle. |
| `mock-engine.mjs` | A plainly written stand-in engine with switchable planted bugs. Only used to prove the fuzzer works. |
| `prove-harness.mjs` | Shows the fuzzer passes correct engines and catches every planted bug. |
| `build-new-vectors.mjs` | The hand-derived numbers for TV22–TV29 (literals, does not import the oracle). Writes `new-vectors.json`. |
| `flip-search.mjs` | Finds accounts where cent rounding flips a verdict against exact arithmetic. |
| `new-vectors.json`, `nearline-for-existing.json` | What was handed to the director in Stage 1.5. |

Written **after** reading the engine (Stage 2), as independent checks of the
parts the oracle does not cover:

| File | What it is |
|---|---|
| `stage2-code-checks.mjs` | parseDollars attack strings, month conversion for every start month, "validateAccount really guards analyze", extreme amounts, frozen-input (no mutation) test, static scan for Date / random / globals / division. |
| `stage2-compare-checks.mjs` | `projectWithPayment`, `paymentJumpDecomposition`, `explainJump`, `refundDeadline` (every date 1900–2999), and `compareWithStatement` against **simulated servicers**: lawful ones must not be accused, unlawful ones must be caught. |
| `stage3-reverify.mjs` | Stage 3: re-verifies each of the 15 audit fixes (A1–A15) against generated text and code paths. Since Stage 4 it also holds the hard checks for N1 (the three-case cushion rule, never green), N2, N3, N4 and N5. |
| `stage4-measure.mjs` | Stage 4: measures the three-case N1 rule on 20,000 simulated statements per world. (i) real over-the-cap servicers at steady state: how often green. (ii) lawful servicers whose homeowner mistypes the low point as the minimum: how often a hard accusation. (iii) the overlap of cases (a) and (b), and what the other order would cost. Also carries the repros for the open findings N6 and N7. |

`stage2-compare-checks.mjs` was updated in Stage 3 to the engine's deliberate new rules (A1 scaled payment tolerance, A3, A12 four-part sum, B2 nudge), and again in Stage 4 to fix order 3: the B2 nudge-only rule is replaced by the three-case N1 rule, and the N2 payment ceiling (borrower not current) is checked against a ceiling worked out from the oracle. `stage3-reverify.mjs` was updated the same way, and N2 to N5 became hard checks instead of NOTE lines. Both pass on the current engine. Against the engine before fix order 3 (`fa578c0^`) stage2 fails 7 hard checks, stage3 fails 16 and stage4 fails 2.

To repeat that regression proof without touching the working tree:

```
mkdir -p /tmp/escrow-prefix && git -C .. archive 'fa578c0^' engine examples.js | tar -x -C /tmp/escrow-prefix
node stage2-compare-checks.mjs /tmp/escrow-prefix/engine/index.js --n 20000
node stage3-reverify.mjs /tmp/escrow-prefix/engine/index.js --n 20000
node stage4-measure.mjs /tmp/escrow-prefix/engine/index.js --n 20000
```

Two changes were made to `fuzz.mjs` / `compare.mjs` in Stage 2 at the
director's request (SPEC E3a.6): `result.inputs` is left out of the "bill order
changes nothing" check, and extra descriptive keys on `nearLine` are ignored.

## Commands (run from this folder; Node 18+; no dependencies)

```
cd audit

# 1. All test vectors vs the independent oracle, then vs the real engine
node check-vectors.mjs
node check-vectors.mjs --engine

# 2. Fuzz the real engine against the oracle (default engine: ../engine/index.js)
node fuzz.mjs --n 20000 --seed 20260919
node fuzz.mjs --n 5000 --seed 31337 --family bothNear
#    families: uniform b50 bTier bDef late sameMonth tie onTarget near bothNear
#    exit code 0 = clean, 1 = math or invariant failure, 3 = only nearLine conventions differ

# 3. Prove the fuzzer itself works (correct engines pass, 12 planted bugs are caught)
node prove-harness.mjs --n 5000

# 4. Stage 2 checks of the rest of the engine
node stage2-code-checks.mjs
node stage2-compare-checks.mjs --n 20000
node stage3-reverify.mjs --n 20000
node stage4-measure.mjs --n 20000
#    "NOTE" lines are findings to read; "FAIL" lines are hard failures.

# 5. Rebuild the hand-derived vectors and re-check them
node build-new-vectors.mjs && node check-vectors.mjs ./new-vectors.json
```

Any script also takes an explicit engine path, for example
`node fuzz.mjs ../engine/index.js --n 5000`.

Findings are written up in `../docs/verification/math-audit.md`.
