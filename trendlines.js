// Trendlines - Support and Resistance
export function drawTrendlines(ctx, candles, candleWidth, height, minPrice, maxPrice) {
    if (!candles || candles.length < 20) return;

    const lines = detectSupportResistance(candles);
    const priceRange = maxPrice - minPrice;

    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);

    lines.forEach(line => {
        const y = height - ((line.price - minPrice) / priceRange) * height;
        
        // Determine color based on line type
        if (line.type === 'resistance') {
            ctx.strokeStyle = 'rgba(255, 0, 0, 0.6)';
        } else {
            ctx.strokeStyle = 'rgba(0, 255, 0, 0.6)';
        }

        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(candles.length * candleWidth, y);
        ctx.stroke();

        // Draw label
        ctx.setLineDash([]);
        ctx.fillStyle = line.type === 'resistance' ? '#ff0000' : '#00ff00';
        ctx.font = '12px sans-serif';
        ctx.fillText(
            `${line.type.toUpperCase()}: ${line.price.toFixed(2)}`,
            10,
            y - 10
        );
        ctx.setLineDash([5, 5]);
    });

    ctx.setLineDash([]);
}

function detectSupportResistance(candles) {
    const lines = [];
    const lookback = Math.min(100, candles.length);
    const recentCandles = candles.slice(-lookback);

    // Find swing highs and lows
    const swingPoints = [];
    
    for (let i = 5; i < recentCandles.length - 5; i++) {
        const candle = recentCandles[i];
        const leftCandles = recentCandles.slice(i - 5, i);
        const rightCandles = recentCandles.slice(i + 1, i + 6);

        // Check if it's a swing high
        const isSwingHigh = leftCandles.every(c => candle.high >= c.high) &&
                           rightCandles.every(c => candle.high >= c.high);

        // Check if it's a swing low
        const isSwingLow = leftCandles.every(c => candle.low <= c.low) &&
                          rightCandles.every(c => candle.low <= c.low);

        if (isSwingHigh) {
            swingPoints.push({
                price: candle.high,
                type: 'resistance',
                touches: 1
            });
        }

        if (isSwingLow) {
            swingPoints.push({
                price: candle.low,
                type: 'support',
                touches: 1
            });
        }
    }

    // Cluster nearby levels
    const tolerance = (Math.max(...recentCandles.map(c => c.high)) - 
                      Math.min(...recentCandles.map(c => c.low))) * 0.02;

    swingPoints.forEach(point => {
        const similar = lines.find(line => 
            Math.abs(line.price - point.price) < tolerance &&
            line.type === point.type
        );

        if (similar) {
            similar.touches++;
            similar.price = (similar.price + point.price) / 2;
        } else {
            lines.push({ ...point });
        }
    });

    // Filter to only strong levels (multiple touches)
    const strongLines = lines
        .filter(line => line.touches >= 2)
        .sort((a, b) => b.touches - a.touches)
        .slice(0, 5); // Top 5 levels

    return strongLines;
}

// Detect market structure
export function analyzeMarketStructure(candles) {
    if (!candles || candles.length < 20) {
        return { trend: 'RANGING', strength: 0 };
    }

    const recentCandles = candles.slice(-50);
    const highs = [];
    const lows = [];

    // Identify swing points
    for (let i = 5; i < recentCandles.length - 5; i++) {
        const candle = recentCandles[i];
        const leftCandles = recentCandles.slice(i - 5, i);
        const rightCandles = recentCandles.slice(i + 1, i + 6);

        const isSwingHigh = leftCandles.every(c => candle.high >= c.high) &&
                           rightCandles.every(c => candle.high >= c.high);
        const isSwingLow = leftCandles.every(c => candle.low <= c.low) &&
                          rightCandles.every(c => candle.low <= c.low);

        if (isSwingHigh) highs.push(candle.high);
        if (isSwingLow) lows.push(candle.low);
    }

    // Determine trend
    let trend = 'RANGING';
    let strength = 0;

    if (highs.length >= 2 && lows.length >= 2) {
        const highsAscending = highs.slice(-3).every((h, i, arr) => 
            i === 0 || h > arr[i - 1]
        );
        const lowsAscending = lows.slice(-3).every((l, i, arr) => 
            i === 0 || l > arr[i - 1]
        );
        const highsDescending = highs.slice(-3).every((h, i, arr) => 
            i === 0 || h < arr[i - 1]
        );
        const lowsDescending = lows.slice(-3).every((l, i, arr) => 
            i === 0 || l < arr[i - 1]
        );

        if (highsAscending && lowsAscending) {
            trend = 'BULLISH';
            strength = 0.7;
        } else if (highsDescending && lowsDescending) {
            trend = 'BEARISH';
            strength = 0.7;
        }
    }

    return { trend, strength, highs, lows };
}

// Detect Order Blocks
export function detectOrderBlocks(candles) {
    if (!candles || candles.length < 20) return [];

    const orderBlocks = [];
    const recentCandles = candles.slice(-100);

    for (let i = 1; i < recentCandles.length - 1; i++) {
        const prev = recentCandles[i - 1];
        const curr = recentCandles[i];
        const next = recentCandles[i + 1];

        // Bullish Order Block
        const isBullishOB = prev.close < prev.open && 
                           curr.close > curr.open &&
                           curr.close > prev.high &&
                           next.close > curr.close;

        // Bearish Order Block
        const isBearishOB = prev.close > prev.open &&
                           curr.close < curr.open &&
                           curr.close < prev.low &&
                           next.close < curr.close;

        if (isBullishOB) {
            orderBlocks.push({
                type: 'BULLISH',
                high: curr.high,
                low: curr.low,
                time: curr.time
            });
        }

        if (isBearishOB) {
            orderBlocks.push({
                type: 'BEARISH',
                high: curr.high,
                low: curr.low,
                time: curr.time
            });
        }
    }

    return orderBlocks.slice(-5); // Return most recent 5
}

// Detect Fair Value Gaps
export function detectFVG(candles) {
    if (!candles || candles.length < 3) return [];

    const fvgs = [];
    const recentCandles = candles.slice(-100);

    for (let i = 1; i < recentCandles.length - 1; i++) {
        const prev = recentCandles[i - 1];
        const curr = recentCandles[i];
        const next = recentCandles[i + 1];

        // Bullish FVG
        if (prev.high < next.low) {
            fvgs.push({
                type: 'BULLISH',
                high: next.low,
                low: prev.high,
                time: curr.time
            });
        }

        // Bearish FVG
        if (prev.low > next.high) {
            fvgs.push({
                type: 'BEARISH',
                high: prev.low,
                low: next.high,
                time: curr.time
            });
        }
    }

    return fvgs.slice(-5); // Return most recent 5
}
