const API_KEY = '2fb950a190d94873b34091e1074d316b'; // Replace with your CoinMarketCap free plan API key

const COIN_MAP = {
    "Bitcoin": { cmcId: "1", jsonKey: "cleaned_coin_Bitcoin.csv" },
    "Ethereum": { cmcId: "1027", jsonKey: "cleaned_coin_Ethereum.csv" },
    "BinanceCoin": { cmcId: "1839", jsonKey: "cleaned_coin_BinanceCoin.csv" },
    "Solana": { cmcId: "5426", jsonKey: "cleaned_coin_Solana.csv" }
};

// --- NOTE: Historical data functions removed ---
// CoinMarketCap Free Plan does not provide historical OHLC or time-series data
// These were previously used for scaling and backtesting

async function updateDashboard() {
    const selectedName = document.getElementById('coinSelect').value;
    const config = COIN_MAP[selectedName];
    const threshold = 0.0233; // From your main.ipynb

    try {
        // CoinMarketCap Free Plan - Only latest quotes available
        const quoteUrl = `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?id=${config.cmcId}&convert=USD`;
        
        const quoteRes = await fetch(quoteUrl, {
            headers: {
                'X-CMC_PRO_API_KEY': API_KEY
            }
        });

        if (!quoteRes.ok) {
            throw new Error(`API Error: ${quoteRes.status} - Check your CoinMarketCap API key`);
        }

        const quoteData = await quoteRes.json();
        const wRes = await fetch('data.json');
        const allWeights = await wRes.json();
        const weights = allWeights[config.jsonKey];

        // Extract current price
        const coinData = quoteData.data[config.cmcId];
        const currentPrice = coinData.quote.USD.price;
        const priceChange24h = coinData.quote.USD.percent_change_24h;
        const volume24h = coinData.quote.USD.volume_24h;

        // --- LIMITATION NOTICE ---
        // CoinMarketCap Free Plan does NOT provide historical OHLC data
        // Therefore, 14-day backtest cannot be performed
        // Using only current price change as indicator
        
        // Simplified prediction: Use price change as signal
        // Based on 24h price change, make prediction
        const pred = priceChange24h > 0 ? 1 : 0;
        
        // For demonstration, predict UP/DOWN based on current volatility
        const result = Math.abs(priceChange24h) > threshold * 100 ? 
            (priceChange24h > 0 ? "UP" : "DOWN") : 
            "NEUTRAL";

        // 4. Update UI
        document.getElementById('price').innerText = `$${currentPrice.toLocaleString(undefined, {maximumFractionDigits: 2})}`;
        document.getElementById('accuracy-display').innerText = `24h Change: ${priceChange24h.toFixed(2)}% | Vol: $${(volume24h/1e9).toFixed(2)}B\n⚠️ Note: CoinMarketCap Free Plan does not provide historical data for backtesting`;
        
        const predEl = document.getElementById('prediction');
        predEl.innerText = result;
        predEl.style.color = result === "UP" ? "#22c55e" : (result === "DOWN" ? "#ef4444" : "#eab308");

    } catch (err) {
        console.error("Dashboard Error:", err);
        document.getElementById('accuracy-display').innerText = `API Error: ${err.message}\n• Verify CoinMarketCap API key\n• Check API call limits`;
    }
}

window.onload = updateDashboard;
document.getElementById('coinSelect').addEventListener('change', updateDashboard);