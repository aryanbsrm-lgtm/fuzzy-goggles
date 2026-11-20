import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const ConfigSchema = z.object({
  whatsapp: z.object({
    /** Directory path where Baileys auth tokens / multi-device sessions are stored */
    authDir: z.string().default('./auth_info_baileys'),
    /** Optional phone number for pairing code auth (if not using QR code) */
    phoneNumber: z.string().nullable().optional(),
    /** List of WhatsApp group JIDs to monitor. If empty, all groups will be monitored */
    sourceGroups: z.array(z.string()).default([]),
    /** Friendly names for known groups: { "120363xxx@g.us": "Channel Alpha" } */
    groupAliases: z.record(z.string()).default({}),
    /** Maps source JIDs to owner/entity IDs to prevent same-owner groups from self-verifying */
    ownerMapping: z.record(z.string()).default({}),
    /** Destination WhatsApp group JIDs to forward verified results to */
    destinationGroups: z.array(z.string()).default([]),
    /** Optional custom message templates per WhatsApp group: { "120363xxx@g.us": "*{market}*\n*{value}*" } */
    groupTemplates: z.record(z.string()).default({}),
  }),
  consensus: z.object({
    /** Minimum number of distinct WhatsApp groups that must report matching content */
    minMatches: z.number().int().min(2).default(2),
    /** Maximum time window (in seconds) to wait for matching groups */
    timeWindowSeconds: z.number().positive().default(60),
    /** Time (in seconds) to keep verified updates in memory to prevent duplicate dispatches */
    dedupTtlSeconds: z.number().positive().default(1800), // 30 mins
  }),
  parser: z.object({
    /**
     * Parser mode:
     * - 'raw_normalized': Normalizes whitespace, removes emojis/noise, matches whole string
     * - 'regex': Uses regexPattern with capture groups
     * - 'numbers_only': Extracts standalone numbers/scores
     * - 'line_starts_with': Matches specific line prefixes
     */
    mode: z.enum(['raw_normalized', 'regex', 'numbers_only', 'line_starts_with']).default('raw_normalized'),
    /** Regex pattern when mode is 'regex' */
    regexPattern: z.string().nullable().optional(),
    /** Capture group index for value (default: 1) */
    resultGroupIndex: z.number().int().min(0).default(1),
    /** Capture group index for roundId (optional) */
    roundGroupIndex: z.number().int().min(0).nullable().optional(),
    /** Prefix to search for if mode is 'line_starts_with' (e.g. "UPDATE:", "DATA:") */
    prefix: z.string().nullable().optional(),
    /** Whether matching is case sensitive */
    caseSensitive: z.boolean().default(false),
  }),
  telegram: z.object({
    /** Telegram Bot Token from @BotFather */
    botToken: z.string().default(''),
    /** Destination Telegram Channel / Group Chat ID (e.g. -100123456789) */
    targetChatId: z.string().default(''),
    /** Admin Telegram User IDs allowed to approve groups and manage the bot */
    adminIds: z.array(z.string()).default([]),
    /** Default message format template */
    defaultTemplate: z.string().optional(),
    /** Optional custom message header */
    customHeader: z.string().default('🔔 <b>CONFIRMED UPDATE</b>'),
    /** Whether to include confirmation speed and group metadata in the telegram card */
    includeMetadata: z.boolean().default(true),
  }),
  sheets: z.object({
    /** Whether Google Sheets scraper integration is enabled */
    enabled: z.boolean().default(false),
    /** Google Sheet sharing URL or published CSV export endpoint */
    sheetUrl: z.string().default(''),
    /** Optional Tab / Sheet name (if spreadsheet has multiple sheets) */
    sheetTabName: z.string().optional(),
    /** Polling interval in seconds (default: 30) */
    pollIntervalSeconds: z.number().positive().default(30),
    /** Scraper cycle interval in seconds (default: 300 = 5 mins) */
    scraperCycleSeconds: z.number().positive().default(300),
    /** Scraper cycle offset in seconds past the 5-min mark (e.g. 88s = :01:28, :06:28) */
    scraperCycleOffsetSeconds: z.number().nonnegative().default(88),
    /** Optional Google Service Account email (e.g. from Slack payment bot setup) */
    serviceAccountEmail: z.string().optional(),
    /** Optional Google Service Account private key */
    serviceAccountPrivateKey: z.string().optional(),
    /** Optional path to service account credentials JSON file */
    serviceAccountKeyFile: z.string().optional(),
    /** Owner entity identifier assigned to results originating from the sheet scraper */
    ownerId: z.string().default('owner_web_scraper'),
    /** Whether to trigger direct verification without waiting for quorum */
    autoVerify: z.boolean().default(false),
    /** Custom column mapping for non-standard sheet layouts */
    columnMapping: z
      .object({
        marketName: z.string().optional(),
        open: z.string().optional(),
        close: z.string().optional(),
        jodi: z.string().optional(),
        fullResult: z.string().optional(),
        updatedAt: z.string().optional(),
      })
      .default({}),
  }).default({}),
  scraper: z.object({
    /** Whether on-demand web scraper trigger is enabled */
    enabled: z.boolean().default(true),
    /** Trigger mode: 'auto' (tries cli then http), 'cli', or 'http' */
    triggerMode: z.enum(['auto', 'cli', 'http']).default('auto'),
    /** CLI command to execute scraper on host/VPS */
    cliCommand: z
      .string()
      .default('/opt/scraper-hub/.venv/bin/python -c "import app; app.run_job(2)"'),
    /** Working directory for CLI execution */
    workingDir: z.string().default('/opt/scraper-hub'),
    /** Local HTTP endpoint for scraper-hub */
    httpUrl: z.string().default('http://127.0.0.1:8094/api/job/2/run'),
    /** Debounce interval in seconds to avoid concurrent duplicate scrapes */
    debounceSeconds: z.number().nonnegative().default(10),
    /** Whether to automatically trigger scraper on unverified WhatsApp reports */
    autoTriggerOnUnverified: z.boolean().default(true),
  }).default({}),
  dpboss: z.object({
    /** Whether direct dpboss.boston scraper is enabled */
    enabled: z.boolean().default(true),
    /** Target website URL */
    url: z.string().default('https://dpboss.boston'),
    /** Polling interval in seconds (default: 30) */
    pollIntervalSeconds: z.number().positive().default(30),
    /** Whether to trigger active verification retry cycle on unverified reports */
    autoVerifyOnUnverified: z.boolean().default(true),
    /** Owner entity identifier assigned to results originating from dpboss scraper */
    ownerId: z.string().default('owner_dpboss'),
    /** Retry intervals in seconds for unverified candidate verification cycle */
    retryIntervalsSeconds: z.array(z.number()).default([0, 10, 30, 60, 120, 180]),
  }).default({}),
  dashboard: z.object({
    /** Whether admin web dashboard server is enabled */
    enabled: z.boolean().default(true),
    /** Port number for admin web dashboard */
    port: z.number().int().positive().default(8095),
    /** Password required to access private admin dashboard */
    password: z.string().default('admin123'),
  }).default({}),
  khabarline: z.object({
    /** Whether khabarline.site public web server is enabled */
    enabled: z.boolean().default(true),
    /** Port number for khabarline.site web server */
    port: z.number().int().positive().default(8080),
    /** Domain name */
    domain: z.string().default('khabarline.site'),
    /** Admin password for Khabarline overrides (optional) */
    adminPassword: z.string().optional(),
  }).default({}),
  api: z.object({
    /** Whether public/partner Verified Result API is enabled */
    enabled: z.boolean().default(true),
    /** Master hash key for API authentication */
    hashKey: z.string().default('result_bot_secret_2026'),
    /** List of all allowed hash keys for multiple partners */
    allowedHashKeys: z.array(z.string()).default(['result_bot_secret_2026']),
  }).default({}),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(configPath: string = path.resolve(process.cwd(), 'config.json')): Config {
  let fileConfig: Record<string, unknown> = {};

  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      fileConfig = JSON.parse(raw);
    } catch (err) {
      console.warn(`[Config] Failed to parse ${configPath}, falling back to defaults/env vars:`, err);
    }
  }

  const combined = {
    whatsapp: {
      authDir: process.env.WHATSAPP_AUTH_DIR || (fileConfig.whatsapp as any)?.authDir || './auth_info_baileys',
      phoneNumber: process.env.WHATSAPP_PHONE_NUMBER || (fileConfig.whatsapp as any)?.phoneNumber || undefined,
      sourceGroups: (fileConfig.whatsapp as any)?.sourceGroups || [],
      groupAliases: (fileConfig.whatsapp as any)?.groupAliases || {},
      ownerMapping: (fileConfig.whatsapp as any)?.ownerMapping || {},
      destinationGroups: (fileConfig.whatsapp as any)?.destinationGroups || [],
      groupTemplates: (fileConfig.whatsapp as any)?.groupTemplates || {},
    },
    consensus: {
      minMatches: (fileConfig.consensus as any)?.minMatches ?? 2,
      timeWindowSeconds: (fileConfig.consensus as any)?.timeWindowSeconds ?? 60,
      dedupTtlSeconds: (fileConfig.consensus as any)?.dedupTtlSeconds ?? 1800,
    },
    parser: {
      mode: (fileConfig.parser as any)?.mode ?? 'raw_normalized',
      regexPattern: (fileConfig.parser as any)?.regexPattern,
      resultGroupIndex: (fileConfig.parser as any)?.resultGroupIndex ?? 1,
      roundGroupIndex: (fileConfig.parser as any)?.roundGroupIndex,
      prefix: (fileConfig.parser as any)?.prefix,
      caseSensitive: (fileConfig.parser as any)?.caseSensitive ?? false,
    },
    telegram: {
      botToken: process.env.TELEGRAM_BOT_TOKEN || (fileConfig.telegram as any)?.botToken || '',
      targetChatId: process.env.TELEGRAM_CHAT_ID || (fileConfig.telegram as any)?.targetChatId || '',
      adminIds: process.env.TELEGRAM_ADMIN_IDS
        ? process.env.TELEGRAM_ADMIN_IDS.split(',').map((id) => id.trim()).filter(Boolean)
        : (fileConfig.telegram as any)?.adminIds || [],
      defaultTemplate: process.env.TELEGRAM_DEFAULT_TEMPLATE || (fileConfig.telegram as any)?.defaultTemplate || undefined,
      customHeader: (fileConfig.telegram as any)?.customHeader ?? '🔔 <b>CONFIRMED UPDATE</b>',
      includeMetadata: (fileConfig.telegram as any)?.includeMetadata ?? true,
    },
    sheets: {
      enabled: process.env.GOOGLE_SHEET_ENABLED
        ? process.env.GOOGLE_SHEET_ENABLED === 'true'
        : (fileConfig.sheets as any)?.enabled ?? Boolean(process.env.GOOGLE_SHEET_URL || (fileConfig.sheets as any)?.sheetUrl),
      sheetUrl: process.env.GOOGLE_SHEET_URL || (fileConfig.sheets as any)?.sheetUrl || '',
      sheetTabName: process.env.GOOGLE_SHEET_TAB_NAME || (fileConfig.sheets as any)?.sheetTabName || undefined,
      pollIntervalSeconds: process.env.GOOGLE_SHEET_POLL_INTERVAL_SEC
        ? Number(process.env.GOOGLE_SHEET_POLL_INTERVAL_SEC)
        : (fileConfig.sheets as any)?.pollIntervalSeconds ?? 30,
      scraperCycleSeconds: process.env.GOOGLE_SHEET_SCRAPER_CYCLE_SEC
        ? Number(process.env.GOOGLE_SHEET_SCRAPER_CYCLE_SEC)
        : (fileConfig.sheets as any)?.scraperCycleSeconds ?? 300,
      scraperCycleOffsetSeconds: process.env.GOOGLE_SHEET_SCRAPER_CYCLE_OFFSET_SEC
        ? Number(process.env.GOOGLE_SHEET_SCRAPER_CYCLE_OFFSET_SEC)
        : (fileConfig.sheets as any)?.scraperCycleOffsetSeconds ?? 88,
      serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || (fileConfig.sheets as any)?.serviceAccountEmail || undefined,
      serviceAccountPrivateKey: process.env.GOOGLE_PRIVATE_KEY || (fileConfig.sheets as any)?.serviceAccountPrivateKey || undefined,
      serviceAccountKeyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS || (fileConfig.sheets as any)?.serviceAccountKeyFile || undefined,
      ownerId: process.env.GOOGLE_SHEET_OWNER_ID || (fileConfig.sheets as any)?.ownerId || 'owner_web_scraper',
      autoVerify: (fileConfig.sheets as any)?.autoVerify ?? false,
      columnMapping: (fileConfig.sheets as any)?.columnMapping || {},
    },
    scraper: {
      enabled: process.env.SCRAPER_ENABLED
        ? process.env.SCRAPER_ENABLED === 'true'
        : (fileConfig.scraper as any)?.enabled ?? true,
      triggerMode: (process.env.SCRAPER_TRIGGER_MODE as any) || (fileConfig.scraper as any)?.triggerMode || 'auto',
      cliCommand: process.env.SCRAPER_CLI_COMMAND || (fileConfig.scraper as any)?.cliCommand || '/opt/scraper-hub/.venv/bin/python -c "import app; app.run_job(2)"',
      workingDir: process.env.SCRAPER_WORKING_DIR || (fileConfig.scraper as any)?.workingDir || '/opt/scraper-hub',
      httpUrl: process.env.SCRAPER_HTTP_URL || (fileConfig.scraper as any)?.httpUrl || 'http://127.0.0.1:8094/api/job/2/run',
      debounceSeconds: process.env.SCRAPER_DEBOUNCE_SEC
        ? Number(process.env.SCRAPER_DEBOUNCE_SEC)
        : (fileConfig.scraper as any)?.debounceSeconds ?? 10,
      autoTriggerOnUnverified: process.env.SCRAPER_AUTO_TRIGGER
        ? process.env.SCRAPER_AUTO_TRIGGER === 'true'
        : (fileConfig.scraper as any)?.autoTriggerOnUnverified ?? true,
    },
    dpboss: {
      enabled: process.env.DPBOSS_ENABLED
        ? process.env.DPBOSS_ENABLED === 'true'
        : (fileConfig.dpboss as any)?.enabled ?? true,
      url: process.env.DPBOSS_URL || (fileConfig.dpboss as any)?.url || 'https://dpboss.boston',
      pollIntervalSeconds: process.env.DPBOSS_POLL_INTERVAL_SEC
        ? Number(process.env.DPBOSS_POLL_INTERVAL_SEC)
        : (fileConfig.dpboss as any)?.pollIntervalSeconds ?? 30,
      autoVerifyOnUnverified: process.env.DPBOSS_AUTO_VERIFY
        ? process.env.DPBOSS_AUTO_VERIFY === 'true'
        : (fileConfig.dpboss as any)?.autoVerifyOnUnverified ?? true,
      ownerId: process.env.DPBOSS_OWNER_ID || (fileConfig.dpboss as any)?.ownerId || 'owner_dpboss',
      retryIntervalsSeconds: (fileConfig.dpboss as any)?.retryIntervalsSeconds || [0, 10, 30, 60, 120, 180],
    },
    dashboard: {
      enabled: process.env.DASHBOARD_ENABLED
        ? process.env.DASHBOARD_ENABLED === 'true'
        : (fileConfig.dashboard as any)?.enabled ?? true,
      port: process.env.DASHBOARD_PORT
        ? Number(process.env.DASHBOARD_PORT)
        : (fileConfig.dashboard as any)?.port ?? 8095,
      password: process.env.DASHBOARD_PASSWORD || (fileConfig.dashboard as any)?.password || 'admin123',
    },
    khabarline: {
      enabled: process.env.KHABARLINE_ENABLED
        ? process.env.KHABARLINE_ENABLED === 'true'
        : (fileConfig.khabarline as any)?.enabled ?? true,
      port: process.env.KHABARLINE_PORT
        ? Number(process.env.KHABARLINE_PORT)
        : (fileConfig.khabarline as any)?.port ?? 8080,
      domain: process.env.KHABARLINE_DOMAIN || (fileConfig.khabarline as any)?.domain || 'khabarline.site',
      adminPassword: process.env.KHABARLINE_ADMIN_PASSWORD || (fileConfig.khabarline as any)?.adminPassword || undefined,
    },
    api: {
      enabled: process.env.RESULT_API_ENABLED
        ? process.env.RESULT_API_ENABLED === 'true'
        : (fileConfig.api as any)?.enabled ?? true,
      hashKey: process.env.RESULT_API_HASH_KEY || (fileConfig.api as any)?.hashKey || 'result_bot_secret_2026',
      allowedHashKeys: process.env.RESULT_API_ALLOWED_KEYS
        ? process.env.RESULT_API_ALLOWED_KEYS.split(',').map((k: string) => k.trim()).filter(Boolean)
        : (fileConfig.api as any)?.allowedHashKeys || [
            process.env.RESULT_API_HASH_KEY || (fileConfig.api as any)?.hashKey || 'result_bot_secret_2026',
          ],
    },
  };

  return ConfigSchema.parse(combined);
}
