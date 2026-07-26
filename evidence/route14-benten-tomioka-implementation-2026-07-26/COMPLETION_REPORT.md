# route-14 弁天・富岡線 実装完了レポート

実装日: 2026-07-26 ／ 状態: **ローカル動作可能（PASS）** ／ コミット・push・本番D1 PUT はいずれも未実施

## 1. 確定した系統（4系統）

| systemKey | 表示 | 区間 | 停留所数 | 便数(観測) | OSM relation | path点数 | 距離 | pathHash (先頭12) |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| `14-maihama` | 舞浜駅行き（無印） | 新浦安駅 → 舞浜駅 | 19 | 51 | 18323926 | 299 | 5,094 m | `3d3383abd203` |
| `14-chidori-garage` | 千鳥車庫行き（ち） | 新浦安駅 → 千鳥車庫 | 18 | 4 | 18419877 | 274 | 4,797 m | `b8e695aefd46` |
| `14-shinurayasu-maihama` | 新浦安駅行き（舞浜駅発・無印） | 舞浜駅 → 新浦安駅 | 19 | 52 | 9983017 | 271 | 4,943 m | `af02316a545d` |
| `14-shinurayasu-chidori` | 新浦安駅行き（千鳥車庫発・し） | 千鳥車庫 → 新浦安駅 | 18 | 4 | 18419876 | 265 | 4,752 m | `f92789f92d2d` |

停留所順の正本は京成バスナビの「個別便通過時刻表」。系統の判定はコース名の `[14]` ではなく、**時刻表凡例の符号 →【Ｎ系統】** で行った（千鳥車庫のりば02は [2]/[4]/[6]/[14] 混載のため）。凡例で除外した便は 2系統(無印) / 4系統(南小) / 6系統(市) の3種。

4系統の停留所ID列はすべて相異（`system-signatures.json` の `allStopIdSignaturesDistinct: true`）。OSM relation のプラットフォーム順も4本すべて公式順と一致（`osmAllMatch: true`）。

## 2. 流用禁止ルールの検証

- **反転流用なし**: `14-maihama` vs `14-shinurayasu-maihama`、`14-chidori-garage` vs `14-shinurayasu-chidori` はいずれも `isExactReverse: false`。往復で別relation（往路18323926/18419877、復路9983017/18419876）から個別生成。
- **切り詰め流用なし**: 舞浜便と千鳥車庫便は `distinctRelations: true`・`samePathHash: false`・点数も別（299/274、271/265）。運動公園の先だけを切って作っていない。
- 4系統の pathHash はすべて相異（`pathHashDistinct: true`）。

## 3. 品質ゲート結果

`_geometry_qa_report.json`: **pass = true / failures = [] / reviewRequired = []**

| 項目 | 閾値 | 結果（4系統） |
| --- | --- | --- |
| 建物・緑地・歩行者道・禁止highway | 0 | 0 |
| 逆走（oneway違反） | 0 | 0（oneway検査 12/11/11/8 way） |
| 不要なUターン | 0 | 0（終点転回も0） |
| 経路断絶・NaN | 0 | NaN 0、way接合gap 0 m（全way sharedNode接続） |
| 隣接点間ギャップ | ≤30 m | 最大 25 m（4系統とも） |
| 停留所→path距離 | ≤20 m | 最大 14.3 m（`14-maihama` 運動公園）。20 m超なし＝reviewRequired 0件 |
| pathHash (SHA-256) | 再計算一致 | 4系統とも bank値＝再計算値＝実行時値 |

### access制限道路（OSMタグ記録）

- `access=permit` + `bus=yes` の service way（新浦安駅・舞浜駅の構内バス路）: 計6/6/1/1 way。バス通行可が明示されているため許容。
- **例外1件**: way `1296818464`（千鳥車庫構内サービス道路、`access=private`、`highway=service`）。東京ベイシティ交通の営業所構内で自社バスの入出庫路にあたるため、`_build_summary.json` の `accessExceptions` に理由付きで記録のうえ採用。`14-chidori-garage` のみで使用。

