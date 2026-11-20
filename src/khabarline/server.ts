import http from 'http';
import fs from 'fs';
import path from 'path';
import { URL } from 'url';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import { KhabarlineStore } from './store.js';
import { renderHomePage } from './siteRenderer.js';
import { renderJodiChartPage, renderPanelChartPage } from './chartRenderer.js';
import {
  renderApiDocsPage,
  renderAboutPage,
  renderContactPage,
  renderPrivacyPage,
  renderTermsPage,
  renderDisclaimerPage,
} from './pageRenderer.js';
import { ResultApiService } from '../services/resultApiService.js';
import { ChartService } from '../services/chartService.js';

export interface KhabarlineServerOptions {
  enabled: boolean;
  port: number;
  domain: string;
  adminPassword?: string;
}

export class KhabarlineServer extends EventEmitter {
  private options: KhabarlineServerOptions;
  private store: KhabarlineStore;
  private resultApiService?: ResultApiService;
  private chartService = new ChartService();
  private server: http.Server | null = null;
  private sseClients = new Set<http.ServerResponse>();

  constructor(options: KhabarlineServerOptions, store: KhabarlineStore, resultApiService?: ResultApiService) {
    super();
    this.options = options;
    this.store = store;
    this.resultApiService = resultApiService;

    // Stream live market updates to connected browser clients via SSE
    this.store.on('market_updated', (market) => {
      this.broadcastSse('market_updated', market);
    });

    this.store.on('live_markets_updated', (data) => {
      this.broadcastSse('live_markets_updated', data);
    });

    this.store.on('state_changed', (state) => {
      this.broadcastSse('state_changed', {
        goldenAnk: state.goldenAnk,
        bombay36: state.bombay36,
        aajPassHua: state.aajPassHua,
      });
    });
  }

