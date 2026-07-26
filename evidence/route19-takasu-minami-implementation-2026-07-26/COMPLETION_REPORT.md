# route-19 高洲南線 実装完了レポート

実施日: 2026-07-26 ／ 対象: `route-19`（系統19・高洲南線・東京ベイシティ交通）

## 1. 結論

京成バスナビの個別便通過時刻表と出発のりば凡例ゲートで route-19 と確定できた **2パターン** を実装した。
専用 OSM relation（`ref=19`）が往復とも存在し、composition / 短絡は不要。全静的品質ゲート通過。

コミット・プッシュなし。本番D1へのPUTなし。route-1〜18 の path/hash/stops は未変更。
CACHE は `chidori-route-map-v110` → **`chidori-route-map-v111`**。

| systemKey | 方向 | 符号 | のりば | 起点 → 終点 | 停留所 | path点数 | OSM | course |
| --- | --- | --- | --- | --- | ---: | ---: | --- | --- |
| `19-takasu-seaside` | outbound | 無印 | 新浦安駅 F | 新浦安駅 → 高洲海浜公園 | 14 | 197 | 18381771 | 0008200292 |
| `19-shinurayasu` | inbound | 無印 | 高洲海浜公園 19 | 高洲海浜公園 → 新浦安駅 | 14 | 186 | 18381770 | 0008200291 |

pathHash（SHA-256）:

- `19-takasu-seaside`: `77b15f94c1ce5acbf973627fa6c12eb4e439b01b28f33f9f4fbf34a61e35a417`
- `19-shinurayasu`: `d53830fdb2969a022fe935fddca428c84ea8bf44a5632f130dbeea6b30784129`

## 2. 10 / 15 / 18 / 25 との分離

| 混同リスク | 分離手段 |
| --- | --- |
| 新浦安駅のりばFで [10]/[19] 同一セル | (B) 凡例: **無印=19** / **み=10** |
| 高洲四丁目まで同一順 | 次停留所: 19→高洲八丁目／10→鉄鋼団地入口 |
| 15系統（潮音の街・高洲中央公園・高洲） | のりばE、中盤分岐、専用 exclusives |
| 18系統（夢海の街・高洲橋） | のりばE、明海大学前側 |
| 25系統（舞浜方面） | 経由地不一致 |

19系統固有: **浦安南高校特養ホーム**（ナビ表記）／OSM `浦安南高校・特養ホーム`。

## 3. 成果物

ルートモジュール（globals `TAKASU_MINAMI_LINE_*`）:

- `takasu-minami-line-platforms-v1.js`
- `takasu-minami-line-path-v1.js`
- `takasu-minami-line-path-policy-v1.js`
- `takasu-minami-line-stop-images-v1.js` / `.css`（画像バンク空・発明なし）
- `takasu-minami-line-route-v1.js`

配線:

- `route-assets-loader.js` PACKS `route-19` `?v=111`
- `service-worker.js` `CACHE_NAME = chidori-route-map-v111`
- `index.html` loader `?v=111`
- `data.js` 既存 stub `[19,'高洲南線']` を利用

## 4. 品質ゲート

- `_verify_generated.js` → ok（sibling relation/stop 非混入、©山本信勝維持、v111）
- `_geometry_qa.js` → ok（10/15/18 path と同一・反転でない）
- pathHash distinct / 往復 exact reverse でない / blockers なし

## 5. 未実施・注意

- deep scrape は背景実行中の可能性あり（署名2本は確定済み）。最終 tripCount は `_navi_deep_raw.json` 完成後に更新可。
- ブラウザ drive / PWA offline の自動スクショは未取得（静的ゲートは通過）。
- 停留所画像は空バンク（発明禁止）。
