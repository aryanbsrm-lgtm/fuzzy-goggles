# Cross-Platform Consensus Message Bridge & Result Bot

A robust, enterprise-grade multi-group consensus verification bridge built in TypeScript. It listens to incoming messages across multiple WhatsApp groups and channels, verifies that independent sources agree on matching values within a 5-minute time window, scrapes `https://dpboss.boston` in real-time, powers `https://khabarline.site` and `https://admin.khabarline.site`, and broadcasts strictly **✅ Verified** alerts to approved Telegram groups and channels.

---

## 🌟 Key Features

- **Multi-Group Quorum Consensus**: Configurable threshold (at least 2 distinct source owners must agree on matching numbers).
- **Group Addition & Admin Approval System**:
  - Anyone can invite/add the Telegram Result Bot to groups.
  - New groups are placed in a **Pending** queue until approved by an administrator.
  - Bot sends interactive Approval Requests to Admins with inline `[✅ Approve]` and `[❌ Reject]` buttons.
  - Persists approved groups in `data/approved_chats.json` across restarts.
- **Strict Verified Broadcasting**:
  - **Only `✅ Verified` results** are ever broadcast to approved Telegram groups and channels.
  - Unverified results (`❌ Unverified`) are never sent to external user groups.
- **Direct DPBoss.boston Live Web Scraper & Verification Cycle**:
  - Built-in native Node.js web scraper fetching `https://dpboss.boston`.
  - Automatic background polling every 30s.
  - **Active Verification Cycle**: When an unverified WhatsApp result arrives, triggers an active retry cycle (+10s, +30s, +60s, +120s, +180s) to verify against `dpboss.boston` and reach instant consensus.
- **Anti-Spam & Owner Partitioning**: Multiple channels/groups owned by the same entity only count as 1 vote to prevent false consensus.
- **24/7 Google Sheets Verification Scraper**: Secondary sheet verification source.
- **Verified Game Result API (`/api/v1/gameResult`)**: High-performance HTTP API supporting cryptographic signatures (HMAC-SHA256, SHA256, MD5) and direct hashKey authentication.
- **Result Mode (`📊 RESULT`) vs Answer Mode (`🎯 ANSWER`)**:
  - **Result Mode**: Outputs full live verified numbers (`result: "156-27-133"`, `openPana`, `openDigit`, `closeDigit`, `closePana`, `jodi`, `status: "VERIFIED"`).
  - **Answer Mode**: Strictly returns `status: "NOT_DECLARED"`, `isDeclared: false`, `isVerified: false`, returns custom manual answer string (`answer: "BSRM"`), and suppresses all pana/digit fields.
- **Private Admin Web Dashboard**: Web UI at `https://admin.khabarline.site/4.3.2.1` or `http://200.234.32.227:8095` to manage whitelist, response formats, custom answers, and manual broadcasts.

---

## 🔌 Verified Game Result API

### Endpoint:
`GET /api/v1/gameResult` or `POST /api/v1/gameResult`

### Parameters:
| Param | Type | Description |
| :--- | :--- | :--- |
| `gameName` | string | Market/Game name (e.g. `KALYAN`, `MILAN DAY`, `LEELA NIGHT`) |
| `date` | string | Target date (`YYYY-MM-DD`, `today`, `yesterday`, `DD-MM-YYYY`) |
| `session` | string | `OPEN`, `CLOSE`, `JODI`, or `ALL` (default: `ALL`) |
| `hashKey` | string | Direct API Key or Hash Key |
| `hash` / `signature` | string | Cryptographic signature (`HMAC-SHA256`, `SHA256`, `MD5`) |

### Example cURL Queries:

```bash
# Query Standard Result Market
curl -X GET "https://khabarline.site/api/v1/gameResult?gameName=KALYAN&session=ALL&hashKey=124f2c24975404e3384952b0ede054c63c4d5bcd1f1a29158d9583fc66deae85"

# Query Answer Market (returns NOT_DECLARED + custom answer)
curl -X GET "https://khabarline.site/api/v1/gameResult?gameName=LEELA%20NIGHT&session=ALL&hashKey=124f2c24975404e3384952b0ede054c63c4d5bcd1f1a29158d9583fc66deae85"
```

---

## 👑 Telegram Bot Commands

### User Commands
- `/status` - View live bridge uptime, processed counts, and cached market totals.
- `/scrape` - Live scrape `www.dpboss.boston` and show cached results.
- `/scrape <market>` (e.g. `/scrape KALYAN`) - Look up live results for a specific market.
- `/id` - View the current chat ID and approval status.
- `/groups` - View all approved broadcast groups.

### Admin Commands (Restricted to `TELEGRAM_ADMIN_IDS`)
- `/pending` - View and manage pending group addition requests with one-tap inline buttons.
- `/approve <chatId>` - Manually approve a group by chat ID.
- `/reject <chatId>` - Manually reject a group request.
- `/removegroup <chatId>` - Revoke broadcast approval and remove a group.
- `/approved` - View all active approved destinations.
- `/settarget` - Set current group as primary target.
- `/test` - Test sending a verified broadcast.

---

## 🚀 Deployment & Operations

### Build & Deploy to VPS:
```bash
npm test
npm run build
rsync -avz dist/ root@200.234.32.227:/root/consensus-bridge/dist/
ssh root@200.234.32.227 "systemctl restart consensusbridge"
```

### Check Live VPS Status & Logs:
```bash
ssh root@200.234.32.227 "systemctl status consensusbridge"
ssh root@200.234.32.227 "journalctl -u consensusbridge -f"
```

---

## 🧪 Automated Tests

```bash
npm test
```

