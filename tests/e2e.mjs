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
import { stamped, readIndex } from '../tools/stamp.mjs';

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
async function shot(name, full = true) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full });
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
    await animal('a1'); await click('#tier-squad'); await click('#ad-ready');
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

async function tiers() {
  console.log('資訊分級（#28）');
  await size(375); await open('home'); await animal('a1');
  const a1 = { range: '車站前後', health: '體重回升', care: '2 個餵食點', diary: '尾巴那個彎' };
  await check('預設是公開：看得到地標一帶，看不到範圍、健康、餵食點與日記', async () => {
    const t = await text('#view');
    return t.includes('大安區・學府里・車站一帶') && !t.includes(a1.range) && !t.includes(a1.health) && !t.includes(a1.care) && !t.includes(a1.diary) && await has('#diaryLock') && !(await has('#diaryIn'));
  });
  await check('切到小隊：多了大致範圍、健康與日記，餵食點仍鎖著', async () => {
    await click('#tier-squad'); const t = await text('#view');
    return t.includes(a1.range) && t.includes(a1.health) && t.includes(a1.diary) && !t.includes(a1.care) && await has('#diaryIn');
  });
  await check('切到照護：看得到餵食點，且註明原型不放座標', async () => {
    await click('#tier-care'); const t = await text('#tierSec');
    await shot('tier-care');
    return t.includes(a1.care) && t.includes('不放任何真實或示例座標') && (await js(`document.getElementById('tier-care').getAttribute('aria-pressed')`)) === 'true';
  });
  await check('說明寫清楚四級與原因', async () => {
    await js(`document.getElementById('tierWhy').open = true`);
    const t = await text('#tierWhy');
    return ['公開', '小隊', '照護', '敏感'].every(k => t.includes(k)) && t.includes('不顯示其他玩家') && t.includes('精確座標');
  });
  await check('重設原型後回到公開', async () => { await click('[data-act="reset"]'); await sleep(100); await animal('a1'); return await has('#diaryLock') && (await js(`document.getElementById('tier-pub').getAttribute('aria-pressed')`)) === 'true'; });
  await check('所有畫面與每張個體卡（三種眼睛）都沒有經緯度', async () => {
    const coord = `/[0-9]{2,3}\\.[0-9]{4,}|北緯|東經|經緯度/`;
    const bad = [];
    for (const v of ['home', 'record', 'survey', 'nearby', 'data', 'dex']) { await open(v); if (await js(`${coord}.test(document.getElementById('view').innerText)`)) bad.push(v); }
    await open('home');
    for (const id of ['a1', 'a2', 'a3', 'a4', 'a5']) for (const k of ['pub', 'squad', 'care']) {
      await animal(id); await click(`#tier-${k}`);
      if (await js(`${coord}.test(document.getElementById('view').innerText)`)) bad.push(`${id}/${k}`);
    }
    if (bad.length) throw new Error(bad.join('、'));
  });
}

