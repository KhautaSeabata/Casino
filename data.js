// Deriv WebSocket Data Handler
class DerivDataProvider {
    constructor() {
        this.ws = null;
        this.appId = 1089; // Deriv demo app ID
        this.subscribers = new Map();
        this.currentSubscription = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.candleData = new Map();
        this.connected = false;
    }

    // Symbol mapping: Our symbols to Deriv symbols
    symbolMap = {
        'XAUUSD': 'frxXAUUSD',
        'EURUSD': 'frxEURUSD',
        'GBPUSD': 'frxGBPUSD',
        'AUDUSD': 'frxAUDUSD',
        'AUDCAD': 'frxAUDCAD',
        'USDCAD': 'frxUSDCAD',
        'USDJPY': 'frxUSDJPY',
        'GBPJPY': 'frxGBPJPY',
        'CADJPY': 'frxCADJPY',
        'AUDJPY': 'frxAUDJPY',
        'BTCUSD': 'cryBTCUSD'
    };

    // Timeframe mapping to Deriv granularity (in seconds)
    timeframeMap = {
        'M1': 60,
        'M5': 300,
        'M15': 900,
        'M30': 1800,
        'H1': 3600,
        'H4': 14400,
        'D1': 86400,
        'W1': 604800,
        'MN': 2592000
    };

    connect() {
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(`wss://ws.binaryws.com/websockets/v3?app_id=${this.appId}`);

                this.ws.onopen = () => {
                    console.log('Deriv WebSocket connected');
                    this.connected = true;
                    this.reconnectAttempts = 0;
                    resolve();
                };

                this.ws.onmessage = (msg) => {
                    const data = JSON.parse(msg.data);
                    this.handleMessage(data);
                };

                this.ws.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    this.connected = false;
                };

                this.ws.onclose = () => {
                    console.log('WebSocket disconnected');
                    this.connected = false;
                    this.attemptReconnect();
                };
            } catch (error) {
                reject(error);
            }
        });
    }

    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Reconnecting... Attempt ${this.reconnectAttempts}`);
            setTimeout(() => {
                this.connect().catch(console.error);
            }, 2000 * this.reconnectAttempts);
        }
    }

    handleMessage(data) {
        if (data.msg_type === 'tick') {
            this.handleTick(data);
        } else if (data.msg_type === 'candles') {
            this.handleCandles(data);
        } else if (data.msg_type === 'ohlc') {
            this.handleOHLC(data);
        } else if (data.error) {
            console.error('Deriv API error:', data.error);
        }
    }

    handleTick(data) {
        const tick = data.tick;
        this.notifySubscribers('tick', {
            symbol: this.reverseSymbolMap(tick.symbol),
            price: tick.quote,
            time: tick.epoch * 1000
        });
    }

    handleCandles(data) {
        const candles = data.candles;
        if (!candles || !candles.length) return;

        const symbol = this.reverseSymbolMap(data.echo_req.ticks_history);
        const formattedCandles = candles.map(c => ({
            time: c.epoch * 1000,
            open: parseFloat(c.open),
            high: parseFloat(c.high),
            low: parseFloat(c.low),
            close: parseFloat(c.close)
        }));

        this.candleData.set(symbol, formattedCandles);
        this.notifySubscribers('candles', { symbol, candles: formattedCandles });
    }

    handleOHLC(data) {
        const ohlc = data.ohlc;
        const symbol = this.reverseSymbolMap(ohlc.symbol);
        
        const candle = {
            time: ohlc.epoch * 1000,
            open: parseFloat(ohlc.open),
            high: parseFloat(ohlc.high),
            low: parseFloat(ohlc.low),
            close: parseFloat(ohlc.close)
        };

        this.notifySubscribers('ohlc', { symbol, candle });
    }

    // Subscribe to symbol and timeframe
    async subscribeToCandles(symbol, timeframe = 'M15', count = 1000) {
        if (!this.connected) {
            await this.connect();
        }

        const derivSymbol = this.symbolMap[symbol] || symbol;
        const granularity = this.timeframeMap[timeframe] || 900;

        // Unsubscribe from previous
        if (this.currentSubscription) {
            this.ws.send(JSON.stringify({ forget: this.currentSubscription }));
        }

        // Request historical candles
        const historyRequest = {
            ticks_history: derivSymbol,
            end: 'latest',
            count: count,
            granularity: granularity,
            style: 'candles'
        };

        this.ws.send(JSON.stringify(historyRequest));

        // Subscribe to live updates
        const subscribeRequest = {
            ticks_history: derivSymbol,
            subscribe: 1,
            end: 'latest',
            count: 1,
            granularity: granularity,
            style: 'candles'
        };

        this.ws.send(JSON.stringify(subscribeRequest));
    }

    // Subscribe to tick stream
    async subscribeToTicks(symbol) {
        if (!this.connected) {
            await this.connect();
        }

        const derivSymbol = this.symbolMap[symbol] || symbol;

        const tickRequest = {
            ticks: derivSymbol,
            subscribe: 1
        };

        this.ws.send(JSON.stringify(tickRequest));
    }

    // Add subscriber callback
    subscribe(event, callback) {
        if (!this.subscribers.has(event)) {
            this.subscribers.set(event, []);
        }
        this.subscribers.get(event).push(callback);
    }

    // Remove subscriber
    unsubscribe(event, callback) {
        if (this.subscribers.has(event)) {
            const callbacks = this.subscribers.get(event);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    // Notify all subscribers
    notifySubscribers(event, data) {
        if (this.subscribers.has(event)) {
            this.subscribers.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error('Subscriber callback error:', error);
                }
            });
        }
    }

    // Reverse symbol mapping
    reverseSymbolMap(derivSymbol) {
        for (const [key, value] of Object.entries(this.symbolMap)) {
            if (value === derivSymbol) {
                return key;
            }
        }
        return derivSymbol;
    }

    // Get cached candles
    getCandles(symbol) {
        return this.candleData.get(symbol) || [];
    }

    // Close connection
    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
            this.connected = false;
        }
    }
}

// Create singleton instance
const derivData = new DerivDataProvider();

// Initialize connection
derivData.connect().catch(err => {
    console.error('Failed to connect to Deriv:', err);
});

export default derivData;
