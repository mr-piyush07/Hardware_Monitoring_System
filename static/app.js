// Automatically detect the correct API backend host
const getApiBase = () => {
    const hostname = window.location.hostname;
    // If running locally or as a local file, default to localhost:8000
    if (!hostname || hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://localhost:8000';
    }
    // If hosting on a specific LAN/WAN IP, use that IP on port 8001
    return `http://${hostname}:8000`;
};

const API_BASE = getApiBase();
let currentToken = localStorage.getItem('iot_token');
let currentRole = localStorage.getItem('iot_role');
let isLoginMode = true;
let activeHwid = null;
let dashboardInterval = null;
let charts = {};

// DOM Elements
const authSection = document.getElementById('auth-section');
const dashboardSection = document.getElementById('dashboard-section');
const authForm = document.getElementById('auth-form');
const toast = document.getElementById('notification-toast');
const devicesContainer = document.getElementById('devices-container');
const integrationContainer = document.getElementById('integration-container');

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    if (currentToken) showDashboard();
    else showAuth();
    // Initialize firmware form & custom dark select UI
    updateFirmwareForm();
    setupCustomSelects();
});

// UI Logic
function toggleAuthMode(login) {
    isLoginMode = login;
    document.getElementById('login-tab-btn').classList.toggle('active', login);
    document.getElementById('register-tab-btn').classList.toggle('active', !login);
    document.getElementById('login-tab-btn').style.color = login ? '#fff' : 'var(--text-muted)';
    document.getElementById('register-tab-btn').style.color = !login ? '#fff' : 'var(--text-muted)';

    document.getElementById('full-name-group').classList.toggle('hidden', login);
    document.getElementById('role-group').classList.toggle('hidden', login);
    document.getElementById('confirm-pass-group').classList.toggle('hidden', login);
    document.getElementById('auth-btn-text').innerText = login ? 'Log In' : 'Create Account';
}
window.toggleAuthMode = toggleAuthMode;

function switchTab(tabId) {
    const rawRole = localStorage.getItem('iot_role') || 'user';
    const role = rawRole.toLowerCase().trim();

    // Strict Abstraction: Prevent unauthorized tab access
    const protectedTabs = {
        'integration': ['admin', 'subadmin'],
        'alerts': ['admin', 'subadmin'],
        'firmware': ['admin']
    };

    if (protectedTabs[tabId] && !protectedTabs[tabId].includes(role)) {
        showNotification("Access Denied: Administrative privileges required", "error");
        return;
    }

    console.log(`[Navigation] Switching to tab: ${tabId}`);

    // Hide all tabs
    const tabs = ['overview', 'dashboard', 'fleet', 'details', 'tickets', 'integration', 'alerts', 'firmware', 'logs', 'incidents', 'users'];
    tabs.forEach(id => {
        const el = document.getElementById(`${id}-tab`);
        if (el) el.classList.add('hidden');
    });

    const targetTab = document.getElementById(`${tabId}-tab`);
    if (targetTab) targetTab.classList.remove('hidden');
    else console.error(`[Nav] Tab not found: ${tabId}-tab`);

    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        const clickAttr = item.getAttribute('onclick');
        if (clickAttr && clickAttr.includes(`'${tabId}'`)) item.classList.add('active');
    });

    const titleMap = {
        'overview': 'System Health Matrix',
        'dashboard': 'Broadcaster Fleet',
        'fleet': 'Live Fleet Matrix',
        'details': 'Advanced Analytics',
        'tickets': 'Support Tickets',
        'integration': 'Device Integration',
        'alerts': 'Trigger Engine',
        'firmware': 'Firmware Lab',
        'logs': 'Traffic Stream',
        'incidents': 'Incidents Queue',
        'users': 'User Administration'
    };
    document.getElementById('tab-title').innerText = titleMap[tabId] || 'Dashboard';
    document.getElementById('tab-breadcrumb').innerText = `Fleet / ${tabId.toUpperCase()}`;

    if (tabId === 'overview') { loadOverviewData(); }
    if (tabId === 'dashboard') loadDevices();
    if (tabId === 'fleet') loadFleetMatrix();
    if (tabId === 'integration') loadIntegrationDevices();
    if (tabId === 'tickets') loadTickets();
    if (tabId === 'alerts') loadAlertsData();
    if (tabId === 'firmware') updateFirmwareForm();
    if (tabId === 'logs') startLogStream();
    if (tabId === 'incidents') loadIncidents();
    if (tabId === 'users') loadUsers();

    setTimeout(setupCustomSelects, 50);

    // Auto-refresh overview every 30 s
    if (dashboardInterval) { clearInterval(dashboardInterval); dashboardInterval = null; }
    if (tabId === 'overview') {
        dashboardInterval = setInterval(() => {
            const activeTab = document.querySelector('.nav-item.active');
            if (activeTab && activeTab.getAttribute('onclick') && activeTab.getAttribute('onclick').includes('overview')) {
                loadOverviewData();
            } else {
                clearInterval(dashboardInterval);
                dashboardInterval = null;
            }
        }, 30000);
    }
}
window.switchTab = switchTab;

// Auth Handling
authForm.onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
        if (isLoginMode) {
            const formData = new URLSearchParams();
            formData.append('username', email);
            formData.append('password', password);
            const res = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData
            });
            const data = await res.json();
            if (res.ok) {
                currentToken = data.access_token;
                currentRole = data.role;
                localStorage.setItem('iot_token', currentToken);
                localStorage.setItem('iot_role', data.role);
                localStorage.setItem('iot_user_name', data.full_name);
                showDashboard();
            } else showNotification(data.detail || 'Login failed', 'error');
        } else {
            const full_name = document.getElementById('full_name').value;
            const role = document.getElementById('role_select').value;
            const confirm_password = document.getElementById('confirm_password').value;
            if (password !== confirm_password) return showNotification("Passwords do not match", "error");

            const res = await fetch(`${API_BASE}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, full_name, role })
            });
            const data = await res.json();
            if (res.ok) {
                showNotification('Account Created! Please Login.', 'success');
                toggleAuthMode(true);
            } else showNotification(data.detail || 'Registration failed', 'error');
        }
    } catch (err) { showNotification('Backend connection failed', 'error'); }
};

function showAuth() {
    authSection.classList.remove('hidden');
    dashboardSection.classList.add('hidden');
}

function showDashboard() {
    authSection.classList.add('hidden');
    dashboardSection.classList.remove('hidden');
    applyRolePermissions();
    switchTab('overview');
}

function applyRolePermissions() {
    let rawRole = localStorage.getItem('iot_role');
    if (!rawRole || rawRole === 'undefined' || rawRole === 'null') {
        rawRole = 'user';
    }
    const role = rawRole.toLowerCase().trim();
    const userName = localStorage.getItem('iot_user_name') || 'User';

    console.log(`[ACL Check] User: ${userName}, Role: ${role}`);

    const nameEl = document.getElementById('user-display-name');
    const roleEl = document.getElementById('user-display-role');

    if (nameEl) nameEl.innerText = userName;
    if (roleEl) roleEl.innerText = role.toUpperCase();

    // Strict UI Gating
    const adminOnlyEls = document.querySelectorAll('.admin-only');
    console.log(`[ACL Check] Found ${adminOnlyEls.length} .admin-only elements`);
    adminOnlyEls.forEach(el => {
        if (role === 'admin') el.classList.remove('hidden');
        else el.classList.add('hidden');
    });

    const adminSubEls = document.querySelectorAll('.admin-or-subadmin');
    console.log(`[ACL Check] Found ${adminSubEls.length} .admin-or-subadmin elements`);
    adminSubEls.forEach(el => {
        if (role === 'admin' || role === 'subadmin') el.classList.remove('hidden');
        else el.classList.add('hidden');
    });
}

function handleLogout() {
    localStorage.clear();
    location.reload();
}
window.handleLogout = handleLogout;

// Notification Utility
function showNotification(msg, type = 'info') {
    const toast = document.getElementById('notification-toast');
    const toastMsg = document.getElementById('toast-message');
    toastMsg.innerText = msg;
    toast.style.background = type === 'error' ? 'var(--danger)' : (type === 'success' ? 'var(--success)' : 'var(--accent)');
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 4000);
}

// Overview Charts initialization
function initOverviewCharts() {
    loadOverviewData();
}

// Device Loaders
async function loadDevices() {
    try {
        const res = await fetch(`${API_BASE}/devices/`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const devices = await res.json();
        renderDevices(devices);
    } catch (e) { showNotification("Failed to load devices", "error"); }
}

function renderDevices(devices) {
    const container = document.getElementById('devices-container');
    container.innerHTML = devices.length ? '' : '<p class="text-muted">No devices found.</p>';
    devices.forEach(dev => {
        const card = document.createElement('div');
        card.className = 'integration-card';
        const isAdmin = currentRole === 'admin';
        card.innerHTML = `
            <div class="card-header" style="display:flex;justify-content:space-between;align-items:flex-start;">
                <div>
                    <h3>${dev.name}</h3>
                    <span class="badge badge-low">${dev.device_type.replace('_', ' ')}</span>
                </div>
                ${isAdmin ? `
                <button class="device-delete-btn" title="Delete Device" onclick="deleteDevice(${dev.id}, '${dev.name}')"
                    style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.35);color:#ef4444;
                    border-radius:8px;padding:6px 10px;cursor:pointer;transition:all 0.2s;font-size:0.85rem;
                    display:flex;align-items:center;gap:5px;">
                    <i class="fas fa-trash-alt"></i>
                </button>` : ''}
            </div>
            <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 20px;">HWID: ${dev.hardware_id}</p>
            <div style="background: rgba(0,0,0,0.3); padding: 15px; border-radius: 12px; margin-bottom: 20px;">
                <p style="font-size: 0.65rem; color: var(--text-muted); margin-bottom: 5px;">SECRET TOKEN</p>
                <code style="color: var(--accent); font-size: 0.9rem;">${dev.secret}</code>
            </div>
            <button class="primary-btn" style="width:100%; justify-content: center;" onclick="openDeviceDetail('${dev.hardware_id}', '${dev.name}')">View Intelligent Data</button>
        `;
        // Hover effect for delete button
        const delBtn = card.querySelector('.device-delete-btn');
        if (delBtn) {
            delBtn.addEventListener('mouseenter', () => {
                delBtn.style.background = 'rgba(239,68,68,0.25)';
                delBtn.style.boxShadow = '0 0 12px rgba(239,68,68,0.3)';
                delBtn.style.transform = 'scale(1.05)';
            });
            delBtn.addEventListener('mouseleave', () => {
                delBtn.style.background = 'rgba(239,68,68,0.12)';
                delBtn.style.boxShadow = 'none';
                delBtn.style.transform = 'scale(1)';
            });
        }
        container.appendChild(card);
    });
}

async function loadIntegrationDevices() {
    try {
        const res = await fetch(`${API_BASE}/devices/`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const devices = await res.json();
        const container = document.getElementById('integration-container');
        container.innerHTML = '';
        devices.forEach(dev => {
            const isLoraGateway = dev.device_type === 'LORA_GATEWAY';
            const card = document.createElement('div');
            card.className = 'integration-card';
            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; margin-bottom: 15px;">
                    <div class="icon-box"><i class="fas fa-${isLoraGateway ? 'broadcast-tower' : 'server'}"></i></div>
                    <div style="text-align: right;">
                        <span class="status-dot" style="background: var(--success);"></span>
                        <span style="font-size: 0.75rem; font-weight: 600; color: var(--success);">PROVISIONED</span>
                    </div>
                </div>
                <h3 style="margin-bottom: 5px;">${dev.name}</h3>
                <p style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 15px;">Type: ${dev.device_type.replace('_', ' ')} · HWID: ${dev.hardware_id}</p>
                
                <div style="background: rgba(0,0,0,0.2); padding: 12px; border-radius: 10px; border: 1px solid var(--border); margin-bottom: 20px;">
                    <div style="margin-bottom: 10px;">
                        <p style="font-size: 0.6rem; color: var(--text-muted); text-transform: uppercase;">Hardware ID</p>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <code style="color: #fff; font-size: 0.85rem;">${dev.hardware_id}</code>
                            <i class="fas fa-copy text-accent" style="cursor:pointer;" onclick="copyToClipboard('${dev.hardware_id}', 'Hardware ID')"></i>
                        </div>
                    </div>
                    <div style="margin-bottom: 10px;">
                        <p style="font-size: 0.6rem; color: var(--text-muted); text-transform: uppercase;">Secret Key</p>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <code style="color: var(--accent); font-size: 0.85rem;">${dev.secret}</code>
                            <i class="fas fa-copy text-accent" style="cursor:pointer;" onclick="copyToClipboard('${dev.secret}', 'Secret Key')"></i>
                        </div>
                    </div>
                    ${isLoraGateway ? `
                    <div>
                        <p style="font-size: 0.6rem; color: var(--text-muted); text-transform: uppercase;">HTTP Ingest URL</p>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                            <code style="color: #10b981; font-size: 0.8rem; word-break: break-all;">${API_BASE}/telemetry/ingest</code>
                            <i class="fas fa-copy text-accent" style="cursor:pointer;" onclick="copyToClipboard('${API_BASE}/telemetry/ingest', 'HTTP Ingest URL')"></i>
                        </div>
                        <p style="font-size: 0.7rem; color: var(--text-muted);">
                            Configure your LoRa Gateway to POST to this URL with headers:<br>
                            <code style="color: #f59e0b;">x-hardware-id</code> and <code style="color: #f59e0b;">x-device-secret</code>
                        </p>
                    </div>
                    ` : ''}
                </div>
                
                <div style="display: grid; grid-template-columns: ${isLoraGateway ? '1fr' : '1fr 1fr'}; gap: 10px; margin-bottom: ${currentRole === 'admin' ? '10px' : '0'};">
                    <button class="accent-btn" style="width: 100%;" onclick="openDeviceDetail('${dev.hardware_id}', '${dev.name}')">View Data</button>
                    ${!isLoraGateway ? `
                    <button class="primary-btn" style="width: 100%; justify-content: center; background: var(--accent-soft); color: var(--accent); border: 1px solid var(--accent-glow);" onclick="goToFirmwareLab('${dev.hardware_id}', '${dev.secret}', '${dev.device_type}')">Build Code</button>
                    ` : ''}
                </div>
                ${currentRole === 'admin' ? `
                <button onclick="deleteDevice(${dev.id}, '${dev.name}')" style="width:100%;background:rgba(239,68,68,0.1);
                    border:1px solid rgba(239,68,68,0.35);color:#ef4444;border-radius:10px;padding:9px;
                    cursor:pointer;font-size:0.85rem;font-weight:600;transition:all 0.2s;
                    display:flex;align-items:center;justify-content:center;gap:8px;"
                    onmouseenter="this.style.background='rgba(239,68,68,0.22)';this.style.boxShadow='0 0 14px rgba(239,68,68,0.3)'"
                    onmouseleave="this.style.background='rgba(239,68,68,0.1)';this.style.boxShadow='none'">
                    <i class="fas fa-trash-alt"></i> Delete Device
                </button>` : ''}`;
            container.appendChild(card);
        });
    } catch (e) { }
}

