const API_KEY = 'CG-LCdqS2Gs8t9UEUHbKgoafQgd'; // CoinGecko public API (no key required)

const COIN_MAP = {
    "Bitcoin": { apiId: "bitcoin", jsonKey: "cleaned_coin_Bitcoin.csv" },
    "Ethereum": { apiId: "ethereum", jsonKey: "cleaned_coin_Ethereum.csv" },
    "Tether": { apiId: "tether", jsonKey: "cleaned_coin_Tether.csv" },
    "BinanceCoin": { apiId: "binancecoin", jsonKey: "cleaned_coin_BinanceCoin.csv" },
    "Solana": { apiId: "solana", jsonKey: "cleaned_coin_Solana.csv" },
    "XRP": { apiId: "ripple", jsonKey: "cleaned_coin_XRP.csv" },
    "Cardano": { apiId: "cardano", jsonKey: "cleaned_coin_Cardano.csv" },
    "Dogecoin": { apiId: "dogecoin", jsonKey: "cleaned_coin_Dogecoin.csv" },
    "Litecoin": { apiId: "litecoin", jsonKey: "cleaned_coin_Litecoin.csv" },
    "Monero": { apiId: "monero", jsonKey: "cleaned_coin_Monero.csv" },
    "Polkadot": { apiId: "polkadot", jsonKey: "cleaned_coin_Polkadot.csv" },
    "Cosmos": { apiId: "cosmos", jsonKey: "cleaned_coin_Cosmos.csv" },
    "Stellar": { apiId: "stellar", jsonKey: "cleaned_coin_Stellar.csv" },
    "ChainLink": { apiId: "chainlink", jsonKey: "cleaned_coin_ChainLink.csv" },
    "Uniswap": { apiId: "uniswap", jsonKey: "cleaned_coin_Uniswap.csv" },
    "Aave": { apiId: "aave", jsonKey: "cleaned_coin_Aave.csv" },
    "USDCoin": { apiId: "usd-coin", jsonKey: "cleaned_coin_USDCoin.csv" },
    "Tron": { apiId: "tron", jsonKey: "cleaned_coin_Tron.csv" },
    "Iota": { apiId: "iota", jsonKey: "cleaned_coin_Iota.csv" },
    "NEM": { apiId: "nem", jsonKey: "cleaned_coin_NEM.csv" },
    "EOS": { apiId: "eos", jsonKey: "cleaned_coin_EOS.csv" },
    "CryptocomCoin": { apiId: "crypto-com-coin", jsonKey: "cleaned_coin_CryptocomCoin.csv" },
    "WrappedBitcoin": { apiId: "wrapped-bitcoin", jsonKey: "cleaned_coin_WrappedBitcoin.csv" }
};

// --- SCALING ENGINE (Replicating Python StandardScaler) ---
function getStats(array) {
    const validData = array.map(Number).filter(x => !isNaN(x));
    const n = validData.length;
    if (n === 0) return { mean: 0, std: 1 };
    const mean = validData.reduce((a, b) => a + b) / n;
    const std = Math.sqrt(validData.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / n);
    return { mean, std: std || 1 };
}

// --- GLOBAL CHART INSTANCE & DATA ---
let priceChart = null;
let currentFeatures = {}; // Store current features for display

// --- FEATURE ENGINEERING FUNCTIONS ---
function calculateVolatility(prices, window = 5) {
    if (prices.length < window) return 0;
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
        returns.push((prices[i] - prices[i-1]) / prices[i-1]);
    }
    const recentReturns = returns.slice(-window);
    const mean = recentReturns.reduce((a, b) => a + b) / recentReturns.length;
    const variance = recentReturns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / recentReturns.length;
    return Math.sqrt(variance);
}

function calculateEMA(prices, span) {
    if (prices.length < 2) return prices[prices.length - 1];
    const k = 2 / (span + 1);
    let ema = prices[0];
    for (let i = 1; i < prices.length; i++) {
        ema = prices[i] * k + ema * (1 - k);
    }
    return ema;
}

function calculateSMA(prices, window) {
    if (prices.length < window) return prices[prices.length - 1];
    const slice = prices.slice(-window);
    return slice.reduce((a, b) => a + b) / slice.length;
}

function calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) return 50;
    const changes = [];
    for (let i = 1; i < prices.length; i++) {
        changes.push(prices[i] - prices[i-1]);
    }
    const gains = changes.slice(-period).filter(c => c > 0).reduce((a, b) => a + b, 0) / period;
    const losses = Math.abs(changes.slice(-period).filter(c => c < 0).reduce((a, b) => a + b, 0)) / period;
    const rs = gains / (losses + 1e-10);
    return 100 - (100 / (1 + rs));
}

