// motion.js — everything on the landing page that moves.
//
// The page is complete without this file. Every section, every number and the
// framed sample result are already on the screen, finished, before anything
// here runs. This file only adds movement on top, and only for a visitor who has
// NOT asked their device for less motion:
//
//   1. the framed sample result PLAYS: it works through the three built-in
//      examples one after another (numbers count up, the balance line draws
//      itself, the cushion line and the low point arrive, the verdict settles);
//   2. the chips float, and the hero has three depth layers that lean a few
//      pixels toward the mouse (the scroll parallax itself is pure CSS where the
//      browser can do it; a small fallback here covers the browsers that cannot);
//   3. the big figures count up when they scroll into view;
//   4. each section rises into place the first time it scrolls into view;
//   5. a Pause button stops all of the looping movement (WCAG 2.2.2).
//
// Rules this file keeps:
//   - It never invents a number. The picture's figures come from preview.js,
//     which gets them from the engine. A count-up runs from 0 to that figure
//     and its last frame is the figure itself, character for character.
//   - It never hides anything in the stylesheet and then "reveals" it. A hiding
//     class is only ever added from here, only to things below the screen, and
//     only after the watcher that will take it off again exists.
//   - One animation-frame loop at most, and it stops when nothing needs it.
//     Waiting is done with a timer, not by spinning the loop.
//   - It talks to the stylesheet through classes and CSS custom properties set
//     on the style OBJECT. It never writes a style attribute string.
//   - It makes no connections and keeps nothing on the device.
//
// The top half of the file is pure (no page, no clock of its own), so
// tests/motion.test.js can run it in Node with a pretend clock.

import { el } from "./dom.js";

// ═════════════════════════ pure parts ═════════════════════════

export function clamp01(value) {
  if (!(value > 0)) return 0; // also catches NaN
  if (value > 1) return 1;
  return value;
}

// Fast at the start, gentle at the end. 0 gives 0 and 1 gives exactly 1.
export function easeOutCubic(progress) {
  const t = clamp01(progress);
  const rest = 1 - t;
  return 1 - rest * rest * rest;
}

// The whole number a count-up shows at `progress` (0 to 1) on its way to
// `target`. It never passes the target, and at 1 it IS the target.
export function countAt(target, progress) {
  const t = clamp01(progress);
  if (t >= 1) return target;
  return Math.round(target * easeOutCubic(t));
}

// 150000 → "150,000". Written by hand so it reads the same on every device,
// whatever language the browser is set to.
export function formatCount(value) {
  const whole = Math.round(Math.abs(value));
  const digits = String(whole);
  let grouped = "";
  for (let index = 0; index < digits.length; index += 1) {
    if (index > 0 && (digits.length - index) % 3 === 0) grouped += ",";
    grouped += digits[index];
  }
  return (value < 0 && whole !== 0 ? "-" : "") + grouped;
}

// How far a box has travelled through the screen, for the scroll parallax:
// -1 as its top edge comes in at the bottom of the screen, 0 when it is
// centered, 1 as its bottom edge leaves at the top. Never outside -1 to 1.
// (`top` is the box's distance from the top of the screen, as the browser
// reports it.) This is the same trip the stylesheet's view() timeline measures.
export function parallaxProgress(top, height, viewportHeight) {
  const whole = viewportHeight + height;
  if (!(whole > 0)) return 0;
  return clamp01((viewportHeight - top) / whole) * 2 - 1;
}

// Where the mouse is, as two numbers from -1 (left / top edge of the window) to
// 1 (right / bottom edge). The layers lean by a few pixels times these.
export function leanFromPointer(clientX, clientY, viewportWidth, viewportHeight) {
  if (!(viewportWidth > 0) || !(viewportHeight > 0)) return { x: 0, y: 0 };
  return {
    x: clamp01(clientX / viewportWidth) * 2 - 1,
    y: clamp01(clientY / viewportHeight) * 2 - 1,
  };
}

// One example, start to finish (milliseconds). The stylesheet (motion.css) uses
// the same clock for the parts it animates, and a test holds the two together.
export const CYCLE_TIMING = Object.freeze({
  playMs: 3500, // the example works itself out
  holdMs: 2800, // it stands finished, to be read
  leaveMs: 250, // it fades (faster than it came)
});

