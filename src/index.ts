// Lock entire runtime environment strictly to Indian Standard Time (IST, UTC+5:30)
process.env.TZ = 'Asia/Kolkata';

import { loadConfig } from './config.js';
import { logger } from './utils/logger.js';
import { MessageParser } from './parser/index.js';
import { ConsensusEngine } from './consensus/engine.js';
import { WhatsAppClient } from './whatsapp/client.js';
import { TelegramService } from './telegram/bot.js';
import { GroupApprovalService } from './services/groupApproval.js';
import { DpbossScraperService } from './services/dpbossScraper.js';
import { GoogleSheetService } from './services/sheets.js';
import { ScraperService } from './services/scraper.js';
import { MarketWhitelistService } from './services/marketWhitelist.js';
import { ResultApiService } from './services/resultApiService.js';
import { DashboardServer } from './dashboard/server.js';
import { KhabarlineStore, KhabarlineServer } from './khabarline/index.js';

// Resilience: Catch transient socket and network rejections without crashing
process.on('unhandledRejection', (reason: any) => {
  logger.warn({ reason: reason?.message || reason }, '⚠️ Unhandled promise rejection intercepted (handled gracefully)');
});

process.on('uncaughtException', (err: any) => {
  logger.warn({ err: err?.message || err }, '⚠️ Uncaught exception intercepted (handled gracefully)');
});