function copyToClipboard(text, label) {
    navigator.clipboard.writeText(text).then(() => {
        showNotification(`${label} copied to clipboard!`, 'success');
    });
}
window.copyToClipboard = copyToClipboard;

function goToFirmwareLab(hwid, secret, deviceType = null) {
    switchTab('firmware');
    document.getElementById('gen-hwid').value = hwid;
    document.getElementById('gen-secret').value = secret;

    // If device type is provided, select the corresponding board
    if (deviceType) {
        const boardSelect = document.getElementById('gen-board');
        if (deviceType === 'LORA_GATEWAY') {
            boardSelect.value = 'lora_gateway';
        } else if (deviceType === 'LORA_NODE') {
            boardSelect.value = 'lora_node';
        }
        updateFirmwareForm();
    }

    showNotification("Parameters loaded into Firmware Lab", "info");
}
window.goToFirmwareLab = goToFirmwareLab;

// Device Detail View
async function openDeviceDetail(hwid, name) {
    activeHwid = hwid;
    switchTab('details');
    document.getElementById('device-selection-prompt').classList.add('hidden');
    document.getElementById('details-content').classList.remove('hidden');
    document.getElementById('tab-title').innerText = `Device: ${name}`;

    // Reset and start update interval
    if (dashboardInterval) clearInterval(dashboardInterval);
    updateDetailView();
    dashboardInterval = setInterval(updateDetailView, 2000);
}
window.openDeviceDetail = openDeviceDetail;

async function updateDetailView() {
    if (!activeHwid) return;
    try {
        const res = await fetch(`${API_BASE}/telemetry/${activeHwid}`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const telemetry = await res.json();
        if (res.ok) {
            renderPacketConsole(telemetry);
            renderDetailCharts(telemetry);
        }
    } catch (e) { }
}

function renderPacketConsole(telemetry) {
    const consoleView = document.getElementById('device-console');
    if (!consoleView) return;
    if (!telemetry.length) {
        consoleView.innerHTML = '<p style="color: var(--text-muted)">[System] Waiting for packets...</p>';
        return;
    }
    consoleView.innerHTML = telemetry.slice(0, 40).map(t => {
        return `<div style="margin-bottom: 6px;">
            <span style="color: var(--text-muted)">[${new Date(t.timestamp).toLocaleTimeString()}]</span>
            <span style="color: var(--accent); font-weight: bold;"> RX:</span> ${JSON.stringify(t.data)}
        </div>`;
    }).join('');
    consoleView.scrollTop = consoleView.scrollHeight;
}

function renderDetailCharts(telemetry) {
    if (!telemetry.length) return;
    const sortedData = [...telemetry].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const newestPoint = sortedData[sortedData.length - 1].data;
    const sensors = Object.keys(newestPoint);
    const container = document.getElementById('charts-container');

    sensors.forEach(key => {
        const cid = `detail-chart-${key}`;
        let chartWrapper = document.getElementById(`${cid}-wrapper`);
        if (!chartWrapper) {
            chartWrapper = document.createElement('div');
            chartWrapper.id = `${cid}-wrapper`;
            chartWrapper.style.height = '200px';
            chartWrapper.innerHTML = `<h4 style="font-size: 0.8rem; margin-bottom: 10px;">${key.toUpperCase()} TRAJECTORY</h4>
                                      <canvas id="${cid}"></canvas>`;
            container.appendChild(chartWrapper);

            const ctx = document.getElementById(cid).getContext('2d');
            charts[cid] = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: key,
                        data: [],
                        borderColor: '#8b5cf6',
                        backgroundColor: 'rgba(139, 92, 246, 0.1)',
                        fill: true,
                        tension: 0.3,
                        pointRadius: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { display: false },
                        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8e8e93' } }
                    },
                    plugins: { legend: { display: false } }
                }
            });
        }

        const chart = charts[cid];
        const recent = sortedData.slice(-40);
        chart.data.labels = recent.map(p => new Date(p.timestamp).toLocaleTimeString());
        chart.data.datasets[0].data = recent.map(p => p.data[key]);
        chart.update('none');
    });
}

