# route-19 高洲南線 一次情報ソース

確認日: 2026-07-26

## 1. 京成バスナビ（正本）

停留所順は **すべて個別便通過時刻表（`/stops?`）から読み取った実データ**であり、推測は一切していない。

- 新浦安駅 系統・時刻表一覧: https://transfer-cloud.navitime.biz/keiseibus-group/courses?busstop=00020619
- 高洲海浜公園 系統・時刻表一覧: https://transfer-cloud.navitime.biz/keiseibus-group/courses?busstop=00020855
- 高洲北小学校 系統・時刻表一覧: https://transfer-cloud.navitime.biz/keiseibus-group/courses?busstop=00020720

### 2段凡例ゲート

(A) 掲載時刻表の凡例 と (B) 出発停留所ののりばの時刻表の凡例 の二段で系統を判定する。

- 新浦安駅 **のりばF** は `[10]` と `[19]` を同一セルに混載:
  - `無印…【１９系統】東京学館前、高洲四丁目、浦安南高校・特養ホーム経由　高洲海浜公園行き`
  - `み…【１０系統】東京学館前、高洲四丁目経由　みなと南（鉄鋼団地）行き`
- 高洲海浜公園 **のりば19** は `[19]` 単独（復路）
- 高洲北小学校のりば01/02は `[10]`/`[15]`/`[19]` 混載で凡例が不完全なため、(B) を決定打とする

### 採用した系統

#### `19-takasu-seaside` — 新浦安駅 → 高洲海浜公園（14停留所）

- コース: `0008200292`
- 出発のりば: **F**／符号 **無印**
- のりば凡例: 無印…【１９系統】東京学館前、高洲四丁目、浦安南高校・特養ホーム経由　高洲海浜公園行き
- のりば時刻表: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables?busstop=00020619&course-sequence=0008200254-1
- サンプル: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80f2000e/stops?departure-busstop=00020720-5&course=0008200292&datetime=2026-07-27T06:31:00%2B09:00
- 停留所順: 新浦安駅 > 入船中央エステート > 明海交差点 > 入船橋 > 高洲北小学校 > 東京学館前 > 高洲二丁目 > 順天堂大学入口 > 高洲西児童公園 > 高洲三丁目 > 高洲四丁目 > 高洲八丁目 > 浦安南高校特養ホーム > 高洲海浜公園

#### `19-shinurayasu` — 高洲海浜公園 → 新浦安駅（14停留所）

- コース: `0008200291`
- 出発のりば: **19**／符号 **無印**
- のりば凡例: 無印…【１９系統】高洲四丁目、東京学館前経由　新浦安駅行き
- のりば時刻表: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables?busstop=00020855&course-sequence=0008200291-1
- サンプル: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80f10000/stops?departure-busstop=00020720-10&course=0008200291&datetime=2026-07-27T06:07:00%2B09:00
- 停留所順: 高洲海浜公園 > 浦安南高校特養ホーム > 高洲八丁目 > 高洲四丁目 > 高洲三丁目 > 高洲西児童公園 > 順天堂大学入口 > 高洲二丁目 > 東京学館前 > 高洲北小学校 > 入船橋 > 明海交差点 > 入船中央エステート > 新浦安駅

### ゲートで除外した便（同一のりばF）

- **REJECT-route-10** 新浦安駅 → みなと南（course `0008200254`）
  - 符号 **み** → 【１０系統】
  - 高洲四丁目の次は 鉄鋼団地入口 → アライプロバンス → みなと第二 → みなと南（19系統の 高洲八丁目・浦安南高校特養ホーム・高洲海浜公園 とは分岐）

### 短絡・日祝・深夜

weekday / saturday / sunday の deep scrape で、上記2署名以外の【１９系統】確定停留所順は未検出（短絡・深夜・日祝専用なし）。

## 2. OSM

- relation `18381771` 東京ベイシティバス19系統 新浦安駅⇒東京学館・高洲四丁目⇒高洲海浜公園（network=高洲南線）
- relation `18381770` 東京ベイシティバス19系統 高洲海浜公園⇒高洲四丁目・東京学館⇒新浦安駅（network=高洲南線）

OSM platform 名 `浦安南高校・特養ホーム` はナビ表記 `浦安南高校特養ホーム` と正規化一致（`・` 除去）。

分離ガード（geometry 未使用）: ref=10 / 15 / 18 / 25。
