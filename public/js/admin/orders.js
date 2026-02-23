// ===== ORDERS PAGE =====
let ordersData = [];
let ordersPagination = { page: 1, limit: 10, totalPages: 1 };

async function loadOrdersPage(page = 1) {
  ordersPagination.page = page;
  const content = document.getElementById('contentArea');
  content.innerHTML = `
    <div class="section-header">
      <div><h2>All Orders</h2></div>
      <div class="section-actions">
        <!-- Reports removed as requested -->
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="filter-bar" style="margin-bottom:0;">
          <div class="search-bar" style="width: 250px;">
            <span class="search-icon">🔍</span>
            <input type="text" class="form-control" placeholder="Search orders..." oninput="filterOrdersTable(this.value)" id="orderSearch">
          </div>
          <select class="form-control" id="orderStatusFilter" onchange="filterOrdersByStatus(this.value)" style="width:150px;">
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <span class="text-muted text-sm" id="orderCount"></span>
      </div>
      <div class="card-body" style="padding:0;">
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Order #</th>
                <th>Cust ID</th>
                <th>Customer</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="ordersTableBody"></tbody>
          </table>
        </div>
      </div>
      <div class="card-footer" style="padding: 12px 16px; border-top: 1px solid var(--neutral-200); display: flex; justify-content: space-between; align-items: center;">
        <span class="text-xs text-muted" id="paginationInfoOrder">Page 1 of 1</span>
        <div class="pagination-controls" style="display: flex; gap: 8px;">
          <button class="btn btn-outline btn-xs" onclick="changeOrdersPage(ordersPagination.page - 1)" id="prevPageOrder">Previous</button>
          <button class="btn btn-outline btn-xs" onclick="changeOrdersPage(ordersPagination.page + 1)" id="nextPageOrder">Next</button>
        </div>
      </div>
    </div>
  `;

  await fetchOrdersData();
}

async function fetchOrdersData() {
  try {
    const search = document.getElementById('orderSearch')?.value || '';
    const status = document.getElementById('orderStatusFilter')?.value || '';

    const res = await apiFetch(`/admin/orders?page=${ordersPagination.page}&limit=${ordersPagination.limit}&search=${encodeURIComponent(search)}&status=${status}`);
    const data = await res.json();
    ordersData = data.orders;
    ordersPagination.totalPages = data.totalPages;

    renderOrdersTable(ordersData);
    updatePaginationUI('Order', ordersPagination);
  } catch (err) {
    showToast('Failed to load orders', 'error');
  }
}

function changeOrdersPage(newPage) {
  if (newPage < 1 || newPage > ordersPagination.totalPages) return;
  loadOrdersPage(newPage);
}

function renderOrdersTable(orders) {
  const tbody = document.getElementById('ordersTableBody');
  if (!tbody) return;
  document.getElementById('orderCount').textContent = `${orders.length} orders`;

  if (orders.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">📋</div><h3>No orders</h3><p>Orders will appear here when customers place them</p></div></td></tr>';
    return;
  }

  const statusColors = { pending: 'warning', processing: 'primary', completed: 'success', cancelled: 'danger' };

  tbody.innerHTML = orders.map(o => `
    <tr>
      <td><span class="font-semibold">${o.order_number}</span></td>
      <td><span class="font-medium">${o.customer_id_external || '—'}</span></td>
      <td>${o.customer_name}</td>
      <td>${o.customer_phone}</td>
      <td><span class="badge badge-${statusColors[o.status] || 'neutral'}">${o.status}</span></td>
      <td><span class="text-sm text-muted">${new Date(o.created_at).toLocaleString()}</span></td>
      <td>
        <button class="btn btn-ghost btn-sm" onclick="viewOrder(${o.id})" title="View Details">👁️</button>
        <button class="btn btn-ghost btn-sm" onclick="downloadOrderPDF(${o.id})" title="Download PDF">📄</button>
        <button class="btn btn-ghost btn-sm" onclick="downloadOrderExcel(${o.id})" title="Download Excel">📊</button>
      </td>
    </tr>
  `).join('');
}

let orderSearchTimeout;
function filterOrdersTable(query) {
  clearTimeout(orderSearchTimeout);
  orderSearchTimeout = setTimeout(() => {
    ordersPagination.page = 1;
    fetchOrdersData();
  }, 300);
}

function filterOrdersByStatus(status) {
  ordersPagination.page = 1;
  fetchOrdersData();
}

