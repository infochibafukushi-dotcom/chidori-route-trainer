# route-17 日の出線 実装完了レポート

実施日: 2026-07-26 ／ 対象: `route-17`（系統17・日の出線・東京ベイシティ交通）

## 1. 結論

京成バスナビの個別便通過時刻表で確認できた **3系統** を実装した。全品質ゲートを通過。
コミット・プッシュは行っていない。本番D1へのPUTも行っていない。
route-16（`hinode-line-*`）のファイル・データは一切変更していない。

| systemKey | 方向 | 符号 | 起点 → 終点 | 停留所 | path点数 | 距離 | OSM relation | 便数 |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| `17-hinode-nanachome` | outbound | (無印) | 新浦安駅 → 日の出七丁目 | 10 | 176 | 2,642 m | 18396569 | 488 |
| `17-baycity-urayasu` | outbound | ベ / ★ベ | 新浦安駅 → ベイシティ浦安 | 14 | 239 | 3,677 m | 18396583 | 164 |
| `17-shinurayasu` | inbound | (無印) | 日の出七丁目 → 新浦安駅 | 10 | 157 | 2,567 m | 18396568 | 531 |

pathHash（SHA-256）:

- `17-hinode-nanachome`: `78599ef2fd60f7d2e9c81fdd09287007387937d4384a028e3cb54628b6de3af5`（resolvedVersion `2026-07-26-hinode17-nanachome-v1`）
- `17-baycity-urayasu`: `72e9bcc87c8ed02d011b678b58351ae4063f8f84f2a3e812907059c10396ad35`（resolvedVersion `2026-07-26-hinode17-baycity-v1`）
- `17-shinurayasu`: `4bd7f2479a338adf1628e75213029d55af59161341ae291a705b293fa5addc86`（resolvedVersion `2026-07-26-hinode17-shinurayasu-v1`）

3本の pathHash はすべて相異なり、往路と復路が完全な逆順配列でないこと・
`17-hinode-nanachome` が `17-baycity-urayasu` の単純な前方部分列でないことをビルド時に検査済み
（`_build_path_run.txt` の `pathHashDistinct` / `reverseChecks` / `prefixChecks`）。

## 2. 17系統と16系統の分離（本件の最重要点）

16系統も路線名「日の出線」を名乗り、日の出七丁目 を発着する。さらに `17-baycity-urayasu` は
日の出西／順天堂大学・日の出 正門／プラウド新浦安パークマリーナ／日の出中学校／ベイシティ浦安 を
16系統と共有するため、**コース名や中間停留所ののりばでは分離できない**。

採用したゲートは二段:

1. **(A) 便が掲載されていた時刻表の凡例**（符号 → 【Ｎ系統】）
2. **(B) その便の出発停留所ののりばの時刻表の凡例** ← 決定打

(B) が【１７系統】に解決し、かつ (A) が17以外に解決していない便のみを採用した。

| 判定 | 便数 | 内容 |
| --- | ---: | --- |
| ACCEPT-route17 | 1,183 | 3系統（488 + 164 + 531） |
| REJECT-route-16 | 128 | 日の出七丁目 → 新浦安駅（course `0008200279`・海風の街経由） |

除外した128便は、プラウド新浦安パークマリーナ のりば02 の時刻表に17系統と混載されていたが、
出発停留所（日の出七丁目）のりば01 の凡例が
「無印…【１６系統】プラウド新浦安パークマリーナ・海風の街経由　新浦安駅行き」に解決したため落とした。

| | 17系統 | 16系統 |
| --- | --- | --- |
| 新浦安駅 のりば | 17 | C |
| 日の出七丁目 のりば | 17 | 01 |
| 符号 | 無印 / ベ / ★ベ（深夜） | 無印 |
| 経由 | 日の出東・東京電力 | プラウド新浦安パークマリーナ・海風の街 |
| 固有停留所 | 日の出保育園入口 / 東京電力 / 日の出小学校 / 日の出東 / アールフォーラム / 順天堂大学・日の出 東口 | 海風の街 |
| OSM relation | 18396569 / 18396583 / 18396568 | 18396563 / 18396562 |

### コード側の排除ガード（実測結果つき）

