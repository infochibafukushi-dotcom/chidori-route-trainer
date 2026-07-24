'use strict';
/**
 * Re-scrape 千鳥車庫 → 浦安駅入口 for 系統6 only (mark 「市」).
 * Previous pass wrongly accepted 無印【２系統】via 新浦安駅北口.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT = __dirname;
const RAW = path.join(OUT, '_navi_scrape_raw.json');
const BASE = 'https://transfer-cloud.navitime.biz/keiseibus-group';

function parseStops(body) {
  const stops = [];
  const re = /(\d{1,2}:\d{2})\s*\n\s*(発|着)\s*\n\s*([^\n]+)/g;
  let m;
  while ((m = re.exec(body))) {
    const name = m[3].replace(/\s+/g, ' ').trim();
    if (name && !/系統・時刻表|通過時刻表|ページの先頭/.test(name)) {
      if (!stops.length || stops[stops.length - 1].name !== name) {
        stops.push({ time: m[1], kind: m[2], name });
      }
    }
  }
  return stops;
}

async function main() {
  const report = JSON.parse(fs.readFileSync(RAW, 'utf8'));
  const links = (report.inboundChidori?.tripLinks || []).filter(
    (l) => /市/.test(l.cellText || '') && !/南小|し/.test((l.cellText || '').replace(/市役所/g, ''))
  );
  console.log('市 links to try:', links.length);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const probe = { scrapedAt: new Date().toISOString(), samples: [], errors: [] };

  try {
    for (const link of links.slice(0, 4)) {
      await page.goto(link.absHref, { waitUntil: 'networkidle', timeout: 90000 });
      await page.waitForTimeout(1200);
      const data = await page.evaluate(() => ({
        title: document.title,
        heading: (document.querySelector('h1,h2')?.innerText || '').slice(0, 200),
        body: document.body.innerText,
        busstopLinks: [...document.querySelectorAll('a[href*="busstop="]')].map((a) => ({
          text: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80),
          href: a.getAttribute('href'),
          id: (a.getAttribute('href') || '').match(/busstop=(\d+)/)?.[1] || null,
        })),
      }));
      const stops = parseStops(data.body);
      const stopNames = stops.map((s) => s.name);
      const sample = {
        class: '6-urayasu-chidori',
        cellText: link.cellText,
        sampleUrl: link.absHref,
        stopNames,
        stopCount: stopNames.length,
        stops,
        heading: data.heading,
        title: data.title,
        bodySnippet: data.body.slice(0, 2500),
        busstopLinks: data.busstopLinks,
        nameChecks: {
          hasShiyakushoMae: stopNames.some((n) => n === '市役所前'),
          hasShiyakushoIriguchi: stopNames.some((n) => n === '市役所入口'),
          hasShiyakushoIriguchiYubin: stopNames.some((n) => /市役所入口|郵便局前/.test(n)),
          hasYubinMae: stopNames.some((n) => n === '郵便局前' || /郵便局前/.test(n)),
          hasTokaiIriguchi: stopNames.some((n) => n === '東海大浦安高校入口'),
          hasTokaiMae: stopNames.some((n) => n === '東海大浦安高校前'),
          hasChidoriKita: stopNames.some((n) => /千鳥北/.test(n)),
          hasShinurayasu: stopNames.some((n) => /新浦安/.test(n)),
        },
      };
      probe.samples.push(sample);
      console.log(
        'GOT',
        stopNames.length,
        stopNames[0],
        '→',
        stopNames[stopNames.length - 1],
        'cell=',
        link.cellText
      );
      console.log(stopNames.join(' | '));
      console.log('checks', JSON.stringify(sample.nameChecks));

      // Prefer first valid: starts 千鳥車庫, ends 浦安駅入口, has 市役所*
      const okEnds =
        /千鳥車庫/.test(stopNames[0] || '') &&
        /浦安駅入口/.test(stopNames[stopNames.length - 1] || '');
      const okShiyakusho =
        sample.nameChecks.hasShiyakushoMae ||
        sample.nameChecks.hasShiyakushoIriguchi ||
        sample.nameChecks.hasShiyakushoIriguchiYubin;
      if (okEnds && okShiyakusho) {
        const confirmed = {
          ...sample,
          terminalId: '00020620',
          terminalLabel: '千鳥車庫',
          berth: report.inboundChidori?.berth || '02',
          timetableUrl: report.inboundChidori?.timetableUrl,
          legend: report.inboundChidori?.legend || [],
          timetableSymbol: '市',
        };
        report.confirmed['6-urayasu-chidori'] = confirmed;
        report.inboundChidori.sampled['6-urayasu-chidori'] = sample;
        // Keep misclassified prior sample for evidence
        report.inboundChidori.sampled['rejected-other:千鳥車庫→浦安駅入口-via-shinurayasu'] =
          report.inboundChidori.sampled['rejected-other:千鳥車庫→浦安駅入口-via-shinurayasu'] ||
          null;
        break;
      }
    }

    // Update name distinction notes
    report.nameDistinctionNotes = Object.entries(report.confirmed).map(([k, v]) => ({
      systemKey: k,
      ...(v.nameChecks || {}),
      stopNamesSample: (v.stopNames || []).filter((n) => /市役所|東海大|千鳥|郵便局/.test(n)),
    }));
    report.scrapedAtChidoriFix = new Date().toISOString();
    report.note =
      'Transcribed only from Navi trip pages; nothing invented. Filter system 6 only. ' +
      '6-urayasu-chidori uses timetable mark 「市」 (not unmarked 2系統).';
  } catch (e) {
    probe.errors.push(String(e.stack || e));
    report.errors.push(String(e.stack || e));
  } finally {
    await browser.close();
  }

  fs.writeFileSync(path.join(OUT, '_navi_chidori_shi_probe.json'), JSON.stringify(probe, null, 2));
  fs.writeFileSync(RAW, JSON.stringify(report, null, 2));
  console.log('updated', RAW);
  const c = report.confirmed['6-urayasu-chidori'];
  if (c) {
    console.log('CONFIRMED 6-urayasu-chidori', c.stopCount, c.stopNames.join(' | '));
  } else {
    console.log('FAILED to confirm 市 pattern');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
