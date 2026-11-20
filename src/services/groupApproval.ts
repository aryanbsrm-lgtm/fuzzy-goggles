import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { ApprovedChatInfo, PendingGroupRequest } from '../types.js';
import { logger } from '../utils/logger.js';

export interface GroupApprovalStoreData {
  approvedChats: Record<string, ApprovedChatInfo>;
  pendingRequests: Record<string, PendingGroupRequest>;
}

export class GroupApprovalService extends EventEmitter {
  private filePath: string;
  private approvedChats = new Map<string, ApprovedChatInfo>();
  private pendingRequests = new Map<string, PendingGroupRequest>();

  constructor(filePath: string = path.resolve(process.cwd(), 'data/approved_chats.json'), defaultTargetChatId?: string) {
    super();
    this.filePath = filePath;
    this.load();

    // If default targetChatId is configured, ensure it is in the approved list
    if (defaultTargetChatId) {
      const idStr = String(defaultTargetChatId).trim();
      if (idStr && !this.approvedChats.has(idStr)) {
        this.approvedChats.set(idStr, {
          chatId: idStr,
          title: 'Primary Target Channel/Group',
          type: 'channel',
          approvedAt: Date.now(),
          approvedBy: 'SYSTEM_CONFIG',
        });
        this.save();
      }
    }
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const data: GroupApprovalStoreData = JSON.parse(raw);

        if (data.approvedChats) {
          for (const [id, info] of Object.entries(data.approvedChats)) {
            this.approvedChats.set(String(id), info);
          }
        }

        if (data.pendingRequests) {
          for (const [id, req] of Object.entries(data.pendingRequests)) {
            this.pendingRequests.set(String(id), req);
          }
        }
        logger.info({ approvedCount: this.approvedChats.size, pendingCount: this.pendingRequests.size }, '📂 Loaded approved & pending group data');
      }
    } catch (err: any) {
      logger.warn({ err: err?.message || err }, 'Failed to read approved_chats.json, starting with empty store');
    }
  }

  private save(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const data: GroupApprovalStoreData = {
        approvedChats: Object.fromEntries(this.approvedChats.entries()),
        pendingRequests: Object.fromEntries(this.pendingRequests.entries()),
      };

      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err: any) {
      logger.error({ err: err?.message || err }, 'Failed to save approved_chats.json');
    }
  }

  /**
   * Checks if a chat is approved for result broadcasts
   */
  public isApproved(chatId: string | number): boolean {
    this.load();
    return this.approvedChats.has(String(chatId));
  }

  /**
   * Returns list of all approved chat IDs
   */
  public getApprovedChatIds(): string[] {
    this.load();
    return Array.from(this.approvedChats.keys());
  }

  /**
   * Returns list of all approved chat objects
   */
  public getApprovedChats(): ApprovedChatInfo[] {
    this.load();
    return Array.from(this.approvedChats.values());
  }

  /**
   * Adds or updates an approved chat
   */
  public addApprovedChat(info: ApprovedChatInfo): boolean {
    const idStr = String(info.chatId);
    const existing = this.approvedChats.get(idStr);
    this.approvedChats.set(idStr, {
      ...existing,
      ...info,
      chatId: idStr,
      approvedAt: info.approvedAt || existing?.approvedAt || Date.now(),
    });

    // Remove from pending if previously pending
    this.pendingRequests.delete(idStr);

    this.save();
    logger.info({ chatId: idStr, title: info.title, approvedBy: info.approvedBy }, '✅ Group approved for verified broadcasts');
    this.emit('chat_approved', this.approvedChats.get(idStr)!);
    return true;
  }

  /**
   * Migrates an existing chat ID to a new ID (e.g. when group upgrades to supergroup)
   */
  public migrateChatId(oldChatId: string | number, newChatId: string | number): boolean {
    const oldIdStr = String(oldChatId);
    const newIdStr = String(newChatId);
    this.load();
    const existing = this.approvedChats.get(oldIdStr);
    if (!existing) {
      return false;
    }

    this.approvedChats.delete(oldIdStr);
    const updated: ApprovedChatInfo = {
      ...existing,
      chatId: newIdStr,
      type: 'supergroup',
    };
    this.approvedChats.set(newIdStr, updated);
    this.pendingRequests.delete(oldIdStr);
    this.pendingRequests.delete(newIdStr);

    this.save();
    logger.info(
      { oldChatId: oldIdStr, newChatId: newIdStr, title: existing.title },
      '🔄 Auto-migrated Telegram group to supergroup ID in approval registry'
    );
    this.emit('chat_migrated', { oldChatId: oldIdStr, newChatId: newIdStr, info: updated });
    return true;
  }

  /**
   * Revokes approval and removes chat from broadcast list
   */
  public removeApprovedChat(chatId: string | number): boolean {
    const idStr = String(chatId);
    const existed = this.approvedChats.delete(idStr);
    if (existed) {
      this.save();
      logger.info({ chatId: idStr }, '❌ Group approval revoked and removed from broadcasts');
      this.emit('chat_removed', idStr);
    }
    return existed;
  }

  /**
   * Adds a new pending group approval request
   */
  public addPendingRequest(req: PendingGroupRequest): boolean {
    const idStr = String(req.chatId);
    if (this.approvedChats.has(idStr)) {
      return false; // already approved
    }

    this.pendingRequests.set(idStr, {
      ...req,
      chatId: idStr,
      requestedAt: req.requestedAt || Date.now(),
    });

    this.save();
    logger.info({ chatId: idStr, title: req.title, addedBy: req.addedBy }, '⏳ New group request added to pending queue');
    this.emit('pending_request_added', req);
    return true;
  }

  /**
   * Returns all pending requests
   */
  public getPendingRequests(): PendingGroupRequest[] {
    return Array.from(this.pendingRequests.values());
  }

  /**
   * Removes a request from the pending queue (e.g. upon rejection)
   */
  public removePendingRequest(chatId: string | number): boolean {
    const idStr = String(chatId);
    const existed = this.pendingRequests.delete(idStr);
    if (existed) {
      this.save();
      this.emit('pending_request_removed', idStr);
    }
    return existed;
  }

  /**
   * Gets specific approved chat details
   */
  public getChatInfo(chatId: string | number): ApprovedChatInfo | undefined {
    this.load();
    return this.approvedChats.get(String(chatId));
  }

  /**
   * Sets custom message format template for a specific chat
   */
  public setChatTemplate(chatId: string | number, template: string | undefined): boolean {
    const idStr = String(chatId);
    const chat = this.approvedChats.get(idStr);
    if (!chat) return false;

    if (template && template.trim()) {
      chat.customTemplate = template.trim();
    } else {
      delete chat.customTemplate;
    }

    this.save();
    logger.info({ chatId: idStr, hasCustomTemplate: Boolean(chat.customTemplate) }, 'Updated custom template for chat');
    return true;
  }

  /**
   * Sets custom header for a specific chat
   */
  public setChatHeader(chatId: string | number, header: string | undefined): boolean {
    const idStr = String(chatId);
    const chat = this.approvedChats.get(idStr);
    if (!chat) return false;

    if (header && header.trim()) {
      chat.customHeader = header.trim();
    } else {
      delete chat.customHeader;
    }

    this.save();
    return true;
  }

  /**
   * Sets custom footer for a specific chat
   */
  public setChatFooter(chatId: string | number, footer: string | undefined): boolean {
    const idStr = String(chatId);
    const chat = this.approvedChats.get(idStr);
    if (!chat) return false;

    if (footer && footer.trim()) {
      chat.customFooter = footer.trim();
    } else {
      delete chat.customFooter;
    }

    this.save();
    return true;
  }

  /**
   * Sets custom inline URL button for a specific chat
   */
  public setChatButton(chatId: string | number, buttonText: string | undefined, buttonUrl: string | undefined): boolean {
    const idStr = String(chatId);
    const chat = this.approvedChats.get(idStr);
    if (!chat) return false;

    if (buttonText && buttonText.trim() && buttonUrl && buttonUrl.trim()) {
      chat.buttonText = buttonText.trim();
      chat.buttonUrl = buttonUrl.trim();
    } else {
      delete chat.buttonText;
      delete chat.buttonUrl;
    }

    this.save();
    return true;
  }

  /**
   * Assigns a dedicated Telegram bot token & profile to a specific chat
   */
  public setChatBot(
    chatId: string | number,
    botToken: string | undefined,
    botUsername?: string,
    botName?: string
  ): boolean {
    const idStr = String(chatId);
    const chat = this.approvedChats.get(idStr);
    if (!chat) return false;

    if (botToken && botToken.trim()) {
      chat.botToken = botToken.trim();
      if (botUsername) chat.botUsername = botUsername.trim();
      if (botName) chat.botName = botName.trim();
    } else {
      delete chat.botToken;
      delete chat.botUsername;
      delete chat.botName;
    }

    this.save();
    logger.info({ chatId: idStr, botUsername: chat.botUsername, hasCustomBot: Boolean(chat.botToken) }, '🤖 Assigned bot to group');
    return true;
  }
}