// When the three dollar figures count up inside the "play" part.
export const NUMBERS_TIMING = Object.freeze({ startMs: 200, staggerMs: 50, durationMs: 1200 });

export function numbersEndMs(howMany) {
  return NUMBERS_TIMING.startMs + NUMBERS_TIMING.staggerMs * Math.max(0, howMany - 1) + NUMBERS_TIMING.durationMs;
}

// The cents each figure shows, `elapsedMs` into the "play" part.
export function numbersAt(finalCents, elapsedMs) {
  return finalCents.map(function (cents, position) {
    const begun = elapsedMs - NUMBERS_TIMING.startMs - NUMBERS_TIMING.staggerMs * position;
    return countAt(cents, begun / NUMBERS_TIMING.durationMs);
  });
}

// The cycle, as a small machine with NO clock of its own: whoever drives it says
// how much time went by. That is what lets a test run it with a pretend clock.
//
//   play  → hold → leave → (next example) play → …
//
// It hands back what just happened as a list of events:
//   { type: "show", index }    this example has just started playing
//   { type: "settle", index }  it is finished now: show its final state
//   { type: "leave", index }   it has started to fade out
//
// pause() always lands on the FINISHED state of the example that is showing, so
// a paused picture never stands on a half-counted number. resume() gives the
// visitor the whole reading time again before the next example comes.
export function createCycle(options) {
  const count = options.count;
  const timing = Object.assign({}, CYCLE_TIMING, options.timing || {});
  let index = Number.isInteger(options.startIndex) && options.startIndex >= 0 && options.startIndex < count ? options.startIndex : 0;
  let phase = "play";
  let elapsed = 0;
  let paused = false;
  let started = false;

  function phaseLength() {
    if (phase === "play") return timing.playMs;
    if (phase === "hold") return timing.holdMs;
    return timing.leaveMs;
  }

  function start() {
    if (started) return [];
    started = true;
    phase = "play";
    elapsed = 0;
    return [{ type: "show", index: index }];
  }

  function advance(ms) {
    const events = [];
    if (!started || paused || !(ms > 0)) return events;
    // However long the driver was away, never run more than one full round.
    let left = Math.min(ms, (timing.playMs + timing.holdMs + timing.leaveMs) * count);
    while (left > 0) {
      const room = phaseLength() - elapsed;
      if (left < room) {
        elapsed += left;
        break;
      }
      left -= room;
      elapsed = 0;
      if (phase === "play") {
        phase = "hold";
        events.push({ type: "settle", index: index });
      } else if (phase === "hold") {
        phase = "leave";
        events.push({ type: "leave", index: index });
      } else {
        phase = "play";
        index = (index + 1) % count;
        events.push({ type: "show", index: index });
      }
    }
    return events;
  }

  function pause() {
    if (paused) return [];
    paused = true;
    if (!started) return [];
    const wasFinished = phase === "hold";
    phase = "hold";
    elapsed = 0;
    return wasFinished ? [] : [{ type: "settle", index: index }];
  }

  function resume() {
    paused = false;
  }

  return {
    start: start,
    advance: advance,
    pause: pause,
    resume: resume,
    msToNextEvent: function () {
      return phaseLength() - elapsed;
    },
    state: function () {
      return { index: index, phase: phase, elapsed: elapsed, paused: paused, started: started };
    },
  };
}

// ONE animation-frame loop for the whole page. A task is a function that gets
// the frame's time and answers true for "call me next frame too". When no task
// is left, no frame is asked for: an idle page runs nothing.
export function createFrameLoop(requestFrame, cancelFrame) {
  const tasks = new Set();
  let handle = null;

  function frame(now) {
    handle = null;
    for (const task of Array.from(tasks)) {
      if (task(now) !== true) tasks.delete(task);
    }
    if (tasks.size > 0 && handle === null) handle = requestFrame(frame);
  }

  return {
    add: function (task) {
      tasks.add(task);
      if (handle === null) handle = requestFrame(frame);
    },
    remove: function (task) {
      tasks.delete(task);
      if (tasks.size === 0 && handle !== null) {
        cancelFrame(handle);
        handle = null;
      }
    },
    size: function () {
      return tasks.size;
    },
  };
}

// Which pieces of a section rise one after another. A list, a grid of cards or
// the examples block sends its children; everything else goes as one piece.
export const REVEAL_GROUPS = [".figures-list", ".steps3-list", ".trust-grid", ".examples"];
export const REVEAL_STAGGER_CAP = 8;

