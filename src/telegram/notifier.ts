import { Bot, InlineKeyboard } from 'grammy';
import { Config } from '../config.js';
import { VerifiedPayloadEvent, ApprovedChatInfo } from '../types.js';
import { GroupApprovalService } from '../services/groupApproval.js';
import { logger } from '../utils/logger.js';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export class TelegramNotifier {
  private defaultBot: Bot;
  private botCache = new Map<string, Bot>();
  private config: Config['telegram'];
  private groupApprovalService?: GroupApprovalService;

  constructor(bot: Bot, config: Config['telegram'], groupApprovalService?: GroupApprovalService) {
    this.defaultBot = bot;
    this.config = config;
    this.groupApprovalService = groupApprovalService;
  }

  public getBotForToken(token?: string): Bot {
    if (!token || token === this.config.botToken) {
      return this.defaultBot;
    }
    let cached = this.botCache.get(token);
    if (!cached) {
      cached = new Bot(token);
      this.botCache.set(token, cached);
    }
    return cached;
  }

  /**
   * Formats message using per-group template or default layout
   */
  public formatMessage(
    event: VerifiedPayloadEvent,
    customTemplate?: string,
    customHeader?: string,
    customFooter?: string
  ): string {
    const marketUpper = event.marketName.toUpperCase();
    const sessionUpper = event.session || '';
    const sessionText = event.session ? ` (${event.session})` : '';
    const value = event.value;
    const statusText = event.isVerified ? '✅ Verified' : '❌ Unverified';
    const statusIcon = event.isVerified ? '✅' : '❌';

    // Parse value components if standard matka format (e.g. 123-6, 123-67-890, ***-8-890)
    let openPanna = '';
    let jodi = '';
    let closePanna = '';
    let openDigit = '';
    let closeDigit = '';

    const parts = value.split('-').map((p) => p.trim());
    if (parts.length === 2) {
      if (parts[0].length === 3 && parts[1].length === 1) {
        openPanna = parts[0];
        openDigit = parts[1];
        jodi = parts[1];
      } else if (parts[0].length === 1 && parts[1].length === 3) {
        closeDigit = parts[0];
        closePanna = parts[1];
        jodi = parts[0];
      }
    } else if (parts.length === 3) {
      openPanna = parts[0].replace(/\*/g, '');
      jodi = parts[1].replace(/\*/g, '');
      closePanna = parts[2].replace(/\*/g, '');
      if (jodi.length === 2) {
        openDigit = jodi[0];
        closeDigit = jodi[1];
      } else if (jodi.length === 1) {
        openDigit = jodi;
      }
    }

    // Format strictly in Indian Standard Time (IST, Asia/Kolkata)
    const dateObj = new Date(event.confirmedAt || event.firstSeenAt || Date.now());
    const istTime = dateObj.toLocaleTimeString('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    const istDate = dateObj.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata' });

    const template = customTemplate || this.config.defaultTemplate;

    if (template && template.trim()) {
      let rendered = template
        .replace(/\{market(?:Name)?\}|\[Market(?:\s+Name)?\]/gi, escapeHtml(marketUpper))
        .replace(/\{session\}|\[Session\]/gi, escapeHtml(sessionUpper))
        .replace(/\{sessionText\}/gi, escapeHtml(sessionText))
        .replace(/\{value\}|\[Value\]|\[Result\]|\[Open\s+Result\]\s*-\s*\[Close\s+Result\]/gi, escapeHtml(value))
        .replace(/\{status\}|\[Status\]/gi, escapeHtml(statusText))
        .replace(/\{statusIcon\}/gi, statusIcon)
        .replace(/\{time\}|\[Time\]|\[HH:MM\]/gi, istTime)
        .replace(/\{date\}|\[Date\]|\[DD\/MM\/YYYY\]/gi, istDate)
        .replace(/\{openPanna\}|\[Open\s*Panna\]/gi, escapeHtml(openPanna))
        .replace(/\{closePanna\}|\[Close\s*Panna\]/gi, escapeHtml(closePanna))
        .replace(/\{jodi\}|\[Jodi\]/gi, escapeHtml(jodi))
        .replace(/\{openDigit\}|\[Open\s*Digit\]/gi, escapeHtml(openDigit))
        .replace(/\{closeDigit\}|\[Close\s*Digit\]/gi, escapeHtml(closeDigit));

      if (customHeader && customHeader.trim()) {
        rendered = `${customHeader.trim()}\n${rendered}`;
      }
      if (customFooter && customFooter.trim()) {
        rendered = `${rendered}\n${customFooter.trim()}`;
      }
      return rendered;
    }

    // Default clean format for channels/groups without a custom template
    const lines: string[] = [];
    if (customHeader && customHeader.trim()) {
      lines.push(customHeader.trim());
    }

    lines.push(`<b>${escapeHtml(marketUpper)}${escapeHtml(sessionText)}</b>`);
    lines.push(`<code>${escapeHtml(value)}</code>`);
    lines.push(statusText);

    if (customFooter && customFooter.trim()) {
      lines.push(customFooter.trim());
    }

    return lines.join('\n');
  }

  public async sendVerifiedEvent(
    event: VerifiedPayloadEvent,
    targetChatId?: string,
    customTemplate?: string,
    customHeader?: string,
    customFooter?: string,
    buttonText?: string,
    buttonUrl?: string,
    botToken?: string
  ): Promise<{ success: boolean; messageId?: number }> {
    const dest = targetChatId || this.config.targetChatId;
    if (!dest) {
      logger.warn('TELEGRAM_CHAT_ID is not set in .env; skipping Telegram message delivery.');
      return { success: false };
    }

    const botInstance = this.getBotForToken(botToken);
    const htmlMessage = this.formatMessage(event, customTemplate, customHeader, customFooter);
    const replyMarkup = buttonText && buttonUrl
      ? new InlineKeyboard().url(buttonText, buttonUrl)
      : undefined;

    try {
      const sentMsg = await botInstance.api.sendMessage(dest, htmlMessage, {
        parse_mode: 'HTML',
        reply_markup: replyMarkup,
      });
      logger.info(
        { targetChatId: dest, messageId: sentMsg.message_id, value: event.value },
        'Successfully sent update to Telegram'
      );
      return { success: true, messageId: sentMsg.message_id };
    } catch (err: any) {
      const migratedId = err?.parameters?.migrate_to_chat_id || err?.payload?.parameters?.migrate_to_chat_id;
      if (migratedId) {
        const newChatId = String(migratedId);
        logger.info({ oldChatId: dest, newChatId }, '🔄 Telegram chat was upgraded to supergroup, auto-updating and retrying...');
        this.groupApprovalService?.migrateChatId(dest, newChatId);
        try {
          const retrySentMsg = await botInstance.api.sendMessage(newChatId, htmlMessage, {
            parse_mode: 'HTML',
            reply_markup: replyMarkup,
          });
          return { success: true, messageId: retrySentMsg.message_id };
        } catch (retryErr: any) {
          logger.error({ retryErr: retryErr?.message || retryErr, newChatId }, 'Failed to send update to migrated supergroup');
        }
      }
      logger.error(
        { err: err?.message || err, targetChatId: dest },
        'Failed to send update to Telegram'
      );
      return { success: false };
    }
  }

  public async editVerifiedEvent(
    messageId: number,
    event: VerifiedPayloadEvent,
    targetChatId?: string,
    customTemplate?: string,
    botToken?: string
  ): Promise<{ success: boolean; messageId?: number }> {
    const dest = targetChatId || this.config.targetChatId;
    if (!dest) {
      return { success: false };
    }

    const botInstance = this.getBotForToken(botToken);
    const htmlMessage = this.formatMessage(event, customTemplate);

    try {
      await botInstance.api.editMessageText(dest, messageId, htmlMessage, {
        parse_mode: 'HTML',
      });
      logger.info(
        { targetChatId: dest, messageId, value: event.value },
        'Successfully updated existing Telegram message in-place to verified'
      );
      return { success: true, messageId };
    } catch (err: any) {
      logger.warn(
        { err: err?.message || err, messageId },
        'Failed to edit Telegram message in-place, falling back to new message'
      );
      return this.sendVerifiedEvent(event, dest, customTemplate, undefined, undefined, undefined, undefined, botToken);
    }
  }

  public async deleteMessage(messageId: number, targetChatId?: string, botToken?: string): Promise<boolean> {
    const dest = targetChatId || this.config.targetChatId;
    if (!dest) {
      return false;
    }

    const botInstance = this.getBotForToken(botToken);
    try {
      await botInstance.api.deleteMessage(dest, messageId);
      logger.info(
        { targetChatId: dest, messageId },
        '🗑️ Successfully deleted Telegram message'
      );
      return true;
    } catch (err: any) {
      logger.warn(
        { err: err?.message || err, messageId },
        'Failed to delete Telegram message'
      );
      return false;
    }
  }

  /**
   * Broadcasts verified result to all approved groups, formatting each message according to group-specific templates, buttons, and dedicated bot tokens
   */
  public async broadcastVerifiedEvent(
    event: VerifiedPayloadEvent,
    approvedChats: Array<ApprovedChatInfo | string>
  ): Promise<{ success: boolean; deliveredCount: number; messageIds: Record<string, number> }> {
    // Map chats to unique lookup items
    const chatMap = new Map<string, ApprovedChatInfo | undefined>();

    // Add primary targetChatId if configured
    if (this.config.targetChatId) {
      chatMap.set(this.config.targetChatId, undefined);
    }

    for (const item of approvedChats) {
      if (typeof item === 'string') {
        const idStr = item.trim();
        if (idStr && !chatMap.has(idStr)) chatMap.set(idStr, undefined);
      } else if (item && item.chatId) {
        const idStr = String(item.chatId).trim();
        if (idStr) chatMap.set(idStr, item);
      }
    }

    if (chatMap.size === 0) {
      logger.warn('No approved Telegram destinations configured; skipping broadcast.');
      return { success: false, deliveredCount: 0, messageIds: {} };
    }

    const messageIds: Record<string, number> = {};
    let deliveredCount = 0;

    for (const [chatId, chatInfo] of chatMap.entries()) {
      const botInstance = this.getBotForToken(chatInfo?.botToken);
      const htmlMessage = this.formatMessage(
        event,
        chatInfo?.customTemplate,
        chatInfo?.customHeader,
        chatInfo?.customFooter
      );

      const replyMarkup = chatInfo?.buttonText && chatInfo?.buttonUrl
        ? new InlineKeyboard().url(chatInfo.buttonText, chatInfo.buttonUrl)
        : undefined;

      try {
        const sentMsg = await botInstance.api.sendMessage(chatId, htmlMessage, {
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
        });
        if (sentMsg?.message_id) {
          messageIds[chatId] = sentMsg.message_id;
          deliveredCount++;
        }
        logger.info(
          {
            chatId,
            title: chatInfo?.title,
            bot: chatInfo?.botUsername || chatInfo?.botName || 'default',
            messageId: sentMsg.message_id,
            market: event.marketName,
            value: event.value,
          },
          '🚀 Verified result delivered to Telegram destination chat'
        );
      } catch (err: any) {
        const migratedId = err?.parameters?.migrate_to_chat_id || err?.payload?.parameters?.migrate_to_chat_id;
        if (migratedId) {
          const newChatId = String(migratedId);
          logger.info(
            { oldChatId: chatId, newChatId },
            '🔄 Telegram chat was upgraded to supergroup, auto-updating and retrying broadcast...'
          );
          this.groupApprovalService?.migrateChatId(chatId, newChatId);
          try {
            const retrySentMsg = await botInstance.api.sendMessage(newChatId, htmlMessage, {
              parse_mode: 'HTML',
              reply_markup: replyMarkup,
            });
            if (retrySentMsg?.message_id) {
              messageIds[newChatId] = retrySentMsg.message_id;
              deliveredCount++;
            }
            logger.info(
              {
                chatId: newChatId,
                title: chatInfo?.title,
                bot: chatInfo?.botUsername || chatInfo?.botName || 'default',
                messageId: retrySentMsg.message_id,
                market: event.marketName,
                value: event.value,
              },
              '🚀 Verified result delivered to migrated supergroup chat'
            );
            continue;
          } catch (retryErr: any) {
            logger.error(
              { retryErr: retryErr?.message || retryErr, newChatId, market: event.marketName },
              'Failed to deliver verified result to migrated supergroup chat'
            );
          }
        }

        logger.warn(
          {
            err: err?.message || err,
            chatId,
            bot: chatInfo?.botUsername || chatInfo?.botName || 'default',
            market: event.marketName,
          },
          'Failed to deliver verified result to Telegram destination chat'
        );
      }
    }

    return { success: deliveredCount > 0, deliveredCount, messageIds };
  }

  public async sendTestPing(targetChatId?: string, customTemplate?: string, botToken?: string): Promise<boolean> {
    const dest = targetChatId || this.config.targetChatId;
    if (!dest) {
      logger.warn('TELEGRAM_CHAT_ID is not configured');
      return false;
    }

    const botInstance = this.getBotForToken(botToken);
    try {
      const pingText = customTemplate
        ? `🚀 <b>Template Test:</b>\n\n${customTemplate}`
        : '🚀 <b>Bridge Connected!</b>\nMulti-source consensus listener is active.';

      await botInstance.api.sendMessage(dest, pingText, { parse_mode: 'HTML' });
      return true;
    } catch (err) {
      logger.error({ err, dest }, 'Failed to send test ping to Telegram');
      return false;
    }
  }
}


