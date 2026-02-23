// ===== SUPER ADMIN DASHBOARD =====
async function loadSuperAdminDashboard() {
  const content = document.getElementById('contentArea');
  content.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 24px; padding: 12px 0;">
            <div style="text-align: center; padding: 60px 0;">
                <div class="spinner" style="margin: 0 auto; width: 40px; height: 40px; border-width: 3px; border-top-color: var(--primary-500);"></div>
                <p class="text-muted text-sm" style="margin-top: 16px; font-weight: 500;">Aggregating platform intelligence...</p>
            </div>
        </div>
    `;

  try {
    const res = await apiFetch('/auth/platform-stats');
    if (!res) return;
    const data = await res.json();
    const s = data.stats;

    content.innerHTML = `
      <div class="stats-grid fade-in-up" style="margin-bottom: 32px;">
        <div class="stat-card" style="border: 1px solid var(--neutral-200); background: #ffffff; border-radius: 12px; padding: 20px;">
          <div class="stat-value" style="font-size: 2rem; font-weight: 700; font-family: 'Inter', sans-serif;">${s.totalAdmins}</div>
          <div class="stat-label" style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600; font-family: 'Inter', sans-serif;">Total Entities</div>
        </div>
        <div class="stat-card" style="border: 1px solid var(--neutral-200); background: #ffffff; border-radius: 12px; padding: 20px;">
          <div class="stat-value" style="font-size: 2rem; font-weight: 700; font-family: 'Inter', sans-serif;">${s.activeAdmins}</div>
          <div class="stat-label" style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600; font-family: 'Inter', sans-serif;">Active Systems</div>
        </div>
        <div class="stat-card" style="border: 1px solid var(--neutral-200); background: #ffffff; border-radius: 12px; padding: 20px;">
          <div class="stat-value" style="font-size: 2rem; font-weight: 700; font-family: 'Inter', sans-serif;">${s.totalOrders}</div>
          <div class="stat-label" style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600; font-family: 'Inter', sans-serif;">Total Managed Orders</div>
        </div>
        <div class="stat-card" style="border: 1px solid var(--neutral-200); background: #ffffff; border-radius: 12px; padding: 20px;">
          <div class="stat-value" style="font-size: 2rem; font-weight: 700; font-family: 'Inter', sans-serif;">${s.totalCustomers}</div>
          <div class="stat-label" style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600; font-family: 'Inter', sans-serif;">Customer Base</div>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1.6fr 1fr; gap: 32px;">
        <div class="card fade-in-up" style="border: 1px solid var(--neutral-200); background: #ffffff; border-radius: 12px;">
          <div class="card-header" style="padding: 16px 24px; border-bottom: 1px solid var(--neutral-100); background: transparent; display: flex; align-items: center; justify-content: space-between;">
            <h3 style="font-weight: 700; color: var(--neutral-900); font-size: 1rem;">Company Performance</h3>
            <button class="btn btn-ghost btn-sm" onclick="showPage('manage-admins')" style="font-weight: 600; color: var(--primary-600);">View All</button>
          </div>
          <div class="card-body" style="padding:0;">
            <div class="table-container">
              <table style="border-spacing: 0;">
                <thead>
                  <tr style="background: var(--neutral-50);">
                    <th style="padding-left: 32px; font-family: 'Inter', sans-serif;">Company Entity</th>
                    <th style="text-align: center; font-family: 'Inter', sans-serif;">Order Volume</th>
                    <th style="text-align: right; padding-right: 32px; font-family: 'Inter', sans-serif;">Network Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${data.companyStats.length === 0 ? '<tr><td colspan="3" style="text-align:center;padding:48px;color:var(--text-muted); font-weight: 500;">No company activity recorded yet.</td></tr>' :
        data.companyStats.map(c => `
                    <tr style="background: transparent; box-shadow: none;">
                      <td style="padding: 20px 0 20px 32px;">
                        <div style="display:flex; align-items:center; gap:12px;">
                          <div style="width: 36px; height: 36px; background: var(--neutral-100); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-weight: 700; color: var(--neutral-700); font-size: 0.9rem;">
                             ${c.company_name[0].toUpperCase()}
                          </div>
                          <div style="display:flex; flex-direction:column;">
                            <span class="font-bold" style="color: var(--neutral-800);">${c.company_name}</span>
                            <span class="text-xs text-muted">Admin: ${c.name}</span>
                          </div>
                        </div>
                      </td>
                      <td style="text-align: center;"><span class="font-bold" style="font-size: 1.1rem; color: var(--neutral-900);">${c.order_count}</span></td>
                      <td style="text-align: right; padding-right: 32px;">
                         <span class="badge badge-${c.is_active ? 'success' : 'danger'}" style="padding: 6px 14px; font-weight: 700;">
                            ${c.is_active ? 'Online' : 'Disabled'}
                         </span>
                      </td>
                    </tr>
                  `).join('')
      }
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="card fade-in-up" style="border: 1px solid var(--neutral-200); background: #ffffff; border-radius: 12px;">
          <div class="card-header" style="padding: 16px 24px; border-bottom: 1px solid var(--neutral-100); background: transparent;">
            <h3 style="font-weight: 700; color: var(--neutral-900); font-size: 1rem;">Recent Activity</h3>
          </div>
          <div class="card-body" style="padding: 0;">
            <div class="table-container">
              <table style="width: 100%;">
                <thead>
                  <tr style="background: var(--neutral-50);">
                    <th style="padding-left: 24px; font-size: 0.75rem; text-transform: uppercase; font-family: 'Inter', sans-serif;">Transaction</th>
                    <th style="text-align: right; padding-right: 24px; font-size: 0.75rem; text-transform: uppercase; font-family: 'Inter', sans-serif;">Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${data.recentOrders.length === 0 ? '<tr><td colspan="2" style="text-align:center;padding:48px;color:var(--text-muted);">No activity recorded.</td></tr>' :
        data.recentOrders.map(o => `
                    <tr>
                      <td style="padding: 16px 24px;">
                        <div style="font-weight: 600; color: var(--neutral-800);">#${o.order_number}</div>
                        <div style="font-size: 0.75rem; color: var(--primary-600); font-weight: 600;">${o.company_name}</div>
                      </td>
                      <td style="text-align: right; padding-right: 24px;">
                        <span class="badge badge-${o.status === 'pending' ? 'warning' : o.status === 'completed' ? 'success' : 'neutral'}" style="font-size: 0.75rem; text-transform: capitalize;">
                            ${o.status}
                        </span>
                      </td>
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
    content.innerHTML = `<div class="empty-state" style="padding: 100px 0; text-align: center;"><h3 style="color: var(--danger-600);">Unable to load dashboard</h3><p class="text-muted">${err.message}</p></div>`;
  }
}
