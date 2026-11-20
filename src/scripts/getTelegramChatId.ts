import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

async function getChatId() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('❌ TELEGRAM_BOT_TOKEN is missing in .env');
    process.exit(1);
  }

  console.log('\n======================================================');
  console.log('🤖 TELEGRAM CHAT ID DETECTOR');
  console.log('======================================================\n');
  console.log('1. Add @impactcreatorpersonalbot to your Telegram Group / Channel as an Admin');
  console.log('2. Send any test message (e.g. "hello") in the group/channel');
  console.log('3. Checking for incoming updates...\n');

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
    const data: any = await res.json();

    if (!data.ok || !data.result || data.result.length === 0) {
      console.log('⏳ No messages found yet.');
      console.log('👉 Please send a message in your Telegram group or channel now, then run this command again.');
      return;
    }

    console.log(`Found ${data.result.length} update(s):\n`);
    const foundChats = new Map<string | number, { title: string; type: string }>();

    for (const update of data.result) {
      const chat =
        update.message?.chat ||
        update.channel_post?.chat ||
        update.my_chat_member?.chat;

      if (chat) {
        foundChats.set(chat.id, {
          title: chat.title || chat.username || chat.first_name || 'Direct Chat',
          type: chat.type,
        });
      }
    }

    if (foundChats.size > 0) {
      console.log('-------------------------------------------------------------------------------');
      console.log(`${'Chat / Channel Name'.padEnd(35)} | ${'Type'.padEnd(12)} | ${'Chat ID'}`);
      console.log('-------------------------------------------------------------------------------');

      let lastId: string | number = '';
      for (const [id, info] of foundChats.entries()) {
        console.log(`${info.title.slice(0, 35).padEnd(35)} | ${info.type.padEnd(12)} | ${id}`);
        lastId = id;
      }
      console.log('-------------------------------------------------------------------------------');

      // Offer to auto-update .env if only one group found
      if (foundChats.size === 1) {
        const envPath = path.resolve(process.cwd(), '.env');
        if (fs.existsSync(envPath)) {
          let envContent = fs.readFileSync(envPath, 'utf-8');
          envContent = envContent.replace(
            /TELEGRAM_CHAT_ID=.*/,
            `TELEGRAM_CHAT_ID=${lastId}`
          );
          fs.writeFileSync(envPath, envContent);
          console.log(`\n✅ Automatically updated TELEGRAM_CHAT_ID=${lastId} in your .env file!\n`);
        }
      } else {
        console.log(`\n👉 Copy the desired Chat ID above and paste it into your .env file for TELEGRAM_CHAT_ID.\n`);
      }
    }
  } catch (err) {
    console.error('Error contacting Telegram API:', err);
  }
}

getChatId();
