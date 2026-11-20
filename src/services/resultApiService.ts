import crypto from 'crypto';
import http from 'http';
import { URL } from 'url';
import { Config } from '../config.js';
import { KhabarlineStore } from '../khabarline/store.js';
import { ConsensusEngine } from '../consensus/engine.js';
import { MarketWhitelistService } from './marketWhitelist.js';
import { GameResultApiRequest, GameResultApiResponse, GameResultData } from '../types.js';
import { logger } from '../utils/logger.js';

export class ResultApiService {
  private config: Config['api'];
  private store: KhabarlineStore;
  private consensusEngine?: ConsensusEngine;
  private whitelistService?: MarketWhitelistService;

  constructor(
    config: Config['api'],
    store: KhabarlineStore,
    consensusEngine?: ConsensusEngine,
    whitelistService?: MarketWhitelistService
  ) {
    this.config = config;
    this.store = store;
    this.consensusEngine = consensusEngine;
    this.whitelistService = whitelistService;
  }

  /**
   * Helper utility to generate cryptographic signatures for external API clients
   */
  public static generateHash(
    gameName: string,
    date: string,
    session: string,
    secretKey: string,
    algorithm: 'sha256' | 'md5' | 'hmac-sha256' = 'sha256'
  ): string {
    const cleanGame = gameName.trim().toUpperCase();
    const cleanDate = date.trim();
    const cleanSession = (session || 'ALL').trim().toUpperCase();

    if (algorithm === 'hmac-sha256') {
      return crypto
        .createHmac('sha256', secretKey)
        .update(`${cleanGame}|${cleanDate}|${cleanSession}`)
        .digest('hex');
    }

    if (algorithm === 'md5') {
      return crypto
        .createHash('md5')
        .update(`${cleanGame}${cleanDate}${cleanSession}${secretKey}`)
        .digest('hex');
    }

    // Default: SHA256 pipe delimited
    return crypto
      .createHash('sha256')
      .update(`${cleanGame}|${cleanDate}|${cleanSession}|${secretKey}`)
      .digest('hex');
  }

  /**
   * Validates authentication via direct secret key or cryptographic hash signature
   */
  public validateAuth(params: {
    hashKey?: string;
    key?: string;
    apiKey?: string;
    authHeader?: string;
    hash?: string;
    signature?: string;
    gameName?: string;
    date?: string;
    session?: string;
  }): { valid: boolean; error?: string; matchedKey?: string } {
    const allowedKeys = new Set<string>();
    if (this.config.hashKey) allowedKeys.add(this.config.hashKey);
    if (Array.isArray(this.config.allowedHashKeys)) {
      for (const k of this.config.allowedHashKeys) {
        if (k && k.trim()) allowedKeys.add(k.trim());
      }
    }

    // 1. Direct key from header (Authorization: Bearer <key>, X-Api-Key, X-Hash-Key)
    if (params.authHeader) {
      const cleanHeader = params.authHeader.replace(/^Bearer\s+/i, '').trim();
      if (allowedKeys.has(cleanHeader)) {
        return { valid: true, matchedKey: cleanHeader };
      }
    }

    // 2. Direct key from parameter or body
    const providedDirectKey = (params.hashKey || params.key || params.apiKey || '').trim();
    if (providedDirectKey && allowedKeys.has(providedDirectKey)) {
      return { valid: true, matchedKey: providedDirectKey };
    }

    // 3. Cryptographic hash / signature verification
    const providedHash = (params.hash || params.signature || '').trim().toLowerCase();
    if (providedHash && params.gameName) {
      const game = params.gameName.trim().toUpperCase();
      const date = (params.date || this.getTodayIST()).trim();
      const session = (params.session || 'ALL').trim().toUpperCase();

      for (const secret of allowedKeys) {
        // Test HMAC-SHA256
        const hmac = crypto
          .createHmac('sha256', secret)
          .update(`${game}|${date}|${session}`)
          .digest('hex')
          .toLowerCase();
        if (hmac === providedHash) {
          return { valid: true, matchedKey: secret };
        }

        // Test SHA256 pipe delimited
        const sha256Piped = crypto
          .createHash('sha256')
          .update(`${game}|${date}|${session}|${secret}`)
          .digest('hex')
          .toLowerCase();
        if (sha256Piped === providedHash) {
          return { valid: true, matchedKey: secret };
        }

        // Test SHA256 concatenated
        const sha256Concat = crypto
          .createHash('sha256')
          .update(`${game}${date}${session}${secret}`)
          .digest('hex')
          .toLowerCase();
        if (sha256Concat === providedHash) {
          return { valid: true, matchedKey: secret };
        }

        // Test MD5 concatenated
        const md5Concat = crypto
          .createHash('md5')
          .update(`${game}${date}${session}${secret}`)
          .digest('hex')
          .toLowerCase();
        if (md5Concat === providedHash) {
          return { valid: true, matchedKey: secret };
        }

        // Test MD5 pipe delimited
        const md5Piped = crypto
          .createHash('md5')
          .update(`${game}|${date}|${session}|${secret}`)
          .digest('hex')
          .toLowerCase();
        if (md5Piped === providedHash) {
          return { valid: true, matchedKey: secret };
        }
      }
    }

    return {
      valid: false,
      error: 'Unauthorized: Invalid or missing hashKey, apiKey, or cryptographic signature.',
    };
  }

