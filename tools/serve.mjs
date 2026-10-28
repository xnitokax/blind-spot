// 開発用ローカルサーバー（Node.js 版。tools/serve.ps1 と同じことをする。Windows 以外・クラウド用）
//   node tools/serve.mjs
//   → http://localhost:8766/
// PUT /__build → docs/scenario.data.js ／ /__build/more → docs/scenario.more.js ／ /__build/index → docs/index.html（版の番号 ?v=）
//   （build.html から使う）
import { createServer } from "node:http";
import { readFile, writeFile, stat } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT) || 8766;
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".md": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};
const builds = { "/__build": "scenario.data.js", "/__build/more": "scenario.more.js", "/__build/index": "index.html" };

createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (req.method === "PUT" && builds[path]) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = Buffer.concat(chunks).toString("utf8");
      await writeFile(join(root, "docs", builds[path]), body, "utf8");
      console.log(`built docs/${builds[path]} (${body.length} chars)`);
      res.writeHead(204).end();
      return;
    }
    if (path === "/") {
      res.writeHead(302, { Location: "/docs/" }).end();
      return;
    }
    let file = normalize(join(root, path));
    if (!file.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    if ((await stat(file).catch(() => null))?.isDirectory()) {
      if (!path.endsWith("/")) {
        res.writeHead(302, { Location: path + "/" }).end();
        return;
      }
      file = join(file, "index.html");
    }
    const data = await readFile(file).catch(() => null);
    if (!data) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(data);
  } catch (e) {
    console.error(e);
    res.writeHead(500).end();
  }
}).listen(port, () => console.log(`serving ${root} at http://localhost:${port}/`));
