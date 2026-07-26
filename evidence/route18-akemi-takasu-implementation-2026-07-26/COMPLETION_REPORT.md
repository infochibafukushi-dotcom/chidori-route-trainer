# route-18 明海・高洲線 実装完了レポート

実施日: 2026-07-26 ／ 対象: `route-18`（系統18・明海・高洲線・東京ベイシティ交通）

## 1. 結論

京成バスナビの個別便通過時刻表で route-18 と確定できた **5パターン** をすべて実装した。
専用の OSM relation（`ref=18`）を持つ **3系統** に加え、専用 relation が無い
**新浦安駅発着の短縮便 2系統** は、route-18 自身の relation だけで道路形状を構成できることを
実データで証明したうえで **検証済み composition** として実装した（§4）。全品質ゲートを通過。

コミット・プッシュなし。本番D1へのPUTなし。route-1〜17 のファイル・path・hash・停留所は未変更。
CACHE は `chidori-route-map-v110` のまま（パック bump 不要）。

| systemKey | 方向 | 符号 | のりば | 起点 → 終点 | 停留所 | path点数 | 距離 | OSM / composition | 便数 |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | --- | ---: |
| `18-takasu-seaside` | outbound | ゆ | 浦安駅入口 11 | 浦安駅入口 → 高洲海浜公園 | 15 | 292 | 5,410 m | rel 18352908 | 144 |
| `18-urayasu-eki-iriguchi` | inbound | う | 高洲海浜公園 03 | 高洲海浜公園 → 浦安駅入口 | 15 | 247 | 4,987 m | rel 18352907 | 150 |
| `18-takasu-kita-shogakko` | night short-turn | た / ★た | 新浦安駅 E | 新浦安駅 → 高洲北小学校 | 16 | 227 | 4,226 m | rel 18417590 | 145 |
| `18-takasu-seaside-from-shinurayasu` | outbound-shortturn | ゆ | 新浦安駅 E | 新浦安駅 → 高洲海浜公園 | 9 | 146 | 2,751 m | composed 18417590+18352908 | 130 |
| `18-shinurayasu-from-takasu` | inbound-shortturn | ゆ | 高洲海浜公園 03 → 降車 X | 高洲海浜公園 → 新浦安駅 | 9 | 131 | 2,674 m | composed 18352907+18352908→X | 145 |

pathHash（SHA-256）:

- `18-takasu-seaside`: `4b04f78629731300a84cf4e23918efd749edf9f9693ad5fb63317790d403b5f3`（resolvedVersion `2026-07-26-akemitakasu18-takasu-seaside-v1`）
- `18-urayasu-eki-iriguchi`: `dda9ecbf8a09875cc1f015e85116824e1ce020a48b1d6d064211a69fb41bb92b`（resolvedVersion `2026-07-26-akemitakasu18-urayasu-eki-iriguchi-v1`）
- `18-takasu-kita-shogakko`: `34fde1f156be7a37feabf25c3ac47665b30a59f142bc43e899a7d3d45e148778`（resolvedVersion `2026-07-26-akemitakasu18-takasu-kita-shogakko-v1`）
- `18-takasu-seaside-from-shinurayasu`: `76a7e2a442236d25ad0e5f622011f02a0b05d032b8565eb6e2bc096fdb9bc5b4`（resolvedVersion `2026-07-26-akemitakasu18-takasu-seaside-from-shinurayasu-v1`）
- `18-shinurayasu-from-takasu`: `4c7fb0b0a7861a392217e21184b27eb93b14c27a3df2248da8efdd80a744e520`（resolvedVersion `2026-07-26-akemitakasu18-shinurayasu-from-takasu-v1`）

### 確定した停留所順（`official-stop-orders.json` 正本）

