// node tools/shot.mjs <page under repo> <out.png> [w h]
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
const [page, out, w = '1920', h = '1080'] = process.argv.slice(2);
const root = path.resolve('.'); const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (!f.startsWith(root) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(0);
const port = srv.address().port;
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
p.on('pageerror', (e) => console.log('ERR', e.message)); p.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text()); });
await p.goto(`http://127.0.0.1:${port}/${page}`); await p.waitForFunction('window.done', null, { timeout: 120000 });
await p.screenshot({ path: out }); await b.close(); srv.close(); console.log('wrote', out);
