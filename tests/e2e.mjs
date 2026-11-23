// 端對端測試（#29）：用本機 Chrome 無頭模式載入 index.html，點過主要流程並檢查版面。
// 不需要安裝套件；需要 Node 22 以上（內建 WebSocket）與 Google Chrome。
//   node tests/e2e.mjs            跑全部檢查
//   node tests/e2e.mjs --shots    另外把手機截圖存到 tests/shots/
// 以 file:// 載入並加 --allow-file-access-from-files，canvas 才能讀像素零件。
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = pathToFileURL(join(ROOT, 'index.html')).href;
const SHOTS = process.argv.includes('--shots') ? join(ROOT, 'tests', 'shots') : null;
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9300 + Math.floor(Math.random() * 500);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'e2e-chrome-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--allow-file-access-from-files', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { chrome.kill(); } catch { /* 已結束 */ } try { rmSync(profile, { recursive: true, force: true }); } catch { /* 略過 */ } };

let ws, seq = 0;
const pending = new Map(), waiters = [], problems = [];
function send(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => pending.set(id, { res, rej }));
}
const once = method => new Promise(r => waiters.push({ method, r }));
async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const pg = list.find(t => t.type === 'page');
      if (pg) { ws = new WebSocket(pg.webSocketDebuggerUrl); break; }
    } catch { /* Chrome 還沒好 */ }
    await sleep(200);
  }
  if (!ws) throw new Error('連不上 Chrome');
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); return; }
    if (m.method === 'Runtime.exceptionThrown') problems.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') problems.push(m.params.args.map(a => a.value ?? a.description).join(' '));
    for (let i = waiters.length - 1; i >= 0; i--) if (waiters[i].method === m.method) { waiters[i].r(m.params); waiters.splice(i, 1); }
  };
  await send('Page.enable'); await send('Runtime.enable');
}
async function js(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function size(w, dark = false) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: w < 768 ? 812 : 900, deviceScaleFactor: w < 768 ? 2 : 1, mobile: w < 768 });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }] });
}
async function open(view = 'home') {
  const loaded = once('Page.loadEventFired');
  await send('Page.navigate', { url: `${PAGE}?r=${Math.random().toString(36).slice(2)}#${view}` });
  await loaded; await sleep(400);
}
const click = async sel => { const ok = await js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e || e.disabled) return false; e.click(); return true; })()`); if (!ok) throw new Error(`點不到 ${sel}`); await sleep(60); };
const text = sel => js(`document.querySelector(${JSON.stringify(sel)})?.innerText ?? ''`);
const has = sel => js(`!!document.querySelector(${JSON.stringify(sel)})`);
const overflow = () => js(`(() => { const d = document.documentElement, a = document.getElementById('app'); return Math.max(d.scrollWidth - d.clientWidth, a ? a.scrollWidth - a.clientWidth : 0); })()`);
async function shot(name) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(join(SHOTS, name + '.png'), Buffer.from(data, 'base64'));
}

let pass = 0, fail = 0;
async function check(name, fn) {
  try { const r = await fn(); if (r === false) throw new Error('結果不符'); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}：${e.message}`); }
}
const animal = async id => { await click('[data-go="home"]').catch(() => {}); await click(`#am-${id}`); };