- **`18-takasu-seaside`**（ゆ…【１８系統】新浦安駅・高洲橋経由　高洲海浜公園行き）
  浦安駅入口 → 神明裏 → 猫実 → 消防本部前 → 海楽 → 美浜東団地 → 新浦安駅 → 入船中央エステート
  → 明海大学前 → 海風の街 → 夢海の街 → 高洲橋 → 高洲中央公園 → 潮音の街 → 高洲海浜公園
- **`18-urayasu-eki-iriguchi`**（う…【１８系統】夢海の街、新浦安駅経由　浦安駅入口行き）
  高洲海浜公園 → 潮音の街 → 高洲中央公園 → 高洲橋 → 夢海の街 → 海風の街 → 明海大学前
  → 入船中央エステート → 新浦安駅 → 美浜東団地 → 海楽 → 消防本部前 → 猫実 → 神明裏 → 浦安駅入口
- **`18-takasu-kita-shogakko`**（た…【１８系統】夢海の街・潮音の街・高洲四丁目経由　高洲北小学校行き＜★；深夜バス 運賃倍額＞）
  新浦安駅 → 入船中央エステート → 明海大学前 → 海風の街 → 夢海の街 → 高洲橋 → 高洲中央公園
  → 潮音の街 → 高洲八丁目 → 高洲四丁目 → 高洲三丁目 → 高洲西児童公園 → 順天堂大学入口
  → 高洲二丁目 → 東京学館前 → 高洲北小学校
- **`18-takasu-seaside-from-shinurayasu`**（ゆ…【１８系統】新浦安駅・高洲橋経由　高洲海浜公園行き／course `0008200288`）
  新浦安駅 → 入船中央エステート → 明海大学前 → 海風の街 → 夢海の街 → 高洲橋 → 高洲中央公園
  → 潮音の街 → 高洲海浜公園
- **`18-shinurayasu-from-takasu`**（ゆ…【１８系統】／course `0008200287`）
  高洲海浜公園 → 潮音の街 → 高洲中央公園 → 高洲橋 → 夢海の街 → 海風の街 → 明海大学前
  → 入船中央エステート → 新浦安駅（降車専用のりばX）

指定された経由地の確認結果:
消防本部前 **○**（浦安駅入口発着の通し便のみ。新浦安駅発着便には無い）／
明海大学前 ○ ／ 夢海の街 ○ ／ 高洲橋 ○ ／ 高洲中央公園 ○ ／ 潮音の街 ○ ／
高洲四丁目 **○（夜間の高洲北小学校行きのみ）** ／ 高洲海浜公園 ○ ／ 高洲北小学校 **○（同上）**。

5本の pathHash はすべて相異なる。往路・復路が完全な逆順配列でないこと、
夜間短縮が通し便の連続部分列でないことを検査済み。
往路短縮 `18-takasu-seaside-from-shinurayasu` は通し便 `18-takasu-seaside` の連続部分列だが、
**のりばE始発の検証済み composition** として明示許可（`allowedContiguousSlicePairs`）。
復路短縮 `18-shinurayasu-from-takasu` は通し復路の連続部分列ではない（終点がのりばXのため）。

## 2. 18系統と 15 / 19 / 10 / 11 / 3 / 23 系統の分離（本件の最重要点）

**新浦安駅 のりばE では 15系統と 18系統が完全同一文言のコース名で混載される**:

```
15 [15]高洲海浜公園(潮音の街・高洲四丁目経由)高洲北小学校行
18 [18]高洲海浜公園(潮音の街・高洲四丁目経由)高洲北小学校行
   [深夜]高洲海浜公園(潮音の街・高洲四丁目経由)高洲北小学校行
```

コース名・行先・経由表記のすべてが一致するため、**コース名では絶対に分離できない**。
のりばHでは [11]/[18]/[23]/[3]、高洲海浜公園・高洲北小学校のりばでは [10]/[15]/[19] が混載される。

採用したゲートは route-15/17 と同じ二段:

