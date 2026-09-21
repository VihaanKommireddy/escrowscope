// tests/motion.test.js — the landing page's motion layer (motion.js, motion.css).
//
// Movement is decoration, but it sits on a page that makes promises. So this
// file checks the parts that could break one:
//   1. the arithmetic: easing, the count-up and its thousands separators (a
//      count-up must END on the real figure, never near it);
//   2. the cycle's state machine, run with a pretend clock: the order of the
//      three examples, and that Pause always lands on a FINISHED example, never
//      on a half-counted number;
//   3. the ONE animation-frame loop: it asks for a frame only while something
//      needs one, and never two at once;
//   4. source scans of motion.js and motion.css: everything that moves or hides
//      sits behind "prefers-reduced-motion: no-preference", only transform and
//      opacity are animated (plus the one line that draws itself), the hiding
//      class is never in the HTML, and the stylesheet's clock fits the script's.
//
// What this file cannot do: open a browser. How the page really looks and moves
// was checked by hand in one (BUILD-LOG.md says at which sizes).
//
// Run it from the project folder:   node --test tests/motion.test.js

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  clamp01,
  easeOutCubic,
  countAt,
  formatCount,
  parallaxProgress,
  leanFromPointer,
  numbersAt,
  numbersEndMs,
  createCycle,
  createFrameLoop,
  CYCLE_TIMING,
  NUMBERS_TIMING,
  REVEAL_GROUPS,
} from "../motion.js";
import { previewFacts, polylineLength } from "../preview.js";
import { EXAMPLES } from "../examples.js";
import { formatCents } from "../engine/index.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(ROOT, file), "utf8");
const motionJs = read("motion.js");
const motionCss = read("motion.css");
const indexHtml = read("index.html");

function withoutCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function withoutJsComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

// The text between the "{" that follows `marker` and its matching "}".
function blockAfter(text, marker, from = 0) {
  const at = text.indexOf(marker, from);
  if (at === -1) return null;
  const open = text.indexOf("{", at);
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === "{") depth += 1;
    if (text[index] === "}") {
      depth -= 1;
      if (depth === 0) return { start: at, end: index + 1, body: text.slice(open + 1, index) };
    }
  }
  return null;
}

// ═════════════════════════ 1. The arithmetic ═════════════════════════

test("easing: starts at 0, ends at exactly 1, never goes backwards, and ignores anything outside 0 to 1", () => {
  assert.equal(easeOutCubic(0), 0);
  assert.equal(easeOutCubic(1), 1);
  assert.equal(easeOutCubic(-3), 0);
  assert.equal(easeOutCubic(7), 1);
  assert.equal(easeOutCubic(NaN), 0);
  assert.equal(clamp01(0.25), 0.25);
  let last = 0;
  for (let step = 0; step <= 100; step += 1) {
    const value = easeOutCubic(step / 100);
    assert.ok(value >= last, "easeOutCubic went backwards at " + step + "%");
    assert.ok(value >= 0 && value <= 1);
    last = value;
  }
  // "Ease out": most of the distance is covered early.
  assert.ok(easeOutCubic(0.5) > 0.8);
});

test("count-up: it starts at 0, never passes the target, never goes backwards, and ENDS on the target exactly", () => {
  for (const target of [30, 150000, 1, 999, 1000, 480000, 95000]) {
    assert.equal(countAt(target, 0), 0);
    assert.equal(countAt(target, 1), target);
    assert.equal(countAt(target, 1.7), target, "Past the end it still shows the target.");
    let last = 0;
    for (let step = 0; step <= 200; step += 1) {
      const value = countAt(target, step / 200);
      assert.ok(Number.isInteger(value), "A count-up only ever shows whole numbers.");
      assert.ok(value >= last && value <= target, "count for " + target + " misbehaved at step " + step + ": " + value);
      last = value;
    }
  }
  // A balance can be below zero. The count runs down to it and stops on it.
  assert.equal(countAt(-12345, 1), -12345);
  assert.ok(countAt(-12345, 0.5) <= 0 && countAt(-12345, 0.5) >= -12345);
});

