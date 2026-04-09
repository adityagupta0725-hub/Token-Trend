const API_KEY = 'CG-LCdqS2Gs8t9UEUHbKgoafQgd'; // Replace with your CoinGecko Demo Key

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

async function updateDashboard() {
    const selectedName = document.getElementById('coinSelect').value;
    const config = COIN_MAP[selectedName];
    const threshold = 0.0233;

    try {
        // Fetching 30 days of data directly from CoinGecko (public API, CORS enabled)
        const mUrl = `https://api.coingecko.com/api/v3/coins/${config.apiId}/market_chart?vs_currency=usd&days=30&interval=daily&x_cg_demo_api_key=${API_KEY}`;
        const oUrl = `https://api.coingecko.com/api/v3/coins/${config.apiId}/ohlc?vs_currency=usd&days=30&x_cg_demo_api_key=${API_KEY}`;
        
        console.log('Fetching from:', oUrl);
        const [mRes, oRes, wRes] = await Promise.all([fetch(mUrl), fetch(oUrl), fetch('data.json')]);

        if (!mRes.ok) throw new Error(`Market Chart API Error: ${mRes.status}`);
        if (!oRes.ok) throw new Error(`OHLC API Error: ${oRes.status}`);
        if (!wRes.ok) throw new Error(`data.json fetch error: ${wRes.status}`);

        const histData = await mRes.json();
        const ohlcRaw = await oRes.json();
        const allWeights = await wRes.json();
        
        console.log('ohlcRaw:', ohlcRaw);
        console.log('allWeights keys:', Object.keys(allWeights));
        
        // Handle both direct array and wrapped object
        const ohlcData = Array.isArray(ohlcRaw) ? ohlcRaw : ohlcRaw.ohlc || ohlcRaw.ohlcv || [];
        
        const weights = allWeights.weights.find(w => w.file === config.jsonKey);

        if (!weights) throw new Error(`No weights found for ${config.jsonKey}. Available: ${allWeights.weights.map(w => w.file).join(', ')}`);

        // Debug: Log the API response structure
        console.log('histData keys:', Object.keys(histData));
        console.log('ohlcData length:', ohlcData.length);
        console.log('ohlcData sample:', ohlcData ? ohlcData.slice(0, 2) : 'undefined');
        console.log('weights:', weights);

        // Defensive guards
        if (!ohlcData || !Array.isArray(ohlcData) || ohlcData.length < 15) {
            throw new Error(`Insufficient OHLC data: got ${!ohlcData ? 'null' : !Array.isArray(ohlcData) ? 'not an array' : ohlcData.length + ' rows'}`);
        }

        // Fix: Use histData.prices if total_volumes is missing
        const volumeData = histData.total_volumes || histData.prices || [];
        if (!volumeData || volumeData.length === 0) {
            document.getElementById('accuracy-display').innerText = "No volume data available.";
            return;
        }

        // 1. Calculate Scaling Stats (StandardScaler Replication)
        const priceStats = getStats(ohlcData.map(d => d[4])); 
        const volStats = getStats(volumeData.map(v => (Array.isArray(v) ? v[1] : v)));

        // 2. 5-Day Backtesting Loop (reduced from 14d to minimize API calls)
        let correct = 0;
        const testWindow = Math.min(3, ohlcData.length - 1);
        
        for (let i = Math.max(0, ohlcData.length - testWindow - 1); i < ohlcData.length - 1; i++) {
            const day = ohlcData[i];
            const nextDay = ohlcData[i + 1];
            
            // Safe volume access
            const volValue = volumeData[i] ? (Array.isArray(volumeData[i]) ? volumeData[i][1] : volumeData[i]) : 0;
            
            const z = {
                o: (day[1] - priceStats.mean) / priceStats.std,
                h: (day[2] - priceStats.mean) / priceStats.std,
                l: (day[3] - priceStats.mean) / priceStats.std,
                c: (day[4] - priceStats.mean) / priceStats.std,
                v: (volValue - volStats.mean) / volStats.std
            };

            const logit = (weights.intercept || 0) + (z.o * (weights.w_open || 0)) + (z.h * (weights.w_high || 0)) + 
                          (z.l * (weights.w_low || 0)) + (z.c * (weights.w_close || 0)) + (z.v * (weights.w_volume || 0));
            
            const pred = (1 / (1 + Math.exp(-logit))) > 0.5 ? 1 : 0;
            const actual = ((nextDay[4] - day[4]) / day[4]) > threshold ? 1 : 0;

            if (pred === actual) correct++;
        }

        const accuracy = (correct / testWindow) * 100;

        // 3. Final Prediction for Today
        const current = ohlcData[ohlcData.length - 1];
        const currentVol = volumeData[volumeData.length - 1];
        const currentVolValue = Array.isArray(currentVol) ? currentVol[1] : currentVol;
        
        const finalZ = (weights.intercept || 0) + 
            ((current[1] - priceStats.mean) / priceStats.std * (weights.w_open || 0)) + 
            ((current[2] - priceStats.mean) / priceStats.std * (weights.w_high || 0)) + 
            ((current[3] - priceStats.mean) / priceStats.std * (weights.w_low || 0)) + 
            ((current[4] - priceStats.mean) / priceStats.std * (weights.w_close || 0)) + 
            ((currentVolValue - volStats.mean) / volStats.std * (weights.w_volume || 0));

        const result = (1 / (1 + Math.exp(-finalZ))) > 0.5 ? "UP" : "DOWN";

        // 4. Update UI
        document.getElementById('price').innerText = `$${current[4].toLocaleString()}`;
        document.getElementById('accuracy-display').innerText = `3d Backtest Accuracy: ${accuracy.toFixed(1)}%`;
        
        const predEl = document.getElementById('prediction');
        predEl.innerText = result;
        predEl.style.color = result === "UP" ? "#22c55e" : "#ef4444";

    } catch (err) {
        console.error("Dashboard Error:", err);
        console.error("Stack:", err.stack);
        document.getElementById('accuracy-display').innerText = `Error: ${err.message}`;
    }
}

window.onload = updateDashboard;
document.getElementById('coinSelect').addEventListener('change', updateDashboard);