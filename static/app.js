// Automatically detect the correct API backend host
const getApiBase = () => {
    // 1. If explicit environment variable PUBLIC_API_URL is configured and valid, use it!
    if (window.PUBLIC_API_URL && typeof window.PUBLIC_API_URL === 'string') {
        const val = window.PUBLIC_API_URL.trim();
        if (val.startsWith('http://') || val.startsWith('https://')) {
            return val.replace(/\/+$/, '');
        }
    }
    // 2. If running in browser with HTTP/HTTPS origin, use the exact current origin (matches current port e.g. 8080, 8000)
    if (window.location && window.location.origin && window.location.origin.startsWith('http')) {
        return window.location.origin;
    }
    // 3. Fallback for non-http or file:// protocol
    return 'http://localhost:8080';
};

const API_BASE = getApiBase();

const ALL_PERMISSION_LABELS = {
    'overview': 'Dashboard',
    'dashboard': 'Overview',
    'fleet': 'Live Fleet',
    'details': 'Analytics',
    'tickets': 'Tickets',
    'logs': 'Logs',
    'incidents': 'Incidents',
    'integration': 'Integration',
    'alerts': 'Alert Engine',
    'firmware': 'Firmware',
    'users': 'Users Mgmt'
};

const ROLE_DEFAULT_PERMS = {
    'user': ['overview', 'dashboard', 'details', 'tickets', 'logs'],
    'subadmin': ['overview', 'dashboard', 'fleet', 'details', 'tickets', 'logs', 'incidents', 'integration', 'alerts'],
    'admin': ['overview', 'dashboard', 'fleet', 'details', 'tickets', 'logs', 'incidents', 'integration', 'alerts', 'firmware', 'users']
};

let currentToken = localStorage.getItem('iot_token');
let currentRole = localStorage.getItem('iot_role');
let isLoginMode = true;
let activeHwid = null;
let currentActiveDevice = null;
let cachedDevices = [];
let activeSensorFilter = 'all';
let selectedRegComponents = [];
let selectedEditComponents = [];
let editingDeviceId = null;
let dashboardInterval = null;
let charts = {};
const USER_CACHE = {};

// ─────────────────────────────────────────────────────────────
// Auth System — Clean, Modern & Robust
// ─────────────────────────────────────────────────────────────
let selectedAccountRole = 'admin';

function logout() {
    localStorage.clear();
    currentToken = null;
    currentRole = null;
    showAuth();
    switchAuthMode('login');
    showNotification('Logged out successfully', 'info');
}
window.logout = logout;

function switchAuthMode(mode) {
    const isLogin = mode === 'login';
    isLoginMode = isLogin;
    window.isLoginMode = isLogin;

    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');
    if (tabLogin) {
        if (isLogin) tabLogin.classList.add('active');
        else tabLogin.classList.remove('active');
    }
    if (tabRegister) {
        if (isLogin) tabRegister.classList.remove('active');
        else tabRegister.classList.add('active');
    }

    // Toggle registration fields by ID and class
    const fFull = document.getElementById('field-fullname');
    const fRole = document.getElementById('field-role');
    const fConf = document.getElementById('field-confirm-pass');

    if (fFull) fFull.style.setProperty('display', isLogin ? 'none' : 'flex', 'important');
    if (fRole) fRole.style.setProperty('display', isLogin ? 'none' : 'flex', 'important');
    if (fConf) fConf.style.setProperty('display', isLogin ? 'none' : 'flex', 'important');

    const btnText = document.getElementById('auth-btn-text');
    const footerPrompt = document.getElementById('auth-footer-prompt');
    const footerAction = document.getElementById('auth-footer-action');

    if (btnText) {
        btnText.innerHTML = isLogin 
            ? '<i class="fas fa-lock"></i> SIGN IN TO PLATFORM'
            : '<i class="fas fa-user-plus"></i> CREATE ACCOUNT & ACCESS';
    }
    if (footerPrompt) {
        footerPrompt.innerText = isLogin ? "Don't have an account?" : "Already have an account?";
    }
    if (footerAction) {
        footerAction.innerText = isLogin ? "Create Admin Account" : "Sign In to Account";
    }
}
window.switchAuthMode = switchAuthMode;
window.toggleAuthMode = (login) => switchAuthMode(login ? 'login' : 'register');

function selectRole(role) {
    selectedAccountRole = role;
    document.querySelectorAll('.role-pill').forEach(pill => {
        const input = pill.querySelector('input');
        if (input) {
            const isMatch = input.value === role;
            input.checked = isMatch;
            pill.classList.toggle('active', isMatch);
        }
    });
}
window.selectRole = selectRole;

function togglePassVisibility(fieldId) {
    const input = document.getElementById(fieldId);
    if (!input) return;
    const isPass = input.type === 'password';
    input.type = isPass ? 'text' : 'password';
    const icon = input.parentElement.querySelector('.toggle-pass-icon');
    if (icon) {
        icon.classList.toggle('fa-eye', !isPass);
        icon.classList.toggle('fa-eye-slash', isPass);
    }
}
window.togglePassVisibility = togglePassVisibility;

async function executeAuthSubmit(e) {
    if (e) {
        e.preventDefault();
        if (typeof e.stopPropagation === 'function') e.stopPropagation();
    }

    const emailEl = document.getElementById('email');
    const passwordEl = document.getElementById('password');
    const email = emailEl ? emailEl.value.trim() : '';
    const password = passwordEl ? passwordEl.value : '';

    if (!email || !password) {
        showNotification("Email and password are required", "error");
        return false;
    }

    const submitBtn = document.getElementById('auth-submit-btn');
    if (submitBtn) submitBtn.disabled = true;

    try {
        if (isLoginMode) {
            const res = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: email, email: email, password: password })
            });
            const data = await res.json();
            if (res.ok) {
                currentToken = data.access_token;
                const safeRole = toLowerSafe(data.role, 'user') || 'user';
                currentRole = safeRole;
                localStorage.setItem('iot_token', currentToken);
                localStorage.setItem('iot_role', safeRole);
                localStorage.setItem('iot_user_name', data.full_name || 'User');
                try {
                    const perms = Array.isArray(data.permissions) ? data.permissions : [];
                    localStorage.setItem('iot_permissions', JSON.stringify(perms));
                } catch (_) { localStorage.setItem('iot_permissions', '[]'); }
                showNotification(`Login Successful! Welcome, ${data.full_name || 'User'}.`, 'success');
                showDashboard();
            } else {
                showNotification(data.detail || 'Incorrect email or password', 'error');
            }
        } else {
            const fullNameEl = document.getElementById('full_name');
            const confirmPassEl = document.getElementById('confirm_password');
            const full_name = fullNameEl ? fullNameEl.value.trim() : '';
            const confirm_password = confirmPassEl ? confirmPassEl.value : '';

            if (!full_name) {
                showNotification("Full Name is required for registration", "error");
                if (submitBtn) submitBtn.disabled = false;
                return false;
            }
            if (password !== confirm_password) {
                showNotification("Passwords do not match", "error");
                if (submitBtn) submitBtn.disabled = false;
                return false;
            }

            const res = await fetch(`${API_BASE}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: email,
                    password: password,
                    full_name: full_name,
                    role: selectedAccountRole
                })
            });
            const data = await res.json();
            if (res.ok) {
                showNotification('Account Created Successfully! Please sign in with your credentials.', 'success');
                if (passwordEl) passwordEl.value = '';
                if (confirmPassEl) confirmPassEl.value = '';
                switchAuthMode('login');
            } else {
                showNotification(data.detail || 'Registration failed', 'error');
            }
        }
    } catch (err) {
        showNotification('Backend connection failed', 'error');
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
    return false;
}
window.executeAuthSubmit = executeAuthSubmit;
window.handleAuthSubmit = executeAuthSubmit;

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');
    const footerAction = document.getElementById('auth-footer-action');

    if (tabLogin) tabLogin.onclick = (e) => { e.preventDefault(); switchAuthMode('login'); };
    if (tabRegister) tabRegister.onclick = (e) => { e.preventDefault(); switchAuthMode('register'); };
    if (footerAction) footerAction.onclick = (e) => { e.preventDefault(); switchAuthMode(isLoginMode ? 'register' : 'login'); };

    const urlParams = new URLSearchParams(window.location.search);
    const authMode = urlParams.get('auth');

    if (authMode === 'register') {
        switchAuthMode('register');
    } else {
        switchAuthMode('login');
    }

    if (currentToken) {
        try {
            const res = await fetch(`${API_BASE}/auth/me`, {
                headers: { 'Authorization': `Bearer ${currentToken}` }
            });
            if (res.ok) {
                const user = await res.json();
                localStorage.setItem('iot_role', user.role || 'user');
                localStorage.setItem('iot_user_name', user.full_name || 'User');
                showDashboard();
            } else {
                localStorage.clear();
                currentToken = null;
                currentRole = null;
                showAuth();
            }
        } catch (e) {
            localStorage.clear();
            currentToken = null;
            currentRole = null;
            showAuth();
        }
    } else {
        showAuth();
    }

    updateFirmwareForm();
    setupCustomSelects();
});

function toLowerSafe(v, d = '') { try { return (v == null ? d : String(v)).toLowerCase(); } catch (e) { return d; } }

function switchTab(tabId) {
    const rawRole = localStorage.getItem('iot_role') || 'user';
    const role = toLowerSafe(rawRole, 'user').trim();

    // Strict Abstraction: Prevent unauthorized tab access
    const protectedTabs = {
        'integration': ['admin', 'subadmin'],
        'alerts': ['admin', 'subadmin'],
        'firmware': ['admin'],
        'users': ['admin'],
        'fleet': ['admin', 'subadmin'],
        'incidents': ['admin', 'subadmin']
    };

    if (protectedTabs[tabId] && !protectedTabs[tabId].includes(role)) {
        showNotification("Access Denied: Administrative privileges required", "error");
        return;
    }

    // Fine-grained: Permission list check (overrides role defaults when perms set)
    if (!hasTabPermission(tabId)) {
        showNotification(`Access Denied: Your account does not have permission for "${(ALL_PERMISSION_LABELS[tabId] || tabId)}"`, "error");
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
async function handleAuthSubmit(e) {
    if (e) {
        e.preventDefault();
        if (typeof e.stopPropagation === 'function') e.stopPropagation();
    }
    const emailEl = document.getElementById('email');
    const passwordEl = document.getElementById('password');
    const email = emailEl ? emailEl.value.trim() : '';
    const password = passwordEl ? passwordEl.value : '';

    if (!email || !password) {
        showNotification("Email and password are required", "error");
        return false;
    }

    try {
        if (isLoginMode) {
            const res = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: email, email: email, password: password })
            });
            const data = await res.json();
            if (res.ok) {
                currentToken = data.access_token;
                const safeRole = toLowerSafe(data.role, 'user') || 'user';
                currentRole = safeRole;
                localStorage.setItem('iot_token', currentToken);
                localStorage.setItem('iot_role', safeRole);
                localStorage.setItem('iot_user_name', data.full_name || 'User');
                try {
                    const perms = Array.isArray(data.permissions) ? data.permissions : [];
                    localStorage.setItem('iot_permissions', JSON.stringify(perms));
                } catch (_) { localStorage.setItem('iot_permissions', '[]'); }
                showNotification(`Login Successful! Welcome, ${data.full_name || 'User'}.`, 'success');
                showDashboard();
            } else {
                showNotification(data.detail || 'Incorrect email or password', 'error');
            }
        } else {
            const fullNameEl = document.getElementById('full_name');
            const roleSelectEl = document.getElementById('role_select');
            const confirmPassEl = document.getElementById('confirm_password');

            const full_name = fullNameEl ? fullNameEl.value.trim() : '';
            const role = roleSelectEl ? roleSelectEl.value : 'user';
            const confirm_password = confirmPassEl ? confirmPassEl.value : '';

            if (!full_name) {
                showNotification("Full Name is required for registration", "error");
                return false;
            }
            if (password !== confirm_password) {
                showNotification("Passwords do not match", "error");
                return false;
            }

            const res = await fetch(`${API_BASE}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, full_name, role })
            });
            const data = await res.json();
            if (res.ok) {
                showNotification('Account Created Successfully! Please enter your password to Log In.', 'success');
                if (passwordEl) passwordEl.value = '';
                if (confirmPassEl) confirmPassEl.value = '';
                toggleAuthMode(true);
            } else {
                showNotification(data.detail || 'Registration failed', 'error');
            }
        }
    } catch (err) {
        showNotification('Backend connection failed', 'error');
    }
    return false;
}
window.handleAuthSubmit = handleAuthSubmit;
const authFormEl = document.getElementById('auth-form');
if (authFormEl) {
    authFormEl.onsubmit = handleAuthSubmit;
}

function showAuth() {
    const authSec = document.getElementById('auth-section') || authSection;
    const dashSec = document.getElementById('dashboard-section') || dashboardSection;
    if (authSec) authSec.classList.remove('hidden');
    if (dashSec) dashSec.classList.add('hidden');
}

function showDashboard() {
    const authSec = document.getElementById('auth-section') || authSection;
    const dashSec = document.getElementById('dashboard-section') || dashboardSection;
    if (authSec) authSec.classList.add('hidden');
    if (dashSec) dashSec.classList.remove('hidden');
    applyRolePermissions();
    switchTab('overview');
}