function engineerFeatures(ohlcData, volumeData) {
    const prices = ohlcData.map(d => d[4]); // Close prices
    const volumes = volumeData.map(v => (Array.isArray(v) ? v[1] : v));
    
    const volatility5d = calculateVolatility(prices, 5);
    const returns1d = prices.length > 1 ? (prices[prices.length - 1] - prices[prices.length - 2]) / prices[prices.length - 2] : 0;
    const ema12 = calculateEMA(prices, 12);
    const ema26 = calculateEMA(prices, 26);
    const sma5 = calculateSMA(prices, 5);
    const sma7 = calculateSMA(prices, 7);
    const volumeSma5 = calculateSMA(volumes, 5);
    const rsiMomentum = calculateRSI(prices, 14);
    const priceToSma5 = prices[prices.length - 1] / (sma5 + 1e-10);
    const volumeRatio5 = volumes[volumes.length - 1] / (volumeSma5 + 1e-10);
    
    return {
        volatility_5d: volatility5d,
        returns_1d: returns1d,
        ema_12: ema12,
        ema_26: ema26,
        sma_5: sma5,
        sma_7: sma7,
        volume_sma_5: volumeSma5,
        rsi_momentum: rsiMomentum,
        price_to_sma5: priceToSma5,
        volume_ratio_5: volumeRatio5
    };
}

// Calculate features at a specific time index using only historical data
function engineerFeaturesAtIndex(ohlcData, volumeData, index) {
    const pricesUpTo = ohlcData.slice(0, index + 1).map(d => d[4]); // Close prices up to this point
    const volumesUpTo = volumeData.slice(0, index + 1).map(v => (Array.isArray(v) ? v[1] : v));
    
    const volatility5d = calculateVolatility(pricesUpTo, 5);
    const returns1d = pricesUpTo.length > 1 ? (pricesUpTo[pricesUpTo.length - 1] - pricesUpTo[pricesUpTo.length - 2]) / pricesUpTo[pricesUpTo.length - 2] : 0;
    const ema12 = calculateEMA(pricesUpTo, 12);
    const ema26 = calculateEMA(pricesUpTo, 26);
    const sma5 = calculateSMA(pricesUpTo, 5);
    const sma7 = calculateSMA(pricesUpTo, 7);
    const volumeSma5 = calculateSMA(volumesUpTo, 5);
    const rsiMomentum = calculateRSI(pricesUpTo, 14);
    const priceToSma5 = pricesUpTo[pricesUpTo.length - 1] / (sma5 + 1e-10);
    const volumeRatio5 = volumesUpTo[volumesUpTo.length - 1] / (volumeSma5 + 1e-10);
    
    return {
        volatility_5d: volatility5d,
        returns_1d: returns1d,
        ema_12: ema12,
        ema_26: ema26,
        sma_5: sma5,
        sma_7: sma7,
        volume_sma_5: volumeSma5,
        rsi_momentum: rsiMomentum,
        price_to_sma5: priceToSma5,
        volume_ratio_5: volumeRatio5
    };
}

