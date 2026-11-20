import { KhabarlineState, KhabarlineMarket } from './types.js';

export function renderHomePage(state: KhabarlineState): string {
  const sortedMarkets = Object.values(state.markets).sort((a, b) => (a.order || 999) - (b.order || 999));

  // Build Final Ank ticker content
  const finalAnkHtml = Object.entries(state.finalAnk)
    .map(([market, ank]) => `${market} - ${ank}`)
    .join('<br>\n');

  // Build unified Live Result cards (DPBoss live items + scheduled/promoted liveResultMarkets)
  const seenLive = new Set<string>();
  const liveCards: Array<{
    name: string;
    value: string;
    badge?: string;
    note?: string;
    isLoading: boolean;
  }> = [];

  // 1. Explicit DPBoss items
  for (const item of state.liveResultItems || []) {
    const key = item.marketName.toUpperCase().trim();
    seenLive.add(key);
    const m = state.markets[key];
    const val = item.value || (m ? m.value : 'Loading...');
    const isLoading = val === 'Loading...' || val === '***-**-***';
    liveCards.push({
      name: m ? m.name : item.marketName,
      value: val,
      badge: item.badge || (isLoading ? 'खबर लाइन चालू है' : undefined),
      note: item.note,
      isLoading,
    });
  }

  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(Date.now() + istOffsetMs);
  const currentMins = istNow.getUTCHours() * 60 + istNow.getUTCMinutes();
  const todayIST = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  // 2. Scheduled or promoted liveResultMarkets (at result time, waits for 5 minutes)
  for (const key of state.liveResultMarkets || []) {
    const norm = key.toUpperCase().trim();
    if (seenLive.has(norm)) continue;
    seenLive.add(norm);
    const m = state.markets[norm];
    if (!m) continue;

    const isAtOpenTime =
      m.openMinute !== undefined &&
      currentMins >= m.openMinute &&
      currentMins < m.openMinute + 5;

    const isAtCloseTime =
      m.closeMinute !== undefined &&
      currentMins >= m.closeMinute &&
      currentMins < m.closeMinute + 5;

    const hasTodayOpen =
      m.isVerified &&
      m.verifiedDate === todayIST &&
      (m.verifiedSession === 'OPEN' || m.verifiedSession === 'ALL' || (m.openPana && m.openPana !== '***'));

    const hasTodayClose =
      m.isVerified &&
      m.verifiedDate === todayIST &&
      (m.verifiedSession === 'CLOSE' || m.verifiedSession === 'ALL' || (m.closePana && m.closePana !== '***'));

    let val = m.value || 'Loading...';
    if (isAtOpenTime && !hasTodayOpen) {
      val = 'Loading...';
    } else if (isAtCloseTime && !hasTodayClose) {
      val = m.openPana && m.openAnk ? `${m.openPana}-${m.openAnk}*-***` : (hasTodayOpen ? m.value : 'Loading...');
    }

    const isLoading = val === 'Loading...' || val === '***-**-***' || val.includes('*-***');
    liveCards.push({
      name: m.name,
      value: val,
      badge: 'खबर लाइन चालू है',
      isLoading,
    });
  }

  const liveResultHtml = liveCards
    .map((card) => {
      return `
        <div class="live-market-row" data-market="${card.name}">
          <span class="h8">${card.name}</span>
          <span class="h9 val-display" ${card.isLoading ? 'style="color:#00094d; font-style:italic;"' : ''}>${card.value}</span>
          ${card.badge ? `<span class="e-sprg">${card.badge}</span>` : ''}
          <div style="margin-top:2px;">
            <button onclick="window.location.reload()" class="clk1-rld" style="font-size:11px; padding:3px 14px;">Refresh</button>
          </div>
          ${card.note ? `<p>${card.note}</p>` : ''}
        </div>
      `;
    })
    .join('');

  // Build World Me Sabse Fast market cards wrapped in authentic DPBoss .tkt-val containers
  const chunkSize = 25;
  const marketChunks: KhabarlineMarket[][] = [];
  for (let i = 0; i < sortedMarkets.length; i += chunkSize) {
    marketChunks.push(sortedMarkets.slice(i, i + chunkSize));
  }

  const marketBoxesHtml = marketChunks
    .map((chunk, idx) => {
      const cardsHtml = chunk
        .map((m) => {
          const isYellow = m.highlight ? 'bg-ylw' : '';
          const displayVal = m.value || 'Loading...';
          const jodiLink = `/jodi-chart-record/${m.slug}`;
          const panelLink = `/panel-chart-record/${m.slug}`;
          return `
            <div class="${isYellow}" data-market-box="${m.name}">
              <h4>${m.name}</h4>
              <span id="res-${m.slug}">${displayVal}</span>
              <p>${m.openTime} &nbsp;&nbsp; ${m.closeTime}</p>
              <a href="${jodiLink}" class="vl-clk gm-clk">Jodi</a>
              <a href="${panelLink}" class="vl-clk-2 gm-clk">Panel</a>
            </div>
          `;
        })
        .join('');

      return `
        <div class="tkt-val" style="border-color: #aa00c0; margin-bottom: 2px; ${idx > 0 ? 'margin-top: 2px;' : ''}">
          ${cardsHtml}
        </div>
      `;
    })
    .join('');

  // Main Starline rows (paired into 2 columns)
  const starlineCount = state.mainStarline.length;
  const halfStarline = Math.ceil(starlineCount / 2);
  let mainStarlineRows = '';
  for (let i = 0; i < halfStarline; i++) {
    const left = state.mainStarline[i];
    const right = state.mainStarline[i + halfStarline];
    mainStarlineRows += `
      <tr>
        <td>${left ? left.time : ''}</td>
        <td>${left ? left.value : ''}</td>
        <td>${right ? right.time : ''}</td>
        <td>${right ? right.value : ''}</td>
      </tr>
    `;
  }

  // Mumbai Rajshree Starline rows
  const rajshreeCount = state.mumbaiRajshreeStarline.length;
  const halfRajshree = Math.ceil(rajshreeCount / 2);
  let rajshreeRows = '';
  for (let i = 0; i < halfRajshree; i++) {
    const left = state.mumbaiRajshreeStarline[i];
    const right = state.mumbaiRajshreeStarline[i + halfRajshree];
    rajshreeRows += `
      <tr>
        <td>${left ? left.time : ''}</td>
        <td>${left ? left.value : ''}</td>
        <td>${right ? right.time : ''}</td>
        <td>${right ? right.value : ''}</td>
      </tr>
    `;
  }

  // Bombay 36 slot table (paired 2 per row)
  const bombaySlots = state.bombay36.slots;
  let bombayTableRows = '';
  for (let i = 0; i < bombaySlots.length; i += 2) {
    const s1 = bombaySlots[i];
    const s2 = bombaySlots[i + 1];
    bombayTableRows += `
      <tr>
        <td>${s1 ? s1.time : ''}</td>
        <td>${s1 ? s1.value : ''}</td>
        <td>${s2 ? s2.time : ''}</td>
        <td>${s2 ? s2.value : ''}</td>
      </tr>
    `;
  }

  // Aaj Pass Hua
  const aajPassHtml = state.aajPassHua
    .map((item) => `<div class='aj-pass-txt'>${item.market} => ${item.text}</div>`)
    .join('');

  // Free Game Zone items
  const freeGameCards = state.freeGameZone
    .map((item) => `
      <div class="oc-3a-69">
        <p class="g5a1">↪ ${item.marketName}</p>
        <p class="l9w2v">${item.digits}</p>
        <p class="l9w2v">${item.patti}</p>
        <p class="l9w2v">${item.jodi}</p>
      </div>
    `)
    .join('');

  // Weekly Patti lines
  const weeklyPattiLinesHtml = Object.entries(state.weeklyPattiChart.lines)
    .map(([num, patti]) => `<p>${num}=>${patti}</p>`)
    .join('');

  // Weekly Open Close days
  const weeklyOpenCloseHtml = Object.entries(state.weeklyLineOpenClose.days)
    .map(([day, val]) => `<p>${day}. ${val}</p>`)
    .join('');

  // Weekly Jodi pairs
  const weeklyJodiHtml = Object.entries(state.weeklyJodiChart.pairs)
    .map(([_, pair]) => `<p>${pair}</p>`)
    .join('');

  // Jodi Chart Directory Links (Top 30 markets)
  const jodiDirectoryHtml = sortedMarkets
    .slice(0, 30)
    .map((m) => `<a href="/jodi-chart-record/${m.slug}">${m.name} Chart</a>`)
    .join('\n');

  // Panel Chart Directory Links (Top 30 markets)
  const panelDirectoryHtml = sortedMarkets
    .slice(0, 30)
    .map((m) => `<a href="/panel-chart-record/${m.slug}">${m.name} Panel Chart</a>`)
    .join('\n');

  // Build Main Play App Banner
  const isPromoEnabled = state.showAppPromotion !== false && state.playAppBanner?.enabled !== false;
  const banner = state.playAppBanner || {
    enabled: true,
    tag: '🔥 100% TRUSTED ONLINE MATKA PLAY APP 🔥',
    headline: '🎰 सबसे भरोसेमंद Online Matka Play App 🎰',
    subheadline: '⚡ 1 मिनट में Fast Auto Deposit & 24x7 Instant Withdrawal • 100% Safe & Trusted',
    ratesText: '🎯 Single Ank 10 का 95 • Jodi 10 का 950 • Single Patti 10 का 1400',
    downloadUrl: state.apkUrl,
    buttonText: '📲 Download Play App (APK)',
    contactForAdsUrl: state.whatsappChannelUrl || state.telegramChannelUrl,
  };

  const primaryBannerHtml = isPromoEnabled
    ? `
    <div class="text2 promo-box" style="background: linear-gradient(135deg, #7a0000 0%, #b30000 50%, #7a0000 100%); border: 2px solid #ffcc00; box-shadow: 0 0 15px rgba(255,204,0,0.4); margin-bottom: 7px; padding: 10px 10px 8px; border-radius: 10px;">
      <div style="font-size: 13px; font-weight: 800; color: #ffeb3b; letter-spacing: 1px; margin-bottom: 4px; text-shadow: 1px 1px 2px #000;">
        ${banner.tag || '🔥 100% TRUSTED ONLINE MATKA PLAY APP 🔥'}
      </div>
      <div style="font-size: 16px; font-weight: 800; color: #fff; line-height: 22px; text-shadow: 1px 1px 2px #000;">
        ${banner.headline}
      </div>
      ${banner.subheadline ? `<div style="font-size: 13px; font-weight: 700; color: #ffd8a8; margin: 4px 0; line-height: 18px;">${banner.subheadline}</div>` : ''}
      ${banner.ratesText ? `<div style="font-size: 13px; font-weight: 800; color: #00ff66; margin: 3px 0 6px; text-shadow: 1px 1px 2px #000;">${banner.ratesText}</div>` : ''}
      <div style="margin: 6px 0;">
        <a href="${banner.downloadUrl || state.apkUrl}" target="_blank" class="download-btn" style="display: inline-block; padding: 8px 30px; font-size: 15px; font-weight: 800; color: #900000; background: #fff; border: 2px solid #ffcc00; border-radius: 25px; text-decoration: none; box-shadow: 0 4px 10px rgba(0,0,0,0.3);">
          ${banner.buttonText || '📲 Download Play App (APK)'}
        </a>
      </div>
      <div style="margin-top: 5px; font-size: 12px; color: #ffeb3b; font-weight: 600;">
        📢 Want to promote your Matka Play App here? <a href="${banner.contactForAdsUrl || state.whatsappChannelUrl || state.telegramChannelUrl}" target="_blank" style="color: #fff; text-decoration: underline; font-weight: 800;">Contact For App Promotion</a>
      </div>
    </div>
  ` : '';

  // Build Extra Sponsored Play Apps (if any other active apps exist and promo is enabled)
  const otherSponsoredApps = isPromoEnabled
    ? (state.sponsoredPlayApps || []).filter((a) => a.isActive !== false && a.id !== 'star-kalyan-play')
    : [];
  let otherSponsoredHtml = otherSponsoredApps
    .map((app) => `
    <div class="text2 promo-box play-app-card" style="background: linear-gradient(135deg, #7a0000 0%, #b30000 50%, #7a0000 100%); border: 2px solid #ffcc00; box-shadow: 0 0 15px rgba(255,204,0,0.4); margin-bottom: 7px; padding: 10px 10px 8px; border-radius: 10px;">
      <div style="font-size: 13px; font-weight: 800; color: #ffeb3b; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 4px; text-shadow: 1px 1px 2px #000;">
        ${app.tag || '🔥 100% TRUSTED ONLINE MATKA PLAY APP 🔥'}
      </div>
      <div style="font-size: 16px; font-weight: 800; color: #fff; line-height: 22px; text-shadow: 1px 1px 2px #000;">
        ${app.headline}
      </div>
      ${app.subheadline ? `<div style="font-size: 13px; font-weight: 700; color: #ffd8a8; margin: 4px 0; line-height: 18px;">${app.subheadline}</div>` : ''}
      ${app.ratesText ? `<div style="font-size: 13px; font-weight: 800; color: #00ff66; margin: 3px 0 6px; text-shadow: 1px 1px 2px #000;">${app.ratesText}</div>` : ''}
      <div style="margin: 6px 0;">
        <a href="${app.downloadUrl}" target="_blank" class="download-btn play-download-btn" style="display: inline-block; padding: 8px 30px; font-size: 15px; font-weight: 800; color: #900000; background: #fff; border: 2px solid #ffcc00; border-radius: 25px; text-decoration: none; box-shadow: 0 4px 10px rgba(0,0,0,0.3);">
          ${app.buttonText || '📲 Download Play App (APK)'}
        </a>
      </div>
      <div style="margin-top: 5px; font-size: 12px; color: #ffeb3b; font-weight: 600;">
        📢 Want to promote your Matka Play App here? <a href="${app.contactForAdsUrl || state.whatsappChannelUrl || state.telegramChannelUrl}" target="_blank" style="color: #fff; text-decoration: underline; font-weight: 800;">Contact For App Promotion</a>
      </div>
    </div>
  `)
    .join('');

  const sponsoredAppsHtml = primaryBannerHtml + (otherSponsoredHtml ? '\n' + otherSponsoredHtml : '');
  const primaryAppDownloadUrl = banner.downloadUrl || state.apkUrl || '#';

  const currentDateStr = new Date().toLocaleDateString('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  return `<!DOCTYPE html> 
<html lang="en-in">
<head>  
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />

<title>${state.siteTitle}</title>
<meta name="description" content="Khabarline (Fastest DPBoss Result Hub) - Get DPBoss Fast Result, DPBoss.boston Live Satta Matka, Kalyan Matka Jodi & Panel Charts, Final Ank & 143 guessing in real-time.">
<meta name="keywords" content="dpboss, dpboss.boston, dpboss fast result, dpboss result, dpboss net, dpboss mobi, dpboss 143, dpboss matka, dpboss guessing, dpboss kalyan, dpboss chart, dpboss panel chart, dpboss jodi chart, dpboss open close, dpboss fix jodi, dpboss today result, satta matka dpboss, kalyan matka result, matka result, khabarline, khabarline.site" />
<meta name="author" content="KHABARLINE | DPBOSS | SATTA MATKA | KALYAN MATKA | MATKA RESULT | MATKA | SATTA">
<link rel="canonical" href="https://${state.domain}" />
<link rel="alternate" href="https://${state.domain}/" hreflang="en-in" />
<meta name="google" content="notranslate" />
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta content="yes" name="apple-mobile-web-app-capable">
<meta content="yes" name="apple-touch-fullscreen">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">

<!-- OpenGraph & Social Media SEO -->
<meta property="og:type" content="website">
<meta property="og:site_name" content="Khabarline - DPBoss Fast Result">
<meta property="og:title" content="${state.siteTitle}">
<meta property="og:description" content="Fastest Verified DPBoss Satta Matka Live Results, DPBoss.boston Live Update, Kalyan Matka Jodi & Panel Charts on Khabarline.site">
<meta property="og:url" content="https://${state.domain}/">
<meta property="og:locale" content="en_IN">

<!-- Twitter Card SEO -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${state.siteTitle}">
<meta name="twitter:description" content="Fastest Verified DPBoss Satta Matka Live Results, DPBoss.boston Live Update, Kalyan Matka Jodi & Panel Charts on Khabarline.site">

<!-- Structured Data / JSON-LD Rich Snippets for Google -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": "https://${state.domain}/#website",
      "url": "https://${state.domain}/",
      "name": "Khabarline",
      "alternateName": [
        "DPBoss",
        "DPBoss Boston",
        "DPBoss Fast Result",
        "DPBoss Satta Matka",
        "DPBoss Result Today",
        "DPBoss 143",
        "Khabarline DPBoss"
      ],
      "description": "Fastest Verified Satta Matka Live Results, DPBoss Fast Result, DPBoss.boston Live Updates, Kalyan Matka Jodi & Panel Charts, Golden & Final Ank on Khabarline.site",
      "inLanguage": "en-IN",
      "keywords": "dpboss, dpboss.boston, dpboss fast result, dpboss result, dpboss net, dpboss matka, dpboss kalyan, dpboss chart, dpboss live result, dpboss 143 guessing"
    },
    {
      "@type": "Organization",
      "@id": "https://${state.domain}/#organization",
      "name": "Khabarline Media",
      "url": "https://${state.domain}/",
      "logo": {
        "@type": "ImageObject",
        "url": "https://${state.domain}/spinner.png"
      }
    },
    {
      "@type": "FAQPage",
      "@id": "https://${state.domain}/#faq",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is Khabarline and how does it deliver DPBoss Fast Results?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Khabarline.site is India's leading verified Satta Matka result portal delivering DPBoss fast results, Kalyan Matka, Main Bazar, Milan Day, Milan Night, Rajdhani Night and 187+ markets via real-time multi-source consensus."
          }
        },
        {
          "@type": "Question",
          "name": "Is Khabarline an official alternative to dpboss.boston and dpboss net?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes, Khabarline provides direct real-time synchronization with DPBoss Boston, DPBoss Net, and all major Indian Satta Matka consensus feeds with verified sub-second updates."
          }
        },
        {
          "@type": "Question",
          "name": "How fast are Kalyan Matka and DPBoss live results updated on Khabarline?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Results on Khabarline.site are verified across multi-source consensus feeds and published within seconds of official declaration."
          }
        },
        {
          "@type": "Question",
          "name": "Where can I find DPBoss Kalyan Jodi and Panel Chart records?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "You can find complete historical DPBoss Kalyan Jodi charts and 3-phase Panel charts from 2012 to 2026 in the chart directories on Khabarline.site."
          }
        }
      ]
    }
  ]
}
</script>

