/**
 * ISP Monitor API Module
 * Contains all API-related methods, calculations, server connections, and backend interactions
 * Extracted from app_backend.js to provide a clean separation of API functionality
 */

/******************************************
 * FETCH METHODS
 ******************************************/

ISPMonitor.prototype.fetchInitialData = async function() {
    console.log('Fetching initial data from backend...');
    
    // Fetch all initial data
    await Promise.all([
        this.fetchLatencyData(),
        this.fetchFullLatencyData(), // Fetch 7 days of data for network status
        this.fetchISPStates(),
        this.fetchNetworkStatus(),
        this.fetchActivityLogs(),
        this.fetchAutorestartSettings()
    ]);
    
    console.log('Initial data loaded - ISP states should now be updated');
    console.log('Current ISP states:', this.ispStates);
};

ISPMonitor.prototype.fetchLatencyData = async function(range = '15min') {
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
            
            // Update restart times first before checking pendingUptimeUpdate
            if (data.restart_times) {
                this.restartTimes = data.restart_times;
                
                // Check if we received fresh restart times for ISPs that need them
                if (this.pendingUptimeUpdate.primary && data.restart_times.primary && 
                    data.restart_times.primary > 0) {
                    this.pendingUptimeUpdate.primary = false;
                    console.log('[UPTIME] Received fresh restart time for primary ISP - resuming uptime counter');
                    // Immediately update the specific ISP uptime display
                    const currentTime = Math.floor(Date.now() / 1000);
                    this.updateISPUptime('primary', data.restart_times.primary, currentTime);
                }
                
                if (this.pendingUptimeUpdate.secondary && data.restart_times.secondary && 
                    data.restart_times.secondary > 0) {
                    this.pendingUptimeUpdate.secondary = false;
                    console.log('[UPTIME] Received fresh restart time for secondary ISP - resuming uptime counter');
                    // Immediately update the specific ISP uptime display
                    const currentTime = Math.floor(Date.now() / 1000);
                    this.updateISPUptime('secondary', data.restart_times.secondary, currentTime);
                }
            }
            
            this.updateUptimeClocks();
        } else {
            // Fallback for old format
            console.log(`[API RESPONSE] Latency Data (${data.length} records):`, data);
            data.reverse();
            this.pingData = data;
        }
        
        this.updateChart();
        // Don't calculate latency averages here - they're calculated from fullPingData
        
    } catch (error) {
        console.error('[API ERROR] Error fetching latency data:', error);
        this.generateDemoLatencyData(); // Fallback to demo data
    }
};

ISPMonitor.prototype.fetchFullLatencyData = async function() {
    // Fetch up to 7 days of data for network status calculations
    const dataPoints = CONFIG.TIME_RANGES['7day'] || 40320;
    const requestPayload = { Rows: dataPoints };
    
    console.log(`[API REQUEST] Fetching full dataset for network status - requesting ${dataPoints} points`);
    
    try {
        const response = await fetch(CONFIG.API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestPayload)
        });

        console.log(`[API RESPONSE] Full dataset status: ${response.status} ${response.statusText}`);

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        
        // Handle new response format with ping_data and restart_times
        if (data.ping_data && data.restart_times) {
            console.log(`[API RESPONSE] Full Latency Data (${data.ping_data.length} records for network status)`);
            
            // For initial load, replace the data
            if (this.fullPingData.length === 0) {
                this.fullPingData = [...data.ping_data].reverse();
                console.log(`[DATA UPDATE] Initial fullPingData load: ${this.fullPingData.length} records`);
            } else {
                // For subsequent updates, merge smartly to avoid data replacement issues
                const newData = [...data.ping_data].reverse();
                const oldCount = this.fullPingData.length;
                
                // Find the newest timestamp in current data
                const currentNewest = this.fullPingData.length > 0 ? 
                    Math.max(...this.fullPingData.map(p => p.untimesec)) : 0;
                
                // Add only truly new records (newer than what we have)
                const reallyNewData = newData.filter(ping => ping.untimesec > currentNewest);
                
                if (reallyNewData.length > 0) {
                    // Add new data to the front (most recent first)
                    this.fullPingData = [...reallyNewData, ...this.fullPingData];
                    
                    // Trim to keep only 7 days worth (40320 records max)
                    const maxRecords = CONFIG.TIME_RANGES['7day'] || 40320;
                    if (this.fullPingData.length > maxRecords) {
                        this.fullPingData = this.fullPingData.slice(0, maxRecords);
                    }
                    
                    console.log(`[DATA UPDATE] Added ${reallyNewData.length} new records: ${oldCount} → ${this.fullPingData.length} total`);
                } else {
                    console.log(`[DATA UPDATE] No new records to add (already have latest data)`);
                }
            }
            
            // Log time range of current data
            if (this.fullPingData.length > 0) {
                const oldest = Math.min(...this.fullPingData.map(p => p.untimesec));
                const newest = Math.max(...this.fullPingData.map(p => p.untimesec));
                console.log(`[DATA UPDATE] Current data spans: ${new Date(oldest * 1000).toLocaleString()} to ${new Date(newest * 1000).toLocaleString()}`);
            }
            
            // Update restart times if provided
            if (data.restart_times) {
                this.restartTimes = data.restart_times;
            }
        } else {
            // Fallback for old format
            console.log(`[API RESPONSE] Full Latency Data (${data.length} records for network status)`);
            this.fullPingData = [...data].reverse();
            console.log(`[DATA UPDATE] fullPingData updated with ${this.fullPingData.length} records (fallback)`);
        }
        
        // Calculate network status averages and connection stability using the full dataset
        this.calculateLatencyAverages();
        this.calculateConnectionStability(this.selectedStatsTimeRange);
        this.updateSignalBarFromTimeRange();
        
    } catch (error) {
        console.error('[API ERROR] Error fetching full latency data:', error);
        // Use chart data as fallback
        this.fullPingData = [...this.pingData];
        this.calculateLatencyAverages();
        this.calculateConnectionStability(this.selectedStatsTimeRange);
        this.updateSignalBarFromTimeRange();
    }
};

