// serve.mjs — tiny static file server for local preview. Zero dependencies.
// Run:  node serve.mjs   then open http://localhost:4173
//       PORT=4188 node serve.mjs   to use a different port
// (ES modules and service workers don't work from file://, so we need this.)
//
// Testing tip: the page's service worker is cache-first, even on localhost.
// After you edit a file, open the page with ?nosw on the end
// (http://localhost:4173/?nosw) so you are not looking at an old cached copy.
//
// This file is for the owner's computer only. It listens on 127.0.0.1, which
// means other machines cannot reach it. GitHub Pages serves the real site.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

// The app folder: the folder this file sits in, with no trailing slash.
const ROOT = normalize(fileURLToPath(new URL(".", import.meta.url))).replace(/[\\/]$/, "");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};

const BAD_REQUEST = { status: 400 };
const FORBIDDEN = { status: 403 };

// resolveRequestPath: which file on disk does this URL point at?
//
// Pure: it never touches the disk and never throws. It answers one of
//   { status: 200, filePath }   the URL points at this file (it may not exist;
//                               the caller finds that out and sends a 404)
//   { status: 400 }             the URL is broken
//   { status: 403 }             the URL tries to leave the app folder
//
// It is exported so tests/serve.test.js can check it without opening a port.
export function resolveRequestPath(rawUrl, root) {
  if (typeof rawUrl !== "string" || rawUrl === "") return BAD_REQUEST;

  // Step 1: take the path part of the URL and turn %20-style codes back into
  // characters. decodeURIComponent THROWS on a broken code such as "/%". An
  // uncaught throw inside the request handler used to kill the whole server
  // (QA audit, defect 11), so both steps sit inside try/catch.
  let urlPath;
  try {
    const pathPart = new URL(rawUrl, "http://localhost").pathname; // drops ?query and #hash
    urlPath = decodeURIComponent(pathPart);
  } catch {
    return BAD_REQUEST;
  }

  // A NUL character can never be part of a real file name, and Node's file
  // functions throw when they see one.
  if (urlPath.includes("\0")) return BAD_REQUEST;

  // Step 2: glue the path onto the app folder and tidy it. normalize() squashes
  // "a/../b" into "b", so any ".." that survives shows up as a path that no
  // longer sits inside the app folder.
  let filePath = normalize(join(root, urlPath));

  // Step 3: is it still inside the app folder?
  // The check must be "is the folder itself" OR "starts with the folder PLUS a
  // slash". Without the slash, a neighbour folder called escrowscope-v1-backup
  // would pass, because its name starts with the same letters (defect 11).
  const insideRoot = filePath === root || filePath.startsWith(root + sep);
  if (!insideRoot) return FORBIDDEN;

  // Step 4: a URL that names a folder gets that folder's index.html.
  if (urlPath.endsWith("/") || filePath === root) filePath = join(filePath, "index.html");

  return { status: 200, filePath: filePath };
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
  res.end(text);
}

// One request in, one response out. Everything is inside try/catch so that no
// request, however strange, can stop the server.
async function handleRequest(req, res) {
  try {
    const answer = resolveRequestPath(req.url, ROOT);
    if (answer.status === 400) return sendText(res, 400, "Bad request");
    if (answer.status === 403) return sendText(res, 403, "Forbidden");

    let body;
    try {
      body = await readFile(answer.filePath);
    } catch {
      return sendText(res, 404, "Not found");
    }
    res.writeHead(200, {
      "Content-Type": TYPES[extname(answer.filePath)] || "application/octet-stream",
      // no-store: always send the newest file, so edits show up on reload.
      "Cache-Control": "no-store",
    });
    res.end(body);
  } catch {
    // Last resort. If the headers already went out we can only hang up.
    if (res.headersSent) res.end();
    else sendText(res, 500, "Server error");
  }
}

export function startServer(port) {
  const server = createServer(handleRequest);
  server.listen(port, "127.0.0.1", () => {
    console.log("EscrowScope → http://localhost:" + port + "   (add ?nosw to skip the offline cache while testing)");
  });
  return server;
}

// Only start listening when this file is run directly (node serve.mjs).
// When a test imports it, nothing starts, so port 4173 stays free.
const runDirectly = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

// True only when the line below really started a server. A test reads this to
// be sure that importing the file did not open a port. It is worked out, not
// hard-coded, so it cannot say "false" while a server is running.
export const startedServerOnLoad = runDirectly;

if (runDirectly) {
  startServer(Number(process.env.PORT) || 4173);
}
