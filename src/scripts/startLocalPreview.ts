import path from 'path';
import fs from 'fs';
import { KhabarlineStore } from '../khabarline/store.js';
import { KhabarlineServer } from '../khabarline/server.js';
import { ResultApiService } from '../services/resultApiService.js';
import { DpbossScraperService } from '../services/dpbossScraper.js';
import { loadConfig } from '../config.js';

let appConfig: any = null;
try {
  appConfig = loadConfig();
} catch (e) {
  appConfig = null;
}

const port = parseInt(process.env.PORT || String(appConfig?.khabarline?.port || 8080), 10);
const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Master Production Hash Key from config.json: 124f2c24975404e3384952b0ede054c63c4d5bcd1f1a29158d9583fc66deae85
const defaultProductionHashKey = '124f2c24975404e3384952b0ede054c63c4d5bcd1f1a29158d9583fc66deae85';
const hashKey =
  process.env.API_HASH_KEY ||
  appConfig?.api?.hashKey ||
  defaultProductionHashKey;

const allowedKeys = Array.from(
  new Set([
    hashKey,
    defaultProductionHashKey,
    'result_bot_secret_2026',
    ...(appConfig?.api?.allowedHashKeys || []),
  ])
);

const store = new KhabarlineStore();
const apiService = new ResultApiService(
  {
    enabled: true,
    hashKey,
    allowedHashKeys: allowedKeys,
  },
  store
);

const server = new KhabarlineServer(
  {
    enabled: true,
    port,
    domain: process.env.DOMAIN || appConfig?.khabarline?.domain || 'khabarline.site',
    adminPassword: process.env.ADMIN_PASSWORD || appConfig?.khabarline?.adminPassword || ':Az|l)|J0NY|.cU:',
  },
  store,
  apiService
);

// Connect real-time DPBoss scraper to keep local preview synchronized live with dpboss.boston
const dpbossScraper = new DpbossScraperService({
  enabled: true,
  url: process.env.DPBOSS_URL || appConfig?.dpboss?.url || 'https://dpboss.boston/',
  pollIntervalSeconds: parseInt(
    process.env.DPBOSS_POLL_INTERVAL || String(appConfig?.dpboss?.pollIntervalSeconds || 15),
    10
  ),
  ownerId: 'local_preview_admin',
  autoVerifyOnUnverified: false,
});

dpbossScraper.on('dpboss_batch_markets', (batch) => {
  const updated = store.syncFromDpbossFull(batch);
  if (updated > 0) {
    console.log(`🔄 Synced ${updated} live market results and timings from DPBoss to local preview store.`);
  }
});

dpbossScraper.on('dpboss_result', (payload) => {
  store.updateMarketResult(payload.marketName, payload.value, true);
});

server
  .start()
  .then(async () => {
    console.log(`🌐 Khabarline Local Preview Server is LIVE at http://localhost:${port}`);
    console.log(`📊 Jodi Chart: http://localhost:${port}/jodi-chart-record/kalyan`);
    console.log(`📈 Panel Chart: http://localhost:${port}/panel-chart-record/kalyan`);
    console.log(`🚀 API Docs: http://localhost:${port}/api-docs`);

    console.log('📡 Fetching initial live result snapshot from https://dpboss.boston/ ...');
    try {
      await dpbossScraper.poll();
      console.log('✅ Initial DPBoss live result sync completed.');
    } catch (e: any) {
      console.warn('⚠️ Initial DPBoss fetch notice:', e?.message || e);
    }

    dpbossScraper.start();
  })
  .catch((err) => {
    console.error('Failed to start local preview server:', err);
  });