test("count-up: thousands separators are kept, the same on every device", () => {
  assert.equal(formatCount(0), "0");
  assert.equal(formatCount(7), "7");
  assert.equal(formatCount(30), "30");
  assert.equal(formatCount(999), "999");
  assert.equal(formatCount(1000), "1,000");
  assert.equal(formatCount(12345), "12,345");
  assert.equal(formatCount(150000), "150,000");
  assert.equal(formatCount(1234567), "1,234,567");
  assert.equal(formatCount(-1500), "-1,500");
  // The band's big figure, as index.html writes it, is what the count ends on.
  assert.ok(indexHtml.includes('<span data-count-to="150000">' + formatCount(150000) + "</span>"));
  assert.ok(!/toLocaleString|Intl\./.test(withoutJsComments(motionJs)), "motion.js must not format numbers by the browser's language: the page's text is English.");
});

test("the hero's three dollar figures: each example counts from $0.00 to exactly what the engine gives for it", () => {
  assert.equal(EXAMPLES.length, 3);
  for (let index = 0; index < EXAMPLES.length; index += 1) {
    const facts = previewFacts(index);
    const finalCents = facts.numbers.map((item) => item.cents);
    // Before the count starts: zeros.
    assert.deepEqual(numbersAt(finalCents, 0).map(formatCents), ["$0.00", "$0.00", "$0.00"]);
    // When it ends (and at any time after): the engine's own strings.
    const end = numbersEndMs(finalCents.length);
    for (const when of [end, end + 1, CYCLE_TIMING.playMs, 60000]) {
      assert.deepEqual(
        numbersAt(finalCents, when).map(formatCents),
        facts.numbers.map((item) => item.figure),
        "Example " + (index + 1) + " does not end on the engine's figures at " + when + "ms."
      );
    }
    // On the way there, no figure ever overshoots.
    for (let when = 0; when <= end; when += 37) {
      numbersAt(finalCents, when).forEach((cents, position) => {
        assert.ok(Math.abs(cents) <= Math.abs(finalCents[position]), "A figure overshot at " + when + "ms.");
      });
    }
  }
  assert.ok(numbersEndMs(3) < CYCLE_TIMING.playMs, "The figures must finish counting before the example is called finished.");
  assert.equal(numbersEndMs(3), NUMBERS_TIMING.startMs + 2 * NUMBERS_TIMING.staggerMs + NUMBERS_TIMING.durationMs);
});

test("scroll parallax: -1 as the hero comes in at the bottom, 0 when it is centered, 1 as it leaves at the top, and never outside", () => {
  const screen = 900;
  const height = 600;
  assert.equal(parallaxProgress(screen, height, screen), -1, "Top edge at the bottom of the screen.");
  assert.equal(parallaxProgress(-height, height, screen), 1, "Bottom edge at the top of the screen.");
  assert.equal(parallaxProgress((screen - height) / 2, height, screen), 0, "Centered.");
  assert.equal(parallaxProgress(5000, height, screen), -1);
  assert.equal(parallaxProgress(-5000, height, screen), 1);
  assert.equal(parallaxProgress(0, 0, 0), 0, "A page with no size yet moves nothing.");
});

test("lean toward the mouse: -1 to 1 across the window, 0 in the middle, 0 when the window has no size", () => {
  assert.deepEqual(leanFromPointer(0, 0, 1000, 800), { x: -1, y: -1 });
  assert.deepEqual(leanFromPointer(1000, 800, 1000, 800), { x: 1, y: 1 });
  assert.deepEqual(leanFromPointer(500, 400, 1000, 800), { x: 0, y: 0 });
  assert.deepEqual(leanFromPointer(99999, -5, 1000, 800), { x: 1, y: -1 });
  assert.deepEqual(leanFromPointer(10, 10, 0, 0), { x: 0, y: 0 });
});

test("the balance line's length (what lets it draw itself) is plain geometry", () => {
  assert.equal(polylineLength([[0, 0], [3, 4]]), 5);
  assert.equal(polylineLength([[0, 0], [3, 4], [3, 10]]), 11);
  assert.equal(polylineLength([[1, 1]]), 0);
  assert.equal(polylineLength([]), 0);
});