async function wildRecord(k, cue = 'seen') {
  // 從回條按「再記一筆」才不會重新載入，已解鎖的物種卡留在記憶體裡
  if (await has('[data-act="again"]')) await click('[data-act="again"]'); else await open('record');
  await click('#sp-wild'); await click('#fill-0'); await sleep(100); await click('#next-0');
  if (cue !== 'seen') await click(`#cue-${cue}`);
  await click(`#wd-${k}`); await click('#next-1');
}
async function wildlife() {
  console.log('野生動物相遇與物種卡（#36）');
  await size(375);
  await check('種類分成鳥類、哺乳類、爬行與兩棲，另有類群與「其他」', async () => {
    await open('record'); await click('#sp-wild'); await click('#fill-0'); await sleep(100); await click('#next-0');
    const labs = await js(`[...document.querySelectorAll('#stepBody .pick .lab')].map(e => e.textContent)`);
    return ['鳥類', '哺乳類', '爬行與兩棲'].every(l => labs.includes(l)) && await has('#wd-group-bird') && await has('#wd-group-frog') && await has('#wd-other');
  });
  await check('可以選「聽見」，隻數標題跟著改', async () => { await click('#cue-heard'); return (await text('#stepBody')).includes('同時聽見幾隻'); });
  await check('選了敏感物種會提醒只公開到行政區', async () => { await click('#wd-leopard-cat'); return (await text('#stepBody .safe')).includes('只到行政區'); });
  await check('敏感物種的公開版本只到行政區、延後 30 天', async () => {
    await click('#next-1');
    const pub = await text('.pv:not(.raw)');
    await shot('wild-1-publish');
    return pub.includes('敏感物種只到行政區') && pub.includes('延後 30 天') && !pub.includes('學府里') && pub.includes('聽見 1 隻');
  });
  await check('第一次記錄到這一種，解鎖物種卡並標示「示例，待專家撰寫」', async () => {
    await click('#submit');
    await shot('wild-2-unlock');
    return (await text('#dexHead')) === '解鎖新的物種卡' && (await text('.sp-card')).includes('示例，待專家撰寫');
  });
  await check('物種卡只講紀錄與努力量，不寫族群數量', async () => {
    const t = await text('.sp-card');
    return t.includes('次散步中，有') && t.includes('不是牠的數量') && !/族群|約\s*[0-9０-９]+\s*隻|估計/.test(t);
  });
  await check('同一種再記一次不會重複解鎖', async () => { await wildRecord('light-vented-bulbul'); await click('#submit'); return (await text('#dexHead')) === '這一種你記錄過了'; });
  await check('一般物種的公開版本到里', async () => { await wildRecord('night-heron'); const ok = (await text('.pv:not(.raw)')).includes('大安區學府里'); await click('#submit'); return ok; });
  await check('只認出類群：算進「回來」，不解鎖物種卡', async () => {
    await wildRecord('group-bird'); await click('#submit');
    return !(await has('.sp-card')) && (await text('#view')).includes('認出是哪一種，就能解鎖');
  });
  await check('物種卡頁：已解鎖的可以打開，沒解鎖的不顯示名字', async () => {
    await click('#rc-dex');
    const locked = await js(`document.querySelectorAll('.dex .locked').length`), names = await text('.dex');
    await click('#dx-leopard-cat'); await shot('wild-3-dex');
    return locked === 2 && !names.includes('斯文豪氏攀蜥') && names.includes('石虎') && names.includes('黑冠麻鷺') && (await text('#spOpen')).includes('不設餵食點');
  });
  await check('首頁「回來」可以進物種卡', async () => { await open('home'); await click('#home-dex'); return (await text('h1')) === '物種卡'; });
}

async function tutorial() {
  console.log('玩法教學');
  await size(375);
  await open('home'); await js(`localStorage.clear()`); await open('home');
  await check('第一次來，首頁有「怎麼玩」提示', async () => (await has('#tutHint')) && (await text('#tutHint')).includes('怎麼玩'));
  await shot('tut-0-hint', false);
  await check('從提示進入教學，共 6 步，第 1 步沒有「上一步」', async () => {
    await click('#hint-go');
    return (await text('.tut-top h1')).includes('第 1／6 步') && !(await has('#tut-prev')) && (await has('#tut-skip'));
  });
  await check('下一步與上一步切換步驟，標題取得焦點', async () => {
    const a = await text('#tutHead');
    await click('#tut-next');
    const b = await text('#tutHead'), focused = await js(`document.activeElement?.id`);
    await click('#tut-prev');
    return a !== b && (await text('#tutHead')) === a && focused === 'tutHead';
  });
  await check('六步講到相遇、個體卡、回家旅程、野生動物、資訊分級與共同指標', async () => {
    const seen = [];
    for (let k = 0; k < 6; k++) { seen.push(await text('.tut-card')); if (k === 2) await shot('tut-3-journey', false); if (k < 5) await click('#tut-next'); }
    const all = seen.join('\n'), miss = ['相遇', '個體卡', '回家旅程', '不是先到先得', '最後一代', '物種卡', '地標一帶', '其他玩家', '沒有個人排行榜'].filter(w => !all.includes(w));
    if (miss.length) throw new Error('缺少：' + miss.join('、'));
    return (await has('#tut-start')) && !(await has('#tut-skip'));
  });
  await check('最後一步按「開始玩」回首頁，重新整理後提示不再出現', async () => {
    await click('#tut-start');
    const atHome = (await js(`location.hash`)) === '#home';
    await open('home');
    return atHome && !(await has('#tutHint')) && (await has('#home-howto'));
  });
  await check('首頁「怎麼玩」隨時可以再看且從第 1 步開始，「跳過」回首頁', async () => {
    await click('#home-howto'); await click('#tut-next'); await click('[data-go="home"]'); await click('#home-howto');
    const first = (await text('.tut-top h1')).includes('第 1／6 步');
    await click('#tut-skip');
    return first && (await js(`location.hash`)) === '#home';
  });
  await check('提示按「不用了」就收起，焦點移到「怎麼玩」', async () => {
    await js(`localStorage.clear()`); await open('home');
    await click('#hint-hide');
    return !(await has('#tutHint')) && (await js(`document.activeElement?.id`)) === 'home-howto';
  });
  await js(`localStorage.clear()`); // 後面的點擊目標、對比與版面檢查也要看得到提示
}

