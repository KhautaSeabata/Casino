import { getCurrentUser } from './auth.js';
import derivData from './data.js';
import { drawTrendlines } from './trendlines.js';

class TradingChart {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.candles = [];
        this.symbol = localStorage.getItem('currentSymbol') || 'XAUUSD';
        this.timeframe = localStorage.getItem('currentTimeframe') || 'M15';
        this.candleWidth = 5; // Default zoom level
        this.offset = 0;
        this.isDragging = false;
        this.lastX = 0;
        this.minCandleWidth = 2;
        this.maxCandleWidth = 20;
        
        this.setupCanvas();
        this.setupEventListeners();
        this.loadData();
    }

    setupCanvas() {
        const resize = () => {
            const rect = this.canvas.parentElement.getBoundingClientRect();
            this.canvas.width = rect.width;
            this.canvas.height = rect.height;
            this.draw();
        };
        
        window.addEventListener('resize', resize);
        resize();
    }

    setupEventListeners() {
        // Mouse events
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.canvas.addEventListener('wheel', this.handleWheel.bind(this));

        // Touch events
        this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this));
        this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this));
        this.canvas.addEventListener('touchend', this.handleTouchEnd.bind(this));

        // Pinch zoom
        this.lastDistance = 0;
    }

    handleMouseDown(e) {
        this.isDragging = true;
        this.lastX = e.clientX;
    }

    handleMouseMove(e) {
        if (!this.isDragging) return;
        
        const deltaX = e.clientX - this.lastX;
        this.offset -= Math.floor(deltaX / this.candleWidth);
        this.offset = Math.max(0, Math.min(this.offset, this.candles.length - 10));
        this.lastX = e.clientX;
        this.draw();
    }

    handleMouseUp() {
        this.isDragging = false;
    }

    handleWheel(e) {
        e.preventDefault();
        
        // Zoom
        if (e.deltaY < 0) {
            this.candleWidth = Math.min(this.maxCandleWidth, this.candleWidth + 0.5);
        } else {
            this.candleWidth = Math.max(this.minCandleWidth, this.candleWidth - 0.5);
        }
        
        this.draw();
    }

    handleTouchStart(e) {
        if (e.touches.length === 1) {
            this.isDragging = true;
            this.lastX = e.touches[0].clientX;
        } else if (e.touches.length === 2) {
            this.lastDistance = this.getTouchDistance(e.touches);
        }
    }

    handleTouchMove(e) {
        e.preventDefault();
        
        if (e.touches.length === 1 && this.isDragging) {
            const deltaX = e.touches[0].clientX - this.lastX;
            this.offset -= Math.floor(deltaX / this.candleWidth);
            this.offset = Math.max(0, Math.min(this.offset, this.candles.length - 10));
            this.lastX = e.touches[0].clientX;
            this.draw();
        } else if (e.touches.length === 2) {
            const distance = this.getTouchDistance(e.touches);
            const delta = distance - this.lastDistance;
            
            if (Math.abs(delta) > 5) {
                if (delta > 0) {
                    this.candleWidth = Math.min(this.maxCandleWidth, this.candleWidth + 0.5);
                } else {
                    this.candleWidth = Math.max(this.minCandleWidth, this.candleWidth - 0.5);
                }
                this.lastDistance = distance;
                this.draw();
            }
        }
    }

    handleTouchEnd() {
        this.isDragging = false;
        this.lastDistance = 0;
    }

    getTouchDistance(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    async loadData() {
        try {
            // Subscribe to candles
            await derivData.subscribeToCandles(this.symbol, this.timeframe);
            
            // Subscribe to tick updates
            await derivData.subscribeToTicks(this.symbol);

            // Listen for candle data
            derivData.subscribe('candles', (data) => {
                if (data.symbol === this.symbol) {
                    this.candles = data.candles;
                    this.offset = Math.max(0, this.candles.length - Math.floor(this.canvas.width / this.candleWidth));
                    this.draw();
                }
            });

            // Listen for live updates
            derivData.subscribe('ohlc', (data) => {
                if (data.symbol === this.symbol) {
                    if (this.candles.length > 0) {
                        const lastCandle = this.candles[this.candles.length - 1];
                        if (lastCandle.time === data.candle.time) {
                            // Update existing candle
                            this.candles[this.candles.length - 1] = data.candle;
                        } else {
                            // Add new candle
                            this.candles.push(data.candle);
                        }
                        this.draw();
                    }
                }
            });

            // Listen for tick updates
            derivData.subscribe('tick', (data) => {
                if (data.symbol === this.symbol) {
                    this.updatePrice(data.price);
                }
            });

        } catch (error) {
            console.error('Error loading data:', error);
        }
    }

    updatePrice(price) {
        document.getElementById('buyPrice').textContent = (price + 0.0041).toFixed(2);
        document.getElementById('sellPrice').textContent = price.toFixed(2);
        document.getElementById('currentPrice').textContent = price.toFixed(2);
        
        // Update time
        const now = new Date();
        const timeStr = now.getHours().toString().padStart(2, '0') + ':' + 
                       now.getMinutes().toString().padStart(2, '0');
        document.getElementById('currentTime').textContent = timeStr;
    }

    draw() {
        const { width, height } = this.canvas;
        const ctx = this.ctx;

        // Clear canvas
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, width, height);

        if (this.candles.length === 0) return;

        // Calculate visible candles
        const visibleCandles = Math.floor(width / this.candleWidth);
        const startIdx = Math.max(0, this.candles.length - visibleCandles - this.offset);
        const endIdx = Math.min(this.candles.length, startIdx + visibleCandles);
        const visibleData = this.candles.slice(startIdx, endIdx);

        if (visibleData.length === 0) return;

        // Find min/max prices
        let minPrice = Infinity;
        let maxPrice = -Infinity;
        visibleData.forEach(candle => {
            minPrice = Math.min(minPrice, candle.low);
            maxPrice = Math.max(maxPrice, candle.high);
        });

        const priceRange = maxPrice - minPrice;
        const padding = priceRange * 0.1;
        minPrice -= padding;
        maxPrice += padding;

        // Draw grid
        this.drawGrid(ctx, width, height, minPrice, maxPrice);

        // Draw candles
        visibleData.forEach((candle, idx) => {
            const x = idx * this.candleWidth + this.candleWidth / 2;
            this.drawCandle(ctx, candle, x, height, minPrice, maxPrice);
        });

        // Draw trendlines
        drawTrendlines(ctx, visibleData, this.candleWidth, height, minPrice, maxPrice);

        // Draw crosshair (optional)
        // this.drawCrosshair(ctx, width, height);
    }

    drawGrid(ctx, width, height, minPrice, maxPrice) {
        const gridLines = 8;
        const priceStep = (maxPrice - minPrice) / gridLines;

        ctx.strokeStyle = '#333333';
        ctx.lineWidth = 1;
        ctx.font = '12px sans-serif';
        ctx.fillStyle = '#a0a0a0';
        ctx.textAlign = 'right';

        for (let i = 0; i <= gridLines; i++) {
            const price = minPrice + (priceStep * i);
            const y = height - ((price - minPrice) / (maxPrice - minPrice)) * height;

            // Draw line
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();

            // Draw price label
            ctx.fillText(price.toFixed(2), width - 5, y - 5);
        }
    }

    drawCandle(ctx, candle, x, height, minPrice, maxPrice) {
        const priceRange = maxPrice - minPrice;
        const yHigh = height - ((candle.high - minPrice) / priceRange) * height;
        const yLow = height - ((candle.low - minPrice) / priceRange) * height;
        const yOpen = height - ((candle.open - minPrice) / priceRange) * height;
        const yClose = height - ((candle.close - minPrice) / priceRange) * height;

        const isBullish = candle.close >= candle.open;
        const color = isBullish ? '#00bcd4' : '#ff0000';

        // Draw wick
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, yHigh);
        ctx.lineTo(x, yLow);
        ctx.stroke();

        // Draw body
        const bodyHeight = Math.abs(yClose - yOpen);
        const bodyY = Math.min(yOpen, yClose);
        const bodyWidth = Math.max(2, this.candleWidth - 2);

        if (isBullish) {
            ctx.fillStyle = color;
        } else {
            ctx.fillStyle = color;
        }

        ctx.fillRect(x - bodyWidth / 2, bodyY, bodyWidth, bodyHeight || 1);
    }

    changeSymbol(symbol) {
        this.symbol = symbol;
        this.candles = [];
        this.offset = 0;
        localStorage.setItem('currentSymbol', symbol);
        
        // Update UI
        document.getElementById('currentSymbol').textContent = symbol;
        document.getElementById('symbolDisplay').textContent = `${symbol} • ${this.timeframe}`;
        
        this.loadData();
    }

    changeTimeframe(timeframe) {
        this.timeframe = timeframe;
        this.candles = [];
        this.offset = 0;
        localStorage.setItem('currentTimeframe', timeframe);
        
        // Update UI
        document.getElementById('symbolDisplay').textContent = `${this.symbol} • ${this.timeframe}`;
        
        this.loadData();
    }
}

