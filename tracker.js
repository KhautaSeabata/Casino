import { initializeFirebase } from './firebase-config.js';
import { getCurrentUser } from './auth.js';
import derivData from './data.js';

class SignalTracker {
    constructor() {
        this.trackedSignals = new Map();
        this.priceSubscriptions = new Map();
        this.firebase = null;
        this.init();
    }

    async init() {
        try {
            this.firebase = await initializeFirebase();
            this.loadTrackedSignals();
            
            // Subscribe to tick updates
            derivData.subscribe('tick', this.handlePriceUpdate.bind(this));
        } catch (error) {
            console.error('Tracker initialization error:', error);
        }
    }

    async loadTrackedSignals() {
        try {
            const user = getCurrentUser();
            if (!user) return;

            const signalsRef = this.firebase.ref(this.firebase.database, 'signals');
            
            this.firebase.onValue(signalsRef, (snapshot) => {
                this.trackedSignals.clear();
                
                snapshot.forEach((childSnapshot) => {
                    const signal = childSnapshot.val();
                    
                    if (signal.userId === user.uid && signal.tracked && !signal.closed) {
                        this.trackedSignals.set(childSnapshot.key, {
                            id: childSnapshot.key,
                            ...signal,
                            tp1Hit: signal.tp1Hit || false,
                            tp2Hit: signal.tp2Hit || false,
                            tp3Hit: signal.tp3Hit || false,
                            breakevenSet: signal.breakevenSet || false
                        });

                        // Subscribe to price updates for this symbol
                        if (!this.priceSubscriptions.has(signal.symbol)) {
                            derivData.subscribeToTicks(signal.symbol);
                            this.priceSubscriptions.set(signal.symbol, true);
                        }
                    }
                });

                console.log(`Tracking ${this.trackedSignals.size} signals`);
            });
        } catch (error) {
            console.error('Error loading tracked signals:', error);
        }
    }

    handlePriceUpdate(data) {
        const { symbol, price } = data;

        // Check each tracked signal for this symbol
        this.trackedSignals.forEach((signal, signalId) => {
            if (signal.symbol === symbol) {
                this.checkSignal(signalId, signal, price);
            }
        });
    }

