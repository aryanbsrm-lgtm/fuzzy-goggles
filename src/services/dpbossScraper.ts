import { EventEmitter } from 'events';
import { Config } from '../config.js';
import { ParsedPayload, DpbossScrapedMarket } from '../types.js';
import { MarketScheduleService } from './schedule.js';
import { MessageParser } from '../parser/index.js';
import { logger } from '../utils/logger.js';

export class DpbossScraperService extends EventEmitter {
  private config: Config['dpboss'];
  private scheduleService: MarketScheduleService;
  private parser: MessageParser;
  private pollTimer: NodeJS.Timeout | null = null;
  private isPolling = false;
  private activeVerificationCycles = new Map<string, NodeJS.Timeout[]>();

  /**
   * In-memory cache of current market results:
   * Key: `${marketName.toUpperCase()}::${session}` -> { value, timestamp, payload }
   */
  private resultsCache = new Map<
    string,
    { value: string; timestamp: number; payload: ParsedPayload; openTime?: string; closeTime?: string }
  >();

  constructor(
    config: Config['dpboss'],
    scheduleService?: MarketScheduleService,
    parser?: MessageParser
  ) {
    super();
    this.config = config;
    this.scheduleService = scheduleService || new MarketScheduleService();
    this.parser = parser || new MessageParser(
      {
        mode: 'raw_normalized',
        regexPattern: null,
        resultGroupIndex: 1,
        roundGroupIndex: null,
        prefix: null,
        caseSensitive: false,
      },
      this.scheduleService
    );
  }

  /**
   * Starts background polling of dpboss.boston
   */
  public start(): void {
    if (!this.config.enabled) {
      logger.info('DPBoss website scraper is disabled in configuration.');
      return;
    }

    logger.info(
      {
        url: this.config.url,
        pollIntervalSeconds: this.config.pollIntervalSeconds,
        ownerId: this.config.ownerId,
      },
      '🌐 Starting DPBoss.boston Live Web Scraper service...'
    );

    // Initial immediate poll
    this.poll().catch((err) => {
      logger.warn({ err: err?.message || err }, 'Initial DPBoss scraper poll notice');
    });

    // Scheduled periodic background polling
    const intervalMs = Math.max(5, this.config.pollIntervalSeconds) * 1000;
    this.pollTimer = setInterval(() => {
      this.poll().catch((err) => {
        logger.warn({ err: err?.message || err }, 'Periodic DPBoss scraper poll notice');
      });
    }, intervalMs);
  }

