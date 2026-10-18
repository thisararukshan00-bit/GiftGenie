// Local dev server: `npm start`, then open http://localhost:3000
// (On Vercel, /public is served as static files and /api/genie.js as a function.)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

// Load .env without extra packages.
const envFile = path.join(dir, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const { default: genie } = await import('./api/genie.js');

const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/genie') return genie(req, res);

  const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const file = path.join(dir, 'public', path.normalize(rel));
  if (!file.startsWith(path.join(dir, 'public'))) { res.statusCode = 403; return res.end(); }
  try {
    const data = await readFile(file);
    res.setHeader('content-type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch {
    res.statusCode = 404;
    res.end('Not found');
  }
});

const port = Number(process.env.PORT) || 3000;
server.listen(port, () => {
  console.log(`GiftGenie running at http://localhost:${port}`);
  console.log(`Qloo: ${process.env.QLOO_API_KEY ? 'live' : 'demo data (no QLOO_API_KEY)'} | LLM: ${process.env.GEMINI_API_KEY ? 'Gemini' : 'rules (no GEMINI_API_KEY)'}`);
});
