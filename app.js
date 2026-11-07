/* 島與群平台原型。沒有後端：所有動作只存在這個分頁，重新整理就回到初始狀態。 */
(() => {
'use strict';
document.documentElement.lang = 'zh-Hant-TW';
/* 紀錄是虛構的，卻標在真實村里上，所以不讓搜尋引擎收錄。 */
document.head.append(Object.assign(document.createElement('meta'), { name: 'robots', content: 'noindex' }));

const G = window.MIAOLI, C = window.CONTENT;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtMonth = m => m === 'all' ? '2026 年 5 月至今' : `${m.slice(0, 4)} 年 ${+m.slice(5)} 月`;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ───────── 幾何 ───────── */
const KX = Math.cos(G.origin[1] * Math.PI / 180) * 111320, KY = 110574;
const toLonLat = (x, y) => [+(G.origin[0] + x * G.unit / KX).toFixed(5), +(G.origin[1] - y * G.unit / KY).toFixed(5)];
const ringPath = (r, close = true) => {
  let d = `M${r[0]} ${r[1]}`;
  for (let i = 2; i < r.length; i += 2) d += `L${r[i]} ${r[i + 1]}`;
  return close ? d + 'Z' : d;
};
G.villages.forEach(v => {
  v.d = v.r.map(r => ringPath(r)).join('');
  const bb = [1e9, 1e9, -1e9, -1e9];
  v.r.forEach(r => { for (let i = 0; i < r.length; i += 2) { bb[0] = Math.min(bb[0], r[i]); bb[1] = Math.min(bb[1], r[i + 1]); bb[2] = Math.max(bb[2], r[i]); bb[3] = Math.max(bb[3], r[i + 1]); } });
  v.bb = bb;
});
const byCode = new Map(G.villages.map(v => [v.c, v]));
const TOWNS = [...G.towns].sort((a, b) => a.n.localeCompare(b.n, 'zh-Hant'));
const townBB = name => G.villages.filter(v => v.t === name).reduce((b, v) => [Math.min(b[0], v.bb[0]), Math.min(b[1], v.bb[1]), Math.max(b[2], v.bb[2]), Math.max(b[3], v.bb[3])], [1e9, 1e9, -1e9, -1e9]);
const inRing = (x, y, r) => {
  let s = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) s = !s;
  }
  return s;
};
function villageAt(x, y) {
  for (const v of G.villages) {
    const b = v.bb;
    if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
    let s = false;
    for (const r of v.r) if (inRing(x, y, r)) s = !s;
    if (s) return v;
  }
  return null;
}
const BASE = {
  neigh: G.neighbours.map(r => ringPath(r)).join(''),
  county: G.countyRings.map(r => ringPath(r)).join(''),
  vills: G.villages.map(v => `<path class="m-vill" data-v="${v.c}" d="${v.d}"/>`).join(''),
  roads: ['primary', 'trunk', 'motorway'].map(k => `<path class="m-road ${k}" d="${G.roads[k].map(l => ringPath(l, false)).join('')}"/>`).join(''),
  towns: G.townLines.map(l => ringPath(l, false)).join(''),
  edge: G.countyLines.map(l => ringPath(l, false)).join(''),
  labels: G.towns.map(t => `<text class="m-label" x="${t.x}" y="${t.y}">${t.n}</text>`).join(''),
};

/* ───────── 地圖元件 ───────── */
let mapSeq = 0;
function GeoMap(host, opt = {}) {
  const id = ++mapSeq;
  host.innerHTML = `
    <svg role="img" aria-label="${esc(opt.label || '苗栗縣地圖')}" xmlns="http://www.w3.org/2000/svg">
      <defs><pattern id="hatch${id}" width="9" height="9" patternUnits="userSpaceOnUse">
        <rect width="9" height="9" fill="var(--land)"/><line class="m-hatchline" x1="0" y1="0" x2="0" y2="9"/></pattern></defs>
      <path class="m-neigh" d="${BASE.neigh}"/>
      <path class="m-county" d="${BASE.county}"/>
      <g class="g-vill">${BASE.vills}</g>
      ${BASE.roads}
      <g class="g-over"></g>
      <path class="m-town" d="${BASE.towns}"/>
      <path class="m-edge" d="${BASE.edge}"/>
      <g class="g-raw"></g>
      <g class="g-labels">${opt.labels === false ? '' : BASE.labels}</g>
      <g class="g-pin"></g>
    </svg>
    ${opt.static ? '' : `<div class="map-zoom"><button type="button" data-z="in" aria-label="放大">＋</button><button type="button" data-z="out" aria-label="縮小">−</button><button type="button" class="fit" data-z="fit" aria-label="回到全縣">全縣</button></div>`}
    ${opt.stamp === false ? '' : '<div class="map-stamp">示例資料</div>'}`;
  host.classList.toggle('static', !!opt.static);
  host.classList.toggle('pick', !!opt.pick);
  const svg = $('svg', host), gOver = $('.g-over', svg), gRaw = $('.g-raw', svg), gPin = $('.g-pin', svg);
  const labels = $$('.m-label', svg), vEls = $$('[data-v]', svg), hatch = $('pattern', svg);
  const view = { x: 0, y: 0, w: 1, h: 1 };
  let lastBB = G.bbox, lastW = 0;
  const size = () => [host.clientWidth || 640, host.clientHeight || 400];
  function apply() {
    svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
    const k = view.w / size()[0];
    hatch.setAttribute('patternTransform', `rotate(45) scale(${k})`);
    labels.forEach(l => { l.setAttribute('font-size', 14 * k); l.setAttribute('stroke-width', 3 * k); });
    if (gPin.firstChild) gPin.firstChild.setAttribute('transform', `translate(${gPin.dataset.x} ${gPin.dataset.y}) scale(${k})`);
  }
  function fit(bb = G.bbox, pad = .05) {
    lastBB = bb;
    const [W, H] = size();
    const bw = (bb[2] - bb[0]) * (1 + 2 * pad), bh = (bb[3] - bb[1]) * (1 + 2 * pad);
    const s = Math.max(bw / W, bh / H);
    view.w = s * W; view.h = s * H;
    view.x = (bb[0] + bb[2]) / 2 - view.w / 2;
    view.y = (bb[1] + bb[3]) / 2 - view.h / 2;
    apply();
  }
  function zoom(f, cx, cy) {
    const w = clamp(view.w * f, 120, 16000), r = w / view.w;
    if (cx === undefined) { cx = view.x + view.w / 2; cy = view.y + view.h / 2; }
    view.x = cx - (cx - view.x) * r; view.y = cy - (cy - view.y) * r;
    view.w = w; view.h *= r;
    apply();
  }
  const toMap = (px, py) => {
    const r = svg.getBoundingClientRect();
    return [view.x + (px - r.left) / r.width * view.w, view.y + (py - r.top) / r.height * view.h];
  };
  if (!opt.static) {
    const ptrs = new Map();
    let moved = 0, pinch = 0;
    host.addEventListener('pointerdown', e => {
      if (e.target.closest('.map-zoom')) return;
      host.setPointerCapture?.(e.pointerId);
      ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (ptrs.size === 1) moved = 0;
    });
    host.addEventListener('pointermove', e => {
      const p = ptrs.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p[0], dy = e.clientY - p[1];
      ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (ptrs.size === 1) {
        moved += Math.abs(dx) + Math.abs(dy);
        const k = view.w / size()[0];
        view.x -= dx * k; view.y -= dy * k;
        apply();
      } else if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        moved = 99;
        if (pinch) { const [mx, my] = toMap((a[0] + b[0]) / 2, (a[1] + b[1]) / 2); zoom(pinch / d, mx, my); }
        pinch = d;
      }
    });
    const up = e => {
      if (!ptrs.delete(e.pointerId)) return;
      if (ptrs.size < 2) pinch = 0;
      if (ptrs.size === 0 && moved < 6 && e.type === 'pointerup') opt.onClick?.(...toMap(e.clientX, e.clientY));
    };
    host.addEventListener('pointerup', up);
    host.addEventListener('pointercancel', up);
    host.addEventListener('wheel', e => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoom(Math.exp(e.deltaY * .01), ...toMap(e.clientX, e.clientY));
    }, { passive: false });
    host.addEventListener('click', e => {
      const b = e.target.closest('[data-z]');
      if (!b) return;
      if (b.dataset.z === 'in') zoom(.6);
      else if (b.dataset.z === 'out') zoom(1 / .6);
      else fit(G.bbox);
    });
  }
  const ro = new ResizeObserver(() => { const w = size()[0]; if (w !== lastW) { lastW = w; fit(lastBB); } });
  ro.observe(host);
  fit(opt.bb || G.bbox);
  return {
    fit, zoom,
    over: html => { gOver.innerHTML = html; },
    raw: html => { gRaw.innerHTML = html; },
    fill(fn) {
      vEls.forEach(el => {
        const r = fn(byCode.get(el.dataset.v)) || '';
        el.setAttribute('class', 'm-vill' + (r && r !== 'hatch' ? ' ' + r : ''));
        el.style.fill = r.includes('hatch') ? `url(#hatch${id})` : '';
      });
    },
    pin(p) {
      if (!p) { gPin.innerHTML = ''; return; }
      gPin.dataset.x = p.x; gPin.dataset.y = p.y;
      gPin.innerHTML = `<g><path d="M0 0C-3-8-12-13-12-22a12 12 0 1 1 24 0C12-13 3-8 0 0Z" fill="var(--accent)" stroke="var(--paper)" stroke-width="2"/><circle cy="-22" r="4.5" fill="var(--paper)"/></g>`;
      apply();
    },
    destroy() { ro.disconnect(); },
  };
}

