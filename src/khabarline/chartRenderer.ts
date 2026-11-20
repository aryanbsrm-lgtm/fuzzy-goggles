import { KhabarlineMarket, ChartRecordRow } from './types.js';

export const popularJodiLinks = [
  { name: 'Time Chart', slug: 'time-bazar' },
  { name: 'Sridevi Chart', slug: 'sridevi' },
  { name: 'Kalyan Morning Chart', slug: 'kalyan-morning' },
  { name: 'Madhuri Chart', slug: 'madhuri' },
  { name: 'Kalyan Chart', slug: 'kalyan' },
  { name: 'Sridevi Night Chart', slug: 'sridevi-night' },
  { name: 'Kalyan Night Chart', slug: 'kalyan-night' },
  { name: 'Old Main Mumbai Chart', slug: 'main-bazar' },
  { name: 'Main Bazar Chart', slug: 'main-bazar' },
  { name: 'Milan Morning Chart', slug: 'milan-morning' },
  { name: 'Milan Day Chart', slug: 'milan-day' },
  { name: 'Milan Night Chart', slug: 'milan-night' },
  { name: 'Madhuri Night Chart', slug: 'madhur-night' },
  { name: 'Madhur Morning Chart', slug: 'madhur-morning' },
  { name: 'Madhur Day Chart', slug: 'madhur-day' },
  { name: 'Madhur Night Chart', slug: 'madhur-night' },
  { name: 'Rajdhani Night Chart', slug: 'rajdhani-night' },
  { name: 'Sitarani Morning Chart', slug: 'sitarani-morning' },
  { name: 'Sitara Morning Chart', slug: 'sitara-morning' },
  { name: 'Sitarani Day Chart', slug: 'sitarani-day' },
  { name: 'Sitara Day Chart', slug: 'sitara-day' },
  { name: 'Sitara Night Chart', slug: 'sitara-night' },
  { name: 'Sitarani Night Chart', slug: 'sitarani-night' },
  { name: 'Subhodaya Chart', slug: 'subhodaya' },
  { name: 'Triveni Morning Chart', slug: 'triveni-morning' },
  { name: 'Lotus Morning Chart', slug: 'lotus-morning' },
  { name: 'Bahubali Chart', slug: 'bahubali' },
  { name: 'Swarn Andhra Chart', slug: 'swarn-andhra' },
  { name: 'Mahalaxmi Chart', slug: 'mahalaxmi' },
  { name: 'Madhyana Chart', slug: 'madhyana' },
  { name: 'Lotus Day Chart', slug: 'lotus-day' },
  { name: 'Ntr Bazar Chart', slug: 'ntr-bazar' },
  { name: 'Triveni Day Chart', slug: 'triveni-day' },
  { name: 'Swarn Andhra Day Chart', slug: 'swarn-andhra-day' },
  { name: 'Leela Day Chart', slug: 'leela-day' },
  { name: 'Puspa Day Chart', slug: 'pushpa-day' },
  { name: 'Sitara Chart', slug: 'sitara' },
  { name: 'Lotus Night Chart', slug: 'lotus-night' },
  { name: 'Swarn Andhra Night Chart', slug: 'swarn-andhra-night' },
  { name: 'Puspa Night Chart', slug: 'pushpa-night' },
  { name: 'Leela Night Chart', slug: 'leela-night' },
  { name: 'Shreevalli Night Chart', slug: 'shreevalli-night' },
  { name: 'Raat Rani Chart', slug: 'raat-rani' },
];

