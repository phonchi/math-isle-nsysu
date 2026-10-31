/* 五個小互動。每個都只有一個主要操作，不計分、不需過關，也不依賴 Three.js。 */
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids);
  return n;
};
const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };

const ACTIVITIES = {
  /* 首屏共同題：棋盤缺兩角。先猜，再看理由 */
  board(body) {
    const f = DATA.featured, NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 80 80');
    svg.setAttribute('class', 'board-svg');
    svg.setAttribute('role', 'img');
    const cells = [];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', x * 10); r.setAttribute('y', y * 10); r.setAttribute('width', 10); r.setAttribute('height', 10);
      svg.appendChild(r); cells.push({ r, x, y });
    }
    const q = el('p', { className: 'act-q' }), row = el('div', { className: 'act-row' });
    const why = el('p', { className: 'act-why' });
    why.setAttribute('aria-live', 'polite');
    const after = el('div', { className: 'act-row hook-after' });
    const wordOf = v => (v ? f.yes : f.no);
    function draw(i) {
      const round = f.rounds[i];
      cells.forEach(({ r, x, y }) => r.setAttribute('class', round.gone.some(g => g[0] === x && g[1] === y) ? 'is-gone' : (x + y) % 2 ? 'is-light' : 'is-dark'));
      svg.setAttribute('aria-label', `8 乘 8 的黑白棋盤，去掉${i ? '左上和右上' : '左上和右下'}兩個角格`);
      q.textContent = round.q; why.hidden = true; after.hidden = true;
      const buttons = [true, false].map(value => {
        const b = el('button', { type: 'button', className: 'act-btn', textContent: wordOf(value) });
        b.addEventListener('click', () => {
          buttons.forEach(x => { x.disabled = true; });
          b.setAttribute('aria-pressed', 'true');
          const verdict = value === round.answer ? `猜對了，答案是「${wordOf(round.answer)}」。` : `你選「${wordOf(value)}」，答案是「${wordOf(round.answer)}」。`;
          why.replaceChildren(el('b', { textContent: verdict }), ` ${round.why}`, el('span', { className: 'hook-next', textContent: f.prompt }));
          const again = el('button', { type: 'button', className: 'act-btn', textContent: '換人猜' });
          again.addEventListener('click', () => draw(0));
          after.replaceChildren(again);
          if (i + 1 < f.rounds.length) {
            const next = el('button', { type: 'button', className: 'act-btn is-primary', textContent: '再一題' });
            next.addEventListener('click', () => draw(i + 1));
            after.prepend(next);
          }
          why.hidden = false; after.hidden = false;
        });
        return b;
      });
      row.replaceChildren(...buttons);
    }
    draw(0);
    body.replaceChildren(el('div', { className: 'hook-row' }, svg, el('div', {}, q, row)), why, after);
  },

  /* 奇數和：每按一次，外圍多一圈 L */
  dots(body) {
    const MAX = 8, GAP = 10, NS = 'http://www.w3.org/2000/svg';
    let n = 1;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${MAX * GAP} ${MAX * GAP}`);
    svg.setAttribute('class', 'dots-svg');
    svg.setAttribute('role', 'img');
    const dots = [];
    for (let y = 0; y < MAX; y++) for (let x = 0; x < MAX; x++) {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', x * GAP + GAP / 2); c.setAttribute('cy', (MAX - 1 - y) * GAP + GAP / 2); c.setAttribute('r', 3.4);
      svg.appendChild(c); dots.push({ c, layer: Math.max(x, y) });
    }
    const eq = el('p', { className: 'act-eq' });
    eq.setAttribute('aria-live', 'polite');
    const why = el('p', { className: 'act-why', textContent: '看點陣就知道原因：多一圈 L，n×n 的正方形就變成 (n+1)×(n+1)。' });
    const btn = el('button', { type: 'button', className: 'act-btn is-primary' });
    function draw() {
      dots.forEach(({ c, layer }) => c.setAttribute('fill', layer >= n ? '#ddd5c4' : layer === n - 1 ? '#c0392b' : layer % 2 ? '#f5b82e' : '#2c3e7a'));
      const odds = Array.from({ length: n }, (_, i) => 2 * i + 1);
      eq.textContent = `${odds.join(' + ')} = ${n * n} = ${n}²`;
      svg.setAttribute('aria-label', `${n} 乘 ${n} 的點陣`);
      btn.textContent = n < MAX ? `再加一圈（多 ${2 * n + 1} 個點）` : '從頭再來';
    }
    btn.addEventListener('click', () => { n = n < MAX ? n + 1 : 1; draw(); });
    draw();
    body.replaceChildren(svg, eq, el('div', { className: 'act-row' }, btn), why);
  },

  /* 判斷真假：答完才看理由 */
  claims(body) {
    let i = 0;
    const q = el('p', { className: 'act-q' }), row = el('div', { className: 'act-row' });
    const why = el('p', { className: 'act-why', hidden: true });
    why.setAttribute('aria-live', 'polite');
    const next = el('button', { type: 'button', className: 'act-btn', textContent: '換一題', hidden: true });
    function draw() {
      const c = DATA.claims[i];
      q.textContent = c.q; why.hidden = true; next.hidden = true;
      const mk = (label, value) => {
        const b = el('button', { type: 'button', className: 'act-btn', textContent: label });
        b.addEventListener('click', () => {
          [...row.querySelectorAll('button')].forEach(x => { if (x !== next) x.disabled = true; });
          b.setAttribute('aria-pressed', 'true');
          why.replaceChildren(el('b', { textContent: value === c.answer ? '猜對了。' : `這句話${c.answer ? '成立' : '不成立'}。` }), ' ' + c.why);
          why.hidden = false; next.hidden = false;
        });
        return b;
      };
      row.replaceChildren(mk('永遠成立', true), mk('不一定', false), next);
    }
    next.addEventListener('click', () => { i = (i + 1) % DATA.claims.length; draw(); });
    draw();
    body.replaceChildren(q, row, why);
  },

  /* n! 含幾個因數 2：拉滑桿 */
  primes(body) {
    const id = 'primes-n';
    const label = el('label', { htmlFor: id, className: 'act-q' });
    const range = el('input', { type: 'range', id, min: 1, max: 100, value: 8 });
    const eq = el('p', { className: 'act-eq' });
    eq.setAttribute('aria-live', 'polite');
    const why = el('p', { className: 'act-why', textContent: '每個偶數先算一個 2，4 的倍數再多算一個，8 的倍數再多算一個……把每一層的倍數個數加起來就好。碼頭 1 到 8 號共有 7 個木箱，正好是 8! 含的因數 2 個數。' });
    function draw() {
      const n = +range.value, terms = [];
      for (let k = 2; k <= n; k *= 2) terms.push(Math.floor(n / k));
      label.textContent = `n = ${n}`;
      const total = terms.reduce((a, b) => a + b, 0);
      eq.textContent = terms.length ? `${n}! 含 ${terms.join(' + ')} = ${total} 個因數 2` : `${n}! 含 0 個因數 2`;
    }
    range.addEventListener('input', draw);
    draw();
    body.replaceChildren(label, range, eq, why);
  },

  /* 正多面體：用 Canvas 2D 畫，沒有 WebGL 也能轉 */
  solids(body) {
    const P = (1 + Math.sqrt(5)) / 2, Q = 1 / P;
    const SOLIDS = [
      ['正四面體', [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]]],
      ['正六面體', [-1, 1].flatMap(x => [-1, 1].flatMap(y => [-1, 1].map(z => [x, y, z])))],
      ['正八面體', [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]],
      ['正十二面體', [...[-1, 1].flatMap(x => [-1, 1].flatMap(y => [-1, 1].map(z => [x, y, z]))),
        ...[-1, 1].flatMap(a => [-1, 1].flatMap(b => [[0, a * Q, b * P], [a * Q, b * P, 0], [a * P, 0, b * Q]]))]],
      ['正二十面體', [-1, 1].flatMap(a => [-1, 1].flatMap(b => [[0, a, b * P], [a, b * P, 0], [a * P, 0, b]]))],
    ].map(([name, v]) => ({ name, ...polyhedron(v) }));
    const canvas = el('canvas', { className: 'solid-canvas', width: 460, height: 460 });
    canvas.setAttribute('role', 'img');
    const row = el('div', { className: 'act-row' });
    const eq = el('p', { className: 'act-eq' });
    eq.setAttribute('aria-live', 'polite');
    const table = el('table', { className: 'solid-table' });
    const trs = SOLIDS.map(s => {
      const tr = el('tr', {}, el('th', { scope: 'row', textContent: s.name }), ...[s.V, s.E, s.F, s.V - s.E + s.F].map(x => el('td', { textContent: x })));
      return tr;
    });
    table.append(el('thead', {}, el('tr', {}, ...['', 'V', 'E', 'F', 'V−E+F'].map(t => el('th', { scope: 'col', textContent: t })))), el('tbody', {}, ...trs));
    let cur = 2, rx = .5, ry = .6, drag = null, visible = false, raf = 0, last = 0;
    const btns = SOLIDS.map((s, i) => {
      const b = el('button', { type: 'button', className: 'act-btn', textContent: s.name.replace('正', '') });
      b.addEventListener('click', () => choose(i));
      return b;
    });
    row.append(...btns);
    function choose(i) {
      cur = i;
      const s = SOLIDS[i];
      btns.forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
      trs.forEach((t, j) => t.classList.toggle('is-on', j === i));
      eq.textContent = `V − E + F = ${s.V} − ${s.E} + ${s.F} = ${s.V - s.E + s.F}`;
      canvas.setAttribute('aria-label', `${s.name}，${s.V} 個頂點、${s.E} 條邊、${s.F} 個面`);
      paint();
    }
    function paint() {
      const g = canvas.getContext('2d'); if (!g) return;
      const S = SOLIDS[cur], W = canvas.width, c = W / 2, R = W * .37;
      const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry);
      const pts = S.verts.map(([x, y, z]) => {
        const x1 = x * cy + z * sy, z1 = -x * sy + z * cy, y1 = y * cx - z1 * sx, z2 = y * sx + z1 * cx;
        return [c + x1 * R, c - y1 * R, z2];
      });
      g.clearRect(0, 0, W, W);
      g.lineJoin = 'round';
      S.faces.map((f, i) => {
        const n = S.normals[i];
        const nx = n[0] * cy + n[2] * sy, z1 = -n[0] * sy + n[2] * cy, ny = n[1] * cx - z1 * sx, nz = n[1] * sx + z1 * cx;
        return { f, nx, ny, nz };
      }).filter(o => o.nz > 1e-6).forEach(({ f, nx, ny, nz }) => {
        const lit = Math.max(0, .35 * nx + .45 * ny + .82 * nz);
        g.beginPath();
        f.forEach((v, i) => (i ? g.lineTo(pts[v][0], pts[v][1]) : g.moveTo(pts[v][0], pts[v][1])));
        g.closePath();
        g.fillStyle = `rgb(${Math.round(70 + 155 * lit)},${Math.round(92 + 120 * lit)},${Math.round(150 + 80 * lit)})`;
        g.fill(); g.strokeStyle = '#1a1a2e'; g.lineWidth = 3; g.stroke();
      });
      pts.filter(p => p[2] > -1e-6).forEach(p => { g.beginPath(); g.arc(p[0], p[1], 7, 0, 7); g.fillStyle = '#f5b82e'; g.fill(); g.strokeStyle = '#1a1a2e'; g.lineWidth = 2; g.stroke(); });
    }
    function tick(t) {
      raf = 0;
      if (!visible || document.hidden || reduceMotion.matches) return;
      if (!drag) { ry += Math.min(.05, (t - last) / 1000) * .45; paint(); }
      last = t; raf = requestAnimationFrame(tick);
    }
    const start = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } };
    canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => {
      if (!drag) return;
      ry += (e.clientX - drag.x) * .012; rx += (e.clientY - drag.y) * .012; drag = { x: e.clientX, y: e.clientY }; paint();
    });
    const stop = () => { drag = null; };
    canvas.addEventListener('pointerup', stop); canvas.addEventListener('pointercancel', stop);
    if ('IntersectionObserver' in window) new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) start(); }).observe(canvas);
    document.addEventListener('visibilitychange', start);
    const legend = el('p', { className: 'solid-legend', textContent: 'V 是頂點數，E 是邊數，F 是面數。' });
    body.replaceChildren(canvas, eq, legend, row, table);
    choose(cur);
  },

  /* 隨手一題：翻開答案、換一題 */
  puzzles(body) {
    const order = DATA.puzzles.map((_, i) => i).sort(() => Math.random() - .5);
    let k = 0;
    const q = el('p', { className: 'act-q' }), a = el('p', { className: 'act-why', hidden: true });
    a.setAttribute('aria-live', 'polite');
    const show = el('button', { type: 'button', className: 'act-btn is-primary', textContent: '翻開答案' });
    const next = el('button', { type: 'button', className: 'act-btn', textContent: '換一題' });
    function draw() { const p = DATA.puzzles[order[k]]; q.textContent = p.q; a.textContent = p.a; a.hidden = true; show.disabled = false; }
    show.addEventListener('click', () => { a.hidden = false; show.disabled = true; });
    next.addEventListener('click', () => { k = (k + 1) % order.length; draw(); });
    draw();
    body.replaceChildren(q, el('div', { className: 'act-row' }, show, next), a);
  },
};

/* 由頂點算出凸多面體的面、邊數：點、邊、面都是算出來的，不是抄表。頂點先正規化到單位球。 */
function polyhedron(raw) {
  const len = Math.hypot(...raw[0]);
  const verts = raw.map(v => v.map(x => x / len)), EPS = 1e-6;
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const faces = [], normals = [], seen = new Set();
  for (let i = 0; i < verts.length; i++) for (let j = i + 1; j < verts.length; j++) for (let k = j + 1; k < verts.length; k++) {
    let n = cross(sub(verts[j], verts[i]), sub(verts[k], verts[i]));
    const l = Math.hypot(...n); if (l < EPS) continue;
    n = n.map(x => x / l);
    const d = dot(n, verts[i]), side = verts.map(v => dot(n, v) - d);
    if (side.some(s => s > EPS) && side.some(s => s < -EPS)) continue;
    if (d < 0) n = n.map(x => -x);
    const on = verts.map((_, m) => m).filter(m => Math.abs(side[m]) < EPS), key = on.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    const c = on.reduce((s, m) => [s[0] + verts[m][0], s[1] + verts[m][1], s[2] + verts[m][2]], [0, 0, 0]).map(x => x / on.length);
    const u = sub(verts[on[0]], c), w = cross(n, u);
    faces.push(on.slice().sort((p, q) => Math.atan2(dot(sub(verts[p], c), w), dot(sub(verts[p], c), u)) - Math.atan2(dot(sub(verts[q], c), w), dot(sub(verts[q], c), u))));
    normals.push(n);
  }
  const edges = new Set();
  faces.forEach(f => f.forEach((v, i) => { const a = f[(i + 1) % f.length]; edges.add(Math.min(v, a) + '-' + Math.max(v, a)); }));
  return { verts, faces, normals, V: verts.length, E: edges.size, F: faces.length };
}

document.querySelectorAll('.act[data-activity]').forEach(box => {
  const body = box.querySelector('.act-body'), fn = ACTIVITIES[box.dataset.activity];
  if (body && fn) fn(body);
});
