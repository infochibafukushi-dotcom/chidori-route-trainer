# route-17 日の出線 一次情報ソース

確認日: 2026-07-26

## 1. 京成バスナビ（正本）

停留所順は **すべて個別便通過時刻表（`/stops?`）から読み取った実データ**であり、推測は一切していない。

- 新浦安駅 系統・時刻表一覧: https://transfer-cloud.navitime.biz/keiseibus-group/courses?busstop=00020619
- 日の出七丁目 系統・時刻表一覧: https://transfer-cloud.navitime.biz/keiseibus-group/courses?busstop=00020866
- ベイシティ浦安 系統・時刻表一覧: https://transfer-cloud.navitime.biz/keiseibus-group/courses?busstop=00020734
- 日の出東 系統・時刻表一覧: https://transfer-cloud.navitime.biz/keiseibus-group/courses?busstop=00020656
- 東京電力 系統・時刻表一覧: https://transfer-cloud.navitime.biz/keiseibus-group/courses?busstop=00020642

### 採用した系統と出発のりばの凡例

#### `17-hinode-nanachome` — 新浦安駅 → 日の出七丁目（10停留所・488便）

- コース: `0008200282`
- コース名: 17 [17]（日の出東経由）日の出七丁目（日の出東・プラウド新浦安パークマリーナ経由）ベイシティ浦安行 [深夜]（日の出東経由）日の出七丁目（日の出東・プラウド新浦安パークマリーナ経由）ベイシティ浦安行 時刻表
- 出発のりば: **17**／符号 **(無印)**
- のりば凡例: 無印…【１７系統】日の出東経由　日の出七丁目行き
- のりば時刻表: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables?busstop=00020619&course-sequence=0008200282-1
- 個別便サンプル: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80e80008/stops?departure-busstop=00020619-1&course=0008200282&datetime=2026-07-27T06:30:00%2B09:00
- 停留所順: 新浦安駅 > 入船中央エステート > 明海大学前 > 日の出保育園入口 > 東京電力 > 日の出小学校 > 日の出東 > アールフォーラム > 順天堂大学・日の出 東口 > 日の出七丁目

#### `17-baycity-urayasu` — 新浦安駅 → ベイシティ浦安（14停留所・164便）

- コース: `0008200283`（同一停留所順の別コース: 0008200284）
- コース名: 17 [17]（日の出東経由）日の出七丁目（日の出東・プラウド新浦安パークマリーナ経由）ベイシティ浦安行 [深夜]（日の出東経由）日の出七丁目（日の出東・プラウド新浦安パークマリーナ経由）ベイシティ浦安行 時刻表
- 出発のりば: **17**／符号 **ベ**
- のりば凡例: ベ…【１７系統】日の出東・プラウド新浦安パークマリーナ経由　ベイシティ浦安行き＜★；深夜バス（運賃倍額）＞
- のりば時刻表: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables?busstop=00020619&course-sequence=0008200282-1
- 個別便サンプル: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80e90025/stops?departure-busstop=00020619-1&course=0008200283&datetime=2026-07-26T11:41:00%2B09:00
- 停留所順: 新浦安駅 > 入船中央エステート > 明海大学前 > 日の出保育園入口 > 東京電力 > 日の出小学校 > 日の出東 > アールフォーラム > 順天堂大学・日の出 東口 > 日の出西 > 順天堂大学・日の出 正門 > プラウド新浦安パークマリーナ > 日の出中学校 > ベイシティ浦安

#### `17-shinurayasu` — 日の出七丁目 → 新浦安駅（10停留所・531便）

- コース: `0008200281`
- コース名: 17 [17]（東京電力経由）新浦安駅行 時刻表
- 出発のりば: **17**／符号 **(無印)**
- のりば凡例: 無印…【１７系統】東京電力経由　新浦安駅行き
- のりば時刻表: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables?busstop=00020866&course-sequence=0008200281-1
- 個別便サンプル: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80e70000/stops?departure-busstop=00020866-1&course=0008200281&datetime=2026-07-27T06:03:00%2B09:00
- 停留所順: 日の出七丁目 > 順天堂大学・日の出 東口 > アールフォーラム > 日の出東 > 日の出小学校 > 東京電力 > 日の出保育園入口 > 明海大学前 > 入船中央エステート > 新浦安駅

### ゲートで除外した便

- **REJECT-route-16** 日の出七丁目 → 新浦安駅（128便・course `0008200279`）
  - 出発のりば 01 の凡例: 無印…【１６系統】プラウド新浦安パークマリーナ・海風の街経由　新浦安駅行き
  - 掲載時刻表の凡例: 無印…【１６系統】海風の街経由　新浦安駅行き
  - 16系統固有停留所: 海風の街
  - サンプル: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80e50000/stops?departure-busstop=00020659-4&course=0008200279&datetime=2026-07-27T06:11:00%2B09:00

## 2. OpenStreetMap（座標・道路形状のみ）

Overpass（overpass.kumi.systems 優先／api.openstreetmap.org へフォールバック）で `ref=17` の
bus relation を bbox 35.60,139.85,35.70,139.96 から**探索して**取得した（ID決め打ちではない）。

| relation | name | way members | platform members |
| ---: | --- | ---: | ---: |
| 18396569 | 東京ベイシティバス17系統 新浦安駅⇒東京電力⇒日の出七丁目 | 15 | 10 |
| 18396568 | 東京ベイシティバス17系統 日の出七丁目⇒東京電力⇒新浦安駅 | 11 | 10 |
| 18396583 | 東京ベイシティバス17系統 新浦安駅⇒東京電力・プラウド新浦安パークマリーナ⇒ベイシティ浦安 | 18 | 14 |

探索で見つかった `ref=17` relation は上記3件のみで、バスナビで確定した3系統と1対1で対応する。

### 分離ガード（route-16 relation）

同じ bbox の `ref=16` relation も記録したが、route-17 の geometry には**一切使用していない**。

- 18396562 東京ベイシティバス16系統 日の出七丁目⇒プラウド新浦安パークマリーナ⇒新浦安駅
- 18396563 東京ベイシティバス16系統 新浦安駅⇒プラウド新浦安パークマリーナ⇒日の出七丁目

## 3. 使用していない情報源

- Google Directions / Roads API（道路形状の生成に不使用）
- route-16 の `hinode-line-*` モジュール、path、停留所配列（読み取りも流用もしていない）
- 停留所画像（捏造なし。バンクは空で生成）
