import path from 'path';
import fs from 'fs';
import { KhabarlineStore } from '../khabarline/store.js';
import { KhabarlineServer } from '../khabarline/server.js';
import { ResultApiService } from '../services/resultApiService.js';
import { DpbossScraperService } from '../services/dpbossScraper.js';

const port = parseInt(process.env.PORT || '8080', 10);
const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const store = new KhabarlineStore();
const apiService = new ResultApiService(
  {
    enabled: true,
    hashKey: process.env.API_HASH_KEY || 'result_bot_secret_2026',
    allowedHashKeys: [process.env.API_HASH_KEY || 'result_bot_secret_2026'],
  },
  store
);

const server = new KhabarlineServer(
  {
    enabled: true,
    port,
    domain: process.env.DOMAIN || 'khabarline.site',
    adminPassword: process.env.ADMIN_PASSWORD || 'admin',
  },
  store,
  apiService
);

// Connect real-time DPBoss scraper to keep local preview synchronized live with dpboss.boston
const dpbossScraper = new DpbossScraperService({
  enabled: true,
  url: process.env.DPBOSS_URL || 'https://dpboss.boston/',
  pollIntervalSeconds: parseInt(process.env.DPBOSS_POLL_INTERVAL || '15', 10),
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