async function main() {
  console.log(`
  ╔═══════════════════════════════════════════════════════════╗
  ║       CROSS-PLATFORM CONSENSUS MESSAGE BRIDGE             ║
  ║     Multi-Source Verification & Forwarding Engine         ║
  ╚═══════════════════════════════════════════════════════════╝
  `);

  // 1. Load configuration
  let config;
  try {
    config = loadConfig();
  } catch (err: any) {
    logger.error({ err: err.errors || err.message }, 'Configuration error. Please check .env or config.json');
    process.exit(1);
  }

  logger.info(
    {
      sourceGroupsCount: config.whatsapp.sourceGroups.length,
      minMatches: config.consensus.minMatches,
      timeWindowSec: config.consensus.timeWindowSeconds,
      parserMode: config.parser.mode,
      hasTelegramToken: Boolean(config.telegram.botToken),
      adminCount: config.telegram.adminIds.length,
      dpbossEnabled: config.dpboss.enabled,
      dpbossPollIntervalSec: config.dpboss.pollIntervalSeconds,
      sheetsEnabled: config.sheets.enabled,
      scraperEnabled: config.scraper.enabled,
      dashboardPort: config.dashboard.port,
    },
    'Starting Bridge Engine with Market Whitelist & Admin Dashboard...'
  );

  // 2. Initialize Core Subsystems
  const parser = new MessageParser(config.parser);
  const marketWhitelistService = new MarketWhitelistService(undefined, parser.scheduleService);
  const consensusEngine = new ConsensusEngine(
    config.consensus,
    {
      ...config.whatsapp.ownerMapping,
      'dpboss_boston@web': config.dpboss.ownerId,
    },
    marketWhitelistService
  );
  const groupApprovalService = new GroupApprovalService(undefined, config.telegram.targetChatId);
  const dpbossScraperService = new DpbossScraperService(config.dpboss, parser.scheduleService, parser);
  const googleSheetService = new GoogleSheetService(config.sheets, parser.scheduleService, parser);
  const scraperService = new ScraperService(config.scraper);
  const telegramService = new TelegramService(
    config,
    consensusEngine,
    groupApprovalService,
    dpbossScraperService,
    googleSheetService,
    scraperService
  );
  const whatsAppClient = new WhatsAppClient(config.whatsapp);
  const khabarlineStore = new KhabarlineStore(undefined, marketWhitelistService);
  const resultApiService = new ResultApiService(
    config.api,
    khabarlineStore,
    consensusEngine,
    marketWhitelistService
  );
  const khabarlineServer = new KhabarlineServer(config.khabarline, khabarlineStore, resultApiService);
  const dashboardServer = new DashboardServer(
    config.dashboard,
    consensusEngine,
    marketWhitelistService,
    groupApprovalService,
    config,
    scraperService,
    dpbossScraperService,
    googleSheetService,
    khabarlineStore,
    resultApiService
  );

  // Whenever an on-demand scrape finishes, immediately poll the Sheet to update cached records
  scraperService.on('scrape_complete', () => {
    if (config.sheets.enabled) {
      googleSheetService.poll().catch(() => {});
    }
  });

  // 3. Wire Up Consensus Event -> Telegram (All Approved Groups) & WhatsApp Dispatchers
  consensusEngine.on('consensus_reached', async (verifiedEvent) => {
    logger.info(
      {
        market: verifiedEvent.marketName,
        session: verifiedEvent.session,
        value: verifiedEvent.value,
        isVerified: verifiedEvent.isVerified,
        isUpgrade: verifiedEvent.isUpgrade,
        matchCount: verifiedEvent.matches.length,
      },
      verifiedEvent.isUpgrade
        ? '⚡ Consensus upgraded! Broadcasting verified update to approved groups...'
        : 'Consensus reached, dispatching to destinations...'
    );

    // INSTANT 0ms UPDATE: Synchronously update Khabarline Store & Result API on any verified result
    if (verifiedEvent.isVerified) {
      khabarlineStore.updateMarketResult(
        verifiedEvent.marketName,
        verifiedEvent.value,
        true,
        verifiedEvent.session
      );
      logger.info(
        { market: verifiedEvent.marketName, value: verifiedEvent.value },
        '🌐 Auto-published verified consensus result to khabarline.site and Result API with 0ms latency!'
      );
    }

    let whatsappMessageKeys = verifiedEvent.whatsappMessageKeys || {};
    const approvedTelegramChats = groupApprovalService.getApprovedChats();

    if (!verifiedEvent.isVerified) {
      // STRICT POLICY: UNVERIFIED results are NEVER broadcast to Telegram channels or approved groups!
      logger.info(
        { approvedDestinationsCount: approvedTelegramChats.length },
        '⏳ Unverified result: Forwarding to internal WhatsApp destination only, skipping ALL Telegram groups.'
      );

      const waRes = await whatsAppClient.sendVerifiedEvent(verifiedEvent);
      if (waRes.success) {
        logger.info('🚀 Unverified result delivered to WhatsApp destination group.');
        whatsappMessageKeys = waRes.messageKeys;
      }

      consensusEngine.recordDispatchedMetadata(verifiedEvent.sessionKey, {
        telegramMessageId: undefined,
        whatsappMessageKeys,
      });
    } else if (verifiedEvent.isUpgrade) {
      // UPGRADE TO VERIFIED:
      // 1. Broadcast to ALL Approved Telegram Channels & Groups with group-specific templates
      const tgRes = await telegramService.notifier.broadcastVerifiedEvent(
        verifiedEvent,
        approvedTelegramChats
      );
      if (tgRes.success) {
        logger.info(
          { deliveredCount: tgRes.deliveredCount },
          '🚀 Upgraded verified result broadcast to all approved Telegram groups.'
        );
      }

      // 2. In WhatsApp: Delete previous Unverified message, then post clean Verified message
      if (Object.keys(whatsappMessageKeys).length > 0) {
        logger.info('🗑️ Deleting unverified message from WhatsApp Group before posting verified...');
        await whatsAppClient.deleteMessages(whatsappMessageKeys);
      }

      const waRes = await whatsAppClient.sendVerifiedEvent(verifiedEvent);
      if (waRes.success) {
        logger.info('🚀 Verified result delivered to WhatsApp destination group.');
        whatsappMessageKeys = waRes.messageKeys;
      }

      consensusEngine.recordDispatchedMetadata(verifiedEvent.sessionKey, {
        whatsappMessageKeys,
      });
    } else {
      // DIRECT CONSENSUS (VERIFIED ON 1ST PASS):
      // 1. Broadcast to ALL Approved Telegram Channels & Groups with group-specific templates
      const tgRes = await telegramService.notifier.broadcastVerifiedEvent(
        verifiedEvent,
        approvedTelegramChats
      );
      if (tgRes.success) {
        logger.info(
          { deliveredCount: tgRes.deliveredCount },
          '🚀 Verified update delivered to all approved Telegram groups.'
        );
      }

      // 2. Post to WhatsApp Group
      const waRes = await whatsAppClient.sendVerifiedEvent(verifiedEvent);
      if (waRes.success) {
        logger.info('🚀 Verified update delivered to WhatsApp destination group successfully.');
        whatsappMessageKeys = waRes.messageKeys;
      }
    }
  });

  // 4. Wire Up DPBoss.boston Live Scraper Stream -> Consensus Engine & Khabarline Store
  if (config.dpboss.enabled) {
    dpbossScraperService.on('dpboss_batch_markets', (batch) => {
      const updated = khabarlineStore.syncFromDpbossFull(batch);
      if (updated > 0) {
        logger.info(
          { updatedMarkets: updated },
          '🔄 Synced live batch market results and timings from DPBoss to Khabarline store'
        );
      }
    });

    dpbossScraperService.on('dpboss_result', (payload) => {
      // Keep khabarline market cache in sync with latest numbers (unverified until consensus reached)
      khabarlineStore.updateMarketResult(payload.marketName, payload.value, false);

      const pendingMatch = consensusEngine.findPendingMatch(
        payload.marketName,
        payload.value,
        (candidateValue, scrapedValue) =>
          dpbossScraperService.areValuesMatching(candidateValue, scrapedValue)
      );

      if (!pendingMatch) {
        logger.debug(
          { market: payload.marketName, value: payload.value },
          'DPBoss result cached; no pending candidate needs verification.'
        );
        return;
      }

      const verificationPayload = {
        ...payload,
        value: pendingMatch.value,
        session: pendingMatch.session,
      };

      logger.info(
        {
          market: verificationPayload.marketName,
          session: verificationPayload.session,
          value: verificationPayload.value,
          source: 'DPBoss.boston Live Scraper',
        },
        '🌐 DPBoss result matches a pending candidate result! Triggering consensus.'
      );
      consensusEngine.processPayload(verificationPayload);
    });

    dpbossScraperService.start();
  }

  // 5. Wire Up Google Sheets Scraper Stream -> Consensus Engine
  if (config.sheets.enabled) {
    googleSheetService.on('sheet_result', (payload) => {
      const pendingMatch = consensusEngine.findPendingMatch(
        payload.marketName,
        payload.value,
        (candidateValue, sheetValue) =>
          googleSheetService.areValuesMatching(candidateValue, sheetValue)
      );

      if (!pendingMatch) {
        logger.debug(
          { market: payload.marketName, value: payload.value },
          'Sheet result cached; no pending WhatsApp result needs verification.'
        );
        return;
      }

      const verificationPayload = {
        ...payload,
        value: pendingMatch.value,
        session: pendingMatch.session,
      };

      logger.info(
        {
          market: verificationPayload.marketName,
          session: verificationPayload.session,
          value: verificationPayload.value,
          source: 'GoogleSheet24x7Scraper',
        },
        '📊 Sheet result matches a pending WhatsApp result'
      );
      consensusEngine.processPayload(verificationPayload);
    });

    googleSheetService.start();
  }

  // 6. Wire Up WhatsApp Message Stream -> Parser -> Consensus Engine + Scraper Verification Cycle
  whatsAppClient.onMessage(async (rawMsg) => {
    consensusEngine.incrementMessagesCount();

    logger.info(
      { from: rawMsg.groupName || rawMsg.groupJid, text: rawMsg.text },
      '📩 Incoming message from group/channel'
    );

    const parsed = parser.parse(rawMsg);
    if (!parsed) {
      return;
    }

    // Drop immediately if market is disabled in whitelist
    if (!marketWhitelistService.isMarketEnabled(parsed.marketName)) {
      logger.debug(
        { market: parsed.marketName, value: parsed.value },
        '⛔ Market is disabled in whitelist; skipping consensus, scraper, and dispatch.'
      );
      return;
    }

    logger.info(
      {
        value: parsed.value,
        id: parsed.roundId,
        from: parsed.groupName || parsed.groupJid,
      },
      '🎯 Valid payload extracted'
    );

    const event = consensusEngine.processPayload(parsed);

    // If consensus not yet verified, trigger DPBoss and Sheet verification checks & cycle
    if (!event) {
      // 1. Check DPBoss.boston live cache first
      if (config.dpboss.enabled) {
        const dpbossMatch = dpbossScraperService.checkMatch(
          parsed.marketName,
          parsed.value,
          parsed.session
        );

        if (dpbossMatch) {
          logger.info(
            {
              market: parsed.marketName,
              value: parsed.value,
              session: parsed.session,
            },
            '⚡ DPBoss.boston cache matches WhatsApp report! Instant verification triggered.'
          );
          consensusEngine.processPayload(dpbossMatch);
          return;
        }

        // Trigger active DPBoss verification cycle for this unverified candidate
        if (config.dpboss.autoVerifyOnUnverified) {
          dpbossScraperService.startVerificationCycle(
            parsed.marketName,
            parsed.value,
            parsed.session,
            (match) => {
              consensusEngine.processPayload(match);
            }
          );
        }
      }

      // 2. Check Google Sheet scraper cache as secondary
      if (config.sheets.enabled) {
        const sheetMatch = googleSheetService.checkMatch(
          parsed.marketName,
          parsed.value,
          parsed.session
        );

        if (sheetMatch) {
          logger.info(
            {
              market: parsed.marketName,
              value: parsed.value,
              session: parsed.session,
            },
            '⚡ Google Sheet scraper matches WhatsApp report! Instant verification triggered.'
          );
          consensusEngine.processPayload(sheetMatch);
          return;
        }

        if (config.scraper.enabled && config.scraper.autoTriggerOnUnverified) {
          logger.info(
            {
              market: parsed.marketName,
              value: parsed.value,
              session: parsed.session,
            },
            '🚀 Unverified result: Triggering on-demand website scraper for fast verification...'
          );
          scraperService.triggerScrape().catch((err) => {
            logger.warn({ err: err.message }, 'Failed background on-demand scrape trigger');
            googleSheetService.poll().catch(() => {});
          });
        }
      }
    }
  });

  // 7. Start Telegram Bot
  if (config.telegram.botToken) {
    await telegramService.start();
  }

  // 8. Start Private Admin Web Dashboard
  if (config.dashboard.enabled) {
    await dashboardServer.start();
  }

  // 9. Start Khabarline.site Web Server
  if (config.khabarline.enabled) {
    await khabarlineServer.start();
  }

  // 10. Connect to WhatsApp
  try {
    await whatsAppClient.connect();
  } catch (err) {
    logger.error({ err }, 'Fatal error connecting to WhatsApp');
    process.exit(1);
  }

  // 11. Graceful Shutdown Handlers
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Received termination signal, shutting down bridge...');
    khabarlineServer.stop();
    dashboardServer.stop();
    dpbossScraperService.stop();
    googleSheetService.stop();
    consensusEngine.stop();
    await telegramService.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Unhandled exception in main process');
  process.exit(1);
});
