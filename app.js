const API_KEY = 'CG-LCdqS2Gs8t9UEUHbKgoafQgd'; // Replace with your CoinGecko Demo Key

const COIN_MAP = {
    "Bitcoin": { apiId: "bitcoin", jsonKey: "cleaned_coin_Bitcoin.csv" },
    "Ethereum": { apiId: "ethereum", jsonKey: "cleaned_coin_Ethereum.csv" },
    "BinanceCoin": { apiId: "binancecoin", jsonKey: "cleaned_coin_BinanceCoin.csv" },
    "Solana": { apiId: "solana", jsonKey: "cleaned_coin_Solana.csv" },
    "Cardano": { apiId: "cardano", jsonKey: "cleaned_coin_Cardano.csv" },
    "Dogecoin": { apiId: "dogecoin", jsonKey: "cleaned_coin_Dogecoin.csv" },
    "XRP": { apiId: "ripple", jsonKey: "cleaned_coin_XRP.csv" }
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
    const threshold = 0.0233; // From your main.ipynb

    try {
        // Fetching 30 days of data directly from CoinGecko (public API, CORS enabled)
        const mUrl = `https://api.coingecko.com/api/v3/coins/${config.apiId}/market_chart?vs_currency=usd&days=30&interval=daily&x_cg_demo_api_key=${API_KEY}`;
        const oUrl = `https://api.coingecko.com/api/v3/coins/${config.apiId}/ohlc?vs_currency=usd&days=30&x_cg_demo_api_key=${API_KEY}`;
        
        const [mRes, oRes, wRes] = await Promise.all([fetch(mUrl), fetch(oUrl), fetch('data.json')]);

        if (!mRes.ok || !oRes.ok) throw new Error(`API Error: ${mRes.status}`);

        const histData = await mRes.json();
        const ohlcData = await oRes.json();
        const allWeights = await wRes.json();
        const weights = allWeights[config.jsonKey];

        // --- DEFENSIVE GUARD: Fixes the "reading '1'" error ---
        if (!ohlcData || ohlcData.length < 15) {
            document.getElementById('accuracy-display').innerText = "Insufficient API Data. Try BTC/ETH.";
            return;
        }

        // 1. Calculate Scaling Stats (StandardScaler Replication)
        const priceStats = getStats(ohlcData.map(d => d[4])); 
        const volStats = getStats(histData.total_volumes.map(v => v[1]));

        // 2. 14-Day Backtesting Loop
        let correct = 0;
        const testWindow = 14;
        
        for (let i = ohlcData.length - testWindow - 1; i < ohlcData.length - 1; i++) {
            const day = ohlcData[i];
            const nextDay = ohlcData[i+1];
            
            // Scaled Inputs: (Value - Mean) / StdDev
            const z = {
                o: (day[1] - priceStats.mean) / priceStats.std,
                h: (day[2] - priceStats.mean) / priceStats.std,
                l: (day[3] - priceStats.mean) / priceStats.std,
                c: (day[4] - priceStats.mean) / priceStats.std,
                v: (histData.total_volumes[i][1] - volStats.mean) / volStats.std
            };

            const logit = weights.intercept + (z.o * weights.w_open) + (z.h * weights.w_high) + 
                          (z.l * weights.w_low) + (z.c * weights.w_close) + (z.v * weights.w_volume);
            
            const pred = (1 / (1 + Math.exp(-logit))) > 0.5 ? 1 : 0;
            const actual = ((nextDay[4] - day[4]) / day[4]) > threshold ? 1 : 0;

            if (pred === actual) correct++;
        }

        const accuracy = (correct / testWindow) * 100;

        // 3. Final Prediction for Today
        const current = ohlcData[ohlcData.length - 1];
        const currentVol = histData.total_volumes[histData.total_volumes.length - 1][1];
        
        const finalZ = weights.intercept + 
            ((current[1] - priceStats.mean) / priceStats.std * weights.w_open) + 
            ((current[2] - priceStats.mean) / priceStats.std * weights.w_high) + 
            ((current[3] - priceStats.mean) / priceStats.std * weights.w_low) + 
            ((current[4] - priceStats.mean) / priceStats.std * weights.w_close) + 
            ((currentVol - volStats.mean) / volStats.std * weights.w_volume);

        const result = (1 / (1 + Math.exp(-finalZ))) > 0.5 ? "UP" : "DOWN";

        // 4. Update UI
        document.getElementById('price').innerText = `$${current[4].toLocaleString()}`;
        document.getElementById('accuracy-display').innerText = `14d Backtest Accuracy: ${accuracy.toFixed(1)}%`;
        
        const predEl = document.getElementById('prediction');
        predEl.innerText = result;
        predEl.style.color = result === "UP" ? "#22c55e" : "#ef4444";

    } catch (err) {
        console.error("Dashboard Error:", err);
        document.getElementById('accuracy-display').innerText = "Loading... Check browser console for errors";
    }
}

window.onload = updateDashboard;
document.getElementById('coinSelect').addEventListener('change', updateDashboard);