# シンボルロード線（route-11）公式出典サマリ

## 確認日時
2026-07-25T03:14:01.646Z（監査再オープン反映）

## 正本
京成バスナビ（transfer-cloud.navitime.biz/keiseibus-group）の個別便通過時刻表（`/stops?`）

## 収集統計
- confirmedSystems: 11
- sameEndpointDifferentRoute groups: 0
- lateNightSystems: 0
- unconfirmedCandidates: 7
- rejected route3 (incl. audit): 4

## 監査結果（2026-07-25 Playwright再オープン）
### REMOVE（系統3誤分類）
- `11-shinurayasu-symbol-road-pc` — trip page 【3系統】（シ）。望海/明海五丁目経由でシンボル止まり
- `11-shinurayasu-symbol-road-pc-night` — 同上パターン（★シ）。系統11ではない
- `11-urayasu-akemi5` — trip page 【3系統】 浦安駅入口→明海五丁目
- `11-urayasu-sogo-via-akemi5` — trip page 【3系統】 浦安駅入口→総合公園（望海/明海五丁目経由）

### KEEP（疑義あったが11確認）
- `11-sogo-urayasu` — 【11系統】総合公園→浦安駅入口。サンプルを総合公園発に更新

### ADD
- なし
- `11-shinurayasu-urayasu`: H/[11]上で新浦安始発→浦安の【11】未確認
- `11-baypark-shinurayasu`: 独立始発未確認（総合公園発11の中間乗車のみ）
- `11-shinurayasu-nozomi-night`: ★シは【3系統】シンボル行き

## busstop ID
- urayasu: `00020739`
- shinurayasu: `00020619`
- baypark: `00020735`
- sogo: `00020745`
- symbolRoadPc: `00020856`
- hinodeKominkan: `00020652`
- hinode: `00020849`
- nozomi: `00020689`
- akemi5: `00020710`

## 確認済み運行パターン（confirmedSystems）

| systemKey | 始発 | 終点 | via | 深夜 | 停留所数 | のりば |
| --- | --- | --- | --- | --- | ---: | --- |
| 11-hinode-shinurayasu | 日の出南 | 新浦安駅 | hinode-kominkan |  | 12 | 01 |
| 11-hinode-urayasu | 日の出南 | 浦安駅入口 | hinode-kominkan |  | 18 | 01 |
| 11-shinurayasu-baypark | 新浦安駅 | ベイパーク | hinode-kominkan |  | 8 | 11 |
| 11-shinurayasu-hinode | 新浦安駅 | 日の出南 | hinode-kominkan |  | 12 | 11 |
| 11-shinurayasu-sogo | 新浦安駅 | 総合公園 | hinode-kominkan |  | 10 | 11 |
| 11-sogo-shinurayasu | 総合公園 | 新浦安駅 | hinode-kominkan |  | 10 | 04 |
| 11-sogo-urayasu | 総合公園 | 浦安駅入口 | hinode-kominkan |  | 16 | 01 |
| 11-urayasu-baypark | 浦安駅入口 | ベイパーク | hinode-kominkan |  | 14 | 11 |
| 11-urayasu-hinode | 浦安駅入口 | 日の出南 | hinode-kominkan |  | 18 | 11 |
| 11-urayasu-shinurayasu | 浦安駅入口 | 新浦安駅 |  |  | 7 | 11 |
| 11-urayasu-sogo-via-hinode-kominkan | 浦安駅入口 | 総合公園 | hinode-kominkan |  | 16 | 11 |

### 11-hinode-shinurayasu
- title: 新浦安駅行き（日の出南発）
- tripSignature: `11|00020849-1|00020619|00020849>00020622>00020745>00020681>00020735>00020736>00020856>00020652>00020848>00020713>00020663>00020619|>>>>>>>>>>>|regular`
- sample: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80cf0013/stops?departure-busstop=00020849-1&course=0008200258&datetime=2026-07-25T10:29:00%2B09:00
- stops (12): 日の出南 → 新浦安温泉 → 総合公園 → ベイサイドホテルエリア → ベイパーク → ベイモール → シンボルロード・パークシティ → 日の出公民館 → 海風の街 → 明海大学前 → 入船中央エステート → 新浦安駅

