import { getCurrentUser } from './auth.js';
import { initializeFirebase } from './firebase-config.js';
import derivData from './data.js';
import smcStrategy from './smc.js';
import newsAnalyzer from './news.js';

let firebase;
let selectedSignals = new Set();

document.addEventListener('DOMContentLoaded', async () => {
    // Check authentication
    const user = getCurrentUser();
    if (!user) {
        window.location.href = 'index.html';
        return;
    }

    // Initialize Firebase
    firebase = await initializeFirebase();

    // Load signals
    loadSignals();

    // Setup event listeners
    setupEventListeners();

    // Check for auto-generation
    checkAutoGeneration();
});

function setupEventListeners() {
    // Generate signal button
    document.getElementById('generateSignalBtn')?.addEventListener('click', () => {
        document.getElementById('generateModal').classList.add('active');
    });

    // Close modal
    document.getElementById('closeGenerateModal')?.addEventListener('click', () => {
        document.getElementById('generateModal').classList.remove('active');
    });

    // Symbol selection for generation
    document.querySelectorAll('#generateModal .symbol-item').forEach(item => {
        item.addEventListener('click', async () => {
            const symbol = item.getAttribute('data-symbol');
            document.getElementById('generateModal').classList.remove('active');
            await generateSignal(symbol);
        });
    });

    // Delete selected
    document.getElementById('deleteSelectedBtn')?.addEventListener('click', deleteSelected);

    // Track selected
    document.getElementById('trackSelectedBtn')?.addEventListener('click', trackSelected);

    // Refresh signals
    document.getElementById('refreshSignals')?.addEventListener('click', loadSignals);
}

async function generateSignal(symbol) {
    try {
        const btn = document.getElementById('generateSignalBtn');
        const text = document.getElementById('generateText');
        const spinner = document.getElementById('generateSpinner');

        text.style.display = 'none';
        spinner.style.display = 'inline-block';
        btn.disabled = true;

        // Get candle data
        await derivData.subscribeToCandles(symbol, 'M15', 200);
        
        // Wait for data
        await new Promise(resolve => {
            const checkData = setInterval(() => {
                const candles = derivData.getCandles(symbol);
                if (candles && candles.length > 50) {
                    clearInterval(checkData);
                    resolve();
                }
            }, 500);

            // Timeout after 10 seconds
            setTimeout(() => {
                clearInterval(checkData);
                resolve();
            }, 10000);
        });

        const candles = derivData.getCandles(symbol);

        if (!candles || candles.length < 50) {
            throw new Error('Insufficient data for analysis');
        }

        // Get news analysis
        const newsSettings = JSON.parse(localStorage.getItem('smcSettings') || '{}');
        let newsStrength = null;

        if (newsSettings.newsAnalysis) {
            newsStrength = await newsAnalyzer.analyzePair(symbol);
        }

        // Run SMC analysis
        const analysis = await smcStrategy.analyze(symbol, candles, newsStrength);

        // Save signal to Firebase
        const user = getCurrentUser();
        const signalData = {
            symbol,
            ...analysis,
            userId: user.uid,
            createdAt: Date.now(),
            tracked: false
        };

        const signalsRef = firebase.ref(firebase.database, 'signals');
        await firebase.push(signalsRef, signalData);

        // Reload signals
        await loadSignals();

        text.style.display = 'inline';
        spinner.style.display = 'none';
        btn.disabled = false;

    } catch (error) {
        console.error('Error generating signal:', error);
        alert('Failed to generate signal: ' + error.message);
        
        const text = document.getElementById('generateText');
        const spinner = document.getElementById('generateSpinner');
        const btn = document.getElementById('generateSignalBtn');
        
        text.style.display = 'inline';
        spinner.style.display = 'none';
        btn.disabled = false;
    }
}

async function loadSignals() {
    try {
        const user = getCurrentUser();
        const signalsRef = firebase.ref(firebase.database, 'signals');
        
        firebase.onValue(signalsRef, (snapshot) => {
            const signals = [];
            
            snapshot.forEach((childSnapshot) => {
                const signal = childSnapshot.val();
                if (signal.userId === user.uid) {
                    signals.push({
                        id: childSnapshot.key,
                        ...signal
                    });
                }
            });

            // Sort by timestamp (newest first)
            signals.sort((a, b) => b.createdAt - a.createdAt);

            displaySignals(signals);
        });
    } catch (error) {
        console.error('Error loading signals:', error);
    }
}

