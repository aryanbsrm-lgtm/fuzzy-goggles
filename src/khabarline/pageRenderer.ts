import { KhabarlineState } from './types.js';

function getCommonHeader(state: KhabarlineState, pageTitle: string): string {
  return `
    <div class="m-icon">
      <a href="/" style="text-decoration: none;">
        <span class="brand-logo-text">KHABARLINE.SITE</span>
        <span class="brand-sub-text">⚡ WORLD'S FASTEST VERIFIED SATTA MATKA HUB ⚡</span>
      </a>
    </div>
    <div class="nav-bar">
      <a href="/" class="nav-btn">🏠 Home</a>
      <a href="/jodi-chart-record/kalyan" class="nav-btn">📊 Jodi Charts</a>
      <a href="/panel-chart-record/kalyan" class="nav-btn">📈 Panel Charts</a>
      <a href="/api-docs" class="nav-btn api-nav-btn">🚀 Result API</a>
      <a href="${state.telegramChannelUrl}" target="_blank" class="nav-btn tg-nav-btn">✈️ Telegram Channel</a>
    </div>
  `;
}

function getCommonFooter(): string {
  return `
    <div class="pow-13">POWERED BY KHABARLINE.SITE</div>
    <div class="lst-sec" role="contentinfo">
      <p>
        &copy; 2026 khabarline.site - All Rights Reserved.<br>
        <a href="/">Home</a> | 
        <a href="/about.php">About Us</a> | 
        <a href="/contact.php">Contact Us</a> | 
        <a href="/privacy.php">Privacy Policy</a> | 
        <a href="/tos.php">Terms & Conditions</a> | 
        <a href="/disclaimer.php">Disclaimer</a> | 
        <a href="/api-docs">Developer API</a>
      </p>
    </div>
  `;
}

