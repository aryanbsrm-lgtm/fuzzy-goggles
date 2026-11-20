import http from 'http';
import { URL } from 'url';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import { ConsensusEngine } from '../consensus/engine.js';
import { MarketWhitelistService } from '../services/marketWhitelist.js';
import { GroupApprovalService } from '../services/groupApproval.js';
import { ScraperService } from '../services/scraper.js';
import { DpbossScraperService } from '../services/dpbossScraper.js';
import { GoogleSheetService } from '../services/sheets.js';
import { KhabarlineStore } from '../khabarline/store.js';
import { Config } from '../config.js';
import { ResultApiService } from '../services/resultApiService.js';
import { ChartService } from '../services/chartService.js';

export interface DashboardServerOptions {
  enabled: boolean;
  port: number;
  password: string;
}

export class DashboardServer extends EventEmitter {
  private options: DashboardServerOptions;
  private consensusEngine: ConsensusEngine;
  private marketWhitelist: MarketWhitelistService;
  private groupApproval: GroupApprovalService;
  private scraperService?: ScraperService;
  private dpbossService?: DpbossScraperService;
  private sheetService?: GoogleSheetService;
  private khabarlineStore?: KhabarlineStore;
  private resultApiService?: ResultApiService;
  private chartService = new ChartService();
  private config: Config;
  private server: http.Server | null = null;
  private sseClients = new Set<http.ServerResponse>();
  private sessionTokens = new Set<string>();

  constructor(
    options: DashboardServerOptions,
    consensusEngine: ConsensusEngine,
    marketWhitelist: MarketWhitelistService,
    groupApproval: GroupApprovalService,
    config: Config,
    scraperService?: ScraperService,
    dpbossService?: DpbossScraperService,
    sheetService?: GoogleSheetService,
    khabarlineStore?: KhabarlineStore,
    resultApiService?: ResultApiService
  ) {
    super();
    this.options = options;
    this.consensusEngine = consensusEngine;
    this.marketWhitelist = marketWhitelist;
    this.groupApproval = groupApproval;
    this.config = config;
    this.scraperService = scraperService;
    this.dpbossService = dpbossService;
    this.sheetService = sheetService;
    this.khabarlineStore = khabarlineStore;
    this.resultApiService = resultApiService;

    // Listen to consensus events to broadcast via SSE
    this.consensusEngine.on('consensus_reached', (event) => {
      this.broadcastSse('consensus_reached', event);
    });

    this.marketWhitelist.on('market_updated', (market) => {
      this.broadcastSse('market_updated', market);
    });
  }

