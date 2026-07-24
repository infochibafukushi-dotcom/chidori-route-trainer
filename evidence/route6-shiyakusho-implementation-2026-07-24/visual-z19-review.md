# 重点地点 z19 目視レビュー（2026-07-24）

根拠スクリーンショット: `screenshots/`

| 地点 | 進入 | 停車 | 退出／終点 | 判定 | 根拠 |
|---|---|---|---|---|---|
| 浦安駅入口 | 道路上 | platform近傍 | 市役所通り方面 | OK | 6-maihama-urayasu-start / 復路 end shots |
| 市役所前 | 市役所通り車道 | 南サイド platform（文化会館側） | 東進 | OK | 6-maihama-shiyakusho-z19（市役所入口・郵便局前ではない） |
| 市役所周辺道路 | 車道中心 | — | 建物横断なし | OK | 同上 |
| 東海大浦安高校入口 | 車道 | platform近傍 | 高校前方面 | OK | 6-maihama-tokai-entrance-z19 |
| 東海大浦安高校前 | 車道 | 交差点北側 platform | 6-tokaiはここで終点 | OK | 6-tokai-end-z19（敷地内進入なし） |
| 運動公園 | 幹線6号→分岐 | platform近傍 | 舞浜／千鳥で別方向 | OK | 6-chidori-undokoen-branch-z19 |
| 舞浜駅 | ロータリー進入 | 終点 platform 4.7m | 周回レーン沿い | OK | 6-maihama-maihama-end-z19 |
| 千鳥車庫 | 幹線→service aisle | 到着 4.9m / 発車 5.2m | 千鳥北へ進まず | OK | 6-chidori-chidori-end / 6-urayasu-chidori-start |

## 補足

- `6-chidori` の way `1296818464`（parking_aisle / access=private）は車庫営業進入用。wrongWay としては扱わない。
- 建物・緑地の Overpass 自動交差は別途 `_geometry_intersection_report.json` を更新する。
