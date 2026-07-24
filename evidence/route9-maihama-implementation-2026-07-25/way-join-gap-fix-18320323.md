# relation 18320323 way間ギャップ再調査（9-maihama / 9-rosetown）

確認日: 2026-07-25  
対象: `9-maihama` / `9-rosetown` のみ（他4系統・route-1〜6は未改変）

## 1. 全way接続情報

機械出力: [`_way_connectivity_18320323.json`](./_way_connectivity_18320323.json)（startHintなし・旧挙動）  
修正後: [`_way_connectivity_18320323_after_fix.json`](./_way_connectivity_18320323_after_fix.json)（浦安駅入口 platform hint）

各行に prev/next way ID、終端・始点 node、gap、flipped、highway、oneway、name、接続判定を含む。

## 2. 24.8m ギャップの特定

| 項目 | 値 |
| --- | --- |
| ペア | way `1337138023` → way `60193618` |
| 旧挙動の前way終端 | node `12367548447` (35.66426, 139.8920408) |
| 旧挙動の次way始点 | node `747616973` (35.6640471, 139.89196) |
| gap | **24.773 m** |
| 道路名 | 宮前通り（tertiary / oneway=no） |

## 3. 原因確認

| 仮説 | 結果 |
| --- | --- |
| way反転方向の誤り | **該当**。先頭 spur way `1337138023` は node `747616973`–`12367548447` の2点。startHintなしだと tip（12367548447）側から走り、次wayと共有すべき `747616973` が「終端から24.8m離れた始点」に見える |
| relation member順の誤り | 非該当。member順は妥当 |
| 接続wayの読み飛ばし | 非該当。欠落wayなし |
| node取得漏れ | 非該当。両wayの端点nodeは relation dump に存在 |
| route_master統合欠落 | 非該当。単一 relation `18320323` で完結 |

正しい走行: 浦安駅入口 platform E（OSM node `2288028442`, local_ref=E）→ way `1337138023` を **反転**（`12367548447` → `747616973`）→ way `60193618` と **node共有**（gap=0）。

## 4. 修正内容

- `startHintFromStopName: '浦安駅入口'` で先頭way向きを固定
- `buildPathFromWays`: way間は node共有または ≤1m 必須。超過はビルド停止（検証済み `verifiedJoins` のみ例外）
- `densifyWithinWay`: **同一OSM way内の連続node間のみ**密化。共有node除去は densify **後**に実施（先頭辺の未密化を防止）
- `resolvedVersion`: `…-maihama-v2` / `…-rosetown-v2`
- 欠落道路の制御点補正は**不要**（OSM形状欠落ではない）

## 5. 再確認結果（v2）

| 指標 | 9-maihama | 9-rosetown |
| --- | ---: | ---: |
| maxJoin_m | 0 | 0 |
| maxGap_m（way内 densify≤25） | 24.9 | 24.9 |
| maxPlatformDist_m | 13.3 | 13.3 |
| pathPoints | 277 | 182 |

- 直線の way間接続: **未使用**（全 join が SHARED_NODE / gap=0）
- キャッシュ: `chidori-route-map-v69`
