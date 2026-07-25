# OSM hotel platform mapping (route-12)

Generated: 2026-07-25T05:25:56.260Z

## Policy
- OSM hotel names (シェラトン / ヒルトン / 東京ベイ舞浜ホテル) are **outdated** vs official リゾートホテルエリア・サウス／ノース.
- Assignment uses **outbound path order** on relation 18381677 after TDS.
- First シェラトン/ヒルトン along path → リゾートホテルエリア・サウス; second → リゾートホテルエリア・ノース.
- 東京ベイ舞浜ホテル is not an official route-12 stop (skipped).
- User alias table (ヒルトン→サウス, シェラトン→ノース) **conflicts** with path+official order; **path+official wins**.

| OSM name | node id | lat | lng | pathIndex | assigned official | reason |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| シェラトンホテル・ホテルオークラ | 6796292906 | 35.6275745 | 139.8767188 | 457 | リゾートホテルエリア・サウス | outbound path order after TDS: first sheraton/hilton → サウス, second → ノース (OSM hotel names outdated; path+official order wins over alias Hilton→サウス) |
| ヒルトンホテル・グランドニッコー | 6796292905 | 35.6281122 | 139.8744073 | 470 | リゾートホテルエリア・ノース | outbound path order after TDS: first sheraton/hilton → サウス, second → ノース (OSM hotel names outdated; path+official order wins over alias Hilton→サウス) |
| 東京ベイ舞浜ホテル | 6778619326 | 35.6309927 | 139.8728617 | 492 | (skip) | skip as route-12 stop (東京ベイ舞浜ホテル not in official 21 stops); ways may still be used |

## Family map applied to both directions
- シェラトン* / オークラ* → リゾートホテルエリア・サウス
- ヒルトン* / ニッコー* → リゾートホテルエリア・ノース