  /**
   * Stops background polling and cancels active verification cycles
   */
  public stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    for (const timeouts of this.activeVerificationCycles.values()) {
      for (const t of timeouts) clearTimeout(t);
    }
    this.activeVerificationCycles.clear();
  }

  /**
   * Fetches raw HTML from dpboss.boston with timeout and custom headers
   */
  public async fetchHtml(): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(this.config.url, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      return await res.text();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Parses all market results from the raw HTML of dpboss.boston
   */
  public parseHtml(html: string): DpbossScrapedMarket[] {
    const markets: DpbossScrapedMarket[] = [];
    const seen = new Set<string>();

    // 1. Primary Market Card Matcher: <h4>MARKET</h4> ... <span>VALUE</span> ... <p>OPEN CLOSE</p>
    // Handles <div ...><h4>KALYAN</h4><span>447-58-233</span><p>04:35 PM 06:35 PM</p></div>
    const cardRegex = /<h[456][^>]*>\s*([A-Za-z0-9\s\[\]\(\)\-\.]+?)\s*<\/h[456]>[\s\S]*?<span[^>]*>\s*([0-9\-\*\s=_–a-zA-Z\.]+?)\s*<\/span>(?:[\s\S]*?<p[^>]*>\s*(\d{1,2}:\d{2}\s*(?:AM|PM))\s*(?:&nbsp;|\s)+\s*(\d{1,2}:\d{2}\s*(?:AM|PM))\s*<\/p>)?/gi;

    let match: RegExpExecArray | null;
    while ((match = cardRegex.exec(html)) !== null) {
      const rawMarketName = match[1]?.trim();
      const rawValue = match[2]?.trim().replace(/\s+/g, '');
      const openTime = match[3]?.trim();
      const closeTime = match[4]?.trim();

      if (!rawMarketName || !rawValue) {
        continue;
      }

      // Filter out non-market titles like "World Me Sabse Fast" or navigation text
      if (this.isHeaderNoise(rawMarketName)) {
        continue;
      }

      const dedupeKey = rawMarketName.toUpperCase();
      if (!seen.has(dedupeKey)) {
        seen.add(dedupeKey);
        markets.push({
          marketName: rawMarketName,
          value: rawValue,
          openTime,
          closeTime,
          rawText: `${rawMarketName} ${rawValue}`,
        });
      }
    }

    return markets;
  }

  /**
   * Parses current active Live Result flash cards from the .liv-rslt section of dpboss.boston
   */
  public parseLiveResults(html: string): Array<{ marketName: string; value: string; badge?: string; note?: string }> {
    const liveMatch = html.match(/<div[^>]*class=\"[^\"]*liv-rslt[^\"]*\"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
    const liveList: Array<{ marketName: string; value: string; badge?: string; note?: string }> = [];
    if (liveMatch) {
      const chunks = liveMatch[1].split(/(?=<span[^>]*class=[\"'\s]h8[\"'\s>])/i);
      for (const chunk of chunks) {
        const nameMatch = chunk.match(/<span[^>]*class=[\"'\s]h8[\"'\s>][^>]*>\s*([^<]+?)\s*<\/span>/i);
        const valMatch = chunk.match(/<span[^>]*class=[\"'\s]h9[\"'\s>][^>]*>\s*([^<]+?)\s*<\/span>/i);
        const badgeMatch = chunk.match(/<span[^>]*class=[\"'\s]e-sprg[\"'\s>][^>]*>\s*([^<]+?)\s*<\/span>/i);
        const noteMatch = chunk.match(/<p[^>]*>\s*([^<]+?)\s*<\/p>/i);
        if (nameMatch) {
          const name = nameMatch[1].trim();
          const val = valMatch ? valMatch[1].trim().replace(/\s+/g, '') : 'Loading...';
          const badge = badgeMatch ? badgeMatch[1].trim() : undefined;
          const note = noteMatch ? noteMatch[1].trim() : undefined;
          if (name && !this.isHeaderNoise(name)) {
            liveList.push({ marketName: name, value: val, badge, note });
          }
        }
      }
    }
    return liveList;
  }

  /**
   * Parses the Final Ank ticker line from dpboss.boston
   */
  public parseFinalAnk(html: string): Record<string, string> {
    const finalAnkRegex = /<div[^>]*class=\"[^\"]*amthltg[^\"]*\"[^>]*>([\s\S]*?)<\/div>/i;
    const fam = html.match(finalAnkRegex);
    const finalAnkMap: Record<string, string> = {};
    if (fam) {
      const clean = fam[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const pairRegex = /([A-Za-z\s]+?)\s*-\s*(\d)/g;
      let pm: RegExpExecArray | null;
      while ((pm = pairRegex.exec(clean)) !== null) {
        const mName = pm[1].trim().toUpperCase();
        const ank = pm[2].trim();
        if (mName && ank) {
          finalAnkMap[mName] = ank;
        }
      }
    }
    return finalAnkMap;
  }

  /**
   * Parses Golden Ank from dpboss.boston
   */
  public parseGoldenAnk(html: string): string | undefined {
    const goldenMatch = html.match(/Golden\s*Ank[\s\S]*?>\s*([0-9\-\s]+?)\s*</i);
    if (goldenMatch && goldenMatch[1].trim()) {
      return goldenMatch[1].trim();
    }
    return undefined;
  }

  private isHeaderNoise(title: string): boolean {
    const t = title.toUpperCase().trim();
    return (
      t.includes('WORLD ME') ||
      t.includes('SATTA MATKA') ||
      t.includes('TIPS') ||
      t.includes('CHART') ||
      t.includes('GUESSING') ||
      t.includes('FORUM') ||
      t.includes('WEEKLY') ||
      t.includes('NOTICE') ||
      t.includes('GOLDEN ANK') ||
      t.includes('FINAL ANK')
    );
  }

  private isPlaceholder(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed) return true;
    if (/^[\*\-_xX\.\s]+$/.test(trimmed)) return true;
    if (/^(pending|upcoming|wait|loading|n\/a|null)$/i.test(trimmed)) return true;
    return false;
  }

  /**
   * Deconstructs matka result numbers into open/close components
   */
  public decomposeResultComponents(val: string): {
    openPana?: string;
    openAnk?: string;
    closeAnk?: string;
    closePana?: string;
    jodi?: string;
    openFormatted?: string;
    closeFormatted?: string;
    fullFormatted?: string;
  } {
    if (!val) return {};
    const norm = val
      .replace(/\s+/g, '')
      .replace(/–|=|_/g, '-')
      .trim();

    // 1. Full 3-phase result: 240-67-340 or 599-38-167 or 447-58-233
    const fullMatch = norm.match(/^(\d{3})-(\d)(\d)-(\d{3})$/);
    if (fullMatch) {
      return {
        openPana: fullMatch[1],
        openAnk: fullMatch[2],
        closeAnk: fullMatch[3],
        closePana: fullMatch[4],
        jodi: `${fullMatch[2]}${fullMatch[3]}`,
        openFormatted: `${fullMatch[1]}-${fullMatch[2]}`,
        closeFormatted: `${fullMatch[3]}-${fullMatch[4]}`,
        fullFormatted: `${fullMatch[1]}-${fullMatch[2]}${fullMatch[3]}-${fullMatch[4]}`,
      };
    }

    // 2. Open Pana + Jodi with pending close: 599-38-*** or 599-38- or 599-38
    const openJodiMatch = norm.match(/^(\d{3})-(\d)(\d)(?:-[\*\s]+|-)?$/);
    if (openJodiMatch) {
      return {
        openPana: openJodiMatch[1],
        openAnk: openJodiMatch[2],
        closeAnk: openJodiMatch[3],
        jodi: `${openJodiMatch[2]}${openJodiMatch[3]}`,
        openFormatted: `${openJodiMatch[1]}-${openJodiMatch[2]}`,
      };
    }

    // 3. Open Pana + Single: 599-3, 122-5, 599-3*, 599-3-***
    const openSingleMatch = norm.match(/^(\d{3})-(\d)(?:[\*\s]+)?(?:-[\*\s]+)?$/);
    if (openSingleMatch) {
      return {
        openPana: openSingleMatch[1],
        openAnk: openSingleMatch[2],
        openFormatted: `${openSingleMatch[1]}-${openSingleMatch[2]}`,
      };
    }

    // 4. Close Single/Jodi + Close Pana: ***-38-167 or *-8-167 or 38-167 or 8-167
    const closeMatch = norm.match(/^(?:[\*\s]+-)?(?:(\d))?(\d)-(\d{3})$/);
    if (closeMatch) {
      return {
        openAnk: closeMatch[1] || undefined,
        closeAnk: closeMatch[2],
        closePana: closeMatch[3],
        closeFormatted: `${closeMatch[2]}-${closeMatch[3]}`,
      };
    }

    // 5. Inverted close or open patti: 167-8
    const pattiSingleMatch = norm.match(/^(\d{3})-(\d)$/);
    if (pattiSingleMatch) {
      return {
        openPana: pattiSingleMatch[1],
        openAnk: pattiSingleMatch[2],
        openFormatted: `${pattiSingleMatch[1]}-${pattiSingleMatch[2]}`,
      };
    }

    // 6. Standalone 2-digit Jodi: 38
    const jodiOnlyMatch = norm.match(/^(\d{2})$/);
    if (jodiOnlyMatch) {
      return {
        openAnk: jodiOnlyMatch[1][0],
        closeAnk: jodiOnlyMatch[1][1],
        jodi: jodiOnlyMatch[1],
      };
    }

    return {};
  }

  /**
   * Compares two result values considering open/close/jodi nuances
   */
  public areValuesMatching(val1: string, val2: string): boolean {
    const norm1 = val1.replace(/[\s\*]+/g, '').replace(/–|=|_/g, '-');
    const norm2 = val2.replace(/[\s\*]+/g, '').replace(/–|=|_/g, '-');

    if (norm1 === norm2 && norm1.length > 0) return true;

    const c1 = this.decomposeResultComponents(val1);
    const c2 = this.decomposeResultComponents(val2);

    // 1. Open Session Match: Both have matching open pana and open ank
    if (c1.openPana && c2.openPana && c1.openAnk && c2.openAnk) {
      if (c1.openPana === c2.openPana && c1.openAnk === c2.openAnk) {
        return true;
      }
    }

    // 2. Close Session Match: Both have matching close pana and close ank
    if (c1.closePana && c2.closePana && c1.closeAnk && c2.closeAnk) {
      if (c1.closePana === c2.closePana && c1.closeAnk === c2.closeAnk) {
        return true;
      }
    }

    // 3. Full / Open / Close formatted direct comparison
    if (c1.openFormatted && norm2 === c1.openFormatted) return true;
    if (c1.closeFormatted && norm2 === c1.closeFormatted) return true;
    if (c1.jodi && norm2 === c1.jodi) return true;

    if (c2.openFormatted && norm1 === c2.openFormatted) return true;
    if (c2.closeFormatted && norm1 === c2.closeFormatted) return true;
    if (c2.jodi && norm1 === c2.jodi) return true;

    if (c1.openFormatted && c2.openFormatted && c1.openFormatted === c2.openFormatted) {
      return true;
    }

    if (c1.closeFormatted && c2.closeFormatted && c1.closeFormatted === c2.closeFormatted) {
      return true;
    }

    return false;
  }

  /**
   * Polls dpboss.boston, updates cache, and emits newly changed results
   */
  public async poll(): Promise<ParsedPayload[]> {
    if (this.isPolling) {
      return [];
    }

    this.isPolling = true;
    const now = Date.now();
    const payloads: ParsedPayload[] = [];

    try {
      const html = await this.fetchHtml();
      const scrapedMarkets = this.parseHtml(html);
      const liveResults = this.parseLiveResults(html);
      const finalAnk = this.parseFinalAnk(html);
      const goldenAnk = this.parseGoldenAnk(html);

      // Emit full batch updates for Khabarline site & store synchronization
      this.emit('dpboss_batch_markets', {
        markets: scrapedMarkets,
        liveResults,
        finalAnk,
        goldenAnk,
      });

      for (const item of scrapedMarkets) {
        const decomp = this.decomposeResultComponents(item.value);

        // Build Open Payload if available
        if (decomp.openFormatted) {
          const { marketName, session } = this.scheduleService.resolveMarketAndSession(
            item.marketName,
            item.rawText || item.marketName,
            'OPEN',
            now
          );

          const openPayload: ParsedPayload = {
            value: decomp.openFormatted,
            marketName,
            session: session || 'OPEN',
            rawText: item.rawText || `${item.marketName} ${item.value}`,
            groupJid: 'dpboss_boston@web',
            groupName: 'DPBOSS.BOSTON LIVE SCRAPER',
            ownerId: this.config.ownerId,
            senderJid: 'scraper@dpboss.boston',
            senderName: 'DPBoss Live Scraper',
            timestamp: now,
          };
          payloads.push(openPayload);

          const cacheKey = `${marketName.toUpperCase()}::OPEN`;
          const prev = this.resultsCache.get(cacheKey);
          this.resultsCache.set(cacheKey, {
            value: openPayload.value,
            timestamp: now,
            payload: openPayload,
            openTime: item.openTime,
            closeTime: item.closeTime,
          });

          if (!prev || prev.value !== openPayload.value) {
            this.emit('dpboss_result', openPayload);
          }
        }

        // Build Close Payload if available
        if (decomp.closePana && decomp.closeAnk) {
          const closeVal = decomp.fullFormatted || decomp.closeFormatted || item.value;
          const { marketName, session } = this.scheduleService.resolveMarketAndSession(
            item.marketName,
            item.rawText || item.marketName,
            'CLOSE',
            now
          );

          const closePayload: ParsedPayload = {
            value: closeVal,
            marketName,
            session: session || 'CLOSE',
            rawText: item.rawText || `${item.marketName} ${item.value}`,
            groupJid: 'dpboss_boston@web',
            groupName: 'DPBOSS.BOSTON LIVE SCRAPER',
            ownerId: this.config.ownerId,
            senderJid: 'scraper@dpboss.boston',
            senderName: 'DPBoss Live Scraper',
            timestamp: now,
          };
          payloads.push(closePayload);

          const cacheKey = `${marketName.toUpperCase()}::CLOSE`;
          const prev = this.resultsCache.get(cacheKey);
          this.resultsCache.set(cacheKey, {
            value: closePayload.value,
            timestamp: now,
            payload: closePayload,
            openTime: item.openTime,
            closeTime: item.closeTime,
          });

          if (!prev || prev.value !== closePayload.value) {
            this.emit('dpboss_result', closePayload);
          }
        }
      }

      logger.debug(
        {
          count: scrapedMarkets.length,
          liveCount: liveResults.length,
          cached: this.resultsCache.size,
        },
        '🌐 DPBoss.boston scrape poll finished'
      );
      this.emit('poll_complete', payloads.length);
      return payloads;
    } catch (err: any) {
      logger.warn({ err: err?.message || err }, 'DPBoss.boston scrape poll encountered error');
      this.emit('error', err);
      return [];
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * Fast lookup in cache for a specific market & session
   */
  public getCachedResult(
    marketName: string,
    session?: 'OPEN' | 'CLOSE' | 'JODI'
  ): { value: string; payload: ParsedPayload } | null {
    const canonicalName = this.parser.canonicalizeMarketName(marketName);
    const key = `${canonicalName.toUpperCase()}::${session || 'GENERAL'}`;
    const cached = this.resultsCache.get(key);
    return cached ? { value: cached.value, payload: cached.payload } : null;
  }

  /**
   * Checks if DPBoss cache currently matches a candidate result
   */
  public checkMatch(
    marketName: string,
    value: string,
    session?: 'OPEN' | 'CLOSE' | 'JODI'
  ): ParsedPayload | null {
    const canonicalName = this.parser.canonicalizeMarketName(marketName).toUpperCase();
    const exact = this.getCachedResult(marketName, session);
    const candidates = exact
      ? [exact]
      : [...this.resultsCache.entries()]
          .filter(([key]) => key.startsWith(`${canonicalName}::`))
          .map(([, cached]) => ({ value: cached.value, payload: cached.payload }));

    for (const cached of candidates) {
      if (this.areValuesMatching(cached.value, value)) {
        return {
          ...cached.payload,
          value,
          session: session || cached.payload.session,
          rawText: `${cached.payload.marketName} ${value}`,
        };
      }
    }

    return null;
  }

  /**
   * Initiates an aggressive verification cycle for an unverified candidate.
   * Retries scrapes at intervals [0, 10, 30, 60, 120, 180] seconds until verified or timed out.
   */
  public startVerificationCycle(
    marketName: string,
    candidateValue: string,
    session?: 'OPEN' | 'CLOSE' | 'JODI',
    onMatchFound?: (payload: ParsedPayload) => void
  ): void {
    if (!this.config.enabled || !this.config.autoVerifyOnUnverified) {
      return;
    }

    const cycleKey = `${marketName.toUpperCase()}::${session || 'GENERAL'}::${candidateValue}`;

    // Clear existing cycle for this specific candidate if any
    const existing = this.activeVerificationCycles.get(cycleKey);
    if (existing) {
      for (const t of existing) clearTimeout(t);
    }

    logger.info(
      { marketName, session, value: candidateValue },
      '🚀 Initiating active DPBoss.boston verification cycle for unverified result...'
    );

    const timeouts: NodeJS.Timeout[] = [];
    const intervals = this.config.retryIntervalsSeconds || [0, 10, 30, 60, 120, 180];

    for (const delaySec of intervals) {
      const timer = setTimeout(async () => {
        logger.debug({ marketName, delaySec }, '🔄 DPBoss cycle checking for matching result...');
        await this.poll().catch(() => {});

        const match = this.checkMatch(marketName, candidateValue, session);
        if (match) {
          logger.info(
            { marketName, session, value: candidateValue, delaySec },
            '⚡ DPBoss.boston verified matching result! Halting verification cycle.'
          );

          // Cancel remaining retry timeouts
          this.cancelVerificationCycle(cycleKey);

          this.emit('dpboss_match', match);
          if (onMatchFound) {
            onMatchFound(match);
          }
        }
      }, delaySec * 1000);

      timeouts.push(timer);
    }

    this.activeVerificationCycles.set(cycleKey, timeouts);
  }

  /**
   * Cancels an ongoing verification cycle
   */
  public cancelVerificationCycle(cycleKey: string): void {
    const timers = this.activeVerificationCycles.get(cycleKey);
    if (timers) {
      for (const t of timers) clearTimeout(t);
      this.activeVerificationCycles.delete(cycleKey);
    }
  }

  /**
   * Returns count of cached market results
   */
  public getCachedResultsCount(): number {
    return this.resultsCache.size;
  }

  /**
   * Returns all cached market entries
   */
  public getAllCachedResults() {
    return new Map(this.resultsCache);
  }

  /**
   * Finds matching market entries for user lookup command
   */
  public findResultsForMarket(query: string) {
    const normalized = query.trim().toUpperCase();
    const results: Array<{ marketName: string; value: string; session?: string; openTime?: string; closeTime?: string }> = [];

    for (const [key, item] of this.resultsCache.entries()) {
      if (key.includes(normalized) || item.payload.marketName.toUpperCase().includes(normalized)) {
        results.push({
          marketName: item.payload.marketName,
          value: item.value,
          session: item.payload.session,
          openTime: item.openTime,
          closeTime: item.closeTime,
        });
      }
    }

    return results;
  }
}
