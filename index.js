const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const input = require('input');
const pino = require('pino');

// ⚠️ আপনার my.telegram.org থেকে পাওয়া credentials
const apiId = 24982795; 
const apiHash = '631f7e84da50529b17b128c56d342c6a'; // আপনার পুরো apiHash-টি এখানে দিন

const stringSession = new StringSession(''); // প্রথমবার ফাঁকা থাকবে

const WHATSAPP_GROUP_NAME = 'Moto Charm Ring Order';
const TELEGRAM_ERP_BOT_USERNAME = 'motocharm_order_create_bot'; // ERP Bot-এর ইউজারনেম (@ ছাড়া)

const normalizeText = (str) => str ? str.replace(/\s+/g, ' ').trim().toLowerCase() : '';

async function startApp() {
    console.log('Connecting to Telegram User Account...');
    const client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5,
    });

    // Telegram User Account Login
    await client.start({
        phoneNumber: async () => await input.text('Please enter your Telegram phone number (+880...): '),
        password: async () => await input.text('Please enter your password (if 2FA enabled): '),
        phoneCode: async () => await input.text('Please enter the code you received on Telegram: '),
        onError: (err) => console.log(err),
    });

    console.log('✅ Telegram User Connected Successfully!');
    console.log('Session String (Keep this safe):', client.session.save());

    // WhatsApp Connection
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