#!/usr/bin/env node
/* 瀏覽器驗收：正常、載入失敗、載入卡住、沒有 WebGL × 桌機與手機。
 * 用法：SHOT_DIR=shots node tools/check_browser.js
 * puppeteer-core 裝在 ~/.cache/selfstudy-node。 */
const path = require('path'), fs = require('fs'), http = require('http');
const PPT_HOME = process.env.PPT_HOME || path.join(process.env.HOME, '.cache/selfstudy-node');
const puppeteer = require(path.join(PPT_HOME, 'node_modules', 'puppeteer-core'));
const ROOT = path.resolve(__dirname, '..');
const SHOT_DIR = process.env.SHOT_DIR || path.join(ROOT, 'shots');
const CHROME = process.env.CHROME_PATH || (() => {
  const base = path.join(process.env.HOME, '.cache/puppeteer/chrome');
  const d = fs.readdirSync(base).sort();
  return path.join(base, d[d.length - 1], 'chrome-linux64', 'chrome');
})();
const IGNORE = [/software WebGL/i, /GL Driver Message/i, /GPU stall/i, /fonts\.g/i, /net::ERR/i, /Failed to load resource/i, /Failed to fetch dynamically/i];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const problems = [];
const note = m => { problems.push(m); console.log('  ✗ ' + m); };
const ok = m => console.log('  ✓ ' + m);

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname), file = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${server.address().port}/`;
  const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const VIEW = { desktop: { width: 1366, height: 800 }, phone: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } };

  async function open(mode, view) {
    const page = await browser.newPage(), errors = [];
    await page.setViewport(VIEW[view]);
    page.on('console', m => { if (['error', 'warning'].includes(m.type()) && !IGNORE.some(r => r.test(m.text()))) errors.push(m.text()); });
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    if (mode === 'abort' || mode === 'hang') {
      await page.setRequestInterception(true);
      page.on('request', r => {
        if (!/vendor\/three/.test(r.url())) { r.continue().catch(() => {}); return; }
        if (mode === 'abort') r.abort().catch(() => {});   // hang：不回應，模擬卡住
      });
    }
    if (mode === 'nogl') await page.evaluateOnNewDocument(() => {
      const o = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (t, ...r) { return /webgl/i.test(t) ? null : o.call(this, t, ...r); };
    });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    return { page, errors };
  }
  const baseline = async (page, label) => {
    const r = await page.evaluate(() => {
      const de = document.documentElement;
      return { over: de.scrollWidth - de.clientWidth, sections: [...document.querySelectorAll('.isle')].filter(s => s.offsetParent).length, built: [...document.querySelectorAll('.act-btn, input[type=range], canvas.solid-canvas')].length };
    });
    if (r.over > 1) note(`${label}：橫向溢出 ${r.over}px`); else ok(`${label}：沒有橫向溢出`);
    if (r.sections !== 5) note(`${label}：只看到 ${r.sections}/5 座島的資訊`); else ok(`${label}：五座島的資訊都可讀`);
    if (!r.built) note(`${label}：小互動沒有建立`);
  };

  /* 正常 3D */
  for (const view of ['desktop', 'phone']) {
    console.log(`▶ 正常 · ${view}`);
    const { page, errors } = await open('normal', view);
    await page.waitForFunction(() => !document.documentElement.classList.contains('gl-pending') && document.body.classList.contains('webgl-ready'), { timeout: 60000 });
    await sleep(2500);
    await baseline(page, view);
    await page.screenshot({ path: path.join(SHOT_DIR, `${view}-home.png`) });
    const stats = await page.evaluate(() => window.__island.stats());
    // 上限只防止之後越加越多，不是效能保證；實機效能要另外測
    stats.calls <= 90 ? ok(`繪製呼叫 ${stats.calls}、三角形 ${stats.triangles}`) : note(`繪製呼叫過多：${stats.calls}`);
    const seen = new Set();
    for (const key of ['plan', 'junior', 'middle', 'senior', 'harbor']) {
      const p = await page.evaluate(k => window.__island.screenPos(k), key);
      const picked = await page.evaluate(({ x, y }) => window.__island.pickAt(x, y), p);
      if (picked !== key) note(`${view}：點 ${key} 的位置選到 ${picked}`); else seen.add(key);
    }
    seen.size === 5 ? ok('五座島都點得到') : note('有島點不到');
    const before = await page.evaluate(() => window.__island.monkey());
    await page.evaluate(() => document.querySelector('.isl-jump-btn[data-isle="senior"]').click());
    await sleep(1600);
    const after = await page.evaluate(() => {
      const s = document.querySelector('#isle-senior'), r = s.getBoundingClientRect();
      return { cur: s.classList.contains('is-current'), top: r.top, m: window.__island.monkey() };
    });
    after.cur ? ok('選島後資訊同步標示') : note('選島後資訊沒有標示');
    Math.hypot(after.m.x - before.x, after.m.z - before.z) > 5 ? ok('小獼猴跳到選取的島') : note('小獼猴沒有移動');
    after.top < VIEW[view].height ? ok('選島後資訊捲入畫面') : note(`選島後資訊沒有捲入畫面 top=${after.top}`);
    await page.screenshot({ path: path.join(SHOT_DIR, `${view}-senior.png`) });

    await page.evaluate(() => document.querySelector('.isl-jump-btn[data-isle="middle"]').click());
    await sleep(1600);
    await page.screenshot({ path: path.join(SHOT_DIR, `${view}-middle.png`) });

    /* 小互動 */
    const acts = await page.evaluate(async () => {
      const out = {};
      const hook = document.querySelector('[data-activity=board]');
      const counts = () => ['is-gone', 'is-dark', 'is-light'].map(c => hook.querySelectorAll(`svg rect.${c}`).length).join();
      const choices = () => hook.querySelectorAll('.hook-row .act-btn');
      const after = t => [...hook.querySelectorAll('.hook-after .act-btn')].find(b => b.textContent === t);
      out.hookFirst = counts();
      out.hookBefore = hook.querySelector('.act-why').hidden;
      choices()[0].click();
      out.hookWrong = hook.querySelector('.act-why').textContent;
      out.hookOpacity = getComputedStyle(choices()[0]).opacity;
      after('換人猜').click();
      out.hookReset = hook.querySelector('.act-why').hidden && !choices()[1].disabled;
      choices()[1].click();
      out.hookWhy = hook.querySelector('.act-why').textContent;
      after('再一題').click();
      out.hookSecond = counts();
      choices()[0].click();
      out.hookSecondWhy = hook.querySelector('.act-why').textContent;
      out.hookNoMore = !after('再一題') && !!after('換人猜');
      after('換人猜').click();
      out.hookBack = counts();
      out.hookNow = !!document.querySelector('.isl-tag-now') && !!document.querySelector('#isle-junior .isle-now');
      out.primesDefault = document.querySelector('[data-activity=primes] .act-eq').textContent;
      const dots = document.querySelector('[data-activity=dots]');
      const eq = () => dots.querySelector('.act-eq').textContent;
      dots.querySelector('button').click(); dots.querySelector('button').click();
      out.dots = eq();
      const c = document.querySelector('[data-activity=claims]');
      c.querySelectorAll('button')[0].click();
      out.claimWhy = !c.querySelector('.act-why').hidden;
      c.querySelector('.act-row button:last-child').click();
      out.claimNext = c.querySelector('.act-q').textContent;
      const r = document.querySelector('[data-activity=primes] input');
      r.value = 100; r.dispatchEvent(new Event('input'));
      out.primes = document.querySelector('[data-activity=primes] .act-eq').textContent;
      const s = document.querySelector('[data-activity=solids]');
      out.table = [...s.querySelectorAll('tbody tr')].map(t => [...t.cells].slice(1).map(x => +x.textContent));
      s.querySelectorAll('.act-row button')[3].click();
      out.solidEq = s.querySelector('.act-eq').textContent;
      const p = document.querySelector('[data-activity=puzzles]');
      p.querySelector('.is-primary').click();
      out.puzzleOpen = !p.querySelector('.act-why').hidden;
      return out;
    });
    acts.hookFirst === '2,30,32' && acts.hookSecond === '2,31,31' && acts.hookBack === '2,30,32' ? ok('首屏棋盤：第一題 30 比 32，第二題 31 比 31，換人猜回第一題') : note(`首屏棋盤錯誤：${JSON.stringify(acts)}`);
    acts.hookBefore && acts.hookWrong.startsWith('你選「能」，答案是「不能」') && acts.hookWhy.startsWith('猜對了，答案是「不能」') && acts.hookWhy.includes('旁邊的人') ? ok('首屏題作答後才顯示理由，猜錯也講清楚') : note('首屏題互動失敗：' + acts.hookWhy);
    acts.hookOpacity === '1' ? ok('選過的答案不再變灰') : note('選過的答案仍是半透明：' + acts.hookOpacity);
    acts.hookReset && acts.hookSecondWhy.startsWith('猜對了，答案是「能」') && acts.hookNoMore ? ok('換人猜與第二題正常') : note('換人猜或第二題失敗：' + JSON.stringify(acts));
    acts.hookNow ? ok('初級島的資訊卡與 3D 標籤都有「你在這裡」') : note('缺「你在這裡」');
    acts.primesDefault === '8! 含 4 + 2 + 1 = 7 個因數 2' ? ok('滑桿預設：' + acts.primesDefault) : note('滑桿預設錯誤：' + acts.primesDefault);
    acts.dots.endsWith('= 9 = 3²') ? ok('點陣互動：' + acts.dots) : note('點陣結果錯誤：' + acts.dots);
    acts.claimWhy && acts.claimNext ? ok('真假題可作答、可換題') : note('真假題互動失敗');
    /= 97 個因數 2$/.test(acts.primes) ? ok('滑桿互動：' + acts.primes) : note('滑桿結果錯誤：' + acts.primes);
    JSON.stringify(acts.table) === JSON.stringify([[4, 6, 4, 2], [8, 12, 6, 2], [6, 12, 8, 2], [20, 30, 12, 2], [12, 30, 20, 2]]) ? ok('五種正多面體算出的 V、E、F 正確') : note('正多面體計算錯誤：' + JSON.stringify(acts.table));
    acts.puzzleOpen ? ok('隨手一題可翻開答案') : note('隨手一題失敗');
    for (const k of ['dots', 'claims', 'primes', 'solids', 'puzzles']) {
      const h = await page.$(`.act[data-activity=${k}]`);
      await h.evaluate(e => { const l = document.getElementById('islList'); if (getComputedStyle(l).overflowY === 'auto') l.scrollTop = e.offsetTop - 80; else window.scrollTo(0, e.getBoundingClientRect().top + scrollY - 80); });
      await sleep(250);
      if (k === 'solids' || k === 'dots') await page.screenshot({ path: path.join(SHOT_DIR, `${view}-act-${k}.png`) });
    }
    if (view === 'phone') {
      await page.evaluate(() => window.scrollTo(0, 1800)); await sleep(500);
      const back = await page.evaluate(() => {
        const b = document.getElementById('islBack');
        return { vis: !b.hidden, inBar: !!b.closest('.isl-bar'), reset: document.getElementById('islReset').hidden, h: Math.min(...[...document.querySelectorAll('.isl-btn:not([hidden])')].map(x => x.offsetHeight)), over: document.documentElement.scrollWidth - document.documentElement.clientWidth };
      });
      back.vis && back.inBar && back.reset && back.over <= 1 ? ok('手機捲離地圖後，頂列出現「地圖」，不遮文字') : note('「回到地圖」異常：' + JSON.stringify(back));
      back.h >= 44 ? ok('手機頂列按鈕至少 44px') : note(`頂列按鈕太小：${back.h}px`);
      await page.screenshot({ path: path.join(SHOT_DIR, 'phone-scrolled.png') });
    }
    errors.length ? note(`${view} 主控台錯誤：${errors.join(' | ')}`) : ok('主控台沒有錯誤');
    await page.close();
  }

  /* 故障情境 */
  for (const mode of ['abort', 'hang', 'nogl']) for (const view of ['desktop', 'phone']) {
    console.log(`▶ ${mode} · ${view}`);
    const t0 = Date.now();
    const { page, errors } = await open(mode, view);
    // 手機慢網：讀者已捲到島嶼資訊時退回 2D，讀的位置不能跳
    const held = mode === 'hang' && view === 'phone';
    const topBefore = held ? await page.evaluate(() => { window.scrollTo({ top: 900, behavior: 'instant' }); return document.getElementById('isle-plan').getBoundingClientRect().top; }) : 0;
    await page.waitForFunction(() => !document.documentElement.classList.contains('gl-pending'), { timeout: 15000 }).catch(() => note(`${mode}/${view}：15 秒內沒有退回 2D`));
    const ms = Date.now() - t0;
    await sleep(300);
    if (held) {
      const topAfter = await page.evaluate(() => document.getElementById('isle-plan').getBoundingClientRect().top);
      Math.abs(topAfter - topBefore) < 3 ? ok('退回 2D 時，閱讀位置不跳') : note(`退回 2D 時畫面跳了 ${topAfter - topBefore}px`);
    }
    const st = await page.evaluate(() => ({ stage: !document.getElementById('islStage').hidden && getComputedStyle(document.getElementById('islStage')).display !== 'none', gl: document.body.classList.contains('webgl-ready') }));
    !st.stage && !st.gl ? ok(`${ms} ms 內退回 2D`) : note(`${mode}/${view} 沒有退回 2D`);
    if (mode === 'hang' && ms > 9500) note(`卡住時太晚才退回：${ms} ms`);
    await baseline(page, `${mode}/${view}`);
    const solidsOK = await page.evaluate(() => { const s = document.querySelector('[data-activity=solids] canvas'); return !!s && !!s.getContext('2d'); });
    solidsOK ? ok('沒有 3D 場景時，正多面體互動仍可用') : note('沒有 3D 時正多面體失效');
    await page.screenshot({ path: path.join(SHOT_DIR, `${mode}-${view}.png`) });
    errors.length ? note(`${mode}/${view} 主控台錯誤：${errors.join(' | ')}`) : ok('主控台沒有錯誤');
    await page.close();
  }

  /* 會場投影版 */
  for (const [name, size] of [['1080p', { width: 1920, height: 1080 }], ['720p', { width: 1280, height: 720 }], ['4x3', { width: 1024, height: 768 }]]) {
    console.log(`▶ 投影版 · ${name}`);
    const page = await browser.newPage(), errors = [];
    await page.setViewport(size);
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE + '?show', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !document.documentElement.classList.contains('gl-pending') && document.body.classList.contains('webgl-ready'), { timeout: 60000 });
    await sleep(2500);
    const s1 = await page.evaluate(() => window.__island.stats());
    await sleep(2000);
    const r = await page.evaluate(() => {
      const vis = q => { const e = document.querySelector(q); return !!e && getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0; };
      const card = document.querySelector('.show-card').getBoundingClientRect(), img = document.querySelector('.show-card img');
      return { bar: vis('.isl-bar'), list: vis('.isl-list'), jumps: vis('.isl-jumps'), card: vis('.show-card'), title: vis('.show-title'), qr: img.complete && img.naturalWidth > 0,
        inside: card.left >= 0 && card.top >= 0 && card.right <= innerWidth && card.bottom <= innerHeight, qrPx: img.getBoundingClientRect().width,
        over: document.documentElement.scrollWidth - innerWidth, draws: window.__island.stats().draws };
    });
    !r.bar && !r.list && !r.jumps && r.card && r.title ? ok('只留群島、站名和 QR') : note('投影版元素異常：' + JSON.stringify(r));
    r.qr && r.inside && r.over <= 1 ? ok(`QR 完整顯示，邊長 ${Math.round(r.qrPx)}px`) : note('投影版 QR 異常：' + JSON.stringify(r));
    r.draws > s1.draws ? ok('群島持續慢慢轉') : note('投影版沒有轉動');
    await page.screenshot({ path: path.join(SHOT_DIR, `show-${name}.png`) });
    errors.length ? note('投影版錯誤：' + errors.join(' | ')) : ok('沒有頁面錯誤');
    await page.close();
  }
  {
    console.log('▶ 投影版 · 沒有 WebGL');
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.evaluateOnNewDocument(() => {
      const o = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (t, ...r) { return /webgl/i.test(t) ? null : o.call(this, t, ...r); };
    });
    await page.goto(BASE + '?show', { waitUntil: 'networkidle0' });
    const r = await page.evaluate(() => { const c = document.querySelector('.show-card').getBoundingClientRect(), t = document.querySelector('.show-title').getBoundingClientRect(), i = document.querySelector('.show-card img'); return { nogl: document.documentElement.classList.contains('show-nogl'), qr: i.naturalWidth > 0, cx: c.left + c.width / 2, inside: c.top >= 0 && c.bottom <= innerHeight, clear: c.top >= t.bottom || c.left >= t.right }; });
    r.nogl && r.qr && r.inside && r.clear && Math.abs(r.cx - 640) < 3 ? ok('跑不動 3D 時，QR 放大置中') : note('投影版退路異常：' + JSON.stringify(r));
    await page.screenshot({ path: path.join(SHOT_DIR, 'show-nogl.png') });
    await page.close();
  }

  /* 家長頁：純 HTML，不載入 Three.js */
  console.log('▶ 家長頁');
  {
    const page = await browser.newPage(), urls = [];
    await page.setViewport(VIEW.phone);
    page.on('request', r => urls.push(r.url()));
    await page.goto(BASE + 'parents.html', { waitUntil: 'networkidle0' });
    const r = await page.evaluate(() => ({ over: document.documentElement.scrollWidth - document.documentElement.clientWidth, sections: document.querySelectorAll('section').length, scripts: document.scripts.length }));
    r.sections === 5 && r.over <= 1 ? ok('家長頁五節完整、沒有橫向溢出') : note('家長頁版面異常：' + JSON.stringify(r));
    r.scripts === 0 && !urls.some(u => /three/.test(u)) ? ok('家長頁不載入腳本') : note('家長頁載入了腳本');
    await page.screenshot({ path: path.join(SHOT_DIR, 'parents-phone.png') });
    await page.close();
  }

  await browser.close(); server.close();
  if (problems.length) { console.log(`\n${problems.length} 項失敗`); process.exit(1); }
  console.log('\n瀏覽器檢查全部通過');
})().catch(e => { console.error(e); process.exit(2); });
