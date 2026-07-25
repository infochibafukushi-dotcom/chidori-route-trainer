'use strict';
const https = require('https');
const fs = require('fs');
const path = require('path');
const OUT = __dirname;
const QUERY = `
[out:json][timeout:60];
(
  node["highway"="bus_stop"]["name"~"ベイサイド|Bayside|リゾートホテル"](35.625,139.87,35.632,139.89);
  node["public_transport"="platform"]["name"~"ベイサイド|Bayside|リゾートホテル"](35.625,139.87,35.632,139.89);
  node["highway"="bus_stop"]["operator"~"ベイシティ|京成"]["name"~"ホテル|ベイサイド|ステーション"](35.625,139.87,35.632,139.89);
);
out body;
`;
function post(query) {
  const body = 'data=' + encodeURIComponent(query);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'overpass-api.de', path: '/api/interpreter', method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body), 'User-Agent': 'chidori-route-trainer/route12' }
    }, res => { const c=[]; res.on('data',d=>c.push(d)); res.on('end',()=>{ try{resolve(JSON.parse(Buffer.concat(c).toString()));}catch(e){reject(e);} }); });
    req.on('error', reject); req.write(body); req.end();
  });
}
(async () => {
  const data = await post(QUERY);
  const nodes = (data.elements||[]).filter(e=>e.type==='node');
  const report = { fetchedAt: new Date().toISOString(), count: nodes.length, candidates: nodes.map(n=>({id:n.id,lat:n.lat,lon:n.lon,name:n.tags?.name,operator:n.tags?.operator,network:n.tags?.network,local_ref:n.tags?.local_ref,tags:n.tags})) };
  fs.writeFileSync(path.join(OUT,'_bayside_hotel_area_candidates.json'), JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e); process.exit(1);});