// Tickets System
async function loadTickets() {
    try {
        const res = await fetch(`${API_BASE}/tickets/`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const tickets = await res.json();

        // Stats
        document.getElementById('ticket-count-total').innerText = tickets.length;
        document.getElementById('ticket-count-open').innerText = tickets.filter(t => t.status !== 'Resolved').length;
        document.getElementById('ticket-count-resolved').innerText = tickets.filter(t => t.status === 'Resolved').length;

        const body = document.getElementById('tickets-list-body');
        body.innerHTML = '';
        tickets.forEach(t => {
            const tr = document.createElement('tr');
            const priorityClass = t.priority.toLowerCase() === 'high' || t.priority.toLowerCase() === 'critical' ? 'badge-critical' : (t.priority.toLowerCase() === 'medium' ? 'badge-high' : 'badge-low');
            tr.innerHTML = `
                <td style="font-weight: 700; color: var(--accent);">#TK-${t.id}</td>
                <td><div style="font-weight: 600;">${t.subject}</div><div style="font-size: 0.75rem; color: var(--text-muted);">${t.description.substring(0, 30)}...</div></td>
                <td><span class="accent-btn" style="padding: 4px 10px; font-size: 0.7rem;">Device ID ${t.device_id || 'N/A'}</span></td>
                <td><span class="badge ${priorityClass}">${t.priority}</span></td>
                <td><span style="font-weight: 600; color: ${t.status === 'Resolved' ? 'var(--success)' : (t.status === 'In Progress' ? 'var(--warning)' : '#fff')}"><i class="fas fa-circle" style="font-size: 0.5rem; margin-right: 8px;"></i> ${t.status}</span></td>
                <td style="color: var(--text-muted); font-size: 0.85rem;">${new Date(t.created_at).toLocaleDateString()}</td>
                <td style="text-align: right;"><i class="fas fa-ellipsis-v text-muted" style="cursor: pointer;"></i></td>
            `;
            body.appendChild(tr);
        });
    } catch (e) { }
}

function showTicketModal() {
    document.getElementById('ticket-modal').classList.remove('hidden');
    loadDeviceChoices('ticket_device_id');
}
window.showTicketModal = showTicketModal;

async function loadDeviceChoices(selectId) {
    const res = await fetch(`${API_BASE}/devices/`, { headers: { 'Authorization': `Bearer ${currentToken}` } });
    const devices = await res.json();
    const select = document.getElementById(selectId);
    select.innerHTML = '<option value="">Global System Issue</option>' +
        devices.map(d => `<option value="${d.id}">${d.name} (${d.hardware_id})</option>`).join('');
}

document.getElementById('ticket-form').onsubmit = async (e) => {
    e.preventDefault();
    const data = {
        device_id: document.getElementById('ticket_device_id').value ? parseInt(document.getElementById('ticket_device_id').value) : null,
        subject: document.getElementById('ticket_subject').value,
        description: document.getElementById('ticket_desc').value,
        priority: document.getElementById('ticket_priority').value
    };

    const res = await fetch(`${API_BASE}/tickets/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` },
        body: JSON.stringify(data)
    });
    if (res.ok) {
        showNotification("Ticket Submitted Successfully", "success");
        hideModal('ticket-modal');
        loadTickets();
    }
};

// loadAlertsData and renderRules are defined below (extended versions)

// Modal Toggle Helpers
function showRegisterModal() { document.getElementById('register-modal').classList.remove('hidden'); }
window.showRegisterModal = showRegisterModal;

function hideModal(id) { document.getElementById(id).classList.add('hidden'); }
window.hideModal = hideModal;

// ─────────────────────────────────────────────────────────────────
// FIRMWARE LAB — Sensor Library + Dynamic Pin Config + Code Gen
// ─────────────────────────────────────────────────────────────────

const SENSOR_LIBRARY = [
    {
        id: 'esp32',
        name: 'ESP32',
        category: 'MCU',
        icon: '🧠',
        color: '#06b6d4',
        interface: 'BUILTIN',
        pins: {},
        includes: [],
        setup: '',
        loop: '',
        payloadKeys: []
    },
    {
        id: 'sx1276',
        name: 'SX1276 LoRa',
        category: 'RF',
        icon: '📡',
        color: '#8b5cf6',
        interface: 'SPI',
        pins: { SS: { label: 'SS/NSS', default: 5 }, RST: { label: 'RESET', default: 14 }, DIO0: { label: 'DIO0', default: 2 } },
        includes: ['<SPI.h>', '<LoRa.h>'],
        setup: '  LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);\n  if (!LoRa.begin(915E6)) { Serial.println("LoRa failed"); while(1); }\n  LoRa.setSyncWord(0x12);',
        loop: '',
        payloadKeys: []
    },
    {
        id: 'bme280',
        name: 'BME280',
        category: 'Environment',
        icon: '🌡️',
        color: '#10b981',
        interface: 'I2C',
        pins: { SDA: { label: 'SDA', default: 21 }, SCL: { label: 'SCL', default: 22 } },
        includes: ['<Wire.h>', '<Adafruit_BME280.h>'],
        setup: '  bme.begin(0x76);',
        loop: '  float temperature = bme.readTemperature();\n  float humidity = bme.readHumidity();\n  float pressure = bme.readPressure() / 100.0F;',
        payloadKeys: ['temperature', 'humidity', 'pressure']
    },
    {
        id: 'bh1750',
        name: 'BH1750',
        category: 'Light',
        icon: '💡',
        color: '#f59e0b',
        interface: 'I2C',
        pins: { SDA: { label: 'SDA', default: 21 }, SCL: { label: 'SCL', default: 22 } },
        includes: ['<Wire.h>', '<BH1750.h>'],
        setup: '  lightMeter.begin();',
        loop: '  float lux = lightMeter.readLightLevel();',
        payloadKeys: ['lux']
    },
    {
        id: 'pms5003',
        name: 'PMS5003',
        category: 'Air Quality',
        icon: '💨',
        color: '#ef4444',
        interface: 'UART',
        pins: { TX: { label: 'TX→RX', default: 16 }, RX: { label: 'RX→TX', default: 17 } },
        includes: ['<PMS.h>'],
        setup: '  Serial2.begin(9600, SERIAL_8N1, PMS_RX, PMS_TX);\n  pms.passiveMode();',
        loop: '  pms.requestRead();\n  PMS::DATA data;\n  if (pms.readUntil(data)) {\n    int pm25 = data.PM_AE_UG_2_5;\n    int pm10 = data.PM_AE_UG_10_0;\n  }',
        payloadKeys: ['pm25', 'pm10']
    },
    {
        id: 'rain_sensor',
        name: 'Rain Sensor',
        category: 'Weather',
        icon: '🌧️',
        color: '#3b82f6',
        interface: 'Analog',
        pins: { AOUT: { label: 'Analog OUT', default: 34 }, DOUT: { label: 'Digital OUT', default: 35 } },
        includes: [],
        setup: '  pinMode(RAIN_DPIN, INPUT);',
        loop: '  int rainAnalog = analogRead(RAIN_APIN);\n  bool raining = !digitalRead(RAIN_DPIN);',
        payloadKeys: ['rain_analog', 'raining']
    },
    {
        id: 'soil_moisture',
        name: 'Soil Moisture',
        category: 'Agriculture',
        icon: '🌱',
        color: '#84cc16',
        interface: 'Analog',
        pins: { AOUT: { label: 'Analog OUT', default: 32 } },
        includes: [],
        setup: '',
        loop: '  int soilRaw = analogRead(SOIL_PIN);\n  float soilMoisture = map(soilRaw, 4095, 0, 0, 100);',
        payloadKeys: ['soil_moisture']
    },
    {
        id: 'neo6m',
        name: 'NEO-6M GPS',
        category: 'Location',
        icon: '🛰️',
        color: '#06b6d4',
        interface: 'UART',
        pins: { TX: { label: 'GPS TX→', default: 16 }, RX: { label: 'GPS RX←', default: 17 } },
        includes: ['<TinyGPS++.h>'],
        setup: '  gpsSerial.begin(9600, SERIAL_8N1, GPS_RX, GPS_TX);\n  gps.begin(gpsSerial);',
        loop: '  while (gpsSerial.available()) gps.encode(gpsSerial.read());\n  float lat = gps.location.lat();\n  float lng = gps.location.lng();\n  float gpsAlt = gps.altitude.meters();',
        payloadKeys: ['latitude', 'longitude', 'altitude']
    },
    {
        id: 'oled_ssd1306',
        name: 'OLED SSD1306',
        category: 'Display',
        icon: '🖥️',
        color: '#a78bfa',
        interface: 'I2C',
        pins: { SDA: { label: 'SDA', default: 21 }, SCL: { label: 'SCL', default: 22 } },
        includes: ['<Wire.h>', '<Adafruit_GFX.h>', '<Adafruit_SSD1306.h>'],
        setup: '  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);\n  display.clearDisplay();\n  display.setTextColor(WHITE);\n  display.display();',
        loop: '  display.clearDisplay();\n  display.setCursor(0,0);\n  display.println("IoT Guard");\n  display.display();',
        payloadKeys: []
    },
    {
        id: 'relay',
        name: 'Relay Module',
        category: 'Actuator',
        icon: '🔌',
        color: '#f97316',
        interface: 'Digital',
        pins: { IN: { label: 'Control IN', default: 26 } },
        includes: [],
        setup: '  pinMode(RELAY_PIN, OUTPUT);\n  digitalWrite(RELAY_PIN, HIGH); // Relay OFF initially',
        loop: '',
        payloadKeys: ['relay_state']
    },
    {
        id: 'buzzer',
        name: 'Buzzer',
        category: 'Actuator',
        icon: '🔔',
        color: '#ec4899',
        interface: 'Digital',
        pins: { PIN: { label: 'Signal PIN', default: 27 } },
        includes: [],
        setup: '  pinMode(BUZZER_PIN, OUTPUT);',
        loop: '',
        payloadKeys: []
    },
    {
        id: 'status_leds',
        name: 'Status LEDs',
        category: 'Output',
        icon: '🚦',
        color: '#22d3ee',
        interface: 'Digital',
        pins: { RED: { label: 'Red LED', default: 25 }, GREEN: { label: 'Green LED', default: 26 }, BLUE: { label: 'Blue LED', default: 27 } },
        includes: [],
        setup: '  pinMode(LED_RED, OUTPUT);\n  pinMode(LED_GREEN, OUTPUT);\n  pinMode(LED_BLUE, OUTPUT);',
        loop: '',
        payloadKeys: []
    },
    {
        id: 'ds3231',
        name: 'DS3231 RTC',
        category: 'Time',
        icon: '🕐',
        color: '#6366f1',
        interface: 'I2C',
        pins: { SDA: { label: 'SDA', default: 21 }, SCL: { label: 'SCL', default: 22 } },
        includes: ['<Wire.h>', '<RTClib.h>'],
        setup: '  if (!rtc.begin()) { Serial.println("RTC not found"); }\n  if (rtc.lostPower()) { rtc.adjust(DateTime(F(__DATE__), F(__TIME__))); }',
        loop: '  DateTime now = rtc.now();\n  String timestamp = String(now.year()) + "-" + String(now.month()) + "-" + String(now.day());',
        payloadKeys: ['rtc_timestamp']
    },
    {
        id: 'ina219',
        name: 'Battery (INA219)',
        category: 'Power',
        icon: '🔋',
        color: '#34d399',
        interface: 'I2C',
        pins: { SDA: { label: 'SDA', default: 21 }, SCL: { label: 'SCL', default: 22 } },
        includes: ['<Wire.h>', '<Adafruit_INA219.h>'],
        setup: '  ina219.begin();',
        loop: '  float busVoltage = ina219.getBusVoltage_V();\n  float current_mA = ina219.getCurrent_mA();\n  float power_mW = ina219.getPower_mW();',
        payloadKeys: ['voltage', 'current_mA', 'power_mW']
    }
];

