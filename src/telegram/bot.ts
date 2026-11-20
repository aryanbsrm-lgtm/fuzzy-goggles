import { Bot, InlineKeyboard } from 'grammy';
import fs from 'fs';
import path from 'path';
import { Config } from '../config.js';
import { VerifiedPayloadEvent } from '../types.js';
import { TelegramNotifier } from './notifier.js';
import { ConsensusEngine } from '../consensus/engine.js';
import { GroupApprovalService } from '../services/groupApproval.js';
import { DpbossScraperService } from '../services/dpbossScraper.js';
import { ScraperService } from '../services/scraper.js';
import { GoogleSheetService } from '../services/sheets.js';
import { logger } from '../utils/logger.js';

export class TelegramService {
  public bot: Bot;
  public notifier: TelegramNotifier;
  public groupApprovalService: GroupApprovalService;
  private consensusEngine: ConsensusEngine;
  private dpbossScraperService?: DpbossScraperService;
  private googleSheetService?: GoogleSheetService;
  private scraperService?: ScraperService;
  private config: Config;

  constructor(
    config: Config,
    consensusEngine: ConsensusEngine,
    groupApprovalService: GroupApprovalService,
    dpbossScraperService?: DpbossScraperService,
    googleSheetService?: GoogleSheetService,
    scraperService?: ScraperService
  ) {
    this.config = config;
    this.consensusEngine = consensusEngine;
    this.groupApprovalService = groupApprovalService;
    this.dpbossScraperService = dpbossScraperService;
    this.googleSheetService = googleSheetService;
    this.scraperService = scraperService;
    this.bot = new Bot(config.telegram.botToken);
    this.notifier = new TelegramNotifier(this.bot, config.telegram, this.groupApprovalService);
    this.registerHandlers();
  }

  /**
   * Checks if a Telegram user ID is an authorized administrator
   */
  public isAdmin(userId: number | string): boolean {
    const idStr = String(userId);
    // If admin IDs explicitly listed, verify match
    if (this.config.telegram.adminIds.length > 0) {
      return this.config.telegram.adminIds.includes(idStr);
    }
    // If no admin IDs listed yet, check if matching targetChatId
    if (this.config.telegram.targetChatId && this.config.telegram.targetChatId === idStr) {
      return true;
    }
    return false;
  }

  private updateConfigTargetChat(chatId: string | number, title?: string): void {
    const idStr = String(chatId);
    this.config.telegram.targetChatId = idStr;

    // Auto-approve target chat
    this.groupApprovalService.addApprovedChat({
      chatId: idStr,
      title: title || 'Primary Target',
      type: 'channel',
      approvedAt: Date.now(),
      approvedBy: 'CONFIG_SETTARGET',
    });

    // Update .env file
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      try {
        let env = fs.readFileSync(envPath, 'utf-8');
        if (env.includes('TELEGRAM_CHAT_ID=')) {
          env = env.replace(/TELEGRAM_CHAT_ID=.*/, `TELEGRAM_CHAT_ID=${idStr}`);
        } else {
          env += `\nTELEGRAM_CHAT_ID=${idStr}`;
        }
        fs.writeFileSync(envPath, env);
      } catch {
        // ignore
      }
    }

