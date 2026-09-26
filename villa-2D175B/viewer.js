// 3D tour viewer. Bundled into tour_bundle.js with: npm install && npm run bundle
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const D = window.DESIGN;
const MM = 0.001;
const DOOR_H = 2.4, OPEN_H = 2.4, WIN_SILL = 900, WIN_TOP = 2400, EYE = 1.6, RADIUS = 0.22, LEVEL = 3.3;
const W = D.wall;
// the whole model can be mirrored east-west (x -> MA - x) to match the built unit
const MA = D.mirrorA ?? null;
const mx = x => MA === null ? x : MA - x;
const mxs = (a, b) => MA === null ? [a, b] : [MA - b, MA - a];
const touch = matchMedia('(pointer: coarse)').matches;
let H = 3.0; // ceiling height of the floor being built

// ---------- procedural textures ----------
let seed = 20240926;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const rgb = hex => { const n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const css = ([r, g, b], k = 1) => `rgb(${Math.min(255, r * k) | 0},${Math.min(255, g * k) | 0},${Math.min(255, b * k) | 0})`;

function makeTex(size, draw, span, srgb = true) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'); draw(x, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.repeat.set(1 / span, 1 / span);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function noise(x, S, amt) {
  const img = x.getImageData(0, 0, S, S), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  x.putImageData(img, 0, 0);
}
// a square of cols x rows tiles covering `span` metres
function tileTex({ span, cols, rows, base, pattern, vary = 0.04, grout = '#d8d2c6', gw = 3, veins = 0, grain = 6, stagger = false, size = 1024 }) {
  return makeTex(size, (x, S) => {
    x.fillStyle = grout; x.fillRect(0, 0, S, S);
    const tw = S / cols, th = S / rows;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      x.fillStyle = css(rgb(pattern ? pattern(i, j) : base), 1 + (rnd() - 0.5) * vary);
      const off = stagger && j % 2 ? tw / 2 : 0;
      for (const dx of [0, -S]) x.fillRect(i * tw + off + dx + gw / 2, j * th + gw / 2, tw - gw, th - gw);
    }
    x.lineCap = 'round';
    for (let v = 0; v < veins; v++) {
      x.strokeStyle = `rgba(128,112,92,${0.08 + rnd() * 0.14})`; x.lineWidth = 0.8 + rnd() * 3;
      let px = rnd() * S, py = rnd() * S;
      x.beginPath(); x.moveTo(px, py);
      for (let k = 0; k < 7; k++) {
        const nx = px + (rnd() - 0.3) * S * 0.22, ny = py + (rnd() - 0.5) * S * 0.18;
        x.quadraticCurveTo(px + (rnd() - 0.5) * 90, py + (rnd() - 0.5) * 90, nx, ny); px = nx; py = ny;
      }
      x.stroke();
    }
    noise(x, S, grain);
  }, span);
}
const TEX = {
  wood: makeTex(512, (x, S) => {
    x.fillStyle = '#f4f4f4'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 160; i++) {
      const y = rnd() * S;
      x.strokeStyle = `rgba(95,62,30,${0.03 + rnd() * 0.09})`; x.lineWidth = 0.5 + rnd() * 2.5;
      x.beginPath(); x.moveTo(0, y);
      for (let k = 1; k <= 8; k++) x.lineTo(k * S / 8, y + Math.sin(k * 0.9 + i) * 3 + (rnd() - 0.5) * 2);
      x.stroke();
    }
    noise(x, S, 10);
  }, 0.9),
  fabric: makeTex(256, (x, S) => {
    x.fillStyle = '#efefef'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < S; i += 2) {
      x.fillStyle = `rgba(0,0,0,${0.025 + rnd() * 0.04})`; x.fillRect(i, 0, 1, S);
      x.fillStyle = `rgba(0,0,0,${0.025 + rnd() * 0.04})`; x.fillRect(0, i, S, 1);
    }
    noise(x, S, 16);
  }, 0.14),
  carpet: makeTex(256, (x, S) => { x.fillStyle = '#e9e9e9'; x.fillRect(0, 0, S, S); noise(x, S, 40); }, 0.3),
  plaster: makeTex(256, (x, S) => { x.fillStyle = '#f7f7f7'; x.fillRect(0, 0, S, S); noise(x, S, 5); }, 1.5),
  turf: makeTex(512, (x, S) => {
    x.fillStyle = '#4f8a2f'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 9000; i++) {
      const px = rnd() * S, py = rnd() * S;
      x.strokeStyle = rnd() < 0.5 ? 'rgba(120,175,70,0.55)' : 'rgba(40,85,25,0.5)';
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + (rnd() - 0.5) * 4, py - 3 - rnd() * 6); x.stroke();
    }
  }, 0.6),
};
TEX.marble = tileTex({ span: 1.6, cols: 2, rows: 2, base: '#e8dfcf', vary: 0.05, grout: '#cbbfab', veins: 34, grain: 6 });
const FLOORS = {
  marble: { map: TEX.marble, roughness: 0.1 },
  charcoal_tile: { map: tileTex({ span: 1.2, cols: 2, rows: 2, base: '#46484b', vary: 0.07, grout: '#2f3032', grain: 8 }), roughness: 0.22 },
  grey_tile: { map: tileTex({ span: 1.2, cols: 2, rows: 2, base: '#d0cdc7', grout: '#b9b5ad' }), roughness: 0.3 },
  beige_tile: { map: tileTex({ span: 1.2, cols: 2, rows: 2, base: '#e3dccf', grout: '#cdc5b6' }), roughness: 0.28 },
  stripe_tile: { map: tileTex({ span: 1.2, cols: 2, rows: 4, pattern: (i, j) => (j % 4 < 2 ? '#e9e7e2' : '#5a5c60'), grout: '#9a9894' }), roughness: 0.28 },
  outdoor_tile: { map: tileTex({ span: 1.2, cols: 2, rows: 2, base: '#bdb6aa', vary: 0.06, grout: '#9d978c', gw: 4, grain: 10 }), roughness: 0.75 },
  pavers: { map: tileTex({ span: 1.2, cols: 4, rows: 6, base: '#cbc3b4', vary: 0.1, grout: '#a9a193', gw: 4, grain: 12, stagger: true }), roughness: 0.85 },
  carpet_blue: { color: '#5d6b74', map: TEX.carpet, roughness: 1 },
  carpet_greige: { color: '#bcb4a7', map: TEX.carpet, roughness: 1 },
  carpet_grey: { color: '#aba9a4', map: TEX.carpet, roughness: 1 },
};

// ---------- materials ----------
const mats = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...opts }));
  return mats.get(key);
}
const cache = new Map();
const once = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };
const floorMat = name => once('floor:' + name, () => new THREE.MeshStandardMaterial({ color: '#ffffff', ...(FLOORS[name] || FLOORS.marble) }));
const isCarpet = name => (name || '').startsWith('carpet');
const wood = c => once('wood:' + c, () => new THREE.MeshStandardMaterial({ color: c, map: TEX.wood, roughness: 0.5 }));
const fabric = c => once('fab:' + c, () => new THREE.MeshStandardMaterial({ color: c, map: TEX.fabric, roughness: 0.95 }));
const M = {
  wall: new THREE.MeshStandardMaterial({ color: '#e2dbcf', map: TEX.plaster, roughness: 0.92, envMapIntensity: 0.6 }),
  ceiling: new THREE.MeshStandardMaterial({ color: '#f4f2ed', roughness: 0.95, envMapIntensity: 0.7 }),
  paint: new THREE.MeshStandardMaterial({ color: '#f3f1ec', roughness: 0.4 }),
  frame: new THREE.MeshStandardMaterial({ color: '#262728', roughness: 0.4, metalness: 0.45 }),
  glass: new THREE.MeshPhysicalMaterial({ color: '#e4eef2', roughness: 0.03, metalness: 0, transparent: true, opacity: 0.14, depthWrite: false, envMapIntensity: 1.3 }),
  frosted: new THREE.MeshStandardMaterial({ color: '#eef3f3', roughness: 0.45, transparent: true, opacity: 0.6, depthWrite: false }),
  door: new THREE.MeshStandardMaterial({ color: '#eeebe4', roughness: 0.5 }),
  frontDoor: new THREE.MeshStandardMaterial({ color: '#2b3038', roughness: 0.45 }),
  handle: new THREE.MeshStandardMaterial({ color: '#1d1d1d', roughness: 0.35, metalness: 0.6 }),
  granite: new THREE.MeshStandardMaterial({ color: '#1b1b1c', roughness: 0.16, metalness: 0.1 }),
  cabinet: new THREE.MeshStandardMaterial({ color: '#ebe5d8', roughness: 0.42 }),
  steel: new THREE.MeshStandardMaterial({ color: '#c9cdd1', roughness: 0.28, metalness: 0.85 }),
  ceramic: new THREE.MeshStandardMaterial({ color: '#f7f7f5', roughness: 0.12 }),
  mirror: new THREE.MeshStandardMaterial({ color: '#dfe6e9', roughness: 0.08, metalness: 0.55, envMapIntensity: 1.6 }),
  black: new THREE.MeshStandardMaterial({ color: '#1f1f20', roughness: 0.5, metalness: 0.3 }),
  screen: new THREE.MeshStandardMaterial({ color: '#0d0e10', roughness: 0.15, metalness: 0.2 }),
  runner: new THREE.MeshStandardMaterial({ color: '#2d3035', map: TEX.carpet, roughness: 1 }),
  light: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff4e2', emissiveIntensity: 2.2 }),
  render: new THREE.MeshStandardMaterial({ color: '#e7dfd1', map: TEX.plaster, roughness: 0.95 }),
  turf: new THREE.MeshStandardMaterial({ color: '#ffffff', map: TEX.turf, roughness: 1 }),
  mosaic: new THREE.MeshStandardMaterial({ map: tileTex({ span: 0.24, cols: 8, rows: 8, size: 256, gw: 2, grout: '#8d8d8a', pattern: (i, j) => ['#6b6f73', '#a3a6a8', '#3f4245', '#c9c6bf'][(i * 7 + j * 3) % 4] }), roughness: 0.2 }),
  tileWall: new THREE.MeshStandardMaterial({ map: tileTex({ span: 1.2, cols: 2, rows: 1, base: '#6d6e70', vary: 0.05, grout: '#58595a' }), roughness: 0.3 }),
};
const KEYWORDS = [['grey', '#c8c5bf'], ['beige', '#d8cab2'], ['olive', '#6f7447'], ['sand', '#cdbc9f'], ['greige', '#b8ad9e'], ['cream', '#ece3d0'],
  ['oatmeal', '#ddd2bd'], ['off-white', '#eeeae3'], ['oak', '#c29a6b'], ['travertine', '#d8ccb4'],
  ['aluminium', '#9da3a6'], ['black', '#2a2a2a']];
