# Section 40 — route-11 シンボルロード線 完了報告

**Date:** 2026-07-25  
**Cache:** `chidori-route-map-v73`  
**Commit message:** `feat: add verified Symbol Road route 11 systems`

## Gate / QA 結果

| Check | Result |
| --- | --- |
| Build (platforms/path) | PASS — blockers=[] , maxJoin=0 both relations |
| Way connectivity 18352884 | PASS — maxJoin_m=0 |
| Way connectivity 18352883 | PASS — maxJoin_m=0 |
| pathHash integrity (intact + tamper + restore) | PASS |
| Continuous drive (11 systems) | PASS |
| Screenshots | PASS (望海/akemi5 night = 対象便なし) |
| Geometry intersection | PASS (総合公園ループの自己交差は想定内) |
| Regression routes 1–10 hashes | PASS |
| PWA offline v73 | PASS |

## confirmedSystems（実装 11）

| # | systemKey | stops | relation | slice |
| ---: | --- | ---: | ---: | --- |
| 1 | 11-urayasu-hinode | 18 | 18352884 | full |
| 2 | 11-urayasu-sogo-via-hinode-kominkan | 16 | 18352884 | prefix |
| 3 | 11-urayasu-baypark | 14 | 18352884 | prefix |
| 4 | 11-urayasu-shinurayasu | 7 | 18352884 | prefix |
| 5 | 11-shinurayasu-hinode | 12 | 18352884 | mid-slice |
| 6 | 11-shinurayasu-sogo | 10 | 18352884 | mid-slice |
| 7 | 11-shinurayasu-baypark | 8 | 18352884 | mid-slice |
| 8 | 11-hinode-urayasu | 18 | 18352883 | full |
| 9 | 11-hinode-shinurayasu | 12 | 18352883 | prefix |
| 10 | 11-sogo-shinurayasu | 10 | 18352883 | mid-slice |
| 11 | 11-sogo-urayasu | 16 | 18352883 | mid/suffix |

## lateNightSystems

| Count | Note |
| ---: | --- |
| **0** | 望海夜行（★シ/シ）は系統3。route-11 として実装しない |

## 同一始終点別経路

| Note |
| --- |
| akemi5 fork（浦安→明海五丁目 / 望海経由総合公園）は系統3。route-11 ではない（監査で rejectedRoute3） |
| sameEndpointDifferentRoute groups: **0** |

## DO NOT implement（確認済み除外）

- akemi5 variants
- symbol-road-pc terminus as 11
- night to シンボル
- 望海の街 as 11
- Relation **18419852** forbidden

## Unconfirmed（未実装）

| candidateKey | status |
| --- | --- |
| 11-shinurayasu-urayasu | unconfirmed |
| 11-baypark-shinurayasu | unconfirmed |
| 11-baypark-urayasu | unconfirmed |
| 11-sogo-hinode | unconfirmed |
| 11-akemi5-start | unconfirmed |
| 11-nozomi-shinurayasu | unconfirmed |
| 11-shinurayasu-nozomi-night | rejected-route3 |

## Wiring

- Globals: `SYMBOL_ROAD_LINE_*`
- `ROUTE_ID=route-11`, `DISPLAY_CODE=11`, `SYSTEM_KEY=chidori-symbol-road-line-system-v1`
- `route.symbolRoadLineVersion` / `route.symbolRoadLineStopImages`
- stop IDs: `symbol-road-${systemKey}-NN`
- index.html AFTER takasu; bridge route-11 BEFORE route-10
- hokuei-no-uturn: route-11 added
- data.js / d1-sync / takasu / maihama: **not modified**

## Name normalization

`日の出南（墓地公園）` → `日の出南`
