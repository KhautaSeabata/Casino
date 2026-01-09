// Smart Money Concepts Strategy
import { analyzeMarketStructure, detectOrderBlocks, detectFVG } from './trendlines.js';

export class SMCStrategy {
    constructor() {
        this.settings = this.loadSettings();
    }

    loadSettings() {
        const defaults = {
            orderBlocks: true,
            fvg: true,
            bos: true,
            choch: true,
            liquidity: true,
            marketStructure: true
        };

        const saved = localStorage.getItem('smcSettings');
        return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
    }

    // Main analysis function
    async analyze(symbol, candles, newsStrength = null) {
        if (!candles || candles.length < 50) {
            return {
                signal: 'NEUTRAL',
                confidence: 0,
                reasoning: 'Insufficient data for analysis'
            };
        }

        const analysis = {
            marketStructure: null,
            orderBlocks: [],
            fvg: [],
            bos: null,
            choch: null,
            liquidity: null
        };

        // Analyze Market Structure
        if (this.settings.marketStructure) {
            analysis.marketStructure = analyzeMarketStructure(candles);
        }

        // Detect Order Blocks
        if (this.settings.orderBlocks) {
            analysis.orderBlocks = detectOrderBlocks(candles);
        }

        // Detect Fair Value Gaps
        if (this.settings.fvg) {
            analysis.fvg = detectFVG(candles);
        }

        // Detect Break of Structure
        if (this.settings.bos) {
            analysis.bos = this.detectBOS(candles);
        }

        // Detect Change of Character
        if (this.settings.choch) {
            analysis.choch = this.detectCHoCH(candles);
        }

        // Detect Liquidity Zones
        if (this.settings.liquidity) {
            analysis.liquidity = this.detectLiquidity(candles);
        }

        // Generate signal
        const signal = this.generateSignal(analysis, newsStrength, candles);

        return signal;
    }

    detectBOS(candles) {
        if (candles.length < 20) return null;

        const recentCandles = candles.slice(-30);
        const structure = analyzeMarketStructure(recentCandles);

        if (!structure.highs || !structure.lows) return null;

        const lastCandle = recentCandles[recentCandles.length - 1];
        const previousHigh = Math.max(...structure.highs.slice(0, -1));
        const previousLow = Math.min(...structure.lows.slice(0, -1));

        // Bullish BOS
        if (lastCandle.close > previousHigh) {
            return {
                type: 'BULLISH',
                price: previousHigh,
                strength: 0.8
            };
        }

        // Bearish BOS
        if (lastCandle.close < previousLow) {
            return {
                type: 'BEARISH',
                price: previousLow,
                strength: 0.8
            };
        }

        return null;
    }

    detectCHoCH(candles) {
        if (candles.length < 30) return null;

        const recentCandles = candles.slice(-50);
        const structure = analyzeMarketStructure(recentCandles);

        if (!structure.highs || structure.highs.length < 3 ||
            !structure.lows || structure.lows.length < 3) {
            return null;
        }

        const highs = structure.highs;
        const lows = structure.lows;

        // Check for bullish CHoCH (trend was bearish, now might reverse)
        const wasDescending = highs[highs.length - 3] > highs[highs.length - 2];
        const nowAscending = highs[highs.length - 2] < highs[highs.length - 1];

        if (wasDescending && nowAscending) {
            return {
                type: 'BULLISH',
                strength: 0.7
            };
        }

        // Check for bearish CHoCH (trend was bullish, now might reverse)
        const wasAscending = lows[lows.length - 3] < lows[lows.length - 2];
        const nowDescending = lows[lows.length - 2] > lows[lows.length - 1];

        if (wasAscending && nowDescending) {
            return {
                type: 'BEARISH',
                strength: 0.7
            };
        }

        return null;
    }

    detectLiquidity(candles) {
        if (candles.length < 50) return null;

        const recentCandles = candles.slice(-100);
        const liquidity = {
            buyLiquidity: [],
            sellLiquidity: []
        };

        // Find equal highs (sell liquidity)
        for (let i = 10; i < recentCandles.length - 10; i++) {
            const highs = recentCandles.slice(i - 5, i + 5).map(c => c.high);
            const similarHighs = highs.filter(h => 
                Math.abs(h - recentCandles[i].high) / recentCandles[i].high < 0.001
            );

            if (similarHighs.length >= 3) {
                liquidity.sellLiquidity.push({
                    price: recentCandles[i].high,
                    strength: similarHighs.length / 5
                });
            }
        }

        // Find equal lows (buy liquidity)
        for (let i = 10; i < recentCandles.length - 10; i++) {
            const lows = recentCandles.slice(i - 5, i + 5).map(c => c.low);
            const similarLows = lows.filter(l => 
                Math.abs(l - recentCandles[i].low) / recentCandles[i].low < 0.001
            );

            if (similarLows.length >= 3) {
                liquidity.buyLiquidity.push({
                    price: recentCandles[i].low,
                    strength: similarLows.length / 5
                });
            }
        }

        return liquidity;
    }

