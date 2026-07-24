# 重点地点 z19 目視レビュー（2026-07-25）

根拠: `screenshots/` + Overpass geometry report（overpassOk:true）

| 地点 | 進入 | 停車 | 退出／終点 | 判定 |
|---|---|---|---|---|
| 浦安駅入口 | 車道 | platform近傍 | フラワー通り方面 | OK |
| フラワー通り | 車道 | 方向別 | 堀江三丁目方面 | OK |
| 堀江六丁目 | 車道 | platform | 富士見／堀江東分岐 | OK |
| 堀江中学校前 | 車道 | platform | 富士見方面 | OK |
| 富士見三丁目 | 車道 | platform | ローズタウン方面 | OK |
| 京成ローズタウン | 大三角線 | 途中／止まり／始発別platform | 舞浜 or 浦安 | OK（始発 override 6778604861） |
| 舞浜駅 | ロータリー | 終点 | — | OK |
| 堀江東 | 高校系統分岐 | platform | 東野方面 | OK |
| 東野プール | 車道 | platform | 高校入口方面 | OK |
| 東海大浦安高校入口 | 市役所通り | 終点（高校前ではない） | — | OK |

補足: 9-maihama の relation way maxJoin 約24.8m（densify 後 maxGap 24.9m）。直線接続は未使用。
