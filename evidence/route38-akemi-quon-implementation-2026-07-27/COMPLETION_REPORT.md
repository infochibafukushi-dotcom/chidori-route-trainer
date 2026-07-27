# Route 38 明海クオン線 — Completion Report

**Date:** 2026-07-27  
**Route ID:** `route-38`  
**CACHE:** `chidori-route-map-v118` (v117 reserved for route-37 concurrent)

## System keys

| systemKey | Direction | Terminal pair | OSM relation | Boarding stops | Navi course |
|-----------|-----------|---------------|--------------|----------------|-------------|
| `38-shinurayasu-quon-express` | loop-express | 新浦安駅 → 新浦安駅 | 18396354 | 4 | 0008200316 |

## Express stops vs pass-through

| Location | In `system.stops` | Notes |
|----------|-------------------|-------|
| 新浦安駅 (departure, berth 38/B) | yes | 発 |
| 海風の街 | **no** | Express roadside pass; in Navi 通過時刻表 but excluded from boarding stops |
| 明海小学校 | yes | Boarding/alighting |
| クオン新浦安 | yes | Boarding/alighting |
| 新浦安駅 (return, berth X) | yes | 着 (loop terminal) |

## Verification

- Navi scrape: berth 38 at 新浦安駅; 1 signature across weekday/sat/sun
- Gate: `ク…【３８系統】明海小学校・クオン新浦安方面`; course 0008200316
- OSM: only 18396354 (新浦安駅⇒クオン新浦安線); no return relation found
- Build: 186 path points, maxGap 24.9m, 0 blockers
- Express test: `validateExpressStops` confirms 海風の街 ∉ stops[]
- Globals: `AKEMI_QUON_LINE_*`

## Caveats

1. **One OSM direction only:** Overpass ref=38 and network=クオン both return single relation 18396354. Route is a loop (新浦安駅→…→新浦安駅); no separate inbound OSM relation.
2. **海風の街 express pass:** Listed in Navi timetable with 着 times but not in 【３８系統】 legend destinations; excluded from stops[], included in path geometry.
3. **Duplicate 新浦安駅:** Entry platform B (8415001166) vs exit platform X (8415001163); byIndex platform assignment.
4. **Concurrent route-37:** CACHE bumped to **v118** skipping v117.

## Assets

- `akemi-quon-line-{platforms,path,path-policy,stop-images,route}-v1.js` + css
- Evidence: `evidence/route38-akemi-quon-implementation-2026-07-27/`