function getUserPermissions() {
    try {
        const raw = localStorage.getItem('iot_permissions');
        if (!raw || raw === 'undefined' || raw === 'null') return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
}

function hasTabPermission(tabId) {
    const role = toLowerSafe(localStorage.getItem('iot_role'), 'user').trim();
    if (role === 'admin') return true;
    const perms = getUserPermissions();
    if (!perms.length) {
        const fallback = ROLE_DEFAULT_PERMS[role] || ROLE_DEFAULT_PERMS['user'];
        return fallback.includes(tabId);
    }
    return perms.includes(tabId);
}

function applyRolePermissions() {
    let rawRole = localStorage.getItem('iot_role');
    if (!rawRole || rawRole === 'undefined' || rawRole === 'null') {
        rawRole = 'user';
    }
    const role = toLowerSafe(rawRole, 'user').trim();
    const userName = localStorage.getItem('iot_user_name') || 'User';
    const perms = getUserPermissions();
    const effectivePerms = perms.length ? perms : (ROLE_DEFAULT_PERMS[role] || ROLE_DEFAULT_PERMS['user']);

    console.log(`[ACL Check] User: ${userName}, Role: ${role}, Permissions: [${effectivePerms.join(', ')}]`);

    const nameEl = document.getElementById('user-display-name');
    const roleEl = document.getElementById('user-display-role');

    if (nameEl) nameEl.innerText = userName;
    if (roleEl) roleEl.innerText = role.toUpperCase();

    // Role-based strict gating (CSS class markers)
    const adminOnlyEls = document.querySelectorAll('.admin-only');
    adminOnlyEls.forEach(el => {
        if (role === 'admin') el.classList.remove('hidden');
        else el.classList.add('hidden');
    });

    const adminSubEls = document.querySelectorAll('.admin-or-subadmin');
    adminSubEls.forEach(el => {
        if (role === 'admin' || role === 'subadmin') el.classList.remove('hidden');
        else el.classList.add('hidden');
    });

    // Permission-based nav item visibility (override role gating if permission explicitly denied)
    document.querySelectorAll('.nav-item').forEach(item => {
        const clickAttr = item.getAttribute('onclick') || '';
        const match = clickAttr.match(/switchTab\(['"]([^'"]+)['"]\)/);
        if (match) {
            const tabId = match[1];
            const visible = hasTabPermission(tabId);
            if (!visible) {
                item.classList.add('hidden');
            }
        }
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
        cachedDevices = devices;
        renderDevices(devices);
    } catch (e) { showNotification("Failed to load devices", "error"); }
}

function renderDevices(devices) {
    cachedDevices = devices;
    const container = document.getElementById('devices-container');
    container.innerHTML = devices.length ? '' : '<p class="text-muted">No devices found.</p>';
    devices.forEach(dev => {
        const card = document.createElement('div');
        card.className = 'integration-card';
        const isAdmin = currentRole === 'admin';
        const compList = dev.components || [];
        const compTagsHtml = compList.length > 0 ? `
            <div style="margin-bottom: 15px;">
                <p style="font-size: 0.68rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">
                    <i class="fas fa-microchip" style="color: var(--accent);"></i> Wired Sensors (${compList.length})
                </p>
                <div style="display: flex; flex-wrap: wrap; gap: 5px;">
                    ${compList.map(c => `<span class="device-comp-tag">${c.icon || '🔌'} ${c.name}</span>`).join('')}
                </div>
            </div>` : `
            <div style="margin-bottom: 15px;">
                <p style="font-size: 0.72rem; color: var(--text-muted); font-style: italic;">
                    No components selected. <a href="javascript:void(0)" onclick="openEditComponentsModal(${dev.id})" style="color: var(--accent); text-decoration: underline;">Configure</a>
                </p>
            </div>`;

        card.innerHTML = `
            <div class="card-header" style="display:flex;justify-content:space-between;align-items:flex-start;">
                <div>
                    <h3>${dev.name}</h3>
                    <span class="badge badge-low">${dev.device_type.replace('_', ' ')}</span>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="accent-btn" title="Configure Attached Components" onclick="openEditComponentsModal(${dev.id})"
                        style="padding: 6px 10px; font-size: 0.8rem; display: flex; align-items: center; gap: 4px;">
                        <i class="fas fa-sliders-h"></i>
                    </button>
                    ${isAdmin ? `
                    <button class="device-delete-btn" title="Delete Device" onclick="deleteDevice(${dev.id}, '${dev.name}')"
                        style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.35);color:#ef4444;
                        border-radius:8px;padding:6px 10px;cursor:pointer;transition:all 0.2s;font-size:0.85rem;
                        display:flex;align-items:center;gap:5px;">
                        <i class="fas fa-trash-alt"></i>
                    </button>` : ''}
                </div>
            </div>
            <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 15px;">HWID: ${dev.hardware_id}</p>
            ${compTagsHtml}
            <div style="background: rgba(0,0,0,0.3); padding: 12px; border-radius: 12px; margin-bottom: 15px;">
                <p style="font-size: 0.65rem; color: var(--text-muted); margin-bottom: 4px;">SECRET TOKEN</p>
                <code style="color: var(--accent); font-size: 0.85rem;">${dev.secret}</code>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <button class="accent-btn" style="justify-content: center; font-size: 0.8rem;" onclick="openEditComponentsModal(${dev.id})">
                    <i class="fas fa-microchip" style="margin-right: 5px;"></i> Sensors
                </button>
                <button class="primary-btn" style="justify-content: center; font-size: 0.8rem;" onclick="openDeviceDetail('${dev.hardware_id}', '${dev.name}')">
                    <i class="fas fa-chart-line" style="margin-right: 5px;"></i> Analytics
                </button>
            </div>
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
// Device Detail View
async function openDeviceDetail(hwid, name) {
    activeHwid = hwid;
    currentActiveDevice = (cachedDevices || []).find(d => d.hardware_id === hwid) || { hardware_id: hwid, name: name, components: [] };
    activeSensorFilter = 'all';

    // Clear previous charts and destroy instances
    const container = document.getElementById('charts-container');
    if (container) container.innerHTML = '';
    Object.keys(charts).forEach(k => {
        if (k.startsWith('detail-chart-')) {
            try { charts[k].destroy(); } catch (e) {}
            delete charts[k];
        }
    });

    switchTab('details');
    document.getElementById('device-selection-prompt').classList.add('hidden');
    document.getElementById('details-content').classList.remove('hidden');
    document.getElementById('tab-title').innerText = `Broadcaster: ${name}`;

    // Update Node Config identities
    const mgmtHwid = document.getElementById('mgmt-hwid');
    const mgmtName = document.getElementById('mgmt-name');
    if (mgmtHwid) mgmtHwid.value = hwid;
    if (mgmtName) mgmtName.value = name;
    updateMgmtComponentsList(currentActiveDevice.components);

    // Setup filter toolbar
    renderSensorFilterToolbar(currentActiveDevice);

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

function updateMgmtComponentsList(components) {
    const listEl = document.getElementById('mgmt-components-list');
    if (!listEl) return;
    const comps = components || [];
    if (!comps.length) {
        listEl.innerHTML = '<span class="text-muted" style="font-size: 0.85rem; font-style: italic;">No components attached yet. Click "Edit Components" to add sensors.</span>';
        return;
    }
    listEl.innerHTML = comps.map(c => `
        <div style="background: rgba(0, 229, 255, 0.1); border: 1px solid rgba(0, 229, 255, 0.3); border-radius: 8px; padding: 6px 12px; display: inline-flex; align-items: center; gap: 8px;">
            <span style="font-size: 1.1rem;">${c.icon || '🔌'}</span>
            <div>
                <div style="font-weight: 600; font-size: 0.8rem; color: #fff;">${c.name}</div>
                <div style="font-size: 0.65rem; color: var(--text-muted); font-family: 'Fira Code', monospace;">
                    ${(c.keys || []).join(', ') || 'data'}
                </div>
            </div>
        </div>
    `).join('');
}

function renderSensorFilterToolbar(device) {
    const toolbar = document.getElementById('sensor-filter-toolbar');
    const pillsContainer = document.getElementById('sensor-filter-pills');
    if (!toolbar || !pillsContainer) return;

    toolbar.style.display = 'flex';
    const comps = (device && device.components) || [];

    let pillsHtml = `
        <button class="sensor-filter-btn ${activeSensorFilter === 'all' ? 'active' : ''}" onclick="setSensorFilter('all', this)">
            <i class="fas fa-th-large"></i> All Sensors (${comps.length || 'Auto'})
        </button>
    `;

    comps.forEach(c => {
        pillsHtml += `
            <button class="sensor-filter-btn ${activeSensorFilter === c.id ? 'active' : ''}" onclick="setSensorFilter('${c.id}', this)">
                <span>${c.icon || '🔌'}</span> ${c.name}
            </button>
        `;
    });

    pillsContainer.innerHTML = pillsHtml;
}

function setSensorFilter(filterKey, btn) {
    activeSensorFilter = filterKey;
    document.querySelectorAll('.sensor-filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    // Filter displayed cards in charts-container
    const cards = document.querySelectorAll('.sensor-chart-card');
    cards.forEach(card => {
        const compId = card.getAttribute('data-component-id');
        const key = card.getAttribute('data-sensor-key');
        if (filterKey === 'all' || compId === filterKey || key === filterKey) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
}
window.setSensorFilter = setSensorFilter;

// Sensor Visual Identity Lookup
function getSensorTheme(key, comp = null) {
    const k = String(key).toLowerCase();
    let theme = {
        label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        unit: '',
        icon: 'fas fa-chart-area',
        emoji: '📊',
        color: '#00e5ff',
        bg: 'rgba(0, 229, 255, 0.12)',
        border: 'rgba(0, 229, 255, 0.35)',
        glow: 'rgba(0, 229, 255, 0.25)'
    };

    if (k.includes('temp')) {
        theme = { label: 'Temperature', unit: '°C', icon: 'fas fa-temperature-high', emoji: '🌡️', color: '#ff5252', bg: 'rgba(255, 82, 82, 0.14)', border: 'rgba(255, 82, 82, 0.35)', glow: 'rgba(255, 82, 82, 0.3)' };
    } else if (k.includes('hum')) {
        theme = { label: 'Humidity', unit: '%', icon: 'fas fa-tint', emoji: '💧', color: '#00e5ff', bg: 'rgba(0, 229, 255, 0.14)', border: 'rgba(0, 229, 255, 0.35)', glow: 'rgba(0, 229, 255, 0.3)' };
    } else if (k.includes('press') || k.includes('baro')) {
        theme = { label: 'Atmospheric Pressure', unit: 'hPa', icon: 'fas fa-tachometer-alt', emoji: '🌤️', color: '#818cf8', bg: 'rgba(129, 140, 248, 0.14)', border: 'rgba(129, 140, 248, 0.35)', glow: 'rgba(129, 140, 248, 0.3)' };
    } else if (k.includes('dist')) {
        theme = { label: 'Ultrasonic Distance', unit: 'cm', icon: 'fas fa-ruler-horizontal', emoji: '📡', color: '#a855f7', bg: 'rgba(168, 85, 247, 0.14)', border: 'rgba(168, 85, 247, 0.35)', glow: 'rgba(168, 85, 247, 0.3)' };
    } else if (k.includes('soil')) {
        theme = { label: 'Soil Moisture', unit: '%', icon: 'fas fa-seedling', emoji: '🌱', color: '#10b981', bg: 'rgba(16, 185, 129, 0.14)', border: 'rgba(16, 185, 129, 0.35)', glow: 'rgba(16, 185, 129, 0.3)' };
    } else if (k.includes('gas') || k.includes('smoke')) {
        theme = { label: 'Gas Concentration', unit: 'ppm', icon: 'fas fa-smog', emoji: '💨', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.14)', border: 'rgba(245, 158, 11, 0.35)', glow: 'rgba(245, 158, 11, 0.3)' };
    } else if (k.includes('air') || k.includes('co2')) {
        theme = { label: 'Air Quality Index', unit: 'ppm', icon: 'fas fa-wind', emoji: '🌫️', color: '#fb923c', bg: 'rgba(251, 146, 60, 0.14)', border: 'rgba(251, 146, 60, 0.35)', glow: 'rgba(251, 146, 60, 0.3)' };
    } else if (k.includes('pm2') || k.includes('pm10')) {
        theme = { label: 'Particulate Matter', unit: 'µg/m³', icon: 'fas fa-lungs', emoji: '💨', color: '#f43f5e', bg: 'rgba(244, 63, 94, 0.14)', border: 'rgba(244, 63, 94, 0.35)', glow: 'rgba(244, 63, 94, 0.3)' };
    } else if (k.includes('lux') || k.includes('light')) {
        theme = { label: 'Light Level', unit: 'lux', icon: 'fas fa-sun', emoji: '☀️', color: '#eab308', bg: 'rgba(234, 179, 8, 0.14)', border: 'rgba(234, 179, 8, 0.35)', glow: 'rgba(234, 179, 8, 0.3)' };
    } else if (k.includes('volt') || k.includes('vbatt') || k.includes('battery')) {
        theme = { label: 'Voltage', unit: 'V', icon: 'fas fa-battery-three-quarters', emoji: '🔋', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.14)', border: 'rgba(34, 197, 94, 0.35)', glow: 'rgba(34, 197, 94, 0.3)' };
    } else if (k.includes('current')) {
        theme = { label: 'Current Draw', unit: 'mA', icon: 'fas fa-bolt', emoji: '⚡', color: '#f97316', bg: 'rgba(249, 115, 22, 0.14)', border: 'rgba(249, 115, 22, 0.35)', glow: 'rgba(249, 115, 22, 0.3)' };
    } else if (k.includes('power')) {
        theme = { label: 'Power Consumption', unit: 'mW', icon: 'fas fa-plug', emoji: '🔌', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.14)', border: 'rgba(6, 182, 212, 0.35)', glow: 'rgba(6, 182, 212, 0.3)' };
    } else if (k.includes('rain')) {
        theme = { label: 'Rain Status', unit: '%', icon: 'fas fa-cloud-showers-heavy', emoji: '🌧️', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.14)', border: 'rgba(56, 189, 248, 0.35)', glow: 'rgba(56, 189, 248, 0.3)' };
    } else if (k.includes('flame') || k.includes('fire')) {
        theme = { label: 'Flame Level', unit: 'index', icon: 'fas fa-fire', emoji: '🔥', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.14)', border: 'rgba(239, 68, 68, 0.35)', glow: 'rgba(239, 68, 68, 0.3)' };
    } else if (k.includes('motion')) {
        theme = { label: 'Motion Activity', unit: 'state', icon: 'fas fa-walking', emoji: '👁️', color: '#ec4899', bg: 'rgba(236, 72, 153, 0.14)', border: 'rgba(236, 72, 153, 0.35)', glow: 'rgba(236, 72, 153, 0.3)' };
    } else if (k.includes('accel')) {
        theme = { label: 'Acceleration ' + k.slice(-1).toUpperCase(), unit: 'g', icon: 'fas fa-tachometer-alt', emoji: '⚡', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.14)', border: 'rgba(6, 182, 212, 0.35)', glow: 'rgba(6, 182, 212, 0.3)' };
    }

    if (comp) {
        if (comp.name) theme.componentName = comp.name;
        if (comp.units && comp.units[key]) theme.unit = comp.units[key];
        else if (comp.unit) theme.unit = comp.unit;
        if (comp.icon) theme.emoji = comp.icon;
        if (comp.color) theme.color = comp.color;
    }
    return theme;
}

// Next-Gen Individual Sensor Visualization Engine
function renderDetailCharts(telemetry) {
    const container = document.getElementById('charts-container');
    if (!container) return;

    if (!telemetry || !telemetry.length) {
        container.innerHTML = `
            <div class="matrix-card" style="text-align: center; padding: 50px;">
                <i class="fas fa-satellite-dish" style="font-size: 2.5rem; color: var(--accent); margin-bottom: 15px; animation: pulseDotAnim 2s infinite;"></i>
                <h3>Awaiting Telemetry Broadcast</h3>
                <p style="color: var(--text-muted); margin-top: 8px;">Hardware node connected. Listening for sensor packets on HWID: <code>${activeHwid}</code>...</p>
            </div>`;
        return;
    }

    const sortedData = [...telemetry].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const IGNORED_KEYS = new Set([
        'hwid', 'hardware_id', 'node_id', 'node', 'device_id', 'secret',
        'timestamp', 'time', 'created_at', 'id', 'user_id', 'status',
        'registered', 'device_type', 'token'
    ]);

    // Discover all data keys present across the recent telemetry window
    const dataKeysSet = new Set();
    sortedData.forEach(item => {
        if (item.data && typeof item.data === 'object') {
            Object.keys(item.data).forEach(k => {
                if (!IGNORED_KEYS.has(k.toLowerCase()) && item.data[k] !== undefined && item.data[k] !== null) {
                    dataKeysSet.add(k);
                }
            });
        }
    });

    const configuredComps = (currentActiveDevice && currentActiveDevice.components) || [];
    
    // Map keys to their components
    const keyToCompMap = {};
    configuredComps.forEach(comp => {
        (comp.keys || []).forEach(k => {
            keyToCompMap[k] = comp;
        });
    });

    // Build the ordered list of sensor keys to render
    const orderedSensorKeys = [];
    const processedKeys = new Set();

    // 1. First add keys defined by configured components
    configuredComps.forEach(comp => {
        (comp.keys || []).forEach(k => {
            if (!processedKeys.has(k)) {
                orderedSensorKeys.push({ key: k, comp: comp, fromConfig: true });
                processedKeys.add(k);
            }
        });
    });

    // 2. Then add any incoming keys that weren't in configured components
    dataKeysSet.forEach(k => {
        if (!processedKeys.has(k)) {
            orderedSensorKeys.push({ key: k, comp: null, fromConfig: false });
            processedKeys.add(k);
        }
    });

    // If no sensor keys were found at all
    if (orderedSensorKeys.length === 0) {
        container.innerHTML = `
            <div class="matrix-card" style="text-align: center; padding: 40px;">
                <p style="color: var(--text-muted);">No numeric sensor metrics detected in the packet stream.</p>
            </div>`;
        return;
    }

    // Render / update each individual sensor card
    orderedSensorKeys.forEach(({ key, comp, fromConfig }) => {
        const cid = `detail-chart-${key}`;
        const cardId = `${cid}-card`;
        const compId = comp ? comp.id : 'custom';
        const theme = getSensorTheme(key, comp);

        // Filter by activeSensorFilter
        const isVisible = (activeSensorFilter === 'all' || activeSensorFilter === compId || activeSensorFilter === key);

        // Extract historical numeric points for this sensor
        const samples = sortedData
            .map(p => {
                const val = p.data ? p.data[key] : null;
                return {
                    time: new Date(p.timestamp || (p.data && p.data.timestamp) || Date.now()),
                    val: typeof val === 'boolean' ? (val ? 1 : 0) : Number(val)
                };
            })
            .filter(s => s.val !== null && !isNaN(s.val));

        let cardEl = document.getElementById(cardId);
        if (!cardEl) {
            cardEl = document.createElement('div');
            cardEl.id = cardId;
            cardEl.className = 'sensor-chart-card';
            cardEl.setAttribute('data-component-id', compId);
            cardEl.setAttribute('data-sensor-key', key);
            cardEl.style.setProperty('--sensor-theme-color', theme.color);
            cardEl.style.setProperty('--sensor-soft-bg', theme.bg);
            cardEl.style.setProperty('--sensor-border-color', theme.border);
            cardEl.style.setProperty('--sensor-glow-color', theme.glow);

            cardEl.innerHTML = `
                <div class="sensor-card-header">
                    <div class="sensor-header-left">
                        <div class="sensor-icon-box">
                            <span style="font-size: 1.4rem;">${theme.emoji}</span>
                        </div>
                        <div class="sensor-title-group">
                            <h3>${theme.componentName ? `${theme.componentName} • ${theme.label}` : theme.label}</h3>
                            <div class="sensor-meta-badge">
                                <i class="${theme.icon}" style="color: ${theme.color};"></i>
                                <span>FIELD: ${key}</span>
                                ${theme.unit ? `<span>• UNIT: ${theme.unit}</span>` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="sensor-live-pulse" id="${cid}-status-badge">
                        <div class="pulse-dot"></div>
                        <span id="${cid}-status-text">LIVE STREAM</span>
                    </div>
                </div>

                <div class="sensor-kpi-grid">
                    <div class="sensor-kpi-item">
                        <div class="sensor-kpi-label"><i class="fas fa-wave-square"></i> CURRENT READING</div>
                        <div class="sensor-kpi-value" id="${cid}-kpi-current">
                            -- <span class="sensor-kpi-unit">${theme.unit}</span>
                        </div>
                        <div class="sensor-kpi-sub" id="${cid}-kpi-trend">● Stable</div>
                    </div>
                    <div class="sensor-kpi-item">
                        <div class="sensor-kpi-label"><i class="fas fa-arrow-down" style="color: #38bdf8;"></i> MINIMUM</div>
                        <div class="sensor-kpi-value" id="${cid}-kpi-min">
                            -- <span class="sensor-kpi-unit">${theme.unit}</span>
                        </div>
                        <div class="sensor-kpi-sub">Window Low</div>
                    </div>
                    <div class="sensor-kpi-item">
                        <div class="sensor-kpi-label"><i class="fas fa-arrow-up" style="color: #ef4444;"></i> MAXIMUM</div>
                        <div class="sensor-kpi-value" id="${cid}-kpi-max">
                            -- <span class="sensor-kpi-unit">${theme.unit}</span>
                        </div>
                        <div class="sensor-kpi-sub">Window High</div>
                    </div>
                    <div class="sensor-kpi-item">
                        <div class="sensor-kpi-label"><i class="fas fa-calculator" style="color: #a855f7;"></i> AVERAGE</div>
                        <div class="sensor-kpi-value" id="${cid}-kpi-avg">
                            -- <span class="sensor-kpi-unit">${theme.unit}</span>
                        </div>
                        <div class="sensor-kpi-sub" id="${cid}-kpi-samples">0 packets</div>
                    </div>
                </div>

                <div class="sensor-canvas-wrapper">
                    <canvas id="${cid}"></canvas>
                </div>
            `;
            container.appendChild(cardEl);
        }

        // Apply visibility
        cardEl.style.display = isVisible ? 'block' : 'none';

        // If no samples available for this sensor yet
        if (!samples.length) {
            const currentEl = document.getElementById(`${cid}-kpi-current`);
            if (currentEl) currentEl.innerHTML = `Awaiting data...`;
            const statusEl = document.getElementById(`${cid}-status-badge`);
            if (statusEl) {
                statusEl.style.background = 'rgba(255, 255, 255, 0.05)';
                statusEl.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                statusEl.style.color = 'var(--text-muted)';
                const dot = statusEl.querySelector('.pulse-dot');
                if (dot) dot.style.background = '#64748b';
                const txt = document.getElementById(`${cid}-status-text`);
                if (txt) txt.innerText = 'NO PACKET YET';
            }
            return;
        }

        // Calculate KPIs
        const recentSamples = samples.slice(-50);
        const values = recentSamples.map(s => s.val);
        const currentVal = values[values.length - 1];
        const prevVal = values.length > 1 ? values[values.length - 2] : currentVal;
        const diff = currentVal - prevVal;
        const minVal = Math.min(...values);
        const maxVal = Math.max(...values);
        const avgVal = values.reduce((a, b) => a + b, 0) / values.length;

        // Format values
        const fmt = (v) => (Number.isInteger(v) ? v : v.toFixed(2));

        // Update KPI displays
        const curEl = document.getElementById(`${cid}-kpi-current`);
        if (curEl) curEl.innerHTML = `${fmt(currentVal)} <span class="sensor-kpi-unit">${theme.unit}</span>`;

        const minEl = document.getElementById(`${cid}-kpi-min`);
        if (minEl) minEl.innerHTML = `${fmt(minVal)} <span class="sensor-kpi-unit">${theme.unit}</span>`;

        const maxEl = document.getElementById(`${cid}-kpi-max`);
        if (maxEl) maxEl.innerHTML = `${fmt(maxVal)} <span class="sensor-kpi-unit">${theme.unit}</span>`;

        const avgEl = document.getElementById(`${cid}-kpi-avg`);
        if (avgEl) avgEl.innerHTML = `${fmt(avgVal)} <span class="sensor-kpi-unit">${theme.unit}</span>`;

        const trendEl = document.getElementById(`${cid}-kpi-trend`);
        if (trendEl) {
            if (Math.abs(diff) < 0.001) {
                trendEl.innerHTML = `<span style="color: var(--text-muted)">● Steady</span>`;
            } else if (diff > 0) {
                trendEl.innerHTML = `<span style="color: #10b981"><i class="fas fa-caret-up"></i> +${fmt(diff)} ${theme.unit}</span>`;
            } else {
                trendEl.innerHTML = `<span style="color: #ef4444"><i class="fas fa-caret-down"></i> ${fmt(diff)} ${theme.unit}</span>`;
            }
        }

        const samplesEl = document.getElementById(`${cid}-kpi-samples`);
        if (samplesEl) samplesEl.innerText = `${values.length} recorded samples`;

        // Create or update Chart.js instance
        const canvas = document.getElementById(cid);
        if (!canvas) return;

        if (!charts[cid]) {
            const ctx = canvas.getContext('2d');
            const gradient = ctx.createLinearGradient(0, 0, 0, 240);
            gradient.addColorStop(0, theme.bg.replace('0.14', '0.35'));
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0.0)');

            charts[cid] = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: theme.label,
                        data: [],
                        borderColor: theme.color,
                        borderWidth: 2.5,
                        backgroundColor: gradient,
                        fill: true,
                        tension: 0.35,
                        pointRadius: values.length < 5 ? 3 : 0,
                        pointHoverRadius: 6,
                        pointHoverBackgroundColor: theme.color,
                        pointHoverBorderColor: '#fff',
                        pointHoverBorderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 400 },
                    interaction: {
                        mode: 'index',
                        intersect: false
                    },
                    scales: {
                        x: {
                            display: true,
                            grid: {
                                color: 'rgba(255, 255, 255, 0.05)',
                                borderColor: 'rgba(255, 255, 255, 0.1)'
                            },
                            ticks: {
                                color: '#94a3b8',
                                font: { family: 'Inter', size: 10 },
                                maxTicksLimit: 7,
                                maxRotation: 0
                            },
                            title: {
                                display: true,
                                text: 'Timeline (HH:mm:ss)',
                                color: '#64748b',
                                font: { size: 9, family: 'Inter' }
                            }
                        },
                        y: {
                            display: true,
                            grid: {
                                color: 'rgba(255, 255, 255, 0.05)',
                                borderColor: 'rgba(255, 255, 255, 0.1)'
                            },
                            ticks: {
                                color: '#94a3b8',
                                font: { family: 'Inter', size: 10 },
                                callback: function(val) {
                                    return val + (theme.unit ? ' ' + theme.unit : '');
                                }
                            },
                            title: {
                                display: true,
                                text: theme.unit ? `${theme.label} (${theme.unit})` : theme.label,
                                color: '#64748b',
                                font: { size: 9, family: 'Inter' }
                            }
                        }
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: 'rgba(15, 21, 32, 0.95)',
                            titleColor: '#e2e8f0',
                            bodyColor: '#fff',
                            borderColor: theme.color,
                            borderWidth: 1,
                            padding: 10,
                            displayColors: false,
                            callbacks: {
                                label: function(context) {
                                    return ` ${theme.label}: ${context.parsed.y} ${theme.unit}`;
                                }
                            }
                        }
                    }
                }
            });
        }

        const chart = charts[cid];
        const timeLabels = recentSamples.map(s => {
            const d = s.time;
            return d.getHours().toString().padStart(2, '0') + ':' +
                   d.getMinutes().toString().padStart(2, '0') + ':' +
                   d.getSeconds().toString().padStart(2, '0');
        });

        // Compute smart Y bounds with 10% breathing room
        const padding = (maxVal - minVal) * 0.12 || 1;
        chart.options.scales.y.suggestedMin = minVal - padding;
        chart.options.scales.y.suggestedMax = maxVal + padding;

        chart.data.labels = timeLabels;
        chart.data.datasets[0].data = values;
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
function showRegisterModal() {
    document.getElementById('register-modal').classList.remove('hidden');
    initRegisterComponentPicker();
}
window.showRegisterModal = showRegisterModal;

function hideModal(id) {
    document.getElementById(id).classList.add('hidden');
}
window.hideModal = hideModal;

// ─────────────────────────────────────────────────────────────────
// HARDWARE COMPONENT SELECTION & MANAGEMENT
// ─────────────────────────────────────────────────────────────────
const AVAILABLE_HARDWARE_COMPONENTS = [
    {
        id: 'dht11',
        name: 'DHT11 Sensor',
        category: 'Environment',
        icon: '🌡️',
        color: '#10b981',
        keys: ['temperature', 'humidity'],
        units: { temperature: '°C', humidity: '%' },
        desc: 'Basic ambient temp & humidity'
    },
    {
        id: 'dht22',
        name: 'DHT22 Sensor',
        category: 'Environment',
        icon: '🌡️',
        color: '#00e5ff',
        keys: ['temperature', 'humidity'],
        units: { temperature: '°C', humidity: '%' },
        desc: 'Precision temp & humidity'
    },
    {
        id: 'bme280',
        name: 'BME280 Environment',
        category: 'Environment',
        icon: '🌤️',
        color: '#818cf8',
        keys: ['temperature', 'humidity', 'pressure'],
        units: { temperature: '°C', humidity: '%', pressure: 'hPa' },
        desc: 'Temp, humidity & baro pressure'
    },
    {
        id: 'ds18b20',
        name: 'DS18B20 Probe',
        category: 'Environment',
        icon: '🌡️',
        color: '#f59e0b',
        keys: ['temperature'],
        units: { temperature: '°C' },
        desc: 'Waterproof 1-Wire temp probe'
    },
    {
        id: 'hcsr04',
        name: 'HC-SR04 Ultrasonic',
        category: 'Distance',
        icon: '📡',
        color: '#a855f7',
        keys: ['distance_cm'],
        units: { distance_cm: 'cm' },
        desc: 'Sonic distance & tank level'
    },
    {
        id: 'mq2',
        name: 'MQ-2 Gas / Smoke',
        category: 'Air Quality',
        icon: '💨',
        color: '#f59e0b',
        keys: ['gas_level', 'gas_alert'],
        units: { gas_level: 'ppm', gas_alert: 'alert' },
        desc: 'LPG, smoke & flammable gas'
    },
    {
        id: 'mq135',
        name: 'MQ-135 Air Quality',
        category: 'Air Quality',
        icon: '🌫️',
        color: '#fb923c',
        keys: ['air_quality', 'air_alert'],
        units: { air_quality: 'ppm', air_alert: 'alert' },
        desc: 'CO2, ammonia, toxic gas'
    },
    {
        id: 'pms5003',
        name: 'PMS5003 Dust PM2.5',
        category: 'Air Quality',
        icon: '💨',
        color: '#f43f5e',
        keys: ['pm25', 'pm10'],
        units: { pm25: 'µg/m³', pm10: 'µg/m³' },
        desc: 'Laser PM2.5 & PM10 particle count'
    },
    {
        id: 'soil_moisture',
        name: 'Soil Moisture Sensor',
        category: 'Agriculture',
        icon: '🌱',
        color: '#10b981',
        keys: ['soil_moisture'],
        units: { soil_moisture: '%' },
        desc: 'Capacitive / resistive soil hydration'
    },
    {
        id: 'rain_sensor',
        name: 'Rain Detector',
        category: 'Agriculture',
        icon: '🌧️',
        color: '#38bdf8',
        keys: ['rain_analog', 'raining'],
        units: { rain_analog: '%', raining: 'state' },
        desc: 'Precipitation surface plate'
    },
    {
        id: 'ldr',
        name: 'LDR Light Sensor',
        category: 'Light',
        icon: '☀️',
        color: '#eab308',
        keys: ['light_level'],
        units: { light_level: 'lux' },
        desc: 'Analog photoresistor illumination'
    },
    {
        id: 'bh1750',
        name: 'BH1750 Lux Meter',
        category: 'Light',
        icon: '💡',
        color: '#facc15',
        keys: ['lux'],
        units: { lux: 'lux' },
        desc: 'Digital I2C ambient light'
    },
    {
        id: 'pir',
        name: 'PIR Motion HC-SR501',
        category: 'Motion',
        icon: '👁️',
        color: '#ec4899',
        keys: ['motion'],
        units: { motion: 'state' },
        desc: 'Passive infrared human presence'
    },
    {
        id: 'mpu6050',
        name: 'MPU-6050 IMU',
        category: 'Motion',
        icon: '⚡',
        color: '#06b6d4',
        keys: ['accel_x', 'accel_y', 'accel_z'],
        units: { accel_x: 'g', accel_y: 'g', accel_z: 'g' },
        desc: '6-axis accelerometer & gyro'
    },
    {
        id: 'flame',
        name: 'Flame Sensor',
        category: 'Safety',
        icon: '🔥',
        color: '#ef4444',
        keys: ['flame_detected', 'flame_level'],
        units: { flame_detected: 'state', flame_level: 'index' },
        desc: 'Infrared fire / flame optical detector'
    },
    {
        id: 'ina219',
        name: 'INA219 Power Monitor',
        category: 'Power',
        icon: '🔋',
        color: '#22c55e',
        keys: ['voltage', 'current_mA', 'power_mW'],
        units: { voltage: 'V', current_mA: 'mA', power_mW: 'mW' },
        desc: 'I2C Voltage, current & power monitor'
    },
    {
        id: 'relay_1ch',
        name: 'Relay Switch',
        category: 'Actuator',
        icon: '🔌',
        color: '#f97316',
        keys: ['relay_state'],
        units: { relay_state: 'state' },
        desc: 'High-voltage load relay switch'
    },
    {
        id: 'water_pump',
        name: 'Water Pump Control',
        category: 'Actuator',
        icon: '💧',
        color: '#0284c7',
        keys: ['pump_state'],
        units: { pump_state: 'state' },
        desc: 'DC irrigation / cooling pump driver'
    }
];

let regCompActiveCategory = 'all';
let regCompSearchQuery = '';
let editCompActiveCategory = 'all';
let editCompSearchQuery = '';

function initRegisterComponentPicker() {
    selectedRegComponents = [];
    regCompActiveCategory = 'all';
    regCompSearchQuery = '';
    const searchInput = document.getElementById('reg-comp-search');
    if (searchInput) searchInput.value = '';
    renderRegComponentsGrid('all', '');
    renderRegSelectedChips();
}

function renderRegComponentsGrid(category = 'all', query = '') {
    const grid = document.getElementById('reg-components-grid');
    if (!grid) return;

    const q = (query || '').toLowerCase().trim();
    const filtered = AVAILABLE_HARDWARE_COMPONENTS.filter(comp => {
        const matchCat = category === 'all' || comp.category.toLowerCase() === category.toLowerCase();
        const matchQ = !q || comp.name.toLowerCase().includes(q) ||
                       comp.keys.some(k => k.toLowerCase().includes(q)) ||
                       comp.category.toLowerCase().includes(q);
        return matchCat && matchQ;
    });

    if (!filtered.length) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 20px; font-size: 0.8rem;">No matching sensors found. Try searching or add a Custom Sensor below.</div>';
        return;
    }

    grid.innerHTML = filtered.map(comp => {
        const isSelected = selectedRegComponents.some(c => c.id === comp.id);
        return `
            <div class="comp-tile ${isSelected ? 'selected' : ''}" onclick="toggleRegComponent('${comp.id}')">
                <div class="comp-check"><i class="fas fa-check"></i></div>
                <div class="comp-icon">${comp.icon}</div>
                <div class="comp-name">${comp.name}</div>
                <div class="comp-keys">${comp.keys.join(', ')}</div>
            </div>
        `;
    }).join('');
}

function toggleRegComponent(compId) {
    const existingIdx = selectedRegComponents.findIndex(c => c.id === compId);
    if (existingIdx >= 0) {
        selectedRegComponents.splice(existingIdx, 1);
    } else {
        const comp = AVAILABLE_HARDWARE_COMPONENTS.find(c => c.id === compId);
        if (comp) {
            selectedRegComponents.push({ ...comp });
        }
    }
    renderRegComponentsGrid(regCompActiveCategory, regCompSearchQuery);
    renderRegSelectedChips();
}
window.toggleRegComponent = toggleRegComponent;

function filterRegCompCategory(cat, btn) {
    regCompActiveCategory = cat;
    const catContainer = document.getElementById('reg-comp-categories');
    if (catContainer) {
        catContainer.querySelectorAll('.comp-cat-btn').forEach(b => b.classList.remove('active'));
    }
    if (btn) btn.classList.add('active');
    renderRegComponentsGrid(cat, regCompSearchQuery);
}
window.filterRegCompCategory = filterRegCompCategory;

function onRegCompSearch(val) {
    regCompSearchQuery = val;
    renderRegComponentsGrid(regCompActiveCategory, val);
}
window.onRegCompSearch = onRegCompSearch;

function renderRegSelectedChips() {
    const bar = document.getElementById('reg-selected-chips-bar');
    const badge = document.getElementById('reg-comp-count-badge');
    if (badge) badge.innerText = `${selectedRegComponents.length} Selected`;

    if (!bar) return;
    if (!selectedRegComponents.length) {
        bar.innerHTML = '<span style="font-size: 0.75rem; color: var(--text-muted); font-style: italic;">No components selected yet. Click any sensor tile above.</span>';
        return;
    }

    bar.innerHTML = selectedRegComponents.map((c, idx) => `
        <span class="selected-comp-pill">
            <span>${c.icon || '🔌'}</span> ${c.name}
            <span class="remove-btn" onclick="removeRegComponent(${idx})">&times;</span>
        </span>
    `).join('');
}

function removeRegComponent(idx) {
    selectedRegComponents.splice(idx, 1);
    renderRegComponentsGrid(regCompActiveCategory, regCompSearchQuery);
    renderRegSelectedChips();
}
window.removeRegComponent = removeRegComponent;

function clearAllSelectedRegComponents() {
    selectedRegComponents = [];
    renderRegComponentsGrid(regCompActiveCategory, regCompSearchQuery);
    renderRegSelectedChips();
}
window.clearAllSelectedRegComponents = clearAllSelectedRegComponents;

function toggleCustomSensorBox(mode = 'reg') {
    const box = document.getElementById(`${mode}-custom-sensor-box`);
    if (box) {
        box.style.display = box.style.display === 'none' ? 'block' : 'none';
    }
}
window.toggleCustomSensorBox = toggleCustomSensorBox;

function addCustomRegComponent(mode = 'reg') {
    const nameEl = document.getElementById(`${mode}-custom-name`);
    const keyEl = document.getElementById(`${mode}-custom-key`);
    const unitEl = document.getElementById(`${mode}-custom-unit`);

    const name = nameEl?.value.trim();
    const key = keyEl?.value.trim().toLowerCase().replace(/\s+/g, '_');
    const unit = unitEl?.value.trim() || '';

    if (!name || !key) {
        showNotification("Please provide both Sensor Name and JSON Field Key", "warning");
        return;
    }

    const customComp = {
        id: 'custom_' + Date.now(),
        name: name,
        category: 'Custom',
        icon: '⚙️',
        color: '#00e5ff',
        keys: [key],
        unit: unit,
        units: { [key]: unit },
        desc: 'Custom wired hardware sensor'
    };

    if (mode === 'reg') {
        selectedRegComponents.push(customComp);
        renderRegSelectedChips();
    } else {
        selectedEditComponents.push(customComp);
        renderEditSelectedChips();
    }

    // Reset inputs
    if (nameEl) nameEl.value = '';
    if (keyEl) keyEl.value = '';
    if (unitEl) unitEl.value = '';
    toggleCustomSensorBox(mode);
    showNotification(`Custom component '${name}' added!`, "success");
}
window.addCustomRegComponent = addCustomRegComponent;

// ─────────────────────────────────────────────────────────────────
// EDIT COMPONENTS MODAL FOR EXISTING DEVICES
// ─────────────────────────────────────────────────────────────────
function openEditComponentsModal(deviceId = null) {
    let dev = null;
    if (deviceId) {
        dev = (cachedDevices || []).find(d => d.id === deviceId);
    } else if (currentActiveDevice) {
        dev = currentActiveDevice;
    }

    if (!dev && cachedDevices.length > 0) {
        dev = cachedDevices[0];
    }

    if (!dev) {
        showNotification("No device selected for component configuration", "warning");
        return;
    }

    editingDeviceId = dev.id;
    selectedEditComponents = JSON.parse(JSON.stringify(dev.components || []));
    editCompActiveCategory = 'all';
    editCompSearchQuery = '';

    const infoEl = document.getElementById('edit-comp-device-info');
    if (infoEl) infoEl.innerText = `Configuring sensors for: ${dev.name} (${dev.hardware_id})`;

    const searchInput = document.getElementById('edit-comp-search');
    if (searchInput) searchInput.value = '';

    renderEditComponentsGrid('all', '');
    renderEditSelectedChips();

    const modal = document.getElementById('edit-components-modal');
    if (modal) modal.classList.remove('hidden');
}
window.openEditComponentsModal = openEditComponentsModal;

function renderEditComponentsGrid(category = 'all', query = '') {
    const grid = document.getElementById('edit-components-grid');
    if (!grid) return;

    const q = (query || '').toLowerCase().trim();
    const filtered = AVAILABLE_HARDWARE_COMPONENTS.filter(comp => {
        const matchCat = category === 'all' || comp.category.toLowerCase() === category.toLowerCase();
        const matchQ = !q || comp.name.toLowerCase().includes(q) ||
                       comp.keys.some(k => k.toLowerCase().includes(q)) ||
                       comp.category.toLowerCase().includes(q);
        return matchCat && matchQ;
    });

    grid.innerHTML = filtered.map(comp => {
        const isSelected = selectedEditComponents.some(c => c.id === comp.id);
        return `
            <div class="comp-tile ${isSelected ? 'selected' : ''}" onclick="toggleEditComponent('${comp.id}')">
                <div class="comp-check"><i class="fas fa-check"></i></div>
                <div class="comp-icon">${comp.icon}</div>
                <div class="comp-name">${comp.name}</div>
                <div class="comp-keys">${comp.keys.join(', ')}</div>
            </div>
        `;
    }).join('');
}

function toggleEditComponent(compId) {
    const existingIdx = selectedEditComponents.findIndex(c => c.id === compId);
    if (existingIdx >= 0) {
        selectedEditComponents.splice(existingIdx, 1);
    } else {
        const comp = AVAILABLE_HARDWARE_COMPONENTS.find(c => c.id === compId);
        if (comp) {
            selectedEditComponents.push({ ...comp });
        }
    }
    renderEditComponentsGrid(editCompActiveCategory, editCompSearchQuery);
    renderEditSelectedChips();
}
window.toggleEditComponent = toggleEditComponent;

function filterEditCompCategory(cat, btn) {
    editCompActiveCategory = cat;
    const catContainer = document.getElementById('edit-comp-categories');
    if (catContainer) {
        catContainer.querySelectorAll('.comp-cat-btn').forEach(b => b.classList.remove('active'));
    }
    if (btn) btn.classList.add('active');
    renderEditComponentsGrid(cat, editCompSearchQuery);
}
window.filterEditCompCategory = filterEditCompCategory;

function onEditCompSearch(val) {
    editCompSearchQuery = val;
    renderEditComponentsGrid(editCompActiveCategory, val);
}
window.onEditCompSearch = onEditCompSearch;

function renderEditSelectedChips() {
    const bar = document.getElementById('edit-selected-chips-bar');
    const badge = document.getElementById('edit-comp-count-badge');
    if (badge) badge.innerText = `${selectedEditComponents.length} Selected`;

    if (!bar) return;
    if (!selectedEditComponents.length) {
        bar.innerHTML = '<span style="font-size: 0.75rem; color: var(--text-muted); font-style: italic;">No components selected yet. Click any sensor tile above.</span>';
        return;
    }

    bar.innerHTML = selectedEditComponents.map((c, idx) => `
        <span class="selected-comp-pill">
            <span>${c.icon || '🔌'}</span> ${c.name}
            <span class="remove-btn" onclick="removeEditComponent(${idx})">&times;</span>
        </span>
    `).join('');
}

function removeEditComponent(idx) {
    selectedEditComponents.splice(idx, 1);
    renderEditComponentsGrid(editCompActiveCategory, editCompSearchQuery);
    renderEditSelectedChips();
}
window.removeEditComponent = removeEditComponent;

function clearAllSelectedEditComponents() {
    selectedEditComponents = [];
    renderEditComponentsGrid(editCompActiveCategory, editCompSearchQuery);
    renderEditSelectedChips();
}
window.clearAllSelectedEditComponents = clearAllSelectedEditComponents;

async function saveEditedComponents() {
    if (!editingDeviceId) return;
    try {
        const res = await fetch(`${API_BASE}/devices/${editingDeviceId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ components: selectedEditComponents })
        });

        if (res.ok) {
            const updated = await res.json();
            // Update cached devices
            const idx = (cachedDevices || []).findIndex(d => d.id === editingDeviceId);
            if (idx >= 0) cachedDevices[idx] = updated;

            // If updating current active device in Details view
            if (currentActiveDevice && currentActiveDevice.id === editingDeviceId) {
                currentActiveDevice = updated;
                renderSensorFilterToolbar(currentActiveDevice);
                updateMgmtComponentsList(currentActiveDevice.components);

                // Destroy old charts and reload
                Object.keys(charts).forEach(k => {
                    if (k.startsWith('detail-chart-')) {
                        try { charts[k].destroy(); } catch (e) {}
                        delete charts[k];
                    }
                });
                const container = document.getElementById('charts-container');
                if (container) container.innerHTML = '';
                updateDetailView();
            }

            hideModal('edit-components-modal');
            renderDevices(cachedDevices);
            showNotification(`Updated sensors for ${updated.name}! Graphs refreshed.`, "success");
        } else {
            const err = await res.json();
            showNotification(err.detail || "Failed to update components", "error");
        }
    } catch (e) {
        showNotification("Server error updating components", "error");
    }
}
window.saveEditedComponents = saveEditedComponents;


