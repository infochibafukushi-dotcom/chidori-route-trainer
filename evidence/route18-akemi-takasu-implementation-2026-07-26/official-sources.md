# route-18 明海・高洲線 一次情報ソース

確認日: 2026-07-26

## 1. 京成バスナビ（正本）

停留所順は **すべて個別便通過時刻表（`/stops?`）から読み取った実データ**であり、推測は一切していない。

- 新浦安駅 系統・時刻表一覧: https://transfer-cloud.navitime.biz/keiseibus-group/courses?busstop=00020619
- 浦安駅入口 系統・時刻表一覧: https://transfer-cloud.navitime.biz/keiseibus-group/courses?busstop=00020739
- 高洲海浜公園 系統・時刻表一覧: https://transfer-cloud.navitime.biz/keiseibus-group/courses?busstop=00020855
- 高洲北小学校 系統・時刻表一覧: https://transfer-cloud.navitime.biz/keiseibus-group/courses?busstop=00020720
- 潮音の街 系統・時刻表一覧: https://transfer-cloud.navitime.biz/keiseibus-group/courses?busstop=00020634
- 夢海の街 系統・時刻表一覧: https://transfer-cloud.navitime.biz/keiseibus-group/courses?busstop=00020709
- 明海大学前 系統・時刻表一覧: https://transfer-cloud.navitime.biz/keiseibus-group/courses?busstop=00020713
- 高洲橋 系統・時刻表一覧: https://transfer-cloud.navitime.biz/keiseibus-group/courses?busstop=00020857

### 2段凡例ゲート

(A) 掲載時刻表の凡例 と (B) 出発のりばの時刻表の凡例 の二段で系統を判定する。新浦安駅のりばEは [15] と [18] を同一セル・完全同一文言（「高洲海浜公園(潮音の街・高洲四丁目経由)高洲北小学校行」）で混載し、のりばHは [11]/[18]/[23]/[3]、高洲海浜公園・高洲北小学校のりばは [10]/[15]/[19] を混載するため、(B) 出発のりばの凡例（符号→【Ｎ系統】）を決定打とする。

### 採用した系統と出発のりばの凡例

#### `18-takasu-seaside` — 浦安駅入口 → 高洲海浜公園（15停留所・144便）

- コース: `0008200286`
- コース名: 15 [15]高洲海浜公園(潮音の街・高洲四丁目経由)高洲北小学校行 18 [18]高洲海浜公園(潮音の街・高洲四丁目経由)高洲北小学校行 [深夜]高洲海浜公園(潮音の街・高洲四丁目経由)高洲北小学校行 時刻表
- 出発のりば: **11**／符号 **ゆ**
- のりば凡例: ゆ…【１８系統】新浦安駅・高洲橋経由　高洲海浜公園行き
- のりば時刻表: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables?busstop=00020739&course-sequence=0008200211-1
- 個別便サンプル: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80ec0000/stops?departure-busstop=00020619-7&course=0008200286&datetime=2026-07-27T06:52:00%2B09:00
- 停留所順: 浦安駅入口 > 神明裏 > 猫実 > 消防本部前 > 海楽 > 美浜東団地 > 新浦安駅 > 入船中央エステート > 明海大学前 > 海風の街 > 夢海の街 > 高洲橋 > 高洲中央公園 > 潮音の街 > 高洲海浜公園

#### `18-urayasu-eki-iriguchi` — 高洲海浜公園 → 浦安駅入口（15停留所・150便）

- コース: `0008200285`
- コース名: 11 [11]（消防本部前経由）浦安駅入口（順天堂病院前・見明川住宅経由）舞浜駅行 18 [18]（消防本部前経由）浦安駅入口（順天堂病院前・見明川住宅経由）舞浜駅行 3 [23]（消防本部前経由）浦安駅入口（順天堂病院前・見明川住宅経由）舞浜駅行 [3]（消防本部前経由）浦安駅入口（順天堂病院前・見明川住宅経由）舞浜駅行 時刻表
- 出発のりば: **03**／符号 **う**
- のりば凡例: う…【１８系統】夢海の街、新浦安駅経由　浦安駅入口行き
- のりば時刻表: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables?busstop=00020855&course-sequence=0008200277-1
- 個別便サンプル: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80eb0000/stops?departure-busstop=00020619-9&course=0008200285&datetime=2026-07-27T06:16:00%2B09:00
- 停留所順: 高洲海浜公園 > 潮音の街 > 高洲中央公園 > 高洲橋 > 夢海の街 > 海風の街 > 明海大学前 > 入船中央エステート > 新浦安駅 > 美浜東団地 > 海楽 > 消防本部前 > 猫実 > 神明裏 > 浦安駅入口