    logger.info({ targetChatId: idStr, title }, '🎯 Telegram target destination group updated');
  }

  private registerHandlers(): void {
    // 0. Middleware to automatically track chat migrations (e.g. group -> supergroup)
    this.bot.use(async (ctx, next) => {
      const msg: any = ctx.message;
      if (msg?.migrate_to_chat_id) {
        const oldChatId = String(ctx.chat?.id);
        const newChatId = String(msg.migrate_to_chat_id);
        logger.info({ oldChatId, newChatId }, '🔄 Telegram migrate_to_chat_id detected in update middleware');
        this.groupApprovalService.migrateChatId(oldChatId, newChatId);
      }
      if (msg?.migrate_from_chat_id) {
        const newChatId = String(ctx.chat?.id);
        const oldChatId = String(msg.migrate_from_chat_id);
        logger.info({ oldChatId, newChatId }, '🔄 Telegram migrate_from_chat_id detected in update middleware');
        this.groupApprovalService.migrateChatId(oldChatId, newChatId);
      }
      return next();
    });

    // 1. Listen for Bot Added to Group / Channel (my_chat_member)
    this.bot.on('my_chat_member', async (ctx) => {
      const chat = ctx.chat;
      const oldStatus = ctx.myChatMember.old_chat_member.status;
      const newStatus = ctx.myChatMember.new_chat_member.status;
      const chatId = String(chat.id);
      const title = chat.title || 'Direct Chat';
      const addedBy = ctx.from
        ? {
            id: ctx.from.id,
            firstName: ctx.from.first_name,
            username: ctx.from.username,
          }
        : undefined;

      logger.info(
        { chatId, title, oldStatus, newStatus, addedBy },
        '🤖 Bot membership status updated in chat'
      );

      if (newStatus === 'left' || newStatus === 'kicked') {
        this.groupApprovalService.removeApprovedChat(chatId);
        this.groupApprovalService.removePendingRequest(chatId);
        logger.info({ chatId, title }, 'Bot removed/kicked from chat, removed from broadcast list');
        return;
      }

      // If the group is already approved, stay completely silent (no spam messages)
      if (this.groupApprovalService.isApproved(chatId)) {
        return;
      }

      // Only trigger pending approval flow if bot was freshly added (not an internal permission sync)
      const isNewlyJoined =
        (oldStatus === 'left' || oldStatus === 'kicked') &&
        (newStatus === 'member' || newStatus === 'administrator');

      if (isNewlyJoined) {
        // Add to pending approval queue
        this.groupApprovalService.addPendingRequest({
          chatId,
          title,
          type: chat.type as any,
          requestedAt: Date.now(),
          addedBy,
        });

        // Notify the group
        await ctx.reply(
          `👋 <b>Result Bot Connected!</b>\n\n` +
            `🔒 <i>This group is currently pending administrator approval.</i>\n` +
            `Once approved by the bot owner, live <b>✅ Verified</b> matka results will be automatically broadcast here.`,
          { parse_mode: 'HTML' }
        ).catch(() => {});

        // Send Approval Request to all configured Admins
        await this.notifyAdminsNewGroupRequest(chatId, title, chat.type, addedBy);
      }
    });

    // 2. Interactive Callback Queries (Approve / Reject buttons)
    this.bot.callbackQuery(/^approve_chat:(.+)$/, async (ctx) => {
      const chatId = ctx.match[1];
      const fromId = ctx.from.id;

      if (!this.isAdmin(fromId)) {
        await ctx.answerCallbackQuery({
          text: '⚠️ You are not authorized to approve groups. Contact the bot administrator.',
          show_alert: true,
        });
        return;
      }

      // Check chat title from pending or Telegram API
      let title = `Group (${chatId})`;
      const pendingList = this.groupApprovalService.getPendingRequests();
      const pending = pendingList.find((p) => p.chatId === chatId);
      if (pending) {
        title = pending.title;
      } else {
        try {
          const fetchedChat = await ctx.api.getChat(chatId);
          title = fetchedChat.title || title;
        } catch {
          // ignore
        }
      }

      this.groupApprovalService.addApprovedChat({
        chatId,
        title,
        type: pending?.type || 'group',
        approvedAt: Date.now(),
        approvedBy: `${ctx.from.first_name} (@${ctx.from.username || ctx.from.id})`,
        addedBy: pending?.addedBy,
      });

      await ctx.answerCallbackQuery({ text: `✅ Approved ${title}!` });

      // Update admin message
      try {
        await ctx.editMessageText(
          `✅ <b>Group Approved Successfully!</b>\n\n` +
            `📌 <b>Title:</b> ${title}\n` +
            `🆔 <b>Chat ID:</b> <code>${chatId}</code>\n` +
            `👤 <b>Approved By:</b> ${ctx.from.first_name} (@${ctx.from.username || ctx.from.id})\n\n` +
            `<i>Verified matka results will now be broadcast to this group in real-time.</i>`,
          { parse_mode: 'HTML' }
        );
      } catch {
        // ignore
      }

      // Send announcement to the approved group
      try {
        await ctx.api.sendMessage(
          chatId,
          `🎉 <b>Group Approved!</b>\n\n` +
            `✅ <i>This group has been verified and approved by the administrator.</i>\n` +
            `You will now receive all live <b>✅ Verified</b> matka results here in real-time!`,
          { parse_mode: 'HTML' }
        );
      } catch (err: any) {
        logger.warn({ err: err?.message, chatId }, 'Could not send approval announcement to group');
      }
    });

    this.bot.callbackQuery(/^reject_chat:(.+)$/, async (ctx) => {
      const chatId = ctx.match[1];
      const fromId = ctx.from.id;

      if (!this.isAdmin(fromId)) {
        await ctx.answerCallbackQuery({
          text: '⚠️ You are not authorized to reject groups.',
          show_alert: true,
        });
        return;
      }

      this.groupApprovalService.removePendingRequest(chatId);
      this.groupApprovalService.removeApprovedChat(chatId);

      await ctx.answerCallbackQuery({ text: `❌ Request for ${chatId} rejected.` });

      try {
        await ctx.editMessageText(
          `❌ <b>Group Request Rejected</b>\n\n` +
            `🆔 <b>Chat ID:</b> <code>${chatId}</code>\n` +
            `👤 <b>Rejected By:</b> ${ctx.from.first_name} (@${ctx.from.username || ctx.from.id})`,
          { parse_mode: 'HTML' }
        );
      } catch {
        // ignore
      }

      // Notify group and politely leave
      try {
        await ctx.api.sendMessage(
          chatId,
          `❌ <i>This group was not approved for verified result broadcasts. The bot will now leave.</i>`,
          { parse_mode: 'HTML' }
        );
        await ctx.api.leaveChat(chatId);
      } catch {
        // ignore
      }
    });

    // 3. Catch-all message logger and auto-pending discovery
    this.bot.on('message', async (ctx, next) => {
      const chatId = String(ctx.chat.id);
      const title = ctx.chat.title || (ctx.chat as any).first_name || 'Direct Chat';
      const text = ctx.message.text || '';
      const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';

      logger.info({ title, chatId, text, type: ctx.chat.type }, '📩 Telegram message received in chat');

      // If group is unapproved and not yet pending, add to pending and alert admin
      if (isGroup && !this.groupApprovalService.isApproved(chatId)) {
        const pendingList = this.groupApprovalService.getPendingRequests();
        const alreadyPending = pendingList.some((p) => p.chatId === chatId);

        if (!alreadyPending) {
          const addedBy = ctx.from
            ? {
                id: ctx.from.id,
                firstName: ctx.from.first_name,
                username: ctx.from.username,
              }
            : undefined;

          this.groupApprovalService.addPendingRequest({
            chatId,
            title,
            type: ctx.chat.type,
            requestedAt: Date.now(),
            addedBy,
          });

          await this.notifyAdminsNewGroupRequest(chatId, title, ctx.chat.type, addedBy);
        }
      }

      await next();
    });

    // 4. Command Registrations
    this.registerCommands();
  }

  private async notifyAdminsNewGroupRequest(
    chatId: string,
    title: string,
    chatType: string,
    addedBy?: { id: number; firstName?: string; username?: string }
  ): Promise<void> {
    const adminIds = this.config.telegram.adminIds;
    const destList = adminIds.length > 0 ? adminIds : this.config.telegram.targetChatId ? [this.config.telegram.targetChatId] : [];

    if (destList.length === 0) {
      logger.warn('No TELEGRAM_ADMIN_IDS configured; cannot deliver group approval prompt.');
      return;
    }

    const keyboard = new InlineKeyboard()
      .text('✅ Approve Group', `approve_chat:${chatId}`)
      .text('❌ Reject & Leave', `reject_chat:${chatId}`);

    const addedByText = addedBy
      ? `${addedBy.firstName || 'User'} (@${addedBy.username || 'n/a'}, ID: <code>${addedBy.id}</code>)`
      : 'Unknown';

    const msg = [
      '🔔 <b>NEW GROUP ADDITION REQUEST</b>',
      '━━━━━━━━━━━━━━━━━━━━━',
      `📌 <b>Group Title:</b> ${title}`,
      `🆔 <b>Chat ID:</b> <code>${chatId}</code>`,
      `👥 <b>Type:</b> <code>${chatType}</code>`,
      `👤 <b>Added By:</b> ${addedByText}`,
      '━━━━━━━━━━━━━━━━━━━━━',
      '<i>Would you like to approve this group to receive live verified matka results?</i>',
    ].join('\n');

    for (const adminId of destList) {
      try {
        await this.bot.api.sendMessage(adminId, msg, {
          parse_mode: 'HTML',
          reply_markup: keyboard,
        });
        logger.info({ adminId, chatId, title }, 'Sent group approval request to admin');
      } catch (err: any) {
        logger.warn({ err: err?.message, adminId }, 'Failed to deliver approval request to admin');
      }
    }
  }

  private registerCommands(): void {
    // /start command
    this.bot.command('start', async (ctx) => {
      const title = ctx.chat.title || (ctx.chat as any).first_name || 'Direct Chat';
      const isUserAdmin = this.isAdmin(ctx.from?.id || 0);

      let msg =
        '👋 <b>Consensus Bridge & Result Bot Active!</b>\n\n' +
        `📌 <b>Current Chat:</b> ${title} (<code>${ctx.chat.id}</code>)\n` +
        `🔒 <b>Approval Status:</b> ${this.groupApprovalService.isApproved(ctx.chat.id) ? 'Approved ✅' : 'Pending Approval ⏳'}\n\n` +
        '<b>Commands:</b>\n' +
        '• /status - Check live bridge status & cached market counts\n' +
        '• /scrape - Force live scrape of www.dpboss.boston\n' +
        '• /scrape &lt;market&gt; - Scrape & lookup specific market result\n' +
        '• /id - View this group/channel Chat ID\n' +
        '• /groups - View approved broadcast groups\n';

      if (isUserAdmin) {
        msg +=
          '\n👑 <b>Admin Group Commands:</b>\n' +
          '• /pending - View & approve pending group addition requests\n' +
          '• /approve &lt;chatId&gt; - Manually approve a group\n' +
          '• /reject &lt;chatId&gt; - Reject a group\n' +
          '• /removegroup &lt;chatId&gt; - Revoke broadcast approval\n' +
          '• /approved - View all approved broadcast destinations\n' +
          '• /settarget - Set current group as primary target\n\n' +
          '🎨 <b>Per-Group Message Formatting:</b>\n' +
          '• /settemplate [chatId] &lt;template&gt; - Set custom group layout\n' +
          '• /viewtemplate [chatId] - View group template & live preview\n' +
          '• /setheader [chatId] &lt;header&gt; - Add top branding header\n' +
          '• /setfooter [chatId] &lt;footer&gt; - Add bottom invite/footer\n' +
          '• /resettemplate [chatId] - Revert back to default layout\n' +
          '• /templates - List all groups and their custom templates\n' +
          '• /previewtemplate [chatId] - Live sample preview\n\n' +
          '⚡ <b>Testing:</b>\n' +
          '• /test - Test broadcasting verified alert\n';
      }

      await ctx.reply(msg, { parse_mode: 'HTML' });
    });

    // /pending command (Admin)
    this.bot.command('pending', async (ctx) => {
      if (!this.isAdmin(ctx.from?.id || 0)) {
        await ctx.reply('⚠️ This command is restricted to bot administrators.', { parse_mode: 'HTML' });
        return;
      }

      const pending = this.groupApprovalService.getPendingRequests();
      if (pending.length === 0) {
        await ctx.reply('✅ <b>No Pending Requests:</b> All added groups are already processed.', { parse_mode: 'HTML' });
        return;
      }

      await ctx.reply(`📋 <b>Pending Group Requests (${pending.length}):</b>`, { parse_mode: 'HTML' });

      for (const req of pending) {
        const keyboard = new InlineKeyboard()
          .text('✅ Approve', `approve_chat:${req.chatId}`)
          .text('❌ Reject', `reject_chat:${req.chatId}`);

        const addedBy = req.addedBy
          ? `${req.addedBy.firstName} (@${req.addedBy.username || 'n/a'})`
          : 'Unknown';

        const text = [
          `📌 <b>${req.title}</b>`,
          `🆔 <code>${req.chatId}</code> (${req.type})`,
          `👤 Added by: ${addedBy}`,
          `🕒 Requested: ${new Date(req.requestedAt).toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true })} IST`,
        ].join('\n');

        await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
      }
    });

    // /approve command (Admin: /approve <chatId>)
    this.bot.command('approve', async (ctx) => {
      if (!this.isAdmin(ctx.from?.id || 0)) {
        await ctx.reply('⚠️ This command is restricted to bot administrators.', { parse_mode: 'HTML' });
        return;
      }

      const rawText = ctx.message?.text || '';
      const targetId = rawText.replace(/^\/approve(?:@[a-zA-Z0-9_]+)?\s*/i, '').trim();

      if (!targetId) {
        await ctx.reply('ℹ️ <b>Usage:</b> <code>/approve &lt;chatId&gt;</code>\nExample: <code>/approve -100123456789</code>', {
          parse_mode: 'HTML',
        });
        return;
      }

      let title = `Group (${targetId})`;
      const pending = this.groupApprovalService.getPendingRequests().find((p) => p.chatId === targetId);
      if (pending) title = pending.title;

      try {
        const fetchedChat = await ctx.api.getChat(targetId);
        title = fetchedChat.title || (fetchedChat as any).first_name || title;
      } catch {
        // ignore
      }

      this.groupApprovalService.addApprovedChat({
        chatId: targetId,
        title,
        type: pending?.type || 'group',
        approvedAt: Date.now(),
        approvedBy: `${ctx.from?.first_name} (Manual /approve)`,
      });

      await ctx.reply(
        `✅ <b>Group Approved!</b>\n\n` +
          `👥 <b>Group Name:</b> <b>${title}</b>\n` +
          `🆔 <b>Chat ID:</b> <code>${targetId}</code>\n\n` +
          `<i>Verified matka results will now be broadcast to this destination.</i>`,
        { parse_mode: 'HTML' }
      );

      try {
        await ctx.api.sendMessage(
          targetId,
          `🎉 <b>Group Approved!</b>\n✅ This group is now authorized to receive live verified matka results!`,
          { parse_mode: 'HTML' }
        );
      } catch {
        // ignore
      }
    });

    // /reject command (Admin: /reject <chatId>)
    this.bot.command('reject', async (ctx) => {
      if (!this.isAdmin(ctx.from?.id || 0)) {
        await ctx.reply('⚠️ This command is restricted to bot administrators.', { parse_mode: 'HTML' });
        return;
      }

      const rawText = ctx.message?.text || '';
      const targetId = rawText.replace(/^\/reject(?:@[a-zA-Z0-9_]+)?\s*/i, '').trim();

      if (!targetId) {
        await ctx.reply('ℹ️ <b>Usage:</b> <code>/reject &lt;chatId&gt;</code>', { parse_mode: 'HTML' });
        return;
      }

      this.groupApprovalService.removePendingRequest(targetId);
      this.groupApprovalService.removeApprovedChat(targetId);

      await ctx.reply(`❌ Group <code>${targetId}</code> rejected and removed from pending queue.`, {
        parse_mode: 'HTML',
      });

      try {
        await ctx.api.leaveChat(targetId);
      } catch {
        // ignore
      }
    });

    // /removegroup command (Admin: /removegroup <chatId>)
    this.bot.command('removegroup', async (ctx) => {
      if (!this.isAdmin(ctx.from?.id || 0)) {
        await ctx.reply('⚠️ This command is restricted to bot administrators.', { parse_mode: 'HTML' });
        return;
      }

      const rawText = ctx.message?.text || '';
      const targetId = rawText.replace(/^\/removegroup(?:@[a-zA-Z0-9_]+)?\s*/i, '').trim();

      if (!targetId) {
        await ctx.reply('ℹ️ <b>Usage:</b> <code>/removegroup &lt;chatId&gt;</code>', { parse_mode: 'HTML' });
        return;
      }

      const removed = this.groupApprovalService.removeApprovedChat(targetId);
      if (removed) {
        await ctx.reply(`🗑️ <b>Group Removed:</b> <code>${targetId}</code> will no longer receive result broadcasts.`, {
          parse_mode: 'HTML',
        });
      } else {
        await ctx.reply(`ℹ️ Chat ID <code>${targetId}</code> was not in the approved list.`, { parse_mode: 'HTML' });
      }
    });

    // /approved and /groups command
    const handleGroupsCommand = async (ctx: any) => {
      const approved = this.groupApprovalService.getApprovedChats();
      const primaryTarget = this.config.telegram.targetChatId;

      if (approved.length === 0 && !primaryTarget) {
        await ctx.reply('ℹ️ No approved destination groups configured yet.', { parse_mode: 'HTML' });
        return;
      }

      // Dynamically resolve & update real group/channel titles via Telegram API
      for (const g of approved) {
        try {
          const chatInfo = await this.bot.api.getChat(g.chatId);
          const freshTitle = chatInfo.title || (chatInfo as any).first_name || g.title;
          const freshType = chatInfo.type || g.type;
          if (freshTitle && freshTitle !== g.title) {
            g.title = freshTitle;
            g.type = freshType as any;
            this.groupApprovalService.addApprovedChat(g);
          }
        } catch {
          // ignore network/permission error, keep cached title
        }
      }

      const list = approved
        .map((g, i) => {
          const hasCustom = g.customTemplate ? '🎨 Custom Template' : '📄 Default Layout';
          const headerBadge = g.customHeader ? ' [Header ✅]' : '';
          const footerBadge = g.customFooter ? ' [Footer ✅]' : '';
          const approvedByStr = g.approvedBy ? `\n   👤 <b>Approved by:</b> <i>${g.approvedBy}</i>` : '';

          return `${i + 1}. 👥 <b>Group Name:</b> <b>${g.title}</b>\n` +
            `   🆔 <b>Chat ID:</b> <code>${g.chatId}</code>\n` +
            `   🏷 <b>Type:</b> <code>${g.type}</code>\n` +
            `   📐 <b>Format:</b> ${hasCustom}${headerBadge}${footerBadge}` +
            approvedByStr;
        })
        .join('\n\n');

      let primaryTargetText = 'Not Set';
      if (primaryTarget) {
        let primaryTitle = 'Primary Channel/Group';
        try {
          const pChat = await this.bot.api.getChat(primaryTarget);
          primaryTitle = pChat.title || (pChat as any).first_name || primaryTitle;
        } catch {
          // ignore
        }
        primaryTargetText = `<b>${primaryTitle}</b> (<code>${primaryTarget}</code>)`;
      }

      await ctx.reply(
        `📋 <b>Approved Broadcast Groups & Channels (${approved.length}):</b>\n\n` +
          `${list || 'None'}\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `🎯 <b>Primary Target:</b> ${primaryTargetText}\n` +
          `🔒 <i>Only <b>✅ Verified</b> results are delivered to these destinations.</i>`,
        { parse_mode: 'HTML' }
      );
    };

    this.bot.command('approved', handleGroupsCommand);
    this.bot.command('groups', handleGroupsCommand);

    // /scrape command (scrapes dpboss.boston live & sheet cache)
    this.bot.command('scrape', async (ctx) => {
      const rawText = ctx.message?.text || '';
      const query = rawText.replace(/^\/scrape(?:@[a-zA-Z0-9_]+)?\s*/i, '').trim();

      const statusMsg = await ctx.reply('⏳ <i>Scraping live results from www.dpboss.boston...</i>', {
        parse_mode: 'HTML',
      });

      const startTime = Date.now();

      try {
        // 1. Scrape DPBoss.boston
        let dpbossCount = 0;
        if (this.dpbossScraperService) {
          const payloads = await this.dpbossScraperService.poll();
          dpbossCount = payloads.length;
        }

        // 2. Poll Google Sheets / Scraper-Hub if configured
        if (this.googleSheetService) {
          await this.googleSheetService.poll().catch(() => {});
        }
        if (this.scraperService) {
          await this.scraperService.triggerScrape(true).catch(() => {});
        }

        const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
        const cachedCount =
          (this.dpbossScraperService?.getCachedResultsCount() ?? 0) +
          (this.googleSheetService?.getCachedResultsCount() ?? 0);

        if (query) {
          const dpMatches = this.dpbossScraperService ? this.dpbossScraperService.findResultsForMarket(query) : [];
          const sheetMatches = this.googleSheetService ? this.googleSheetService.findResultsForMarket(query) : [];

          const combined = [...dpMatches, ...sheetMatches];

          if (combined.length > 0) {
            const rows = combined
              .slice(0, 10)
              .map((m) => `• <b>${m.marketName} (${m.session || 'RESULT'}):</b> <code>${m.value}</code>`)
              .join('\n');

            await ctx.api.editMessageText(
              ctx.chat.id,
              statusMsg.message_id,
              `✅ <b>DPBoss.boston Scrape Complete (${durationSec}s)!</b>\n\n` +
                `🎯 <b>Live Results for "${query.toUpperCase()}":</b>\n${rows}\n\n` +
                `📊 <i>Total Cached: ${cachedCount} markets</i>`,
              { parse_mode: 'HTML' }
            );
          } else {
            await ctx.api.editMessageText(
              ctx.chat.id,
              statusMsg.message_id,
              `✅ <b>DPBoss.boston Scrape Complete (${durationSec}s)!</b>\n\n` +
                `ℹ️ No matching result found for <b>"${query}"</b> on dpboss.boston.\n` +
                `📊 <i>Total Cached: ${cachedCount} markets</i>`,
              { parse_mode: 'HTML' }
            );
          }
        } else {
          await ctx.api.editMessageText(
            ctx.chat.id,
            statusMsg.message_id,
            `✅ <b>DPBoss.boston Live Scrape Completed!</b>\n` +
              `━━━━━━━━━━━━━━━━━━━━━\n` +
              `⏱ <b>Duration:</b> ${durationSec}s\n` +
              `🌐 <b>Source:</b> <code>https://dpboss.boston</code>\n` +
              `📊 <b>Cached Market Results:</b> ${cachedCount}\n` +
              `ℹ️ <i>Tip: Use <code>/scrape MARKET_NAME</code> (e.g. <code>/scrape KALYAN</code>) to lookup specific numbers</i>`,
            { parse_mode: 'HTML' }
          );
        }
      } catch (err: any) {
        logger.error({ err }, 'Error handling /scrape command');
        await ctx.api.editMessageText(
          ctx.chat.id,
          statusMsg.message_id,
          `❌ <b>Error:</b> ${err.message || 'Scrape execution encountered an error'}`,
          { parse_mode: 'HTML' }
        );
      }
    });

    // /id command
    this.bot.command('id', async (ctx) => {
      let title = ctx.chat.title || (ctx.chat as any).first_name || 'Direct Chat';
      try {
        const fetched = await ctx.api.getChat(ctx.chat.id);
        title = fetched.title || (fetched as any).first_name || title;
      } catch {
        // ignore
      }
      const isApproved = this.groupApprovalService.isApproved(ctx.chat.id);
      const isUserAdmin = this.isAdmin(ctx.from?.id || 0);

      await ctx.reply(
        `📌 <b>Chat Details:</b>\n\n` +
          `👥 <b>Group Name:</b> <b>${title}</b>\n` +
          `🆔 <b>Chat ID:</b> <code>${ctx.chat.id}</code>\n` +
          `🏷 <b>Type:</b> <code>${ctx.chat.type}</code>\n` +
          `🔒 <b>Broadcast Status:</b> ${isApproved ? '✅ Approved' : '⏳ Pending / Unapproved'}\n` +
          `👑 <b>Your Role:</b> ${isUserAdmin ? '👑 Administrator' : '👤 Member'}`,
        { parse_mode: 'HTML' }
      );
    });

    // /settarget command
    this.bot.command('settarget', async (ctx) => {
      if (!this.isAdmin(ctx.from?.id || 0)) {
        await ctx.reply('⚠️ This command is restricted to bot administrators.', { parse_mode: 'HTML' });
        return;
      }

      const title = ctx.chat.title || 'Direct Chat';
      this.updateConfigTargetChat(ctx.chat.id, title);
      await ctx.reply(
        `🎯 <b>Destination Set!</b>\nAll verified consensus alerts will be posted to: <b>${title}</b> (<code>${ctx.chat.id}</code>)`,
        { parse_mode: 'HTML' }
      );
    });

    // /status command
    this.bot.command('status', async (ctx) => {
      const stats = this.consensusEngine.getStats();
      const uptimeSec = Math.floor((Date.now() - stats.startedAt) / 1000);
      const uptimeMin = (uptimeSec / 60).toFixed(1);
      const pendingCount = this.consensusEngine.getPendingCandidatesCount();
      const approvedCount = this.groupApprovalService.getApprovedChats().length;
      const pendingRequestsCount = this.groupApprovalService.getPendingRequests().length;
      const dpbossCount = this.dpbossScraperService?.getCachedResultsCount() ?? 0;

      const msg = [
        '📊 <b>BRIDGE ENGINE STATUS</b>',
        '━━━━━━━━━━━━━━━━━━━━━',
        `⏱ <b>Uptime:</b> ${uptimeMin} mins`,
        `📥 <b>Messages Processed:</b> ${stats.totalMessagesReceived}`,
        `🔍 <b>Parsed Updates:</b> ${stats.totalPayloadsParsed}`,
        `🏆 <b>Consensus Confirmed (✅):</b> ${stats.totalConsensusReached}`,
        `⌛ <b>Pending In Window:</b> ${pendingCount}`,
        '━━━━━━━━━━━━━━━━━━━━━',
        `👥 <b>Approved Groups:</b> ${approvedCount}`,
        `⏳ <b>Pending Group Requests:</b> ${pendingRequestsCount}`,
        '━━━━━━━━━━━━━━━━━━━━━',
        `🌐 <b>DPBoss.boston Scraper:</b> ${this.config.dpboss.enabled ? 'Enabled ✅' : 'Disabled ❌'}`,
        `📊 <b>DPBoss Cached Markets:</b> ${dpbossCount}`,
        `🕒 <b>Scraper Interval:</b> ${this.config.dpboss.pollIntervalSeconds}s`,
        '━━━━━━━━━━━━━━━━━━━━━',
        `👥 <b>Quorum Threshold:</b> ${this.config.consensus.minMatches} distinct sources`,
        `⏳ <b>Match Window:</b> ${this.config.consensus.timeWindowSeconds}s`,
      ].join('\n');

      await ctx.reply(msg, { parse_mode: 'HTML' });
    });

    // /settemplate command: /settemplate [chatId] <template>
    this.bot.command('settemplate', async (ctx) => {
      const fromId = ctx.from?.id || 0;
      if (!this.isAdmin(fromId)) {
        await ctx.reply('⚠️ This command is restricted to bot administrators.', { parse_mode: 'HTML' });
        return;
      }

      const rawText = ctx.message?.text || '';
      const body = rawText.replace(/^\/settemplate(?:@[a-zA-Z0-9_]+)?\s*/i, '').trim();

      if (!body) {
        await ctx.reply(
          `ℹ️ <b>How to set custom group message template:</b>\n\n` +
            `<b>Inside the Group:</b>\n` +
            `<code>/settemplate 🔥 <b>{market} RESULT</b> 🔥\\n\\n🎯 Number: <code>{value}</code>\\n⏰ Time: {time}\\n{status}</code>\n\n` +
            `<b>In Private Message to Bot:</b>\n` +
            `<code>/settemplate &lt;chatId&gt; &lt;template&gt;</code>\n\n` +
            `<b>Available Placeholders:</b>\n` +
            `• <code>{market}</code> or <code>{marketName}</code> - Market Name (e.g. KALYAN)\n` +
            `• <code>{session}</code> - Session (OPEN/CLOSE)\n` +
            `• <code>{sessionText}</code> - e.g. (OPEN)\n` +
            `• <code>{value}</code> - Full Result Value (e.g. 123-67-890)\n` +
            `• <code>{openPanna}</code> - 1st 3 digits (e.g. 123)\n` +
            `• <code>{jodi}</code> - Middle 1-2 digits (e.g. 67)\n` +
            `• <code>{closePanna}</code> - Last 3 digits (e.g. 890)\n` +
            `• <code>{status}</code> - ✅ Verified\n` +
            `• <code>{statusIcon}</code> - ✅\n` +
            `• <code>{time}</code> - IST Time (e.g. 04:45 PM)\n` +
            `• <code>{date}</code> - IST Date (e.g. 18/09/2026)`,
          { parse_mode: 'HTML' }
        );
        return;
      }

      let targetChatId = String(ctx.chat.id);
      let templateText = body;

      // If in private chat or if body starts with chat ID:
      const idMatch = body.match(/^(-\d+|\d+)\s+([\s\S]+)$/);
      if (idMatch) {
        targetChatId = idMatch[1];
        templateText = idMatch[2].trim();
      } else if (ctx.chat.type === 'private') {
        await ctx.reply(
          'ℹ️ In private chat, please include the chat ID:\n<code>/settemplate &lt;chatId&gt; &lt;template&gt;</code>',
          { parse_mode: 'HTML' }
        );
        return;
      }

      const chatInfo = this.groupApprovalService.getChatInfo(targetChatId);
      if (!chatInfo && targetChatId !== this.config.telegram.targetChatId) {
        await ctx.reply(
          `⚠️ Group <code>${targetChatId}</code> is not in the approved broadcast list. Use <code>/approve ${targetChatId}</code> first.`,
          { parse_mode: 'HTML' }
        );
        return;
      }

      this.groupApprovalService.setChatTemplate(targetChatId, templateText);

      // Create a mock event for preview
      const mockEvent: any = {
        marketName: 'KALYAN',
        session: 'CLOSE',
        value: '123-67-890',
        isVerified: true,
        sourceType: 'live_consensus',
        timestamp: Date.now(),
        matches: [],
      };

      const preview = this.notifier.formatMessage(
        mockEvent,
        templateText,
        chatInfo?.customHeader,
        chatInfo?.customFooter
      );

      await ctx.reply(
        `✅ <b>Custom Template Saved!</b>\n` +
          `📌 <b>Group:</b> ${chatInfo?.title || 'Target'} (<code>${targetChatId}</code>)\n\n` +
          `<b>Live Result Preview:</b>\n━━━━━━━━━━━━━━━━━━━━━\n${preview}\n━━━━━━━━━━━━━━━━━━━━━`,
        { parse_mode: 'HTML' }
      );
    });

    // /viewtemplate command: /viewtemplate [chatId]
    this.bot.command('viewtemplate', async (ctx) => {
      const fromId = ctx.from?.id || 0;
      if (!this.isAdmin(fromId)) {
        await ctx.reply('⚠️ This command is restricted to bot administrators.', { parse_mode: 'HTML' });
        return;
      }

      const rawText = ctx.message?.text || '';
      const arg = rawText.replace(/^\/viewtemplate(?:@[a-zA-Z0-9_]+)?\s*/i, '').trim();

      let targetChatId = arg || String(ctx.chat.id);
      if (ctx.chat.type === 'private' && !arg) {
        const approved = this.groupApprovalService.getApprovedChats();
        if (approved.length === 0) {
          await ctx.reply('ℹ️ No approved groups found.', { parse_mode: 'HTML' });
          return;
        }
        targetChatId = approved[0].chatId;
      }

      const chatInfo = this.groupApprovalService.getChatInfo(targetChatId);
      const customTemplate = chatInfo?.customTemplate || this.config.telegram.defaultTemplate || '(Default Format)';
      const customHeader = chatInfo?.customHeader || '(None)';
      const customFooter = chatInfo?.customFooter || '(None)';

      const mockEvent: any = {
        marketName: 'KALYAN',
        session: 'CLOSE',
        value: '123-67-890',
        isVerified: true,
        sourceType: 'live_consensus',
        timestamp: Date.now(),
        matches: [],
      };

      const preview = this.notifier.formatMessage(
        mockEvent,
        chatInfo?.customTemplate,
        chatInfo?.customHeader,
        chatInfo?.customFooter
      );

      await ctx.reply(
        `📋 <b>Group Template Settings:</b>\n` +
          `📌 <b>Title:</b> ${chatInfo?.title || 'Chat'} (<code>${targetChatId}</code>)\n\n` +
          `<b>Header:</b>\n<code>${customHeader}</code>\n\n` +
          `<b>Template:</b>\n<code>${customTemplate}</code>\n\n` +
          `<b>Footer:</b>\n<code>${customFooter}</code>\n\n` +
          `<b>Live Preview:</b>\n━━━━━━━━━━━━━━━━━━━━━\n${preview}\n━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `<i>Commands to customize:</i>\n` +
          `• <code>/settemplate [chatId] &lt;template&gt;</code>\n` +
          `• <code>/setheader [chatId] &lt;header&gt;</code>\n` +
          `• <code>/setfooter [chatId] &lt;footer&gt;</code>\n` +
          `• <code>/resettemplate [chatId]</code>`,
        { parse_mode: 'HTML' }
      );
    });

    // /resettemplate command: /resettemplate [chatId]
    this.bot.command('resettemplate', async (ctx) => {
      const fromId = ctx.from?.id || 0;
      if (!this.isAdmin(fromId)) {
        await ctx.reply('⚠️ This command is restricted to bot administrators.', { parse_mode: 'HTML' });
        return;
      }

      const rawText = ctx.message?.text || '';
      const arg = rawText.replace(/^\/resettemplate(?:@[a-zA-Z0-9_]+)?\s*/i, '').trim();

      let targetChatId = arg || String(ctx.chat.id);
      if (ctx.chat.type === 'private' && !arg) {
        await ctx.reply('ℹ️ Usage in private chat: <code>/resettemplate &lt;chatId&gt;</code>', { parse_mode: 'HTML' });
        return;
      }

      this.groupApprovalService.setChatTemplate(targetChatId, undefined);
      this.groupApprovalService.setChatHeader(targetChatId, undefined);
      this.groupApprovalService.setChatFooter(targetChatId, undefined);

      await ctx.reply(
        `🔄 <b>Template Reset!</b>\nGroup <code>${targetChatId}</code> has been restored to default formatting.`,
        { parse_mode: 'HTML' }
      );
    });

    // /setheader command: /setheader [chatId] <header>
    this.bot.command('setheader', async (ctx) => {
      const fromId = ctx.from?.id || 0;
      if (!this.isAdmin(fromId)) {
        await ctx.reply('⚠️ This command is restricted to bot administrators.', { parse_mode: 'HTML' });
        return;
      }

      const rawText = ctx.message?.text || '';
      const body = rawText.replace(/^\/setheader(?:@[a-zA-Z0-9_]+)?\s*/i, '').trim();

      if (!body) {
        await ctx.reply('ℹ️ <b>Usage:</b> <code>/setheader [chatId] &lt;header text&gt;</code>', { parse_mode: 'HTML' });
        return;
      }

      let targetChatId = String(ctx.chat.id);
      let headerText = body;

      const idMatch = body.match(/^(-\d+|\d+)\s+([\s\S]+)$/);
      if (idMatch) {
        targetChatId = idMatch[1];
        headerText = idMatch[2].trim();
      } else if (ctx.chat.type === 'private') {
        await ctx.reply('ℹ️ In private chat: <code>/setheader &lt;chatId&gt; &lt;header&gt;</code>', { parse_mode: 'HTML' });
        return;
      }

      this.groupApprovalService.setChatHeader(targetChatId, headerText);
      await ctx.reply(`✅ <b>Header Updated!</b>\nNew header set for <code>${targetChatId}</code>:\n${headerText}`, {
        parse_mode: 'HTML',
      });
    });

    // /setfooter command: /setfooter [chatId] <footer>
    this.bot.command('setfooter', async (ctx) => {
      const fromId = ctx.from?.id || 0;
      if (!this.isAdmin(fromId)) {
        await ctx.reply('⚠️ This command is restricted to bot administrators.', { parse_mode: 'HTML' });
        return;
      }

      const rawText = ctx.message?.text || '';
      const body = rawText.replace(/^\/setfooter(?:@[a-zA-Z0-9_]+)?\s*/i, '').trim();

      if (!body) {
        await ctx.reply('ℹ️ <b>Usage:</b> <code>/setfooter [chatId] &lt;footer text&gt;</code>', { parse_mode: 'HTML' });
        return;
      }

      let targetChatId = String(ctx.chat.id);
      let footerText = body;

      const idMatch = body.match(/^(-\d+|\d+)\s+([\s\S]+)$/);
      if (idMatch) {
        targetChatId = idMatch[1];
        footerText = idMatch[2].trim();
      } else if (ctx.chat.type === 'private') {
        await ctx.reply('ℹ️ In private chat: <code>/setfooter &lt;chatId&gt; &lt;footer&gt;</code>', { parse_mode: 'HTML' });
        return;
      }

      this.groupApprovalService.setChatFooter(targetChatId, footerText);
      await ctx.reply(`✅ <b>Footer Updated!</b>\nNew footer set for <code>${targetChatId}</code>:\n${footerText}`, {
        parse_mode: 'HTML',
      });
    });

    // /setbutton command: /setbutton [chatId] <Button Text> | <URL>
    this.bot.command('setbutton', async (ctx) => {
      const fromId = ctx.from?.id || 0;
      if (!this.isAdmin(fromId)) {
        await ctx.reply('⚠️ This command is restricted to bot administrators.', { parse_mode: 'HTML' });
        return;
      }

      const rawText = ctx.message?.text || '';
      const body = rawText.replace(/^\/setbutton(?:@[a-zA-Z0-9_]+)?\s*/i, '').trim();

      if (!body || !body.includes('|')) {
        await ctx.reply(
          `ℹ️ <b>How to set an interactive link button:</b>\n\n` +
            `<b>Usage:</b>\n<code>/setbutton [chatId] &lt;Button Text&gt; | &lt;URL&gt;</code>\n\n` +
            `<b>Example:</b>\n<code>/setbutton Register &amp; Play Now ⬇️⬇️ | https://www.posmatka.com/login?tab=register&amp;ref=89733</code>\n\n` +
            `<i>To remove button:</i> <code>/setbutton [chatId] none</code>`,
          { parse_mode: 'HTML' }
        );
        return;
      }

      let targetChatId = String(ctx.chat.id);
      let content = body;

      const idMatch = body.match(/^(-\d+|\d+)\s+([\s\S]+)$/);
      if (idMatch) {
        targetChatId = idMatch[1];
        content = idMatch[2].trim();
      } else if (ctx.chat.type === 'private') {
        await ctx.reply('ℹ️ In private chat: <code>/setbutton &lt;chatId&gt; &lt;Button Text&gt; | &lt;URL&gt;</code>', {
          parse_mode: 'HTML',
        });
        return;
      }

      if (content.toLowerCase() === 'none' || content.toLowerCase() === 'remove') {
        this.groupApprovalService.setChatButton(targetChatId, undefined, undefined);
        await ctx.reply(`🗑️ <b>Button Removed:</b> Group <code>${targetChatId}</code> will no longer have a button.`, {
          parse_mode: 'HTML',
        });
        return;
      }

      const [btnText, btnUrl] = content.split('|').map((s) => s.trim());
      if (!btnText || !btnUrl || !btnUrl.startsWith('http')) {
        await ctx.reply('⚠️ Invalid format. URL must start with http:// or https://\nExample: <code>Play Now | https://posmatka.com</code>', {
          parse_mode: 'HTML',
        });
        return;
      }

      this.groupApprovalService.setChatButton(targetChatId, btnText, btnUrl);
      const keyboard = new InlineKeyboard().url(btnText, btnUrl);
      await ctx.reply(
        `✅ <b>Interactive Link Button Saved!</b>\n` +
          `📌 <b>Group:</b> <code>${targetChatId}</code>\n` +
          `🔘 <b>Text:</b> ${btnText}\n` +
          `🔗 <b>URL:</b> <code>${btnUrl}</code>\n\n` +
          `<i>Button preview below:</i>`,
        { parse_mode: 'HTML', reply_markup: keyboard }
      );
    });

    // /templates command: List all group templates
    this.bot.command('templates', async (ctx) => {
      const fromId = ctx.from?.id || 0;
      if (!this.isAdmin(fromId)) {
        await ctx.reply('⚠️ This command is restricted to bot administrators.', { parse_mode: 'HTML' });
        return;
      }

      const approved = this.groupApprovalService.getApprovedChats();
      if (approved.length === 0) {
        await ctx.reply('ℹ️ No approved groups found.', { parse_mode: 'HTML' });
        return;
      }

      const lines = approved.map((g, i) => {
        const hasCustom = g.customTemplate ? '🎨 Custom Template' : '📄 Default Layout';
        const hasHeader = g.customHeader ? ' [Header ✅]' : '';
        const hasFooter = g.customFooter ? ' [Footer ✅]' : '';
        return `${i + 1}. 👥 <b>Group Name:</b> <b>${g.title}</b>\n   🆔 <code>${g.chatId}</code>\n   └ ${hasCustom}${hasHeader}${hasFooter}`;
      });

      await ctx.reply(
        `🎨 <b>Group Message Templates (${approved.length}):</b>\n\n` +
          lines.join('\n\n') +
          `\n\n<i>To customize any group:</i>\n<code>/viewtemplate &lt;chatId&gt;</code>\n<code>/settemplate &lt;chatId&gt; &lt;template&gt;</code>`,
        { parse_mode: 'HTML' }
      );
    });

    // /previewtemplate command
    this.bot.command('previewtemplate', async (ctx) => {
      const rawText = ctx.message?.text || '';
      const arg = rawText.replace(/^\/previewtemplate(?:@[a-zA-Z0-9_]+)?\s*/i, '').trim();

      let targetChatId = arg || String(ctx.chat.id);
      const chatInfo = this.groupApprovalService.getChatInfo(targetChatId);

      const mockEventOpen: any = {
        marketName: 'SRIDEVI',
        session: 'OPEN',
        value: '234-9',
        isVerified: true,
        sourceType: 'live_consensus',
        timestamp: Date.now(),
        matches: [],
      };

      const mockEventClose: any = {
        marketName: 'KALYAN',
        session: 'CLOSE',
        value: '123-67-890',
        isVerified: true,
        sourceType: 'live_consensus',
        timestamp: Date.now(),
        matches: [],
      };

      const previewOpen = this.notifier.formatMessage(
        mockEventOpen,
        chatInfo?.customTemplate,
        chatInfo?.customHeader,
        chatInfo?.customFooter
      );

      const previewClose = this.notifier.formatMessage(
        mockEventClose,
        chatInfo?.customTemplate,
        chatInfo?.customHeader,
        chatInfo?.customFooter
      );

      await ctx.reply(
        `🔍 <b>Template Live Previews:</b>\n` +
          `📌 <b>Group:</b> ${chatInfo?.title || 'Current Chat'} (<code>${targetChatId}</code>)\n\n` +
          `<b>Sample 1 (Single Session / Open):</b>\n━━━━━━━━━━━━━━━━━━━━━\n${previewOpen}\n━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `<b>Sample 2 (Full Jodi / Close):</b>\n━━━━━━━━━━━━━━━━━━━━━\n${previewClose}\n━━━━━━━━━━━━━━━━━━━━━`,
        { parse_mode: 'HTML' }
      );
    });

    // /test command: /test [chatId]
    this.bot.command('test', async (ctx) => {
      const fromId = ctx.from?.id || 0;
      if (!this.isAdmin(fromId)) {
        await ctx.reply('⚠️ This command is restricted to bot administrators.', { parse_mode: 'HTML' });
        return;
      }

      const rawText = ctx.message?.text || '';
      const arg = rawText.replace(/^\/test(?:@[a-zA-Z0-9_]+)?\s*/i, '').trim();

      const sampleEvent: VerifiedPayloadEvent = {
        marketName: 'KALYAN',
        session: 'CLOSE',
        value: '123-67-890',
        isVerified: true,
        matches: [],
        firstSeenAt: Date.now(),
        confirmedAt: Date.now(),
        timeToConsensusMs: 1200,
        sessionKey: 'KALYAN::CLOSE::123-67-890',
      };

      if (arg) {
        // Test a specific target chat ID
        const targetChatId = arg;
        const chatInfo = this.groupApprovalService.getChatInfo(targetChatId);
        await ctx.reply(`🚀 Dispatching sample result to <code>${targetChatId}</code>...`, { parse_mode: 'HTML' });

        const res = await this.notifier.sendVerifiedEvent(
          sampleEvent,
          targetChatId,
          chatInfo?.customTemplate,
          chatInfo?.customHeader,
          chatInfo?.customFooter,
          chatInfo?.buttonText,
          chatInfo?.buttonUrl
        );

        if (res.success) {
          await ctx.reply(`✅ <b>Live Test Delivered!</b>\nSent sample result to <code>${targetChatId}</code> (Message ID: ${res.messageId}).`, {
            parse_mode: 'HTML',
          });
        } else {
          await ctx.reply(`❌ Failed to send sample result to <code>${targetChatId}</code>. Check bot membership & permissions.`, {
            parse_mode: 'HTML',
          });
        }
        return;
      }

      if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
        // Test in current group
        const targetChatId = String(ctx.chat.id);
        const chatInfo = this.groupApprovalService.getChatInfo(targetChatId);

        const res = await this.notifier.sendVerifiedEvent(
          sampleEvent,
          targetChatId,
          chatInfo?.customTemplate,
          chatInfo?.customHeader,
          chatInfo?.customFooter,
          chatInfo?.buttonText,
          chatInfo?.buttonUrl
        );

        if (!res.success) {
          await ctx.reply('❌ Failed to post sample result in this group. Please check bot permissions.');
        }
        return;
      }

      // If in private chat with no args: Broadcast to all approved groups and send a copy to the admin
      const approved = this.groupApprovalService.getApprovedChats();
      if (approved.length === 0) {
        await ctx.reply('ℹ️ No approved groups found to broadcast to. Use <code>/approve &lt;chatId&gt;</code> first.', {
          parse_mode: 'HTML',
        });
        return;
      }

      await ctx.reply(`🚀 Broadcasting sample verified result to <b>${approved.length} approved group(s)</b>...`, {
        parse_mode: 'HTML',
      });

      const broadcastRes = await this.notifier.broadcastVerifiedEvent(sampleEvent, approved);

      // Also send a copy directly to the Admin
      const primaryChat = approved[0];
      await this.notifier.sendVerifiedEvent(
        sampleEvent,
        String(ctx.chat.id),
        primaryChat.customTemplate,
        primaryChat.customHeader,
        primaryChat.customFooter,
        primaryChat.buttonText,
        primaryChat.buttonUrl
      );

      await ctx.reply(
        `✅ <b>Broadcast Test Complete!</b>\n` +
          `• Successfully delivered to: <b>${broadcastRes.deliveredCount}/${approved.length}</b> destinations\n` +
          `• Group templates & buttons applied: <b>Yes ✅</b>`,
        { parse_mode: 'HTML' }
      );
    });

    // Error handling
    this.bot.catch((err) => {
      logger.error({ err: err.error, ctx: err.ctx.update }, 'Telegram bot error occurred');
    });
  }

  public async start(): Promise<void> {
    if (!this.config.telegram.botToken) {
      logger.warn('No Telegram bot token configured; Telegram bot service inactive.');
      return;
    }

    try {
      this.bot.start({
        drop_pending_updates: true,
        onStart: (botInfo) => {
          logger.info({ username: botInfo.username }, '🤖 Telegram Bot started and listening for commands & group events');
        },
      }).catch((err: any) => {
        logger.warn({ err: err?.message || err }, 'Telegram polling interrupted, will auto-retry in 5 seconds');
        setTimeout(() => this.start(), 5000);
      });
    } catch (err) {
      logger.error({ err }, 'Failed to start Telegram bot polling');
      setTimeout(() => this.start(), 5000);
    }
  }

  public async stop(): Promise<void> {
    try {
      await this.bot.stop();
    } catch {
      // ignore
    }
  }
}
