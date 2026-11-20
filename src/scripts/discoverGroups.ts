import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import { loadConfig } from '../config.js';

async function discoverGroups() {
  console.log('\n======================================================');
  console.log('🔍 WHATSAPP GROUP DISCOVERY TOOL');
  console.log('======================================================\n');
  console.log('Connecting to WhatsApp servers...\n');

  const config = loadConfig();
  const { state, saveCreds } = await useMultiFileAuthState(config.whatsapp.authDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    syncFullHistory: false,
    markOnlineOnConnect: false,
    logger: pino({ level: 'silent' }),
  });

  sock.ev.on('creds.update', saveCreds);

  let pairingCodeRequested = false;

  // If pairing code mode is enabled, wait 3.5s for WebSocket handshake before requesting
  if (config.whatsapp.phoneNumber && !sock.authState.creds.registered) {
    setTimeout(async () => {
      if (pairingCodeRequested || sock.authState.creds.registered) return;
      pairingCodeRequested = true;
      try {
        const cleanPhone = config.whatsapp.phoneNumber!.replace(/[^0-9]/g, '');
        console.log(`\n⏳ Requesting pairing code for +${cleanPhone}...`);
        const code = await sock.requestPairingCode(cleanPhone);
        console.log('\n╔═══════════════════════════════════════════════════════╗');
        console.log(`║  🔑 YOUR WHATSAPP PAIRING CODE: ${code.padEnd(20)} ║`);
        console.log('╚═══════════════════════════════════════════════════════╝');
        console.log('📱 On your phone: WhatsApp > Settings > Linked Devices > Link a Device > Link with phone number instead\n');
      } catch (err: any) {
        console.log('⚠️ Pairing code request notice:', err?.message || err);
        console.log('📱 You can also scan the QR code below:\n');
      }
    }, 3500);
  }

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n📱 WhatsApp QR Code:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      console.log('\n✅ Connected! Fetching all participating groups...\n');

      try {
        const groupList = await sock.groupFetchAllParticipating();
        const entries = Object.values(groupList);

        if (entries.length === 0) {
          console.log('⚠️ No groups found for this account.');
        } else {
          console.log(`Found ${entries.length} group(s):\n`);
          console.log('-------------------------------------------------------------------------------');
          console.log(
            `${'#'.padEnd(4)} | ${'Group Name'.padEnd(35)} | ${'Group JID (Use in config.json)'}`
          );
          console.log('-------------------------------------------------------------------------------');

          entries.forEach((grp, idx) => {
            const indexStr = `${idx + 1}`.padEnd(4);
            const nameStr = (grp.subject || 'Unnamed').slice(0, 35).padEnd(35);
            console.log(`${indexStr} | ${nameStr} | ${grp.id}`);
          });

          console.log('-------------------------------------------------------------------------------');
          console.log('\n💡 Copy the Group JIDs above and add them into your config.json sourceGroups array.\n');
        }
      } catch (err) {
        console.error('Error fetching groups:', err);
      } finally {
        setTimeout(() => {
          process.exit(0);
        }, 1000);
      }
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      if (statusCode === DisconnectReason.loggedOut) {
        console.error('Logged out. Please delete auth directory and re-authenticate.');
        process.exit(1);
      }
    }
  });
}

discoverGroups().catch(console.error);