### 11-hinode-urayasu
- title: 浦安駅入口行き（日の出南発）
- tripSignature: `11|00020849-1|00020739|00020849>00020622>00020745>00020681>00020735>00020736>00020856>00020652>00020848>00020713>00020663>00020619>00020670>00020845>00020877>00020666>00020623>00020739|>>>>>>>>>>>>>>>>>|regular`
- sample: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80cd0001/stops?departure-busstop=00020849-1&course=0008200256&datetime=2026-07-27T11:53:00%2B09:00
- stops (18): 日の出南 → 新浦安温泉 → 総合公園 → ベイサイドホテルエリア → ベイパーク → ベイモール → シンボルロード・パークシティ → 日の出公民館 → 海風の街 → 明海大学前 → 入船中央エステート → 新浦安駅 → 美浜東団地 → 海楽 → 消防本部前 → 猫実 → 神明裏 → 浦安駅入口

### 11-shinurayasu-baypark
- title: ベイパーク行き（新浦安駅発）
- tripSignature: `11|00020619-1|00020735|00020619>00020663>00020713>00020848>00020652>00020856>00020736>00020735|>>>>>>>|regular`
- sample: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80d70002/stops?departure-busstop=00020619-1&course=0008200266&datetime=2026-07-27T08:51:00%2B09:00
- stops (8): 新浦安駅 → 入船中央エステート → 明海大学前 → 海風の街 → 日の出公民館 → シンボルロード・パークシティ → ベイモール → ベイパーク

### 11-shinurayasu-hinode
- title: 日の出南行き（新浦安駅発）
- tripSignature: `11|00020619-1|00020849|00020619>00020663>00020713>00020848>00020652>00020856>00020736>00020735>00020681>00020745>00020622>00020849|>>>>>>>>>>>|regular`
- sample: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80d00008/stops?departure-busstop=00020619-1&course=0008200259&datetime=2026-07-27T10:19:00%2B09:00
- stops (12): 新浦安駅 → 入船中央エステート → 明海大学前 → 海風の街 → 日の出公民館 → シンボルロード・パークシティ → ベイモール → ベイパーク → ベイサイドホテルエリア → 総合公園 → 新浦安温泉 → 日の出南

### 11-shinurayasu-sogo
- title: 総合公園行き（新浦安駅発）
- tripSignature: `11|00020619-1|00020745|00020619>00020663>00020713>00020848>00020652>00020856>00020736>00020735>00020681>00020745|>>>>>>>>>|regular`
- sample: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80d40000/stops?departure-busstop=00020619-1&course=0008200263&datetime=2026-07-27T06:00:00%2B09:00
- stops (10): 新浦安駅 → 入船中央エステート → 明海大学前 → 海風の街 → 日の出公民館 → シンボルロード・パークシティ → ベイモール → ベイパーク → ベイサイドホテルエリア → 総合公園

### 11-sogo-shinurayasu
- title: 新浦安駅行き（総合公園発）
- tripSignature: `11|00020745-1|00020619|00020745>00020681>00020735>00020736>00020856>00020652>00020848>00020713>00020663>00020619|>>>>>>>>>|regular`
- sample: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80d30000/stops?departure-busstop=00020745-1&course=0008200262&datetime=2026-07-27T06:18:00%2B09:00
- stops (10): 総合公園 → ベイサイドホテルエリア → ベイパーク → ベイモール → シンボルロード・パークシティ → 日の出公民館 → 海風の街 → 明海大学前 → 入船中央エステート → 新浦安駅

### 11-sogo-urayasu
- title: 浦安駅入口行き（総合公園発）
- tripSignature: `11|00020745-1|00020739|00020745>00020681>00020735>00020736>00020856>00020652>00020848>00020713>00020663>00020619>00020670>00020845>00020877>00020666>00020623>00020739|>>>>>>>>>>>>>>>|regular`
- sample: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80d10000/stops?departure-busstop=00020745-1&course=0008200260&datetime=2026-07-27T06:42:00%2B09:00
- stops (16): 総合公園 → ベイサイドホテルエリア → ベイパーク → ベイモール → シンボルロード・パークシティ → 日の出公民館 → 海風の街 → 明海大学前 → 入船中央エステート → 新浦安駅 → 美浜東団地 → 海楽 → 消防本部前 → 猫実 → 神明裏 → 浦安駅入口