#### `18-takasu-kita-shogakko` — 新浦安駅 → 高洲北小学校（16停留所・145便）

- コース: `0008200289`（同一停留所順の別コース: 0008200290）
- コース名: 15 [15]高洲海浜公園(潮音の街・高洲四丁目経由)高洲北小学校行 18 [18]高洲海浜公園(潮音の街・高洲四丁目経由)高洲北小学校行 [深夜]高洲海浜公園(潮音の街・高洲四丁目経由)高洲北小学校行 時刻表
- 出発のりば: **E**／符号 **た**
- のりば凡例: た…【１８系統】夢海の街・潮音の街・高洲四丁目経由　高洲北小学校行き＜★；深夜バス 運賃倍額＞
- のりば時刻表: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables?busstop=00020619&course-sequence=0008200278-1
- 個別便サンプル: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80ef0000/stops?departure-busstop=00020619-1&course=0008200289&datetime=2026-07-27T19:44:00%2B09:00
- 停留所順: 新浦安駅 > 入船中央エステート > 明海大学前 > 海風の街 > 夢海の街 > 高洲橋 > 高洲中央公園 > 潮音の街 > 高洲八丁目 > 高洲四丁目 > 高洲三丁目 > 高洲西児童公園 > 順天堂大学入口 > 高洲二丁目 > 東京学館前 > 高洲北小学校
- 運賃・時間帯の別コース:
  - `0008200289` 符号 た／通常運賃／19, 19, 19, 20, 20, 20, 20, 20, 21, 21, 21, 21, 21, 21, 21, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 23
  - `0008200290` 符号 ★た／深夜バス（運賃倍額）／23, 00

#### `18-takasu-seaside-from-shinurayasu` — 新浦安駅 → 高洲海浜公園（9停留所・130便）

- コース: `0008200288`
- コース名: 15 [15]高洲海浜公園(潮音の街・高洲四丁目経由)高洲北小学校行 18 [18]高洲海浜公園(潮音の街・高洲四丁目経由)高洲北小学校行 [深夜]高洲海浜公園(潮音の街・高洲四丁目経由)高洲北小学校行 時刻表
- 出発のりば: **E**／符号 **ゆ**
- のりば凡例: ゆ…【１８系統】夢海の街、高洲橋、潮音の街経由　高洲海浜公園行き
- のりば時刻表: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables?busstop=00020619&course-sequence=0008200278-1
- 個別便サンプル: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80ee0013/stops?departure-busstop=00020619-1&course=0008200288&datetime=2026-08-01T08:42:00%2B09:00
- 停留所順: 新浦安駅 > 入船中央エステート > 明海大学前 > 海風の街 > 夢海の街 > 高洲橋 > 高洲中央公園 > 潮音の街 > 高洲海浜公園

#### `18-shinurayasu-from-takasu` — 高洲海浜公園 → 新浦安駅（9停留所・145便）

- コース: `0008200287`
- コース名: 15 [15]（東京学館前経由）新浦安駅（夢海の街経由）新浦安駅・浦安駅入口行 18 [18]（東京学館前経由）新浦安駅（夢海の街経由）新浦安駅・浦安駅入口行 時刻表
- 出発のりば: **03**／符号 **ゆ**
- のりば凡例: ゆ…【１８系統】夢海の街経由　新浦安駅行き
- のりば時刻表: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables?busstop=00020855&course-sequence=0008200277-1
- 個別便サンプル: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80ed0015/stops?departure-busstop=00020855-1&course=0008200287&datetime=2026-08-01T08:26:00%2B09:00
- 停留所順: 高洲海浜公園 > 潮音の街 > 高洲中央公園 > 高洲橋 > 夢海の街 > 海風の街 > 明海大学前 > 入船中央エステート > 新浦安駅

