# Project Memory: Result Bot Consensus Bridge & Multi-Bot Hub

## 1. System Overview & Executive Summary

The **Result Bot Consensus Bridge** is an enterprise-grade, high-concurrency cross-platform consensus verification and distribution engine running on Linux VPS (`200.234.32.227`).

### Core Missions:
1. **Multi-Source Ingestion**: Monitors real-time WhatsApp Channels and Groups, DPBoss live scraper, and Google Sheets 24/7 feeds.
2. **Quorum Verification Engine**: Verifies matching market results across **$\ge 2$ distinct independent owner entities** within a sliding **300-second (5-minute)** window.
3. **Anti-Collusion & Anti-Self-Verification**: Prevents two sources owned by the same entity (e.g. Prakash channel + Prakash group) from verifying each other.
4. **Market Whitelist Filtering ("Only Listed Markets")**: Ingests and processes results **only** for markets explicitly enabled on the admin whitelist; unlisted or disabled markets are dropped immediately at ingestion.
5. **Multi-Bot Destination Dispatching**: Dispatches verified results to distinct Telegram groups and channels, each using a **dedicated Telegram bot instance**, custom layouts, headers, footers, and interactive action buttons.
6. **Private Admin Web Dashboard**: Password-protected real-time control hub (`http://200.234.32.227:8095`) with live unverified queues, **[⚡ Force Verify & Broadcast]**, market toggles, and source quorum monitoring.
7. **1:1 DPBoss Replica Website (`khabarline.site` on `:8080`)**: Authentic, high-fidelity replica of DPBoss (`dpboss.boston` / `dpboss.tax`) with live 5-minute spotlight duplicates in `☔ LIVE RESULT ☔`, full 187+ market board, Starline matrices, Bombay 36 live spinner, Golden & Final Ank, and chart directories.

---

## 2. Monitored Sources & Owner Entity Partitioning

To guarantee absolute integrity and prevent false consensus, every incoming ingestion source is mapped to an **Owner Entity ID**:

| Ingestion Source | Type | Friendly Name | Owner Entity ID | Stream Status |
| :--- | :--- | :--- | :--- | :--- |
| `120363423323980137@newsletter` | Newsletter Channel | `PRAKASH FAST KHABAR` | `owner_prakash` | 🟢 Live Subscribed |
| `120363415048870536@g.us` | WhatsApp Group | `PRAKASH FAST RESULTS` | `owner_prakash` | 🟢 Monitored |
| `120363323865653524@g.us` | WhatsApp Group | `JUNGLEE RUMMY 5` | `owner_prakash` | 🟢 Monitored |
| `120363420755219338@newsletter` | Newsletter Channel | `LIVE KHABAR` | `owner_live_khabar` | 🟢 Live Subscribed |
| `120363404509728269@g.us` | WhatsApp Group | `KHABAR GROUP 1` | `owner_live_khabar` | 🟢 Monitored |
| `dpboss_boston@web` | Web Scraper | `DPBOSS.BOSTON LIVE SCRAPER` | `owner_dpboss` | 🟢 Active Poller (30s) |
| `google_sheets_scraper@sheet` | Cloud Spreadsheet | `GOOGLE SHEETS 24/7 SCRAPER` | `owner_web_scraper` | 🟢 Active Poller (30s) |

---

## 3. Consensus Verification & Routing Logic

### 3.1 Verification Rules:
- **Consensus Window**: 300 seconds (5 minutes, `timeWindowSeconds: 300`).
- **Quorum Requirement**: $\ge 2$ **Distinct Owner Entities** must report the identical market result.
  - ✅ `owner_prakash` (WhatsApp) + `owner_live_khabar` (WhatsApp) $\to$ **Verified**
  - ✅ `owner_prakash` (WhatsApp) + `owner_dpboss` (DPBoss Scraper) $\to$ **Verified**
  - ✅ `owner_prakash` (WhatsApp) + `owner_web_scraper` (Google Sheet) $\to$ **Verified**
  - ❌ `owner_prakash` (Channel) + `owner_prakash` (Group) $\to$ **Counts as 1 vote (Pending)**
