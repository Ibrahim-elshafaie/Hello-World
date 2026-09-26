// 3D tour viewer. Bundled into tour_bundle.js with: npm install && npm run bundle
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const D = window.DESIGN;
const MM = 0.001;
const WALL_H = 2.8, DOOR_H = 2.1, OPEN_H = 2.4, WIN_SILL = 0.9, WIN_TOP = 2.4, EYE = 1.6, RADIUS = 0.22;
const W = D.wall;

// ---------- materials ----------
const mats = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...opts }));
  return mats.get(key);
}
const GLASS = new THREE.MeshStandardMaterial({ color: 0xa9c8dc, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.1, depthWrite: false });
const C = {
  wall: '#f3efe8', ceiling: '#fbfaf7', porcelain: '#e6e0d5', oakFloor: '#caa57a', tile: '#d9d6cf',
  outdoor: '#bdb4a6', parking: '#a39d94', black: '#2a2a2a', white: '#f7f7f5', steel: '#c9cdd0',
  stone: '#e4dfd5', cabinet: '#ece7de', door: '#d9c3a0', linen: '#f1ece2', grass: '#b8c39c',
};
const KEYWORDS = [['beige', '#d8cab2'], ['olive', '#7a7f4f'], ['sand', '#cdbc9f'], ['greige', '#b8ad9e'], ['cream', '#ece3d0'],
  ['oatmeal', '#ddd2bd'], ['off-white', '#eeeae3'], ['oak', '#c29a6b'], ['travertine', '#d8ccb4'],
  ['aluminium', '#9da3a6'], ['black', '#2a2a2a']];
const CAT_DEFAULT = { seating: '#b9ab96', table: '#b08a5e', storage: '#c9a77c', bed: '#b8ad9e', soft: '#e6dccb', decor: '#6f8a55', appliance: '#c9cdd0' };
function colorFor(it) {
  const s = ((it.spec || '') + ' ' + it.name).toLowerCase();
  for (const [k, c] of KEYWORDS) if (s.includes(k)) return c;
  return CAT_DEFAULT[it.cat] || '#bbb';
}

// ---------- scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#e9e4dc');
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 200);
camera.rotation.order = 'YXZ';
scene.add(new THREE.HemisphereLight('#ffffff', '#b9ae9c', 1.6));
const sun = new THREE.DirectionalLight('#fff4e5', 1.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 60 });
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);

