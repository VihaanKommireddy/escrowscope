// site.js — the few things EVERY page of the site does. Each page's own script
// (landing.js, check.js, proof-page.js, privacy-page.js) calls initSite() once.
//
//   1. The small menu in the top bar. On a narrow screen the two text links sit
//      behind a "Menu" button. That button is a plain <details>, so it opens and
//      closes with no script at all. The script only adds two courtesies: the
//      Escape key closes it, and so does a click anywhere else.
//   2. The offline copy. Whichever page a visitor opens first asks the browser to
//      save the site's files, so every page opens offline afterwards.
//
// Nothing here reads the form, and nothing here talks to the network.

import { registerServiceWorker } from "./sw-register.js";

function initMenu() {
  const menu = document.querySelector(".masthead-menu");
  if (!menu) return;
  const button = menu.querySelector("summary");

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape" || !menu.open) return;
    menu.open = false;
    // Focus goes back to the button that opened the menu, not to nowhere.
    if (button) button.focus();
  });

  document.addEventListener("click", function (event) {
    if (!menu.open) return;
    if (menu.contains(event.target)) return;
    menu.open = false;
  });
}

export function initSite() {
  initMenu();
  registerServiceWorker();
}