  /**
   * Returns today's date in Indian Standard Time (IST, UTC+5:30) formatted as YYYY-MM-DD
   */
  public getTodayIST(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  /**
   * Normalizes incoming date string to standard YYYY-MM-DD
   */
  public normalizeDate(dateStr?: string): { isoDate: string; isToday: boolean; isPast: boolean } {
    const today = this.getTodayIST();
    if (!dateStr || dateStr.trim().toLowerCase() === 'today' || dateStr.trim() === '') {
      return { isoDate: today, isToday: true, isPast: false };
    }

    const trimmed = dateStr.trim();
    if (trimmed.toLowerCase() === 'yesterday') {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      const yest = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(d);
      return { isoDate: yest, isToday: false, isPast: true };
    }

    // Check DD-MM-YYYY or DD/MM/YYYY
    const ddmmyyyy = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (ddmmyyyy) {
      const day = ddmmyyyy[1].padStart(2, '0');
      const month = ddmmyyyy[2].padStart(2, '0');
      const year = ddmmyyyy[3];
      const iso = `${year}-${month}-${day}`;
      return {
        isoDate: iso,
        isToday: iso === today,
        isPast: iso < today,
      };
    }

    // Check YYYY-MM-DD or YYYY/MM/DD
    const yyyymmdd = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (yyyymmdd) {
      const year = yyyymmdd[1];
      const month = yyyymmdd[2].padStart(2, '0');
      const day = yyyymmdd[3].padStart(2, '0');
      const iso = `${year}-${month}-${day}`;
      return {
        isoDate: iso,
        isToday: iso === today,
        isPast: iso < today,
      };
    }

    // Default to today if unparseable
    return { isoDate: today, isToday: true, isPast: false };
  }

  /**
   * Main service function to query verified market results
   */
  public getGameResult(request: GameResultApiRequest & { authHeader?: string; internal?: boolean }): GameResultApiResponse {
    // 1. Verify Authentication (skip if internal query from server endpoints)
    if (!request.internal) {
      const authResult = this.validateAuth({
        hashKey: request.hashKey,
        key: request.key,
        apiKey: request.apiKey,
        authHeader: request.authHeader,
        hash: request.hash,
        signature: request.signature,
        gameName: request.gameName,
        date: request.date,
        session: request.session || request.gameSession,
      });

      if (!authResult.valid) {
        return {
          success: false,
          code: 'UNAUTHORIZED',
          error: authResult.error || 'Unauthorized: Invalid hashKey or signature.',
        };
      }
    }

    // 2. Validate Game Name
    if (!request.gameName || !request.gameName.trim()) {
      return {
        success: false,
        code: 'MISSING_PARAM',
        error: 'Parameter "gameName" (or "marketName") is required.',
      };
    }

    const rawGameName = request.gameName.trim();
    const market = this.store.getMarket(rawGameName);

    if (!market) {
      return {
        success: false,
        code: 'MARKET_NOT_FOUND',
        error: `Game/Market "${rawGameName}" not found in system catalog.`,
      };
    }

    // 3. Resolve Date and Session
    const { isoDate, isToday, isPast } = this.normalizeDate(request.date);
    const rawSession = (request.session || request.gameSession || 'ALL').trim().toUpperCase();
    const session: 'OPEN' | 'CLOSE' | 'JODI' | 'ALL' =
      rawSession === 'OPEN' || rawSession === 'CLOSE' || rawSession === 'JODI' ? rawSession : 'ALL';

    // 4. Resolve Live vs Historical
    if (isToday) {
      return this.resolveTodayResult(market, isoDate, session);
    } else {
      return this.resolveHistoricalResult(market, isoDate, session);
    }
  }

  /**
   * Returns whether a market is configured for 'result' or 'answer' format
   */
  public getMarketFormat(marketName: string): 'result' | 'answer' {
    if (this.whitelistService && this.whitelistService.isAnswerMarket(marketName)) {
      return 'answer';
    }
    return 'result';
  }

  /**
   * Helper utility to parse time strings like "11:40 AM" or "08:45 PM" into minutes from midnight (0-1439)
   */
  public parseTimeToMinute(timeStr?: string): number | undefined {
    if (!timeStr) return undefined;
    const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!match) return undefined;
    let hours = parseInt(match[1], 10);
    const mins = parseInt(match[2], 10);
    const meridiem = match[3].toUpperCase();
    if (meridiem === 'PM' && hours < 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;
    return hours * 60 + mins;
  }

  /**
   * Helper utility to get current minute of day in Indian Standard Time (IST, UTC+5:30)
   */
  public getCurrentMinuteIST(): number {
    const istString = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date());
    const [h, m] = istString.split(':').map(Number);
    return h * 60 + m;
  }