export const popularPanelLinks = [
  { name: 'Time Panel Chart', slug: 'time-bazar' },
  { name: 'Sridevi Panel Chart', slug: 'sridevi' },
  { name: 'Kalyan Morning Panel Chart', slug: 'kalyan-morning' },
  { name: 'Madhuri Panel Chart', slug: 'madhuri' },
  { name: 'Padmavati Panel Chart', slug: 'padmavati' },
  { name: 'Kalyan Panel Chart', slug: 'kalyan' },
  { name: 'Sridevi Night Panel Chart', slug: 'sridevi-night' },
  { name: 'Kalyan Night Panel Chart', slug: 'kalyan-night' },
  { name: 'Old Main Mumbai Panel Chart', slug: 'main-bazar' },
  { name: 'Main Bazar Panel Chart', slug: 'main-bazar' },
  { name: 'Milan Morning Panel Chart', slug: 'milan-morning' },
  { name: 'Milan Day Panel Chart', slug: 'milan-day' },
  { name: 'Milan Night Panel Chart', slug: 'milan-night' },
  { name: 'Madhuri Night Panel Chart', slug: 'madhur-night' },
  { name: 'Rajdhani Night Panel Chart', slug: 'rajdhani-night' },
  { name: 'Madhur Morning Day Chart', slug: 'madhur-morning' },
  { name: 'Madhur Day Panel Chart', slug: 'madhur-day' },
  { name: 'Sitarani Morning Panel Chart', slug: 'sitarani-morning' },
  { name: 'Sitara Morning Panel Chart', slug: 'sitara-morning' },
  { name: 'Sitarani Day Panel Chart', slug: 'sitarani-day' },
  { name: 'Sitara Day Panel Chart', slug: 'sitara-day' },
  { name: 'Sitara Night Panel Chart', slug: 'sitara-night' },
  { name: 'Sitarani Night Panel Chart', slug: 'sitarani-night' },
  { name: 'Subhodaya Panel Chart', slug: 'subhodaya' },
  { name: 'Triveni Morning Panel Chart', slug: 'triveni-morning' },
  { name: 'Lotus Morning Panel Chart', slug: 'lotus-morning' },
  { name: 'Bahubali Panel Chart', slug: 'bahubali' },
  { name: 'Swarn Andhra Panel Chart', slug: 'swarn-andhra' },
  { name: 'Mahalaxmi Panel Chart', slug: 'mahalaxmi' },
  { name: 'Madhyana Panel Chart', slug: 'madhyana' },
  { name: 'Lotus Day Panel Chart', slug: 'lotus-day' },
  { name: 'Ntr Bazar Panel Chart', slug: 'ntr-bazar' },
  { name: 'Triveni Day Panel Chart', slug: 'triveni-day' },
  { name: 'Swarn Andhra Day Panel Chart', slug: 'swarn-andhra-day' },
  { name: 'Leela Day Panel Chart', slug: 'leela-day' },
  { name: 'Puspa Day Panel Chart', slug: 'pushpa-day' },
  { name: 'Sitara Panel Chart', slug: 'sitara' },
  { name: 'Lotus Night Panel Chart', slug: 'lotus-night' },
  { name: 'Swarn Andhra Night Panel Chart', slug: 'swarn-andhra-night' },
  { name: 'Puspa Night Panel Chart', slug: 'pushpa-night' },
  { name: 'Leela Night Panel Chart', slug: 'leela-night' },
  { name: 'Shreevalli Night Panel Chart', slug: 'shreevalli-night' },
  { name: 'Raat Rani Panel Chart', slug: 'raat-rani' },
];

function getDualChartListHtml(currentSlug: string, currentType: 'jodi' | 'panel'): string {
  const jodiItems = popularJodiLinks
    .map((m) => {
      const isCurrent = m.slug === currentSlug && currentType === 'jodi';
      return `<a href="/jodi-chart-record/${m.slug}.php" style="${isCurrent ? 'font-weight:900;color:red;background:#fff8dc;' : ''}">${m.name}</a>`;
    })
    .join('');

  const panelItems = popularPanelLinks
    .map((m) => {
      const isCurrent = m.slug === currentSlug && currentType === 'panel';
      return `<a href="/panel-chart-record/${m.slug}.php" style="${isCurrent ? 'font-weight:900;color:red;background:#fff8dc;' : ''}">${m.name}</a>`;
    })
    .join('');

  return `
    <div class="chart-list ab1">
      <h4>SATTA MATKA JODI CHART</h4>
      ${jodiItems}
    </div>

    <div class="chart-list ab1" style="margin-top:15px;">
      <h4>MATKA PANEL CHART</h4>
      ${panelItems}
    </div>
  `;
}