const CAT_DEFAULT = { seating: '#b9ab96', table: '#b08a5e', storage: '#c9a77c', bed: '#b8ad9e', soft: '#e6dccb', decor: '#6f8a55', appliance: '#c9cdd0' };
function colorFor(it) {
  const s = ((it.spec || '') + ' ' + it.name).toLowerCase();
  for (const [k, c] of KEYWORDS) if (s.includes(k)) return c;
  return CAT_DEFAULT[it.cat] || '#bbb';
}

// ---------- renderer, sky and light ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, touch ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.82;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const sky = makeTex(512, (x, S) => {
  const gr = x.createLinearGradient(0, 0, 0, S);
  gr.addColorStop(0, '#6d9bcb'); gr.addColorStop(0.46, '#cfe1ec'); gr.addColorStop(0.5, '#e8ebe6'); gr.addColorStop(1, '#cfc9bd');
  x.fillStyle = gr; x.fillRect(0, 0, S, S);
}, 1);
sky.mapping = THREE.EquirectangularReflectionMapping;
scene.background = sky;
scene.fog = new THREE.Fog('#dfe7ea', 35, 110);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 300);
camera.rotation.order = 'YXZ';
scene.add(new THREE.HemisphereLight('#ffffff', '#cfc4b2', 0.3));
const sun = new THREE.DirectionalLight('#fff0da', 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(touch ? 2048 : 4096, touch ? 2048 : 4096);
Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 1, far: 70 });
sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);

// ---------- geometry helpers (plan mm -> world m; plan y -> world z) ----------
function worldUV(geo, w, h, d, ox, oz, oy) {
  const uv = geo.attributes.uv;
  const dims = [[d, h, oz, oy], [d, h, oz, oy], [w, d, ox, oz], [w, d, ox, oz], [w, h, ox, oy], [w, h, ox, oy]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k, [a, b, oa, ob] = dims[f];
    uv.setXY(i, oa + uv.getX(i) * a, ob + uv.getY(i) * b);
  }
}
function place(g, geo, material, x0, x1, y0, y1, z0, z1, shadow, collide) {
  const m = new THREE.Mesh(geo, typeof material === 'string' ? mat(material) : material);
  m.position.set((x0 + x1) / 2 * MM, (z0 + z1) / 2, (y0 + y1) / 2 * MM);
  m.castShadow = shadow; m.receiveShadow = true;
  g.add(m);
  if (collide) collide.push([x0 * MM, y0 * MM, x1 * MM, y1 * MM]);
  return m;
}
function box(g, xa, xb, ya, yb, z0, z1, material, { shadow = true, collide = null } = {}) {
  const x0 = Math.min(xa, xb), x1 = Math.max(xa, xb), y0 = Math.min(ya, yb), y1 = Math.max(ya, yb);
  const w = (x1 - x0) * MM, d = (y1 - y0) * MM, h = z1 - z0;
  if (w <= 0.0005 || d <= 0.0005 || h <= 0.0005) return null;
  const geo = new THREE.BoxGeometry(w, h, d);
  const m = typeof material === 'string' ? mat(material) : material;
  if (m.map) worldUV(geo, w, h, d, x0 * MM, y0 * MM, z0);
  return place(g, geo, m, x0, x1, y0, y1, z0, z1, shadow, collide);
}
function rbox(g, xa, xb, ya, yb, z0, z1, material, r = 40, opts = {}) {
  const x0 = Math.min(xa, xb), x1 = Math.max(xa, xb), y0 = Math.min(ya, yb), y1 = Math.max(ya, yb);
  const w = (x1 - x0) * MM, d = (y1 - y0) * MM, h = z1 - z0;
  const rad = Math.min(r * MM, w / 2 - 0.001, d / 2 - 0.001, h / 2 - 0.001);
  if (rad < 0.003) return box(g, x0, x1, y0, y1, z0, z1, material, opts);
  const geo = new RoundedBoxGeometry(w, h, d, 3, rad);
  const s = Math.max(w, d, h), uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * s, uv.getY(i) * s);
  return place(g, geo, material, x0, x1, y0, y1, z0, z1, opts.shadow ?? true, opts.collide);
}
function cyl(g, cx, cy, r, z0, z1, material, top = r, seg = 28) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(top * MM, r * MM, z1 - z0, seg), typeof material === 'string' ? mat(material) : material);
  m.position.set(cx * MM, (z0 + z1) / 2, cy * MM);
  m.castShadow = true; m.receiveShadow = true;
  g.add(m);
  return m;
}
function floorPlane(g, x0, x1, y0, y1, material, z = 0) {
  const geo = new THREE.PlaneGeometry((x1 - x0) * MM, (y1 - y0) * MM);
  geo.rotateX(-Math.PI / 2);
  geo.translate((x0 + x1) / 2 * MM, z, (y0 + y1) / 2 * MM);
  const p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i), -p.getZ(i));
  const m = new THREE.Mesh(geo, material); m.receiveShadow = true; g.add(m);
  return m;
}
function disc(g, x, y, z, r, material) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 24), material);
  m.rotation.x = Math.PI / 2; m.position.set(x * MM, z, y * MM); g.add(m);
  return m;
}
// strip of `depth` mm along one side of rect r
function strip(r, side, depth) {
  const { x, y, w, h } = r;
  if (side === 'top') return [x, x + w, y, y + depth];
  if (side === 'bottom') return [x, x + w, y + h - depth, y + h];
  if (side === 'left') return [x, x + depth, y, y + h];
  return [x + w - depth, x + w, y, y + h];
}
const SIDES_PERP = { top: ['left', 'right'], bottom: ['left', 'right'], left: ['top', 'bottom'], right: ['top', 'bottom'] };
const OPP = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
const along = side => side === 'top' || side === 'bottom';
function inset(r, a) { return { x: r.x + a, y: r.y + a, w: r.w - 2 * a, h: r.h - 2 * a }; }
// split rect r into n pieces along the length that runs parallel to `back`
function split(r, back, n, gap = 0) {
  const out = [];
  for (let i = 0; i < n; i++) {
    if (along(back)) { const w = (r.w - gap * (n - 1)) / n; out.push({ x: r.x + i * (w + gap), y: r.y, w, h: r.h }); }
    else { const h = (r.h - gap * (n - 1)) / n; out.push({ x: r.x, y: r.y + i * (h + gap), w: r.w, h }); }
  }
  return out;
}
function legs(g, r, z1, size, material) {
  for (const [lx, ly] of [[r.x, r.y], [r.x + r.w - size, r.y], [r.x, r.y + r.h - size], [r.x + r.w - size, r.y + r.h - size]])
    box(g, lx, lx + size, ly, ly + size, 0, z1, material);
}
function roomAt(fl, px, py) {
  return fl.rooms.find(r => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h);
}
function nearestSide(fl, it) {
  const r = roomAt(fl, it.x + it.w / 2, it.y + it.h / 2);
  if (!r) return 'top';
  const d = { left: it.x - r.x, right: r.x + r.w - it.x - it.w, top: it.y - r.y, bottom: r.y + r.h - it.y - it.h };
  return Object.entries(d).sort((a, b) => a[1] - b[1])[0][0];
}

