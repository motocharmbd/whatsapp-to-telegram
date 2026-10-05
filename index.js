const http = require('http');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const input = require('input');
const pino = require('pino');

// 🌐 Render Web Service-এর জন্য Dummy HTTP Port (নিশ্চিত করে Render সার্ভার রান রাখবে)
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('WhatsApp to Telegram Bot is active and running 24/7!');
}).listen(process.env.PORT || 3000, () => {
    console.log(`Server is listening on port ${process.env.PORT || 3000}`);
});

// ⚠️ Telegram API Credentials
const apiId = 24982795; 
const apiHash = '631f7e84da50529b17b128c56d342c6a'; 

// 🔑 আপনার Local / Codespaces-এ জেনারেট হওয়া Telegram Session String-টি এককোটেশনের ('') ভেতরে বসান
const SESSION_STRING = 'PASTE_YOUR_STRING_SESSION_HERE'; 
const stringSession = new StringSession(SESSION_STRING);

const WHATSAPP_GROUP_NAME = 'Moto Charm Ring Order';
const TELEGRAM_ERP_BOT_USERNAME = 'motocharm_order_create_bot'; // ERP Bot-এর ইউজারনেম (@ ছাড়া)

const normalizeText = (str) => str ? str.replace(/\s+/g, ' ').trim().toLowerCase() : '';

async function startApp() {
    console.log('Connecting to Telegram User Account...');
    
    const client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5,
    });

    // Session String থাকলে অটোমেটিক লগইন হবে, ইনপুট প্রম্পট চাইবে না
    if (SESSION_STRING && SESSION_STRING.trim() !== '') {
        await client.connect();
        console.log('✅ Telegram User Connected via Session String!');
    } else {
        // শুধু প্রথমবার Local / Codespaces-এ চালানোর সময়
        await client.start({
            phoneNumber: async () => await input.text('Please enter your Telegram phone number (+880...): '),
            password: async () => await input.text('Please enter your password (if 2FA enabled): '),
            phoneCode: async () => await input.text('Please enter the code you received on Telegram: '),
            onError: (err) => console.log(err),
        });
        console.log('✅ Telegram User Connected Successfully!');
        console.log('\n--- YOUR SESSION STRING (Copy & Save In Code) ---');
        console.log(client.session.save());
        console.log('--------------------------------------------------\n');
    }

    // WhatsApp Connection Setup
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();
    const logger = pino({ level: 'silent' });

    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        logger,
        printQRInTerminal: true,
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        keepAliveIntervalMs: 30000,
        getMessage: async () => ({ conversation: '' })
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const statusCode = (lastDisconnect?.error)?.output?.statusCode;
            if (statusCode !== DisconnectReason.loggedOut) {
                setTimeout(() => startApp(), 3000);
            }
        } else if (connection === 'open') {
            console.log('✅ WhatsApp Connected Successfully!');
            console.log(`Listening for group: "${WHATSAPP_GROUP_NAME}"`);
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type === 'notify') {
            for (const msg of messages) {
                if (msg.key.remoteJid && msg.key.remoteJid.endsWith('@g.us')) {
                    try {
                        const groupMetadata = await sock.groupMetadata(msg.key.remoteJid);
                        if (normalizeText(groupMetadata.subject) === normalizeText(WHATSAPP_GROUP_NAME)) {
                            const messageText = msg.message?.conversation || 
                                                msg.message?.extendedTextMessage?.text || 
                                                msg.message?.imageMessage?.caption;

                            if (messageText) {
                                let finalMessage = messageText;
                                if (!messageText.toLowerCase().includes('mod=')) {
                                    const senderName = msg.pushName || "Moderator";
                                    finalMessage = `${messageText}\nmod=${senderName}`;
                                }

                                // Telegram User Account থেকে ERP Bot-এ মেসেজ সেন্ড
                                await client.sendMessage(TELEGRAM_ERP_BOT_USERNAME, { message: finalMessage });
                                console.log('🚀 Order sent to ERP Bot from User Account!');
                            }
                        }
                    } catch (err) {
                        // Suppress errors
                    }
                }
            }
        }
    });
}

startApp();
