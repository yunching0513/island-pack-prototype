# 像素零件

每隻動物的形象，是程式依相遇時填的特徵把零件疊起來的，由程式繪製。完整的設計規格在設計需求書；這份說明程式怎麼讀這些檔案，方便設計夥伴接手。

**現在這些圖都是暫代品**，由 `tools/make_placeholders.py` 用幾何形狀畫成。設計師的正式圖交來時，用同樣的檔名直接覆蓋，不用改程式。

### 大眼睛版本（2026-11-26）

貓狗改為圓臉、大眼睛、雙高光和短腿，身體仍朝右，臉略轉向觀者。成年與幼年、各種毛色與花紋、尾巴、剪耳、懷孕與三腳零件同步重繪；野生動物維持原樣。眼睛與表情使用固定顏色，黑毛或花紋不會把眼睛蓋掉。

[前後對照](../docs/cute-sprites-preview.png)（每格上方為原版，下方為新版）。更新圖檔時，同時更新 `app.js` 的 `PX_ASSET_VERSION`，再執行 `node tools/stamp.mjs`，避免瀏覽器沿用舊圖。

## 畫布與顏色

- 48×48 像素、透明背景，動物側面朝右，腳踩第 44 列（從 0 起算）。
- 外圍 1 像素描邊 `#1e1a24`。
- 身體與尾巴只用四個代換色：暗 `#404040`、中 `#808080`、亮 `#b0b0b0`、高光 `#e0e0e0`。程式會換成毛色（黑、白、橘、灰、棕、黃）；毛色還沒有人填時，換成淡紫灰。
- 花紋、眼睛、鼻子、野生動物用固定顏色，不會被換掉。所以花紋裡不要用到上面四個代換色。
- **洋紅 `#ff00ff` 代表「擦掉」**：剪耳與三腳這類拿掉一塊的零件，用洋紅畫出要擦掉的像素，其餘像素照常疊上去（例如剪耳後新的描邊）。
- 半透明的像素（alpha 小於 128）會被略過，請只用全透明或全不透明。

## 疊的順序（由下往上）

| 順序 | 圖層 | 檔名 | 什麼時候出現 |
| --- | --- | --- | --- |
| 1 | 身體 | `cat-body-adult-stand-0.png` | 一定有；幼年用 `juvenile`，高齡與不知道用 `adult` |
| 2 | 毛色 | （不另畫，替換代換色） | |
| 3 | 花紋 | `cat-pattern-tabby-adult-stand.png` | 填了純色以外的花紋 |
| 4 | 尾巴 | `cat-tail-kinked-adult-stand.png` | 一定有；沒填時貓用 `normal`、狗用 `curled` |
| 5 | 剪耳 | `cat-ear-left-flat-adult-stand.png` | 填了左耳或右耳；目前只用平剪 `flat`，`v` 也已備好 |
| 6 | 體態 | `cat-condition-pregnant-adult-stand.png` | 懷孕、三腳（`tripod`）；偏瘦、跛行與皮膚狀況只寫在文字裡 |
| 7 | 表情 | `cat-face-normal-adult-stand.png` | 一定有；目前只有 `normal` |

狗把 `cat` 換成 `dog`。野生動物是一整張圖、用固定顏色：`wild-night-heron-0.png`（黑冠麻鷺）、`wild-red-bellied-squirrel-0.png`（赤腹松鼠）、`wild-light-vented-bulbul-0.png`（白頭翁）、`wild-leopard-cat-0.png`（石虎，敏感物種）、`wild-swinhoe-lizard-0.png`（斯文豪氏攀蜥）。只認出類群時用淡紫灰剪影：`wild-group-bird-0.png`（鳥類）、`wild-group-squirrel-0.png`（松鼠類）、`wild-group-frog-0.png`（蛙類）。物種名單待野保顧問確認。

動物朝右，所以看得到的是牠的**右側**：靠近觀者的耳朵是右耳，後面那隻是左耳。

## 變體

| 圖層 | 貓 | 狗 |
| --- | --- | --- |
| 花紋 | `tabby` 虎斑、`calico` 三花、`tortie` 玳瑁、`tuxedo` 乳牛、`white-tabby` 白底虎斑 | `brindle` 虎斑、`piebald` 花斑、`socks` 白襪、`chest` 白胸 |
| 尾巴 | `normal` 一般、`short` 短尾、`kinked` 麒麟尾 | `curled` 捲尾、`drooped` 垂尾、`short` 短尾 |

同一組特徵永遠疊出同一張圖。重新產生暫代圖：

```
python3 tools/make_placeholders.py
```

## 造型與動作試玩素材

`pixel-pals-atlas.png` 與兩張 `wildlife-concepts-*.png` 為本次另行選定的生成式像素概念稿。前者用於 `motion.html` 的分層骨架試作；後者用於 `wildlife.html` 的候選圖鑑。野生動物圖稿只做造型研究，未全部進入紀錄表單，亦不代表臺北市的出沒紀錄。詳見 ATTRIBUTION.md。