// ---------- furniture ----------
function buildItem(g, fl, it, col) {
  const n = it.name.toLowerCase();
  const color = colorFor(it);
  const back = it.back || nearestSide(fl, it);
  const R = { x: it.x, y: it.y, w: it.w, h: it.h };
  const cx = it.x + it.w / 2, cy = it.y + it.h / 2, rad = Math.min(it.w, it.h) / 2;
  const hit = () => col.push([it.x * MM, it.y * MM, (it.x + it.w) * MM, (it.y + it.h) * MM]);

  if (n.includes('rug')) { rbox(g, R.x, R.x + R.w, R.y, R.y + R.h, 0.001, 0.014, fabric(color), 6, { shadow: false }); return; }
  if (n.includes('plant') || n.includes('planter')) {
    cyl(g, cx, cy, rad * 0.55, 0, 0.42, mat('#d9d2c6', { roughness: 0.6 }), rad * 0.7);
    const top = n.includes('planter') ? 0.75 : 1.15;
    for (let i = 0; i < 7; i++) {
      const f = new THREE.Mesh(new THREE.IcosahedronGeometry(rad * (0.45 + rnd() * 0.35) * MM, 1), mat(['#4f6e3b', '#5d7d44', '#44613a'][i % 3], { flatShading: true, roughness: 0.9 }));
      f.position.set((cx + (rnd() - 0.5) * rad) * MM, top + (rnd() - 0.3) * 0.35, (cy + (rnd() - 0.5) * rad) * MM);
      f.castShadow = true; g.add(f);
    }
    cyl(g, cx, cy, 12, 0.4, top - 0.1, mat('#6b5037'));
    hit(); return;
  }
  if (n.includes('lamp')) {
    cyl(g, cx, cy, rad * 0.7, 0, 0.025, M.black); cyl(g, cx, cy, 10, 0.025, 1.45, M.black);
    cyl(g, cx, cy, rad * 0.95, 1.4, 1.75, mat('#f1ece2', { emissive: '#f6e3bd', emissiveIntensity: 0.7, roughness: 0.9 }), rad * 0.75);
    const l = new THREE.PointLight('#ffe2b0', 1.2, 5, 1.5); l.position.set(cx * MM, 1.55, cy * MM); g.add(l);
    return;
  }
  if (n.includes('fridge')) { rbox(g, R.x, R.x + R.w, R.y, R.y + R.h, 0, 1.85, M.steel, 15, { collide: col }); return; }
  if (n.includes('bed')) {
    const single = n.includes('single');
    rbox(g, R.x, R.x + R.w, R.y, R.y + R.h, 0.06, 0.34, fabric(color), 30, { collide: col });
    const m = inset(R, 25);
    rbox(g, m.x, m.x + m.w, m.y, m.y + m.h, 0.34, 0.56, fabric('#f4f1ea'), 60);
    rbox(g, ...strip(R, back, 90), 0.06, single ? 0.95 : 1.25, fabric(color), 40);
    const len = along(back) ? R.h : R.w;
    rbox(g, ...strip(inset(R, 10), OPP[back], len * 0.62), 0.5, 0.61, fabric(color === '#b8ad9e' ? '#cfc6b8' : color), 45);
    const across = along(back) ? R.w : R.h, count = across > 1300 ? 2 : 1, pw = Math.min(650, across / count - 90);
    const p0 = strip(R, back, 460), a = back === 'top' || back === 'left' ? 120 : 20, b = back === 'top' || back === 'left' ? 20 : 120;
    for (let i = 0; i < count; i++) {
      const off = (across / count) * (i + 0.5) - pw / 2;
      if (along(back)) rbox(g, R.x + off, R.x + off + pw, p0[2] + a, p0[3] - b, 0.55, 0.72, fabric('#f3efe6'), 60);
      else rbox(g, p0[0] + a, p0[1] - b, R.y + off, R.y + off + pw, 0.55, 0.72, fabric('#f3efe6'), 60);
    }
    return;
  }
  if (n.includes('stool')) { // upholstered counter stool on four legs with a foot rail
    const h = it.height || 0.62, l = inset(R, 20);
    legs(g, l, h - 0.08, 38, M.black);
    for (const s of ['top', 'bottom', 'left', 'right']) box(g, ...strip(inset(l, 5), s, 25), 0.2, 0.225, M.black);
    rbox(g, R.x, R.x + R.w, R.y, R.y + R.h, h - 0.09, h, fabric(color), 35, { collide: col });
    return;
  }
  if (n.includes('dining chair') || n.includes('desk chair')) {
    const dining = n.includes('dining'), s = inset(R, 40), cloth = fabric(dining ? '#b9ab96' : '#5b5f63');
    legs(g, inset(s, 20), 0.44, 25, M.black);
    rbox(g, s.x, s.x + s.w, s.y, s.y + s.h, 0.43, 0.5, cloth, 25, { collide: col });
    rbox(g, ...strip(s, back, 55), 0.5, 0.92, cloth, 25);
    return;
  }
  if (n.includes('bench')) {
    legs(g, inset(R, 40), 0.36, 35, M.black);
    rbox(g, R.x, R.x + R.w, R.y, R.y + R.h, 0.36, 0.47, fabric(color), 40, { collide: col });
    return;
  }
  if (it.cat === 'seating') { // sofas, armchairs, lounge and outdoor chairs
    const outdoor = n.includes('outdoor');
    const cloth = fabric(outdoor ? '#e8e1d4' : color);
    const top = it.height || 0.85, arm = Math.min(0.62, top - 0.04);
    if (outdoor) legs(g, inset(R, 30), 0.3, 30, mat('#8e9496', { metalness: 0.6, roughness: 0.4 }));
    else box(g, R.x + 50, R.x + R.w - 50, R.y + 50, R.y + R.h - 50, 0, 0.08, M.black);
    rbox(g, R.x, R.x + R.w, R.y, R.y + R.h, outdoor ? 0.3 : 0.08, 0.3, cloth, 30, { collide: col });
    const depth = along(back) ? R.h : R.w, length = along(back) ? R.w : R.h;
    const backD = Math.min(230, depth * 0.26), armW = outdoor ? 60 : 150;
    // seat cushions between the arms, back cushions against the back
    const arms = it.arms || SIDES_PERP[back];
    const inner = { ...R };
    for (const s of arms) {
      if (s === 'left') { inner.x += armW; inner.w -= armW; } if (s === 'right') inner.w -= armW;
      if (s === 'top') { inner.y += armW; inner.h -= armW; } if (s === 'bottom') inner.h -= armW;
    }
    const nC = Math.max(1, Math.round((length - 2 * armW) / 850));
    const seatR = { ...inner };
    if (back === 'top') { seatR.y += backD; seatR.h -= backD; } if (back === 'bottom') seatR.h -= backD;
    if (back === 'left') { seatR.x += backD; seatR.w -= backD; } if (back === 'right') seatR.w -= backD;
    for (const c of split(seatR, back, nC, 12)) rbox(g, c.x, c.x + c.w, c.y, c.y + c.h, 0.3, 0.45, cloth, 60);
    const backR = { ...inner }; const bs = strip(inner, back, backD);
    Object.assign(backR, { x: bs[0], y: bs[2], w: bs[1] - bs[0], h: bs[3] - bs[2] });
    const oe = it.open_end; // backless chaise end
    if (oe) { if (oe.side === 'left') { backR.x += oe.len; backR.w -= oe.len; } if (oe.side === 'right') backR.w -= oe.len;
      if (oe.side === 'top') { backR.y += oe.len; backR.h -= oe.len; } if (oe.side === 'bottom') backR.h -= oe.len; }
    const nB = Math.max(1, Math.round((along(back) ? backR.w : backR.h) / 850));
    for (const c of split(backR, back, oe ? nB : nC, 12)) rbox(g, c.x, c.x + c.w, c.y, c.y + c.h, 0.3, top, cloth, 70);
    for (const s of arms) rbox(g, ...strip(R, s, armW), 0.08, arm, outdoor ? mat('#9da3a6', { metalness: 0.5, roughness: 0.4 }) : cloth, 55);
    for (const e of it.extra || []) { // chaise or corner module of a sectional
      box(g, e.x + 50, e.x + e.w - 50, e.y + 50, e.y + e.h - 50, 0, 0.08, M.black);
      rbox(g, e.x, e.x + e.w, e.y, e.y + e.h, 0.08, 0.3, cloth, 30, { collide: col });
      const off = s => (e.arm === s ? armW : 0) + (e.back === s ? backD : 0);
      rbox(g, e.x + off('left'), e.x + e.w - off('right'), e.y + off('top'), e.y + e.h - off('bottom'), 0.3, 0.45, cloth, 60);
      if (e.back) {
        const eb = strip(e, e.back, backD), er = { x: eb[0], y: eb[2], w: eb[1] - eb[0], h: eb[3] - eb[2] };
        if (e.arm === 'top') { er.y += armW; er.h -= armW; } if (e.arm === 'bottom') er.h -= armW;
        if (e.arm === 'left') { er.x += armW; er.w -= armW; } if (e.arm === 'right') er.w -= armW;
        const n = Math.max(1, Math.round((along(e.back) ? er.w : er.h) / 850));
        for (const c of split(er, e.back, n, 12)) rbox(g, c.x, c.x + c.w, c.y, c.y + c.h, 0.3, top, cloth, 70);
      }
      if (e.arm) rbox(g, ...strip(e, e.arm, armW), 0.08, arm, cloth, 55);
    }
    return;
  }
  if (it.cat === 'table' && it.shelf_end) { // counter-height table: marble top, shelving end panel, legs and footrest
    const h = it.height || 0.914, marble = once('marbleSlab', () => new THREE.MeshStandardMaterial({ map: tileTex({ span: 1.3, cols: 1, rows: 1, base: '#efece6', grout: '#efece6', gw: 0, veins: 18, size: 512 }), roughness: 0.12 }));
    const frame = mat('#26241f', { roughness: 0.55 }), end = strip(R, it.shelf_end, 300), far = OPP[it.shelf_end];
    box(g, ...end, 0, h - 0.035, frame, { collide: col });
    const niche = strip({ x: end[0], y: end[2], w: end[1] - end[0], h: end[3] - end[2] }, OPP[it.shelf_end], 260);
    for (const [z0, z1] of [[0.08, 0.3], [0.34, 0.56], [0.6, 0.82]]) box(g, ...(along(it.shelf_end) ? [niche[0] + 30, niche[1] - 30, niche[2], niche[3]] : [niche[0], niche[1], niche[2] + 30, niche[3] - 30]), z0, z1, mat('#3a3833', { roughness: 0.7 }), { shadow: false });
    const fs = strip(R, far, 70);
    if (along(far)) { box(g, fs[0], fs[0] + 70, fs[2], fs[3], 0, h - 0.035, frame, { collide: col }); box(g, fs[1] - 70, fs[1], fs[2], fs[3], 0, h - 0.035, frame, { collide: col }); }
    else { box(g, fs[0], fs[1], fs[2], fs[2] + 70, 0, h - 0.035, frame, { collide: col }); box(g, fs[0], fs[1], fs[3] - 70, fs[3], 0, h - 0.035, frame, { collide: col }); }
    if (along(it.shelf_end)) box(g, cx - 25, cx + 25, R.y + 300, R.y + R.h - 300, 0.28, 0.33, frame); else box(g, R.x + 300, R.x + R.w - 300, cy - 25, cy + 25, 0.28, 0.33, frame);
    rbox(g, R.x, R.x + R.w, R.y, R.y + R.h, h - 0.035, h, marble, 6);
    return;
  }
  if (it.cat === 'table') {
    const h = it.height || (n.includes('coffee') ? 0.4 : n.includes('side') ? 0.5 : 0.75);
    const top = wood(n.includes('desk') || n.includes('dining') ? '#b88c5c' : color);
    if (it.shape === 'circle') { cyl(g, cx, cy, rad, h - 0.035, h, top, rad, 40); cyl(g, cx, cy, 28, 0, h - 0.035, M.black); cyl(g, cx, cy, rad * 0.5, 0, 0.015, M.black); }
    else if (n.includes('coffee')) { rbox(g, R.x + 70, R.x + R.w - 70, R.y + 70, R.y + R.h - 70, 0, h - 0.04, top, 10); rbox(g, R.x, R.x + R.w, R.y, R.y + R.h, h - 0.04, h, top, 12); }
    else { legs(g, inset(R, 40), h - 0.035, 45, M.black); rbox(g, R.x, R.x + R.w, R.y, R.y + R.h, h - 0.035, h, top, 8); }
    hit(); return;
  }
  if (it.cat === 'storage') {
    let z0 = 0, z1 = 0.8;
    if (n.includes('wardrobe')) z1 = 2.4;
    else if (n.includes('shoe')) z1 = 1.8;
    else if (n.includes('nightstand')) z1 = 0.55;
    else if (n.includes('tv unit')) { z0 = 0.3; z1 = 0.7; }
    if (it.height) z1 = it.height;
    const painted = (it.spec || '').toLowerCase().includes('off-white') || (it.spec || '').toLowerCase().includes('white');
    const body = painted ? mat(color, { roughness: 0.4 }) : wood(color);
    rbox(g, R.x, R.x + R.w, R.y, R.y + R.h, z0 === 0 && z1 < 1 ? 0.06 : z0, z1, body, 8, { collide: col });
    if (z0 === 0 && z1 < 1) box(g, R.x + 40, R.x + R.w - 40, R.y + 40, R.y + R.h - 40, 0, 0.06, M.black);
    const front = OPP[back], len = along(front) ? R.w : R.h;
    const doors = n.includes('nightstand') || n.includes('console') || n.includes('tv') ? 0 : Math.max(2, Math.round(len / 550));
    for (let i = 1; i < doors; i++) { // door seams on the front face
      const t = (len / doors) * i, s = strip(R, front, 5), o = front === 'bottom' || front === 'right' ? 4 : -4;
      if (along(front)) box(g, R.x + t - 3, R.x + t + 3, s[2] + o, s[3] + o, z0 + 0.08, z1 - 0.03, M.black, { shadow: false });
      else box(g, s[0] + o, s[1] + o, R.y + t - 3, R.y + t + 3, z0 + 0.08, z1 - 0.03, M.black, { shadow: false });
    }
    if (n.includes('tv')) { // TV behind, on the wall or on a stand
      const s = strip(R, back, 45), tv = Math.min(1450, len - 100), tz = z1 < 0.7 ? z1 + 0.16 : 1.05, th = tv * 0.5625 * MM;
      if (along(back)) box(g, cx - tv / 2, cx + tv / 2, s[2], s[3], tz, tz + th, M.screen);
      else box(g, s[0], s[1], cy - tv / 2, cy + tv / 2, tz, tz + th, M.screen);
    }
    if (n.includes('mirror')) {
      const s = strip(R, back, 20);
      const mm = new THREE.Mesh(new THREE.CircleGeometry(0.4, 48), M.mirror);
      mm.position.set((s[0] + s[1]) / 2 * MM, 1.55, (s[2] + s[3]) / 2 * MM);
      mm.rotation.y = { left: Math.PI / 2, right: -Math.PI / 2, top: 0, bottom: Math.PI }[back];
      g.add(mm);
    }
    return;
  }
  rbox(g, R.x, R.x + R.w, R.y, R.y + R.h, 0, 0.8, mat(color), 10, { collide: col });
}

