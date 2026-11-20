import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  WASocket,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { loadConfig } from '../config.js';

async function resolveChannel() {
  const input = process.argv[2];

  console.log('\n======================================================');
  console.log('📢 WHATSAPP CHANNEL RESOLVER');
  console.log('======================================================\n');

  if (!input) {
    console.log('Usage:');
    console.log('  npm run add-channel "<channel_invite_link_or_code>"\n');
    console.log('Examples:');
    console.log('  npm run add-channel "https://whatsapp.com/channel/0029VbC2Vz0D38CNWxTtKg2L"');
    console.log('  npm run add-channel "0029VbC2Vz0D38CNWxTtKg2L"\n');
    process.exit(0);
  }

  let inviteCode = input.trim();
  const match = input.match(/whatsapp\.com\/channel\/([A-Za-z0-9_-]+)/i);
  if (match && match[1]) {
    inviteCode = match[1];
  }

  console.log(`Connecting to WhatsApp to resolve channel: ${input} ...\n`);

  const config = loadConfig();
  const { state, saveCreds } = await useMultiFileAuthState(config.whatsapp.authDir);
  const { version } = await fetchLatestBaileysVersion();

  let isDone = false;
  let isReconnecting = false;

  async function startSocket(): Promise<WASocket> {
    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      browser: ['Mac OS', 'Chrome', '10.15.7'],
      syncFullHistory: false,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === 'close') {
        if (isDone) return;
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        if (shouldReconnect && !isReconnecting) {
          isReconnecting = true;
          setTimeout(() => {
            isReconnecting = false;
            startSocket();
          }, 3000);
        } else if (statusCode === DisconnectReason.loggedOut) {
          console.error('❌ Session logged out. Please re-authenticate.');
          process.exit(1);
        }
      }

      if (connection === 'open') {
        isDone = true;
        try {
          console.log(`🔍 Querying channel metadata for: ${inviteCode} ...\n`);

          let metadata: any;
          if (inviteCode.endsWith('@newsletter')) {
            metadata = await (sock as any).newsletterMetadata('jid', inviteCode);
          } else {
            metadata = await (sock as any).newsletterMetadata('invite', inviteCode);
          }

          if (!metadata || !metadata.id) {
            console.log('❌ Could not find channel with that invite code or link.');
          } else {
            const jid = metadata.id;
            const name = metadata.name || 'Unnamed Channel';

            console.log('✅ Channel Found!');
            console.log('------------------------------------------------------');
            console.log(`📌 Name:        ${name}`);
            console.log(`🆔 Channel JID: ${jid}`);
            console.log('------------------------------------------------------\n');

            // Follow channel if not already followed
            try {
              if (typeof (sock as any).newsletterFollow === 'function') {
                await (sock as any).newsletterFollow(jid);
                console.log(`📡 Successfully followed channel: "${name}"`);
              }
            } catch {
              // already followed
            }

            // Save to config.json
            const configPath = path.resolve(process.cwd(), 'config.json');
            if (fs.existsSync(configPath)) {
              const raw = fs.readFileSync(configPath, 'utf-8');
              const conf = JSON.parse(raw);
              if (!conf.whatsapp) conf.whatsapp = {};
              if (!conf.whatsapp.sourceGroups) conf.whatsapp.sourceGroups = [];
              if (!conf.whatsapp.groupAliases) conf.whatsapp.groupAliases = {};

              if (!conf.whatsapp.sourceGroups.includes(jid)) {
                conf.whatsapp.sourceGroups.push(jid);
              }
              conf.whatsapp.groupAliases[jid] = name;

              fs.writeFileSync(configPath, JSON.stringify(conf, null, 2));
              console.log(`🎉 Added "${name}" (${jid}) to config.json!\n`);
            }
          }
        } catch (err: any) {
          console.error('Error querying channel:', err?.message || err);
        } finally {
          setTimeout(() => {
            process.exit(0);
          }, 1500);
        }
      }
    });

    return sock;
  }

  startSocket().catch(console.error);
}

resolveChannel().catch(console.error);