const commonStyles = `
  html { overflow-x: hidden; scroll-behavior: smooth; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background-color: #fc9;
    color: #000;
    text-align: center;
    padding: 6px 12px;
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-weight: 600;
  }
  a { text-decoration: none; color: #0013a5; }
  a:hover { text-decoration: underline; }
  .m-icon {
    background: #fc9;
    padding: 8px 12px;
    display: block;
    margin-bottom: 6px;
    letter-spacing: 1px;
    font-weight: 800;
    border: 3px solid #ff0016;
    border-radius: 12px;
    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
  }
  .brand-logo-text {
    font-size: 28px;
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
    font-weight: 700;
    letter-spacing: 0.5px;
  }
  .nav-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    justify-content: center;
    margin-bottom: 10px;
  }
  .nav-btn {
    background: #522f92;
    color: #fff;
    padding: 6px 12px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 700;
    border: 1.5px solid #fff;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    transition: all 0.2s;
    text-decoration: none;
    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
  }
  .nav-btn:hover {
    background: #6a3fb8;
    transform: translateY(-1px);
    color: #fff;
    text-decoration: none;
  }
  .api-nav-btn { background: #b3007a; }
  .api-nav-btn:hover { background: #d1008f; }
  .tg-nav-btn { background: #0088cc; }
  .tg-nav-btn:hover { background: #00a2f2; }
  .wa-nav-btn { background: #25d366; color: #000; font-weight: 800; }
  .wa-nav-btn:hover { background: #20ba59; color: #000; }
  .page-box {
    background: #fff8dc;
    border: 2px solid #ff0016;
    border-radius: 12px;
    padding: 18px 20px;
    margin: 10px auto;
    max-width: 900px;
    text-align: left;
    box-shadow: 0 4px 20px rgba(0,0,0,0.2);
    font-weight: 500;
    line-height: 1.6;
    color: #111;
  }
  .page-box h1 {
    font-size: 24px;
    color: #d3003f;
    margin-bottom: 12px;
    border-bottom: 2px solid #ff0016;
    padding-bottom: 6px;
    text-align: center;
    font-weight: 800;
  }
  .page-box h2 {
    font-size: 18px;
    color: #000b65;
    margin: 18px 0 8px;
    font-weight: 700;
  }
  .page-box h3 {
    font-size: 15px;
    color: #431080;
    margin: 12px 0 6px;
    font-weight: 700;
  }
  .page-box p {
    font-size: 14px;
    margin-bottom: 12px;
    color: #222;
  }
  .page-box ul, .page-box ol {
    margin: 0 0 14px 24px;
    font-size: 14px;
  }
  .page-box li {
    margin-bottom: 6px;
  }
  .highlight-card {
    background: #fff;
    border: 1.5px solid #0013a5;
    border-radius: 8px;
    padding: 12px 14px;
    margin: 12px 0;
    box-shadow: inset 0 0 8px rgba(0,19,165,0.05);
  }
  .code-snippet {
    background: #1e1e2e;
    color: #f8f8f2;
    padding: 12px 14px;
    border-radius: 8px;
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    font-size: 13px;
    overflow-x: auto;
    margin: 8px 0 14px;
    border: 1px solid #444;
    white-space: pre;
    position: relative;
  }
  .copy-code-btn {
    position: absolute;
    top: 6px;
    right: 8px;
    background: #522f92;
    color: #fff;
    border: 1px solid #aaa;
    border-radius: 4px;
    padding: 3px 8px;
    font-size: 11px;
    cursor: pointer;
  }
  .copy-code-btn:hover { background: #ff0016; }
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 700;
    color: #fff;
  }
  .badge-get { background: #00875a; }
  .badge-post { background: #0052cc; }
  .badge-live { background: #ff0016; animation: pulse 1.5s infinite; }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }
  .table-responsive {
    overflow-x: auto;
    margin: 12px 0;
  }
  table.api-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    background: #fff;
  }
  table.api-table th, table.api-table td {
    border: 1px solid #ccc;
    padding: 8px 10px;
    text-align: left;
  }
  table.api-table th {
    background: #522f92;
    color: #fff;
    font-weight: 700;
  }
  table.api-table tr:nth-child(even) {
    background: #fdfbf7;
  }
  .pow-13 {
    text-shadow: 1px 1px #fff;
    color: #000;
    padding: 6px 0;
    font-size: 14px;
    font-weight: 800;
  }
  .lst-sec {
    background: #ffe4b5;
    border: 2px solid #ff182c;
    border-radius: 10px;
    padding: 10px;
    margin: 8px auto 12px;
    max-width: 900px;
    box-shadow: 0 0 15px rgba(0,0,0,0.15);
  }
  .lst-sec p {
    color: #a50031;
    font-size: 12px;
    line-height: 1.6;
    font-weight: 700;
  }
  .lst-sec a {
    color: #000b65;
    font-weight: 700;
    margin: 0 4px;
  }
  .interactive-console {
    background: #f4f0ff;
    border: 2px solid #522f92;
    border-radius: 10px;
    padding: 14px;
    margin: 14px 0;
  }
  .console-input-group {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 10px;
  }
  .console-input-group input, .console-input-group select {
    padding: 8px 12px;
    border: 1.5px solid #522f92;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    flex: 1;
    min-width: 140px;
  }
  .console-btn {
    background: #ff0016;
    color: #fff;
    border: none;
    border-radius: 6px;
    padding: 8px 18px;
    font-size: 13px;
    font-weight: 800;
    cursor: pointer;
    transition: background 0.2s;
  }
  .console-btn:hover { background: #cc0012; }
  .toast-alert {
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #000b65;
    color: #ffeb3b;
    padding: 10px 18px;
    border-radius: 8px;
    border: 1.5px solid #ff0016;
    box-shadow: 0 4px 15px rgba(0,0,0,0.3);
    font-size: 13px;
    font-weight: 700;
    display: none;
    z-index: 999999;
  }
`;

