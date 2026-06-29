const API_BASE = 'http://10.230.64.65:8001';
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

    if (tabId === 'overview') { initOverviewCharts(); loadFleetStatus(); }
    if (tabId === 'dashboard') loadDevices();
    if (tabId === 'fleet') loadFleetMatrix();
    if (tabId === 'integration') loadIntegrationDevices();
    if (tabId === 'tickets') loadTickets();
    if (tabId === 'alerts') loadAlertsData();
    if (tabId === 'logs') startLogStream();
    if (tabId === 'incidents') loadIncidents();
    if (tabId === 'users') loadUsers();
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
    // Health Ring
    const ringCtx = document.getElementById('coreHealthRing').getContext('2d');
    if (charts.healthRing) charts.healthRing.destroy();
    charts.healthRing = new Chart(ringCtx, {
        type: 'doughnut',
        data: {
            labels: ['Healthy', 'Warning', 'Critical'],
            datasets: [{
                data: [94, 4, 2],
                backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            cutout: '80%',
            plugins: { legend: { display: false } }
        }
    });

    // Mini Chart
    const miniCtx = document.getElementById('overviewMiniChart').getContext('2d');
    if (charts.mini) charts.mini.destroy();
    charts.mini = new Chart(miniCtx, {
        type: 'line',
        data: {
            labels: ['', '', '', '', '', ''],
            datasets: [{
                data: [65, 78, 62, 85, 94, 94],
                borderColor: '#8b5cf6',
                borderWidth: 2,
                pointRadius: 0,
                fill: true,
                backgroundColor: 'rgba(139, 92, 246, 0.1)',
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { x: { display: false }, y: { display: false } },
            plugins: { legend: { display: false } }
        }
    });

    // Traffic Bar
    const trafficCtx = document.getElementById('trafficBarChart').getContext('2d');
    if (charts.traffic) charts.traffic.destroy();
    charts.traffic = new Chart(trafficCtx, {
        type: 'bar',
        data: {
            labels: ['1', '2', '3', '4', '5', '6', '7', '8'],
            datasets: [{
                data: [12, 19, 15, 25, 22, 30, 20, 28],
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
        card.innerHTML = `
            <div class="card-header">
                <h3>${dev.name}</h3>
                <span class="badge badge-low">ACTIVE</span>
            </div>
            <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 20px;">HWID: ${dev.hardware_id}</p>
            <div style="background: rgba(0,0,0,0.3); padding: 15px; border-radius: 12px; margin-bottom: 20px;">
                <p style="font-size: 0.65rem; color: var(--text-muted); margin-bottom: 5px;">SECRET TOKEN</p>
                <code style="color: var(--accent); font-size: 0.9rem;">${dev.secret}</code>
            </div>
            <button class="primary-btn" style="width:100%; justify-content: center;" onclick="openDeviceDetail('${dev.hardware_id}', '${dev.name}')">View Intelligent Data</button>
        `;
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
            const card = document.createElement('div');
            card.className = 'integration-card';
            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; margin-bottom: 15px;">
                    <div class="icon-box"><i class="fas fa-server"></i></div>
                    <div style="text-align: right;">
                        <span class="status-dot" style="background: var(--success);"></span>
                        <span style="font-size: 0.75rem; font-weight: 600; color: var(--success);">PROVISIONED</span>
                    </div>
                </div>
                <h3 style="margin-bottom: 5px;">${dev.name}</h3>
                <p style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 15px;">Target Node: ${dev.hardware_id}</p>
                
                <div style="background: rgba(0,0,0,0.2); padding: 12px; border-radius: 10px; border: 1px solid var(--border); margin-bottom: 20px;">
                    <div style="margin-bottom: 10px;">
                        <p style="font-size: 0.6rem; color: var(--text-muted); text-transform: uppercase;">Hardware ID</p>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <code style="color: #fff; font-size: 0.85rem;">${dev.hardware_id}</code>
                            <i class="fas fa-copy text-accent" style="cursor:pointer;" onclick="copyToClipboard('${dev.hardware_id}', 'Hardware ID')"></i>
                        </div>
                    </div>
                    <div>
                        <p style="font-size: 0.6rem; color: var(--text-muted); text-transform: uppercase;">Secret Key</p>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <code style="color: var(--accent); font-size: 0.85rem;">${dev.secret}</code>
                            <i class="fas fa-copy text-accent" style="cursor:pointer;" onclick="copyToClipboard('${dev.secret}', 'Secret Key')"></i>
                        </div>
                    </div>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <button class="accent-btn" style="width: 100%;" onclick="openDeviceDetail('${dev.hardware_id}', '${dev.name}')">View Data</button>
                    <button class="primary-btn" style="width: 100%; justify-content: center; background: var(--accent-soft); color: var(--accent); border: 1px solid var(--accent-glow);" onclick="goToFirmwareLab('${dev.hardware_id}', '${dev.secret}')">Build Code</button>
                </div>
            `;
            container.appendChild(card);
        });
    } catch (e) {}
}

function copyToClipboard(text, label) {
    navigator.clipboard.writeText(text).then(() => {
        showNotification(`${label} copied to clipboard!`, 'success');
    });
}
window.copyToClipboard = copyToClipboard;

function goToFirmwareLab(hwid, secret) {
    switchTab('firmware');
    document.getElementById('gen-hwid').value = hwid;
    document.getElementById('gen-secret').value = secret;
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
    } catch (e) {}
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
    const sortedData = [...telemetry].sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
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
    } catch (e) {}
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

// Firmware Generator logic
document.getElementById('gen-api-url').value = `http://10.230.64.65:8001/telemetry/ingest`;
document.getElementById('generate-code-btn').onclick = () => {
    const board = document.getElementById('gen-board').value;
    const hwid = document.getElementById('gen-hwid').value || "DEVICE_ID_HERE";
    const secret = document.getElementById('gen-secret').value || "SECRET_KEY_HERE";
    const ssid = document.getElementById('gen-wifi-ssid').value || "WIFI_NAME";
    const pass = document.getElementById('gen-wifi-pass').value || "WIFI_PASS";
    
    const code = generateArduinoCode(board, hwid, secret, ssid, pass);
    document.getElementById('code-display').innerText = code;
    showNotification("Source Code Built", "success");
};

document.getElementById('copy-code-btn').onclick = () => {
    const code = document.getElementById('code-display').innerText;
    navigator.clipboard.writeText(code).then(() => {
        showNotification("Code Copied to Clipboard", "success");
    }).catch(err => {
        showNotification("Copy failed", "error");
    });
};

function generateArduinoCode(board, hwid, secret, ssid, pass) {
    const isESP32 = board === 'esp32';
    const includes = isESP32 ? '#include <WiFi.h>\n#include <HTTPClient.h>' : '#include <ESP8266WiFi.h>\n#include <ESP8266HTTPClient.h>';
    
    return `/* 
 * IoT Guard Cloud Infrastructure
 * Automatic Node Firmware Template
 */

${includes}

// Network Configuration
const char* ssid = "${ssid}";
const char* password = "${pass}";
const char* api_url = "${document.getElementById('gen-api-url').value}";

// Hardware Identity
const char* hardware_id = "${hwid}";
const char* secret_key = "${secret}";

void setup() {
  Serial.begin(115200);
  delay(100);
  
  Serial.print("Connecting to Sentinel Network: ");
  WiFi.begin(ssid, password);
  
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  
  Serial.println("\\nConnection Established.");
  Serial.print("Node IP: ");
  Serial.println(WiFi.localIP());
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(api_url);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("x-hardware-id", hardware_id);
    http.addHeader("x-device-secret", secret_key);
    
    // Read Sensors
    float temp = readTemperature();
    float humidity = readHumidity();
    
    // IMPORTANT: Payload must be wrapped in {"data": {...}} so the server can parse it
    String json = "{\\"data\\": {\\"temperature\\": " + String(temp, 2) + ", \\"humidity\\": " + String(humidity, 1) + "}}";
    
    Serial.print("Dispatching: ");
    Serial.println(json);
    
    int httpResponseCode = http.POST(json);
    
    if (httpResponseCode > 0) {
      Serial.print("OK Code: ");
      Serial.println(httpResponseCode);
    } else {
      Serial.print("FAULT: ");
      Serial.println(httpResponseCode);
    }
    
    http.end();
  }
  
  delay(10000);
}

// --- Sensor Reads (replace with real sensor library calls) ---
float readTemperature() { return random(200, 350) / 10.0; }
float readHumidity()    { return random(40, 80); }
`;
}
// Registration Form sync
document.getElementById('device-form').onsubmit = async (e) => {
    e.preventDefault();
    const data = {
        name: document.getElementById('device_name').value,
        hardware_id: document.getElementById('hardware_id').value,
        type: document.getElementById('device_type').value
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
            goToFirmwareLab(device.hardware_id, device.secret);
        }
    } else {
        const err = await res.json();
        showNotification(err.detail || "Registration failed", "error");
    }
};

// ─────────────────────────────────────────────
// Fleet Status Chips (top header rollup)
// ─────────────────────────────────────────────
async function loadFleetStatus() {
    try {
        const res = await fetch(`${API_BASE}/devices/`, { headers: { 'Authorization': `Bearer ${currentToken}` } });
        if (!res.ok) return;
        const devices = await res.json();
        const now = new Date();
        let down = 0, warn = 0, up = 0;
        devices.forEach(d => {
            if (!d.last_seen) { down++; return; }
            const mins = (now - new Date(d.last_seen)) / 60000;
            if (mins > 30) down++;
            else if (mins > 10) warn++;
            else up++;
        });
        document.getElementById('chip-down-val').innerText = down;
        document.getElementById('chip-warn-val').innerText = warn;
        document.getElementById('chip-up-val').innerText = up;
        document.getElementById('stat-total-devices').innerText = devices.length;

        // overview ring
        updateOverviewRing(down, warn, up);
        checkSmtpBanner();
    } catch(e) {}
}

function updateOverviewRing(down, warn, up) {
    const ctx = document.getElementById('ring-devices');
    if (!ctx) return;
    if (charts.ringDevices) charts.ringDevices.destroy();
    const total = down + warn + up || 1;
    document.getElementById('ring-devices-center').innerText = down + warn + up;
    document.getElementById('legend-down').innerText = down;
    document.getElementById('legend-warn').innerText = warn;
    document.getElementById('legend-up').innerText = up;
    charts.ringDevices = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Silent', 'Warning', 'Reporting'],
            datasets: [{ data: [down, warn, up], backgroundColor: ['#ef4444','#f59e0b','#10b981'], borderWidth: 0 }]
        },
        options: { cutout: '78%', plugins: { legend: { display: false } } }
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
    } catch(e) {}
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
    } catch(e) {}
}

async function loadMiniFleetChart(hwid, cid) {
    try {
        const res = await fetch(`${API_BASE}/telemetry/${hwid}?limit=20`, { headers: { 'Authorization': `Bearer ${currentToken}` } });
        const data = await res.json();
        if (!data.length) return;
        const sorted = data.sort((a,b) => new Date(a.timestamp)-new Date(b.timestamp));
        const key = Object.keys(sorted[0].data)[0];
        const ctx = document.getElementById(cid);
        if (!ctx) return;
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: sorted.map(p => ''),
                datasets: [{ data: sorted.map(p => p.data[key]), borderColor: '#8b5cf6', borderWidth: 2, pointRadius: 0, fill: true, backgroundColor: 'rgba(139,92,246,0.1)', tension: 0.4 }]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { x:{display:false}, y:{display:false} }, plugins: { legend:{display:false} } }
        });
    } catch(e) {}
}

// ─────────────────────────────────────────────
// Detail Sub Tabs
// ─────────────────────────────────────────────
function switchDetailSubTab(name) {
    ['visuals','console','alerts','management'].forEach(t => {
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
    } catch(e) { showNotification('Failed to load users', 'error'); }
}

async function deleteUser(userId) {
    if (!confirm('Permanently remove this user account?')) return;
    const res = await fetch(`${API_BASE}/auth/users/${userId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${currentToken}` } });
    if (res.ok) { showNotification('User removed', 'success'); loadUsers(); }
    else { const e = await res.json(); showNotification(e.detail || 'Delete failed', 'error'); }
}
window.deleteUser = deleteUser;

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
            } catch(e) {}
        }
        allLogs.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
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
    } catch(e) {}
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
            box.innerHTML = data.sort((a,b) => new Date(b.timestamp)-new Date(a.timestamp)).map(t =>
                `<div style="margin-bottom:6px;"><span style="color:#4ade80">[${new Date(t.timestamp).toLocaleTimeString()}]</span> <span style="color:var(--accent)">RX ◀</span> ${JSON.stringify(t.data)}</div>`
            ).join('');
        } catch(e) {}
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
            from_name:  document.getElementById('smtp-from-name').value,
            host:       document.getElementById('smtp-host').value,
            port:       parseInt(document.getElementById('smtp-port').value),
            username:   document.getElementById('smtp-user').value,
            password:   document.getElementById('smtp-pass').value,
            security:   document.getElementById('smtp-security').value,
            auth_type:  document.getElementById('smtp-auth').value,
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
            from_name:  document.getElementById('smtp-from-name').value,
            host:       document.getElementById('smtp-host').value,
            port:       parseInt(document.getElementById('smtp-port').value),
            username:   document.getElementById('smtp-user').value,
            password:   document.getElementById('smtp-pass').value,
            security:   document.getElementById('smtp-security').value,
            auth_type:  document.getElementById('smtp-auth').value,
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
    } catch(e) { console.error('loadAlertsData error:', e); }
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