1. **(A) 便が掲載されていた時刻表の凡例**（符号 → 【Ｎ系統】）
2. **(B) その便の出発停留所ののりばの時刻表の凡例** ← 決定打

(B) が【１８系統】に解決し、かつ (A) が18以外に解決していない便のみを採用した。

| 判定 | 便数 | 内容 |
| --- | ---: | --- |
| ACCEPT-route18（実装） | 714 | 5系統（144 + 150 + 145 + 130 + 145） |
| REJECT-route-15 | 678 | のりばE 無印 ほか |
| REJECT-route-3 | 534 | 望海の街・明海五丁目 側 |
| REJECT-route-11 | 263 | ベイパーク・ベイモール 側 |
| REJECT-route-23 | 3 | 同上系列 |
| UNDECIDED（凡例で18と確定できず除外） | 143 | 下記3コース |

同一のりばEで最も紛らわしい `0008200278`（346便）は
凡例が「無印…【１５系統】東京学館前経由　高洲海浜公園行き」に解決したため落とした。

### 15 / 19 / 10 との識別表

| | 18系統 | 15系統 | 19系統 | 10系統 |
| --- | --- | --- | --- | --- |
| 新浦安駅のりば | E（符号 た/★た/ゆ）/ H | E（無印） | — | — |
| 明海大学前 | ○ | × | × | × |
| 海風の街 | ○ | × | × | × |
| 夢海の街 | ○ | × | × | × |
| 高洲橋 | ○ | × | × | × |
| 明海交差点 | × | ○ | × | × |
| 入船橋 | × | ○ | × | × |
| 高洲（停留所） | × | ○ | × | × |
| 浦安南高校 / 特別養護老人ホーム | × | × | ○ | × |
| みなと南 | × | × | × | ○ |
| OSM relation | 18352908 / 18352907 / 18417590 | 18419865 / 18419864 | 18381771 / 18381770 | 18381757 / 18381756 |

18系統固有の識別停留所は **明海大学前 / 海風の街 / 夢海の街 / 高洲橋** の4つ。
15系統固有は **明海交差点 / 入船橋 / 高洲**。
なお **東京学館前・高洲四丁目・潮音の街・高洲中央公園・高洲北小学校 は 18系統にも実在する**ため
禁止語に入れていない（15/19 と共有する停留所であり、これ単体では系統を判定できない）。

### 除外できなかった3コース（UNDECIDED）

いずれも出発のりばの凡例に該当符号が無く【１８系統】と確定できなかったため、
**安全側に倒して route-18 から除外**した。

| course | 便数 | 内容 | 混載表記 |
| --- | ---: | --- | --- |
| `0008200269` | 4 | 新浦安駅 → 浦安駅入口（消防本部前経由・7停留所） | [11]/[18]/[23]/[3] のりばH |
| `0008200306` | 11 | 舞浜駅 → 高洲海浜公園（15停留所） | [15]/[18]/[25] |
| `0008200279` | 128 | 日の出七丁目 → 新浦安駅（10停留所） | [11]/[16]/[18]/[3] |

`0008200279` は route-16 の日の出線便（海風の街・明海大学前 を含むため候補に挙がった）。
`0008200306` は舞浜駅発の別系統。いずれも18系統としての凡例確定が取れていない。

### コード側の排除ガード（実測結果つき）

- 15/19/10/11/3/23/25/16/17 の OSM relation ID を参照したら path ビルドとジオメトリQAが例外停止
  → 実測 `_geometry_qa_report.json` の `siblingRelationsUsed` は `[]`
- 他系統固有停留所が生成モジュールのデータ領域やランタイム停留所名に現れたら失敗
  → 実測 `siblingStopsUsed` は `[]`、ローカル検証の混入チェックも5系統すべて空
- 生成モジュールに route-15/16/17 の識別子が混入していないか静的検査
  → `_verify_generated_report.json` 101項目すべて pass、blockers 0