// pleated curtain stack standing in front of a window
function curtain(g, axis, a0, a1, c, z0, z1, material) {
  const w = (a1 - a0) * MM, h = z1 - z0, folds = Math.max(3, Math.round(w / 0.07));
  const geo = new THREE.PlaneGeometry(w, h, folds * 4, 1);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) / w + 0.5) * folds * Math.PI * 2) * 0.03);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true; m.receiveShadow = true;
  if (axis === 'h') m.position.set((a0 + a1) / 2 * MM, (z0 + z1) / 2, c * MM);
  else { m.rotation.y = Math.PI / 2; m.position.set(c * MM, (z0 + z1) / 2, (a0 + a1) / 2 * MM); }
  g.add(m);
}
function curtains(g, fl) {
  const sheer = once('sheer', () => new THREE.MeshStandardMaterial({ color: '#f6f2ea', map: TEX.fabric, roughness: 1, transparent: true, opacity: 0.82, side: THREE.DoubleSide, depthWrite: false }));
  for (const w of fl.windows) {
    if ((w.sill ?? WIN_SILL) > 0) continue;
    const horiz = w.y1 === w.y2, c = horiz ? w.y1 : w.x1;
    const a0 = Math.min(horiz ? w.x1 : w.y1, horiz ? w.x2 : w.y2), a1 = Math.max(horiz ? w.x1 : w.y1, horiz ? w.x2 : w.y2);
    if (a1 - a0 < 900) continue;
    const mid = (a0 + a1) / 2;
    let side = 0, room = null;
    for (const s of [1, -1]) {
      const r = horiz ? roomAt(fl, mid, c + s * 400) : roomAt(fl, c + s * 400, mid);
      if (r && !/bath|pr|stair|foyer|lobby|balcony/i.test(r.name)) { side = s; room = r; break; }
    }
    if (!room) continue;
    const drapeC = /living/i.test(room.name) ? '#6e5b4c' : /bedroom 1/i.test(room.name) ? '#6d8fae' : '#8e8c88';
    const drape = fabric(drapeC);
    const off = W / 2 + 110, cz = c + side * off, top = H - 0.03;
    for (const [e0, e1] of [[a0, a0 + 420], [a1 - 420, a1]]) curtain(g, horiz ? 'h' : 'v', e0, e1, cz + side * 60, 0.02, top, drape);
    for (const [e0, e1] of [[a0 + 380, a0 + 820], [a1 - 820, a1 - 380]]) curtain(g, horiz ? 'h' : 'v', e0, e1, cz, 0.02, top, sheer);
  }
}

