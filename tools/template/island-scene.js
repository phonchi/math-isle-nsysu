/* 猜想群島的場景層。由 island.js 的 initScene() 呼叫 buildWorld()。零件工具與島嶼工廠改寫自 ds-cpp-selfstudy 的知識群島。
 * 全部程序化，沒有模型或圖檔。靜態零件合併成 InstancedMesh，陰影只烘一次；繪製依需要排程，閒置就停。 */
function buildWorld(THREE, addons, renderer, stage, canvas) {
  const { OrbitControls, RoundedBoxGeometry } = addons;
  const motion = () => !reduceMotion.matches;
  const SHOW = document.documentElement.classList.contains('show-mode');
  const narrow = () => stage.clientWidth < 768;
  const rnd = mulberry32(115);
  const SQ = Math.SQRT1_2;
  const toWorld = (u, v) => ({ x: (u + v) * SQ, z: (v - u) * SQ });   // 初始視角的螢幕座標 → 世界座標
  const world = new THREE.Scene();
  const anims = [];
  let need = true, raf = 0, onScreen = true, alive = true, dprLevel = 0, tagsDirty = true, draws = 0;

  const C = {
    grass: '#b4d18a', grass2: '#a3c67e', grass3: '#c4dc9c', sand: '#eedbb0', cliff: '#dcc39a', cliffDark: '#c2a477', foam: '#fbfaf2', shallow: '#bfe0d6',
    wall: '#f5e6cb', roof: '#b9563f', navy: '#2c3e7a', forest: '#3f7f61', leaf: '#9fb889', leaf2: '#8fae86', leaf3: '#7c9a76', pine: '#7b997c', pine2: '#68876c',
    wood: '#ab875d', woodDark: '#7a5c3e', stone: '#dacdb6', stoneDark: '#b6a78c', ink: '#4f5a55', gold: '#f5b82e', white: '#fffcf3', red: '#c0392b', fur: '#8d6a4f', skin: '#e9b794',
  };
  const BG = '#a2dbe6';

  /* ── Renderer 與光線 ── */
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  world.background = new THREE.Color(BG);
  world.add(new THREE.HemisphereLight('#fff4dc', '#7d9d8f', 1.3));
  const sun = new THREE.DirectionalLight('#ffe4c4', 2.9);
  sun.position.set(-30, 60, 25); sun.castShadow = true;
  sun.shadow.mapSize.set(narrow() ? 1024 : 2048, narrow() ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50, near: 1, far: 160 });
  sun.shadow.bias = -.0006; sun.shadow.radius = 3;
  world.add(sun);
  const fill = new THREE.DirectionalLight('#dbeafe', .45); fill.position.set(30, 25, -20); world.add(fill);

  const std = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
  const basic = (color, extra) => new THREE.MeshBasicMaterial({ color, ...extra });

  /* ── PartKit：零件 → InstancedMesh ── */
  const prismGeo = (() => {
    const tri = new THREE.Shape();
    tri.moveTo(-.5, -.5); tri.lineTo(.5, -.5); tri.lineTo(0, .5); tri.closePath();
    const g = new THREE.ExtrudeGeometry(tri, { depth: 1, bevelEnabled: false });
    g.translate(0, 0, -.5); g.computeVertexNormals(); return g;
  })();
  const GEO = {
    box: new THREE.BoxGeometry(1, 1, 1), round: new RoundedBoxGeometry(1, 1, 1, 1, .14), cyl: new THREE.CylinderGeometry(.5, .5, 1, 12),
    cone: new THREE.ConeGeometry(.5, 1, 10), sphere: new THREE.SphereGeometry(.5, 12, 8), rock: new THREE.DodecahedronGeometry(.5, 0), prism: prismGeo,
    torus: new THREE.TorusGeometry(.5, .06, 8, 32), dome: new THREE.SphereGeometry(.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  };
  const kitMat = std('#ffffff');
  const glowMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const parts = [];
  function part(kind, x, y, z, w, h, d, color, o = {}) {
    parts.push({ kind, x, y, z, w, h, d, color, rx: o.rx || 0, ry: o.ry || 0, rz: o.rz || 0, glow: !!o.glow });
  }
  function at(ox, oy, oz, rot = 0, s = 1) {
    const c = Math.cos(rot), sn = Math.sin(rot);
    return (kind, x, y, z, w, h, d, color, o = {}) =>
      part(kind, ox + (x * c + z * sn) * s, oy + y * s, oz + (-x * sn + z * c) * s, w * s, h * s, d * s, color, { ...o, ry: (o.ry || 0) + rot });
  }
  function flushParts() {
    const groups = new Map();
    parts.forEach(p => { const k = p.kind + (p.glow ? '|g' : ''); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); });
    const o = new THREE.Object3D(); o.rotation.order = 'YXZ';
    const col = new THREE.Color();
    groups.forEach((list, k) => {
      const glow = k.endsWith('|g');
      const mesh = new THREE.InstancedMesh(GEO[list[0].kind], glow ? glowMat : kitMat, list.length);
      list.forEach((p, i) => {
        o.position.set(p.x, p.y + p.h / 2, p.z); o.rotation.set(p.rx, p.ry, p.rz); o.scale.set(p.w, p.h, p.d);
        o.updateMatrix(); mesh.setMatrixAt(i, o.matrix); mesh.setColorAt(i, col.set(p.color));
      });
      mesh.castShadow = !glow; mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      world.add(mesh);
    });
    parts.length = 0;
  }

  /* ── 共用道具 ── */
  const LEAVES = [C.leaf, C.leaf2, C.leaf3];
  function tree(p, x, z, s = 1, k = 0) {
    p('cyl', x, 0, z, .16 * s, 1 * s, .16 * s, C.woodDark);
    [[-.24, .75, .08, .9], [.26, .9, .05, .82], [0, 1.18, -.1, .8], [-.05, .86, -.28, .74]].forEach(([dx, dy, dz, d], i) =>
      p('sphere', x + dx * s, dy * s, z + dz * s, d * s, d * .92 * s, d * s, LEAVES[(k + i) % 3]));
  }
  function pine(p, x, z, s = 1, k = 0) {
    p('cyl', x, 0, z, .13 * s, .7 * s, .13 * s, C.woodDark);
    for (let i = 0; i < 3; i++) p('cone', x, (.45 + i * .42) * s, z, (1.05 - i * .24) * s, .95 * s, (1.05 - i * .24) * s, (i + k) % 2 ? C.pine : C.pine2);
  }
  function bush(p, x, z, s = 1, k = 0) {
    p('sphere', x, 0, z, .62 * s, .46 * s, .56 * s, LEAVES[k % 3]);
    p('sphere', x + .26 * s, 0, z + .12 * s, .42 * s, .34 * s, .4 * s, LEAVES[(k + 1) % 3]);
  }
  function cottage(p, x, z, roofC = C.roof, s = 1) {
    p('round', x, -.02, z, 1.62 * s, .14 * s, 1.38 * s, C.stoneDark);
    p('round', x, 0, z, 1.5 * s, 1.05 * s, 1.25 * s, C.wall);
    p('prism', x, 1 * s, z, 1.75 * s, .78 * s, 1.45 * s, roofC);
    p('round', x, 0, z + .6 * s, .36 * s, .66 * s, .08 * s, C.woodDark);
    [-.45, .45].forEach(dx => p('box', x + dx * s, .42 * s, z + .62 * s, .3 * s, .28 * s, .05 * s, '#ffe1a0'));
  }

  /* ── 島工廠 ── */
  const M = {
    grass: std(C.grass), grass2: std(C.grass2), grass3: std(C.grass3), sand: std(C.sand), cliff: std(C.cliff), cliffDark: std(C.cliffDark),
    foam: basic(C.foam, { transparent: true, opacity: .6, depthWrite: false, side: THREE.DoubleSide }),
    shallow: basic(C.shallow, { transparent: true, opacity: .5, depthWrite: false, side: THREE.DoubleSide }),
  };
  const BASE_H = 1.0, BEVEL = .08, GROUND = BASE_H + BEVEL;
  function outline(seed, radius, wobble = .1, n = 56) {
    const r = mulberry32(seed);
    const hs = [[2, .45], [3, .3], [4, .15], [7, .1]].map(([f, w]) => [f, w, r() * Math.PI * 2]);
    return Array.from({ length: n }, (_, i) => {
      const a = i / n * Math.PI * 2, k = 1 + wobble * hs.reduce((s, [f, w, ph]) => s + w * Math.sin(f * a + ph), 0);
      return [Math.cos(a) * radius * k, Math.sin(a) * radius * k];
    });
  }
  const scaled = (pts, s, inset = 0) => pts.map(([x, z]) => {
    const r = Math.hypot(x, z), k = inset ? Math.max(r - inset, r * .05) / r : 1;
    return [x * s * k, z * s * k];
  });
  const shapeOf = pts => {
    const sh = new THREE.Shape();
    pts.forEach(([x, z], i) => (i ? sh.lineTo(x, -z) : sh.moveTo(x, -z)));
    sh.closePath(); return sh;
  };
  function slab(pts, depth, mats, y) {
    const g = new THREE.ExtrudeGeometry(shapeOf(pts), { depth, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: .1, bevelSegments: 2, curveSegments: 4 });
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, mats); m.position.y = y; m.castShadow = true; m.receiveShadow = true; return m;
  }
  function ring(pts, inner, outer, mat, y) {
    const sh = shapeOf(scaled(pts, outer)), hole = new THREE.Path();
    [...scaled(pts, inner)].reverse().forEach(([x, z], i) => (i ? hole.lineTo(x, -z) : hole.moveTo(x, -z)));
    sh.holes.push(hole);
    const g = new THREE.ShapeGeometry(sh, 2); g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, mat); m.position.y = y; m.renderOrder = 1; return m;
  }
  const isles = {}, foamRings = [];
  function makeIsle(key, { u, v, radius, seed, grass = 'grass', highland = 0 }) {
    const { x, z } = toWorld(u, v), pts = outline(seed, radius);
    const g = new THREE.Group(); g.position.set(x, 0, z);
    g.add(ring(pts, 1.24, 1.42, M.shallow, .02));
    const foam = ring(pts, 1.13, 1.19, M.foam, .05); g.add(foam); foamRings.push(foam);
    g.add(slab(scaled(pts, 1.12), .2, [M.sand, M.sand], -.14));
    g.add(slab(scaled(pts, 1), .34, [M.cliffDark, M.cliffDark], 0));
    g.add(slab(scaled(pts, 1, .07), BASE_H, [M[grass], M.cliff], 0));
    let top = GROUND;
    if (highland) { g.add(slab(scaled(pts, highland, .05), 1, [M.grass2, M.cliff], GROUND)); top = GROUND + 1 + BEVEL; }
    world.add(g);
    const angR = a => {
      const n = pts.length, q = ((a / (Math.PI * 2)) % 1 + 1) % 1 * n, i = Math.floor(q), f = q - i;
      const [x0, z0] = pts[i % n], [x1, z1] = pts[(i + 1) % n];
      return Math.hypot(x0, z0) * (1 - f) + Math.hypot(x1, z1) * f;
    };
    const I = { key, x, z, radius, top, angR, gaps: [], labelH: 6 };
    I.inside = (wx, wz, m = .8) => Math.hypot(wx - x, wz - z) < angR(Math.atan2(wz - z, wx - x)) * m;
    isles[key] = I;
    return I;
  }

  /* ── 佈局：計畫島分往高一到高二的路線，以及資源港 ── */
  const plan = makeIsle('plan', { u: -19, v: 15, radius: 9.5, seed: 11, grass: 'grass3' });
  const junior = makeIsle('junior', { u: -17, v: -11, radius: 9, seed: 23 });
  const middle = makeIsle('middle', { u: 5, v: -17, radius: 9, seed: 37, grass: 'grass2' });
  const senior = makeIsle('senior', { u: 22, v: 2, radius: 9.5, seed: 49, highland: .55 });
  const harbor = makeIsle('harbor', { u: 3, v: 20, radius: 9, seed: 61, grass: 'grass3' });
  const FACE = Math.PI / 4;

  /* ── 拱橋 ── */
  const bridges = [];
  function bridge(A, B) {
    const dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
    const aA = Math.atan2(uz, ux), aB = Math.atan2(-uz, -ux), s0 = A.angR(aA) * .9, s1 = L - B.angR(aB) * .9;
    A.gaps.push(aA); B.gaps.push(aB);
    const p0 = new THREE.Vector3(A.x + ux * s0, A.top - .04, A.z + uz * s0), p2 = new THREE.Vector3(A.x + ux * s1, B.top - .04, A.z + uz * s1);
    const p1 = p0.clone().lerp(p2, .5); p1.y = Math.max(p0.y, p2.y) + Math.min(1.6, .22 * (s1 - s0) + .4);
    const curve = new THREE.QuadraticBezierCurve3(p0, p1, p2);
    bridges.push(curve);
    const n = Math.max(4, Math.round(curve.getLength() / .3)), pts = curve.getSpacedPoints(n), ry = Math.atan2(ux, uz);
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[i + 1], h = Math.hypot(b.x - a.x, b.z - a.z), m = a.clone().lerp(b, .5), rx = -Math.atan2(b.y - a.y, h);
      part('box', m.x, m.y - .035, m.z, 1.12, .07, h * .92, i % 3 ? C.wood : C.woodDark, { rx, ry });
      [-1, 1].forEach(side => {
        const ox = uz * .56 * side, oz = -ux * .56 * side;
        part('box', m.x + ox, m.y + .44, m.z + oz, .05, .05, h + .02, C.woodDark, { rx, ry });
        if (i % 3 === 0) part('cyl', m.x + ox, m.y - .1, m.z + oz, .08, .58, .08, C.woodDark);
      });
    }
  }
  bridge(plan, junior); bridge(junior, middle); bridge(middle, senior); bridge(plan, harbor);

  /* ── 地標 ── */
  // 計畫島：燈塔＋會點亮的 L 形點陣（呼應奇數和）
  {
    const p = at(plan.x, plan.top, plan.z, FACE);
    p('cyl', -3, 0, -2.4, 2.8, .4, 2.8, C.stoneDark);
    for (let i = 0; i < 6; i++) p('cyl', -3, .4 + i * 1, -2.4, 2 - i * .13, 1, 2 - i * .13, i % 2 ? C.white : C.red);
    p('cyl', -3, 6.4, -2.4, 1.5, .18, 1.5, C.ink);
    p('cyl', -3, 6.58, -2.4, .9, .9, .9, '#ffe9a8', { glow: true });
    p('cone', -3, 7.48, -2.4, 1.5, 1, 1.5, C.navy);
    const N = 5, S = .95;
    p('round', 2.6, -.02, 1.8, N * S + .5, .12, N * S + .5, C.stone);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const layer = Math.max(i, j);
      p('sphere', 2.6 + (i - 2) * S, .12, 1.8 + (j - 2) * S, .62, .62, .62, layer % 2 ? C.gold : C.navy);
    }
    plan.labelH = 9.2;
  }
  // 初級島：水門＋文氏圖地面（集合與邏輯）
  {
    const p = at(junior.x, junior.top, junior.z, FACE);
    [-2.3, 2.3].forEach(x => {
      p('round', x, 0, -2, 1.6, 4.6, 1.6, C.stone);
      p('cone', x, 4.6, -2, 1.9, 1.1, 1.9, C.roof);
    });
    p('round', 0, 3.5, -2, 3.2, .75, 1.1, C.stoneDark);
    p('box', 0, 1.15, -2, 3, 1.5, .25, C.woodDark);
    p('box', 0, .02, -.2, 2.6, .06, 5.5, '#7cc4d0');
    [[-1.05, 3.4, C.navy], [1.05, 3.4, C.red]].forEach(([dx, dz, c]) =>
      p('torus', dx + 3.9, .1, dz - .5, 3.8, 3.8, 3.8, c, { rx: Math.PI / 2 }));
    junior.labelH = 7.2;
  }
  // 中級島：碼頭標出 1 到 8，每個號碼上的木箱數就是該號碼含幾個因數 2（奇數沒有木箱）
  {
    const p = at(middle.x, middle.top, middle.z, FACE);
    const v2 = k => { let c = 0; while (k % 2 === 0) { k /= 2; c++; } return c; };
    p('round', 0, -.02, 2.75, 8.9, .14, 2.6, C.wood);
    for (let k = 1; k <= 8; k++) {
      const h = v2(k);
      for (let y = 0; y < h; y++) p('round', -3.85 + (k - 1) * 1.1, .12 + y * .92, 2.2, .86, .86, .86, y === h - 1 ? C.gold : C.wood);
    }
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 116;
    const g = cv.getContext('2d');
    g.fillStyle = '#fffcf3'; g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = '#1a1a2e'; g.font = '700 84px ui-monospace, Menlo, Consolas, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let k = 1; k <= 8; k++) g.fillText(String(k), (k - .5) * 128, 60);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(8.8, 1), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    const off = new THREE.Vector3(0, 0, 3.45).applyAxisAngle(new THREE.Vector3(0, 1, 0), FACE);
    strip.rotation.order = 'YXZ'; strip.rotation.set(-Math.PI / 2, FACE, 0);
    strip.position.set(middle.x + off.x, middle.top + .135, middle.z + off.z);
    world.add(strip);
    p('round', -2.6, 0, -2.8, 4, 2.4, 3, C.wall);
    p('prism', -2.6, 2.4, -2.8, 4.4, 1.3, 3.4, C.forest);
    p('box', -2.6, .05, -1.25, .9, 1.5, .1, C.woodDark);
    p('cyl', 3, 0, -3, .3, 5, .3, C.woodDark);
    p('box', 1.7, 4.7, -3, 2.9, .2, .2, C.woodDark);
    p('cyl', .6, 2.5, -3, .05, 2.2, .05, C.ink);
    p('round', .6, 1.8, -3, .8, .8, .8, C.gold);
    middle.labelH = 6.8;
  }
  // 高級島：觀測站與懸浮的正十二面體
  const solids = [];
  {
    const p = at(senior.x, senior.top, senior.z, FACE);
    p('cyl', 0, 0, -1.2, 5.2, 2.1, 5.2, C.wall);
    p('dome', 0, 2.1, -1.2, 5, 2.8, 5, C.navy);
    p('box', 0, 3.3, 1, .8, .5, 1.2, C.gold, { rx: -.5 });
    p('round', 0, 0, 1.4, .9, 1.5, .1, C.woodDark);
    const solidMat = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
    [[new THREE.TetrahedronGeometry(.8), C.red, -3.8, 3.4], [new THREE.BoxGeometry(1.05, 1.05, 1.05), C.gold, -1.9, 4.5], [new THREE.OctahedronGeometry(.8), C.forest, .2, 4.8], [new THREE.IcosahedronGeometry(.8), C.navy, 2.2, 4.3]].forEach(([geo, c, lx, lz]) => {
      p('cyl', lx, 0, lz, .9, .5, .9, C.stone);
      const m = new THREE.Mesh(geo, solidMat(c)), w = new THREE.Vector3(lx, 0, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), FACE);
      m.position.set(senior.x + w.x, senior.top + 1.4, senior.z + w.z); m.castShadow = true; world.add(m); solids.push(m);
    });
    const big = new THREE.Mesh(new THREE.DodecahedronGeometry(1.25), solidMat(C.gold)), w = new THREE.Vector3(0, 0, -1.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), FACE);
    big.position.set(senior.x + w.x, senior.top + 6.3, senior.z + w.z); big.castShadow = true; world.add(big); solids.push(big);
    anims.push((t, dt) => solids.forEach((m, i) => { m.rotation.y += dt * (.35 + i * .04); m.rotation.x += dt * .2; if (i === 4) m.position.y = senior.top + 6.3 + Math.sin(t) * .15; }));
    senior.labelH = 8.6;
  }
  // 資源港：碼頭、書庫、諮詢小屋與船
  {
    const p = at(harbor.x, harbor.top, harbor.z, FACE);
    cottage(p, -3.3, -2.8, C.navy, 1.7);
    p('round', 1, 0, -3, 3.6, 2, 2.4, C.wall);
    p('prism', 1, 2, -3, 4, 1, 2.8, C.roof);
    [C.red, C.navy, C.gold, C.forest, C.white].forEach((c, i) => p('round', 4.1, .02 + i * .28, -1.2, 1.5 - i * .08, .25, 1.1, c));
    // 碼頭從岸邊伸入海面
    const dock = at(harbor.x, 0, harbor.z, FACE - .9);
    dock('round', 0, .72, 8.7, 2.2, .16, 6.4, C.wood);
    [[-.95, 6.3], [.95, 6.3], [-.95, 8.7], [.95, 8.7], [-.95, 11.1], [.95, 11.1]].forEach(([x, z]) => dock('cyl', x, -.2, z, .24, 1.05, .24, C.woodDark));
    // 碼頭尾端的釣魚竿與釣線
    dock('box', .32, 1.5, 11.25, .04, .04, 1.7, C.woodDark, { rx: -.5 });
    dock('cyl', .32, -.2, 11.99, .02, 2.1, .02, C.ink);
    harbor.labelH = 5.5;
  }
  // 植被：避開地標與橋頭
  const LAND = {
    plan: [[-3, -2.4, 2.6], [2.6, 1.8, 3.8], [-1.6, 2.2, 2]], junior: [[0, -2, 4.4], [0, 1.4, 2.4], [3.9, 2.9, 2.9], [-3, 2.2, 2]], middle: [[0, 2.75, 5.6], [-2.6, -2.8, 3.2], [2, -3, 2.2]],
    senior: [[0, -1.2, 3.8], [-1, 4.3, 3.8], [1.8, 4.2, 2.2]], harbor: [[-3.3, -2.8, 2.8], [1, -3, 2.8], [4.1, -1.2, 1.5], [5, 5, 3], [1, 1, 2.2]],
  };
  Object.values(isles).forEach((I, n) => {
    const p = at(I.x, I.top, I.z, FACE), c = Math.cos(FACE), s = Math.sin(FACE);
    for (let k = 0, tries = 0; k < 15 && tries < 130; tries++) {
      const a = rnd() * Math.PI * 2, r = (.22 + rnd() * .68) * I.radius, x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (LAND[I.key].some(([lx, lz, lr]) => Math.hypot(x - lx, z - lz) < lr)) continue;
      const wx = I.x + x * c + z * s, wz = I.z - x * s + z * c, wa = Math.atan2(wz - I.z, wx - I.x);
      if (!I.inside(wx, wz, .85) || I.gaps.some(g => Math.abs(Math.atan2(Math.sin(wa - g), Math.cos(wa - g))) < .32)) continue;
      const kind = k % 3, sz = .9 + rnd() * .6;
      if (kind === 0) pine(p, x, z, sz, n); else if (kind === 1) tree(p, x, z, sz, n + k); else bush(p, x, z, sz, k);
      k++;
    }
  });
  flushParts();

  /* ── 海、船、雲、獼猴 ── */
  // 海面：用世界座標疊幾道正弦波，畫出流動的深淺色帶。不動格點，只有一次繪製
  const seaMat = new THREE.ShaderMaterial({
    uniforms: { t: { value: 0 }, base: { value: new THREE.Color('#93d3e0') }, crest: { value: new THREE.Color('#b6e6ec') }, trough: { value: new THREE.Color('#82c6d7') } },
    vertexShader: `varying vec2 p;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); p = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float t; uniform vec3 base, crest, trough; varying vec2 p;
      void main() {
        vec2 q = vec2(p.x - p.y, p.x + p.y) * .7071;
        float w = sin(q.y * .95 + sin(q.x * .17 + t * .2) * 1.7 + t * .6) + .6 * sin(q.y * 1.75 - q.x * .13 - t * .5) + .4 * sin(q.x * .29 + q.y * .37 + t * .3);
        vec3 col = mix(base, crest, smoothstep(.85, 1.7, w) * .45);
        col = mix(col, trough, (1.0 - smoothstep(-1.7, -.85, w)) * .35);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sea = new THREE.Mesh(new THREE.CircleGeometry(240, 48), seaMat); sea.rotation.x = -Math.PI / 2; sea.position.y = -.25; world.add(sea);
  const waveMat = basic('#e4f6f7', { transparent: true, opacity: .6, depthWrite: false });
  const waves = new THREE.InstancedMesh(new THREE.BoxGeometry(1, .01, .1), waveMat, 70), wo = new THREE.Object3D(), waveSeed = [];
  waves.frustumCulled = false;
  for (let i = 0; i < 400 && waveSeed.length < 70; i++) {
    const x = (rnd() - .5) * 110, z = (rnd() - .5) * 110;
    if (Object.values(isles).some(I => Math.hypot(x - I.x, z - I.z) < I.radius * 1.55)) continue;
    waveSeed.push({ x, z, len: 1 + rnd() * 2.2, ph: rnd() * Math.PI * 2 });
  }
  waves.count = waveSeed.length;
  world.add(waves);
  anims.push(t => {
    seaMat.uniforms.t.value = t;
    waveSeed.forEach((w, i) => {
      const k = Math.sin(t * .8 + w.ph), drift = Math.sin(t * .35 + w.ph) * .7;
      wo.position.set(w.x + drift * SQ, -.2, w.z - drift * SQ); wo.rotation.y = FACE; wo.scale.set(w.len * (.75 + .25 * k), 1, 1 + .4 * k); wo.updateMatrix(); waves.setMatrixAt(i, wo.matrix);
    });
    waves.instanceMatrix.needsUpdate = true;
    // 潮汐：岸邊的泡沫環輕輕進退
    foamRings.forEach((m, i) => { const k = 1 + Math.sin(t * .7 + i * 1.3) * .012; m.scale.set(k, 1, k); });
    M.foam.opacity = .6 + Math.sin(t * .7) * .18; M.shallow.opacity = .5 + Math.sin(t * .5 + 1) * .1;
  });

  /* 船：航線都在島與碼頭之外。一艘在中央水域，一艘在資源港與高級島外海；船頭跟著航向 */
  function makeBoat(c) {
    const b = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.4, .5, .9), std(C.white)); hull.position.y = .15; b.add(hull);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, 2.1, 6), std(C.woodDark)); mast.position.y = 1.2; b.add(mast);
    const sail = new THREE.Mesh(new THREE.ConeGeometry(.8, 1.7, 3), std(c)); sail.scale.z = .08; sail.position.set(.25, 1.35, 0); b.add(sail);
    world.add(b); return b;
  }
  const BOAT_PATHS = [{ u: .5, v: 2, ru: 5, rv: 4, speed: .09, ph: 0 }, { u: 22, v: 26, ru: 6, rv: 4, speed: .07, ph: 2 }];
  const boatPoint = (P, a) => {
    const u = P.u + Math.cos(a) * P.ru, v = P.v + Math.sin(a) * P.rv, du = -Math.sin(a) * P.ru, dv = Math.cos(a) * P.rv;
    return { ...toWorld(u, v), heading: Math.atan2(-(dv - du), du + dv) };
  };
  const boats = [makeBoat(C.red), makeBoat(C.gold)];
  anims.push(t => boats.forEach((b, i) => {
    const P = BOAT_PATHS[i], q = boatPoint(P, t * P.speed + P.ph);
    b.position.set(q.x, -.15 + Math.sin(t * (1.1 - i * .1)) * .05, q.z); b.rotation.y = q.heading; b.rotation.z = Math.sin(t * .9 + i) * .03;
  }));

  // 小獼猴：跳到正在看的島。站在面向鏡頭的島緣
  const monkey = new THREE.Group();
  {
    const add = (geo, c, x, y, z, sx, sy = sx, sz = sx) => { const m = new THREE.Mesh(geo, std(c)); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; monkey.add(m); };
    const s = GEO.sphere;
    add(s, C.fur, 0, .62, 0, 1, 1.05, .85); add(s, C.skin, 0, .6, .22, .6, .72, .5);
    add(s, C.fur, 0, 1.38, 0, 1, .95, .95); add(s, C.skin, 0, 1.3, .24, .66, .55, .55);
    [-1, 1].forEach(d => { add(s, C.skin, d * .5, 1.45, 0, .34); add(s, '#2b2420', d * .17, 1.48, .46, .11); add(s, C.fur, d * .46, .62, .05, .28, .72, .28); add(s, C.fur, d * .22, .12, .1, .32, .28, .42); });
    monkey.scale.setScalar(.92); world.add(monkey);
  }
  const monkeySpot = (I, out) => { const d = toWorld(0, .72 * I.radius); return out.set(I.x + d.x, I.top - .02, I.z + d.z); };
  let hop = null; monkeySpot(plan, monkey.position);
  function monkeyTo(I) {
    const to = monkeySpot(I, new THREE.Vector3());
    if (!motion()) { monkey.position.copy(to); return; }
    hop = { from: monkey.position.clone(), to, t0: performance.now(), dur: 1000 };
  }
  anims.push(t => { if (!hop) monkey.rotation.z = Math.sin(t * 2.2) * .05; });

  // 島上的人：在地標旁來回走，或走在課程路線的橋上；另有一人在碼頭尾端釣魚
  const walkOn = (I, x0, z0, x1, z1, speed, ph, y = I.top - .02, face = FACE) => ({ I, x0, z0, x1, z1, speed, ph, y, face });
  const WALKERS = [
    walkOn(plan, -1.6, 1, -1.6, 3.4, .28, 0), walkOn(junior, -3, 1, -3, 3.4, .24, 2), walkOn(middle, -2.4, 5.1, 2.4, 5.1, .22, 1), walkOn(senior, -1.2, 2.5, 1.2, 2.6, .26, 3),
    walkOn(harbor, .1, .4, 2.2, 1.5, .25, 4), walkOn(harbor, 0, 10.7, 0, 10.7, 0, 0, .86, FACE - .9),
    { curve: bridges[1], speed: .12, ph: 0 }, { curve: bridges[2], speed: .1, ph: 2 },
  ];
  const SHIRTS = [C.red, C.navy, C.gold, C.forest, '#d9825b', C.navy, '#5b8fb0', C.red];
  const walkerPoint = (W, t, out) => {
    const k = .5 - .5 * Math.cos(t * W.speed * 2 + W.ph);
    if (W.curve) return W.curve.getPoint(.06 + k * .88, out);
    const x = W.x0 + (W.x1 - W.x0) * k, z = W.z0 + (W.z1 - W.z0) * k, c = Math.cos(W.face), sn = Math.sin(W.face);
    return out.set(W.I.x + x * c + z * sn, W.y, W.I.z - x * sn + z * c);
  };
  const bodyGeo = new THREE.CylinderGeometry(.15, .22, .72, 8); bodyGeo.translate(0, .36, 0);
  const blobGeo = new THREE.CircleGeometry(.3, 12); blobGeo.rotateX(-Math.PI / 2);
  const bodies = new THREE.InstancedMesh(bodyGeo, std('#ffffff'), WALKERS.length), heads = new THREE.InstancedMesh(GEO.sphere, std(C.skin), WALKERS.length);
  const blobs = new THREE.InstancedMesh(blobGeo, basic('#2b3a36', { transparent: true, opacity: .22, depthWrite: false }), WALKERS.length);
  const shirt = new THREE.Color();
  WALKERS.forEach((_, i) => bodies.setColorAt(i, shirt.set(SHIRTS[i])));
  [bodies, heads, blobs].forEach(m => { m.frustumCulled = false; world.add(m); });
  const po = new THREE.Object3D(), pv = new THREE.Vector3();
  anims.push(t => {
    WALKERS.forEach((W, i) => {
      walkerPoint(W, t, pv);
      const step = W.speed ? Math.abs(Math.sin(t * 4 + i)) * .05 : 0;
      po.position.set(pv.x, pv.y + .03, pv.z); po.scale.setScalar(1); po.updateMatrix(); blobs.setMatrixAt(i, po.matrix);
      po.position.y = pv.y + step; po.updateMatrix(); bodies.setMatrixAt(i, po.matrix);
      po.position.y = pv.y + step + .87; po.scale.setScalar(.36); po.updateMatrix(); heads.setMatrixAt(i, po.matrix);
    });
    [bodies, heads, blobs].forEach(m => { m.instanceMatrix.needsUpdate = true; });
  });

  // 海鷗：飛得比燈塔和觀測站高，翅膀交替拍動與滑翔
  const GULLS = [
    { u: -19, v: 13, r: 7, y: 13, speed: .22, ph: 0 }, { u: 2, v: 2, r: 9, y: 14, speed: -.16, ph: 1 }, { u: 9, v: 15, r: 11, y: 12.5, speed: .13, ph: 3 },
    { u: 18, v: -5, r: 8, y: 14.5, speed: -.2, ph: 4 }, { u: -6, v: -8, r: 10, y: 13.5, speed: .15, ph: 5 },
  ];
  // 翅膀是後掠的三角形：翼根寬、翼尖窄且向後
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([.3, 0, 0, -.2, 0, 0, -.32, 0, 1], 3));
  wingGeo.computeVertexNormals();
  const gullBodies = new THREE.InstancedMesh(GEO.sphere, std(C.white), GULLS.length), gullWings = new THREE.InstancedMesh(wingGeo, std('#f4f6f5', { side: THREE.DoubleSide }), GULLS.length * 2);
  [gullBodies, gullWings].forEach(m => { m.frustumCulled = false; world.add(m); });
  const go = new THREE.Object3D(); go.rotation.order = 'YXZ';
  anims.push(t => {
    GULLS.forEach((G, i) => {
      const a = t * G.speed + G.ph, sign = Math.sign(G.speed), q = toWorld(G.u + Math.cos(a) * G.r, G.v + Math.sin(a) * G.r);
      const du = -Math.sin(a) * sign, dv = Math.cos(a) * sign, heading = Math.atan2(-(dv - du), du + dv);
      const glide = Math.sin(t * .6 + i * 2) > .2, flap = glide ? .12 : .16 + Math.sin(t * 7 + i) * .42;
      const y = G.y + Math.sin(t * .8 + i) * .3;
      go.position.set(q.x, y, q.z); go.rotation.set(0, heading, 0); go.scale.set(1, .3, .32); go.updateMatrix(); gullBodies.setMatrixAt(i, go.matrix);
      go.scale.set(1, 1, 1);
      go.rotation.set(-flap, heading, 0); go.updateMatrix(); gullWings.setMatrixAt(i * 2, go.matrix);
      go.rotation.set(-flap, heading + Math.PI, 0); go.updateMatrix(); gullWings.setMatrixAt(i * 2 + 1, go.matrix);
    });
    gullBodies.instanceMatrix.needsUpdate = true; gullWings.instanceMatrix.needsUpdate = true;
  });

  // 選取標記
  const marker = new THREE.Mesh(GEO.cone, basic(C.red)); marker.scale.set(1.1, 1.3, 1.1); marker.rotation.x = Math.PI; marker.visible = false; world.add(marker);
  let selected = null;
  anims.push(t => { if (selected) marker.position.y = isles[selected].top + isles[selected].labelH + .3 + Math.sin(t * 3) * .15; });

  /* ── 相機 ── */
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 500);
  const POLAR = 52 * Math.PI / 180, DIST = 110;
  const HOME = Object.values(isles).reduce((s, I) => s.add(new THREE.Vector3(I.x, 0, I.z)), new THREE.Vector3()).multiplyScalar(.2);
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.minPolarAngle = 40 * Math.PI / 180; controls.maxPolarAngle = 64 * Math.PI / 180;
  controls.minZoom = .8; controls.maxZoom = 5;
  controls.enableDamping = motion(); controls.dampingFactor = .08;
  controls.rotateSpeed = .6; controls.zoomSpeed = 1.1;
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };
  // 會場投影版沒有人操作，讓群島慢慢轉；不動畫偏好優先
  controls.autoRotate = SHOW && motion();
  controls.autoRotateSpeed = .35;
  camera.position.set(HOME.x + Math.sin(POLAR) * Math.sin(FACE) * DIST, Math.cos(POLAR) * DIST, HOME.z + Math.sin(POLAR) * Math.cos(FACE) * DIST);
  camera.lookAt(HOME); camera.updateMatrixWorld();
  const RV = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), UV = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1), FV = camera.getWorldDirection(new THREE.Vector3());
  const FIT = { r: 30, u: 18 };
  {
    let r0 = 1e9, r1 = -1e9, u0 = 1e9, u1 = -1e9; const q = new THREE.Vector3();
    Object.values(isles).forEach(I => {
      for (let k = 0; k < 16; k++) {
        const a = k / 16 * Math.PI * 2;
        [0, I.top + I.labelH].forEach(h => {
          q.set(I.x + Math.cos(a) * I.radius * 1.2 - HOME.x, h, I.z + Math.sin(a) * I.radius * 1.2 - HOME.z);
          const r = q.dot(RV), u = q.dot(UV); r0 = Math.min(r0, r); r1 = Math.max(r1, r); u0 = Math.min(u0, u); u1 = Math.max(u1, u);
        });
      }
    });
    FIT.r = (r1 - r0) / 2; FIT.u = (u1 - u0) / 2;
    HOME.addScaledVector(RV, (r0 + r1) / 2).addScaledVector(UV, (u0 + u1) / 2);
    HOME.addScaledVector(FV, -HOME.y / FV.y);
  }
  controls.target.copy(HOME);
  camera.position.copy(HOME).addScaledVector(FV, -DIST); camera.lookAt(HOME);
  const DPRS = narrow() ? [1.25, 1] : [1.5, 1.25, 1];
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    const aspect = w / h;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPRS[dprLevel]));
    renderer.setSize(w, h, false);
    const half = Math.max(FIT.u * 1.1 + 2.4, FIT.r * 1.04 / aspect);
    Object.assign(camera, { left: -half * aspect, right: half * aspect, top: half, bottom: -half });
    camera.updateProjectionMatrix(); tagsDirty = true; requestRender();
  }
  let fly = null;
  function flyTo(target, zoom) {
    if (!motion()) {
      const off = camera.position.clone().sub(controls.target);
      controls.target.copy(target); camera.position.copy(target).add(off);
      camera.zoom = zoom; camera.updateProjectionMatrix(); controls.update(); requestRender(); return;
    }
    fly = { from: controls.target.clone(), to: target.clone(), z0: camera.zoom, z1: zoom, t0: performance.now(), dur: 800 };
    requestRender();
  }
  function stepFly(now) {
    if (!fly) return false;
    const k = Math.min(1, (now - fly.t0) / fly.dur), e = 1 - Math.pow(1 - k, 3), off = camera.position.clone().sub(controls.target);
    controls.target.lerpVectors(fly.from, fly.to, e); camera.position.copy(controls.target).add(off);
    camera.zoom = fly.z0 + (fly.z1 - fly.z0) * e; camera.updateProjectionMatrix();
    if (k >= 1) fly = null;
    return true;
  }

  /* ── 拾取 ── */
  const picks = Object.values(isles).map(I => {
    const h = I.top + I.labelH;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(I.radius * .95, I.radius * .95, h, 18), new THREE.MeshBasicMaterial());
    m.position.set(I.x, h / 2, I.z); m.userData.key = I.key; m.visible = false; m.updateMatrixWorld(); world.add(m); return m;
  });
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), v3 = new THREE.Vector3();
  function pickAt(cx, cy) {
    const r = canvas.getBoundingClientRect();
    ndc.set((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(picks, false)[0];
    return hit ? hit.object.userData.key : null;
  }
  let hover = null, down = null;
  function setHover(key) {
    if (key === hover) return;
    hover = key; canvas.classList.toggle('is-hover', !!key);
    tags.forEach(T => T.el.classList.toggle('is-hover', !!key && T.key === key));
  }
  canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' && !e.buttons) setHover(pickAt(e.clientX, e.clientY)); });
  canvas.addEventListener('pointerleave', () => setHover(null));
  canvas.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) { down = null; return; }
    down = null;
    const key = pickAt(e.clientX, e.clientY);
    if (key) select(key);
  });
  canvas.addEventListener('keydown', e => {
    const step = Math.PI / 12;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const off = camera.position.clone().sub(controls.target);
      off.applyAxisAngle(new THREE.Vector3(0, 1, 0), e.key === 'ArrowLeft' ? -step : step);
      camera.position.copy(controls.target).add(off); controls.update(); requestRender(); e.preventDefault();
    } else if (['+', '=', '-', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      const zin = e.key === '+' || e.key === '=' || e.key === 'ArrowUp';
      camera.zoom = Math.min(controls.maxZoom, Math.max(controls.minZoom, camera.zoom * (zin ? 1.2 : 1 / 1.2)));
      camera.updateProjectionMatrix(); tagsDirty = true; requestRender(); e.preventDefault();
    }
  });
  controls.addEventListener('change', () => { tagsDirty = true; requestRender(); });

  /* ── HTML 標籤 ── */
  const layer = $('islLabels');
  const tags = ISLES.map(i => {
    const I = isles[i.key], btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'isl-tag'; btn.tabIndex = -1; btn.setAttribute('aria-hidden', 'true');
    const n = document.createElement('span'); n.className = 'isl-tag-num'; n.textContent = i.code;
    const t = document.createElement('span'); t.className = 'isl-tag-t'; t.textContent = i.name;
    const s = document.createElement('small'); s.textContent = i.landmark; t.appendChild(s);
    btn.append(n, t);
    if (i.now) { const h = document.createElement('span'); h.className = 'isl-tag-now'; h.textContent = '你在這裡'; btn.append(h); }
    btn.addEventListener('click', () => select(i.key)); layer.appendChild(btn);
    return { el: btn, key: i.key, anchor: new THREE.Vector3(I.x, I.top + I.labelH, I.z) };
  });
  function placeTags() {
    const W = canvas.clientWidth, H = canvas.clientHeight;
    tags.forEach(T => {
      v3.copy(T.anchor).project(camera);
      const x = (v3.x + 1) / 2 * W, y = (1 - v3.y) / 2 * H, w = T.el.offsetWidth, h = T.el.offsetHeight;
      const off = x - w / 2 < 2 || x + w / 2 > W - 2 || y - h - 6 < 0 || y > H;
      T.el.classList.toggle('is-off', off);
      if (!off) T.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, calc(-100% - 6px))`;
    });
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { tagsDirty = true; requestRender(); });

  /* ── 繪製迴圈：環境動畫約 30fps；閒置 45 秒或不在畫面上就停 ── */
  const IDLE_MS = () => window.__islandIdleMs || 45000;
  let last = performance.now(), lastDraw = 0, lastInput = performance.now(), sampleT = 0, sampleN = 0;
  const idle = () => !SHOW && performance.now() - lastInput > IDLE_MS();
  const animating = () => motion() && onScreen && document.visibilityState === 'visible' && !idle();
  function wake() { const was = idle(); lastInput = performance.now(); if (was) requestRender(); }
  ['pointerdown', 'pointermove', 'wheel', 'keydown', 'touchstart'].forEach(ev => window.addEventListener(ev, wake, { passive: true }));
  function requestRender() { need = true; if (!raf && alive) raf = requestAnimationFrame(frame); }
  function stepHop(now) {
    if (!hop) return false;
    const k = Math.min(1, (now - hop.t0) / hop.dur);
    monkey.position.lerpVectors(hop.from, hop.to, k); monkey.position.y += Math.sin(k * Math.PI) * 7;
    if (k >= 1) hop = null;
    return true;
  }
  function frame(now) {
    raf = 0; if (!alive) return;
    const dt = Math.min(.1, (now - last) / 1000); last = now;
    const flying = stepFly(now), hopping = stepHop(now), moved = controls.update(), anim = animating();
    const busy = need || flying || hopping || moved;
    if (!busy && anim && now - lastDraw < 32) { raf = requestAnimationFrame(frame); return; }
    if (anim) { const t = now / 1000; anims.forEach(f => f(t, Math.min(.1, (now - (lastDraw || now)) / 1000))); }
    if (busy || anim) {
      if (lastDraw) {
        const gap = now - lastDraw;
        if (gap < 250) { sampleT += gap; sampleN++; }
        if (sampleT > 2000) {
          if (sampleT / sampleN > (busy ? 35 : 64) && dprLevel < DPRS.length - 1) { dprLevel++; resize(); }
          sampleT = 0; sampleN = 0;
        }
      }
      renderer.render(world, camera); lastDraw = now; draws++;
      if (tagsDirty || flying || moved) { placeTags(); tagsDirty = false; }
      need = false;
    }
    if ((anim || flying || hopping || moved) && !raf) raf = requestAnimationFrame(frame);
  }
  const ro = new ResizeObserver(resize); ro.observe(stage);
  new IntersectionObserver(es => { onScreen = es[0].isIntersecting; requestRender(); }).observe(stage);
  document.addEventListener('visibilitychange', requestRender);
  reduceMotion.addEventListener('change', () => { controls.enableDamping = motion(); requestRender(); });
  anims.forEach(f => f(1.7, 0));
  resize();

  return {
    select(key, doFly) {
      const changed = selected !== key;
      selected = key && isles[key] ? key : null;
      marker.visible = !!selected;
      tags.forEach(T => T.el.classList.toggle('is-current', T.key === selected));
      if (selected) {
        const I = isles[selected];
        marker.position.set(I.x, I.top + I.labelH + .3, I.z);
        if (changed) monkeyTo(I);
        if (doFly) flyTo(new THREE.Vector3(I.x, I.top, I.z), narrow() ? 1.9 : 2.1);
      }
      wake(); tagsDirty = true; requestRender();
    },
    reset() { flyTo(HOME.clone(), 1); wake(); },
    // 以下給 tools/check_browser.js 用
    stats() { return { draws, dprLevel, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }; },
    screenPos(key) {
      const I = isles[key]; if (!I) return null;
      v3.set(I.x, I.top, I.z).project(camera);
      const r = canvas.getBoundingClientRect();
      return { x: r.left + (v3.x + 1) / 2 * r.width, y: r.top + (1 - v3.y) / 2 * r.height };
    },
    pickAt,
    // 船身離沙岸、碼頭、橋面的最小距離；人是否站在島上
    boatClearance() {
      let min = Infinity;
      const dockTip = new THREE.Vector3(), near = (x, z, a, b, c, d) => {
        const dx = c - a, dz = d - b, k = Math.max(0, Math.min(1, ((x - a) * dx + (z - b) * dz) / (dx * dx + dz * dz)));
        return Math.hypot(x - a - k * dx, z - b - k * dz);
      };
      const rot = FACE - .9, tipX = harbor.x + 11.9 * Math.sin(rot), tipZ = harbor.z + 11.9 * Math.cos(rot);
      dockTip.set(tipX, 0, tipZ);
      BOAT_PATHS.forEach(P => {
        for (let i = 0; i < 720; i++) {
          const q = boatPoint(P, i / 720 * Math.PI * 2);
          Object.values(isles).forEach(I => { min = Math.min(min, Math.hypot(q.x - I.x, q.z - I.z) - I.angR(Math.atan2(q.z - I.z, q.x - I.x)) * 1.12); });
          min = Math.min(min, near(q.x, q.z, harbor.x, harbor.z, dockTip.x, dockTip.z) - 1.1);
          bridges.forEach(c => { for (let k = 0; k <= 20; k++) { const b = c.getPoint(k / 20); min = Math.min(min, Math.hypot(q.x - b.x, q.z - b.z) - .6); } });
        }
      });
      return min;
    },
    walkers() {
      const out = new THREE.Vector3();
      return WALKERS.map(W => {
        const ends = [0, Math.PI / (W.speed * 2 || 1)].map(t => walkerPoint(W, (t - W.ph / ((W.speed * 2) || 1)), out).clone());
        return { bridge: !!W.curve, dock: W.y === .86, onLand: W.curve || W.y === .86 ? true : ends.every(e => W.I.inside(e.x, e.z, .86)), moves: W.speed > 0 };
      });
    },
    wavesMoving() { return { sea: seaMat.uniforms.t.value, waves: waves.count, gulls: GULLS.length, people: WALKERS.length }; },
    monkey() { return { x: monkey.position.x, z: monkey.position.z, hopping: !!hop }; },
    async warm() {
      try { await renderer.compileAsync(world, camera); } catch (e) { /* 舊版瀏覽器：第一幀時再編譯 */ }
      renderer.shadowMap.needsUpdate = true; renderer.render(world, camera); placeTags(); tagsDirty = false; lastDraw = performance.now();
      requestRender();
    },
    dispose() { alive = false; ro.disconnect(); controls.dispose(); renderer.dispose(); layer.replaceChildren(); },
  };
}

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