function displaySignals(signals) {
    const grid = document.getElementById('signalsGrid');
    const noSignals = document.getElementById('noSignals');

    if (!signals || signals.length === 0) {
        grid.style.display = 'none';
        noSignals.style.display = 'block';
        return;
    }

    grid.style.display = 'grid';
    noSignals.style.display = 'none';
    grid.innerHTML = '';

    signals.forEach(signal => {
        const card = createSignalCard(signal);
        grid.appendChild(card);
    });
}

function createSignalCard(signal) {
    const card = document.createElement('div');
    card.className = 'signal-card';
    if (signal.tracked) card.classList.add('tracking');
    card.dataset.signalId = signal.id;

    const date = new Date(signal.createdAt);
    const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();

    card.innerHTML = `
        <div class="signal-header">
            <div class="signal-symbol">${signal.symbol}</div>
            <div class="signal-type ${signal.signal}">${signal.signal}</div>
        </div>
        
        <div class="signal-info">
            <div class="signal-row">
                <span class="signal-label">Entry:</span>
                <span class="signal-value">${signal.entry?.toFixed(2) || 'N/A'}</span>
            </div>
            <div class="signal-row">
                <span class="signal-label">Stop Loss:</span>
                <span class="signal-value">${signal.sl?.toFixed(2) || 'N/A'}</span>
            </div>
            <div class="signal-row">
                <span class="signal-label">TP1:</span>
                <span class="signal-value">${signal.tp1?.toFixed(2) || 'N/A'}</span>
            </div>
            <div class="signal-row">
                <span class="signal-label">TP2:</span>
                <span class="signal-value">${signal.tp2?.toFixed(2) || 'N/A'}</span>
            </div>
            <div class="signal-row">
                <span class="signal-label">TP3:</span>
                <span class="signal-value">${signal.tp3?.toFixed(2) || 'N/A'}</span>
            </div>
        </div>
        
        <div class="confidence-bar">
            <div class="confidence-fill" style="width: ${signal.confidence}%"></div>
        </div>
        <div style="text-align: center; color: var(--text-gray); font-size: 12px; margin-top: 5px;">
            Confidence: ${signal.confidence?.toFixed(0) || 0}%
        </div>
        
        <div class="signal-reasoning">
            ${signal.reasoning || 'No reasoning provided'}
        </div>
        
        ${signal.tracked ? `
            <div class="tracking-status">
                🎯 Tracking Active
            </div>
        ` : ''}
        
        <div style="font-size: 11px; color: var(--text-gray); margin-top: 10px; text-align: center;">
            ${dateStr}
        </div>
    `;

    // Click to select/deselect
    card.addEventListener('click', () => {
        card.classList.toggle('selected');
        
        if (card.classList.contains('selected')) {
            selectedSignals.add(signal.id);
        } else {
            selectedSignals.delete(signal.id);
        }

        updateActionsVisibility();
    });

    return card;
}

function updateActionsVisibility() {
    const actions = document.getElementById('signalsActions');
    if (selectedSignals.size > 0) {
        actions.style.display = 'flex';
    } else {
        actions.style.display = 'none';
    }
}

async function deleteSelected() {
    if (selectedSignals.size === 0) return;

    if (!confirm(`Delete ${selectedSignals.size} signal(s)?`)) return;

    try {
        for (const signalId of selectedSignals) {
            const signalRef = firebase.ref(firebase.database, `signals/${signalId}`);
            await firebase.remove(signalRef);
        }

        selectedSignals.clear();
        updateActionsVisibility();
    } catch (error) {
        console.error('Error deleting signals:', error);
        alert('Failed to delete signals');
    }
}

async function trackSelected() {
    if (selectedSignals.size === 0) return;

    try {
        for (const signalId of selectedSignals) {
            const signalRef = firebase.ref(firebase.database, `signals/${signalId}`);
            await firebase.update(signalRef, { tracked: true });
        }

        selectedSignals.clear();
        updateActionsVisibility();

        alert('Signals are now being tracked!');
    } catch (error) {
        console.error('Error tracking signals:', error);
        alert('Failed to track signals');
    }
}

function checkAutoGeneration() {
    const settings = JSON.parse(localStorage.getItem('smcSettings') || '{}');
    
    if (settings.autoGenerate) {
        // Generate signals every 5 minutes
        setInterval(async () => {
            const symbols = ['XAUUSD', 'EURUSD', 'GBPUSD', 'BTCUSD'];
            
            for (const symbol of symbols) {
                try {
                    await generateSignal(symbol);
                    // Wait 1 second between generations
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (error) {
                    console.error(`Auto-generation failed for ${symbol}:`, error);
                }
            }
        }, 5 * 60 * 1000);
    }
}