  /**
   * Resolves live result for today
   */
  private resolveTodayResult(
    market: any,
    isoDate: string,
    session: 'OPEN' | 'CLOSE' | 'JODI' | 'ALL'
  ): GameResultApiResponse {
    const isAnswer = this.getMarketFormat(market.name) === 'answer';

    if (isAnswer) {
      const customAnswer = this.whitelistService?.getMarketCustomAnswer(market.name);
      const answerVal = customAnswer || '***-**-***';
      const data: GameResultData = {
        gameName: market.name,
        marketName: market.name,
        slug: market.slug,
        date: isoDate,
        session,
        status: 'NOT_DECLARED',
        isDeclared: false,
        isVerified: false,
        answer: answerVal,
        responseFormat: 'answer',
        fullResult: answerVal,
        openTime: market.openTime,
        closeTime: market.closeTime,
        lastUpdated: market.lastUpdated || new Date().toISOString(),
        timestamp: Date.now(),
      };

      return {
        success: true,
        code: 'OK',
        data,
      };
    }

    // 1. Check if consensus engine has verified sessions today
    const dispatchedOpen = this.consensusEngine?.getDispatchedSession(market.name, 'OPEN');
    const dispatchedClose = this.consensusEngine?.getDispatchedSession(market.name, 'CLOSE');
    const dispatchedAny = this.consensusEngine?.getDispatchedSession(market.name, session);
    const isEngineVerified = Boolean(
      dispatchedAny?.isVerified || dispatchedOpen?.isVerified || dispatchedClose?.isVerified
    );

    const currentMin = this.getCurrentMinuteIST();
    const openMin = market.openMinute ?? this.parseTimeToMinute(market.openTime);
    const closeMin = market.closeMinute ?? this.parseTimeToMinute(market.closeTime);
    const isOvernight = openMin !== undefined && closeMin !== undefined && closeMin < openMin;

    // A store open result is only valid for today if draw time has arrived
    const isStoreOpenAllowed = openMin === undefined || currentMin >= openMin;

    // A store close result is only valid for today if:
    // - For daytime market: closeMin has arrived
    // - For overnight market: can only happen after midnight during early hours (currentMin < 300), never during daytime before openMin
    const isStoreCloseAllowed = isOvernight
      ? (currentMin < 300 && closeMin !== undefined && currentMin >= closeMin)
      : (closeMin === undefined || currentMin >= closeMin);

    // 2. Check if market store has verified today
    // Store verification is strictly valid only if draw time has arrived or consensus verified it
    const isStoreVerifiedToday = Boolean(
      market.verifiedDate === isoDate &&
      market.isVerified &&
      (isStoreOpenAllowed || Boolean(dispatchedOpen?.isVerified))
    );

    const hasTodayVerification = isEngineVerified || isStoreVerifiedToday;

    // 3. If market has NOT been verified/declared today at all, strictly return NOT_DECLARED (never leak yesterday's result)
    if (!hasTodayVerification) {
      const defaultEmptyResult =
        session === 'OPEN'
          ? '***-*'
          : session === 'CLOSE'
          ? '*-***'
          : session === 'JODI'
          ? '**'
          : '***-**-***';

      return {
        success: true,
        code: 'OK',
        data: {
          gameName: market.name,
          marketName: market.name,
          slug: market.slug,
          date: isoDate,
          session,
          status: 'NOT_DECLARED',
          isDeclared: false,
          isVerified: false,
          result: defaultEmptyResult,
          responseFormat: 'result',
          fullResult: '***-**-***',
          openTime: market.openTime,
          closeTime: market.closeTime,
          lastUpdated: market.lastUpdated || new Date().toISOString(),
          timestamp: Date.now(),
        },
      };
    }

    // 4. Resolve verified numbers: prioritize today's verified consensus sessions over raw store values
    const decomposed = this.store.decomposeResult(market.value || '');
    let openPana: string | undefined;
    let openDigit: string | undefined;
    let closeDigit: string | undefined;
    let closePana: string | undefined;
    let jodi: string | undefined;

    if (dispatchedOpen && dispatchedOpen.value) {
      const dOpen = this.store.decomposeResult(dispatchedOpen.value);
      openPana = dOpen.openPana;
      openDigit = dOpen.openAnk;
    } else {
      openPana = (market.openPana && market.openPana !== '***')
        ? market.openPana
        : (decomposed.openPana && decomposed.openPana !== '***' ? decomposed.openPana : undefined);
      openDigit = (market.openAnk && market.openAnk !== '*')
        ? market.openAnk
        : (decomposed.openAnk && decomposed.openAnk !== '*' ? decomposed.openAnk : undefined);
    }

    if (dispatchedClose && dispatchedClose.value) {
      const dClose = this.store.decomposeResult(dispatchedClose.value);
      closeDigit = dClose.closeAnk;
      closePana = dClose.closePana;
    } else {
      closeDigit = (market.closeAnk && market.closeAnk !== '*')
        ? market.closeAnk
        : (decomposed.closeAnk && decomposed.closeAnk !== '*' ? decomposed.closeAnk : undefined);
      closePana = (market.closePana && market.closePana !== '***')
        ? market.closePana
        : (decomposed.closePana && decomposed.closePana !== '***' ? decomposed.closePana : undefined);
    }

    if (openDigit && closeDigit) {
      jodi = `${openDigit}${closeDigit}`;
    } else if (market.jodi && !market.jodi.includes('*')) {
      jodi = market.jodi;
    }

    const isOpenDeclared = Boolean(
      openPana &&
      openDigit &&
      (Boolean(dispatchedOpen?.isVerified) ||
        (market.verifiedDate === isoDate && market.isVerified && isStoreOpenAllowed &&
          (market.verifiedSession === 'OPEN' || market.verifiedSession === 'ALL' || (!market.verifiedSession && openPana !== '***' && openDigit !== '*'))))
    );
    const isCloseDeclared = Boolean(
      closeDigit &&
      closePana &&
      (Boolean(dispatchedClose?.isVerified) ||
        (market.verifiedDate === isoDate && market.isVerified && isStoreCloseAllowed &&
          (market.verifiedSession === 'CLOSE' || market.verifiedSession === 'ALL' || (!market.verifiedSession && closePana !== '***' && closeDigit !== '*'))))
    );
    const isFullDeclared = Boolean(isOpenDeclared && isCloseDeclared);

    let sessionResult = market.value || '***-**-***';
    let isDeclared = false;

    if (session === 'OPEN') {
      if (isOpenDeclared) {
        sessionResult = `${openPana}-${openDigit}`;
        isDeclared = true;
      } else {
        sessionResult = '***-*';
        isDeclared = false;
      }
    } else if (session === 'CLOSE') {
      if (isCloseDeclared) {
        sessionResult = `${closeDigit}-${closePana}`;
        isDeclared = true;
      } else {
        sessionResult = '*-***';
        isDeclared = false;
      }
    } else if (session === 'JODI') {
      if (isFullDeclared && jodi) {
        sessionResult = jodi;
        isDeclared = true;
      } else if (isOpenDeclared && openDigit) {
        sessionResult = `${openDigit}*`;
        isDeclared = false;
      } else {
        sessionResult = '**';
        isDeclared = false;
      }
    } else {
      // ALL / FULL
      if (isFullDeclared) {
        sessionResult = `${openPana}-${openDigit}${closeDigit}-${closePana}`;
        isDeclared = true;
      } else if (isOpenDeclared) {
        sessionResult = `${openPana}-${openDigit}`;
        isDeclared = true;
      } else if (isCloseDeclared) {
        sessionResult = `${closeDigit}-${closePana}`;
        isDeclared = true;
      } else {
        sessionResult = '***-**-***';
        isDeclared = false;
      }
    }

    const isVerified = Boolean(isDeclared && hasTodayVerification);
    const status: 'VERIFIED' | 'PENDING' | 'NOT_DECLARED' = !isDeclared
      ? 'NOT_DECLARED'
      : isVerified
      ? 'VERIFIED'
      : 'PENDING';

    const fullResult = isFullDeclared
      ? `${openPana}-${openDigit}${closeDigit}-${closePana}`
      : isOpenDeclared
      ? `${openPana}-${openDigit}`
      : market.value || '***-**-***';

    const data: GameResultData = {
      gameName: market.name,
      marketName: market.name,
      slug: market.slug,
      date: isoDate,
      session,
      status,
      isDeclared,
      isVerified,
      result: sessionResult,
      responseFormat: 'result',
      openPana: isOpenDeclared ? openPana : undefined,
      openDigit: isOpenDeclared ? openDigit : undefined,
      closeDigit: isCloseDeclared ? closeDigit : undefined,
      closePana: isCloseDeclared ? closePana : undefined,
      jodi: isFullDeclared ? jodi : undefined,
      fullResult,
      openTime: market.openTime,
      closeTime: market.closeTime,
      lastUpdated: market.lastUpdated || new Date().toISOString(),
      timestamp: Date.now(),
    };

    return {
      success: true,
      code: 'OK',
      data,
    };
  }

