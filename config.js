// Configuration for ISP Restart Frontend2
const CONFIG = {
    // Backend API URL - Change this to match your backend server
    API_URL: 'http://127.0.0.1:8081/api/ping-data',
    
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
    }
};

// For production deployment on Raspberry Pi, uncomment the line below:
// CONFIG.API_URL = 'http://192.168.1.9:8081/api/ping-data';