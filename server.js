import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const buildDirectory = resolve("dist");
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end("Method not allowed");
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`).pathname);
  } catch {
    response.writeHead(400);
    response.end("Bad request");
    return;
  }

  const requestedFile = resolve(buildDirectory, `.${pathname}`);
  if (requestedFile !== buildDirectory && !requestedFile.startsWith(`${buildDirectory}${sep}`)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  let filePath = requestedFile;
  try {
    if (!(await stat(filePath)).isFile()) filePath = resolve(buildDirectory, "index.html");
  } catch {
    filePath = resolve(buildDirectory, "index.html");
  }

  try {
    const content = await readFile(filePath);
    const extension = extname(filePath);
    response.writeHead(200, {
      "Cache-Control": extension === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
      "Content-Length": content.byteLength,
      "Content-Type": mimeTypes[extension] ?? "application/octet-stream"
    });
    if (request.method === "HEAD") response.end();
    else response.end(content);
  } catch (error) {
    console.error("Unable to serve the built app:", error);
    response.writeHead(503, { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" });
    response.end("App build not found. Run npm run build before starting the server.");
  }
});

const port = Number(process.env.PORT || 3000);
server.listen(port, "0.0.0.0", () => console.log(`GateCount listening on port ${port}`));