### 凡例ゲートは通過したが未実装のパターン（道路ソース無し）

なし。新浦安駅発着の短縮便2本は検証済み composition で実装済み（`18-takasu-seaside-from-shinurayasu` / `18-shinurayasu-from-takasu`）。


### ゲートで除外した便

- **REJECT-route-15** 新浦安駅 → 高洲海浜公園（346便・course `0008200278`）
  - 出発のりば E の凡例: 無印…【１５系統】東京学館前経由　高洲海浜公園行き
  - 掲載時刻表の凡例: 無印…【１５系統】東京学館前経由　高洲海浜公園行き
  - 他系統固有停留所: {"15":["明海交差点","入船橋"]}
  - サンプル: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80e40006/stops?departure-busstop=00020619-1&course=0008200278&datetime=2026-07-27T06:31:00%2B09:00
- **REJECT-route-3** 総合公園 → 浦安駅入口（111便・course `0008200210`）
  - 出発のりば 01 の凡例: う…【３系統】新浦安駅経由　浦安駅入口行き
  - 掲載時刻表の凡例: (なし)
  - 他系統固有停留所: {"3/23":["総合公園","ベイサイドホテルエリア"]}
  - サンプル: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/81060004/stops?departure-busstop=00020619-13&course=0008200210&datetime=2026-07-27T06:33:00%2B09:00
- **REJECT-route-11** 総合公園 → 浦安駅入口（40便・course `0008200260`）
  - 出発のりば 04 の凡例: う…【１１系統】日の出公民館、新浦安駅経由　浦安駅入口行き
  - 掲載時刻表の凡例: (なし)
  - 他系統固有停留所: {"3/23":["ベイパーク","ベイモール","シンボルロードパークシティ","日の出公民館","総合公園","ベイサイドホテルエリア"]}
  - サンプル: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80d10000/stops?departure-busstop=00020619-10&course=0008200260&datetime=2026-07-27T06:53:00%2B09:00
- **REJECT-route-11** ベイパーク → 浦安駅入口（6便・course `0008200267`）
  - 出発のりば 02 の凡例: う…【１１系統】日の出公民館、新浦安駅経由　浦安駅入口行き
  - 掲載時刻表の凡例: (なし)
  - 他系統固有停留所: {"3/23":["ベイパーク","ベイモール","シンボルロードパークシティ","日の出公民館"]}
  - サンプル: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80d80002/stops?departure-busstop=00020619-8&course=0008200267&datetime=2026-08-01T07:09:00%2B09:00
- **REJECT-route-3** 明海五丁目 → 浦安駅入口（6便・course `0008200217`）
  - 出発のりば 02 の凡例: う…【３系統】新浦安駅経由　浦安駅入口行き
  - 掲載時刻表の凡例: (なし)
  - 他系統固有停留所: {}
  - サンプル: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/810d0000/stops?departure-busstop=00020619-11&course=0008200217&datetime=2026-08-01T08:55:00%2B09:00
- **REJECT-route-23** 総合公園 → 舞浜駅（3便・course `0008200302`）
  - 出発のりば 01 の凡例: ま…【２３系統】望海の街、新浦安駅、順天堂病院前経由　舞浜駅行き
  - 掲載時刻表の凡例: ま…【２３系統】順天堂病院前経由　舞浜駅行き（浦安駅入口には行きません）
  - 他系統固有停留所: {"25":["サンコーポ東口","サンコーポ西口","若潮公園","新浦安駅北口"],"3/23":["総合公園","ベイサイドホテルエリア"]}
  - サンプル: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/81110000/stops?departure-busstop=00020619-13&course=0008200302&datetime=2026-07-26T10:27:00%2B09:00
- **UNDECIDED-no-legend-match** 新浦安駅 → 浦安駅入口（4便・course `0008200269`）
  - 出発のりば H の凡例: -
  - 掲載時刻表の凡例: (なし)
  - 他系統固有停留所: {}
  - サンプル: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80da0002/stops?departure-busstop=00020619-1&course=0008200269&datetime=2026-07-27T11:35:00%2B09:00