// ═════════════════════════ the page parts ═════════════════════════

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const FINE_POINTER = "(hover: hover) and (pointer: fine)";

// The picture plays once this much of it is on the screen (and stops below it),
// so on a phone the first example starts as the frame scrolls into view, not
// while only its top edge is showing.
const SEEN_ENOUGH = 0.4;

function nothing() {}

// ───────── 1. the sample result plays, with its Pause button ─────────

function startPlayer(stage, stageBox, loop) {
  const holder = stage.holder;
  if (!stage.prepareAll()) return nothing;

  const cycle = createCycle({ count: stage.count, startIndex: 0 });
  const framesUntil = numbersEndMs(3);
  const reasons = new Set(); // why the cycle is standing still right now
  let running = false;
  let timer = 0;
  let lastTime = 0;

  function finalCents(index) {
    return stage.facts(index).numbers.map(function (item) {
      return item.cents;
    });
  }

  function handle(events) {
    for (const event of events) {
      if (event.type === "show") {
        stage.show(event.index, { counted: true });
        stage.setNumbers(numbersAt(finalCents(event.index), 0));
        holder.classList.remove("is-leaving");
        holder.classList.add("is-playing");
      } else if (event.type === "settle") {
        holder.classList.remove("is-playing", "is-leaving");
        stage.show(event.index, { counted: true });
      } else if (event.type === "leave") {
        holder.classList.add("is-leaving");
      }
    }
  }

  function countingNow(state) {
    return state.phase === "play" && state.elapsed < framesUntil;
  }

  function frameTask(now) {
    if (!running) return false;
    // A frame that arrives late (a busy tab) counts as 100ms at most.
    const passed = Math.min(Math.max(now - lastTime, 0), 100);
    lastTime = now;
    handle(cycle.advance(passed));
    const state = cycle.state();
    if (state.phase === "play") stage.setNumbers(numbersAt(finalCents(state.index), state.elapsed));
    if (countingNow(state)) return true;
    waitForNextEvent();
    return false;
  }

  function waitForNextEvent() {
    const wait = cycle.msToNextEvent();
    timer = window.setTimeout(function () {
      timer = 0;
      if (!running) return;
      handle(cycle.advance(wait));
      carryOn();
    }, wait);
  }

  function carryOn() {
    if (countingNow(cycle.state())) {
      lastTime = window.performance.now();
      loop.add(frameTask);
    } else {
      waitForNextEvent();
    }
  }

  function setRunning(shouldRun) {
    if (shouldRun === running) return;
    running = shouldRun;
    if (running) {
      cycle.resume();
      handle(cycle.start());
      carryOn();
    } else {
      window.clearTimeout(timer);
      timer = 0;
      loop.remove(frameTask);
      handle(cycle.pause());
    }
  }

  function sync() {
    setRunning(reasons.size === 0);
  }

  function hold(reason) {
    reasons.add(reason);
    sync();
  }

  function release(reason) {
    reasons.delete(reason);
    sync();
  }

  // The Pause button. It sits NEXT to the picture, not inside it: the picture is
  // hidden from screen readers, and a button must never be.
  const word = el("span", { className: "motion-toggle-word", text: "Pause" });
  const button = el("button", { className: "motion-toggle", attrs: { type: "button", "aria-pressed": "false" } }, [
    el("span", { className: "motion-toggle-pill" }, [
      el("span", { className: "motion-toggle-icon", attrs: { "aria-hidden": "true" } }),
      word,
      el("span", { className: "visually-hidden", text: " the moving example" }),
    ]),
  ]);

  function paintButton() {
    const userPaused = reasons.has("user");
    button.setAttribute("aria-pressed", userPaused ? "true" : "false");
    word.textContent = userPaused ? "Play" : "Pause";
    // This class is what stops the floating chips and the lean toward the mouse.
    stageBox.classList.toggle("motion-paused", userPaused);
  }

  function onButton() {
    if (reasons.has("user")) {
      // A clear "play" from the visitor wins over the mouse still resting on the
      // picture or the focus still sitting on this button.
      reasons.delete("user");
      reasons.delete("hover");
      reasons.delete("focus");
    } else {
      reasons.add("user");
    }
    paintButton();
    sync();
  }

  function onPointerEnter(event) {
    if (event.pointerType === "mouse") hold("hover");
  }
  function onPointerLeave() {
    release("hover");
  }
  function onFocusIn() {
    hold("focus");
  }
  function onFocusOut(event) {
    if (!stageBox.contains(event.relatedTarget)) release("focus");
  }
  function onVisibility() {
    if (document.hidden) hold("hidden");
    else release("hidden");
  }

  button.addEventListener("click", onButton);
  stageBox.addEventListener("pointerenter", onPointerEnter);
  stageBox.addEventListener("pointerleave", onPointerLeave);
  stageBox.addEventListener("focusin", onFocusIn);
  stageBox.addEventListener("focusout", onFocusOut);
  document.addEventListener("visibilitychange", onVisibility);

  // Nothing runs while the hero is off the screen. This watcher stays for as
  // long as the page does: it is what starts the cycle again.
  let watcher = null;
  if ("IntersectionObserver" in window) {
    watcher = new IntersectionObserver(
      function (entries) {
        const onScreen = entries[entries.length - 1].intersectionRatio >= SEEN_ENOUGH;
        stageBox.classList.toggle("is-offscreen", !onScreen);
        if (onScreen) release("offscreen");
        else hold("offscreen");
      },
      { threshold: SEEN_ENOUGH }
    );
    watcher.observe(stageBox);
  }

  holder.classList.add("is-cycling");
  stageBox.classList.add("has-motion");
  stageBox.append(button);

  const box = stageBox.getBoundingClientRect();
  const showing = Math.min(box.bottom, window.innerHeight) - Math.max(box.top, 0);
  if (!(box.height > 0) || showing / box.height < SEEN_ENOUGH) {
    reasons.add("offscreen");
    stageBox.classList.add("is-offscreen");
  }
  if (document.hidden) reasons.add("hidden");
  sync();

  return function stopPlayer() {
    running = false;
    window.clearTimeout(timer);
    loop.remove(frameTask);
    if (watcher !== null) watcher.disconnect();
    button.removeEventListener("click", onButton);
    stageBox.removeEventListener("pointerenter", onPointerEnter);
    stageBox.removeEventListener("pointerleave", onPointerLeave);
    stageBox.removeEventListener("focusin", onFocusIn);
    stageBox.removeEventListener("focusout", onFocusOut);
    document.removeEventListener("visibilitychange", onVisibility);
    button.remove();
    stageBox.classList.remove("has-motion", "motion-paused", "is-offscreen");
    holder.classList.remove("is-cycling", "is-playing", "is-leaving");
  };
}