/* ───────── 示例資料：固定亂數種子，每個人看到的都一樣 ───────── */
function rng(seed) {
  return () => {
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function makeData() {
  const R = rng(20261107);
  const gauss = () => Math.sqrt(-2 * Math.log(R() + 1e-9)) * Math.cos(2 * Math.PI * R());
  const townW = { 銅鑼鄉: 1.7, 苗栗市: 1.6, 公館鄉: 1.5, 頭份市: 1.3, 竹南鎮: 1.3, 後龍鎮: 1.1, 通霄鎮: 1.1, 苑裡鎮: 1, 三義鄉: 1.1, 頭屋鄉: .8, 造橋鄉: .7, 西湖鄉: .6, 卓蘭鎮: .7, 大湖鄉: .6, 三灣鄉: .4, 獅潭鄉: .35, 南庄鄉: .3, 泰安鄉: .08 };
  const randomIn = v => {
    for (let i = 0; i < 60; i++) {
      const x = v.bb[0] + R() * (v.bb[2] - v.bb[0]), y = v.bb[1] + R() * (v.bb[3] - v.bb[1]);
      if (villageAt(x, y) === v) return [x, y];
    }
    return [v.x, v.y];
  };
  const home = G.villages.find(v => v.t === '銅鑼鄉' && v.v === '銅鑼村');
  const anchors = [{ x: home.x, y: home.y, v: home, w: 3 }];
  G.villages.filter(v => R() < (v.t === '銅鑼鄉' ? .95 : .6)).forEach(v => {
    const n = 1 + Math.floor(R() * 3), w = townW[v.t] / Math.sqrt(v.a + .4);
    for (let i = 0; i < n; i++) { const [x, y] = randomIn(v); anchors.push({ x, y, v, w: w / n }); }
  });
  const totalW = anchors.reduce((s, a) => s + a.w, 0);
  const pick = () => { let t = R() * totalW; for (const a of anchors) { t -= a.w; if (t <= 0) return a; } return anchors[0]; };
  const mw = [.1, .12, .15, .18, .2, .25];
  const month = () => { let t = R(); for (let i = 0; i < 6; i++) { t -= mw[i]; if (t <= 0) return C.MONTHS[i]; } return C.MONTHS[5]; };
  const records = [];
  for (let i = 0; i < 460; i++) {
    const a = pick(), x = a.x + gauss() * 28, y = a.y + gauss() * 28, v = villageAt(x, y) || a.v, q = R();
    records.push({ x, y, vill: v.c, town: v.t, month: month(), q: q < .5 ? 'A' : q < .85 ? 'B' : 'C' });
  }
  const surveys = [], sites = [];
  for (let i = 0; i < 26; i++) {
    const a = i === 0 ? { x: home.x, y: home.y, v: home } : pick();
    const p = i === 0 ? .34 : .12 + .5 * R(), n = i === 0 ? 12 : 6 + Math.floor(R() * 10), site = { a, visits: [] };
    for (let j = 0; j < n; j++) {
      const has = i === 0 ? [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0][j] === 1 : R() < p;
      const seen = has ? 1 + Math.floor(R() * 3) : 0, m = i === 0 ? C.MONTHS[Math.floor(j / 2)] : month();
      const rec = { x: a.x, y: a.y, vill: a.v.c, town: a.v.t, month: m, has, seen, min: 5 };
      surveys.push(rec); site.visits.push(rec);
    }
    sites.push(site);
  }
  return { records, surveys, sites };
}
const D = makeData();

const SCALES = {
  town: { label: '鄉鎮' }, vill: { label: '村里' },
  g1000: { label: '1 公里網格', size: 100 }, g200: { label: '200 公尺網格', size: 20 },
};
const BREAKS = { town: [10, 25, 50, 100], vill: [2, 5, 10, 20], g1000: [2, 4, 7, 12], g200: [2, 3, 4, 6] };
const RATE = [.2, .4, .6, .8];
const klass = (n, b) => 1 + b.filter(t => n >= t).length;
const cellOf = (r, sc) => sc === 'town' ? r.town : sc === 'vill' ? r.vill : `${Math.floor(r.x / SCALES[sc].size)}_${Math.floor(r.y / SCALES[sc].size)}`;
function aggregate(sc, { month = 'all', town = 'all', enc = true, sur = true } = {}) {
  const m = new Map();
  const get = k => { if (!m.has(k)) m.set(k, { key: k, n: 0, s: 0, sd: 0, min: 0, qa: 0, qb: 0, qc: 0 }); return m.get(k); };
  const ok = r => (month === 'all' || r.month === month) && (town === 'all' || r.town === town);
  if (enc) D.records.forEach(r => { if (ok(r)) { const c = get(cellOf(r, sc)); c.n++; c['q' + r.q.toLowerCase()]++; } });
  if (sur) D.surveys.forEach(r => { if (ok(r)) { const c = get(cellOf(r, sc)); c.s++; c.min += r.min; if (r.has) c.sd++; } });
  return m;
}
const qualityOf = c => (c.qa >= c.qb && c.qa >= c.qc) ? 'A' : c.qb >= c.qc ? 'B' : 'C';
const areaName = (sc, key) => sc === 'town' ? key : sc === 'vill' ? `${byCode.get(key).t}${byCode.get(key).v}` : '';

/* ───────── 狀態 ───────── */
const newDraft = () => ({
  photo: null, pin: null, precision: 'exact', late: false, when: '2026-11-07T07:40',
  adult: null, pup: null,
  beh: { rest: null, eat: null, bark: null, chase: null },
  clue: { collar: null, bowl: null, person: null, hurt: null },
  hearsay: '', feel: [], feelText: '', pubPhoto: false, pubText: false,
});
const copy = o => JSON.parse(JSON.stringify(o));
const newSurvey = () => ({ mode: 'point', phase: 'idle', t: 0, seen: 0, heard: 0, speed: 1, weather: '晴', period: '早上', extra: [] });
const S = {
  view: 'home', step: 0, draft: newDraft(), err: '', submitted: null, timing: 'live',
  openCard: null, seen: [], trayOpen: false, latest: '', mapRefs: {},
  sv: newSurvey(), timer: null,
  nb: { town: 'all', month: 'all', scale: 'vill', metric: 'count', kinds: new Set(Object.keys(C.KINDS)), sel: null },
  dx: { scale: 'g1000', k: 3, month: 'all', raw: false, fmt: 'csv' },
  ad: { tab: 'queue' },
  queue: copy(C.QUEUE).map(t => ({ ...t, fixed: [], human: {} })), done: [],
  cards: copy(C.CARDS), requests: copy(C.REQUESTS), stories: copy(C.STORIES),
};

/* ───────── 共用片段 ───────── */
const SHAPES = {
  circle: '<circle cx="6" cy="6" r="5" fill="currentColor"/>',
  square: '<rect x="1" y="1" width="10" height="10" fill="currentColor"/>',
  triangle: '<path d="M6 1 11 11H1Z" fill="currentColor"/>',
  diamond: '<path d="M6 0 12 6 6 12 0 6Z" fill="currentColor"/>',
  plus: '<path d="M4 0H8V4H12V8H8V12H4V8H0V4H4Z" fill="currentColor"/>',
};
const mark = n => `<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">${SHAPES[n]}</svg>`;
const kindTag = k => `<span class="tag">${mark(C.KINDS[k].mark)}${C.KINDS[k].label}</span>`;
const pressed = b => `aria-pressed="${!!b}"`;
function scene({ masked = false } = {}) {
  const blocks = (x, y, w, h, s = 8) => {
    let o = '';
    for (let j = 0; j * s < h; j++) for (let i = 0; i * s < w; i++) o += `<rect x="${x + i * s}" y="${y + j * s}" width="${s}" height="${s}" fill="var(--${(i * 3 + j * 5) % 3 === 0 ? 'figure' : (i + j) % 2 ? 'wall' : 'ground'})"/>`;
    return o;
  };
  return `<svg viewBox="0 0 600 400" role="img" aria-label="示例圖：路旁一隻成犬與三隻幼犬，旁邊有飼料碗${masked ? '，門牌與人臉已遮蔽' : ''}">
    <rect width="600" height="400" fill="var(--wall)"/><rect y="292" width="600" height="108" fill="var(--ground)"/><rect y="288" width="600" height="4" fill="var(--figure)"/>
    <rect x="392" y="64" width="208" height="224" fill="var(--paper2)" stroke="var(--figure)" stroke-width="2"/><rect x="416" y="196" width="60" height="92" fill="var(--wall)" stroke="var(--figure)" stroke-width="2"/><rect x="416" y="100" width="60" height="56" fill="var(--wall)" stroke="var(--figure)" stroke-width="2"/>
    <rect x="500" y="112" width="76" height="36" fill="var(--paper)" stroke="var(--figure)" stroke-width="2"/><text x="538" y="137" text-anchor="middle" font-size="18" font-weight="700" fill="var(--figure)" font-family="var(--ui)">○○路 12</text>
    <rect x="58" y="110" width="6" height="180" fill="var(--figure)"/><circle cx="61" cy="96" r="28" fill="var(--paper)" stroke="var(--figure)" stroke-width="4"/><text x="61" y="103" text-anchor="middle" font-size="20" font-weight="700" fill="var(--figure)" font-family="var(--ui)">公車</text>
    <g fill="var(--figure)"><circle cx="340" cy="150" r="15"/><rect x="325" y="170" width="30" height="66"/><rect x="326" y="236" width="11" height="52"/><rect x="343" y="236" width="11" height="52"/></g>
    <g style="color:var(--figure)"><use href="#i-dog" x="118" y="212" width="128" height="91"/><use href="#i-pup" x="236" y="268" width="62" height="44"/><use href="#i-pup" x="52" y="282" width="62" height="44"/><use href="#i-pup" x="150" y="306" width="62" height="44"/></g>
    <path d="M300 322h52l-9 18h-34Z" fill="var(--figure)"/>
    ${masked ? blocks(496, 108, 88, 48) + blocks(320, 130, 40, 40) : ''}
    <rect x="8" y="8" width="62" height="26" fill="var(--paper)" stroke="var(--figure)"/><text x="39" y="26" text-anchor="middle" font-size="15" fill="var(--figure)" font-family="var(--ui)">示例圖</text>
  </svg>`;
}
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.h);
  toast.h = setTimeout(() => { t.hidden = true; }, 3200);
}

/* ───────── 導覽與討論欄 ───────── */
const ICONS = {
  home: '<path d="M3 11 12 3l9 8v10H3Z" fill="none" stroke="currentColor" stroke-width="2"/>',
  record: '<path d="M12 4v16M4 12h16" stroke="currentColor" stroke-width="2.5"/>',
  survey: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3 3" fill="none" stroke="currentColor" stroke-width="2"/>',
  nearby: '<path d="M12 22C8 16 5 13 5 9a7 7 0 1 1 14 0c0 4-3 7-7 13Z" fill="none" stroke="currentColor" stroke-width="2"/>',
  data: '<path d="M5 21V12M12 21V4M19 21V9" stroke="currentColor" stroke-width="3"/>',
};
function renderNav() {
  const items = [['record', '記錄一次相遇'], ['survey', '五分鐘觀察'], ['nearby', '看看附近'], ['data', '開放資料'], ['admin', '管理後台', 1], ['issues', '待決議題', 1]];
  $('#nav').innerHTML = items.map(([v, l, st]) => `<button type="button" data-go="${v}" class="${st ? 'staff' : ''}" ${S.view === v ? 'aria-current="page"' : ''}>${l}</button>`).join('');
  const tabs = [['home', '首頁'], ['record', '記錄'], ['survey', '觀察'], ['nearby', '附近'], ['data', '資料']];
  $('#tabbar').innerHTML = tabs.map(([v, l]) => `<button type="button" data-go="${v}" ${S.view === v ? 'aria-current="page"' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[v]}</svg>${l}</button>`).join('');
}
const TIMING = {
  live: '即時：文件的原始構想。卡片隨填寫內容浮現。',
  tier: '分級：安全提示即時出現，其他卡片等「今天看見」填完。',
  after: '填完才看：所有卡片都等觀察確認之後。',
};
function renderRail() {
  const q = (view, it) => `
    <section class="q" id="q-${it.id}" data-for="${view}" data-comment-target hidden>
      <h3>${esc(it.q)}</h3><p>${esc(it.why)}</p>
      ${it.control === 'timing' ? `<div class="q-ctl"><div class="seg" role="group" aria-label="卡片浮現時機">
        ${[['live', '即時'], ['tier', '分級'], ['after', '填完才看']].map(([v, l]) => `<button type="button" id="tm-${v}" data-act="timing" data-v="${v}" ${pressed(S.timing === v)}>${l}</button>`).join('')}
      </div><p class="note" id="timingNote">${TIMING[S.timing]}</p></div>` : ''}
      <div class="q-foot"><span class="q-ref">文件：${esc(it.ref)}</span><span class="q-acts"><button type="button" class="q-comment" data-act="comment" data-q="q-${it.id}">在這裡留言</button><a class="q-issue" href="${C.REPO}/issues/${C.THREADS[it.id]}" target="_blank" rel="noopener">到 GitHub 留言</a></span></div>
    </section>`;
  $('#rail').innerHTML = `
    <div class="rail-head"><h2 id="railTitle">這個畫面要討論的事</h2><button type="button" class="btn quiet sm rail-close" data-act="rail">收起</button></div>
    <section class="tour" data-for="home" hidden><h3>建議走法</h3><ol>${C.TOUR.map(([v, t, d]) => `<li><span><button type="button" data-go="${v}">${t}</button><br>${d}</span></li>`).join('')}</ol></section>
    ${Object.entries(C.ISSUES).map(([v, list]) => list.map(it => q(v, it)).join('')).join('')}
    <div class="rail-foot"><button type="button" class="btn sm" data-go="issues">全部待決議題</button><a class="btn quiet sm" href="${C.REPO}/issues?q=${encodeURIComponent('is:issue label:討論點')}" target="_blank" rel="noopener">看所有留言</a><button type="button" class="btn quiet sm" data-act="reset">重設原型</button></div>
    <p class="note">留言需要 GitHub 帳號，內容是公開的。</p>`;
}
function syncRail() {
  $$('[data-for]', $('#rail')).forEach(el => { el.hidden = el.dataset.for !== S.view; });
  $('#railTitle').textContent = S.view === 'issues' ? '跨畫面的問題' : '這個畫面要討論的事';
  $('#railBtn').textContent = `討論點 ${(C.ISSUES[S.view] || []).length}`;
  $('#railBtn').setAttribute('aria-expanded', document.body.dataset.rail !== 'off');
}