export function renderApiDocsPage(state: KhabarlineState): string {
  return `<!DOCTYPE html>
<html lang="en-in">
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
<title>Khabarline Satta Matka Result API Documentation | Fast & Verified</title>
<meta name="description" content="Official developer documentation for Khabarline.site Verified Game Result API. Query live results, historical data, jodi, and patti with Hash Key & Signature Authentication.">
<style>${commonStyles}</style>
</head>
<body>

${getCommonHeader(state, 'Developer API')}

<div class="page-box">
  <h1>🚀 KHABARLINE VERIFIED GAME RESULT API</h1>
  
  <p>
    Welcome to the <strong>Khabarline.site High-Speed Game Result API</strong>. Our API is engineered for bookmakers, high-frequency apps, and web portals requiring real-time, quorum-verified Matka results with zero latency and 99.99% guaranteed uptime.
  </p>

  <div class="highlight-card" style="background:#eef9ff; border-color:#0070f3;">
    <h3 style="color:#0070f3; margin-top:0;">⚡ Key Capabilities</h3>
    <ul style="margin-bottom:0;">
      <li><strong>Sub-Millisecond Response Times:</strong> Powered by in-memory caching and zero-allocation parsing.</li>
      <li><strong>Flexible Result Slicing:</strong> Retrieve <code>OPEN</code>, <code>CLOSE</code>, <code>JODI</code>, or complete <code>ALL</code> results with a single parameter.</li>
      <li><strong>Multi-Method Authentication:</strong> Supports Direct Hash Key tokens, HTTP Headers, and Cryptographic SHA256/HMAC Signatures.</li>
      <li><strong>187+ Markets Supported:</strong> Kalyan, Main Bazar, Milan Night, Rajdhani, Sridevi, Starline, and regional markets.</li>
    </ul>
  </div>

  <h2>🔑 Authentication Methods</h2>
  <p>Every request to the result API can be authenticated using any of the following 3 secure methods:</p>

  <div class="table-responsive">
    <table class="api-table">
      <thead>
        <tr>
          <th>Method</th>
          <th>Location</th>
          <th>Example</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>1. Header Token</strong></td>
          <td><code>X-Api-Key</code> or <code>Authorization: Bearer</code></td>
          <td><code>X-Api-Key: khabarline_live_prod_key_2026</code></td>
        </tr>
        <tr>
          <td><strong>2. Parameter Token</strong></td>
          <td>Query Parameter or JSON Body</td>
          <td><code>?hashKey=khabarline_live_prod_key_2026</code> or <code>?apiKey=...</code></td>
        </tr>
        <tr>
          <td><strong>3. Cryptographic Signature</strong></td>
          <td><code>signature</code> Query/Body Field</td>
          <td><code>signature=SHA256(gameName|date|session|hashKey)</code></td>
        </tr>
      </tbody>
    </table>
  </div>

  <h2>📡 Core Endpoint: <code>/api/v1/gameResult</code></h2>
  <p><span class="badge badge-get">GET</span> <span class="badge badge-post">POST</span> <code>https://${state.domain}/api/v1/gameResult</code></p>
  
  <h3>Query / Body Parameters:</h3>
  <div class="table-responsive">
    <table class="api-table">
      <thead>
        <tr>
          <th>Parameter</th>
          <th>Type</th>
          <th>Required</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><code>gameName</code></td>
          <td>String</td>
          <td><strong>Yes</strong></td>
          <td>Name of market (e.g. <code>KALYAN</code>, <code>MAIN BAZAR</code>, <code>MILAN NIGHT</code>, <code>SRIDEVI</code>). Case-insensitive.</td>
        </tr>
        <tr>
          <td><code>date</code></td>
          <td>String</td>
          <td>No</td>
          <td>Target date in <code>YYYY-MM-DD</code> or <code>DD-MM-YYYY</code> format. Defaults to today (IST).</td>
        </tr>
        <tr>
          <td><code>session</code></td>
          <td>String</td>
          <td>No</td>
          <td><code>OPEN</code>, <code>CLOSE</code>, <code>JODI</code>, or <code>ALL</code> (default).</td>
        </tr>
        <tr>
          <td><code>hashKey</code></td>
          <td>String</td>
          <td>Conditional</td>
          <td>Your secret API Hash Key (if not provided via header).</td>
        </tr>
        <tr>
          <td><code>signature</code></td>
          <td>String</td>
          <td>Conditional</td>
          <td>SHA256 / HMAC hash of <code>\${gameName}|\${date}|\${session}|\${hashKey}</code>.</td>
        </tr>
      </tbody>
    </table>
  </div>

  <h2>💡 Example Requests & Responses</h2>

  <h3>1. Slicing Session = OPEN</h3>
  <p>Returns only the 3-digit Open Pana and Open Single Digit.</p>
  <div class="code-snippet">
<button class="copy-code-btn" onclick="copySnippet(this)">Copy cURL</button>curl -X GET "https://${state.domain}/api/v1/gameResult?gameName=KALYAN&session=OPEN&hashKey=YOUR_KEY"
  </div>
  <div class="code-snippet" style="background:#111b27; color:#85e89d;">
// Response (200 OK)
{
  "success": true,
  "gameName": "KALYAN",
  "date": "${new Date().toISOString().slice(0, 10)}",
  "session": "OPEN",
  "result": "156-2",
  "openPana": "156",
  "openDigit": "2",
  "isVerified": true,
  "status": "DECLARED"
}
  </div>

  <h3>2. Slicing Session = JODI</h3>
  <p>Returns the 2-digit Jodi result.</p>
  <div class="code-snippet">
<button class="copy-code-btn" onclick="copySnippet(this)">Copy cURL</button>curl -X GET "https://${state.domain}/api/v1/gameResult?gameName=KALYAN&session=JODI&hashKey=YOUR_KEY"
  </div>
  <div class="code-snippet" style="background:#111b27; color:#85e89d;">
// Response (200 OK)
{
  "success": true,
  "gameName": "KALYAN",
  "date": "${new Date().toISOString().slice(0, 10)}",
  "session": "JODI",
  "result": "27",
  "jodi": "27",
  "isVerified": true,
  "status": "DECLARED"
}
  </div>

  <h3>3. Full Result (Session = ALL)</h3>
  <div class="code-snippet">
<button class="copy-code-btn" onclick="copySnippet(this)">Copy cURL</button>curl -X POST "https://${state.domain}/api/v1/gameResult" \\
  -H "Content-Type: application/json" \\
  -H "X-Api-Key: YOUR_KEY" \\
  -d '{"gameName": "KALYAN", "session": "ALL"}'
  </div>
  <div class="code-snippet" style="background:#111b27; color:#85e89d;">
// Response (200 OK)
{
  "success": true,
  "gameName": "KALYAN",
  "date": "${new Date().toISOString().slice(0, 10)}",
  "session": "ALL",
  "result": "156-27-133",
  "openPana": "156",
  "openDigit": "2",
  "closeDigit": "7",
  "closePana": "133",
  "jodi": "27",
  "isVerified": true,
  "status": "DECLARED"
}
  </div>

  <h2>🧪 Interactive Live API Tester</h2>
  <div class="interactive-console">
    <h3>Test API Live in Browser:</h3>
    <div class="console-input-group">
      <input type="text" id="testGameName" value="KALYAN" placeholder="Market Name (e.g. KALYAN)" />
      <select id="testSession">
        <option value="ALL">Session: ALL</option>
        <option value="OPEN">Session: OPEN</option>
        <option value="CLOSE">Session: CLOSE</option>
        <option value="JODI">Session: JODI</option>
      </select>
      <input type="text" id="testDate" value="${new Date().toISOString().slice(0, 10)}" placeholder="YYYY-MM-DD" />
      <button class="console-btn" onclick="runApiTest()">⚡ Execute Request</button>
    </div>
    <div id="testOutput" class="code-snippet" style="background:#0d1117; color:#58a6ff; display:none; max-height:260px; overflow-y:auto;"></div>
  </div>

  <h2>💰 API Plans & Commercial Access</h2>
  <p>Need high-throughput commercial access for your betting platform, automated Telegram bot, mobile app, or want to list your market?</p>
  <div style="display:flex; flex-wrap:wrap; gap:12px; margin-top:10px;">
    <div style="flex:1; min-width:200px; background:#fff; border:2px solid #00875a; border-radius:10px; padding:12px; text-align:center;">
      <h3 style="color:#00875a;">🌱 Free Sandbox</h3>
      <p style="font-size:20px; font-weight:900; color:#00875a; margin:6px 0;">₹0 / Free</p>
      <p style="font-size:12px;">50 test req/day<br>Historical Charts<br>Community Support</p>
    </div>
    <div style="flex:1; min-width:200px; background:#fff; border:2px solid #522f92; border-radius:10px; padding:12px; text-align:center;">
      <h3 style="color:#522f92;">🚀 Starter Bot</h3>
      <p style="font-size:20px; font-weight:900; color:#d3003f; margin:6px 0;">₹1,999 / mo</p>
      <p style="font-size:12px;">Up to 50,000 req/day<br>All 187+ Markets<br>Telegram Support</p>
    </div>
    <div style="flex:1; min-width:200px; background:#fff; border:2px solid #ff0016; border-radius:10px; padding:12px; text-align:center; box-shadow:0 4px 12px rgba(255,0,22,0.15);">
      <h3 style="color:#ff0016;">⚡ Bookmaker Pro</h3>
      <p style="font-size:20px; font-weight:900; color:#d3003f; margin:6px 0;">₹4,999 / mo</p>
      <p style="font-size:12px;">Unlimited Requests<br>SSE Live Push Stream<br>100% Quorum Consensus<br>24/7 Priority Support</p>
    </div>
    <div style="flex:1; min-width:200px; background:#fff8dc; border:2.5px solid #f0b400; border-radius:10px; padding:12px; text-align:center; box-shadow:0 4px 14px rgba(240,180,0,0.25);">
      <h3 style="color:#9a6500;">👑 Enterprise Listing</h3>
      <p style="font-size:20px; font-weight:900; color:#b3007a; margin:6px 0;">₹1,00,000 / mo</p>
      <p style="font-size:12px; color:#333;"><strong>Official Market Listing</strong><br>5-Min Top Live Spotlight<br>WhatsApp &amp; TG Promo<br>Dedicated Server Node</p>
    </div>
  </div>

  <div style="text-align:center; margin-top:16px;">
    <a href="${state.telegramChannelUrl}" target="_blank" class="nav-btn tg-nav-btn" style="font-size:15px; padding:8px 24px;">
      📲 Contact Admin on Telegram For API Key &amp; Market Listing
    </a>
  </div>
</div>

<div class="toast-alert" id="toastAlert">✓ Copied to clipboard!</div>

${getCommonFooter()}

<script>
function showToast(msg) {
  var t = document.getElementById('toastAlert');
  if (t) {
    t.textContent = msg || '✓ Copied!';
    t.style.display = 'block';
    setTimeout(function() { t.style.display = 'none'; }, 2500);
  }
}

function copySnippet(btn) {
  var parent = btn.parentElement;
  var text = parent.innerText.replace('Copy cURL', '').trim();
  navigator.clipboard.writeText(text).then(function() {
    showToast('✓ cURL command copied!');
  });
}

function runApiTest() {
  var game = document.getElementById('testGameName').value || 'KALYAN';
  var sess = document.getElementById('testSession').value || 'ALL';
  var date = document.getElementById('testDate').value || '';
  var out = document.getElementById('testOutput');

  out.style.display = 'block';
  out.textContent = 'Fetching live data from /api/v1/gameResult...';

  var url = '/api/v1/gameResult?gameName=' + encodeURIComponent(game) + '&session=' + encodeURIComponent(sess) + (date ? '&date=' + encodeURIComponent(date) : '');
  fetch(url)
    .then(function(res) { return res.json(); })
    .then(function(json) {
      out.textContent = JSON.stringify(json, null, 2);
    })
    .catch(function(err) {
      out.textContent = 'Error: ' + err.message;
    });
}
</script>

</body>
</html>`;
}