// ─────────────────────────────────────────────────────────────────
// FIRMWARE LAB — Component Library (Sensors + Actuators) + Search + Custom
// ─────────────────────────────────────────────────────────────────

const COMPONENT_LIBRARY = [
    // ── MCU ──────────────────────────────────────────────────────
    { id:'esp32', name:'ESP32', category:'MCU', icon:'🧠', color:'#06b6d4', interface:'BUILTIN',
      pins:{}, includes:[], setup:'', loop:'', payloadKeys:[] },

    // ── Sensors ──────────────────────────────────────────────────
    { id:'dht11', name:'DHT11', category:'Environment', icon:'🌡️', color:'#10b981', interface:'Digital',
      pins:{ DATA:{ label:'DATA', default:4 } },
      includes:['<DHT.h>'],
      setup:'  dht11.begin();',
      loop:'  float temperature = dht11.readTemperature();\n  float humidity = dht11.readHumidity();',
      payloadKeys:['temperature','humidity'] },

    { id:'dht22', name:'DHT22', category:'Environment', icon:'🌡️', color:'#34d399', interface:'Digital',
      pins:{ DATA:{ label:'DATA', default:4 } },
      includes:['<DHT.h>'],
      setup:'  dht22.begin();',
      loop:'  float temperature = dht22.readTemperature();\n  float humidity = dht22.readHumidity();',
      payloadKeys:['temperature','humidity'] },

    { id:'ds18b20', name:'DS18B20', category:'Temperature', icon:'🌡️', color:'#f59e0b', interface:'1-Wire',
      pins:{ DATA:{ label:'DATA (1-Wire)', default:4 } },
      includes:['<OneWire.h>','<DallasTemperature.h>'],
      setup:'  sensors.begin();',
      loop:'  sensors.requestTemperatures();\n  float temperature = sensors.getTempCByIndex(0);',
      payloadKeys:['temperature'] },

    { id:'bme280', name:'BME280', category:'Environment', icon:'🌤️', color:'#0ea5e9', interface:'I2C',
      pins:{ SDA:{ label:'SDA', default:21 }, SCL:{ label:'SCL', default:22 } },
      includes:['<Wire.h>','<Adafruit_BME280.h>'],
      setup:'  bme.begin(0x76);',
      loop:'  float temperature = bme.readTemperature();\n  float humidity = bme.readHumidity();\n  float pressure = bme.readPressure() / 100.0F;',
      payloadKeys:['temperature','humidity','pressure'] },

    { id:'bh1750', name:'BH1750', category:'Light', icon:'💡', color:'#f59e0b', interface:'I2C',
      pins:{ SDA:{ label:'SDA', default:21 }, SCL:{ label:'SCL', default:22 } },
      includes:['<Wire.h>','<BH1750.h>'],
      setup:'  lightMeter.begin();',
      loop:'  float lux = lightMeter.readLightLevel();',
      payloadKeys:['lux'] },

    { id:'mq2', name:'MQ-2 Gas', category:'Air Quality', icon:'💨', color:'#ef4444', interface:'Analog',
      pins:{ AO:{ label:'Analog OUT', default:34 }, DO:{ label:'Digital OUT', default:27 } },
      includes:[],
      setup:'  pinMode(MQ2_DO, INPUT);',
      loop:'  int gasLevel = analogRead(MQ2_AO);\n  bool gasAlert = !digitalRead(MQ2_DO);',
      payloadKeys:['gas_level','gas_alert'] },

    { id:'mq135', name:'MQ-135 Air', category:'Air Quality', icon:'🌫️', color:'#f97316', interface:'Analog',
      pins:{ AO:{ label:'Analog OUT', default:35 }, DO:{ label:'Digital OUT', default:27 } },
      includes:[],
      setup:'  pinMode(MQ135_DO, INPUT);',
      loop:'  int airQuality = analogRead(MQ135_AO);\n  bool airAlert = !digitalRead(MQ135_DO);',
      payloadKeys:['air_quality','air_alert'] },

    { id:'hcsr04', name:'HC-SR04', category:'Distance', icon:'📡', color:'#8b5cf6', interface:'Digital',
      pins:{ TRIG:{ label:'TRIG', default:5 }, ECHO:{ label:'ECHO', default:18 } },
      includes:[],
      setup:'  pinMode(TRIG_PIN, OUTPUT);\n  pinMode(ECHO_PIN, INPUT);',
      loop:'  digitalWrite(TRIG_PIN, LOW); delayMicroseconds(2);\n  digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10);\n  digitalWrite(TRIG_PIN, LOW);\n  long duration = pulseIn(ECHO_PIN, HIGH);\n  float distance = duration * 0.034 / 2;',
      payloadKeys:['distance_cm'] },

    { id:'pir', name:'PIR HC-SR501', category:'Motion', icon:'👁️', color:'#ec4899', interface:'Digital',
      pins:{ OUT:{ label:'OUT', default:27 } },
      includes:[],
      setup:'  pinMode(PIR_PIN, INPUT);',
      loop:'  bool motionDetected = digitalRead(PIR_PIN);',
      payloadKeys:['motion'] },

    { id:'ldr', name:'LDR Module', category:'Light', icon:'☀️', color:'#fbbf24', interface:'Analog',
      pins:{ AO:{ label:'Analog OUT', default:34 } },
      includes:[],
      setup:'',
      loop:'  int lightLevel = analogRead(LDR_PIN);',
      payloadKeys:['light_level'] },

    { id:'soil_moisture', name:'Soil Moisture', category:'Agriculture', icon:'🌱', color:'#84cc16', interface:'Analog',
      pins:{ AO:{ label:'Analog OUT', default:35 } },
      includes:[],
      setup:'',
      loop:'  int soilRaw = analogRead(SOIL_PIN);\n  float soilMoisture = map(soilRaw, 4095, 0, 0, 100);',
      payloadKeys:['soil_moisture'] },

    { id:'rain_sensor', name:'Rain Sensor', category:'Weather', icon:'🌧️', color:'#3b82f6', interface:'Analog',
      pins:{ AO:{ label:'Analog OUT', default:34 }, DO:{ label:'Digital OUT', default:35 } },
      includes:[],
      setup:'  pinMode(RAIN_DPIN, INPUT);',
      loop:'  int rainAnalog = analogRead(RAIN_APIN);\n  bool raining = !digitalRead(RAIN_DPIN);',
      payloadKeys:['rain_analog','raining'] },

    { id:'flame', name:'Flame Sensor', category:'Safety', icon:'🔥', color:'#dc2626', interface:'Analog',
      pins:{ AO:{ label:'Analog OUT', default:34 }, DO:{ label:'Digital OUT', default:27 } },
      includes:[],
      setup:'  pinMode(FLAME_DO, INPUT);',
      loop:'  bool flameDetected = !digitalRead(FLAME_DO);\n  int flameLevel = analogRead(FLAME_AO);',
      payloadKeys:['flame_detected','flame_level'] },

    { id:'ir_obstacle', name:'IR Obstacle', category:'Detection', icon:'🚧', color:'#a78bfa', interface:'Digital',
      pins:{ OUT:{ label:'OUT', default:27 } },
      includes:[],
      setup:'  pinMode(IR_PIN, INPUT);',
      loop:'  bool obstacleDetected = !digitalRead(IR_PIN);',
      payloadKeys:['obstacle'] },

    { id:'mpu6050', name:'MPU6050', category:'IMU', icon:'⚡', color:'#06b6d4', interface:'I2C',
      pins:{ SDA:{ label:'SDA', default:21 }, SCL:{ label:'SCL', default:22 } },
      includes:['<Wire.h>','<MPU6050.h>'],
      setup:'  Wire.begin();\n  mpu.initialize();\n  mpu.testConnection();',
      loop:'  int16_t ax,ay,az,gx,gy,gz;\n  mpu.getMotion6(&ax,&ay,&az,&gx,&gy,&gz);',
      payloadKeys:['accel_x','accel_y','accel_z'] },

    { id:'rc522', name:'RC522 RFID', category:'RFID', icon:'📟', color:'#f59e0b', interface:'SPI',
      pins:{ SS:{ label:'SS', default:5 }, SCK:{ label:'SCK', default:18 }, MOSI:{ label:'MOSI', default:23 }, MISO:{ label:'MISO', default:19 }, RST:{ label:'RST', default:22 } },
      includes:['<SPI.h>','<MFRC522.h>'],
      setup:'  SPI.begin();\n  mfrc522.PCD_Init();',
      loop:'  if (!mfrc522.PICC_IsNewCardPresent()) return;\n  if (!mfrc522.PICC_ReadCardSerial()) return;\n  String cardUID = "";',
      payloadKeys:['rfid_uid'] },

    { id:'pms5003', name:'PMS5003', category:'Air Quality', icon:'💨', color:'#6366f1', interface:'UART',
      pins:{ TX:{ label:'TX→RX', default:16 }, RX:{ label:'RX→TX', default:17 } },
      includes:['<PMS.h>'],
      setup:'  Serial2.begin(9600, SERIAL_8N1, PMS_RX, PMS_TX);\n  pms.passiveMode();',
      loop:'  pms.requestRead();\n  PMS::DATA data;\n  if (pms.readUntil(data)) {\n    int pm25 = data.PM_AE_UG_2_5;\n    int pm10 = data.PM_AE_UG_10_0;\n  }',
      payloadKeys:['pm25','pm10'] },

    { id:'neo6m', name:'NEO-6M GPS', category:'Location', icon:'🛰️', color:'#22d3ee', interface:'UART',
      pins:{ TX:{ label:'GPS TX→', default:16 }, RX:{ label:'GPS RX←', default:17 } },
      includes:['<TinyGPS++.h>'],
      setup:'  gpsSerial.begin(9600, SERIAL_8N1, GPS_RX, GPS_TX);',
      loop:'  while (gpsSerial.available()) gps.encode(gpsSerial.read());\n  float lat = gps.location.lat();\n  float lng = gps.location.lng();',
      payloadKeys:['latitude','longitude'] },

    { id:'hc05', name:'HC-05 Bluetooth', category:'Wireless', icon:'📶', color:'#3b82f6', interface:'UART',
      pins:{ TXD:{ label:'TXD', default:16 }, RXD:{ label:'RXD', default:17 } },
      includes:[],
      setup:'  Serial2.begin(9600, SERIAL_8N1, HC05_RX, HC05_TX);',
      loop:'  if (Serial2.available()) {\n    String cmd = Serial2.readString();\n  }',
      payloadKeys:[] },

    { id:'sx1276', name:'SX1276 LoRa', category:'RF', icon:'📡', color:'#8b5cf6', interface:'SPI',
      pins:{ SS:{ label:'SS/NSS', default:5 }, RST:{ label:'RESET', default:14 }, DIO0:{ label:'DIO0', default:2 } },
      includes:['<SPI.h>','<LoRa.h>'],
      setup:'  LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);\n  if (!LoRa.begin(915E6)) { Serial.println("LoRa failed"); while(1); }\n  LoRa.setSyncWord(0x12);',
      loop:'',
      payloadKeys:[] },

    { id:'oled_ssd1306', name:'OLED SSD1306', category:'Display', icon:'🖥️', color:'#a78bfa', interface:'I2C',
      pins:{ SDA:{ label:'SDA', default:21 }, SCL:{ label:'SCL', default:22 } },
      includes:['<Wire.h>','<Adafruit_GFX.h>','<Adafruit_SSD1306.h>'],
      setup:'  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);\n  display.clearDisplay();\n  display.setTextColor(WHITE);\n  display.display();',
      loop:'  display.clearDisplay();\n  display.setCursor(0,0);\n  display.println("IoT Guard");\n  display.display();',
      payloadKeys:[] },

    // ── Actuators ────────────────────────────────────────────────
    { id:'relay_1ch', name:'1-Ch Relay', category:'Actuator', icon:'🔌', color:'#f97316', interface:'Digital',
      pins:{ IN:{ label:'IN', default:26 } },
      includes:[],
      setup:'  pinMode(RELAY_PIN, OUTPUT);\n  digitalWrite(RELAY_PIN, HIGH);',
      loop:'',
      payloadKeys:['relay_state'] },

    { id:'relay_4ch', name:'4-Ch Relay', category:'Actuator', icon:'🔌', color:'#ea580c', interface:'Digital',
      pins:{ IN1:{ label:'IN1', default:25 }, IN2:{ label:'IN2', default:26 }, IN3:{ label:'IN3', default:27 }, IN4:{ label:'IN4', default:32 } },
      includes:[],
      setup:'  pinMode(R1,OUTPUT); pinMode(R2,OUTPUT); pinMode(R3,OUTPUT); pinMode(R4,OUTPUT);\n  digitalWrite(R1,HIGH); digitalWrite(R2,HIGH); digitalWrite(R3,HIGH); digitalWrite(R4,HIGH);',
      loop:'',
      payloadKeys:['relay1','relay2','relay3','relay4'] },

    { id:'servo_sg90', name:'Servo SG90', category:'Actuator', icon:'⚙️', color:'#0ea5e9', interface:'PWM',
      pins:{ SIGNAL:{ label:'Signal', default:13 } },
      includes:['<ESP32Servo.h>'],
      setup:'  servo.attach(SERVO_PIN);',
      loop:'  servo.write(90); // 0-180 degrees',
      payloadKeys:['servo_angle'] },

    { id:'dc_motor', name:'DC Motor+Driver', category:'Actuator', icon:'🔧', color:'#64748b', interface:'PWM',
      pins:{ IN1:{ label:'IN1', default:25 }, IN2:{ label:'IN2', default:26 }, ENA:{ label:'ENA/PWM', default:33 } },
      includes:[],
      setup:'  pinMode(MOTOR_IN1, OUTPUT);\n  pinMode(MOTOR_IN2, OUTPUT);\n  ledcSetup(0, 5000, 8);\n  ledcAttachPin(MOTOR_ENA, 0);',
      loop:'',
      payloadKeys:[] },

    { id:'l298n', name:'L298N Driver', category:'Actuator', icon:'⚡', color:'#475569', interface:'PWM',
      pins:{ IN1:{ label:'IN1', default:25 }, IN2:{ label:'IN2', default:26 }, ENA:{ label:'ENA', default:33 }, IN3:{ label:'IN3', default:27 }, IN4:{ label:'IN4', default:32 }, ENB:{ label:'ENB', default:34 } },
      includes:[],
      setup:'  pinMode(L298_IN1, OUTPUT); pinMode(L298_IN2, OUTPUT);\n  pinMode(L298_IN3, OUTPUT); pinMode(L298_IN4, OUTPUT);',
      loop:'',
      payloadKeys:[] },

    { id:'buzzer', name:'Buzzer', category:'Actuator', icon:'🔔', color:'#ec4899', interface:'Digital',
      pins:{ SIGNAL:{ label:'Signal PIN', default:25 } },
      includes:[],
      setup:'  pinMode(BUZZER_PIN, OUTPUT);',
      loop:'',
      payloadKeys:[] },

    { id:'led', name:'LED', category:'Output', icon:'💎', color:'#facc15', interface:'Digital',
      pins:{ ANODE:{ label:'Anode (via 220Ω)', default:2 } },
      includes:[],
      setup:'  pinMode(LED_PIN, OUTPUT);',
      loop:'  digitalWrite(LED_PIN, HIGH);',
      payloadKeys:[] },

    { id:'status_leds', name:'Status LEDs', category:'Output', icon:'🚦', color:'#22d3ee', interface:'Digital',
      pins:{ RED:{ label:'Red LED', default:25 }, GREEN:{ label:'Green LED', default:26 }, BLUE:{ label:'Blue LED', default:27 } },
      includes:[],
      setup:'  pinMode(LED_RED, OUTPUT);\n  pinMode(LED_GREEN, OUTPUT);\n  pinMode(LED_BLUE, OUTPUT);',
      loop:'',
      payloadKeys:[] },

    { id:'solenoid', name:'Solenoid Lock', category:'Actuator', icon:'🔒', color:'#b45309', interface:'Digital',
      pins:{ CTRL:{ label:'MOSFET Gate', default:26 } },
      includes:[],
      setup:'  pinMode(SOLENOID_PIN, OUTPUT);\n  digitalWrite(SOLENOID_PIN, LOW);',
      loop:'',
      payloadKeys:['lock_state'] },

    { id:'water_pump', name:'Water Pump', category:'Actuator', icon:'💧', color:'#0284c7', interface:'Digital',
      pins:{ CTRL:{ label:'MOSFET Gate', default:27 } },
      includes:[],
      setup:'  pinMode(PUMP_PIN, OUTPUT);\n  digitalWrite(PUMP_PIN, LOW);',
      loop:'',
      payloadKeys:['pump_state'] },

    // ── Other ─────────────────────────────────────────────────────
    { id:'ds3231', name:'DS3231 RTC', category:'Time', icon:'🕐', color:'#6366f1', interface:'I2C',
      pins:{ SDA:{ label:'SDA', default:21 }, SCL:{ label:'SCL', default:22 } },
      includes:['<Wire.h>','<RTClib.h>'],
      setup:'  if (!rtc.begin()) { Serial.println("RTC not found"); }\n  if (rtc.lostPower()) { rtc.adjust(DateTime(F(__DATE__), F(__TIME__))); }',
      loop:'  DateTime now = rtc.now();\n  String timestamp = String(now.year()) + "-" + String(now.month()) + "-" + String(now.day());',
      payloadKeys:['rtc_timestamp'] },

    { id:'ina219', name:'Battery (INA219)', category:'Power', icon:'🔋', color:'#34d399', interface:'I2C',
      pins:{ SDA:{ label:'SDA', default:21 }, SCL:{ label:'SCL', default:22 } },
      includes:['<Wire.h>','<Adafruit_INA219.h>'],
      setup:'  ina219.begin();',
      loop:'  float busVoltage = ina219.getBusVoltage_V();\n  float current_mA = ina219.getCurrent_mA();\n  float power_mW = ina219.getPower_mW();',
      payloadKeys:['voltage','current_mA','power_mW'] },
];

