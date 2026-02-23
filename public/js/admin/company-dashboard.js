// ===== ADMIN COMPANY DASHBOARD =====
async function loadAdminDashboard() {
  const content = document.getElementById('contentArea');
  content.innerHTML = '<div style="text-align:center;padding:40px;"><div class="spinner" style="margin:0 auto;"></div></div>';

  try {
    const res = await apiFetch('/admin/dashboard');
    const data = await res.json();
    const s = data.stats;

    content.innerHTML = `
      <div class="stats-grid fade-in-up">
        <div class="stat-card blue">
          <div class="stat-icon">📦</div>
          <div class="stat-value">${s.totalStock}</div>
          <div class="stat-label">Stock Items</div>
        </div>
        <div class="stat-card green">
          <div class="stat-icon">👥</div>
          <div class="stat-value">${s.totalCustomers}</div>
          <div class="stat-label">Customers</div>
        </div>
        <div class="stat-card orange">
          <div class="stat-icon">📋</div>
          <div class="stat-value">${s.totalOrders}</div>
          <div class="stat-label">Total Orders</div>
        </div>
        <div class="stat-card purple">
          <div class="stat-icon">⏳</div>
          <div class="stat-value">${s.pendingOrders}</div>
          <div class="stat-label">Pending Orders</div>
        </div>
        <div class="stat-card green">
          <div class="stat-icon">📅</div>
          <div class="stat-value">${s.todayOrders}</div>
          <div class="stat-label">Today's Orders</div>
        </div>
        <div class="stat-card blue">
          <div class="stat-icon">💰</div>
          <div class="stat-value">₹${s.totalRevenue.toLocaleString()}</div>
          <div class="stat-label">Total Revenue</div>
        </div>
      </div>

      <div class="card fade-in-up" style="margin-bottom: 24px; background: var(--primary-50); border: 1px solid var(--primary-100);">
        <div class="card-body" style="padding: 16px 20px; display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="font-size: 1.5rem;">🔗</div>
            <div>
              <div class="font-semibold" style="color: var(--primary-700);">Your Company Order Portal</div>
              <div class="text-sm text-muted">Share this link with your customers to take orders</div>
            </div>
          </div>
          <div style="display: flex; gap: 8px; align-items: center;">
            <code id="portalUrl" style="background: white; padding: 6px 12px; border-radius: 4px; border: 1px solid var(--primary-200); font-size: 0.9rem;">${window.location.origin}/portal-customer</code>
            <button class="btn btn-primary btn-sm" onclick="copyPortalUrl()">Copy Link</button>
          </div>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
        <div class="card fade-in-up">
          <div class="card-header">
            <h3>Recent Orders</h3>
            <button class="btn btn-ghost btn-sm" onclick="showPage('orders')">View All</button>
          </div>
          <div class="card-body" style="padding: 0;">
            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Order #</th>
                    <th>Cust ID</th>
                    <th>Customer</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${data.recentOrders.length === 0 ? '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted);">No orders yet</td></tr>' :
        data.recentOrders.map(o => `
                      <tr>
                        <td><span class="font-semibold">${o.order_number}</span></td>
                        <td><span class="text-muted">${o.customer_id_external || '—'}</span></td>
                        <td>${o.customer_name}</td>
                        <td><span class="badge badge-${o.status === 'pending' ? 'warning' : o.status === 'completed' ? 'success' : 'neutral'}">${o.status}</span></td>
                      </tr>
                    `).join('')
      }
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="card fade-in-up">
          <div class="card-header">
            <h3>Low Stock Alert</h3>
            <span class="badge badge-danger">${data.lowStockItems.length} items</span>
          </div>
          <div class="card-body" style="padding: 0;">
            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Code</th>
                    <th>Quantity</th>
                  </tr>
                </thead>
                <tbody>
                  ${data.lowStockItems.length === 0 ? '<tr><td colspan="3" style="text-align:center;padding:24px;color:var(--text-muted);">All items well stocked!</td></tr>' :
        data.lowStockItems.map(item => `
                      <tr>
                        <td>${item.item_name}</td>
                        <td><span class="text-muted">${item.item_code}</span></td>
                        <td><span class="low-stock">${item.quantity}</span></td>
                      </tr>
                    `).join('')
      }
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    content.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Error loading dashboard</h3><p>${err.message}</p></div>`;
  }
}

function copyPortalUrl() {
  const text = document.getElementById('portalUrl').textContent;
  navigator.clipboard.writeText(text).then(() => showToast('Portal link copied!', 'success'));
}