export function renderAboutPage(state: KhabarlineState): string {
  return `<!DOCTYPE html>
<html lang="en-in">
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
<title>About Us | Khabarline.site - World's Fastest Matka Results</title>
<meta name="description" content="Learn about Khabarline.site, India's most trusted and fastest verified Satta Matka live results, panel charts, and number analysis portal.">
<style>${commonStyles}</style>
</head>
<body>

${getCommonHeader(state, 'About Us')}

<div class="page-box">
  <h1>ABOUT KHABARLINE.SITE</h1>

  <p>
    Welcome to <strong>Khabarline.site</strong>, India's premier high-accuracy, real-time verified destination for Satta Matka live results, historical panel charts, and daily analytical guessing.
  </p>

  <h2>🎯 Our Mission</h2>
  <p>
    Our primary mission is to provide enthusiasts and industry developers with 100% verified, zero-latency market numbers. Unlike traditional sites plagued by manual delays and unverified rumors, Khabarline utilizes an advanced <strong>Multi-Source Quorum Consensus Engine</strong> to validate every declared number before publication.
  </p>

  <h2>⚡ Why Choose Khabarline?</h2>
  <ul>
    <li><strong>Fastest Live Delivery:</strong> Millisecond latency updates pushed via Server-Sent Events (SSE).</li>
    <li><strong>Quorum Verification:</strong> Automatic verification across multiple verified channels and sources.</li>
    <li><strong>187+ Comprehensive Market Coverage:</strong> Kalyan, Main Bazar, Milan Day/Night, Rajdhani Day/Night, Sridevi, Starline, and regional markets.</li>
    <li><strong>Rich Historical Archive:</strong> Decade-long Jodi and Panel chart archives formatted for mobile and desktop screens.</li>
    <li><strong>Robust Developer API:</strong> Ultra-fast REST and SSE endpoints for developers and app builders.</li>
  </ul>

  <h2>📱 Join Our Community</h2>
  <p>
    Stay connected with over 100,000+ daily visitors by subscribing to our official channels:
  </p>
  <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px;">
    <a href="${state.telegramChannelUrl}" target="_blank" class="nav-btn tg-nav-btn">🚀 Join Telegram Channel</a>
  </div>
</div>

${getCommonFooter()}

</body>
</html>`;
}

