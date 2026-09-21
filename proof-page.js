// proof-page.js — the script for proof.html ("Don't take this page's word for
// it"). It runs the calculator against every worked case as soon as the page
// opens, on this device, and shows each number. The button on the page runs them
// again. Nothing is loaded to do it: the cases are already part of the site.

import { initSelfCheck } from "./selfcheck-ui.js";
import { initRequestLine } from "./proof.js";
import { initSite } from "./site.js";

function start() {
  initSite();
  initSelfCheck(document.getElementById("selfcheck"), { runAtStart: true });
  initRequestLine(document.getElementById("request-count"));
}

start();
