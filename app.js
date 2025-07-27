// ISP Network Monitor - Industrial Control Panel
// Frontend2 Application Logic

class ISPMonitor {
    constructor() {
        this.init();
        this.setupEventListeners();
        this.startClock();
        this.initChart();
        this.loadDemoData();
    }

    init() {
        console.log('🔧 ISP Monitor Control Panel Initialized');
        
        // Demo state management
        this.primaryISP = {
            id: 0,
            name: 'T-Mobile 5G',
            online: true,
            uptime: Date.now() - (168 * 3600 + 42 * 60 + 15) * 1000,
            restartMode: 'now',
            avgLatency24h: 28, // milliseconds
            techSupport: '1-877-746-0909',
            accountNumber: '987654321'
        };

        this.secondaryISP = {
            id: 1,
            name: 'Mercury Broadband',
            online: false,
            downtime: Date.now() - (12 * 3600 + 25 * 60 + 33) * 1000,
            restartMode: 'now',
            avgLatency24h: 45, // milliseconds
            techSupport: '1-855-637-2879',
            accountNumber: 'MB-456789012'
        };

        this.networkInfo = {
            activeConnection: 'T-Mobile 5G',
            publicIP: '192.168.1.100',
            location: 'New York, NY',
            activeISP: 'primary' // tracks which ISP is currently active
        };

        this.currentRestartRequest = null;
        this.currentScheduleRequest = null;
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

        // Log controls
        document.getElementById('clear-log')?.addEventListener('click', () => this.clearLog());
        document.getElementById('export-log')?.addEventListener('click', () => this.exportLog());

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

        // Schedule input change listeners for live preview and layout
        document.getElementById('schedule-frequency')?.addEventListener('change', () => {
            this.updateScheduleLayout();
            this.updateSchedulePreview();
        });
        document.getElementById('schedule-day')?.addEventListener('change', () => this.updateSchedulePreview());
        document.getElementById('schedule-hour')?.addEventListener('change', () => this.updateSchedulePreview());
        document.getElementById('schedule-minute')?.addEventListener('change', () => this.updateSchedulePreview());
    }

    setupRadioGroups() {
        // Setup radio groups for restart options
        document.querySelectorAll('.radio-group').forEach(group => {
            group.addEventListener('click', (e) => {
                const option = e.target.closest('.radio-option');
                if (option) {
                    // Remove selected from siblings
                    group.querySelectorAll('.radio-option').forEach(opt => opt.classList.remove('selected'));
                    // Add selected to clicked option
                    option.classList.add('selected');
                    
                    // Update restart mode based on island
                    const island = group.closest('.isp-island');
                    const isPrimary = island.querySelector('#primary-restart') !== null;
                    const mode = option.dataset.value;
                    
                    if (isPrimary) {
                        this.primaryISP.restartMode = mode;
                    } else {
                        this.secondaryISP.restartMode = mode;
                    }
                }
            });
        });
    }

    startClock() {
        this.updateClocks();
        setInterval(() => this.updateClocks(), 1000);
    }

    updateClocks() {
        const now = Date.now();
        
        // Primary ISP uptime
        if (this.primaryISP.online) {
            const uptime = Math.floor((now - this.primaryISP.uptime) / 1000);
            document.getElementById('primary-uptime').textContent = this.formatDuration(uptime);
        }
        
        // Secondary ISP downtime
        if (!this.secondaryISP.online) {
            const downtime = Math.floor((now - this.secondaryISP.downtime) / 1000);
            document.getElementById('secondary-uptime').textContent = this.formatDuration(downtime);
        }
        
        // Update status indicators
        this.updateStatusIndicators();
        this.updateNetworkSignalBars();
        this.updateActiveISPBorder();
    }

    formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${String(hours).padStart(3, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    updateStatusIndicators() {
        // Primary ISP
        const primaryIndicator = document.getElementById('primary-indicator');
        const primaryStatus = document.getElementById('primary-status');
        
        if (this.primaryISP.online) {
            primaryIndicator.className = 'indicator active';
            primaryStatus.textContent = 'ONLINE';
        } else {
            primaryIndicator.className = 'indicator error';
            primaryStatus.textContent = 'OFFLINE';
        }
        
        // Secondary ISP
        const secondaryIndicator = document.getElementById('secondary-indicator');
        const secondaryStatus = document.getElementById('secondary-status');
        
        if (this.secondaryISP.online) {
            secondaryIndicator.className = 'indicator active';
            secondaryStatus.textContent = 'ONLINE';
        } else {
            secondaryIndicator.className = 'indicator inactive';
            secondaryStatus.textContent = 'OFFLINE';
        }
    }

    updateNetworkSignalBars() {
        // Get the current average latency based on stats time range
        const currentLatency = this.getCurrentAverageLatency();
        
        const signalContainer = document.getElementById('network-signal');
        if (!signalContainer) return;

        const bars = signalContainer.querySelectorAll('.signal-bar');
        
        // Reset all bars
        bars.forEach(bar => {
            bar.classList.remove('active', 'weak', 'poor');
        });

        // Determine signal strength based on current average latency
        let activeBars = 0;
        let barClass = 'active';

        if (currentLatency <= 30) {
            activeBars = 5; // 20-30ms = 5 bars
            barClass = 'active';
        } else if (currentLatency <= 50) {
            activeBars = 4; // 30-50ms = 4 bars
            barClass = 'active';
        } else if (currentLatency <= 70) {
            activeBars = 3; // 50-70ms = 3 bars
            barClass = 'weak';
        } else if (currentLatency <= 120) {
            activeBars = 2; // 70-120ms = 2 bars
            barClass = 'weak';
        } else {
            activeBars = 1; // 120+ms = 1 bar
            barClass = 'poor';
        }

        // Apply the appropriate class to active bars
        for (let i = 0; i < activeBars && i < bars.length; i++) {
            bars[i].classList.add(barClass);
        }

        // Update tooltip with current time range
        const timeRange = this.currentStatsTimeRange || '15min';
        const displayRange = timeRange.replace('min', 'm').replace('hr', 'h').replace('day', 'd');
        signalContainer.setAttribute('title', 
            `Network signal strength based on average latency over ${displayRange} (${currentLatency.toFixed(1)}ms)`);
    }

    getCurrentAverageLatency() {
        // Get a realistic latency value based on the current time range
        const timeRange = this.currentStatsTimeRange || '15min';
        const multiplier = this.getTimeRangeMultiplier(timeRange);
        
        // Base latency for the active connection (primary ISP in demo)
        const baseLatency = this.networkInfo.activeISP === 'primary' 
            ? this.primaryISP.avgLatency24h 
            : this.secondaryISP.avgLatency24h;
            
        return baseLatency * multiplier;
    }

    updateActiveISPBorder() {
        // Remove active class from all ISP islands
        document.querySelectorAll('.isp-island').forEach(island => {
            island.classList.remove('active-connection');
        });

        // Add active class to the current active ISP
        const activeIsland = document.querySelector(`.isp-island:${this.networkInfo.activeISP === 'primary' ? 'first' : 'last'}-of-type`);
        if (activeIsland) {
            activeIsland.classList.add('active-connection');
        }
    }

    showRestartModal(ispType) {
        const modal = document.getElementById('restartModal');
        const message = document.getElementById('restart-message');
        const durationInputs = document.getElementById('duration-inputs');
        
        const isp = ispType === 'primary' ? this.primaryISP : this.secondaryISP;
        const ispName = ispType === 'primary' ? 'Primary' : 'Secondary';
        
        this.currentRestartRequest = { type: ispType, isp: isp };
        
        if (isp.restartMode === 'now') {
            message.textContent = `Are you sure you want to restart the ${ispName} ISP immediately?`;
            durationInputs.style.display = 'none';
        } else {
            // Create inline duration message and inputs
            const durationMessage = document.createElement('span');
            durationMessage.className = 'duration-message';
            durationMessage.textContent = `Set the duration for ${ispName} ISP restart:`;
            
            // Clear and rebuild duration inputs container
            durationInputs.innerHTML = '';
            durationInputs.appendChild(durationMessage);
            
            // Add the time inputs
            const hoursInput = document.createElement('div');
            hoursInput.className = 'number-input';
            hoursInput.innerHTML = `
                <label class="number-input-label">Hours</label>
                <input type="number" min="0" max="23" value="0" placeholder="00" id="restart-hours">
            `;
            
            const separator = document.createElement('div');
            separator.className = 'timer-separator';
            separator.textContent = ':';
            
            const minutesInput = document.createElement('div');
            minutesInput.className = 'number-input';
            minutesInput.innerHTML = `
                <label class="number-input-label">Minutes</label>
                <input type="number" min="1" max="59" value="5" placeholder="05" id="restart-minutes">
            `;
            
            durationInputs.appendChild(hoursInput);
            durationInputs.appendChild(separator);
            durationInputs.appendChild(minutesInput);
            
            message.textContent = '';
            durationInputs.style.display = 'flex';
        }
        
        modal.classList.add('visible');
    }

    hideRestartModal() {
        const modal = document.getElementById('restartModal');
        modal.classList.remove('visible');
        this.currentRestartRequest = null;
    }

    confirmRestart() {
        if (!this.currentRestartRequest) return;
        
        const { type, isp } = this.currentRestartRequest;
        
        if (isp.restartMode === 'now') {
            this.performRestart(type, 0);
        } else {
            const hours = parseInt(document.getElementById('restart-hours').value) || 0;
            const minutes = parseInt(document.getElementById('restart-minutes').value) || 0;
            const totalMinutes = hours * 60 + minutes;
            
            if (totalMinutes > 0) {
                this.performRestart(type, totalMinutes);
            } else {
                alert('Please enter a valid duration');
                return;
            }
        }
        
        this.hideRestartModal();
    }

    performRestart(ispType, durationMinutes) {
        const timestamp = new Date().toLocaleTimeString();
        const ispName = ispType === 'primary' ? 'Primary' : 'Secondary';
        
        let logMessage, logClass;
        
        if (durationMinutes === 0) {
            logMessage = `${ispName} ISP Manual Restart Initiated (Immediate)`;
            logClass = 'warning';
        } else {
            const hours = Math.floor(durationMinutes / 60);
            const mins = durationMinutes % 60;
            const durationText = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
            logMessage = `${ispName} ISP Manual Restart Initiated (${durationText} duration)`;
            logClass = 'warning';
        }
        
        this.addLogEntry(timestamp, logMessage, logClass);
        
        // Demo: Temporarily set ISP offline
        if (ispType === 'primary') {
            this.primaryISP.online = false;
            this.primaryISP.downtime = Date.now();
        } else {
            this.secondaryISP.online = false;
            this.secondaryISP.downtime = Date.now();
        }
        
        // Demo: Restore after duration (or 5 seconds for immediate)
        const restoreTime = durationMinutes === 0 ? 5000 : Math.min(durationMinutes * 1000, 30000);
        setTimeout(() => {
            if (ispType === 'primary') {
                this.primaryISP.online = true;
                this.primaryISP.uptime = Date.now();
            } else {
                this.secondaryISP.online = true;
                this.secondaryISP.uptime = Date.now();
            }
            
            const restoreTimestamp = new Date().toLocaleTimeString();
            this.addLogEntry(restoreTimestamp, `${ispName} ISP Restart Completed`, 'success');
        }, restoreTime);
        
        console.log(`🔄 ${ispName} ISP restart initiated:`, { durationMinutes });
    }

    handleAutoRestartToggle(ispType, enabled) {
        if (enabled) {
            // Show schedule modal when enabling auto-restart
            this.showScheduleModal(ispType);
        } else {
            // Directly disable auto-restart
            this.toggleAutoRestart(ispType, false);
        }
    }

    toggleAutoRestart(ispType, enabled) {
        const timestamp = new Date().toLocaleTimeString();
        const ispName = ispType === 'primary' ? 'Primary' : 'Secondary';
        const action = enabled ? 'Enabled' : 'Disabled';
        
        this.addLogEntry(timestamp, `${ispName} ISP Auto-Restart ${action}`, 'info');
        
        // Update schedule info display
        const scheduleElement = document.getElementById(`${ispType}-schedule-info`);
        if (scheduleElement) {
            const scheduleText = scheduleElement.querySelector('.schedule-text');
            if (enabled) {
                scheduleText.textContent = 'Auto-restart is set to restart on the first week of every month on Monday at 12:00:00';
            } else {
                scheduleText.textContent = 'Auto-restart disabled';
            }
        }
        
        console.log(`⚙️ ${ispName} auto-restart ${action.toLowerCase()}`);
    }

    showScheduleModal(ispType) {
        const modal = document.getElementById('scheduleModal');
        const ispName = ispType === 'primary' ? 'Primary' : 'Secondary';
        const ispNameElement = document.getElementById('schedule-isp-name');
        const ispLogoElement = document.getElementById('schedule-isp-logo');
        
        this.currentScheduleRequest = { type: ispType };
        
        // Update ISP name with bold styling and color
        ispNameElement.textContent = ispName;
        ispNameElement.className = ispType;
        
        // Update ISP logo based on type
        if (ispType === 'primary') {
            ispLogoElement.src = './img/T_Badge_5G.webp';
            ispLogoElement.alt = 'T-Mobile 5G';
        } else {
            ispLogoElement.src = './img/Mercury-Broadband-internet.webp';
            ispLogoElement.alt = 'Mercury Broadband';
        }
        
        // Update layout and preview
        this.updateScheduleLayout();
        this.updateSchedulePreview();
        
        modal.classList.add('visible');
    }

    hideScheduleModal() {
        const modal = document.getElementById('scheduleModal');
        modal.classList.remove('visible');
        
        // Reset the toggle if user cancelled
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
        
        // Enable auto-restart with the configured schedule
        this.toggleAutoRestart(this.currentScheduleRequest.type, true);
        
        // Update the schedule display
        const scheduleElement = document.getElementById(`${this.currentScheduleRequest.type}-schedule-info`);
        if (scheduleElement) {
            const scheduleText = scheduleElement.querySelector('.schedule-text');
            const previewText = this.generateScheduleText(frequency, day, hour, minute);
            scheduleText.textContent = `Auto-restart is set to ${previewText.toLowerCase()}`;
        }
        
        this.hideScheduleModal();
        
        const timestamp = new Date().toLocaleTimeString();
        const ispName = this.currentScheduleRequest.type === 'primary' ? 'Primary' : 'Secondary';
        this.addLogEntry(timestamp, `${ispName} ISP Auto-Restart Schedule Configured`, 'info');
    }

    updateScheduleLayout() {
        const frequency = document.getElementById('schedule-frequency').value;
        const dayColumn = document.getElementById('day-column');
        const scheduleInputs = document.querySelector('.schedule-inputs');
        
        if (frequency === 'daily') {
            // Hide day column for daily schedule and adjust grid
            dayColumn.style.display = 'none';
            scheduleInputs.classList.add('two-column');
        } else {
            // Show day column for weekly and monthly and restore three-column grid
            dayColumn.style.display = 'flex';
            scheduleInputs.classList.remove('two-column');
        }
    }

    updateSchedulePreview() {
        const frequency = document.getElementById('schedule-frequency').value;
        const day = document.getElementById('schedule-day').value;
        const hour = document.getElementById('schedule-hour').value;
        const minute = document.getElementById('schedule-minute').value;
        
        const previewElement = document.getElementById('schedule-preview');
        if (previewElement) {
            previewElement.textContent = this.generateScheduleText(frequency, day, hour, minute);
        }
    }

    generateScheduleText(frequency, day, hour, minute) {
        const dayNames = {
            'monday': 'Monday',
            'tuesday': 'Tuesday', 
            'wednesday': 'Wednesday',
            'thursday': 'Thursday',
            'friday': 'Friday',
            'saturday': 'Saturday',
            'sunday': 'Sunday'
        };
        
        const time = `${hour}:${minute}`;
        
        switch (frequency) {
            case 'daily':
                return `Daily restart at ${time}`;
            case 'weekly':
                return `Weekly restart every ${dayNames[day]} at ${time}`;
            case 'monthly':
                return `Monthly restart on the first ${dayNames[day]} at ${time}`;
            default:
                return `Restart every ${dayNames[day]} at ${time}`;
        }
    }

    selectTimeRange(range) {
        // Update active button
        document.querySelectorAll('[data-range]').forEach(btn => btn.classList.remove('active'));
        document.querySelector(`[data-range="${range}"]`).classList.add('active');
        
        // Update chart data based on range
        this.updateChartForRange(range);
        
        console.log(`📊 Chart time range changed to: ${range}`);
    }

    updateChartForRange(range) {
        // This would update the chart with different data based on time range
        // For now, just log the change
        const rangeLabels = {
            '5min': '5 Minutes',
            '15min': '15 Minutes', 
            '3hr': '3 Hours',
            '12hr': '12 Hours',
            '24hr': '24 Hours',
            '3day': '3 Days',
            '7day': '7 Days',
            '30day': '30 Days'
        };
        
        // Update chart title or subtitle to show current range
        console.log(`Chart updated for ${rangeLabels[range]} view`);
    }

    addLogEntry(timestamp, message, type = 'info') {
        const logContainer = document.querySelector('.log-container');
        
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        
        entry.innerHTML = `
            <span class="log-timestamp">${timestamp}</span>
            <span class="log-action ${type}">${message}</span>
        `;
        
        // Add to top of log
        logContainer.insertBefore(entry, logContainer.firstChild);
        
        // Keep only last 20 entries
        const entries = logContainer.querySelectorAll('.log-entry');
        if (entries.length > 20) {
            entries[entries.length - 1].remove();
        }
    }

    clearLog() {
        const logContainer = document.querySelector('.log-container');
        logContainer.innerHTML = '';
        
        const timestamp = new Date().toLocaleTimeString();
        this.addLogEntry(timestamp, 'Action log cleared by user', 'info');
        
        console.log('🗑️ Action log cleared');
    }

    exportLog() {
        const entries = document.querySelectorAll('.log-entry');
        const logData = Array.from(entries).map(entry => {
            const timestamp = entry.querySelector('.log-timestamp').textContent;
            const action = entry.querySelector('.log-action').textContent;
            return `${timestamp} - ${action}`;
        }).join('\n');
        
        const blob = new Blob([logData], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `isp-monitor-log-${new Date().toISOString().split('T')[0]}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        
        const timestamp = new Date().toLocaleTimeString();
        this.addLogEntry(timestamp, 'Action log exported to file', 'info');
        
        console.log('💾 Action log exported');
    }

    initChart() {
        // Initialize Chart.js with demo latency data
        const ctx = document.getElementById('latencyChart').getContext('2d');
        
        // Generate demo data
        const now = Date.now();
        const dataPoints = 20;
        const labels = [];
        const cloudflareData = [];
        const googleData = [];
        const facebookData = [];
        const xData = [];
        
        for (let i = dataPoints - 1; i >= 0; i--) {
            const time = new Date(now - i * 45000); // 45 second intervals
            labels.push(time.toLocaleTimeString());
            
            // Generate realistic latency data
            cloudflareData.push(Math.floor(Math.random() * 15) + 15); // 15-30ms
            googleData.push(Math.floor(Math.random() * 10) + 20); // 20-30ms
            facebookData.push(Math.floor(Math.random() * 20) + 25); // 25-45ms
            xData.push(Math.floor(Math.random() * 25) + 30); // 30-55ms
        }
        
        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Cloudflare',
                        data: cloudflareData,
                        borderColor: '#f59e0b', // accent-amber
                        backgroundColor: 'rgba(245, 158, 11, 0.1)',
                        tension: 0.4,
                        pointRadius: 3,
                        pointHoverRadius: 5
                    },
                    {
                        label: 'Google',
                        data: googleData,
                        borderColor: '#4ade80', // accent-green
                        backgroundColor: 'rgba(74, 222, 128, 0.1)',
                        tension: 0.4,
                        pointRadius: 3,
                        pointHoverRadius: 5
                    },
                    {
                        label: 'Facebook',
                        data: facebookData,
                        borderColor: '#3b82f6', // accent-blue
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        tension: 0.4,
                        pointRadius: 3,
                        pointHoverRadius: 5
                    },
                    {
                        label: 'X (Twitter)',
                        data: xData,
                        borderColor: '#06b6d4', // accent-cyan
                        backgroundColor: 'rgba(6, 182, 212, 0.1)',
                        tension: 0.4,
                        pointRadius: 3,
                        pointHoverRadius: 5
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: false
                    },
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#cbd5e1', // text-secondary
                            font: {
                                family: 'Consolas, Monaco, Courier New, monospace',
                                size: 11
                            },
                            padding: 15
                        }
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Time',
                            color: '#94a3b8', // text-muted
                            font: {
                                family: 'Consolas, Monaco, Courier New, monospace',
                                size: 12,
                                weight: 'bold'
                            }
                        },
                        ticks: {
                            color: '#94a3b8', // text-muted
                            font: {
                                family: 'Consolas, Monaco, Courier New, monospace',
                                size: 10
                            }
                        },
                        grid: {
                            color: '#475569' // border-secondary
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Latency (ms)',
                            color: '#94a3b8', // text-muted
                            font: {
                                family: 'Consolas, Monaco, Courier New, monospace',
                                size: 12,
                                weight: 'bold'
                            }
                        },
                        ticks: {
                            color: '#94a3b8', // text-muted
                            font: {
                                family: 'Consolas, Monaco, Courier New, monospace',
                                size: 10
                            }
                        },
                        grid: {
                            color: '#475569' // border-secondary
                        },
                        beginAtZero: true
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
        });
        
        console.log('📈 Latency chart initialized');
        
        // Update chart every 15 seconds with new data point
        setInterval(() => this.updateChart(), 15000);
        
        // Update network statistics every 30 seconds
        setInterval(() => {
            this.updateNetworkStatistics();
            this.updateNetworkSignalBars();
        }, 30000);
    }

    updateChart() {
        if (!this.chart) return;
        
        const now = new Date();
        
        // Add new data point
        this.chart.data.labels.push(now.toLocaleTimeString());
        this.chart.data.datasets[0].data.push(Math.floor(Math.random() * 15) + 15); // Cloudflare
        this.chart.data.datasets[1].data.push(Math.floor(Math.random() * 10) + 20); // Google
        this.chart.data.datasets[2].data.push(Math.floor(Math.random() * 20) + 25); // Facebook
        this.chart.data.datasets[3].data.push(Math.floor(Math.random() * 25) + 30); // X
        
        // Remove old data point (keep last 20)
        if (this.chart.data.labels.length > 20) {
            this.chart.data.labels.shift();
            this.chart.data.datasets.forEach(dataset => dataset.data.shift());
        }
        
        this.chart.update('none'); // No animation for real-time updates
    }

    loadDemoData() {
        // Load demo latency averages
        document.getElementById('avg-15min').textContent = '24ms';
        document.getElementById('avg-1hr').textContent = '26ms';
        document.getElementById('avg-4hr').textContent = '26ms';
        document.getElementById('avg-12hr').textContent = '28ms';
        document.getElementById('avg-24hr').textContent = '25ms';
        document.getElementById('avg-7day').textContent = '27ms';
        
        // Load demo network info
        document.getElementById('active-connection').textContent = this.networkInfo.activeConnection;
        document.getElementById('public-ip').textContent = this.networkInfo.publicIP;
        document.getElementById('location').textContent = this.networkInfo.location;
        
        // Load ISP info fields
        document.getElementById('primary-support-phone').textContent = this.primaryISP.techSupport;
        document.getElementById('primary-account').textContent = this.primaryISP.accountNumber;
        document.getElementById('secondary-support-phone').textContent = this.secondaryISP.techSupport;
        document.getElementById('secondary-account').textContent = this.secondaryISP.accountNumber;
        
        // Load network statistics
        this.currentStatsTimeRange = '15min';
        this.updateNetworkStatistics();
        
        // Initialize active ISP border
        this.updateActiveISPBorder();
        
        console.log('📊 Demo data loaded');
    }

    updateNetworkStatistics() {
        const timeRange = this.currentStatsTimeRange || '15min';
        
        // Generate realistic demo data for network statistics based on time range
        const multiplier = this.getTimeRangeMultiplier(timeRange);
        const stats = {
            stdDev: (Math.random() * 5 * multiplier + 1).toFixed(1), // 1-6ms std dev (scaled)
            jitter: (Math.random() * 15 * multiplier + 3).toFixed(1), // 3-18ms jitter (scaled)
            packetLoss: (Math.random() * 0.1 * multiplier).toFixed(3), // 0-0.1% packet loss (scaled)
            peakSpike: Math.floor(Math.random() * 400 * multiplier + 100) // 100-500ms spike (scaled)
        };

        // Update the values
        document.getElementById('std-dev').textContent = `±${stats.stdDev}ms`;
        document.getElementById('jitter').textContent = `±${stats.jitter}ms`;
        document.getElementById('packet-loss').textContent = `${stats.packetLoss}%`;
        document.getElementById('peak-spike').textContent = `${stats.peakSpike}ms`;

        // Update classes based on values for color coding (adjust thresholds by multiplier)
        this.updateStatClass('std-dev', parseFloat(stats.stdDev), [3 * multiplier, 6 * multiplier]); 
        this.updateStatClass('jitter', parseFloat(stats.jitter), [8 * multiplier, 15 * multiplier]); 
        this.updateStatClass('packet-loss', parseFloat(stats.packetLoss), [0.05 * multiplier, 0.1 * multiplier]); 
        this.updateStatClass('peak-spike', parseInt(stats.peakSpike), [200 * multiplier, 350 * multiplier]);
    }

    getTimeRangeMultiplier(timeRange) {
        // Longer time ranges tend to have more stable averages but potentially higher peaks
        const multipliers = {
            '3min': 0.8,
            '15min': 1.0,
            '60min': 1.1,
            '3hr': 1.2,
            '12hr': 1.3,
            '24hr': 1.4,
            '3day': 1.6,
            '7day': 1.8
        };
        return multipliers[timeRange] || 1.0;
    }

    updateStatsTimeRange(timeRange) {
        this.currentStatsTimeRange = timeRange;
        
        // Update labels to reflect the selected time range
        const displayRange = timeRange.replace('min', 'm').replace('hr', 'h').replace('day', 'd');
        document.getElementById('std-dev-label').textContent = `Std Deviation (${displayRange})`;
        document.getElementById('jitter-label').textContent = `Jitter (${displayRange})`;
        document.getElementById('packet-loss-label').textContent = `Packet Loss (${displayRange})`;
        document.getElementById('peak-spike-label').textContent = `Peak Spike (${displayRange})`;
        
        // Update the statistics with new time range
        this.updateNetworkStatistics();
        
        // Update signal bars to reflect new time range
        this.updateNetworkSignalBars();
        
        console.log(`📊 Connection stability stats updated for ${timeRange}`);
    }

    updateStatClass(elementId, value, thresholds) {
        const element = document.getElementById(elementId);
        if (!element) return;

        element.classList.remove('stable', 'moderate', 'unstable');
        
        if (value < thresholds[0]) {
            element.classList.add('stable');
        } else if (value < thresholds[1]) {
            element.classList.add('moderate');
        } else {
            element.classList.add('unstable');
        }
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.ispMonitor = new ISPMonitor();
});