- **Session Deduplication**: Sessions (`YYYY-MM-DD::MARKET::SESSION`) are unique per date in IST. Duplicate reports within 30 minutes (`dedupTtlSeconds: 1800`) are dropped.

### 3.2 Dispatch Routing:
| Destination Target | Routing Policy | Notes |
| :--- | :--- | :--- |
| **All Approved Telegram Destinations** | **STRICTLY `✅ Verified` ONLY** | Unverified results are **NEVER** broadcast to public Telegram channels or groups. |
| **Internal WhatsApp Destination** (`120363400760897120@g.us`) | `❌ Unverified` Alert after 300s window | Allows internal monitors to see pending/unverified items. |

### 3.3 Auto-Delete on Late Verification:
If a 2nd source confirms an unverified result after the 300s window:
1. The bridge deletes the `❌ Unverified` message from the WhatsApp destination.
2. Posts the clean `✅ Verified` message to WhatsApp.
3. Broadcasts the `✅ Verified` result to **ALL approved Telegram channels and groups**.

### 3.4 Instant 0ms Sync to Khabarline Website & Verified Result API:
Whenever a result is verified (either direct consensus on 1st pass, consensus upgrade when 2nd source arrives, admin force-verify, or manual broadcast), `khabarlineStore.updateMarketResult` is called synchronously at the top of the event handler before any asynchronous Telegram or WhatsApp network dispatches. This guarantees 0ms latency for all API queries (`/api/v1/gameResult`, `/api/results`) as soon as consensus is reached.

---

## 4. Locked Production Destinations & Dedicated Bot Registry

**Architecture Rule**: Every Telegram group/channel is assigned a **dedicated bot token** to maintain custom branding, names, avatars, and action buttons.