export function renderContactPage(state: KhabarlineState): string {
  return `<!DOCTYPE html>
<html lang="en-in">
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
<title>Contact Us | Khabarline.site Support & Business Queries</title>
<meta name="description" content="Contact Khabarline.site team for API integrations, advertising, technical support, and feedback.">
<style>${commonStyles}</style>
</head>
<body>

${getCommonHeader(state, 'Contact Us')}

<div class="page-box">
  <h1>CONTACT US & SUPPORT</h1>

  <p>
    Have questions regarding our live results, chart records, or API integration? We are here to assist you 24/7.
  </p>

  <div class="highlight-card">
    <h2>💬 Instant Telegram Support</h2>
    <p>For urgent queries, live result discrepancies, or API access keys, reach out directly via Telegram:</p>
    <a href="${state.telegramChannelUrl}" target="_blank" class="nav-btn tg-nav-btn" style="font-size:14px; padding:8px 18px;">
      ✈️ Telegram Support Channel
    </a>
  </div>

  <h2>📧 Business & Advertising Enquiries</h2>
  <p>
    For banner advertising, API licensing, or partnership opportunities, contact:
  </p>
  <p><strong>Email:</strong> <code>support@khabarline.site</code> / <code>admin@khabarline.site</code></p>
  <p><strong>Response Time:</strong> Within 2 to 4 hours during market trading hours.</p>
</div>

${getCommonFooter()}

</body>
</html>`;
}

