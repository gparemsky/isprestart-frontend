// ISP Monitor UI Methods
// UI-related methods extracted from app_backend.js

// Extend ISPMonitor prototype with UI methods
Object.assign(ISPMonitor.prototype, {
    
    /******************************************
     * EVENT LISTENER SETUP METHODS
     ******************************************/

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

        // Server configuration modal
        document.getElementById('server-ip')?.addEventListener('click', () => this.showServerModal());
        document.getElementById('cancel-server')?.addEventListener('click', () => this.hideServerModal());
        document.getElementById('reset-server')?.addEventListener('click', () => this.resetServerURL());
        document.getElementById('save-server')?.addEventListener('click', () => this.saveServerURL());
        
        // Server modal overlay click
        document.getElementById('serverModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'serverModal') {
                this.hideServerModal();
            }
        });
    },

    setupRadioGroups() {
        document.querySelectorAll('.radio-option').forEach(option => {
            option.addEventListener('click', () => {
                const group = option.closest('.radio-group');
                const allOptions = group.querySelectorAll('.radio-option');
                
                allOptions.forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');
                
                // Show/hide duration inputs - only update if modal is currently visible
                const modal = document.getElementById('restartModal');
                const durationInputs = document.getElementById('duration-inputs');
                if (modal && modal.classList.contains('visible')) {
                    if (option.dataset.value === 'timed') {
                        durationInputs.style.display = 'flex';
                    } else {
                        durationInputs.style.display = 'none';
                    }
                }
            });
        });
    },

    /******************************************
     * DISPLAY UPDATE METHODS
     ******************************************/

    updateISPDisplay(ispType, state) {
        const prefix = ispType === 'primary' ? 'primary' : 'secondary';
        const indicator = document.getElementById(`${prefix}-indicator`);
        const status = document.getElementById(`${prefix}-status`);
        const restartInElement = document.getElementById(`${prefix}-restart-in`);
        
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

        // Restore restart countdown color when connected to server
        if (restartInElement && this.serverConnected) {
            restartInElement.style.color = ''; // Clear inline grey color
            restartInElement.classList.remove('countdown-stale');
            restartInElement.classList.add('countdown');
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
                
                // Calculate duration if this is a timed restart
                let statusText = 'OFFLINE';
                if (state.uxtimewhenoffrequested > 0 && state.offuntiluxtimesec > 0) {
                    const durationSeconds = state.offuntiluxtimesec - state.uxtimewhenoffrequested;
                    const durationText = this.formatDurationCompact(durationSeconds);
                    if (durationText) {
                        statusText = `OFFLINE (${durationText})`;
                    }
                }
                
                status.textContent = statusText;
                status.style.color = '#ff4444';
            }
            
            // Uptime is now handled by dedicated updateUptimeClocks() function
            // Don't modify uptime element here
        }
    },

    updateISPDisplayDisconnected(ispType) {
        const prefix = ispType === 'primary' ? 'primary' : 'secondary';
        const indicator = document.getElementById(`${prefix}-indicator`);
        const status = document.getElementById(`${prefix}-status`);
        const uptimeElement = document.getElementById(`${prefix}-uptime`);
        const restartInElement = document.getElementById(`${prefix}-restart-in`);
        
        console.log(`[UI UPDATE] Setting ${ispType} ISP to disconnected state`);
        
        if (!indicator || !status) {
            console.error(`[UI ERROR] Missing elements for ${ispType} ISP display`);
            return;
        }

        // Clear existing interval but don't stop the clock - let it continue running
        // We'll just change its appearance to indicate stale data

        // Update indicator to inactive (grey)
        indicator.classList.remove('active', 'warning');
        indicator.classList.add('inactive');
        
        // Keep the text as "ONLINE?" but make it grey to indicate uncertainty
        status.textContent = 'ONLINE?';
        status.style.color = '#666666'; // Grey color
        
        // Make the uptime clock grey to indicate stale/potentially inaccurate data
        if (uptimeElement) {
            uptimeElement.style.color = '#666666'; // Grey color
            uptimeElement.classList.remove('uptime', 'downtime');
            uptimeElement.classList.add('uptime-stale');
        }
        
        // Make the restart countdown clock grey to indicate stale/potentially inaccurate data
        if (restartInElement) {
            restartInElement.style.color = '#666666'; // Grey color
            restartInElement.classList.remove('countdown');
            restartInElement.classList.add('countdown-stale');
        }
        
        console.log(`[UI UPDATE] ${ispType} ISP set to disconnected state - grey indicator, grey "ONLINE" text, grey uptime, grey restart countdown`);
    },

    updateNetworkStatusDisplay() {
        const activeConnection = document.getElementById('active-connection');
        const publicIP = document.getElementById('public-ip');
        const location = document.getElementById('location');
        
        if (activeConnection) activeConnection.textContent = this.networkStatus.active_connection;
        if (publicIP) publicIP.textContent = this.networkStatus.public_ip;
        if (location) location.textContent = this.networkStatus.location;
    },

    updateActivityLog(logs) {
        const logContainer = document.querySelector('.log-container');
        if (!logContainer) return;
        
        logContainer.innerHTML = '';
        
        logs.forEach(log => {
            const logEntry = document.createElement('div');
            logEntry.className = 'log-entry';
            
            const logDate = new Date(log.uxtimesec * 1000);
            const timestamp = logDate.toLocaleTimeString();
            const fullDate = logDate.toLocaleDateString() + ' ' + logDate.toLocaleTimeString();
            
            const timestampSpan = document.createElement('span');
            timestampSpan.className = 'log-timestamp';
            timestampSpan.textContent = timestamp;
            timestampSpan.title = fullDate; // Add tooltip with full date and time
            
            // Check if this is a custom ISP restart action
            if (log.isp_id !== null && log.isp_id !== undefined && log.restart_type) {
                // This is a custom ISP restart action - show detailed info
                const actionSpan = document.createElement('span');
                actionSpan.className = 'log-action restart'; // Special class for restart actions
                
                // Build detailed action text
                let actionText = `${log.isp_name} - `;
                if (log.restart_type === 'restart_now') {
                    actionText += 'Immediate restart';
                    actionSpan.className = 'log-action restart'; // Amber for restart actions
                } else if (log.restart_type === 'restart_for_duration') {
                    actionText += `Restart for ${log.duration_minutes} minutes`;
                    actionSpan.className = 'log-action restart'; // Amber for restart actions
                } else if (log.restart_type === 'schedule_set') {
                    // Extract schedule details from reason for display
                    const scheduleMatch = log.reason.match(/- (.+)$/);
                    const scheduleText = scheduleMatch ? scheduleMatch[1] : 'schedule set';
                    actionText += `Auto-restart ${scheduleText}`;
                    actionSpan.className = 'log-action schedule'; // Yellow for schedule actions
                } else if (log.restart_type === 'autorestart_toggle') {
                    // Handle auto-restart enable/disable actions
                    if (log.reason.includes('disabled')) {
                        actionText += 'Auto-restart disabled';
                        actionSpan.className = 'log-action warning'; // Orange for disable
                    } else {
                        // Extract schedule details from reason for enabled auto-restart
                        const scheduleMatch = log.reason.match(/enabled - (.+)$/);
                        const scheduleText = scheduleMatch ? scheduleMatch[1] : 'enabled';
                        actionText += `Auto-restart enabled - ${scheduleText}`;
                        actionSpan.className = 'log-action schedule'; // Yellow for enable with schedule
                    }
                }
                actionText += ` (from ${log.client_ip})`;
                
                actionSpan.textContent = actionText;
                actionSpan.title = log.reason; // Full reason in tooltip
                
                logEntry.appendChild(timestampSpan);
                logEntry.appendChild(actionSpan);
            } else {
                // Legacy log entry format
                const actionSpan = document.createElement('span');
                actionSpan.className = 'log-action info'; // Default to info
                actionSpan.textContent = log.reason;
                
                // Style based on content and prefix
                if (log.reason.startsWith('[SYSTEM]')) {
                    actionSpan.classList.replace('info', 'system');
                } else if (log.reason.startsWith('[USER ACTION]')) {
                    actionSpan.classList.replace('info', 'user-action');
                } else if (log.reason.toLowerCase().includes('error') || log.reason.toLowerCase().includes('failed')) {
                    actionSpan.classList.replace('info', 'warning');
                } else if (log.reason.toLowerCase().includes('completed') || log.reason.toLowerCase().includes('online')) {
                    actionSpan.classList.replace('info', 'success');
                }
                
                logEntry.appendChild(timestampSpan);
                logEntry.appendChild(actionSpan);
            }
            
            logContainer.appendChild(logEntry);
        });
    },

    updateAutorestartDisplay(data) {
        console.log('[UI UPDATE] Updating autorestart toggle displays with data:', JSON.stringify(data, null, 2));
        
        // Handle new format with primary and secondary data
        if (data.primary) {
            const primaryToggle = document.getElementById('primary-autorestart');
            if (primaryToggle) {
                const currentToggleState = primaryToggle.checked;
                const isEnabled = data.primary.autorestart === 1;
                console.log(`[UI UPDATE] Primary toggle - Current UI state: ${currentToggleState}, New DB state: ${isEnabled}, Raw autorestart value: ${data.primary.autorestart}`);
                
                primaryToggle.checked = isEnabled;
                console.log(`[UI UPDATE] Primary autorestart toggle updated from ${currentToggleState} to ${isEnabled}`);
                
                // Store autorestart settings
                this.autorestartSettings.primary = data.primary;
                
                // Update schedule info display
                this.updateScheduleInfoDisplay('primary', data.primary);
                
                // Start or stop countdown timer
                this.updateRestartCountdown('primary', data.primary);
            }
        }
        
        if (data.secondary) {
            const secondaryToggle = document.getElementById('secondary-autorestart');
            if (secondaryToggle) {
                const currentToggleState = secondaryToggle.checked;
                const isEnabled = data.secondary.autorestart === 1;
                console.log(`[UI UPDATE] Secondary toggle - Current UI state: ${currentToggleState}, New DB state: ${isEnabled}, Raw autorestart value: ${data.secondary.autorestart}`);
                
                secondaryToggle.checked = isEnabled;
                console.log(`[UI UPDATE] Secondary autorestart toggle updated from ${currentToggleState} to ${isEnabled}`);
                
                // Store autorestart settings
                this.autorestartSettings.secondary = data.secondary;
                
                // Update schedule info display
                this.updateScheduleInfoDisplay('secondary', data.secondary);
                
                // Start or stop countdown timer
                this.updateRestartCountdown('secondary', data.secondary);
            }
        }
        
        // Fallback for old format (single ISP)
        if (!data.primary && !data.secondary && data.autorestart !== undefined) {
            const primaryToggle = document.getElementById('primary-autorestart');
            if (primaryToggle) {
                const currentToggleState = primaryToggle.checked;
                const isEnabled = data.autorestart === 1;
                console.log(`[UI UPDATE] Primary toggle (legacy) - Current UI state: ${currentToggleState}, New DB state: ${isEnabled}`);
                
                primaryToggle.checked = isEnabled;
                console.log(`[UI UPDATE] Primary autorestart toggle set to: ${isEnabled} (legacy format)`);
            }
        }
    },

    updateScheduleInfoDisplay(ispType, autorestartData) {
        const scheduleInfoElement = document.getElementById(`${ispType}-schedule-info`);
        const scheduleTextElement = scheduleInfoElement?.querySelector('.schedule-text');
        
        if (!scheduleTextElement) return;
        
        if (autorestartData.autorestart === 0) {
            scheduleTextElement.textContent = 'Auto-restart disabled';
            console.log(`[UI UPDATE] ${ispType} schedule info set to disabled`);
        } else {
            // Generate schedule text from the autorestart data
            let scheduleText = 'Auto-restart enabled';
            
            if (autorestartData.daily === 1) {
                scheduleText = `Daily restart at ${String(autorestartData.hour).padStart(2, '0')}:${String(autorestartData.min).padStart(2, '0')}:${String(autorestartData.sec).padStart(2, '0')}`;
            } else if (autorestartData.weekly === 1) {
                const dayNames = ['', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                const dayName = dayNames[autorestartData.dayinweek] || 'Unknown';
                scheduleText = `Weekly restart every ${dayName} at ${String(autorestartData.hour).padStart(2, '0')}:${String(autorestartData.min).padStart(2, '0')}:${String(autorestartData.sec).padStart(2, '0')}`;
            } else if (autorestartData.monthly === 1) {
                const dayNames = ['', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                const weekNames = ['', 'first', 'second', 'third', 'fourth'];
                const dayName = dayNames[autorestartData.dayinweek] || 'Unknown';
                const weekName = weekNames[autorestartData.weekinmonth] || 'Unknown';
                scheduleText = `Monthly restart on the ${weekName} ${dayName} at ${String(autorestartData.hour).padStart(2, '0')}:${String(autorestartData.min).padStart(2, '0')}:${String(autorestartData.sec).padStart(2, '0')}`;
            } else {
                // No specific schedule type set, show generic enabled message
                scheduleText = 'Auto-restart enabled (no schedule configured)';
            }
            
            scheduleTextElement.textContent = scheduleText;
            console.log(`[UI UPDATE] ${ispType} schedule info set to: ${scheduleText}`);
        }
    },

    updateStabilityDisplay(stats) {
        // Update Standard Deviation
        const stdDevElement = document.getElementById('std-dev');
        if (stdDevElement) {
            stdDevElement.textContent = stats.stdDev === '--' ? '--' : `±${stats.stdDev}ms`;
            stdDevElement.className = `stat-value ${this.getStabilityClass('stdDev', stats.stdDev)}`;
        }
        
        // Update Jitter
        const jitterElement = document.getElementById('jitter');
        if (jitterElement) {
            jitterElement.textContent = stats.jitter === '--' ? '--' : `±${stats.jitter}ms`;
            jitterElement.className = `stat-value ${this.getStabilityClass('jitter', stats.jitter)}`;
        }
        
        // Update Packet Loss
        const packetLossElement = document.getElementById('packet-loss');
        if (packetLossElement) {
            packetLossElement.textContent = stats.packetLoss === '--' ? '--' : `${stats.packetLoss}%`;
            packetLossElement.className = `stat-value ${this.getStabilityClass('packetLoss', stats.packetLoss)}`;
        }
        
        // Update Peak Spike
        const peakSpikeElement = document.getElementById('peak-spike');
        if (peakSpikeElement) {
            peakSpikeElement.textContent = stats.peakSpike === '--' ? '--' : `${stats.peakSpike}ms`;
            peakSpikeElement.className = `stat-value ${this.getStabilityClass('peakSpike', stats.peakSpike)}`;
        }
    },

    updateServerIPDisplay() {
        try {
            // Parse the backend URL to extract the hostname/IP and port
            const url = new URL(CONFIG.API_URL);
            const serverIP = document.querySelector('.server-ip');
            
            if (serverIP) {
                // Display hostname:port or just hostname if using default ports
                let displayText = url.hostname;
                
                // Add port if it's not the default for the protocol
                if ((url.protocol === 'http:' && url.port && url.port !== '80') ||
                    (url.protocol === 'https:' && url.port && url.port !== '443')) {
                    displayText += ':' + url.port;
                }
                
                serverIP.textContent = displayText;
                console.log(`[UI UPDATE] Server IP display updated to: ${displayText}`);
            }
        } catch (error) {
            console.error('[UI ERROR] Failed to parse backend URL:', error);
            // Keep the default value if parsing fails
        }
    },

    /******************************************
     * MODAL METHODS
     ******************************************/

    showRestartModal(ispType) {
        const modal = document.getElementById('restartModal');
        const message = document.getElementById('restart-message');
        const durationInputs = document.getElementById('duration-inputs');
        const ispName = ispType === 'primary' ? 'Primary' : 'Secondary';
        
        this.currentRestartRequest = { type: ispType };
        message.textContent = `Are you sure you want to restart the ${ispName} ISP now?`;
        
        // Reset modal state - determine which radio option is selected for this ISP
        const ispRadioGroup = document.querySelector(`#${ispType}-restart`).closest('.isp-island').querySelector('.radio-group');
        const selectedOption = ispRadioGroup.querySelector('.radio-option.selected');
        const selectedValue = selectedOption ? selectedOption.dataset.value : 'now';
        
        // Show/hide duration inputs based on the selected option for this ISP
        if (selectedValue === 'timed') {
            durationInputs.style.display = 'flex';
        } else {
            durationInputs.style.display = 'none';
        }
        
        modal.classList.add('visible');
    },

    hideRestartModal() {
        const modal = document.getElementById('restartModal');
        modal.classList.remove('visible');
        this.currentRestartRequest = null;
    },

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
    },

    hideScheduleModal(successfulSave = false) {
        const modal = document.getElementById('scheduleModal');
        modal.classList.remove('visible');
        
        if (this.currentScheduleRequest) {
            const toggleElement = document.getElementById(`${this.currentScheduleRequest.type}-autorestart`);
            if (toggleElement && !successfulSave) {
                // Only turn OFF toggle if user cancelled (not successful save)
                toggleElement.checked = false;
                console.log(`[DEBUG] Turned OFF ${this.currentScheduleRequest.type} toggle - user cancelled`);
            } else if (successfulSave) {
                console.log(`[DEBUG] Keeping ${this.currentScheduleRequest.type} toggle ON - successful save`);
            }
        }
        
        // Re-enable polling if user cancels without saving
        if (this.pauseAutorestartPolling && !successfulSave) {
            console.log(`[DEBUG] Re-enabling autorestart polling - schedule modal cancelled`);
            this.pauseAutorestartPolling = false;
        }
        
        this.currentScheduleRequest = null;
    },

    showServerModal() {
        const modal = document.getElementById('serverModal');
        const input = document.getElementById('server-url-input');
        
        if (modal && input) {
            // Pre-populate with current URL without the API endpoint
            const baseURL = CONFIG.API_URL.replace('/api/ping-data', '');
            input.value = baseURL;
            modal.classList.add('visible');
            
            // Focus the input after a short delay to ensure the modal is visible
            setTimeout(() => input.focus(), 100);
        }
    },

    hideServerModal() {
        const modal = document.getElementById('serverModal');
        if (modal) {
            modal.classList.remove('visible');
        }
    },

    /******************************************
     * SCHEDULE UI METHODS
     ******************************************/

    updateScheduleLayout() {
        const frequency = document.getElementById('schedule-frequency').value;
        const dayColumn = document.getElementById('day-column');
        
        if (frequency === 'daily') {
            dayColumn.style.display = 'none';
        } else {
            dayColumn.style.display = 'flex';
        }
    },

    updateSchedulePreview() {
        const frequency = document.getElementById('schedule-frequency').value;
        const day = document.getElementById('schedule-day').value;
        const hour = document.getElementById('schedule-hour').value;
        const minute = document.getElementById('schedule-minute').value;
        
        const preview = document.getElementById('schedule-preview');
        const text = this.generateScheduleText(frequency, day, hour, minute);
        preview.textContent = text;
    },

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
    },

    async saveSchedule() {
        if (!this.currentScheduleRequest) return;
        
        const frequency = document.getElementById('schedule-frequency').value;
        const day = document.getElementById('schedule-day').value;
        const hour = document.getElementById('schedule-hour').value;
        const minute = document.getElementById('schedule-minute').value;
        
        console.log(`[DEBUG] saveSchedule() reading form values:`, {
            frequency, day, hour, minute
        });
        
        const ispId = this.currentScheduleRequest.type === 'primary' ? 0 : 1;
        const ispName = this.currentScheduleRequest.type === 'primary' ? 'Primary' : 'Secondary';
        
        try {
            // Send schedule to backend
            const success = await this.sendScheduleToBackend(frequency, day, hour, minute, ispId);
            
            if (success) {
                // Enable auto-restart toggle immediately (no server wait)
                const toggleElement = document.getElementById(`${this.currentScheduleRequest.type}-autorestart`);
                if (toggleElement) {
                    toggleElement.checked = true;
                }
                
                // Update the schedule display immediately with the user's input
                const humanReadable = this.createHumanReadableFromForm(frequency, day, hour, minute);
                const scheduleInfoElement = document.getElementById(`${this.currentScheduleRequest.type}-schedule-info`);
                if (scheduleInfoElement) {
                    const scheduleTextElement = scheduleInfoElement.querySelector('.schedule-text');
                    if (scheduleTextElement) {
                        scheduleTextElement.textContent = humanReadable;
                        console.log(`[DEBUG] Set ${this.currentScheduleRequest.type} schedule text to: ${humanReadable}`);
                    }
                }
                
                const timestamp = new Date().toLocaleTimeString();
                console.log(`[SCHEDULE] ${timestamp} - ${ispName} ISP Auto-Restart Schedule Saved to Database`);
                
                // Immediately refresh activity logs to show the schedule action
                setTimeout(() => {
                    this.fetchActivityLogs();
                }, 1000); // 1 second delay to ensure backend has logged the action
                
                // Wait longer before re-enabling polling to allow database to update
                setTimeout(() => {
                    console.log(`[DEBUG] Re-enabling autorestart polling after ${ispName} schedule save`);
                    this.pauseAutorestartPolling = false;
                }, 3000); // 3 second delay to ensure database has updated
                
            } else {
                // Keep the modal open and show error, re-enable polling
                this.pauseAutorestartPolling = false;
                alert('Failed to save schedule to backend. Please try again.');
                return;
            }
        } catch (error) {
            console.error('Error saving schedule:', error);
            // Re-enable polling on error
            this.pauseAutorestartPolling = false;
            alert('Error saving schedule to backend. Please try again.');
            return;
        }
        
        this.hideScheduleModal(true); // Pass true to indicate successful save
    },

    createHumanReadableFromForm(frequency, day, hour, minute) {
        // Convert form inputs to human-readable text immediately (client-side)
        const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
        
        let result;
        if (frequency === 'daily') {
            result = `Daily restart at ${timeStr}`;
        } else if (frequency === 'weekly') {
            const dayName = day.charAt(0).toUpperCase() + day.slice(1); // Capitalize first letter
            result = `Weekly restart every ${dayName} at ${timeStr}`;
        } else if (frequency === 'monthly') {
            const dayName = day.charAt(0).toUpperCase() + day.slice(1); // Capitalize first letter
            result = `Monthly restart on the first ${dayName} at ${timeStr}`;
        } else {
            result = `restart at ${timeStr} (schedule type unknown)`;
        }
        
        console.log(`[DEBUG] Human readable result: ${result}`);
        return result;
    },

    convertScheduleToHumanReadable(scheduleData) {
        const { daily, weekly, monthly, hour, min, dayinweek, weekinmonth } = scheduleData;
        
        console.log('[DEBUG] Converting schedule to human readable:', scheduleData);
        console.log('[DEBUG] Raw dayinweek value:', dayinweek, 'type:', typeof dayinweek);
        
        const dayNames = {
            1: 'Sunday',
            2: 'Monday',
            3: 'Tuesday', 
            4: 'Wednesday',
            5: 'Thursday',
            6: 'Friday',
            7: 'Saturday'
        };
        
        const weekNames = {
            1: 'first',
            2: 'second',
            3: 'third',
            4: 'fourth'
        };
        
        // Format time with leading zeros
        const timeStr = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`;
        
        let result;
        if (daily === 1) {
            result = `restart daily at ${timeStr}`;
        } else if (weekly === 1) {
            const dayName = dayNames[dayinweek] || `day ${dayinweek}`;
            result = `restart weekly every ${dayName} at ${timeStr}`;
        } else if (monthly === 1) {
            const dayName = dayNames[dayinweek] || `day ${dayinweek}`;
            const weekName = weekNames[weekinmonth] || `week ${weekinmonth}`;
            console.log(`[DEBUG] Monthly schedule: dayinweek=${dayinweek} -> dayName="${dayName}", weekinmonth=${weekinmonth} -> weekName="${weekName}"`);
            result = `restart monthly on the ${weekName} ${dayName} at ${timeStr}`;
        } else {
            // Fallback for unknown schedule type
            result = `restart at ${timeStr} (schedule type unknown)`;
        }
        
        console.log('[DEBUG] Human readable result:', result);
        return result;
    },

    updateRestartCountdown(ispType, autorestartData) {
        const countdownElement = document.getElementById(`${ispType}-restart-in`);
        if (!countdownElement) return;

        // Clear existing interval
        if (this.restartCountdownIntervals[ispType]) {
            clearInterval(this.restartCountdownIntervals[ispType]);
            delete this.restartCountdownIntervals[ispType];
        }

        if (!autorestartData || autorestartData.autorestart !== 1) {
            // No autorestart scheduled
            countdownElement.textContent = '--:--:--';
            countdownElement.className = 'clock-display countdown';
            return;
        }

        const updateCountdown = () => {
            const nextRestart = this.calculateNextRestartTime(autorestartData);
            if (!nextRestart) {
                countdownElement.textContent = '--:--:--';
                return;
            }

            const now = new Date();
            const timeUntilRestart = nextRestart - now;

            if (timeUntilRestart <= 0) {
                // Restart should be happening now
                countdownElement.textContent = 'RESTARTING';
                countdownElement.className = 'clock-display countdown warning';
                return;
            }

            // Calculate days, hours, minutes, seconds
            const days = Math.floor(timeUntilRestart / (1000 * 60 * 60 * 24));
            const hours = Math.floor((timeUntilRestart % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((timeUntilRestart % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((timeUntilRestart % (1000 * 60)) / 1000);

            let displayText;
            if (days > 0) {
                displayText = `${days}d ${hours}h ${minutes}m`;
            } else if (hours > 0) {
                displayText = `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            } else {
                displayText = `${minutes}:${String(seconds).padStart(2, '0')}`;
            }

            countdownElement.textContent = displayText;
            
            // Add warning class if restart is within 5 minutes
            if (timeUntilRestart < 5 * 60 * 1000) {
                countdownElement.className = 'clock-display countdown warning';
            } else {
                countdownElement.className = 'clock-display countdown';
            }
        };

        // Update immediately
        updateCountdown();

        // Update every second
        this.restartCountdownIntervals[ispType] = setInterval(updateCountdown, 1000);
    },

    updateAutoRestartDisplayFromData(ispType, autorestartData) {
        console.log(`[DEBUG] Updating ${ispType} autorestart display:`, autorestartData);
        
        // Update toggle button state
        const toggleElement = document.getElementById(`${ispType}-autorestart`);
        if (toggleElement) {
            toggleElement.checked = autorestartData.autorestart === 1;
            console.log(`[DEBUG] Set ${ispType} toggle to:`, autorestartData.autorestart === 1);
        }
        
        // Update schedule info display
        const scheduleElement = document.getElementById(`${ispType}-schedule-info`);
        if (scheduleElement) {
            const scheduleText = scheduleElement.querySelector('.schedule-text');
            if (autorestartData.autorestart === 1) {
                const humanReadableSchedule = this.convertScheduleToHumanReadable(autorestartData);
                scheduleText.textContent = `Auto-restart is set to ${humanReadableSchedule}`;
                console.log(`[DEBUG] Set ${ispType} schedule text to:`, humanReadableSchedule);
            } else {
                scheduleText.textContent = 'Auto-restart disabled';
                console.log(`[DEBUG] Set ${ispType} schedule text to: disabled`);
            }
        }
    },

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
                        borderWidth: 2.5,
                        pointRadius: 1,
                        pointHoverRadius: 2
                    },
                    {
                        label: 'Google',
                        data: [],
                        borderColor: '#0F9D58',
                        backgroundColor: 'rgba(15, 157, 88, 0.1)',
                        tension: 0.1,
                        borderWidth: 2.5,
                        pointRadius: 1,
                        pointHoverRadius: 2
                    },
                    {
                        label: 'Facebook',
                        data: [],
                        borderColor: '#1778F2',
                        backgroundColor: 'rgba(23, 120, 242, 0.1)',
                        tension: 0.1,
                        borderWidth: 2.5,
                        pointRadius: 1,
                        pointHoverRadius: 2
                    },
                    {
                        label: 'X (Twitter)',
                        data: [],
                        borderColor: '#000000',
                        backgroundColor: 'rgba(0, 0, 0, 0.1)',
                        tension: 0.1,
                        borderWidth: 2.5,
                        pointRadius: 1,
                        pointHoverRadius: 2
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
    },

    updateChart() {
        if (!this.chart || this.pingData.length === 0) return;
        
        // Get style settings for current time range
        const chartStyle = this.getChartStyleForTimeRange(this.selectedTimeRange);
        
        // Use all data to preserve spikes and anomalies - no sampling
        const labels = [];
        const cloudflareData = [];
        const googleData = [];
        const facebookData = [];
        const xData = [];
        
        this.pingData.forEach(ping => {
            const date = new Date(ping.untimesec * 1000);
            // Use shorter time format for longer ranges with many data points
            const timeFormat = this.pingData.length > 100 ? 
                date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) :
                date.toLocaleTimeString();
            labels.push(timeFormat);
            
            cloudflareData.push(ping.cloudflare > 0 ? ping.cloudflare : null);
            googleData.push(ping.google > 0 ? ping.google : null);
            facebookData.push(ping.facebook > 0 ? ping.facebook : null);
            xData.push(ping.x > 0 ? ping.x : null);
        });
        
        // Update chart data
        this.chart.data.labels = labels;
        this.chart.data.datasets[0].data = cloudflareData;
        this.chart.data.datasets[1].data = googleData;
        this.chart.data.datasets[2].data = facebookData;
        this.chart.data.datasets[3].data = xData;
        
        // Update chart styling based on time range - much smaller points
        this.chart.data.datasets.forEach(dataset => {
            dataset.borderWidth = chartStyle.lineWidth;
            dataset.pointRadius = chartStyle.pointRadius;
            dataset.pointHoverRadius = Math.max(chartStyle.pointRadius + 0.5, 2);
        });
        
        this.chart.update('none'); // No animation for real-time updates
    },

    selectTimeRange(range) {
        // Update active button
        document.querySelectorAll('[data-range]').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-range="${range}"]`).classList.add('active');
        
        this.selectedTimeRange = range;
        this.fetchLatencyData(range);
    },

    /******************************************
     * TIME/UPTIME METHODS
     ******************************************/

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
    },

    updateUptimeClocks() {
        const currentTime = Math.floor(Date.now() / 1000); // Current Unix time in seconds
        
        // Update primary ISP uptime (default to 0 if no restart time data)
        const primaryRestartTime = this.restartTimes?.primary || 0;
        this.updateISPUptime('primary', primaryRestartTime, currentTime);
        
        // Update secondary ISP uptime (default to 0 if no restart time data)  
        const secondaryRestartTime = this.restartTimes?.secondary || 0;
        this.updateISPUptime('secondary', secondaryRestartTime, currentTime);
    },

    updateISPUptime(ispType, lastRestartTime, currentTime) {
        const uptimeElement = document.getElementById(`${ispType}-uptime`);
        const labelElement = uptimeElement?.parentElement.querySelector('.clock-label');
        
        if (!uptimeElement) return;
        
        // Get the ISP state to check if it's in downtime
        const ispState = this.ispStates[ispType];
        const isOffline = ispState && (ispState.powerstate === 0 || ispState.powerstate === false);
        const offUntil = ispState?.offuntiluxtimesec || 0;
        const offRequestedAt = ispState?.uxtimewhenoffrequested || 0;
        
        // Check if ISP is offline (regardless of the scheduled end time)
        if (isOffline && offRequestedAt > 0) {
            // ISP is in downtime - show downtime counter
            // Keep counting until server confirms ISP is back online
            const downtimeSeconds = currentTime - offRequestedAt;
            const formatted = this.formatUptime(Math.max(0, downtimeSeconds));
            
            uptimeElement.textContent = formatted;
            uptimeElement.className = 'clock-display downtime';
            uptimeElement.style.color = '#ff4444'; // Red color for downtime
            if (labelElement) {
                labelElement.textContent = 'Downtime';
                labelElement.style.color = '#ff4444'; // Red label too
            }
        } else {
            // Normal uptime display
            // Only clear color styling if we're connected to the server
            if (this.serverConnected) {
                uptimeElement.style.color = '';
                if (labelElement) labelElement.style.color = '';
            }
            
            // Check if we're waiting for fresh restart time after downtime
            if (this.pendingUptimeUpdate[ispType]) {
                // ISP is back online but we're waiting for fresh restart time from server
                uptimeElement.textContent = '--:--:--';
                uptimeElement.className = 'clock-display uptime-unknown';
                if (labelElement) labelElement.textContent = 'Uptime';
                console.log(`[UPTIME] ${ispType} ISP showing placeholder - waiting for fresh restart time`);
            } else if (lastRestartTime === 0) {
                // No restart time recorded - show --:--:--
                uptimeElement.textContent = '--:--:--';
                uptimeElement.className = 'clock-display uptime-unknown';
                if (labelElement) labelElement.textContent = 'Uptime';
            } else {
                // Calculate uptime since last restart
                const uptimeSeconds = currentTime - lastRestartTime;
                const formatted = this.formatUptime(uptimeSeconds);
                
                uptimeElement.textContent = formatted;
                // Only update class if we're connected (to preserve the stale state)
                if (this.serverConnected) {
                    uptimeElement.className = 'clock-display uptime';
                }
                if (labelElement) labelElement.textContent = 'Uptime';
            }
        }
    },

    formatUptime(seconds) {
        if (seconds < 0) seconds = 0;
        
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        // Format with days if >= 24 hours (1 day), otherwise just HH:MM:SS
        if (days > 0) {
            return `${days}d ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
    },

    /******************************************
     * AUTO-RESTART UI HANDLERS
     ******************************************/

    handleAutoRestartToggle(ispType, enabled) {
        if (enabled) {
            // Pause polling immediately when user starts setting schedule
            this.pauseAutorestartPolling = true;
            console.log(`[DEBUG] Paused autorestart polling - user setting ${ispType} schedule`);
            this.showScheduleModal(ispType);
        } else {
            this.toggleAutoRestart(ispType, false);
        }
    },

    updateStatsTimeRange(range) {
        console.log(`[STATS RANGE] Time range changed to: ${range} (was: ${this.selectedStatsTimeRange})`);
        
        // Update the selected range
        this.selectedStatsTimeRange = range;
        
        // Calculate stats for new range (will use cache if available)
        console.log(`[STATS RANGE] Calculating stats for ${range}`);
        this.calculateConnectionStability(range);
        
        // Update signal bar based on new time range
        this.updateSignalBarFromTimeRange();
    },

    /******************************************
     * HELPER METHODS FOR UI STYLING
     ******************************************/

    getStabilityClass(metric, value) {
        if (value === '--' || typeof value !== 'number') return 'unknown';
        
        switch (metric) {
            case 'stdDev':
                if (value <= 5) return 'stable';
                if (value <= 15) return 'moderate';
                return 'unstable';
                
            case 'jitter':
                if (value <= 5) return 'stable';
                if (value <= 20) return 'moderate';
                return 'unstable';
                
            case 'packetLoss':
                if (value <= 0.1) return 'stable';
                if (value <= 1) return 'moderate';
                return 'unstable';
                
            case 'peakSpike':
                if (value <= 100) return 'stable';
                if (value <= 300) return 'moderate';
                return 'unstable';
                
            default:
                return 'unknown';
        }
    }
});