#!/usr/bin/env node
/* 由實際的 3D 全景產生 LINE 與社群預覽圖 og.png（1200×630），畫面只有島嶼和站名。
 * 用法：node tools/make_og.js，之後用 pngquant 壓到 300 KB 以下。puppeteer-core 裝在 ~/.cache/selfstudy-node。 */
const path = require('path'), fs = require('fs'), http = require('http');
const PPT_HOME = process.env.PPT_HOME || path.join(process.env.HOME, '.cache/selfstudy-node');
const puppeteer = require(path.join(PPT_HOME, 'node_modules', 'puppeteer-core'));
const ROOT = path.resolve(__dirname, '..');
const base = path.join(process.env.HOME, '.cache/puppeteer/chrome');
const dirs = fs.readdirSync(base).sort();
const CHROME = process.env.CHROME_PATH || path.join(base, dirs[dirs.length - 1], 'chrome-linux64', 'chrome');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname), file = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630 });
  await page.evaluateOnNewDocument(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const s = document.createElement('style');
      s.textContent = `.isl-bar,.isl-list,.isl-jumps,.isl-drag,.isl-back{display:none !important;}
        .isl-main{display:block !important;height:630px !important;}
        .isl-stage{height:630px !important;}
        .og-title{position:absolute;z-index:5;right:28px;top:26px;padding:.5rem 1.1rem;color:#fff;border-radius:8px;background:rgba(26,26,46,.88);}
        .og-title b{display:block;font:900 50px/1.2 'Noto Serif TC',serif;letter-spacing:.08em;}
        .og-title span{font:500 23px/1.4 system-ui,'Noto Sans CJK TC',sans-serif;}`;
      document.head.appendChild(s);
      const t = document.createElement('div');
      t.className = 'og-title';
      t.innerHTML = '<b>猜想群島</b><span>中山大學南部高中數學人才培育班導覽</span>';
      document.getElementById('islStage').appendChild(t);
    });
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForFunction(() => !document.documentElement.classList.contains('gl-pending') && document.body.classList.contains('webgl-ready'), { timeout: 60000 });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: path.join(ROOT, 'og.png') });
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