export function renderPrivacyPage(state: KhabarlineState): string {
  return `<!DOCTYPE html>
<html lang="en-in">
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
<title>Privacy Policy | Khabarline.site</title>
<meta name="description" content="Privacy Policy for Khabarline.site. Learn how we handle your data and maintain privacy.">
<style>${commonStyles}</style>
</head>
<body>

${getCommonHeader(state, 'Privacy Policy')}

<div class="page-box">
  <h1>PRIVACY POLICY</h1>
  <p><em>Last Updated: September 2026</em></p>

  <p>
    At <strong>Khabarline.site</strong>, the privacy of our visitors is of utmost importance to us. This Privacy Policy outlines the types of personal information that is received and collected by Khabarline.site and how it is used.
  </p>

  <h2>1. Information We Collect</h2>
  <p>
    Khabarline.site does not require user registration or mandatory personal details for browsing public results. We may log standard web server analytics (such as IP addresses, browser types, ISP, timestamp, and referring/exit pages) solely for DDoS mitigation, traffic analysis, and performance optimization.
  </p>

  <h2>2. Cookies & Local Storage</h2>
  <p>
    We use standard local storage (e.g. <code>localStorage</code>) to save your scroll position and user UI preferences (such as selected market filters). We do not store tracking or identifying cookies.
  </p>

  <h2>3. Third-Party Links & Services</h2>
  <p>
    Khabarline.site may contain links to external channels (such as Telegram and WhatsApp). We are not responsible for the privacy practices or content of these third-party platforms.
  </p>

  <h2>4. Data Security</h2>
  <p>
    All HTTP/HTTPS communications are secured via TLS 1.3 encryption. We employ strict firewalls to safeguard our server infrastructure.
  </p>

  <h2>5. Consent</h2>
  <p>
    By using our website, you hereby consent to our Privacy Policy and agree to its terms.
  </p>
</div>

${getCommonFooter()}

</body>
</html>`;
}