- **REJECT-route-11** 日の出南 → 浦安駅入口（10便・course `0008200256`）
  - 出発のりば 01 の凡例: う…【１１系統】日の出公民館、新浦安駅経由　浦安駅入口行き
  - 掲載時刻表の凡例: (なし)
  - 他系統固有停留所: {"3/23":["ベイパーク","ベイモール","シンボルロードパークシティ","日の出公民館","総合公園","ベイサイドホテルエリア"]}
  - サンプル: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80cd0002/stops?departure-busstop=00020619-12&course=0008200256&datetime=2026-08-01T11:13:00%2B09:00
- **REJECT-route-3** 浦安駅入口 → 総合公園（35便・course `0008200211`）
  - 出発のりば 11 [11]（新浦安駅・明海五丁目経由）総合公園（新浦安駅・ベイパーク経由）総 の凡例: あ…【３系統】新浦安駅・明海五丁目経由　総合公園行き
  - 掲載時刻表の凡例: あ…【３系統】新浦安駅・明海五丁目経由　総合公園行き
  - 他系統固有停留所: {"3/23":["総合公園","ベイサイドホテルエリア"]}
  - サンプル: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/81070003/stops?departure-busstop=00020739-1&course=0008200211&datetime=2026-07-27T06:55:00%2B09:00
- **REJECT-route-11** 浦安駅入口 → 総合公園（19便・course `0008200261`）
  - 出発のりば 11 [11]（新浦安駅・明海五丁目経由）総合公園（新浦安駅・ベイパーク経由）総 の凡例: そ…【１１系統】新浦安駅・ベイパーク経由　総合公園行き
  - 掲載時刻表の凡例: そ…【１１系統】新浦安駅・ベイパーク経由　総合公園行き
  - 他系統固有停留所: {"3/23":["ベイパーク","ベイモール","シンボルロードパークシティ","日の出公民館","総合公園","ベイサイドホテルエリア"]}
  - サンプル: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80d20000/stops?departure-busstop=00020739-1&course=0008200261&datetime=2026-07-27T07:20:00%2B09:00
- **REJECT-route-11** 浦安駅入口 → 新浦安駅（5便・course `0008200270`）
  - 出発のりば 11 [11]（新浦安駅・明海五丁目経由）総合公園（新浦安駅・ベイパーク経由）総 の凡例: 新…【１１系統】新浦安駅止まり
  - 掲載時刻表の凡例: 新…【１１系統】新浦安駅止まり
  - 他系統固有停留所: {}
  - サンプル: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80db0000/stops?departure-busstop=00020739-1&course=0008200270&datetime=2026-07-27T08:00:00%2B09:00
- **REJECT-route-11** 浦安駅入口 → 日の出南（7便・course `0008200257`）
  - 出発のりば 11 [11]（新浦安駅・明海五丁目経由）総合公園（新浦安駅・ベイパーク経由）総 の凡例: ひ…【１１系統】日の出南（墓地公園）行き
  - 掲載時刻表の凡例: ひ…【１１系統】日の出南（墓地公園）行き
  - 他系統固有停留所: {"3/23":["ベイパーク","ベイモール","シンボルロードパークシティ","日の出公民館","総合公園","ベイサイドホテルエリア"]}
  - サンプル: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80ce0003/stops?departure-busstop=00020739-1&course=0008200257&datetime=2026-08-01T10:33:00%2B09:00
- **REJECT-route-3** 浦安駅入口 → 明海五丁目（4便・course `0008200218`）
  - 出発のりば 11 [11]（新浦安駅・明海五丁目経由）総合公園（新浦安駅・ベイパーク経由）総 の凡例: 明…【３系統】新浦安駅経由　明海五丁目止まり
  - 掲載時刻表の凡例: 明…【３系統】新浦安駅経由　明海五丁目止まり
  - 他系統固有停留所: {}
  - サンプル: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/810e0001/stops?departure-busstop=00020739-1&course=0008200218&datetime=2026-07-27T13:51:00%2B09:00
- **REJECT-route-11** 浦安駅入口 → ベイパーク（3便・course `0008200268`）
  - 出発のりば 11 [11]（新浦安駅・明海五丁目経由）総合公園（新浦安駅・ベイパーク経由）総 の凡例: ベ…【１１系統】新浦安駅経由　ベイパーク止まり
  - 掲載時刻表の凡例: ベ…【１１系統】新浦安駅経由　ベイパーク止まり
  - 他系統固有停留所: {"3/23":["ベイパーク","ベイモール","シンボルロードパークシティ","日の出公民館"]}
  - サンプル: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80d90001/stops?departure-busstop=00020739-1&course=0008200268&datetime=2026-08-01T17:34:00%2B09:00
