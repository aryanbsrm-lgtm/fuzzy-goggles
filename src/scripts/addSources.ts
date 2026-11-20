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

const links = process.argv.slice(2);

if (links.length === 0) {
  console.log('Usage: npm run add-sources "<link1>" "<link2>" ...');
  process.exit(0);
}

async function addSources() {
  console.log('\n======================================================');
  console.log('🔗 BATCH SOURCE RESOLVER (GROUPS & CHANNELS)');
  console.log('======================================================\n');

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
        }
      }

      if (connection === 'open') {
        isDone = true;
        console.log('✅ Connected to WhatsApp. Processing source links...\n');

        const configPath = path.resolve(process.cwd(), 'config.json');
        let conf: any = {};
        if (fs.existsSync(configPath)) {
          conf = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        }
        if (!conf.whatsapp) conf.whatsapp = {};
        if (!conf.whatsapp.sourceGroups) conf.whatsapp.sourceGroups = [];
        if (!conf.whatsapp.groupAliases) conf.whatsapp.groupAliases = {};

        for (const rawLink of links) {
          const trimmed = rawLink.trim();
          console.log(`------------------------------------------------------`);
          console.log(`Processing: ${trimmed}`);

          // Check if Group link (chat.whatsapp.com)
          const groupMatch = trimmed.match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/i);
          // Check if Channel link (whatsapp.com/channel)
          const channelMatch = trimmed.match(/whatsapp\.com\/channel\/([A-Za-z0-9_-]+)/i);

          if (channelMatch && channelMatch[1]) {
            const code = channelMatch[1];
            try {
              const meta: any = await (sock as any).newsletterMetadata('invite', code);
              if (meta && meta.id) {
                const jid = meta.id;
                const name = meta.name || 'WhatsApp Channel';
                console.log(`📢 [CHANNEL FOUND] "${name}" -> ${jid}`);

                try {
                  await (sock as any).newsletterFollow(jid);
                  console.log(`   📡 Auto-followed channel.`);
                } catch {
                  // already followed
                }

                if (!conf.whatsapp.sourceGroups.includes(jid)) {
                  conf.whatsapp.sourceGroups.push(jid);
                }
                conf.whatsapp.groupAliases[jid] = name;
              } else {
                console.log(`❌ Could not resolve channel invite: ${code}`);
              }
            } catch (err: any) {
              console.log(`❌ Channel error: ${err?.message || err}`);
            }
          } else if (groupMatch && groupMatch[1]) {
            const code = groupMatch[1];
            try {
              const groupInfo = await sock.groupGetInviteInfo(code);
              const jid = groupInfo.id;
              const name = groupInfo.subject || 'WhatsApp Group';
              console.log(`👥 [GROUP FOUND] "${name}" -> ${jid}`);

              // Join group if not already in it
              try {
                const joinedJid = await sock.groupAcceptInvite(code);
                console.log(`   🤝 Auto-joined group.`);
              } catch (e: any) {
                console.log(`   ℹ️ (Already a member or invite processed)`);
              }

              if (!conf.whatsapp.sourceGroups.includes(jid)) {
                conf.whatsapp.sourceGroups.push(jid);
              }
              conf.whatsapp.groupAliases[jid] = name;
            } catch (err: any) {
              console.log(`❌ Group invite error: ${err?.message || err}`);
            }
          } else if (trimmed.endsWith('@newsletter') || trimmed.endsWith('@g.us')) {
            if (!conf.whatsapp.sourceGroups.includes(trimmed)) {
              conf.whatsapp.sourceGroups.push(trimmed);
            }
            console.log(`📌 Direct JID added: ${trimmed}`);
          } else {
            console.log(`⚠️ Unrecognized link format: ${trimmed}`);
          }
        }

        // Save updated config
        fs.writeFileSync(configPath, JSON.stringify(conf, null, 2));
        console.log(`\n======================================================`);
        console.log(`🎉 Finished! Updated config.json with ${conf.whatsapp.sourceGroups.length} source(s).`);
        console.log(`======================================================\n`);

        setTimeout(() => process.exit(0), 1000);
      }
    });

    return sock;
  }

  startSocket().catch(console.error);
}

addSources().catch(console.error);