// ---------- geometry helpers (plan mm -> world m; plan y -> world z) ----------
function box(g, x0, x1, y0, y1, z0, z1, material, { shadow = true, collide = null } = {}) {
  const w = Math.abs(x1 - x0) * MM, d = Math.abs(y1 - y0) * MM, h = z1 - z0;
  if (w <= 0 || d <= 0 || h <= 0) return null;
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof material === 'string' ? mat(material) : material);
  m.position.set((x0 + x1) / 2 * MM, (z0 + z1) / 2, (y0 + y1) / 2 * MM);
  m.castShadow = shadow; m.receiveShadow = true;
  g.add(m);
  if (collide) collide.push([Math.min(x0, x1) * MM, Math.min(y0, y1) * MM, Math.max(x0, x1) * MM, Math.max(y0, y1) * MM]);
  return m;
}
function cyl(g, cx, cy, r, z0, z1, color, top = r) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(top * MM, r * MM, z1 - z0, 28), mat(color));
  m.position.set(cx * MM, (z0 + z1) / 2, cy * MM);
  m.castShadow = true; m.receiveShadow = true;
  g.add(m);
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
function inset(r, a) { return { x: r.x + a, y: r.y + a, w: r.w - 2 * a, h: r.h - 2 * a }; }
function legs(g, r, z1, size, color) {
  for (const [lx, ly] of [[r.x, r.y], [r.x + r.w - size, r.y], [r.x, r.y + r.h - size], [r.x + r.w - size, r.y + r.h - size]])
    box(g, lx, lx + size, ly, ly + size, 0, z1, color);
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

// ---------- item builders ----------
function buildItem(g, fl, it, col) {
  const n = it.name.toLowerCase();
  const color = colorFor(it);
  const back = it.back || nearestSide(fl, it);
  const R = { x: it.x, y: it.y, w: it.w, h: it.h };
  const c = [];
  const round = it.shape === 'circle';
  const cx = it.x + it.w / 2, cy = it.y + it.h / 2, rad = Math.min(it.w, it.h) / 2;

  if (n.includes('rug')) { box(g, R.x, R.x + R.w, R.y, R.y + R.h, 0, 0.012, color, { shadow: false }); return; }
  if (n.includes('plant') || n.includes('planter')) {
    cyl(g, cx, cy, rad * 0.62, 0, 0.45, '#b4714f', rad * 0.75);
    const f = new THREE.Mesh(new THREE.IcosahedronGeometry(rad * 1.15 * MM, 1), mat('#5f7d45', { flatShading: true }));
    f.position.set(cx * MM, n.includes('planter') ? 0.85 : 1.25, cy * MM); f.castShadow = true; g.add(f);
    col.push([it.x * MM, it.y * MM, (it.x + it.w) * MM, (it.y + it.h) * MM]); return;
  }
  if (n.includes('lamp')) {
    cyl(g, cx, cy, rad * 0.7, 0, 0.03, C.black); cyl(g, cx, cy, 12, 0.03, 1.45, C.black);
    const s = cyl(g, cx, cy, rad * 0.95, 1.4, 1.75, C.linen, rad * 0.75);
    s.material = mat(C.linen, { emissive: '#f6e3bd', emissiveIntensity: 0.6 });
    const l = new THREE.PointLight('#ffe2b0', 0.8, 5); l.position.set(cx * MM, 1.55, cy * MM); g.add(l);
    return;
  }
  if (n.includes('fridge')) { box(g, R.x, R.x + R.w, R.y, R.y + R.h, 0, 1.85, C.steel, { collide: col }); return; }
  if (n.includes('bed')) {
    box(g, R.x, R.x + R.w, R.y, R.y + R.h, 0.08, 0.35, color, { collide: col });
    const m = inset(R, 25);
    box(g, m.x, m.x + m.w, m.y, m.y + m.h, 0.35, 0.56, C.white);
    const hb = strip(R, back, 80); box(g, ...hb, 0.08, n.includes('single') ? 0.9 : 1.2, color);
    // duvet on the foot half
    const foot = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }[back];
    const along = back === 'top' || back === 'bottom' ? R.h : R.w;
    const dv = strip(inset(R, 15), foot, along * 0.62); box(g, ...dv, 0.56, 0.6, color);
    const across = back === 'top' || back === 'bottom' ? R.w : R.h;
    const count = across > 1300 ? 2 : 1, pw = Math.min(650, across / count - 80);
    for (let i = 0; i < count; i++) {
      const off = (across / count) * (i + 0.5) - pw / 2;
      const p0 = strip(R, back, 450);
      const a = back === 'top' || back === 'left' ? 110 : 20, b = back === 'top' || back === 'left' ? 20 : 110;
      if (back === 'top' || back === 'bottom') box(g, R.x + off, R.x + off + pw, p0[2] + a, p0[3] - b, 0.56, 0.68, C.linen);
      else box(g, p0[0] + a, p0[1] - b, R.y + off, R.y + off + pw, 0.56, 0.68, C.linen);
    }
    return;
  }
  if (n.includes('dining chair') || n.includes('desk chair')) {
    const frame = n.includes('dining') ? C.black : '#3a3a3a';
    const s = inset(R, 40);
    legs(g, s, 0.44, 30, frame);
    box(g, s.x, s.x + s.w, s.y, s.y + s.h, 0.44, 0.5, n.includes('dining') ? '#b9ab96' : '#5b5f63', { collide: col });
    box(g, ...strip(s, back, 45), 0.5, 0.9, n.includes('dining') ? '#b9ab96' : '#5b5f63');
    return;
  }
  if (n.includes('bench')) {
    legs(g, inset(R, 30), 0.38, 40, C.black);
    box(g, R.x, R.x + R.w, R.y, R.y + R.h, 0.38, 0.46, color, { collide: col }); return;
  }
  if (it.cat === 'seating') { // sofa, armchair, lounge and outdoor chairs
    const outdoor = n.includes('outdoor');
    legs(g, inset(R, 40), 0.1, 40, outdoor ? '#6b7073' : C.black);
    const seat = outdoor ? '#e8e1d4' : color;
    box(g, R.x, R.x + R.w, R.y, R.y + R.h, 0.1, 0.43, seat, { collide: col });
    const depth = Math.min(it.w, it.h);
    const top = it.height || 0.85, arm = Math.min(0.62, top - 0.04);
    box(g, ...strip(R, back, Math.min(220, depth * 0.25)), 0.43, top, seat);
    for (const s of SIDES_PERP[back]) box(g, ...strip(R, s, outdoor ? 60 : 150), 0.43, arm, outdoor ? '#9da3a6' : seat);
    for (const e of it.extra || []) { // chaise or corner module of a sectional
      legs(g, inset(e, 40), 0.1, 40, C.black);
      box(g, e.x, e.x + e.w, e.y, e.y + e.h, 0.1, 0.43, seat, { collide: col });
      if (e.arm) box(g, ...strip(e, e.arm, 150), 0.43, arm, seat);
    }
    return;
  }
  if (it.cat === 'table') {
    const h = n.includes('coffee') ? 0.4 : n.includes('side') ? 0.5 : 0.75;
    const top = n.includes('desk') || n.includes('dining') ? '#c29a6b' : color;
    const legC = (it.spec || '').toLowerCase().includes('black') || n.includes('dining') ? C.black : '#8b6b4a';
    if (round) { cyl(g, cx, cy, rad, h - 0.04, h, top); cyl(g, cx, cy, 30, 0, h - 0.04, legC); }
    else if (n.includes('coffee')) { box(g, R.x + 60, R.x + R.w - 60, R.y + 60, R.y + R.h - 60, 0, h - 0.04, top); box(g, R.x, R.x + R.w, R.y, R.y + R.h, h - 0.04, h, top); }
    else { legs(g, inset(R, 30), h - 0.04, 50, legC); box(g, R.x, R.x + R.w, R.y, R.y + R.h, h - 0.04, h, top); }
    col.push([it.x * MM, it.y * MM, (it.x + it.w) * MM, (it.y + it.h) * MM]);
    return;
  }
  if (it.cat === 'storage') {
    let z0 = 0, z1 = 0.8;
    if (n.includes('wardrobe')) z1 = 2.4;
    else if (n.includes('shoe')) z1 = 1.8;
    else if (n.includes('nightstand')) z1 = 0.55;
    else if (n.includes('tv unit')) { z0 = 0.3; z1 = 0.7; }
    if (it.height) z1 = it.height;
    box(g, R.x, R.x + R.w, R.y, R.y + R.h, z0, z1, color, { collide: col });
    if (n.includes('wardrobe') || n.includes('sideboard') || n.includes('shoe')) { // door seams on the front face
      const front = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }[back];
      const len = front === 'top' || front === 'bottom' ? R.w : R.h;
      const doors = Math.max(2, Math.round(len / 500));
      for (let i = 1; i < doors; i++) {
        const s = strip(R, front, 6);
        const t = (len / doors) * i;
        if (front === 'top' || front === 'bottom') box(g, R.x + t - 4, R.x + t + 4, s[2] - (front === 'bottom' ? 0 : 6), s[3] + (front === 'bottom' ? 6 : 0), z0 + 0.05, z1 - 0.05, '#7d6448', { shadow: false });
        else box(g, s[0] - (front === 'right' ? 0 : 6), s[1] + (front === 'right' ? 6 : 0), R.y + t - 4, R.y + t + 4, z0 + 0.05, z1 - 0.05, '#7d6448', { shadow: false });
      }
    }
    if (n.includes('tv')) { // TV on the wall behind
      const s = strip(R, back, 40), len = back === 'top' || back === 'bottom' ? R.w : R.h, tv = Math.min(1400, len - 100);
      const tz = z1 < 0.7 ? z1 + 0.15 : 1.05;
      if (back === 'left' || back === 'right') box(g, s[0], s[1], cy - tv / 2, cy + tv / 2, tz, tz + tv * 0.5625 * MM, C.black);
      else box(g, cx - tv / 2, cx + tv / 2, s[2], s[3], tz, tz + tv * 0.5625 * MM, C.black);
    }
    if (n.includes('mirror')) {
      const s = strip(R, back, 20);
      const mm = new THREE.Mesh(new THREE.CircleGeometry(0.4, 40), mat('#dfe6ea', { metalness: 0.9, roughness: 0.1 }));
      mm.position.set((s[0] + s[1]) / 2 * MM, 1.55, (s[2] + s[3]) / 2 * MM);
      mm.rotation.y = { left: Math.PI / 2, right: -Math.PI / 2, top: 0, bottom: Math.PI }[back];
      g.add(mm);
    }
    return;
  }
  box(g, R.x, R.x + R.w, R.y, R.y + R.h, 0, 0.8, color, { collide: col });
}