// Backward compatibility alias
const SENSOR_LIBRARY = COMPONENT_LIBRARY;

// State
let selectedSensors = {};
let componentSearchQuery = '';
const INITIAL_VISIBLE_COUNT = 10; // Show first N, rest via search

function renderSensorLibrary() {
    const grid = document.getElementById('sensor-library-grid');
    if (!grid) return;

    const query = componentSearchQuery.trim().toLowerCase();
    let list = COMPONENT_LIBRARY;

    if (query) {
        list = COMPONENT_LIBRARY.filter(c =>
            c.name.toLowerCase().includes(query) ||
            c.category.toLowerCase().includes(query) ||
            c.interface.toLowerCase().includes(query)
        );
    } else {
        list = COMPONENT_LIBRARY.slice(0, INITIAL_VISIBLE_COUNT);
    }

    if (list.length === 0) {
        grid.innerHTML = `
            <div style="grid-column:1/-1;text-align:center;padding:28px 10px;">
                <div style="font-size:2rem;margin-bottom:10px;opacity:0.5;">🔍</div>
                <div style="font-size:0.85rem;color:var(--text-muted);font-weight:600;">Not Found in Library</div>
                <div style="font-size:0.72rem;color:var(--text-muted);margin-top:4px;opacity:0.6;">Try a different search term or add as Custom Component below.</div>
            </div>`;
        return;
    }

    grid.innerHTML = list.map(s => {
        const isSelected = !!selectedSensors[s.id];
        const rgb = hexToRgb(s.color);
        return `<div id="slib-${s.id}" onclick="toggleSensor('${s.id}')"
            style="cursor:pointer;padding:10px 12px;border-radius:12px;border:1.5px solid ${isSelected ? s.color : 'var(--border)'};background:${isSelected ? `rgba(${rgb},0.12)` : 'rgba(255,255,255,0.02)'};transition:all 0.2s;position:relative;"
            onmouseenter="this.style.borderColor='${s.color}';this.style.background='rgba(${rgb},0.1)'"
            onmouseleave="if(!${isSelected}){this.style.borderColor='var(--border)';this.style.background='rgba(255,255,255,0.02)'}"
        >
            ${isSelected ? `<div style="position:absolute;top:6px;right:8px;width:16px;height:16px;border-radius:50%;background:${s.color};display:flex;align-items:center;justify-content:center;font-size:0.55rem;color:#000;font-weight:900;">✓</div>` : ''}
            <div style="font-size:1.3rem;margin-bottom:4px;">${s.icon}</div>
            <div style="font-size:0.78rem;font-weight:600;color:#fff;line-height:1.3;">${s.name}</div>
            <div style="font-size:0.65rem;color:${s.color};margin-top:2px;text-transform:uppercase;letter-spacing:0.3px;">${s.interface} · ${s.category}</div>
        </div>`;
    }).join('');

    // Hint when not searching
    if (!query) {
        const remaining = COMPONENT_LIBRARY.length - INITIAL_VISIBLE_COUNT;
        grid.innerHTML += `
            <div style="grid-column:1/-1;text-align:center;padding:8px 4px;">
                <div style="font-size:0.7rem;color:var(--text-muted);opacity:0.7;">
                    <i class="fas fa-search" style="margin-right:4px;"></i>
                    Search to find ${remaining} more components…
                </div>
            </div>`;
    }
}

