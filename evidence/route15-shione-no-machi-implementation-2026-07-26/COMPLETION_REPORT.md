# route-15 潮音の街線 実装完了レポート

実装日: 2026-07-26 ／ キャッシュ: `chidori-route-map-v107`

## 1. 結論

公式（京成バスナビ）で確認できた **【１５系統】の運行パターンは2つ** で、いずれも
新浦安駅 ⇔ 高洲海浜公園 の10停留所。往路・復路それぞれ専用のOSM relationから
道路形状と停留所座標を生成した。品質ゲートは全項目PASS。

| systemKey | 方向 | 起点 → 終点 | 停留所 | 出発のりば | OSM relation | pathPoints | 距離 |
| --- | --- | --- | ---: | --- | ---: | ---: | ---: |
| `15-takasu-seaside` | outbound | 新浦安駅 → 高洲海浜公園 | 10 | 新浦安駅 のりばE | 18419865 | 163 | 2,940m |
| `15-shinurayasu` | inbound | 高洲海浜公園 → 新浦安駅 | 10 | 高洲海浜公園 のりば03 | 18419864 | 150 | 2,876m |

停留所順（正本 = 個別便通過時刻表）:

- outbound: 新浦安駅 → 入船中央エステート → 明海交差点 → 入船橋 → 高洲北小学校 → 東京学館前 → 高洲 → 高洲中央公園 → 潮音の街 → 高洲海浜公園
- inbound: 高洲海浜公園 → 潮音の街 → 高洲中央公園 → 高洲 → 東京学館前 → 高洲北小学校 → 入船橋 → 明海交差点 → 入船中央エステート → 新浦安駅

OSM relationのplatform並びは、往復とも公式順と **完全一致**（`osmPlatformOrderMatchesOfficial: true`）。

## 2. 系統の切り分け（最重要）

新浦安駅のりばEは `[15]` `[18]` `[深夜]` を同一コースセルに掲載し、
高洲北小学校のりば01/02は `[10]` `[15]` `[19]` を混載する。コース名では系統を確定できない。

そこで **二段ゲート** を実装した（`_verify_signatures.js`）。

1. (A) 便が載っていた時刻表ページの凡例（符号 → 【Ｎ系統】）
2. (B) **便の出発停留所の「のりば」時刻表の凡例** ← 決定打

(B) が【１５系統】に解決し、かつ (A) が15以外に解決していない便のみ採用。

判定結果（13署名）:

| 判定 | コース | 停留所 | 起点 → 終点 | (B) 出発のりば → 系統 |
| --- | --- | ---: | --- | --- |
| ACCEPT | 0008200278 | 10 | 新浦安駅 → 高洲海浜公園 | 新浦安駅 のりばE → 15 |
| ACCEPT | 0008200277 | 10 | 高洲海浜公園 → 新浦安駅 | 高洲海浜公園 のりば03 → 15 |
| REJECT | 0008200288 | 9 | 新浦安駅 → 高洲海浜公園 | のりばE 符号ゆ → 18 |
| REJECT | 0008200286 | 15 | 浦安駅入口 → 高洲海浜公園 | のりば11 符号ゆ → 18 |
| REJECT | 0008200289 | 16 | 新浦安駅 → 高洲北小学校 | のりばE 符号た → 18（深夜） |
| REJECT | 0008200285 | 15 | 高洲海浜公園 → 浦安駅入口 | のりば03 符号う → 18 |
| REJECT | 0008200287 | 9 | 高洲海浜公園 → 新浦安駅 | のりば03 符号ゆ → 18 |
| REJECT | 0008200292 | 14 | 新浦安駅 → 高洲海浜公園 | 新浦安駅 **のりばF** → **19** |
| REJECT | 0008200291 | 14 | 高洲海浜公園 → 新浦安駅 | 高洲海浜公園 **のりば19** → **19** |
| REJECT | 0008200254 | 15 | 新浦安駅 → みなと南 | のりばF 符号み → 10 |
| UNDECIDED | 0008200255 / 0008200253 / 0008200306 | 13/15/15 | アライプロバンス・みなと南・舞浜駅 発 | 出発停留所IDが取れず (B) 未解決 |

### 危なかった点

`0008200292` / `0008200291`（14停留所・高洲四丁目経由）は、高洲北小学校のりば01/02の
掲載凡例が不完全なため「無印…【１５系統】」に一致してしまい、一段ゲートでは
**誤ってACCEPTされた**。出発のりば（新浦安駅のりばF／高洲海浜公園のりば19）まで遡ると
凡例は【１９系統】であることが確定した（`_probe_takasu4chome_variant.js` で個別に再確認）。
15系統は「高洲」に停まり、「高洲二丁目」「高洲四丁目」などは通らない。

UNDECIDEDの3便は起終点が15系統のもの（新浦安駅・高洲海浜公園）ではなく、採用対象外。
系統番号は断定せず「不採用」として記録した。

## 3. 方向別の停留所座標

往復で別relationのplatformを採用。同名停留所でもノードIDと座標が異なる（中央分離帯道路）。

| 停留所 | outbound node / role | inbound node / role | 距離 |
| --- | --- | --- | ---: |
| 新浦安駅 | 8415001161 / platform_entry_only | 8415001163 / platform_exit_only | 64m |
| 入船中央エステート | 11425579726 | 1312711918 | 33m |
| 明海交差点 | 6899487150 | 11586798112 | 17m |
| 入船橋 | 6853044760 | 11580949264 | 17m |
| 高洲北小学校 | 11580949263 | 1312670866 | 31m |
| 東京学館前 | 1312670860 | 11557035685 | 19m |
| 高洲 | 12421750201 | 12421720000 | 14m |
| 高洲中央公園 | 6852993563 | 1312685254 | 91m |
| 潮音の街 | 11549952448 | 11549952447 | 17m |
| 高洲海浜公園 | 1312685258 / platform_exit_only | 11549952451 / platform_entry_only | 18m |

