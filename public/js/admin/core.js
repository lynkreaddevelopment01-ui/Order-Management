// ===== ADMIN DASHBOARD CORE =====
const API_BASE = '/api';
let currentUser = null;

// ===== AUTH =====
function getToken() {
    return localStorage.getItem('token');
}

function authHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
    };
}

async function apiFetch(url, options = {}) {
    if (!options.headers) options.headers = {};
    options.headers['Authorization'] = `Bearer ${getToken()}`;
    if (options.body && typeof options.body === 'string') {
        options.headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(API_BASE + url, options);
    if (res.status === 401 || res.status === 403) {
        logout();
        return null;
    }
    return res;
}

function logout() {
    let redirectUrl = '/super-admin';

    // If on super admin dashboard, go to super admin login
    if (window.location.pathname.startsWith('/super-admin')) {
        redirectUrl = '/super-admin';
    }
    // If on vendor dashboard, go to the customer portal (which has the login form)
    else if (window.location.pathname === '/portal-admin') {
        redirectUrl = '/portal-customer';
    }

    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = redirectUrl;
}

function isSuperAdmin() {
    return currentUser && currentUser.role === 'superadmin';
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
    console.log('[CORE] Dashboard Initialization Started');
    const token = getToken();
    if (!token) {
        console.warn('[CORE] No token found in localStorage. Checking for portal context.');
        let redirectUrl = '/super-admin';

        // If on super-admin dashboard, redirect to login
        if (window.location.pathname.startsWith('/super-admin')) {
            redirectUrl = '/super-admin';
        }
        // If on vendor admin dashboard without token, redirect to customer portal for login
        else if (window.location.pathname === '/portal-admin') {
            redirectUrl = '/portal-customer';
        }

        window.location.href = redirectUrl;
        return;
    }

    try {
        console.log('[CORE] Fetching user identity...');
        const res = await apiFetch('/auth/me');
        if (!res) {
            console.error('[CORE] Identity fetch returned NULL or 401/403');
            return;
        }
        const data = await res.json();
        console.log('[CORE] Identity verified:', data.user.username);
        currentUser = data.user;

        const userEl = document.getElementById('userName');
        if (userEl) userEl.textContent = currentUser.name;

        const roleEl = document.getElementById('userRole');
        if (roleEl) roleEl.textContent = currentUser.role === 'superadmin' ? 'Super Admin' : currentUser.company_name || 'Admin';

        const avatarEl = document.getElementById('userAvatar');
        if (avatarEl) avatarEl.textContent = currentUser.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

        // Show/hide sections based on role
        if (isSuperAdmin()) {
            document.getElementById('superAdminNav').style.display = 'flex';
            document.getElementById('adminCompanyNav').style.display = 'none';
        } else {
            document.getElementById('superAdminNav').style.display = 'none';
            document.getElementById('adminCompanyNav').style.display = 'flex';
        }
    } catch (err) {
        console.error('[CORE] Dashboard Init Failed:', err);
        logout();
        return;
    }

    showPage('dashboard');
});

// ===== NAVIGATION =====
function showPage(page) {
    console.log('[CORE] Showing page:', page);
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === page);
    });

    try {
        if (page === 'dashboard') {
            if (isSuperAdmin()) {
                if (typeof loadSuperAdminDashboard === 'function') loadSuperAdminDashboard();
                else console.error('loadSuperAdminDashboard not found');
            } else {
                if (typeof loadAdminDashboard === 'function') loadAdminDashboard();
                else console.error('loadAdminDashboard not found');
            }
        } else if (page === 'manage-admins') {
            if (typeof loadManageAdmins === 'function') loadManageAdmins();
        } else if (page === 'stock') {
            if (typeof loadStockPage === 'function') loadStockPage();
        } else if (page === 'customers') {
            if (typeof loadCustomersPage === 'function') loadCustomersPage();
        } else if (page === 'orders') {
            if (typeof loadOrdersPage === 'function') loadOrdersPage();
        } else if (page === 'offers') {
            if (typeof loadOffersPage === 'function') loadOffersPage();
        }
    } catch (err) {
        console.error(`[CORE] Error loading page ${page}:`, err);
        showToast(`Failed to load ${page}`, 'error');
    }
}

function toggleSidebar() {
    // Legacy support for mobile menu toggle if re-implemented
}

// ===== TOAST =====
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${icons[type] || ''}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
}

// ===== MODALS =====
function openModal(id) {
    document.getElementById(id).classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

// ===== LOADING =====
function showLoading() { document.getElementById('loadingOverlay').style.display = 'flex'; }
function hideLoading() { document.getElementById('loadingOverlay').style.display = 'none'; }

// ===== UTILITY =====
function escapeHtml(str) {
    if (!str) return '';
    return str.toString().replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
// ===== PAGINATION UI HELPER =====
function updatePaginationUI(prefix, pagination) {
    const info = document.getElementById(`paginationInfo${prefix || ''}`) || document.getElementById('paginationInfo');
    const prevBtn = document.getElementById(`prevPage${prefix || ''}`) || document.getElementById('prevPage');
    const nextBtn = document.getElementById(`nextPage${prefix || ''}`) || document.getElementById('nextPage');

    if (info) {
        info.textContent = `Page ${pagination.page} of ${pagination.totalPages || 1}`;
    }
    if (prevBtn) {
        prevBtn.disabled = pagination.page <= 1;
    }
    if (nextBtn) {
        nextBtn.disabled = pagination.page >= pagination.totalPages;
    }
}