// State: selected sensors and their pin values
let selectedSensors = {}; // { sensorId: { pinKey: pinValue, ... } }

function initFirmwareLab() {
    document.getElementById('gen-api-url').value = `${API_BASE}/telemetry/ingest`;
    renderSensorLibrary();
    updateFirmwareForm();

    document.getElementById('generate-code-btn').onclick = () => {
        const board = document.getElementById('gen-board').value;
        const hwid = document.getElementById('gen-hwid').value || 'DEVICE_ID_HERE';
        const secret = document.getElementById('gen-secret').value || 'SECRET_KEY_HERE';
        const ssid = document.getElementById('gen-wifi-ssid').value || 'WIFI_SSID';
        const pass = document.getElementById('gen-wifi-pass').value || 'WIFI_PASS';
        const apiUrl = document.getElementById('gen-api-url').value;
        const interval = document.getElementById('gen-interval').value || '10000';

        const code = buildFirmwareCode(board, hwid, secret, ssid, pass, apiUrl, interval);
        document.getElementById('code-display').innerText = code;
        showNotification('Firmware template built! ⚡', 'success');
    };

    document.getElementById('copy-code-btn').onclick = () => {
        const code = document.getElementById('code-display').innerText;
        navigator.clipboard.writeText(code)
            .then(() => showNotification('Code copied to clipboard!', 'success'))
            .catch(() => showNotification('Copy failed', 'error'));
    };
}

function renderSensorLibrary() {
    const grid = document.getElementById('sensor-library-grid');
    if (!grid) return;
    grid.innerHTML = SENSOR_LIBRARY.map(s => {
        const isSelected = !!selectedSensors[s.id];
        return `<div id="slib-${s.id}" onclick="toggleSensor('${s.id}')"
            style="
                cursor:pointer;
                padding:10px 12px;
                border-radius:12px;
                border:1.5px solid ${isSelected ? s.color : 'var(--border)'};
                background:${isSelected ? `rgba(${hexToRgb(s.color)},0.12)` : 'rgba(255,255,255,0.02)'};
                transition:all 0.2s;
                position:relative;
            "
            onmouseenter="this.style.borderColor='${s.color}';this.style.background='rgba(${hexToRgb(s.color)},0.08)'"
            onmouseleave="if(!${isSelected}){this.style.borderColor='var(--border)';this.style.background='rgba(255,255,255,0.02)'}"
        >
            ${isSelected ? `<div style="position:absolute;top:6px;right:8px;width:16px;height:16px;border-radius:50%;background:${s.color};display:flex;align-items:center;justify-content:center;font-size:0.55rem;color:#000;font-weight:900;">✓</div>` : ''}
            <div style="font-size:1.3rem;margin-bottom:4px;">${s.icon}</div>
            <div style="font-size:0.78rem;font-weight:600;color:#fff;line-height:1.3;">${s.name}</div>
            <div style="font-size:0.65rem;color:${s.color};margin-top:2px;text-transform:uppercase;letter-spacing:0.3px;">${s.interface} · ${s.category}</div>
        </div>`;
    }).join('');
}

function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${r},${g},${b}`;
}

function toggleSensor(sensorId) {
    const sensor = SENSOR_LIBRARY.find(s => s.id === sensorId);
    if (!sensor) return;

    if (selectedSensors[sensorId]) {
        delete selectedSensors[sensorId];
    } else {
        // Initialize with default pins
        const pins = {};
        Object.entries(sensor.pins).forEach(([key, cfg]) => {
            pins[key] = cfg.default;
        });
        selectedSensors[sensorId] = pins;
    }

    renderSensorLibrary();
    renderPinConfig();
    updateSelectedCount();
}

function updateSelectedCount() {
    const count = Object.keys(selectedSensors).length;
    const el = document.getElementById('selected-sensor-count');
    if (el) el.innerText = `${count} selected`;
}

function renderPinConfig() {
    const list = document.getElementById('pin-config-list');
    if (!list) return;

    const selectedIds = Object.keys(selectedSensors);
    if (!selectedIds.length) {
        list.innerHTML = '<p style="color:var(--text-muted);font-size:0.82rem;text-align:center;padding:20px 0;"><i class="fas fa-arrow-up" style="display:block;margin-bottom:8px;font-size:1.2rem;opacity:0.4;"></i>Select sensors above to configure their pins</p>';
        return;
    }

    list.innerHTML = selectedIds.map(sid => {
        const sensor = SENSOR_LIBRARY.find(s => s.id === sid);
        if (!sensor) return '';
        const hasPins = Object.keys(sensor.pins).length > 0;

        const pinsHtml = hasPins ? Object.entries(sensor.pins).map(([key, cfg]) => `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;">
                <label style="font-size:0.75rem;color:var(--text-muted);flex:1;white-space:nowrap;">${cfg.label}</label>
                <div style="display:flex;align-items:center;gap:6px;">
                    <span style="font-size:0.65rem;color:${sensor.color};background:rgba(${hexToRgb(sensor.color)},0.12);padding:2px 6px;border-radius:4px;white-space:nowrap;">GPIO</span>
                    <input type="number" min="0" max="39"
                        value="${selectedSensors[sid][key] ?? cfg.default}"
                        onchange="updateSensorPin('${sid}','${key}',this.value)"
                        style="width:60px;padding:5px 8px;border-radius:8px;border:1px solid var(--border);background:rgba(255,255,255,0.05);color:#fff;font-size:0.8rem;text-align:center;">
                </div>
            </div>`).join('') : '<p style="font-size:0.72rem;color:var(--text-muted);margin-top:6px;">No pin config needed</p>';

        return `<div style="padding:12px;border-radius:12px;border:1px solid ${sensor.color}33;background:rgba(${hexToRgb(sensor.color)},0.05);">
            <div style="display:flex;align-items:center;justify-content:space-between;">
                <div style="display:flex;align-items:center;gap:8px;">
                    <span style="font-size:1rem;">${sensor.icon}</span>
                    <div>
                        <div style="font-size:0.82rem;font-weight:600;">${sensor.name}</div>
                        <div style="font-size:0.65rem;color:${sensor.color};text-transform:uppercase;">${sensor.interface}</div>
                    </div>
                </div>
                <button onclick="toggleSensor('${sid}')" title="Remove"
                    style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:0.85rem;padding:2px 6px;border-radius:6px;transition:background 0.2s;"
                    onmouseenter="this.style.background='rgba(239,68,68,0.1)'" onmouseleave="this.style.background='none'">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            ${pinsHtml}
        </div>`;
    }).join('');
}

function updateSensorPin(sensorId, pinKey, value) {
    if (selectedSensors[sensorId]) {
        selectedSensors[sensorId][pinKey] = parseInt(value);
    }
}

function updateFirmwareForm() {
    const board = document.getElementById('gen-board') ? document.getElementById('gen-board').value : 'esp32';
    const wifiGroup = document.getElementById('wifi-config-group');
    const loraGroup = document.getElementById('lora-config-group');
    const sensorSection = document.getElementById('sensor-section');
    const filenameEl = document.getElementById('firmware-filename');

    const apiUrlInput = document.getElementById('gen-api-url');
    if (apiUrlInput && !apiUrlInput.value) {
        apiUrlInput.value = `${API_BASE}/telemetry/ingest`;
    }

    renderSensorLibrary();
    renderPinConfig();

    if (!wifiGroup) return;

    if (board === 'lora_gateway') {
        wifiGroup.style.display = 'none';
        if (loraGroup) loraGroup.style.display = 'block';
        if (sensorSection) sensorSection.style.display = 'none';
        if (filenameEl) filenameEl.innerText = 'lora_gateway.ino';
    } else if (board === 'lora_node') {
        wifiGroup.style.display = 'none';
        if (loraGroup) loraGroup.style.display = 'block';
        if (sensorSection) sensorSection.style.display = 'flex';
        if (filenameEl) filenameEl.innerText = 'lora_node.ino';
    } else {
        wifiGroup.style.display = 'block';
        if (loraGroup) loraGroup.style.display = 'none';
        if (sensorSection) sensorSection.style.display = 'flex';
        if (filenameEl) filenameEl.innerText = board === 'esp32' ? 'esp32_firmware.ino' : 'esp8266_firmware.ino';
    }
}
window.updateFirmwareForm = updateFirmwareForm;
window.toggleSensor = toggleSensor;
window.updateSensorPin = updateSensorPin;

// ─────────────────────────────────────────────────────────────────
// CODE GENERATION ENGINE
// ─────────────────────────────────────────────────────────────────
function buildFirmwareCode(board, hwid, secret, ssid, pass, apiUrl, interval) {
    if (board === 'lora_gateway') return generateLoraGatewayCode(hwid, secret);
    if (board === 'lora_node') return generateLoraNodeCode();

    const isESP32 = board === 'esp32';
    const activeIds = Object.keys(selectedSensors);
    const activeSensors = SENSOR_LIBRARY.filter(s => activeIds.includes(s.id));

    // Collect unique includes
    const allIncludes = new Set([isESP32 ? '<WiFi.h>' : '<ESP8266WiFi.h>', isESP32 ? '<HTTPClient.h>' : '<ESP8266HTTPClient.h>']);
    activeSensors.forEach(s => s.includes.forEach(i => allIncludes.add(i)));

    // Collect #defines for pins
    const defines = [];
    activeSensors.forEach(s => {
        const pins = selectedSensors[s.id];
        if (!pins) return;
        Object.entries(s.pins).forEach(([key, cfg]) => {
            const pinName = `${s.id.toUpperCase()}_${key}`;
            defines.push(`#define ${pinName.padEnd(24)} ${pins[key] ?? cfg.default}   // ${s.name} — ${cfg.label}`);
        });
    });

    // Collect global var declarations
    const globals = [];
    if (activeSensors.find(s => s.id === 'bme280')) globals.push('Adafruit_BME280 bme;');
    if (activeSensors.find(s => s.id === 'bh1750')) globals.push('BH1750 lightMeter;');
    if (activeSensors.find(s => s.id === 'pms5003')) globals.push('PMS pms(Serial2);');
    if (activeSensors.find(s => s.id === 'neo6m')) globals.push('TinyGPSPlus gps;\nHardwareSerial gpsSerial(2);');
    if (activeSensors.find(s => s.id === 'oled_ssd1306')) globals.push('Adafruit_SSD1306 display(128, 64, &Wire, -1);');
    if (activeSensors.find(s => s.id === 'ds3231')) globals.push('RTC_DS3231 rtc;');
    if (activeSensors.find(s => s.id === 'ina219')) globals.push('Adafruit_INA219 ina219;');

    // Collect setup lines
    const setupLines = activeSensors.map(s => s.setup).filter(Boolean);

    // Collect loop lines + build payload
    const loopReads = activeSensors.map(s => s.loop).filter(Boolean);
    const payloadKeys = [];
    activeSensors.forEach(s => s.payloadKeys.forEach(k => payloadKeys.push(k)));

    // Build JSON payload string
    let payloadBuild = '';
    if (payloadKeys.length === 0) {
        payloadBuild = '  String payload = "{\\"data\\": {\\"status\\": \\"ok\\"}}";\n';
    } else {
        const parts = payloadKeys.map((k, i) => {
            const comma = i === 0 ? '' : ' + ", " + ';
            return `${comma}"\\"${k}\\": " + String(${k})`;
        }).join('\n           ');
        payloadBuild = `  String payload = "{\\"data\\": {" + ${parts} + "}}";\n`;
    }

    return `/* ============================================================
 *  IoT Guard Platform — Auto-Generated Firmware
 *  Board     : ${isESP32 ? 'ESP32' : 'ESP8266'}
 *  Sensors   : ${activeSensors.map(s => s.name).join(', ') || 'None'}
 *  Generated : ${new Date().toLocaleString()}
 * ============================================================ */

${[...allIncludes].map(i => `#include ${i}`).join('\n')}

