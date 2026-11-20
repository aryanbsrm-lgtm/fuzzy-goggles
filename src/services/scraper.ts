import { EventEmitter } from 'events';
import { exec } from 'child_process';
import util from 'util';
import http from 'http';
import https from 'https';
import { Config } from '../config.js';
import { logger } from '../utils/logger.js';

const execAsync = util.promisify(exec);

export interface ScrapeResult {
  success: boolean;
  message: string;
  durationMs: number;
  mode: 'cli' | 'http' | 'skipped' | 'none';
}

export class ScraperService extends EventEmitter {
  private config: Config['scraper'];
  private isScraping = false;
  private lastScrapeTimestamp = 0;

  constructor(config: Config['scraper']) {
    super();
    this.config = config;
  }

  /**
   * Triggers the web scraper on demand with concurrency locking and debouncing.
   * @param force - If true, bypasses the debounce timer (used for manual Telegram commands).
   */
  public async triggerScrape(force = false): Promise<ScrapeResult> {
    if (!this.config.enabled) {
      logger.debug('Scraper integration is disabled in config.');
      return {
        success: false,
        message: 'Scraper service is disabled in configuration.',
        durationMs: 0,
        mode: 'none',
      };
    }

    const now = Date.now();
    const elapsedSec = (now - this.lastScrapeTimestamp) / 1000;

    // Debounce check (skip if ran very recently unless forced)
    if (!force && elapsedSec < this.config.debounceSeconds) {
      const waitRemaining = Math.ceil(this.config.debounceSeconds - elapsedSec);
      logger.debug(
        { elapsedSec, debounceSec: this.config.debounceSeconds, waitRemaining },
        '⏳ Scraper triggered recently. Skipping duplicate run due to debounce.'
      );
      return {
        success: true,
        message: `Debounced (ran ${Math.round(elapsedSec)}s ago, next in ${waitRemaining}s)`,
        durationMs: 0,
        mode: 'skipped',
      };
    }

    // Concurrency lock check
    if (this.isScraping) {
      logger.debug('⚠️ Scraper is already executing. Ignoring concurrent trigger.');
      return {
        success: true,
        message: 'Scraper is already running in background.',
        durationMs: 0,
        mode: 'skipped',
      };
    }

    this.isScraping = true;
    const startTime = Date.now();
    this.emit('scrape_start');

    logger.info(
      {
        mode: this.config.triggerMode,
        command: this.config.cliCommand,
        httpUrl: this.config.httpUrl,
        forced: force,
      },
      '🚀 Triggering on-demand website scrape...'
    );

    try {
      let result: ScrapeResult;

      if (this.config.triggerMode === 'http') {
        result = await this.triggerViaHttp();
      } else if (this.config.triggerMode === 'cli') {
        result = await this.triggerViaCli();
      } else {
        // 'auto' mode: try CLI first, fallback to HTTP
        try {
          result = await this.triggerViaCli();
        } catch (cliErr: any) {
          logger.warn(
            { err: cliErr.message },
            'CLI scraper execution failed or not found. Falling back to HTTP trigger...'
          );
          result = await this.triggerViaHttp();
        }
      }

      this.lastScrapeTimestamp = Date.now();
      const durationMs = Date.now() - startTime;
      result.durationMs = durationMs;

      logger.info(
        {
          success: result.success,
          durationMs,
          mode: result.mode,
          message: result.message,
        },
        '🏁 On-demand scrape completed'
      );

      this.emit('scrape_complete', result);
      return result;
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      logger.error({ err: err.message, durationMs }, '❌ Failed to execute on-demand scrape');

      const failResult: ScrapeResult = {
        success: false,
        message: `Scrape failed: ${err.message}`,
        durationMs,
        mode: 'none',
      };
      this.emit('scrape_error', err);
      return failResult;
    } finally {
      this.isScraping = false;
    }
  }

  /**
   * Executes the scraper via local Python CLI subprocess on the host / VPS.
   */
  private async triggerViaCli(): Promise<ScrapeResult> {
    const command = this.config.cliCommand;
    const cwd = this.config.workingDir || process.cwd();

    logger.debug({ command, cwd }, 'Executing scraper CLI command...');

    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout: 45000,
      env: { ...process.env },
    });

    const output = (stdout || stderr || '').trim();
    return {
      success: true,
      message: output || 'Scrape completed via CLI',
      durationMs: 0,
      mode: 'cli',
    };
  }

  /**
   * Executes the scraper via local Flask HTTP endpoint (scraper-hub).
   */
  private async triggerViaHttp(): Promise<ScrapeResult> {
    const targetUrl = this.config.httpUrl;
    logger.debug({ url: targetUrl }, 'Triggering scraper via HTTP request...');

    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(targetUrl);
      const isHttps = parsedUrl.protocol === 'https:';
      const client = isHttps ? https : http;

      const req = client.request(
        targetUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'ResultBot-ConsensusBridge/1.0',
          },
          timeout: 45000,
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => {
            body += chunk;
          });
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve({
                success: true,
                message: body || `HTTP ${res.statusCode} OK`,
                durationMs: 0,
                mode: 'http',
              });
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${body || res.statusMessage}`));
            }
          });
        }
      );

      req.on('error', (err) => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Scraper HTTP request timed out after 45s'));
      });

      req.end();
    });
  }

  public getStatus() {
    return {
      enabled: this.config.enabled,
      isScraping: this.isScraping,
      lastScrapeTimestamp: this.lastScrapeTimestamp,
      debounceSeconds: this.config.debounceSeconds,
      autoTriggerOnUnverified: this.config.autoTriggerOnUnverified,
      triggerMode: this.config.triggerMode,
    };
  }
}