/* ───────── 首頁 ───────── */
function viewHome() {
  const m = aggregate('vill');
  const n = [...m.values()].reduce((s, c) => s + c.n, 0), e = [...m.values()].reduce((s, c) => s + c.s, 0);
  return `<div class="page pad">
    <section class="hero">
      <div>
        <h1>從一次日常的人犬相遇開始</h1>
        <p class="lede">記下今天看見的事。填寫時，這一帶的地方資訊會浮現；經過檢核的紀錄，會累積成大家都能讀、能用的公開資料。</p>
        <div class="cta"><button type="button" class="btn primary" data-go="record">記錄一次相遇</button><button type="button" class="btn" data-go="nearby">看看附近</button></div>
      </div>
      <figure class="hero-map">
        <div class="map" id="homeMap"></div>
        <figcaption>苗栗縣 2026 年 5 月至今，${n} 筆偶遇紀錄、${e} 次持續觀察（示例）。顏色越深紀錄越多，斜線是沒有資料。筆數受使用者人數與路線影響，不等於犬隻數量。</figcaption>
      </figure>
    </section>
    <section class="block">
      <h2 class="sec">送出紀錄代表什麼</h2>
      <div class="paths">
        <div class="path"><h3>觀察紀錄</h3><p class="here">這個網站</p><p>記下你看見的事，檢核後成為公開資料。不會有人因此到場。</p></div>
        <div class="path"><h3>正式陳情</h3><p>需要公部門處理、回覆時，請走縣市政府的陳情管道。實際連結待查核。</p></div>
        <div class="path"><h3>緊急協助</h3><p>有人身危險時撥 110 或 119。動物受傷受困的窗口待查核。</p></div>
      </div>
    </section>
    <section class="block">
      <h2 class="sec">最近的公開紀錄</h2>
      <div class="stories two">${S.stories.slice(0, 4).map(storyHTML).join('')}</div>
      <div class="cta"><button type="button" class="btn" data-go="nearby">看更多</button></div>
    </section>
    <section class="block invite">
      <div><h2 class="sec">站定五分鐘</h2><p class="sec-lede">找一個點停下來，留意周遭的聲音與動靜。沒看到狗也要送出，那筆紀錄同樣有用。</p></div>
      <button type="button" class="btn" data-go="survey">試試看</button>
    </section>
  </div>`;
}
function mountHome() {
  const m = GeoMap($('#homeMap'), { static: true, label: '苗栗縣各村里的示例紀錄分布', labels: false });
  const a = aggregate('vill');
  m.fill(v => { const c = a.get(v.c); return c && c.n ? 'fq' + klass(c.n, BREAKS.vill) : 'hatch'; });
  S.mapRefs.home = m;
}

/* ───────── 故事 ───────── */
function storyHTML(s) {
  const fact = { work: '工作紀錄', incident: '查核內容' }[s.kind] || '親眼看見';
  return `<article class="story">
    <p class="story-meta">${kindTag(s.kind)}<span>${esc(s.who)}</span><span>${esc(s.town)}</span><span>${fmtMonth(s.month)}</span></p>
    <h3>${esc(s.title)}</h3>
    ${s.photo ? `<div class="photo-box">${scene({ masked: true })}</div>` : ''}
    <dl class="facts">
      ${s.seen ? `<dt>${fact}</dt><dd>${esc(s.seen)}</dd>` : ''}
      ${s.heard ? `<dt>他人轉述</dt><dd>${esc(s.heard)}</dd>` : ''}
      ${s.felt ? `<dt>心裡的想法</dt><dd>${esc(s.felt)}</dd>` : ''}
      ${s.note ? `<dt>編輯說明</dt><dd class="ed">${esc(s.note)}</dd>` : ''}
    </dl>
  </article>`;
}

/* ───────── 記錄一次相遇 ───────── */
const STEPS = ['現場', '今天看見', '補充', '公開與送出'];
const BEH = [['rest', '休息或走動'], ['eat', '進食'], ['bark', '吠叫'], ['chase', '追逐人或車']];
const CLUE = [['collar', '項圈或牽繩'], ['bowl', '飼料碗或餵食痕跡'], ['person', '有人在場照顧'], ['hurt', '看起來受傷或受困']];
const FEEL = [['road', '擔心犬隻跑上馬路'], ['self', '擔心自己或家人'], ['care', '想知道有沒有人在照顧'], ['help', '想知道是否已有團體協助'], ['join', '想一起幫忙']];
const TAGS = { puppy: '你填了幼犬', bowl: '你看見飼料碗', chase: '你看見追逐', hurt: '你看見受傷或受困', wantHelp: '你想知道是否有人協助' };
const hasCount = d => d.adult !== null || d.pup !== null;