// ═════════════════════════ 2. The cycle, with a pretend clock ═════════════════════════

const ROUND = CYCLE_TIMING.playMs + CYCLE_TIMING.holdMs + CYCLE_TIMING.leaveMs;

test("the cycle: one example takes about 6 to 7 seconds, and leaving is quicker than arriving", () => {
  assert.ok(ROUND >= 6000 && ROUND <= 7000, "One example takes " + ROUND + "ms.");
  assert.ok(CYCLE_TIMING.leaveMs < 400 && CYCLE_TIMING.leaveMs <= 0.7 * 400, "Exit is no more than about 70% of the 400ms settle.");
  assert.ok(CYCLE_TIMING.holdMs >= 2000, "A finished example must stand long enough to be read.");
});

test("the cycle: nothing happens before start(), and start() shows example 1 exactly once", () => {
  const cycle = createCycle({ count: 3 });
  assert.deepEqual(cycle.advance(5000), [], "Time before start() is not counted.");
  assert.deepEqual(cycle.start(), [{ type: "show", index: 0 }]);
  assert.deepEqual(cycle.start(), [], "A second start() does nothing.");
  assert.deepEqual(cycle.state(), { index: 0, phase: "play", elapsed: 0, paused: false, started: true });
});

test("the cycle: play → settle → leave → the next example, round and round, 1 → 2 → 3 → 1", () => {
  const cycle = createCycle({ count: 3 });
  cycle.start();
  const seen = [];
  // A pretend clock that ticks every 50ms, for a little over two full rounds.
  for (let now = 0; now < ROUND * 6 + 100; now += 50) {
    for (const event of cycle.advance(50)) seen.push(event.type + " " + (event.index + 1));
  }
  assert.deepEqual(seen.slice(0, 10), [
    "settle 1", "leave 1", "show 2",
    "settle 2", "leave 2", "show 3",
    "settle 3", "leave 3", "show 1",
    "settle 1",
  ]);
  // Exactly on its marks, whatever the size of the ticks.
  const exact = createCycle({ count: 3 });
  exact.start();
  assert.deepEqual(exact.advance(CYCLE_TIMING.playMs - 1), []);
  assert.deepEqual(exact.advance(1), [{ type: "settle", index: 0 }]);
  assert.equal(exact.msToNextEvent(), CYCLE_TIMING.holdMs);
  assert.deepEqual(exact.advance(CYCLE_TIMING.holdMs), [{ type: "leave", index: 0 }]);
  assert.deepEqual(exact.advance(CYCLE_TIMING.leaveMs), [{ type: "show", index: 1 }]);
  // One long sleep (a laptop lid) is caught up in order, and never more than one full round.
  const slept = createCycle({ count: 3 });
  slept.start();
  const caughtUp = slept.advance(10 * 60 * 1000).map((event) => event.type);
  assert.ok(caughtUp.length <= 9, "A long gap must not replay many rounds: " + caughtUp.length + " events.");
  assert.deepEqual(caughtUp.slice(0, 3), ["settle", "leave", "show"]);
});