async function journey() {
  console.log('回家旅程（#27）');
  await size(375); await open('home');
  await check('麒麟（第 3 關）可由中途確認「準備好」', async () => {
    await animal('a1'); await click('#ad-ready');
    return (await text('.a-journey li.cur h3')) === '回家' && await has('#ad-apply');
  });
  await check('申請要三題都回答「是」才能送出', async () => {
    await click('#aq-indoor-yes'); await click('#ad-apply');
    return (await text('#adErr')).includes('三個問題') && await has('#ad-apply');
  });
  await check('申請說明寫明不是先到先得', async () => (await text('.adopt')).includes('不是先到先得'));
  await shot('journey-1-apply');
  await check('送出申請後等待確認，申請人加進小隊', async () => {
    await click('#aq-family-yes'); await click('#aq-vet-yes'); await click('#ad-apply');
    return await has('#ad-confirm') && (await text('.squad')).includes('中途與家 你');
  });
  await check('確認後出現行前清單，未完成前不能接回家', async () => {
    await click('#ad-confirm');
    return await js(`document.getElementById('ad-go').disabled`) && (await js(`document.querySelectorAll('.ad-check [role=checkbox]').length`)) === 5;
  });
  await check('五項都打勾後可以接牠回家', async () => {
    for (const k of ['plan', 'net', 'vet', 'chip', 'kit']) await click(`#ac-${k}`);
    await shot('journey-2-prep');
    return !(await js(`document.getElementById('ad-go').disabled`));
  });
  await check('回家後小隊每個人共享同一枚徽章，沒有排行榜', async () => {
    await click('#ad-go');
    const n = await js(`document.querySelectorAll('.squad li').length`), t = await text('.home-badge');
    return t.includes(`${n} 人共享`) && t.includes('沒有個人排行榜') && !(await js(`/排行|名次|第一名/.test(document.body.innerText.replace('沒有個人排行榜',''))`));
  });
  await check('7、30、90 天回訪完成後旅程走完', async () => {
    for (let i = 0; i < 3; i++) await click('#ad-visit');
    await shot('journey-3-visits');
    return !(await has('#ad-visit')) && (await js(`document.querySelectorAll('.a-journey li.done').length`)) === 6 && (await js(`document.querySelectorAll('.ad-steps li.done').length`)) === 4 && (await text('.diary')).includes('回家 90 天');
  });
  await check('最後一代分支可以示範', async () => {
    await open('home'); await animal('a1'); await click('#ad-last');
    return (await js(`document.querySelectorAll('.a-journey li.paused').length`)) === 3 && await has('#ad-back');
  });
  await check('變得親人時可以回到「準備好」', async () => {
    await animal('a2'); await click('#ad-back');
    return (await text('.a-journey li.cur h3')) === '準備好' && await has('#ad-ready');
  });
  await check('重設原型後旅程還原', async () => {
    await animal('a3'); for (const k of ['indoor', 'family', 'vet']) await click(`#aq-${k}-yes`); await click('#ad-apply');
    if (await has('#ad-apply')) return false;
    await click('[data-act="reset"]'); await sleep(100); await animal('a3');
    return await has('#ad-apply') && !(await text('.squad')).includes('中途與家 你');
  });
}

async function layout() {
  console.log('版面：沒有橫向捲動');
  const views = ['home', 'record', 'survey', 'nearby', 'data', 'admin', 'issues', 'animal'];
  for (const w of [1360, 375, 320]) for (const dark of [false, true]) {
    await size(w, dark);
    const bad = [];
    for (const v of views) { await open(v); const o = await overflow(); if (o > 0) bad.push(`${v}(${o}px)`); }
    await open('home'); await animal('a3');
    for (const step of [null, 'apply-ready', 'prep', 'home']) {
      if (step === 'apply-ready') { for (const k of ['indoor', 'family', 'vet']) await click(`#aq-${k}-yes`); await click('#ad-apply'); await click('#ad-confirm'); }
      if (step === 'home') { for (const k of ['plan', 'net', 'vet', 'chip', 'kit']) await click(`#ac-${k}`); await click('#ad-go'); }
      const o = await overflow(); if (o > 0) bad.push(`animal:${step || 'apply'}(${o}px)`);
    }
    await check(`${w}px ${dark ? '深色' : '淺色'}`, () => { if (bad.length) throw new Error(bad.join('、')); });
  }
}

async function targets() {
  console.log('點擊目標');
  await size(375); await open('home'); await animal('a3');
  await check('回家旅程的按鈕至少 44px 高', async () => {
    const small = await js(`[...document.querySelectorAll('.adopt button')].filter(b => b.getBoundingClientRect().height < 44).map(b => b.id || b.textContent.trim())`);
    if (small.length) throw new Error(small.join('、'));
  });
}

try {
  await connect();
  await journey();
  await targets();
  await layout();
  await check('主控台沒有錯誤', () => { const p = problems.filter(x => !/favicon|ERR_FILE_NOT_FOUND|fonts\.g/.test(x)); if (p.length) throw new Error(p.slice(0, 3).join(' / ')); });
} catch (e) { fail++; console.log(`✗ 測試中斷：${e.message}`); }
finally { cleanup(); }
console.log(`\n通過 ${pass} 項，失敗 ${fail} 項`);
process.exit(fail ? 1 : 0);