// ───────── 2. depth: the lean toward the mouse, and the scroll fallback ─────────

// The layers read two numbers, --lean-x and --lean-y (each -1 to 1), and the
// stylesheet turns them into a few pixels of movement per layer.
function startLean(hero, stageBox, loop) {
  if (!window.matchMedia(FINE_POINTER).matches) return nothing;
  let x = 0;
  let y = 0;
  let targetX = 0;
  let targetY = 0;

  function leanTask() {
    x += (targetX - x) * 0.12;
    y += (targetY - y) * 0.12;
    const settled = Math.abs(targetX - x) < 0.004 && Math.abs(targetY - y) < 0.004;
    if (settled) {
      x = targetX;
      y = targetY;
    }
    stageBox.style.setProperty("--lean-x", x.toFixed(3));
    stageBox.style.setProperty("--lean-y", y.toFixed(3));
    return !settled;
  }

  function onMove(event) {
    if (event.pointerType !== "mouse") return;
    if (stageBox.classList.contains("motion-paused")) {
      targetX = 0;
      targetY = 0;
    } else {
      const lean = leanFromPointer(event.clientX, event.clientY, window.innerWidth, window.innerHeight);
      targetX = lean.x;
      targetY = lean.y;
    }
    loop.add(leanTask);
  }

  function onLeave() {
    targetX = 0;
    targetY = 0;
    loop.add(leanTask);
  }

  hero.addEventListener("pointermove", onMove, { passive: true });
  hero.addEventListener("pointerleave", onLeave);

  return function stopLean() {
    hero.removeEventListener("pointermove", onMove);
    hero.removeEventListener("pointerleave", onLeave);
    loop.remove(leanTask);
    stageBox.style.removeProperty("--lean-x");
    stageBox.style.removeProperty("--lean-y");
  };
}

