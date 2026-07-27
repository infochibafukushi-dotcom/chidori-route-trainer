# 浦安東団地線（系統23 / route-23 / 舞浜⇔総合公園）公式出典

調査日: 2026-07-27

事業者: 東京ベイシティ交通（京成グループ）。京成バスナビ（keiseibus-group）に掲載される。

## 1. 京成バスナビ（最優先）

ベースURL: https://transfer-cloud.navitime.biz/keiseibus-group

| 用途 | URL |
| --- | --- |
| 舞浜駅 のりば・系統一覧 | https://transfer-cloud.navitime.biz/keiseibus-group/courses?busstop=00020617 |
| 総合公園 のりば・系統一覧 | https://transfer-cloud.navitime.biz/keiseibus-group/courses?busstop=00020745 |
| 新浦安駅 のりば・系統一覧 | https://transfer-cloud.navitime.biz/keiseibus-group/courses?busstop=00020619 |

### 採用した運行パターン

| systemKey | 符号 | 起点 → 終点 | 停留所数 | コース | 出典URL |
| --- | --- | --- | ---: | --- | --- |
| `23-maihama-sogo` | 3 [23] | 舞浜駅 → 総合公園 | 25 | 0008200303 | https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/81120000/stops?departure-busstop=00020619-13&course=0008200303&datetime=2026-08-02T10:58:00%2B09:00 |
| `23-sogo-maihama` | 01 | 総合公園 → 舞浜駅 | 25 | 0008200302 | https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/81120000/stops?departure-busstop=00020745-01&course=0008200302&datetime=2026-07-27T08:00:00%2B09:00 |

### 二段凡例ゲート

(A) 便が載っていた時刻表の凡例 と (B) 便の出発停留所ののりばの時刻表の凡例 の二段で系統を判定。

新浦安駅のりば H 等では `[3]` / `[23]` / `[11]` / `[18]` が混載され、Navi 表示は「3 [23]」と `[3]` が同一セルに併記される。(B) 出発のりば凡例が【２３系統】に解決した便のみ採用。3系統（浦安駅入口 terminal / route-3）は REJECT。

## 2. OSM route relations

| relation | name | 方向 | platforms | 公式順一致 |
| ---: | --- | --- | ---: | --- |
| 18419895 | ref=23 舞浜駅⇒…⇒総合公園 | outbound | 25 | YES |
| 18419894 | ref=23 総合公園⇒…⇒舞浜駅 | inbound | 25 | YES |

### route-3 との分離（使用禁止）

| relation | ref | terminal | 用途 |
| ---: | --- | --- | --- |
| 18417570 | 3 | 浦安駅入口⇔総合公園 | **route-23 では使用禁止** |
| 18417571 | 3 | 同上 | **route-23 では使用禁止** |
| 18417579 | 3 | 同上 | **route-23 では使用禁止** |

OSM ref=3 と ref=23 の relation ID は **完全非共有**。同じ路線名「浦安東団地線」だが terminal が異なる（23=舞浜⇔総合公園、3=浦安駅入口⇔総合公園）。

## 使用しなかったもの

- Google Directions / Google Maps の経路推定
- route-3（3系統）の便・OSM relation・path bank

## route-3 非改変宣言

route-3 pathHashes / platforms / modules は本 commit で一切変更しない。