| Destination Chat ID | Destination Type & Name | Assigned Bot Display Name | Bot Username | Bot Token | Configured Layout & Buttons |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `-1004416894670` | **Channel:** `result juggler` | **Impact Creator** | [`@impactcreatorpersonalbot`](https://t.me/impactcreatorpersonalbot) | `8925702786:AAGAyAhW1EsROuFHe98ijHjQuE1RKuadWTg` | Main verified result channel & WhatsApp bridge listener (Default 3-line format) |
| `-1004451229868` | **Group 1:** `Telegram Matka India Official & Trusted Telegram Bookie` | **BROADCAST_BOT** | [`@HGTEAM02BOT`](https://t.me/HGTEAM02BOT) | `8885064215:AAFziPv4CbYeH6pkOy5QpPQLec6TEv0MHGY` | ⚡ Fastest Result Header<br>🎯 `{session} Result: {value}` Template<br>🎉 Round Settled Footer<br>👉 **Click Here to Play Now (`@TM_Player_000001_bot`) Button** |
| `-1004372351548` | **Group 2:** `PLAY ONLINE SATTA MATKA INDIA'S TRUSTED & OFFICIAL APPLICATION` | **POSMATKA** | [`@RESULTPOSMATKAbot`](https://t.me/RESULTPOSMATKAbot) | `8759291834:AAHtkfWxwzmWuYizw5Rrgaohyv_wjVgMBe8` | 🌟 POSMATKA Header<br>🎲 Live Result Update Template<br>🏆 POSMATKA Footer<br>🔗 **Register & Play Now Button** (`https://www.posmatka.com/login?tab=register&ref=89733`) |

### 4.1 Self-Healing & Dynamic Chat Migration (`migrate_to_chat_id`):
- **Supergroup Migration Resilience**: When a Telegram basic group upgrades to a supergroup, Telegram changes the chat ID (e.g. `-5472343583` $\to$ `-1004372351548`).
- **Automatic In-Flight Healing**:
  - `TelegramNotifier.broadcastVerifiedEvent` and `sendVerifiedEvent` detect Telegram API `err.parameters.migrate_to_chat_id` / `err.payload.parameters.migrate_to_chat_id`.
  - Automatically invokes `GroupApprovalService.migrateChatId(oldId, newId)`, which seamlessly moves all associated custom bot tokens, usernames, templates, headers, footers, and action buttons to the new supergroup ID.
  - Retries immediate message delivery to the new supergroup ID without dropped broadcasts.
- **Middleware Update Interception**: Telegram bot update middleware catches `message:migrate_to_chat_id` and `message:migrate_from_child_id` in real time.
- **Config Preservation on Re-Approval**: `GroupApprovalService.addApprovedChat` merges incoming updates with existing metadata so re-approving a group never wipes out dedicated bot tokens or custom templates.

---

## 5. Market Whitelist & Ingestion Filtering System

- **Persistence File**: `data/whitelisted_markets.json`
- **Filter Guard**: `ConsensusEngine.processPayload()` and `whatsAppClient.onMessage()` check `marketWhitelistService.isMarketEnabled(marketName)`.
- **Disabled Market Behavior**:
  - ⛔ Dropped immediately at parser level.
  - ⛔ Will **NOT** trigger any scraper verification cycles.
  - ⛔ Will **NOT** be verified or tracked in memory.
  - ⛔ Will **NOT** be dispatched to Telegram or WhatsApp.
- **Dynamic Control**: Real-time ON/OFF toggle switches via the Admin Dashboard.

---

## 6. Private Admin Web Dashboard Hub

- **Host & Port**: `http://200.234.32.227:8095`
- **Authentication**: Master password protection (`DASHBOARD_PASSWORD`, default `admin123`) with secure session tokens.
- **Real-Time Streaming**: Server-Sent Events (SSE) `/api/events` for instant live updates.

### Dashboard Modules & Tabs:
1. **🔴 Live Queue & [⚡ Force Verify & Broadcast]**:
   - Real-time stream of incoming unverified candidate results.
   - 1-click **[⚡ Force Verify & Broadcast]** button to immediately verify and broadcast to all 3 Telegram bots/groups.
   - **[❌ Dismiss]** button to discard bad candidate entries.
   - Dispatched results history stream.
2. **📋 Whitelisted Markets Manager**:
   - Searchable list of all 51+ markets.
   - 1-click switch toggles to enable/disable markets on the fly.
   - Bulk "Enable All" / "Disable All" controls.
   - "+ Add Market" to register new markets with custom timings.
3. **📡 Verification Sources & Quorum Matrix**:
   - Live status of all 5+ WhatsApp Channels & Groups.
   - Live status of DPBoss, Google Sheets, and Scraper-Hub on-demand engines.
   - Breakdown of independent owner entities and anti-collusion weights.
4. **🤖 Destination Bots & Groups**:
   - Status, masked tokens, and live previews of the 3 locked production templates.
5. **⚡ Manual Broadcast & Scraper Diagnostics**:
   - Emergency manual result entry tool.
   - 1-click on-demand website scraper trigger.

---

## 7. Khabarline.site Web Engine & Strict 1:1 DPBoss Replica (`src/khabarline/`)

### 7.1 Overview & Architecture
`khabarline.site` is an authentic, strict 1:1 ditto replica of DPBoss (`dpboss.boston` / `dpboss.tax` / `dpboss.net`).
- **Port & Host**: Runs on HTTP port `8080` (or `config.khabarline.port`).
- **Domain**: `khabarline.site` (Reverse proxied via Nginx / Cloudflare on VPS).
- **Core State Store**: `src/khabarline/store.ts` persisted at `data/khabarline_state.json`.
- **Live WebSocket/SSE Stream**: `/api/live-stream` broadcasting instantaneous updates for declared numbers, golden ank, final ank, and live promotion/demotion without page refreshes.

### 7.2 Strict 1:1 DPBoss Design & Anti-Fluff Policy
- **No Non-DPBoss Fluff**: Modern app additions like search inputs, filter chips, IST clock widgets, copy toast notifications, and middle promotional API banners are **strictly forbidden** and removed.
- **Authentic Section Hierarchy (Top-to-Bottom)**:
  1. `.m-icon`: 3D outset header banner with brand text.
  2. Welcome Strip: `#ffe4b5` banner (`!! Welcome to khabarline.site !! Satta Matka Fast Result`).
  3. `.text2`: `<h1>Satta Matka Khabarline Kalyan Matka Result</h1>` intro board.
  4. `.f-pti`: Today Lucky Number with **Golden Ank** (40% width) and **Final Ank** continuous vertical ticker (60% width with `.amthltg`).
  5. WhatsApp Channel Card: `#fff8dc` card with `#f0b400` border, `Join Now` button.
  6. `.liv-rslt`: 5-minute active **"☔ LIVE RESULT ☔"** box with `Sabse Tezz Live Result Yahi Milega`.
  7. `.text2.promo-box`: Deep red announcement box (`दुनिया को दिखाओ अपनी Guessing का जलवा...`) with `[Download App / Join]`.
  8. `.text3`: Striped gradient SEO keyword ticker.
  9. `.flyr24`: `WORLD ME SABSE FAST SATTA MATKA RESULT` pink flyer header.
  10. `.tkt-val`: Purple outset card chunks (`#aa00c0`), vivid yellow background (`.bg-ylw`) on major markets (Kalyan Morning, Milan Morning, Kalyan, Main Bazar, Milan Night, Rajdhani Night, etc.), left **Jodi** button (`.vl-clk`), and right **Panel** button (`.vl-clk-2`).
  11. `.my-table.mr-sl` & `.mumraj-sl`: Main Starline & Mumbai Rajshree Starline 2-column paired matrix tables with yellow header tabs and `Chart` links.
  12. **Main Bombay 36 Bazar**: Red box with live rotating SVG spinner wheel and slot result table.
  13. `.sky-23`: Dual Special Game Zone and Matka Jodi List boxes with animated text gradient (`@keyframes textclip`).
  14. `.aaj-pass`: "AAJ KYA PASS HUA" red box with daily passing strips.
  15. `.sun-col`: Weekly Patti / Penal Chart, Weekly Line Open-Close, Weekly Jodi Chart.
  16. `.oc-fg`: "FREE GAME ZONE OPEN-CLOSE" 4-card green guessing grid (`.g5a1`, `.l9w2v`).
  17. `.sta-div.sta-1`: 24-market Jodi & Panel chart link directories.
  18. `.qtn14` & `.be-stone`: Introduction FAQ accordions.
  19. `.seo-content-box` & `.dis12`: Essentials and Disclaimer.
  20. `.lst-sec`: Footer legal links (`/about.php`, `/contact.php`, `/privacy.php`, `/tos.php`, `/disclaimer.php`).
  21. Floating Buttons: Bottom Left `Guessing Forum` (`.mp-clk1`), Bottom Right `REFRESH` (`.btm-clk1-f`).

### 7.3 Core Matka Business Model: 5-Minute Duplicate Spotlight (`☔ LIVE RESULT ☔`)
- **Business Rule**: Market operators pay premium monthly fees (₹50,000–₹1,00,000/mo) to have their market featured in the top live box during their declaration window.
- **Duplicate Behavior**:
  - When result time arrives or a market is declared, a **duplicate spotlight card** appears in the top `.liv-rslt` box.
  - **The original market card in the main 187+ table below NEVER moves or shifts position**—it stays permanently fixed in its designated order.
  - **Pending Draw State**: Shows `Loading...`, the red Hindi alert **`खबर लाइन चालू है`**, and a `[Refresh]` button.
  - **Declared Draw State**: Shows the declared result (e.g. `129-2` or `789-54-130`) and a `[Refresh]` button.
  - **Auto-Demotion / Expiry**: After 5 minutes, the spotlight duplicate in `.liv-rslt` automatically disappears. The permanent market card in the main directory below reflects the final declared number.
  - If no markets are in an active draw window, the top live box collapses cleanly (`display: none`).

### 7.4 Live DPBoss Scraper & Automatic Synchronization (`src/services/dpbossScraper.ts`)
- Scrapes `https://dpboss.boston` / `https://dpboss.tax` every 30 seconds.
- Ingests all 187+ market timings (`openTime`, `closeTime`), live declared numbers, Golden Ank, Final Ank ticker entries, Starline matrices, and Bombay 36 slot numbers.
- Dynamic IST time parser (`parseTimeToMinute`) maps human time strings (e.g. `03:55 PM`) to numeric minutes (`955`) to ensure accurate automated promotion and demotion.

---

## 8. Verified Game Result External API & Developer Documentation (`src/services/resultApiService.ts`)

### 8.1 API Endpoints
- `GET /api/v1/gameResult` or `POST /api/v1/gameResult`
- `GET /api/gameResult` or `POST /api/gameResult`
- Developer Documentation & Pricing Tier portal: `GET /api-docs`

### 8.2 Authentication & Cryptographic Signatures
Supports direct API key (`apiKey` / `hashKey` / `Authorization: Bearer <key>`) or cryptographic signatures:
- **SHA256**: `sha256("${gameName}|${date}|${session}|${hashKey}")`
- **HMAC-SHA256**: `HMAC_SHA256(secretKey, "${gameName}|${date}|${session}")`
- **MD5**: `md5("${gameName}${date}${session}${hashKey}")`

### 8.4 Flexible Response Formatting: "Result" vs "Answer" Modes
- **Configurable per Market**: Each market can be configured to output either standard `"result"` or `"answer"` format in JSON responses.
- **Admin Dashboard Controls**:
  - In the Whitelisted Markets tab, clicking the `[📊 RESULT]` / `[🎯 ANSWER]` button switches the response format dynamically via `POST /api/markets/set-format`.
  - Clicking `[✏️ Enter Answer]` opens a prompt to set or edit the custom manual answer string via `POST /api/markets/set-answer`, saving `customAnswer` persistently in `data/whitelisted_markets.json`.
- **Strict Answer Mode Isolation Rules (`responseFormat: "answer"`)**:
  - **Status is Always `NOT_DECLARED`**: For any market set to Answer mode, the API **never** leaks scraped numbers or marks the market as declared/verified.
  - **Omission of Scraped Digits**: `openPana`, `openDigit`, `closeDigit`, `closePana`, and `jodi` are **completely suppressed/omitted** from the response payload.
  - **Manual Answer Value**: The `answer` and `fullResult` fields return the exact manual string set by the admin (`customAnswer`, e.g. `"BSRM"`), or `'***-**-***'` if not yet set.
  - `isDeclared`: `false`, `isVerified`: `false`, `status`: `"NOT_DECLARED"`.
- **Response Schemas**:
  - **Standard Market (`responseFormat: "result"`)**:
    ```json
    {
      "success": true,
      "code": "OK",
      "data": {
        "gameName": "KALYAN",
        "marketName": "KALYAN",
        "slug": "kalyan",
        "date": "2026-10-01",
        "session": "ALL",
        "status": "VERIFIED",
        "isDeclared": true,
        "isVerified": true,
        "result": "399-1",
        "responseFormat": "result",
        "openPana": "399",
        "openDigit": "1",
        "fullResult": "399-1",
        "openTime": "04:35 PM",
        "closeTime": "06:35 PM",
        "lastUpdated": "2026-10-01T12:24:32.197Z",
        "timestamp": 1790857482656
      }
    }
    ```
  - **Answer Market (`responseFormat: "answer"`)**:
    ```json
    {
      "success": true,
      "code": "OK",
      "data": {
        "gameName": "LEELA NIGHT",
        "marketName": "LEELA NIGHT",
        "slug": "leela-night",
        "date": "2026-10-01",
        "session": "ALL",
        "status": "NOT_DECLARED",
        "isDeclared": false,
        "isVerified": false,
        "answer": "BSRM",
        "responseFormat": "answer",
        "fullResult": "BSRM",
        "openTime": "11:00 AM",
        "closeTime": "01:00 PM",
        "lastUpdated": "2026-10-01T12:10:52.350Z",
        "timestamp": 1790857477775
      }
    }
    ```
- **Supported across all API endpoints**: `/api/v1/gameResult`, `/api/gameResult`, `/api/v1/results`, `/api/results`, `/api/market/:slugOrName`, and `/dpboss-result-api.php`.

---

## 9. Scraper Subsystems & Verification Feeds

### 9.1 DPBoss.boston Live Web Scraper (`src/services/dpbossScraper.ts`)
- Native HTML parser connecting to `https://dpboss.boston` / `https://dpboss.tax`.
- Polls every 30 seconds (`DPBOSS_POLL_INTERVAL_SEC=30`).
- Decomposes 3-phase numbers (`447-58-233`) into `OPEN` (`447-5`) and `CLOSE` (`8-233`).
- **Accelerated Polling**: Candidate results trigger instant accelerated retry polling (+10s, +30s, +60s, +120s, +180s) to achieve rapid consensus.

### 9.2 Google Sheets 24/7 Verification Stream (`src/services/sheets.ts`)
- Connects to production spreadsheet `1H9C8oqVNoUcux0a6Us81QoC5jGqsFUbmM1lzOBg7mAE`.
- Synchronized polling at 30s intervals and 5-minute scraper cycles (offset 88s).

---

## 10. Admin Hub, Master Credentials & Subdomain Reverse Proxy

- **Direct VPS Access**: `http://200.234.32.227:8095`
- **Subdomain URL**: `https://admin.khabarline.site/4.3.2.1` (Proxied via VPS Caddy container to `172.19.0.1:8095` with auto-SSL; Hostinger DNS A-record `admin` $\to$ `200.234.32.227`).
- **Master Admin Password**: `:Az|l)|J0NY|.cU:`
- **Config & Persistence**: `config.json` (`dashboard.password`) and `.env` (`DASHBOARD_PASSWORD`).

---

## 11. Play App Promotions & Official Social Channels

### 11.1 Play App Banner & Download Links
- **Primary Play App Download Link**: `https://bharatmatka.com/`
- **Headline**: `🎰 सबसे भरोसेमंद Bharat Matka Play App 🎰`
- **Subheadline**: `⚡ 1 मिनट में Fast Auto Deposit & 24x7 Instant Withdrawal • 100% Safe & Trusted`
- **Payout Rates**: `🎯 Single Ank 10 का 100 • Jodi 10 का 1000 • Single Patti 10 का 1600`
- **Floating Button**: Bottom Left `📲 Play App` (`.mp-clk1`) points to `https://bharatmatka.com/`.
- **Promotion Inquiries**: `https://bharatmatka.com/`
- **Legacy Cleanup**: Old fallback `star-kalyan.apk` (R2 dev URL) has been purged from state and template logic.

### 11.2 Official Community Channel (Telegram Only)
- **Telegram Channel**: "Khabar Line Chalu Hai" (`https://t.me/result_juggler`).
- **Placement**:
  - Section 5 (above `☔ LIVE RESULT ☔`): `#fff8dc` card with `📢 Khabar Line Official Telegram Channel` and blue `✈️ Join Telegram Channel` button (`#0088cc`).
  - Top Navigation Bar on subpages (`/jodi-chart-record/*`, `/panel-chart-record/*`, `/api-docs`).
  - Contact Us (`/contact.php`) and About Us (`/about.php`).
### 11.3 App Promotion Visibility Toggle (`showAppPromotion`)
- **Dashboard Control**: Added a master toggle switch in the admin dashboard (`#khabarlinePromoEnabledToggle`) to turn off/on all app promotion display across `khabarline.site`.
- **State Property**: `KhabarlineState.showAppPromotion` (boolean, defaults to `true`).
- **Effect when turned OFF**:
  - Hides the primary top Play App banner (`.promo-box`).
  - Hides any secondary sponsored play app cards (`.play-app-card`).
  - Hides the bottom-left floating `📲 Play App` button (`.mp-clk1`).
  - Allows Khabarline to run as a clean result & chart portal with zero app advertising when desired.

### 11.4 6 Special Markets & BharatMatka Chart Scraping Integration
- **Markets Added**:
  1. `SITARANI MORNING` (`sitarani-morning`) - 09:40 AM &rarr; 10:40 AM
  2. `SITARA MORNING` (`sitara-morning`) - 10:10 AM &rarr; 11:10 AM
  3. `SITARANI DAY` (`sitarani-day`) - 01:40 PM &rarr; 02:40 PM
  4. `SITARA DAY` (`sitara-day`) - 02:15 PM &rarr; 03:15 PM
  5. `SITARA NIGHT` (`sitara-night`) - 07:20 PM &rarr; 08:20 PM
  6. `SITARANI NIGHT` (`sitarani-night`) - 08:30 PM &rarr; 09:30 PM
- **Historical Chart Source**: `https://bharatmatka.com`
  - All 12 charts (6 Jodi + 6 Panel) are dynamically scraped from their authentic UUID endpoints, parsed into DPBoss-compatible table structures, and cached to local disk (`data/charts_cache/`).
  - Seamlessly styled with DPBoss responsive red-pair fonts and grid borders.
- **Manual Dashboard Result & Time Editor**:
  - Dedicated dashboard card: `🎯 6 Special Markets (Sitara & Sitarani) Result & Chart Manager`.
  - Admins can instantly enter and publish results (`value`), adjust open/close times, and trigger a one-click re-sync of all 12 charts (`POST /api/khabarline/sync-bharatmatka-charts`).

---

## 12. SEO, Google Search Console & DPBoss Search Query Capture

1. **Google Search Console Verification & Sitemaps**:
   - `https://khabarline.site/sitemap.xml`: Auto-generated XML sitemap index with 367 dynamic URLs (homepage, 180+ Jodi chart routes, 180+ Panel chart routes, `/api-docs`, static pages).
   - `https://khabarline.site/robots.txt`: Comprehensive crawler directives with direct Sitemap declaration.
2. **JSON-LD Schema.org Structured Data**:
   - `WebSite` schema with `alternateNames`: `DPBoss`, `DPBoss Boston`, `DPBoss Fast Result`, `DPBoss Satta Matka`, `DPBoss 143`, `Khabarline DPBoss`.
   - `Organization` schema.
   - `FAQPage` schema answering common search queries on DPBoss results and Kalyan charts.
   - `BreadcrumbList` schemas on all Jodi and Panel chart record pages.
3. **Legacy DPBoss 301 URL Redirects**:
   - Automatic 301 permanent redirects in `server.ts` for legacy query patterns (`/dpboss-matka.php`, `/kalyan-panel-chart.html`, etc.) preserving search engine link equity.

---

## 13. Developer API Master Key & Integration

- **Master Secret Key**: `124f2c24975404e3384952b0ede054c63c4d5bcd1f1a29158d9583fc66deae85`
- **Endpoints**:
  - `GET /api/v1/gameResult?gameName=KALYAN&session=OPEN&hashKey=124f2c24975404e3384952b0ede054c63c4d5bcd1f1a29158d9583fc66deae85`
  - `GET /api/v1/gameResult?gameName=KALYAN&session=CLOSE&hashKey=124f2c24975404e3384952b0ede054c63c4d5bcd1f1a29158d9583fc66deae85`
  - `GET /api/v1/gameResult?gameName=KALYAN&session=JODI&hashKey=124f2c24975404e3384952b0ede054c63c4d5bcd1f1a29158d9583fc66deae85`
- **Documentation**: Live interactive console and documentation at `https://khabarline.site/api-docs`.

---

## 14. Strict Production Constraints & Operating Rules

1. **⚠️ NEVER SEND TEST MESSAGES TO TELEGRAM CHANNELS/GROUPS**: All destinations are live in production with real communities.
2. **Dedicated Bot per Group**: Maintain separate bot tokens and custom templates in `data/approved_chats.json`.
3. **Whitelist Authority**: The whitelist in `data/whitelisted_markets.json` is the sole source of truth for broadcasted markets.
4. **No Non-DPBoss Fluff on Frontend**: Keep Khabarline UI strictly identical to DPBoss.boston without search bars, filter chips, or extraneous widgets.
5. **No Static Market Locking**: The top `☔ LIVE RESULT ☔` box is dynamic; market spotlight duplicates expire strictly after 5 minutes, while original cards below remain permanent.

---

## 15. VPS Production Environment & Operational Commands

- **VPS IP**: `200.234.32.227` (`srv1892911`)
- **User**: `root`
- **Working Directory**: `/root/consensus-bridge`
- **Systemd Service**: `consensusbridge.service`
- **Admin Dashboard Port**: `8095` (proxied to `admin.khabarline.site`)
- **Khabarline Port**: `8080` (proxied to `khabarline.site`)
- **Reverse Proxy**: Docker Caddy (`tm_caddy`) on `matka_ecosystem_default` network

### Common Operations:
```bash
# Check service status
systemctl status consensusbridge

# View live real-time logs
journalctl -u consensusbridge -f

# Restart service
systemctl restart consensusbridge

# Rebuild TypeScript locally & deploy
npm run build && rsync -avz dist/ root@200.234.32.227:/root/consensus-bridge/dist/ && ssh root@200.234.32.227 "systemctl restart consensusbridge"
```