/* ── Network & Auth ── */
const char* WIFI_SSID     = "${ssid}";
const char* WIFI_PASS     = "${pass}";
const char* API_URL       = "${apiUrl}";
const char* HARDWARE_ID   = "${hwid}";
const char* SECRET_KEY    = "${secret}";
const unsigned long SEND_INTERVAL = ${interval};

${defines.length ? '/* ── Pin Definitions ── */\n' + defines.join('\n') : ''}

${globals.length ? '/* ── Sensor Objects ── */\n' + globals.join('\n') : ''}

/* ── WiFi Connect ── */
void connectWiFi() {
  Serial.print("Connecting to ");
  Serial.println(WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500); Serial.print(".");
  }
  Serial.println("\\nConnected! IP: " + WiFi.localIP().toString());
}

void setup() {
  Serial.begin(115200);
  delay(100);
  connectWiFi();

  /* ── Sensor Init ── */
${setupLines.map(l => l.split('\n').map(line => '  ' + line).join('\n')).join('\n\n')}

  Serial.println("IoT Guard Node Ready");
}

unsigned long lastSend = 0;

void loop() {
  /* ── Read Sensors ── */
${loopReads.map(l => l.split('\n').map(line => '  ' + line).join('\n')).join('\n\n')}

  /* ── Transmit at interval ── */
  if (millis() - lastSend >= SEND_INTERVAL) {
    lastSend = millis();
    if (WiFi.status() == WL_CONNECTED) {
      HTTPClient http;
      http.begin(API_URL);
      http.addHeader("Content-Type", "application/json");
      http.addHeader("x-hardware-id", HARDWARE_ID);
      http.addHeader("x-device-secret", SECRET_KEY);

${payloadBuild}
      Serial.println("TX: " + payload);
      int code = http.POST(payload);
      Serial.println("HTTP: " + String(code));
      http.end();
    } else {
      Serial.println("WiFi lost — reconnecting...");
      connectWiFi();
    }
  }
}
`;
}

function generateLoraGatewayCode(hwid, secret) {
    const apiUrl = document.getElementById('gen-api-url').value;
    const freq = document.getElementById('gen-lora-freq').value;
    const sync = document.getElementById('gen-lora-sync').value;

    return `/* ============================================================
 *  IoT Guard — LoRa Gateway Firmware (Dragino LG01 / Arduino Yún)
 *  Generated : ${new Date().toLocaleString()}
 * ============================================================ */

#include <SPI.h>
#include <LoRa.h>
#include <Console.h>
#include <Process.h>

const char* API_URL     = "${apiUrl}";
const char* HARDWARE_ID = "${hwid}";
const char* SECRET_KEY  = "${secret}";

void setup() {
  Bridge.begin(115200);
  Console.begin();
  delay(2000);
  Console.println("[GW] Booting IoT Guard Gateway...");

  if (!LoRa.begin(${freq})) {
    Console.println("[GW] LoRa init FAILED");
  } else {
    LoRa.setSyncWord(${sync});
    Console.println("[GW] LoRa Ready — Listening...");
  }
}

void loop() {
  int pkt = LoRa.parsePacket();
  if (pkt) {
    String rx = "";
    while (LoRa.available()) rx += (char)LoRa.read();
    Console.println("[GW] RX: " + rx);
    forwardToServer(rx);
  }
  delay(50);
}

void forwardToServer(String raw) {
  // raw format: key1=val1&key2=val2&node_id=XXXX
  String json = "{\\"data\\": {";
  bool first = true;
  int last = 0, idx = raw.indexOf('&');
  while (idx != -1) {
    String pair = raw.substring(last, idx);
    int eq = pair.indexOf('=');
    if (eq != -1) {
      if (!first) json += ", ";
      json += "\\"" + pair.substring(0, eq) + "\\": \\"" + pair.substring(eq+1) + "\\"";
      first = false;
    }
    last = idx + 1; idx = raw.indexOf('&', last);
  }
  String pair = raw.substring(last);
  int eq = pair.indexOf('=');
  if (eq != -1) {
    if (!first) json += ", ";
    json += "\\"" + pair.substring(0, eq) + "\\": \\"" + pair.substring(eq+1) + "\\"";
  }
  json += "}}";

  Process p;
  p.begin("curl");
  p.addParameter("-s"); p.addParameter("-X"); p.addParameter("POST");
  p.addParameter("-H"); p.addParameter("Content-Type: application/json");
  p.addParameter("-H"); p.addParameter("x-hardware-id: " + String(HARDWARE_ID));
  p.addParameter("-H"); p.addParameter("x-device-secret: " + String(SECRET_KEY));
  p.addParameter("-d"); p.addParameter(json);
  p.addParameter(API_URL);
  p.runAsynchronously();
}
`;
}

function generateLoraNodeCode() {
    const freq = document.getElementById('gen-lora-freq').value;
    const sync = document.getElementById('gen-lora-sync').value;
    const ssPin = document.getElementById('gen-lora-ss').value;
    const rstPin = document.getElementById('gen-lora-rst').value;
    const dio0Pin = document.getElementById('gen-lora-dio0').value;
    const interval = document.getElementById('gen-interval').value || '5000';

    const activeIds = Object.keys(selectedSensors);
    const activeSensors = SENSOR_LIBRARY.filter(s => activeIds.includes(s.id) && s.id !== 'sx1276');

    const allIncludes = new Set(['<LoRa.h>', '<SPI.h>']);
    activeSensors.forEach(s => s.includes.forEach(i => allIncludes.add(i)));

    const defines = [`#define LORA_SS   ${ssPin}`, `#define LORA_RST  ${rstPin}`, `#define LORA_DIO0 ${dio0Pin}`];
    activeSensors.forEach(s => {
        const pins = selectedSensors[s.id];
        if (!pins) return;
        Object.entries(s.pins).forEach(([key, cfg]) => {
            defines.push(`#define ${s.id.toUpperCase()}_${key.padEnd(12)} ${pins[key] ?? cfg.default}`);
        });
    });

    const payloadKeys = [];
    activeSensors.forEach(s => s.payloadKeys.forEach(k => payloadKeys.push(k)));
    const payloadStr = payloadKeys.length
        ? payloadKeys.map((k, i) => i === 0 ? `"${k}=" + String(${k})` : `"&${k}=" + String(${k})`).join('\n      + ')
        : '"status=ok"';

    return `/* ============================================================
 *  IoT Guard — LoRa Node Firmware
 *  Sensors   : ${activeSensors.map(s => s.name).join(', ') || 'None'}
 *  Generated : ${new Date().toLocaleString()}
 * ============================================================ */

${[...allIncludes].map(i => `#include ${i}`).join('\n')}

/* ── Pin Definitions ── */
${defines.join('\n')}

/* ── LoRa Config ── */
const long LORA_FREQ     = ${freq};
const int  LORA_SYNC     = ${sync};
const unsigned long TX_INTERVAL = ${interval};

void setup() {
  Serial.begin(115200);
  LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);
  if (!LoRa.begin(LORA_FREQ)) {
    Serial.println("LoRa init failed"); while(1);
  }
  LoRa.setSyncWord(LORA_SYNC);
  Serial.println("LoRa Node Ready");
}

unsigned long lastTx = 0;