- **REJECT-route-15** 高洲海浜公園 → 新浦安駅（332便・course `0008200277`）
  - 出発のりば 03 の凡例: 無印…【１５系統】東京学館前経由　新浦安駅行き
  - 掲載時刻表の凡例: 無印…【１５系統】東京学館前経由　新浦安駅行き
  - 他系統固有停留所: {"15":["明海交差点","入船橋"]}
  - サンプル: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80e30005/stops?departure-busstop=00020855-1&course=0008200277&datetime=2026-07-27T06:15:00%2B09:00
- **UNDECIDED-no-legend-match** 舞浜駅 → 高洲海浜公園（11便・course `0008200306`）
  - 出発のりば - の凡例: -
  - 掲載時刻表の凡例: (なし)
  - 他系統固有停留所: {}
  - サンプル: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/81030005/stops?departure-busstop=00020634-14&course=0008200306&datetime=2026-08-01T10:28:00%2B09:00
- **REJECT-route-3** 総合公園 → 新浦安駅（326便・course `0008200212`）
  - 出発のりば 01 の凡例: 無印…【３系統】望海の街経由　新浦安駅行き
  - 掲載時刻表の凡例: (なし)
  - 他系統固有停留所: {"3/23":["総合公園","ベイサイドホテルエリア"]}
  - サンプル: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/81080001/stops?departure-busstop=00020709-9&course=0008200212&datetime=2026-07-27T06:06:00%2B09:00
- **REJECT-route-3** 明海五丁目 → 新浦安駅（44便・course `0008200214`）
  - 出発のりば 02 の凡例: 無印…【３系統】望海の街経由　新浦安駅行き
  - 掲載時刻表の凡例: (なし)
  - 他系統固有停留所: {}
  - サンプル: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/810a0007/stops?departure-busstop=00020709-7&course=0008200214&datetime=2026-08-01T06:56:00%2B09:00
- **REJECT-route-3** 望海の街 → 新浦安駅（8便・course `0008200216`）
  - 出発のりば 03 の凡例: 始発…【３系統】当バス停始発、新浦安駅行き
  - 掲載時刻表の凡例: (なし)
  - 他系統固有停留所: {}
  - サンプル: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/810c0000/stops?departure-busstop=00020709-2&course=0008200216&datetime=2026-07-27T07:21:00%2B09:00
- **REJECT-route-11** 高洲海浜公園 → 新浦安駅（17便・course `0008202661`）
  - 出発のりば 01 の凡例: 新…【１１系統】ベイパーク、明海大学前経由　新浦安駅行き
  - 掲載時刻表の凡例: (なし)
  - 他系統固有停留所: {"3/23":["ベイパーク","ベイモール","シンボルロードパークシティ","日の出公民館"]}
  - サンプル: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80dc0000/stops?departure-busstop=00020713-9&course=0008202661&datetime=2026-07-27T06:14:00%2B09:00
- **UNDECIDED-no-legend-match** 日の出七丁目 → 新浦安駅（128便・course `0008200279`）
  - 出発のりば - の凡例: -
  - 掲載時刻表の凡例: (なし)
  - 他系統固有停留所: {}
  - サンプル: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80e50000/stops?departure-busstop=00020713-8&course=0008200279&datetime=2026-07-27T06:15:00%2B09:00
- **REJECT-route-11** 総合公園 → 新浦安駅（108便・course `0008200262`）
  - 出発のりば 04 の凡例: 無印…【１１系統】日の出公民館経由　新浦安駅行き
  - 掲載時刻表の凡例: (なし)
  - 他系統固有停留所: {"3/23":["ベイパーク","ベイモール","シンボルロードパークシティ","日の出公民館","総合公園","ベイサイドホテルエリア"]}
  - サンプル: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80d30000/stops?departure-busstop=00020713-8&course=0008200262&datetime=2026-07-27T06:25:00%2B09:00