- **新浦安駅**: 往路は乗車専用ノード（のりばE側）、復路は降車専用ノード。
- **高洲海浜公園**: 往路は降車専用（終端）、復路は乗車専用（のりば03、始発位置）。
  終端で折り返す形ではなく、往復とも別々のrelationで独立に生成している。

## 4. 品質ゲート

| 項目 | 15-takasu-seaside | 15-shinurayasu | 閾値 |
| --- | --- | --- | --- |
| building/green | 0 | 0 | 0 |
| pedestrian/forbidden highway | 0 | 0 | 0 |
| unknown highway | 0 | 0 | 0 |
| wrong-way（oneway逆行） | 0（oneway順行12） | 0（oneway順行9） | 0 |
| U-turn（>150°） | 0 | 0 | 0 |
| 不連続（gap超過） | 0 | 0 | 0 |
| way join gap | 0m（全て共有ノード） | 0m | ≤1m |
| NaN / null 座標 | 0 | 0 | 0 |
| max gap | 25.0m | 25.0m | ≤30m |
| max stop-to-path | 12.3m | 13.7m | ≤20m（20–30で要確認） |
| reviewRequired 停留所 | 0 | 0 | — |
| pathHash（SHA-256）再計算一致 | true | true | true |

pathHash:

- `15-takasu-seaside`: `dd5ecff8bb7f2dfc15084f45624dc29596f0f76d1c42a454b70ce6daac0380f2`
- `15-shinurayasu`: `7880492560c594a65b8b5f7968e6b11272d93ed240d51357d31c23a82749bc25`

2系統のhashは相異なり、復路が往路の反転でないことも機械的に検証済み
（`reverseChecks[].isExactReverse === false`）。

### アクセス制限way（bus/psv許可の記録）

| system | way | access | bus | psv |
| --- | ---: | --- | --- | --- |
| 15-takasu-seaside | 1342409930 | permit | yes | – |
| 15-takasu-seaside | 1340739633 | permit | yes | – |
| 15-takasu-seaside | 906161743 | permit | yes | – |
| 15-shinurayasu | 906161755 | permit | yes | – |

いずれも `bus=yes` が明示されており、未解決の制限wayは0件。

## 5. ローカル検証（実アプリ + Google Mapsモック）

`_local_validation.js` / `_local_validation_report.json`: **PASS**

- `#routeSelect` に route-15 が出現し、パックが `?v=107` で読み込まれる
- 2系統とも 実行時の停留所順 = official-stop-orders.json（完全一致）
- 実行時 pathHash = バンクhash、かつ `crypto.subtle` での再計算も一致
- resolvedVersion 一致、path-policy `validateRuntimePath()` が ok
- 始発→終点の連続走行で位置ジャンプ0、10/10停留所を通過
- 回帰: route-14（19停留所 / 299点）・route-12（21停留所 / 664点）とも従来どおり解決

## 6. 変更ファイル

新規（リポジトリルート）:

- `shione-no-machi-line-platforms-v1.js`
- `shione-no-machi-line-path-v1.js`
- `shione-no-machi-line-path-policy-v1.js`
- `shione-no-machi-line-stop-images-v1.js`
- `shione-no-machi-line-stop-images-v1.css`
- `shione-no-machi-line-route-v1.js`

変更:

- `route-assets-loader.js` — PACKS に `route-15`（`?v=107`）を追加
- `service-worker.js` — `CACHE_NAME` を v107 に、`route-assets-loader.js?v=107`
- `index.html` — `route-assets-loader.js?v=107`

`data.js` はスタブ `[15,'潮音の街線']` が既存のため変更なし。
routes 1–12 および route-14 のpath/hash/stops/imagesは一切変更していない。

証跡（`evidence/route15-shione-no-machi-implementation-2026-07-26/`）:

- `official-sources.md` / `official-stop-orders.json` / `system-signatures.json` / `route-pattern-summary.md`
- スクレイプ: `_scrape_navi_route15_all.js` `_scrape_navi_route15_deep.js` `_navi_scrape_raw.json` `_navi_deep_raw.json`
- 系統ゲート: `_verify_signatures.js` `_signature_gate.json` `_signatures_dump.txt` `_probe_takasu4chome_variant.js/.json/.txt`
- OSM: `_fetch_osm_relations.js` `osm-relation-18419865.json` `osm-relation-18419864.json` `osm-relations-summary.json` `_osm_readable.txt`
- 生成: `_build_shione_no_machi_line_path.js` `_gen_route_module.js` `_build_summary.json` `_platforms_bank.json` `_path_bank.json`
- 検証: `_geometry_qa.js` `_geometry_qa_report.json` `_local_validation.js` `_local_validation_report.json`

## 7. 未確認・残課題

- **停留所画像は0件**（`images: {}` で初期化のみ）。実写がないため一切作成していない。
- **実走行での確認は未実施**。座標・道路形状はOSM由来で、現地の停車位置とは数m差がある可能性がある
  （最大 stop-to-path は 13.7m）。
- UNDECIDEDの3便（アライプロバンス／みなと南／舞浜駅 発）は出発停留所のbusstop idが
  バスナビ検索で引けず、二段目の凡例確認ができていない。15系統の起終点ではないため
  採用側には影響しないが、系統番号は断定していない。
- 深夜バス・臨時便の有無は、のりばEの凡例に現れる範囲（【１８系統】た／★た）しか確認していない。
- D1本番へのPUTは実施していない（編集トークンも未設定）。コミット・プッシュも未実施。
