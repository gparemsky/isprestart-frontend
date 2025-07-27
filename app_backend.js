// ISP Network Monitor - Industrial Control Panel with Backend Integration
// Frontend2 Application Logic

class ISPMonitor {
    constructor() {
        // Data storage
        this.pingData = [];
        this.ispStates = {
            primary: { ispid: 0, powerstate: 1, uxtimewhenoffrequested: 0, offuntiluxtimesec: 0 },
            secondary: { ispid: 1, powerstate: 1, uxtimewhenoffrequested: 0, offuntiluxtimesec: 0 }
        };
        this.networkStatus = { active_connection: 'Unknown', public_ip: 'Unknown', location: 'Unknown' };
        
        // UI state
        this.currentRestartRequest = null;
        this.currentScheduleRequest = null;
        this.selectedTimeRange = '15min';
        this.uptimeIntervals = {};
        
        // Server connection tracking
        this.serverConnected = false;
        this.connectionRetryInterval = null;

        this.init();
        this.setupEventListeners();
        this.initChart();
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

    setupEventListeners() {
        // Radio button groups
        this.setupRadioGroups();
        
        // Restart buttons
        document.getElementById('primary-restart')?.addEventListener('click', () => this.showRestartModal('primary'));
        document.getElementById('secondary-restart')?.addEventListener('click', () => this.showRestartModal('secondary'));
        
        // Modal controls
        document.getElementById('cancel-restart')?.addEventListener('click', () => this.hideRestartModal());
        document.getElementById('confirm-restart')?.addEventListener('click', () => this.confirmRestart());
        
        // Modal overlay click
        document.getElementById('restartModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'restartModal') {
                this.hideRestartModal();
            }
        });

