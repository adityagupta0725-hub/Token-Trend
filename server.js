const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
const PORT = 3000;
const API_KEY = 'CG-LCdqS2Gs8t9UEUHbKgoafQgd'; // Replace if needed

app.use(cors());
app.use(express.static('.'));

// Proxy API endpoint
app.get('/api/market/:coinId', async (req, res) => {
    try {
        const { coinId } = req.params;
        const days = req.query.days || 30;
        
        const url = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=${days}&interval=daily&x_cg_demo_api_key=${API_KEY}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            return res.status(response.status).json({ error: 'CoinGecko API Error' });
        }
        
        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error('Market API Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Proxy OHLC endpoint
app.get('/api/ohlc/:coinId', async (req, res) => {
    try {
        const { coinId } = req.params;
        const days = req.query.days || 30;
        
        const url = `https://api.coingecko.com/api/v3/coins/${coinId}/ohlc?vs_currency=usd&days=${days}&x_cg_demo_api_key=${API_KEY}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            return res.status(response.status).json({ error: 'CoinGecko API Error' });
        }
        
        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error('OHLC API Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Weights endpoint
app.get('/api/weights', (req, res) => {
    try {
        const data = fs.readFileSync('data.json', 'utf8');
        res.json(JSON.parse(data));
    } catch (err) {
        console.error('Weights Error:', err);
        res.status(500).json({ error: 'Failed to load weights' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Token Trend API running on http://localhost:${PORT}`);
    console.log(`📊 Open http://localhost:${PORT} in your browser`);
});
