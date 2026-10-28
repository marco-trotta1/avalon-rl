import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";

const port = 4317;
const root = resolve(import.meta.dirname, "../out");
const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2",
};

try { await stat(resolve(root, "index.html")); }
catch { throw new Error("Build the app with npm run build before you start the server."); }

function policy(html) {
  const hashes = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map(match => `'sha256-${createHash("sha256").update(match[1]).digest("base64")}'`);
  return [
    "default-src 'none'", `script-src 'self' ${hashes.join(" ")}`,
    "style-src 'self' 'unsafe-inline'", "img-src 'self' data:", "font-src 'self'",
    "connect-src 'none'", "worker-src 'none'", "object-src 'none'", "base-uri 'none'",
    "frame-ancestors 'none'", "form-action 'none'", "manifest-src 'none'",
  ].join("; ");
}

const server = createServer(async (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  response.setHeader("Content-Security-Policy", policy(""));

  if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(request.headers.host)) {
    response.writeHead(403).end("Use the local server address.");
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end("The server does not accept uploads.");
    return;
  }
  try {
    const pathname = decodeURIComponent((request.url ?? "/").split("?")[0]);
    if (pathname.includes("\0") || pathname.includes("\\") || pathname.split("/").includes("..")) {
      response.writeHead(400).end("Invalid path.");
      return;
    }
    let path = resolve(root, `.${pathname}`);
    if (path !== root && !path.startsWith(root + sep)) {
      response.writeHead(400).end("Invalid path.");
      return;
    }
    if (path === root || pathname.endsWith("/")) path = resolve(path, "index.html");
    const content = await readFile(path);
    const extension = extname(path);
    response.setHeader("Content-Type", types[extension] ?? "application/octet-stream");
    if (extension === ".html") response.setHeader("Content-Security-Policy", policy(content.toString("utf8")));
    response.writeHead(200).end(request.method === "HEAD" ? undefined : content);
  } catch {
    response.writeHead(404).end("The file is not available.");
  }
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`TraceAtlas is ready at http://127.0.0.1:${port}\n`);
});
