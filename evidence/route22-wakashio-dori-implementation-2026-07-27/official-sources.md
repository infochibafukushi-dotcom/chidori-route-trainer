# 若潮通り線（系統22 / route-22 / 22千鳥東）公式出典

調査日: 2026-07-27

事業者: 東京ベイシティ交通（京成グループ）。京成バスナビ（keiseibus-group）に掲載される。

## 1. 京成バスナビ（最優先）

ベースURL: https://transfer-cloud.navitime.biz/keiseibus-group

| 用途 | URL |
| --- | --- |
| 舞浜駅 のりば・系統一覧 | https://transfer-cloud.navitime.biz/keiseibus-group/courses?busstop=00020617 |
| 千鳥車庫 のりば・系統一覧 | https://transfer-cloud.navitime.biz/keiseibus-group/courses?busstop=00020620 |
| 新浦安駅 のりば・系統一覧 | https://transfer-cloud.navitime.biz/keiseibus-group/courses?busstop=00020619 |

### 採用した運行パターン

| systemKey | 符号 | 起点 → 終点 | 停留所数 | 便数 | 出典URL |
| --- | --- | --- | ---: | ---: | --- |
| `22-shinurayasu-chidori-garage` | ◎ち | 新浦安駅 → 千鳥車庫 | 16 | 12 | https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/81000006/stops?departure-busstop=00020619-1&course=0008200301&datetime=2026-07-27T08:20:00%2B09:00 |
| `22-chidori-garage-shinurayasu` | し | 千鳥車庫 → 新浦安駅 | 16 | 3 | https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80ff0007/stops?departure-busstop=00020620-5&course=0008200300&datetime=2026-08-01T10:42:00%2B09:00 |

### 二段凡例ゲート

(A) 便が載っていた時刻表の凡例 と (B) 便の出発停留所ののりばの時刻表の凡例 の二段で系統を判定。千鳥車庫のりば02等では [20]/[22]/[2]/[4]/[14] が混載されるため、(B) 出発のりば凡例が【２０系統】に解決した便のみ採用。22系統（22千鳥東 / 若潮通り線）は REJECT。

### 除外した便（20系統等）

| コース | 符号 | 系統 | 起点 → 終点 | 判定 |
| --- | --- | --- | --- | --- |
| 0008200296 | ク | 20 | 舞浜駅 → クリーンセンター | REJECT-route-20 |
| 0008200297 | に | 20 | 舞浜駅 → 千鳥西 | REJECT-route-20 |
| 0008200299 | さ | 20 | 舞浜駅 → 舞浜駅 | REJECT-route-20 |
| 0008200294 | (無印) | 20 | 舞浜駅 → 千鳥車庫 | REJECT-route-20 |
| 0008200293 | (無印) | 20 | 千鳥車庫 → 舞浜駅 | REJECT-route-20 |
| 0008200295 | (無印) | 20 | クリーンセンター → 舞浜駅 | REJECT-route-20 |
| 0008200298 | (無印) | 20 | クリーンセンター → 舞浜駅 | REJECT-route-20 |

## 2. OSM route relations

| relation | name | platforms | 公式順一致 |
| ---: | --- | ---: | --- |
| 18396547 | 東京ベイシティバス22系統 新浦安駅⇒千鳥東⇒千鳥車庫 | 16 | YES |
| 18396546 | 東京ベイシティバス22系統 千鳥車庫⇒千鳥東⇒新浦安駅 | 16 | YES |

## 使用しなかったもの

- Google Directions / Google Maps の経路推定
- route-20（千鳥線）の便・OSM relation