### 11-urayasu-baypark
- title: ベイパーク行き（浦安駅入口発）
- tripSignature: `11|00020739-1|00020735|00020739>00020623>00020666>00020877>00020845>00020670>00020619>00020663>00020713>00020848>00020652>00020856>00020736>00020735|>>>>>>>>>>>>>|regular`
- sample: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80d90001/stops?departure-busstop=00020739-1&course=0008200268&datetime=2026-07-25T17:34:00%2B09:00
- stops (14): 浦安駅入口 → 神明裏 → 猫実 → 消防本部前 → 海楽 → 美浜東団地 → 新浦安駅 → 入船中央エステート → 明海大学前 → 海風の街 → 日の出公民館 → シンボルロード・パークシティ → ベイモール → ベイパーク

### 11-urayasu-hinode
- title: 日の出南行き（浦安駅入口発）
- tripSignature: `11|00020739-1|00020849|00020739>00020623>00020666>00020877>00020845>00020670>00020619>00020663>00020713>00020848>00020652>00020856>00020736>00020735>00020681>00020745>00020622>00020849|>>>>>>>>>>>>>>>>>|regular`
- sample: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80ce0003/stops?departure-busstop=00020739-1&course=0008200257&datetime=2026-07-25T10:33:00%2B09:00
- stops (18): 浦安駅入口 → 神明裏 → 猫実 → 消防本部前 → 海楽 → 美浜東団地 → 新浦安駅 → 入船中央エステート → 明海大学前 → 海風の街 → 日の出公民館 → シンボルロード・パークシティ → ベイモール → ベイパーク → ベイサイドホテルエリア → 総合公園 → 新浦安温泉 → 日の出南

### 11-urayasu-shinurayasu
- title: 新浦安駅行き（浦安駅入口発）
- tripSignature: `11|00020739-1|00020619|00020739>00020623>00020666>00020877>00020845>00020670>00020619|>>>>>>|regular`
- sample: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80db0000/stops?departure-busstop=00020739-1&course=0008200270&datetime=2026-07-27T08:00:00%2B09:00
- stops (7): 浦安駅入口 → 神明裏 → 猫実 → 消防本部前 → 海楽 → 美浜東団地 → 新浦安駅

### 11-urayasu-sogo-via-hinode-kominkan
- title: 総合公園行き（浦安駅入口発）・日の出公民館経由
- tripSignature: `11|00020739-1|00020745|00020739>00020623>00020666>00020877>00020845>00020670>00020619>00020663>00020713>00020848>00020652>00020856>00020736>00020735>00020681>00020745|>>>>>>>>>>>>>>>|regular`
- sample: https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80d20000/stops?departure-busstop=00020739-1&course=0008200261&datetime=2026-07-27T07:20:00%2B09:00
- stops (16): 浦安駅入口 → 神明裏 → 猫実 → 消防本部前 → 海楽 → 美浜東団地 → 新浦安駅 → 入船中央エステート → 明海大学前 → 海風の街 → 日の出公民館 → シンボルロード・パークシティ → ベイモール → ベイパーク → ベイサイドホテルエリア → 総合公園

## 未確認候補
- 11-shinurayasu-urayasu (新浦安駅 → 浦安駅入口) — 監査再オープン: H/[11]時刻表上で新浦安駅始発→浦安駅入口の【11系統】便は未確認（多くは総合公園始発の通過）
- 11-baypark-shinurayasu (ベイパーク → 新浦安駅) — 監査再オープン: ベイパーク発として独立始発の【11系統】は未確認。観測は総合公園発11の中間乗車（=11-sogo-shinurayasuの部分）
- 11-shinurayasu-nozomi-night (新浦安駅 → 望海の街) — 監査再オープン: ★シ/シ深夜は【3系統】シンボルロード・パークシティ行き（望海経由）。11の望海止まりではない
- 11-baypark-urayasu (ベイパーク → 浦安駅入口) — 公式個別便で系統11として確認できず
- 11-sogo-hinode (総合公園 → 日の出南) — 公式個別便で系統11として確認できず
- 11-akemi5-start (明海五丁目 → ?) — 公式個別便で系統11として確認できず
- 11-nozomi-shinurayasu (望海の街 → 新浦安駅) — 公式個別便で系統11として確認できず

## 除外した他系統
- 監査で【3系統】と確定した便は rejectedRoute3 へ移動
- 高洲海浜公園終点は系統11非対象（relation 18419852 使用禁止）

## 生データ
- `_audit_trip_samples.json`
- `_navi_scrape_raw.json`
- `official-all-trips.json`
- `official-trip-signatures.json`
- `official-system-candidates.json`

## ゲート
本ファイル群が揃うまで path 実装を開始しない。