export function browserScrollsAnimations() {
  return Boolean(window.CSS && typeof window.CSS.supports === "function" && window.CSS.supports("animation-timeline: view()"));
}

// The scroll parallax is CSS where the browser supports scroll-driven
// animation. Everywhere else this writes the same number, --par (-1 to 1), at
// most once a frame, and only while the page is actually scrolling.
export function startScrollFallback(stageBox, loop) {
  let last = null;

  function parTask() {
    const box = stageBox.getBoundingClientRect();
    const progress = parallaxProgress(box.top, box.height, window.innerHeight);
    if (progress !== last) {
      last = progress;
      stageBox.style.setProperty("--par", progress.toFixed(4));
    }
    return false;
  }

  function onScroll() {
    loop.add(parTask);
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  onScroll();

  return function stopScrollFallback() {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onScroll);
    loop.remove(parTask);
    stageBox.style.removeProperty("--par");
  };
}

// ───────── 3. the big figures count up ─────────

// A figure shows its real, final number at all times EXCEPT the 1.2 seconds in
// which it counts, and it only starts to count once it is (just) on the screen.
// So no number ever rests on the page at a value that is not true.
//
// While it counts, the element holds two things: the true number, hidden from
// the eye but read by screen readers, and an aria-hidden copy that moves. The
// moving copy lies on top of an invisible print of the final number, so the
// room it takes never changes. When the count ends, the element goes back to
// being one plain piece of text: the final number, exactly as index.html had it.
const COUNT_UP_MS = 1200;

function startFigures(loop) {
  if (!("IntersectionObserver" in window)) return nothing;
  const waiting = new Map(); // the box being watched → the figure inside it
  const counting = new Set();

  function restore(job) {
    job.node.classList.remove("is-counting");
    job.node.textContent = job.finalText;
  }

  function begin(job) {
    const live = el("span", { className: "count-live", text: formatCount(0) });
    job.node.replaceChildren(
      el("span", { className: "visually-hidden", text: job.finalText }),
      el("span", { className: "count-visual", attrs: { "aria-hidden": "true" } }, [el("span", { className: "count-ghost", text: job.finalText }), live])
    );
    job.node.classList.add("is-counting");
    counting.add(job);
    let startedAt = null;
    loop.add(function countTask(now) {
      if (!counting.has(job)) return false;
      if (startedAt === null) startedAt = now;
      const progress = clamp01((now - startedAt) / COUNT_UP_MS);
      if (progress >= 1) {
        counting.delete(job);
        restore(job);
        return false;
      }
      live.textContent = formatCount(countAt(job.target, progress));
      return true;
    });
  }

  const watcher = new IntersectionObserver(
    function (entries) {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const job = waiting.get(entry.target);
        if (job === undefined) continue;
        waiting.delete(entry.target);
        watcher.unobserve(entry.target);
        begin(job);
      }
      if (waiting.size === 0) watcher.disconnect();
    },
    { threshold: 0.2 }
  );

  for (const node of document.querySelectorAll("[data-count-to]")) {
    const target = Number(node.getAttribute("data-count-to"));
    const finalText = node.textContent;
    // Nothing to count toward (the two zeros), or text that is not that number
    // (the request counter showing a dash): leave it alone.
    if (!Number.isInteger(target) || target <= 0 || finalText !== formatCount(target)) continue;
    const box = node.closest(".figure-number") || node;
    waiting.set(box, { node: node, target: target, finalText: finalText });
    watcher.observe(box);
  }
  if (waiting.size === 0) watcher.disconnect();

  return function stopFigures() {
    watcher.disconnect();
    for (const job of counting) restore(job);
    waiting.clear();
    counting.clear();
  };
}

// ───────── 4. sections rise into place, once ─────────

function revealPieces(wrapper) {
  const pieces = [];
  for (const child of wrapper.children) {
    if (child.tagName === "NOSCRIPT" || child.classList.contains("visually-hidden")) continue;
    const isGroup = REVEAL_GROUPS.some(function (selector) {
      return child.matches(selector);
    });
    if (isGroup) {
      for (const inner of child.children) pieces.push(inner);
    } else {
      pieces.push(child);
    }
  }
  return pieces;
}