function buildFixed(g, fl, f, col) {
  const n = f.name.toLowerCase();
  const back = nearestSide(fl, f);
  const R = { x: f.x, y: f.y, w: f.w, h: f.h };
  if (n === 'car') {
    const paint = f.x < 7000 ? '#8e9499' : '#3d4449';
    box(g, R.x + 50, R.x + R.w - 50, R.y, R.y + R.h, 0.3, 0.85, paint, { collide: col });
    box(g, R.x + 180, R.x + R.w - 180, R.y + R.h * 0.25, R.y + R.h * 0.72, 0.85, 1.4, '#2d3338');
    for (const [wx, wy] of [[R.x + 20, R.y + 750], [R.x + R.w - 20, R.y + 750], [R.x + 20, R.y + R.h - 750], [R.x + R.w - 20, R.y + R.h - 750]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.22, 20), mat('#1c1c1c'));
      w.rotation.z = Math.PI / 2; w.position.set(wx * MM, 0.33, wy * MM); g.add(w);
    }
    return;
  }
  if (n === 'wc') {
    const tank = strip(R, back, 180);
    box(g, ...tank, 0, 0.8, C.white, { collide: col });
    box(g, R.x + 30, R.x + R.w - 30, R.y + 30, R.y + R.h - 30, 0, 0.42, C.white, { collide: col });
    return;
  }
  if (n === 'basin') {
    box(g, R.x, R.x + R.w, R.y, R.y + R.h, 0.15, 0.82, '#c29a6b', { collide: col });
    box(g, R.x, R.x + R.w, R.y, R.y + R.h, 0.82, 0.88, C.white);
    const s = strip(R, back, 30);
    const len = back === 'top' || back === 'bottom' ? R.w : R.h;
    if (back === 'left' || back === 'right') box(g, s[0], s[1], R.y + 40, R.y + R.h - 40, 1.1, 1.8, mat('#dfe6ea', { metalness: 0.9, roughness: 0.1 }), { shadow: false });
    else box(g, R.x + 40, R.x + R.w - 40, s[2], s[3], 1.1, 1.8, mat('#dfe6ea', { metalness: 0.9, roughness: 0.1 }), { shadow: false });
    return;
  }
  if (n === 'tub') {
    box(g, R.x, R.x + R.w, R.y, R.y + R.h, 0, 0.55, C.white, { collide: col });
    box(g, R.x + 70, R.x + R.w - 70, R.y + 70, R.y + R.h - 70, 0.5, 0.551, '#cfe0e8', { shadow: false });
    return;
  }
  if (n === 'shower') {
    box(g, R.x, R.x + R.w, R.y, R.y + R.h, 0, 0.05, '#e8e6e1', { collide: col });
    box(g, R.x, R.x + R.w, R.y, R.y + R.h, 0.05, 2.0, GLASS, { shadow: false });
    return;
  }
  if (n === 'shaft') { box(g, R.x, R.x + R.w, R.y, R.y + R.h, 0, WALL_H, C.wall, { collide: col }); return; }
  if (n.startsWith('counter')) {
    box(g, R.x, R.x + R.w, R.y, R.y + R.h, 0.1, 0.86, C.cabinet, { collide: col });
    box(g, R.x, R.x + R.w, R.y, R.y + R.h, 0, 0.1, '#8d8478', { shadow: false });
    box(g, R.x, R.x + R.w, R.y, R.y + R.h, 0.86, 0.9, C.stone);
    const cx = R.x + R.w / 2, cy = R.y + R.h / 2;
    if (n.includes('hob')) {
      box(g, cx - 260, cx + 260, cy - 300, cy + 300, 0.9, 0.905, C.black, { shadow: false });
      const s = strip(R, back, 500);
      box(g, s[0], s[1], cy - 450, cy + 450, 1.65, 2.2, C.steel); // hood
    }
    if (n.includes('sink')) box(g, cx - 220, cx + 220, R.y + 1300, R.y + 2100, 0.9, 0.905, C.steel, { shadow: false });
    if (!n.includes('sink') && !n.includes('hob')) {
      const s = strip(R, back, 350);
      box(g, ...s, 1.5, 2.25, C.cabinet);
    }
    return;
  }
  box(g, R.x, R.x + R.w, R.y, R.y + R.h, 0, 0.8, '#ddd');
}