export function renderTermsPage(state: KhabarlineState): string {
  return `<!DOCTYPE html>
<html lang="en-in">
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
<title>Terms and Conditions | Khabarline.site</title>
<meta name="description" content="Terms of Service and Conditions of use for Khabarline.site.">
<style>${commonStyles}</style>
</head>
<body>

${getCommonHeader(state, 'Terms & Conditions')}

<div class="page-box">
  <h1>TERMS AND CONDITIONS</h1>
  <p><em>Last Updated: September 2026</em></p>

  <p>
    Please read these Terms and Conditions carefully before using the <strong>Khabarline.site</strong> website and developer APIs.
  </p>

  <h2>1. Acceptance of Terms</h2>
  <p>
    By accessing or browsing this website, you agree to be bound by these Terms. If you disagree with any part of the terms, you may not access the service.
  </p>

  <h2>2. Informational & Educational Use Only</h2>
  <p>
    All content, number charts, astrological tips, and live result data displayed on Khabarline.site are provided strictly for informational, educational, and statistical analysis purposes. We do not promote, host, or participate in illegal gambling.
  </p>

  <h2>3. API Fair Use & Rate Limiting</h2>
  <p>
    Developers consuming the Khabarline API must abide by rate limit thresholds. Excessive automated scraping or denial-of-service attempts may result in permanent IP blacklisting.
  </p>

  <h2>4. Limitation of Liability</h2>
  <p>
    In no event shall Khabarline.site or its operators be liable for any direct, indirect, incidental, or consequential damages resulting from the use of data published on this website.
  </p>
</div>

${getCommonFooter()}

</body>
</html>`;
}

export function renderDisclaimerPage(state: KhabarlineState): string {
  return `<!DOCTYPE html>
<html lang="en-in">
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
<title>Disclaimer | Khabarline.site</title>
<meta name="description" content="Legal Disclaimer regarding statistical information and Matka charts published on Khabarline.site.">
<style>${commonStyles}</style>
</head>
<body>

${getCommonHeader(state, 'Disclaimer')}

<div class="page-box">
  <h1>LEGAL DISCLAIMER</h1>

  <div class="highlight-card" style="border-color:#ff0016; background:#fff0f2;">
    <p style="font-size:15px; font-weight:700; color:#d3003f; margin-bottom:0;">
      ⚠️ IMPORTANT LEGAL NOTICE: PLEASE READ CAREFULLY BEFORE ACCESSING THIS SITE.
    </p>
  </div>

  <p>
    <strong>Khabarline.site</strong> is purely an independent statistical archive and real-time calculation portal. We do not organize, facilitate, book, or operate any form of betting, lottery, or gambling activities.
  </p>

  <h2>1. Jurisdiction & Local Laws</h2>
  <p>
    Users are solely responsible for ensuring compliance with all local, state, and national laws in their respective jurisdictions. If accessing such informational portals is prohibited under your local laws, you must immediately leave this website.
  </p>

  <h2>2. No Financial Advice or Guarantees</h2>
  <p>
    Any guessing numbers, golden ank, or trick charts published on this website are derived from historical mathematical patterns and publicly available statistical formulas. We do not guarantee outcomes or financial gain.
  </p>

  <h2>3. Third-Party Content</h2>
  <p>
    We are not affiliated with any external clubs, bookmakers, or organizations. All trademarks, market titles, and logos belong to their respective copyright holders.
  </p>
</div>

${getCommonFooter()}

</body>
</html>`;
}
