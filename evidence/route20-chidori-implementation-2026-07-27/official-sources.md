# 千鳥線（系統20 / route-20）公式出典

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
| `20-maihama-clean-center` | ク | 舞浜駅 → クリーンセンター | 7 | 18 | https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80fb0000/stops?departure-busstop=00020617-1&course=0008200296&datetime=2026-07-27T06:30:00%2B09:00 |
| `20-maihama-chidori-nishi` | に | 舞浜駅 → 千鳥西 | 9 | 54 | https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80fc0006/stops?departure-busstop=00020617-1&course=0008200297&datetime=2026-07-27T07:39:00%2B09:00 |
| `20-chidori-loop` | さ | 舞浜駅 → 舞浜駅 | 14 | 144 | https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80fe002e/stops?departure-busstop=00020617-1&course=0008200299&datetime=2026-08-01T07:10:00%2B09:00 |
| `20-maihama-chidori-garage` | 無印 | 舞浜駅 → 千鳥車庫 | 8 | 4 | https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80f90002/stops?departure-busstop=00020617-1&course=0008200294&datetime=2026-08-02T09:31:00%2B09:00 |
| `20-chidori-garage-maihama` | 無印 | 千鳥車庫 → 舞浜駅 | 7 | 5 | https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80f80005/stops?departure-busstop=00020620-5&course=0008200293&datetime=2026-07-27T10:00:00%2B09:00 |
| `20-clean-center-maihama` | 無印 | クリーンセンター → 舞浜駅 | 6 | 2 | https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80fa0000/stops?departure-busstop=00020620-4&course=0008200295&datetime=2026-08-01T10:00:00%2B09:00 |
| `20-clean-center-maihama-via-saijo` | 無印 | クリーンセンター → 舞浜駅 | 8 | 22 | https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80fd0004/stops?departure-busstop=00020620-6&course=0008200298&datetime=2026-07-27T16:27:00%2B09:00 |

### 二段凡例ゲート

(A) 便が載っていた時刻表の凡例 と (B) 便の出発停留所ののりばの時刻表の凡例 の二段で系統を判定。千鳥車庫のりば02等では [20]/[22]/[2]/[4]/[14] が混載されるため、(B) 出発のりば凡例が【２０系統】に解決した便のみ採用。22系統（22千鳥東 / 若潮通り線）は REJECT。

### 除外した便（22系統等）

| コース | 符号 | 系統 | 起点 → 終点 | 判定 |
| --- | --- | --- | --- | --- |
| 0008200301 | ◎ち | 22 | 新浦安駅 → 千鳥車庫 | REJECT-route-22 |
| 0008200300 | し | 22 | 千鳥車庫 → 新浦安駅 | REJECT-route-22 |

## 2. OSM route relations

| relation | name | platforms | 公式順一致 |
| ---: | --- | ---: | --- |
| 18351940 | 東京ベイシティバス20系統 舞浜駅⇒千鳥車庫⇒クリーンセンター | 7 | YES |
| 18323972 | 東京ベイシティバス20系統 舞浜駅⇒千鳥循環 | 14 | YES |
| 13764790 | 東京ベイシティバス20系統 舞浜駅⇒千鳥東⇒千鳥車庫 | 7 | NO |
| 18323971 | 東京ベイシティバス20系統 千鳥車庫⇒千鳥東⇒舞浜駅 | 7 | YES |
| 18351939 | 東京ベイシティバス20系統 クリーンセンター⇒千鳥車庫⇒舞浜駅 | 6 | YES |

## 使用しなかったもの

- Google Directions / Google Maps の経路推定
- route-22（若潮通り線 / 22千鳥東）の便・OSM relation