async function updateDashboard() {
    const selectedName = document.getElementById('coinSelect').value;
    const config = COIN_MAP[selectedName];
    const threshold = 0.5;

    try {
        // Fetching 30 days of data directly from CoinGecko (public API, no key needed)
        const mUrl = `https://api.coingecko.com/api/v3/coins/${config.apiId}/market_chart?vs_currency=usd&days=30&interval=daily`;
        const oUrl = `https://api.coingecko.com/api/v3/coins/${config.apiId}/ohlc?vs_currency=usd&days=30`;
        
        const [mRes, oRes, wRes] = await Promise.all([fetch(mUrl), fetch(oUrl), fetch('data.json')]);

        if (!mRes.ok) throw new Error(`Market Chart API Error: ${mRes.status}`);
        if (!oRes.ok) throw new Error(`OHLC API Error: ${oRes.status}`);
        if (!wRes.ok) throw new Error(`data.json fetch error: ${wRes.status}`);

        const histData = await mRes.json();
        const ohlcRaw = await oRes.json();
        const allWeights = await wRes.json();
        
        // Handle both direct array and wrapped object
        const ohlcData = Array.isArray(ohlcRaw) ? ohlcRaw : ohlcRaw.ohlc || ohlcRaw.ohlcv || [];
        
        const weights = allWeights.weights.find(w => w.file === config.jsonKey);

        if (!weights) throw new Error(`No weights found for ${config.jsonKey}`);

        // Defensive guards
        if (!ohlcData || !Array.isArray(ohlcData) || ohlcData.length < 30) {
            throw new Error(`Insufficient OHLC data: got ${ohlcData?.length || 0} rows (need 30 for features)`);
        }

        const volumeData = histData.total_volumes || histData.prices || [];
        if (!volumeData || volumeData.length === 0) {
            throw new Error("No volume data available");
        }

        // 1. Engineer Advanced Features (only for current display)
        const currentAdvFeatures = engineerFeatures(ohlcData, volumeData);
        currentFeatures = currentAdvFeatures;

        // 2. Calculate Scaling Stats (StandardScaler Replication)
        const priceStats = getStats(ohlcData.map(d => d[4])); 
        const volStats = getStats(volumeData.map(v => (Array.isArray(v) ? v[1] : v)));

        // 3. 3/5 train - 2/5 test split (matching notebook approach)
        const n = ohlcData.length;
        const splitIdx = Math.floor((3 * n) / 5);
        let correct = 0;
        let totalTests = 0;
        
        for (let i = splitIdx; i < ohlcData.length - 1; i++) {
            const day = ohlcData[i];
            const nextDay = ohlcData[i + 1];
            
            const volValue = volumeData[i] ? (Array.isArray(volumeData[i]) ? volumeData[i][1] : volumeData[i]) : 0;
            
            const z = {
                open: (day[1] - priceStats.mean) / priceStats.std,
                high: (day[2] - priceStats.mean) / priceStats.std,
                low: (day[3] - priceStats.mean) / priceStats.std,
                close: (day[4] - priceStats.mean) / priceStats.std,
                volume: (volValue - volStats.mean) / volStats.std
            };

            // Calculate features at this specific time point (using only historical data)
            const advFeaturesAtTime = engineerFeaturesAtIndex(ohlcData, volumeData, i);

            let logit = (weights.intercept || 0) + 
                        (z.open * (weights.w_open || 0)) + 
                        (z.high * (weights.w_high || 0)) + 
                        (z.low * (weights.w_low || 0)) + 
                        (z.close * (weights.w_close || 0)) + 
                        (z.volume * (weights.w_volume || 0));
            
            // Add advanced feature weights (calculated from historical data only)
            logit += (advFeaturesAtTime.volatility_5d * (weights.w_volatility_5d || 0));
            logit += (advFeaturesAtTime.returns_1d * (weights.w_returns_1d || 0));
            logit += (advFeaturesAtTime.ema_12 * (weights.w_ema_12 || 0));
            logit += (advFeaturesAtTime.ema_26 * (weights.w_ema_26 || 0));
            logit += (advFeaturesAtTime.sma_5 * (weights.w_sma_5 || 0));
            logit += (advFeaturesAtTime.sma_7 * (weights.w_sma_7 || 0));
            logit += (advFeaturesAtTime.volume_sma_5 * (weights.w_volume_sma_5 || 0));
            logit += (advFeaturesAtTime.rsi_momentum * (weights.w_rsi_momentum || 0));
            logit += (advFeaturesAtTime.price_to_sma5 * (weights.w_price_to_sma5 || 0));
            logit += (advFeaturesAtTime.volume_ratio_5 * (weights.w_volume_ratio_5 || 0));
            
            const pred = (1 / (1 + Math.exp(-Math.max(-500, Math.min(500, logit))))) > 0.5 ? 1 : 0;
            const actual = ((nextDay[4] - day[4]) / day[4]) > threshold ? 1 : 0;

            if (pred === actual) correct++;
            totalTests++;
        }

        const accuracy = totalTests > 0 ? (correct / totalTests) * 100 : 0;

        // 4. Final Prediction for Today
        const current = ohlcData[ohlcData.length - 1];
        const currentVol = volumeData[volumeData.length - 1];
        const currentVolValue = Array.isArray(currentVol) ? currentVol[1] : currentVol;
        
        let finalZ = (weights.intercept || 0) + 
            ((current[1] - priceStats.mean) / priceStats.std * (weights.w_open || 0)) + 
            ((current[2] - priceStats.mean) / priceStats.std * (weights.w_high || 0)) + 
            ((current[3] - priceStats.mean) / priceStats.std * (weights.w_low || 0)) + 
            ((current[4] - priceStats.mean) / priceStats.std * (weights.w_close || 0)) + 
            ((currentVolValue - volStats.mean) / volStats.std * (weights.w_volume || 0));

        // Add advanced features to final prediction
        finalZ += (currentAdvFeatures.volatility_5d * (weights.w_volatility_5d || 0));
        finalZ += (currentAdvFeatures.returns_1d * (weights.w_returns_1d || 0));
        finalZ += (currentAdvFeatures.ema_12 * (weights.w_ema_12 || 0));
        finalZ += (currentAdvFeatures.ema_26 * (weights.w_ema_26 || 0));
        finalZ += (currentAdvFeatures.sma_5 * (weights.w_sma_5 || 0));
        finalZ += (currentAdvFeatures.sma_7 * (weights.w_sma_7 || 0));
        finalZ += (currentAdvFeatures.volume_sma_5 * (weights.w_volume_sma_5 || 0));
        finalZ += (currentAdvFeatures.rsi_momentum * (weights.w_rsi_momentum || 0));
        finalZ += (currentAdvFeatures.price_to_sma5 * (weights.w_price_to_sma5 || 0));
        finalZ += (currentAdvFeatures.volume_ratio_5 * (weights.w_volume_ratio_5 || 0));

        const clippedZ = Math.max(-500, Math.min(500, finalZ));
        const result = (1 / (1 + Math.exp(-clippedZ))) > 0.5 ? "UP" : "DOWN";

        // 5. Update UI
        document.getElementById('price').innerText = `$${current[4].toFixed(2)}`;
        document.getElementById('accuracy-display').innerText = `Test Set Accuracy: ${accuracy.toFixed(1)}%`;
        
        const predEl = document.getElementById('prediction');
        predEl.innerText = result;
        predEl.style.color = result === "UP" ? "#22c55e" : "#ef4444";

        // 6. Update Feature Metrics Panel
        updateFeatureMetrics(currentAdvFeatures);

        // 7. Render Price Chart
        renderChart(ohlcData, current[4]);

    } catch (err) {
        console.error("Dashboard Error:", err);
        document.getElementById('accuracy-display').innerText = `❌ ${err.message}`;
        document.getElementById('prediction').innerText = "?";
        document.getElementById('prediction').style.color = "#94a3b8";
    }
}