    async checkSignal(signalId, signal, currentPrice) {
        try {
            let updates = {};
            let shouldUpdate = false;
            let notification = null;

            if (signal.signal === 'BUY') {
                // Check Stop Loss
                if (currentPrice <= signal.sl && !signal.closed) {
                    updates.closed = true;
                    updates.closedAt = Date.now();
                    updates.closedPrice = currentPrice;
                    updates.closedReason = 'Stop Loss Hit';
                    shouldUpdate = true;
                    notification = `❌ ${signal.symbol} BUY signal stopped out at ${currentPrice.toFixed(2)}`;
                }

                // Check TP1
                if (!signal.tp1Hit && currentPrice >= signal.tp1) {
                    updates.tp1Hit = true;
                    updates.tp1HitAt = Date.now();
                    shouldUpdate = true;
                    notification = `✅ ${signal.symbol} TP1 hit at ${currentPrice.toFixed(2)}`;
                    
                    // Set breakeven after TP1
                    if (!signal.breakevenSet) {
                        updates.breakevenSet = true;
                        updates.sl = signal.entry; // Move SL to breakeven
                        notification += ' - SL moved to breakeven';
                    }
                }

                // Check TP2
                if (signal.tp1Hit && !signal.tp2Hit && currentPrice >= signal.tp2) {
                    updates.tp2Hit = true;
                    updates.tp2HitAt = Date.now();
                    shouldUpdate = true;
                    notification = `✅ ${signal.symbol} TP2 hit at ${currentPrice.toFixed(2)}`;
                }

                // Check TP3
                if (signal.tp2Hit && !signal.tp3Hit && currentPrice >= signal.tp3) {
                    updates.tp3Hit = true;
                    updates.tp3HitAt = Date.now();
                    updates.closed = true;
                    updates.closedAt = Date.now();
                    updates.closedPrice = currentPrice;
                    updates.closedReason = 'All TPs Hit';
                    shouldUpdate = true;
                    notification = `🎯 ${signal.symbol} TP3 hit at ${currentPrice.toFixed(2)} - Signal closed!`;
                }

            } else if (signal.signal === 'SELL') {
                // Check Stop Loss
                if (currentPrice >= signal.sl && !signal.closed) {
                    updates.closed = true;
                    updates.closedAt = Date.now();
                    updates.closedPrice = currentPrice;
                    updates.closedReason = 'Stop Loss Hit';
                    shouldUpdate = true;
                    notification = `❌ ${signal.symbol} SELL signal stopped out at ${currentPrice.toFixed(2)}`;
                }

                // Check TP1
                if (!signal.tp1Hit && currentPrice <= signal.tp1) {
                    updates.tp1Hit = true;
                    updates.tp1HitAt = Date.now();
                    shouldUpdate = true;
                    notification = `✅ ${signal.symbol} TP1 hit at ${currentPrice.toFixed(2)}`;
                    
                    // Set breakeven after TP1
                    if (!signal.breakevenSet) {
                        updates.breakevenSet = true;
                        updates.sl = signal.entry; // Move SL to breakeven
                        notification += ' - SL moved to breakeven';
                    }
                }

                // Check TP2
                if (signal.tp1Hit && !signal.tp2Hit && currentPrice <= signal.tp2) {
                    updates.tp2Hit = true;
                    updates.tp2HitAt = Date.now();
                    shouldUpdate = true;
                    notification = `✅ ${signal.symbol} TP2 hit at ${currentPrice.toFixed(2)}`;
                }

                // Check TP3
                if (signal.tp2Hit && !signal.tp3Hit && currentPrice <= signal.tp3) {
                    updates.tp3Hit = true;
                    updates.tp3HitAt = Date.now();
                    updates.closed = true;
                    updates.closedAt = Date.now();
                    updates.closedPrice = currentPrice;
                    updates.closedReason = 'All TPs Hit';
                    shouldUpdate = true;
                    notification = `🎯 ${signal.symbol} TP3 hit at ${currentPrice.toFixed(2)} - Signal closed!`;
                }
            }

            // Update signal in Firebase if needed
            if (shouldUpdate) {
                const signalRef = this.firebase.ref(this.firebase.database, `signals/${signalId}`);
                await this.firebase.update(signalRef, updates);

                // Update local cache
                this.trackedSignals.set(signalId, { ...signal, ...updates });

                // Show notification
                if (notification) {
                    this.showNotification(notification);
                }
            }

        } catch (error) {
            console.error('Error checking signal:', error);
        }
    }

    showNotification(message) {
        // Show browser notification if permitted
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Trading Signal Update', {
                body: message,
                icon: '/icon-192.png',
                badge: '/icon-192.png'
            });
        }

        // Also log to console
        console.log('📢 ' + message);

        // Could also show in-app notification
        // this.showInAppNotification(message);
    }

    // Request notification permission
    static async requestNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            await Notification.requestPermission();
        }
    }

    // Get tracking statistics
    getStats() {
        let totalSignals = 0;
        let activeSignals = 0;
        let closedSignals = 0;
        let winningSignals = 0;
        let losingSignals = 0;

        this.trackedSignals.forEach(signal => {
            totalSignals++;
            
            if (signal.closed) {
                closedSignals++;
                if (signal.closedReason === 'All TPs Hit' || signal.tp1Hit) {
                    winningSignals++;
                } else if (signal.closedReason === 'Stop Loss Hit') {
                    losingSignals++;
                }
            } else {
                activeSignals++;
            }
        });

        const winRate = closedSignals > 0 ? (winningSignals / closedSignals) * 100 : 0;

        return {
            totalSignals,
            activeSignals,
            closedSignals,
            winningSignals,
            losingSignals,
            winRate: winRate.toFixed(1)
        };
    }
}

// Create singleton instance
const tracker = new SignalTracker();

// Request notification permission on load
SignalTracker.requestNotificationPermission();

export default tracker;
