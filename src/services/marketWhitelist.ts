import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import { MarketScheduleService } from './schedule.js';

export interface WhitelistedMarket {
  name: string;
  enabled: boolean;
  openTime?: string;
  closeTime?: string;
  openMinute?: number;
  closeMinute?: number;
  isCustom?: boolean;
  responseFormat?: 'result' | 'answer'; // 'result' (default) or 'answer'
  customAnswer?: string; // Manual answer string (e.g. "BSRM")
  updatedAt?: number;
}

export interface MarketWhitelistData {
  enabledOnly: boolean; // if true, only enabled markets are processed
  markets: Record<string, WhitelistedMarket>;
}

export class MarketWhitelistService extends EventEmitter {
  private filePath: string;
  private markets = new Map<string, WhitelistedMarket>();
  private enabledOnly: boolean = true;
  private scheduleService?: MarketScheduleService;

  constructor(
    filePath: string = path.resolve(process.cwd(), 'data/whitelisted_markets.json'),
    scheduleService?: MarketScheduleService
  ) {
    super();
    this.filePath = filePath;
    this.scheduleService = scheduleService;
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const data: MarketWhitelistData = JSON.parse(raw);
        this.enabledOnly = data.enabledOnly ?? true;

        if (data.markets) {
          this.markets.clear();
          for (const [name, item] of Object.entries(data.markets)) {
            this.markets.set(name.trim().toUpperCase(), {
              ...item,
              name: item.name || name,
              responseFormat: item.responseFormat === 'answer' ? 'answer' : 'result',
              customAnswer: item.customAnswer,
            });
          }
        }
        logger.info(
          { totalMarkets: this.markets.size, enabledCount: this.getEnabledCount() },
          '📂 Loaded whitelisted markets configuration'
        );
        return;
      }
    } catch (err: any) {
      logger.warn({ err: err?.message || err }, 'Failed to read whitelisted_markets.json, will initialize defaults');
    }

    // Initialize defaults from schedule
    this.populateDefaultsFromSchedule();
  }

  public populateDefaultsFromSchedule(): void {
    const masterMarkets = this.scheduleService ? this.scheduleService.getAllMarkets() : [];
    this.markets.clear();

    if (masterMarkets.length > 0) {
      for (const m of masterMarkets) {
        const key = m.name.trim().toUpperCase();
        this.markets.set(key, {
          name: m.name,
          enabled: true,
          openTime: m.openTime,
          closeTime: m.closeTime,
          openMinute: m.openMinute,
          closeMinute: m.closeMinute,
          isCustom: false,
          responseFormat: 'result',
          updatedAt: Date.now(),
        });
      }
    }

    this.save();
    logger.info({ totalMarkets: this.markets.size }, '✅ Initialized default whitelisted markets list');
  }

  private save(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const data: MarketWhitelistData = {
        enabledOnly: this.enabledOnly,
        markets: Object.fromEntries(this.markets.entries()),
      };

      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err: any) {
      logger.error({ err: err?.message || err }, 'Failed to save whitelisted_markets.json');
    }
  }

  /**
   * Checks if a market is enabled for consensus verification and broadcasting
   */
  public isMarketEnabled(marketName: string): boolean {
    if (!marketName) return false;
    const key = marketName.trim().toUpperCase();

    // If whitelist exists and has entries:
    const item = this.markets.get(key);
    if (item) {
      return item.enabled;
    }

    // Try canonical prefix matching (e.g. "KALYAN DAY" -> "KALYAN")
    for (const [name, market] of this.markets.entries()) {
      if (key === name || key.startsWith(`${name} `) || name.startsWith(`${key} `)) {
        return market.enabled;
      }
    }

    // If market is not in whitelist at all:
    // If enabledOnly is true, non-whitelisted markets are rejected
    return !this.enabledOnly;
  }

  public isWhitelisted(marketName: string): boolean {
    return this.isMarketEnabled(marketName);
  }

  /**
   * Checks if a market is configured to send 'answer' rather than 'result'
   */
  public isAnswerMarket(marketName: string): boolean {
    if (!marketName) return false;
    const key = marketName.trim().toUpperCase();

    const item = this.markets.get(key);
    if (item) {
      return item.responseFormat === 'answer';
    }

    // Canonical prefix/suffix matching
    for (const [name, market] of this.markets.entries()) {
      if (key === name || key.startsWith(`${name} `) || name.startsWith(`${key} `)) {
        return market.responseFormat === 'answer';
      }
    }

    return false;
  }

  public getMarket(marketName: string): WhitelistedMarket | undefined {
    const key = marketName.trim().toUpperCase();
    return this.markets.get(key);
  }

  public getAllMarkets(): WhitelistedMarket[] {
    return Array.from(this.markets.values());
  }

  public getEnabledCount(): number {
    let count = 0;
    for (const m of this.markets.values()) {
      if (m.enabled) count++;
    }
    return count;
  }

  public setMarketStatus(marketName: string, enabled: boolean): boolean {
    const key = marketName.trim().toUpperCase();
    let item = this.markets.get(key);

    if (!item) {
      item = {
        name: marketName.trim().toUpperCase(),
        enabled,
        responseFormat: 'result',
        isCustom: true,
        updatedAt: Date.now(),
      };
      this.markets.set(key, item);
    } else {
      item.enabled = enabled;
      item.updatedAt = Date.now();
    }

    this.save();
    this.emit('market_updated', item);
    logger.info({ market: key, enabled }, 'Market whitelist status updated');
    return true;
  }

  public setMarketResponseFormat(marketName: string, format: 'result' | 'answer'): boolean {
    const key = marketName.trim().toUpperCase();
    let item = this.markets.get(key);

    if (!item) {
      item = {
        name: marketName.trim().toUpperCase(),
        enabled: true,
        responseFormat: format,
        isCustom: true,
        updatedAt: Date.now(),
      };
      this.markets.set(key, item);
    } else {
      item.responseFormat = format;
      item.updatedAt = Date.now();
    }

    this.save();
    this.emit('market_updated', item);
    logger.info({ market: key, responseFormat: format }, 'Market response format updated');
    return true;
  }

  public setMarketCustomAnswer(marketName: string, answer: string): boolean {
    const key = marketName.trim().toUpperCase();
    let item = this.markets.get(key);

    if (!item) {
      item = {
        name: marketName.trim().toUpperCase(),
        enabled: true,
        responseFormat: 'answer',
        customAnswer: answer,
        isCustom: true,
        updatedAt: Date.now(),
      };
      this.markets.set(key, item);
    } else {
      item.customAnswer = answer;
      item.responseFormat = 'answer';
      item.updatedAt = Date.now();
    }

    this.save();
    this.emit('market_updated', item);
    logger.info({ market: key, customAnswer: answer }, 'Market custom answer set');
    return true;
  }

  public getMarketCustomAnswer(marketName: string): string | undefined {
    if (!marketName) return undefined;
    const key = marketName.trim().toUpperCase();
    const item = this.markets.get(key);
    if (item && item.customAnswer !== undefined) {
      return item.customAnswer;
    }
    for (const [name, market] of this.markets.entries()) {
      if (key === name || key.startsWith(`${name} `) || name.startsWith(`${key} `)) {
        return market.customAnswer;
      }
    }
    return undefined;
  }

  public setAllMarketsStatus(enabled: boolean): void {
    for (const item of this.markets.values()) {
      item.enabled = enabled;
      item.updatedAt = Date.now();
    }
    this.save();
    this.emit('all_markets_updated', enabled);
    logger.info({ enabled }, 'All markets whitelist status updated');
  }

  public addOrUpdateMarket(market: Partial<WhitelistedMarket> & { name: string }): boolean {
    const key = market.name.trim().toUpperCase();
    const existing = this.markets.get(key);

    const updated: WhitelistedMarket = {
      name: key,
      enabled: market.enabled !== undefined ? market.enabled : existing ? existing.enabled : true,
      openTime: market.openTime || existing?.openTime || '',
      closeTime: market.closeTime || existing?.closeTime || '',
      openMinute: market.openMinute !== undefined ? market.openMinute : existing?.openMinute,
      closeMinute: market.closeMinute !== undefined ? market.closeMinute : existing?.closeMinute,
      isCustom: existing ? existing.isCustom : true,
      responseFormat: market.responseFormat || existing?.responseFormat || 'result',
      customAnswer: market.customAnswer !== undefined ? market.customAnswer : existing?.customAnswer,
      updatedAt: Date.now(),
    };

    this.markets.set(key, updated);
    this.save();
    this.emit('market_updated', updated);
    logger.info({ market: key }, 'Market added or updated in whitelist');
    return true;
  }

  public deleteMarket(marketName: string): boolean {
    const key = marketName.trim().toUpperCase();
    const existed = this.markets.delete(key);
    if (existed) {
      this.save();
      this.emit('market_deleted', key);
      logger.info({ market: key }, 'Market deleted from whitelist');
    }
    return existed;
  }
}
