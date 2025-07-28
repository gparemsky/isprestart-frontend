// ISP Network Monitor - Core Class and Initialization
// Frontend2 Application Logic - Core Module

class ISPMonitor {
    constructor() {
        // Data storage
        this.pingData = []; // Used for charts
        this.fullPingData = []; // Used for network status calculations (up to 7 days)
        this.ispStates = {
            primary: { ispid: 0, powerstate: 1, uxtimewhenoffrequested: 0, offuntiluxtimesec: 0 },
            secondary: { ispid: 1, powerstate: 1, uxtimewhenoffrequested: 0, offuntiluxtimesec: 0 }
        };
        this.networkStatus = { active_connection: 'Unknown', public_ip: 'Unknown', location: 'Unknown' };
        this.restartTimes = { primary: 0, secondary: 0 };
        this.stabilityCache = {}; // Cache for connection stability calculations
        
        // Autorestart settings
        this.autorestartSettings = {
            primary: null,
            secondary: null
        };
        
        // Track when ISPs have had downtime and need fresh restart time
        this.pendingUptimeUpdate = {
            primary: false,
            secondary: false
        };
        
        // UI state
        this.currentRestartRequest = null;
        this.currentScheduleRequest = null;
        this.selectedTimeRange = '15min';
        this.selectedStatsTimeRange = '15min'; // For connection stability stats
        this.uptimeIntervals = {};
        this.restartCountdownIntervals = {};
        
        // Server connection tracking
        this.serverConnected = false;
        this.connectionRetryInterval = null;
        
        // Server URL is now handled automatically by CONFIG.initializeConfig()

        this.init();
        this.setupEventListeners();
        this.initChart();
        // Set initial disconnected state for ISPs
        this.updateISPDisplayDisconnected('primary');
        this.updateISPDisplayDisconnected('secondary');
        // Don't initialize uptime clocks here - let them show "UNKNOWN" until server data arrives
        this.fetchInitialData();
        
        // Delay periodic updates to let initial data load and be visible
        setTimeout(() => {
            console.log('[INIT] Starting periodic updates after 5 second delay...');
            this.startPeriodicUpdates();
        }, 5000);
    }

    init() {
        console.log('ISP Monitor Control Panel Initialized with Backend Integration');
        
        // Update server IP display based on CONFIG.API_URL
        this.updateServerIPDisplay();
        
        // Debug test removed - was causing "TEST ONLINE" text
        
        // Add test function to global scope for manual testing
        window.testISPUpdate = (ispType, powerstate) => {
            console.log(`[MANUAL TEST] Testing ISP update for ${ispType} with powerstate: ${powerstate}`);
            const testState = {
                ispid: ispType === 'primary' ? 0 : 1,
                powerstate: powerstate,
                uxtimewhenoffrequested: 0,
                offuntiluxtimesec: 0
            };
            this.updateISPDisplay(ispType, testState);
        };
        
        console.log('[DEBUG] Manual test function available: testISPUpdate("primary", true)');
    }

    convertTimeRangeToMinutes(timeRange) {
        const mapping = {
            '3min': 3, '5min': 5, '15min': 15, '60min': 60, '3hr': 180,
            '12hr': 720, '24hr': 1440, '3day': 4320, '7day': 10080, '30day': 43200
        };
        return mapping[timeRange] || 15;
    }

    formatTimePeriod(minutes) {
        if (minutes < 60) {
            return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
        }
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        if (remainingMinutes === 0) {
            return `${hours} hour${hours !== 1 ? 's' : ''}`;
        }
        return `${hours} hour${hours !== 1 ? 's' : ''} ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`;
    }

    getChartStyleForTimeRange(timeRange) {
        const styles = {
            '5min': { lineWidth: 3, pointRadius: 1.5 },
            '15min': { lineWidth: 2.5, pointRadius: 1 },
            '3hr': { lineWidth: 2, pointRadius: 0 },
            '12hr': { lineWidth: 1.5, pointRadius: 0 },
            '24hr': { lineWidth: 1.2, pointRadius: 0 },
            '3day': { lineWidth: 1, pointRadius: 0 },
            '7day': { lineWidth: 1, pointRadius: 0 },
            '30day': { lineWidth: 1, pointRadius: 0 }
        };
        
        return styles[timeRange] || styles['15min'];
    }

    formatDurationCompact(seconds) {
        if (seconds <= 0) return '';
        
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        if (hours > 0 && minutes > 0) {
            return `${hours}h ${minutes}m`;
        } else if (hours > 0) {
            return `${hours}h`;
        } else if (minutes > 0) {
            return `${minutes}m`;
        } else {
            return '<1m';
        }
    }


    formatUptime(seconds) {
        if (seconds < 0) seconds = 0;
        
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        if (days > 0) {
            return `${days}d ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    getDayNumber(dayName) {
        const days = {
            'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3,
            'thursday': 4, 'friday': 5, 'saturday': 6
        };
        return days[dayName.toLowerCase()] || 1;
    }

    generateDemoLatencyData() {
        const demoData = [];
        const now = Date.now();
        
        for (let i = 19; i >= 0; i--) {
            const timestamp = new Date(now - (i * 45000));
            demoData.push({
                timestamp: timestamp.toISOString(),
                cloudflare: Math.random() * 30 + 15,
                google: Math.random() * 35 + 20,
                facebook: Math.random() * 50 + 25,
                x: Math.random() * 60 + 30
            });
        }
        return demoData;
    }

    startPeriodicUpdates() {
        console.log('[PERIODIC] Starting background data updates...');
        
        setInterval(() => {
            this.fetchLatencyData(this.selectedTimeRange);
        }, 15000);

        setInterval(() => {
            this.fetchFullLatencyData();
        }, 30000);

        setInterval(() => {
            this.fetchISPStates();
        }, 5000);

        setInterval(() => {
            this.fetchNetworkStatus();
        }, 15000);

        setInterval(() => {
            if (!this.pauseAutorestartPolling) {
                this.fetchAutorestartSettings();
            }
        }, 30000);

        setInterval(() => {
            this.fetchActivityLogs();
        }, 30000);

        setInterval(() => {
            this.updateUptimeClocks();
        }, 1000);
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.ispMonitor = new ISPMonitor();
});