## 4. ローカル検証（Playwright / 実ブラウザ）

`_local_validation_report.json`: **pass = true / failures = [] / 致命的コンソールエラー 0 / pageerror 0**

- `#routeSelect` に route-14 が出現し、パック（css 1本 + js 5本）が正常ロード。
- 4系統すべてで: 実行時の停留所順 = `official-stop-orders.json`、実行時pathHash = bank値 = SHA-256再計算値、`resolvedVersion` 一致、停留所IDが `benten-tomioka-<key>-` プレフィックス、path-policy の `validateRuntimePath` OK。
- 連続走行シミュレーション: 4系統とも始発→終点まで完走、位置ジャンプ 0、全停留所到着登録（19/19・18/18・19/19・18/18）。
- **route-12 回帰**: 21停留所・664点・pathHash `0ac1e3bd…` を維持。route-1〜12 のpath/hash/stops/imagesは無変更。

## 5. 変更・追加ファイル

### 新規（アプリ本体）

- `benten-tomioka-line-platforms-v1.js`
- `benten-tomioka-line-path-v1.js`
- `benten-tomioka-line-path-policy-v1.js`
- `benten-tomioka-line-stop-images-v1.js`（`images: {}` の空バンク。画像は捏造せず未登録）
- `benten-tomioka-line-stop-images-v1.css`
- `benten-tomioka-line-route-v1.js`

### 変更（3ファイル・いずれも最小差分）

- `route-assets-loader.js`: `route-14` パックを追加（css+js、すべて `?v=106`）。既存パックは無変更。
- `service-worker.js`: `CACHE_NAME` を `chidori-route-map-v105` → `chidori-route-map-v106`、CORE_SHELL の `route-assets-loader.js?v=78` → `?v=106`。
- `index.html`: `route-assets-loader.js?v=78` → `?v=106`（1行のみ）。

`data.js` は既存スタブ `[14,'弁天・富岡線']` をそのまま使用（変更なし）。`©山本信勝` は `app.js` にあり無変更。

### 証跡（`evidence/route14-benten-tomioka-implementation-2026-07-26/`）

必須4点: `official-sources.md` / `official-stop-orders.json` / `system-signatures.json` / `route-pattern-summary.md`

生成スクリプトと生データ: `_scrape_navi_route14_all.js`, `_scrape_navi_route14_deep.js`, `_navi_scrape_raw.json`, `_navi_deep_raw.json`, `_verify_signatures.js`, `_signature_gate.json`, `_fetch_osm_relations.js`, `osm-relation-{18323926,9983017,18419877,18419876}.json`, `osm-relations-summary.json`, `_build_official_gate.js`, `_build_benten_tomioka_line_path.js`, `_build_summary.json`, `_path_bank.json`, `_platforms_bank.json`, `_geometry_qa.js`, `_geometry_qa_report.json`, `_gen_route_module.js`, `_local_validation.js`, `_local_validation_report.json`

## 6. 未確認・残課題

1. **停留所画像は0件**。捏造禁止のため空バンクのまま。実写を用意でき次第、アプリの「位置・画像を設定」から登録が必要。
2. **実地走行での道路形状確認は未実施**。path は OSM relation をそのまま採用しており、UI上も「道路形状：OSM relation採用（要走行確認）」と表示する。特に新浦安駅・舞浜駅のロータリー構内と千鳥車庫構内は現地確認が望ましい。
3. **千鳥車庫便の便数が少ない**（往路4便・復路4便）。観測できたのは 2026-07-26/27, 08-01 の時刻表分のみで、ダイヤ改正時は再スクレイプが必要。
4. **旧baycityページは未参照**。京成バスナビ+OSMで4系統すべて確定したため不要と判断。
5. **本番反映は未実施**（コミット・push・D1 PUT なし）。本番へ出す場合は v106 のキャッシュ更新確認が別途必要。