void loop() {
${activeSensors.map(s => s.loop).filter(Boolean).map(l => l.split('\n').map(ln => '  ' + ln).join('\n')).join('\n\n')}

  if (millis() - lastTx >= TX_INTERVAL) {
    lastTx = millis();
    String payload = ${payloadStr};
    LoRa.beginPacket();
    LoRa.print(payload);
    LoRa.endPacket();
    Serial.println("TX: " + payload);
  }
}
`;
}

// Boot the firmware lab
initFirmwareLab();


// Registration Form sync
document.getElementById('device-form').onsubmit = async (e) => {
    e.preventDefault();
    const data = {
        name: document.getElementById('device_name').value,
        hardware_id: document.getElementById('hardware_id').value,
        device_type: document.getElementById('device_type').value
    };
    const res = await fetch(`${API_BASE}/devices/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` },
        body: JSON.stringify(data)
    });
    if (res.ok) {
        const device = await res.json();
        hideModal('register-modal');
        loadDevices();
        loadIntegrationDevices();
        showNotification(`Device Sync Successful! Secret Key: ${device.secret}`, "success");
        if (confirm(`Device Registered! HWID: ${device.hardware_id}. Generate firmware now?`)) {
            goToFirmwareLab(device.hardware_id, device.secret, device.device_type);
        }
    } else {
        const err = await res.json();
        showNotification(err.detail || "Registration failed", "error");
    }
};

// ─────────────────────────────────────────────
// Fleet Status Chips (top header rollup)
// ─────────────────────────────────────────────
async function loadOverviewData() {
    try {
        const res = await fetch(`${API_BASE}/devices/`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const devices = res.ok ? await res.json() : [];

        const now = new Date();
        let silent = 0, warning = 0, reporting = 0;
        let typeEsp = 0, typeLoraGw = 0, typeLoraNode = 0, typeOther = 0;

        devices.forEach(d => {
            if (!d.last_seen) {
                silent++;
            } else {
                const mins = (now - new Date(d.last_seen)) / 60000;
                if (mins > 30) silent++;
                else if (mins > 10) warning++;
                else reporting++;
            }
            const dt = (d.device_type || '').toUpperCase();
            if (dt.includes('LORA_GATEWAY') || dt.includes('GATEWAY')) typeLoraGw++;
            else if (dt.includes('LORA_NODE') || dt.includes('LORA')) typeLoraNode++;
            else if (dt.includes('ESP')) typeEsp++;
            else typeOther++;
        });

        const total = devices.length;

        // ── Header Chips ──
        const setEl = (id, v) => { const e = document.getElementById(id); if (e) e.innerText = v; };
        setEl('chip-down-val', silent);
        setEl('chip-warn-val', warning);
        setEl('chip-up-val', reporting);

        // ── Stats Strip ──
        setEl('stat-total-devices', total);
        setEl('stat-active-devices', reporting);

        // ── Fleet Health Bars ──
        setEl('bar-reporting', reporting);
        setEl('bar-warning', warning);
        setEl('bar-silent', silent);
        const pct = (n) => total > 0 ? ((n / total) * 100).toFixed(1) + '%' : '0%';
        setTimeout(() => {
            const rf = document.getElementById('bar-reporting-fill');
            if (rf) rf.style.width = pct(reporting);
            const wf = document.getElementById('bar-warning-fill');
            if (wf) wf.style.width = pct(warning);
            const sf = document.getElementById('bar-silent-fill');
            if (sf) sf.style.width = pct(silent);
        }, 100);

        // ── System Status ──
        const statusEl = document.getElementById('overview-system-status');
        if (statusEl) {
            if (silent === total && total > 0) { statusEl.innerText = 'DEGRADED'; statusEl.style.color = 'var(--danger)'; }
            else if (warning > 0 || silent > 0) { statusEl.innerText = 'PARTIAL'; statusEl.style.color = 'var(--warning)'; }
            else { statusEl.innerText = 'OPERATIONAL'; statusEl.style.color = 'var(--success)'; }
        }

        // ── Recent Device Activity List ──
        const activityEl = document.getElementById('overview-device-activity');
        if (activityEl) {
            if (!devices.length) {
                activityEl.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">No devices registered yet.</p>';
            } else {
                const sorted = [...devices].sort((a, b) => {
                    if (!a.last_seen) return 1;
                    if (!b.last_seen) return -1;
                    return new Date(b.last_seen) - new Date(a.last_seen);
                });
                activityEl.innerHTML = sorted.map(d => {
                    let statusColor = 'var(--danger)', statusText = 'Silent';
                    if (d.last_seen) {
                        const mins = (now - new Date(d.last_seen)) / 60000;
                        if (mins <= 10) { statusColor = 'var(--success)'; statusText = 'Reporting'; }
                        else if (mins <= 30) { statusColor = 'var(--warning)'; statusText = 'Warning'; }
                    }
                    const lastSeen = d.last_seen
                        ? new Date(d.last_seen).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                        : 'Never';
                    const dt = (d.device_type || '').replace(/_/g, ' ');
                    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;
                        background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:12px;
                        transition:border-color 0.2s;" onmouseenter="this.style.borderColor='var(--border-hover)'"
                        onmouseleave="this.style.borderColor='var(--border)'">
                        <div style="display:flex;align-items:center;gap:12px;">
                            <div style="width:8px;height:8px;border-radius:50%;background:${statusColor};flex-shrink:0;${statusText==='Reporting'?'animation:pulse 2s infinite;':''}"></div>
                            <div>
                                <div style="font-weight:600;font-size:0.85rem;">${d.name}</div>
                                <div style="color:var(--text-muted);font-size:0.72rem;">${dt} · ${d.hardware_id}</div>
                            </div>
                        </div>
                        <div style="text-align:right;flex-shrink:0;">
                            <div style="font-size:0.75rem;font-weight:700;color:${statusColor};">${statusText}</div>
                            <div style="font-size:0.7rem;color:var(--text-muted);">${lastSeen}</div>
                        </div>
                    </div>`;
                }).join('');
            }
        }

        // ── 3 Donut Rings ──
        renderDeviceStatusRing(silent, warning, reporting, total);
        renderHardwareTypesRing(typeEsp, typeLoraGw, typeLoraNode, typeOther, total);
        await renderActiveTriggersRing();

        // ── Traffic Bar ──
        renderTrafficBarChart();

        checkSmtpBanner();
    } catch (e) {
        console.error('[Overview] Error loading overview data:', e);
    }
}
window.loadOverviewData = loadOverviewData;
window.loadFleetStatus = loadOverviewData;

function renderDeviceStatusRing(silent, warning, reporting, total) {
    const ctx = document.getElementById('ring-devices');
    if (!ctx) return;

    const centerEl = document.getElementById('ring-devices-center');
    if (centerEl) centerEl.innerText = total;

    const legDown = document.getElementById('legend-down');
    if (legDown) legDown.innerText = silent;
    const legWarn = document.getElementById('legend-warn');
    if (legWarn) legWarn.innerText = warning;
    const legUp = document.getElementById('legend-up');
    if (legUp) legUp.innerText = reporting;

    if (charts.ringDevices) charts.ringDevices.destroy();

    const hasData = (silent + warning + reporting) > 0;
    const data = hasData ? [silent, warning, reporting] : [1];
    const colors = hasData ? ['#ef4444', '#f59e0b', '#10b981'] : ['#2d2d3a'];

    charts.ringDevices = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: hasData ? ['Silent', 'Warning', 'Reporting'] : ['No Devices Registered'],
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderWidth: 0,
                hoverOffset: hasData ? 4 : 0
            }]
        },
        options: {
            cutout: '78%',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { enabled: hasData }
            }
        }
    });
}

function renderHardwareTypesRing(esp, loraGw, loraNode, other, total) {
    const ctx = document.getElementById('ring-types');
    if (!ctx) return;

    const centerEl = document.getElementById('ring-types-center');
    if (centerEl) centerEl.innerText = total;

    const espEl = document.getElementById('legend-type-esp');
    if (espEl) espEl.innerText = esp;
    const gwEl = document.getElementById('legend-type-lora-gw');
    if (gwEl) gwEl.innerText = loraGw;
    const nodeEl = document.getElementById('legend-type-lora-node');
    if (nodeEl) nodeEl.innerText = loraNode;
    const otherEl = document.getElementById('legend-type-other');
    if (otherEl) otherEl.innerText = other;

    if (charts.ringTypes) charts.ringTypes.destroy();

    const hasData = (esp + loraGw + loraNode + other) > 0;
    const data = hasData ? [esp, loraGw, loraNode, other] : [1];
    const colors = hasData ? ['#8b5cf6', '#3b82f6', '#06b6d4', '#10b981'] : ['#2d2d3a'];

    charts.ringTypes = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: hasData ? ['ESP Node', 'LoRa Gateway', 'LoRa Node', 'RasPi/Other'] : ['No Devices Registered'],
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderWidth: 0,
                hoverOffset: hasData ? 4 : 0
            }]
        },
        options: {
            cutout: '78%',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { enabled: hasData }
            }
        }
    });
}

async function renderActiveTriggersRing() {
    const ctx = document.getElementById('ring-alerts');
    if (!ctx) return;

    let critical = 0, pending = 0, resolved = 0;

    try {
        const rulesRes = await fetch(`${API_BASE}/alerts/rules`, { headers: { 'Authorization': `Bearer ${currentToken}` } });
        if (rulesRes.ok) {
            const rules = await rulesRes.json();
            pending = rules.filter(r => r.is_active).length;
        }

        const ticketRes = await fetch(`${API_BASE}/tickets/`, { headers: { 'Authorization': `Bearer ${currentToken}` } });
        if (ticketRes.ok) {
            const tickets = await ticketRes.json();
            critical += tickets.filter(t => t.status === 'Open' || t.priority === 'High' || t.priority === 'Critical').length;
            resolved += tickets.filter(t => t.status === 'Closed' || t.status === 'Resolved').length;
        }
    } catch (e) { }

    const totalTriggers = critical + pending + resolved;
    const centerEl = document.getElementById('ring-alerts-center');
    if (centerEl) centerEl.innerText = totalTriggers;

    const statAlerts = document.getElementById('stat-active-alerts');
    if (statAlerts) statAlerts.innerText = critical + pending;

    const legCrit = document.getElementById('legend-crit');
    if (legCrit) legCrit.innerText = critical;
    const legPen = document.getElementById('legend-pending');
    if (legPen) legPen.innerText = pending;
    const legRes = document.getElementById('legend-resolved');
    if (legRes) legRes.innerText = resolved;

    if (charts.ringAlerts) charts.ringAlerts.destroy();

    const hasData = totalTriggers > 0;
    const data = hasData ? [critical, pending, resolved] : [1];
    const colors = hasData ? ['#ef4444', '#f59e0b', '#10b981'] : ['#2d2d3a'];

    charts.ringAlerts = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: hasData ? ['Critical', 'Pending', 'Resolved'] : ['No Triggers'],
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderWidth: 0,
                hoverOffset: hasData ? 4 : 0
            }]
        },
        options: {
            cutout: '78%',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { enabled: hasData }
            }
        }
    });
}

