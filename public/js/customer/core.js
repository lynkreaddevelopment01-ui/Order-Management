// ===== STATE =====
let uniqueCode = '';
let customerId = '';
let customerData = null;
let stockItems = [];
let cart = {}; // stockId: quantity
let manualCart = {}; // itemName: quantity

// Pagination state
let customerPagination = {
    page: 1,
    limit: 20,
    totalPages: 1,
    loading: false,
    search: ''
};
let searchTimeout = null;

// Initialize
window.addEventListener('load', async () => {
    await fetchTenantInfo();

    const savedCustomer = localStorage.getItem('customer');
    if (savedCustomer) {
        customerData = JSON.parse(savedCustomer);
        customerId = customerData.customer_id_external;
        // Favor the code from saved session
        if (customerData.unique_code) uniqueCode = customerData.unique_code;

        // Display customer info
        const nameEl = document.getElementById('displayCustName');
        if (nameEl) nameEl.textContent = customerData.name;

        const phoneEl = document.getElementById('displayCustPhone');
        if (phoneEl) phoneEl.textContent = customerData.phone;

        const addrEl = document.getElementById('displayCustAddress');
        if (addrEl) addrEl.textContent = `${customerData.address || ''}${customerData.city ? ', ' + customerData.city : ''}` || 'Not provided';

        document.getElementById('loginView').style.display = 'none';
        document.getElementById('orderView').style.display = 'block';
        if (typeof loadStock === 'function') loadStock(1);
    }
});

async function fetchTenantInfo() {
    try {
        const res = await fetch('/api/auth/current-tenant');
        if (res.ok) {
            const data = await res.json();
            uniqueCode = data.unique_code || '';
            console.log('[PORTAL] Identity confirmed:', data.company_name, uniqueCode);
        } else {
            // Fallback to path extraction
            const pathParts = window.location.pathname.split('/').filter(p => p);
            if (pathParts.length > 0) {
                const lastPart = pathParts[pathParts.length - 1];
                uniqueCode = lastPart === 'admin' ? (pathParts[pathParts.length - 2] || '') : lastPart;
            }
            console.log('[PORTAL] Using path-based code:', uniqueCode);
        }
    } catch (err) {
        console.error('Tenant fetch failed:', err);
        const pathParts = window.location.pathname.split('/').filter(p => p);
        if (pathParts.length > 0) {
            uniqueCode = pathParts[pathParts.length - 1];
        }
    }
}

// ===== TOAST =====
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) {
        console.warn(`[TOAST FALLBACK] ${type.toUpperCase()}: ${message}`);
        if (type === 'error') alert(message);
        return;
    }
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${icons[type] || ''}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
}

// Global Error Tracker
window.onerror = function (msg, url, lineNo, columnNo, error) {
    console.error('[FATAL]', msg, 'at', lineNo + ':' + columnNo);
    if (msg.includes('id')) {
        showToast('UI Error: Missing data property (' + msg + ')', 'error');
    }
    return false;
};
