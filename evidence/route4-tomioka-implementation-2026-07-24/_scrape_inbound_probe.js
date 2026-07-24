'use strict';
/**
 * Scrape ekitan + Keisei Navi for inbound 富岡線 stop orders.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT = __dirname;
const BASE = 'https://transfer-cloud.navitime.biz/keiseibus-group';

function absUrl(href, base) {
  if (!href) return null;
  if (href.startsWith('http')) return href;
  return new URL(href, base).href;
}

function parseNaviStops(body) {
  const stops = [];
  const re = /(\d{1,2}:\d{2})\s*\n\s*(発|着)\s*\n\s*([^\n]+)/g;
  let m;
  while ((m = re.exec(body))) {
    const name = m[3].replace(/\s+/g, ' ').trim();
    if (!name || /系統・時刻表|通過時刻表|ページの先頭/.test(name)) continue;
    if (!stops.length || stops[stops.length - 1].name !== name) {
      stops.push({ time: m[1], kind: m[2], name });
    }
  }
  return stops;
}

async function main() {
  const report = { scrapedAt: new Date().toISOString(), ekitan: {}, navi: {}, errors: [] };
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  // --- Ekitan: 浦安駅入口 富岡線 destination pages ---
  const ekitanPages = [
    {
      key: 'from-urayasu-overview',
      url: 'https://ekitan.com/timetable/route-bus/company/5474/1155855/1141902/d1',
    },
    {
      key: 'maihama-bound',
      url: 'https://ekitan.com/timetable/route-bus/company/5474/1155855/1141902/d2',
    },
    {
      key: 'chidori-bound',
      url: 'https://ekitan.com/timetable/route-bus/company/5474/1155855/1141902/d3',
    },
  ];

  for (const ep of ekitanPages) {
    try {
      await page.goto(ep.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(2500);
      const meta = await page.evaluate(() => {
        const body = document.body.innerText.slice(0, 4000);
        const links = [...document.querySelectorAll('a')].map((a) => ({
          href: a.getAttribute('href'),
          text: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 100),
        }));
        return {
          title: document.title,
          body,
          destLinks: links.filter((l) => /東京ディズニー|舞浜|千鳥|浦安駅入口|経由|方面/.test(l.text)).slice(0, 40),
          timeLinks: links.filter((l) => /^\d{1,2}:\d{2}/.test(l.text)).slice(0, 20),
        };
      });
      report.ekitan[ep.key] = { url: ep.url, ...meta };
      console.log('EKITAN', ep.key, meta.title.slice(0, 60), 'times', meta.timeLinks.length, 'dests', meta.destLinks.length);

      // Try open first time link for via stops
      if (meta.timeLinks[0]?.href) {
        const abs = absUrl(meta.timeLinks[0].href, ep.url);
        await page.goto(abs, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(2000);
        const detail = await page.evaluate(() => ({
          url: location.href,
          title: document.title,
          body: document.body.innerText.slice(0, 5000),
        }));
        report.ekitan[ep.key].tripSample = detail;
        // parse stop-like lines
        const lines = detail.body.split(/\n/).map((l) => l.trim()).filter(Boolean);
        const stopish = lines.filter((l) =>
          /駅|入口|前|車庫|ランド|丁目|公園|病院|通り|センター|住宅|コーポ|学校/.test(l) &&
          l.length < 30 &&
          !/時刻|運賃|検索|会社|営業|改正|平日|土曜/.test(l)
        );
        report.ekitan[ep.key].stopishLines = stopish.slice(0, 40);
        console.log('  stopish', stopish.slice(0, 25).join(' | '));
      }
    } catch (e) {
      report.errors.push(`ekitan ${ep.key}: ${e.message || e}`);
    }
  }

  // Search ekitan for reverse from terminals
  const reverseSearches = [
    'https://ekitan.com/timetable/route-bus/company/5474',
  ];

  // --- Navi: discover busstop IDs via stop name search API-like pages ---
  // Try typing into search top
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1000);

  for (const word of ['舞浜駅', '千鳥車庫', '東京ディズニーランド', 'オリエンタルランド本社前', '運動公園']) {
    try {
      // common navitime pattern
      const urls = [
        `${BASE}/pc/busstops?word=${encodeURIComponent(word)}`,
        `${BASE}/busstops?word=${encodeURIComponent(word)}`,
        `https://transfer-cloud.navitime.biz/keiseibus-group/pc/maps/busstop?word=${encodeURIComponent(word)}`,
      ];
      for (const u of urls) {
        await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(1200);
        const hits = await page.evaluate(() => {
          const text = document.body.innerText.slice(0, 800);
          const links = [...document.querySelectorAll('a[href*="busstop"]')].map((a) => ({
            text: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80),
            href: a.getAttribute('href'),
          }));
          return { title: document.title, url: location.href, text, links: links.slice(0, 15) };
        });
        if (hits.links.length || /系統|バス停/.test(hits.text)) {
          report.navi[word] = report.navi[word] || [];
          report.navi[word].push(hits);
          console.log('NAVI', word, u.split('?')[0].slice(-30), hits.links.slice(0, 3));
          if (hits.links.length) break;
        }
      }
    } catch (e) {
      report.errors.push(`navi search ${word}: ${e.message || e}`);
    }
  }

  // --- From 運動公園 on outbound trip, the stop name might be plain text.
  // Open course-sequence 0008200226-1 found earlier (from chidori date link) ---
  for (const seq of ['0008200226-1', '0008200224-1', '0008200222-1', '0008200227-1', '0008200223-1']) {
    // Try several busstops that might host reverse: use map from OSM later.
    // Probe with unknown — skip
  }

  // Use baycity / keisei timetable search page
  try {
    await page.goto('https://www.keiseibus.co.jp/noriba/timetable/', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForTimeout(2000);
    report.keiseiTimetableHub = await page.evaluate(() => ({
      title: document.title,
      links: [...document.querySelectorAll('a')]
        .map((a) => ({ href: a.getAttribute('href'), text: (a.innerText || '').trim().slice(0, 80) }))
        .filter((x) => /ナビ|時刻|富岡|浦安|千鳥|transfer-cloud|navitime/.test(x.text + (x.href || '')))
        .slice(0, 30),
      body: document.body.innerText.slice(0, 1500),
    }));
    console.log('keisei hub', report.keiseiTimetableHub.links.slice(0, 10));
  } catch (e) {
    report.errors.push(String(e.message || e));
  }

  // --- Probe busstop IDs around known 00020739 by checking titles for 舞浜駅 etc. ---
  // From route-3 scrape, maihama-related IDs appeared. Try reading OSM for bus_stop refs.
  // Broader ID sweep using navi map tile is too heavy; try ekitan station pages.
  const ekitanStations = [
    { label: '舞浜駅', url: 'https://ekitan.com/timetable/route-bus/station/1655' },
    { label: '浦安駅', url: 'https://ekitan.com/timetable/route-bus/station/1652' },
  ];
  for (const st of ekitanStations) {
    try {
      await page.goto(st.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(2000);
      const meta = await page.evaluate(() => {
        const links = [...document.querySelectorAll('a')].map((a) => ({
          href: a.getAttribute('href'),
          text: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120),
        }));
        return {
          title: document.title,
          route4: links.filter((l) => /４|4（富岡|富岡線|\[4\]|系統4/.test(l.text) || (/富岡/.test(l.text))).slice(0, 30),
          urayasu: links.filter((l) => /浦安駅入口/.test(l.text)).slice(0, 20),
        };
      });
      report.ekitan[`station-${st.label}`] = meta;
      console.log('STATION', st.label, 'route4 links', meta.route4.length, meta.route4.slice(0, 8));
    } catch (e) {
      report.errors.push(String(e.message || e));
    }
  }

  fs.writeFileSync(path.join(OUT, '_navi_inbound_probe.json'), JSON.stringify(report, null, 2));
  console.log('wrote probe');
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