  /**
   * Resolves historical result from panel/jodi chart records for requested past date
   */
  private resolveHistoricalResult(
    market: any,
    isoDate: string,
    session: 'OPEN' | 'CLOSE' | 'JODI' | 'ALL'
  ): GameResultApiResponse {
    const isAnswer = this.getMarketFormat(market.name) === 'answer';

    if (isAnswer) {
      const customAnswer = this.whitelistService?.getMarketCustomAnswer(market.name);
      const answerVal = customAnswer || '***-**-***';
      return {
        success: true,
        code: 'OK',
        data: {
          gameName: market.name,
          marketName: market.name,
          slug: market.slug,
          date: isoDate,
          session,
          status: 'NOT_DECLARED',
          isDeclared: false,
          isVerified: false,
          answer: answerVal,
          responseFormat: 'answer',
          fullResult: answerVal,
          openTime: market.openTime,
          closeTime: market.closeTime,
          lastUpdated: new Date().toISOString(),
          timestamp: Date.now(),
        },
      };
    }

    const chartRows = this.store.getChartRows(market.slug);
    const targetDate = new Date(`${isoDate}T12:00:00+05:30`);
    const dayOfWeek = targetDate.getDay(); // 0 = Sun, 1 = Mon, ...
    const dayKeyMap: Record<number, 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'> = {
      0: 'sun',
      1: 'mon',
      2: 'tue',
      3: 'wed',
      4: 'thu',
      5: 'fri',
      6: 'sat',
    };
    const dayKey = dayKeyMap[dayOfWeek] || 'mon';

