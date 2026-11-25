// 在 index.html 的 <script src> 後面加上該檔內容的雜湊，例如 app.js?v=1a2b3c4d。
// 檔案一改，網址就跟著變，瀏覽器不會拿快取裡的舊 app.js、content.js 配新的 index.html（那樣首頁會空白）。
// 改完 app.js、content.js 或 miaoli.js，提交之前執行：
//   node tools/stamp.mjs
// tests/e2e.mjs 會檢查版本號是不是最新的。
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = join(ROOT, 'index.html');
const TAG = /<script src="([\w-]+\.js)(?:\?v=[0-9a-f]+)?"><\/script>/g;

export const hashOf = file => createHash('sha256').update(readFileSync(join(ROOT, file))).digest('hex').slice(0, 8);
export const stamped = html => html.replace(TAG, (_, file) => `<script src="${file}?v=${hashOf(file)}"></script>`);
export const readIndex = () => readFileSync(INDEX, 'utf8');

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const before = readIndex(), after = stamped(before);
  const tags = [...after.matchAll(TAG)].map(m => m[0].match(/src="([^"]+)"/)[1]);
  if (!tags.length) { console.error('index.html 裡找不到 <script src="….js">'); process.exit(1); }
  if (after !== before) writeFileSync(INDEX, after);
  console.log(`${after === before ? '版本號已是最新' : '已更新版本號'}：${tags.join('、')}`);
}
