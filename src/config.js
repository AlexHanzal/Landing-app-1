// ============================================================================
// FRONTEND CONFIGURATION - School Reservation System
// ============================================================================

// Configuration for the School Reservation System frontend
// This file should be included before renderer.js

// AUTO-CONFIGURATION: Try to detect backend server automatically
function autoDetectBackend() {
    const hostname = window.location.hostname;
    
    // Common development ports to try
    const commonPorts = [3000, 3001, 8080, 8000, 5000];
    
    // Try localhost first if we're on localhost
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return `http://localhost:3000`; // Default for local development
    }
    
    // For production, assume same hostname with port 3000
    return `http://${hostname}:3000`;
}

// MANUAL CONFIGURATION: Set your backend server URL here
// Examples:
// const MANUAL_API_URL = 'http://localhost:3000';           // Local development
// const MANUAL_API_URL = 'http://192.168.1.100:3000';      // Local network server
// const MANUAL_API_URL = 'http://myserver.com:8080';       // Production server
// const MANUAL_API_URL = 'https://api.myschool.com';       // HTTPS production

const MANUAL_API_URL = null; // Set to null to use auto-detection

// ============================================================================
// APPLY CONFIGURATION
// ============================================================================

// Set the API base URL
if (MANUAL_API_URL) {
    window.API_BASE_URL = MANUAL_API_URL;
    console.log('📡 Using manual API URL:', MANUAL_API_URL);
} else {
    window.API_BASE_URL = autoDetectBackend();
    console.log('🔍 Auto-detected API URL:', window.API_BASE_URL);
}

// Optional: Test connection to backend
if (window.fetch) {
    fetch(window.API_BASE_URL + '/')
        .then(response => response.json())
        .then(data => {
            console.log('✅ Backend connection successful:', data.message);
            if (data.server) {
                console.log('🌐 Server info:', data.server);
            }
        })
        .catch(error => {
            console.warn('⚠️  Could not connect to backend:', error.message);
            console.log('🔧 Please check your API_BASE_URL configuration');
        });
}
