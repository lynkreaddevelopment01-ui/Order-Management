// ===== STOCK PAGE =====
let stockData = [];
let stockPagination = { page: 1, limit: 10, totalPages: 1 };

async function loadStockPage(page = 1) {
  stockPagination.page = page;
  const content = document.getElementById('contentArea');
  content.innerHTML = `
    <div class="section-header">
      <div><h2>Stock Inventory</h2></div>
      <div class="section-actions">
        <a href="/stock_template.csv" download class="btn btn-ghost btn-sm">📥 Download Template</a>
        <label class="btn btn-outline btn-sm" style="position:relative;">
          📁 Import CSV
          <input type="file" accept=".csv" onchange="importStockCSV(this)" style="position:absolute;inset:0;opacity:0;cursor:pointer;">
        </label>
        <button class="btn btn-primary btn-sm" onclick="openStockModal()">+ Add Item</button>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="search-bar" style="width: 300px;">
          <span class="search-icon">🔍</span>
          <input type="text" class="form-control" placeholder="Search stock items..." oninput="filterStockTable(this.value)" id="stockSearch">
        </div>
        <span class="text-muted text-sm" id="stockCount"></span>
      </div>
      <div class="card-body" style="padding:0;">
        <div class="table-container">
          <table id="stockTable">
            <thead>
              <tr>
                <th>Code</th>
                <th>Item Name</th>
                <th>Category</th>
                <th>Unit</th>
                <th>Qty</th>
                <th>Dist.P</th>
                <th>MRP</th>
                <th>Offer</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="stockTableBody"></tbody>
          </table>
        </div>
      </div>
      <div class="card-footer" style="padding: 12px 16px; border-top: 1px solid var(--neutral-200); display: flex; justify-content: space-between; align-items: center;">
        <span class="text-xs text-muted" id="paginationInfoStock">Page 1 of 1</span>
        <div class="pagination-controls" style="display: flex; gap: 8px;">
          <button class="btn btn-outline btn-xs" id="prevPageStock" onclick="changeStockPage(stockPagination.page - 1)">Previous</button>
          <button class="btn btn-outline btn-xs" id="nextPageStock" onclick="changeStockPage(stockPagination.page + 1)">Next</button>
        </div>
      </div>
    </div>

      <div class="card">
        <div class="card-header"><h4>CSV Import Format</h4></div>
        <div class="card-body">
          <p class="text-sm text-muted" style="margin-bottom: 8px;">Your CSV file should have these columns (exactly as shown):</p>
          <code style="font-size: 0.82rem; background: var(--neutral-900); color: var(--accent-300); padding: 12px 16px; border-radius: var(--radius-sm); display: block; border-left: 4px solid var(--accent-500);">
            Product Name, Qty, Dist Price, MRP, Exclusive Offer
          </code>
          <p class="text-xs text-muted" style="margin-top: 8px;">Note: <strong>Product Name</strong> is required. <strong>Dist Price</strong> will be used as the base rate if 'Price' is missing.</p>
        </div>
      </div>
  `;

  await fetchStockData();
}

async function fetchStockData() {
  try {
    const query = document.getElementById('stockSearch')?.value || '';
    const res = await apiFetch(`/admin/stock?page=${stockPagination.page}&limit=${stockPagination.limit}&search=${encodeURIComponent(query)}`);
    const data = await res.json();
    stockData = data.stock;
    stockPagination.totalPages = data.totalPages;

    renderStockTable(stockData);
    updatePaginationUI('Stock', stockPagination);
  } catch (err) {
    showToast('Failed to load stock data', 'error');
  }
}

function changeStockPage(newPage) {
  if (newPage < 1 || newPage > stockPagination.totalPages) return;
  loadStockPage(newPage);
}

function renderStockTable(items) {
  const tbody = document.getElementById('stockTableBody');
  if (!tbody) return;
  document.getElementById('stockCount').textContent = `${items.length} items`;

  if (items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9"><div class="empty-state"><div class="empty-icon">📦</div><h3>No stock items</h3><p>Import a CSV or add items manually</p></div></td></tr>';
    return;
  }

  tbody.innerHTML = items.map(item => `
    <tr class="${item.has_offer ? 'has-offer' : ''}">
      <td><span class="font-medium">${item.item_code}</span></td>
      <td><span class="font-semibold">${item.item_name}</span></td>
      <td><span class="text-muted">${item.category || '—'}</span></td>
      <td>${item.unit}</td>
      <td><span class="${item.quantity <= 10 ? 'low-stock' : ''}">${item.quantity}</span></td>
      <td>${item.dist_price ? '₹' + parseFloat(item.dist_price).toFixed(2) : '—'}</td>
      <td>${item.mrp ? '₹' + parseFloat(item.mrp).toFixed(2) : '—'}</td>
      <td>${item.has_offer ? `<span class="badge badge-warning">🏷️ ${item.offer_text || 'Offer'}</span>` : '—'}</td>
      <td>
        <button class="btn btn-ghost btn-sm" onclick="editStock(${item.id}, '${item.item_code}', '${escapeHtml(item.item_name)}', '${escapeHtml(item.category || '')}', '${item.unit}', ${item.quantity}, ${item.price || 0}, ${item.dist_price || 0}, ${item.mrp || 0})">✏️</button>
        <button class="btn btn-ghost btn-sm" onclick="deleteStock(${item.id})" style="color: var(--danger-500);">🗑️</button>
      </td>
    </tr>
  `).join('');
}