function getSeoArticleHtml(marketName: string, type: 'jodi' | 'panel'): string {
  const chartTypeName = type === 'jodi' ? 'Jodi Chart' : 'Panel Chart';
  return `
    <div class="seo-article-box">
      <h2>What is ${marketName} ${chartTypeName}?</h2>
      <p>The ${marketName} ${chartTypeName} is a structured numerical record of previous game rounds, combining Patti combinations and Jodi results into an organized archive. Players consult this historical record for mathematical calculations and pattern recognition.</p>

      <h2>Why Are Historical ${marketName} ${chartTypeName}s Important?</h2>
      <p>Historical archives allow statistical analysts and Matka enthusiasts to review long-term cycle trends, recurring digit frequency, and complementary number pairs across multiple calendar months.</p>

      <h2>Which Patterns Stand Out in ${marketName} ${chartTypeName}?</h2>
      <p>Key patterns include repetitive open-to-close intervals, cut numbers, half-red and full-red Jodi transitions, and progressive Patti sequences that recur over regular weekly cycles.</p>

      <h2>Frequently Asked Questions (FAQs)</h2>
      <div class="faq-item">
        <strong>Q1: What is the purpose of ${marketName} ${chartTypeName}?</strong>
        <p>It provides an authentic, chronological table of winning Jodi and Pana combinations declared by verified market organizers.</p>
      </div>
      <div class="faq-item">
        <strong>Q2: How frequently are results updated on this chart?</strong>
        <p>Results on Khabarline.site are synchronized live in real-time as soon as the official market session concludes.</p>
      </div>
      <div class="faq-item">
        <strong>Q3: Are red numbers special in ${marketName} chart?</strong>
        <p>Yes, red numbers indicate double pairs (e.g. 11, 22, 99) or cut/family pairs (e.g. 05, 16, 27, 38, 49) which have special statistical significance in Satta Matka theory.</p>
      </div>
    </div>
  `;
}