// Handle search input
function onComponentSearch(value) {
    componentSearchQuery = value;
    renderSensorLibrary();
}
window.onComponentSearch = onComponentSearch;

// ── Custom Component ──────────────────────────────────────────────────
let customComponents = [];

function addCustomComponent() {
    const name  = document.getElementById('custom-comp-name').value.trim();
    const pinsRaw = document.getElementById('custom-comp-pins').value.trim();
    const icon  = document.getElementById('custom-comp-icon').value.trim() || '🔧';

    if (!name) return showNotification('Component name is required', 'error');
    if (!pinsRaw) return showNotification('Add at least one pin (e.g. DATA:4)', 'error');

    // Parse "PINNAME:default, PINNAME2:default2"
    const pins = {};
    pinsRaw.split(',').forEach(part => {
        const [k, v] = part.trim().split(':');
        if (k) pins[k.trim().toUpperCase()] = { label: k.trim(), default: parseInt(v) || 0 };
    });

    const id = 'custom_' + Date.now();
    const comp = {
        id, name, category:'Custom', icon, color:'#a78bfa',
        interface:'Custom', pins, includes:[], setup:'', loop:'',
        payloadKeys: Object.keys(pins).map(k => k.toLowerCase())
    };

    COMPONENT_LIBRARY.push(comp);
    customComponents.push(comp);

    // Auto-select it
    const pinVals = {};
    Object.entries(pins).forEach(([k, cfg]) => { pinVals[k] = cfg.default; });
    selectedSensors[id] = pinVals;

    // Clear inputs
    document.getElementById('custom-comp-name').value = '';
    document.getElementById('custom-comp-pins').value = '';
    document.getElementById('custom-comp-icon').value = '';

    renderSensorLibrary();
    renderPinConfig();
    updateSelectedCount();
    showNotification(`"${name}" added to library & selected!`, 'success');
}
window.addCustomComponent = addCustomComponent;



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
    if (activeSensors.find(s => s.id === 'dht11')) globals.push('DHT dht11(DHT11_DATA, DHT11);');
    if (activeSensors.find(s => s.id === 'dht22')) globals.push('DHT dht22(DHT22_DATA, DHT22);');
    if (activeSensors.find(s => s.id === 'ds18b20')) globals.push('OneWire oneWire(DS18B20_DATA);\nDallasTemperature sensors(&oneWire);');
    if (activeSensors.find(s => s.id === 'bme280')) globals.push('Adafruit_BME280 bme;');
    if (activeSensors.find(s => s.id === 'bh1750')) globals.push('BH1750 lightMeter;');
    if (activeSensors.find(s => s.id === 'pms5003')) globals.push('PMS pms(Serial2);');
    if (activeSensors.find(s => s.id === 'neo6m')) globals.push('TinyGPSPlus gps;\nHardwareSerial gpsSerial(2);');
    if (activeSensors.find(s => s.id === 'rc522')) globals.push('MFRC522 mfrc522(RC522_SS, RC522_RST);');
    if (activeSensors.find(s => s.id === 'oled_ssd1306')) globals.push('Adafruit_SSD1306 display(128, 64, &Wire, -1);');
    if (activeSensors.find(s => s.id === 'servo_sg90')) globals.push('Servo servo;');
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
        device_type: document.getElementById('device_type').value,
        components: selectedRegComponents || []
    };
    const res = await fetch(`${API_BASE}/devices/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` },
        body: JSON.stringify(data)
    });
    if (res.ok) {
        const device = await res.json();
        hideModal('register-modal');
        selectedRegComponents = [];
        loadDevices();
        loadIntegrationDevices();
        showNotification(`Device '${device.name}' registered with ${data.components.length} components! Secret Key: ${device.secret}`, "success");
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
                            <div style="width:8px;height:8px;border-radius:50%;background:${statusColor};flex-shrink:0;${statusText === 'Reporting' ? 'animation:pulse 2s infinite;' : ''}"></div>
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
        cachedDevices = devices;
        const grid = document.getElementById('fleet-matrix-grid');
        grid.innerHTML = '';
        if (!devices.length) { grid.innerHTML = '<p class="text-muted">No devices registered.</p>'; return; }
        for (const dev of devices) {
            const card = document.createElement('div');
            card.className = 'matrix-card';
            const cid = `fleet-chart-${dev.hardware_id}`;
            const compList = dev.components || [];
            const compChipsHtml = compList.length > 0 ? `
                <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 10px;">
                    ${compList.map(c => `<span class="device-comp-tag" style="font-size:0.65rem;">${c.icon || '🔌'} ${c.name}</span>`).join('')}
                </div>` : '';

            card.innerHTML = `
                <div class="card-header" style="margin-bottom: 8px;">
                    <div>
                        <h3 style="font-size: 1rem;">${dev.name}</h3>
                        <p style="font-size:0.7rem;color:var(--text-muted);">HWID: ${dev.hardware_id}</p>
                    </div>
                    <span class="badge badge-low">LIVE</span>
                </div>
                ${compChipsHtml}
                <div id="${cid}-reading" style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px;">
                    <span style="font-size: 0.72rem; color: var(--text-muted); font-family: 'Fira Code', monospace;" id="${cid}-metric-name">STREAMING</span>
                    <span style="font-size: 1.1rem; font-weight: 700; color: #fff; font-family: var(--font-display);" id="${cid}-val-text">--</span>
                </div>
                <div style="height:120px; position: relative;"><canvas id="${cid}"></canvas></div>
                <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 8px; margin-top: 14px;">
                    <button class="accent-btn" style="justify-content: center; font-size: 0.75rem; padding: 6px 10px;" onclick="openEditComponentsModal(${dev.id})">
                        <i class="fas fa-sliders-h"></i>
                    </button>
                    <button class="primary-btn" style="justify-content:center; font-size: 0.78rem; padding: 6px 12px;" onclick="openDeviceDetail('${dev.hardware_id}','${dev.name}')">
                        <i class="fas fa-chart-line" style="margin-right: 5px;"></i> Analytics
                    </button>
                </div>`;
            grid.appendChild(card);
            loadMiniFleetChart(dev, cid);
        }
    } catch (e) { }
}

