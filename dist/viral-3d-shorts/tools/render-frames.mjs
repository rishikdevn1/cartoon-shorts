// node tools/render-frames.mjs <page> <outdir> "<frames e.g. 0-1199 or 0,60,120>" [w h]
// The page must set window.ready = true and expose window.renderFrame(frame) (synchronous draw).
// RESUME=1 skips frames that already exist. Run two copies on split frame ranges to go faster.
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
const [page, out, spec, w = '1080', h = '1920'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const frames = []; for (const part of spec.split(',')) { const [a, b] = part.split('-').map(Number); for (let f = a; f <= (b ?? a); f++) frames.push(f); }
const root = path.resolve('.'); const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (!f.startsWith(root) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(0);
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
p.on('pageerror', (e) => console.log('ERR', e.message));
const sep = page.includes('?') ? '&' : '?';
await p.goto(`http://127.0.0.1:${srv.address().port}/${page}${sep}w=${w}&h=${h}`); await p.waitForFunction('window.ready', null, { timeout: 180000 });
let n = 0; const t0 = Date.now();
for (const f of frames) {
  const file = `${out}/f${String(f).padStart(4, '0')}.jpg`; if (process.env.RESUME === '1' && fs.existsSync(file)) continue;
  const data = await p.evaluate((f) => { window.renderFrame(f); return document.querySelector('canvas').toDataURL('image/jpeg', 0.95); }, f);
  fs.writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'));
  if (++n % 10 === 1) console.log(`frame ${f}  ${((Date.now() - t0) / n / 1000).toFixed(2)} s/frame`);
}
await b.close(); srv.close(); console.log('ALL DONE');