- ローカル検証で route-15 / route-17 のランタイム pathHash と path点数が
  各 evidence の記録値と一致 → 5系統すべて `unchanged: true`

route-15/16/17 の path・停留所配列を読み取って反転・流用した箇所は存在しない。
route-18 の道路形状は `ref=18` の OSM relation 3件のみから生成している
（短縮便もこの3件の検証済み接合のみ。sibling relation は未使用）。

## 3. 夜間短縮便（高洲北小学校止まり）の分離結果 ← 指定事項

**結論: 独立した1系統 `18-takasu-kita-shogakko` として実装した。通し便の延長・切詰めではない。**

- バスナビ上の course は2本（`0008200289` = 符号 `た`、`0008200290` = 符号 `★た`）だが、
  16停留所の順序が完全一致するため **1系統に統合**し、運賃差は `fareVariants` に記録した。

| course | 符号 | 出発時台（実測） | 深夜運賃 |
| --- | --- | --- | --- |
| `0008200289` | た | 19–23時（27便） | 通常 |
| `0008200290` | ★た | 23時・00時（2便） | **倍額（深夜バス）** |

  凡例は両方とも「＜★；深夜バス 運賃倍額＞」を持ち、★付き符号のみが倍額対象。
  アプリは運賃を扱わないため表示上は1系統だが、正本JSONには両courseとURLを残した。
- **path は専用 relation `18417590` から生成**。潮音の街（第8停留所）以降で
  高洲八丁目 → 高洲四丁目 → … → 高洲北小学校 と、通し便（潮音の街 → 高洲海浜公園）から分岐するため、
  `18-takasu-seaside` の path の切詰めでは表現できない。実測でも
  `isContiguousSlice: false` / `isExactReverse: false`。
- 同じ **のりばE に混載される15系統（無印）の path は流用していない**（§2のガード参照）。
- **高洲北小学校 始発の18系統便は存在しない**。高洲北小学校（`00020720`）の courses 一覧は
  [10]/[15]/[19] の2コースのみで [18] の発便が無いことを実測で確認したため、
  逆方向（高洲北小学校 → 新浦安駅）の夜間便は実装していない。

## 4. 新浦安駅発着の短縮便2パターン（検証済み composition で実装）

便としては (B) のりば凡例で **route-18 と確定**。専用の `ref=18` relation は OSM に存在しないが、
route-18 自身の relation だけで道路形状を構成できることを実データで証明したため実装した。
**blind mid-station slice は禁止**。のりばE始発／降車のりばX の検証を必須とする。

証拠: `_shortturn_join_analysis.json` / `_rotary_order_analysis.json` /
`_shinurayasu_berth_probe.json` / `_turn_restriction_probe.json`。

| course | systemKey | 便数 | 符号 | 区間 | 停留所 | pathSource |
| --- | --- | ---: | --- | --- | ---: | --- |
| `0008200288` | `18-takasu-seaside-from-shinurayasu` | 130 | ゆ | 新浦安駅 → 高洲海浜公園 | 9 | `composed-verified:18417590[0..20]+18352908[47..]=18352908-from-berth-E` |
| `0008200287` | `18-shinurayasu-from-takasu` | 145 | ゆ | 高洲海浜公園 → 新浦安駅 | 9 | `composed-verified:18352907[0..12]+18352908[720406629,906161755]->berth-X` |

### `18-takasu-seaside-from-shinurayasu`（往路短縮）

- 出発 platform は 18417590 と 18352908 で **同一 node `8415001161`（local_ref=E）**
- 18417590 の way member 列 `[0..20]` は 18352908 の way member 列 `[26..46]` と
  way ID・順序ともに完全一致（21 way）
- 両者は way 1338975833 の終端ノード `288796885` で分岐し、短縮便は 18352908 の
  `1342409929`（高洲海浜公園方向）へ進む
- したがって path ≡ 18352908 ののりばE発車位置以降。これは通し便 path の連続部分列だが、
  **berth-E 検証済み**のため `allowedContiguousSlicePairs` で明示許可
