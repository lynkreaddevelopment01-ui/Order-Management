// ===== TABS =====
function switchTab(type) {
    const customerTab = document.getElementById('customerTab');
    const adminTab = document.getElementById('adminTab');
    const customerSection = document.getElementById('customerFormSection');
    const adminSection = document.getElementById('adminFormSection');

    if (type === 'customer') {
        customerTab.classList.add('active');
        adminTab.classList.remove('active');
        customerSection.style.display = 'block';
        adminSection.style.display = 'none';
    } else {
        customerTab.classList.remove('active');
        adminTab.classList.add('active');
        customerSection.style.display = 'none';
        adminSection.style.display = 'block';
    }
}

// ===== ADMIN LOGIN =====
const adminLoginForm = document.getElementById('adminLoginForm');
if (adminLoginForm) {
    adminLoginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('admin_username').value.trim();
        const password = document.getElementById('admin_password').value;
        const errorEl = document.getElementById('adminLoginError');
        const loginBtn = document.getElementById('adminLoginBtn');

        errorEl.style.display = 'none';
        loginBtn.disabled = true;
        loginBtn.textContent = 'Signing in...';

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();

            if (data.success) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify(data.user));
                window.location.href = '/portal-admin';
            } else {
                errorEl.textContent = data.error || 'Login failed';
                errorEl.style.display = 'block';
            }
        } catch (err) {
            errorEl.textContent = 'Network error. Please try again.';
            errorEl.style.display = 'block';
        }

        loginBtn.disabled = false;
        loginBtn.textContent = 'Sign In';
    });
}

// ===== CUSTOMER LOGIN =====
const customerLoginForm = document.getElementById('customerLoginForm');
if (customerLoginForm) {
    customerLoginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const custIdVal = document.getElementById('custId').value.trim();
        const errorEl = document.getElementById('custLoginError');
        const loginBtn = document.getElementById('custLoginBtn');

        errorEl.style.display = 'none';
        loginBtn.disabled = true;
        loginBtn.textContent = 'Verifying...';

        try {
            const res = await fetch('/api/customer/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uniqueCode, customerId: custIdVal })
            });
            const data = await res.json();

            if (data.success) {
                customerId = custIdVal;
                customerData = data.customer;
                uniqueCode = data.customer.unique_code || uniqueCode;
                localStorage.setItem('customer', JSON.stringify(data.customer));

                // Display customer info
                document.getElementById('displayCustName').textContent = data.customer.name;
                document.getElementById('displayCustPhone').textContent = data.customer.phone;
                document.getElementById('displayCustAddress').textContent = `${data.customer.address || ''}${data.customer.city ? ', ' + data.customer.city : ''}` || 'Not provided';

                document.getElementById('loginView').style.display = 'none';
                document.getElementById('orderView').style.display = 'block';
                if (typeof loadStock === 'function') loadStock(1);
            } else {
                errorEl.textContent = data.error || 'Verification failed';
                errorEl.style.display = 'block';
            }
        } catch (err) {
            errorEl.textContent = 'Network error. Please try again.';
            errorEl.style.display = 'block';
        }

        loginBtn.disabled = false;
        loginBtn.textContent = 'Continue →';
    });
}

// ===== LOGOUT =====
function customerLogout() {
    localStorage.removeItem('customer');
    window.location.reload();
}
