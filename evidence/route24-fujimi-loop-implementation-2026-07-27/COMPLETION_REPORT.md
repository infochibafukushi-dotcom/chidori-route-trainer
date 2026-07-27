# Route-24 富士見循環線 — Completion Report (2026-07-27)

## Status: **SHIPPED** (commit on main, no push)

## Navi confirmation

| Item | Result |
|------|--------|
| Course | `0008200304` |
| Berth | `24` at 新浦安駅 |
| Signatures | **1** (38 trips weekday/sat/sun) |
| Reverse | **None** — one-way loop |
| Stops | 24 (始発・終点 both 新浦安駅, distinct IDs) |

## Path build (verified)

| Metric | Result |
|--------|--------|
| Path points | 699 |
| maxGap | **24.8 m** (≤30) |
| maxPlatformDist | **11.9 m** (≤30, prefer ≤20) |
| pathHash | `21a4cd16daf0c9b5a4452b15709199b7b34f413ec3d577abb30132a96a9ea4f4` |
| Prefix/suffix | OSM relation **18323926** (shared with route-14) |
| Middle loop | Dijkstra on OSM highway ways (bbox 35.628–35.652, 139.878–139.918) |

### Platform node selection (duplicate-name stops)

| Index | Stop | platformId | Notes |
|-------|------|------------|-------|
| 8 | 東海大浦安高校前 (1st) | 6778610692 | west-side visit |
| 15 | 東海大浦安高校前 (2nd) | 6796278429 | return leg side |
| 9 | 富士見三丁目 | 6778604859 | default candidate |
| 10 | 富士見五丁目 | 12367548464 | default candidate |

Segment-wise validation used for loop (prefix / middle / return) to avoid duplicate-name false matches.

## systemKey

| systemKey | directionGroup | title | naviCourse |
|-----------|----------------|-------|------------|
| `24-fujimi-loop` | `loop` | 富士見循環（新浦安駅発着） | `0008200304` |

## Assets wired

- `fujimi-loop-line-*-v1.js` / `.css` at repo root
- `route-assets-loader.js` pack `route-24` **?v=115**
- `service-worker.js` **CACHE v115**

## Tests

- `_pathhash_integrity_test.js` — PASS
- `_pwa_offline_check.js` — PASS

## Prior blocker (resolved)

Previous failures at 東海大浦安高校前 (~54 m) and 富士見五丁目 (~67 m) were resolved by:
1. Routing Dijkstra to platform snap nodes (not geographic centroid)
2. Injecting platform coordinates at segment ends (≤30 m connector)
3. Brute-forcing alternate OSM platform candidates for duplicate-name stops
4. Per-segment platform validation (prefix/middle/return) for loop duplicate stops
