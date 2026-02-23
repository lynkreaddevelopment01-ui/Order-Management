// ===== CUSTOMERS PAGE =====
let customersData = [];
let customerPagination = { page: 1, limit: 10, totalPages: 1 };

async function loadCustomersPage(page = 1) {
  customerPagination.page = page;
  const content = document.getElementById('contentArea');
  content.innerHTML = `
    <div class="section-header">
      <div><h2>Customers</h2></div>
      <div class="section-actions">
        <a href="/customer_template.csv" download class="btn btn-ghost btn-sm">📥 Download Template</a>
        <label class="btn btn-outline btn-sm" style="position:relative;">
          📁 Import CSV
          <input type="file" accept=".csv" onchange="importCustomerCSV(this)" style="position:absolute;inset:0;opacity:0;cursor:pointer;">
        </label>
        <button class="btn btn-primary btn-sm" onclick="openModal('customerModal')">+ Add Customer</button>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="search-bar" style="width: 300px;">
          <span class="search-icon">🔍</span>
          <input type="text" class="form-control" placeholder="Search customers..." oninput="filterCustomerTable(this.value)" id="customerSearch">
        </div>
        <span class="text-muted text-sm" id="customerCount"></span>
      </div>
      <div class="card-body" style="padding:0;">
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Customer ID</th>
                <th>Name</th>
                <th>Phone</th>
                <th>Address</th>
              </tr>
            </thead>
            <tbody id="customerTableBody"></tbody>
          </table>
        </div>
      </div>
      <div class="card-footer" style="padding: 12px 16px; border-top: 1px solid var(--neutral-200); display: flex; justify-content: space-between; align-items: center;">
        <span class="text-xs text-muted" id="paginationInfoCustomer">Page 1 of 1</span>
        <div class="pagination-controls" style="display: flex; gap: 8px;">
          <button class="btn btn-outline btn-xs" onclick="changeCustomerPage(customerPagination.page - 1)" id="prevPageCustomer">Previous</button>
          <button class="btn btn-outline btn-xs" onclick="changeCustomerPage(customerPagination.page + 1)" id="nextPageCustomer">Next</button>
        </div>
      </div>
    </div>

    <div style="margin-top: 20px;">
      <div class="card">
        <div class="card-header"><h4>CSV Import Format</h4></div>
        <div class="card-body">
          <p class="text-sm text-muted" style="margin-bottom: 8px;">Your CSV file should have these common headers:</p>
          <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px;">
            <span class="badge badge-neutral">CustomerID</span>
            <span class="badge badge-neutral">Customer Name</span>
            <span class="badge badge-neutral">Address</span>
            <span class="badge badge-neutral">Phone</span>
          </div>
          <p class="text-xs text-muted"><strong>Pro-tip:</strong> We also support headers like "Street Address", "Location", "Phone Number", and "Customer ID" automatically.</p>
        </div>
      </div>
    </div>
  `;

  await fetchCustomersData();
}

async function fetchCustomersData() {
  try {
    const query = document.getElementById('customerSearch')?.value || '';
    const res = await apiFetch(`/admin/customers?page=${customerPagination.page}&limit=${customerPagination.limit}&search=${encodeURIComponent(query)}`);
    const data = await res.json();
    customersData = data.customers;
    customerPagination.totalPages = data.totalPages;

    renderCustomerTable(customersData);
    updatePaginationUI('Customer', customerPagination);
  } catch (err) {
    showToast('Failed to load customers', 'error');
  }
}

function changeCustomerPage(newPage) {
  if (newPage < 1 || newPage > customerPagination.totalPages) return;
  loadCustomersPage(newPage);
}

function renderCustomerTable(customers) {
  const tbody = document.getElementById('customerTableBody');
  if (!tbody) return;
  document.getElementById('customerCount').textContent = `${customers.length} customers`;

  if (customers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4"><div class="empty-state"><div class="empty-icon">👥</div><h3>No customers</h3><p>Import a CSV or add customers manually</p></div></td></tr>';
    return;
  }

  tbody.innerHTML = customers.map(c => `
    <tr>
      <td><span class="font-medium">${c.customer_id_external || '—'}</span></td>
      <td><span class="font-semibold">${c.name}</span></td>
      <td>${c.phone}</td>
      <td>${c.address || '<span class="text-muted">—</span>'}</td>
    </tr>
  `).join('');
}

let customerSearchTimeout;
function filterCustomerTable(query) {
  clearTimeout(customerSearchTimeout);
  customerSearchTimeout = setTimeout(() => {
    customerPagination.page = 1;
    fetchCustomersData();
  }, 300);
}

async function saveCustomer() {
  const payload = {
    customer_id_external: document.getElementById('custId').value.trim(),
    name: document.getElementById('custName').value.trim(),
    phone: document.getElementById('custPhone').value.trim(),
    email: document.getElementById('custEmail').value.trim(),
    address: document.getElementById('custAddress').value.trim(),
    city: document.getElementById('custCity').value.trim()
  };

  if (!payload.name || !payload.phone) {
    showToast('Name and phone are required', 'error');
    return;
  }

  try {
    const res = await apiFetch('/admin/customers', { method: 'POST', body: JSON.stringify(payload) });
    const data = await res.json();

    if (data.success) {
      closeModal('customerModal');
      showToast('Customer added successfully', 'success');
      document.getElementById('customerForm').reset();
      loadCustomersPage(customerPagination.page);
    } else {
      showToast(data.error || 'Failed to add customer', 'error');
    }
  } catch (err) {
    showToast('Error saving customer', 'error');
  }
}

async function importCustomerCSV(input) {
  if (!input.files[0]) return;
  const formData = new FormData();
  formData.append('csvFile', input.files[0]);

  showLoading();
  try {
    const res = await fetch(API_BASE + '/admin/customers/import', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${getToken()}` },
      body: formData
    });
    const data = await res.json();
    hideLoading();

    if (data.success) {
      showToast(data.message, 'success');
      loadCustomersPage(1);
    } else {
      showToast(data.error || 'Import failed', 'error');
    }
  } catch (err) {
    hideLoading();
    showToast('Error importing CSV', 'error');
  }
  input.value = '';
}