ISPMonitor.prototype.fetchISPStates = async function() {
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
            
            // Track downtime transitions
            const wasOffline = previousPrimary && (previousPrimary.powerstate === 0 || previousPrimary.powerstate === false);
            const isNowOnline = primaryPowerState === 1 || primaryPowerState === true;
            const wasInDowntime = previousPrimary && previousPrimary.uxtimewhenoffrequested > 0;
            const wasRestarting = previousPrimary && previousPrimary.powerstate === 0 && previousPrimary.offuntiluxtimesec === 0;
            
            // If ISP goes from offline to online after a downtime or restart, mark as needing fresh restart time
            if (wasOffline && isNowOnline && (wasInDowntime || wasRestarting)) {
                this.pendingUptimeUpdate.primary = true;
                console.log('[UPTIME] Primary ISP came back online after downtime/restart - waiting for fresh restart time');
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
            
            // Track downtime transitions
            const wasOffline = previousSecondary && (previousSecondary.powerstate === 0 || previousSecondary.powerstate === false);
            const isNowOnline = secondaryPowerState === 1 || secondaryPowerState === true;
            const wasInDowntime = previousSecondary && previousSecondary.uxtimewhenoffrequested > 0;
            const wasRestarting = previousSecondary && previousSecondary.powerstate === 0 && previousSecondary.offuntiluxtimesec === 0;
            
            // If ISP goes from offline to online after a downtime or restart, mark as needing fresh restart time
            if (wasOffline && isNowOnline && (wasInDowntime || wasRestarting)) {
                this.pendingUptimeUpdate.secondary = true;
                console.log('[UPTIME] Secondary ISP came back online after downtime/restart - waiting for fresh restart time');
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
};

ISPMonitor.prototype.fetchNetworkStatus = async function() {
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
};

ISPMonitor.prototype.fetchActivityLogs = async function() {
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
};

ISPMonitor.prototype.fetchAutorestartSettings = async function() {
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
};

/******************************************
 * CALCULATION METHODS
 ******************************************/

ISPMonitor.prototype.calculateLatencyAverages = function() {
    // Use fullPingData for network status calculations, fallback to pingData if not available
    const dataToUse = this.fullPingData.length > 0 ? this.fullPingData : this.pingData;
    if (dataToUse.length === 0) return;
    
    console.log(`[LATENCY AVG] Calculating averages with ${dataToUse.length} ping records (using ${this.fullPingData.length > 0 ? 'full' : 'chart'} dataset)`);
    const currentTime = Math.floor(Date.now() / 1000); // Current Unix timestamp
    
    const calculateAvgWithCoverage = (targetMinutes) => {
        const targetSeconds = targetMinutes * 60;
        const requiredPings = Math.ceil(targetSeconds / 15); // 15-second intervals
        const minRequiredPings = Math.floor(requiredPings * 0.8); // 80% threshold
        
        // Filter data within the time window
        const cutoffTime = currentTime - targetSeconds;
        const relevantData = dataToUse.filter(ping => ping.untimesec >= cutoffTime);
        
        if (relevantData.length === 0) {
            return { avg: 0, coverage: 0, isValid: false };
        }
        
        // Calculate average latency across all providers
        const calculateAvg = (arr) => {
            const validData = arr.filter(val => val > 0);
            return validData.length > 0 ? validData.reduce((a, b) => a + b, 0) / validData.length : 0;
        };
        
        const cloudflareAvg = calculateAvg(relevantData.map(d => d.cloudflare));
        const googleAvg = calculateAvg(relevantData.map(d => d.google));
        const facebookAvg = calculateAvg(relevantData.map(d => d.facebook));
        const xAvg = calculateAvg(relevantData.map(d => d.x));
        
        // Calculate overall average (only from providers that have data)
        const validProviders = [cloudflareAvg, googleAvg, facebookAvg, xAvg].filter(avg => avg > 0);
        const overallAvg = validProviders.length > 0 ? 
            Math.round(validProviders.reduce((a, b) => a + b, 0) / validProviders.length) : 0;
        
        // Calculate coverage percentage
        const coverage = Math.round((relevantData.length / requiredPings) * 100);
        const isValid = relevantData.length >= minRequiredPings;
        
        return { avg: overallAvg, coverage, isValid };
    };
    
    // Define time periods in minutes
    const timePeriods = {
        '15min': 15,
        '1hr': 60,
        '4hr': 240,
        '12hr': 720,
        '24hr': 1440,
        '7day': 10080
    };
    
    Object.entries(timePeriods).forEach(([period, minutes]) => {
        const result = calculateAvgWithCoverage(minutes);
        const element = document.getElementById(`avg-${period}`);
        
        // console.log(`[LATENCY AVG] ${period}: ${result.coverage}% coverage, ${result.avg}ms avg, valid: ${result.isValid}`);
        
        if (element) {
            if (result.avg === 0) {
                element.textContent = '--ms';
                element.className = 'avg-value insufficient';
                element.title = `No data available for the last ${this.formatTimePeriod(minutes)}`;
            } else if (!result.isValid) {
                element.textContent = `${result.avg}ms`;
                element.className = 'avg-value insufficient';
                element.title = `Only ${result.coverage}% of pings available over the last ${this.formatTimePeriod(minutes)}`;
            } else {
                element.textContent = `${result.avg}ms`;
                element.className = 'avg-value sufficient';
                element.title = `${result.coverage}% data coverage over the last ${this.formatTimePeriod(minutes)}`;
            }
        }
    });
};

ISPMonitor.prototype.calculateConnectionStability = function(timeRange = '15min') {
    // Use fullPingData for stability calculations, fallback to pingData if not available
    const sourceData = this.fullPingData.length > 0 ? this.fullPingData : this.pingData;
    if (sourceData.length === 0) return;
    
    // Create a cache key based on data length and most recent timestamp
    const mostRecentTime = sourceData.length > 0 ? 
        Math.max(...sourceData.map(ping => ping.untimesec)) : 0;
    const cacheKey = `${timeRange}_${sourceData.length}_${mostRecentTime}`;
    
    // Check if we have cached results for this exact data state
    if (this.stabilityCache[cacheKey]) {
        console.log(`[STABILITY] Using cached results for ${timeRange}`);
        this.updateStabilityDisplay(this.stabilityCache[cacheKey]);
        return;
    }
    
    // Create a completely fresh copy to prevent any data corruption or state sharing
    const dataToUse = sourceData.map(ping => ({
        untimesec: ping.untimesec,
        cloudflare: ping.cloudflare,
        google: ping.google,
        facebook: ping.facebook,
        x: ping.x
    }));
    
    const calcId = Math.random().toString(36).substr(2, 5);
    console.log(`[STABILITY-${calcId}] Starting FRESH calculation for ${timeRange} with ${dataToUse.length} total records`);
    
    // Convert time range to minutes - ensure fresh calculation each time
    const timeRangeMinutes = this.convertTimeRangeToMinutes(timeRange);
    const targetSeconds = timeRangeMinutes * 60;
    
    // Use the most recent ping timestamp instead of current time to avoid artificial gaps  
    // Reuse mostRecentTime from cache key calculation, fallback to current time if no data
    const finalMostRecentTime = mostRecentTime || Math.floor(Date.now() / 1000);
    const cutoffTime = finalMostRecentTime - targetSeconds;
    
    console.log(`[STABILITY-${calcId}] Time filter: mostRecent=${finalMostRecentTime}, cutoff=${cutoffTime}, range=${timeRangeMinutes}min (${targetSeconds}s)`);
    
    // Filter data within the time window - completely fresh filtering
    const relevantData = dataToUse.filter(ping => {
        const isInRange = ping.untimesec >= cutoffTime;
        return isInRange;
    });
    
    console.log(`[STABILITY-${calcId}] Filtered to ${relevantData.length} records for ${timeRange}`);
    if (relevantData.length > 0) {
        const oldest = Math.min(...relevantData.map(p => p.untimesec));
        const newest = Math.max(...relevantData.map(p => p.untimesec));
        console.log(`[STABILITY-${calcId}] Data range: ${new Date(oldest * 1000).toLocaleTimeString()} to ${new Date(newest * 1000).toLocaleTimeString()}`);
    }
    
    if (relevantData.length === 0) {
        console.log(`[STABILITY-${calcId}] No data found for ${timeRange}, displaying empty stats`);
        const emptyStats = {
            stdDev: '--',
            jitter: '--',
            packetLoss: '--',
            peakSpike: '--'
        };
        
        // Cache the empty results
        this.stabilityCache[cacheKey] = emptyStats;
        this.updateStabilityDisplay(emptyStats);
        return;
    }
    
    // Collect all latency values from all providers - fresh collection
    const allLatencies = [];
    relevantData.forEach(ping => {
        if (ping.cloudflare && ping.cloudflare > 0) allLatencies.push(ping.cloudflare);
        if (ping.google && ping.google > 0) allLatencies.push(ping.google);
        if (ping.facebook && ping.facebook > 0) allLatencies.push(ping.facebook);
        if (ping.x && ping.x > 0) allLatencies.push(ping.x);
    });
    
    if (allLatencies.length === 0) {
        console.log(`[STABILITY-${calcId}] No valid latency data found for ${timeRange}, displaying empty stats`);
        const emptyStats = {
            stdDev: '--',
            jitter: '--',
            packetLoss: '--',
            peakSpike: '--'
        };
        
        // Cache the empty results too
        this.stabilityCache[cacheKey] = emptyStats;
        this.updateStabilityDisplay(emptyStats);
        return;
    }
    
    // Calculate statistics with fresh data
    const stats = this.calculateStatistics(allLatencies, relevantData, timeRange, calcId);
    console.log(`[STABILITY-${calcId}] Final stats for ${timeRange}:`, stats);
    
    // Cache the results for this exact data state
    this.stabilityCache[cacheKey] = stats;
    
    // Clean up old cache entries to prevent memory leaks (keep only last 10 entries)
    const cacheKeys = Object.keys(this.stabilityCache);
    if (cacheKeys.length > 10) {
        const oldestKey = cacheKeys[0];
        delete this.stabilityCache[oldestKey];
    }
    
    this.updateStabilityDisplay(stats);
};

ISPMonitor.prototype.convertTimeRangeToMinutes = function(timeRange) {
    const timeRangeMap = {
        '3min': 3,
        '15min': 15,
        '60min': 60,
        '3hr': 180,
        '12hr': 720,
        '24hr': 1440,
        '3day': 4320,
        '7day': 10080
    };
    return timeRangeMap[timeRange] || 15;
};

ISPMonitor.prototype.calculateStatistics = function(latencies, pingData, timeRange, calcId = 'unknown') {
    console.log(`[STATS-${calcId}] Starting fresh statistics calculation for ${timeRange} with ${latencies.length} latency values from ${pingData.length} ping records`);
    
    // Standard Deviation calculation - fresh calculation each time
    const latencyArray = [...latencies]; // Create fresh copy
    const mean = latencyArray.reduce((sum, val) => sum + val, 0) / latencyArray.length;
    const variance = latencyArray.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / latencyArray.length;
    const stdDev = Math.sqrt(variance);
    
    // Jitter calculation (average absolute difference between consecutive measurements) - fresh calculation
    let jitterSum = 0;
    let jitterCount = 0;
    
    // Create fresh copy for jitter calculation
    const sortedPingData = [...pingData].sort((a, b) => a.untimesec - b.untimesec);
    
    sortedPingData.forEach((ping, index) => {
        if (index === 0) return;
        
        const prevPing = sortedPingData[index - 1];
        
        // Calculate jitter for each provider
        ['cloudflare', 'google', 'facebook', 'x'].forEach(provider => {
            if (ping[provider] && ping[provider] > 0 && prevPing[provider] && prevPing[provider] > 0) {
                jitterSum += Math.abs(ping[provider] - prevPing[provider]);
                jitterCount++;
            }
        });
    });
    
    const jitter = jitterCount > 0 ? jitterSum / jitterCount : 0;
    
    // Packet Loss calculation (percentage of failed/missing ping time segments) - completely fresh calculation
    // Calculate expected number of ping segments based on 15-second intervals in the time window
    // Use the actual data time span instead of theoretical time window to avoid artificial gaps
    const timeWindowSeconds = this.convertTimeRangeToMinutes(timeRange) * 60;
    const expectedSegments = Math.floor(timeWindowSeconds / 15);
    
    // Count segments with data and how many of those are successful - fresh count each time
    const totalSegmentsWithData = pingData.length;
    let successfulSegments = 0;
    let failedSegments = 0;
    
    // Fresh iteration for each calculation
    pingData.forEach(ping => {
        // A time segment is considered "successful" if at least one provider succeeded
        const providers = ['cloudflare', 'google', 'facebook', 'x'];
        const successfulProviders = providers.filter(provider => 
            ping[provider] && ping[provider] > 0
        ).length;
        
        if (successfulProviders > 0) {
            successfulSegments++;
        } else {
            failedSegments++;
        }
    });
    
    // Missing segments (no data at all for those time slots) - fresh calculation
    const missingSegments = Math.max(0, expectedSegments - totalSegmentsWithData);
    
    // Total failed = explicitly failed segments + missing segments
    const totalFailedSegments = failedSegments + missingSegments;
    
    // Packet loss = total failed / expected - fresh calculation each time
    const packetLoss = expectedSegments > 0 ? 
        (totalFailedSegments / expectedSegments) * 100 : 0;
        
    console.log(`[PACKET LOSS-${calcId}] ${timeRange}: Expected ${expectedSegments}, WithData ${totalSegmentsWithData}, Successful ${successfulSegments}, Failed ${failedSegments}, Missing ${missingSegments}, Loss: ${packetLoss.toFixed(2)}%`);
    
    // Peak Spike calculation (highest latency value) - fresh calculation
    const peakSpike = latencyArray.length > 0 ? Math.max(...latencyArray) : 0;
    
    return {
        stdDev: Math.round(stdDev * 10) / 10, // Round to 1 decimal
        jitter: Math.round(jitter * 10) / 10,
        packetLoss: Math.round(packetLoss * 100) / 100, // Round to 2 decimals
        peakSpike: Math.round(peakSpike)
    };
};

ISPMonitor.prototype.calculateNextRestartTime = function(autorestartData) {
    if (!autorestartData || autorestartData.autorestart !== 1) {
        return null;
    }

    const now = new Date();
    let nextRestart = new Date();

    // Set the time
    nextRestart.setHours(autorestartData.hour);
    nextRestart.setMinutes(autorestartData.min);
    nextRestart.setSeconds(autorestartData.sec || 0);
    nextRestart.setMilliseconds(0);

    if (autorestartData.daily === 1) {
        // Daily restart
        if (nextRestart <= now) {
            // If time has passed today, move to tomorrow
            nextRestart.setDate(nextRestart.getDate() + 1);
        }
    } else if (autorestartData.weekly === 1) {
        // Weekly restart
        const targetDay = autorestartData.dayinweek; // 1=Sunday, 2=Monday, etc.
        const currentDay = now.getDay() + 1; // Convert to 1-based (Sunday=1)
        
        let daysUntilRestart = targetDay - currentDay;
        if (daysUntilRestart < 0) {
            daysUntilRestart += 7;
        } else if (daysUntilRestart === 0 && nextRestart <= now) {
            daysUntilRestart = 7;
        }
        
        nextRestart.setDate(nextRestart.getDate() + daysUntilRestart);
    } else if (autorestartData.monthly === 1) {
        // Monthly restart
        const targetWeek = autorestartData.weekinmonth; // 1=first week
        const targetDay = autorestartData.dayinweek; // 1=Sunday, 2=Monday, etc.
        
        // Calculate the target date for this month
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const firstDayOfWeek = firstDayOfMonth.getDay() + 1; // 1-based
        
        // Calculate the date of the target day in the target week
        let targetDate = 1 + (targetWeek - 1) * 7 + ((targetDay - firstDayOfWeek + 7) % 7);
        
        nextRestart.setDate(targetDate);
        
        // If the calculated date has passed, move to next month
        if (nextRestart <= now) {
            nextRestart.setMonth(nextRestart.getMonth() + 1);
            
            // Recalculate for the new month
            const newFirstDay = new Date(nextRestart.getFullYear(), nextRestart.getMonth(), 1);
            const newFirstDayOfWeek = newFirstDay.getDay() + 1;
            targetDate = 1 + (targetWeek - 1) * 7 + ((targetDay - newFirstDayOfWeek + 7) % 7);
            nextRestart.setDate(targetDate);
        }
    }

    return nextRestart;
};

/******************************************
 * SERVER CONNECTION METHODS
 ******************************************/

ISPMonitor.prototype.updateServerConnectionStatus = function(connected) {
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
        
        // Update ISP displays based on their actual states
        if (this.ispStates.primary) {
            this.updateISPDisplay('primary', this.ispStates.primary);
        }
        if (this.ispStates.secondary) {
            this.updateISPDisplay('secondary', this.ispStates.secondary);
        }
    } else {
        indicator.className = 'indicator inactive';
        status.textContent = 'CONNECTING...';
        console.log('[SERVER STATUS] Disconnected from server');
        
        // Update ISP displays to show disconnected state
        this.updateISPDisplayDisconnected('primary');
        this.updateISPDisplayDisconnected('secondary');
    }
};

ISPMonitor.prototype.startConnectionRetryTimer = function() {
    // Only start retry timer if not already running
    if (this.connectionRetryInterval) return;
    
    this.connectionRetryInterval = setInterval(() => {
        if (!this.serverConnected) {
            console.log('[SERVER STATUS] Attempting to reconnect...');
            this.fetchISPStates();
        }
    }, 5000); // Retry every 5 seconds
};


ISPMonitor.prototype.resetServerURL = function() {
    // Remove custom URL from localStorage
    localStorage.removeItem('customServerURL');
    
    // Reset to default from original config
    const originalURL = 'http://127.0.0.1:8081/api/ping-data';
    CONFIG.API_URL = originalURL;
    
    console.log('[CONFIG] Reset to default server URL:', originalURL);
    
    // Update the display
    this.updateServerIPDisplay();
    this.hideServerModal();
    
    // Force a reconnection attempt
    this.updateServerConnectionStatus(false);
    setTimeout(() => this.fetchISPStates(), 500);
};

ISPMonitor.prototype.saveServerURL = function() {
    const input = document.getElementById('server-url-input');
    if (!input) return;
    
    let serverURL = input.value.trim();
    
    // Validate the URL
    if (!serverURL) {
        alert('Please enter a server URL');
        return;
    }
    
    // Add protocol if missing
    if (!serverURL.startsWith('http://') && !serverURL.startsWith('https://')) {
        serverURL = 'http://' + serverURL;
    }
    
    // Validate URL format
    try {
        const url = new URL(serverURL);
        
        // Construct the full API URL
        const apiURL = `${url.protocol}//${url.host}/api/ping-data`;
        
        // Save to localStorage
        localStorage.setItem('customServerURL', apiURL);
        
        // Update CONFIG
        CONFIG.API_URL = apiURL;
        
        console.log(`[CONFIG] Saved custom server URL: ${apiURL}`);
        
        // Update the display
        this.updateServerIPDisplay();
        this.hideServerModal();
        
        // Force a reconnection attempt
        this.updateServerConnectionStatus(false);
        setTimeout(() => this.fetchISPStates(), 500);
        
    } catch (error) {
        alert('Invalid URL format. Please enter a valid server address (e.g., http://192.168.1.9:8081)');
        console.error('[CONFIG] Invalid server URL:', error);
    }
};

/******************************************
 * RESTART AND SCHEDULE BACKEND METHODS
 ******************************************/

ISPMonitor.prototype.confirmRestart = async function() {
    if (!this.currentRestartRequest) return;
    
    // Get the selected option from the correct ISP island
    const ispType = this.currentRestartRequest.type;
    const ispRadioGroup = document.querySelector(`#${ispType}-restart`).closest('.isp-island').querySelector('.radio-group');
    const selectedOption = ispRadioGroup.querySelector('.radio-option.selected');
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
        
        // Immediately refresh ISP states and activity logs
        setTimeout(() => {
            this.fetchISPStates();
            this.fetchActivityLogs();
        }, 1000);
        
    } catch (error) {
        console.error('[API ERROR] Error sending restart request:', error);
    }
};

