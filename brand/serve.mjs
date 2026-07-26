// Tiny static server used only to regenerate the brand PNGs.
//
//   node brand/serve.mjs            # serves brand/ on http://localhost:8100
//   then open http://localhost:8100/rasterize.html in a browser
//
// rasterize.html draws each SVG onto a pixel-exact canvas and POSTs the PNG
// back to /save/<name>, which this server writes into brand/render/.
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] ?? 8100);
const TYPES = { '.svg': 'image/svg+xml', '.html': 'text/html; charset=utf-8', '.png': 'image/png' };

createServer(async (req, res) => {
  const rel = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^[\\/]+/, '');

  if (req.method === 'POST' && rel.startsWith('save')) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    await writeFile(join(ROOT, 'render', basename(rel)), Buffer.concat(chunks));
    console.log('[brand] wrote render/' + basename(rel));
    res.writeHead(200).end('ok');
    return;
  }

  try {
    const buf = await readFile(join(ROOT, rel));
    res.writeHead(200, { 'Content-Type': TYPES[extname(rel)] ?? 'application/octet-stream' });
    res.end(buf);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(PORT, () => console.log(`[brand] serving ${ROOT} on http://localhost:${PORT}`));