<style>
html{overflow-x:hidden;scroll-behavior:auto;}
body{background-color:#fc9;text-align:center;padding:3px 10px;margin:0;scroll-behavior:smooth;font-style:italic;font-family:Helvetica,sans-serif;font-weight:700;}
*{margin:0;padding:0;box-sizing:border-box;}
a,a:hover{text-decoration:none;}
.a-us a,.a-us b,.a-us p,.dis12 h2,.dis12 p,.qtn14 a,.qtn14 h4,.qtn14 p,.lst-sec h2,.lst-sec p,.pow-13{font-style:normal;}
.a-us,.sky-23,.f-pti,.eml-us,.dis12,.qtn14,.lst-sec,.liv-rslt,.pow-13,.sta-div,.sun-col>div,.tkt-val,.gbl-val{
  color:#000;text-align:center;margin-bottom:2px;margin-top:-2px;display:block;font-size:20px;
  outline:4px #fff;outline-offset:-9px;border:2px solid #ff182c;border-style:outset;border-radius:10px;box-shadow:0 0 20px 0 rgb(0 0 0 / 40%);
}
.m-icon{
  background:#fc9;padding:6px 10px;display:block;color:#fff8f8;margin-bottom:1px;letter-spacing:1px;font-weight:700;
  border:3px solid #ff0016;border-radius:.75em;transform-style:preserve-3d;
  transition:transform 150ms cubic-bezier(0,0,.58,1),background 150ms cubic-bezier(0,0,.58,1);
}
.brand-logo-text {
  font-size: 32px;
  font-weight: 900;
  color: #d3003f;
  text-shadow: 2px 2px 3px #fff, -1px -1px 0 #fff;
  letter-spacing: 2px;
  display: block;
}
.brand-sub-text {
  font-size: 13px;
  color: #000b65;
  text-shadow: 1px 1px 1px #fff;
}
p{color:#000b65;text-shadow:1px 1px 2px #fff;}
.text2{
  border-width:3px;border:2px solid #0014e2;margin-bottom:2px;border-style:outset;border-radius:10px;
  border:2px solid #ff182c;box-shadow:0 0 20px 0 rgb(0 0 0 / 40%);
}
.text2 h2{color:#061699;text-shadow:1px 1px 2px #fff;}
.text3{
  background:linear-gradient(187deg,#fc9 50%,#ffc387 50%);border:2px solid #ff0016;border-style:outset;border-radius:10px;
  margin-bottom:2px;line-height:1.4;font-size:14px;padding:4px 10px;color:#00094d;text-shadow:1px 1px 2px #fff;box-shadow:0 0 20px 0 rgb(0 0 0 / 40%);
}
table{box-shadow:0 0 20px 0 rgb(0 0 0 / 40%);margin:5px 0;}
.tkt-val div{border-bottom:1px solid #ff0018;}
.f-pti{border-color:#ff0016;}
.f-pti .dflex{display:-webkit-flex;display:flex;}
.f-pti .dflex>div{width:50%;}
.f-pti h4{font-size:18px;color:#001699;text-shadow:1px 1px 2px #fff;}
.f-pti p{font-size:22px;text-shadow:none;}
.f-pti .bb55{border-left:1px solid #000ff4;}
.sm-ttle,.flyr24,.f-pti h3,.oc-fg h4,.liv-rslt h4{
  background:#ff00a2;padding:5px 10px;text-shadow:1px 1px 2px #000;display:block;color:#fff8f8;
  margin-bottom:5px;letter-spacing:1px;font-weight:700;border:2px solid #fff;border-radius:.75em;
  transform-style:preserve-3d;transition:transform 150ms cubic-bezier(0,0,.58,1),background 150ms cubic-bezier(0,0,.58,1);
}
.lv-mc .h8{display:block;font-size:22px;color:#00094d;text-shadow:1px 1px 2px #fff;}
.lv-mc .live-market-row{display:block;border-top:1px solid #ff0020;margin-top:5px;padding-top:4px;}
.lv-mc .live-market-row:first-child{border-top:none;margin-top:0;}
.lv-mc .h9{display:block;color:#880e4f;text-shadow:1px 1px 2px #ffe2c6;font-size:21px;line-height:1;margin:3px 0;}
.lv-mc .e-sprg{font-size:16px;padding:3px;color:#ff0016;font-weight:800;display:block;}
.lv-mc p{font-size:14px;padding-top:3px;color:#000;text-shadow:none;font-weight:700;}
.lv-mc button,.clk1-rld{
  border:1px solid #e6e6e6;background:#522f92;color:#fff;padding:5px 7px;border-radius:8px;font-size:12px;
  margin:2px 0 -1px;display:inline-block;transition:all .3s;cursor:pointer;
}
.lv-mc button:hover,.clk1-rld:hover{box-shadow:0 0 13px 3px #00000033;}
.tkt-val h4{font-size:22px;color:#00094d;text-shadow:1px 1px 2px #fff;}
.tkt-val span{
  margin:0;font-size:22px;line-height:1;
  background:-webkit-linear-gradient(#4500bf,#670009);-webkit-background-clip:text;-webkit-text-fill-color:transparent;
  padding:5px 5px;display:inline-block;
}
.tkt-val p{font-size:15px;padding:2px 0;margin-bottom:0;color:#000;text-shadow:1px 1px 2px #ffd9d9;}
.tkt-val div{padding:3px;position:relative;}
.tkt-val div:last-child{border-bottom-width:0;}
.bg-ylw{background-color:#ff0;border-bottom:1px solid #ff9800;}
.sky-23{border:2px solid #1f3092;}
.sky-23 h4{
  background:#ff1731;color:#fff;border-radius:10px;font-size:30px;padding:3px 5px;text-shadow:1px 1px 2px #000;
  clip-path:polygon(0 0,97% 0,100% 48%,100% 80%,100% 100%,3% 100%,0 46%,0 20%);
}
.sky-23 a:last-child{border-bottom-width:0;}
.sky-23 a{
  background-image:linear-gradient(-225deg,#231557 0,#44107a 29%,#ff1361 67%,#ff0025 100%);background-size:200% auto;
  color:#fff;-webkit-background-clip:text;-webkit-text-fill-color:transparent;animation:textclip 2s linear infinite;
  font-size:22px;display:block;border-bottom:2px solid #ff0026;padding:5px;
}
@keyframes textclip{to{background-position:200% center}}
.sun-col>div{border-color:#e71d36;}
.sun-col h4{
  animation:fajskd 5s infinite;border-radius:10px;color:#fff;line-height:1.1;padding:4px 10px 3px;text-shadow:1px 1px 2px #000;font-size:24px;
}
@keyframes fajskd{0%{background-color:#ff019e}25%{background-color:#ff001d}50%{background-color:#009a07}75%{background-color:#001fad}100%{background-color:#ff019e}}
.sun-col p{font-size:18px;text-align:center;line-height:1.3;}
.sta-div h6{color:#fff;padding:5px 10px 3px;font-size:24px;background:#ff00a2;border-radius:8px;}
.sta-div a{display:block;font-size:22px;padding:5px 7px 4px;}
.sta-1 a{border-bottom:2px solid #00189f;color:#1a237e;text-shadow:1px 1px #d9d9d9;}
.sta-div a:last-child{border-bottom-width:0;}
.sta-1{border-color:#b9005e;}
.vl-clk,.vl-clk-2{
  position:absolute;color:#7a028d;font-size:15px;padding:2px 0;transform:translateY(-158%);border-bottom:none;
}
.vl-clk{left:18px;right:auto;}
.vl-clk-2{right:18px;left:auto;}
.gm-clk{
  color:#fff;padding:5px 7px;border-radius:8px;font-size:12px;margin:0;display:block;transition:all .3s;
  text-shadow:1px 1px 2px #222;margin-top:-6px;border:1px solid #e6e6e6;background:#522f92;
}
.my-table.mr-sl h4{
  background:#ffd902;padding:5px 10px;text-shadow:1px 1px 2px #fff;display:block;color:#000;
  margin-bottom:5px;margin-top:0px;letter-spacing:1px;font-weight:700;font-style:italic;border:2px solid #000;border-radius:.75em;
}
.my-table.mumraj-sl h4{
  background:#ff00a2;padding:5px 10px;text-shadow:1px 1px 2px #000;display:block;color:#fff8f8;
  margin-bottom:5px;margin-top:10px;letter-spacing:1px;font-weight:700;border:2px solid #fff;border-radius:.75em;
}
.my-table h4{font-size:24px;}
.my-table table{border-collapse:collapse;width:100%;box-shadow:0 0 20px 0 rgb(0 0 0 / 40%);margin:5px 0;}
.my-table td,.my-table th{padding:2px 0;font-size:15px;text-shadow:1px 1px 2px #fff;border:1px solid #ff0016;}
.my-table thead{background-color:#fff;font-size:16px;}
.wheel-section{display:flex;justify-content:center;align-items:center;padding:10px 0;}
.wheel-container{position:relative;width:240px;height:240px;}
.wheel-image{width:100%;height:100%;animation:spin 5s linear infinite;}
.spin-center-text{
  position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
  font-size:24px;font-weight:700;font-style:italic;color:#003399;text-shadow:0 0 4px #fff, 0 0 8px #fff;z-index:2;
}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
.aaj-pass{border:2px solid red;border-radius:5px;margin-bottom:5px;}
.aaj-pass .hd1{color:#fff;display:block;font-size:20px;background:red;padding:5px;}
.aaj-pass .hd2{padding:5px;display:block;}
.aj-pass-txt{color:#00009c;line-height:23px;font-weight:700;text-shadow:0 0 5px #fff;background:#fff;border:1px solid #00000038;}
.oc-fg h4{font-size:22px;}
.oc-fg .k2w5{font-size:22px;color:#000;text-shadow:1px 1px 2px #fff;}
.d1635{display:flex;flex-wrap:wrap;margin:5px;border-radius:10px;overflow:hidden;}
.oc-3a-69{width:50%;display:inline-block;padding:5px;border-color:#009206;border-style:solid;}
.oc-3a-69:nth-child(odd){border-width:0 1px 2px 2px;margin:0;border-radius:0;}
.oc-3a-69:nth-child(even){border-width:0 2px 2px 1px;margin:0;border-radius:0;}
.d1635 .oc-3a-69:nth-child(1),.d1635 .oc-3a-69:nth-child(2){border-top-width:2px;}
.oc-fg .oc-3a-69 .g5a1{
  background:linear-gradient(#00d309,#004503);font-size:18px;margin-bottom:5px;padding:7px 0;border-radius:10px;
  clip-path:polygon(0 0,97% 0,100% 48%,100% 80%,100% 100%,3% 100%,0 46%,0 20%);color:#fff;text-shadow:1px 1px 2px red;
}
.oc-fg .oc-3a-69 .l9w2v{font-size:16px;line-height:22px;color:#080808;}
.l-obj-giv{border:#000 solid 2px;text-align:center;margin-top:2px;}
.v5a25{font-size:25px;background-color:#ff0;color:blue;}
.v5a25-v4a5{font-size:1.2em;font-weight:700;color:#00f;}
.v5a25-v85b{font-size:2em;font-weight:700;color:#f51111;}
.l-obj-giv td{border:1px solid #e91e63;}
.promo-box{margin-bottom:7px;font-size:14px;padding:3px;line-height:20px;background:#8f0000;color:#fff;text-align:center;border-radius:8px;}
.download-btn{display:inline-block;margin-top:8px;padding:4px 30px;font-size:14px;font-weight:600;color:#0a2fbf;background:#fff;border-radius:20px;text-decoration:none;transition:0.25s;}
.download-btn:hover{background:#e9edff;transform:scale(1.05);}
.qtn14{
  border:2px solid #003db6;border-radius:10px;width:calc(100% - 8px);padding:3px 0;margin:5px auto;
  display:block;font-style:normal;
}
.qtn14 h6{font-size:18px;color:#0013a5;margin:5px 0;}
.qtn14 p{color:#000;font-weight:700;margin:0;font-size:12px;padding:0 10px 5px;opacity:.9;text-align:justify;}
.qtn14 label{
  cursor:pointer;text-transform:uppercase;color:#0013a5;text-shadow:1px 1px 2px #fff;font-weight:800;font-size:16px;
  padding:5px 0;display:block;border-top:1.5px solid #e0557f;
}
.qtn14 .q-crd:first-child label{border-top:none;}
.be-stone{
  border:2px solid #ff0020;border-radius:10px;font-style:normal;padding:5px 8px;margin:5px auto;display:block;
  font-weight:600;font-family:Arial,sans-serif;
}
.be-stone .c-stone{
  text-transform:uppercase;color:#0013a5;text-shadow:1px 1px 2px #fff;font-weight:800;font-size:17px;padding:4px 0 3px;
  border-top:1.5px solid #e0557f;margin-top:8px;font-style:italic;
}
.be-stone p{padding:0 5px;font-size:13px;color:#000;text-align:justify;margin-bottom:4px;}
.seo-content-box{background:#fc9;border:2px solid #003db6;padding:8px;margin:5px 0;color:#000;line-height:1.6;font-size:14px;text-align:justify;}
.seo-content-box h2,.seo-content-box h3{color:#0013a5;margin:12px 0 6px;line-height:1.3;}
.seo-content-box p{margin:0 0 10px;font-size:13px;}
.seo-content-box ul{margin:0 0 12px 20px;padding:0;}
.seo-content-box li{margin-bottom:4px;}
.seo-faq{border-top:1px solid #003db6;margin-top:15px;padding-top:10px;}
.dis12{padding:8px;}
.dis12 span{font-size:18px;font-weight:900;color:#d3003f;text-shadow:1px 1px 2px #fff;}
.dis12 p{font-size:12px;color:#340d7a;line-height:1.4;text-align:justify;}
.pow-13{text-shadow:1px 1px #f4e1e1;color:#000;padding:4px 0;font-size:15px;}
.lst-sec{padding:6px;}
.lst-sec span{font-size:16px;font-weight:900;color:#d3003f;}
.lst-sec p{color:#a50031;font-size:11px;line-height:1.4;}
.amthltg{color:#fff;white-space:nowrap;overflow:hidden;box-sizing:border-box;margin:0 5px;height:40px;}
.amthltg p{animation:amthltg 12s linear infinite;font-size:14px;margin-top:20px;}
@keyframes amthltg{0%{transform:translate(0,0)}100%{transform:translate(0,-100%)}}
.mp-clk1{
  position:fixed;bottom:9px;left:5px;padding:5px 8px;font-size:15px;border:1px solid #fff;
  text-decoration:none;background-color:#039;color:#fff;border-radius:5px;z-index:999;
}
.btm-clk1-f{
  position:fixed;bottom:9px;right:10px;background:linear-gradient(45deg,navy,#005780);
  border:1px solid #fff;font-size:14px;border-radius:5px;padding:6px 11px 5px;z-index:999;
}
.flash-update {
  animation: flashHighlight 2s ease-out;
}
@keyframes flashHighlight {
  0% { background-color: #00ff66 !important; transform: scale(1.08); }
  100% { background-color: inherit; transform: scale(1); }
}
@media only screen and (max-width:500px){
  body{padding:2px 5px;}
  .qtn14 label{font-size:14px;}
  .oc-fg .oc-3a-69 .g5a1{font-size:14px;}
  .oc-fg .oc-3a-69 .l9w2v{font-size:12px;}
}
</style>
</head>
<body>

<!-- Section 1: Header Logo Banner -->
<div class="m-icon">
  <span class="brand-logo-text">KHABARLINE.SITE</span>
  <span class="brand-sub-text">⚡ WORLD'S FASTEST VERIFIED SATTA MATKA HUB ⚡</span>
</div>

<!-- Section 2: Welcome Strip -->
<div style="margin-bottom: 1px; display: flex; padding: 5px 10px; align-items: center; justify-content: center; border-radius: 10px; border: 2px solid #ff182c; box-shadow: 0 0 20px 0 rgb(0 0 0 / 40%); background: #ffe4b5;">
  <p style="color: black; display: inline-block; font-size: 15px; font-weight: 800; margin: 0;">
    !! Welcome to khabarline.site !! Satta Matka Fast Result
  </p>
</div>

<!-- Section 3: Title & Intro -->
<div class="text2">
  <h1 style="font-size: 16px; color: #000; padding: 4px 0 2px;">Satta Matka Khabarline Kalyan Matka Result</h1>
  <h2 style="color: #000; font-size: 13px; font-weight: 600; line-height: 14px; text-shadow: none; padding: 0 6px 4px;">
    Khabarline.site is the No. 1 Matka Site welcomes you whole-heartedly. Here below you can find the perfect guess by the top guesser along with the Fast Matka Result too. Aaj Ka Satta Kalyan Fix Single Jodi free update here you find top Matka Market of India Kalyan Main Milan Rajdhani *kalyan Matka Tips *fast Matka Result *kalyan Main Rajdhani Matka Chart *Matka Guessing by KHABARLINE 143
  </h2>
</div>

<div role="main">

<!-- Section 4: Today Lucky Number (Golden Ank & Final Ank) -->
<div class="f-pti">
  <h3 style="margin-bottom: 2px;">Today Lucky Number</h3>
  <div class="dflex">
    <div class="j52g4" style="border-right: 1px solid #ff0016; width: 40%">
      <h4>Golden Ank</h4>
      <p id="goldenAnkVal">${state.goldenAnk}</p>
    </div>
    <div class="j52g4" style="width: 60%">
      <h4>Final Ank</h4>
      <div class="amthltg">
        <p id="finalAnkTicker">
          ${finalAnkHtml}
        </p>
      </div>
    </div>
  </div>
</div>

<!-- Section 5: Official Telegram Channel Card -->
<div style="background:#fff8dc;border:2px solid #f0b400;border-radius:14px;padding:10px 8px;margin: 0px 0px 4px 0px;text-align:center;box-shadow:0 2px 8px rgba(180,130,0,.15);">
  <div style="font-size:18px;font-weight:800;color:#9a6500;line-height:24px;">
    📢 Khabar Line Official Telegram Channel
  </div>
  <div style="font-size:14px;font-weight:700;color:#4a3a00;line-height:20px;margin:2px 0 9px;">
    ⚡ सबसे तेज़ Satta Matka Result Updates के लिए अभी Join करें
  </div>
  <a href="${state.telegramChannelUrl || 'https://t.me/result_juggler'}" target="_blank"
     style="display:inline-flex;align-items:center;justify-content:center;gap:6px;background:#0088cc;color:#fff;padding:8px 26px;border-radius:22px;text-decoration:none;font-size:15px;font-weight:800;line-height:20px;box-shadow:0 2px 6px rgba(0,136,204,0.35);border:1.5px solid #0077b5;">
    ✈️ Join Telegram Channel
  </a>
</div>

<!-- Section 6: LIVE RESULT (☔LIVE RESULT☔ 5-minute spotlight duplicates) -->
<div class="liv-rslt" id="liveResultBox" style="${liveCards.length === 0 ? 'display: none;' : ''}">
  <h4>☔LIVE RESULT☔</h4>
  <div class="lv-mc" id="liveResultContent">
    <div style="color: #000; font-size: 15px; font-weight: 800; padding: 2px 0 6px 0; letter-spacing: 0.5px;">Sabse Tezz Live Result Yahi Milega</div>
    ${liveResultHtml}
  </div>
</div>

<!-- Section 7: Sponsored Play App Download Ads / Monetized Application Promotion -->
${sponsoredAppsHtml}

<!-- Section 8: Keyword Marquee Strip -->
<div class="text3">
  KALYAN MATKA | MATKA RESULT | KALYAN MATKA TIPS | SATTA MATKA | MATKA.COM | MATKA PANA JODI TODAY | BATTA SATKA | MATKA PATTI JODI NUMBER | MATKAPANNA JODI TODAY | SATTA WEBSITE | MATKA NUMBER | SATTA MATKA SITE | SATTA TIMING
</div>

<!-- Section 9: 175+ Market Board in Exact DPBoss Sequence -->
<h4 class="flyr24" style="margin-top: 4px;">WORLD ME SABSE FAST SATTA MATKA RESULT</h4>
${marketBoxesHtml}

<!-- Section 10: Main Starline Matrix -->
<div class="my-table mr-sl">
  <h4>MAIN STARLINE</h4>
  <table>
    <thead>
      <tr>
        <th>Time</th>
        <th>Result</th>
        <th>Time</th>
        <th>Result</th>
      </tr>
    </thead>
    <tbody id="mainStarlineBody">
      ${mainStarlineRows}
    </tbody>
  </table>
</div>

<!-- Section 11: Mumbai Rajshree Starline Matrix -->
<div class="my-table mumraj-sl">
  <h4>Mumbai Rajshree Star Line Result</h4>
  <table>
    <thead>
      <tr>
        <th>Time</th>
        <th>Result</th>
        <th>Time</th>
        <th>Result</th>
      </tr>
    </thead>
    <tbody id="mumbaiRajshreeBody">
      ${rajshreeRows}
    </tbody>
  </table>
</div>

<!-- Section 12: Main Bombay 36 Bazar & Spin Wheel -->
<div class="my-table mr-sl" style="border: 1px solid red; margin: 5px 0px;">
  <h4>MAIN BOMBAY 36 BAZAR
    <a href="/jodi-chart-record/bombay-36" style="padding: 3px 5px 2px;height: auto;width: auto;float: right;margin: -1px 0px 0px 0;background-color: #000;border-radius: 5px;font-size: 14px;color: white;text-shadow: none;">Chart</a>
  </h4>

  <div class="wheel-section">
    <div class="wheel-container">
      <div class="spin-center-text" id="spinCenterText">${state.bombay36.activeValue}</div>
      <img src="/img/spinner.png" class="wheel-image" alt="Spinning Wheel">
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Time</th>
        <th>Result</th>
        <th>Time</th>
        <th>Result</th>
      </tr>
    </thead>
    <tbody id="bombay36TableBody">
      ${bombayTableRows}
    </tbody>
  </table>
</div>

<!-- Section 13: Khabarline API Banner -->
<div class="text2" style="margin-bottom:7px;font-size:14px;padding:7px;line-height:25px;background:#c4001a;color:#f9f9f9;text-align:center;">
  KHABARLINE API - World's Fastest Verified Satta Matka Result API<br>
  <a target="_blank" href="/api-docs" style="color:#fff;border:2px solid #fff;padding:6px 0;display:block;width:230px;margin:8px auto;border-radius:15px;background:#b3007a;text-decoration:none;font-weight:600;">
    🚀 Check Api Pricing 🚀
  </a>
  Realtime Quorum Verification, 100% Guaranteed Uptime & SSE Webhooks
</div>

<!-- Section 14: Special Game Zone -->
<div class="sky-23">
  <h4>Khabarline Special Game Zone</h4>
  <a href="#free-game">All Market Free Fix Game</a>
  <a href="#panna-chart">Ratan Khatri Fix Panel Chart</a>
  <a href="#trick-chart">Matka Final Number Trick Chart</a>
  <a href="#evergreen">EverGreen Trick Zone And Matka Tricks by Khabarline</a>
</div>

<!-- Section 15: Matka Jodi List -->
<div class="sky-23">
  <h4>Matka Jodi List</h4>
  <a href="#jodi-count">Matka Jodi Count Chart</a>
  <a href="#fix-open-close">Dhanvarsha Daily Fix Open To Close</a>
  <a href="#jodi-family">Matka Jodi Family Chart</a>
  <a href="#penal-count">Penal Count Chart</a>
  <a href="#penal-total">Penal Total Chart</a>
  <a href="#all-220">All 220 Card List</a>
</div>

<!-- Section 16: Aaj Kya Pass Hua -->
<div class="aaj-pass">
  <span class="hd1">AAJ KYA PASS HUA</span>
  <span class="hd2">Date :- ${currentDateStr}</span>
  <div id="aajPassBody">
    ${aajPassHtml}
  </div>
</div>

<!-- Section 17: Weekly Patti / Penal Chart -->
<div class="sun-col">
  <div>
    <h4>${state.weeklyPattiChart.title}</h4>
    ${weeklyPattiLinesHtml}
  </div>
  <div>
    <h4>${state.weeklyLineOpenClose.title}</h4>
    ${weeklyOpenCloseHtml}
  </div>
  <div>
    <h4>${state.weeklyJodiChart.title}</h4>
    ${weeklyJodiHtml}
  </div>
</div>

<!-- Section 18: Free Game Zone Open-Close -->
<div class="oc-fg" id="free-game">
  <h4>FREE GAME ZONE OPEN-CLOSE</h4>
  <p class="k2w5">✔DATE:↬ : ${currentDateStr} ↫ FREE GUESSING DAILY OPEN TO CLOSE FIX ANK</p>
  <div class="d1635">
    ${freeGameCards}
  </div>
</div>

<!-- Weekly Open-Close Matrices for Major Markets -->
<table width="100%" cellspacing="0" cellpadding="0" class="l-obj-giv">
  <tbody>
    <tr>
      <td colspan="9" class="v5a25">KALYAN / कल्याण</td>
    </tr>
    <tr>
      <td rowspan="2" class="v5a25-v4a5">सोम</td>
      <td rowspan="2" class="v5a25-v85b">3</td>
      <td>689</td>
      <td rowspan="2" class="v5a25-v85b">5</td>
      <td>366</td>
      <td rowspan="2" class="v5a25-v85b">7</td>
      <td>223</td>
      <td rowspan="2" class="v5a25-v85b">8</td>
      <td>666</td>
    </tr>
    <tr>
      <td>35</td>
      <td>53</td>
      <td>78</td>
      <td>87</td>
    </tr>
    <tr>
      <td rowspan="2" class="v5a25-v4a5">मंगल</td>
      <td rowspan="2" class="v5a25-v85b">2</td>
      <td>156</td>
      <td rowspan="2" class="v5a25-v85b">7</td>
      <td>467</td>
      <td rowspan="2" class="v5a25-v85b">8</td>
      <td>477</td>
      <td rowspan="2" class="v5a25-v85b">9</td>
      <td>333</td>
    </tr>
    <tr>
      <td>27</td>
      <td>72</td>
      <td>89</td>
      <td>98</td>
    </tr>
    <tr>
      <td rowspan="2" class="v5a25-v4a5">बुध</td>
      <td rowspan="2" class="v5a25-v85b">3</td>
      <td>779</td>
      <td rowspan="2" class="v5a25-v85b">7</td>
      <td>359</td>
      <td rowspan="2" class="v5a25-v85b">8</td>
      <td>134</td>
      <td rowspan="2" class="v5a25-v85b">9</td>
      <td>478</td>
    </tr>
    <tr>
      <td>37</td>
      <td>73</td>
      <td>89</td>
      <td>98</td>
    </tr>
    <tr>
      <td rowspan="2" class="v5a25-v4a5">गुरु</td>
      <td rowspan="2" class="v5a25-v85b">3</td>
      <td>779</td>
      <td rowspan="2" class="v5a25-v85b">5</td>
      <td>168</td>
      <td rowspan="2" class="v5a25-v85b">7</td>
      <td>133</td>
      <td rowspan="2" class="v5a25-v85b">9</td>
      <td>388</td>
    </tr>
    <tr>
      <td>35</td>
      <td>53</td>
      <td>79</td>
      <td>97</td>
    </tr>
    <tr>
      <td rowspan="2" class="v5a25-v4a5">शुक्र</td>
      <td rowspan="2" class="v5a25-v85b">5</td>
      <td>122</td>
      <td rowspan="2" class="v5a25-v85b">6</td>
      <td>277</td>
      <td rowspan="2" class="v5a25-v85b">7</td>
      <td>269</td>
      <td rowspan="2" class="v5a25-v85b">8</td>
      <td>189</td>
    </tr>
    <tr>
      <td>56</td>
      <td>65</td>
      <td>78</td>
      <td>87</td>
    </tr>
    <tr>
      <td rowspan="2" class="v5a25-v4a5">शनि</td>
      <td rowspan="2" class="v5a25-v85b">2</td>
      <td>138</td>
      <td rowspan="2" class="v5a25-v85b">5</td>
      <td>122</td>
      <td rowspan="2" class="v5a25-v85b">7</td>
      <td>467</td>
      <td rowspan="2" class="v5a25-v85b">9</td>
      <td>234</td>
    </tr>
    <tr>
      <td>25</td>
      <td>52</td>
      <td>79</td>
      <td>97</td>
    </tr>
  </tbody>
</table>

<table width="100%" cellspacing="0" cellpadding="0" class="l-obj-giv">
  <tbody>
    <tr>
      <td colspan="9" class="v5a25">KALYAN NIGHT / MAIN BAZAR</td>
    </tr>
    <tr>
      <td rowspan="2" class="v5a25-v4a5">सोम</td>
      <td rowspan="2" class="v5a25-v85b">3</td>
      <td>445</td>
      <td rowspan="2" class="v5a25-v85b">6</td>
      <td>169</td>
      <td rowspan="2" class="v5a25-v85b">8</td>
      <td>990</td>
      <td rowspan="2" class="v5a25-v85b">9</td>
      <td>360</td>
    </tr>
    <tr>
      <td>36</td>
      <td>63</td>
      <td>89</td>
      <td>98</td>
    </tr>
    <tr>
      <td rowspan="2" class="v5a25-v4a5">मंगल</td>
      <td rowspan="2" class="v5a25-v85b">3</td>
      <td>148</td>
      <td rowspan="2" class="v5a25-v85b">4</td>
      <td>158</td>
      <td rowspan="2" class="v5a25-v85b">5</td>
      <td>690</td>
      <td rowspan="2" class="v5a25-v85b">6</td>
      <td>556</td>
    </tr>
    <tr>
      <td>34</td>
      <td>43</td>
      <td>56</td>
      <td>65</td>
    </tr>
    <tr>
      <td rowspan="2" class="v5a25-v4a5">बुध</td>
      <td rowspan="2" class="v5a25-v85b">0</td>
      <td>127</td>
      <td rowspan="2" class="v5a25-v85b">5</td>
      <td>339</td>
      <td rowspan="2" class="v5a25-v85b">8</td>
      <td>189</td>
      <td rowspan="2" class="v5a25-v85b">9</td>
      <td>568</td>
    </tr>
    <tr>
      <td>05</td>
      <td>50</td>
      <td>89</td>
      <td>98</td>
    </tr>
    <tr>
      <td rowspan="2" class="v5a25-v4a5">गुरु</td>
      <td rowspan="2" class="v5a25-v85b">2</td>
      <td>246</td>
      <td rowspan="2" class="v5a25-v85b">5</td>
      <td>168</td>
      <td rowspan="2" class="v5a25-v85b">6</td>
      <td>222</td>
      <td rowspan="2" class="v5a25-v85b">7</td>
      <td>557</td>
    </tr>
    <tr>
      <td>25</td>
      <td>52</td>
      <td>67</td>
      <td>76</td>
    </tr>
    <tr>
      <td rowspan="2" class="v5a25-v4a5">शुक्र</td>
      <td rowspan="2" class="v5a25-v85b">1</td>
      <td>560</td>
      <td rowspan="2" class="v5a25-v85b">6</td>
      <td>259</td>
      <td rowspan="2" class="v5a25-v85b">8</td>
      <td>260</td>
      <td rowspan="2" class="v5a25-v85b">9</td>
      <td>568</td>
    </tr>
    <tr>
      <td>16</td>
      <td>61</td>
      <td>89</td>
      <td>98</td>
    </tr>
  </tbody>
</table>

<!-- Section 19: Satta Matka Jodi Chart Directory -->
<div class="sta-div sta-1">
  <h6>SATTA MATKA JODI CHART</h6>
  ${jodiDirectoryHtml}
</div>

<!-- Section 20: Satta Matka Panel Chart Directory -->
<div class="sta-div sta-1" style="margin-top: 5px;">
  <h6>SATTA MATKA PANEL CHART</h6>
  ${panelDirectoryHtml}
</div>

<!-- Section 21: FAQ Accordions (.qtn14) -->
<div class="qtn14">
  <h6>Frequently Asked Questions</h6>
  <div class="q-crd">
    <label><span>सट्टा मटका में जीतने के चांस कैसे बढ़ाएं?</span></label>
    <div class="g5v2a"><p>सट्टा मटका में जीतने के चांस को बढ़ाने के लिए नियमों को समझें, रुझानों का पालन करें, और हमेशा जिम्मेदार तरीके से खेलें।</p></div>
  </div>
  <div class="q-crd">
    <label><span>कल्याण मटका क्या होता है?</span></label>
    <div class="g5v2a"><p>कल्याण मटका भारत का सबसे लोकप्रिय सट्टा मटका बाजार है। इसमें ओपन और क्लोज सेशन के आधार पर सिंगल, जोड़ी, और पट्टी के नतीजे घोषित किए जाते हैं।</p></div>
  </div>
  <div class="q-crd">
    <label><span>मटका कैसे काम करता है?</span></label>
    <div class="g5v2a"><p>मटका में 0 से 9 के बीच तीन-तीन अंकों के सेट निकाले जाते हैं जिनके योग की अंतिम इकाई (Ank) और तीन अंकों के संयोजन (Patti) से फाइनल जोड़ी तैयार होती है।</p></div>
  </div>
  <div class="q-crd">
    <label><span>मटका के विशेष शब्द क्या हैं?</span></label>
    <div class="g5v2a"><p><b>सिंगल:</b> 0 से 9 तक का अकेला अंक।<br><b>जोड़ी:</b> 00 से 99 तक के दो अंकों का समूह।<br><b>पट्टी/पन्ना:</b> तीन अंकों का विशेष संयोजन जैसे 128, 570 आदि।</p></div>
  </div>
</div>

<!-- Section 22: Satta Matka SEO Articles (.be-stone) -->
<div class="be-stone">
  <div class="c-stone">WHAT IS SATTA MATKA?</div>
  <p>Satta Matka is a historical numbers guessing game that originated in the 1950s in Mumbai. Today, Khabarline.site provides the fastest automated verification, historical Jodi & Panel records, and real-time live result broadcasts across all 175+ Indian markets.</p>
  
  <div class="c-stone">HOW TO USE KHABARLINE LIVE RESULTS</div>
  <p>Our automated quorum engine continuously aggregates and cross-verifies results across multiple independent news feeds to deliver 100% accurate, sub-second declared numbers directly to your device.</p>
</div>

<!-- Section 23: SEO Content & Knowledgebase -->
<div class="seo-content-box">
  <h2>The Essentials: How the Classic Matka Game Works</h2>
  <p>Strip away the complex charts, and the core of the Matka game is a structured numerical calculation. Numbers are drawn, combined, and announced at specific intervals throughout the day. Tracking historical archives helps players understand market cycles.</p>
  
  <h3>Understanding Number Combinations (Patti & Jodi)</h3>
  <p>When three digits are chosen (e.g. 1, 5, 7), their sum is 13. The unit digit 3 becomes the single Ank, forming the Open Pana 157-3. When combined with the Close Session result, a full two-digit Jodi is established.</p>
  
<!-- Section 23b: DPBoss & Satta Matka Trending Keyword Indices -->
<div style="background: rgba(255, 255, 255, 0.7); border: 1.5px solid #d3003f; border-radius: 8px; padding: 8px 10px; margin: 6px auto; text-align: justify; font-size: 11px; line-height: 1.6; color: #1a1a1a;">
  <div style="font-weight: 800; font-size: 12px; color: #900; margin-bottom: 3px; text-transform: uppercase; letter-spacing: 0.5px;">
    ⚡ DPBoss Fast Result & Satta Matka Search Indices:
  </div>
  <p style="margin: 0; font-size: 11px; color: #222; text-shadow: none; font-weight: 600;">
    <b>DPBoss Hub:</b> dpboss.boston | dpboss fast result | dpboss result | dpboss net | dpboss mobi | dpboss 143 guessing | dpboss kalyan chart | dpboss panel chart | dpboss jodi record | dpboss live update | dpboss fix open close | dpboss golden ank | dpboss final ank | dpboss matka boss | satta matka dpboss 143 | dpboss online play | dpboss satta king | dpboss today guessing number | dpboss leak jodi | dpboss main bazar result | dpboss milan night chart | dpboss rajdhani night | dpboss time bazar | dpboss madhur morning | dpboss sridevi result | dpboss bombay 36 | khabarline fast matka result.
  </p>
</div>

<!-- Hidden Semantic Crawler Keywords for Deep Ranking -->
<div style="opacity: 0.001; height: 1px; width: 1px; overflow: hidden; position: absolute; pointer-events: none;" aria-hidden="true">
  dpboss boston dpboss.boston dpboss fast result dpboss result dpboss matka result dpboss satta matka dpboss net dpboss mobi dpboss 143 dpboss guessing dpboss kalyan dpboss panel chart dpboss jodi chart dpboss open close dpboss today result dpboss free guessing dpboss fix number dpboss leak chart dpboss live khabarline dpboss alternative dpboss official site dpboss mumbai dpboss main bazar dpboss rajdhani night dpboss milan day dpboss milan night dpboss kalyan night dpboss madhur day dpboss madhur night dpboss sridevi night dpboss time bazar chart dpboss supreme day dpboss tara matka dpboss batta satka dpboss matka 420 dpboss indian matka dpboss final ank record dpboss patti pana jodi records
</div>

<!-- Section 24: Legal & Disclaimer -->
<div class="dis12">
  <span>DISCLAIMER</span>
  <p>
    Viewing this website is on your own risk. All information shown on the website is sponsored and we warn that Matka gambling in your country may be banned or illegal. We are not responsible for any issues or scam. We respect all country rules/laws. If you disagree with our site disclaimer, please quit our site immediately.
  </p>
</div>

<div class="lst-sec">
  <p style="margin-bottom: 3px;">
    <a href="/about.php" style="color:#d3003f; margin:0 5px;">About Us</a> |
    <a href="/contact.php" style="color:#d3003f; margin:0 5px;">Contact Us</a> |
    <a href="/privacy.php" style="color:#d3003f; margin:0 5px;">Privacy Policy</a> |
    <a href="/tos.php" style="color:#d3003f; margin:0 5px;">Terms of Service</a> |
    <a href="/disclaimer.php" style="color:#d3003f; margin:0 5px;">Disclaimer</a>
  </p>
  <span style="font-size:12px; color:#555;">© 2026 Khabarline.site - All Rights Reserved.</span>
</div>

</div><!-- /role="main" -->

<!-- Floating Buttons -->
${isPromoEnabled ? `<a href="${primaryAppDownloadUrl}" target="_blank" class="mp-clk1" style="background:#0a8500; border: 1.5px solid #ffeb3b; font-weight: 800; box-shadow: 0 2px 8px rgba(0,0,0,0.4);">📲 Play App</a>` : ''}
<button onclick="window.location.reload()" class="btm-clk1-f clk1-rld" style="color:#fff;">REFRESH</button>

<!-- Live SSE Synchronization Client Script -->
<script>
(function() {
  if (typeof EventSource !== 'undefined') {
    var es = new EventSource('/api/live-stream');
    
    es.addEventListener('market_updated', function(e) {
      try {
        var market = JSON.parse(e.data);
        var resElem = document.getElementById('res-' + market.slug);
        if (resElem) {
          resElem.textContent = market.value;
          var parentBox = resElem.closest('div');
          if (parentBox) {
            parentBox.classList.add('flash-update');
            setTimeout(function() { parentBox.classList.remove('flash-update'); }, 2500);
          }
        }
        // Also update the live spotlight card at the top if present
        var liveRows = document.querySelectorAll('.live-market-row');
        for (var i = 0; i < liveRows.length; i++) {
          var row = liveRows[i];
          var mName = (row.getAttribute('data-market') || '').toUpperCase().trim();
          if (mName === market.name.toUpperCase().trim()) {
            var valElem = row.querySelector('.val-display');
            if (valElem) {
              valElem.textContent = market.value;
              valElem.style.color = '';
              valElem.style.fontStyle = 'normal';
              row.classList.add('flash-update');
              setTimeout(function() { row.classList.remove('flash-update'); }, 2500);
            }
          }
        }
      } catch (err) {}
    });

    es.addEventListener('live_markets_updated', function(e) {
      try {
        var data = JSON.parse(e.data);
        var liveBox = document.getElementById('liveResultBox');
        var liveContent = document.getElementById('liveResultContent');
        if (liveBox) {
          var displayList = data.displayList || data.liveItems || [];
          if (displayList.length === 0 && (!data.liveMarkets || data.liveMarkets.length === 0)) {
            liveBox.style.display = 'none';
          } else {
            liveBox.style.display = 'block';
            if (displayList.length > 0 && liveContent) {
              var newHtml = '<div style="color: #000; font-size: 15px; font-weight: 800; padding: 2px 0 6px 0; letter-spacing: 0.5px;">Sabse Tezz Live Result Yahi Milega</div>';
              for (var i = 0; i < displayList.length; i++) {
                var item = displayList[i];
                var mName = item.name || item.marketName || '';
                var val = item.value || 'Loading...';
                var isLoading = item.isLoading !== undefined ? item.isLoading : (val === 'Loading...' || val === '***-**-***' || val.indexOf('*-***') !== -1);
                newHtml += '<div class="live-market-row" data-market="' + mName + '">';
                newHtml += '<span class="h8">' + mName + '</span>';
                newHtml += '<span class="h9 val-display"' + (isLoading ? ' style="color:#00094d; font-style:italic;"' : '') + '>' + val + '</span>';
                if (item.badge) {
                  newHtml += '<span class="e-sprg">' + item.badge + '</span>';
                }
                newHtml += '<div style="margin-top:2px;"><button onclick="window.location.reload()" class="clk1-rld" style="font-size:11px; padding:3px 14px;">Refresh</button></div>';
                if (item.note) {
                  newHtml += '<p>' + item.note + '</p>';
                }
                newHtml += '</div>';
              }
              liveContent.innerHTML = newHtml;
            }
          }
        }
      } catch (err) {}
    });

    es.addEventListener('state_changed', function(e) {
      try {
        var stateData = JSON.parse(e.data);
        if (stateData.goldenAnk) {
          var ga = document.getElementById('goldenAnkVal');
          if (ga) ga.textContent = stateData.goldenAnk;
        }
        if (stateData.bombay36 && stateData.bombay36.activeValue) {
          var b36 = document.getElementById('bombay36Val');
          var sc = document.getElementById('spinCenterText');
          if (b36) b36.textContent = stateData.bombay36.activeValue;
          if (sc) sc.textContent = stateData.bombay36.activeValue;
        }
      } catch (err) {}
    });
  }
})();
</script>

</body>
</html>`;
}

export const renderKhabarlineHomePage = renderHomePage;