async function loadMiniFleetChart(dev, cid) {
    const hwid = typeof dev === 'string' ? dev : dev.hardware_id;
    const deviceObj = typeof dev === 'object' ? dev : ((cachedDevices || []).find(d => d.hardware_id === hwid) || {});
    try {
        const res = await fetch(`${API_BASE}/telemetry/${hwid}?limit=25`, { headers: { 'Authorization': `Bearer ${currentToken}` } });
        const data = await res.json();
        if (!data.length) return;
        const sorted = data.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        const IGNORED_KEYS = new Set(['hwid', 'hardware_id', 'node_id', 'node', 'device_id', 'secret', 'timestamp', 'time', 'created_at', 'id', 'user_id', 'status', 'registered', 'device_type', 'token']);
        
        // Find best sensor key
        let key = null;
        let compMatch = null;
        const compList = deviceObj.components || [];
        for (const c of compList) {
            for (const k of (c.keys || [])) {
                if (sorted.some(p => p.data && p.data[k] !== undefined && p.data[k] !== null)) {
                    key = k;
                    compMatch = c;
                    break;
                }
            }
            if (key) break;
        }

        if (!key) {
            const firstWithData = sorted[sorted.length - 1].data || {};
            key = Object.keys(firstWithData).find(k => !IGNORED_KEYS.has(k.toLowerCase()) && !isNaN(Number(firstWithData[k]))) || Object.keys(firstWithData)[0];
        }

        if (!key) return;

        const theme = getSensorTheme(key, compMatch);
        const validPoints = sorted.filter(p => p.data && p.data[key] !== undefined && p.data[key] !== null).map(p => ({
            time: new Date(p.timestamp || Date.now()),
            val: Number(p.data[key])
        })).filter(p => !isNaN(p.val));

        if (!validPoints.length) return;

        const latestVal = validPoints[validPoints.length - 1].val;
        const metricNameEl = document.getElementById(`${cid}-metric-name`);
        const valTextEl = document.getElementById(`${cid}-val-text`);
        if (metricNameEl) metricNameEl.innerHTML = `${theme.emoji} ${theme.label.toUpperCase()}`;
        if (valTextEl) valTextEl.innerHTML = `${Number.isInteger(latestVal) ? latestVal : latestVal.toFixed(1)} <span style="font-size: 0.75rem; color: ${theme.color};">${theme.unit}</span>`;

        const ctx = document.getElementById(cid);
        if (!ctx) return;

        const canvasCtx = ctx.getContext('2d');
        const grad = canvasCtx.createLinearGradient(0, 0, 0, 120);
        grad.addColorStop(0, theme.bg.replace('0.14', '0.3'));
        grad.addColorStop(1, 'rgba(0,0,0,0)');

        new Chart(canvasCtx, {
            type: 'line',
            data: {
                labels: validPoints.map(p => {
                    const d = p.time;
                    return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
                }),
                datasets: [{
                    data: validPoints.map(p => p.val),
                    borderColor: theme.color,
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: true,
                    backgroundColor: grad,
                    tension: 0.35
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        display: true,
                        grid: { color: 'rgba(255, 255, 255, 0.04)' },
                        ticks: { color: '#64748b', font: { size: 9 }, maxTicksLimit: 4 }
                    },
                    y: {
                        display: true,
                        grid: { color: 'rgba(255, 255, 255, 0.04)' },
                        ticks: {
                            color: '#64748b',
                            font: { size: 9 },
                            maxTicksLimit: 3,
                            callback: v => v + (theme.unit ? ' ' + theme.unit : '')
                        }
                    }
                },
                plugins: { legend: { display: false } }
            }
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
// Users (Admin / Sub-Admin)
// ─────────────────────────────────────────────
function setDefaultPermissionsByRole(role, checkboxClass) {
    const defaults = ROLE_DEFAULT_PERMS[role] || ROLE_DEFAULT_PERMS['user'];
    document.querySelectorAll(`.${checkboxClass}`).forEach(cb => {
        cb.checked = defaults.includes(cb.value);
    });
}

function collectPermissions(checkboxClass) {
    const perms = [];
    document.querySelectorAll(`.${checkboxClass}:checked`).forEach(cb => perms.push(cb.value));
    return perms;
}

function showAddUserModal() {
    document.getElementById('new-user-name').value = '';
    document.getElementById('new-user-email').value = '';
    document.getElementById('new-user-pass').value = '';
    document.getElementById('new-user-pass-confirm').value = '';
    document.getElementById('new-user-role').value = 'user';
    setDefaultPermissionsByRole('user', 'perm-cb-new');
    document.getElementById('add-user-modal').classList.remove('hidden');
    setTimeout(setupCustomSelects, 50);
}
window.showAddUserModal = showAddUserModal;

function showEditUserModal(userId) {
    const user = USER_CACHE[userId];
    if (!user) { showNotification('User data not found', 'error'); return; }
    document.getElementById('edit-user-id').value = user.id;
    document.getElementById('edit-user-name').value = user.full_name || '';
    document.getElementById('edit-user-email').value = user.email;
    document.getElementById('edit-user-role').value = user.role;
    document.getElementById('edit-user-pass').value = '';
    document.getElementById('edit-user-pass-confirm').value = '';
    document.querySelectorAll('.perm-cb-edit').forEach(cb => {
        cb.checked = (user.permissions || []).includes(cb.value);
    });
    document.getElementById('edit-user-modal').classList.remove('hidden');
    setTimeout(setupCustomSelects, 50);
}
window.showEditUserModal = showEditUserModal;

async function saveInlinePermissions(userId, checkboxClass) {
    const perms = collectPermissions(checkboxClass);
    try {
        const res = await fetch(`${API_BASE}/auth/users/${userId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` },
            body: JSON.stringify({ permissions: perms })
        });
        if (res.ok) {
            showNotification('Permissions saved!', 'success');
            loadUsers();
        } else {
            const e = await res.json();
            showNotification(e.detail || 'Failed to save permissions', 'error');
        }
    } catch (e) {
        showNotification('Network error — permissions not saved', 'error');
    }
}
window.saveInlinePermissions = saveInlinePermissions;

async function loadUsers() {
    try {
        const res = await fetch(`${API_BASE}/auth/users`, { headers: { 'Authorization': `Bearer ${currentToken}` } });
        if (!res.ok) {
            const e = await res.json();
            throw new Error(e.detail || 'Unauthorized');
        }
        const users = await res.json();
        const container = document.getElementById('users-list-container');
        if (!container) return;
        container.innerHTML = '';

        Object.keys(USER_CACHE).forEach(k => delete USER_CACHE[k]);

        if (!users || !users.length) {
            container.innerHTML = '<div class="empty-msg">No user accounts registered yet. Click "Add Users / Sub Users" above to invite your team.</div>';
            return;
        }

        users.forEach(u => {
            USER_CACHE[u.id] = u;

            const card = document.createElement('div');
            card.className = 'glass-card';
            card.style.cssText = 'padding:0;background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:16px;overflow:hidden;margin-bottom:15px;';

            const roleColor = u.role === 'admin' ? 'var(--accent)' : (u.role === 'subadmin' ? 'var(--warning)' : 'var(--success)');
            const roleBg = u.role === 'admin' ? 'rgba(167,139,250,0.1)' : (u.role === 'subadmin' ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)');
            const userPerms = u.permissions || [];
            const inlinePermId = `inline-perms-${u.id}`;
            const inlineCbClass = `inline-perm-cb-${u.id}`;

            const allPermKeys = Object.keys(ALL_PERMISSION_LABELS);
            const permBadges = allPermKeys.map(key => {
                const hasIt = userPerms.includes(key);
                const safeLabel = ALL_PERMISSION_LABELS[key].replace(/'/g, '&#39;');
                return `<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:18px;font-size:0.7rem;font-weight:600;background:${hasIt ? 'rgba(6,182,212,0.12)' : 'rgba(255,255,255,0.03)'};color:${hasIt ? '#06b6d4' : 'var(--text-muted)'};border:1px solid ${hasIt ? 'rgba(6,182,212,0.3)' : 'var(--border)'};">
                    <i class="fas fa-${hasIt ? 'check' : 'minus'}" style="font-size:0.6rem;"></i> ${safeLabel}
                </span>`;
            }).join('');

            const safeName = (u.full_name || 'Unnamed User').replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&#39;', '"': '&quot;' }[c]));
            const safeEmail = (u.email || '').replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&#39;', '"': '&quot;' }[c]));
            const safeRole = (u.role || 'user').toUpperCase().replace(/'/g, '');

            card.innerHTML = `
                <div style="padding:20px;">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:20px;flex-wrap:wrap;">
                        <div style="display:flex;align-items:center;gap:16px;">
                            <div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg, var(--accent-soft), rgba(6,182,212,0.15));display:flex;align-items:center;justify-content:center;border:2px solid var(--accent-glow);">
                                <i class="fas fa-user" style="color:var(--accent);font-size:1.1rem;"></i>
                            </div>
                            <div>
                                <p style="font-weight:700;font-size:1rem;margin:0 0 4px 0;">${safeName}</p>
                                <p style="font-size:0.82rem;color:var(--text-muted);margin:0;">${safeEmail}</p>
                            </div>
                        </div>
                        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                            <span style="padding:5px 14px;border-radius:20px;font-size:0.75rem;font-weight:700;color:${roleColor};background:${roleBg};border:1px solid ${roleColor}33;">
                                ${safeRole}
                            </span>
                            <span style="padding:5px 14px;border-radius:20px;font-size:0.75rem;font-weight:600;color:${u.is_active ? 'var(--success)' : 'var(--danger)'};background:${u.is_active ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'};border:1px solid ${u.is_active ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'};">
                                <i class="fas fa-circle" style="font-size:0.5rem;margin-right:5px;"></i>${u.is_active ? 'ACTIVE' : 'DISABLED'}
                            </span>
                            <button type="button" class="accent-btn" style="padding:7px 14px;font-size:0.8rem;" data-user-edit="${u.id}">
                                <i class="fas fa-edit"></i> Edit
                            </button>
                            <button type="button" class="accent-btn" style="padding:7px 14px;font-size:0.8rem;color:var(--danger);border-color:rgba(239,68,68,0.3);" data-user-delete="${u.id}">
                                <i class="fas fa-trash"></i> Delete
                            </button>
                        </div>
                    </div>

                    <div style="margin-top:18px;padding:15px 18px;background:rgba(0,0,0,0.22);border-radius:12px;border:1px solid rgba(255,255,255,0.04);">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                            <p style="font-size:0.75rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin:0;">
                                <i class="fas fa-shield-alt" style="margin-right:6px;"></i>Service Access Permissions (${userPerms.length}/${allPermKeys.length})
                            </p>
                            <button type="button" class="accent-btn" style="padding:3px 10px;font-size:0.7rem;" data-toggle-perms="${inlinePermId}">
                                <i class="fas fa-sliders-h"></i> Toggle Editor
                            </button>
                        </div>
                        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">
                            ${permBadges}
                        </div>
                        <div id="${inlinePermId}" class="hidden" style="margin-top:5px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.05);">
                            <p style="font-size:0.7rem;color:var(--text-muted);margin-bottom:10px;">Select which tabs/services this user can access:</p>
                            <div class="permissions-grid" style="margin-top:0;padding:12px;">
                                ${allPermKeys.map(key => `
                                    <label class="perm-check">
                                        <input type="checkbox" class="${inlineCbClass}" value="${key}" ${userPerms.includes(key) ? 'checked' : ''}>
                                        <span>${ALL_PERMISSION_LABELS[key].replace(/'/g, '&#39;')}</span>
                                    </label>
                                `).join('')}
                            </div>
                            <button type="button" class="primary-btn perm-save-btn" style="display:flex;align-items:center;gap:8px;" data-save-perms-id="${u.id}" data-save-perms-class="${inlineCbClass}">
                                <i class="fas fa-save"></i> Save Permissions
                            </button>
                        </div>
                    </div>
                </div>
            `;
            container.appendChild(card);
        });

        container.querySelectorAll('[data-user-edit]').forEach(btn => {
            btn.addEventListener('click', () => showEditUserModal(parseInt(btn.getAttribute('data-user-edit'))));
        });
        container.querySelectorAll('[data-user-delete]').forEach(btn => {
            btn.addEventListener('click', () => {
                const uid = parseInt(btn.getAttribute('data-user-delete'));
                const u = USER_CACHE[uid];
                deleteUser(uid, u ? u.email : '');
            });
        });
        container.querySelectorAll('[data-toggle-perms]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-toggle-perms');
                const el = document.getElementById(id);
                if (el) el.classList.toggle('hidden');
            });
        });
        container.querySelectorAll('[data-save-perms-id]').forEach(btn => {
            btn.addEventListener('click', () => {
                const uid = parseInt(btn.getAttribute('data-save-perms-id'));
                const cls = btn.getAttribute('data-save-perms-class');
                saveInlinePermissions(uid, cls);
            });
        });
    } catch (e) {
        showNotification('Failed to load users', 'error');
        console.error('loadUsers error:', e);
    }
}

async function deleteUser(userId, userEmail) {
    const emailLine = userEmail ? `\n\nEmail: ${userEmail}` : '';
    if (!confirm(`⚠️ Permanently remove user account?${emailLine}\n\nThis action cannot be undone.`)) return;
    try {
        const res = await fetch(`${API_BASE}/auth/users/${userId}/delete`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (res.ok) {
            showNotification('User removed successfully', 'success');
            if (USER_CACHE[userId]) delete USER_CACHE[userId];
            loadUsers();
        }
        else {
            let msg = 'Delete failed';
            try { const e = await res.json(); if (e && e.detail) msg = e.detail; } catch (_) { }
            showNotification(msg, 'error');
        }
    } catch (e) {
        showNotification('Network error — could not delete user', 'error');
    }
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
    document.getElementById('add-smtp-btn')?.addEventListener('click', () => {
        document.getElementById('smtp-modal').classList.remove('hidden');
        setTimeout(setupCustomSelects, 50);
    });
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

    // ── Add User Form Submit ──
    document.getElementById('add-user-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const full_name = document.getElementById('new-user-name').value.trim();
        const email = document.getElementById('new-user-email').value.trim();
        const role = document.getElementById('new-user-role').value;
        const password = document.getElementById('new-user-pass').value;
        const password2 = document.getElementById('new-user-pass-confirm').value;
        const permissions = collectPermissions('perm-cb-new');

        if (password !== password2) {
            showNotification('Passwords do not match', 'error');
            return;
        }
        if (password.length < 6) {
            showNotification('Password must be at least 6 characters', 'error');
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/auth/users/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` },
                body: JSON.stringify({ email, password, full_name, role, permissions })
            });
            const data = await res.json();
            if (res.ok) {
                showNotification(`User "${email}" created successfully!`, 'success');
                hideModal('add-user-modal');
                loadUsers();
            } else {
                showNotification(data.detail || 'User creation failed', 'error');
            }
        } catch (err) {
            showNotification('Backend connection failed', 'error');
        }
    });

    // ── Add User: Role Change → Auto-set default permissions ──
    document.getElementById('new-user-role')?.addEventListener('change', (e) => {
        if (confirm('Reset permissions to defaults for this role?\n(Choose OK to apply role-based presets)')) {
            setDefaultPermissionsByRole(e.target.value, 'perm-cb-new');
        }
    });

    // ── Edit User Form Submit ──
    document.getElementById('edit-user-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const userId = parseInt(document.getElementById('edit-user-id').value);
        const full_name = document.getElementById('edit-user-name').value.trim();
        const role = document.getElementById('edit-user-role').value;
        const password = document.getElementById('edit-user-pass').value;
        const password2 = document.getElementById('edit-user-pass-confirm').value;
        const permissions = collectPermissions('perm-cb-edit');

        if (password && password !== password2) {
            showNotification('Passwords do not match', 'error');
            return;
        }
        if (password && password.length < 6) {
            showNotification('Password must be at least 6 characters', 'error');
            return;
        }

        const payload = { full_name, role, permissions };
        if (password) payload.password = password;

        try {
            const res = await fetch(`${API_BASE}/auth/users/${userId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (res.ok) {
                showNotification('User updated successfully!', 'success');
                hideModal('edit-user-modal');
                loadUsers();
            } else {
                showNotification(data.detail || 'Update failed', 'error');
            }
        } catch (err) {
            showNotification('Backend connection failed', 'error');
        }
    });

    // ── Edit User: Role Change → Auto-set default permissions ──
    document.getElementById('edit-user-role')?.addEventListener('change', (e) => {
        if (confirm('Reset permissions to defaults for this role?\n(Choose OK to apply role-based presets)')) {
            setDefaultPermissionsByRole(e.target.value, 'perm-cb-edit');
        }
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
        div.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:12px;background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:10px;margin-bottom:6px;';
        div.innerHTML = `
            <div>
                <p style="font-weight:600;font-size:0.9rem;">${s.name || s.host}</p>
                <p style="font-size:0.75rem;color:var(--text-muted);">${s.from_email} · Port ${s.port} · ${s.security}</p>
            </div>
            <div style="display:flex;align-items:center;gap:10px;">
                <span class="badge badge-low">ACTIVE</span>
                <button class="accent-btn" style="color:var(--danger);border-color:rgba(239,68,68,0.3);padding:6px 10px;font-size:0.8rem;" title="Delete SMTP Relay" onclick="deleteSmtp(${s.id})">
                    <i class="fas fa-trash"></i>
                </button>
            </div>`;
        container.appendChild(div);
    });
}

async function deleteSmtp(id) {
    if (!confirm('Are you sure you want to decommission this SMTP Relay configuration?')) return;
    try {
        const res = await fetch(`${API_BASE}/alerts/smtp/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (res.ok) {
            showNotification('SMTP Relay deleted successfully', 'success');
            loadAlertsData();
        } else {
            const err = await res.json();
            showNotification(err.detail || 'Failed to delete SMTP relay', 'error');
        }
    } catch (e) {
        showNotification('Connection error while deleting SMTP relay', 'error');
    }
}
window.deleteSmtp = deleteSmtp;

function applySmtpPreset(type) {
    const hostEl = document.getElementById('smtp-host');
    const portEl = document.getElementById('smtp-port');
    const secEl = document.getElementById('smtp-security');
    const authEl = document.getElementById('smtp-auth');
    const heloEl = document.getElementById('smtp-helo');

    if (type === 'gmail') {
        if (hostEl) hostEl.value = 'smtp.gmail.com';
        if (portEl) portEl.value = '587';
        if (secEl) secEl.value = 'TLS';
        if (authEl) authEl.value = 'Standard';
        if (heloEl) heloEl.value = 'IoT-Guard-Node';
    } else if (type === 'outlook') {
        if (hostEl) hostEl.value = 'smtp.office365.com';
        if (portEl) portEl.value = '587';
        if (secEl) secEl.value = 'TLS';
        if (authEl) authEl.value = 'Standard';
        if (heloEl) heloEl.value = 'IoT-Guard-Node';
    } else if (type === 'ssl465') {
        if (portEl) portEl.value = '465';
        if (secEl) secEl.value = 'SSL';
        if (authEl) authEl.value = 'Standard';
    }

    // Refresh custom dropdown triggers
    document.querySelectorAll('.custom-select-container').forEach(c => c.remove());
    document.querySelectorAll('select').forEach(s => delete s.dataset.customized);
    setupCustomSelects();

    showNotification(`Applied ${type.toUpperCase()} presets!`, 'info');
}
window.applySmtpPreset = applySmtpPreset;

function onSmtpPortChanged(port) {
    const secEl = document.getElementById('smtp-security');
    if (!secEl) return;
    if (port === '465') {
        secEl.value = 'SSL';
    } else if (port === '587') {
        secEl.value = 'TLS';
    } else if (port === '25') {
        secEl.value = 'None';
    }
    // Refresh custom selects
    document.querySelectorAll('.custom-select-container').forEach(c => c.remove());
    document.querySelectorAll('select').forEach(s => delete s.dataset.customized);
    setupCustomSelects();
}
window.onSmtpPortChanged = onSmtpPortChanged;


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