test("the cycle: Pause always lands on a FINISHED example (never a half-counted number), and time stands still", () => {
  // Paused in the middle of the count-up.
  const counting = createCycle({ count: 3 });
  counting.start();
  counting.advance(700);
  assert.deepEqual(counting.pause(), [{ type: "settle", index: 0 }], "Pausing mid-count must finish the example that is showing.");
  assert.equal(counting.state().phase, "hold");
  assert.deepEqual(counting.advance(60000), [], "A paused cycle ignores the clock.");
  assert.deepEqual(counting.pause(), [], "Pausing twice does nothing.");
  assert.equal(counting.state().index, 0);

  // Paused while an example is fading out: it comes back, finished. It does not skip ahead.
  const leaving = createCycle({ count: 3 });
  leaving.start();
  leaving.advance(CYCLE_TIMING.playMs + CYCLE_TIMING.holdMs + 100);
  assert.equal(leaving.state().phase, "leave");
  assert.deepEqual(leaving.pause(), [{ type: "settle", index: 0 }]);

  // Paused while already finished: nothing to redo.
  const holding = createCycle({ count: 3 });
  holding.start();
  holding.advance(CYCLE_TIMING.playMs + 500);
  assert.deepEqual(holding.pause(), []);

  // Play again: the visitor gets the whole reading time, then the NEXT example.
  holding.resume();
  assert.equal(holding.msToNextEvent(), CYCLE_TIMING.holdMs);
  assert.deepEqual(holding.advance(CYCLE_TIMING.holdMs - 1), []);
  assert.deepEqual(holding.advance(1), [{ type: "leave", index: 0 }]);
  assert.deepEqual(holding.advance(CYCLE_TIMING.leaveMs), [{ type: "show", index: 1 }]);

  // Paused before it ever started (the hero is below the screen on a phone):
  // nothing to finish, and the first example still plays from its beginning.
  const unseen = createCycle({ count: 3 });
  assert.deepEqual(unseen.pause(), []);
  unseen.resume();
  assert.deepEqual(unseen.start(), [{ type: "show", index: 0 }]);
});

test("the cycle: a start index that does not exist falls back to the first example", () => {
  assert.equal(createCycle({ count: 3, startIndex: 9 }).state().index, 0);
  assert.equal(createCycle({ count: 3, startIndex: -1 }).state().index, 0);
  assert.equal(createCycle({ count: 3, startIndex: 2 }).state().index, 2);
});

// ═════════════════════════ 3. The one animation-frame loop ═════════════════════════

function pretendFrames() {
  const asked = [];
  let cancelled = 0;
  return {
    request: (callback) => {
      asked.push(callback);
      return asked.length;
    },
    cancel: () => {
      cancelled += 1;
    },
    // Run the frame that was asked for (there is never more than one waiting).
    runFrame: (now) => asked.pop()(now),
    waiting: () => asked.length,
    cancelled: () => cancelled,
  };
}

test("the frame loop: one frame at a time however many tasks there are, and none at all when nothing needs one", () => {
  const frames = pretendFrames();
  const loop = createFrameLoop(frames.request, frames.cancel);
  assert.equal(frames.waiting(), 0, "An idle page asks for no frames.");

  let runsA = 0;
  let runsB = 0;
  const taskA = () => {
    runsA += 1;
    return runsA < 3; // wants three frames
  };
  const taskB = () => {
    runsB += 1;
    return false; // wants one
  };
  loop.add(taskA);
  loop.add(taskB);
  loop.add(taskA); // the same task twice is still one task
  assert.equal(frames.waiting(), 1, "Two tasks share ONE requested frame.");
  assert.equal(loop.size(), 2);

  frames.runFrame(16);
  assert.deepEqual([runsA, runsB], [1, 1]);
  assert.equal(frames.waiting(), 1, "taskA still wants frames.");
  frames.runFrame(32);
  frames.runFrame(48);
  assert.deepEqual([runsA, runsB], [3, 1]);
  assert.equal(frames.waiting(), 0, "When the last task is done the loop stops asking.");
  assert.equal(loop.size(), 0);

  // Removing the last task cancels the frame that was waiting for it.
  loop.add(() => true);
  const forever = () => true;
  loop.remove(forever); // removing a stranger changes nothing
  assert.equal(frames.cancelled(), 0);
  const only = createFrameLoop(frames.request, frames.cancel);
  only.add(forever);
  only.remove(forever);
  assert.equal(frames.cancelled(), 1);
});

test("motion.js asks the browser for animation frames in exactly one place, and never uses a repeating timer", () => {
  const code = withoutJsComments(motionJs);
  assert.equal((code.match(/requestAnimationFrame/g) || []).length, 1, "There must be ONE animation-frame loop (createFrameLoop), fed from one place.");
  assert.ok(!/setInterval/.test(code), "No repeating timers: waiting is one setTimeout at a time.");
  assert.ok(/\{ passive: true \}/.test(code), "Scroll and pointer listeners must be passive.");
  // Watchers are let go when their work is done.
  assert.ok((code.match(/\.disconnect\(\)/g) || []).length >= 5, "Every IntersectionObserver must be disconnected when it has nothing left to watch, and again on stop.");
});

