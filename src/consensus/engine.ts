import { EventEmitter } from 'events';
import { Config } from '../config.js';
import {
  ParsedPayload,
  ConsensusCandidate,
  VerifiedPayloadEvent,
  GroupMatchRecord,
  BridgeStats,
  DispatchedSessionRecord,
} from '../types.js';
import { logger } from '../utils/logger.js';
import { MarketWhitelistService } from '../services/marketWhitelist.js';
import { SPECIAL_EXTERNAL_MARKETS } from '../khabarline/store.js';

const SPECIAL_MARKETS_SET = new Set(
  SPECIAL_EXTERNAL_MARKETS.map((m) => m.name.toUpperCase().trim())
);

export class ConsensusEngine extends EventEmitter {
  private config: Config['consensus'];
  private ownerMapping: Record<string, string>;
  private marketWhitelistService?: MarketWhitelistService;
  private pendingCandidates = new Map<string, ConsensusCandidate>();
  private candidateTimers = new Map<string, NodeJS.Timeout>();
  private dispatchedSessions = new Map<string, DispatchedSessionRecord>();
  private stats: BridgeStats = {
    startedAt: Date.now(),
    totalMessagesReceived: 0,
    totalPayloadsParsed: 0,
    totalConsensusReached: 0,
    totalUnverifiedDispatched: 0,
  };
  private gcIntervalTimer: NodeJS.Timeout | null = null;

  constructor(
    config: Config['consensus'],
    ownerMapping: Record<string, string> = {},
    marketWhitelistService?: MarketWhitelistService
  ) {
    super();
    this.config = config;
    this.ownerMapping = ownerMapping;
    this.marketWhitelistService = marketWhitelistService;
    this.gcIntervalTimer = setInterval(() => this.cleanupOldDispatched(), 30000);
    this.gcIntervalTimer.unref();
  }

  public setMarketWhitelistService(service: MarketWhitelistService): void {
    this.marketWhitelistService = service;
  }

  public stop(): void {
    if (this.gcIntervalTimer) {
      clearInterval(this.gcIntervalTimer);
      this.gcIntervalTimer = null;
    }
    for (const timer of this.candidateTimers.values()) {
      clearTimeout(timer);
    }
    this.candidateTimers.clear();
  }

  public isInstantVerifiedMarket(marketName: string): boolean {
    const upper = marketName.trim().toUpperCase();
    if (SPECIAL_MARKETS_SET.has(upper)) return true;
    if (this.marketWhitelistService?.getMarket(upper)?.isCustom) return true;
    return false;
  }

  public getOwnerId(groupJid: string, providedOwnerId?: string): string {
    return providedOwnerId || this.ownerMapping[groupJid] || groupJid;
  }