function startReveals() {
  if (!("IntersectionObserver" in window)) return nothing;
  const waiting = new Map(); // wrapper → its pieces
  const timers = new Set();

  function settle(pieces) {
    for (const piece of pieces) {
      piece.classList.remove("reveal-pending", "reveal-go");
      piece.style.removeProperty("--reveal-i");
    }
  }

  function reveal(wrapper) {
    const pieces = waiting.get(wrapper);
    waiting.delete(wrapper);
    for (const piece of pieces) {
      piece.classList.add("reveal-go");
      piece.classList.remove("reveal-pending");
    }
    // Afterwards the pieces go back to having no motion classes at all, so
    // their own hover transitions are theirs again.
    const timer = window.setTimeout(function () {
      timers.delete(timer);
      settle(pieces);
    }, 400 + 40 * REVEAL_STAGGER_CAP + 100);
    timers.add(timer);
  }

  // The watcher comes FIRST. Only then is anything hidden, and only what sits
  // wholly below the screen: what a visitor can already see is never touched.
  const watcher = new IntersectionObserver(
    function (entries) {
      for (const entry of entries) {
        if (!entry.isIntersecting || !waiting.has(entry.target)) continue;
        watcher.unobserve(entry.target);
        reveal(entry.target);
      }
      if (waiting.size === 0) watcher.disconnect();
    },
    { rootMargin: "0px 0px -8% 0px" }
  );

  const screenHeight = window.innerHeight;
  for (const wrapper of document.querySelectorAll("[data-reveal]")) {
    if (wrapper.getBoundingClientRect().top < screenHeight) continue;
    const pieces = revealPieces(wrapper);
    pieces.forEach(function (piece, position) {
      piece.style.setProperty("--reveal-i", String(Math.min(position, REVEAL_STAGGER_CAP)));
      piece.classList.add("reveal-pending");
    });
    waiting.set(wrapper, pieces);
    watcher.observe(wrapper);
  }
  if (waiting.size === 0) watcher.disconnect();

  return function stopReveals() {
    watcher.disconnect();
    for (const timer of timers) window.clearTimeout(timer);
    timers.clear();
    for (const pieces of waiting.values()) settle(pieces);
    waiting.clear();
    for (const piece of document.querySelectorAll(".reveal-pending, .reveal-go")) settle([piece]);
  };
}

// ───────── start, and stop again if the visitor asks for less motion ─────────

// initMotion({ stage, rebuildStage })
//   stage         what preview.js's initHeroPreview returned (or null)
//   rebuildStage  a function that builds the still picture again from nothing
export function initMotion(options) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
  const lessMotion = window.matchMedia(REDUCED_MOTION);
  let stage = options.stage || null;
  let stops = null;

  function startAll() {
    const loop = createFrameLoop(
      function (task) {
        return window.requestAnimationFrame(task);
      },
      function (handle) {
        window.cancelAnimationFrame(handle);
      }
    );
    const hero = document.querySelector(".hero");
    const stageBox = document.querySelector(".hero-stage");
    const running = [];
    // Each part stands alone: if one cannot start, the others still do, and the
    // page is no worse off than it was standing still.
    const parts = [
      function () {
        return stage !== null && stageBox !== null ? startPlayer(stage, stageBox, loop) : nothing;
      },
      function () {
        return hero !== null && stageBox !== null ? startLean(hero, stageBox, loop) : nothing;
      },
      function () {
        return stageBox !== null && !browserScrollsAnimations() ? startScrollFallback(stageBox, loop) : nothing;
      },
      function () {
        return startFigures(loop);
      },
      startReveals,
    ];
    for (const part of parts) {
      try {
        running.push(part());
      } catch (problem) {
        // Movement is optional. The page underneath is already complete.
      }
    }
    return running;
  }

  function stopAll() {
    for (const stop of stops) {
      try {
        stop();
      } catch (problem) {
        // Keep going: every other part still gets its chance to tidy up.
      }
    }
    // Back to the still picture of example 2, built fresh.
    if (typeof options.rebuildStage === "function") stage = options.rebuildStage();
  }

  function apply() {
    if (lessMotion.matches) {
      if (stops !== null) {
        stopAll();
        stops = null;
      }
    } else if (stops === null) {
      stops = startAll();
    }
  }

  apply();
  if (typeof lessMotion.addEventListener === "function") lessMotion.addEventListener("change", apply);
}
