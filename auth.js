import { initializeFirebase, SESSION_TIMEOUT } from './firebase-config.js';

let firebase;
let sessionTimer;

// Initialize Firebase
async function init() {
    try {
        firebase = await initializeFirebase();
        checkAuthState();
        setupSessionTimeout();
    } catch (error) {
        console.error('Initialization error:', error);
        showError('Failed to initialize app. Please refresh the page.');
    }
}

// Check authentication state
function checkAuthState() {
    firebase.onAuthStateChanged(firebase.auth, (user) => {
        const currentPage = window.location.pathname;
        const publicPages = ['/index.html', '/register.html', '/forgot-password.html', '/'];
        const isPublicPage = publicPages.some(page => currentPage.endsWith(page) || currentPage === '/');

        if (user) {
            // User is signed in
            if (isPublicPage) {
                window.location.href = 'chart.html';
            }
            resetSessionTimeout();
        } else {
            // User is signed out
            if (!isPublicPage) {
                window.location.href = 'index.html';
            }
        }
    });
}

// Setup session timeout
function setupSessionTimeout() {
    // Reset timeout on user activity
    ['mousedown', 'keypress', 'scroll', 'touchstart'].forEach(event => {
        document.addEventListener(event, resetSessionTimeout);
    });
}

function resetSessionTimeout() {
    clearTimeout(sessionTimer);
    sessionTimer = setTimeout(() => {
        logout();
    }, SESSION_TIMEOUT);
}

// Login
async function login(email, password) {
    try {
        await firebase.signInWithEmailAndPassword(firebase.auth, email, password);
        window.location.href = 'chart.html';
    } catch (error) {
        throw getErrorMessage(error);
    }
}

// Register
async function register(email, password, name, phone) {
    try {
        const userCredential = await firebase.createUserWithEmailAndPassword(firebase.auth, email, password);
        
        // Save user data to database
        const userRef = firebase.ref(firebase.database, `users/${userCredential.user.uid}`);
        await firebase.set(userRef, {
            name: name,
            email: email,
            phone: phone,
            createdAt: Date.now()
        });
        
        window.location.href = 'chart.html';
    } catch (error) {
        throw getErrorMessage(error);
    }
}

// Forgot Password
async function forgotPassword(email) {
    try {
        await firebase.sendPasswordResetEmail(firebase.auth, email);
        return 'Password reset email sent! Check your inbox.';
    } catch (error) {
        throw getErrorMessage(error);
    }
}

// Logout
async function logout() {
    try {
        await firebase.signOut(firebase.auth);
        clearTimeout(sessionTimer);
        window.location.href = 'index.html';
    } catch (error) {
        console.error('Logout error:', error);
    }
}

// Get current user
function getCurrentUser() {
    return firebase.auth.currentUser;
}

// Error messages
function getErrorMessage(error) {
    const errorMessages = {
        'auth/user-not-found': 'No account found with this email.',
        'auth/wrong-password': 'Incorrect password.',
        'auth/email-already-in-use': 'This email is already registered.',
        'auth/weak-password': 'Password should be at least 6 characters.',
        'auth/invalid-email': 'Invalid email address.',
        'auth/too-many-requests': 'Too many attempts. Please try again later.',
        'auth/network-request-failed': 'Network error. Check your connection.'
    };
    
    return errorMessages[error.code] || error.message || 'An error occurred. Please try again.';
}

// UI Helper functions
function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 5000);
    }
}

function showSuccess(message) {
    const successDiv = document.getElementById('successMessage');
    if (successDiv) {
        successDiv.textContent = message;
        successDiv.style.display = 'block';
        setTimeout(() => {
            successDiv.style.display = 'none';
        }, 5000);
    }
}

function showLoading(show, buttonId, spinnerId) {
    const button = document.getElementById(buttonId);
    const spinner = document.getElementById(spinnerId);
    if (button && spinner) {
        button.style.display = show ? 'none' : 'inline';
        spinner.style.display = show ? 'inline-block' : 'none';
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    init();

    // Login Form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            showLoading(true, 'loginText', 'loginSpinner');
            
            try {
                await login(email, password);
            } catch (error) {
                showError(error);
                showLoading(false, 'loginText', 'loginSpinner');
            }
        });
    }

    // Register Form
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('name').value;
            const email = document.getElementById('email').value;
            const phone = document.getElementById('phone').value;
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            
            if (password !== confirmPassword) {
                showError('Passwords do not match!');
                return;
            }
            
            showLoading(true, 'registerText', 'registerSpinner');
            
            try {
                await register(email, password, name, phone);
            } catch (error) {
                showError(error);
                showLoading(false, 'registerText', 'registerSpinner');
            }
        });
    }

    // Forgot Password Form
    const forgotPasswordForm = document.getElementById('forgotPasswordForm');
    if (forgotPasswordForm) {
        forgotPasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            
            showLoading(true, 'resetText', 'resetSpinner');
            
            try {
                const message = await forgotPassword(email);
                showSuccess(message);
                showLoading(false, 'resetText', 'resetSpinner');
            } catch (error) {
                showError(error);
                showLoading(false, 'resetText', 'resetSpinner');
            }
        });
    }

    // Logout buttons
    const logoutBtns = document.querySelectorAll('#logoutBtn');
    logoutBtns.forEach(btn => {
        btn.addEventListener('click', logout);
    });
});

// Export functions for use in other modules
export { getCurrentUser, logout, init as initAuth };
