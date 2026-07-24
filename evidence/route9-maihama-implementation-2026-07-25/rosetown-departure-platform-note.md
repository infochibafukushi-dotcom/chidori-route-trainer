# 京成ローズタウン 発車 platform（9-urayasu-rosetown）

## 問題

OSM relation `3498220`（舞浜駅⇒浦安駅入口）は `platform` に到着用 node `6778604860`（35.6420322, 139.8819328）を載せている。

relation `18320323`（浦安駅入口⇒舞浜駅）の 9-rosetown 終点は node `6778604861`（35.6414511, 139.8812333）で、到着 node 6778604860 から約 70m 離れる。

## 採用

OSM node `6778604861`

- 9-rosetown 終点 platform と同一
- 京成バスナビ busstop 00020678 始発・浦安駅入口行き
- path 始点（startHint 反転後）まで原則 20m 以内

## path 向き

relation 3498220 を 6778604861 hint で反転連結し、舞浜駅（9482601637）より後方から 浦安駅入口 方面へ slice。舞浜方面へ戻らない。
