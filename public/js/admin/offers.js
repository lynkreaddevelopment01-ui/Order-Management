// ===== OFFERS PAGE =====
let offersPagination = { page: 1, limit: 10, totalPages: 1 };

async function loadOffersPage(page = 1) {
  offersPagination.page = page;
  const content = document.getElementById('contentArea');
  content.innerHTML = `
    <div class="section-header">
      <div><h2>Special Executive Offers</h2></div>
      <div class="section-actions">
        <button class="btn btn-primary btn-sm" onclick="openOfferModal()">+ Create Offer</button>
      </div>
    </div>

    <div class="card">
      <div class="card-body" style="padding:0;">
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Item Code</th>
                <th>Offer Text</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="offersTableBody"></tbody>
          </table>
        </div>
      </div>
      <div class="card-footer" style="padding: 12px 16px; border-top: 1px solid var(--neutral-200); display: flex; justify-content: space-between; align-items: center;">
        <span class="text-xs text-muted" id="paginationInfoOffer">Page 1 of 1</span>
        <div class="pagination-controls" style="display: flex; gap: 8px;">
          <button class="btn btn-outline btn-xs" onclick="changeOffersPage(offersPagination.page - 1)" id="prevPageOffer">Previous</button>
          <button class="btn btn-outline btn-xs" onclick="changeOffersPage(offersPagination.page + 1)" id="nextPageOffer">Next</button>
        </div>
      </div>
    </div>
  `;

  await fetchOffersData();
}

async function fetchOffersData() {
  try {
    const res = await apiFetch(`/admin/offers?page=${offersPagination.page}&limit=${offersPagination.limit}`);
    const data = await res.json();
    const tbody = document.getElementById('offersTableBody');
    if (!tbody) return;

    offersPagination.totalPages = data.totalPages;

    if (data.offers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4"><div class="empty-state"><div class="empty-icon">🏷️</div><h3>No active offers</h3><p>Create special executive offers for your customers</p></div></td></tr>';
    } else {
      tbody.innerHTML = data.offers.map(o => `
        <tr class="has-offer">
          <td class="font-semibold">${o.item_name}</td>
          <td class="text-muted">${o.item_code}</td>
          <td><span class="badge badge-warning">${o.offer_text}</span></td>
          <td><button class="btn btn-ghost btn-sm" onclick="deleteOffer(${o.id})" style="color:var(--danger-500);">🗑️</button></td>
        </tr>
      `).join('');
    }

    updatePaginationUI('Offer', offersPagination);
  } catch (err) {
    showToast('Failed to load offers', 'error');
  }
}

function changeOffersPage(newPage) {
  if (newPage < 1 || newPage > offersPagination.totalPages) return;
  loadOffersPage(newPage);
}

async function openOfferModal() {
  try {
    const res = await apiFetch('/admin/stock?limit=1000'); // Load many for selection
    const data = await res.json();
    const select = document.getElementById('offerStockId');
    select.innerHTML = '<option value="">Choose an item...</option>' +
      data.stock.map(s => `<option value="${s.id}">${s.item_name} (${s.item_code})</option>`).join('');
  } catch (err) {
    showToast('Failed to load stock items', 'error');
  }
  document.getElementById('offerForm').reset();
  openModal('offerModal');
}

async function saveOffer() {
  const payload = {
    stock_id: parseInt(document.getElementById('offerStockId').value),
    offer_text: document.getElementById('offerText').value.trim()
  };

  if (!payload.stock_id || !payload.offer_text) {
    showToast('Please select an item and enter offer text', 'error');
    return;
  }

  try {
    const res = await apiFetch('/admin/offers', { method: 'POST', body: JSON.stringify(payload) });
    const data = await res.json();
    if (data.success) {
      closeModal('offerModal');
      showToast('Offer created successfully', 'success');
      loadOffersPage(1);
    } else {
      showToast(data.error || 'Failed to create offer', 'error');
    }
  } catch (err) {
    showToast('Error creating offer', 'error');
  }
}

async function deleteOffer(id) {
  if (!confirm('Remove this offer?')) return;
  try {
    const res = await apiFetch(`/admin/offers/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Offer removed', 'success');
      loadOffersPage(offersPagination.page);
    }
  } catch (err) {
    showToast('Error removing offer', 'error');
  }
}