// ---------- walls with door, opening and window cuts ----------
function buildWalls(g, fl, col) {
  const segs = [], seen = new Set();
  for (const r of fl.rooms) {
    if (r.open) continue;
    for (const s of [
      ['h', r.x - W, r.x + r.w + W, r.y - W, r.y], ['h', r.x - W, r.x + r.w + W, r.y + r.h, r.y + r.h + W],
      ['v', r.y, r.y + r.h, r.x - W, r.x], ['v', r.y, r.y + r.h, r.x + r.w, r.x + r.w + W]]) {
      const k = s.join(); if (!seen.has(k)) { seen.add(k); segs.push(s); }
    }
  }
  const cuts = [];
  for (const d of fl.doors) {
    const [hx, hy] = d.at, e = d.wall === 'h' ? hx + d.dir * d.len : hy + d.dir * d.len;
    const a = d.wall === 'h' ? hx : hy;
    cuts.push({ axis: d.wall, c: d.wall === 'h' ? hy : hx, a0: Math.min(a, e), a1: Math.max(a, e), bottom: 0, top: DOOR_H });
  }
  for (const o of fl.openings) {
    if (o.w >= o.h) cuts.push({ axis: 'h', c: o.y + o.h / 2, a0: o.x, a1: o.x + o.w, bottom: 0, top: OPEN_H });
    else cuts.push({ axis: 'v', c: o.x + o.w / 2, a0: o.y, a1: o.y + o.h, bottom: 0, top: OPEN_H });
  }
  for (const w of fl.windows) {
    const h = w.y1 === w.y2;
    cuts.push({ axis: h ? 'h' : 'v', c: h ? w.y1 : w.x1, a0: Math.min(h ? w.x1 : w.y1, h ? w.x2 : w.y2),
      a1: Math.max(h ? w.x1 : w.y1, h ? w.x2 : w.y2), bottom: (w.sill ?? WIN_SILL * 1000) * MM, top: (w.top ?? WIN_TOP * 1000) * MM, glass: true });
  }
  const wm = mat(C.wall);
  const piece = (axis, a0, a1, b0, b1, z0, z1, m = wm, collide = true) => axis === 'h'
    ? box(g, a0, a1, b0, b1, z0, z1, m, { collide: collide && z0 < 0.5 ? col : null })
    : box(g, b0, b1, a0, a1, z0, z1, m, { collide: collide && z0 < 0.5 ? col : null });
  for (const [axis, a0, a1, b0, b1] of segs) {
    const mine = cuts.filter(c => c.axis === axis && c.c > b0 && c.c < b1 && c.a1 > a0 && c.a0 < a1).sort((p, q) => p.a0 - q.a0);
    let pos = a0;
    for (const c of mine) {
      const c0 = Math.max(c.a0, a0), c1 = Math.min(c.a1, a1);
      if (c0 > pos) piece(axis, pos, c0, b0, b1, 0, WALL_H);
      if (c.bottom > 0) piece(axis, c0, c1, b0, b1, 0, c.bottom);
      piece(axis, c0, c1, b0, b1, c.top, WALL_H);
      if (c.glass) { const m = (b0 + b1) / 2; piece(axis, c0, c1, m - 6, m + 6, c.bottom, c.top, GLASS, true); }
      else piece(axis, c0, c1, b0, b1, -0.02, 0.0, mat(C.porcelain), false); // threshold
      pos = Math.max(pos, c1);
    }
    if (pos < a1) piece(axis, pos, a1, b0, b1, 0, WALL_H);
  }
  // open door leaves
  for (const d of fl.doors) {
    const [hx, hy] = d.at, n = d.len - 20;
    if (d.wall === 'h') box(g, hx, hx + d.dir * 40, hy, hy + d.swing * n, 0, 2.05, C.door, { collide: col });
    else box(g, hx, hx + d.swing * n, hy, hy + d.dir * 40, 0, 2.05, C.door, { collide: col });
  }
}

