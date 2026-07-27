# 浦安東団地線（系統23 / route-23）運行パターン

確認日: 2026-07-27

| systemKey | 方向 | 起点 → 終点 | 停留所数 | OSM relation |
| --- | --- | --- | ---: | ---: |
| `23-maihama-sogo` | outbound | 舞浜駅 → 総合公園 | 25 | 18419895 |
| `23-sogo-maihama` | inbound | 総合公園 → 舞浜駅 | 25 | 18419894 |

## 23系統と3系統の関係

- **同じ路線名**「浦安東団地線」だが **terminal が異なる**（23=舞浜⇔総合公園、3=浦安駅入口⇔総合公園）
- OSM ref=3 relations (18417570/18417571/18417579) と ref=23 relations (18419894/18419895) は **完全非共有**
- 新浦安駅 berth H: Navi が `3 [23]` と `[3]` を同一セルに併記 → **二段凡例ゲート**必須

## route-3 非改変宣言

route-3 pathHashes / platforms / modules は本 commit で一切変更しない。
