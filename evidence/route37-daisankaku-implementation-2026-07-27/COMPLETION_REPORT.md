# Route 37 大三角線 — Completion Report

**Date:** 2026-07-27  
**Route ID:** `route-37`  
**CACHE:** `chidori-route-map-v119` (route-37 PACKS `?v=117`; route-38 already at v118 in `e6c78d5`)

## System keys

| systemKey | Direction | Terminal pair | OSM relation | Stops | Navi course |
|-----------|-----------|---------------|--------------|-------|-------------|
| `37-minamigyotoku-tds` | outbound | 南行徳駅 → TDS | 18323271 | 16 | 0008200310 |
| `37-minamigyotoku-maihama` | outbound | 南行徳駅 → 舞浜駅（止まり） | 18323271 | 14 | 0008200312 |
| `37-tds-minamigyotoku` | inbound | TDS → 南行徳駅 | 18323272 | 16 | 0008200309 |
| `37-maihama-minamigyotoku` | inbound | 舞浜駅 → 南行徳駅 | 18323272 | 14 | 0008200311 |
| `37-tds-horie6` | inbound short | TDS → 堀江六丁目 | 18323272 | 9 | 0008200313 |
| `37-fujimi3-tds` | outbound short | 富士見三丁目 → TDS | 18323271 | 6 | 0008200315 |
| `37-horie6-tds` | outbound short | 堀江六丁目 → TDS | 18323271 | 9 | 0008200314 |

**舞浜止まり vs TDS行き:** 南行徳発は同一時刻表（符号 無印=舞浜止まり / シー=TDS行）。別 course・別 pathHash — no splicing.

## 9-vs-37 separation proof

| Check | Result |
|-------|--------|
| Origin | route-9: 浦安駅入口 / route-37: 南行徳駅 |
| OSM relations | route-9: 18320323,3498220,18419884,18419885 — **not used** by route-37 |
| route-37 relations | 18323271 (outbound), 18323272 (inbound) only |
| pathHash overlap with MAIHAMA_LINE_PATH_V1 | **0** systems |
| route-9 exclusive stops in route-37 data | **0** (浦安駅入口, フラワー通り, 堀江三丁目, 南小入口, 東野*, 東海大*) |
| Shared 堀江〜舞浜 segment | Same road network, **different OSM route relations** and platform IDs |

## Verification

- Navi scrape: 4 terminals, 7 signatures, 12 sibling cells gated at 舞浜
- OSM: 18323271/72 fetched; 18323271 `network=舞浜線` tag verified `ref=37` (not route-9)
- Build: 0 blockers; pathHashDistinct; allowed slice pairs for verified short turns
- Globals: `DAISANKAKU_LINE_*`

## Caveats

1. **OSM 18323271 network tag:** Tagged `舞浜線` but name/ref=37 — use relation ID + Navi gate, not network tag alone.
2. **京成ローズタウン 02/03:** Mixed with route-9; only trips with 【３７系統】 legend accepted (rosetown through-services to 浦安/東海大 are route-9, not implemented).
3. **City boundary / one-ways:** Path built from OSM way chain with direction correction; 南行徳駅 rotary uses `platform_entry_only`/`platform_exit_only` roles.
4. **Version:** User target v117; route-38 committed at v118 (`e6c78d5`); route-37 PACKS use **v117**, SW/loader **v119**.

## Assets

- `daisankaku-line-{platforms,path,path-policy,stop-images,route}-v1.js` + css
- Evidence: `evidence/route37-daisankaku-implementation-2026-07-27/`