// ---------- fixed fittings ----------
function buildFixed(g, fl, f, col) {
  const n = f.name.toLowerCase();
  const back = nearestSide(fl, f);
  const R = { x: f.x, y: f.y, w: f.w, h: f.h };
  const cx = R.x + R.w / 2, cy = R.y + R.h / 2;
  if (n === 'car') {
    const paint = mat(f.x < 7000 ? '#9aa0a6' : '#3a4148', { metalness: 0.6, roughness: 0.35 });
    rbox(g, R.x + 40, R.x + R.w - 40, R.y, R.y + R.h, 0.28, 0.85, paint, 160, { collide: col });
    rbox(g, R.x + 170, R.x + R.w - 170, R.y + R.h * 0.25, R.y + R.h * 0.72, 0.82, 1.42, mat('#20262b', { metalness: 0.4, roughness: 0.15 }), 140);
    for (const [wx, wy] of [[R.x + 40, R.y + 750], [R.x + R.w - 40, R.y + 750], [R.x + 40, R.y + R.h - 750], [R.x + R.w - 40, R.y + R.h - 750]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.22, 24), mat('#1c1c1c'));
      w.rotation.z = Math.PI / 2; w.position.set(wx * MM, 0.33, wy * MM); w.castShadow = true; g.add(w);
    }
    return;
  }
  if (n === 'tile wall') { box(g, R.x, R.x + R.w, R.y, R.y + R.h, 0, H, M.tileWall, { shadow: false }); return; }
  if (n === 'wc') {
    rbox(g, ...strip(R, back, 190), 0.2, 0.82, M.ceramic, 40, { collide: col });
    rbox(g, R.x + 40, R.x + R.w - 40, R.y + 40, R.y + R.h - 40, 0, 0.42, M.ceramic, 70, { collide: col });
    return;
  }
  if (n === 'basin') { // wall-hung oak vanity, white top, mirror with a mosaic border
    rbox(g, R.x, R.x + R.w, R.y, R.y + R.h, 0.45, 0.83, wood('#cfae84'), 8, { collide: col });
    rbox(g, R.x, R.x + R.w, R.y, R.y + R.h, 0.83, 0.88, M.ceramic, 10);
    const s = strip(R, back, 70), tz = 0.88, pt = along(back) ? [cx, (s[2] + s[3]) / 2] : [(s[0] + s[1]) / 2, cy];
    cyl(g, pt[0], pt[1], 14, tz, tz + 0.2, M.steel);
    const m = strip(R, back, 12), len = along(back) ? R.w : R.h;
    const ext = Math.max(0, 900 - len) / 2;
    if (along(back)) {
      box(g, R.x - ext, R.x + R.w + ext, m[2], m[3], 1.05, 1.95, M.mirror, { shadow: false });
      for (const e of [R.x - ext - 70, R.x + R.w + ext]) box(g, e, e + 70, m[2], m[3] + 2, 1.05, 1.95, M.mosaic, { shadow: false });
    } else {
      box(g, m[0], m[1], R.y - ext, R.y + R.h + ext, 1.05, 1.95, M.mirror, { shadow: false });
      for (const e of [R.y - ext - 70, R.y + R.h + ext]) box(g, m[0], m[1] + 2, e, e + 70, 1.05, 1.95, M.mosaic, { shadow: false });
    }
    return;
  }
  if (n === 'tub') {
    rbox(g, R.x, R.x + R.w, R.y, R.y + R.h, 0, 0.55, M.ceramic, 50, { collide: col });
    box(g, R.x + 80, R.x + R.w - 80, R.y + 80, R.y + R.h - 80, 0.5, 0.552, mat('#cfe0e8', { roughness: 0.05 }), { shadow: false });
    return;
  }
  if (n === 'shower') { // tray and frosted glass on the sides away from walls
    box(g, R.x, R.x + R.w, R.y, R.y + R.h, 0, 0.04, mat('#e9e7e2', { roughness: 0.3 }), { collide: col });
    const r = roomAt(fl, cx, cy);
    const open = r ? ['left', 'right', 'top', 'bottom'].filter(s => ({ left: R.x - r.x, right: r.x + r.w - R.x - R.w, top: R.y - r.y, bottom: r.y + r.h - R.y - R.h })[s] > 60) : [];
    for (const s of open) box(g, ...strip(R, s, 10), 0.04, 2.0, M.frosted, { shadow: false });
    cyl(g, cx, cy, 110, 2.15, 2.17, M.steel);
    return;
  }
  if (n === 'shaft') { box(g, R.x, R.x + R.w, R.y, R.y + R.h, 0, H, M.wall, { collide: col }); return; }
  if (n.startsWith('counter')) {
    const front = OPP[back];
    const plinth = { ...R };
    const ps = strip(R, front, 60);
    if (front === 'top') { plinth.y += 60; plinth.h -= 60; } if (front === 'bottom') plinth.h -= 60;
    if (front === 'left') { plinth.x += 60; plinth.w -= 60; } if (front === 'right') plinth.w -= 60;
    box(g, plinth.x, plinth.x + plinth.w, plinth.y, plinth.y + plinth.h, 0, 0.1, M.black, { shadow: false });
    box(g, R.x, R.x + R.w, R.y, R.y + R.h, 0.1, 0.87, M.cabinet, { collide: col });
    box(g, R.x - (front === 'left' ? 20 : 0), R.x + R.w + (front === 'right' ? 20 : 0), R.y - (front === 'top' ? 20 : 0), R.y + R.h + (front === 'bottom' ? 20 : 0), 0.87, 0.9, M.granite);
    const len = along(front) ? R.w : R.h;
    for (let i = 1; i < Math.round(len / 600); i++) { // cabinet door seams
      const t = (len / Math.round(len / 600)) * i, s = strip(R, front, 4), o = front === 'bottom' || front === 'right' ? 3 : -3;
      if (along(front)) box(g, R.x + t - 2, R.x + t + 2, s[2] + o, s[3] + o, 0.12, 0.85, M.black, { shadow: false });
      else box(g, s[0] + o, s[1] + o, R.y + t - 2, R.y + t + 2, 0.12, 0.85, M.black, { shadow: false });
    }
    // upper cabinets up to the ceiling, except over windows and the hob
    const us = strip(R, back, 350);
    let runs = [[along(back) ? R.x : R.y, along(back) ? R.x + R.w : R.y + R.h]];
    const cut = (a, b) => { runs = runs.flatMap(([p, q]) => (b <= p || a >= q) ? [[p, q]] : [[p, Math.max(p, a)], [Math.min(q, b), q]].filter(([u, v]) => v - u > 150)); };
    const wallC = { left: R.x - W / 2, right: R.x + R.w + W / 2, top: R.y - W / 2, bottom: R.y + R.h + W / 2 }[back];
    for (const w of fl.windows) {
      const horiz = w.y1 === w.y2;
      if (horiz === along(back) && Math.abs((horiz ? w.y1 : w.x1) - wallC) < W) cut(Math.min(horiz ? w.x1 : w.y1, horiz ? w.x2 : w.y2) - 50, Math.max(horiz ? w.x1 : w.y1, horiz ? w.x2 : w.y2) + 50);
    }
    const hobC = along(back) ? cx : cy;
    if (n.includes('hob')) cut(hobC - 450, hobC + 450);
    for (const [a, b] of runs) {
      if (along(back)) box(g, a, b, us[2], us[3], 1.45, H, M.cabinet);
      else box(g, us[0], us[1], a, b, 1.45, H, M.cabinet);
    }
    if (n.includes('hob')) { // range cooker: steel front, black hob, hood and chimney
      const fs = strip(R, front, 25), o = front === 'bottom' || front === 'right' ? 20 : -20;
      if (along(front)) { box(g, hobC - 450, hobC + 450, fs[2] + o, fs[3] + o, 0.1, 0.87, M.steel); box(g, hobC - 330, hobC + 330, fs[2] + o * 2, fs[3] + o * 2, 0.28, 0.68, M.screen); }
      else { box(g, fs[0] + o, fs[1] + o, hobC - 450, hobC + 450, 0.1, 0.87, M.steel); box(g, fs[0] + o * 2, fs[1] + o * 2, hobC - 330, hobC + 330, 0.28, 0.68, M.screen); }
      const hs = strip(R, back, 500), cs = strip(R, back, 260);
      if (along(back)) { box(g, hobC - 300, hobC + 300, R.y + 60, R.y + R.h - 60, 0.9, 0.905, M.screen, { shadow: false }); box(g, hobC - 450, hobC + 450, hs[2], hs[3], 1.62, 1.7, M.steel); box(g, hobC - 150, hobC + 150, cs[2], cs[3], 1.7, H, M.steel); }
      else { box(g, R.x + 60, R.x + R.w - 60, hobC - 300, hobC + 300, 0.9, 0.905, M.screen, { shadow: false }); box(g, hs[0], hs[1], hobC - 450, hobC + 450, 1.62, 1.7, M.steel); box(g, cs[0], cs[1], hobC - 150, hobC + 150, 1.7, H, M.steel); }
    }
    if (n.includes('sink')) {
      const sy = R.y + 1300, s = strip(R, back, 90);
      if (along(back)) box(g, cx - 400, cx + 400, R.y + 80, R.y + R.h - 80, 0.9, 0.903, M.steel, { shadow: false });
      else { box(g, R.x + 80, R.x + R.w - 80, sy, sy + 800, 0.9, 0.903, M.steel, { shadow: false }); cyl(g, (s[0] + s[1]) / 2, sy + 400, 14, 0.9, 1.2, M.steel); }
    }
    return;
  }
  rbox(g, R.x, R.x + R.w, R.y, R.y + R.h, 0, 0.8, mat('#dddddd'), 10);
}