  public start(): Promise<void> {
    if (this.options.enabled === false) {
      logger.info('Khabarline website server is disabled in configuration.');
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res).catch((err) => {
          logger.error({ err: err?.message || err, url: req.url }, 'Khabarline server error');
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('500 Internal Server Error');
        });
      });

      this.server.on('error', (err) => {
        logger.error({ err: err.message }, 'Failed to bind Khabarline server port');
        reject(err);
      });

      this.server.listen(this.options.port, '0.0.0.0', () => {
        logger.info(
          {
            port: this.options.port,
            domain: this.options.domain,
            url: `http://0.0.0.0:${this.options.port}`,
          },
          '🌐 Khabarline.site Web Server is LIVE and ready!'
        );
        resolve();
      });
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        for (const client of this.sseClients) {
          try {
            client.end();
          } catch {}
        }
        this.sseClients.clear();
        this.server.close(() => {
          this.server = null;
          logger.info('Khabarline server stopped.');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  private broadcastSse(eventType: string, data: any): void {
    const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(payload);
      } catch (err) {
        this.sseClients.delete(client);
      }
    }
  }

  private async parseBody(req: http.IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > 2 * 1024 * 1024) {
          reject(new Error('Body too large'));
        }
      });
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (e) {
          resolve({});
        }
      });
      req.on('error', reject);
    });
  }

  private generateSitemapXml(): string {
    const state = this.store.getState();
    const domain = state.domain || 'khabarline.site';
    const base = `https://${domain}`;
    const now = new Date().toISOString().slice(0, 10);

    const staticPages = [
      '/',
      '/api-docs',
      '/about.php',
      '/contact.php',
      '/privacy.php',
      '/tos.php',
      '/disclaimer.php',
    ];

    const staticUrls = staticPages
      .map(
        (p) => `  <url>
    <loc>${p === '/' ? `${base}/` : `${base}${p}`}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>daily</changefreq>
    <priority>${p === '/' ? '1.0' : '0.8'}</priority>
  </url>`
      )
      .join('\n');

    const marketUrls = Object.values(state.markets)
      .map((m) => `  <url>
    <loc>${base}/jodi-chart-record/${m.slug}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>${base}/panel-chart-record/${m.slug}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>`)
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticUrls}
${marketUrls}
</urlset>`.trim();
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;
    const method = req.method || 'GET';
    const acceptHeader = req.headers.accept || '';

    // CORS Headers for API calls
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Api-Key');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const body = method === 'POST' || method === 'PUT' || method === 'PATCH' ? await this.parseBody(req) : {};

    // 0. Verified Game Result API (with Hash Key / Signature Authentication)
    if (this.resultApiService) {
      const handled = await this.resultApiService.handleHttpRequest(req, res, parsedUrl, body);
      if (handled) return;
    }

    // 1. SSE Live Stream: /api/live-stream
    if (pathname === '/api/live-stream') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write('retry: 5000\n\n');
      this.sseClients.add(res);

      req.on('close', () => {
        this.sseClients.delete(res);
      });
      return;
    }

    // 2. Health check
    if (pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          domain: this.options.domain,
          uptimeSeconds: Math.floor(process.uptime()),
          totalMarkets: Object.keys(this.store.getState().markets).length,
          timeIST: new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata' }),
        })
      );
      return;
    }

    // 3. Static Assets (DPBoss spinner image etc.)
    if (pathname === '/img/spinner.png' || pathname === '/spinner.png') {
      try {
        let imgPath = path.join(process.cwd(), 'public', 'img', 'spinner.png');
        if (!fs.existsSync(imgPath)) {
          imgPath = path.join(process.cwd(), 'spinner.png');
        }
        if (fs.existsSync(imgPath)) {
          const imgBuffer = fs.readFileSync(imgPath);
          res.writeHead(200, {
            'Content-Type': 'image/png',
            'Content-Length': imgBuffer.length,
            'Cache-Control': 'public, max-age=86400',
          });
          res.end(imgBuffer);
          return;
        }
      } catch (err) {
        logger.error({ err }, 'Error serving spinner image');
      }
    }

    // 4. Google Search Console Verification File Handler
    if (pathname.startsWith('/google') && pathname.endsWith('.html')) {
      const filename = path.basename(pathname);
      const publicPath = path.join(process.cwd(), 'public', filename);
      if (fs.existsSync(publicPath)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fs.readFileSync(publicPath));
        return;
      }
      const token = filename.replace(/^google/i, '').replace(/\.html$/i, '');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`google-site-verification: google${token}.html`);
      return;
    }

    // 5. Robots.txt and Sitemap.xml
    if (pathname === '/robots.txt') {
      const robotsTxt = `User-agent: *\nAllow: /\n\nSitemap: https://${this.options.domain}/sitemap.xml\n`;
      const robotsBuffer = Buffer.from(robotsTxt, 'utf-8');
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Length': robotsBuffer.length,
        'Cache-Control': 'public, max-age=3600',
      });
      res.end(robotsBuffer);
      return;
    }

    if (pathname === '/sitemap.xml' || pathname === '/sitemap' || pathname === '/sitemap_index.xml') {
      const sitemap = this.generateSitemapXml();
      const sitemapBuffer = Buffer.from(sitemap, 'utf-8');
      res.writeHead(200, {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Length': sitemapBuffer.length,
        'Cache-Control': 'public, max-age=3600',
      });
      res.end(sitemapBuffer);
      return;
    }

    // 5b. DPBoss URL Aliases & SEO 301 Redirects (captures dpboss.boston, dpboss-fast-result, dpboss-matka traffic)
    const lowerPath = pathname.toLowerCase();
    if (
      lowerPath === '/dpboss' ||
      lowerPath === '/dpboss.boston' ||
      lowerPath === '/dpboss-boston' ||
      lowerPath === '/dpboss-result' ||
      lowerPath === '/dpboss-fast-result' ||
      lowerPath === '/dpboss-matka' ||
      lowerPath === '/dpboss.php' ||
      lowerPath === '/dpboss-boston.php' ||
      lowerPath === '/dpboss-result.php' ||
      lowerPath === '/dpboss143' ||
      lowerPath === '/dpboss143.php' ||
      lowerPath === '/dpboss-chart.php' ||
      lowerPath === '/dpboss-panel.php'
    ) {
      res.writeHead(301, {
        Location: '/',
        'Cache-Control': 'public, max-age=86400',
      });
      res.end();
      return;
    }

    // 6. API Docs / Pricing Pages
    if (
      pathname === '/api-docs' ||
      pathname === '/api-docs.php' ||
      pathname === '/api-pricing' ||
      pathname === '/api-pricing.php' ||
      (pathname === '/dpboss-result-api.php' && acceptHeader.includes('text/html') && !parsedUrl.searchParams.has('json'))
    ) {
      const html = renderApiDocsPage(this.store.getState());
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    // 5. API: All Results (/api/results, /api/v1/results, /dpboss-result-api.php)
    if (pathname === '/api/results' || pathname === '/api/v1/results' || pathname === '/dpboss-result-api.php') {
      const state = this.store.getState();
      const marketsList = this.store.getMarkets();
      const todayIST = this.store.getTodayIST();

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify(
          {
            success: true,
            domain: state.domain,
            date: todayIST,
            goldenAnk: state.goldenAnk,
            finalAnk: state.finalAnk,
            totalMarkets: marketsList.length,
            liveMarkets: state.liveResultMarkets || [],
            liveResultCount: (state.liveResultMarkets || []).length,
            results: marketsList.map((m) => {
              const isAnswer = this.resultApiService?.getMarketFormat(m.name) === 'answer';
              if (isAnswer) {
                const customAnswer = this.resultApiService
                  ? (this.resultApiService as any).whitelistService?.getMarketCustomAnswer(m.name)
                  : undefined;
                const val = customAnswer || '***-**-***';
                return {
                  marketName: m.name,
                  slug: m.slug,
                  openTime: m.openTime,
                  closeTime: m.closeTime,
                  answer: val,
                  responseFormat: 'answer',
                  openPana: '',
                  openAnk: '',
                  closeAnk: '',
                  closePana: '',
                  jodi: '',
                  isVerified: false,
                  status: 'NOT_DECLARED',
                  lastUpdated: m.lastUpdated,
                };
              }

              // Resolve verified today status via ResultApiService (internal: true bypasses auth)
              const resolved = this.resultApiService?.getGameResult({
                gameName: m.name,
                session: 'ALL',
                internal: true,
              })?.data;

              if (resolved && resolved.isDeclared && resolved.status === 'VERIFIED') {
                return {
                  marketName: m.name,
                  slug: m.slug,
                  openTime: m.openTime,
                  closeTime: m.closeTime,
                  result: resolved.result || resolved.fullResult || m.value,
                  responseFormat: 'result',
                  openPana: resolved.openPana || '',
                  openAnk: resolved.openDigit || '',
                  closeAnk: resolved.closeDigit || '',
                  closePana: resolved.closePana || '',
                  jodi: resolved.jodi || '',
                  isVerified: true,
                  status: 'VERIFIED',
                  lastUpdated: resolved.lastUpdated || m.lastUpdated,
                };
              }

              // Market is NOT declared today: strictly return NOT_DECLARED with placeholder results
              return {
                marketName: m.name,
                slug: m.slug,
                openTime: m.openTime,
                closeTime: m.closeTime,
                result: '***-**-***',
                responseFormat: 'result',
                openPana: '',
                openAnk: '',
                closeAnk: '',
                closePana: '',
                jodi: '',
                isVerified: false,
                status: 'NOT_DECLARED',
                lastUpdated: m.lastUpdated,
              };
            }),
            mainStarline: state.mainStarline,
            mumbaiRajshreeStarline: state.mumbaiRajshreeStarline,
            bombay36: state.bombay36,
          },
          null,
          2
        )
      );
      return;
    }

    // 6. API: Single Market (/api/market/:slugOrName)
    if (pathname.startsWith('/api/market/')) {
      const param = pathname.replace('/api/market/', '').replace(/\/$/, '');
      const market = this.store.getMarket(param);
      if (!market) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Market not found', query: param }));
        return;
      }

      const isAnswer = this.resultApiService?.getMarketFormat(market.name) === 'answer';
      if (isAnswer) {
        const customAnswer = this.resultApiService
          ? (this.resultApiService as any).whitelistService?.getMarketCustomAnswer(market.name)
          : undefined;
        const val = customAnswer || '***-**-***';
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(
          JSON.stringify(
            {
              success: true,
              market: {
                ...market,
                value: val,
                answer: val,
                openPana: '',
                openAnk: '',
                closeAnk: '',
                closePana: '',
                jodi: '',
                isVerified: false,
                status: 'NOT_DECLARED',
                responseFormat: 'answer',
              },
            },
            null,
            2
          )
        );
        return;
      }

      // Check today's declaration status
      const resolved = this.resultApiService?.getGameResult({
        gameName: market.name,
        session: 'ALL',
        internal: true,
      })?.data;

      const isDeclaredToday = Boolean(resolved && resolved.isDeclared && resolved.status === 'VERIFIED');
      const val = isDeclaredToday ? (resolved?.result || resolved?.fullResult || market.value) : '***-**-***';

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify(
          {
            success: true,
            market: {
              ...market,
              value: val,
              result: val,
              responseFormat: 'result',
              openPana: isDeclaredToday ? (resolved?.openPana || '') : '',
              openAnk: isDeclaredToday ? (resolved?.openDigit || '') : '',
              closeAnk: isDeclaredToday ? (resolved?.closeDigit || '') : '',
              closePana: isDeclaredToday ? (resolved?.closePana || '') : '',
              jodi: isDeclaredToday ? (resolved?.jodi || '') : '',
              isVerified: isDeclaredToday,
              status: isDeclaredToday ? 'VERIFIED' : 'NOT_DECLARED',
            },
          },
          null,
          2
        )
      );
      return;
    }

    // 7. Admin API Endpoints
    if (pathname.startsWith('/api/admin/')) {
      // Password check if configured
      if (this.options.adminPassword) {
        const authHeader = req.headers.authorization || '';
        const token = authHeader.replace(/^Bearer\s+/i, '');
        if (token !== this.options.adminPassword && parsedUrl.searchParams.get('key') !== this.options.adminPassword) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized admin access' }));
          return;
        }
      }

      if (pathname === '/api/admin/update-result') {
        const { marketName, value, isVerified } = body;
        if (!marketName || !value) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'marketName and value are required' }));
          return;
        }
        const updated = this.store.updateMarketResult(marketName, value, isVerified !== false);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, market: updated }));
        return;
      }

      if (pathname === '/api/admin/update-golden-ank') {
        const { goldenAnk } = body;
        if (!goldenAnk) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'goldenAnk is required' }));
          return;
        }
        this.store.updateGoldenAnk(goldenAnk);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, goldenAnk }));
        return;
      }

      if (pathname === '/api/admin/update-final-ank') {
        const { marketName, ank } = body;
        if (!marketName || !ank) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'marketName and ank are required' }));
          return;
        }
        this.store.updateFinalAnk(marketName, ank);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
      }

      if (pathname === '/api/admin/update-bombay36') {
        const { activeValue, slots } = body;
        this.store.updateBombay36(activeValue, slots);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
      }

      if (pathname === '/api/admin/update-starline') {
        const { type, entries } = body;
        if (type && Array.isArray(entries)) {
          this.store.updateStarline(type, entries);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
      }

      if (pathname === '/api/admin/sponsored-apps' || pathname === '/api/admin/add-sponsored-app') {
        const { app, id, updates, action } = body;
        if (action === 'delete') {
          const deleted = this.store.deleteSponsoredPlayApp(id || body.id);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: deleted }));
          return;
        }
        if (action === 'update') {
          const updated = this.store.updateSponsoredPlayApp(id || body.id, updates || body);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: updated }));
          return;
        }
        if (app || body.downloadUrl || body.headline) {
          const added = this.store.addSponsoredPlayApp(app || body);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, app: added }));
          return;
        }
        const apps = this.store.getSponsoredPlayApps();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, apps }));
        return;
      }

      if (pathname === '/api/admin/update-play-banner') {
        this.store.updatePlayAppBanner(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, banner: this.store.getState().playAppBanner }));
        return;
      }

      if (pathname === '/api/admin/update-settings') {
        this.store.updateSiteSettings(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, state: this.store.getState() }));
        return;
      }

      if (pathname === '/api/admin/settings') {
        const s = this.store.getState();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            success: true,
            apkUrl: s.apkUrl,
            whatsappChannelUrl: s.whatsappChannelUrl,
            telegramChannelUrl: s.telegramChannelUrl,
            playAppBanner: s.playAppBanner,
            sponsoredPlayApps: s.sponsoredPlayApps || [],
            siteTitle: s.siteTitle,
            domain: s.domain,
          })
        );
        return;
      }
    }

    // 7b. Secret Admin Shortcut (/4.3.2.1)
    if (pathname === '/4.3.2.1' || pathname === '/4.3.2.1/') {
      res.writeHead(302, { Location: 'https://admin.khabarline.site/4.3.2.1' });
      res.end();
      return;
    }

    // 8. Jodi Chart Record Pages: /jodi-chart-record/:slug or .php
    if (pathname.startsWith('/jodi-chart-record/')) {
      const slugRaw = pathname.replace('/jodi-chart-record/', '').replace(/\.php$/i, '').replace(/\/$/, '');
      const market = this.store.getMarket(slugRaw);
      if (!market) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h1>404 - Jodi Chart for "${slugRaw}" Not Found</h1><p><a href="/">Back to Home</a></p>`);
        return;
      }
      const rows = this.store.getState().charts[market.slug] || [];
      const chartData = await this.chartService.getChartData(market.slug, 'jodi');
      const html = renderJodiChartPage(market, rows, chartData?.tableHtml, chartData?.title);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    // 9. Panel Chart Record Pages: /panel-chart-record/:slug or .php
    if (pathname.startsWith('/panel-chart-record/')) {
      const slugRaw = pathname.replace('/panel-chart-record/', '').replace(/\.php$/i, '').replace(/\/$/, '');
      const market = this.store.getMarket(slugRaw);
      if (!market) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h1>404 - Panel Chart for "${slugRaw}" Not Found</h1><p><a href="/">Back to Home</a></p>`);
        return;
      }
      const rows = this.store.getState().charts[market.slug] || [];
      const chartData = await this.chartService.getChartData(market.slug, 'panel');
      const html = renderPanelChartPage(market, rows, chartData?.tableHtml, chartData?.title);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    // 10. Styled Legal, Contact, and Info Pages
    if (pathname === '/about.php' || pathname === '/about') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderAboutPage(this.store.getState()));
      return;
    }

    if (pathname === '/privacy.php' || pathname === '/privacy') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderPrivacyPage(this.store.getState()));
      return;
    }

    if (pathname === '/tos.php' || pathname === '/tos' || pathname === '/terms.php' || pathname === '/terms') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderTermsPage(this.store.getState()));
      return;
    }

    if (pathname === '/contact.php' || pathname === '/contact') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderContactPage(this.store.getState()));
      return;
    }

    if (pathname === '/disclaimer.php' || pathname === '/disclaimer') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderDisclaimerPage(this.store.getState()));
      return;
    }

    // 11. Root / Homepage
    if (pathname === '/' || pathname === '/index.html' || pathname === '/index.php') {
      const html = renderHomePage(this.store.getState());
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      });
      res.end(html);
      return;
    }

    // Default 404
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<h1>404 - Page Not Found</h1><p><a href="/">Back to Khabarline.site</a></p>`);
  }
}
