# Section 45 — route-12 舞浜リゾート線 完了報告

**Date:** 2026-07-25  
**Cache:** `chidori-route-map-v74`  
**Commit message:** `feat: add verified Maihama Resort route 12 systems`

## 総合判定

**完了**（ベイサイドは 20–30m `platformDistException` + `reviewRequired`。ホテル SOUTH/NORTH は往路 path 順割当。TDS/ホテルループの自己交差は想定内）

## 公式調査

| 項目 | 値 |
| --- | --- |
| 監査した便数 | 2（confirmed12） |
| route-12 unique signature数 | 2 |
| 除外したroute-4便数 | 140 |
| 途中始発 | 0（未検出） |
| 途中止まり | 0（未検出） |
| 実装systemKey数 | 2 |

## 実装系統

| systemKey | 始発 | 終点 | 停留所数 | relation | 判定 |
| --- | --- | --- | ---: | ---: | --- |
| 12-maihama-via-resort | 浦安駅入口 | 舞浜駅 | 21 | 18381677 | PASS |
| 12-urayasu-via-resort | 舞浜駅 | 浦安駅入口 | 21 | 18381676 | PASS |

## path情報

| systemKey | path点数 | maxGap | maxJoin | platform最大距離 | pathHash | resolvedVersion |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| 12-maihama-via-resort | 664 | 24.8 | 0 | 28.6（bayside例外） | `0ac1e3bdc9926d8830e6e71b99e31e2f04b6529271fc72eb149af6c780a67803` | 2026-07-25-maihama-resort-maihama-v1 |
| 12-urayasu-via-resort | 657 | 24.8 | 0 | 22.2（bayside例外） | `51cc07c0d3943cb62491b7890a8070a59a6b8790128a87dcddee4753f18f04bc` | 2026-07-25-maihama-resort-urayasu-v1 |

## 道路精度

| systemKey | 建物 | 緑地 | pedestrian | 逆走 | access未解決 | 全区間走行 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 12-maihama-via-resort | 0 | 0 | 0 | 0 | 0 | PASS |
| 12-urayasu-via-resort | 0 | 0 | 0 | 0 | 0 | PASS |

注: selfIntersection=8（TDS/ホテル一方通行ループ想定内, `expected-at-tds-hotel-loop`）。restrictedAccess=7 すべて bus/psv許可。

## 重点地点

| 地点 | 進入 | 停車 | 退出／終点 | 判定 |
| --- | --- | --- | --- | --- |
| 浦安駅入口D | OK | OK | OK | PASS（z19） |
| 市役所入口・郵便局前 | OK | OK | OK | PASS（z19） |
| 順天堂病院前 | OK | OK | OK | PASS（z19） |
| 運動公園 | OK | OK | TDS方向 | PASS（z20） |
| 東京ディズニーシー04 | OK | OK | OK | PASS（z20 entry/platform/exit） |
| ベイサイド・ステーション | OK | OK | OK | PASS（z20, dist例外 22–29m） |
| ホテルエリア・サウス | OK | OK | OK | PASS（z20, path順割当） |
| ホテルエリア・ノース | OK | OK | OK | PASS（z20, path順割当） |
| 舞浜駅04 | OK | OK | OK | PASS（z19） |

## ホテル OSM 名マッピング（path順が正）

| OSM family | 割当公式名 | 理由 |
| --- | --- | --- |
| シェラトン* | リゾートホテルエリア・サウス | 18381677 path上 TDS後の1番目 |
| ヒルトン* | リゾートホテルエリア・ノース | 18381677 path上 TDS後の2番目 |
| 東京ベイ舞浜ホテル | （非停車） | 公式21停留所に無し |

旧alias（ヒルトン→サウス等）は path+公式順と矛盾するため不採用。詳細: `osm-hotel-platform-mapping.md`

## 回帰確認

| 路線 | 結果 | データ変更 |
| --- | --- | --- |
| 北栄線 | （imagawa/共通不変扱い） | なし |
| 今川線 | PASS hash不変 | なし |
| 浦安東団地線 | PASS | なし |
| 富岡線 | PASS | なし |
| 堀江線 | PASS | なし |
| 市役所線 | PASS | なし |
| 舞浜線 | PASS | なし |
| 高洲線 | PASS | なし |
| シンボルロード線 | PASS | なし |
| 舞浜リゾート線 | 新規追加 | 新規 |

## D1

| 項目 | 結果 |
| --- | --- |
| 同一端末保存 | 実装済（`route.maihamaResortLineStopImages` / localStorage key） |
| 再読込 | pathHash integrity PASS（改変禁止→force復元） |
| 別端末共有 | 人確認待ち（本番D1） |
| 既存路線データ | 不変（regression PASS） |

## PWA

| 項目 | 結果 |
| --- | --- |
| CACHE_NAME | `chidori-route-map-v74` |
| APP_SHELL一致 | PASS |
| オフライン再読込 | PASS |
| route-12表示 | PASS |

## デプロイ

| 項目 | 結果 |
| --- | --- |
| コミットID | （push後に記入） |
| GitHub Actions | push後確認 |
| Pages | push後確認 |
| キャッシュ | v74 |

## 証拠

`evidence/route12-maihama-resort-implementation-2026-07-25/`

主要成果物:
- `_build_summary.json` / `_path_bank.json` / `_platforms_bank.json`
- `osm-hotel-platform-mapping.md`
- `_way_connectivity_18381677.json` / `_way_connectivity_18381676.json` (+ after_hint)
- `_pathhash_integrity_report.json`
- `_continuous_drive_report.json`
- `_geometry_intersection_report.json`
- `_regression_report.json`
- `_pwa_offline_report.json`
- `screenshots/`（往復重点地点 + ui-pc/sp390）

## 未確認事項

- 本番D1別端末共有の目視確認
- 本番Street View実映像の目視確認（モックで走行QA済）
- ベイサイド公式乗り場01/02とDisney Cruiser local_refの厳密対応（closest-to-path採用）