- バスナビ所要時間: 新浦安駅→入船中央エステート は通し・夜間・短縮のいずれも 1分で同一

### `18-shinurayasu-from-takasu`（復路短縮）

- 出発は通し復路と同じ 高洲海浜公園 のりば03。第1〜8停留所は 18352907 の platform と完全同一
- 終点は **のりばHではなく降車専用のりばX**（node `8415001163`）。
  OSM 上で新浦安駅を終点とする bus relation 15本すべてが `platform_exit_only` でこのノードを使用（例外0）
- 合流ノード `288384935` で 18352907 接頭と 18352908 ロータリー（way `720406629` → `906161755`）を接合
- 通し復路 18352907 の新浦安駅切り詰めではない（所要時間: 通し4分 vs 短縮6分）
- 実測でも `isContiguousSlice` of `18-urayasu-eki-iriguchi` は **false**

`deferredNoOsmSource` は **空配列**（0件）。

## 5. 品質ゲート結果

### ジオメトリQA（`_geometry_qa_report.json`, pass: true, failures: 0）

| 項目 | seaside | urayasu | kita | from-shinurayasu | from-takasu |
| --- | --- | --- | --- | --- | --- |
| pathHash 再計算一致 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 最大点間ギャップ（上限30m） | 24.9 m | 24.9 m | 24.9 m | 24.9 m | 24.9 m |
| 上限超えギャップ | 0 | 0 | 0 | 0 | 0 |
| NaN座標 | 0 | 0 | 0 | 0 | 0 |
| 禁止highway / 建物・緑地・歩行者専用 | 0 | 0 | 0 | 0 | 0 |
| 一方通行違反 | 0（35 OK） | 0（17 OK） | 0（16 OK） | 0（16 OK） | 0（9 OK） |
| 不要なUターン | 0 | 0 | 0 | 0 | 0 |
| 経路の断絶 | 0 | 0 | 0 | 0 | 0 |
| のりば↔path 最大距離（上限20m） | 14.9 m | 13.6 m | 10.4 m | 12.3 m | 11.9 m |
| reviewRequired（20–30m） | 0 | 0 | 0 | 0 | 0 |
| 未解決の制限way | 0 | 0 | 0 | 0 | 0 |

### 生成モジュールの静的検査（`_verify_generated_report.json`, 101/101 pass）

UTF-8健全性、構文検査、`AKEMI_TAKASU_LINE_*` グローバル名、他系統非混入、
`official-stop-orders.json` の停留所配列の逐語一致、「©山本信勝」の非改変、
短縮便2本の composition 文書化、`deferredNoOsmSource` 空を確認。

### ローカルE2E検証（`_local_validation_report.json`, pass: true, failures: 0）

5系統すべてについて以下を確認:

- ランタイム停留所順 == `official-stop-orders.json` 完全一致
- ランタイム pathHash == 同梱バンクのハッシュ、かつ `crypto.subtle` による再計算も一致
- `resolvedVersion` 一致、座標すべて有限、stop id プレフィックス正当
- `path-policy` の `validateRuntimePath` が ok（maxGap 24.9 m）
- 他系統固有停留所の混入なし、他系統relationの参照なし
- 始発→終点の連続走行が完走、位置ジャンプ 0、通過順が単調増加

| systemKey | 通過登録 | 位置ジャンプ | 終着 |
| --- | --- | ---: | --- |
| `18-takasu-seaside` | 15 / 15 | 0 | 高洲海浜公園 |
| `18-urayasu-eki-iriguchi` | 15 / 15 | 0 | 浦安駅入口 |
| `18-takasu-kita-shogakko` | 16 / 16 | 0 | 高洲北小学校 |
| `18-takasu-seaside-from-shinurayasu` | 9 / 9 | 0 | 高洲海浜公園 |
| `18-shinurayasu-from-takasu` | 9 / 9 | 0 | 新浦安駅 |

