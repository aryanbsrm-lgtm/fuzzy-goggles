import { EventEmitter } from 'events';
import fs from 'fs';
import crypto from 'crypto';
import { Config } from '../config.js';
import { ParsedPayload } from '../types.js';
import { MarketScheduleService } from './schedule.js';
import { MessageParser } from '../parser/index.js';
import { logger } from '../utils/logger.js';

export interface SheetRowResult {
  marketName: string;
  open?: string;
  close?: string;
  jodi?: string;
  fullResult?: string;
  updatedAt?: string;
  raw: Record<string, string>;
}

export class GoogleSheetService extends EventEmitter {
  private config: Config['sheets'];
  private parser: MessageParser;
  private scheduleService: MarketScheduleService;
  private pollTimer: NodeJS.Timeout | null = null;
  private cycleTimer: NodeJS.Timeout | null = null;
  private isPolling = false;
  private cachedAccessToken: { token: string; expiresAt: number } | null = null;

  /**
   * In-memory cache of current market results:
   * Key: `${marketName.toUpperCase()}::${session}` -> { value, timestamp, payload }
   */
  private resultsCache = new Map<
    string,
    { value: string; timestamp: number; payload: ParsedPayload }
  >();

  constructor(
    config: Config['sheets'],
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
   * Formats any Google Sheet or Drive sharing URL into a direct CSV export endpoint
   */
  public normalizeSheetUrl(rawUrl: string): string {
    const trimmed = rawUrl.trim();
    if (!trimmed) return '';

    // If it's already a direct CSV export URL
    if (trimmed.includes('output=csv') || trimmed.includes('tqx=out:csv')) {
      return trimmed;
    }

    // Published Google Sheet URL: https://docs.google.com/spreadsheets/d/e/{ID}/pubhtml
    const pubMatch = trimmed.match(/\/spreadsheets\/d\/e\/([a-zA-Z0-9-_]+)/);
    if (pubMatch) {
      const pubId = pubMatch[1];
      return `https://docs.google.com/spreadsheets/d/e/${pubId}/pub?output=csv`;
    }

    // Standard Google Sheet URL: https://docs.google.com/spreadsheets/d/{ID}/edit...
    const idMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (idMatch) {
      const sheetId = idMatch[1];
      let csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;

      // Extract gid if present
      const gidMatch = trimmed.match(/[#&?]gid=([0-9]+)/);
      if (gidMatch) {
        csvUrl += `&gid=${gidMatch[1]}`;
      } else if (this.config.sheetTabName) {
        csvUrl += `&sheet=${encodeURIComponent(this.config.sheetTabName)}`;
      }
      return csvUrl;
    }

    return trimmed;
  }

  /**
   * Extracts the Spreadsheet ID from a URL or raw ID
   */
  public extractSpreadsheetId(urlOrId: string): string {
    const match = urlOrId.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : urlOrId.trim();
  }

  /**
   * Starts 24/7 background polling with scraper cycle synchronization
   */
  public start(): void {
    if (!this.config.enabled || (!this.config.sheetUrl && !this.config.serviceAccountKeyFile)) {
      logger.info('Google Sheets scraper integration is disabled or no sheet URL configured.');
      return;
    }

    logger.info(
      {
        sheetUrl: this.config.sheetUrl,
        pollIntervalSeconds: this.config.pollIntervalSeconds,
        scraperCycleSeconds: this.config.scraperCycleSeconds,
        scraperCycleOffsetSeconds: this.config.scraperCycleOffsetSeconds,
        ownerId: this.config.ownerId,
      },
      '📊 Starting Google Sheet 24/7 scraper poller...'
    );

    // 1. Initial immediate poll
    this.poll().catch((err) => {
      logger.warn({ err: err?.message || err }, 'Initial Google Sheet poll error');
    });

    // 2. Continuous background poller
    const intervalMs = Math.max(5, this.config.pollIntervalSeconds) * 1000;
    this.pollTimer = setInterval(() => {
      this.poll().catch((err) => {
        logger.warn({ err: err?.message || err }, 'Periodic Google Sheet poll error');
      });
    }, intervalMs);

    // 3. Scraper Cycle Synchronizer (aligns specifically to :01:28, :06:28, :11:28 IST cycles + write buffer)
    this.scheduleNextCyclePoll();
  }

  /**
   * Schedules a dedicated poll immediately following the 5-minute scraper run
   */
  private scheduleNextCyclePoll(): void {
    const cycleSec = this.config.scraperCycleSeconds || 300; // 5 mins
    const offsetSec = this.config.scraperCycleOffsetSeconds || 88; // 1m 28s into each 5m window (:01:28, :06:28...)
    const writeBufferSec = 15; // 15s buffer for scraper to write all rows

    const nowSec = Math.floor(Date.now() / 1000);
    const cyclePos = ((nowSec % cycleSec) + cycleSec) % cycleSec;

    // Target position in the 5-min cycle
    const targetPos = (offsetSec + writeBufferSec) % cycleSec;
    let delaySec = targetPos - cyclePos;
    if (delaySec <= 0) {
      delaySec += cycleSec;
    }

    logger.debug({ nextCycleInSeconds: delaySec }, '⏰ Scheduled next post-scraper cycle poll');

    this.cycleTimer = setTimeout(async () => {
      logger.info('🔄 Scraper 5-min cycle elapsed. Performing synchronized sheet fetch...');
      await this.poll().catch(() => {});
      this.scheduleNextCyclePoll();
    }, delaySec * 1000);
  }

  /**
   * Stops background polling
   */
  public stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.cycleTimer) {
      clearTimeout(this.cycleTimer);
      this.cycleTimer = null;
    }
  }

  /**
   * Fetches latest sheet data and processes new results
   */
  public async poll(): Promise<ParsedPayload[]> {
    if (this.isPolling) {
      return [];
    }

    this.isPolling = true;
    try {
      let payloads: ParsedPayload[] = [];

      // Check if Service Account credentials are configured
      if (
        this.config.serviceAccountKeyFile ||
        (this.config.serviceAccountEmail && this.config.serviceAccountPrivateKey)
      ) {
        payloads = await this.fetchViaServiceAccount();
      } else {
        payloads = await this.fetchViaCsvExport();
      }

      let newCount = 0;
      for (const payload of payloads) {
        const cacheKey = `${payload.marketName.toUpperCase()}::${payload.session || 'GENERAL'}`;
        const prev = this.resultsCache.get(cacheKey);

        // Update in-memory cache
        this.resultsCache.set(cacheKey, {
          value: payload.value,
          timestamp: payload.timestamp,
          payload,
        });

        // Check if value is new or changed
        if (!prev || prev.value !== payload.value) {
          newCount++;
          this.emit('sheet_result', payload);
        }
      }

      this.emit('poll_complete', payloads.length);
      return payloads;
    } catch (err: any) {
      logger.warn({ err: err?.message || err }, 'Google Sheet fetch/parse failed');
      this.emit('error', err);
      return [];
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * Fetches data via CSV export link (Public / Anyone with link)
   */
  private async fetchViaCsvExport(): Promise<ParsedPayload[]> {
    const csvUrl = this.normalizeSheetUrl(this.config.sheetUrl);
    if (!csvUrl) return [];

    const res = await fetch(csvUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ResultBot/1.0',
        Accept: 'text/csv, text/plain, */*',
      },
    });

    if (!res.ok) {
      throw new Error(`Google Sheet request failed with HTTP ${res.status}: ${res.statusText}`);
    }

    const csvText = await res.text();
    return this.parseCsvData(csvText);
  }

  /**
   * Fetches data via Google Sheets API v4 using Service Account credentials
   */
  private async fetchViaServiceAccount(): Promise<ParsedPayload[]> {
    let clientEmail = this.config.serviceAccountEmail;
    let privateKey = this.config.serviceAccountPrivateKey;

    if (this.config.serviceAccountKeyFile && fs.existsSync(this.config.serviceAccountKeyFile)) {
      try {
        const keyData = JSON.parse(fs.readFileSync(this.config.serviceAccountKeyFile, 'utf-8'));
        clientEmail = keyData.client_email || clientEmail;
        privateKey = keyData.private_key || privateKey;
      } catch (err: any) {
        logger.warn({ err: err.message }, 'Failed to load service account key file');
      }
    }

    if (!clientEmail || !privateKey) {
      return this.fetchViaCsvExport();
    }

    const spreadsheetId = this.extractSpreadsheetId(this.config.sheetUrl);
    const token = await this.getServiceAccountAccessToken(clientEmail, privateKey);
    const a1Range = this.config.sheetTabName
      ? `'${this.config.sheetTabName.replace(/'/g, "''")}'!A:D`
      : 'A:D';
    const tabRange = encodeURIComponent(a1Range);
    const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${tabRange}`;

    const res = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      throw new Error(`Google Sheets API failed HTTP ${res.status}: ${res.statusText}`);
    }

    const data: any = await res.json();
    const rows: string[][] = (data.values || []).map((row: any[]) =>
      row.map((cell) => (cell !== null && cell !== undefined ? String(cell) : ''))
    );

    return this.parseRowsToPayloads(rows);
  }

  /**
   * Generates OAuth2 Google Access Token using Service Account RSA-SHA256 JWT
   */
  private async getServiceAccountAccessToken(clientEmail: string, privateKey: string): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.cachedAccessToken && this.cachedAccessToken.expiresAt > now + 60) {
      return this.cachedAccessToken.token;
    }

    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const claimSet = Buffer.from(
      JSON.stringify({
        iss: clientEmail,
        scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now,
      })
    ).toString('base64url');

    const sign = crypto.createSign('RSA-SHA256');
    sign.update(`${header}.${claimSet}`);
    const signature = sign.sign(privateKey, 'base64url');
    const jwt = `${header}.${claimSet}.${signature}`;

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });

    if (!res.ok) {
      throw new Error(`Google OAuth token exchange failed: HTTP ${res.status}`);
    }

    const tokenData: any = await res.json();
    this.cachedAccessToken = {
      token: tokenData.access_token,
      expiresAt: now + (tokenData.expires_in || 3600),
    };

    return tokenData.access_token;
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
   * Checks if Google Sheet currently has matching result for instant consensus resolution
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
   * Deconstructs any matka result format into its discrete components:
   * Open Pana, Open Ank, Close Ank, Close Pana, Jodi, formatted Open & Close.
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

    // 1. Full 3-phase result: 240-67-340 or 599-38-167
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

    // 3. Open Pana + Single: 599-3, 599-3*, 599-3*-***, 599-3-***
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
   * Parses CSV content into list of ParsedPayload records
   */
  public parseCsvData(csvText: string): ParsedPayload[] {
    const rows = this.parseCsvToRows(csvText);
    return this.parseRowsToPayloads(rows);
  }

  /**
   * Converts 2D array of rows into normalized ParsedPayload list
   */
  public parseRowsToPayloads(rows: string[][]): ParsedPayload[] {
    if (rows.length < 2) return [];

    const headers = rows[0].map((h) => h.trim());
    const headerIndices = this.resolveColumnIndices(headers);

    const payloads: ParsedPayload[] = [];
    const now = Date.now();

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length === 0 || row.every((c) => !c.trim())) continue;

      const rawMarketName = this.extractCell(row, headerIndices.marketName);
      if (!rawMarketName || this.isPlaceholder(rawMarketName)) continue;

      // Extract results
      const openVal = this.extractCell(row, headerIndices.open);
      const closeVal = this.extractCell(row, headerIndices.close);
      const jodiVal = this.extractCell(row, headerIndices.jodi);
      const fullVal = this.extractCell(row, headerIndices.fullResult);

      // 1. Process Open Result
      if (openVal && !this.isPlaceholder(openVal)) {
        const payload = this.buildPayload(rawMarketName, openVal, 'OPEN', now, row, headers);
        if (payload) payloads.push(payload);
      }

      // 2. Process Close Result
      if (closeVal && !this.isPlaceholder(closeVal)) {
        const payload = this.buildPayload(rawMarketName, closeVal, 'CLOSE', now, row, headers);
        if (payload) payloads.push(payload);
      }

      // 3. Process Full / Combined Result if standalone (e.g. "599-38-167" or "599-38-***" or "599-3")
      if (fullVal && !this.isPlaceholder(fullVal) && !openVal && !closeVal) {
        const decomp = this.decomposeResultComponents(fullVal);

        if (decomp.openFormatted) {
          const openPayload = this.buildPayload(
            rawMarketName,
            decomp.openFormatted,
            'OPEN',
            now,
            row,
            headers
          );
          if (openPayload) payloads.push(openPayload);
        }

        if (decomp.closePana && decomp.closeAnk) {
          const closePayload = this.buildPayload(
            rawMarketName,
            decomp.fullFormatted || decomp.closeFormatted || fullVal,
            'CLOSE',
            now,
            row,
            headers
          );
          if (closePayload) payloads.push(closePayload);
        } else if (!decomp.openFormatted) {
          // Fallback to standard parser
          const parsedNumber = this.parser.extractNumberPattern(fullVal);
          if (parsedNumber) {
            const payload = this.buildPayload(
              rawMarketName,
              parsedNumber.value,
              parsedNumber.session,
              now,
              row,
              headers
            );
            if (payload) payloads.push(payload);
          }
        }
      }

      // 4. Standalone Jodi if open/close not provided
      if (jodiVal && !this.isPlaceholder(jodiVal) && !openVal && !closeVal && !fullVal) {
        const cleanJodi = jodiVal.replace(/[^0-9]/g, '');
        if (cleanJodi.length === 2) {
          const payload = this.buildPayload(rawMarketName, cleanJodi, 'JODI', now, row, headers);
          if (payload) payloads.push(payload);
        }
      }
    }

    return payloads;
  }

  private buildPayload(
    rawMarketName: string,
    rawValue: string,
    inferredSession: 'OPEN' | 'CLOSE' | 'JODI' | undefined,
    timestamp: number,
    row: string[],
    headers: string[]
  ): ParsedPayload | null {
    const rawText = `${rawMarketName} ${rawValue}`;
    const cleanPattern = this.parser.extractNumberPattern(rawValue) || {
      value: rawValue.trim().replace(/[\*\s]/g, ''),
      session: inferredSession || 'OPEN',
    };

    if (!cleanPattern.value || this.isPlaceholder(cleanPattern.value)) {
      return null;
    }

    const { marketName, session } = this.scheduleService.resolveMarketAndSession(
      rawMarketName,
      rawText,
      cleanPattern.session || inferredSession,
      timestamp
    );

    return {
      value: cleanPattern.value,
      marketName,
      session,
      rawText,
      groupJid: 'google_sheets_scraper@sheet',
      groupName: 'GOOGLE SHEETS 24/7 SCRAPER',
      ownerId: this.config.ownerId || 'owner_web_scraper',
      senderJid: 'scraper@google.com',
      senderName: 'Web Scraper 24/7',
      timestamp,
    };
  }

  private isPlaceholder(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed) return true;
    if (/^[\*\-_xX\.\s]+$/.test(trimmed)) return true;
    if (/^(pending|upcoming|wait|loading|n\/a|null)$/i.test(trimmed)) return true;
    return false;
  }

  private extractCell(row: string[], index?: number): string | undefined {
    if (index === undefined || index < 0 || index >= row.length) return undefined;
    return row[index]?.trim();
  }

  /**
   * Resolves column indices from headers or custom user config
   */
  public resolveColumnIndices(headers: string[]): {
    marketName?: number;
    open?: number;
    close?: number;
    jodi?: number;
    fullResult?: number;
  } {
    const mapping = this.config.columnMapping || {};
    const normHeaders = headers.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));

    const findIndex = (customKey?: string, patterns: string[] = []): number | undefined => {
      // 1. Check custom configured column name or letter
      if (customKey) {
        const customLower = customKey.toLowerCase().replace(/[^a-z0-9]/g, '');
        const directIdx = normHeaders.indexOf(customLower);
        if (directIdx !== -1) return directIdx;

        // Check if customKey is column letter like "A", "B", "C"
        if (/^[a-z]$/i.test(customKey)) {
          const colLetterIdx = customKey.toUpperCase().charCodeAt(0) - 65;
          if (colLetterIdx >= 0 && colLetterIdx < headers.length) return colLetterIdx;
        }

        // Check if customKey is integer index
        const parsedInt = parseInt(customKey, 10);
        if (!isNaN(parsedInt) && parsedInt >= 0 && parsedInt < headers.length) {
          return parsedInt;
        }
      }

      // 2. Auto-match by common keywords
      for (const pat of patterns) {
        const idx = normHeaders.findIndex((h) => h.includes(pat));
        if (idx !== -1) return idx;
      }

      return undefined;
    };

    return {
      marketName: findIndex(mapping.marketName, ['market', 'bazar', 'game', 'name']),
      open: findIndex(mapping.open, ['open', 'opn', 'openpana', 'openpatti', 'openank']),
      close: findIndex(mapping.close, ['close', 'cls', 'closepana', 'closepatti', 'closeank']),
      jodi: findIndex(mapping.jodi, ['jodi', 'pair', 'center', 'ank']),
      fullResult: findIndex(mapping.fullResult, ['result', 'fullresult', 'chart', 'number', 'value']),
    };
  }

  /**
   * Robust CSV row splitter that handles quoted commas and escaped quotes
   */
  public parseCsvToRows(csvText: string): string[][] {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < csvText.length; i++) {
      const char = csvText[i];
      const nextChar = csvText[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentField += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        currentRow.push(currentField);
        currentField = '';
      } else if ((char === '\r' || char === '\n') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') {
          i++; // handle CRLF
        }
        currentRow.push(currentField);
        currentField = '';
        if (currentRow.some((f) => f.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
      } else {
        currentField += char;
      }
    }

    if (currentField.length > 0 || currentRow.length > 0) {
      currentRow.push(currentField);
      if (currentRow.some((f) => f.length > 0)) {
        rows.push(currentRow);
      }
    }

    return rows;
  }

  /**
   * Returns the count of cached market results.
   */
  public getCachedResultsCount(): number {
    return this.resultsCache.size;
  }

  /**
   * Returns all currently cached results.
   */
  public getAllCachedResults(): Map<
    string,
    { value: string; timestamp: number; payload: ParsedPayload }
  > {
    return new Map(this.resultsCache);
  }

  /**
   * Searches the cached results for a specific market name query.
   */
  public findResultsForMarket(query: string): Array<{
    marketName: string;
    session?: string;
    value: string;
    timestamp: number;
  }> {
    const q = query.toUpperCase().trim();
    const results: Array<{
      marketName: string;
      session?: string;
      value: string;
      timestamp: number;
    }> = [];

    for (const [key, entry] of this.resultsCache.entries()) {
      const [market, session] = key.split('::');
      if (market.includes(q) || q.includes(market)) {
        results.push({
          marketName: entry.payload.marketName || market,
          session: entry.payload.session || session,
          value: entry.value,
          timestamp: entry.timestamp,
        });
      }
    }

    return results;
  }
}