function renderTrafficBarChart() {
    const trafficCtx = document.getElementById('trafficBarChart');
    if (!trafficCtx) return;
    if (charts.traffic) charts.traffic.destroy();
    charts.traffic = new Chart(trafficCtx.getContext('2d'), {
        type: 'bar',
        data: {
            labels: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00'],
            datasets: [{
                data: [12, 19, 25, 42, 38, 55, 30],
                backgroundColor: '#8b5cf6',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { x: { display: false }, y: { display: false } },
            plugins: { legend: { display: false } }
        }
    });
}

async function checkSmtpBanner() {
    const role = (localStorage.getItem('iot_role') || 'user').toLowerCase();
    if (role !== 'admin') return;
    try {
        const res = await fetch(`${API_BASE}/alerts/smtp`, { headers: { 'Authorization': `Bearer ${currentToken}` } });
        const configs = await res.json();
        const stack = document.getElementById('banner-stack');
        if (configs.length === 0) {
            stack.innerHTML = `<div class="setup-banner">
                <div><strong>⚠ No SMTP Relay Configured</strong><p>Alert emails cannot be sent. Go to Alerts & Rules → Setup SMTP Relay to enable notifications.</p></div>
                <button class="banner-close" onclick="this.parentElement.remove()">&times;</button>
            </div>`;
        } else {
            stack.innerHTML = '';
        }
    } catch (e) { }
}

// ─────────────────────────────────────────────
// Fleet Matrix live mini-charts
// ─────────────────────────────────────────────
async function loadFleetMatrix() {
    try {
        const res = await fetch(`${API_BASE}/devices/`, { headers: { 'Authorization': `Bearer ${currentToken}` } });
        const devices = await res.json();
        const grid = document.getElementById('fleet-matrix-grid');
        grid.innerHTML = '';
        if (!devices.length) { grid.innerHTML = '<p class="text-muted">No devices registered.</p>'; return; }
        for (const dev of devices) {
            const card = document.createElement('div');
            card.className = 'matrix-card';
            const cid = `fleet-chart-${dev.hardware_id}`;
            card.innerHTML = `
                <div class="card-header"><h3>${dev.name}</h3><span class="badge badge-low">LIVE</span></div>
                <p style="font-size:0.75rem;color:var(--text-muted);margin-bottom:12px;">HWID: ${dev.hardware_id}</p>
                <div style="height:100px;"><canvas id="${cid}"></canvas></div>
                <button class="primary-btn" style="width:100%;justify-content:center;margin-top:15px;" onclick="openDeviceDetail('${dev.hardware_id}','${dev.name}')">Open Analytics</button>`;
            grid.appendChild(card);
            loadMiniFleetChart(dev.hardware_id, cid);
        }
    } catch (e) { }
}

async function loadMiniFleetChart(hwid, cid) {
    try {
        const res = await fetch(`${API_BASE}/telemetry/${hwid}?limit=20`, { headers: { 'Authorization': `Bearer ${currentToken}` } });
        const data = await res.json();
        if (!data.length) return;
        const sorted = data.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const key = Object.keys(sorted[0].data)[0];
        const ctx = document.getElementById(cid);
        if (!ctx) return;
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: sorted.map(p => ''),
                datasets: [{ data: sorted.map(p => p.data[key]), borderColor: '#8b5cf6', borderWidth: 2, pointRadius: 0, fill: true, backgroundColor: 'rgba(139,92,246,0.1)', tension: 0.4 }]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { x: { display: false }, y: { display: false } }, plugins: { legend: { display: false } } }
        });
    } catch (e) { }
}

// ─────────────────────────────────────────────
// Detail Sub Tabs
// ─────────────────────────────────────────────
function switchDetailSubTab(name) {
    ['visuals', 'console', 'alerts', 'management'].forEach(t => {
        const el = document.getElementById(`detail-subtab-${t}`);
        const link = document.getElementById(`detail-tab-link-${t}`);
        if (el) el.classList.add('hidden');
        if (link) link.classList.remove('active');
    });
    document.getElementById(`detail-subtab-${name}`)?.classList.remove('hidden');
    document.getElementById(`detail-tab-link-${name}`)?.classList.add('active');
}
window.switchDetailSubTab = switchDetailSubTab;

// ─────────────────────────────────────────────
// Users (Admin)
// ─────────────────────────────────────────────
async function loadUsers() {
    try {
        const res = await fetch(`${API_BASE}/auth/users`, { headers: { 'Authorization': `Bearer ${currentToken}` } });
        const users = await res.json();
        const container = document.getElementById('users-list-container');
        container.innerHTML = '';
        users.forEach(u => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:15px;background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:14px;';
            const roleColor = u.role === 'admin' ? 'var(--accent)' : (u.role === 'subadmin' ? 'var(--warning)' : 'var(--success)');
            row.innerHTML = `
                <div>
                    <p style="font-weight:600;">${u.full_name || 'N/A'}</p>
                    <p style="font-size:0.8rem;color:var(--text-muted);">${u.email}</p>
                </div>
                <div style="display:flex;align-items:center;gap:15px;">
                    <span style="background:rgba(0,0,0,0.3);padding:4px 12px;border-radius:8px;font-size:0.8rem;font-weight:700;color:${roleColor};">${u.role.toUpperCase()}</span>
                    <button class="accent-btn" style="padding:6px 14px;font-size:0.8rem;color:var(--danger);border-color:rgba(239,68,68,0.3);" onclick="deleteUser(${u.id})"><i class="fas fa-trash"></i></button>
                </div>`;
            container.appendChild(row);
        });
    } catch (e) { showNotification('Failed to load users', 'error'); }
}

async function deleteUser(userId) {
    if (!confirm('Permanently remove this user account?')) return;
    const res = await fetch(`${API_BASE}/auth/users/${userId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${currentToken}` } });
    if (res.ok) { showNotification('User removed', 'success'); loadUsers(); }
    else { const e = await res.json(); showNotification(e.detail || 'Delete failed', 'error'); }
}
window.deleteUser = deleteUser;

async function deleteDevice(deviceId, deviceName) {
    if (!confirm(`⚠️ Permanently delete device "${deviceName}"?\n\nThis will also remove all its telemetry data and alert rules.`)) return;
    try {
        const res = await fetch(`${API_BASE}/devices/${deviceId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (res.ok) {
            showNotification(`Device "${deviceName}" deleted successfully`, 'success');
            // Refresh both device views
            loadDevices();
            loadIntegrationDevices();
        } else {
            const err = await res.json();
            showNotification(err.detail || 'Failed to delete device', 'error');
        }
    } catch (e) {
        showNotification('Network error — could not delete device', 'error');
    }
}
window.deleteDevice = deleteDevice;

// ─────────────────────────────────────────────
// Incidents (Alert Logs across all devices)
// ─────────────────────────────────────────────
async function loadIncidents() {
    try {
        const devRes = await fetch(`${API_BASE}/devices/`, { headers: { 'Authorization': `Bearer ${currentToken}` } });
        const devices = await devRes.json();
        const tbody = document.getElementById('incidents-container');
        tbody.innerHTML = '';
        let allLogs = [];
        for (const dev of devices) {
            try {
                const logRes = await fetch(`${API_BASE}/alerts/logs/${dev.id}`, { headers: { 'Authorization': `Bearer ${currentToken}` } });
                if (logRes.ok) {
                    const logs = await logRes.json();
                    logs.forEach(l => allLogs.push({ ...l, devName: dev.name }));
                }
            } catch (e) { }
        }
        allLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        if (!allLogs.length) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:30px;">No incidents recorded.</td></tr>'; return; }
        allLogs.forEach(log => {
            const tr = document.createElement('tr');
            const statusColor = log.status === 'Resolved' ? 'var(--success)' : 'var(--danger)';
            tr.innerHTML = `
                <td style="color:var(--text-muted);font-size:0.85rem;">${new Date(log.timestamp).toLocaleString()}</td>
                <td><span class="badge badge-low">${log.devName}</span></td>
                <td>${log.message}</td>
                <td style="color:${statusColor};font-weight:700;">${log.status}</td>
                <td>${log.status !== 'Resolved' ? `<button class="accent-btn" style="padding:4px 10px;font-size:0.75rem;" onclick="resolveIncident(${log.id})">Resolve</button>` : '—'}</td>`;
            tbody.appendChild(tr);
        });
    } catch (e) { }
}

async function resolveIncident(logId) {
    const res = await fetch(`${API_BASE}/alerts/logs/${logId}/resolve`, { method: 'POST', headers: { 'Authorization': `Bearer ${currentToken}` } });
    if (res.ok) { showNotification('Incident resolved', 'success'); loadIncidents(); }
}
window.resolveIncident = resolveIncident;

// ─────────────────────────────────────────────
// Traffic Log Stream (Logs Tab)
// ─────────────────────────────────────────────
let logStreamInterval = null;
async function startLogStream() {
    const box = document.getElementById('log-entries');
    if (!box) return;
    if (logStreamInterval) clearInterval(logStreamInterval);
    const fetchLogs = async () => {
        try {
            const res = await fetch(`${API_BASE}/devices/`, { headers: { 'Authorization': `Bearer ${currentToken}` } });
            const devices = await res.json();
            if (!devices.length) return;
            const dev = devices[0];
            const tRes = await fetch(`${API_BASE}/telemetry/${dev.hardware_id}?limit=30`, { headers: { 'Authorization': `Bearer ${currentToken}` } });
            const data = await tRes.json();
            if (!data.length) return;
            box.innerHTML = data.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).map(t =>
                `<div style="margin-bottom:6px;"><span style="color:#4ade80">[${new Date(t.timestamp).toLocaleTimeString()}]</span> <span style="color:var(--accent)">RX ◀</span> ${JSON.stringify(t.data)}</div>`
            ).join('');
        } catch (e) { }
    };
    fetchLogs();
    logStreamInterval = setInterval(fetchLogs, 3000);
    document.getElementById('clear-logs')?.addEventListener('click', () => {
        clearInterval(logStreamInterval);
        document.getElementById('log-entries').innerHTML = '<p style="color:var(--text-muted)">Stream cleared.</p>';
    });
}

// ─────────────────────────────────────────────
// Delete Alert Rule
// ─────────────────────────────────────────────
async function deleteRule(ruleId) {
    if (!confirm('Decommission this trigger rule?')) return;
    const res = await fetch(`${API_BASE}/alerts/rules/${ruleId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${currentToken}` } });
    if (res.ok) { showNotification('Rule removed', 'success'); loadAlertsData(); }
    else showNotification('Failed to remove rule', 'error');
}
window.deleteRule = deleteRule;

// ─────────────────────────────────────────────
// SMTP Form Handlers
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('add-smtp-btn')?.addEventListener('click', () => document.getElementById('smtp-modal').classList.remove('hidden'));
    document.getElementById('add-template-btn')?.addEventListener('click', () => document.getElementById('template-modal').classList.remove('hidden'));

    document.getElementById('smtp-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = {
            name: `${document.getElementById('smtp-host').value}:${document.getElementById('smtp-port').value}`,
            from_email: document.getElementById('smtp-from-email').value,
            from_name: document.getElementById('smtp-from-name').value,
            host: document.getElementById('smtp-host').value,
            port: parseInt(document.getElementById('smtp-port').value),
            username: document.getElementById('smtp-user').value,
            password: document.getElementById('smtp-pass').value,
            security: document.getElementById('smtp-security').value,
            auth_type: document.getElementById('smtp-auth').value,
            helo_ident: document.getElementById('smtp-helo').value,
        };
        const res = await fetch(`${API_BASE}/alerts/smtp`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` }, body: JSON.stringify(data) });
        if (res.ok) { showNotification('SMTP Relay Deployed!', 'success'); hideModal('smtp-modal'); loadAlertsData(); }
        else { const err = await res.json(); showNotification(err.detail || 'SMTP save failed', 'error'); }
    });

    document.getElementById('test-smtp-btn')?.addEventListener('click', async () => {
        const receiver = document.getElementById('smtp-test-receiver').value;
        if (!receiver) { showNotification('Enter a test receiver email', 'error'); return; }
        const data = {
            name: document.getElementById('smtp-host').value,
            from_email: document.getElementById('smtp-from-email').value,
            from_name: document.getElementById('smtp-from-name').value,
            host: document.getElementById('smtp-host').value,
            port: parseInt(document.getElementById('smtp-port').value),
            username: document.getElementById('smtp-user').value,
            password: document.getElementById('smtp-pass').value,
            security: document.getElementById('smtp-security').value,
            auth_type: document.getElementById('smtp-auth').value,
            helo_ident: document.getElementById('smtp-helo').value,
        };
        showNotification('Sending test email...', 'info');
        const res = await fetch(`${API_BASE}/alerts/smtp/test?test_receiver=${encodeURIComponent(receiver)}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` }, body: JSON.stringify(data) });
        const r = await res.json();
        if (res.ok) showNotification(r.message, 'success');
        else showNotification(r.detail || 'Test failed', 'error');
    });

    document.getElementById('template-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = { name: document.getElementById('template-name').value, subject: document.getElementById('template-subject').value, body: document.getElementById('template-body').value };
        const res = await fetch(`${API_BASE}/alerts/templates`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` }, body: JSON.stringify(data) });
        if (res.ok) { showNotification('Template saved', 'success'); hideModal('template-modal'); loadAlertsData(); }
    });

    document.getElementById('alert-rule-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = {
            name: document.getElementById('alert-rule-name').value,
            device_id: parseInt(document.getElementById('alert-hwid-select').value),
            smtp_config_id: parseInt(document.getElementById('alert-smtp-select').value),
            sensor_key: document.getElementById('alert-sensor').value || null,
            trigger_type: document.getElementById('alert-trigger-type').value,
            condition_value: parseFloat(document.getElementById('alert-val').value),
            operator: document.getElementById('alert-op').value,
            recipients: document.getElementById('alert-emails').value,
            subject: document.getElementById('alert-subject').value,
            template: document.getElementById('alert-body').value,
            cooldown_seconds: parseInt(document.getElementById('alert-cooldown').value)
        };
        const res = await fetch(`${API_BASE}/alerts/rules`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` }, body: JSON.stringify(data) });
        if (res.ok) { showNotification('Trigger rule deployed!', 'success'); loadAlertsData(); }
        else { const err = await res.json(); showNotification(err.detail || 'Rule creation failed', 'error'); }
    });

    document.getElementById('alert-trigger-type')?.addEventListener('change', (e) => {
        const isHeartbeat = e.target.value === 'heartbeat';
        document.getElementById('sensor-key-group').style.display = isHeartbeat ? 'none' : '';
        document.getElementById('operator-group').style.display = isHeartbeat ? 'none' : '';
        document.getElementById('threshold-label').innerText = isHeartbeat ? 'Timeout (minutes)' : 'Threshold Value';
    });
});

