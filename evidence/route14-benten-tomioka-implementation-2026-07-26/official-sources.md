# 弁天・富岡線（系統14 / route-14）公式出典

調査日: 2026-07-26

## 1. 京成バスナビ（最優先）

ベースURL: https://transfer-cloud.navitime.biz/keiseibus-group

| 用途 | URL |
| --- | --- |
| 新浦安駅 のりば・系統一覧 | https://transfer-cloud.navitime.biz/keiseibus-group/courses?busstop=00020619 |
| 舞浜駅 のりば・系統一覧 | https://transfer-cloud.navitime.biz/keiseibus-group/courses?busstop=00020617 |
| 千鳥車庫 のりば・系統一覧 | https://transfer-cloud.navitime.biz/keiseibus-group/courses?busstop=00020620 |

### コース（時刻表）

| 発地 | のりば | コース表示名 |
| --- | --- | --- |
| 新浦安駅 | 14 | `[14]（順天堂病院前・弁天中央経由）舞浜駅・千鳥車庫行` |
| 舞浜駅 | 14 | `[14]（弁天中央経由）新浦安駅行` |
| 千鳥車庫 | 02 | `[14]/[2]/[4]/[6]` 混載セル（凡例で系統判定が必須） |

### 個別便通過時刻表（停留所順の正本）

| 系統キー | 符号 | コース | 便数 | 出典URL |
| --- | --- | --- | ---: | --- |
| `14-maihama` | 無印 | 0008200274 | 51 | https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80e00002/stops?departure-busstop=00020619-1&course=0008200274&datetime=2026-07-27T06:37:00%2B09:00 |
| `14-chidori-garage` | ち | 0008200276 | 4 | https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80e20001/stops?departure-busstop=00020619-1&course=0008200276&datetime=2026-07-27T19:19:00%2B09:00 |
| `14-shinurayasu-maihama` | 無印 | 0008200273 | 52 | https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80df0003/stops?departure-busstop=00020617-1&course=0008200273&datetime=2026-07-27T07:19:00%2B09:00 |
| `14-shinurayasu-chidori` | し | 0008200275 | 4 | https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80e10000/stops?departure-busstop=00020620-1&course=0008200275&datetime=2026-07-27T06:05:00%2B09:00 |

### 時刻表凡例（系統の決め手）

- `14-maihama` ← 無印…【１４系統】順天堂病院前・弁天中央経由　舞浜駅行き
- `14-chidori-garage` ← ち…【１４系統】順天堂病院前・弁天中央経由　千鳥車庫行き（千鳥北方面には行きません）
- `14-shinurayasu-maihama` ← 無印…【１４系統】弁天中央経由　新浦安駅行き
- `14-shinurayasu-chidori` ← し…【１４系統】弁天中央経由　新浦安駅行き

千鳥車庫のりば02では同じコースセルに他系統が混載されるため、凡例で除外した便:

| 符号 | 凡例 | 系統 | 停留所数 |
| --- | --- | --- | ---: |
| (無印) | 無印…【２系統】新浦安駅北口経由　浦安駅入口行き | 2 | 17 |
| 南小 | 南小…【４系統】南小入口経由　浦安駅入口行き | 4 | 17 |
| 市 | 市…【６系統】市役所入口経由　浦安駅入口行き | 6 | 17 |

## 2. OSM route relations（道路形状・停留所座標）

| relation | name | way members | platforms | 公式順と一致 |
| ---: | --- | ---: | ---: | --- |
| 18323926 | 東京ベイシティバス14系統 新浦安駅⇒中央公園⇒舞浜駅 | 26 | 19 | YES |
| 18419877 | 東京ベイシティバス14系統 新浦安駅⇒中央公園⇒千鳥車庫 | 23 | 18 | YES |
| 9983017 | 東京ベイシティバス14系統 舞浜駅⇒中央公園⇒新浦安駅 | 26 | 19 | YES |
| 18419876 | 東京ベイシティバス14系統 千鳥車庫⇒中央公園⇒新浦安駅 | 22 | 18 | YES |

Overpass: `overpass.kumi.systems` 優先。504 時は `api.openstreetmap.org/api/0.6/relation/<id>/full.json` にフォールバック。

## 3. 旧baycityページ

今回は不使用。京成バスナビとOSMのみで全4系統が確定したため参照不要。

## 使用しなかったもの

- Google Directions / Google Maps の経路推定（道路形状には一切使用しない）
- 既存route1〜12のpath・stops（route-14では流用しない）