        // Chart time range buttons
        document.querySelectorAll('[data-range]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.selectTimeRange(e.target.dataset.range);
            });
        });

        // Auto-restart toggles
        document.getElementById('primary-autorestart')?.addEventListener('change', (e) => {
            this.handleAutoRestartToggle('primary', e.target.checked);
        });
        
        document.getElementById('secondary-autorestart')?.addEventListener('change', (e) => {
            this.handleAutoRestartToggle('secondary', e.target.checked);
        });

        // Stats time range selector
        document.getElementById('stats-timerange')?.addEventListener('change', (e) => {
            this.updateStatsTimeRange(e.target.value);
        });

        // Schedule modal controls
        document.getElementById('cancel-schedule')?.addEventListener('click', () => this.hideScheduleModal());
        document.getElementById('save-schedule')?.addEventListener('click', () => this.saveSchedule());
        
        // Schedule modal overlay click
        document.getElementById('scheduleModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'scheduleModal') {
                this.hideScheduleModal();
            }
        });

        // Schedule inputs
        document.getElementById('schedule-frequency')?.addEventListener('change', () => {
            this.updateScheduleLayout();
            this.updateSchedulePreview();
        });
        document.getElementById('schedule-day')?.addEventListener('change', () => this.updateSchedulePreview());
        document.getElementById('schedule-hour')?.addEventListener('change', () => this.updateSchedulePreview());
        document.getElementById('schedule-minute')?.addEventListener('change', () => this.updateSchedulePreview());
    }

    setupRadioGroups() {
        document.querySelectorAll('.radio-option').forEach(option => {
            option.addEventListener('click', () => {
                const group = option.closest('.radio-group');
                const allOptions = group.querySelectorAll('.radio-option');
                
                allOptions.forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');
                
                // Show/hide duration inputs
                const modal = document.getElementById('restartModal');
                const durationInputs = document.getElementById('duration-inputs');
                if (option.dataset.value === 'timed') {
                    durationInputs.style.display = 'flex';
                } else {
                    durationInputs.style.display = 'none';
                }
            });
        });
    }

    /******************************************
     * BACKEND API INTEGRATION METHODS
     ******************************************/

    async fetchInitialData() {
        console.log('Fetching initial data from backend...');
        
        // Fetch all initial data
        await Promise.all([
            this.fetchLatencyData(),
            this.fetchISPStates(),
            this.fetchNetworkStatus(),
            this.fetchActivityLogs(),
            this.fetchAutorestartSettings()
        ]);
        
        console.log('Initial data loaded - ISP states should now be updated');
        console.log('Current ISP states:', this.ispStates);
    }

    async fetchLatencyData(range = '15min') {
        const dataPoints = CONFIG.TIME_RANGES[range] || CONFIG.MAX_DATA_POINTS;
        const requestPayload = { Rows: dataPoints };
        
        console.log(`[API REQUEST] POST ${CONFIG.API_URL}`, requestPayload);
        
        try {
            const response = await fetch(CONFIG.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestPayload)
            });

            console.log(`[API RESPONSE] Status: ${response.status} ${response.statusText}`);

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            
            // Handle new response format with ping_data and restart_times
            if (data.ping_data && data.restart_times) {
                console.log(`[API RESPONSE] Latency Data (${data.ping_data.length} records):`, data.ping_data);
                console.log(`[API RESPONSE] Restart Times:`, data.restart_times);
                
                data.ping_data.reverse(); // Most recent first
                
                this.pingData = data.ping_data;
                this.restartTimes = data.restart_times;
                this.updateUptimeClocks();
            } else {
                // Fallback for old format
                console.log(`[API RESPONSE] Latency Data (${data.length} records):`, data);
                data.reverse();
                this.pingData = data;
            }
            
            this.updateChart();
            this.calculateLatencyAverages();
            
        } catch (error) {
            console.error('[API ERROR] Error fetching latency data:', error);
            this.generateDemoLatencyData(); // Fallback to demo data
        }
    }

    async fetchISPStates() {
        const url = CONFIG.API_URL + '?ispstates=1';
        console.log(`[API REQUEST] GET ${url}`);
        console.log(`[API DEBUG] fetchISPStates called at:`, new Date().toISOString());
        
        try {
            const response = await fetch(url);
            console.log(`[API RESPONSE] Status: ${response.status} ${response.statusText}`);
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            console.log('[API RESPONSE] Full ISP States response:', JSON.stringify(data, null, 2));
            
            // Debug: Check if both ISPs are present in response
            console.log('[API DEBUG] Primary present in response:', !!data.primary);
            console.log('[API DEBUG] Secondary present in response:', !!data.secondary);
            if (data.primary) console.log('[API DEBUG] Primary powerstate:', data.primary.PowerState || data.primary.powerstate);
            if (data.secondary) console.log('[API DEBUG] Secondary powerstate:', data.secondary.PowerState || data.secondary.powerstate);
            
            if (data.primary) {
                console.log('[API RESPONSE] Primary ISP data:', data.primary);
                const primaryPowerState = data.primary.PowerState !== undefined ? data.primary.PowerState : data.primary.powerstate;
                console.log('[API RESPONSE] Primary powerstate type check:', typeof primaryPowerState, primaryPowerState);
                
                // Check if data actually changed
                const previousPrimary = this.ispStates.primary;
                const dataChanged = !previousPrimary || 
                    (previousPrimary.PowerState !== undefined ? previousPrimary.PowerState : previousPrimary.powerstate) !== primaryPowerState ||
                    previousPrimary.uxtimewhenoffrequested !== data.primary.uxtimewhenoffrequested ||
                    previousPrimary.offuntiluxtimesec !== data.primary.offuntiluxtimesec;
                
                console.log('[API DEBUG] Primary data changed:', dataChanged);
                if (previousPrimary) {
                    console.log('[API DEBUG] Previous primary state:', previousPrimary);
                    console.log('[API DEBUG] New primary state:', data.primary);
                }
                
                this.ispStates.primary = data.primary;
                
                // Only update UI if data actually changed or this is the first load
                if (dataChanged) {
                    setTimeout(() => {
                        console.log('[API DEBUG] Calling updateISPDisplay for primary (data changed)');
                        this.updateISPDisplay('primary', data.primary);
                    }, 100);
                } else {
                    console.log('[API DEBUG] Skipping primary UI update - no data change');
                }
            } else {
                console.warn('[API RESPONSE] No primary ISP data received');
            }
            
            if (data.secondary) {
                console.log('[API RESPONSE] Secondary ISP data:', data.secondary);
                const secondaryPowerState = data.secondary.PowerState !== undefined ? data.secondary.PowerState : data.secondary.powerstate;
                console.log('[API RESPONSE] Secondary powerstate type check:', typeof secondaryPowerState, secondaryPowerState);
                
                // Check if data actually changed
                const previousSecondary = this.ispStates.secondary;
                const dataChanged = !previousSecondary || 
                    (previousSecondary.PowerState !== undefined ? previousSecondary.PowerState : previousSecondary.powerstate) !== secondaryPowerState ||
                    previousSecondary.uxtimewhenoffrequested !== data.secondary.uxtimewhenoffrequested ||
                    previousSecondary.offuntiluxtimesec !== data.secondary.offuntiluxtimesec;
                
                console.log('[API DEBUG] Secondary data changed:', dataChanged);
                if (previousSecondary) {
                    console.log('[API DEBUG] Previous secondary state:', previousSecondary);
                    console.log('[API DEBUG] New secondary state:', data.secondary);
                }
                
                this.ispStates.secondary = data.secondary;
                
                // Only update UI if data actually changed or this is the first load
                if (dataChanged) {
                    setTimeout(() => {
                        console.log('[API DEBUG] Calling updateISPDisplay for secondary (data changed)');
                        this.updateISPDisplay('secondary', data.secondary);
                    }, 100);
                } else {
                    console.log('[API DEBUG] Skipping secondary UI update - no data change');
                }
            } else {
                console.warn('[API RESPONSE] No secondary ISP data received');
            }
            
            // Update server connection status to connected
            this.updateServerConnectionStatus(true);
            
        } catch (error) {
            console.error('[API ERROR] Error fetching ISP states:', error);
            
            // Update server connection status to disconnected
            this.updateServerConnectionStatus(false);
            
            // Start retry timer if not already running
            this.startConnectionRetryTimer();
        }
    }

    async fetchNetworkStatus() {
        const url = CONFIG.API_URL + '?networkstatus=1';
        console.log(`[API REQUEST] GET ${url}`);
        
        try {
            const response = await fetch(url);
            console.log(`[API RESPONSE] Status: ${response.status} ${response.statusText}`);
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            console.log('[API RESPONSE] Network Status:', data);
            
            this.networkStatus = data;
            this.updateNetworkStatusDisplay();
            
        } catch (error) {
            console.error('[API ERROR] Error fetching network status:', error);
        }
    }

    async fetchActivityLogs() {
        const url = CONFIG.API_URL + '?logs=10';
        console.log(`[API REQUEST] GET ${url}`);
        
        try {
            const response = await fetch(url);
            console.log(`[API RESPONSE] Status: ${response.status} ${response.statusText}`);
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            console.log(`[API RESPONSE] Activity Logs (${data.length} records):`, data);
            
            this.updateActivityLog(data);
            
        } catch (error) {
            console.error('[API ERROR] Error fetching activity logs:', error);
        }
    }

    async fetchAutorestartSettings() {
        const url = CONFIG.API_URL + '?pagestate=1';
        console.log(`[API REQUEST] GET ${url}`);
        
        try {
            const response = await fetch(url);
            console.log(`[API RESPONSE] Status: ${response.status} ${response.statusText}`);
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            console.log('[API RESPONSE] Autorestart Settings:', data);
            
            this.updateAutorestartDisplay(data);
            
        } catch (error) {
            console.error('[API ERROR] Error fetching autorestart settings:', error);
        }
    }

    /******************************************
     * UI UPDATE METHODS
     ******************************************/

    updateISPDisplay(ispType, state) {
        const prefix = ispType === 'primary' ? 'primary' : 'secondary';
        const indicator = document.getElementById(`${prefix}-indicator`);
        const status = document.getElementById(`${prefix}-status`);
        
        console.log(`[UI UPDATE] Updating ${ispType} ISP display:`, state);
        const powerState = state.PowerState !== undefined ? state.PowerState : state.powerstate;
        console.log(`[UI UPDATE] Powerstate value: ${powerState}, type: ${typeof powerState}`);
        console.log(`[UI UPDATE] Elements found - indicator: ${!!indicator}, status: ${!!status}`);
        console.log(`[UI UPDATE] Looking for IDs: ${prefix}-indicator, ${prefix}-status`);
        
        if (!indicator || !status) {
            console.error(`[UI ERROR] Missing elements for ${ispType} ISP display`);
            console.error(`[UI ERROR] Indicator element (${prefix}-indicator):`, indicator);
            console.error(`[UI ERROR] Status element (${prefix}-status):`, status);
            return;
        }

        // Clear existing interval
        if (this.uptimeIntervals[ispType]) {
            clearInterval(this.uptimeIntervals[ispType]);
            delete this.uptimeIntervals[ispType];
        }

        // Update indicator and status
        console.log(`[UI UPDATE] Current indicator classes before update:`, indicator.classList.toString());
        indicator.classList.remove('active', 'inactive', 'warning');
        console.log(`[UI UPDATE] Indicator classes after clearing:`, indicator.classList.toString());
        
        if (powerState === 1 || powerState === true) {
            // Online
            console.log(`[UI UPDATE] Setting ${ispType} ISP to ONLINE state`);
            indicator.classList.add('active');
            console.log(`[UI UPDATE] Indicator classes after adding 'active':`, indicator.classList.toString());
            
            // Force a style recomputation to ensure CSS takes effect
            const computedStyle = window.getComputedStyle(indicator);
            console.log(`[UI UPDATE] Computed background color for indicator:`, computedStyle.backgroundColor);
            console.log(`[UI UPDATE] Computed box-shadow for indicator:`, computedStyle.boxShadow);
            
            status.textContent = 'ONLINE';
            status.style.color = '#00ff88';
            console.log(`[UI UPDATE] Status text set to: ${status.textContent}, color: ${status.style.color}`);
            
            // Uptime is now handled by dedicated updateUptimeClocks() function
            // Don't modify uptime element here
            
        } else {
            // Offline/Restarting
            console.log(`[UI UPDATE] Powerstate is FALSE - entering offline/restarting logic`);
            console.log(`[UI UPDATE] offuntiluxtimesec value: ${state.offuntiluxtimesec}`);
            
            if (state.offuntiluxtimesec === 0) {
                // Restarting
                console.log(`[UI UPDATE] Setting ${ispType} ISP to RESTARTING state`);
                indicator.classList.add('warning');
                console.log(`[UI UPDATE] Indicator classes after adding 'warning':`, indicator.classList.toString());
                status.textContent = 'RESTARTING';
                status.style.color = '#ffaa00';
            } else {
                // Offline
                console.log(`[UI UPDATE] Setting ${ispType} ISP to OFFLINE state`);
                indicator.classList.add('inactive');
                console.log(`[UI UPDATE] Indicator classes after adding 'inactive':`, indicator.classList.toString());
                status.textContent = 'OFFLINE';
                status.style.color = '#ff4444';
            }
            
            // Uptime is now handled by dedicated updateUptimeClocks() function
            // Don't modify uptime element here
        }
    }

    startUptimeCounter(element, startTimestamp, isDowntime, ispType) {
        const updateCounter = () => {
            const currentTime = Math.floor(Date.now() / 1000);
            const elapsedSeconds = currentTime - startTimestamp;
            
            if (elapsedSeconds < 0) {
                element.textContent = '--:--:--';
                element.style.color = '#ff4444'; // Red for invalid time
                return;
            }
            
            const days = Math.floor(elapsedSeconds / 86400);
            const hours = Math.floor((elapsedSeconds % 86400) / 3600);
            const minutes = Math.floor((elapsedSeconds % 3600) / 60);
            const seconds = elapsedSeconds % 60;
            
            const timeString = `${days * 24 + hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            
            element.textContent = timeString;
            element.className = isDowntime ? 'clock-display downtime' : 'clock-display uptime';
            element.style.color = ''; // Clear the red color when showing actual time
        };
        
        updateCounter();
        this.uptimeIntervals[ispType] = setInterval(updateCounter, 1000);
    }

    updateNetworkStatusDisplay() {
        const activeConnection = document.getElementById('active-connection');
        const publicIP = document.getElementById('public-ip');
        const location = document.getElementById('location');
        
        if (activeConnection) activeConnection.textContent = this.networkStatus.active_connection;
        if (publicIP) publicIP.textContent = this.networkStatus.public_ip;
        if (location) location.textContent = this.networkStatus.location;
    }

    updateActivityLog(logs) {
        const logContainer = document.querySelector('.log-container');
        if (!logContainer) return;
        
        logContainer.innerHTML = '';
        
        logs.forEach(log => {
            const logEntry = document.createElement('div');
            logEntry.className = 'log-entry';
            
            const timestamp = new Date(log.uxtimesec * 1000).toLocaleTimeString();
            const timestampSpan = document.createElement('span');
            timestampSpan.className = 'log-timestamp';
            timestampSpan.textContent = timestamp;
            
            const actionSpan = document.createElement('span');
            actionSpan.className = 'log-action info'; // Default to info
            actionSpan.textContent = log.reason;
            
            // Style based on content
            if (log.reason.toLowerCase().includes('error') || log.reason.toLowerCase().includes('failed')) {
                actionSpan.classList.replace('info', 'warning');
            } else if (log.reason.toLowerCase().includes('completed') || log.reason.toLowerCase().includes('online')) {
                actionSpan.classList.replace('info', 'success');
            }
            
            logEntry.appendChild(timestampSpan);
            logEntry.appendChild(actionSpan);
            logContainer.appendChild(logEntry);
        });
    }

    updateAutorestartDisplay(data) {
        const primaryToggle = document.getElementById('primary-autorestart');
        if (primaryToggle && data.autorestart !== undefined) {
            primaryToggle.checked = data.autorestart === 1;
        }
    }

    calculateLatencyAverages() {
        if (this.pingData.length === 0) return;
        
        const calculateAvg = (arr) => {
            const validData = arr.filter(val => val > 0);
            return validData.length > 0 ? Math.round(validData.reduce((a, b) => a + b, 0) / validData.length) : 0;
        };
        
        // Calculate averages for different time periods
        const timeWindows = {
            '15min': Math.min(60, this.pingData.length),
            '1hr': Math.min(240, this.pingData.length),
            '4hr': Math.min(960, this.pingData.length),
            '12hr': Math.min(2880, this.pingData.length),
            '24hr': Math.min(5760, this.pingData.length),
            '7day': this.pingData.length
        };
        
        Object.entries(timeWindows).forEach(([period, count]) => {
            const recentData = this.pingData.slice(-count);
            const cloudflareAvg = calculateAvg(recentData.map(d => d.cloudflare));
            const googleAvg = calculateAvg(recentData.map(d => d.google));
            const facebookAvg = calculateAvg(recentData.map(d => d.facebook));
            const xAvg = calculateAvg(recentData.map(d => d.x));
            const overallAvg = Math.round((cloudflareAvg + googleAvg + facebookAvg + xAvg) / 4);
            
            const element = document.getElementById(`avg-${period}`);
            if (element) {
                element.textContent = `${overallAvg}ms`;
            }
        });
    }

    /******************************************
     * CHART METHODS
     ******************************************/

    initChart() {
        const ctx = document.getElementById('latencyChart').getContext('2d');
        
        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Cloudflare',
                        data: [],
                        borderColor: '#F48120',
                        backgroundColor: 'rgba(244, 129, 32, 0.1)',
                        tension: 0.1,
                        pointRadius: 2
                    },
                    {
                        label: 'Google',
                        data: [],
                        borderColor: '#0F9D58',
                        backgroundColor: 'rgba(15, 157, 88, 0.1)',
                        tension: 0.1,
                        pointRadius: 2
                    },
                    {
                        label: 'Facebook',
                        data: [],
                        borderColor: '#1778F2',
                        backgroundColor: 'rgba(23, 120, 242, 0.1)',
                        tension: 0.1,
                        pointRadius: 2
                    },
                    {
                        label: 'X (Twitter)',
                        data: [],
                        borderColor: '#000000',
                        backgroundColor: 'rgba(0, 0, 0, 0.1)',
                        tension: 0.1,
                        pointRadius: 2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        suggestedMax: 100,
                        ticks: { color: '#888' },
                        grid: { color: 'rgba(255,255,255,0.1)' }
                    },
                    x: {
                        ticks: { color: '#888' },
                        grid: { color: 'rgba(255,255,255,0.1)' }
                    }
                },
                plugins: {
                    legend: {
                        labels: { color: '#fff' }
                    }
                }
            }
        });
    }

    updateChart() {
        if (!this.chart || this.pingData.length === 0) return;
        
        const labels = [];
        const cloudflareData = [];
        const googleData = [];
        const facebookData = [];
        const xData = [];
        
        this.pingData.forEach(ping => {
            const date = new Date(ping.untimesec * 1000);
            labels.push(date.toLocaleTimeString());
            
            cloudflareData.push(ping.cloudflare > 0 ? ping.cloudflare : null);
            googleData.push(ping.google > 0 ? ping.google : null);
            facebookData.push(ping.facebook > 0 ? ping.facebook : null);
            xData.push(ping.x > 0 ? ping.x : null);
        });
        
        this.chart.data.labels = labels;
        this.chart.data.datasets[0].data = cloudflareData;
        this.chart.data.datasets[1].data = googleData;
        this.chart.data.datasets[2].data = facebookData;
        this.chart.data.datasets[3].data = xData;
        
        this.chart.update('none'); // No animation for real-time updates
    }

    selectTimeRange(range) {
        // Update active button
        document.querySelectorAll('[data-range]').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-range="${range}"]`).classList.add('active');
        
        this.selectedTimeRange = range;
        this.fetchLatencyData(range);
    }

    /******************************************
     * MODAL AND UI INTERACTION METHODS
     * (Keeping original functionality)
     ******************************************/

    showRestartModal(ispType) {
        const modal = document.getElementById('restartModal');
        const message = document.getElementById('restart-message');
        const ispName = ispType === 'primary' ? 'Primary' : 'Secondary';
        
        this.currentRestartRequest = { type: ispType };
        message.textContent = `Are you sure you want to restart the ${ispName} ISP now?`;
        
        modal.classList.add('visible');
    }

    hideRestartModal() {
        const modal = document.getElementById('restartModal');
        modal.classList.remove('visible');
        this.currentRestartRequest = null;
    }

    async confirmRestart() {
        if (!this.currentRestartRequest) return;
        
        const selectedOption = document.querySelector('.radio-option.selected');
        const restartType = selectedOption?.dataset.value || 'now';
        const ispId = this.currentRestartRequest.type === 'primary' ? 0 : 1;
        
        let payload = {};
        
        if (restartType === 'now') {
            payload = { restartnow: 1, isp_id: ispId };
        } else if (restartType === 'timed') {
            const hours = parseInt(document.getElementById('restart-hours').value) || 0;
            const minutes = parseInt(document.getElementById('restart-minutes').value) || 5;
            const totalMinutes = (hours * 60) + minutes;
            payload = { restartfor: totalMinutes, isp_id: ispId };
        }
        
        console.log(`[API REQUEST] POST ${CONFIG.API_URL}`, payload);
        
        try {
            const response = await fetch(CONFIG.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            console.log(`[API RESPONSE] Status: ${response.status} ${response.statusText}`);
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const responseText = await response.text();
            console.log('[API RESPONSE] Restart request response:', responseText);
            
            console.log('Restart request sent successfully');
            this.hideRestartModal();
            
            // Immediately refresh ISP states
            setTimeout(() => this.fetchISPStates(), 1000);
            
        } catch (error) {
            console.error('[API ERROR] Error sending restart request:', error);
        }
    }

    handleAutoRestartToggle(ispType, enabled) {
        if (enabled) {
            this.showScheduleModal(ispType);
        } else {
            this.toggleAutoRestart(ispType, false);
        }
    }

    toggleAutoRestart(ispType, enabled) {
        console.log(`${ispType} auto-restart ${enabled ? 'enabled' : 'disabled'}`);
        // TODO: Send to backend when auto-restart API is implemented
    }

    showScheduleModal(ispType) {
        const modal = document.getElementById('scheduleModal');
        const ispName = ispType === 'primary' ? 'Primary' : 'Secondary';
        const ispNameElement = document.getElementById('schedule-isp-name');
        const ispLogoElement = document.getElementById('schedule-isp-logo');
        
        this.currentScheduleRequest = { type: ispType };
        
        ispNameElement.textContent = ispName;
        ispNameElement.className = ispType;
        
        if (ispType === 'primary') {
            ispLogoElement.src = './img/T_Badge_5G.webp';
            ispLogoElement.alt = 'T-Mobile 5G';
        } else {
            ispLogoElement.src = './img/Mercury-Broadband-internet.webp';
            ispLogoElement.alt = 'Mercury Broadband';
        }
        
        this.updateScheduleLayout();
        this.updateSchedulePreview();
        
        modal.classList.add('visible');
    }

    hideScheduleModal() {
        const modal = document.getElementById('scheduleModal');
        modal.classList.remove('visible');
        
        if (this.currentScheduleRequest) {
            const toggleElement = document.getElementById(`${this.currentScheduleRequest.type}-autorestart`);
            if (toggleElement) {
                toggleElement.checked = false;
            }
        }
        
        this.currentScheduleRequest = null;
    }

    saveSchedule() {
        if (!this.currentScheduleRequest) return;
        
        const frequency = document.getElementById('schedule-frequency').value;
        const day = document.getElementById('schedule-day').value;
        const hour = document.getElementById('schedule-hour').value;
        const minute = document.getElementById('schedule-minute').value;
        
        // TODO: Send schedule to backend
        console.log('Schedule saved:', { frequency, day, hour, minute });
        
        this.toggleAutoRestart(this.currentScheduleRequest.type, true);
        this.hideScheduleModal();
    }

    updateScheduleLayout() {
        const frequency = document.getElementById('schedule-frequency').value;
        const dayColumn = document.getElementById('day-column');
        
        if (frequency === 'daily') {
            dayColumn.style.display = 'none';
        } else {
            dayColumn.style.display = 'block';
        }
    }

    updateSchedulePreview() {
        const frequency = document.getElementById('schedule-frequency').value;
        const day = document.getElementById('schedule-day').value;
        const hour = document.getElementById('schedule-hour').value;
        const minute = document.getElementById('schedule-minute').value;
        
        const preview = document.getElementById('schedule-preview');
        const text = this.generateScheduleText(frequency, day, hour, minute);
        preview.textContent = text;
    }

    generateScheduleText(frequency, day, hour, minute) {
        const dayName = day.charAt(0).toUpperCase() + day.slice(1);
        const time = `${hour}:${minute}`;
        
        switch (frequency) {
            case 'daily':
                return `Daily restart at ${time}`;
            case 'weekly':
                return `Weekly restart every ${dayName} at ${time}`;
            case 'monthly':
                return `Monthly restart on the first ${dayName} at ${time}`;
            default:
                return '';
        }
    }

    updateStatsTimeRange(range) {
        console.log(`Stats time range changed to: ${range}`);
        // TODO: Update connection stability stats based on time range
    }

    /******************************************
     * PERIODIC UPDATE METHODS
     ******************************************/

    startPeriodicUpdates() {
        console.log('[PERIODIC] Starting periodic updates...');
        
        // Update latency data every 15 seconds
        setInterval(() => {
            console.log('[PERIODIC] Running latency data update...');
            this.fetchLatencyData(this.selectedTimeRange);
        }, CONFIG.PING_UPDATE_INTERVAL);
        
        // Update ISP states every second  
        let ispUpdateCount = 0;
        setInterval(() => {
            ispUpdateCount++;
            console.log(`[PERIODIC] Running ISP states update #${ispUpdateCount}...`);
            this.fetchISPStates();
        }, CONFIG.ISP_STATE_UPDATE_INTERVAL);
        
        // Update network status every minute
        setInterval(() => {
            console.log('[PERIODIC] Running network status update...');
            this.fetchNetworkStatus();
        }, CONFIG.NETWORK_STATUS_UPDATE_INTERVAL);
        
        // Update activity logs every 30 seconds
        setInterval(() => {
            console.log('[PERIODIC] Running activity logs update...');
            this.fetchActivityLogs();
        }, CONFIG.ACTIVITY_LOG_UPDATE_INTERVAL);
        
        // Update uptime clocks every second
        setInterval(() => {
            this.updateUptimeClocks();
        }, 1000);
    }

    updateUptimeClocks() {
        const currentTime = Math.floor(Date.now() / 1000); // Current Unix time in seconds
        
        // Update primary ISP uptime (default to 0 if no restart time data)
        const primaryRestartTime = this.restartTimes?.primary || 0;
        this.updateISPUptime('primary', primaryRestartTime, currentTime);
        
        // Update secondary ISP uptime (default to 0 if no restart time data)  
        const secondaryRestartTime = this.restartTimes?.secondary || 0;
        this.updateISPUptime('secondary', secondaryRestartTime, currentTime);
    }

    updateISPUptime(ispType, lastRestartTime, currentTime) {
        const uptimeElement = document.getElementById(`${ispType}-uptime`);
        const labelElement = uptimeElement?.parentElement.querySelector('.clock-label');
        
        if (!uptimeElement) return;
        
        if (lastRestartTime === 0) {
            // No restart time recorded - show --:--:-- in green with no glow
            uptimeElement.textContent = '--:--:--';
            uptimeElement.className = 'clock-display uptime-unknown';
            if (labelElement) labelElement.textContent = 'Uptime';
        } else {
            // Calculate uptime since last restart
            const uptimeSeconds = currentTime - lastRestartTime;
            const formatted = this.formatUptime(uptimeSeconds);
            
            uptimeElement.textContent = formatted;
            uptimeElement.className = 'clock-display uptime';
            if (labelElement) labelElement.textContent = 'Uptime';
        }
    }

    formatUptime(seconds) {
        if (seconds < 0) seconds = 0;
        
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        // Format as HHH:MM:SS for uptimes longer than 99 hours
        if (hours > 999) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
            return `${hours.toString().padStart(3, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
    }

    /******************************************
     * FALLBACK DEMO DATA (for offline testing)
     ******************************************/

    generateDemoLatencyData() {
        console.log('Using demo data (backend unavailable)');
        
        const now = Date.now();
        const demoData = [];
        
        for (let i = 19; i >= 0; i--) {
            demoData.push({
                untimesec: Math.floor((now - i * 45000) / 1000),
                cloudflare: Math.floor(Math.random() * 15) + 15,
                google: Math.floor(Math.random() * 10) + 20,
                facebook: Math.floor(Math.random() * 20) + 25,
                x: Math.floor(Math.random() * 25) + 30
            });
        }
        
        this.pingData = demoData;
        this.updateChart();
        this.calculateLatencyAverages();
    }

    updateServerConnectionStatus(connected) {
        const indicator = document.getElementById('server-indicator');
        const status = document.getElementById('server-status');
        
        if (!indicator || !status) return;
        
        this.serverConnected = connected;
        
        if (connected) {
            indicator.className = 'indicator active';
            status.textContent = 'SERVER ONLINE';
            console.log('[SERVER STATUS] Connected to server');
            
            // Clear any retry interval
            if (this.connectionRetryInterval) {
                clearInterval(this.connectionRetryInterval);
                this.connectionRetryInterval = null;
            }
        } else {
            indicator.className = 'indicator inactive';
            status.textContent = 'CONNECTING...';
            console.log('[SERVER STATUS] Disconnected from server');
        }
    }

    startConnectionRetryTimer() {
        // Only start retry timer if not already running
        if (this.connectionRetryInterval) return;
        
        this.connectionRetryInterval = setInterval(() => {
            if (!this.serverConnected) {
                console.log('[SERVER STATUS] Attempting to reconnect...');
                this.fetchISPStates();
            }
        }, 5000); // Retry every 5 seconds
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.ispMonitor = new ISPMonitor();
});