// ---------- walls, openings and windows ----------
function computeCuts(fl) {
  const cuts = [];
  for (const d of fl.doors) {
    const [hx, hy] = d.at, e = d.wall === 'h' ? hx + d.dir * d.len : hy + d.dir * d.len;
    const a = d.wall === 'h' ? hx : hy;
    cuts.push({ axis: d.wall, c: d.wall === 'h' ? hy : hx, a0: Math.min(a, e), a1: Math.max(a, e), bottom: 0, top: DOOR_H, transom: d.transom });
  }
  for (const o of fl.openings) {
    if (o.w >= o.h) cuts.push({ axis: 'h', c: o.y + o.h / 2, a0: o.x, a1: o.x + o.w, bottom: 0, top: OPEN_H });
    else cuts.push({ axis: 'v', c: o.x + o.w / 2, a0: o.y, a1: o.y + o.h, bottom: 0, top: OPEN_H });
  }
  for (const w of fl.windows) {
    const h = w.y1 === w.y2;
    cuts.push({ axis: h ? 'h' : 'v', c: h ? w.y1 : w.x1, a0: Math.min(h ? w.x1 : w.y1, h ? w.x2 : w.y2),
      a1: Math.max(h ? w.x1 : w.y1, h ? w.x2 : w.y2), bottom: (w.sill ?? WIN_SILL) * MM, top: (w.top ?? WIN_TOP) * MM, glass: true });
  }
  return cuts;
}
function buildWalls(g, fl, cuts, col) {
  const segs = [], seen = new Set(), rails = [];
  for (const r of fl.rooms) {
    if (r.open || r.nowalls) continue;
    const sides = {
      top: ['h', r.x - W, r.x + r.w + W, r.y - W, r.y], bottom: ['h', r.x - W, r.x + r.w + W, r.y + r.h, r.y + r.h + W],
      left: ['v', r.y, r.y + r.h, r.x - W, r.x], right: ['v', r.y, r.y + r.h, r.x + r.w, r.x + r.w + W],
    };
    for (const [side, s] of Object.entries(sides)) {
      if ((r.rail || []).includes(side)) { rails.push(s); continue; }
      const k = s.join(); if (!seen.has(k)) { seen.add(k); segs.push(s); }
    }
  }
  const piece = (axis, a0, a1, b0, b1, z0, z1, m = M.wall, collide = true) => axis === 'h'
    ? box(g, a0, a1, b0, b1, z0, z1, m, { collide: collide && z0 < 0.5 ? col : null })
    : box(g, b0, b1, a0, a1, z0, z1, m, { collide: collide && z0 < 0.5 ? col : null });
  const frames = (axis, c0, c1, b0, b1, zb, zt) => {
    const m = (b0 + b1) / 2, t = 35;
    const seg = (a0, a1, z0, z1) => piece(axis, a0, a1, m - t, m + t, z0, z1, M.frame, false);
    seg(c0, c0 + 50, zb, zt); seg(c1 - 50, c1, zb, zt);
    seg(c0, c1, zt - 0.06, zt); seg(c0, c1, zb, zb + 0.05);
    const n = Math.max(1, Math.round((c1 - c0) / 1500));
    for (let i = 1; i < n; i++) { const a = c0 + (c1 - c0) * i / n; seg(a - 25, a + 25, zb, zt); }
  };
  for (const [axis, a0, a1, b0, b1] of segs) {
    const mine = cuts.filter(c => c.axis === axis && c.c > b0 && c.c < b1 && c.a1 > a0 && c.a0 < a1).sort((p, q) => p.a0 - q.a0);
    let pos = a0;
    for (const c of mine) {
      const c0 = Math.max(c.a0, a0), c1 = Math.min(c.a1, a1);
      if (c0 > pos) piece(axis, pos, c0, b0, b1, 0, H);
      if (c.bottom > 0) piece(axis, c0, c1, b0, b1, 0, c.bottom);
      const m = (b0 + b1) / 2;
      if (c.transom) { // glazed panel over the front door
        frames(axis, c0, c1, b0, b1, c.top, 2.75);
        piece(axis, c0, c1, m - 6, m + 6, c.top, 2.75, M.glass, false);
        piece(axis, c0, c1, b0, b1, 2.75, H);
      } else piece(axis, c0, c1, b0, b1, c.top, H);
      if (c.glass) { piece(axis, c0, c1, m - 6, m + 6, c.bottom, c.top, M.glass, true); frames(axis, c0, c1, b0, b1, c.bottom, c.top); }
      else piece(axis, c0, c1, b0, b1, -0.02, 0.0, floorMat('marble'), false); // threshold
      pos = Math.max(pos, c1);
    }
    if (pos < a1) piece(axis, pos, a1, b0, b1, 0, H);
  }
  for (const [axis, a0, a1, b0, b1] of rails) { // glass balustrade with a dark top rail
    const m = (b0 + b1) / 2;
    piece(axis, a0, a1, m - 6, m + 6, 0.05, 1.05, M.glass, true);
    piece(axis, a0, a1, m - 30, m + 30, 1.05, 1.1, M.frame, false);
    for (const a of [a0, (a0 + a1) / 2, a1 - 40]) piece(axis, a, a + 40, m - 20, m + 20, 0, 1.05, M.frame, false);
  }
  for (const d of fl.doors) { // door leaves, shown open, with lever handles
    const [hx, hy] = d.at, n = d.len - 20, leaf = d.front ? M.frontDoor : M.door, hz = DOOR_H - 0.01;
    if (d.front) { // the front door is drawn closed
      const e = d.wall === 'h' ? hx + d.dir * d.len : hy + d.dir * d.len;
      if (d.wall === 'h') { box(g, hx, e, hy - 25, hy + 25, 0, hz, leaf, { collide: col }); box(g, e - d.dir * 110, e - d.dir * 80, hy - 60, hy + 60, 0.9, 1.5, M.steel); }
      else { box(g, hx - 25, hx + 25, hy, e, 0, hz, leaf, { collide: col }); box(g, hx - 60, hx + 60, e - d.dir * 110, e - d.dir * 80, 0.9, 1.5, M.steel); }
      continue;
    }
    if (d.wall === 'h') {
      box(g, hx, hx + d.dir * 45, hy, hy + d.swing * n, 0, hz, leaf, { collide: col });
      const hy2 = hy + d.swing * (n - 90), x0 = Math.min(hx, hx + d.dir * 45);
      box(g, x0 - 55, x0 + 100, hy2 - 70, hy2 + 70, 1.0, 1.025, M.handle, { shadow: false });
    } else {
      box(g, hx, hx + d.swing * n, hy, hy + d.dir * 45, 0, hz, leaf, { collide: col });
      const hx2 = hx + d.swing * (n - 90), y0 = Math.min(hy, hy + d.dir * 45);
      box(g, hx2 - 70, hx2 + 70, y0 - 55, y0 + 100, 1.0, 1.025, M.handle, { shadow: false });
    }
  }
}

// the run of each room edge that has a wall behind it (no door, opening or full-height glass)
function sideRuns(r, side, cuts) {
  const hz = along(side);
  const b0 = side === 'top' ? r.y - W : side === 'bottom' ? r.y + r.h : side === 'left' ? r.x - W : r.x + r.w;
  let runs = [[hz ? r.x : r.y, hz ? r.x + r.w : r.y + r.h]];
  for (const c of cuts) {
    if (c.axis !== (hz ? 'h' : 'v') || !(c.c > b0 && c.c < b0 + W) || c.bottom > 0.15) continue;
    runs = runs.flatMap(([a, b]) => (c.a1 <= a || c.a0 >= b) ? [[a, b]] : [[a, Math.max(a, c.a0)], [Math.min(b, c.a1), b]].filter(([p, q]) => q - p > 20));
  }
  return runs;
}
function edgeBox(g, r, side, a, b, depth, z0, z1, material) {
  if (side === 'top') box(g, a, b, r.y, r.y + depth, z0, z1, material, { shadow: false });
  else if (side === 'bottom') box(g, a, b, r.y + r.h - depth, r.y + r.h, z0, z1, material, { shadow: false });
  else if (side === 'left') box(g, r.x, r.x + depth, a, b, z0, z1, material, { shadow: false });
  else box(g, r.x + r.w - depth, r.x + r.w, a, b, z0, z1, material, { shadow: false });
}
function roomTrim(g, ceil, fl, r, cuts) {
  const outdoor = /balcony|parking|stair/i.test(r.name) || r.open;
  if (!outdoor) {
    const sk = isCarpet(r.floor) ? M.paint : floorMat(r.floor);
    for (const side of ['top', 'bottom', 'left', 'right'])
      for (const [a, b] of sideRuns(r, side, cuts)) edgeBox(g, r, side, a, b, 12, 0, 0.1, sk);
  }
  if (r.ceiling === 'cornice') for (const side of ['top', 'bottom', 'left', 'right']) {
    const [a, b] = along(side) ? [r.x, r.x + r.w] : [r.y, r.y + r.h];
    edgeBox(ceil, r, side, a, b, 70, H - 0.07, H, M.paint);
    edgeBox(ceil, r, side, a, b, 30, H - 0.14, H - 0.07, M.paint);
  }
  if (r.ceiling === 'tray') { // lowered border with a stepped edge, LED cove and slot diffusers
    const B = 520, z0 = H - 0.25, inner = inset(r, B);
    for (const side of ['top', 'bottom', 'left', 'right']) {
      const [a, b] = along(side) ? [r.x, r.x + r.w] : [r.y + B, r.y + r.h - B];
      edgeBox(ceil, r, side, a, b, B, z0, H, M.ceiling);
      const [ia, ib] = along(side) ? [inner.x - 40, inner.x + inner.w + 40] : [inner.y, inner.y + inner.h];
      edgeBox(ceil, { x: inner.x - 40, y: inner.y - 40, w: inner.w + 80, h: inner.h + 80 }, side, ia, ib, 40, z0 - 0.06, z0, M.ceiling);
      edgeBox(ceil, inner, side, along(side) ? inner.x : inner.y, along(side) ? inner.x + inner.w : inner.y + inner.h, 12, H - 0.04, H - 0.02, M.light);
    }
    box(ceil, r.x + 900, r.x + r.w - 900, r.y + 230, r.y + 290, z0 - 0.002, z0, M.black, { shadow: false });
    for (let x = r.x + 700; x < r.x + r.w - 500; x += 1400) { disc(ceil, x, r.y + r.h - B / 2, z0 - 0.003, 0.04, M.light); disc(ceil, x, r.y + B / 2 + 150, z0 - 0.003, 0.04, M.light); }
    for (let y = r.y + 1300; y < r.y + r.h - 900; y += 1400) { disc(ceil, r.x + B / 2, y, z0 - 0.003, 0.04, M.light); disc(ceil, r.x + r.w - B / 2, y, z0 - 0.003, 0.04, M.light); }
  } else if (!r.noceiling && !r.open && !/bedroom/i.test(r.name)) { // recessed downlights
    const nx = Math.max(1, Math.round(r.w / 1700)), ny = Math.max(1, Math.round(r.h / 1700));
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) disc(ceil, r.x + r.w * (i + 0.5) / nx, r.y + r.h * (j + 0.5) / ny, H - 0.002, 0.045, M.light);
  }
}