  public start(): Promise<void> {
    if (!this.options.enabled) {
      logger.info('Admin Dashboard is disabled in configuration.');
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res).catch((err) => {
          logger.error({ err: err?.message || err }, 'Dashboard server error');
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal Server Error' }));
        });
      });

      this.server.listen(this.options.port, '0.0.0.0', () => {
        logger.info(
          { port: this.options.port, url: `http://0.0.0.0:${this.options.port}` },
          '🌐 Private Admin Web Dashboard running'
        );
        resolve();
      });
    });
  }

  public stop(): void {
    if (this.server) {
      for (const client of this.sseClients) {
        client.end();
      }
      this.sseClients.clear();
      this.server.close();
      this.server = null;
    }
  }

  private broadcastSse(eventType: string, data: any): void {
    const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(payload);
      } catch {
        this.sseClients.delete(client);
      }
    }
  }

  private isAuthorized(req: http.IncomingMessage, parsedUrl: URL): boolean {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      if (this.sessionTokens.has(token)) return true;
    }

    const queryToken = parsedUrl.searchParams.get('token');
    if (queryToken && this.sessionTokens.has(queryToken)) {
      return true;
    }

    // Check cookie
    const cookieHeader = req.headers['cookie'];
    if (cookieHeader) {
      const match = cookieHeader.match(/auth_token=([^;]+)/);
      if (match && this.sessionTokens.has(match[1])) {
        return true;
      }
    }

    return false;
  }

  private parseJsonBody(req: http.IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > 1e6) {
          req.destroy();
          reject(new Error('Body too large'));
        }
      });
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (e) {
          reject(e);
        }
      });
      req.on('error', reject);
    });
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;
    const method = req.method?.toUpperCase() || 'GET';

    // CORS headers for admin convenience
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Public: Health Check
    if (pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', time: Date.now() }));
      return;
    }

    // Public / Partner: Verified Game Result API (with Hash Key / Signature Authentication)
    if (
      pathname === '/api/v1/gameResult' ||
      pathname === '/api/gameResult' ||
      pathname === '/api/v1/result' ||
      pathname === '/api/result'
    ) {
      if (this.resultApiService) {
        const body = method === 'POST' ? await this.parseJsonBody(req) : {};
        const handled = await this.resultApiService.handleHttpRequest(req, res, parsedUrl, body);
        if (handled) return;
      }
    }

    // Public: Login API
    if (pathname === '/api/login' && method === 'POST') {
      const body = await this.parseJsonBody(req);
      if (body.password === this.options.password) {
        const token = crypto.randomBytes(24).toString('hex');
        this.sessionTokens.add(token);
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Set-Cookie': `auth_token=${token}; Path=/; HttpOnly; SameSite=Lax`,
        });
        res.end(JSON.stringify({ success: true, token }));
      } else {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Incorrect password' }));
      }
      return;
    }

    // Protected API Endpoints
    if (pathname.startsWith('/api/')) {
      if (!this.isAuthorized(req, parsedUrl)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized. Please login.' }));
        return;
      }

      // 1. Status
      if (pathname === '/api/status' && method === 'GET') {
        const stats = this.consensusEngine.getStats();
        const pendingCount = this.consensusEngine.getPendingCandidatesCount();
        const totalMarkets = this.marketWhitelist.getAllMarkets().length;
        const enabledMarkets = this.marketWhitelist.getEnabledCount();
        const approvedChats = this.groupApproval.getApprovedChats();

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            uptime: process.uptime(),
            startedAt: stats.startedAt,
            stats,
            pendingCount,
            totalMarkets,
            enabledMarkets,
            approvedChatsCount: approvedChats.length,
            scrapers: {
              dpboss: Boolean(this.config.dpboss.enabled),
              sheets: Boolean(this.config.sheets.enabled),
              scraperHub: Boolean(this.config.scraper.enabled),
            },
          })
        );
        return;
      }

      // 2. Candidates (Pending & Dispatched History)
      if (pathname === '/api/candidates' && method === 'GET') {
        const pending = this.consensusEngine.getPendingCandidates();
        const history = this.consensusEngine.getDispatchedHistory(50);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ pending, history }));
        return;
      }

      // 3. Force Verify Candidate
      if (pathname === '/api/candidates/verify' && method === 'POST') {
        const body = await this.parseJsonBody(req);
        if (!body.key) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Candidate key is required' }));
          return;
        }

        const verifiedEvent = this.consensusEngine.forceVerify(body.key);
        if (verifiedEvent) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, event: verifiedEvent }));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Candidate not found or already verified' }));
        }
        return;
      }

      // 4. Dismiss Candidate
      if (pathname === '/api/candidates/dismiss' && method === 'POST') {
        const body = await this.parseJsonBody(req);
        if (!body.key) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Candidate key is required' }));
          return;
        }

        const success = this.consensusEngine.dismissCandidate(body.key);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success }));
        return;
      }

      // 5. Market Whitelist API
      if (pathname === '/api/markets' && method === 'GET') {
        const markets = this.marketWhitelist.getAllMarkets();
        const enriched = markets.map((m) => {
          const storeMarket = this.khabarlineStore?.getMarket(m.name);
          const isAnswer = m.responseFormat === 'answer';
          return {
            ...m,
            value: isAnswer ? (m.customAnswer || '***-**-***') : (storeMarket?.value || '***-**-***'),
          };
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ markets: enriched, enabledCount: this.marketWhitelist.getEnabledCount() }));
        return;
      }

      if (pathname === '/api/markets/toggle' && method === 'POST') {
        const body = await this.parseJsonBody(req);
        if (!body.name || typeof body.enabled !== 'boolean') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Market name and enabled state are required' }));
          return;
        }
        this.marketWhitelist.setMarketStatus(body.name, body.enabled);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, name: body.name, enabled: body.enabled }));
        return;
      }

      if (pathname === '/api/markets/toggle-all' && method === 'POST') {
        const body = await this.parseJsonBody(req);
        if (typeof body.enabled !== 'boolean') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Enabled boolean is required' }));
          return;
        }
        this.marketWhitelist.setAllMarketsStatus(body.enabled);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, enabled: body.enabled }));
        return;
      }

      if (pathname === '/api/markets/add' && method === 'POST') {
        const body = await this.parseJsonBody(req);
        if (!body.name) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Market name is required' }));
          return;
        }
        this.marketWhitelist.addOrUpdateMarket(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
      }

      if (pathname === '/api/markets/delete' && method === 'POST') {
        const body = await this.parseJsonBody(req);
        if (!body.name) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Market name is required' }));
          return;
        }
        const deleted = this.marketWhitelist.deleteMarket(body.name);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: deleted }));
        return;
      }

      if (pathname === '/api/markets/set-format' && method === 'POST') {
        const body = await this.parseJsonBody(req);
        if (!body.name || !body.format) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Market name and format are required' }));
          return;
        }
        const format = body.format === 'answer' ? 'answer' : 'result';
        this.marketWhitelist.setMarketResponseFormat(body.name, format);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, name: body.name, format }));
        return;
      }

      if (pathname === '/api/markets/set-answer' && method === 'POST') {
        const body = await this.parseJsonBody(req);
        if (!body.name || body.answer === undefined) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Market name and answer are required' }));
          return;
        }
        const answer = String(body.answer).trim();
        this.marketWhitelist.setMarketCustomAnswer(body.name, answer);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, name: body.name, answer }));
        return;
      }

      // 6. Verification Sources API
      if (pathname === '/api/sources' && method === 'GET') {
        const whatsappSources = (this.config.whatsapp.sourceGroups || []).map((jid) => {
          const name = this.config.whatsapp.groupAliases[jid] || (jid.endsWith('@newsletter') ? 'WhatsApp Channel' : 'WhatsApp Group');
          const isChannel = jid.endsWith('@newsletter');
          const ownerId = this.consensusEngine.getOwnerId(jid);
          return {
            jid,
            name,
            type: isChannel ? 'Channel' : 'Group',
            ownerId,
            status: 'CONNECTED',
          };
        });

        // Unique owner entities
        const ownerEntities: Record<string, { label: string; sources: Array<{ name: string; jid: string; type: string }> }> = {};
        for (const src of whatsappSources) {
          if (!ownerEntities[src.ownerId]) {
            let label = src.ownerId;
            if (src.ownerId === 'owner_prakash') label = 'Prakash Fast Result Network';
            else if (src.ownerId === 'owner_live_khabar') label = 'Live Khabar Result Network';
            ownerEntities[src.ownerId] = { label, sources: [] };
          }
          ownerEntities[src.ownerId].sources.push(src);
        }

        const scrapers = [
          {
            id: 'dpboss_scraper',
            name: 'DPBoss.boston Live Web Poller',
            type: 'Direct Web Scraper',
            target: this.config.dpboss.url || 'https://dpboss.boston',
            ownerId: this.config.dpboss.ownerId || 'owner_dpboss',
            pollInterval: `${this.config.dpboss.pollIntervalSeconds || 30}s`,
            status: this.config.dpboss.enabled ? 'ACTIVE' : 'DISABLED',
            description: 'Direct HTML table parser polling dpboss.boston every 30s. Automatically triggers rapid verification cycles (+10s, +30s, +60s, +120s, +180s) when unverified results arrive.',
          },
          {
            id: 'google_sheets_scraper',
            name: 'Google Sheets 24/7 Verification Feed',
            type: 'Cloud Spreadsheet Feed',
            target: this.config.sheets.sheetUrl || 'https://docs.google.com/spreadsheets/d/1H9C8oqVNoUcux0a6Us81QoC5jGqsFUbmM1lzOBg7mAE/edit',
            ownerId: this.config.sheets.ownerId || 'owner_web_scraper',
            pollInterval: `${this.config.sheets.pollIntervalSeconds || 30}s`,
            cycleOffset: `${this.config.sheets.scraperCycleOffsetSeconds || 88}s past 5m mark`,
            status: this.config.sheets.enabled ? 'ACTIVE' : 'DISABLED',
            description: 'Continuous 24/7 Google Spreadsheet poller synchronized with Scraper-Hub multi-threaded workers.',
          },
          {
            id: 'scraper_hub',
            name: 'Scraper-Hub On-Demand Trigger Engine',
            type: 'On-Demand Engine',
            target: this.config.scraper.httpUrl || 'http://127.0.0.1:8094/api/job/2/run',
            ownerId: 'owner_web_scraper',
            triggerMode: this.config.scraper.triggerMode || 'auto',
            debounce: `${this.config.scraper.debounceSeconds || 10}s`,
            status: this.config.scraper.enabled ? 'READY' : 'DISABLED',
            description: 'Triggers instant headless Chrome/Python web scrapers immediately upon single-source reports to achieve ultra-fast consensus.',
          }
        ];

        const consensusRules = {
          minMatches: this.config.consensus.minMatches || 2,
          timeWindowSeconds: this.config.consensus.timeWindowSeconds || 300,
          dedupTtlSeconds: this.config.consensus.dedupTtlSeconds || 1800,
          antiCollusion: 'Sources belonging to the same owner entity (e.g. Prakash channel + Prakash group) are treated as 1 single vote and cannot self-verify each other.'
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ whatsappSources, scrapers, ownerEntities, consensusRules }));
        return;
      }

      // 7. Groups & Bot Destination Mappings
      if (pathname === '/api/groups' && method === 'GET') {
        const approved = this.groupApproval.getApprovedChats().map((c) => ({
          ...c,
          botTokenMasked: c.botToken ? `${c.botToken.substring(0, 10)}...` : undefined,
        }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ approved }));
        return;
      }

      // 8. Manual Result Broadcast
      if (pathname === '/api/manual-broadcast' && method === 'POST') {
        const body = await this.parseJsonBody(req);
        if (!body.marketName || !body.value) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Market name and value are required' }));
          return;
        }

        const verifiedEvent = this.consensusEngine.manualBroadcast(
          body.marketName,
          body.value,
          body.session
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, event: verifiedEvent }));
        return;
      }

      // 9. Scraper Trigger
      if (pathname === '/api/scraper/trigger' && method === 'POST') {
        if (this.scraperService) {
          this.scraperService.triggerScrape().catch(() => {});
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Scraper triggered' }));
        return;
      }

      // 10. Khabarline Management APIs
      if (pathname === '/api/khabarline/data' && method === 'GET') {
        if (!this.khabarlineStore) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Khabarline store not initialized' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            state: this.khabarlineStore.getState(),
            config: this.config.khabarline,
          })
        );
        return;
      }

      if (pathname === '/api/khabarline/update-market' && method === 'POST') {
        if (!this.khabarlineStore) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Khabarline store not initialized' }));
          return;
        }
        const body = await this.parseJsonBody(req);
        if (!body.marketName) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'marketName is required' }));
          return;
        }
        const updated = this.khabarlineStore.updateMarketDetails(body.marketName, {
          value: body.value,
          openTime: body.openTime,
          closeTime: body.closeTime,
          highlight: body.highlight,
          isVerified: body.isVerified !== false,
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, market: updated }));
        return;
      }

      if (pathname === '/api/khabarline/sync-bharatmatka-charts' && method === 'POST') {
        try {
          const syncRes = await this.chartService.syncAllBharatmatkaCharts();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(syncRes));
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err?.message || 'Sync failed' }));
        }
        return;
      }

      if (pathname === '/api/khabarline/update-golden-ank' && method === 'POST') {
        if (!this.khabarlineStore) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Khabarline store not initialized' }));
          return;
        }
        const body = await this.parseJsonBody(req);
        if (!body.goldenAnk) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'goldenAnk is required' }));
          return;
        }
        this.khabarlineStore.updateGoldenAnk(body.goldenAnk);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, goldenAnk: body.goldenAnk }));
        return;
      }

      if (pathname === '/api/khabarline/sync-from-dpboss' && method === 'POST') {
        if (!this.khabarlineStore || !this.dpbossService) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Services not initialized' }));
          return;
        }
        try {
          const html = await this.dpbossService.fetchHtml();
          const scrapedMarkets = this.dpbossService.parseHtml(html);
          const syncedCount = this.khabarlineStore.syncFromDpbossFull({
            markets: scrapedMarkets.map((m) => ({
              marketName: m.marketName,
              value: m.value,
              openTime: m.openTime,
              closeTime: m.closeTime,
            })),
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, syncedCount }));
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err?.message || 'Sync failed' }));
        }
        return;
      }

      if (pathname === '/api/khabarline/sponsored-apps' && method === 'GET') {
        if (!this.khabarlineStore) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Khabarline store not initialized' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          sponsoredApps: this.khabarlineStore.getSponsoredPlayApps(),
          banner: this.khabarlineStore.getState().playAppBanner,
        }));
        return;
      }

      if (pathname === '/api/khabarline/sponsored-apps/add' && method === 'POST') {
        if (!this.khabarlineStore) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Khabarline store not initialized' }));
          return;
        }
        const body = await this.parseJsonBody(req);
        const added = this.khabarlineStore.addSponsoredPlayApp(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, app: added }));
        return;
      }

      if (pathname === '/api/khabarline/sponsored-apps/update' && method === 'POST') {
        if (!this.khabarlineStore) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Khabarline store not initialized' }));
          return;
        }
        const body = await this.parseJsonBody(req);
        const updated = this.khabarlineStore.updateSponsoredPlayApp(body.id, body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: updated }));
        return;
      }

      if (pathname === '/api/khabarline/sponsored-apps/delete' && method === 'POST') {
        if (!this.khabarlineStore) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Khabarline store not initialized' }));
          return;
        }
        const body = await this.parseJsonBody(req);
        const deleted = this.khabarlineStore.deleteSponsoredPlayApp(body.id);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: deleted }));
        return;
      }

      if (pathname === '/api/khabarline/update-play-banner' && method === 'POST') {
        if (!this.khabarlineStore) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Khabarline store not initialized' }));
          return;
        }
        const body = await this.parseJsonBody(req);
        this.khabarlineStore.updatePlayAppBanner(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, banner: this.khabarlineStore.getState().playAppBanner }));
        return;
      }

      if (pathname === '/api/khabarline/update-settings' && method === 'POST') {
        if (!this.khabarlineStore) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Khabarline store not initialized' }));
          return;
        }
        const body = await this.parseJsonBody(req);
        this.khabarlineStore.updateSiteSettings(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, state: this.khabarlineStore.getState() }));
        return;
      }

      // 10. Real-time Server Sent Events (SSE)
      if (pathname === '/api/events' && method === 'GET') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        res.write('event: connected\ndata: {"status":"connected"}\n\n');
        this.sseClients.add(res);

        req.on('close', () => {
          this.sseClients.delete(res);
        });
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    // Serve Dashboard Web UI (prevent browser caching)
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    });
    res.end(this.renderHtml());
  }

  private renderHtml(): string {
    return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>⚡ Consensus Bridge — Admin Control Hub</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-dark: #090d16;
      --card-bg: rgba(18, 24, 38, 0.75);
      --card-border: rgba(255, 255, 255, 0.08);
      --primary: #38bdf8;
      --primary-glow: rgba(56, 189, 248, 0.25);
      --emerald: #10b981;
      --amber: #f59e0b;
      --rose: #f43f5e;
      --purple: #a855f7;
      --indigo: #6366f1;
      --text-main: #f1f5f9;
      --text-muted: #94a3b8;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg-dark);
      background-image: radial-gradient(circle at 50% 0%, rgba(56, 189, 248, 0.08), transparent 50%),
                        radial-gradient(circle at 100% 100%, rgba(168, 85, 247, 0.05), transparent 40%);
      color: var(--text-main);
      font-family: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    /* Modal / Login overlay */
    #loginModal {
      position: fixed; inset: 0; background: rgba(0,0,0,0.85); backdrop-filter: blur(10px);
      display: flex; align-items: center; justify-content: center; z-index: 1000;
    }
    .login-box {
      background: #111827; border: 1px solid rgba(255,255,255,0.12);
      border-radius: 24px; padding: 40px; width: 90%; max-width: 400px;
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.7), 0 0 30px var(--primary-glow);
      text-align: center;
    }
    .login-box h2 { font-size: 1.6rem; font-weight: 800; margin-bottom: 8px; }
    .login-box p { color: var(--text-muted); font-size: 0.9rem; margin-bottom: 24px; }
    .input-field {
      width: 100%; padding: 14px 18px; border-radius: 14px;
      background: #1f2937; border: 1px solid #374151; color: #fff;
      font-size: 1rem; outline: none; margin-bottom: 16px; transition: all 0.2s;
    }
    .input-field:focus { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-glow); }
    .btn-primary {
      width: 100%; padding: 14px; border-radius: 14px;
      background: linear-gradient(135deg, #0284c7, #0369a1);
      border: none; color: #fff; font-size: 1rem; font-weight: 700;
      cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 14px rgba(2, 132, 199, 0.4);
    }
    .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(2, 132, 199, 0.6); }

    /* Layout */
    header {
      background: rgba(13, 19, 33, 0.8); backdrop-filter: blur(16px);
      border-bottom: 1px solid var(--card-border);
      padding: 16px 32px; display: flex; align-items: center; justify-content: space-between;
      position: sticky; top: 0; z-index: 100;
    }
    .brand { display: flex; align-items: center; gap: 14px; }
    .brand-logo {
      width: 42px; height: 42px; border-radius: 12px;
      background: linear-gradient(135deg, #38bdf8, #818cf8);
      display: flex; align-items: center; justify-content: center;
      font-size: 22px; font-weight: 900; color: #090d16;
      box-shadow: 0 0 20px rgba(56,189,248,0.4);
    }
    .brand-title { font-size: 1.25rem; font-weight: 800; letter-spacing: -0.02em; }
    .brand-subtitle { font-size: 0.75rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }

    .header-right { display: flex; align-items: center; gap: 16px; }
    .live-clock {
      font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; font-weight: 600;
      background: rgba(255,255,255,0.05); padding: 8px 14px; border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.08); color: var(--primary);
    }

    /* Tabs */
    .tabs-bar {
      display: flex; gap: 8px; padding: 16px 32px 0; border-bottom: 1px solid var(--card-border);
      background: rgba(13, 19, 33, 0.4); flex-wrap: wrap;
    }
    .tab-btn {
      padding: 12px 20px; border-radius: 12px 12px 0 0; background: transparent;
      border: 1px solid transparent; border-bottom: none; color: var(--text-muted);
      font-size: 0.95rem; font-weight: 600; cursor: pointer; transition: all 0.2s;
      display: flex; align-items: center; gap: 8px;
    }
    .tab-btn:hover { color: var(--text-main); background: rgba(255,255,255,0.03); }
    .tab-btn.active {
      color: var(--primary); background: var(--card-bg);
      border-color: var(--card-border); font-weight: 700;
      box-shadow: inset 0 2px 0 var(--primary);
    }
    .tab-badge {
      font-size: 0.75rem; padding: 2px 8px; border-radius: 20px;
      background: rgba(244, 63, 94, 0.2); color: var(--rose); font-weight: 700;
    }

    /* Main Container */
    main { flex: 1; padding: 28px 32px; max-width: 1440px; margin: 0 auto; width: 100%; }

    /* Stats Grid */
    .stats-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px;
      margin-bottom: 24px;
    }
    .stat-card {
      background: var(--card-bg); border: 1px solid var(--card-border);
      border-radius: 18px; padding: 20px; backdrop-filter: blur(12px);
      display: flex; flex-direction: column; justify-content: space-between;
      position: relative; overflow: hidden;
    }
    .stat-card::before {
      content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
      background: linear-gradient(90deg, var(--accent, #38bdf8), transparent);
    }
    .stat-label { font-size: 0.8rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .stat-val { font-size: 2rem; font-weight: 900; margin: 8px 0; font-family: 'JetBrains Mono', monospace; }
    .stat-sub { font-size: 0.75rem; color: var(--text-muted); }

    /* Unverified / Pending Candidates List */
    .section-header {
      display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;
    }
    .section-title { font-size: 1.25rem; font-weight: 800; display: flex; align-items: center; gap: 10px; }

    .candidate-card {
      background: linear-gradient(135deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.9));
      border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 20px; padding: 24px;
      margin-bottom: 16px; backdrop-filter: blur(12px);
      box-shadow: 0 10px 30px rgba(0,0,0,0.3), 0 0 20px rgba(245, 158, 11, 0.1);
      display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 20px;
      animation: pulseAlert 2.5s infinite;
    }
    @keyframes pulseAlert {
      0%, 100% { border-color: rgba(245, 158, 11, 0.3); }
      50% { border-color: rgba(245, 158, 11, 0.7); box-shadow: 0 0 25px rgba(245, 158, 11, 0.25); }
    }

    .candidate-info { display: flex; flex-direction: column; gap: 6px; }
    .candidate-market { font-size: 1.4rem; font-weight: 900; color: #fff; letter-spacing: -0.01em; }
    .candidate-session-tag {
      display: inline-block; font-size: 0.75rem; font-weight: 700; padding: 3px 10px;
      border-radius: 6px; background: rgba(56, 189, 248, 0.15); color: var(--primary);
      border: 1px solid rgba(56, 189, 248, 0.3); width: fit-content;
    }
    .candidate-val {
      font-family: 'JetBrains Mono', monospace; font-size: 2.2rem; font-weight: 900;
      color: #fbbf24; text-shadow: 0 0 15px rgba(251, 191, 36, 0.4);
    }
    .candidate-sources { font-size: 0.85rem; color: var(--text-muted); display: flex; align-items: center; gap: 6px; }

    .candidate-actions { display: flex; align-items: center; gap: 12px; }
    .btn-verify-force {
      background: linear-gradient(135deg, #10b981, #059669); color: #fff; border: none;
      padding: 14px 24px; border-radius: 14px; font-weight: 800; font-size: 1rem;
      cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 8px;
      box-shadow: 0 4px 14px rgba(16, 185, 129, 0.4);
    }
    .btn-verify-force:hover {
      transform: translateY(-2px); box-shadow: 0 6px 20px rgba(16, 185, 129, 0.6);
    }
    .btn-dismiss {
      background: rgba(244, 63, 94, 0.15); border: 1px solid rgba(244, 63, 94, 0.3);
      color: var(--rose); padding: 14px 20px; border-radius: 14px; font-weight: 700;
      font-size: 0.95rem; cursor: pointer; transition: all 0.2s;
    }
    .btn-dismiss:hover { background: rgba(244, 63, 94, 0.25); }

    /* Tables */
    .table-container {
      background: var(--card-bg); border: 1px solid var(--card-border);
      border-radius: 20px; overflow: hidden; backdrop-filter: blur(12px);
    }
    table { width: 100%; border-collapse: collapse; text-align: left; }
    th {
      background: rgba(255,255,255,0.03); color: var(--text-muted);
      font-size: 0.75rem; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.05em; padding: 16px 20px; border-bottom: 1px solid var(--card-border);
    }
    td { padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 0.95rem; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: rgba(255,255,255,0.02); }

    /* Switch toggle */
    .switch {
      position: relative; display: inline-block; width: 48px; height: 26px;
    }
    .switch input { opacity: 0; width: 0; height: 0; }
    .slider {
      position: absolute; cursor: pointer; inset: 0;
      background-color: #374151; transition: .3s; border-radius: 34px;
    }
    .slider:before {
      position: absolute; content: ""; height: 20px; width: 20px; left: 3px; bottom: 3px;
      background-color: white; transition: .3s; border-radius: 50%;
    }
    input:checked + .slider { background-color: var(--emerald); box-shadow: 0 0 10px rgba(16, 185, 129, 0.4); }
    input:checked + .slider:before { transform: translateX(22px); }

    /* Badges */
    .badge-verified {
      background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3);
      color: var(--emerald); padding: 4px 10px; border-radius: 8px; font-weight: 700; font-size: 0.8rem;
    }
    .badge-unverified {
      background: rgba(244, 63, 94, 0.15); border: 1px solid rgba(244, 63, 94, 0.3);
      color: var(--rose); padding: 4px 10px; border-radius: 8px; font-weight: 700; font-size: 0.8rem;
    }
    .badge-blue {
      background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.3);
      color: var(--primary); padding: 4px 10px; border-radius: 8px; font-weight: 700; font-size: 0.8rem;
    }
    .badge-purple {
      background: rgba(168, 85, 247, 0.15); border: 1px solid rgba(168, 85, 247, 0.3);
      color: var(--purple); padding: 4px 10px; border-radius: 8px; font-weight: 700; font-size: 0.8rem;
    }

    /* Cards */
    .bot-card {
      background: var(--card-bg); border: 1px solid var(--card-border);
      border-radius: 20px; padding: 24px; margin-bottom: 20px;
    }
    .bot-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    .bot-title { font-size: 1.2rem; font-weight: 800; display: flex; align-items: center; gap: 10px; }
    .code-preview {
      background: #0f172a; border: 1px solid #1e293b; border-radius: 12px;
      padding: 16px; font-family: 'JetBrains Mono', monospace; font-size: 0.85rem;
      color: #cbd5e1; white-space: pre-wrap; margin-top: 12px;
    }

    .tab-content { display: none; }
    .tab-content.active { display: block; }

    .search-box {
      padding: 12px 18px; border-radius: 12px; background: rgba(255,255,255,0.05);
      border: 1px solid var(--card-border); color: #fff; font-size: 0.95rem; width: 300px;
    }

    /* Grid for sources */
    .sources-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 18px; margin-bottom: 28px;
    }
    .source-card {
      background: var(--card-bg); border: 1px solid var(--card-border);
      border-radius: 18px; padding: 20px; backdrop-filter: blur(12px);
      display: flex; flex-direction: column; justify-content: space-between;
      transition: all 0.2s; position: relative;
    }
    .source-card:hover {
      border-color: rgba(56, 189, 248, 0.4); transform: translateY(-2px);
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    }
    .source-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
    .source-name { font-size: 1.15rem; font-weight: 800; color: #fff; }
    .source-details { font-size: 0.85rem; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px; }
  </style>
</head>
<body>

  <div id="loginModal">
    <div class="login-box">
      <div style="font-size: 40px; margin-bottom: 12px;">🔒</div>
      <h2>Private Admin Hub</h2>
      <p>Enter Master Password to Access Result Consensus Controls</p>
      <input type="password" id="passwordInput" class="input-field" placeholder="Enter Master Password..." autofocus>
      <button class="btn-primary" onclick="login()">Access Dashboard</button>
      <p id="loginError" style="color: var(--rose); margin-top: 12px; font-size: 0.85rem; display: none;"></p>
    </div>
  </div>

  <header>
    <div class="brand">
      <div class="brand-logo">⚡</div>
      <div>
        <div class="brand-title">Consensus Bridge Admin Hub</div>
        <div class="brand-subtitle">Multi-Bot • Market Whitelist • Verification Quorum</div>
      </div>
    </div>
    <div class="header-right">
      <div class="live-clock" id="clock">00:00:00 IST</div>
      <button onclick="logout()" style="background: rgba(255,255,255,0.05); border: 1px solid var(--card-border); color: var(--text-muted); padding: 8px 14px; border-radius: 10px; cursor: pointer; font-size: 0.85rem; font-weight: 600;">Logout</button>
    </div>
  </header>

  <div class="tabs-bar">
    <button class="tab-btn active" onclick="switchTab('unverified')">
      🔴 Live Queue & Force Verify <span class="tab-badge" id="pendingBadge">0</span>
    </button>
    <button class="tab-btn" onclick="switchTab('markets')">
      📋 Market Whitelist (<span id="enabledMarketsCount">0</span> ON)
    </button>
    <button class="tab-btn" onclick="switchTab('sources')">
      📡 Verification Sources & Quorum
    </button>
    <button class="tab-btn" onclick="switchTab('destinations')">
      🤖 Destination Bots & Groups
    </button>
    <button class="tab-btn" onclick="switchTab('manual')">
      ⚡ Manual Broadcast & Scraper
    </button>
    <button class="tab-btn" onclick="switchTab('khabarline')">
      🌐 Khabarline Website
    </button>
  </div>

  <main>
    <!-- Stats Row -->
    <div class="stats-grid">
      <div class="stat-card" style="--accent: #38bdf8;">
        <div class="stat-label">Total Received</div>
        <div class="stat-val" id="statTotalReceived">0</div>
        <div class="stat-sub">Across all live WhatsApp groups</div>
      </div>
      <div class="stat-card" style="--accent: #10b981;">
        <div class="stat-label">Verified Broadcasts</div>
        <div class="stat-val" id="statVerified" style="color: var(--emerald);">0</div>
        <div class="stat-sub">Delivered to 3 Telegram Bots</div>
      </div>
      <div class="stat-card" style="--accent: #f59e0b;">
        <div class="stat-label">Pending / Unverified</div>
        <div class="stat-val" id="statPending" style="color: var(--amber);">0</div>
        <div class="stat-sub">Awaiting quorum or admin action</div>
      </div>
      <div class="stat-card" style="--accent: #a855f7;">
        <div class="stat-label">Whitelisted Markets</div>
        <div class="stat-val" id="statMarketsCount">0</div>
        <div class="stat-sub">Only listed markets are processed</div>
      </div>
    </div>

    <!-- TAB 1: Live Unverified & Consensus Queue -->
    <div id="tab-unverified" class="tab-content active">
      <div class="section-header">
        <div class="section-title">
          <span>⚡ Live Unverified Candidates</span>
          <span style="font-size: 0.85rem; color: var(--text-muted); font-weight: 500;">(Click Force Verify to broadcast instantly)</span>
        </div>
        <button class="btn-primary" style="width: auto; padding: 10px 18px; font-size: 0.85rem;" onclick="fetchCandidates()">🔄 Refresh Queue</button>
      </div>

      <div id="unverifiedList">
        <!-- Rendered dynamically -->
      </div>

      <div class="section-header" style="margin-top: 36px;">
        <div class="section-title">📜 Recently Dispatched Results</div>
      </div>
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Market</th>
              <th>Session</th>
              <th>Result Value</th>
              <th>Sources / Matches</th>
              <th>Dispatched At</th>
            </tr>
          </thead>
          <tbody id="historyTableBody">
            <tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Loading history...</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- TAB 2: Whitelisted Markets Manager -->
    <div id="tab-markets" class="tab-content">
      <div class="section-header">
        <div class="section-title">
          <span>📋 Whitelisted Markets Management</span>
        </div>
        <div style="display: flex; gap: 10px;">
          <input type="text" id="marketSearch" class="search-box" placeholder="Search markets..." oninput="filterMarkets()">
          <button class="btn-primary" style="width: auto; padding: 10px 16px; background: var(--emerald);" onclick="toggleAllMarkets(true)">Enable All</button>
          <button class="btn-dismiss" style="padding: 10px 16px;" onclick="toggleAllMarkets(false)">Disable All</button>
          <button class="btn-primary" style="width: auto; padding: 10px 16px;" onclick="showAddMarketModal()">+ Add Market</button>
        </div>
      </div>

      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Enabled</th>
              <th>Market Name</th>
              <th>Live Value / Answer</th>
              <th>Open Time</th>
              <th>Close Time</th>
              <th>API Response Mode</th>
              <th>Type</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="marketsTableBody">
            <!-- Rendered dynamically -->
          </tbody>
        </table>
      </div>
    </div>

    <!-- TAB 3: Verification Sources & Quorum Network -->
    <div id="tab-sources" class="tab-content">
      <!-- Consensus Quorum Info Card -->
      <div class="bot-card" style="border-color: rgba(56, 189, 248, 0.3); background: linear-gradient(135deg, rgba(14, 165, 233, 0.08), rgba(15, 23, 42, 0.9));">
        <div class="bot-header">
          <div class="bot-title">
            <span>🛡️ Consensus Quorum & Anti-Collusion Rules</span>
          </div>
          <span class="badge-blue">2 DISTINCT OWNERS REQUIRED</span>
        </div>
        <p style="color: #cbd5e1; font-size: 0.95rem; line-height: 1.6;">
          To prevent false updates and manipulation, result verification requires <b>at least 2 independent owner entities</b> to report the exact same result numbers within a <b>5-minute (300-second) window</b>. Sources belonging to the same owner network (e.g. Channel + Group of Prakash) count as <b>1 single vote</b> and cannot verify each other.
        </p>
      </div>

      <!-- WhatsApp Sources Section -->
      <div class="section-header" style="margin-top: 24px;">
        <div class="section-title">
          <span>🟢 Live Monitored WhatsApp Channels & Groups</span>
        </div>
      </div>
      <div class="sources-grid" id="whatsappSourcesGrid">
        <!-- Rendered dynamically -->
      </div>

      <!-- Scrapers Section -->
      <div class="section-header" style="margin-top: 16px;">
        <div class="section-title">
          <span>🌐 Automated Scraper Verification Feeds</span>
        </div>
      </div>
      <div class="sources-grid" id="scrapersGrid">
        <!-- Rendered dynamically -->
      </div>

      <!-- Owner Entity Partitions -->
      <div class="section-header" style="margin-top: 16px;">
        <div class="section-title">
          <span>👥 Independent Owner Entity Partitions</span>
        </div>
      </div>
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Owner Entity ID</th>
              <th>Entity Display Name</th>
              <th>Assigned Ingestion Sources</th>
              <th>Quorum Weight</th>
            </tr>
          </thead>
          <tbody id="ownerEntitiesTableBody">
            <!-- Rendered dynamically -->
          </tbody>
        </table>
      </div>
    </div>

    <!-- TAB 4: Destination Bots & Groups Preview -->
    <div id="tab-destinations" class="tab-content">
      <div class="section-header">
        <div class="section-title">🤖 Active Production Destinations (Locked Mappings)</div>
      </div>

      <div id="destinationsList">
        <!-- Rendered dynamically -->
      </div>
    </div>

    <!-- TAB 5: Manual Broadcast & Scraper -->
    <div id="tab-manual" class="tab-content">
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
        <!-- Manual Result Form -->
        <div class="bot-card">
          <div class="bot-title">📢 Emergency Manual Result Broadcast</div>
          <p style="color: var(--text-muted); font-size: 0.9rem; margin-top: 4px; margin-bottom: 20px;">
            Manually broadcast a verified result to all 3 Telegram channels/groups immediately.
          </p>

          <label style="font-size: 0.85rem; font-weight: 700; color: var(--text-muted); margin-bottom: 6px; display: block;">MARKET NAME</label>
          <input type="text" id="manualMarket" class="input-field" placeholder="e.g. KALYAN, MAIN BAZAR, MILAN DAY">

          <label style="font-size: 0.85rem; font-weight: 700; color: var(--text-muted); margin-bottom: 6px; display: block;">SESSION</label>
          <select id="manualSession" class="input-field">
            <option value="OPEN">OPEN</option>
            <option value="CLOSE">CLOSE</option>
            <option value="JODI">JODI</option>
          </select>

          <label style="font-size: 0.85rem; font-weight: 700; color: var(--text-muted); margin-bottom: 6px; display: block;">RESULT VALUE</label>
          <input type="text" id="manualValue" class="input-field" placeholder="e.g. 789-45-168 or 123-6*">

          <button class="btn-primary" style="margin-top: 10px;" onclick="broadcastManualResult()">🚀 Broadcast Verified Result Now</button>
        </div>

        <!-- Scraper Diagnostics -->
        <div class="bot-card">
          <div class="bot-title">🌐 Scraper Controls & Health</div>
          <p style="color: var(--text-muted); font-size: 0.9rem; margin-top: 4px; margin-bottom: 20px;">
            Trigger on-demand website scrapes and verify scraper statuses.
          </p>

          <div style="display: flex; flex-direction: column; gap: 14px;">
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: rgba(255,255,255,0.03); border-radius: 12px;">
              <span>DPBoss.boston Live Poller</span>
              <span class="badge-verified">ACTIVE (30s)</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: rgba(255,255,255,0.03); border-radius: 12px;">
              <span>Google Sheets 24x7 Poller</span>
              <span class="badge-verified">ACTIVE (30s)</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: rgba(255,255,255,0.03); border-radius: 12px;">
              <span>Scraper-Hub On-Demand Job</span>
              <span class="badge-verified">READY</span>
            </div>

            <button class="btn-primary" style="background: linear-gradient(135deg, #6366f1, #4f46e5); margin-top: 16px;" onclick="triggerScraper()">
              🌐 Trigger Instant Scraper Run
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 6: Khabarline Website Manager -->
    <div id="tab-khabarline" class="tab-content">
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px;">
        <!-- Khabarline Status & Quick Actions -->
        <div class="bot-card">
          <div class="bot-title">🌐 Khabarline.site Live Website</div>
          <p style="color: var(--text-muted); font-size: 0.9rem; margin-top: 4px; margin-bottom: 16px;">
            Full 1:1 replica of DPBoss layout publishing real-time verified consensus results.
          </p>

          <div style="display: flex; flex-direction: column; gap: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: rgba(255,255,255,0.03); border-radius: 12px;">
              <span>Public Web Server URL</span>
              <a id="khabarlineUrlLink" href="http://localhost:8080" target="_blank" style="color: var(--accent-cyan); font-weight: 700; text-decoration: underline;">
                http://localhost:8080 ↗
              </a>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: rgba(255,255,255,0.03); border-radius: 12px;">
              <span>Live Website Stream (SSE)</span>
              <span class="badge-verified">ACTIVE</span>
            </div>

            <div style="display: flex; gap: 10px; margin-top: 8px;">
              <button class="btn-primary" style="background: linear-gradient(135deg, #10b981, #059669); flex: 1;" onclick="syncKhabarlineFromDpboss()">
                ⚡ 1-Click Sync All DPBoss Results
              </button>
              <button class="btn-secondary" onclick="fetchKhabarlineData()">
                🔄 Refresh
              </button>
            </div>
          </div>
        </div>

        <!-- Golden Ank & Lucky Number Editor -->
        <div class="bot-card">
          <div class="bot-title">🎯 Today Lucky Number (Golden Ank)</div>
          <p style="color: var(--text-muted); font-size: 0.9rem; margin-top: 4px; margin-bottom: 16px;">
            Update the Golden Ank and Final Ank displayed prominently on Khabarline.site.
          </p>

          <label style="font-size: 0.85rem; font-weight: 700; color: var(--text-muted); margin-bottom: 6px; display: block;">GOLDEN ANK</label>
          <div style="display: flex; gap: 10px; margin-bottom: 14px;">
            <input type="text" id="khabarlineGoldenAnkInput" class="input-field" placeholder="e.g. 2-7-3-8" style="margin-bottom: 0;">
            <button class="btn-primary" style="width: auto; padding: 0 18px;" onclick="saveKhabarlineGoldenAnk()">Save</button>
          </div>

          <label style="font-size: 0.85rem; font-weight: 700; color: var(--text-muted); margin-bottom: 6px; display: block;">QUICK PUBLISH MARKET RESULT</label>
          <div style="display: grid; grid-template-columns: 1fr 1fr auto; gap: 10px;">
            <input type="text" id="khabarlineMarketNameInput" class="input-field" placeholder="Market (e.g. KALYAN)" style="margin-bottom: 0;">
            <input type="text" id="khabarlineMarketValInput" class="input-field" placeholder="Value (e.g. 156-27-133)" style="margin-bottom: 0;">
            <button class="btn-primary" style="width: auto; padding: 0 16px;" onclick="saveKhabarlineMarketOverride()">Publish</button>
          </div>
        </div>
      </div>

      <!-- App Links, Ads & Social Promotions Manager -->
      <div class="bot-card" style="margin-bottom: 24px; border: 1px solid rgba(56, 189, 248, 0.3);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 12px;">
          <div>
            <div class="bot-title" style="color: #38bdf8;">📲 App Links, Ads & Channel Promotions Manager</div>
            <p style="color: var(--text-muted); font-size: 0.88rem; margin-top: 2px; margin-bottom: 0;">
              Manage the Play App download link (APK), promotional banners, payout rates, and social channels on Khabarline.site.
            </p>
          <button class="btn-primary" style="width: auto; padding: 8px 24px; font-weight: 800; background: linear-gradient(135deg, #0284c7, #0369a1);" onclick="saveKhabarlineSettings()">
            💾 Save All Promotion Settings
          </button>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          <!-- Master Toggle to Show / Hide App Promotion -->
          <div style="grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; background: rgba(56, 189, 248, 0.08); padding: 14px 18px; border-radius: 8px; border: 1px solid rgba(56, 189, 248, 0.25);">
            <div>
              <div style="font-weight: 800; font-size: 1rem; color: #f8fafc; display: flex; align-items: center; gap: 8px;">
                <span>📢 Show App Promotion & Sponsored Ads</span>
                <span id="promoStatusBadge" style="padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700; background: #059669; color: #fff;">VISIBLE</span>
              </div>
              <div style="font-size: 0.82rem; color: #94a3b8; margin-top: 3px;">
                Turn OFF to completely hide the top Play App banner, all sponsored ads, and the floating Play App button across Khabarline.site.
              </div>
            </div>
            <label style="position: relative; display: inline-block; width: 56px; height: 30px; cursor: pointer; margin: 0;">
              <input type="checkbox" id="khabarlinePromoEnabledToggle" style="opacity: 0; width: 0; height: 0;" onchange="updatePromoStatusBadge()">
              <span id="khabarlinePromoSlider" style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #059669; transition: .3s; border-radius: 30px;">
                <span id="khabarlinePromoKnob" style="position: absolute; height: 22px; width: 22px; left: 30px; bottom: 4px; background-color: white; transition: .3s; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></span>
              </span>
            </label>
          </div>

          <div>
            <label style="font-size: 0.82rem; font-weight: 700; color: #94a3b8; margin-bottom: 4px; display: block;">PLAY APP APK DOWNLOAD LINK</label>
            <input type="text" id="khabarlineApkUrlInput" class="input-field" placeholder="https://example.com/play-app.apk" style="margin-bottom: 0;">
          </div>

          <div>
            <label style="font-size: 0.82rem; font-weight: 700; color: #94a3b8; margin-bottom: 4px; display: block;">WHATSAPP CHANNEL URL</label>
            <input type="text" id="khabarlineWaChannelInput" class="input-field" placeholder="https://whatsapp.com/channel/..." style="margin-bottom: 0;">
          </div>

          <div>
            <label style="font-size: 0.82rem; font-weight: 700; color: #94a3b8; margin-bottom: 4px; display: block;">TELEGRAM CHANNEL / SUPPORT URL</label>
            <input type="text" id="khabarlineTgChannelInput" class="input-field" placeholder="https://t.me/..." style="margin-bottom: 0;">
          </div>

          <div>
            <label style="font-size: 0.82rem; font-weight: 700; color: #94a3b8; margin-bottom: 4px; display: block;">PROMOTIONAL BADGE / TAG</label>
            <input type="text" id="khabarlineBannerTagInput" class="input-field" placeholder="🔥 100% TRUSTED ONLINE MATKA PLAY APP 🔥" style="margin-bottom: 0;">
          </div>

          <div style="grid-column: 1 / -1;">
            <label style="font-size: 0.82rem; font-weight: 700; color: #94a3b8; margin-bottom: 4px; display: block;">PROMOTIONAL BANNER HEADLINE</label>
            <input type="text" id="khabarlineBannerHeadlineInput" class="input-field" placeholder="🎰 सबसे भरोसेमंद Online Matka Play App 🎰" style="margin-bottom: 0;">
          </div>

          <div style="grid-column: 1 / -1;">
            <label style="font-size: 0.82rem; font-weight: 700; color: #94a3b8; margin-bottom: 4px; display: block;">PROMOTIONAL SUBHEADLINE</label>
            <input type="text" id="khabarlineBannerSubheadlineInput" class="input-field" placeholder="⚡ 1 मिनट में Fast Auto Deposit & 24x7 Instant Withdrawal • 100% Safe & Trusted" style="margin-bottom: 0;">
          </div>

          <div>
            <label style="font-size: 0.82rem; font-weight: 700; color: #94a3b8; margin-bottom: 4px; display: block;">PAYOUT RATES TEXT</label>
            <input type="text" id="khabarlineBannerRatesInput" class="input-field" placeholder="🎯 Single Ank 10 का 95 • Jodi 10 का 950 • Single Patti 10 का 1400" style="margin-bottom: 0;">
          </div>

          <div>
            <label style="font-size: 0.82rem; font-weight: 700; color: #94a3b8; margin-bottom: 4px; display: block;">DOWNLOAD BUTTON TEXT</label>
            <input type="text" id="khabarlineBannerBtnTextInput" class="input-field" placeholder="📲 Download Play App (APK)" style="margin-bottom: 0;">
          </div>

          <div style="grid-column: 1 / -1;">
            <label style="font-size: 0.82rem; font-weight: 700; color: #94a3b8; margin-bottom: 4px; display: block;">CONTACT FOR PROMOTION / ADS LINK</label>
            <input type="text" id="khabarlineBannerContactInput" class="input-field" placeholder="https://t.me/... or https://wa.me/..." style="margin-bottom: 0;">
          </div>
        </div>
      </div>

      <!-- Special External Markets Control Panel (26 Markets) -->
      <div class="bot-card" style="margin-bottom: 24px; border: 1px solid rgba(245, 158, 11, 0.4); background: rgba(245, 158, 11, 0.03);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 12px; flex-wrap: wrap; gap: 10px;">
          <div>
            <div class="bot-title" style="color: #fbbf24; display: flex; align-items: center; gap: 8px;">
              <span>🎯 Special External Markets (26 Markets) Result & Chart Manager</span>
              <span style="background: rgba(245, 158, 11, 0.2); color: #fbbf24; font-size: 0.75rem; padding: 2px 8px; border-radius: 4px; font-weight: 700;">EXTERNAL SITES</span>
            </div>
            <p style="color: var(--text-muted); font-size: 0.88rem; margin-top: 2px; margin-bottom: 0;">
              Historical Jodi & Panel charts are scraped directly from BharatMatka, ShreeMatka, Rama567, and MangalGames. Results and timings are updated by you directly from this panel.
            </p>
          </div>
          <div style="display: flex; gap: 10px;">
            <button class="btn-primary" style="width: auto; padding: 8px 18px; font-weight: 700; background: linear-gradient(135deg, #d97706, #b45309);" onclick="syncBharatmatkaCharts()" id="btnSyncBharatmatka">
              📥 Sync All External Charts
            </button>
          </div>
        </div>

        <div class="table-container" style="margin-bottom: 0;">
          <table>
            <thead>
              <tr>
                <th>Market Name</th>
                <th>Timings (Open &rarr; Close)</th>
                <th>Current Result</th>
                <th>Quick Result Update</th>
                <th>View Charts</th>
              </tr>
            </thead>
            <tbody id="sixMarketsTableBody">
              <!-- Rendered dynamically -->
            </tbody>
          </table>
        </div>
      </div>

      <!-- Published Markets Table -->
      <div class="section-header">
        <div class="section-title">📊 Published Market Results on Khabarline.site</div>
        <input type="text" id="khabarlineSearch" class="input-field" placeholder="🔍 Search markets on site..." style="width: 260px; margin-bottom: 0;" oninput="filterKhabarlineTable()">
      </div>
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Market Name</th>
              <th>Timings</th>
              <th>Current Result</th>
              <th>Decomposed (P-J-P)</th>
              <th>Verification Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody id="khabarlineMarketsTableBody">
            <!-- Rendered dynamically -->
          </tbody>
        </table>
      </div>
    </div>
  </main>

  <script>
    let authToken = localStorage.getItem('dashboard_token') || '';
    let allMarkets = [];

    // Clock
    setInterval(() => {
      const now = new Date();
      document.getElementById('clock').innerText = now.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour12: false }) + ' IST';
    }, 1000);

    async function apiCall(endpoint, options = {}) {
      const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
      if (authToken) headers['Authorization'] = 'Bearer ' + authToken;
      const res = await fetch(endpoint, { ...options, headers });
      if (res.status === 401) {
        document.getElementById('loginModal').style.display = 'flex';
        throw new Error('Unauthorized');
      }
      return res.json();
    }

    async function login() {
      const password = document.getElementById('passwordInput').value;
      const errEl = document.getElementById('loginError');
      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password })
        });
        const data = await res.json();
        if (data.success) {
          authToken = data.token;
          localStorage.setItem('dashboard_token', authToken);
          document.getElementById('loginModal').style.display = 'none';
          initDashboard();
        } else {
          errEl.innerText = data.error || 'Invalid password';
          errEl.style.display = 'block';
        }
      } catch (e) {
        errEl.innerText = 'Login connection error';
        errEl.style.display = 'block';
      }
    }

    function logout() {
      localStorage.removeItem('dashboard_token');
      authToken = '';
      document.getElementById('loginModal').style.display = 'flex';
    }

    function switchTab(tabId) {
      document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      event.currentTarget.classList.add('active');
      document.getElementById('tab-' + tabId).classList.add('active');

      if (tabId === 'markets') fetchMarkets();
      if (tabId === 'sources') fetchSources();
      if (tabId === 'destinations') fetchDestinations();
      if (tabId === 'unverified') fetchCandidates();
      if (tabId === 'khabarline') fetchKhabarlineData();
    }

    async function initDashboard() {
      try {
        await fetchStatus();
        await fetchCandidates();
        await fetchMarkets();
        connectSse();
      } catch (e) {
        console.error('Init error:', e);
      }
    }

    function connectSse() {
      const evtSource = new EventSource('/api/events?token=' + encodeURIComponent(authToken));
      evtSource.addEventListener('consensus_reached', (e) => {
        fetchStatus();
        fetchCandidates();
      });
      evtSource.addEventListener('market_updated', () => {
        fetchMarkets();
      });
    }

    async function fetchStatus() {
      const data = await apiCall('/api/status');
      document.getElementById('statTotalReceived').innerText = data.stats.totalMessagesReceived;
      document.getElementById('statVerified').innerText = data.stats.totalConsensusReached;
      document.getElementById('statPending').innerText = data.pendingCount;
      document.getElementById('pendingBadge').innerText = data.pendingCount;
      document.getElementById('statMarketsCount').innerText = data.enabledMarkets + ' / ' + data.totalMarkets;
      document.getElementById('enabledMarketsCount').innerText = data.enabledMarkets;
    }

    async function fetchCandidates() {
      const data = await apiCall('/api/candidates');
      const container = document.getElementById('unverifiedList');
      container.innerHTML = '';

      if (!data.pending || data.pending.length === 0) {
        container.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--text-muted); background: var(--card-bg); border-radius: 20px; border: 1px solid var(--card-border);">✅ No pending unverified results. All results are in consensus or resolved.</div>';
      } else {
        data.pending.forEach(c => {
          const card = document.createElement('div');
          card.className = 'candidate-card';
          const sourcesStr = c.matches.map(m => m.groupName || m.groupJid || 'Source').join(', ');
          card.innerHTML = \`
            <div class="candidate-info">
              <div class="candidate-session-tag">\${c.session || 'GENERAL'}</div>
              <div class="candidate-market">\${c.marketName}</div>
              <div class="candidate-val">\${c.value}</div>
              <div class="candidate-sources">📡 <b>Sources:</b> \${sourcesStr}</div>
            </div>
            <div class="candidate-actions">
              <button class="btn-verify-force" onclick="forceVerify('\${c.key}')">⚡ Force Verify & Broadcast</button>
              <button class="btn-dismiss" onclick="dismissCandidate('\${c.key}')">❌ Dismiss</button>
            </div>
          \`;
          container.appendChild(card);
        });
      }

      // History table
      const tbody = document.getElementById('historyTableBody');
      tbody.innerHTML = '';
      if (!data.history || data.history.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No history recorded yet today.</td></tr>';
      } else {
        data.history.forEach(h => {
          const tr = document.createElement('tr');
          const statusBadge = h.isVerified
            ? '<span class="badge-verified">✅ Verified</span>'
            : '<span class="badge-unverified">❌ Unverified</span>';
          const timeStr = new Date(h.dispatchedAt).toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour12: true });
          const sources = h.matches.map(m => m.groupName || m.groupJid || 'Source').join(', ');
          tr.innerHTML = \`
            <td>\${statusBadge}</td>
            <td><b>\${h.marketName}</b></td>
            <td>\${h.session || 'GENERAL'}</td>
            <td><code style="font-family: 'JetBrains Mono'; font-weight: 700; color: #38bdf8;">\${h.value}</code></td>
            <td style="font-size: 0.85rem; color: var(--text-muted);">\${sources}</td>
            <td style="font-size: 0.85rem;">\${timeStr}</td>
          \`;
          tbody.appendChild(tr);
        });
      }
    }

    async function forceVerify(key) {
      if (!confirm('Are you sure you want to FORCE VERIFY and BROADCAST this result to all 3 Telegram channels/groups?')) return;
      await apiCall('/api/candidates/verify', { method: 'POST', body: JSON.stringify({ key }) });
      fetchCandidates();
      fetchStatus();
    }

    async function dismissCandidate(key) {
      await apiCall('/api/candidates/dismiss', { method: 'POST', body: JSON.stringify({ key }) });
      fetchCandidates();
      fetchStatus();
    }

    async function fetchMarkets() {
      const data = await apiCall('/api/markets');
      allMarkets = data.markets;
      renderMarketsTable(allMarkets);
      document.getElementById('enabledMarketsCount').innerText = data.enabledCount;
    }

    function renderMarketsTable(markets) {
      const tbody = document.getElementById('marketsTableBody');
      tbody.innerHTML = '';
      markets.forEach(m => {
        const tr = document.createElement('tr');
        const isAnswer = m.responseFormat === 'answer';
        tr.innerHTML = \`
          <td>
            <label class="switch">
              <input type="checkbox" \${m.enabled ? 'checked' : ''} onchange="toggleMarket('\${m.name}', this.checked)">
              <span class="slider"></span>
            </label>
          </td>
          <td><b style="font-size: 0.95rem;">\${m.name}</b></td>
          <td>
            <span style="font-family: monospace; font-size: 0.92rem; font-weight: 800; color: \${isAnswer ? '#c084fc' : '#38bdf8'}; background: rgba(0,0,0,0.4); padding: 4px 10px; border-radius: 6px; border: 1px solid \${isAnswer ? 'rgba(192, 132, 252, 0.4)' : 'rgba(56, 189, 248, 0.4)'}; display: inline-block;">
              \${m.value || '***-**-***'}
            </span>
          </td>
          <td>\${m.openTime || '-'}</td>
          <td>\${m.closeTime || '-'}</td>
          <td>
            <button onclick="toggleMarketFormat('\${m.name}', '\${isAnswer ? 'result' : 'answer'}')"
                    style="background: \${isAnswer ? 'linear-gradient(135deg, #a855f7, #7e22ce)' : 'linear-gradient(135deg, #0ea5e9, #0284c7)'};
                           color: #fff; border: 1px solid rgba(255,255,255,0.3); border-radius: 6px; padding: 5px 12px; font-weight: 800; font-size: 0.8rem; cursor: pointer; transition: all 0.2s; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"
                    title="Click to toggle between Result and Answer mode">
              \${isAnswer ? '🎯 ANSWER' : '📊 RESULT'}
            </button>
          </td>
          <td>\${m.isCustom ? '<span style="color: var(--purple); font-size: 0.8rem; font-weight: 700;">CUSTOM</span>' : '<span style="color: var(--text-muted); font-size: 0.8rem;">STANDARD</span>'}</td>
          <td>
            <button onclick="editMarketResult('\${m.name}', '\${m.value || ''}')"
                    style="background: linear-gradient(135deg, rgba(56, 189, 248, 0.2), rgba(14, 165, 233, 0.3)); border: 1px solid rgba(56, 189, 248, 0.5); color: #38bdf8; border-radius: 6px; padding: 5px 10px; cursor: pointer; font-weight: 700; font-size: 0.78rem; margin-right: 6px;"
                    title="Enter / Update Result or Answer for this market">
              ✏️ Enter \${isAnswer ? 'Answer' : 'Result'}
            </button>
            <button onclick="deleteMarket('\${m.name}')" style="background: none; border: none; color: var(--rose); cursor: pointer; font-weight: 700; font-size: 0.9rem;" title="Delete market">🗑️</button>
          </td>
        \`;
        tbody.appendChild(tr);
      });
    }

    async function editMarketResult(marketName, currentValue) {
      const isAnswer = (allMarkets || []).find(m => m.name === marketName)?.responseFormat === 'answer';
      const promptLabel = isAnswer
        ? 'Enter ANSWER value for ' + marketName + ' (e.g. "BSRM" or "58"):'
        : 'Enter RESULT value for ' + marketName + ' (e.g. "123-6" or "156-27-133"):';
      const defaultVal = currentValue && currentValue !== '***-**-***' ? currentValue : '';
      const val = prompt(promptLabel, defaultVal);
      if (val === null) return;
      if (isAnswer) {
        await apiCall('/api/markets/set-answer', {
          method: 'POST',
          body: JSON.stringify({ name: marketName, answer: val.trim() })
        });
      } else {
        if (!val.trim()) return;
        await apiCall('/api/khabarline/update-market', {
          method: 'POST',
          body: JSON.stringify({ marketName: marketName, value: val.trim(), isVerified: true })
        });
      }
      fetchMarkets();
      fetchStatus();
    }

    function filterMarkets() {
      const q = document.getElementById('marketSearch').value.toUpperCase();
      const filtered = allMarkets.filter(m => m.name.includes(q));
      renderMarketsTable(filtered);
    }

    async function toggleMarket(name, enabled) {
      await apiCall('/api/markets/toggle', { method: 'POST', body: JSON.stringify({ name, enabled }) });
      fetchStatus();
    }

    async function toggleMarketFormat(name, format) {
      await apiCall('/api/markets/set-format', { method: 'POST', body: JSON.stringify({ name, format }) });
      fetchMarkets();
    }

    async function toggleAllMarkets(enabled) {
      await apiCall('/api/markets/toggle-all', { method: 'POST', body: JSON.stringify({ enabled }) });
      fetchMarkets();
      fetchStatus();
    }

    async function deleteMarket(name) {
      if (!confirm('Remove market ' + name + ' from whitelist?')) return;
      await apiCall('/api/markets/delete', { method: 'POST', body: JSON.stringify({ name }) });
      fetchMarkets();
    }

    function showAddMarketModal() {
      const name = prompt('Enter Market Name (e.g. "KALYAN NIGHT"):');
      if (!name) return;
      const openTime = prompt('Enter Open Time (e.g. "9:45 PM"):') || '';
      const closeTime = prompt('Enter Close Time (e.g. "11:45 PM"):') || '';
      apiCall('/api/markets/add', { method: 'POST', body: JSON.stringify({ name: name.trim().toUpperCase(), openTime, closeTime, enabled: true }) })
        .then(() => fetchMarkets());
    }

    async function fetchSources() {
      const data = await apiCall('/api/sources');

      // 1. WhatsApp Sources
      const waContainer = document.getElementById('whatsappSourcesGrid');
      waContainer.innerHTML = '';
      (data.whatsappSources || []).forEach(src => {
        const div = document.createElement('div');
        div.className = 'source-card';
        const typeBadge = src.type === 'Channel'
          ? '<span class="badge-purple">📢 Channel Stream</span>'
          : '<span class="badge-blue">👥 WhatsApp Group</span>';
        div.innerHTML = \`
          <div>
            <div class="source-head">
              <div class="source-name">\${src.name}</div>
              \${typeBadge}
            </div>
            <div class="source-details">
              <div><b>JID:</b> <code style="font-family: 'JetBrains Mono'; font-size: 0.75rem; color: #38bdf8;">\${src.jid}</code></div>
              <div><b>Owner Entity:</b> <code style="color: #a855f7; font-weight: 700;">\${src.ownerId}</code></div>
            </div>
          </div>
          <div style="margin-top: 14px; display: flex; justify-content: space-between; align-items: center;">
            <span class="badge-verified">🟢 LIVE SUBSCRIBED</span>
            <span style="font-size: 0.75rem; color: var(--text-muted);">Real-Time Ingestion</span>
          </div>
        \`;
        waContainer.appendChild(div);
      });

      // 2. Scrapers
      const scrapersContainer = document.getElementById('scrapersGrid');
      scrapersContainer.innerHTML = '';
      (data.scrapers || []).forEach(sc => {
        const div = document.createElement('div');
        div.className = 'source-card';
        const badge = sc.status === 'ACTIVE' || sc.status === 'READY'
          ? '<span class="badge-verified">🟢 ' + sc.status + '</span>'
          : '<span class="badge-unverified">⚪ ' + sc.status + '</span>';
        div.innerHTML = \`
          <div>
            <div class="source-head">
              <div class="source-name">\${sc.name}</div>
              <span class="badge-blue">\${sc.type}</span>
            </div>
            <p style="font-size: 0.85rem; color: #cbd5e1; margin-bottom: 12px; line-height: 1.4;">\${sc.description}</p>
            <div class="source-details">
              <div><b>Target:</b> <code style="font-family: 'JetBrains Mono'; font-size: 0.75rem; color: #38bdf8;">\${sc.target}</code></div>
              <div><b>Assigned Owner:</b> <code style="color: #a855f7; font-weight: 700;">\${sc.ownerId}</code></div>
              <div><b>Poll Frequency:</b> \${sc.pollInterval || 'On-Demand'}</div>
            </div>
          </div>
          <div style="margin-top: 14px; display: flex; justify-content: space-between; align-items: center;">
            \${badge}
            <span style="font-size: 0.75rem; color: var(--text-muted);">Auto-Verification Engine</span>
          </div>
        \`;
        scrapersContainer.appendChild(div);
      });

      // 3. Owner Entities Table
      const entitiesTbody = document.getElementById('ownerEntitiesTableBody');
      entitiesTbody.innerHTML = '';
      Object.entries(data.ownerEntities || {}).forEach(([id, entity]) => {
        const tr = document.createElement('tr');
        const sourcesList = entity.sources.map(s => \`<b>\${s.name}</b> (\${s.type})\`).join(', ');
        tr.innerHTML = \`
          <td><code style="font-family: 'JetBrains Mono'; font-weight: 700; color: #a855f7;">\${id}</code></td>
          <td><b>\${entity.label}</b></td>
          <td style="font-size: 0.85rem; color: var(--text-muted);">\${sourcesList}</td>
          <td><span class="badge-verified">1 Distinct Vote</span></td>
        \`;
        entitiesTbody.appendChild(tr);
      });
    }

    async function fetchDestinations() {
      const data = await apiCall('/api/groups');
      const container = document.getElementById('destinationsList');
      container.innerHTML = '';

      data.approved.forEach(g => {
        const div = document.createElement('div');
        div.className = 'bot-card';
        div.innerHTML = \`
          <div class="bot-header">
            <div class="bot-title">
              <span>\${g.type === 'channel' ? '📢' : '👥'}</span>
              <span>\${g.title}</span>
            </div>
            <span class="badge-verified">ACTIVE DESTINATION</span>
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; font-size: 0.9rem;">
            <div><b>Chat ID:</b> <code style="color: #38bdf8;">\${g.chatId}</code></div>
            <div><b>Bot Username:</b> <code style="color: #a855f7;">@\${g.botUsername || 'default'}</code></div>
            <div><b>Bot Name:</b> \${g.botName || 'Default Bot'}</div>
          </div>
          <div class="code-preview">\${g.customTemplate || '(Default 3-line format)'}</div>
          \${g.buttonText && g.buttonUrl ? '<div style="margin-top: 10px; font-size: 0.85rem;">🔗 <b>Button:</b> [' + g.buttonText + '] -> ' + g.buttonUrl + '</div>' : ''}
        \`;
        container.appendChild(div);
      });
    }

    async function broadcastManualResult() {
      const marketName = document.getElementById('manualMarket').value.trim();
      const session = document.getElementById('manualSession').value;
      const value = document.getElementById('manualValue').value.trim();
      if (!marketName || !value) {
        alert('Please fill market name and result value.');
        return;
      }
      if (!confirm('Broadcast result ' + marketName + ' (' + session + ') = ' + value + ' to ALL live Telegram groups?')) return;
      await apiCall('/api/manual-broadcast', { method: 'POST', body: JSON.stringify({ marketName, session, value }) });
      alert('Broadcast dispatched successfully!');
      fetchCandidates();
      fetchStatus();
    }

    async function triggerScraper() {
      await apiCall('/api/scraper/trigger', { method: 'POST' });
      alert('Scraper execution triggered!');
    }

    // Khabarline JS Management Functions
    let khabarlineMarketsList = [];

    async function fetchKhabarlineData() {
      try {
        const data = await apiCall('/api/khabarline/data');
        if (data.state) {
          if (data.state.goldenAnk) {
            document.getElementById('khabarlineGoldenAnkInput').value = data.state.goldenAnk;
          }
          if (data.state.apkUrl) {
            document.getElementById('khabarlineApkUrlInput').value = data.state.apkUrl;
          }
          if (data.state.whatsappChannelUrl) {
            document.getElementById('khabarlineWaChannelInput').value = data.state.whatsappChannelUrl;
          }
          if (data.state.telegramChannelUrl) {
            document.getElementById('khabarlineTgChannelInput').value = data.state.telegramChannelUrl;
          }
          const banner = data.state.playAppBanner || {};
          const isPromoEnabled = data.state.showAppPromotion !== false && banner.enabled !== false;
          const promoToggle = document.getElementById('khabarlinePromoEnabledToggle');
          if (promoToggle) {
            promoToggle.checked = isPromoEnabled;
            updatePromoStatusBadge();
          }

          document.getElementById('khabarlineBannerTagInput').value = banner.tag || '🔥 100% TRUSTED ONLINE MATKA PLAY APP 🔥';
          document.getElementById('khabarlineBannerHeadlineInput').value = banner.headline || '🎰 सबसे भरोसेमंद Online Matka Play App 🎰';
          document.getElementById('khabarlineBannerSubheadlineInput').value = banner.subheadline || '⚡ 1 मिनट में Fast Auto Deposit & 24x7 Instant Withdrawal • 100% Safe & Trusted';
          document.getElementById('khabarlineBannerRatesInput').value = banner.ratesText || '🎯 Single Ank 10 का 95 • Jodi 10 का 950 • Single Patti 10 का 1400';
          document.getElementById('khabarlineBannerBtnTextInput').value = banner.buttonText || '📲 Download Play App (APK)';
          document.getElementById('khabarlineBannerContactInput').value = banner.contactForAdsUrl || '';

          if (data.config && data.config.port) {
            const link = document.getElementById('khabarlineUrlLink');
            const port = data.config.port;
            link.href = 'http://' + window.location.hostname + ':' + port;
            link.innerText = 'http://' + window.location.hostname + ':' + port + ' ↗';
          }
          khabarlineMarketsList = Object.values(data.state.markets || {}).sort((a, b) => (a.order || 999) - (b.order || 999));
          renderKhabarlineTable(khabarlineMarketsList);
          renderSixMarketsTable(data.state.markets || {});
        }
      } catch (err) {
        console.error('Failed to fetch Khabarline data:', err);
      }
    }

    function updatePromoStatusBadge() {
      const toggle = document.getElementById('khabarlinePromoEnabledToggle');
      if (!toggle) return;
      const isChecked = toggle.checked;
      const badge = document.getElementById('promoStatusBadge');
      const slider = document.getElementById('khabarlinePromoSlider');
      const knob = document.getElementById('khabarlinePromoKnob');
      if (badge && slider && knob) {
        if (isChecked) {
          badge.innerText = 'VISIBLE';
          badge.style.background = '#059669';
          slider.style.backgroundColor = '#059669';
          knob.style.left = '30px';
        } else {
          badge.innerText = 'HIDDEN';
          badge.style.background = '#dc2626';
          slider.style.backgroundColor = '#334155';
          knob.style.left = '4px';
        }
      }
    }

    const SPECIAL_MARKET_NAMES = [
      'SUBHODAYA',
      'TRIVENI MORNING',
      'LOTUS MORNING',
      'BAHUBALI',
      'SWARN ANDHRA',
      'MAHALAXMI',
      'SITARANI MORNING',
      'SITARA MORNING',
      'MADHYANA',
      'LOTUS DAY',
      'SITARANI DAY',
      'NTR BAZAR',
      'TRIVENI DAY',
      'SWARN ANDHRA DAY',
      'LEELA DAY',
      'PUSPA DAY',
      'SITARA DAY',
      'SITARA',
      'LOTUS NIGHT',
      'SWARN ANDHRA NIGHT',
      'PUSPA NIGHT',
      'LEELA NIGHT',
      'SHREEVALLI NIGHT',
      'SITARA NIGHT',
      'SITARANI NIGHT',
      'RAAT RANI'
    ];
    const SIX_MARKET_NAMES = SPECIAL_MARKET_NAMES;

    const EXTERNAL_MARKET_SOURCES = {
      'SUBHODAYA': 'MANGALGAMES',
      'TRIVENI MORNING': 'MANGALGAMES',
      'LOTUS MORNING': 'SHREEMATKA',
      'BAHUBALI': 'MANGALGAMES',
      'SWARN ANDHRA': 'BHARATMATKA',
      'MAHALAXMI': 'MANGALGAMES',
      'MADHYANA': 'MANGALGAMES',
      'LOTUS DAY': 'SHREEMATKA',
      'NTR BAZAR': 'BHARATMATKA',
      'TRIVENI DAY': 'MANGALGAMES',
      'SWARN ANDHRA DAY': 'BHARATMATKA',
      'LEELA DAY': 'SHREEMATKA',
      'PUSPA DAY': 'MANGALGAMES',
      'SITARA': 'SHREEMATKA',
      'LOTUS NIGHT': 'SHREEMATKA',
      'SWARN ANDHRA NIGHT': 'BHARATMATKA',
      'PUSPA NIGHT': 'MANGALGAMES',
      'LEELA NIGHT': 'SHREEMATKA',
      'SHREEVALLI NIGHT': 'SHREEMATKA',
      'RAAT RANI': 'SHREEMATKA',
      'SITARANI MORNING': 'BHARATMATKA',
      'SITARA MORNING': 'BHARATMATKA',
      'SITARANI DAY': 'BHARATMATKA',
      'SITARA DAY': 'BHARATMATKA',
      'SITARA NIGHT': 'BHARATMATKA',
      'SITARANI NIGHT': 'BHARATMATKA'
    };

    function renderSixMarketsTable(marketsMap) {
      const tbody = document.getElementById('sixMarketsTableBody');
      if (!tbody) return;
      tbody.innerHTML = '';
      SIX_MARKET_NAMES.forEach(name => {
        const key = name.toUpperCase().trim();
        const m = marketsMap[key] || {
          name,
          slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          openTime: '11:00 AM',
          closeTime: '01:00 PM',
          value: '***-**-***'
        };
        const slug = m.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const sourceName = EXTERNAL_MARKET_SOURCES[key] || 'EXTERNAL';
        const tr = document.createElement('tr');
        tr.innerHTML = \`
          <td>
            <div style="font-weight: 800; color: #fff; font-size: 0.92rem; display: flex; align-items: center; gap: 6px;">
              <span>\${m.name}</span>
              <span style="background: rgba(245, 158, 11, 0.2); color: #fbbf24; font-size: 0.65rem; padding: 1px 5px; border-radius: 3px; font-weight: 700;">\${sourceName}</span>
            </div>
            <div style="font-size: 0.72rem; color: #94a3b8; margin-top: 2px;">Slug: <code>\${slug}</code></div>
          </td>
          <td>
            <div style="display: flex; align-items: center; gap: 4px;">
              <input type="text" id="sixOpenTime_\${slug}" value="\${m.openTime || ''}" style="width: 80px; padding: 4px 6px; font-size: 0.78rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.15); border-radius: 4px; color: #fff;" title="Open Time">
              <span style="color: #64748b;">&rarr;</span>
              <input type="text" id="sixCloseTime_\${slug}" value="\${m.closeTime || ''}" style="width: 80px; padding: 4px 6px; font-size: 0.78rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.15); border-radius: 4px; color: #fff;" title="Close Time">
              <button onclick="quickSaveTimesSixMarket('\${m.name}', '\${slug}')" class="btn-primary" style="width: auto; padding: 4px 8px; font-size: 0.72rem; font-weight: 700; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2);">
                Save
              </button>
            </div>
          </td>
          <td>
            <code style="font-family: 'JetBrains Mono'; font-weight: 800; color: #38bdf8; font-size: 1.05rem; background: rgba(56,189,248,0.1); padding: 2px 8px; border-radius: 4px;">\${m.value || '***-**-***'}</code>
          </td>
          <td>
            <div style="display: flex; align-items: center; gap: 6px;">
              <input type="text" id="sixValInput_\${slug}" placeholder="\${m.value || 'e.g. 123-6'}" style="width: 120px; padding: 5px 8px; font-size: 0.82rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(56,189,248,0.4); border-radius: 4px; color: #fff; font-weight: 700;">
              <button onclick="quickUpdateSixMarket('\${m.name}', '\${slug}')" class="btn-primary" style="width: auto; padding: 5px 12px; font-size: 0.78rem; font-weight: 800; background: linear-gradient(135deg, #0284c7, #0369a1);">
                ⚡ Publish
              </button>
            </div>
          </td>
          <td>
            <div style="display: flex; gap: 6px; align-items: center;">
              <a href="/jodi-chart-record/\${slug}" target="_blank" style="color: #38bdf8; text-decoration: underline; font-weight: 700; font-size: 0.8rem; background: rgba(56,189,248,0.1); padding: 3px 8px; border-radius: 4px;">
                📊 Jodi
              </a>
              <a href="/panel-chart-record/\${slug}" target="_blank" style="color: #c084fc; text-decoration: underline; font-weight: 700; font-size: 0.8rem; background: rgba(192,132,252,0.1); padding: 3px 8px; border-radius: 4px;">
                📋 Panel
              </a>
            </div>
          </td>
        \`;
        tbody.appendChild(tr);
      });
    }

    async function quickUpdateSixMarket(name, slug) {
      const input = document.getElementById('sixValInput_' + slug);
      const val = (input ? input.value : '').trim();
      if (!val) {
        alert('Please enter a result value for ' + name);
        return;
      }
      const res = await apiCall('/api/khabarline/update-market', {
        method: 'POST',
        body: JSON.stringify({ marketName: name, value: val, isVerified: true })
      });
      if (res.success) {
        alert('✅ Result updated for ' + name + ' => ' + val);
        if (input) input.value = '';
        fetchKhabarlineData();
      } else {
        alert('Error: ' + (res.error || 'Failed to update'));
      }
    }

    async function quickSaveTimesSixMarket(name, slug) {
      const openInp = document.getElementById('sixOpenTime_' + slug);
      const closeInp = document.getElementById('sixCloseTime_' + slug);
      const openTime = (openInp ? openInp.value : '').trim();
      const closeTime = (closeInp ? closeInp.value : '').trim();
      if (!openTime || !closeTime) {
        alert('Please enter both Open Time and Close Time');
        return;
      }
      const res = await apiCall('/api/khabarline/update-market', {
        method: 'POST',
        body: JSON.stringify({ marketName: name, openTime, closeTime })
      });
      if (res.success) {
        alert('✅ Timings updated for ' + name + ' (' + openTime + ' -> ' + closeTime + ')');
        fetchKhabarlineData();
      } else {
        alert('Error: ' + (res.error || 'Failed to update timings'));
      }
    }

    async function syncBharatmatkaCharts() {
      const btn = document.getElementById('btnSyncBharatmatka');
      if (btn) {
        btn.disabled = true;
        btn.innerText = '⏳ Syncing 52 Charts...';
      }
      try {
        const res = await apiCall('/api/khabarline/sync-bharatmatka-charts', { method: 'POST' });
        if (res.success) {
          alert('✅ Successfully scraped and cached ' + res.syncedCount + ' charts from external sites into local cache!');
        } else {
          alert('Sync notice: ' + (res.error || 'Check server logs'));
        }
      } catch (err) {
        alert('Error syncing charts: ' + err.message);
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerText = '📥 Sync All External Charts';
        }
      }
    }

    async function saveKhabarlineSettings() {
      const apkUrl = document.getElementById('khabarlineApkUrlInput').value.trim();
      const whatsappChannelUrl = document.getElementById('khabarlineWaChannelInput').value.trim();
      const telegramChannelUrl = document.getElementById('khabarlineTgChannelInput').value.trim();
      const promoEnabled = document.getElementById('khabarlinePromoEnabledToggle')
        ? document.getElementById('khabarlinePromoEnabledToggle').checked
        : true;
      const banner = {
        enabled: promoEnabled,
        tag: document.getElementById('khabarlineBannerTagInput').value.trim(),
        headline: document.getElementById('khabarlineBannerHeadlineInput').value.trim(),
        subheadline: document.getElementById('khabarlineBannerSubheadlineInput').value.trim(),
        ratesText: document.getElementById('khabarlineBannerRatesInput').value.trim(),
        buttonText: document.getElementById('khabarlineBannerBtnTextInput').value.trim(),
        downloadUrl: apkUrl,
        contactForAdsUrl: document.getElementById('khabarlineBannerContactInput').value.trim(),
      };

      const res = await apiCall('/api/khabarline/update-settings', {
        method: 'POST',
        body: JSON.stringify({
          apkUrl,
          whatsappChannelUrl,
          telegramChannelUrl,
          showAppPromotion: promoEnabled,
          playAppBanner: banner
        })
      });

      if (res.success) {
        alert('✅ Play App link, banners, channel URLs, and promo visibility updated successfully on Khabarline.site!');
        fetchKhabarlineData();
      } else {
        alert('Update failed: ' + (res.error || 'Unknown error'));
      }
    }

    function renderKhabarlineTable(markets) {
      const tbody = document.getElementById('khabarlineMarketsTableBody');
      tbody.innerHTML = '';
      markets.forEach(m => {
        const tr = document.createElement('tr');
        const decomp = (m.openPana || '***') + ' - ' + (m.jodi || '**') + ' - ' + (m.closePana || '***');
        tr.innerHTML = \`
          <td><b>\${m.name}</b> \${m.highlight ? '<span style="background:#fef08a;color:#854d0e;font-size:0.7rem;padding:2px 6px;border-radius:4px;font-weight:700;">FEATURED</span>' : ''}</td>
          <td style="font-size: 0.85rem; color: var(--text-muted);">\${m.openTime || '-'} &rarr; \${m.closeTime || '-'}</td>
          <td><code style="font-family: 'JetBrains Mono'; font-weight: 700; color: #38bdf8; font-size: 1rem;">\${m.value}</code></td>
          <td style="font-size: 0.85rem; color: #a855f7;">\${decomp}</td>
          <td><span class="badge-verified">\${m.isVerified ? '✅ VERIFIED' : '⏳ PENDING'}</span></td>
          <td>
            <button onclick="editKhabarlineMarket('\${m.name}', '\${m.value}')" style="background: rgba(56,189,248,0.15); border: 1px solid #38bdf8; color: #38bdf8; padding: 4px 10px; border-radius: 6px; cursor: pointer; font-size: 0.8rem; font-weight: 600;">
              ✏️ Edit
            </button>
          </td>
        \`;
        tbody.appendChild(tr);
      });
    }

    function filterKhabarlineTable() {
      const q = (document.getElementById('khabarlineSearch').value || '').toUpperCase();
      const filtered = khabarlineMarketsList.filter(m => m.name.includes(q) || m.value.includes(q));
      renderKhabarlineTable(filtered);
    }

    function editKhabarlineMarket(name, currentVal) {
      const newVal = prompt('Enter new result value for ' + name + ':', currentVal);
      if (newVal === null) return;
      apiCall('/api/khabarline/update-market', {
        method: 'POST',
        body: JSON.stringify({ marketName: name, value: newVal.trim(), isVerified: true })
      }).then(() => {
        fetchKhabarlineData();
      });
    }

    async function saveKhabarlineGoldenAnk() {
      const goldenAnk = document.getElementById('khabarlineGoldenAnkInput').value.trim();
      if (!goldenAnk) return;
      await apiCall('/api/khabarline/update-golden-ank', {
        method: 'POST',
        body: JSON.stringify({ goldenAnk })
      });
      alert('Golden Ank updated to: ' + goldenAnk);
      fetchKhabarlineData();
    }

    async function saveKhabarlineMarketOverride() {
      const marketName = document.getElementById('khabarlineMarketNameInput').value.trim();
      const value = document.getElementById('khabarlineMarketValInput').value.trim();
      if (!marketName || !value) {
        alert('Please provide market name and result value');
        return;
      }
      await apiCall('/api/khabarline/update-market', {
        method: 'POST',
        body: JSON.stringify({ marketName, value, isVerified: true })
      });
      alert('Market ' + marketName + ' published with result: ' + value);
      document.getElementById('khabarlineMarketNameInput').value = '';
      document.getElementById('khabarlineMarketValInput').value = '';
      fetchKhabarlineData();
    }

    async function syncKhabarlineFromDpboss() {
      if (!confirm('Sync all current market numbers from DPBoss.boston directly into Khabarline.site?')) return;
      const res = await apiCall('/api/khabarline/sync-from-dpboss', { method: 'POST' });
      if (res.success) {
        alert('Successfully synced ' + res.syncedCount + ' markets from DPBoss to Khabarline.site!');
        fetchKhabarlineData();
      } else {
        alert('Sync error: ' + (res.error || 'Failed'));
      }
    }

    // Auto-login if token exists
    if (authToken) {
      document.getElementById('loginModal').style.display = 'none';
      initDashboard();
    }
  </script>
</body>
</html>`;
  }
}