function floorColor(r, fl) {
  const n = r.name.toLowerCase();
  if (n.includes('bath') || n === 'pr') return C.tile;
  if (n.includes('balcony')) return C.outdoor;
  if (n.includes('parking')) return C.parking;
  if (n.includes('bed') || n.includes('closet') || (fl.id === 'FF' && (n.includes('lobby') || n.includes('entry') || n === ''))) return C.oakFloor;
  return C.porcelain;
}

function buildStairs(g, fl, s, col) {
  const step = s.h / s.treads;
  const rise = 3.2 / 18;
  for (let i = 0; i < s.treads; i++) {
    if (s.label === 'UP') { // rises toward the top of the plan
      const y1 = s.y + s.h - i * step;
      box(g, s.x, s.x + s.w, y1 - step, y1, 0, (i + 1) * rise, '#d8c3a0');
    } else { // goes down from the landing
      const y0 = s.y + i * step;
      box(g, s.x, s.x + s.w, y0, y0 + step, -3.2, -(i + 1) * rise, '#d8c3a0');
    }
  }
  col.push([s.x * MM, s.y * MM, (s.x + s.w) * MM, (s.y + s.h) * MM]);
  // handrail on the open side
  box(g, s.x + s.w - 30, s.x + s.w, s.y, s.y + s.h, s.label === 'UP' ? 0 : 0, 0.95, mat('#ffffff', { transparent: true, opacity: 0.35, depthWrite: false }), { shadow: false });
}