// ═════════════════════════ 4. Source scans: reduced motion, no traps, cheap properties ═════════════════════════

test("reduced motion: motion.js starts nothing when the visitor asked for less motion, and stops everything if they ask later", () => {
  const code = withoutJsComments(motionJs);
  assert.ok(code.includes('const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";'));
  const init = blockAfter(code, "export function initMotion(");
  assert.ok(init !== null);
  assert.ok(/window\.matchMedia\(REDUCED_MOTION\)/.test(init.body));
  // The ONLY call that starts anything sits in the branch where less motion was NOT asked for.
  assert.ok(/if \(lessMotion\.matches\) \{[\s\S]*?stopAll\(\);[\s\S]*?\} else if \(stops === null\) \{\s*stops = startAll\(\);/.test(init.body), "initMotion must start motion only in the else-branch of lessMotion.matches.");
  assert.equal((code.match(/startAll\(\)/g) || []).length, 2, "startAll is defined once and called once.");
  assert.ok(/lessMotion\.addEventListener\("change", apply\)/.test(init.body), "A visitor who switches the setting while the page is open must be obeyed.");
  assert.ok(/options\.rebuildStage\(\)/.test(init.body), "Stopping puts the still picture of example 2 back.");
  // And landing.js hands it the way to rebuild that picture.
  const landing = read("landing.js");
  assert.ok(/import \{ initMotion \} from "\.\/motion\.js";/.test(landing), "landing.js must import motion.js statically.");
  assert.ok(/rebuildStage: function \(\) \{\s*return initHeroPreview\(previewHolder\);/.test(landing));
  assert.ok(landing.indexOf("initMotion(") > landing.indexOf("showRequestsFigure();"), "Motion starts last, on a page that is already complete.");
});

test("reduced motion: in motion.css every animation, transition, transform and hidden state sits inside prefers-reduced-motion: no-preference", () => {
  const css = withoutCssComments(motionCss);
  const block = blockAfter(css, "@media screen and (prefers-reduced-motion: no-preference)");
  assert.ok(block !== null, "motion.css needs its no-preference block.");
  assert.equal((css.match(/prefers-reduced-motion/g) || []).length, 1, "One no-preference block holds all the movement.");
  const outside = css.slice(0, block.start) + css.slice(block.end);
  // (Whole property names: "text-transform: uppercase" on the Pause pill is not movement.)
  for (const moving of [/animation/, /transition/, /(?<![\w-])transform\s*:/, /(?<![\w-])translate\s*:/, /(?<![\w-])scale\s*:/, /@keyframes/, /opacity\s*:/, /visibility\s*:/, /will-change/]) {
    assert.ok(!moving.test(outside), "motion.css has " + moving + " outside the no-preference block. A visitor who asked for less motion would get it.");
  }
  // The hiding class lives in that block, so it can hide nothing for them either.
  assert.ok(/\[data-reveal\] \.reveal-pending\s*\{\s*opacity: 0;/.test(block.body));
});

test('no "hide it in CSS, reveal it with a script" trap: the hiding classes are never in the HTML, and the script only hides what is below the screen, after the watcher exists', () => {
  for (const page of ["index.html", "check.html", "proof.html", "privacy.html"]) {
    const html = read(page);
    for (const hidingClass of ["reveal-pending", "reveal-go", "is-playing", "is-leaving", "is-counting"]) {
      assert.ok(!html.includes(hidingClass), page + " carries the class " + hidingClass + ". Only motion.js may set it.");
    }
  }
  // In the stylesheets, those classes exist ONLY in motion.css (inside the block the test above checks).
  for (const sheet of ["styles.css", "site.css"]) {
    const css = withoutCssComments(read(sheet));
    assert.ok(!/reveal-pending|is-playing|is-leaving/.test(css), sheet + " must not style the motion layer's hiding classes.");
  }
  const code = withoutJsComments(motionJs);
  const reveals = blockAfter(code, "function startReveals()");
  assert.ok(reveals !== null);
  const watcherAt = reveals.body.indexOf("new IntersectionObserver(");
  const hidingAt = reveals.body.indexOf('classList.add("reveal-pending")');
  assert.ok(watcherAt !== -1 && hidingAt !== -1 && watcherAt < hidingAt, "The watcher that reveals must exist BEFORE anything is hidden.");
  assert.ok(/if \(wrapper\.getBoundingClientRect\(\)\.top < screenHeight\) continue;/.test(reveals.body), "Only what is wholly below the screen may be hidden.");
  assert.ok(/if \(!\("IntersectionObserver" in window\)\) return nothing;/.test(reveals.body), "Without a watcher, nothing is hidden at all.");
  assert.equal((code.match(/classList\.add\("reveal-pending"\)/g) || []).length, 1);
});

test("motion.css animates only transform and opacity (and their single-purpose forms), plus the one line that draws itself", () => {
  const css = withoutCssComments(motionCss);
  const allowed = new Set(["opacity", "transform", "translate", "scale", "stroke-dashoffset", "--par"]);
  let keyframeCount = 0;
  let from = 0;
  for (;;) {
    const frames = blockAfter(css, "@keyframes", from);
    if (frames === null) break;
    keyframeCount += 1;
    from = frames.end;
    for (const declaration of frames.body.matchAll(/([a-z-]+)\s*:\s*[^;{}]+;/g)) {
      assert.ok(allowed.has(declaration[1]), "@keyframes in motion.css animates `" + declaration[1] + "`. Only " + [...allowed].join(", ") + " are allowed.");
    }
  }
  assert.ok(keyframeCount >= 6, "Expected the keyframes of the playing preview, the float and the parallax.");
  for (const transition of css.matchAll(/transition\s*:\s*([^;]+);/g)) {
    for (const piece of transition[1].split(",")) {
      const property = piece.trim().split(/\s+/)[0];
      assert.ok(["opacity", "transform", "background-color", "border-color", "color"].includes(property), "motion.css transitions `" + property + "`.");
    }
  }
  // The draw is the one stroke-dashoffset, and its length comes from preview.js.
  assert.equal((css.match(/@keyframes pv-draw/g) || []).length, 1);
  assert.ok(/svg\.style\.setProperty\("--pc-len"/.test(read("preview.js")));
});

test("the stylesheet's clock fits the script's: nothing in the playing preview runs past CYCLE_TIMING.playMs, and it fades out in leaveMs", () => {
  const css = withoutCssComments(motionCss);
  const toMs = (text) => (text.endsWith("ms") ? Number(text.slice(0, -2)) : Number(text.slice(0, -1)) * 1000);
  let latest = 0;
  let found = 0;
  for (const rule of css.matchAll(/\.preview\.is-playing[^{]*\{([^}]*)\}/g)) {
    for (const animation of rule[1].matchAll(/animation\s*:\s*([^;]+);/g)) {
      for (const piece of animation[1].split(/,(?![^(]*\))/)) {
        if (/infinite/.test(piece)) continue; // the float, which never ends
        const times = piece.match(/(?<![\w.-])\d+(?:\.\d+)?m?s\b/g) || [];
        const callout = /var\(--callout-at, (\d+ms)\)/.exec(piece);
        const duration = times.length > 0 ? toMs(times[0]) : 0;
        let delay = times.length > 1 ? toMs(times[1]) : 0;
        if (callout) delay = toMs(callout[1]);
        latest = Math.max(latest, duration + delay);
        found += 1;
      }
    }
  }
  assert.ok(found >= 7, "Expected the timeline of the playing preview in motion.css, found " + found + " animations.");
  assert.equal(latest, CYCLE_TIMING.playMs, "The last part of the timeline (the verdict settling) must end exactly when motion.js calls the example finished.");
  for (const callout of css.matchAll(/--callout-at:\s*(\d+)ms/g)) {
    assert.ok(Number(callout[1]) + 300 <= CYCLE_TIMING.playMs, "A chip arrives after the example is already finished.");
  }
  assert.ok(new RegExp("\\.preview\\.is-leaving[^}]*transition: opacity " + CYCLE_TIMING.leaveMs + "ms ease-in;").test(css));
  // Arriving eases out, leaving eases in and is quicker.
  assert.ok(/pv-settle 400ms cubic-bezier\(0\.2, 0\.8, 0\.2, 1\)/.test(css));
});

test("scroll parallax is CSS where the browser can (behind @supports), and the script fallback only runs where it cannot", () => {
  const css = withoutCssComments(motionCss);
  const supports = blockAfter(css, "@supports (animation-timeline: view())");
  assert.ok(supports !== null, "motion.css must put the scroll-driven animation behind @supports.");
  assert.ok(/animation-timeline: view\(block\);/.test(supports.body));
  assert.ok(/@property --par \{\s*syntax: "<number>";/.test(css), "--par must be registered as a number so the browser can animate it.");
  const code = withoutJsComments(motionJs);
  assert.ok(/window\.CSS\.supports\("animation-timeline: view\(\)"\)/.test(code));
  assert.ok(/!browserScrollsAnimations\(\) \? startScrollFallback\(stageBox, loop\) : nothing/.test(code), "The scroll listener must only exist where CSS cannot do the job.");
  // Custom properties go through the style OBJECT, never a style attribute string.
  assert.ok(!/setAttribute\(\s*["']style["']/.test(code) && !/cssText/.test(code));
  assert.ok((code.match(/\.style\.setProperty\("--/g) || []).length >= 3);
  assert.ok(!/\.style\.(?!setProperty|removeProperty)[a-zA-Z]/.test(code), "motion.js may only set CSS custom properties, through setProperty.");
});

test("the Pause button: a real button next to (not inside) the hidden picture, with aria-pressed, that stops the cycle, the float and the lean", () => {
  const code = withoutJsComments(motionJs);
  assert.ok(/el\("button", \{ className: "motion-toggle", attrs: \{ type: "button", "aria-pressed": "false" \} \}/.test(code));
  assert.ok(/button\.setAttribute\("aria-pressed", userPaused \? "true" : "false"\);/.test(code));
  assert.ok(/word\.textContent = userPaused \? "Play" : "Pause";/.test(code));
  assert.ok(/stageBox\.append\(button\);/.test(code), "The button goes into .hero-stage, beside the aria-hidden picture, never inside it.");
  assert.ok(!/holder\.append\(button\)/.test(code));
  assert.ok(/stageBox\.classList\.toggle\("motion-paused", userPaused\);/.test(code));
  // motion-paused is what stops the two other loops.
  const css = withoutCssComments(motionCss);
  assert.ok(/\.has-motion\.motion-paused \.preview-chip,[\s\S]*?animation-play-state: paused;/.test(css), "Pause must stop the floating chips.");
  assert.ok(/if \(stageBox\.classList\.contains\("motion-paused"\)\) \{\s*targetX = 0;\s*targetY = 0;/.test(code), "Pause must stop the lean toward the mouse.");
  // The cycle also stops for a resting mouse, for focus, for a hidden tab and when off the screen.
  for (const reason of ['hold("hover")', 'hold("focus")', 'hold("hidden")', 'hold("offscreen")', 'hold("print")']) {
    assert.ok(code.includes(reason), "motion.js never calls " + reason + ".");
  }
  assert.ok(/document\.addEventListener\("visibilitychange", onVisibility\)/.test(code));
  assert.ok(/window\.addEventListener\("beforeprint", onBeforePrint\)/.test(code), "Paper must get a finished example, never a half-counted one.");
  // The float only runs while there is a button to stop it.
  assert.ok(/\.has-motion \.preview-chip \{\s*animation: chip-float/.test(css));
  assert.ok(!/(?<!\.has-motion )\.preview-chip \{\s*animation\s*:/.test(css), "A chip may only float under .has-motion.");
});

test("sections that rise: the groups named in motion.js exist on the landing page", () => {
  for (const selector of REVEAL_GROUPS) {
    assert.ok(indexHtml.includes('class="' + selector.slice(1)), "index.html has nothing with the class " + selector);
  }
  const css = withoutCssComments(motionCss);
  assert.ok(/transition: opacity 400ms ease-out, transform 400ms ease-out;\s*transition-delay: calc\(var\(--reveal-i, 0\) \* 40ms\);/.test(css), "16px rise and fade, 400ms ease-out, 40ms apart.");
  assert.ok(/transform: translateY\(16px\);/.test(css));
});

test("the big figures: a number only leaves its true value while it counts, it starts from the watcher (never at start-up), and it goes back to plain text", () => {
  const code = withoutJsComments(motionJs);
  const figures = blockAfter(code, "function startFigures(loop)");
  assert.ok(figures !== null);
  const begin = blockAfter(figures.body, "function begin(job)");
  assert.ok(begin !== null);
  // The only place a figure's text is replaced by the moving copy is begin()…
  assert.equal((figures.body.match(/replaceChildren\(/g) || []).length, 1);
  assert.ok(/job\.node\.replaceChildren\(/.test(begin.body));
  // …which keeps the true number for screen readers and hides the moving copy from them…
  assert.ok(/el\("span", \{ className: "visually-hidden", text: job\.finalText \}\)/.test(begin.body));
  assert.ok(/className: "count-visual", attrs: \{ "aria-hidden": "true" \}/.test(begin.body));
  // …and begin() is only ever called by the watcher, for a figure that is on the screen.
  assert.equal((figures.body.match(/begin\(job\)/g) || []).length, 2, "begin is defined once and called once.");
  assert.ok(/if \(!entry\.isIntersecting\) continue;[\s\S]*?begin\(job\);/.test(figures.body));
  // When the count is over (or motion is stopped half-way) the element is plain text again: the final number.
  assert.ok(/job\.node\.textContent = job\.finalText;/.test(figures.body));
  assert.ok(/for \(const job of counting\) restore\(job\);/.test(figures.body));
  // A figure whose text is not exactly its number (the request counter's dash), or a zero, is left alone.
  assert.ok(/target <= 0 \|\| finalText !== formatCount\(target\)\) continue;/.test(figures.body));
  // The room it takes is kept by an invisible print of the final number (site.css).
  const site = withoutCssComments(read("site.css"));
  assert.ok(/\.count-ghost \{\s*visibility: hidden;\s*\}/.test(site));
  assert.ok(/\.count-live \{\s*position: absolute;\s*top: 0;\s*left: 0;\s*\}/.test(site), "The moving copy is taken out of the flow and grows from a fixed left edge, so nothing shifts.");
  assert.ok(/\.figure-number \{[^}]*font-variant-numeric: tabular-nums;/.test(site), "Tabular figures: the digits do not jiggle.");
});

test("no layout shift when the picture arrives: its place is kept while the holder is empty, and given back if the picture fails", () => {
  const site = withoutCssComments(read("site.css"));
  assert.ok(/\.preview:empty \{\s*padding-top: calc\(\d+px \+ [\d.]+%\);\s*\}/.test(site), "site.css must keep the preview's place until landing.js fills it.");
  assert.ok(/\.preview\.preview-failed:empty \{\s*padding-top: 0;\s*\}/.test(site));
  assert.ok(/\.hero-backdrop:has\(\+ \.preview:empty\) \{\s*display: none;\s*\}/.test(site), "The big circle waits for the picture instead of jumping with it.");
  const preview = read("preview.js");
  assert.equal((preview.match(/holder\.classList\.add\("preview-failed"\)/g) || []).length, 2, "Both ways the picture can fail give the room back.");
  // The cycle itself never changes the frame's height: every example's card and chart share one grid cell.
  const base = withoutCssComments(read("styles.css"));
  assert.ok(/\.preview-verdicts > \*,\s*\.preview-charts > \* \{\s*grid-area: 1 \/ 1;/.test(base));
  assert.ok(/\.preview-verdicts > :not\(\.is-current\),\s*\.preview-charts > :not\(\.is-current\) \{\s*visibility: hidden;/.test(base), "visibility, not display: a hidden card still holds its height.");
  assert.ok(/verdicts\.append\(card\);\s*chartHolder\.append\(chart\);/.test(preview));
});