let stockSearchTimeout;
function filterStockTable(query) {
  clearTimeout(stockSearchTimeout);
  stockSearchTimeout = setTimeout(() => {
    stockPagination.page = 1;
    fetchStockData();
  }, 300);
}

function openStockModal() {
  document.getElementById('stockId').value = '';
  document.getElementById('stockModalTitle').textContent = 'Add Stock Item';
  document.getElementById('stockItemCode').value = '';
  document.getElementById('stockItemCode').disabled = false;
  document.getElementById('stockItemName').value = '';
  document.getElementById('stockCategory').value = '';
  document.getElementById('stockUnit').value = 'Pcs';
  document.getElementById('stockQty').value = '';
  document.getElementById('stockPrice').value = '';
  document.getElementById('stockDistPrice').value = '';
  document.getElementById('stockMRP').value = '';
  openModal('stockModal');
}

function editStock(id, code, name, category, unit, qty, price, dist, mrp) {
  document.getElementById('stockId').value = id;
  document.getElementById('stockModalTitle').textContent = 'Edit Stock Item';
  document.getElementById('stockItemCode').value = code;
  document.getElementById('stockItemCode').disabled = true;
  document.getElementById('stockItemName').value = name;
  document.getElementById('stockCategory').value = category;
  document.getElementById('stockUnit').value = unit;
  document.getElementById('stockQty').value = qty;
  document.getElementById('stockPrice').value = price || '';
  document.getElementById('stockDistPrice').value = dist || '';
  document.getElementById('stockMRP').value = mrp || '';
  openModal('stockModal');
}

async function saveStock() {
  const id = document.getElementById('stockId').value;
  const payload = {
    item_code: document.getElementById('stockItemCode').value.trim(),
    item_name: document.getElementById('stockItemName').value.trim(),
    category: document.getElementById('stockCategory').value.trim(),
    unit: document.getElementById('stockUnit').value.trim(),
    quantity: parseInt(document.getElementById('stockQty').value) || 0,
    price: parseFloat(document.getElementById('stockPrice').value) || 0,
    dist_price: parseFloat(document.getElementById('stockDistPrice').value) || 0,
    mrp: parseFloat(document.getElementById('stockMRP').value) || 0
  };

  if (!payload.item_code || !payload.item_name) {
    showToast('Item code and name are required', 'error');
    return;
  }

  try {
    const url = id ? `/admin/stock/${id}` : '/admin/stock';
    const method = id ? 'PUT' : 'POST';
    const res = await apiFetch(url, { method, body: JSON.stringify(payload) });
    const data = await res.json();

    if (data.success) {
      closeModal('stockModal');
      showToast(id ? 'Stock item updated' : 'Stock item added', 'success');
      loadStockPage(stockPagination.page);
    } else {
      showToast(data.error || 'Failed to save', 'error');
    }
  } catch (err) {
    showToast('Error saving stock item', 'error');
  }
}

async function deleteStock(id) {
  if (!confirm('Are you sure you want to remove this stock item?')) return;
  try {
    const res = await apiFetch(`/admin/stock/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Stock item removed', 'success');
      loadStockPage(stockPagination.page);
    }
  } catch (err) {
    showToast('Error deleting stock item', 'error');
  }
}

async function importStockCSV(input) {
  if (!input.files[0]) return;
  const formData = new FormData();
  formData.append('csvFile', input.files[0]);

  showLoading();
  try {
    const res = await fetch(API_BASE + '/admin/stock/import', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${getToken()}` },
      body: formData
    });
    const data = await res.json();
    hideLoading();

    if (data.success) {
      showToast(data.message, 'success');
      loadStockPage(1);
    } else {
      showToast(data.error || 'Import failed', 'error');
    }
  } catch (err) {
    hideLoading();
    showToast('Error importing CSV', 'error');
  }
  input.value = '';
}