function draftTags() {
  const d = S.draft, t = new Set();
  if (typeof d.pup === 'number' && d.pup > 0) t.add('puppy');
  if (d.clue.bowl === 'yes') t.add('bowl');
  if (d.beh.chase === 'yes') t.add('chase');
  if (d.clue.hurt === 'yes') t.add('hurt');
  if (d.feel.includes('help')) t.add('wantHelp');
  return t;
}
function matchCards() {
  const pin = S.draft.pin, tags = draftTags(), out = [];
  let expired = 0;
  for (const c of S.cards) {
    if (c.off) continue;
    const w = c.when, why = [];
    if (w.place) { if (!pin) continue; why.push(`位置在${pin.town}`); }
    if (w.hills) { if (!pin || !C.SHALLOW_HILLS.includes(pin.town)) continue; why.push('位置在淺山鄉鎮（示例範圍）'); }
    if (w.tags) { const hit = w.tags.filter(t => tags.has(t)); if (!hit.length) continue; why.push(...hit.map(t => TAGS[t])); }
    if (c.valid < C.TODAY) { expired++; continue; }
    out.push({ c, why });
  }
  return { out, expired };
}
function cardView(c) {
  if (c.dynamic !== 'localRecord') return c;
  const p = S.draft.pin, a = aggregate('vill').get(p.code) || { n: 0, s: 0, sd: 0 };
  const n = a.n > 0 && a.n < S.dx.k ? `不到 ${S.dx.k} 筆` : `${a.n} 筆`;
  return { ...c, title: `${p.village}這一帶的紀錄`, lead: `近六個月有${n}經檢核的紀錄、${a.s} 次持續觀察，其中 ${a.sd} 次見犬。` };
}
function cardHTML({ c: raw, why }, isNew) {
  const c = cardView(raw), open = S.openCard === c.id;
  return `<article class="kcard${isNew ? ' new' : ''}">
    <button type="button" class="kcard-btn" id="card-${c.id}" data-act="card" data-id="${c.id}" aria-expanded="${open}">
      <span class="kind${c.tier === 'safety' ? ' safety' : ''}">${esc(c.kind)}</span>
      <h3>${esc(c.title)}</h3>
      ${c.lead ? `<p class="lead">${esc(c.lead)}</p>` : ''}
      <p class="why">${esc(why.join('、'))}才出現</p>
    </button>
    ${open ? `<div class="kcard-more">
      ${(c.body || []).map(p => `<p>${esc(p)}</p>`).join('')}
      ${c.list ? `<ul>${c.list.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
      ${c.rows ? `<dl>${c.rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}
      ${c.tiers ? `<div class="tiers">${c.tiers.map(([k, v]) => `<div><b>${esc(k)}</b>${esc(v)}</div>`).join('')}</div>` : ''}
      <p class="prov"><b>${esc(C.CHECK[c.check])}</b><br>來源：${esc(c.source)}<br>更新 ${c.updated}，有效至 ${c.valid}</p>
    </div>` : ''}
  </article>`;
}
function renderCards() {
  const col = $('#cardsCol');
  if (!col) return;
  const { out, expired } = matchCards();
  const obsDone = S.step >= 2;
  const allow = x => S.timing === 'live' || obsDone || (S.timing === 'tier' && x.c.tier === 'safety');
  const shown = out.filter(allow), held = out.length - shown.length;
  const fresh = shown.filter(x => !S.seen.includes(x.c.id));
  [...fresh].reverse().forEach(x => S.seen.unshift(x.c.id));
  shown.sort((a, b) => S.seen.indexOf(a.c.id) - S.seen.indexOf(b.c.id));
  if (fresh.length) S.latest = `新增：${cardView(fresh[fresh.length - 1].c).title}`;
  col.classList.toggle('open', S.trayOpen);
  col.innerHTML = `
    <button type="button" class="cards-head" data-act="tray" aria-expanded="${S.trayOpen}"><span>這一帶</span><span class="cnt">${shown.length} 張 <span class="chev">${S.trayOpen ? '▾' : '▴'}</span></span></button>
    ${S.latest ? `<span class="latest">${esc(S.latest)}</span>` : ''}
    <div class="cards-body">
      ${!S.draft.pin && !shown.length ? '<p class="note">確認位置後，這一帶的地方資訊會出現在這裡。有興趣再點開，也可以全部略過。</p>' : ''}
      <div class="kcards">${shown.map(x => cardHTML(x, fresh.includes(x))).join('')}</div>
      ${held ? `<p class="locked">還有 ${held} 張卡片，填完「今天看見」後可以看。</p>` : ''}
      ${expired && S.draft.pin ? `<p class="note">有 ${expired} 張過期卡片沒有浮現。</p>` : ''}
    </div>`;
}
function viewRecord() {
  if (S.submitted) return viewReceipt();
  return `<div class="page pad" id="recPage">
    <h1 style="font-size:clamp(30px,5cqi,40px)">記錄一次相遇</h1>
    <p class="small">這是一筆觀察紀錄，不會派人到場。有人身危險請撥 110 或 119。</p>
    <ol class="steps" id="stepBar"></ol>
    <div class="rec-grid">
      <div class="rec-form" id="stepBody"></div>
      <aside class="rec-cards" id="cardsCol" aria-label="這一帶的地方資訊"></aside>
    </div>
  </div>`;
}
function renderStepBar() {
  $('#stepBar').innerHTML = STEPS.map((l, i) => `<li><button type="button" id="st-${i}" data-act="step" data-n="${i}" class="${i < S.step ? 'done' : ''}" ${i === S.step ? 'aria-current="step"' : ''}><b>${i + 1}</b>${l}</button></li>`).join('');
}
const demoBtn = n => `<div class="demo"><button type="button" id="fill-${n}" data-act="fill" data-n="${n}">帶入文件情境</button></div>`;
function stepScene() {
  const d = S.draft;
  return `<h2>現場</h2>
    <p class="safe">請站在安全距離，不要為了拍照靠近犬隻。</p>
    ${demoBtn(0)}
    <div class="form-sec"><h3>位置</h3>
      <p class="step-note">實際版本會先用手機定位。原型請點地圖放置位置。</p>
      <div class="map map-rec" id="recMap"></div>
      <p class="pinline ${d.pin ? '' : 'empty'}" id="pinLine">${pinText()}</p>
      <div class="seg" role="group" aria-label="位置精度">
        <button type="button" id="prec-exact" data-act="prec" data-v="exact" ${pressed(d.precision === 'exact')}>準確</button>
        <button type="button" id="prec-approx" data-act="prec" data-v="approx" ${pressed(d.precision === 'approx')}>大約</button>
      </div>
    </div>
    <div class="form-sec"><h3>照片<small>可略過</small></h3>
      <div class="photo-pick">
        <label class="btn sm" for="photoFile">選擇照片</label><input type="file" id="photoFile" accept="image/*">
        <button type="button" class="btn sm" id="photoSample" data-act="photo-sample">用示例圖</button>
        <button type="button" class="btn quiet sm" id="photoNone" data-act="photo-none">不放照片</button>
      </div>
      <div id="photoBox">${photoHTML()}</div>
      <p class="note">照片只留在這個分頁，不會上傳。</p>
    </div>
    <div class="form-sec"><h3>時間</h3>
      <label class="field" for="obsWhen"><span>觀察時間</span><input type="datetime-local" id="obsWhen" data-bind="when" value="${d.when}"></label>
      <button type="button" class="chip" id="lateBtn" data-act="late" ${pressed(d.late)}>這是稍早的觀察，現在才補登</button>
      <p class="note">觀察時間和上傳時間分開保存，避免把補登當成即時目擊。</p>
    </div>
    <p class="err" id="stepErr" role="alert">${esc(S.err)}</p>
    <div class="step-act"><button type="button" class="btn primary" id="next-0" data-act="step" data-n="1">下一步：今天看見</button></div>`;
}
const pinText = () => {
  const p = S.draft.pin;
  return p ? `苗栗縣 ${esc(p.town)} ${esc(p.vname)}` : '還沒有選位置';
};
const photoHTML = () => {
  const p = S.draft.photo;
  if (!p) return '';
  return `<div class="photo-box">${p.kind === 'sample' ? scene() : `<img src="${p.url}" alt="你選的照片">`}</div>`;
};
function counterHTML(k, label, icon) {
  const v = S.draft[k];
  return `<div class="counter">
    <span class="who"><svg aria-hidden="true"><use href="#${icon}"/></svg>${label}</span>
    <span class="ctl">
      <button type="button" id="dec-${k}" data-act="count" data-k="${k}" data-d="-1" aria-label="${label}減一">−</button>
      <span class="val" aria-live="polite">${v === null ? '—' : v === 'unk' ? '?' : v}</span>
      <button type="button" id="inc-${k}" data-act="count" data-k="${k}" data-d="1" aria-label="${label}加一">＋</button>
      <button type="button" class="unk" id="unk-${k}" data-act="count-unk" data-k="${k}" ${pressed(v === 'unk')}>不知道</button>
    </span>
  </div>`;
}
function triHTML(g, k, label) {
  const v = S.draft[g][k], b = (val, t) => `<button type="button" id="tri-${k}-${val}" data-act="tri" data-g="${g}" data-k="${k}" data-v="${val}" ${pressed(v === val)}>${t}</button>`;
  return `<div class="tri"><span class="lab">${label}</span><span class="seg" role="group" aria-label="${label}">${b('yes', '有')}${b('no', '未見')}${b('unk', '不知道')}</span></div>`;
}
function stepSeen() {
  return `<h2>今天看見</h2>
    <p class="step-note"><span class="tag-seen">親眼看見</span> 這一頁只填你現在看到的事。聽來的事放到下一步。</p>
    ${demoBtn(1)}
    <div class="form-sec"><h3>同時看見幾隻</h3>
      <div class="counters">${counterHTML('adult', '成犬', 'i-dog')}${counterHTML('pup', '幼犬', 'i-pup')}</div>
    </div>
    <div class="form-sec"><h3>正在發生什麼<small>可略過</small></h3>${BEH.map(([k, l]) => triHTML('beh', k, l)).join('')}</div>
    <div class="form-sec"><h3>現場線索<small>可略過</small></h3>${CLUE.map(([k, l]) => triHTML('clue', k, l)).join('')}</div>
    <p class="err" id="stepErr" role="alert">${esc(S.err)}</p>
    <div class="step-act">
      <button type="button" class="btn quiet" id="back-1" data-act="step" data-n="0">上一步</button>
      <button type="button" class="btn primary" id="next-1" data-act="step" data-n="2">下一步：補充</button>
      <button type="button" class="btn sm" id="skip-1" data-act="step" data-n="3">略過補充，直接送出</button>
    </div>`;
}
function stepExtra() {
  const d = S.draft;
  return `<h2>補充</h2>
    <p class="step-note">這一頁可以略過。寫在這裡的內容會保留情境，但不會算成今天的目擊。</p>
    ${demoBtn(2)}
    <div class="form-sec"><h3><span class="tag-heard">他人轉述</span></h3>
      <label class="field" for="hearsay"><span>別人告訴你、但你沒有親眼看見的事</span>
      <textarea id="hearsay" rows="3" data-bind="hearsay" placeholder="例如：鄰居說上個月有狗追機車">${esc(d.hearsay)}</textarea></label>
    </div>
    <div class="form-sec"><h3><span class="tag-felt">我的想法</span></h3>
      <div class="chips">${FEEL.map(([k, l]) => `<button type="button" class="chip" id="feel-${k}" data-act="feel" data-k="${k}" ${pressed(d.feel.includes(k))}>${l}</button>`).join('')}</div>
      <label class="field" for="feelText"><span>還想說的話</span><textarea id="feelText" rows="3" data-bind="feelText">${esc(d.feelText)}</textarea></label>
    </div>
    <div class="step-act">
      <button type="button" class="btn quiet" id="back-2" data-act="step" data-n="1">上一步</button>
      <button type="button" class="btn primary" id="next-2" data-act="step" data-n="3">下一步：公開與送出</button>
    </div>`;
}
const countText = d => {
  const f = (v, l) => v === null ? '' : v === 'unk' ? `${l}數量不知道` : `${l} ${v} 隻`;
  return [f(d.adult, '成犬'), f(d.pup, '幼犬')].filter(Boolean).join('、') || '未填';
};
const seenText = d => {
  const yes = [...BEH, ...CLUE].filter(([k]) => (d.beh[k] ?? d.clue[k]) === 'yes').map(([, l]) => l);
  const no = [...BEH, ...CLUE].filter(([k]) => (d.beh[k] ?? d.clue[k]) === 'no').map(([, l]) => '未見' + l);
  return [countText(d), ...yes, ...no].join('、') + '。';
};
const feelText = d => [...FEEL.filter(([k]) => d.feel.includes(k)).map(([, l]) => l), d.feelText].filter(Boolean).join('；');
function stepPublish() {
  const d = S.draft, p = d.pin;
  const [lon, lat] = p ? toLonLat(p.x, p.y) : ['—', '—'];
  const hasText = d.hearsay || feelText(d);
  return `<h2>公開與送出</h2>
    <p class="step-note">你看見的事實會以聚合形式進入公開統計。照片和文字由你決定。</p>
    ${demoBtn(3)}
    <div class="form-sec"><h3>照片</h3>
      <div class="seg" role="group" aria-label="照片是否公開">
        <button type="button" id="pp-no" data-act="pub" data-k="pubPhoto" data-v="0" ${pressed(!d.pubPhoto)}>不公開</button>
        <button type="button" id="pp-yes" data-act="pub" data-k="pubPhoto" data-v="1" ${pressed(d.pubPhoto)} ${d.photo ? '' : 'disabled'}>遮蔽後公開</button>
      </div>
      ${d.photo ? '' : '<p class="note">這筆紀錄沒有照片。</p>'}
    </div>
    <div class="form-sec"><h3>文字</h3>
      <div class="seg" role="group" aria-label="文字是否公開">
        <button type="button" id="pt-no" data-act="pub" data-k="pubText" data-v="0" ${pressed(!d.pubText)}>不公開</button>
        <button type="button" id="pt-yes" data-act="pub" data-k="pubText" data-v="1" ${pressed(d.pubText)} ${hasText ? '' : 'disabled'}>願意公開</button>
      </div>
      ${hasText ? '' : '<p class="note">這筆紀錄沒有補充文字。</p>'}
    </div>
    <div class="form-sec"><h3>兩個版本的差別</h3>
      <div class="privacy">
        <div class="pv"><h4>公開版本</h4>
          ${d.pubPhoto && d.photo ? `<div class="photo-box">${d.photo.kind === 'sample' ? scene({ masked: true }) : `<img src="${d.photo.url}" alt="" style="filter:blur(6px)">`}</div>` : ''}
          <dl><dt>時間</dt><dd>${fmtMonth(d.when.slice(0, 7))}</dd><dt>區域</dt><dd>${p ? esc(p.town + p.vname) : '—'}</dd><dt>內容</dt><dd>${esc(seenText(d))}</dd>
          ${d.pubText && d.hearsay ? `<dt>他人轉述</dt><dd>${esc(d.hearsay)}</dd>` : ''}
          ${d.pubText && feelText(d) ? `<dt>想法</dt><dd>${esc(feelText(d))}</dd>` : ''}</dl>
        </div>
        <div class="pv raw"><h4>平台保留，不公開</h4>
          <dl><dt>精確位置</dt><dd class="mono">${lat}, ${lon}</dd><dt>觀察時間</dt><dd class="mono">${esc(d.when.replace('T', ' '))}</dd><dt>上傳時間</dt><dd class="mono">2026-11-07 ${d.late ? '12:30' : '07:44'}</dd><dt>原始照片</dt><dd>${d.photo ? '含定位資訊的原檔' : '無'}</dd></dl>
        </div>
      </div>
    </div>
    <div class="form-sec"><h3>送出之後</h3>
      <ul class="after">
        <li>團隊檢核後才會公開，照片會移除定位資訊並遮蔽門牌與人臉。</li>
        <li>你可以之後要求更正或下架。</li>
        <li class="no">不會有人因這筆紀錄到場。</li>
        <li class="no">這不是陳情，公部門不會因此回覆你。</li>
      </ul>
    </div>
    <p class="err" id="stepErr" role="alert">${esc(S.err)}</p>
    <div class="step-act">
      <button type="button" class="btn quiet" id="back-3" data-act="step" data-n="2">上一步</button>
      <button type="button" class="btn primary" id="submit" data-act="submit">送出紀錄</button>
    </div>`;
}
function renderStep() {
  const fid = document.activeElement?.id;
  S.mapRefs.rec?.destroy(); S.mapRefs.rec = null;
  $('#stepBody').innerHTML = [stepScene, stepSeen, stepExtra, stepPublish][S.step]();
  renderStepBar();
  if (S.step === 0) mountRecMap();
  renderCards();
  if (fid) document.getElementById(fid)?.focus({ preventScroll: true });
}
function mountRecMap() {
  const d = S.draft;
  const m = GeoMap($('#recMap'), {
    pick: true, stamp: false, label: '點地圖放置觀察位置',
    onClick(x, y) {
      const v = villageAt(x, y);
      if (!v) { toast('原型目前只有苗栗縣的資料。'); return; }
      setPin(x, y, v);
    },
  });
  S.mapRefs.rec = m;
  if (d.pin) { m.pin(d.pin); m.fit(byCode.get(d.pin.code).bb, .9); }
}
function setPin(x, y, v) {
  const first = !S.draft.pin;
  S.draft.pin = { x, y, code: v.c, town: v.t, vname: v.v, village: v.t + v.v };
  S.err = '';
  S.mapRefs.rec?.pin(S.draft.pin);
  if (first) S.mapRefs.rec?.fit(v.bb, .9);
  const l = $('#pinLine');
  if (l) { l.textContent = `苗栗縣 ${v.t} ${v.v}`; l.classList.remove('empty'); }
  const e = $('#stepErr'); if (e) e.textContent = '';
  renderCards();
}
function goStep(n) {
  if (n > S.step) {
    if (n >= 1 && !S.draft.pin) { S.err = '還需要位置。請在地圖上點一下。'; return showErr(); }
    if (n >= 2 && !hasCount(S.draft)) { S.err = '還需要犬隻數量。看不清楚可以選「不知道」。'; if (S.step !== 1) { S.step = 1; renderStep(); } return showErr(); }
  }
  S.err = ''; S.step = n;
  renderStep();
  scrollTop($('#recPage'));
}
function showErr() { const e = $('#stepErr'); if (e) { e.textContent = S.err; e.scrollIntoView({ block: 'nearest' }); } }
function fillScenario(n) {
  const d = S.draft;
  if (n === 0) {
    d.photo = { kind: 'sample' };
    const v = G.villages.find(x => x.t === '銅鑼鄉' && x.v === '銅鑼村');
    setPin(v.x + 12, v.y + 8, v);
    S.mapRefs.rec?.fit(v.bb, .9);
    $('#photoBox').innerHTML = photoHTML();
  } else if (n === 1) {
    const steps = [() => { d.adult = 1; d.beh.rest = 'yes'; }, () => { d.pup = 3; }, () => { d.clue.bowl = 'yes'; d.beh.chase = 'no'; d.clue.collar = 'unk'; }];
    steps.forEach((f, i) => setTimeout(() => { if (S.view === 'record' && S.step === 1) { f(); renderStep(); } }, i * 750));
  } else if (n === 2) {
    d.hearsay = '聽說附近曾有狗追車，但今天沒有親眼看見。';
    d.feel = ['road', 'help'];
    d.feelText = '路很窄，車子開得快。';
    renderStep();
  } else {
    d.pubPhoto = !!d.photo; d.pubText = !!(d.hearsay || feelText(d));
    renderStep();
  }
}
function viewReceipt() {
  const t = S.submitted, st = t.state || 'review';
  const idx = { review: 1, published: 3, stats: 3, returned: 1 }[st];
  return `<div class="page pad">
    <h1 style="font-size:clamp(30px,5cqi,40px)">紀錄已送出</h1>
    <div class="receipt">
      <p class="id">${t.id}</p>
      <p class="step-note">${esc(t.place)}。${st === 'review' ? '目前等待檢核，公開版本產製前不會出現在地圖上。' : st === 'returned' ? '這筆紀錄已退回。' : '這筆紀錄已檢核，現在可以在「看看附近」讀到。'}</p>
      <ol class="track">${['已收到', '等待檢核', '產製公開版本', '已發布'].map((l, i) => `<li class="${i <= idx ? 'on' : ''}">${l}</li>`).join('')}</ol>
    </div>
    <section class="block"><h2 class="sec">下一步</h2>
      <div class="next">
        <button type="button" class="btn primary" data-go="admin">到管理後台核准這筆</button>
        <button type="button" class="btn" data-go="nearby">看看附近</button>
        <button type="button" class="btn" data-act="again">再記一筆</button>
      </div>
      <p class="note" style="margin-top:8px">「到管理後台」是給團隊看的捷徑，居民看不到這個按鈕。</p>
    </section>
    <section class="block invite"><div><h2 class="sec">想持續留意這個地方？</h2><p class="sec-lede">用同樣的方法定期觀察，才看得出變化。</p></div><button type="button" class="btn" data-go="survey">參加持續觀察</button></section>
  </div>`;
}
function submitRecord() {
  const d = S.draft;
  if (!d.pin) { S.err = '還需要位置。'; return showErr(); }
  if (!hasCount(d)) { S.err = '還需要犬隻數量。'; return showErr(); }
  const t = {
    id: `OB-20261107-0${512 + S.done.length + S.queue.length}`, place: `${d.pin.town} ${d.pin.vname}`, time: d.when.replace('T', ' '), late: d.late, mine: true,
    user: { adult: d.adult, pup: d.pup, photo: !!d.photo, text: [d.hearsay && `他人轉述：${d.hearsay}`, feelText(d) && `想法：${feelText(d)}`].filter(Boolean).join('\n') || '（沒有補充文字）' },
    ai: { adult: typeof d.adult === 'number' ? d.adult : null, pup: typeof d.pup === 'number' ? d.pup : null, note: d.hearsay ? '文字含他人轉述，已和今天的觀察分開存放' : '沒有需要留意的內容' },
    flags: d.pubPhoto && d.photo ? ['photoPlate'] : [], flagNote: d.pubPhoto && d.photo ? '公開照片要先遮蔽門牌與人臉' : '', fixed: [], human: {}, draft: copy(d),
  };
  if (d.photo?.kind === 'file') t.draft.photo = d.photo;
  S.queue.unshift(t);
  S.submitted = t;
  render();
}

/* ───────── 五分鐘觀察 ───────── */
const TOTAL = 300;
const mmss = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function viewSurvey() {
  const v = S.sv, point = v.mode === 'point', run = v.phase === 'run';
  const site = D.sites[0], visits = [...site.visits.map(x => x.seen), ...v.extra];
  const withDogs = visits.filter(Boolean).length, shown = point ? TOTAL - v.t : v.t;
  return `<div class="page pad">
    <div class="page-head"><h1>${point ? '站定五分鐘' : '走一次固定路線'}</h1>
      <p class="lede">${point ? '找一個點停下來，留意周遭的聲音與動靜。' : '沿著你每天走的路走一次，記下時間和遇到的狗。'}沒看到狗也要送出，那筆紀錄同樣有用。</p></div>
    <div class="form-sec">
      <div class="seg" role="group" aria-label="觀察方法">
        <button type="button" id="m-point" data-act="sv-mode" data-v="point" ${pressed(point)}>定點五分鐘</button>
        <button type="button" id="m-route" data-act="sv-mode" data-v="route" ${pressed(!point)}>固定路線</button>
      </div>
    </div>
    <div class="sv-grid">
      <div>
        <p class="small">${point ? '觀察點' : '路線'}：銅鑼村公車站${point ? '' : '到學校'}（示例）</p>
        <p class="clock" id="clock" role="timer">${mmss(shown)}</p>
        ${point ? `<div class="clockbar" aria-hidden="true"><i id="clockFill" style="width:${v.t / TOTAL * 100}%"></i>${[1, 2, 3, 4].map(i => `<b style="left:${i * 20}%"></b>`).join('')}</div>` : ''}
        <div class="tally">
          <button type="button" id="t-seen" data-act="sv-tally" data-k="seen" ${run ? '' : 'disabled'}><b id="n-seen">${v.seen}</b>看見</button>
          <button type="button" id="t-heard" data-act="sv-tally" data-k="heard" ${run ? '' : 'disabled'}><b id="n-heard">${v.heard}</b>聽見</button>
        </div>
        <p class="note" style="margin-top:8px">計算的是犬隻隻數。同一隻狗反覆吠叫只算一隻。</p>
        ${v.phase === 'done' ? `
          <p class="safe" style="margin-top:16px">${v.seen + v.heard ? `這次看見 ${v.seen} 隻、聽見 ${v.heard} 隻。` : '完成觀察，未見犬隻。這筆紀錄和有看到狗的紀錄一樣重要。'}</p>
          <div class="cta"><button type="button" class="btn primary" id="sv-send" data-act="sv-send">送出這次觀察</button><button type="button" class="btn quiet" id="sv-redo" data-act="sv-reset">重來</button></div>`
    : v.phase === 'sent' ? `
          <p class="safe" style="margin-top:16px">已送出。右邊多了一格。</p>
          <div class="cta"><button type="button" class="btn" id="sv-again" data-act="sv-reset">再觀察一次</button></div>`
      : `<div class="cta">
          <button type="button" class="btn primary" id="sv-go" data-act="sv-toggle">${run ? '暫停' : v.t ? '繼續' : '開始觀察'}</button>
          ${v.t ? `<button type="button" class="btn" id="sv-end" data-act="sv-end">${point ? '提早結束' : '走完了'}</button>` : ''}
          <button type="button" class="btn quiet sm" id="sv-fast" data-act="sv-fast" ${pressed(v.speed > 1)}>${v.speed > 1 ? '快轉中（30 倍）' : '快轉（原型用）'}</button>
        </div>`}
        <div class="form-sec">
          <h3>環境條件</h3>
          <div class="filter-row">
            <label class="field" for="sv-w"><span>天氣</span><select id="sv-w" data-sv="weather">${['晴', '陰', '小雨'].map(o => `<option ${v.weather === o ? 'selected' : ''}>${o}</option>`).join('')}</select></label>
            <label class="field" for="sv-p"><span>時段</span><select id="sv-p" data-sv="period">${['清晨', '早上', '下午', '傍晚', '晚上'].map(o => `<option ${v.period === o ? 'selected' : ''}>${o}</option>`).join('')}</select></label>
          </div>
        </div>
      </div>
      <div>
        <h2 class="sec" style="font-size:22px">這裡的觀察紀錄</h2>
        <p class="bigratio">${withDogs}／${visits.length}</p>
        <p class="small">次觀察有看見或聽見犬隻，其他是「未見」。</p>
        <div class="visits" aria-label="每次觀察的犬隻數">${visits.map((n, i) => `<span class="visit ${n ? 'yes' : ''} ${i >= site.visits.length ? 'new' : ''}">${n}</span>`).join('')}</div>
        <p class="note" style="margin-top:8px">每格是一次觀察，數字是犬隻隻數。空心的 0 就是「未見」。</p>
        <p class="small" style="margin-top:16px">同樣的方法重複做，才能和其他時間、其他地方比較。比例也不等於犬隻數量。</p>
      </div>
    </div>
  </div>`;
}
function stopTimer() { clearInterval(S.timer); S.timer = null; if (S.sv.phase === 'run') S.sv.phase = 'idle'; }
function startTimer() {
  S.sv.phase = 'run';
  S.timer = setInterval(() => {
    const v = S.sv;
    v.t += .1 * v.speed;
    if (v.mode === 'point' && v.t >= TOTAL) { v.t = TOTAL; clearInterval(S.timer); S.timer = null; v.phase = 'done'; rerender(); return; }
    const c = $('#clock'); if (c) c.textContent = mmss(v.mode === 'point' ? TOTAL - v.t : v.t);
    const f = $('#clockFill'); if (f) f.style.width = v.t / TOTAL * 100 + '%';
  }, 100);
}

/* ───────── 看看附近 ───────── */
function viewNearby() {
  const n = S.nb;
  return `<div class="page pad">
    <div class="page-head"><h1>看看附近</h1><p class="lede">按區域和月份閱讀經過檢核的紀錄。不同來源的內容會標出類型。</p></div>
    <div class="filters">
      <div class="filter-row">
        <label class="field" for="nb-town"><span>區域</span><select id="nb-town" data-nb="town"><option value="all">苗栗縣全縣</option>${TOWNS.map(t => `<option ${n.town === t.n ? 'selected' : ''}>${t.n}</option>`).join('')}</select></label>
        <label class="field" for="nb-month"><span>月份</span><select id="nb-month" data-nb="month"><option value="all">${fmtMonth('all')}</option>${C.FILTER_MONTHS.map(m => `<option value="${m}" ${n.month === m ? 'selected' : ''}>${fmtMonth(m)}</option>`).join('')}</select></label>
      </div>
      <div class="chips" role="group" aria-label="資料類型">${Object.entries(C.KINDS).map(([k, o]) => `<button type="button" class="chip" id="kind-${k}" data-act="nb-kind" data-k="${k}" ${pressed(n.kinds.has(k))}><span class="tag">${mark(o.mark)}${o.label}</span></button>`).join('')}</div>
      <div class="filter-row">
        <div class="seg" role="group" aria-label="地圖尺度">${['town', 'vill', 'g1000'].map(s => `<button type="button" id="sc-${s}" data-act="nb-scale" data-v="${s}" ${pressed(n.scale === s)}>${SCALES[s].label}</button>`).join('')}</div>
        <div class="seg" role="group" aria-label="地圖指標"><button type="button" id="mt-count" data-act="nb-metric" data-v="count" ${pressed(n.metric === 'count')}>紀錄筆數</button><button type="button" id="mt-rate" data-act="nb-metric" data-v="rate" ${pressed(n.metric === 'rate')}>見犬比例</button></div>
      </div>
    </div>
    <div class="nb-grid">
      <div>
        <div class="map map-nb" id="nbMap"></div>
        <div class="legend" id="nbLegend"></div>
        <p class="note" style="margin-top:8px">紀錄筆數不等於犬隻數量，顏色深不代表密度最高，斜線不代表沒有犬隻。</p>
      </div>
      <aside class="area" id="nbArea" aria-live="polite"></aside>
    </div>
    <section class="block" id="nbList"></section>
    <section class="block">
      <h2 class="sec">接下來可以做什麼</h2>
      <div class="next">
        <button type="button" class="btn" data-act="org">查看服務條件與窗口</button>
        <button type="button" class="btn" data-go="survey">參加持續觀察</button>
        <button type="button" class="btn" data-go="record">記錄一次相遇</button>
      </div>
      <p class="note" style="margin-top:8px" id="orgNote" hidden>正式版會依所選區域列出組織、服務條件與窗口。目前都待查核。</p>
    </section>
  </div>`;
}
function legendHTML(sc, metric) {
  if (metric === 'rate') {
    const l = ['0–19%', '20–39%', '40–59%', '60–79%', '80%+'];
    return `<div class="ramp rate">${l.map((t, i) => `<span><i class="bg${i + 1}"></i>${t}</span>`).join('')}</div><span><i class="sw sw-hatch"></i>持續觀察少於 3 次</span>`;
  }
  const b = BREAKS[sc], lab = [`1${b[0] > 2 ? '–' + (b[0] - 1) : ''}`, ...b.map((t, i) => i === b.length - 1 ? `${t}+` : (b[i + 1] - 1 === t ? `${t}` : `${t}–${b[i + 1] - 1}`))];
  return `<div class="ramp">${lab.map((t, i) => `<span><i class="bg${i + 1}"></i>${t}</span>`).join('')}</div><span>筆</span><span><i class="sw sw-hatch"></i>沒有資料</span>`;
}
function drawAreas(m, sc, cells, value, { hatchAll = false, selKey = null } = {}) {
  if (sc === 'vill' || sc === 'town') {
    m.over('');
    m.fill(v => {
      const k = sc === 'vill' ? v.c : v.t, cl = value(cells.get(k));
      return (cl ? 'fq' + cl : 'hatch') + (selKey === k ? ' sel' : '');
    });
  } else {
    m.fill(() => hatchAll ? 'hatch' : '');
    const s = SCALES[sc].size;
    let html = '';
    cells.forEach((c, key) => {
      const cl = value(c);
      if (!cl) return;
      const [i, j] = key.split('_').map(Number);
      html += `<rect class="m-cell fq${cl}${selKey === key ? ' sel' : ''}" x="${i * s}" y="${j * s}" width="${s}" height="${s}"/>`;
    });
    m.over(html);
  }
}
function updateNearby() {
  const n = S.nb, m = S.mapRefs.nb;
  if (!m) return;
  const enc = n.kinds.has('sighting'), sur = n.kinds.has('survey');
  const cells = aggregate(n.scale, { month: n.month, town: n.town, enc: enc && n.metric === 'count', sur });
  const k = S.dx.k;
  const value = c => {
    if (!c) return 0;
    if (n.metric === 'rate') return c.s >= 3 ? klass(c.sd / c.s, RATE) : 0;
    const total = c.n + c.s;
    if (!total) return 0;
    if (n.scale === 'g1000' && total < k) return 0;
    return klass(total, BREAKS[n.scale]);
  };
  drawAreas(m, n.scale, cells, value, { hatchAll: true, selKey: n.sel?.scale === n.scale ? n.sel.key : null });
  $('#nbLegend').innerHTML = legendHTML(n.scale, n.metric) + (n.scale === 'g1000' && n.metric === 'count' ? `<span>少於 ${k} 筆的格子不顯示</span>` : '');
  renderArea(aggregate(n.scale, { month: n.month, town: n.town, enc, sur }));
  renderStoryList();
}
function renderArea(cells) {
  const n = S.nb, k = S.dx.k;
  let title, c;
  if (n.sel && n.sel.scale === n.scale) {
    title = n.scale === 'g1000' ? `1 公里網格 ${n.sel.key}` : areaName(n.scale, n.sel.key);
    c = cells.get(n.sel.key) || { n: 0, s: 0, sd: 0, min: 0 };
  } else {
    title = n.town === 'all' ? '苗栗縣全縣' : n.town;
    c = [...cells.values()].reduce((a, b) => ({ n: a.n + b.n, s: a.s + b.s, sd: a.sd + b.sd, min: a.min + b.min }), { n: 0, s: 0, sd: 0, min: 0 });
  }
  const small = n.sel && n.sel.scale === n.scale && c.n > 0 && c.n < k;
  const empty = !c.n && !c.s;
  $('#nbArea').innerHTML = `<h3>${esc(title)}</h3><p class="note">${fmtMonth(n.month)}${n.sel ? '' : '。點地圖看單一區域。'}</p>
    <dl><dt>偶遇紀錄</dt><dd>${small ? `少於 ${k} 筆` : `${c.n} 筆`}</dd><dt>持續觀察</dt><dd>${c.s} 次</dd><dt>見犬</dt><dd>${c.sd} 次</dd><dt>見犬比例</dt><dd>${c.s ? Math.round(c.sd / c.s * 100) + '%' : '—'}</dd><dt>觀察努力量</dt><dd>${c.min} 分鐘</dd></dl>
    <p class="warn">${empty ? '這裡沒有資料。可能沒有人走過，不表示沒有犬隻。' : '偶遇紀錄受使用者路線影響。跨地區比較時，請看持續觀察的見犬比例。'}</p>`;
}
function renderStoryList() {
  const n = S.nb;
  const list = S.stories.filter(s => n.kinds.has(s.kind) && (n.town === 'all' || s.town === n.town) && (n.month === 'all' || s.month === n.month));
  $('#nbList').innerHTML = `<h2 class="sec">${n.town === 'all' ? '苗栗縣' : esc(n.town)}的紀錄</h2>
    ${list.length ? `<div class="stories two">${list.map(storyHTML).join('')}</div>` : '<p class="sec-lede">這個範圍還沒有公開的紀錄。換個月份或資料類型看看。</p>'}`;
}
function mountNearby() {
  const n = S.nb;
  S.mapRefs.nb = GeoMap($('#nbMap'), {
    label: '苗栗縣聚合紀錄地圖',
    bb: n.town === 'all' ? G.bbox : townBB(n.town),
    onClick(x, y) {
      const v = villageAt(x, y);
      if (!v) { n.sel = null; return updateNearby(); }
      const key = n.scale === 'vill' ? v.c : n.scale === 'town' ? v.t : `${Math.floor(x / 100)}_${Math.floor(y / 100)}`;
      n.sel = n.sel?.key === key ? null : { scale: n.scale, key };
      updateNearby();
    },
  });
  updateNearby();
}

/* ───────── 開放資料 ───────── */
function viewData() {
  const x = S.dx;
  return `<div class="page pad">
    <div class="page-head"><h1>開放資料</h1><p class="lede">公開資料由後端篩選與聚合後才產製。這裡說明它能回答什麼、不能回答什麼，以及怎麼取得。</p></div>
    <section class="block">
      <h2 class="sec">這份資料能說什麼</h2>
      <div class="say">
        <div><b>可以說</b><b>不能說</b></div>
        <div><span>哪些地方有經檢核的目擊紀錄</span><span>這裡有多少隻狗</span></div>
        <div><span>同樣方法下，見犬比例怎麼變化</span><span>顏色最深的地方犬隻密度最高</span></div>
        <div><span>哪些地方還沒有人記錄</span><span>沒有紀錄的地方沒有狗</span></div>
      </div>
    </section>
    <section class="block">
      <h2 class="sec">資料類型</h2>
      <div class="tbl-wrap"><table>
        <thead><tr><th>類型</th><th>可支援的分析</th><th>需保留的條件</th></tr></thead>
        <tbody>
          <tr><td><b>偶遇紀錄</b></td><td>目擊分布、回報趨勢、事件線索、資料缺口</td><td>觀察時間、位置精度、來源、品質、回報方式</td></tr>
          <tr><td><b>持續觀察</b></td><td>目擊頻率、跨時間跨區比較的指標</td><td>方法、時長、路線、未見犬隻的結果</td></tr>
          <tr><td><b>整合研究</b></td><td>偏差校正後的分布或趨勢估計</td><td>足夠資料、合適模型、外部驗證、不確定性</td></tr>
        </tbody></table></div>
    </section>
    <section class="block">
      <h2 class="sec">公開尺度試算</h2>
      <p>格子越小，分析越細，也越容易指認到特定地點。調整下面的設定，看每個選擇保護什麼、失去什麼。</p>
      <div class="dx-grid">
        <div>
          <div class="map map-dx" id="dxMap"></div>
          <div class="legend" id="dxLegend"></div>
        </div>
        <div class="dx-ctl">
          <div class="field"><span>公開尺度</span><div class="seg" role="group" aria-label="公開尺度" style="flex-wrap:wrap">${[['g200', '200 公尺'], ['g1000', '1 公里'], ['vill', '村里'], ['town', '鄉鎮']].map(([s, l]) => `<button type="button" id="dx-${s}" data-act="dx-scale" data-v="${s}" ${pressed(x.scale === s)}>${l}</button>`).join('')}</div></div>
          <label class="field" for="dxK"><span>最小揭露門檻：少於 <b id="dxKv">${x.k}</b> 筆就不公開</span><span class="range-row"><input type="range" id="dxK" min="1" max="10" step="1" value="${x.k}" data-dx="k"></span></label>
          <label class="field" for="dxMonth"><span>期間</span><select id="dxMonth" data-dx="month"><option value="all">${fmtMonth('all')}</option>${C.FILTER_MONTHS.map(m => `<option value="${m}" ${x.month === m ? 'selected' : ''}>${fmtMonth(m)}</option>`).join('')}</select></label>
          <dl class="stats" id="dxStats"></dl>
          <p class="verdict" id="dxVerdict"></p>
          <button type="button" class="chip" id="dxRaw" data-act="dx-raw" ${pressed(x.raw)}>對照原始點位（僅授權者）</button>
          <p class="rawnote" id="dxRawNote" ${x.raw ? '' : 'hidden'}>這層只為討論顯示。正式版的原始座標不能傳到前端：只在畫面隱藏，API 還是會把座標送出去。</p>
        </div>
      </div>
    </section>
    <section class="block">
      <h2 class="sec">為什麼要記錄「沒看到」</h2>
      <p>同樣的觀察程序下，有犬目擊從 40 次增為 60 次，看起來變多了。完成觀察卻從 100 次增為 200 次，目擊比例其實從四成降為三成。</p>
      <div class="mult">
        <div><h3>只看次數：上升</h3>${slope([40, 60], 80, '次', 'up')}</div>
        <div><h3>看比例：下降</h3>${slope([40, 30], 50, '%', 'dn')}</div>
      </div>
      <p class="note" style="margin-top:8px">數字取自構想文件第六節的例子。比例比筆數有比較基礎，但它仍不是犬數變化。</p>
    </section>
    <section class="block">
      <h2 class="sec">下載</h2>
      <p>內容跟著上面的公開尺度與門檻變化。正式版會附方法說明、版本與授權。授權待決定。</p>
      <div class="filter-row" style="margin-top:16px">
        <div class="seg" role="group" aria-label="檔案格式"><button type="button" id="fmt-csv" data-act="dx-fmt" data-v="csv" ${pressed(x.fmt === 'csv')}>CSV</button><button type="button" id="fmt-geo" data-act="dx-fmt" data-v="geojson" ${pressed(x.fmt === 'geojson')}>GeoJSON</button></div>
        <button type="button" class="btn sm" id="dlBtn" data-act="dx-save">下載示例檔</button>
      </div>
      <pre class="preview" id="dxPreview" tabindex="0"></pre>
      <h3 style="margin-top:24px;font-size:20px">欄位字典</h3>
      <div class="tbl-wrap"><table><thead><tr><th>欄位</th><th>名稱</th><th>說明</th></tr></thead><tbody>
        ${C.FIELDS.map(([a, b, c]) => `<tr><td class="mono">${a}</td><td>${b}</td><td>${c}</td></tr>`).join('')}
      </tbody></table></div>
    </section>
  </div>`;
}
function slope([a, b], max, unit, cls) {
  const y = v => 150 - v / max * 120;
  return `<svg viewBox="0 0 320 190" role="img" aria-label="從 ${a}${unit} 變為 ${b}${unit}">
    <line class="ax" x1="40" y1="150" x2="280" y2="150"/>
    <line class="ln ${cls}" x1="70" y1="${y(a)}" x2="250" y2="${y(b)}"/>
    <circle class="pt ${cls}" cx="70" cy="${y(a)}" r="5"/><circle class="pt ${cls}" cx="250" cy="${y(b)}" r="5"/>
    <text x="70" y="${y(a) - 12}" text-anchor="middle" font-size="18" font-weight="700">${a}${unit}</text>
    <text x="250" y="${y(b) - 12}" text-anchor="middle" font-size="18" font-weight="700">${b}${unit}</text>
    <text x="70" y="174" text-anchor="middle" font-size="14">前期</text><text x="250" y="174" text-anchor="middle" font-size="14">後期</text>
  </svg>`;
}
function median(a) { const s = [...a].sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; }
function publicRows() {
  const x = S.dx, cells = aggregate(x.scale, { month: x.month });
  const period = x.month === 'all' ? '2026-05/2026-11' : x.month;
  return [...cells.values()].filter(c => c.n + c.s >= x.k).map(c => ({
    month: period, area_id: c.key, area_name: areaName(x.scale, c.key), records: c.n, surveys: c.s,
    surveys_with_dogs: c.sd, effort_minutes: c.min, quality: qualityOf(c), version: 'v0.1-sample',
  })).sort((a, b) => b.records - a.records);
}
const toCSV = rows => [C.FIELDS.map(f => f[0]).join(','), ...rows.map(r => C.FIELDS.map(f => r[f[0]]).join(','))].join('\n');
function geometryOf(key) {
  const x = S.dx, ll = r => { const o = []; for (let i = 0; i < r.length; i += 2) o.push(toLonLat(r[i], r[i + 1])); return o; };
  if (x.scale === 'vill') return { type: 'MultiPolygon', coordinates: byCode.get(key).r.map(r => [ll(r)]) };
  if (x.scale === 'town') return { type: 'MultiPolygon', coordinates: G.villages.filter(v => v.t === key).flatMap(v => v.r.map(r => [ll(r)])) };
  const s = SCALES[x.scale].size, [i, j] = key.split('_').map(Number), X = i * s, Y = j * s;
  return { type: 'Polygon', coordinates: [ll([X, Y, X + s, Y, X + s, Y + s, X, Y + s, X, Y])] };
}
const toGeoJSON = rows => ({ type: 'FeatureCollection', name: '島與群示例公開資料', features: rows.map(r => ({ type: 'Feature', properties: r, geometry: geometryOf(r.area_id) })) });
function updateData() {
  const x = S.dx, m = S.mapRefs.dx;
  if (!m) return;
  const cells = aggregate(x.scale, { month: x.month });
  const all = [...cells.values()], tot = c => c.n + c.s;
  const value = c => c && tot(c) >= x.k ? klass(tot(c), BREAKS[x.scale]) : 0;
  drawAreas(m, x.scale, cells, value, { hatchAll: true });
  m.raw(x.raw ? `<path class="m-raw" d="${D.records.filter(r => x.month === 'all' || r.month === x.month).map(r => `M${r.x.toFixed(0)} ${r.y.toFixed(0)}h0`).join('')}"/>` : '');
  const shown = all.filter(c => tot(c) >= x.k), hiddenN = all.filter(c => tot(c) < x.k).reduce((s, c) => s + tot(c), 0);
  const total = all.reduce((s, c) => s + tot(c), 0), keep = total ? Math.round((total - hiddenN) / total * 100) : 0;
  const singles = shown.filter(c => tot(c) === 1).length;
  const size = x.scale === 'g200' ? '0.04' : x.scale === 'g1000' ? '1' : x.scale === 'vill' ? median(G.villages.map(v => v.a)).toFixed(1) : median(G.towns.map(t => t.a)).toFixed(0);
  $('#dxStats').innerHTML = `<div><dt>公開區域</dt><dd>${shown.length}</dd></div><div><dt>保留的紀錄</dt><dd>${keep}%</dd></div><div><dt>只有一筆的區域</dt><dd>${singles}</dd></div><div><dt>${x.scale.startsWith('g') ? '每格面積' : '面積中位數'}</dt><dd>${size} km²</dd></div>`;
  const v = $('#dxVerdict');
  let text, risk = false;
  if (singles && x.scale === 'g200') { text = `有 ${singles} 格只有一筆紀錄。邊長 200 公尺的格子只比幾棟房子大，餵養點或住家可能被指認。`; risk = true; }
  else if (singles) { text = `有 ${singles} 個區域只有一筆紀錄，人少的地方可能被猜出是誰。建議把門檻提高到 3 以上。`; risk = true; }
  else if (keep < 65) { text = `門檻遮掉了 ${100 - keep}% 的紀錄。保護變強，但紀錄少的地區會從資料裡消失，讓資料缺口更大。`; risk = true; }
  else text = `每個公開區域至少有 ${x.k} 筆紀錄，保留了 ${keep}% 的資料。尺度和門檻仍要配合敏感紀錄的人工檢查。`;
  v.textContent = text; v.classList.toggle('risk', risk);
  const lg = legendHTML(x.scale, 'count');
  $('#dxLegend').innerHTML = lg;
  const rows = publicRows();
  const txt = x.fmt === 'csv' ? toCSV(rows.slice(0, 8)) : JSON.stringify(toGeoJSON(rows.slice(0, 1)), (k, val) => k === 'coordinates' ? '[…座標略…]' : val, 1);
  $('#dxPreview').textContent = txt + (rows.length > 8 && x.fmt === 'csv' ? `\n…共 ${rows.length} 列` : '');
}
function mountData() {
  S.mapRefs.dx = GeoMap($('#dxMap'), { label: '公開尺度試算地圖' });
  updateData();
}
let downloads = null, comments = null;
async function saveFile() {
  const x = S.dx, rows = publicRows();
  const name = `island-pack-sample-${x.scale}${x.fmt === 'csv' ? '.csv' : '.geojson.json'}`;
  const data = x.fmt === 'csv' ? '﻿' + toCSV(rows) : JSON.stringify(toGeoJSON(rows));
  if (downloads) {
    try { await downloads.save({ filename: name, data }); toast('已交給瀏覽器下載。'); }
    catch (e) { if (e?.code !== 'declined') toast('這個環境無法下載，請改用上方預覽。'); }
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type: 'text/plain' }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ───────── 管理後台 ───────── */
const FLAG_FIX = { photoPlate: ['遮蔽門牌與人臉', '已遮蔽門牌與人臉'], dup: ['合併為同一次目擊', '已與鄰近紀錄合併，保留兩筆原始資料'], claim: ['改標為他人轉述', '已將指控文字改標為他人轉述，未公開特定犬隻'] };
function ticketHTML(t) {
  const open = t.flags.filter(f => !t.fixed.includes(f));
  const val = v => v === null || v === undefined ? '—' : v === 'unk' ? '不知道' : v;
  const hp = t.user.photo;
  const row = (l, k) => `<tr><td>${l}</td><td>${val(t.user[k])}</td><td>${val(t.ai[k])}</td><td><input type="text" inputmode="numeric" id="h-${t.id}-${k}" data-human="${t.id}" data-k="${k}" value="${esc(t.human[k] ?? '')}" placeholder="${val(t.user[k])}" aria-label="人工決定：${l}"></td></tr>`;
  return `<article class="ticket">
    <div class="ticket-head"><h3>${esc(t.place)}</h3><span class="mono" style="font-size:14px">${t.id}</span></div>
    <p class="small">${esc(t.time)}${t.late ? '（補登）' : ''}${t.mine ? ' <span class="mine">你剛送出的紀錄</span>' : ''}</p>
    ${t.flagNote ? `<p class="flag">${esc(t.flagNote)}${open.length ? '' : '，已處理'}</p>` : ''}
    <div class="ticket-grid ${hp ? 'has-photo' : ''}">
      <div>
        <table class="compare"><thead><tr><th>欄位</th><th>提供者</th><th>AI 建議</th><th>人工決定</th></tr></thead>
        <tbody>${row('成犬', 'adult')}${t.user.pup !== undefined && t.user.pup !== 0 ? row('幼犬', 'pup') : ''}</tbody></table>
        <p class="small" style="margin-top:8px;white-space:pre-line">${esc(t.user.text)}</p>
        <p class="note" style="margin-top:4px">AI 備註：${esc(t.ai.note)}</p>
      </div>
      ${hp ? `<div class="photo-box">${t.draft?.photo?.kind === 'file' ? `<img src="${t.draft.photo.url}" alt="提供者的照片" ${t.fixed.includes('photoPlate') ? 'style="filter:blur(6px)"' : ''}>` : scene({ masked: t.fixed.includes('photoPlate') })}</div>` : ''}
    </div>
    <div class="ticket-act">
      ${open.map(f => `<button type="button" class="btn sm" id="fix-${t.id}-${f}" data-act="ad-fix" data-id="${t.id}" data-f="${f}">${FLAG_FIX[f][0]}</button>`).join('')}
      <button type="button" class="btn primary sm" id="ok-${t.id}" data-act="ad-ok" data-id="${t.id}" ${open.length ? 'disabled' : ''}>核准公開版本</button>
      <button type="button" class="btn sm" id="st-${t.id}" data-act="ad-stats" data-id="${t.id}">只進統計</button>
      <button type="button" class="btn quiet sm" id="rt-${t.id}" data-act="ad-return" data-id="${t.id}">退回</button>
    </div>
    ${open.length ? '<p class="note" style="margin-top:8px">處理完標記的問題才能公開。</p>' : ''}
  </article>`;
}
function triggerText(c) {
  const w = c.when, o = [];
  if (w.place) o.push('任何位置');
  if (w.hills) o.push('淺山鄉鎮');
  if (w.tags) o.push(...w.tags.map(t => ({ puppy: '幼犬', bowl: '飼料碗', chase: '追逐', hurt: '受傷受困', wantHelp: '想知道誰在協助' }[t])));
  return o.join('、');
}
function viewAdmin() {
  const tab = S.ad.tab, b = (k, l) => `<button type="button" role="tab" id="tab-${k}" data-act="ad-tab" data-v="${k}" aria-selected="${tab === k}">${l}</button>`;
  const expired = S.cards.filter(c => c.valid < C.TODAY).length;
  const pending = S.requests.filter(r => r.state === '待處理').length;
  let body = '';
  if (tab === 'queue') {
    body = `${S.queue.length ? S.queue.map(ticketHTML).join('') : '<p class="sec-lede" style="margin-top:24px">待覆核的紀錄都處理完了。</p>'}
      ${S.done.length ? `<section class="block"><h2 class="sec">已處理</h2><ul class="log">${S.done.map(d => `<li><b>${esc(d.id)}</b> ${esc(d.place)}：${esc(d.result)}${d.log.length ? '。' + esc(d.log.join('；')) : ''}</li>`).join('')}</ul></section>` : ''}`;
  } else if (tab === 'cards') {
    body = `<p class="sec-lede" style="margin-top:16px">卡片過了有效期限就不會浮現。第一版可以由團隊人工建立，每張都要有來源與更新日。</p>
      <div class="tbl-wrap"><table><thead><tr><th>卡片</th><th>觸發條件</th><th>來源</th><th>有效至</th><th>狀態</th><th>操作</th></tr></thead><tbody>
      ${S.cards.map(c => {
    const exp = c.valid < C.TODAY;
    return `<tr><td><b>${esc(c.title)}</b><br><span class="note">${esc(c.kind)}</span></td><td>${esc(triggerText(c))}</td><td class="small">${esc(c.source)}</td><td class="mono">${c.valid}</td>
          <td><span class="state ${c.off || exp ? 'off' : 'ok'}">${c.off ? '已下架' : exp ? '已過期' : '上架中'}</span></td>
          <td>${exp ? `<button type="button" class="btn sm" id="ext-${c.id}" data-act="card-extend" data-id="${c.id}">延長</button>` : `<button type="button" class="btn sm" id="off-${c.id}" data-act="card-off" data-id="${c.id}">${c.off ? '恢復' : '下架'}</button>`}</td></tr>`;
  }).join('')}
      </tbody></table></div>`;
  } else {
    body = `<div class="tbl-wrap"><table><thead><tr><th>編號</th><th>類型</th><th>提出者</th><th>內容</th><th>原因</th><th>狀態</th></tr></thead><tbody>
      ${S.requests.map(r => `<tr><td class="mono">${r.id}</td><td>${r.type}</td><td>${esc(r.who)}</td><td>${esc(r.what)}</td><td>${esc(r.why)}</td>
        <td>${r.state === '待處理' ? `<button type="button" class="btn sm" id="req-${r.id}" data-act="req-done" data-id="${r.id}">處理</button>` : '<span class="state ok">已完成</span>'}</td></tr>`).join('')}
      </tbody></table></div>`;
  }
  return `<div class="page pad">
    <div class="page-head"><h1>管理後台</h1><p class="lede">只有團隊看得到。AI 只提建議，公開前都由人決定，原始內容和修改紀錄都會保留。</p></div>
    <div class="tabs" role="tablist">${b('queue', `待覆核 ${S.queue.length}`)}${b('cards', `知識卡${expired ? `（${expired} 張過期）` : ''}`)}${b('req', `更正與下架 ${pending}`)}</div>
    ${body}
  </div>`;
}
function decide(id, result, publish) {
  const i = S.queue.findIndex(t => t.id === id);
  if (i < 0) return;
  const t = S.queue.splice(i, 1)[0];
  const log = t.fixed.map(f => FLAG_FIX[f][1]);
  Object.entries(t.human).forEach(([k, v]) => { if (v !== '') log.push(`人工將${k === 'adult' ? '成犬' : '幼犬'}改為 ${v}（原始值保留）`); });
  S.done.unshift({ id: t.id, place: t.place, result, log });
  if (t.mine) {
    t.state = publish === 'full' ? 'published' : publish === 'stats' ? 'stats' : 'returned';
    const d = t.draft;
    if (publish) {
      D.records.push({ x: d.pin.x, y: d.pin.y, vill: d.pin.code, town: d.pin.town, month: d.when.slice(0, 7), q: d.photo ? 'A' : 'B' });
      if (publish === 'full') {
        const text = d.pubText;
        S.stories.unshift({
          id: t.id, kind: text && (d.hearsay || feelText(d)) ? 'experience' : 'sighting', who: '你剛送出的紀錄', town: d.pin.town, month: d.when.slice(0, 7),
          photo: d.pubPhoto && d.photo?.kind === 'sample', title: `${d.pin.vname}的一次相遇`, seen: seenText(d),
          heard: text ? d.hearsay : '', felt: text ? feelText(d) : '',
        });
        S.nb.town = 'all'; S.nb.month = 'all';
      }
    }
  }
  toast(publish === 'full' ? '已核准。公開版本已進入「看看附近」。' : publish === 'stats' ? '已列入統計，文字與照片不公開。' : '已退回。');
  rerender();
}

/* ───────── 待決議題 ───────── */
function viewIssues() {
  const node = n => `<div class="node ${n.private ? 'private' : ''}"><h3>${esc(n.t)}</h3><p>${esc(n.d)}</p><span class="st ${n.s}">${n.s === 'mock' ? '原型已模擬' : '尚未實作'}</span></div>`;
  return `<div class="page pad">
    <div class="page-head"><h1>待決議題</h1><p class="lede">這份原型想幫忙做的事，是讓大家對著同一個東西決定。右邊是跨畫面的問題，下面是第一版範圍的建議和原型的假設。</p></div>
    <section class="block">
      <h2 class="sec">第一版建議先做到哪裡</h2>
      <p>建議先在一個鄉鎮打通「記錄、檢核、公開」這條路。這是製作原型時的判斷，不是文件內容，歡迎推翻。</p>
      <div class="tbl-wrap"><table><thead><tr><th>項目</th><th>第一版</th><th>理由</th></tr></thead><tbody>
        ${C.SCOPE.map(([a, b, c]) => `<tr><td><b>${esc(a)}</b></td><td style="white-space:nowrap">${esc(b)}</td><td>${esc(c)}</td></tr>`).join('')}
      </tbody></table></div>
    </section>
    <section class="block">
      <h2 class="sec">原型自己補上的假設</h2>
      <p>文件沒有寫到、但要做出畫面就得先定的事。這些都可以改。</p>
      <ul class="plain">
        <li>表單欄位的細節：成犬、幼犬、四種行為、四種線索。文件只舉了例子。</li>
        <li>犬隻數量與位置一律進入聚合統計，只有照片和文字由提供者決定是否公開。</li>
        <li>定點五分鐘照搬鳥類計數的時長。固定路線是原型加上的替代方案。</li>
        <li>最小揭露門檻預設 3 筆，地圖預設村里尺度。</li>
        <li>品質標記分 A、B、C 三級。</li>
        <li>哪些鄉鎮算淺山是示例規則，要請懂生態的人確認。</li>
        <li>安全提示的文字都是示例，要請獸醫或動保團體查核後才能使用。</li>
      </ul>
    </section>
    <section class="block">
      <h2 class="sec">資料流程</h2>
      <p>文件圖一的元件，加上原型目前的狀態。虛線框的內容不對外。公開地圖只讀取發布後的資料。</p>
      <div class="arch">${C.ARCH.map(r => `<div class="arch-row ${r.row.length > 1 ? 'three' : ''}">${r.row.map(node).join('')}</div>`).join('')}</div>
    </section>
    <section class="block">
      <h2 class="sec">這份原型沒有做到的事</h2>
      <ul class="plain">
        <li>沒有後端。送出的紀錄只存在這個分頁，重新整理就消失。</li>
        <li>地圖上的紀錄是用固定亂數產生的，只有村里界和道路是真實圖資。分布不代表任何實際情況。</li>
        <li>沒有真的 AI。後台的建議都是事先寫好的。</li>
        <li>沒有手機定位，也不會處理照片的定位資訊。</li>
        <li>地圖是輕量的自製版本，沒有底圖；正式版照文件用 MapLibre。</li>
      </ul>
    </section>
  </div>`;
}

/* ───────── 主流程 ───────── */
const VIEWS = { home: [viewHome, mountHome], record: [viewRecord, null], survey: [viewSurvey, null], nearby: [viewNearby, mountNearby], data: [viewData, mountData], admin: [viewAdmin, null], issues: [viewIssues, null] };
function clearMaps() { Object.values(S.mapRefs).forEach(m => m?.destroy()); S.mapRefs = {}; }
function render() {
  clearMaps();
  const [v, mount] = VIEWS[S.view];
  $('#view').innerHTML = v();
  mount?.();
  if (S.view === 'record' && !S.submitted) renderStep();
  renderNav(); syncRail();
}
function rerender() {
  const fid = document.activeElement?.id;
  render();
  if (fid) document.getElementById(fid)?.focus({ preventScroll: true });
}
function scrollTop(el) {
  const a = $('#app');
  if (document.body.dataset.device === 'phone') a.scrollTop = 0;
  else if (el) { const y = el.getBoundingClientRect().top + scrollY; if (scrollY > y) scrollTo(0, y - 8); }
  else scrollTo(0, 0);
}
function go(v) {
  if (!VIEWS[v]) return;
  if (S.timer) stopTimer();
  S.view = v;
  try { history.replaceState(null, '', '#' + v); } catch (e) { /* 預覽環境可能不允許 */ }
  render();
  scrollTop();
  if (matchMedia('(max-width:1099px)').matches) { document.body.dataset.rail = 'off'; syncRail(); }
}
const ACT = {
  device(t) {
    document.body.dataset.device = t.dataset.v;
    $$('[data-act="device"]').forEach(b => b.setAttribute('aria-pressed', b === t));
  },
  rail() { document.body.dataset.rail = document.body.dataset.rail === 'off' ? 'on' : 'off'; syncRail(); },
  reset() {
    Object.assign(S, { step: 0, draft: newDraft(), err: '', submitted: null, openCard: null, seen: [], latest: '', sv: newSurvey(), queue: copy(C.QUEUE).map(t => ({ ...t, fixed: [], human: {} })), done: [], cards: copy(C.CARDS), requests: copy(C.REQUESTS), stories: copy(C.STORIES) });
    Object.assign(D, makeData());
    toast('原型已重設。');
    go('home');
  },
  comment(t) {
    comments?.openComposer({ element: document.getElementById(t.dataset.q) }).catch(() => document.body.classList.remove('can-comment'));
  },
  timing(t) {
    S.timing = t.dataset.v;
    $$('[data-act="timing"]').forEach(b => b.setAttribute('aria-pressed', b === t));
    $('#timingNote').textContent = TIMING[S.timing];
    renderCards();
  },
  step(t) { goStep(+t.dataset.n); },
  fill(t) { fillScenario(+t.dataset.n); },
  prec(t) { S.draft.precision = t.dataset.v; $$('[data-act="prec"]').forEach(b => b.setAttribute('aria-pressed', b === t)); },
  late(t) { S.draft.late = !S.draft.late; t.setAttribute('aria-pressed', S.draft.late); },
  'photo-sample'() { S.draft.photo = { kind: 'sample' }; $('#photoBox').innerHTML = photoHTML(); },
  'photo-none'() { S.draft.photo = null; S.draft.pubPhoto = false; $('#photoBox').innerHTML = ''; },
  count(t) {
    const k = t.dataset.k, cur = S.draft[k], n = typeof cur === 'number' ? cur : 0;
    S.draft[k] = clamp(n + +t.dataset.d, 0, 30);
    S.err = ''; renderStep();
  },
  'count-unk'(t) { const k = t.dataset.k; S.draft[k] = S.draft[k] === 'unk' ? null : 'unk'; S.err = ''; renderStep(); },
  tri(t) { const { g, k, v } = t.dataset; S.draft[g][k] = S.draft[g][k] === v ? null : v; renderStep(); },
  feel(t) {
    const f = S.draft.feel, k = t.dataset.k, i = f.indexOf(k);
    if (i >= 0) f.splice(i, 1); else f.push(k);
    t.setAttribute('aria-pressed', i < 0);
    renderCards();
  },
  pub(t) { S.draft[t.dataset.k] = t.dataset.v === '1'; renderStep(); },
  card(t) { S.openCard = S.openCard === t.dataset.id ? null : t.dataset.id; renderCards(); document.getElementById(t.id)?.focus({ preventScroll: true }); },
  tray() { S.trayOpen = !S.trayOpen; S.latest = ''; renderCards(); },
  submit() { submitRecord(); scrollTop(); },
  again() { Object.assign(S, { step: 0, draft: newDraft(), submitted: null, openCard: null, seen: [], latest: '' }); render(); scrollTop(); },
  'sv-mode'(t) { stopTimer(); S.sv = { ...newSurvey(), mode: t.dataset.v, extra: S.sv.extra }; rerender(); },
  'sv-toggle'() { if (S.timer) stopTimer(); else startTimer(); rerender(); },
  'sv-fast'() { S.sv.speed = S.sv.speed > 1 ? 1 : 30; rerender(); },
  'sv-tally'(t) { const k = t.dataset.k; S.sv[k]++; $('#n-' + k).textContent = S.sv[k]; },
  'sv-end'() { stopTimer(); S.sv.phase = 'done'; rerender(); },
  'sv-send'() {
    const v = S.sv, n = v.seen + v.heard, a = D.sites[0].a;
    v.extra.push(n);
    D.surveys.push({ x: a.x, y: a.y, vill: a.v.c, town: a.v.t, month: '2026-11', has: n > 0, seen: n, min: Math.round(v.t / 60) || 1 });
    v.phase = 'sent'; rerender();
    toast(n ? '已送出。' : '已送出「未見犬隻」。');
  },
  'sv-reset'() { stopTimer(); S.sv = { ...newSurvey(), mode: S.sv.mode, extra: S.sv.extra, weather: S.sv.weather, period: S.sv.period }; rerender(); },
  'nb-kind'(t) {
    const k = t.dataset.k, s = S.nb.kinds;
    if (s.has(k)) s.delete(k); else s.add(k);
    t.setAttribute('aria-pressed', s.has(k));
    updateNearby();
  },
  'nb-scale'(t) { S.nb.scale = t.dataset.v; S.nb.sel = null; $$('[data-act="nb-scale"]').forEach(b => b.setAttribute('aria-pressed', b === t)); updateNearby(); },
  'nb-metric'(t) { S.nb.metric = t.dataset.v; $$('[data-act="nb-metric"]').forEach(b => b.setAttribute('aria-pressed', b === t)); updateNearby(); },
  org() { $('#orgNote').hidden = false; },
  'dx-scale'(t) { S.dx.scale = t.dataset.v; $$('[data-act="dx-scale"]').forEach(b => b.setAttribute('aria-pressed', b === t)); updateData(); },
  'dx-raw'(t) { S.dx.raw = !S.dx.raw; t.setAttribute('aria-pressed', S.dx.raw); $('#dxRawNote').hidden = !S.dx.raw; updateData(); },
  'dx-fmt'(t) { S.dx.fmt = t.dataset.v; $$('[data-act="dx-fmt"]').forEach(b => b.setAttribute('aria-pressed', b === t)); updateData(); },
  'dx-save'() { saveFile(); },
  'ad-tab'(t) { S.ad.tab = t.dataset.v; rerender(); },
  'ad-fix'(t) { const q = S.queue.find(x => x.id === t.dataset.id); q.fixed.push(t.dataset.f); rerender(); },
  'ad-ok'(t) { decide(t.dataset.id, '核准公開', 'full'); },
  'ad-stats'(t) { decide(t.dataset.id, '只進統計', 'stats'); },
  'ad-return'(t) { decide(t.dataset.id, '退回', null); },
  'card-off'(t) { const c = S.cards.find(x => x.id === t.dataset.id); c.off = !c.off; rerender(); },
  'card-extend'(t) { const c = S.cards.find(x => x.id === t.dataset.id); c.valid = '2027-06-30'; toast('已延長到 2027-06-30。下次填寫時會再浮現。'); rerender(); },
  'req-done'(t) { S.requests.find(x => x.id === t.dataset.id).state = '已完成'; rerender(); },
};
document.addEventListener('click', e => {
  const g = e.target.closest('[data-go]');
  if (g) { go(g.dataset.go); return; }
  const t = e.target.closest('[data-act]');
  if (t && !t.disabled) ACT[t.dataset.act]?.(t, e);
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.bind) { S.draft[t.dataset.bind] = t.value; }
  else if (t.dataset.dx === 'k') { S.dx.k = +t.value; $('#dxKv').textContent = t.value; updateData(); }
  else if (t.dataset.human) { S.queue.find(x => x.id === t.dataset.human).human[t.dataset.k] = t.value; }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'photoFile' && t.files[0]) {
    const r = new FileReader();
    r.onload = () => { S.draft.photo = { kind: 'file', url: r.result }; $('#photoBox').innerHTML = photoHTML(); };
    r.readAsDataURL(t.files[0]);
  } else if (t.dataset.nb) {
    S.nb[t.dataset.nb] = t.value; S.nb.sel = null;
    if (t.dataset.nb === 'town') S.mapRefs.nb?.fit(t.value === 'all' ? G.bbox : townBB(t.value), t.value === 'all' ? .05 : .12);
    updateNearby();
  } else if (t.dataset.dx === 'month') { S.dx.month = t.value; updateData(); }
  else if (t.dataset.sv) { S.sv[t.dataset.sv] = t.value; }
});

document.body.dataset.device = 'auto';
document.body.dataset.rail = matchMedia('(max-width:1099px)').matches ? 'off' : 'on';
renderRail();
const start = location.hash.slice(1);
S.view = VIEWS[start] ? start : 'home';
render();

/* 留言與下載由 Claude 檢視器提供；本機開啟時沒有，頁面照常運作。 */
if (window.claude?.use) {
  window.claude.use('comments').then(c => { comments = c; document.body.classList.toggle('can-comment', !!c); });
  window.claude.use('downloads').then(d => { downloads = d; });
}
})();