// ---------- build both floors ----------
const floors = D.floors.map(fl => {
  const g = new THREE.Group(), ceil = new THREE.Group(), col = [];
  for (const r of fl.rooms) {
    let y0 = r.y, y1 = r.y + r.h;
    const st = fl.stairs.find(s => s.x >= r.x && s.x < r.x + r.w && s.y >= r.y && s.y < r.y + r.h);
    if (st && st.label === 'DN') y1 = st.y;
    box(g, r.x - (r.open ? 0 : W / 2), r.x + r.w + (r.open ? 0 : W / 2), y0 - (r.open ? 0 : W / 2), y1 + (r.open ? 0 : W / 2), -0.03, 0, floorColor(r, fl), { shadow: false });
    if (!r.open && !r.name.toLowerCase().includes('balcony')) {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(r.w * MM, r.h * MM), mat(C.ceiling, { emissive: C.ceiling, emissiveIntensity: 0.45 }));
      c.rotation.x = Math.PI / 2; c.position.set((r.x + r.w / 2) * MM, WALL_H, (r.y + r.h / 2) * MM);
      ceil.add(c);
    }
  }
  if (fl.id === 'GF') {
    const gr = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), mat(C.grass));
    gr.rotation.x = -Math.PI / 2; gr.position.set(4, -0.04, 8); gr.receiveShadow = true; g.add(gr);
  }
  buildWalls(g, fl, col);
  for (const s of fl.stairs) buildStairs(g, fl, s, col);
  for (const f of fl.fixed) buildFixed(g, fl, f, col);
  for (const it of fl.furniture) buildItem(g, fl, it, col);
  g.add(ceil);
  scene.add(g);
  const xs = fl.rooms.flatMap(r => [r.x, r.x + r.w]), ys = fl.rooms.filter(r => !r.open).flatMap(r => [r.y, r.y + r.h]);
  const center = new THREE.Vector3((Math.min(...xs) + Math.max(...xs)) / 2 * MM, 0, (Math.min(...ys) + Math.max(...ys)) / 2 * MM);
  return { fl, g, ceil, col, center };
});

// ---------- UI state ----------
let cur = 0, mode = 'walk', yaw = 0, pitch = -0.05;
const pos = new THREE.Vector3();
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true; orbit.maxPolarAngle = Math.PI * 0.47; orbit.minDistance = 3; orbit.maxDistance = 40;
orbit.enabled = false;

const $ = id => document.getElementById(id);
const touch = matchMedia('(pointer: coarse)').matches;
if (touch) document.body.classList.add('touch');

function setFloor(i) {
  cur = i;
  floors.forEach((f, k) => f.g.visible = k === i);
  $('fGF').setAttribute('aria-pressed', i === 0); $('fFF').setAttribute('aria-pressed', i === 1);
  const c = floors[i].center;
  sun.position.set(c.x + 6, 14, c.z - 8); sun.target.position.copy(c);
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
$('fGF').onclick = () => { if (mode === 'walk') goTo(0, 2300, 7600, 2300, 3000); else { setFloor(0); setMode('doll'); } };
$('fFF').onclick = () => { if (mode === 'walk') goTo(1, 2300, 6300, 5000, 6300); else { setFloor(1); setMode('doll'); } };

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
  for (const [a, b, c, d] of floors[cur].col) {
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
goTo(0, 3300, 10300, 3300, 3000);
sel.dataset.ready = '1';
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (mode === 'walk') { move(dt); applyWalkCam(); } else orbit.update();
  updateWhere();
  renderer.render(scene, camera);
});
window.__tourReady = true;