    // Find the chart week containing targetDate
    let matchedSlot: { openPana?: string; jodi?: string; closePana?: string } | null = null;

    for (const row of chartRows) {
      if (row.dateRange) {
        // Parse date range (e.g. "22/09/2026 to 28/09/2026" or "01-09-2026 To 07-09-2026")
        const rangeMatch = row.dateRange.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4}).*?(\d{1,2})[-/](\d{1,2})[-/](\d{4})/i);
        if (rangeMatch) {
          const startIso = `${rangeMatch[3]}-${rangeMatch[2].padStart(2, '0')}-${rangeMatch[1].padStart(2, '0')}`;
          const endIso = `${rangeMatch[6]}-${rangeMatch[5].padStart(2, '0')}-${rangeMatch[4].padStart(2, '0')}`;
          if (isoDate >= startIso && isoDate <= endIso) {
            matchedSlot = (row as any)[dayKey] || null;
            break;
          }
        }
      }
    }

    // Fallback if not matched by exact week range: use latest chart row if historical
    if (!matchedSlot && chartRows.length > 0) {
      const latestRow = chartRows[chartRows.length - 1];
      matchedSlot = (latestRow as any)[dayKey] || null;
    }

    if (matchedSlot && (matchedSlot.openPana || matchedSlot.jodi || matchedSlot.closePana)) {
      const openPana = matchedSlot.openPana && matchedSlot.openPana !== '***' ? matchedSlot.openPana : undefined;
      const jodi = matchedSlot.jodi && matchedSlot.jodi !== '**' ? matchedSlot.jodi : undefined;
      const closePana = matchedSlot.closePana && matchedSlot.closePana !== '***' ? matchedSlot.closePana : undefined;

      const openDigit = jodi ? jodi[0] : undefined;
      const closeDigit = jodi && jodi.length > 1 ? jodi[1] : undefined;
      const fullResult = `${openPana || '***'}-${jodi || '**'}-${closePana || '***'}`;

      let sessionResult = fullResult;
      let isDeclared = Boolean(openPana || jodi || closePana);

      if (session === 'OPEN') {
        sessionResult = openPana && openDigit ? `${openPana}-${openDigit}` : '***-*';
      } else if (session === 'CLOSE') {
        sessionResult = closeDigit && closePana ? `${closeDigit}-${closePana}` : '*-***';
      } else if (session === 'JODI') {
        sessionResult = jodi || '**';
      }

      return {
        success: true,
        code: 'OK',
        data: {
          gameName: market.name,
          marketName: market.name,
          slug: market.slug,
          date: isoDate,
          session,
          status: 'VERIFIED',
          isDeclared,
          isVerified: true,
          result: sessionResult,
          responseFormat: 'result',
          openPana,
          openDigit,
          closeDigit,
          closePana,
          jodi,
          fullResult,
          openTime: market.openTime,
          closeTime: market.closeTime,
          lastUpdated: new Date().toISOString(),
          timestamp: Date.now(),
        },
      };
    }

    const defaultEmptyResult = session === 'OPEN' ? '***-*' : session === 'CLOSE' ? '*-***' : session === 'JODI' ? '**' : '***-**-***';

    // If historical date has no records declared
    return {
      success: true,
      code: 'OK',
      data: {
        gameName: market.name,
        marketName: market.name,
        slug: market.slug,
        date: isoDate,
        session,
        status: 'NOT_DECLARED',
        isDeclared: false,
        isVerified: false,
        result: defaultEmptyResult,
        responseFormat: 'result',
        openTime: market.openTime,
        closeTime: market.closeTime,
        timestamp: Date.now(),
      },
    };
  }

  /**
   * Handles incoming HTTP requests for the Verified Game Result API
   */
  public async handleHttpRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    parsedUrl: URL,
    body: any = {}
  ): Promise<boolean> {
    const pathname = parsedUrl.pathname;
    const method = req.method?.toUpperCase() || 'GET';

    // Recognized API routes
    const isApiRoute =
      pathname === '/api/v1/gameResult' ||
      pathname === '/api/gameResult' ||
      pathname === '/api/v1/result' ||
      pathname === '/api/result';

    if (!isApiRoute) {
      return false;
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Api-Key, X-Hash-Key');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return true;
    }

    try {
      // Extract parameters from query (GET) or body (POST)
      const queryParams = parsedUrl.searchParams;
      const gameName = body.gameName || body.marketName || body.game || queryParams.get('gameName') || queryParams.get('marketName') || queryParams.get('game');
      const date = body.date || queryParams.get('date');
      const session = body.session || body.gameSession || queryParams.get('session') || queryParams.get('gameSession');
      const hashKey = body.hashKey || body.key || body.apiKey || queryParams.get('hashKey') || queryParams.get('key') || queryParams.get('apiKey');
      const hash = body.hash || body.signature || queryParams.get('hash') || queryParams.get('signature');
      const authHeader = (req.headers['authorization'] || req.headers['x-api-key'] || req.headers['x-hash-key']) as string | undefined;

      const request: GameResultApiRequest & { authHeader?: string } = {
        gameName: String(gameName || ''),
        date: date ? String(date) : undefined,
        session: session ? String(session) : undefined,
        hashKey: hashKey ? String(hashKey) : undefined,
        hash: hash ? String(hash) : undefined,
        authHeader,
      };

      const result = this.getGameResult(request);

      const statusCode = result.success
        ? 200
        : result.code === 'UNAUTHORIZED'
        ? 401
        : result.code === 'MARKET_NOT_FOUND'
        ? 404
        : 400;

      res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(result, null, 2));
      return true;
    } catch (err: any) {
      logger.error({ err: err?.message || err }, 'Error in ResultApiService handleHttpRequest');
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          success: false,
          code: 'SERVER_ERROR',
          error: 'Internal server error processing result query',
        })
      );
      return true;
    }
  }
}