回帰（ローダー変更の影響確認、いずれも正常にロード・解決）:

| route | 停留所 | path点数 |
| --- | ---: | ---: |
| route-17 日の出線 | 10 | 176 |
| route-16 日の出線 | 10 | 159 |
| route-15 潮音の街線 | 10 | 163 |
| route-14 弁天・富岡線 | 19 | 299 |
| route-12 舞浜リゾート線 | 21 | 664 |

route-15（2系統）と route-17（3系統）は pathHash・path点数とも記録値と一致。

### PWA / Service Worker

CACHE は `chidori-route-map-v110` のまま（パック bump なし）。
route-18 パック資産は既存 `?v=110` キーのまま更新内容を配信可能。
短縮便追加後の専用 PWA 再検証は任意（配線変更なし）。

## 6. 追加・変更ファイル

### 更新（実装・リポジトリ直下）

- `akemi-takasu-line-platforms-v1.js` — 5系統の platform
- `akemi-takasu-line-path-v1.js` — 5系統の path（短縮2本は composition メタ付き）
- `akemi-takasu-line-path-policy-v1.js` — `MIN_PATH_POINTS_BY_SYSTEM` に短縮2本を追加
- `akemi-takasu-line-route-v1.js` — SYSTEM_DEFINITIONS に短縮2本を追加
- `akemi-takasu-line-stop-images-v1.js` / `.css` — 空バンクのまま再生成

### 配線（変更なし）

- `service-worker.js` / `index.html` / `route-assets-loader.js`: **v110 のまま**
- `data.js` は変更なし

### 証跡（本フォルダ）

`official-sources.md` / `official-stop-orders.json` / `official-trip-signatures.json` /
`system-signatures.json` / `route-pattern-summary.md` / `system-pattern-summary.md` /
`osm-relations-summary.json` / `osm-relation-1835290{7,8}.json` / `osm-relation-18417590.json` /
`_platforms_bank.json` / `_path_bank.json` / `_build_summary.json` /
`_shortturn_join_analysis.json` / `_rotary_order_analysis.json` /
`_shinurayasu_berth_probe.json` / `_turn_restriction_probe.json` /
`_verify_generated_report.json` / `_geometry_qa_report.json` /
`_local_validation_report.json` / `screenshots/`、
および各工程のスクリプトと生ログ。

## 7. 未確定・残課題

- 停留所画像は0件（捏造禁止のため空バンクで生成）。実写の追加は別作業。
- 深夜バスの運賃倍額（★た）は正本JSONに記録したが、アプリは運賃を扱わないため画面表示上の区別は無い。
- UNDECIDED の3コース（143便）は凡例で18系統と確定できず除外。特に `0008200269`
  （新浦安駅 → 浦安駅入口・のりばH・4便）は18系統である可能性が残るが、
  のりばHの凡例に該当符号が無く確定できなかった。
- 本番環境での確認は未実施（D1 PUT 禁止・デプロイ禁止のため、検証はすべてローカルサーバ上）。
- 短縮便追加後の PWA オフライン再検証は任意（配線は v110 のまま）。

## 8. 制約の遵守

- 停留所順・道路形状の推測なし（京成バスナビ + OSM のみ）
- 「©山本信勝」は未変更（`app.js`。静的検査でも確認）
- 本番D1へのPUTなし、テスト中の編集トークン設定なし
- route-1〜17 のファイル・path・hash・停留所・画像は未変更（route-15 / route-17 は実測で同一を確認）
- 15 / 19 / 10 系統とのデータ混在なし（relation・停留所・グローバル名すべて分離、実測で空）
- blind mid-station slice なし。短縮便は berth-E / berth-X 検証済み composition のみ
- 停留所画像の捏造なし
- コミット・プッシュなし
- 無関係な未追跡 `_*.js` および他ルートの evidence は未変更