- **REJECT-route-11** ベイパーク → 新浦安駅（15便・course `0008200265`）
  - 出発のりば 02 の凡例: 無印…【１１系統】日の出公民館経由　新浦安駅行き
  - 掲載時刻表の凡例: (なし)
  - 他系統固有停留所: {"3/23":["ベイパーク","ベイモール","シンボルロードパークシティ","日の出公民館"]}
  - サンプル: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80d60001/stops?departure-busstop=00020713-6&course=0008200265&datetime=2026-07-27T06:44:00%2B09:00
- **REJECT-route-11** 日の出南 → 新浦安駅（33便・course `0008200258`）
  - 出発のりば 01 の凡例: 無印…【１１系統】日の出公民館経由　新浦安駅行き
  - 掲載時刻表の凡例: (なし)
  - 他系統固有停留所: {"3/23":["ベイパーク","ベイモール","シンボルロードパークシティ","日の出公民館","総合公園","ベイサイドホテルエリア"]}
  - サンプル: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80cf0013/stops?departure-busstop=00020713-10&course=0008200258&datetime=2026-08-01T10:38:00%2B09:00

## 2. OpenStreetMap（座標・道路形状のみ）

Overpass（overpass.kumi.systems 優先／overpass-api.de・api.openstreetmap.org へフォールバック）で
`ref=18` の bus relation を bbox から**探索して**取得した（ID決め打ちではない）。

| relation | name | way members | platform members |
| ---: | --- | ---: | ---: |
| 18417590 | 東京ベイシティバス18系統 新浦安駅⇒潮音の街⇒高洲北小学校 | 27 | 16 |
| 18352907 | 東京ベイシティバス18系統 高洲海浜公園⇒新浦安駅⇒浦安駅入口 | 29 | 15 |
| 18352908 | 東京ベイシティバス18系統 浦安駅入口⇒新浦安駅⇒高洲海浜公園 | 48 | 15 |

探索で見つかった `ref=18` relation は上記3件のみ。
さらに 夢海の街 / 高洲橋 の platform を含む relation を名称非依存で総当りしたが（`platformProbe`）、
新たな `ref=18` relation は見つからなかった。

| navi パターン | OSM relation |
| --- | --- |
| 浦安駅入口 → 高洲海浜公園（15停留所） | 18352908 |
| 高洲海浜公園 → 浦安駅入口（15停留所） | 18352907 |
| 新浦安駅 → 高洲北小学校（16停留所） | 18417590 |
| 新浦安駅 → 高洲海浜公園（9停留所） | null |
| 高洲海浜公園 → 新浦安駅（9停留所） | null |

### 分離ガード（兄弟系統の relation）

同じ bbox の `ref=15` / `ref=19` / `ref=10` / `ref=25` relation も記録したが、
route-18 の geometry には**一切使用していない**。

- ref=15:
  - 18419864 東京ベイシティバス15系統 高洲海浜公園⇒東京学館⇒新浦安駅
  - 18419865 東京ベイシティバス15系統 新浦安駅⇒東京学館⇒高洲海浜公園
- ref=19:
  - 18381770 東京ベイシティバス19系統 高洲海浜公園⇒高洲四丁目・東京学館⇒新浦安駅
  - 18381771 東京ベイシティバス19系統 新浦安駅⇒東京学館・高洲四丁目⇒高洲海浜公園
- ref=10:
  - 18381756 東京ベイシティバス10系統 みなと南⇒東京学館⇒新浦安駅
  - 18381757 東京ベイシティバス10系統 新浦安駅⇒東京学館⇒みなと南
- ref=25:
  - 18352022 東京ベイシティバス25系統 高洲海浜公園⇒高洲西児童公園⇒舞浜駅
  - 18352023 東京ベイシティバス25系統 舞浜駅⇒高洲西児童公園⇒高洲海浜公園
  - 18352044 東京ベイシティバス25系統 総合公園⇒高洲西児童公園⇒舞浜駅
  - 18352045 東京ベイシティバス25系統 舞浜駅⇒高洲西児童公園⇒総合公園

## 3. 使用していない情報源

- Google Directions / Roads API（道路形状の生成に不使用）
- route-15 の `shione-no-machi-line-*` モジュール、path、停留所配列（流用していない）
- route-1〜17 の path / hash / 停留所（一切変更していない）
- 停留所画像（捏造なし。バンクは空で生成）
