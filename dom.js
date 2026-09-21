// dom.js — tiny helpers for building the page without ever parsing a string as HTML.
//
// Why this file exists: the page's Content-Security-Policy forbids inline
// scripts and inline styles, and SPEC A1.6 says user-typed text may only reach
// the page through textContent / value. So every piece of DOM the scripts make
// goes through these two functions. They set text with textContent and refuse
// the two attribute families that could smuggle code or inline styles in.

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

// Attributes this file refuses to set from script, on purpose.
//  - "style"  would be blocked by the CSP anyway (style-src 'self').
//  - "on..."  would be an inline event handler (also blocked, also unsafe).
function assertSafeAttributeName(name) {
  const lower = String(name).toLowerCase();
  if (lower === "style" || lower.startsWith("on")) {
    throw new Error("dom.js refuses to set the attribute: " + name);
  }
}

function applyOptions(node, options) {
  if (options.className) {
    node.setAttribute("class", options.className);
  }
  if (options.text !== undefined && options.text !== null) {
    node.textContent = String(options.text);
  }
  if (options.attrs) {
    for (const name of Object.keys(options.attrs)) {
      const value = options.attrs[name];
      assertSafeAttributeName(name);
      // undefined / null / false mean "leave this attribute off".
      if (value === undefined || value === null || value === false) continue;
      node.setAttribute(name, value === true ? "" : String(value));
    }
  }
}

function appendChildren(node, children) {
  for (const child of children) {
    if (child === undefined || child === null || child === false) continue;
    // Strings become text nodes, so they can never be parsed as HTML.
    node.append(child);
  }
}

// el("p", { className: "note", text: "Hello", attrs: { id: "x" } }, [child, …])
export function el(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  applyOptions(node, options);
  appendChildren(node, children);
  return node;
}

// Same idea for SVG. Presentation attributes (x, y, points, stroke-dasharray…)
// are allowed by the CSP; the "style" attribute is not, and is refused above.
export function svgEl(tag, options = {}, children = []) {
  const node = document.createElementNS(SVG_NAMESPACE, tag);
  applyOptions(node, options);
  appendChildren(node, children);
  return node;
}

// The box around a wide table. On a phone the table scrolls sideways INSIDE this
// box, so the box must be reachable with the Tab key (tabindex="0") and must say
// what it is (role="region" plus a name). Every scrolling table on the page is
// made here, so none of them can forget one of the three attributes.
export function scrollRegion(label, children = []) {
  if (typeof label !== "string" || label.trim() === "") {
    throw new Error("dom.js: a scrolling table box needs a name that says what the table is");
  }
  return el("div", { className: "table-scroll", attrs: { tabindex: "0", role: "region", "aria-label": label } }, children);
}

// Empty a node the safe way (no HTML strings involved).
export function clear(node) {
  node.replaceChildren();
}