    generateSignal(analysis, newsStrength, candles) {
        const lastCandle = candles[candles.length - 1];
        let bullishPoints = 0;
        let bearishPoints = 0;
        const reasons = [];

        // Market Structure (30% weight)
        if (analysis.marketStructure) {
            if (analysis.marketStructure.trend === 'BULLISH') {
                bullishPoints += 30 * analysis.marketStructure.strength;
                reasons.push(`Bullish market structure detected with ${analysis.marketStructure.highs?.length || 0} higher highs`);
            } else if (analysis.marketStructure.trend === 'BEARISH') {
                bearishPoints += 30 * analysis.marketStructure.strength;
                reasons.push(`Bearish market structure detected with ${analysis.marketStructure.lows?.length || 0} lower lows`);
            }
        }

        // Order Blocks (20% weight)
        if (analysis.orderBlocks && analysis.orderBlocks.length > 0) {
            const latestOB = analysis.orderBlocks[analysis.orderBlocks.length - 1];
            if (latestOB.type === 'BULLISH' && lastCandle.close > latestOB.low) {
                bullishPoints += 20;
                reasons.push(`Price bouncing from bullish order block at ${latestOB.low.toFixed(2)}`);
            } else if (latestOB.type === 'BEARISH' && lastCandle.close < latestOB.high) {
                bearishPoints += 20;
                reasons.push(`Price rejecting from bearish order block at ${latestOB.high.toFixed(2)}`);
            }
        }

        // Fair Value Gaps (15% weight)
        if (analysis.fvg && analysis.fvg.length > 0) {
            const latestFVG = analysis.fvg[analysis.fvg.length - 1];
            if (latestFVG.type === 'BULLISH' && lastCandle.close >= latestFVG.low) {
                bullishPoints += 15;
                reasons.push(`Bullish FVG filled, expecting continuation`);
            } else if (latestFVG.type === 'BEARISH' && lastCandle.close <= latestFVG.high) {
                bearishPoints += 15;
                reasons.push(`Bearish FVG filled, expecting continuation`);
            }
        }

        // Break of Structure (20% weight)
        if (analysis.bos) {
            if (analysis.bos.type === 'BULLISH') {
                bullishPoints += 20 * analysis.bos.strength;
                reasons.push(`Bullish break of structure at ${analysis.bos.price.toFixed(2)}`);
            } else if (analysis.bos.type === 'BEARISH') {
                bearishPoints += 20 * analysis.bos.strength;
                reasons.push(`Bearish break of structure at ${analysis.bos.price.toFixed(2)}`);
            }
        }

        // Change of Character (15% weight)
        if (analysis.choch) {
            if (analysis.choch.type === 'BULLISH') {
                bullishPoints += 15 * analysis.choch.strength;
                reasons.push(`Change of character detected - potential bullish reversal`);
            } else if (analysis.choch.type === 'BEARISH') {
                bearishPoints += 15 * analysis.choch.strength;
                reasons.push(`Change of character detected - potential bearish reversal`);
            }
        }

        // News Strength (if provided)
        if (newsStrength) {
            if (newsStrength.bias === 'BULLISH') {
                bullishPoints += newsStrength.strength * 0.1;
                reasons.push(`Fundamental analysis shows ${newsStrength.strength.toFixed(0)}% bullish bias`);
            } else if (newsStrength.bias === 'BEARISH') {
                bearishPoints += newsStrength.strength * 0.1;
                reasons.push(`Fundamental analysis shows ${newsStrength.strength.toFixed(0)}% bearish bias`);
            }
        }

        // Calculate final signal
        const totalPoints = bullishPoints + bearishPoints;
        let signal = 'NEUTRAL';
        let confidence = 0;

        if (totalPoints > 0) {
            if (bullishPoints > bearishPoints) {
                signal = 'BUY';
                confidence = (bullishPoints / (bullishPoints + bearishPoints)) * 100;
            } else if (bearishPoints > bullishPoints) {
                signal = 'SELL';
                confidence = (bearishPoints / (bullishPoints + bearishPoints)) * 100;
            }
        }

        // Calculate SL and TP based on market structure
        const { sl, tp1, tp2, tp3 } = this.calculateLevels(signal, lastCandle, analysis);

        return {
            signal,
            confidence: Math.min(100, confidence),
            reasoning: reasons.join('. '),
            entry: lastCandle.close,
            sl,
            tp1,
            tp2,
            tp3,
            timestamp: Date.now()
        };
    }

    calculateLevels(signal, lastCandle, analysis) {
        const atr = this.calculateATR(analysis);
        const currentPrice = lastCandle.close;

        if (signal === 'BUY') {
            return {
                sl: currentPrice - (atr * 1.5),
                tp1: currentPrice + (atr * 1),
                tp2: currentPrice + (atr * 2),
                tp3: currentPrice + (atr * 3)
            };
        } else if (signal === 'SELL') {
            return {
                sl: currentPrice + (atr * 1.5),
                tp1: currentPrice - (atr * 1),
                tp2: currentPrice - (atr * 2),
                tp3: currentPrice - (atr * 3)
            };
        }

        return { sl: 0, tp1: 0, tp2: 0, tp3: 0 };
    }

    calculateATR(analysis, period = 14) {
        // Simplified ATR calculation
        if (analysis.marketStructure && analysis.marketStructure.highs && analysis.marketStructure.lows) {
            const highs = analysis.marketStructure.highs.slice(-period);
            const lows = analysis.marketStructure.lows.slice(-period);
            
            if (highs.length > 0 && lows.length > 0) {
                const avgHigh = highs.reduce((a, b) => a + b, 0) / highs.length;
                const avgLow = lows.reduce((a, b) => a + b, 0) / lows.length;
                return (avgHigh - avgLow) / 2;
            }
        }

        // Default fallback
        return 10;
    }
}

export default new SMCStrategy();