const dpbossChartCss = `
html { scroll-behavior: smooth; }
body {
  background-color: #fc9;
  text-align: center;
  font-weight: 700;
  padding: 0;
  margin: 0;
  font-family: Helvetica, Arial, sans-serif;
}
* { box-sizing: border-box; }
a { text-decoration: none; color: #0013a5; }

.logo {
  background: #fc9;
  padding: 8px 10px;
  display: block;
  color: #fff8f8;
  margin: 5px auto;
  letter-spacing: 1px;
  font-weight: 700;
  border: 3px solid #ff0016;
  border-radius: .75em;
  max-width: 600px;
}
.logo h1 {
  font-size: 26px;
  color: #d3003f;
  margin: 0;
  text-shadow: 2px 2px 3px #fff, -1px -1px 0 #fff;
  letter-spacing: 2px;
}
.logo p {
  font-size: 13px;
  color: #000b65;
  margin: 2px 0 0;
  text-shadow: 1px 1px 1px #fff;
}

.conta h4 {
  background: #ff00a2;
  padding: 6px 12px;
  text-shadow: 1px 1px 2px #000;
  display: inline-block;
  color: #fff8f8 !important;
  margin: 8px auto 4px;
  letter-spacing: 1px;
  font-weight: 700;
  font-size: 22px;
  border: 2px solid #fff;
  border-radius: .75em;
}
.sub-title-bar {
  font-size: 14px;
  color: #000b65;
  margin-bottom: 8px;
  font-weight: bold;
}

.chart-result {
  background: #fff8dc;
  border: 2px solid #ff0016;
  border-radius: 10px;
  padding: 8px 12px;
  margin: 6px auto;
  max-width: 400px;
  box-shadow: 0 4px 10px rgba(0,0,0,0.15);
}
.chart-result div {
  font-size: 18px;
  color: #000b65;
  font-weight: 800;
  letter-spacing: 1px;
}
.chart-result span {
  font-size: 26px;
  color: #00009c;
  font-weight: 900;
  display: block;
  margin: 2px 0;
  text-shadow: 0 0 4px #fff;
}
.chart-result a {
  background: #522f92;
  color: #fff;
  padding: 3px 10px;
  border-radius: 6px;
  font-size: 12px;
  display: inline-block;
  margin: 2px 2px 0;
}

.button2 {
  background-color: #a0d5ff;
  color: #220c82;
  padding: 10px 28px;
  font-size: 14px;
  margin: 6px 4px 10px;
  border: 2px solid #0000005c;
  font-weight: 800;
  text-decoration: none;
  text-shadow: 1px 1px #00bcd4;
  box-shadow: 0 6px 10px 0 rgba(0,0,0,.2), 0 4px 6px 0 rgba(0,0,0,.19);
  display: inline-block;
  border-radius: 6px;
  transition: all .2s;
  cursor: pointer;
}
.button2:hover { background-color: #79c2ff; }

.panel.panel-info {
  border: 2px solid #3f51b5;
  width: 90%;
  max-width: 950px;
  margin: 0 auto 15px;
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 6px 20px rgba(0,0,0,0.25);
}
.panel-heading {
  background: #3f51b5;
  padding: 8px 10px;
  text-align: center;
}
.panel-heading h3 {
  margin: 0;
  padding: 4px;
  font-size: 18px;
  color: #fff;
  letter-spacing: 0.5px;
  text-shadow: 1px 1px 2px #000;
}
.panel-body {
  padding: 0;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

table, .panel-chart, .chart-table {
  border-collapse: collapse;
  width: 100%;
  text-align: center;
  font-size: 15px;
}
table, th, td {
  border: 1px solid #000;
}
thead {
  background-color: #ffd902;
  text-shadow: 1px 1px 2px #9a7400ab;
}
thead th {
  padding: 8px 3px;
  font-size: 15px;
  font-weight: 800;
  color: #000;
}
tbody td {
  padding: 5px 2px;
  font-size: 16px;
  font-weight: 700;
  vertical-align: middle;
}
tbody tr:nth-child(even) { background-color: #fffdf5; }
tbody tr:hover { background-color: #fff4d9; }

.r, .red,
.chart-11, .chart-22, .chart-33, .chart-44, .chart-55, .chart-66, .chart-77, .chart-88, .chart-99, .chart-00,
.chart-05, .chart-50, .chart-16, .chart-61, .chart-27, .chart-72, .chart-38, .chart-83, .chart-49, .chart-94,
.css-11, .css-16, .css-22, .css-27, .css-33, .css-38, .css-44, .css-49, .css-50, .css-55, .css-61, .css-66, .css-72, .css-83, .css-88, .css-94, .css-99, .css-05, .css-00, .css-77, .css-star {
  color: red !important;
  font-weight: 900;
}

.seo-article-box {
  background: #fff;
  border: 2px solid #003c6c;
  border-radius: 8px;
  width: 90%;
  max-width: 950px;
  margin: 15px auto;
  padding: 15px 20px;
  text-align: left;
  line-height: 1.6;
  font-size: 14px;
  color: #222;
}
.seo-article-box h2 {
  font-size: 18px;
  color: #d3003f;
  margin: 12px 0 6px;
}
.seo-article-box p {
  margin-bottom: 10px;
  font-weight: normal;
}
.faq-item {
  margin-bottom: 8px;
}
.faq-item strong {
  color: #000b65;
  display: block;
}

.chart-list {
  border: 2px solid #eb008b;
  width: 90%;
  max-width: 600px;
  margin: 10px auto;
  text-align: center;
  font-weight: 600;
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
}
.chart-list.ab1 { border-color: #003c6c; }
.chart-list h4 {
  color: #fff;
  padding: 7px 10px;
  font-size: 19px;
  margin: 0;
  background-color: #024c88;
}
.chart-list a {
  display: block;
  font-size: 15px;
  padding: 6px 10px;
  text-decoration: none;
  border-bottom: 1px solid #e0e0e0;
  color: #003c6c;
}
.chart-list a:hover {
  background-color: #f0f8ff;
  text-decoration: underline;
}

footer {
  background-color: #fff;
  color: red;
  font-weight: bold;
  font-size: 20px;
  text-decoration: none;
  border: 4px groove purple;
  text-shadow: 1px 1px gold;
  margin: 15px auto 5px;
  padding: 10px;
  max-width: 95%;
  border-radius: 6px;
}
footer > div {
  border-bottom: 2px solid #b2ddff;
  padding: 6px 0;
  margin-bottom: 6px;
}
footer .ftr-sm {
  font-size: 12px;
  color: #333;
  text-shadow: none;
  font-weight: normal;
  text-align: justify;
  line-height: 1.6;
}

@media only screen and (max-width: 770px) {
  .panel.panel-info { width: 95%; }
  .chart-list { width: 95%; }
  .seo-article-box { width: 95%; }
}
@media only screen and (max-width: 500px) {
  .panel.panel-info { width: 100%; border-radius: 0; }
  tbody td { font-size: 14px; padding: 4px 1px; }
  .button2 { padding: 8px 16px; font-size: 13px; }
}

/* Scraped BharatMatka Table Integration Styles */
table[data-slot="table"] {
  width: 100% !important;
  max-width: 100%;
  border-collapse: collapse;
  background: #fff;
  margin: 10px auto;
  border: 2px solid #ff00a2;
}
table[data-slot="table"] thead th,
table[data-slot="table"] th {
  background: #ff00a2 !important;
  color: #fff !important;
  font-weight: 700;
  padding: 8px 4px;
  border: 1px solid #fff;
  font-size: 14px;
  text-align: center;
}
table[data-slot="table"] tbody td,
table[data-slot="table"] td {
  border: 1px solid #c0c0c0;
  padding: 6px 3px;
  text-align: center;
  font-size: 14px;
  vertical-align: middle;
}
table[data-slot="table"] tr:nth-child(even) td {
  background: #fffaf0;
}
table[data-slot="table"] tr:hover td {
  background: #ffe4b5;
}
table[data-slot="table"] .flex {
  display: flex;
}
table[data-slot="table"] .flex-col {
  flex-direction: column;
}
table[data-slot="table"] .items-center {
  align-items: center;
}
table[data-slot="table"] .font-semibold {
  font-weight: 700;
  font-size: 15px;
}
table[data-slot="table"] .text-destructive,
table[data-slot="table"] [class*="destructive"] {
  color: #ff0016 !important;
  font-weight: 800;
}
table[data-slot="table"] .text-card-muted-foreground {
  color: #444;
  font-size: 11px;
}
table[data-slot="table"] .text-card-foreground {
  color: #000;
}
`;