// ─────────────────────────────────────────────
// Extended loadAlertsData - renders SMTP, rules, templates, populates selects
// ─────────────────────────────────────────────
async function loadAlertsData() {
    try {
        const [rulesRes, smtpRes, templatesRes, devicesRes] = await Promise.all([
            fetch(`${API_BASE}/alerts/rules`, { headers: { 'Authorization': `Bearer ${currentToken}` } }),
            fetch(`${API_BASE}/alerts/smtp`, { headers: { 'Authorization': `Bearer ${currentToken}` } }),
            fetch(`${API_BASE}/alerts/templates`, { headers: { 'Authorization': `Bearer ${currentToken}` } }),
            fetch(`${API_BASE}/devices/`, { headers: { 'Authorization': `Bearer ${currentToken}` } })
        ]);

        const rules = rulesRes.ok ? await rulesRes.json() : [];
        const smtpList = smtpRes.ok ? await smtpRes.json() : [];
        const templates = templatesRes.ok ? await templatesRes.json() : [];
        const devices = devicesRes.ok ? await devicesRes.json() : [];

        renderRules(rules);
        renderSmtpList(smtpList);
        renderTemplateList(templates);

        // Populate select dropdowns
        const smtpSel = document.getElementById('alert-smtp-select');
        if (smtpSel) smtpSel.innerHTML = smtpList.map(s => `<option value="${s.id}">${s.name}</option>`).join('') || '<option>No SMTP configured</option>';

        const hwSel = document.getElementById('alert-hwid-select');
        if (hwSel) hwSel.innerHTML = '<option value="">Select device...</option>' + devices.map(d => `<option value="${d.id}">${d.name} (${d.hardware_id})</option>`).join('');

        const templateSel = document.getElementById('alert-template-select');
        if (templateSel) {
            const opts = templates.map(t => `<option value="${t.id}" data-subject="${t.subject}" data-body="${t.body}">${t.name}</option>`).join('');
            templateSel.innerHTML = '<option value="custom">Custom Template</option>' + opts;
            templateSel.onchange = () => {
                const opt = templateSel.selectedOptions[0];
                if (opt.value !== 'custom') {
                    document.getElementById('alert-subject').value = opt.dataset.subject || '';
                    document.getElementById('alert-body').value = opt.dataset.body || '';
                }
            };
        }
    } catch (e) { console.error('loadAlertsData error:', e); }
}

function renderSmtpList(list) {
    const container = document.getElementById('smtp-list');
    if (!container) return;
    container.innerHTML = list.length ? '' : '<p class="empty-msg">No SMTP relays configured.</p>';
    list.forEach(s => {
        const div = document.createElement('div');
        div.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:12px;background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:10px;';
        div.innerHTML = `<div><p style="font-weight:600;font-size:0.9rem;">${s.name}</p><p style="font-size:0.75rem;color:var(--text-muted);">${s.from_email} · ${s.security}</p></div><span class="badge badge-low">ACTIVE</span>`;
        container.appendChild(div);
    });
}

function renderTemplateList(list) {
    const container = document.getElementById('template-list');
    if (!container) return;
    container.innerHTML = list.length ? '' : '<p class="empty-msg">No templates saved.</p>';
    list.forEach(t => {
        const div = document.createElement('div');
        div.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:12px;background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:10px;';
        div.innerHTML = `<p style="font-weight:600;font-size:0.9rem;">${t.name}</p><i class="fas fa-check-circle" style="color:var(--success);"></i>`;
        container.appendChild(div);
    });
}

function renderRules(rules) {
    const container = document.getElementById('rules-list');
    if (!container) return;
    container.innerHTML = rules.length ? '' : '<p class="empty-msg">No trigger rules active.</p>';
    rules.forEach(r => {
        const div = document.createElement('div');
        div.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:15px;background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:12px;';
        div.innerHTML = `
            <div>
                <h4 style="font-weight:700;">${r.name}</h4>
                <p style="font-size:0.8rem;color:var(--text-muted);">Type: ${r.trigger_type} · Recipient: ${r.recipients}</p>
            </div>
            <button class="accent-btn" style="color:var(--danger);border-color:rgba(239,68,68,0.3);" onclick="deleteRule(${r.id})"><i class="fas fa-trash"></i></button>`;
        container.appendChild(div);
    });
}

// ─────────────────────────────────────────────────────────────────
// CUSTOM DARK SELECT COMPONENT ENGINE
// ─────────────────────────────────────────────────────────────────
function setupCustomSelects() {
    document.querySelectorAll('select').forEach(select => {
        if (select.dataset.customized) return;
        select.dataset.customized = "true";
        select.style.display = 'none';

        const wrapper = document.createElement('div');
        wrapper.className = 'custom-select-container';

        const trigger = document.createElement('div');
        trigger.className = 'custom-select-trigger';

        const updateTriggerText = () => {
            const selectedOpt = select.options[select.selectedIndex];
            trigger.innerHTML = `<span>${selectedOpt ? selectedOpt.text : ''}</span><i class="fas fa-chevron-down" style="font-size:0.8rem;color:var(--text-muted);"></i>`;
        };
        updateTriggerText();

        const optionsDiv = document.createElement('div');
        optionsDiv.className = 'custom-select-options hidden';

        const renderOptions = () => {
            optionsDiv.innerHTML = Array.from(select.options).map((opt, idx) => {
                const isSel = idx === select.selectedIndex;
                return `<div class="custom-option ${isSel ? 'selected' : ''}" data-value="${opt.value}">${opt.text}</div>`;
            }).join('');

            optionsDiv.querySelectorAll('.custom-option').forEach((optEl, idx) => {
                optEl.onclick = (e) => {
                    e.stopPropagation();
                    select.selectedIndex = idx;
                    select.dispatchEvent(new Event('change'));
                    updateTriggerText();
                    optionsDiv.classList.add('hidden');
                    trigger.classList.remove('active');
                };
            });
        };

        renderOptions();

        select.addEventListener('change', () => {
            updateTriggerText();
            renderOptions();
        });

        trigger.onclick = (e) => {
            e.stopPropagation();
            document.querySelectorAll('.custom-select-options').forEach(el => {
                if (el !== optionsDiv) el.classList.add('hidden');
            });
            document.querySelectorAll('.custom-select-trigger').forEach(el => {
                if (el !== trigger) el.classList.remove('active');
            });

            const isHidden = optionsDiv.classList.contains('hidden');
            if (isHidden) {
                renderOptions();
                optionsDiv.classList.remove('hidden');
                trigger.classList.add('active');
            } else {
                optionsDiv.classList.add('hidden');
                trigger.classList.remove('active');
            }
        };

        if (select.parentNode) {
            select.parentNode.insertBefore(wrapper, select.nextSibling);
            wrapper.appendChild(select);
            wrapper.appendChild(trigger);
            wrapper.appendChild(optionsDiv);
        }
    });
}

document.addEventListener('click', () => {
    document.querySelectorAll('.custom-select-options').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.custom-select-trigger').forEach(el => el.classList.remove('active'));
});
window.setupCustomSelects = setupCustomSelects;


