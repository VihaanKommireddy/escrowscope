// tabs.js — a row of tabs with one panel under it (the standard ARIA tabs pattern).
//
// What "the standard pattern" means for someone using a keyboard or a screen
// reader:
//   - the row is ONE stop for the Tab key (only the chosen tab can take focus:
//     this is called a roving tabindex);
//   - Left / Right arrows move to the next tab and choose it, wrapping round at
//     the ends; Home and End jump to the first and last tab;
//   - each tab says which panel it controls and whether it is the chosen one
//     (aria-controls, aria-selected), and each panel says which tab names it.
//
// Nothing here knows about escrow. Two ways in:
//   buildTabs  makes the row and the panels from a list (the three examples on
//              the landing page);
//   wireTabs   takes a row that is ALREADY written in the HTML (the four steps of
//              the form and the six parts of the result on check.html), so
//              nothing on the page jumps when the script starts.
//
// Two small pieces of movement live here, because every row of tabs on the site
// goes through this file (site.css holds the styles, and switches both off for
// a visitor who asked for less motion):
//   - the panel that was just chosen fades in (the class "panel-enter");
//   - on the serif rows (class "tabs-list") ONE navy line slides from the old
//     tab to the new one, instead of each tab having a line of its own.

import { el, clear } from "./dom.js";

// Which tab should an arrow key move to? Pure arithmetic, so Node can test it.
// Returns the same index for any key that is not one of the five it knows.
export function nextTabIndex(current, count, key) {
  if (!Number.isInteger(count) || count <= 0) return 0;
  if (!Number.isInteger(current) || current < 0 || current >= count) return 0;
  if (key === "ArrowRight" || key === "ArrowDown") return (current + 1) % count;
  if (key === "ArrowLeft" || key === "ArrowUp") return (current - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return current;
}

// wireTabs({ list, tabs, panels, onSelect })
//   list      the element with role="tablist"
//   tabs      its role="tab" buttons, in order
//   panels    the role="tabpanel" elements, in the same order
//   onSelect  optional: called as onSelect(index, previousIndex) after every
//             change of tab, however it happened
// Returns { select(index, moveFocus), selectedIndex(), tabs, panels }.
export function wireTabs({ list, tabs, panels, onSelect }) {
  let chosen = 0;
  const slider = list.classList.contains("tabs-list") ? makeSlider(list) : null;

  // How far a tab's left edge is from the left edge of everything in the row
  // (the row may be scrolled sideways on a phone).
  function leftInsideRow(tab) {
    return tab.getBoundingClientRect().left - list.getBoundingClientRect().left + list.scrollLeft;
  }

  // Put the sliding line under the chosen tab. `slide` says whether it should
  // travel there (a change of tab) or simply be there (a resize, a late font).
  // The two numbers go to the stylesheet as custom properties on the style
  // OBJECT, which the page's policy allows; no style attribute is ever written.
  function placeSlider(slide) {
    if (slider === null) return;
    const width = tabs[chosen].offsetWidth;
    if (!(width > 0)) return; // the row is not on the screen yet
    list.classList.toggle("slider-moves", slide);
    list.style.setProperty("--slider-x", leftInsideRow(tabs[chosen]).toFixed(1) + "px");
    list.style.setProperty("--slider-w", String(width));
    list.classList.add("has-slider");
  }

  function select(index, moveFocus) {
    if (!Number.isInteger(index) || index < 0 || index >= tabs.length) return;
    const previous = chosen;
    chosen = index;
    tabs.forEach(function (tab, position) {
      const isChosen = position === index;
      tab.setAttribute("aria-selected", isChosen ? "true" : "false");
      tab.setAttribute("tabindex", isChosen ? "0" : "-1");
      panels[position].hidden = !isChosen;
      // Only a real change of tab fades the new panel in. Drawing the same tab
      // again (live what-if does that on every edit) moves nothing.
      panels[position].classList.toggle("panel-enter", isChosen && previous !== index);
    });
    if (moveFocus) tabs[index].focus();
    // On a narrow screen the row scrolls sideways inside its own box: bring the
    // chosen tab into view there (never the whole page).
    if (list.scrollWidth > list.clientWidth) {
      list.scrollLeft = Math.max(0, leftInsideRow(tabs[index]) - 16);
    }
    placeSlider(previous !== index);
    if (typeof onSelect === "function") onSelect(index, previous);
  }

  // The tabs change size when the window does, when the heading font arrives,
  // and when a hidden row (the results) is first shown. Each time, the line is
  // put back under the chosen tab without sliding.
  if (slider !== null && typeof ResizeObserver === "function") {
    const watcher = new ResizeObserver(function () {
      placeSlider(false);
    });
    watcher.observe(list);
    for (const tab of tabs) watcher.observe(tab);
  }

  tabs.forEach(function (tab, index) {
    tab.addEventListener("click", function () {
      select(index, false);
    });
    tab.addEventListener("keydown", function (event) {
      const target = nextTabIndex(index, tabs.length, event.key);
      if (target === index && event.key !== "Home" && event.key !== "End") return;
      event.preventDefault();
      select(target, true);
    });
  });

  return {
    select: select,
    selectedIndex: function () {
      return chosen;
    },
    tabs: tabs,
    panels: panels,
  };
}

// The sliding line: one empty, decorative element at the end of the row.
function makeSlider(list) {
  const slider = el("span", { className: "tabs-slider", attrs: { "aria-hidden": "true" } });
  list.append(slider);
  return slider;
}

// buildTabs({ holder, labelledBy, idPrefix, items })
//   holder      the element to fill (it is emptied first)
//   labelledBy  the id of the heading that names the whole row of tabs
//   idPrefix    "example" gives the ids example-tab-1, example-panel-1, …
//   items       [{ label: "words on the tab", content: [nodes for its panel] }]
// Returns the same object as wireTabs.
export function buildTabs({ holder, labelledBy, idPrefix, items }) {
  clear(holder);
  const tabs = [];
  const panels = [];

  const list = el("div", { className: "tabs-list", attrs: { role: "tablist", "aria-labelledby": labelledBy } });

  items.forEach(function (item, index) {
    const number = index + 1;
    const tabId = idPrefix + "-tab-" + number;
    const panelId = idPrefix + "-panel-" + number;
    const tab = el(
      "button",
      {
        className: "tab",
        attrs: { type: "button", role: "tab", id: tabId, "aria-controls": panelId, "aria-selected": "false", tabindex: "-1" },
      },
      [el("span", { className: "tab-label", text: item.label })]
    );
    tabs.push(tab);
    list.append(tab);

    // tabindex="0" on the panel: the panel holds a heading and a paragraph before
    // its button, so a keyboard user can reach (and a screen reader can read)
    // the panel itself straight after the row of tabs.
    const panel = el("div", { className: "tab-panel", attrs: { role: "tabpanel", id: panelId, "aria-labelledby": tabId, tabindex: "0" } }, item.content);
    panel.hidden = true;
    panels.push(panel);
  });

  holder.append(list);
  for (const panel of panels) holder.append(panel);

  const wired = wireTabs({ list: list, tabs: tabs, panels: panels });
  wired.select(0, false);
  return wired;
}
