/* 猜想群島的 UI 層。build_site.py 會依序把本檔、activities.js、island-scene.js inline 進同一個 module。
 * 資訊和小互動都不需要 Three.js。場景載入失敗、卡住或沒有 WebGL 時，頁面留在 2D 列表，內容一樣可讀可玩。 */
const DATA = JSON.parse(document.getElementById('island-data').textContent);
const ISLES = DATA.isles;
const BY = Object.fromEntries(ISLES.map(i => [i.key, i]));
const $ = id => document.getElementById(id);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const sections = new Map(ISLES.map(i => [i.key, $('isle-' + i.key)]));
const SCENE_TIMEOUT_MS = window.__islandSceneTimeoutMs || 8000;
let scene = null, current = null, programmaticUntil = 0, abandoned = false;

function listScrolls() {
  const list = $('islList');
  return getComputedStyle(list).overflowY === 'auto' && list.scrollHeight > list.clientHeight;
}
function scrollToSection(key) {
  const el = sections.get(key); if (!el) return;
  const behavior = reduceMotion.matches ? 'auto' : 'smooth';
  programmaticUntil = performance.now() + 900;
  if (listScrolls()) $('islList').scrollTo({ top: el.offsetTop - 10, behavior });
  else {
    const bar = document.querySelector('.isl-bar').offsetHeight;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - bar - 8, behavior });
  }
}
function setCurrent(key) {
  current = key;
  sections.forEach((el, k) => el.classList.toggle('is-current', k === key));
  document.querySelectorAll('.isl-jump-btn').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.isle === key)));
}
// 點地圖或按鈕：相機飛過去，資訊欄同步捲到該島
function select(key, { scroll = true, fly = true } = {}) {
  if (!BY[key]) return;
  setCurrent(key);
  if (scene) scene.select(key, fly);
  if (scroll) scrollToSection(key);
}
document.querySelectorAll('.isl-jump-btn').forEach(b => {
  b.setAttribute('aria-pressed', 'false');
  b.addEventListener('click', () => select(b.dataset.isle));
});

// 讀資訊時，地圖跟著標出正在讀的島；桌機上相機也會跟過去
let spyRaf = 0, spyFly = 0;
function spy() {
  spyRaf = 0;
  if (performance.now() < programmaticUntil) return;
  const scrolling = listScrolls();
  const top = scrolling ? $('islList').getBoundingClientRect().top : document.querySelector('.isl-bar').offsetHeight;
  const line = top + Math.min(220, window.innerHeight * .3);
  let best = null;
  sections.forEach((el, k) => { const r = el.getBoundingClientRect(); if (r.top <= line && r.bottom > line) best = k; });
  if (best && best !== current) {
    setCurrent(best);
    if (scene) {
      scene.select(best, false);
      if (scrolling) { clearTimeout(spyFly); spyFly = setTimeout(() => { if (scene && current === best) scene.select(best, true); }, 300); }
    }
  }
  updateBack();
}
const queueSpy = () => { if (!spyRaf) spyRaf = requestAnimationFrame(spy); };
$('islList').addEventListener('scroll', queueSpy, { passive: true });
window.addEventListener('scroll', queueSpy, { passive: true });

// 手機上地圖捲出畫面後，提供回到地圖的按鈕
function updateBack() {
  const stage = $('islStage'), bar = document.querySelector('.isl-bar').offsetHeight;
  const show = !!scene && !listScrolls() && stage.getBoundingClientRect().bottom < bar;
  $('islBack').hidden = !show;
  $('islReset').hidden = !scene || show;
}
$('islBack').addEventListener('click', () => {
  programmaticUntil = performance.now() + 900;
  window.scrollTo({ top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
});

/* 會場投影版：盡量不讓投影電腦進入螢幕保護。瀏覽器不支援時就略過 */
if (document.documentElement.classList.contains('show-mode') && navigator.wakeLock) {
  const keepAwake = () => { if (!document.hidden) navigator.wakeLock.request('screen').catch(() => {}); };
  keepAwake();
  document.addEventListener('visibilitychange', keepAwake);
}

/* ── 3D 場景（可選）── */
function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) { return false; }
}
function fallback2D(reason) {
  abandoned = true;
  // 手機上地圖消失時，頁面內容會上移；已經捲下去讀的人，要留在原來讀的位置
  const keep = !listScrolls() && window.scrollY > 0, before = $('islList').getBoundingClientRect().top;
  document.documentElement.classList.remove('gl-pending');
  document.documentElement.classList.add('show-nogl');
  document.body.classList.remove('webgl-ready');
  $('islStage').hidden = true; $('islReset').hidden = true; $('islBack').hidden = true;
  if (keep) window.scrollBy({ top: $('islList').getBoundingClientRect().top - before, behavior: 'instant' });
  scene = null;
  console.info('3D 群島未啟用，改用 2D 列表：' + reason);
}
async function loadThree() {
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('載入逾時')), SCENE_TIMEOUT_MS));
  return Promise.race([Promise.all([
    import('three'),
    import('three/addons/controls/OrbitControls.js'),
    import('three/addons/geometries/RoundedBoxGeometry.js'),
  ]), timeout]);
}
async function initScene() {
  const [THREE, { OrbitControls }, { RoundedBoxGeometry }] = await loadThree();
  if (abandoned) return;
  const stage = $('islStage'), canvas = $('islCanvas');
  document.body.classList.add('webgl-ready');
  stage.hidden = false;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    throw new Error('WebGLRenderer 建立失敗');
  }
  scene = buildWorld(THREE, { OrbitControls, RoundedBoxGeometry }, renderer, stage, canvas);
  $('islReset').hidden = false;
  $('islReset').addEventListener('click', () => {
    if (!scene) return;
    setCurrent(null); scene.select(null, false); scene.reset();
  });
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); if (scene) scene.dispose(); fallback2D('WebGL context lost'); });
  window.__island = { screenPos: k => scene && scene.screenPos(k), pickAt: (x, y) => scene && scene.pickAt(x, y), stats: () => scene && scene.stats(), monkey: () => scene && scene.monkey() };
  if (current) scene.select(current, false);
  await scene.warm();
  document.documentElement.classList.remove('gl-pending');
}
if (hasWebGL()) initScene().catch(err => fallback2D(err && err.message ? err.message : String(err)));
else fallback2D('瀏覽器沒有 WebGL');
