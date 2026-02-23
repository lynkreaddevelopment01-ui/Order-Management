// ===== MANAGE ADMINS / COMPANIES (Super Admin Only) =====
let adminsData = [];
function getPortalUrl(username) {
  const host = window.location.host;
  const protocol = window.location.protocol;

  // Localhost support
  if (host.includes('localhost')) {
    return `${protocol}//${username.toLowerCase()}.localhost:3000/portal`;
  }

  // Railway shared domain support (e.g., myapp.up.railway.app)
  // Shared domains don't support sub-subdomains, so we pass vendor as a query param.
  if (host.includes('up.railway.app')) {
    return `${protocol}//${host}/portal?v=${username.toLowerCase()}`;
  }

  // Custom Domain support (e.g., yourdomain.com)
  const parts = host.split('.');
  const domain = parts.slice(-2).join('.');
  return `${protocol}//${username.toLowerCase()}.${domain}/portal`;
}

async function loadManageAdmins() {
  if (!isSuperAdmin()) { showPage('dashboard'); return; }

  const content = document.getElementById('contentArea');
  content.innerHTML = `
    <div class="card card-premium fade-in-up" style="border: 1px solid var(--neutral-200); background: #ffffff; border-radius: 12px;">
      <div class="card-header" style="border-bottom: 1px solid var(--neutral-100); padding: 16px 24px; display: flex; align-items: center; justify-content: space-between;">
        <div class="search-bar" style="width: 100%; max-width: 380px;">
          <input type="text" class="form-control" placeholder="Search companies..." oninput="filterAdminTable(this.value)" id="adminSearch" style="height: 40px; background: var(--neutral-50); border: 1px solid var(--neutral-200); border-radius: 6px; font-size: 0.9rem;">
        </div>
        <div style="display: flex; align-items: center; gap: 16px;">
          <div id="adminCount" class="badge badge-neutral" style="padding: 6px 12px; font-weight: 600; background: var(--neutral-100); color: var(--neutral-700); font-size: 0.75rem;"></div>
          <button class="btn btn-primary" onclick="openAdminModal()" style="height: 40px; padding: 0 20px; font-size: 0.85rem; font-weight: 600;">
            + Add Company
          </button>
        </div>
      </div>
      <div class="card-body" style="padding: 0;">
        <div class="table-container">
          <table style="width: 100%;">
            <thead>
              <tr style="background: transparent;">
                <th style="padding-left: 24px; font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); padding-top: 16px; padding-bottom: 16px; font-family: 'Inter', sans-serif;">Company</th>
                <th style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-family: 'Inter', sans-serif;">Admin</th>
                <th style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-family: 'Inter', sans-serif;">Credentials</th>
                <th style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-family: 'Inter', sans-serif;">Level</th>
                <th style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-family: 'Inter', sans-serif;">Status</th>
                <th style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-family: 'Inter', sans-serif;">Joined</th>
                <th style="text-align: right; padding-right: 24px; font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-family: 'Inter', sans-serif;">Actions</th>
              </tr>
            </thead>
            <tbody id="adminsTableBody"></tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  await fetchAdminsData();
}

async function fetchAdminsData() {
  try {
    const res = await apiFetch('/auth/admins');
    if (!res) return;
    const data = await res.json();
    adminsData = data.admins.filter(a => a.role !== 'superadmin');
    renderAdminsTable(adminsData);
  } catch (err) {
    showToast('Failed to load admins', 'error');
  }
}

function renderAdminsTable(admins) {
  const body = document.getElementById('adminsTableBody');
  const count = document.getElementById('adminCount');
  count.textContent = `${admins.length} Companies Managed`;

  if (admins.length === 0) {
    body.innerHTML = `<tr><td colspan="7" style="padding: 60px; text-align: center; color: var(--text-muted);">No companies found</td></tr>`;
    return;
  }

  body.innerHTML = admins.map(a => `
    <tr class="fade-in" style="border-top: 1px solid var(--neutral-100);">
      <td style="padding: 16px 24px;">
        <div style="font-weight: 700; color: var(--neutral-900); font-family: 'Inter', sans-serif;">${a.company_name}</div>
        <a href="${getPortalUrl(a.username)}" target="_blank" style="font-size: 0.72rem; color: var(--primary-500); font-weight: 500; display: flex; align-items: center; gap: 4px; margin-top: 4px;">
           <span>Launch Portal</span>
           <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
        </a>
      </td>
      <td>
        <div style="font-weight: 600; font-size: 0.9rem;">${a.name}</div>
      </td>
      <td>
         <div style="display:flex; flex-direction:column; gap:4px;">
           <div style="font-family: monospace; font-size: 0.8rem; color: var(--primary-700); background: var(--primary-50); padding: 2px 6px; border-radius: 4px; display: inline-block; width: fit-content;">
             ${a.username}
           </div>
           <div style="font-size: 0.65rem; color: var(--text-muted); font-family: monospace;">ID: ${a.unique_code}</div>
         </div>
      </td>
      <td>
        <span class="badge badge-neutral" style="font-size: 0.65rem; font-weight: 700;">ADMIN</span>
      </td>
      <td>
        <div style="display: flex; align-items: center; gap: 8px;">
          <div style="width: 8px; height: 8px; border-radius: 50%; background: var(--accent-500);"></div>
          <span style="font-size: 0.85rem; font-weight: 600;">Active</span>
        </div>
      </td>
      <td>
        <div style="font-size: 0.85rem; color: var(--text-muted);">${new Date(a.created_at || Date.now()).toLocaleDateString()}</div>
      </td>
      <td style="text-align: right; padding-right: 24px;">
        <div style="display: flex; gap: 8px; justify-content: flex-end;">
          <button class="btn btn-ghost btn-sm" onclick="viewAdmin('${a.id}')" title="Details">Details</button>
          <button class="btn btn-ghost btn-sm" style="color: var(--danger-600);" onclick="deleteAdmin('${a.id}')" title="Delete">Remove</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function filterAdminTable(query) {
  const q = query.toLowerCase();
  const filtered = adminsData.filter(a =>
    a.company_name.toLowerCase().includes(q) ||
    a.name.toLowerCase().includes(q) ||
    a.username.toLowerCase().includes(q)
  );
  renderAdminsTable(filtered);
}

function openAdminModal(id = null) {
  const modal = document.getElementById('adminModal');
  const title = document.getElementById('adminModalTitle');
  const form = document.getElementById('adminForm');
  const submitBtn = document.getElementById('adminSubmitBtn');

  form.reset();
  document.getElementById('adminId').value = '';
  document.getElementById('passwordGroup').style.display = 'block';
  document.getElementById('adminPassword').setAttribute('required', 'required');

  if (id) {
    const admin = adminsData.find(a => a.id == id);
    if (!admin) return;
    title.textContent = 'Edit Company Admin';
    submitBtn.textContent = 'Update Company';
    document.getElementById('adminId').value = admin.id;
    document.getElementById('adminCompanyName').value = admin.company_name;
    document.getElementById('adminName').value = admin.name;
    document.getElementById('adminUsername').value = admin.username;
    document.getElementById('passwordGroup').style.display = 'none';
    document.getElementById('adminPassword').removeAttribute('required');
  } else {
    title.textContent = 'Add New Company';
    submitBtn.textContent = 'Create Company';
  }

  modal.classList.add('active');
}

async function saveAdmin() {
  const id = document.getElementById('adminId').value;
  const company_name = document.getElementById('adminCompanyName').value;
  const name = document.getElementById('adminName').value;
  const username = document.getElementById('adminUsername').value;
  const password = document.getElementById('adminPassword').value;

  if (!company_name || !name || !username || (!id && !password)) {
    showToast('Please fill all required fields', 'warning');
    return;
  }

  showLoading();
  try {
    const url = id ? `/auth/admins/${id}` : '/auth/create-admin';
    const method = id ? 'PUT' : 'POST';
    const body = { company_name, name, username };
    if (password) body.password = password;

    const res = await apiFetch(url, {
      method,
      body: JSON.stringify(body)
    });

    if (res && res.ok) {
      showToast(id ? 'Company updated' : 'Company created successfully', 'success');
      closeModal('adminModal');
      await fetchAdminsData();
    } else {
      const data = await res.json();
      showToast(data.error || 'Operation failed', 'error');
    }
  } catch (err) {
    showToast('An error occurred', 'error');
  } finally {
    hideLoading();
  }
}

async function deleteAdmin(id) {
  if (!confirm('Are you sure you want to remove this company? This action cannot be undone.')) return;

  showLoading();
  try {
    const res = await apiFetch(`/auth/admins/${id}`, { method: 'DELETE' });
    if (res && res.ok) {
      showToast('Company removed', 'success');
      await fetchAdminsData();
    } else {
      showToast('Failed to remove company', 'error');
    }
  } catch (err) {
    showToast('An error occurred', 'error');
  } finally {
    hideLoading();
  }
}

async function viewAdmin(id) {
  const admin = adminsData.find(a => a.id == id);
  if (!admin) return;

  const content = document.getElementById('contentArea');
  content.innerHTML = `
    <div class="fade-in-up">
      <div style="margin-bottom: 24px; display: flex; align-items: center; gap: 16px;">
        <button class="btn btn-ghost" onclick="loadManageAdmins()">← Back</button>
        <h2 style="margin:0;">${admin.company_name}</h2>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 24px;">
        <div class="card" style="border: 1px solid var(--neutral-200); border-radius: 12px; padding: 24px;">
           <div style="margin-bottom: 20px;">
             <label style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; font-family: 'Inter', sans-serif;">Admin Name</label>
             <div style="font-size: 1.1rem; font-weight: 600; font-family: 'Inter', sans-serif;">${admin.name}</div>
           </div>
           <div style="margin-bottom: 20px;">
             <label style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; font-family: 'Inter', sans-serif;">Username</label>
             <div style="font-family: monospace; font-size: 1rem; color: var(--primary-600);">${admin.username}</div>
           </div>
           <div style="margin-bottom: 20px;">
             <label style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; font-family: 'Inter', sans-serif;">Portal Link</label>
             <a href="${getPortalUrl(admin.username)}" target="_blank" style="display: block; font-size: 0.9rem; color: var(--primary-600); text-decoration: underline; cursor: pointer; font-family: 'Inter', sans-serif;">
                ${getPortalUrl(admin.username)}
             </a>
           </div>
           <button class="btn btn-outline" style="width: 100%; font-family: 'Inter', sans-serif;" onclick="openAdminModal('${admin.id}')">Edit Company Admin</button>
        </div>

        <div class="card" style="border: 1px solid var(--neutral-200); border-radius: 12px; padding: 24px;">
           <h4 style="margin-top: 0; margin-bottom: 16px; font-family: 'Inter', sans-serif;">Company Activity</h4>
           <div style="padding: 40px; text-align: center; color: var(--text-muted); border: 1px dashed var(--neutral-200); border-radius: 8px;">
             Activity tracking for this company will appear here.
           </div>
        </div>
      </div>
    </div>
  `;
}
