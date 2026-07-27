# Route 25 舞浜・高洲線 — Completion Report

**Date:** 2026-07-27  
**Route ID:** `route-25`  
**CACHE:** `chidori-route-map-v116` (v115 reserved for route-24 commit `1c090d8`)

## System keys

| systemKey | Direction | Terminal pair | OSM relation | Stops | Navi course |
|-----------|-----------|---------------|--------------|-------|-------------|
| `25-maihama-takasu-seaside` | outbound | 舞浜駅 → 高洲海浜公園 | 18352023 | 15 | 0008200306 |
| `25-takasu-seaside-maihama` | inbound | 高洲海浜公園 → 舞浜駅 | 18352022 | 15 | 0008200305 |
| `25-maihama-sogo` | outbound | 舞浜駅 → 総合公園 | 18352045 | 21 | 0008200308 |
| `25-sogo-maihama` | inbound | 総合公園 → 舞浜駅 | 18352044 | 21 | 0008200307 |

**総合公園 vs 高洲海浜公園:** After 高洲七丁目, seaside branch uses 潮音の街 → 高洲海浜公園; sogo branch uses 潮音の街北 → 海園の街 → … → 総合公園. Separate OSM relations and path hashes — no splicing.

## Verification

- Navi scrape: 3 course timetables + patched sogo inbound (◇ま symbol, course 0008200307)
- OSM: 18352023/22/45/44 fetched; platform order matches Navi for all 4 systems
- Gate: rejected 10/15/18/19 cells at 高洲海浜公園 berths 19/03 and 総合公園 berth 04 (11/25 mixed)
- Build: 0 blockers; pathHashDistinct; no reverse/splice between systems
- Globals: `MAIHAMA_TAKASU_LINE_*`

## Caveats

1. **Mixed berth 総合公園04:** Must use symbol ◇ま (not う/無印=11) for inbound 舞浜駅行; deep scrape required `_patch_sogo_inbound.js` after initial filter miss.
2. **舞浜駅 berth 25:** Single timetable serves both destinations; legend ◇た=海浜公園 / ◇=総合公園.
3. **Stop name normalization:** Navi「シンボルロードパークシティ」= OSM「シンボルロード・パークシティ」 (normalizeKey match).
4. **Concurrent route-24:** Already at v115; route-25 uses **v116** to avoid PACKS conflict.

## Assets

- `maihama-takasu-line-{platforms,path,path-policy,stop-images,route}-v1.js` + css
- Evidence: `evidence/route25-maihama-takasu-implementation-2026-07-27/`
