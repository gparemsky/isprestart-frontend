// Configuration for ISP Restart Frontend2
const CONFIG = {
    // Default backend API URL - Can be dynamically changed via session storage
    DEFAULT_API_URL: 'http://127.0.0.1:8081/api/ping-data',
    
    // Update intervals (in milliseconds)
    PING_UPDATE_INTERVAL: 15000,        // 15 seconds
    ISP_STATE_UPDATE_INTERVAL: 1000,    // 1 second
    NETWORK_STATUS_UPDATE_INTERVAL: 60000,  // 1 minute
    ACTIVITY_LOG_UPDATE_INTERVAL: 30000,    // 30 seconds
    LATENCY_AVG_UPDATE_INTERVAL: 900000,    // 15 minutes
    
    // Chart settings
    MAX_DATA_POINTS: 20,
    
    // Stability calculation settings
    PINGS_PER_MINUTE: 4,  // Based on 15-second intervals
    
    // Chart time ranges (in data points)
    TIME_RANGES: {
        '5min': 20,      // 20 data points * 15 seconds = 5 minutes
        '15min': 60,     // 60 data points * 15 seconds = 15 minutes  
        '3hr': 720,      // 720 data points * 15 seconds = 3 hours
        '12hr': 2880,    // 2880 data points * 15 seconds = 12 hours
        '24hr': 5760,    // 5760 data points * 15 seconds = 24 hours
        '3day': 17280,   // 3 days worth of data points
        '7day': 40320,   // 7 days worth of data points
        '30day': 172800  // 30 days worth of data points
    },

    // Dynamic server IP management
    setServerIP: function(ipAddress) {
        if (!ipAddress) {
            console.error('[CONFIG] Invalid IP address provided');
            return false;
        }
        
        // Add protocol if missing
        if (!ipAddress.startsWith('http://') && !ipAddress.startsWith('https://')) {
            ipAddress = 'http://' + ipAddress;
        }
        
        // Add port if missing
        if (!ipAddress.includes(':8081')) {
            ipAddress = ipAddress.replace(/\/$/, '') + ':8081';
        }
        
        // Construct full API URL
        const apiURL = ipAddress + '/api/ping-data';
        
        // Update current API URL
        this.API_URL = apiURL;
        
        // Save to session storage for persistence during the session
        sessionStorage.setItem('serverIP', ipAddress.replace('http://', '').replace('https://', '').replace(':8081', ''));
        sessionStorage.setItem('customServerURL', apiURL);
        
        console.log('[CONFIG] Server IP updated to:', ipAddress);
        console.log('[CONFIG] API URL updated to:', apiURL);
        
        return true;
    },
    
    getServerIP: function() {
        // Get saved IP from session storage or use default
        const savedIP = sessionStorage.getItem('serverIP');
        if (savedIP) {
            return savedIP;
        }
        
        // Extract IP from default URL
        try {
            const url = new URL(this.DEFAULT_API_URL);
            return url.hostname + (url.port && url.port !== '80' && url.port !== '443' ? ':' + url.port : '');
        } catch (error) {
            return '127.0.0.1:8081';
        }
    },
    
    initializeConfig: function() {
        // Check if there's a saved server URL in session storage
        const savedURL = sessionStorage.getItem('customServerURL');
        if (savedURL) {
            this.API_URL = savedURL;
            console.log('[CONFIG] Loaded saved server URL from session:', savedURL);
        } else {
            this.API_URL = this.DEFAULT_API_URL;
            console.log('[CONFIG] Using default server URL:', this.DEFAULT_API_URL);
        }
    }
};

// Initialize configuration on load
CONFIG.initializeConfig();

// For production deployment on Raspberry Pi, uncomment the line below:
// CONFIG.API_URL = 'http://192.168.1.9:8081/api/ping-data';