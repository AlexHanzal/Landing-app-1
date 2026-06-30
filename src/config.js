// ============================================================================
// FRONTEND CONFIGURATION - School Reservation System
// ============================================================================

// Configuration for the School Reservation System frontend
// This file should be included before renderer.js

// AUTO-CONFIGURATION: Try to detect backend server automatically
function autoDetectBackend() {
    const hostname = window.location.hostname;

    // Local development: backend runs separately on port 3000
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return `http://localhost:3000`;
    }

    // Production (e.g. Render): frontend and backend are served by the
    // SAME process on the SAME origin, no separate port. Using the page's
    // own origin also avoids mixed-content errors (an http:// fetch from
    // an https:// page gets blocked by the browser).
    return window.location.origin;
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