async function layout() {
  console.log('版面：沒有橫向捲動');
  const views = ['home', 'record', 'survey', 'nearby', 'data', 'admin', 'issues', 'animal', 'dex', 'howto'];
  for (const w of [1360, 375, 320]) for (const dark of [false, true]) {
    await size(w, dark);
    const bad = [];
    for (const v of views) { await open(v); const o = await overflow(); if (o > 0) bad.push(`${v}(${o}px)`); }
    await open('home');
    await shot(`home-${w}-${dark ? 'dark' : 'light'}`);
    await animal('a3');
    for (const step of [null, 'apply-ready', 'prep', 'home']) {
      if (step === 'apply-ready') { for (const k of ['indoor', 'family', 'vet']) await click(`#aq-${k}-yes`); await click('#ad-apply'); await click('#ad-confirm'); }
      if (step === 'home') { for (const k of ['plan', 'net', 'vet', 'chip', 'kit']) await click(`#ac-${k}`); await click('#ad-go'); }
      const o = await overflow(); if (o > 0) bad.push(`animal:${step || 'apply'}(${o}px)`);
    }
    await click('#tier-care'); await js(`document.getElementById('tierWhy').open = true`);
    { const o = await overflow(); if (o > 0) bad.push(`animal:care(${o}px)`); }
    await click('#tier-pub');
    await wildRecord('leopard-cat', 'heard'); let o = await overflow(); if (o > 0) bad.push(`wild:traits/publish(${o}px)`);
    await click('#submit'); o = await overflow(); if (o > 0) bad.push(`wild:receipt(${o}px)`);
    await click('#rc-dex'); await click('#dx-leopard-cat'); o = await overflow(); if (o > 0) bad.push(`dex:open(${o}px)`);
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
  // 改版後的畫面：所有按鈕、連結按鈕與摘要列至少 44px 高（WCAG 2.5.8 只要 24px，這裡照專案自己的 44px）
  const SMALL = `[...document.querySelectorAll('#view button, #view a.btn, #view summary')].filter(b => { const r = b.getBoundingClientRect(); return r.width && r.height < 44; }).map(b => b.id || b.textContent.trim().slice(0, 12))`;
  for (const [v, prep] of [['home'], ['animal', async () => { await open('home'); await animal('a1'); await click('#tier-squad'); }], ['dex'], ['howto']]) {
    await check(`${v}：按鈕至少 44px 高`, async () => {
      if (prep) await prep(); else await open(v);
      const small = await js(SMALL); if (small.length) throw new Error(small.join('、'));
    });
  }
}

// 文字對比：每個有直接文字的元素，用它的顏色對上最近一層不透明背景，一般字 4.5:1、大字 3:1
const CONTRAST = `(() => {
  const lum = c => { const [r, g, b] = c.map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
  const rgb = s => { const m = s.match(/[0-9.]+/g); return m ? m.map(Number) : null; };
  const bgOf = el => { for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c && (c[3] ?? 1) > .9) return c; } return rgb(getComputedStyle(document.body).backgroundColor); };
  const bad = []; let n = 0;
  for (const el of document.querySelectorAll('#view *')) {
    if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || !el.getClientRects().length) continue;
    if (el.closest('[aria-hidden="true"], .sr-only, svg')) continue;
    const fg = rgb(cs.color), bg = bgOf(el); if (!fg || !bg) continue; n++;
    const a = fg[3] ?? 1, mix = fg.slice(0, 3).map((v, i) => v * a + bg[i] * (1 - a));
    const L1 = lum(mix), L2 = lum(bg.slice(0, 3)), ratio = (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05);
    const px = parseFloat(cs.fontSize), big = px >= 24 || (px >= 18.66 && +cs.fontWeight >= 700);
    if (ratio < (big ? 3 : 4.5) && !el.disabled && !el.closest('[disabled]')) bad.push(el.textContent.trim().slice(0, 10) + ' ' + ratio.toFixed(2));
  }
  return n < 20 ? ['只檢查到 ' + n + ' 個元素'] : [...new Set(bad)];
})()`;
async function contrast() {
  console.log('文字對比');
  for (const dark of [false, true]) {
    await size(375, dark);
    for (const [v, prep] of [['home'], ['animal', async () => { await open('home'); await animal('a1'); await click('#tier-squad'); await js(`document.getElementById('tierWhy').open = true`); }], ['dex'], ['record'], ['howto']]) {
      await check(`${v} ${dark ? '深色' : '淺色'}：文字對比足夠`, async () => {
        if (prep) await prep(); else await open(v);
        // 教學每一步只有幾段字，最少元素數放寬到 5
        const bad = await js(v === 'howto' ? CONTRAST.replace('n < 20', 'n < 5') : CONTRAST); if (bad.length) throw new Error(bad.slice(0, 6).join('、'));
      });
    }
  }
}

async function taipeiAndMotion() {
  console.log('臺北市：行政區與里');
  await size(375); await open('home');
  await check('圖資是臺北市 12 行政區、456 里，里代碼不重複', async () => js(`window.TAIPEI.towns.length === 12 && window.TAIPEI.villages.length === 456 && new Set(window.TAIPEI.villages.map(v => v.c)).size === 456`));
  await check('首頁已移除苗栗，新增角色動作與野生動物入口', async () => !(await text('#view')).includes('苗栗') && await has('a[href="motion.html"]') && await has('a[href="wildlife.html"]'));
  await open('nearby'); await click('#nbToggle');
  await check('選行政區後可選里，切換行政區時重設里篩選', async () => {
    await js(`(() => {const e=document.getElementById('nb-town');e.value='大安區';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    const code=await js(`window.TAIPEI.villages.find(v=>v.t==='大安區'&&v.v==='學府里').c`);
    await js(`(() => {const e=document.getElementById('nb-vill');e.value=${JSON.stringify(code)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    const selected=(await text('#nbArea')).includes('大安區學府里');
    await js(`(() => {const e=document.getElementById('nb-town');e.value='文山區';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    return selected && (await js(`document.getElementById('nb-vill').value`))==='all';
  });
  const visit=async file=>{const loaded=once('Page.loadEventFired');await send('Page.navigate',{url:PAGE.replace('index.html',file)});await loaded;await sleep(600);};
  console.log('貓狗動作試玩');
  await visit('motion.html');
  await check('四位伙伴、八種動作與八個對照動畫載入', async () => (await js(`document.querySelectorAll('[data-pet]').length`))===4 && (await js(`document.querySelectorAll('[data-action]').length`))===8 && (await js(`document.querySelectorAll('.mini canvas').length`))===8);
  await check('四位伙伴皆可切換八種動作，畫布不是空白', async () => {
    for(const pet of ['gold','black','tabby','calico']) {
      await click(`[data-pet="${pet}"]`);
      for(const action of ['idle','run','eat','drink','happy','sad','angry','love']){
        await click(`[data-action="${action}"]`);
        if(!(await js(`document.getElementById('mainCanvas').getAttribute('aria-label').includes(document.querySelector('[data-action="${action}"]').textContent.trim())`)))return false;
      }
    }
    return (await js(`document.getElementById('mainCanvas').toDataURL().length`))>3000;
  });
  await check('暫停與播放控制可切換', async () => {await click('#pause');const stopped=(await text('#pause'))==='播放';await click('#pause');return stopped && (await text('#pause'))==='暫停';});
  for(const w of [1360,375,320]){await size(w);await check(`動作頁 ${w}px 沒有橫向溢出`,async()=>await overflow()===0);}
  console.log('野生動物造型候選');
  await visit('wildlife.html');
  await check('12 種候選有來源，指定與新增清單各 6 種',async()=>{
    const all=await js(`document.querySelectorAll('.card').length===12 && [...document.querySelectorAll('.card a')].every(a=>a.href.startsWith('https://'))`);
    await click('[data-filter="requested"]');const requested=await js(`document.querySelectorAll('.card').length===6`);
    await click('[data-filter="additional"]');const additional=await js(`document.querySelectorAll('.card').length===6`);
    await click('[data-filter="taipei"]');const taipei=await js(`document.querySelectorAll('.card').length===11 && ![...document.querySelectorAll('.card h2')].some(e=>e.textContent==='石虎')`);
    return all && requested && additional && taipei;
  });
  for(const w of [1360,375,320]){await size(w);await check(`野生動物頁 ${w}px 沒有橫向溢出`,async()=>await overflow()===0);}
}

try {
  console.log('版本號');
  await check('index.html 的 <script> 版本號是最新的（沒有的話執行 node tools/stamp.mjs）', () => readIndex() === stamped(readIndex()));
  await connect();
  await journey();
  await tiers();
  await wildlife();
  await tutorial();
  await targets();
  await contrast();
  await layout();
  await taipeiAndMotion();
  await check('主控台沒有錯誤', () => { const p = problems.filter(x => !/favicon|ERR_FILE_NOT_FOUND|fonts\.g/.test(x)); if (p.length) throw new Error(p.slice(0, 3).join(' / ')); });
} catch (e) { fail++; console.log(`✗ 測試中斷：${e.message}`); }
finally { cleanup(); }
console.log(`\n通過 ${pass} 項，失敗 ${fail} 項`);
process.exit(fail ? 1 : 0);
