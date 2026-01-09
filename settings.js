import { getCurrentUser, logout } from './auth.js';

document.addEventListener('DOMContentLoaded', () => {
    // Check authentication
    const user = getCurrentUser();
    if (!user) {
        window.location.href = 'index.html';
        return;
    }

    // Display user email
    document.getElementById('userEmail').textContent = user.email;

    // Load settings
    loadSettings();

    // Setup toggle switches
    setupToggles();

    // Logout button
    document.getElementById('logoutBtn')?.addEventListener('click', logout);
});

function loadSettings() {
    const defaultSettings = {
        orderBlocks: true,
        fvg: true,
        bos: true,
        choch: true,
        liquidity: true,
        marketStructure: true,
        newsAnalysis: true,
        currencyStrength: true,
        autoGenerate: false
    };

    const savedSettings = localStorage.getItem('smcSettings');
    const settings = savedSettings ? JSON.parse(savedSettings) : defaultSettings;

    // Apply settings to toggles
    document.querySelectorAll('.toggle-switch').forEach(toggle => {
        const setting = toggle.getAttribute('data-setting');
        if (settings[setting]) {
            toggle.classList.add('active');
        } else {
            toggle.classList.remove('active');
        }
    });

    return settings;
}

function setupToggles() {
    document.querySelectorAll('.toggle-switch').forEach(toggle => {
        toggle.addEventListener('click', () => {
            toggle.classList.toggle('active');
            saveSettings();
        });
    });
}

function saveSettings() {
    const settings = {};

    document.querySelectorAll('.toggle-switch').forEach(toggle => {
        const setting = toggle.getAttribute('data-setting');
        settings[setting] = toggle.classList.contains('active');
    });

    localStorage.setItem('smcSettings', JSON.stringify(settings));
    console.log('Settings saved:', settings);
}
