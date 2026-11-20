import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  WASocket,
  proto,
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import { Config } from '../config.js';
import { logger } from '../utils/logger.js';
import { RawIncomingMessage } from '../parser/index.js';
import { VerifiedPayloadEvent } from '../types.js';

export type MessageCallback = (msg: RawIncomingMessage) => void;

export class WhatsAppClient {
  private config: Config['whatsapp'];
  private sock: WASocket | null = null;
  private messageCallback: MessageCallback | null = null;
  private isReconnecting = false;
  private pairingCodeRequested = false;
  private channelNamesCache = new Map<string, string>();

  constructor(config: Config['whatsapp']) {
    this.config = config;
  }

  public onMessage(callback: MessageCallback): void {
    this.messageCallback = callback;
  }

  public async connect(): Promise<WASocket> {
    const { state, saveCreds } = await useMultiFileAuthState(this.config.authDir);
    const { version, isLatest } = await fetchLatestBaileysVersion();

    logger.info({ version: version.join('.'), isLatest }, 'Initializing WhatsApp bridge client');

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      browser: ['Ubuntu', 'Chrome', '20.0.04'],
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });

    this.sock = sock;

    // Handle credentials update
    sock.ev.on('creds.update', saveCreds);

    // Pairing code mode with delay for socket handshake
    if (this.config.phoneNumber && !sock.authState.creds.registered) {
      setTimeout(async () => {
        if (this.pairingCodeRequested || sock.authState.creds.registered) return;
        this.pairingCodeRequested = true;
        try {
          const cleanPhone = this.config.phoneNumber!.replace(/[^0-9]/g, '');
          console.log(`\n⏳ Requesting pairing code for +${cleanPhone}...`);
          const code = await sock.requestPairingCode(cleanPhone);
          console.log('\n╔═══════════════════════════════════════════════════════╗');
          console.log(`║  🔑 YOUR WHATSAPP PAIRING CODE: ${code.padEnd(20)} ║`);
          console.log('╚═══════════════════════════════════════════════════════╝');
          console.log('📱 On your phone: WhatsApp > Settings > Linked Devices > Link a Device > Link with phone number instead\n');
        } catch (err: any) {
          logger.warn({ err: err?.message || err }, 'Pairing code notice, scan QR code instead');
        }
      }, 3500);
    }

    // Handle connection events
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('\n📱 WhatsApp QR Code:');
        qrcode.generate(qr, { small: true });
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        logger.warn(
          { statusCode, shouldReconnect, reason: lastDisconnect?.error?.message },
          'WhatsApp connection closed'
        );

        if (shouldReconnect && !this.isReconnecting) {
          this.isReconnecting = true;
          logger.info('Reconnecting in 5 seconds...');
          setTimeout(() => {
            this.isReconnecting = false;
            this.connect();
          }, 5000);
        } else if (statusCode === DisconnectReason.loggedOut) {
          logger.error('Device logged out. Please delete auth directory and re-authenticate.');
        }
      } else if (connection === 'open') {
        logger.info('✅ WhatsApp connection established successfully!');
        await this.subscribeToChannels(sock);
      }
    });

    // Handle incoming messages
    sock.ev.on('messages.upsert', async (m) => {
      if (m.type !== 'notify') return;

      for (const msg of m.messages) {
        if (msg.key.fromMe || msg.key.remoteJid === 'status@broadcast') {
          continue;
        }

        const remoteJid = msg.key.remoteJid || '';
        const isGroup = remoteJid.endsWith('@g.us');
        const isChannel = remoteJid.endsWith('@newsletter');

        // Allow both Groups and Channels (Newsletters)
        if (!isGroup && !isChannel) {
          continue;
        }

        // Check if the chat is an approved source group/channel OR an allowed destination group
        const isDestinationGroup = this.config.destinationGroups.includes(remoteJid);
        const isSourceGroup =
          this.config.sourceGroups.length === 0 || this.config.sourceGroups.includes(remoteJid);

        if (!isSourceGroup && !isDestinationGroup) {
          continue;
        }

        const text = this.extractMessageText(msg.message);
        if (!text) continue;

        const senderJid = msg.key.participant || msg.key.remoteJid || '';
        const senderName = msg.pushName || undefined;
        let groupName = this.config.groupAliases[remoteJid] || this.channelNamesCache.get(remoteJid);

        if (!groupName && isChannel) {
          this.resolveChannelName(sock, remoteJid).then((name) => {
            if (name) this.channelNamesCache.set(remoteJid, name);
          }).catch(() => {});
        }

        const timestamp = typeof msg.messageTimestamp === 'number'
          ? msg.messageTimestamp * 1000
          : (msg.messageTimestamp as any)?.low
            ? (msg.messageTimestamp as any).low * 1000
            : Date.now();

        const rawMsg: RawIncomingMessage = {
          text,
          groupJid: remoteJid,
          groupName,
          senderJid,
          senderName,
          timestamp,
        };

        if (this.messageCallback) {
          this.messageCallback(rawMsg);
        }
      }
    });

    return sock;
  }

  /**
   * Subscribes to configured WhatsApp Channels (Newsletters) for real-time push updates
   */
  private async subscribeToChannels(sock: WASocket): Promise<void> {
    const channelJids = this.config.sourceGroups.filter((jid) => jid.endsWith('@newsletter'));

    if (channelJids.length > 0) {
      logger.info({ count: channelJids.length }, 'Subscribing to WhatsApp channel real-time updates...');
    }

    for (const jid of channelJids) {
      try {
        if (typeof (sock as any).newsletterFollow === 'function') {
          await (sock as any).newsletterFollow(jid).catch(() => {});
        }

        if (typeof (sock as any).subscribeNewsletterUpdates === 'function') {
          await (sock as any).subscribeNewsletterUpdates(jid);
          logger.info({ jid }, 'Subscribed to live channel stream');
        }
      } catch (err: any) {
        logger.warn({ jid, err: err?.message || err }, 'Channel subscription notice');
      }
    }
  }

  private async resolveChannelName(sock: WASocket, jid: string): Promise<string | undefined> {
    try {
      if (typeof (sock as any).newsletterMetadata === 'function') {
        const metadata = await (sock as any).newsletterMetadata('jid', jid);
        return metadata?.name || undefined;
      }
    } catch {
      // ignore
    }
    return undefined;
  }

  /**
   * Unwraps all WhatsApp message containers (text, image caption, ephemeral, viewOnce, edited)
   */
  public extractMessageText(message?: proto.IMessage | null): string | null {
    if (!message) return null;

    const unwrapped: any =
      message.ephemeralMessage?.message ||
      message.viewOnceMessage?.message ||
      message.viewOnceMessageV2?.message ||
      message.viewOnceMessageV2Extension?.message ||
      message.documentWithCaptionMessage?.message ||
      (message as any).editedMessage?.message?.protocolMessage?.editedMessage ||
      message;

    if (unwrapped.conversation) {
      return unwrapped.conversation;
    }
    if (unwrapped.extendedTextMessage?.text) {
      return unwrapped.extendedTextMessage.text;
    }
    if (unwrapped.imageMessage?.caption) {
      return unwrapped.imageMessage.caption;
    }
    if (unwrapped.videoMessage?.caption) {
      return unwrapped.videoMessage.caption;
    }
    if (unwrapped.documentMessage?.caption) {
      return unwrapped.documentMessage.caption;
    }
    if (unwrapped.buttonsResponseMessage?.selectedDisplayText) {
      return unwrapped.buttonsResponseMessage.selectedDisplayText;
    }
    if (unwrapped.templateButtonReplyMessage?.selectedId) {
      return unwrapped.templateButtonReplyMessage.selectedId;
    }
    return null;
  }

  public getSocket(): WASocket | null {
    return this.sock;
  }

  /**
   * Formats result for WhatsApp (using bold markdown or custom group template)
   */
  public formatResult(event: VerifiedPayloadEvent, customTemplate?: string): string {
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

    if (customTemplate && customTemplate.trim()) {
      return customTemplate
        .replace(/\{market(?:Name)?\}/gi, marketUpper)
        .replace(/\{session\}/gi, sessionUpper)
        .replace(/\{sessionText\}/gi, sessionText)
        .replace(/\{value\}/gi, value)
        .replace(/\{status\}/gi, statusText)
        .replace(/\{statusIcon\}/gi, statusIcon)
        .replace(/\{time\}/gi, istTime)
        .replace(/\{date\}/gi, istDate)
        .replace(/\{openPanna\}/gi, openPanna)
        .replace(/\{closePanna\}/gi, closePanna)
        .replace(/\{jodi\}/gi, jodi)
        .replace(/\{openDigit\}/gi, openDigit)
        .replace(/\{closeDigit\}/gi, closeDigit);
    }

    return `*${marketUpper}${sessionText}*\n*${value}*\n${statusText}`;
  }

  /**
   * Sends verified result event to all configured WhatsApp destination groups
   */
  public async sendVerifiedEvent(
    event: VerifiedPayloadEvent,
    targetJids?: string[]
  ): Promise<{ success: boolean; messageKeys: Record<string, proto.IMessageKey> }> {
    const destinations = (targetJids || this.config.destinationGroups || []).filter(
      (jid) => !event.matches?.some((m) => m.groupJid === jid)
    );
    const messageKeys: Record<string, proto.IMessageKey> = {};

    if (destinations.length === 0 || !this.sock) {
      return { success: false, messageKeys };
    }

    let sentAny = false;

    for (const jid of destinations) {
      const template = (this.config.groupTemplates as any)?.[jid];
      const messageText = this.formatResult(event, template);

      try {
        const sentMsg = await this.sock.sendMessage(jid, { text: messageText });
        if (sentMsg?.key) {
          messageKeys[jid] = sentMsg.key;
        }
        logger.info(
          { jid, market: event.marketName, value: event.value, isVerified: event.isVerified, keyId: sentMsg?.key?.id },
          '🚀 Result forwarded to WhatsApp destination group'
        );
        sentAny = true;
      } catch (err) {
        logger.error(
          { err, jid },
          'Failed to send result to WhatsApp destination group'
        );
      }
    }

    return { success: sentAny, messageKeys };
  }

  /**
   * Edits previously published WhatsApp messages in-place
   */
  public async editVerifiedEvent(
    keys: Record<string, proto.IMessageKey>,
    event: VerifiedPayloadEvent
  ): Promise<{ success: boolean; messageKeys: Record<string, proto.IMessageKey> }> {
    if (!this.sock) {
      return { success: false, messageKeys: keys };
    }

    const updatedKeys: Record<string, proto.IMessageKey> = { ...keys };
    let editedAny = false;

    for (const [jid, key] of Object.entries(keys)) {
      const template = (this.config.groupTemplates as any)?.[jid];
      const messageText = this.formatResult(event, template);

      try {
        const sentMsg = await this.sock.sendMessage(jid, {
          text: messageText,
          edit: key,
        });
        if (sentMsg?.key) {
          updatedKeys[jid] = sentMsg.key;
        }
        logger.info(
          { jid, market: event.marketName, value: event.value, keyId: key.id },
          'Successfully edited and upgraded WhatsApp message in-place to verified'
        );
        editedAny = true;
      } catch (err: any) {
        logger.warn(
          { err: err?.message || err, jid, keyId: key.id },
          'Failed to edit WhatsApp message in-place, sending new message'
        );
        try {
          const sentMsg = await this.sock.sendMessage(jid, { text: messageText });
          if (sentMsg?.key) updatedKeys[jid] = sentMsg.key;
          editedAny = true;
        } catch {
          // ignore
        }
      }
    }

    return { success: editedAny, messageKeys: updatedKeys };
  }

  /**
   * Deletes previously published WhatsApp messages for everyone
   */
  public async deleteMessages(
    keys: Record<string, proto.IMessageKey>
  ): Promise<boolean> {
    if (!this.sock) return false;
    let deletedAny = false;

    for (const [jid, key] of Object.entries(keys)) {
      try {
        await this.sock.sendMessage(jid, { delete: key });
        logger.info(
          { jid, keyId: key.id },
          '🗑️ Deleted unverified message from WhatsApp destination group'
        );
        deletedAny = true;
      } catch (err: any) {
        logger.warn(
          { err: err?.message || err, jid, keyId: key.id },
          'Failed to delete unverified message from WhatsApp group'
        );
      }
    }

    return deletedAny;
  }
}
