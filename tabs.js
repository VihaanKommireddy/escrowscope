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
// Nothing here knows about escrow. app.js uses it for the three examples.

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

// buildTabs({ holder, labelledBy, idPrefix, items })
//   holder      the element to fill (it is emptied first)
//   labelledBy  the id of the heading that names the whole row of tabs
//   idPrefix    "example" gives the ids example-tab-1, example-panel-1, …
//   items       [{ label: "words on the tab", content: [nodes for its panel] }]
// Returns { select(index, moveFocus), selectedIndex(), tabs, panels }.
export function buildTabs({ holder, labelledBy, idPrefix, items }) {
  clear(holder);
  const tabs = [];
  const panels = [];
  let chosen = 0;

  const list = el("div", { className: "tabs-list", attrs: { role: "tablist", "aria-labelledby": labelledBy } });

  function select(index, moveFocus) {
    if (!Number.isInteger(index) || index < 0 || index >= tabs.length) return;
    chosen = index;
    tabs.forEach(function (tab, position) {
      const isChosen = position === index;
      tab.setAttribute("aria-selected", isChosen ? "true" : "false");
      tab.setAttribute("tabindex", isChosen ? "0" : "-1");
      panels[position].hidden = !isChosen;
    });
    if (moveFocus) tabs[index].focus();
    // On a narrow screen the row scrolls sideways inside its own box: bring the
    // chosen tab into view there (never the whole page).
    if (list.scrollWidth > list.clientWidth) {
      list.scrollLeft = Math.max(0, tabs[index].offsetLeft - list.offsetLeft - 16);
    }
  }

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
    tab.addEventListener("click", function () {
      select(index, false);
    });
    tab.addEventListener("keydown", function (event) {
      const target = nextTabIndex(index, tabs.length, event.key);
      if (target === index && event.key !== "Home" && event.key !== "End") return;
      event.preventDefault();
      select(target, true);
    });
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
  select(0, false);

  return {
    select: select,
    selectedIndex: function () {
      return chosen;
    },
    tabs: tabs,
    panels: panels,
  };
}
