// privacy-page.js — the script for privacy.html. It draws the privacy panel: a
// live count of the requests this page has made since it finished loading, read
// from the browser's own log, and the plain-words account of the rule that
// blocks background connections. Everything else on that page is plain HTML.

import { initProofPanel } from "./proof.js";
import { initSite } from "./site.js";

function start() {
  initSite();
  initProofPanel(document.getElementById("proof-panel"));
}

start();