  private getTodayDateKey(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  /**
   * Generates a unique key for the specific market session today (e.g. "2026-9-5::MILAN DAY::OPEN")
   */
  public getMarketSessionKey(marketName: string, session?: string): string {
    return `${this.getTodayDateKey()}::${marketName.toUpperCase()}::${session || 'GENERAL'}`;
  }

  /**
   * Generates candidate key per value
   */
  public generateCandidateKey(item: ParsedPayload): string {
    const sessionKey = this.getMarketSessionKey(item.marketName, item.session);
    return `${sessionKey}::val:${item.value}`;
  }

  /**
   * Finds an existing WhatsApp candidate that a secondary source can verify.
   * This lets the sheet confirm a result without ever starting its own candidate.
   */
  public findPendingMatch(
    marketName: string,
    value: string,
    valuesMatch: (candidateValue: string, sourceValue: string) => boolean
  ): { value: string; session?: 'OPEN' | 'CLOSE' | 'JODI' } | null {
    const normalizedMarket = marketName.trim().toUpperCase();

    for (const candidate of this.pendingCandidates.values()) {
      if (
        candidate.status === 'pending' &&
        candidate.marketName.trim().toUpperCase() === normalizedMarket &&
        valuesMatch(candidate.value, value)
      ) {
        return { value: candidate.value, session: candidate.session };
      }
    }

    return null;
  }

  public recordDispatchedMetadata(
    sessionKey: string,
    meta: { telegramMessageId?: number; whatsappMessageKeys?: Record<string, any> }
  ): void {
    const rec = this.dispatchedSessions.get(sessionKey);
    if (rec) {
      if (meta.telegramMessageId) rec.telegramMessageId = meta.telegramMessageId;
      if (meta.whatsappMessageKeys) {
        rec.whatsappMessageKeys = {
          ...(rec.whatsappMessageKeys || {}),
          ...meta.whatsappMessageKeys,
        };
      }
    }
  }

  public processPayload(item: ParsedPayload): VerifiedPayloadEvent | null {
    // 0. Check Market Whitelist: Only process markets enabled in user's list
    if (this.marketWhitelistService && !this.marketWhitelistService.isMarketEnabled(item.marketName)) {
      logger.debug(
        { marketName: item.marketName, value: item.value },
        '⛔ Market not in whitelist or is disabled; dropping result.'
      );
      return null;
    }

    this.stats.totalPayloadsParsed++;
    const now = Date.now();
    const candidateKey = this.generateCandidateKey(item);
    const sessionKey = this.getMarketSessionKey(item.marketName, item.session);
    const ownerId = this.getOwnerId(item.groupJid, item.ownerId);

    // 1. Check if this market session was already dispatched (verified or unverified)
    const previouslyDispatched = this.dispatchedSessions.get(sessionKey);
    if (previouslyDispatched) {
      const elapsedSec = (now - previouslyDispatched.dispatchedAt) / 1000;
      if (elapsedSec >= this.config.dedupTtlSeconds) {
        this.dispatchedSessions.delete(sessionKey);
      } else if (previouslyDispatched.isVerified) {
        logger.debug(
          { marketName: item.marketName, session: item.session, value: item.value },
          'Market session already verified and dispatched; dropping duplicate message.'
        );
        return null;
      } else {
        // Previously dispatched as UNVERIFIED. Check if this new report matches value and comes from a distinct owner!
        const isMatchingValue = previouslyDispatched.value === item.value;
        const alreadyRecordedFromOwner = previouslyDispatched.matches.some(
          (m) => this.getOwnerId(m.groupJid, m.ownerId) === ownerId
        );

        if (isMatchingValue && !alreadyRecordedFromOwner) {
          // Late consensus confirmation! Upgrade unverified post to verified in-place
          const matchRecord: GroupMatchRecord = {
            groupJid: item.groupJid,
            groupName: item.groupName,
            ownerId,
            senderJid: item.senderJid,
            senderName: item.senderName,
            rawText: item.rawText,
            timestamp: item.timestamp || now,
          };

          previouslyDispatched.matches.push(matchRecord);
          previouslyDispatched.isVerified = true;
          this.stats.totalConsensusReached++;

          const upgradedEvent: VerifiedPayloadEvent = {
            marketName: previouslyDispatched.marketName,
            session: previouslyDispatched.session,
            value: previouslyDispatched.value,
            isVerified: true,
            isUpgrade: true,
            matches: [...previouslyDispatched.matches],
            firstSeenAt: previouslyDispatched.firstSeenAt,
            confirmedAt: now,
            timeToConsensusMs: now - previouslyDispatched.firstSeenAt,
            sessionKey,
            telegramMessageId: previouslyDispatched.telegramMessageId,
            whatsappMessageKeys: previouslyDispatched.whatsappMessageKeys,
          };

          logger.info(
            {
              market: upgradedEvent.marketName,
              session: upgradedEvent.session,
              value: upgradedEvent.value,
              telegramMessageId: upgradedEvent.telegramMessageId,
            },
            '⚡ LATE CONSENSUS REACHED! Upgrading unverified post to verified in-place.'
          );

          this.emit('consensus_reached', upgradedEvent);
          return upgradedEvent;
        } else {
          return null;
        }
      }
    }

    // 2. Fetch or create candidate
    let candidate = this.pendingCandidates.get(candidateKey);
    const windowMs = this.config.timeWindowSeconds * 1000;

    if (!candidate) {
      candidate = {
        key: candidateKey,
        marketName: item.marketName,
        session: item.session,
        value: item.value,
        roundId: item.roundId,
        matches: [],
        firstSeenAt: now,
        lastSeenAt: now,
        status: 'pending',
      };
      this.pendingCandidates.set(candidateKey, candidate);

      // Start timer for unverified dispatch if consensus not reached
      const timer = setTimeout(() => {
        this.handleTimeoutExpiry(candidateKey, sessionKey);
      }, windowMs);
      this.candidateTimers.set(candidateKey, timer);
    }

    // 3. Ensure distinct owner/entity counting (prevents same owner's channel + group from verifying each other)
    const alreadyRecordedFromOwner = candidate.matches.some(
      (m) => this.getOwnerId(m.groupJid, m.ownerId) === ownerId
    );

    if (alreadyRecordedFromOwner) {
      logger.info(
        {
          candidateKey,
          ownerId,
          groupJid: item.groupJid,
          groupName: item.groupName,
        },
        'Ignoring repeat match from same owner/entity (channel + group of same owner).'
      );
      return null;
    }

    // 4. Add match record
    const matchRecord: GroupMatchRecord = {
      groupJid: item.groupJid,
      groupName: item.groupName,
      ownerId,
      senderJid: item.senderJid,
      senderName: item.senderName,
      rawText: item.rawText,
      timestamp: item.timestamp || now,
    };

    candidate.matches.push(matchRecord);
    candidate.lastSeenAt = now;

    // Distinct owners who confirmed this result
    const distinctOwners = new Set(
      candidate.matches.map((m) => this.getOwnerId(m.groupJid, m.ownerId))
    );

    const isInstant = this.isInstantVerifiedMarket(item.marketName);
    const requiredMatches = isInstant ? 1 : this.config.minMatches;

    logger.info(
      {
        market: item.marketName,
        session: item.session,
        value: item.value,
        distinctOwnersCount: distinctOwners.size,
        requiredMatches,
        isInstant,
        source: item.groupName || item.groupJid,
        ownerId,
      },
      `Match recorded from owner "${ownerId}" (${distinctOwners.size}/${requiredMatches} distinct owners)${isInstant ? ' [INSTANT 1-MESSAGE VERIFIED]' : ''}`
    );

    // 5. Check if consensus threshold reached across DISTINCT OWNERS
    if (distinctOwners.size >= requiredMatches && candidate.status === 'pending') {
      candidate.status = 'verified';
      const confirmedAt = now;
      const timeToConsensusMs = confirmedAt - candidate.firstSeenAt;

      // Clear the timeout timer
      const timer = this.candidateTimers.get(candidateKey);
      if (timer) {
        clearTimeout(timer);
        this.candidateTimers.delete(candidateKey);
      }

      const verifiedEvent: VerifiedPayloadEvent = {
        marketName: candidate.marketName,
        session: candidate.session,
        value: candidate.value,
        isVerified: true,
        isUpgrade: false,
        matches: [...candidate.matches],
        firstSeenAt: candidate.firstSeenAt,
        confirmedAt,
        timeToConsensusMs,
        sessionKey,
      };

      // Mark session as dispatched
      this.dispatchedSessions.set(sessionKey, {
        marketName: candidate.marketName,
        session: candidate.session,
        value: candidate.value,
        isVerified: true,
        dispatchedAt: confirmedAt,
        matches: [...candidate.matches],
        firstSeenAt: candidate.firstSeenAt,
      });
      this.pendingCandidates.delete(candidateKey);
      this.stats.totalConsensusReached++;

      logger.info(
        {
          market: verifiedEvent.marketName,
          session: verifiedEvent.session,
          value: verifiedEvent.value,
          timeToConsensusMs,
          sources: verifiedEvent.matches.map((m) => `${m.groupName || m.groupJid} [${m.ownerId}]`),
        },
        '🎉 CONSENSUS VERIFIED! Distinct owners agreed. Dispatching green tick alert.'
      );

      this.emit('consensus_reached', verifiedEvent);
      return verifiedEvent;
    }

    return null;
  }

  /**
   * Fires after window timeout if candidate never reached consensus threshold
   */
  private handleTimeoutExpiry(candidateKey: string, sessionKey: string): void {
    const candidate = this.pendingCandidates.get(candidateKey);
    this.candidateTimers.delete(candidateKey);

    if (!candidate || candidate.status !== 'pending') {
      return;
    }

    // If session was already dispatched, drop silently
    if (this.dispatchedSessions.has(sessionKey)) {
      this.pendingCandidates.delete(candidateKey);
      return;
    }

    const now = Date.now();
    candidate.status = 'unverified';

    const unverifiedEvent: VerifiedPayloadEvent = {
      marketName: candidate.marketName,
      session: candidate.session,
      value: candidate.value,
      isVerified: false,
      isUpgrade: false,
      matches: [...candidate.matches],
      firstSeenAt: candidate.firstSeenAt,
      confirmedAt: now,
      timeToConsensusMs: now - candidate.firstSeenAt,
      sessionKey,
    };

    // Mark session as dispatched
    this.dispatchedSessions.set(sessionKey, {
      marketName: candidate.marketName,
      session: candidate.session,
      value: candidate.value,
      isVerified: false,
      dispatchedAt: now,
      matches: [...candidate.matches],
      firstSeenAt: candidate.firstSeenAt,
    });
    this.pendingCandidates.delete(candidateKey);
    this.stats.totalUnverifiedDispatched++;

    logger.warn(
      {
        market: unverifiedEvent.marketName,
        session: unverifiedEvent.session,
        value: unverifiedEvent.value,
        matchCount: unverifiedEvent.matches.length,
        windowSeconds: this.config.timeWindowSeconds,
      },
      `⏱ ${this.config.timeWindowSeconds}s Window Expired without consensus. Dispatching red cross alert.`
    );

    this.emit('consensus_reached', unverifiedEvent);
  }

  private cleanupOldDispatched(): void {
    const now = Date.now();
    const dedupTtlMs = this.config.dedupTtlSeconds * 1000;
    for (const [key, record] of this.dispatchedSessions.entries()) {
      if (now - record.dispatchedAt > dedupTtlMs) {
        this.dispatchedSessions.delete(key);
      }
    }
  }

  public getStats(): BridgeStats {
    return { ...this.stats };
  }

  public getPendingCandidatesCount(): number {
    return this.pendingCandidates.size;
  }

  public getPendingCandidates(): ConsensusCandidate[] {
    return Array.from(this.pendingCandidates.values());
  }

  public getDispatchedHistory(limit = 50): Array<DispatchedSessionRecord & { sessionKey: string }> {
    const list: Array<DispatchedSessionRecord & { sessionKey: string }> = [];
    for (const [sessionKey, record] of this.dispatchedSessions.entries()) {
      list.push({ ...record, sessionKey });
    }
    return list.sort((a, b) => b.dispatchedAt - a.dispatchedAt).slice(0, limit);
  }

  /**
   * Force verify a pending candidate or unverified session from the Admin Dashboard
   */
  public forceVerify(key: string): VerifiedPayloadEvent | null {
    const now = Date.now();

    // Case 1: Key matches a pending candidate
    let candidateKey = key;
    let candidate = this.pendingCandidates.get(key);

    if (!candidate) {
      for (const [k, c] of this.pendingCandidates.entries()) {
        if (
          k === key ||
          k.startsWith(key) ||
          c.key === key ||
          this.getMarketSessionKey(c.marketName, c.session) === key
        ) {
          candidate = c;
          candidateKey = k;
          break;
        }
      }
    }

    if (candidate) {
      const timer = this.candidateTimers.get(candidateKey);
      if (timer) {
        clearTimeout(timer);
        this.candidateTimers.delete(candidateKey);
      }

      const sessionKey = this.getMarketSessionKey(candidate.marketName, candidate.session);
      const confirmedAt = now;
      const timeToConsensusMs = confirmedAt - candidate.firstSeenAt;

      const adminMatch: GroupMatchRecord = {
        groupJid: 'admin@dashboard',
        groupName: 'Admin Dashboard (Force Verified)',
        ownerId: 'admin_dashboard',
        senderJid: 'admin@dashboard',
        senderName: 'Admin',
        rawText: candidate.value,
        timestamp: now,
      };

      const matches = [...candidate.matches, adminMatch];

      const verifiedEvent: VerifiedPayloadEvent = {
        marketName: candidate.marketName,
        session: candidate.session,
        value: candidate.value,
        isVerified: true,
        isUpgrade: false,
        matches,
        firstSeenAt: candidate.firstSeenAt,
        confirmedAt,
        timeToConsensusMs,
        sessionKey,
      };

      this.dispatchedSessions.set(sessionKey, {
        marketName: candidate.marketName,
        session: candidate.session,
        value: candidate.value,
        isVerified: true,
        dispatchedAt: confirmedAt,
        matches,
        firstSeenAt: candidate.firstSeenAt,
      });

      this.pendingCandidates.delete(candidateKey);
      this.stats.totalConsensusReached++;

      logger.info(
        { market: candidate.marketName, session: candidate.session, value: candidate.value },
        '⚡ ADMIN FORCE VERIFY EXECUTED! Broadcasting verified result.'
      );

      this.emit('consensus_reached', verifiedEvent);
      return verifiedEvent;
    }

    // Case 2: Check if key matches an unverified dispatched session
    for (const [sessionKey, sessionRecord] of this.dispatchedSessions.entries()) {
      if (sessionKey === key || key.includes(sessionKey) || sessionKey.includes(key)) {
        if (!sessionRecord.isVerified) {
          sessionRecord.isVerified = true;
          this.stats.totalConsensusReached++;

          const upgradedEvent: VerifiedPayloadEvent = {
            marketName: sessionRecord.marketName,
            session: sessionRecord.session,
            value: sessionRecord.value,
            isVerified: true,
            isUpgrade: true,
            matches: [...sessionRecord.matches],
            firstSeenAt: sessionRecord.firstSeenAt,
            confirmedAt: now,
            timeToConsensusMs: now - sessionRecord.firstSeenAt,
            sessionKey,
            telegramMessageId: sessionRecord.telegramMessageId,
            whatsappMessageKeys: sessionRecord.whatsappMessageKeys,
          };

          logger.info(
            { market: sessionRecord.marketName, session: sessionRecord.session, value: sessionRecord.value },
            '⚡ ADMIN FORCE VERIFIED UNVERIFIED SESSION! Upgrading broadcast in-place.'
          );

          this.emit('consensus_reached', upgradedEvent);
          return upgradedEvent;
        }
      }
    }

    return null;
  }

  public dismissCandidate(key: string): boolean {
    let candidateKey = key;
    let candidate = this.pendingCandidates.get(key);

    if (!candidate) {
      for (const [k, c] of this.pendingCandidates.entries()) {
        if (
          k === key ||
          k.startsWith(key) ||
          c.key === key ||
          this.getMarketSessionKey(c.marketName, c.session) === key
        ) {
          candidate = c;
          candidateKey = k;
          break;
        }
      }
    }

    if (candidate) {
      const timer = this.candidateTimers.get(candidateKey);
      if (timer) {
        clearTimeout(timer);
        this.candidateTimers.delete(candidateKey);
      }
      this.pendingCandidates.delete(candidateKey);
      logger.info({ key: candidateKey, market: candidate.marketName }, '🗑️ Pending candidate dismissed by Admin');
      return true;
    }

    if (this.dispatchedSessions.has(key)) {
      this.dispatchedSessions.delete(key);
      logger.info({ key }, '🗑️ Dispatched session dismissed by Admin');
      return true;
    }

    return false;
  }

  public manualBroadcast(
    marketName: string,
    value: string,
    session?: 'OPEN' | 'CLOSE' | 'JODI'
  ): VerifiedPayloadEvent {
    const now = Date.now();
    const sessionKey = this.getMarketSessionKey(marketName, session);
    const adminMatch: GroupMatchRecord = {
      groupJid: 'admin@dashboard',
      groupName: 'Admin Manual Entry',
      ownerId: 'admin_manual',
      senderJid: 'admin@dashboard',
      senderName: 'Admin',
      rawText: value,
      timestamp: now,
    };

    const verifiedEvent: VerifiedPayloadEvent = {
      marketName: marketName.trim().toUpperCase(),
      session,
      value: value.trim(),
      isVerified: true,
      isUpgrade: false,
      matches: [adminMatch],
      firstSeenAt: now,
      confirmedAt: now,
      timeToConsensusMs: 0,
      sessionKey,
    };

    this.dispatchedSessions.set(sessionKey, {
      marketName: verifiedEvent.marketName,
      session: verifiedEvent.session,
      value: verifiedEvent.value,
      isVerified: true,
      dispatchedAt: now,
      matches: [adminMatch],
      firstSeenAt: now,
    });

    this.stats.totalConsensusReached++;
    logger.info({ market: verifiedEvent.marketName, session, value }, '📢 Manual result broadcast triggered by Admin');
    this.emit('consensus_reached', verifiedEvent);
    return verifiedEvent;
  }

  public incrementMessagesCount(): void {
    this.stats.totalMessagesReceived++;
  }

  public getDispatchedSession(marketName: string, session?: string): DispatchedSessionRecord | undefined {
    const today = this.getTodayDateKey();
    const market = marketName.toUpperCase().trim();
    const normSession = session ? session.toUpperCase().trim() : undefined;

    if (normSession && normSession !== 'ALL') {
      const sessionKey = this.getMarketSessionKey(market, normSession);
      const direct = this.dispatchedSessions.get(sessionKey);
      if (direct) return direct;
    }

    // If session is 'ALL' or not specified, search for any dispatched session for this market today:
    // Check in priority order: CLOSE -> OPEN -> JODI -> GENERAL
    const closeRec = this.dispatchedSessions.get(`${today}::${market}::CLOSE`);
    if (closeRec) return closeRec;
    const openRec = this.dispatchedSessions.get(`${today}::${market}::OPEN`);
    if (openRec) return openRec;
    const jodiRec = this.dispatchedSessions.get(`${today}::${market}::JODI`);
    if (jodiRec) return jodiRec;
    const genRec = this.dispatchedSessions.get(`${today}::${market}::GENERAL`);
    if (genRec) return genRec;

    return undefined;
  }

  public getDispatchedSessionsForToday(marketName: string): DispatchedSessionRecord[] {
    const prefix = `${this.getTodayDateKey()}::${marketName.toUpperCase().trim()}::`;
    const list: DispatchedSessionRecord[] = [];
    for (const [key, record] of this.dispatchedSessions.entries()) {
      if (key.startsWith(prefix)) {
        list.push(record);
      }
    }
    return list;
  }

  public getAllDispatchedSessions(): Map<string, DispatchedSessionRecord> {
    return new Map(this.dispatchedSessions);
  }
}