async function viewOrder(id) {
  try {
    const res = await apiFetch(`/admin/orders/${id}`);
    const data = await res.json();
    const o = data.order;
    const items = data.items;

    document.getElementById('orderDetailTitle').textContent = `Order ${o.order_number}`;
    document.getElementById('orderDetailContent').innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
        <div>
          <div class="text-sm text-muted" style="margin-bottom:2px;">Customer ID</div>
          <div class="font-semibold">${o.customer_id_external || '—'}</div>
        </div>
        <div>
          <div class="text-sm text-muted" style="margin-bottom:2px;">Customer Name</div>
          <div class="font-semibold">${o.customer_name}</div>
        </div>
        <div>
          <div class="text-sm text-muted" style="margin-bottom:2px;">Phone</div>
          <div>${o.customer_phone}</div>
        </div>
        <div>
          <div class="text-sm text-muted" style="margin-bottom:2px;">Date</div>
          <div class="text-sm">${new Date(o.created_at).toLocaleString()}</div>
        </div>
        <div>
          <div class="text-sm text-muted" style="margin-bottom:2px;">Status</div>
          <select class="form-control" onchange="updateOrderStatus(${o.id}, this.value)" style="padding:6px 10px;">
            <option value="pending" ${o.status === 'pending' ? 'selected' : ''}>Pending</option>
            <option value="processing" ${o.status === 'processing' ? 'selected' : ''}>Processing</option>
            <option value="completed" ${o.status === 'completed' ? 'selected' : ''}>Completed</option>
            <option value="cancelled" ${o.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
          </select>
        </div>
      </div>

      ${o.customer_address ? `<div class="text-sm" style="margin-bottom:16px;"><span class="text-muted">Address:</span> ${o.customer_address}${o.customer_city ? ', ' + o.customer_city : ''}</div>` : ''}

      <div id="financialSummary" style="margin-bottom:12px;"></div>
      <div class="table-container" style="border:1px solid var(--neutral-200);border-radius:var(--radius-md);">
        <table style="width:100%; border-collapse: collapse;">
          <thead style="background: var(--neutral-50);">
            <tr>
              <th style="padding: 10px 8px; text-align: left;">Item</th>
              ${items.some(it => it.applied_offer || it.offer_skipped) ? '<th style="padding: 10px 8px; text-align: left;">Offer</th>' : ''}
              <th style="padding: 10px 8px; text-align: left;">Qty</th>
              ${items.some(it => parseFloat(it.dist_price) > 0) ? '<th style="padding: 10px 8px; text-align: left;">PTR rate</th>' : ''}
              ${items.some(it => parseFloat(it.mrp) > 0) ? '<th style="padding: 10px 8px; text-align: left;">MRP</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${items.map(it => {
      const hasOfferCol = items.some(i => i.applied_offer || i.offer_skipped);
      const hasPTRCol = items.some(i => parseFloat(i.dist_price) > 0);
      const hasMRPCol = items.some(i => parseFloat(i.mrp) > 0);

      return `
                <tr style="border-bottom: 1px solid var(--neutral-100);">
                  <td style="padding: 12px 8px;">
                    <div style="font-weight:600; line-height:1.4; word-break:break-word;">${it.item_name}</div>
                    ${it.offer_skipped ? `<div style="font-size:0.65rem; color:#dc2626; font-weight:700; margin-top:4px; font-style:italic;">(Low stock - offer not applied)</div>` : ''}
                  </td>
                  ${hasOfferCol ? `<td style="padding: 12px 8px;">${it.offer_skipped ? (it.missed_offer_text || 'Offer') : (it.applied_offer || '—')}</td>` : ''}
                  <td style="padding: 12px 8px;">
                    <div style="font-weight:700; display: flex; align-items: center; gap: 6px;">
                        <span>${it.quantity}</span>
                        ${it.bonus_quantity > 0 ? `<span style="font-size:0.65rem; color:#15803d; background:#dcfce7; padding:2px 6px; border-radius:4px; border:1px solid #bbf7d0;">+${it.bonus_quantity} Free</span>` : ''}
                    </div>
                  </td>
                  ${hasPTRCol ? `<td style="padding: 12px 8px;">${parseFloat(it.dist_price) > 0 ? '₹' + parseFloat(it.dist_price).toFixed(2) : '—'}</td>` : ''}
                  ${hasMRPCol ? `<td style="padding: 12px 8px;">${parseFloat(it.mrp) > 0 ? '₹' + parseFloat(it.mrp).toFixed(2) : '—'}</td>` : ''}
                </tr>
                `;
    }).join('')}
          </tbody>
        </table>
      </div>
    `;

    // Calculate totals for the summary
    let sumDist = 0, sumMRP = 0;
    items.forEach(it => {
      sumDist += (parseFloat(it.dist_price || 0) * it.quantity);
      sumMRP += (parseFloat(it.mrp || 0) * it.quantity);
    });

    if (sumDist > 0 || sumMRP > 0) {
      document.getElementById('financialSummary').innerHTML = `
            <div style="padding:10px; background:#f0f9ff; border:1px solid #bae6fd; border-radius:6px; display:flex; gap:20px;">
                ${sumDist > 0 ? `<div><div style="font-size:0.7rem; color:#64748b;">Total PTR value</div><div style="font-weight:700;">₹${sumDist.toFixed(2)}</div></div>` : ''}
                ${sumMRP > 0 ? `<div><div style="font-size:0.7rem; color:#64748b;">Total MRP</div><div style="font-weight:700;">₹${sumMRP.toFixed(2)}</div></div>` : ''}
            </div>
        `;
    }

    document.getElementById('orderDetailFooter').innerHTML = `
      <button class="btn btn-outline btn-sm" onclick="downloadOrderPDF(${o.id})">📄 PDF</button>
      <button class="btn btn-outline btn-sm" onclick="downloadOrderExcel(${o.id})">📊 Excel</button>
      <button class="btn btn-ghost btn-sm" onclick="closeModal('orderDetailModal')">Close</button>
    `;

    openModal('orderDetailModal');
  } catch (err) {
    showToast('Failed to load order details', 'error');
  }
}

async function updateOrderStatus(id, status) {
  try {
    await apiFetch(`/admin/orders/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
    showToast('Order status updated', 'success');
    fetchOrdersData();
  } catch (err) {
    showToast('Failed to update status', 'error');
  }
}