/**
 * Renders an authentic DPBoss 1:1 Jodi Chart Page
 */
export function renderJodiChartPage(
  market: KhabarlineMarket,
  fallbackRows: ChartRecordRow[],
  scrapedTableHtml?: string,
  scrapedTitle?: string
): string {
  const chartTitle = scrapedTitle || `${market.name} MATKA JODI RECORD 2012 - 2026`;

  let tableMarkup = scrapedTableHtml;
  if (!tableMarkup) {
    const rowsHtml = fallbackRows.length > 0
      ? fallbackRows
          .map((r) => {
            const getJodi = (day?: { jodi?: string }) => {
              const j = day?.jodi || '**';
              const isRed = j.length === 2 && (j[0] === j[1] || isRedPair(j));
              return `<td class="${isRed ? 'r' : ''}">${j}</td>`;
            };
            return `
              <tr>
                ${getJodi(r.mon)}
                ${getJodi(r.tue)}
                ${getJodi(r.wed)}
                ${getJodi(r.thu)}
                ${getJodi(r.fri)}
                ${getJodi(r.sat)}
                ${getJodi(r.sun)}
              </tr>
            `;
          })
          .join('')
      : `<tr><td colspan="7" style="padding:20px; color:#555;">Loading historical chart records...</td></tr>`;

    tableMarkup = `
      <table style="width: 100%; text-align:center;" class="panel-chart chart-table" cellpadding="2">
        <thead>
          <tr>
            <th>Mon</th>
            <th>Tue</th>
            <th>Wed</th>
            <th>Thu</th>
            <th>Fri</th>
            <th>Sat</th>
            <th>Sun</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    `;
  }

  return `<!DOCTYPE html>
<html lang="en-in">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${market.name} Jodi Chart | DPBoss Fast Result Jodi Record | Khabarline</title>
<meta name="description" content="Get accurate & fast ${market.name} Jodi Chart updates, DPBoss fast result, dpboss.boston live records, historical jodi number archives, and guessing on Khabarline.site.">
<meta name="keywords" content="${market.name} jodi chart, dpboss ${market.name} chart, dpboss.boston ${market.name}, dpboss fast result, dpboss result ${market.name}, dpboss net, dpboss mobi, satta matka jodi, kalyan jodi chart, ${market.slug} record" />
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<link rel="canonical" href="https://khabarline.site/jodi-chart-record/${market.slug}" />

<!-- OpenGraph & Twitter Tags -->
<meta property="og:type" content="article">
<meta property="og:site_name" content="Khabarline - DPBoss Fast Result">
<meta property="og:title" content="${market.name} Jodi Chart Record | DPBoss Result">
<meta property="og:description" content="Historical ${market.name} Jodi Chart Record, DPBoss Fast Result & Live Updates on Khabarline.site">
<meta property="og:url" content="https://khabarline.site/jodi-chart-record/${market.slug}">

<!-- Schema.org JSON-LD Structured Data -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {
          "@type": "ListItem",
          "position": 1,
          "name": "Home",
          "item": "https://khabarline.site/"
        },
        {
          "@type": "ListItem",
          "position": 2,
          "name": "${market.name} Jodi Chart",
          "item": "https://khabarline.site/jodi-chart-record/${market.slug}"
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is ${market.name} Jodi Chart?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The ${market.name} Jodi Chart provides an authentic, chronological table of winning Jodi combinations declared by official market organizers."
          }
        },
        {
          "@type": "Question",
          "name": "How frequently are results updated on ${market.name} Jodi Chart?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Results on Khabarline.site are synchronized live in real-time as soon as the official market session concludes."
          }
        }
      ]
    }
  ]
}
</script>
<style>${dpbossChartCss}</style>
</head>
<body>

<div class="logo">
  <a href="/" style="text-decoration:none;">
    <h1>KHABARLINE.SITE</h1>
    <p>⚡ WORLD'S FASTEST LIVE SATTA MATKA RESULT & CHARTS ⚡</p>
  </a>
</div>

<div class="conta">
  <h4>${market.name} JODI CHART</h4>
</div>
<div class="sub-title-bar">${market.name} JODI CHART RESULT RECORDS:</div>

<div class="chart-result">
  <div>${market.name}</div>
  <span>${market.value}</span>
  <div>
    <a href="/jodi-chart-record/${market.slug}.php">🔄 Refresh Result</a>
    <a href="/panel-chart-record/${market.slug}.php" style="background:#024c88;">📊 Panel Chart</a>
    <a href="/" style="background:#d3003f;">🏠 Home</a>
  </div>
</div>

<div id="top"></div>
<div>
  <a href="#bottom" class="button2">⬇️ Go to Bottom</a>
  <a href="/panel-chart-record/${market.slug}.php" class="button2">View Full Chart</a>
</div>

<div class="panel panel-info">
  <div class="panel-heading text-center">
    <h3>${chartTitle}</h3>
  </div>
  <div class="panel-body">
    ${tableMarkup}
  </div>
</div>

<div class="chart-result" style="margin-top:10px;">
  <div>${market.name}</div>
  <span>${market.value}</span>
  <div>
    <a href="/jodi-chart-record/${market.slug}.php">🔄 Refresh Result</a>
  </div>
</div>

${getSeoArticleHtml(market.name, 'jodi')}

<div id="bottom"></div>
<a href="#top" class="button2">⬆️ Go to Top</a>

${getDualChartListHtml(market.slug, 'jodi')}

<footer>
  <div style="font-size: 26px; color: #007bff; text-shadow: 1px 1px gold; margin-bottom: 4px;">KHABARLINE.SITE</div>
  <div style="font-size: 16px; color: #000; text-shadow: none; margin-bottom: 4px;">All Rights Reserved (1998-2026)</div>
  <div style="font-size: 14px; color: red; text-shadow: none;">Contact (<a href="https://t.me/result_juggler" style="color:red;">Astrologer-Khabarline</a>)</div>
  <div class="ftr-sm" style="margin-top:8px;">
    <p>DpBOSS / Khabarline is India's most popular result portal declaring verified Satta Matka live results, Kalyan Matka Jodi charts, and historical panel records. All mathematical calculations and guessing charts are published for research and statistical analysis.</p>
  </div>
</footer>

</body>
</html>`;
}