// Initialize chart
let chart;

document.addEventListener('DOMContentLoaded', () => {
    // Check authentication
    const user = getCurrentUser();
    if (!user) {
        window.location.href = 'index.html';
        return;
    }

    // Initialize chart
    chart = new TradingChart('tradingChart');

    // Symbol modal
    const symbolBtn = document.getElementById('symbolBtn');
    const symbolModal = document.getElementById('symbolModal');
    const closeSymbolModal = document.getElementById('closeSymbolModal');

    symbolBtn?.addEventListener('click', () => {
        symbolModal.classList.add('active');
    });

    closeSymbolModal?.addEventListener('click', () => {
        symbolModal.classList.remove('active');
    });

    // Symbol selection
    document.querySelectorAll('.symbol-item').forEach(item => {
        item.addEventListener('click', () => {
            const symbol = item.getAttribute('data-symbol');
            if (symbol) {
                chart.changeSymbol(symbol);
                symbolModal.classList.remove('active');
            }
        });
    });

    // Timeframe modal
    const timeframeBtn = document.getElementById('timeframeBtn');
    const timeframeModal = document.getElementById('timeframeModal');
    const closeTimeframeModal = document.getElementById('closeTimeframeModal');

    timeframeBtn?.addEventListener('click', () => {
        timeframeModal.classList.add('active');
    });

    closeTimeframeModal?.addEventListener('click', () => {
        timeframeModal.classList.remove('active');
    });

    // Timeframe selection
    document.querySelectorAll('.timeframe-item').forEach(item => {
        item.addEventListener('click', () => {
            const timeframe = item.getAttribute('data-timeframe');
            if (timeframe) {
                // Update active state
                document.querySelectorAll('.timeframe-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                
                chart.changeTimeframe(timeframe);
                timeframeModal.classList.remove('active');
            }
        });
    });

    // Lot size controls
    let lotSize = 0.01;
    const lotValue = document.getElementById('lotValue');
    const lotUp = document.getElementById('lotUp');
    const lotDown = document.getElementById('lotDown');

    lotUp?.addEventListener('click', () => {
        lotSize = Math.min(10, lotSize + 0.01);
        lotValue.textContent = lotSize.toFixed(2);
    });

    lotDown?.addEventListener('click', () => {
        lotSize = Math.max(0.01, lotSize - 0.01);
        lotValue.textContent = lotSize.toFixed(2);
    });

    // Menu
    const menuBtn = document.getElementById('menuBtn');
    const sideMenu = document.getElementById('sideMenu');
    const closeSideMenu = document.getElementById('closeSideMenu');

    menuBtn?.addEventListener('click', () => {
        sideMenu.classList.add('active');
    });

    closeSideMenu?.addEventListener('click', () => {
        sideMenu.classList.remove('active');
    });

    // Settings navigation
    document.getElementById('settingsNavBtn')?.addEventListener('click', () => {
        window.location.href = 'settings.html';
    });
});

export { chart };