ISPMonitor.prototype.toggleAutoRestart = async function(ispType, enabled) {
    const ispID = ispType === 'primary' ? 0 : 1;
    const payload = {
        autorestart: enabled,
        isp_id: ispID
    };
    
    console.log(`[API REQUEST] Toggling ${ispType} auto-restart to ${enabled ? 'enabled' : 'disabled'}:`, payload);
    console.log(`[DEBUG] Current toggle state before API call: ${enabled}`);
    
    // Temporarily disable periodic updates to prevent race condition
    this.pauseAutorestartPolling = true;
    console.log(`[DEBUG] Paused autorestart polling to prevent race condition`);
    
    try {
        const response = await fetch(CONFIG.API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        console.log(`[API RESPONSE] Status: ${response.status} ${response.statusText}`);
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const responseText = await response.text();
        console.log('[API RESPONSE] Toggle autorestart response:', responseText);
        
        console.log(`${ispType} auto-restart ${enabled ? 'enabled' : 'disabled'} successfully`);
        
        // Wait a bit longer before re-enabling polling and fetching settings
        setTimeout(() => {
            console.log(`[DEBUG] Re-enabling autorestart polling after ${ispType} toggle`);
            this.pauseAutorestartPolling = false;
            this.fetchAutorestartSettings();
        }, 2000);
        
    } catch (error) {
        console.error(`[API ERROR] Error toggling ${ispType} auto-restart:`, error);
        
        // Re-enable polling even on error
        this.pauseAutorestartPolling = false;
        
        // Revert the toggle on error
        const toggleElement = document.getElementById(`${ispType}-autorestart`);
        if (toggleElement) {
            console.log(`[DEBUG] Reverting ${ispType} toggle due to error`);
            toggleElement.checked = !enabled;
        }
    }
};

ISPMonitor.prototype.sendScheduleToBackend = async function(frequency, day, hour, minute, ispId) {
    try {
        console.log(`[DEBUG] sendScheduleToBackend called with:`, {
            frequency, day, hour, minute, ispId
        });
        
        let payload;
        const hourInt = parseInt(hour);
        const minuteInt = parseInt(minute);
        const secondInt = 0; // Always use 0 seconds
        
        console.log(`[DEBUG] Parsed time values: hour=${hourInt}, minute=${minuteInt}, second=${secondInt}`);
        
        // Create payload based on frequency type
        if (frequency === 'daily') {
            payload = {
                daily: [hourInt, minuteInt, secondInt],
                isp_id: ispId
            };
            console.log(`[DEBUG] Created daily payload:`, payload);
        } else if (frequency === 'weekly') {
            // Convert day name to day number (Sunday=1, Monday=2, etc.)
            const dayNumber = this.getDayNumber(day);
            payload = {
                weekly: [dayNumber, hourInt, minuteInt, secondInt],
                isp_id: ispId
            };
            console.log(`[DEBUG] Created weekly payload:`, payload);
        } else if (frequency === 'monthly') {
            // For monthly, use first week (1) and day of week
            const dayNumber = this.getDayNumber(day);
            payload = {
                monthly: [1, dayNumber, hourInt, minuteInt, secondInt], // weekinmonth=1 (first week)
                isp_id: ispId
            };
            console.log(`[DEBUG] Created monthly payload:`, payload);
        }
        
        console.log('[DEBUG] Final payload being sent to backend:', payload);
        
        const response = await fetch('http://localhost:8081/api/ping-data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.text();
        console.log('Backend response:', result);
        
        return true;
    } catch (error) {
        console.error('Failed to send schedule to backend:', error);
        console.log(`[SCHEDULE ERROR] ${new Date().toLocaleTimeString()} - Failed to save schedule - backend connection error`);
        return false;
    }
};

ISPMonitor.prototype.getDayNumber = function(dayName) {
    // Sunday = 1, Monday = 2, ..., Saturday = 7
    const dayMap = {
        'sunday': 1,
        'monday': 2,
        'tuesday': 3,
        'wednesday': 4,
        'thursday': 5,
        'friday': 6,
        'saturday': 7
    };
    const result = dayMap[dayName.toLowerCase()] || 1;
    console.log(`[DEBUG] Converting day name "${dayName}" to number: ${result}`);
    return result;
};

ISPMonitor.prototype.updateSignalBarFromTimeRange = function() {
    // Calculate average latency for the selected stats time range
    const averageLatency = this.calculateAverageLatencyForTimeRange(this.selectedStatsTimeRange);
    console.log('[SIGNAL BAR] Average latency for', this.selectedStatsTimeRange, ':', averageLatency);
    
    // Update signal bar visual representation
    this.updateSignalBars(averageLatency);
};

ISPMonitor.prototype.calculateAverageLatencyForTimeRange = function(timeRange) {
    // Use fullPingData for calculations, fallback to pingData if not available
    const dataToUse = this.fullPingData.length > 0 ? this.fullPingData : this.pingData;
    if (dataToUse.length === 0) return null;
    
    const timeRangeMinutes = this.convertTimeRangeToMinutes(timeRange);
    const targetSeconds = timeRangeMinutes * 60;
    
    // Use the most recent ping timestamp to avoid artificial gaps
    const mostRecentTime = dataToUse.length > 0 ? 
        Math.max(...dataToUse.map(ping => ping.untimesec)) : Math.floor(Date.now() / 1000);
    const cutoffTime = mostRecentTime - targetSeconds;
    
    // Filter data within the time window
    const relevantData = dataToUse.filter(ping => ping.untimesec >= cutoffTime);
    
    if (relevantData.length === 0) return null;
    
    // Collect all valid latency values from all providers
    const allLatencies = [];
    relevantData.forEach(ping => {
        if (ping.cloudflare && ping.cloudflare > 0) allLatencies.push(ping.cloudflare);
        if (ping.google && ping.google > 0) allLatencies.push(ping.google);
        if (ping.facebook && ping.facebook > 0) allLatencies.push(ping.facebook);
        if (ping.x && ping.x > 0) allLatencies.push(ping.x);
    });
    
    if (allLatencies.length === 0) return null;
    
    // Calculate average latency
    const averageLatency = allLatencies.reduce((sum, val) => sum + val, 0) / allLatencies.length;
    return Math.round(averageLatency);
};

ISPMonitor.prototype.updateSignalBars = function(averageLatency) {
    const signalIndicator = document.getElementById('network-signal');
    if (!signalIndicator) return;
    
    const signalBars = signalIndicator.querySelectorAll('.signal-bar');
    
    // Reset all bars to inactive state
    signalBars.forEach(bar => {
        bar.classList.remove('active', 'weak', 'poor');
    });
    
    let activeBarCount = 0;
    let barClass = 'active'; // Default to green
    
    if (averageLatency === null || averageLatency === undefined) {
        // No data - show no bars
        activeBarCount = 0;
    } else if (averageLatency >= 10 && averageLatency <= 30) {
        // 10-30ms: 5 green bars
        activeBarCount = 5;
        barClass = 'active';
    } else if (averageLatency > 30 && averageLatency <= 50) {
        // 30-50ms: 4 green bars
        activeBarCount = 4;
        barClass = 'active';
    } else if (averageLatency > 50 && averageLatency <= 70) {
        // 50-70ms: 3 yellow bars
        activeBarCount = 3;
        barClass = 'weak';
    } else if (averageLatency > 70 && averageLatency <= 100) {
        // 70-100ms: 2 orange bars
        activeBarCount = 2;
        barClass = 'poor';
    } else if (averageLatency > 100) {
        // >100ms: 1 red bar
        activeBarCount = 1;
        barClass = 'poor';
    } else {
        // <10ms: still show 5 green bars (excellent connection)
        activeBarCount = 5;
        barClass = 'active';
    }
    
    // Activate the appropriate number of bars with the correct color class
    for (let i = 0; i < activeBarCount && i < signalBars.length; i++) {
        signalBars[i].classList.add(barClass);
    }
    
    // Update tooltip to show the average latency
    if (averageLatency !== null && averageLatency !== undefined) {
        signalIndicator.title = `Network signal strength based on average latency: ${averageLatency}ms over ${this.selectedStatsTimeRange}`;
    } else {
        signalIndicator.title = 'Network signal strength based on average latency (no data available)';
    }
    
    console.log('[SIGNAL BAR] Updated signal bars:', activeBarCount, 'bars with class', barClass, 'for latency', averageLatency);
};

ISPMonitor.prototype.refreshAutoRestartDisplay = async function(ispType, retryCount = 3) {
    try {
        console.log(`[DEBUG] Refreshing ${ispType} autorestart display... (attempt ${4 - retryCount})`);
        const response = await fetch('http://localhost:8081/api/ping-data?pagestate=true');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log(`[DEBUG] Refreshed autorestart data for ${ispType}:`, data);
        
        if (data[ispType]) {
            const scheduleData = data[ispType];
            
            // Check if this looks like a real schedule (not just default zeros)
            const hasValidSchedule = scheduleData.autorestart === 1 && 
                (scheduleData.daily === 1 || scheduleData.weekly === 1 || scheduleData.monthly === 1) &&
                (scheduleData.hour > 0 || scheduleData.min > 0 || scheduleData.daily === 1); // Daily can be at 00:00
            
            if (hasValidSchedule) {
                this.updateAutoRestartDisplayFromData(ispType, scheduleData);
            } else if (retryCount > 1) {
                // If we got back default/empty data, retry after a short delay
                console.log(`[DEBUG] Got default data for ${ispType}, retrying in 300ms...`);
                await new Promise(resolve => setTimeout(resolve, 300));
                return this.refreshAutoRestartDisplay(ispType, retryCount - 1);
            } else {
                // After retries, show that autorestart is enabled but schedule needs configuration
                console.warn(`${ispType} autorestart enabled but no valid schedule found after retries`);
                const scheduleElement = document.getElementById(`${ispType}-schedule-info`);
                if (scheduleElement) {
                    const scheduleText = scheduleElement.querySelector('.schedule-text');
                    scheduleText.textContent = 'Auto-restart enabled (please configure schedule)';
                }
            }
        } else {
            console.warn(`No autorestart data found for ${ispType}`);
            // Fallback to default text
            const scheduleElement = document.getElementById(`${ispType}-schedule-info`);
            if (scheduleElement) {
                const scheduleText = scheduleElement.querySelector('.schedule-text');
                scheduleText.textContent = 'Auto-restart enabled (schedule not configured)';
            }
        }
    } catch (error) {
        console.error(`Failed to refresh ${ispType} autorestart display:`, error);
        const scheduleElement = document.getElementById(`${ispType}-schedule-info`);
        if (scheduleElement) {
            const scheduleText = scheduleElement.querySelector('.schedule-text');
            scheduleText.textContent = 'Error loading schedule information';
        }
    }
};