// spindles and a sloped rail from (yA, zA) to (yB, zB) along x = bx
function balustrade(g, bx, yA, zA, yB, zB, floorAt) {
  const railZ = y => zA + (zB - zA) * (y - yA) / (yB - yA);
  const lo = Math.min(yA, yB), hi = Math.max(yA, yB);
  for (let y = lo + 70; y < hi - 50; y += 125) box(g, bx - 16, bx + 16, y - 16, y + 16, floorAt(y), railZ(y), M.paint);
  for (const y of [yA, yB]) { const yy = y + (y === lo ? 45 : -45); box(g, bx - 42, bx + 42, yy - 42, yy + 42, floorAt(yy) - 0.02, railZ(yy) + 0.1, M.paint); }
  const dy = (yB - yA) * MM, dz = zB - zA, len = Math.hypot(dy, dz);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, len), M.paint);
  rail.position.set(bx * MM, (zA + zB) / 2 + 0.025, (yA + yB) / 2 * MM);
  rail.rotation.x = Math.atan2(dz, dy) * (dy < 0 ? 1 : -1) + (dy < 0 ? Math.PI : 0); rail.castShadow = true;
  g.add(rail);
}
function buildUStair(g, ceil, fl, s, col) {
  const u = s.u, rise = LEVEL / 18, y0 = u.y0, yEnd = s.y + s.h, yL = yEnd - u.landing, go = (yL - y0) / 8, xm = s.x + s.w / 2;
  const tread = floorMat('marble');
  const step = (x0, x1, a, b, top, solid) => {
    box(g, x0, x1, a, b, solid ? 0 : top - 0.24, top - 0.04, M.paint);
    box(g, x0, x1, a, b, top - 0.04, top, tread);
    box(g, x0 + 100, x1 - 100, a + 35, b - 35, top, top + 0.01, M.runner, { shadow: false });
  };
  const L = s.open === 'left'; // which side faces the hall
  const [la, lb] = L ? [s.x, xm] : [xm, s.x + s.w], [ua, ub] = L ? [xm, s.x + s.w] : [s.x, xm];
  for (let i = 0; i < 8; i++) step(la, lb, y0 + i * go, y0 + (i + 1) * go, (i + 1) * rise, true); // lower flight, rising toward the front
  step(s.x, s.x + s.w, yL, yEnd, 9 * rise, false); // half landing by the tall window
  for (let j = 0; j < 8; j++) step(ua, ub, yL - (j + 1) * go, yL - j * go, (10 + j) * rise, false); // upper flight, back over the hall
  const dy = (y0 - yL) * MM, dz = 8 * rise, len = Math.hypot(dy, dz); // sloped soffit under the upper flight
  const soffit = new THREE.Mesh(new THREE.BoxGeometry((ub - ua) * MM, 0.03, len), M.paint);
  soffit.position.set((ua + ub) / 2 * MM, (10 * rise + 18 * rise) / 2 - 0.26, (y0 + yL) / 2 * MM);
  soffit.rotation.x = Math.atan2(dz, -dy); soffit.receiveShadow = true;
  g.add(soffit);
  col.push([s.x * MM, y0 * MM, (s.x + s.w) * MM, yEnd * MM]);
  const bx = L ? s.x + 45 : s.x + s.w - 45;
  balustrade(g, bx, y0, rise + 0.9, yL, 8 * rise + 0.9, y => Math.min(8, Math.floor((y - y0) / go) + 1) * rise);
  balustrade(g, bx, yL, 9 * rise + 0.9, yEnd, 9 * rise + 0.9, () => 9 * rise);
  balustrade(g, xm, yL, 10 * rise + 0.9, y0, 17 * rise + 0.9, y => (10 + Math.min(7, Math.floor((yL - y) / go))) * rise);
  // stairwell open to the first floor: walls, a tall window and the upper ceiling
  const top = H + LEVEL;
  for (const [x0, x1, a, b] of [[s.x, s.x + 20, y0, yEnd], [s.x + s.w - 20, s.x + s.w, y0, yEnd], [s.x, s.x + s.w, y0, y0 + 20]]) box(ceil, x0, x1, a, b, H, top, M.wall, { shadow: false });
  const wa = L ? s.x : s.x + 900, wb = L ? s.x + s.w - 900 : s.x + s.w; // tall stairwell window
  box(ceil, s.x, wa, yEnd - 20, yEnd, H, top, M.wall, { shadow: false });
  box(ceil, wb, s.x + s.w, yEnd - 20, yEnd, H, top, M.wall, { shadow: false });
  box(ceil, wa, wb, yEnd - 20, yEnd, H, LEVEL + 0.2, M.wall, { shadow: false });
  box(ceil, wa, wb, yEnd - 20, yEnd, LEVEL + 2.9, top, M.wall, { shadow: false });
  box(ceil, wa, wb, yEnd - 10, yEnd - 4, LEVEL + 0.2, LEVEL + 2.9, M.glass, { shadow: false });
  for (const [x0, x1] of [[wa, wa + 50], [wb - 50, wb]]) box(ceil, x0, x1, yEnd - 40, yEnd, LEVEL + 0.2, LEVEL + 2.9, M.frame, { shadow: false });
  const c = new THREE.Mesh(new THREE.PlaneGeometry(s.w * MM, (yEnd - y0) * MM), M.ceiling);
  c.rotation.x = Math.PI / 2; c.position.set((s.x + s.w / 2) * MM, top, (y0 + yEnd) / 2 * MM); ceil.add(c);
  return [s.x, s.x + s.w, y0, yEnd];
}
function buildStairs(g, fl, s, col) {
  const step = s.h / s.treads, rise = LEVEL / 18, up = s.label === 'UP';
  const topOf = y => { const i = Math.min(s.treads - 1, Math.max(0, Math.floor((up ? s.y + s.h - y : y - s.y) / step))); return (up ? 1 : -1) * (i + 1) * rise; };
  for (let i = 0; i < s.treads; i++) {
    const y0 = up ? s.y + s.h - (i + 1) * step : s.y + i * step, y1 = y0 + step;
    const top = (up ? 1 : -1) * (i + 1) * rise;
    box(g, s.x, s.x + s.w, y0, y1, up ? 0 : -LEVEL, top - 0.04, M.paint);
    box(g, s.x, s.x + s.w, y0 - (up ? 25 : 0), y1 + (up ? 0 : 25), top - 0.04, top, floorMat('marble'));
    box(g, s.x + 110, s.x + s.w - 110, y0 + 40, y1 - 40, top, top + 0.01, M.runner, { shadow: false });
  }
  col.push([s.x * MM, s.y * MM, (s.x + s.w) * MM, (s.y + s.h) * MM]);
  // white balustrade on the open side: square spindles, flat rail and newel posts
  const bx = s.open === 'left' ? s.x + 45 : s.x + s.w - 45;
  const yLow = up ? s.y + s.h : s.y, yHigh = up ? s.y : s.y + s.h;
  const zLow = 0.9 + (up ? rise : 0), zHigh = 0.9 + (up ? s.treads * rise : -s.treads * rise + rise);
  const railZ = y => zLow + (zHigh - zLow) * (y - yLow) / (yHigh - yLow);
  for (let y = s.y + 90; y < s.y + s.h - 60; y += 125) box(g, bx - 16, bx + 16, y - 16, y + 16, topOf(y), railZ(y), M.paint);
  for (const y of [yLow + (up ? -45 : 45), yHigh + (up ? 45 : -45)]) box(g, bx - 45, bx + 45, y - 45, y + 45, topOf(y) - 0.02, railZ(y) + 0.1, M.paint);
  const dy = (yHigh - yLow) * MM, dz = zHigh - zLow, len = Math.hypot(dy, dz);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, len), M.paint);
  rail.position.set(bx * MM, (zLow + zHigh) / 2 + 0.025, (yLow + yHigh) / 2 * MM);
  rail.rotation.x = -Math.atan2(dz, dy); rail.castShadow = true;
  g.add(rail);
}

// garden, terrace and boundary walls around the ground floor
function garden(g, z) {
  floorPlane(g, -40000, 40000, -40000, 40000, floorMat('pavers'), z - 0.06);
  floorPlane(g, ...mxs(-150, 9200), -4200, -150, M.turf, z - 0.03);
  floorPlane(g, ...mxs(7125, 9200), -150, 9100, M.turf, z - 0.03);
  floorPlane(g, ...mxs(-150, 7125), -1300, -150, floorMat('outdoor_tile'), z - 0.02);
  const walls = [[-150, 9350, -4350, -4200], [9200, 9350, -4350, 9100], [-300, -150, -4350, -150]].map(([a, b, c, d]) => [...mxs(a, b), c, d]);
  for (const [x0, x1, y0, y1] of walls) {
    box(g, x0, x1, y0, y1, z, z + 1.55, M.render);
    for (let k = 0; k < 4; k++) box(g, x0 + (x1 - x0 > 200 ? 0 : 20), x1 - (x1 - x0 > 200 ? 0 : 20), y0 + (y1 - y0 > 200 ? 0 : 20), y1 - (y1 - y0 > 200 ? 0 : 20), z + 1.6 + k * 0.11, z + 1.67 + k * 0.11, M.paint);
  }
}

// ---------- build both floors ----------
const floors = D.floors.map(fl => {
  H = fl.height || 3.0;
  const g = new THREE.Group(), ceil = new THREE.Group(), fg = new THREE.Group(), col = [], colF = [];
  const cuts = computeCuts(fl);
  const holes = fl.stairs.filter(s => s.u).map(s => buildUStair(g, ceil, fl, s, col));
  for (const r of fl.rooms) {
    let y1 = r.y + r.h;
    const st = fl.stairs.find(s => s.x >= r.x && s.x < r.x + r.w && s.y >= r.y && s.y < r.y + r.h);
    if (st && st.label === 'DN') y1 = st.y;
    const e = r.open ? 0 : W / 2;
    floorPlane(g, r.x - e, r.x + r.w + e, r.y - e, y1 + e, floorMat(r.floor), 0);
    if (!r.open && !r.noceiling) {
      let parts = [[r.x, r.x + r.w, r.y, r.y + r.h]];
      for (const [hx0, hx1, hy0, hy1] of holes) parts = parts.flatMap(([x0, x1, a, b]) => {
        if (hx1 <= x0 || hx0 >= x1 || hy1 <= a || hy0 >= b) return [[x0, x1, a, b]];
        return [[x0, x1, a, Math.max(a, hy0)], [x0, x1, Math.min(b, hy1), b], [x0, Math.max(x0, hx0), Math.max(a, hy0), Math.min(b, hy1)], [Math.min(x1, hx1), x1, Math.max(a, hy0), Math.min(b, hy1)]]
          .filter(([p, q, m, n]) => q - p > 1 && n - m > 1);
      });
      for (const [x0, x1, a, b] of parts) {
        const c = new THREE.Mesh(new THREE.PlaneGeometry((x1 - x0) * MM, (b - a) * MM), M.ceiling);
        c.rotation.x = Math.PI / 2; c.position.set((x0 + x1) / 2 * MM, H, (a + b) / 2 * MM);
        ceil.add(c);
      }
    }
    roomTrim(g, ceil, fl, r, cuts);
  }
  garden(g, fl.id === 'GF' ? 0 : -LEVEL);
  buildWalls(g, fl, cuts, col);
  for (const s of fl.stairs) if (!s.u) buildStairs(g, fl, s, col);
  for (const f of fl.fixed) buildFixed(g, fl, f, col);
  for (const it of fl.furniture) buildItem(fg, fl, it, colF);
  curtains(fg, fl);
  g.add(ceil, fg);
  scene.add(g);
  const xs = fl.rooms.flatMap(r => [r.x, r.x + r.w]), ys = fl.rooms.filter(r => !r.open).flatMap(r => [r.y, r.y + r.h]);
  const center = new THREE.Vector3((Math.min(...xs) + Math.max(...xs)) / 2 * MM, 0, (Math.min(...ys) + Math.max(...ys)) / 2 * MM);
  return { fl, g, ceil, fg, col, colF, center };
});