- 16系統OSM relation `18396562 / 18396563` を参照したら path ビルドとジオメトリQAが例外で停止する
  → 実測 `_geometry_qa_report.json` の `route16RelationsUsed` は `[]`
- 16系統固有停留所「海風の街」が生成モジュールのデータ領域やランタイム停留所名に現れたら失敗する
  → 実測 `route16StopsUsed` は `[]`、ローカル検証の `route16StopLeak` も3系統すべて空
- モジュール生成時に route-16 の識別子（`HINODE_LINE_ROUTE_V1` 等）が混入していないか静的検査
- ローカル検証で route-16 のランタイム pathHash / path点数が
  `evidence/route16-hinode-implementation-2026-07-26/_build_summary.json` の記録値と一致することを確認
  → `16-hinode-nanachome` / `16-shinurayasu` とも `unchanged: true`

route-16 の path・停留所配列を読み取って反転・流用した箇所は存在しない。
route-17 の道路形状は `ref=17` の OSM relation 3件のみから生成している。

## 3. 品質ゲート結果

### ジオメトリQA（`_geometry_qa_report.json`, pass: true）

| 項目 | `17-hinode-nanachome` | `17-baycity-urayasu` | `17-shinurayasu` |
| --- | --- | --- | --- |
| pathHash 再計算一致 | ✅ | ✅ | ✅ |
| 最大点間ギャップ（上限30m） | 24.2 m | 24.2 m | 24.2 m |
| 上限超えギャップ | 0 | 0 | 0 |
| NaN座標 | 0 | 0 | 0 |
| 禁止highway / 建物・緑地・歩行者専用 | 0 | 0 | 0 |
| 一方通行違反 | 0（11区間OK） | 0（14区間OK） | 0（6区間OK） |
| 不要なUターン | 0 | 0 | 0 |
| 経路の断絶 | 0 | 0 | 0 |
| のりば↔path 最大距離（上限20m） | 11.1 m | 11.1 m | 11.1 m |
| reviewRequired（20–30m） | 0 | 0 | 0 |
| access制限way | 5件すべて `bus=yes` で解決 | 5件すべて `bus=yes` で解決 | 1件、`bus=yes` で解決 |
| 未解決の制限way | 0 | 0 | 0 |

bus/psv タグは全way分を `_geometry_qa_report.json` の `busPsvTags` に記録した
（例: `17-hinode-nanachome` は `bus=yes` 5本 / 未設定10本、`psv` は全way未設定）。

### ローカルE2E検証（`_local_validation_report.json`, pass: true）

3系統すべてについて以下を確認:

- ランタイム停留所順 == `official-stop-orders.json` 完全一致
- ランタイム pathHash == 同梱バンクのハッシュ、かつ `crypto.subtle` による再計算も一致
- `resolvedVersion` 一致、座標すべて有限、stop id プレフィックス正当
- `path-policy` の `validateRuntimePath` が ok（maxGap 24.2 m）
- 16系統固有停留所の混入なし、16系統relationの参照なし
- 始発→終点の連続走行が完走、位置ジャンプ 0

| systemKey | 通過登録 | 位置ジャンプ | 終着 |
| --- | --- | ---: | --- |
| `17-hinode-nanachome` | 10 / 10 | 0 | 日の出七丁目 |
| `17-baycity-urayasu` | 14 / 14 | 0 | ベイシティ浦安 |
| `17-shinurayasu` | 10 / 10 | 0 | 新浦安駅 |

走行スクリーンショットは `screenshots/drive-*-mid.png` / `drive-*-end.png`。

回帰（ローダー変更の影響確認、いずれも正常にロード・解決）:

| route | 停留所 | path点数 |
| --- | ---: | ---: |
| route-16 日の出線 | 10 | 159 |
| route-15 潮音の街線 | 10 | 163 |
| route-14 弁天・富岡線 | 19 | 299 |
| route-12 舞浜リゾート線 | 21 | 664 |

### PWA / Service Worker（`_pwa_offline_report.json`, pass: true）