window.onload = updateDashboard;
document.getElementById('coinSelect').addEventListener('change', updateDashboard);

// --- UPDATE FEATURE METRICS PANEL ---
function updateFeatureMetrics(features) {
    const panel = document.getElementById('features-panel');
    if (!panel) return;
    
    const featureTitles = {
        volatility_5d: '5d Volatility',
        returns_1d: '1d Returns',
        ema_12: 'EMA 12',
        ema_26: 'EMA 26',
        sma_5: 'SMA 5',
        sma_7: 'SMA 7',
        volume_sma_5: 'Vol SMA 5',
        rsi_momentum: 'RSI',
        price_to_sma5: 'Price/SMA5',
        volume_ratio_5: 'Vol Ratio'
    };
    
    let html = '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px;">';
    
    for (const [key, value] of Object.entries(features)) {
        const title = featureTitles[key] || key;
        const displayVal = typeof value === 'number' ? value.toFixed(4) : value;
        const color = value > 0 ? '#10b981' : '#ef4444';
        html += `<div style="padding: 4px; background: rgba(148, 163, 184, 0.1); border-radius: 4px; border-left: 2px solid ${color};">
                    <div style="color: #94a3b8; margin-bottom: 2px;">${title}</div>
                    <div style="color: ${color}; font-weight: bold;">${displayVal}</div>
                 </div>`;
    }
    
    html += '</div>';
    panel.innerHTML = html;
}

// --- CHART RENDERING ---
function renderChart(ohlcData, currentPrice) {
    const ctx = document.getElementById('priceChart');
    if (!ctx) return;
    
    const labels = ohlcData.map((_, i) => i - ohlcData.length + 1); // -30, -29, ..., -1
    const prices = ohlcData.map(d => d[4]); // Close prices
    
    if (priceChart) priceChart.destroy();
    
    priceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Close Price (USD)',
                data: prices,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.3,
                pointRadius: 2,
                pointBackgroundColor: '#3b82f6'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    grid: { color: 'rgba(148, 163, 184, 0.1)' },
                    ticks: { color: '#cbd5e1' }
                },
                x: {
                    grid: { color: 'rgba(148, 163, 184, 0.1)' },
                    ticks: { color: '#cbd5e1' }
                }
            }
        }
    });
}