// ---------- UI state ----------
let cur = 0, mode = 'walk', yaw = 0, pitch = -0.05;
const pos = new THREE.Vector3();
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true; orbit.maxPolarAngle = Math.PI * 0.47; orbit.minDistance = 3; orbit.maxDistance = 40;
orbit.enabled = false;

const $ = id => document.getElementById(id);
if (touch) document.body.classList.add('touch');

function setFloor(i) {
  cur = i;
  floors.forEach((f, k) => f.g.visible = k === i);
  $('fGF').setAttribute('aria-pressed', i === 0); $('fFF').setAttribute('aria-pressed', i === 1);
  const c = floors[i].center;
  sun.position.set(c.x + 9, 13, c.z - 7); sun.target.position.copy(c);
  orbit.target.copy(c);
}
function setMode(m) {
  mode = m;
  document.body.classList.toggle('walk', m === 'walk');
  $('mWalk').setAttribute('aria-pressed', m === 'walk'); $('mDoll').setAttribute('aria-pressed', m === 'doll');
  floors.forEach(f => f.ceil.visible = m === 'walk');
  orbit.enabled = m === 'doll';
  if (m === 'doll') {
    const c = floors[cur].center;
    camera.position.set(c.x + 7, 13, c.z + 12); orbit.target.copy(c); orbit.update();
  } else applyWalkCam();
  $('help').textContent = m === 'walk'
    ? (touch ? 'Drag to look around. Use the arrows to walk.' : 'Drag to look around. Walk with W A S D or the arrow keys, hold Shift to go faster.')
    : 'Drag to orbit, scroll or pinch to zoom, right-drag to pan. Pick a room to walk into it.';
}
function applyWalkCam() {
  camera.position.set(pos.x, EYE, pos.z);
  camera.rotation.set(pitch, yaw, 0);
}
function goTo(fi, x, y, lookX, lookY) {
  setFloor(fi);
  pos.set(x * MM, 0, y * MM);
  if (lookX !== undefined) yaw = Math.atan2(-(lookX - x), -(lookY - y));
  pitch = -0.05;
  setMode('walk');
}

// stand just inside the room's first doorway, or at its label point
function entryPoint(fl, r) {
  const gaps = [
    ...fl.doors.map(d => d.wall === 'h' ? [d.at[0] + d.dir * d.len / 2, d.at[1], 'h'] : [d.at[0], d.at[1] + d.dir * d.len / 2, 'v']),
    ...fl.openings.map(o => [o.x + o.w / 2, o.y + o.h / 2, o.w >= o.h ? 'h' : 'v']),
  ];
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  for (const [mx, my, axis] of gaps) {
    if (mx < r.x - W || mx > r.x + r.w + W || my < r.y - W || my > r.y + r.h + W) continue;
    const onEdge = axis === 'h' ? (Math.abs(my - r.y) <= W || Math.abs(my - r.y - r.h) <= W) && mx > r.x && mx < r.x + r.w
                                : (Math.abs(mx - r.x) <= W || Math.abs(mx - r.x - r.w) <= W) && my > r.y && my < r.y + r.h;
    if (!onEdge) continue;
    const step = Math.min(550, (axis === 'h' ? r.h : r.w) / 3);
    return axis === 'h' ? [mx, my + Math.sign(cy - my) * step] : [mx + Math.sign(cx - mx) * step, my];
  }
  return [r.lx ?? cx, r.ly ?? cy];
}

// room list
const sel = $('goto');
sel.innerHTML = '<option value="">Go to room…</option>';
floors.forEach((f, fi) => {
  const og = document.createElement('optgroup'); og.label = f.fl.name;
  f.fl.rooms.forEach((r, ri) => {
    if (!r.name || (r.lx ?? 0) < 0) return;
    const o = document.createElement('option'); o.value = fi + ':' + ri; o.textContent = r.name; og.appendChild(o);
  });
  sel.appendChild(og);
});
sel.onchange = () => {
  if (!sel.value) return;
  const [fi, ri] = sel.value.split(':').map(Number), r = floors[fi].fl.rooms[ri];
  const [x, y] = entryPoint(floors[fi].fl, r);
  goTo(fi, x, y, r.x + r.w / 2, r.y + r.h / 2);
  sel.value = ''; sel.blur();
};
$('mWalk').onclick = () => setMode('walk');
$('mDoll').onclick = () => setMode('doll');
$('fGF').onclick = () => { if (mode === 'walk') goTo(0, mx(2300), 7600, mx(2300), 3000); else { setFloor(0); setMode('doll'); } };
$('fFF').onclick = () => { if (mode === 'walk') goTo(1, mx(2300), 6300, mx(5000), 6300); else { setFloor(1); setMode('doll'); } };
const furn = $('tFurn');
if (furn) furn.onclick = () => {
  const on = furn.getAttribute('aria-pressed') !== 'true';
  furn.setAttribute('aria-pressed', on);
  floors.forEach(f => f.fg.visible = on);
};

// look controls
let drag = null;
renderer.domElement.addEventListener('pointerdown', e => { if (mode === 'walk') { drag = { x: e.clientX, y: e.clientY }; renderer.domElement.setPointerCapture(e.pointerId); } });
renderer.domElement.addEventListener('pointermove', e => {
  if (!drag || mode !== 'walk') return;
  yaw += (e.clientX - drag.x) * 0.004; pitch += (e.clientY - drag.y) * 0.004;
  pitch = Math.max(-1.2, Math.min(1.2, pitch));
  drag = { x: e.clientX, y: e.clientY };
});
addEventListener('pointerup', () => drag = null);

// movement
const keys = new Set();
addEventListener('keydown', e => { if (e.target.tagName !== 'SELECT') keys.add(e.key.toLowerCase()); });
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());
document.querySelectorAll('.pad button').forEach(b => {
  const k = 'pad-' + b.dataset.k;
  b.addEventListener('pointerdown', e => { e.preventDefault(); keys.add(k); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => keys.delete(k));
});
function hits(x, z) {
  const f = floors[cur];
  for (const list of f.fg.visible ? [f.col, f.colF] : [f.col])
    for (const [a, b, c, d] of list) {
      const nx = Math.max(a, Math.min(x, c)), nz = Math.max(b, Math.min(z, d));
      if ((x - nx) ** 2 + (z - nz) ** 2 < RADIUS * RADIUS) return true;
    }
  return false;
}
function move(dt) {
  let f = 0, s = 0;
  if (keys.has('w') || keys.has('arrowup') || keys.has('pad-f')) f += 1;
  if (keys.has('s') || keys.has('arrowdown') || keys.has('pad-b')) f -= 1;
  if (keys.has('d') || keys.has('arrowright') || keys.has('pad-r')) s += 1;
  if (keys.has('a') || keys.has('arrowleft') || keys.has('pad-l')) s -= 1;
  if (!f && !s) return;
  const sp = (keys.has('shift') ? 3 : 1.5) * dt;
  const dx = (-Math.sin(yaw) * f + Math.cos(yaw) * s) * sp, dz = (-Math.cos(yaw) * f - Math.sin(yaw) * s) * sp;
  const stuck = hits(pos.x, pos.z);
  if (stuck || !hits(pos.x + dx, pos.z + dz)) { pos.x += dx; pos.z += dz; }
  else if (!hits(pos.x + dx, pos.z)) pos.x += dx;
  else if (!hits(pos.x, pos.z + dz)) pos.z += dz;
}

let lastRoom = '';
function updateWhere() {
  const fl = floors[cur].fl;
  let label = 'Dollhouse';
  if (mode === 'walk') {
    const r = roomAt(fl, pos.x / MM, pos.z / MM);
    label = r && r.name ? r.name : (fl.labels.find(l => Math.abs(l.x - pos.x / MM) < 800 && Math.abs(l.y - pos.z / MM) < 1200)?.text || fl.name);
  }
  const key = label + '|' + fl.name;
  if (key !== lastRoom) { lastRoom = key; $('where').innerHTML = `${label}<small>${fl.name}</small>`; }
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// start at the front door, looking into the house
goTo(0, mx(3300), 10300, mx(3300), 3000);
sel.dataset.ready = '1';
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (mode === 'walk') { move(dt); applyWalkCam(); } else orbit.update();
  updateWhere();
  renderer.render(scene, camera);
});
window.__tour = { goTo, setMode };
window.__tourReady = true;