- キャッシュは `chidori-route-map-v109` の1つのみ（旧 `chidori-route-map-*` はactivateで削除済み）
- route-17 パックの6資産すべてが `?v=109` 付きの正確なキーでキャッシュされている
- route-16 パックのキャッシュエントリは `?v=108` のまま（バージョン混線なし）
- オフラインに切り替えて再読み込み後も route-17 の3系統が解決し、
  pathHash・停留所順ともオンライン時と同一
- スクリーンショット: `screenshots/pwa-online-route17-sp390.png` / `pwa-offline-route17-sp390.png`

## 4. 追加・変更ファイル

### 新規（実装・リポジトリ直下）

- `hinode-line-17-platforms-v1.js` — `HINODE_LINE_17_PLATFORMS_V1`
- `hinode-line-17-path-v1.js` — `HINODE_LINE_17_PATH_V1`
- `hinode-line-17-path-policy-v1.js` — `HINODE_LINE_17_PATH_POLICY_V1`
- `hinode-line-17-stop-images-v1.js` — `HINODE_LINE_17_STOP_IMAGES_V1`（画像0件・空バンク）
- `hinode-line-17-stop-images-v1.css`
- `hinode-line-17-route-v1.js` — `HINODE_LINE_17_ROUTE_V1`

グローバル名は `HINODE_LINE_17_*`、D1共有フィールドは `hinode17Line*` に統一。
route-16 の `HINODE_LINE_*` / `hinodeLine*` とは名前空間が完全に分かれている。

### 変更（配線のみ・3ファイル）

- `service-worker.js`: `CACHE_NAME` を `chidori-route-map-v108` → `v109`、`route-assets-loader.js?v=109`
- `index.html`: `route-assets-loader.js?v=109`
- `route-assets-loader.js`: `PACKS['route-17']` を追加（css 1本 / js 5本、いずれも `?v=109`）

`data.js` は変更なし（`[17,'日の出線']` のスタブが既に存在）。
route-16 を含む既存ルートのモジュール・path・hash・停留所・画像はいずれも未変更。

### 証跡（本フォルダ）

`official-sources.md` / `official-stop-orders.json` / `official-trip-signatures.json` /
`system-signatures.json` / `route-pattern-summary.md` / `system-pattern-summary.md` /
`osm-relations-summary.json` / `osm-relation-1839656{8,9}.json` / `osm-relation-18396583.json` /
`_platforms_bank.json` / `_path_bank.json` / `_build_summary.json` /
`_geometry_qa_report.json` / `_local_validation_report.json` / `_pwa_offline_report.json` /
`screenshots/`、および各工程のスクリプトと生ログ。

## 5. 未確定・残課題

- **ベイシティ浦安 → 新浦安駅 の17系統便は存在しない**。ベイシティ浦安（`00020734`）の
  courses 一覧に [17] の発便コースが無いため実装しなかった。時刻表に現れない以上これ以上の確認は不可。
- 停留所画像は0件（捏造禁止のため空バンクで生成）。実写の追加は別作業。
- OSM表記 `順天堂大学・日の出東口` / `順天堂大学・日の出正門` とバスナビ表記
  `順天堂大学・日の出 東口` / `順天堂大学・日の出 正門`（半角空白）が異なる。
  正本はバスナビ表記を採用し、突合時のみ空白除去で正規化した。
- 深夜便（★ベ）は course `0008200284`。停留所順は `0008200283` と同一のため
  `17-baycity-urayasu` に統合した。運賃倍額の表示はアプリ側の対象外。
- 本番環境での確認は未実施（D1 PUT 禁止・デプロイ禁止のため、検証はすべてローカルサーバ上）。

## 6. 制約の遵守

- 停留所順・道路形状の推測なし（京成バスナビ + OSM のみ）
- 「©山本信勝」は未変更（`app.js`）
- 本番D1へのPUTなし、テスト中の編集トークン設定なし
- route-1〜16 のファイル・path・hash・停留所・画像は未変更（route-16 は実測で同一を確認）
- 16系統と17系統のデータ混在なし（relation・停留所・グローバル名すべて分離、実測で空）
- 停留所画像の捏造なし
- コミット・プッシュなし
- 無関係な未追跡 `_*.js` および evidence/route12 の COMPLETION_REPORT は未変更