/**
 * Renders an authentic DPBoss 1:1 Panel Chart Page
 */
export function renderPanelChartPage(
  market: KhabarlineMarket,
  fallbackRows: ChartRecordRow[],
  scrapedTableHtml?: string,
  scrapedTitle?: string
): string {
  const chartTitle = scrapedTitle || `${market.name} MATKA PANEL RECORD 2012 - 2026`;

  let tableMarkup = scrapedTableHtml;
  if (!tableMarkup) {
    const rowsHtml = fallbackRows.length > 0
      ? fallbackRows
          .map((r) => {
            const renderDay = (day?: { openPana?: string; jodi?: string; closePana?: string }) => {
              const op = formatPanaVertical(day?.openPana || '***');
              const jd = day?.jodi || '**';
              const cp = formatPanaVertical(day?.closePana || '***');
              const isRed = jd.length === 2 && (jd[0] === jd[1] || isRedPair(jd));
              return `
                <td>${op}</td>
                <td class="${isRed ? 'r' : ''}">${jd}</td>
                <td>${cp}</td>
              `;
            };

            return `
              <tr>
                <td>${r.dateRange ? r.dateRange.replace(' to ', '<br>to<br>') : ''}</td>
                ${renderDay(r.mon)}
                ${renderDay(r.tue)}
                ${renderDay(r.wed)}
                ${renderDay(r.thu)}
                ${renderDay(r.fri)}
                ${renderDay(r.sat)}
                ${renderDay(r.sun)}
              </tr>
            `;
          })
          .join('')
      : `<tr><td colspan="22" style="padding:20px; color:#555;">Loading historical panel chart records...</td></tr>`;

    tableMarkup = `
      <table style="width: 100%; text-align:center;" class="panel-chart chart-table" cellpadding="2">
        <thead>
          <tr>
            <th>Date</th>
            <th colspan="3">Mon</th>
            <th colspan="3">Tue</th>
            <th colspan="3">Wed</th>
            <th colspan="3">Thu</th>
            <th colspan="3">Fri</th>
            <th colspan="3">Sat</th>
            <th colspan="3">Sun</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    `;
  }

  return `<!DOCTYPE html>
<html lang="en-in">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${market.name} Panel Chart | DPBoss Fast Result Pana Record | Khabarline</title>
<meta name="description" content="Get accurate & fast ${market.name} Panel Chart updates, DPBoss fast result, dpboss.boston historical open pana, jodi, and close pana records on Khabarline.site.">
<meta name="keywords" content="${market.name} panel chart, dpboss ${market.name} panel, dpboss.boston ${market.name}, dpboss fast result, dpboss result ${market.name}, ${market.name} patti chart, ${market.name} record, panel record 2012 2026, ${market.slug} panel" />
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<link rel="canonical" href="https://khabarline.site/panel-chart-record/${market.slug}" />

<!-- OpenGraph & Twitter Tags -->
<meta property="og:type" content="article">
<meta property="og:site_name" content="Khabarline - DPBoss Fast Result">
<meta property="og:title" content="${market.name} Panel Chart Record | DPBoss Result">
<meta property="og:description" content="Historical ${market.name} Panel Chart Record, DPBoss Fast Result & Live Updates on Khabarline.site">
<meta property="og:url" content="https://khabarline.site/panel-chart-record/${market.slug}">

<!-- Schema.org JSON-LD Structured Data -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {
          "@type": "ListItem",
          "position": 1,
          "name": "Home",
          "item": "https://khabarline.site/"
        },
        {
          "@type": "ListItem",
          "position": 2,
          "name": "${market.name} Panel Chart",
          "item": "https://khabarline.site/panel-chart-record/${market.slug}"
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is ${market.name} Panel Chart?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The ${market.name} Panel Chart provides an authentic 3-phase open pana, jodi, and close pana historical archive from 2012 to 2026."
          }
        },
        {
          "@type": "Question",
          "name": "How frequently are ${market.name} Panel results updated?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Results on Khabarline.site are synchronized live in real-time as soon as the official market session concludes."
          }
        }
      ]
    }
  ]
}
</script>
<style>${dpbossChartCss}</style>
</head>
<body>

<div class="logo">
  <a href="/" style="text-decoration:none;">
    <h1>KHABARLINE.SITE</h1>
    <p>⚡ WORLD'S FASTEST LIVE SATTA MATKA RESULT & CHARTS ⚡</p>
  </a>
</div>

<div class="conta">
  <h4>${market.name} PANEL CHART</h4>
</div>
<div class="sub-title-bar">${market.name} PANEL CHART RESULT RECORDS:</div>

<div class="chart-result">
  <div>${market.name}</div>
  <span>${market.value}</span>
  <div>
    <a href="/panel-chart-record/${market.slug}.php">🔄 Refresh Result</a>
    <a href="/jodi-chart-record/${market.slug}.php" style="background:#024c88;">📊 Jodi Chart</a>
    <a href="/" style="background:#d3003f;">🏠 Home</a>
  </div>
</div>

<div id="top"></div>
<div>
  <a href="#bottom" class="button2">⬇️ Go to Bottom</a>
  <a href="/jodi-chart-record/${market.slug}.php" class="button2">View Jodi Chart</a>
</div>

<div class="panel panel-info">
  <div class="panel-heading text-center">
    <h3>${chartTitle}</h3>
  </div>
  <div class="panel-body">
    ${tableMarkup}
  </div>
</div>

<div class="chart-result" style="margin-top:10px;">
  <div>${market.name}</div>
  <span>${market.value}</span>
  <div>
    <a href="/panel-chart-record/${market.slug}.php">🔄 Refresh Result</a>
  </div>
</div>

${getSeoArticleHtml(market.name, 'panel')}

<div id="bottom"></div>
<a href="#top" class="button2">⬆️ Go to Top</a>

${getDualChartListHtml(market.slug, 'panel')}

<footer>
  <div style="font-size: 26px; color: #007bff; text-shadow: 1px 1px gold; margin-bottom: 4px;">KHABARLINE.SITE</div>
  <div style="font-size: 16px; color: #000; text-shadow: none; margin-bottom: 4px;">All Rights Reserved (1998-2026)</div>
  <div style="font-size: 14px; color: red; text-shadow: none;">Contact (<a href="https://t.me/result_juggler" style="color:red;">Astrologer-Khabarline</a>)</div>
  <div class="ftr-sm" style="margin-top:8px;">
    <p>DpBOSS / Khabarline is India's most popular result portal declaring verified Satta Matka live results, Kalyan Matka Jodi charts, and historical panel records. All mathematical calculations and guessing charts are published for research and statistical analysis.</p>
  </div>
</footer>

</body>
</html>`;
}

function formatPanaVertical(pana: string): string {
  if (!pana || pana === '***') return '*<br>*<br>*';
  const clean = pana.replace(/\s+/g, '');
  if (clean.length === 3) {
    return `${clean[0]}<br>${clean[1]}<br>${clean[2]}`;
  }
  return pana;
}

const RED_PAIRS = new Set([
  '05', '50', '16', '61', '27', '72', '38', '83', '49', '94',
  '00', '11', '22', '33', '44', '55', '66', '77', '88', '99',
]);

function isRedPair(jodi: string): boolean {
  return RED_PAIRS.has(jodi.trim());
}
