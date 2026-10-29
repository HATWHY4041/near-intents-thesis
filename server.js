// Local server with zero dependencies: `npm start`, then open http://localhost:3000
// Serves /public and runs the same /api handlers Vercel runs in production.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(root, "public");
const port = Number(process.env.PORT) || 3000;
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".mp4": "video/mp4" };

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const api = url.pathname.match(/^\/api\/([a-z]+)$/);
  if (api) {
    try {
      const mod = await import(`./api/${api[1]}.js`);
      return await mod.default(req, res);
    } catch (err) {
      res.statusCode = 404;
      return res.end(JSON.stringify({ error: "Not found" }));
    }
  }
  let path = url.pathname === "/" ? "/index.html" : url.pathname;
  if (!extname(path)) path += ".html";
  const file = normalize(join(publicDir, path));
  if (!file.startsWith(publicDir)) { res.statusCode = 403; return res.end("Forbidden"); }
  try {
    const body = await readFile(file);
    res.setHeader("Content-Type", types[extname(file)] || "application/octet-stream");
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.end("Not found");
  }
}).listen(port, () => console.log(`NEAR Intents thesis running at http://localhost:${port}`));
