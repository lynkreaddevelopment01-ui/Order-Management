// ===== CART =====
function updateQty(stockId, delta, maxQty) {
    const current = cart[stockId] || 0;
    const newQty = Math.max(0, current + delta);

    if (newQty === 0) {
        delete cart[stockId];
    } else {
        cart[stockId] = newQty;
    }

    // Update UI
    const qtyEl = document.getElementById(`qty-${stockId}`);
    if (qtyEl) qtyEl.textContent = newQty;

    updateSummaryBar();
}

function updateSummaryBar() {
    const entries = Object.entries(cart);
    const manualEntries = Object.entries(manualCart);
    const totalItems = entries.reduce((sum, [, qty]) => sum + qty, 0) +
        manualEntries.reduce((sum, [, qty]) => sum + qty, 0);

    const cartCountEl = document.getElementById('cartItemCount');
    const submitBtn = document.getElementById('submitOrderBtn');
    const bar = document.getElementById('orderSummaryBar');

    cartCountEl.textContent = `${totalItems} item${totalItems !== 1 ? 's' : ''}`;

    // Always visible as requested
    bar.classList.add('visible');

    if (totalItems > 0) {
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
        submitBtn.textContent = 'Place Order →';
    } else {
        submitBtn.disabled = true;
        submitBtn.style.opacity = '0.5';
        submitBtn.textContent = 'Add Items';
    }
}

// ===== SUBMIT ORDER =====
async function submitOrder() {
    const entries = Object.entries(cart);
    const manualEntries = Object.entries(manualCart);

    if (entries.length === 0 && manualEntries.length === 0) {
        showToast('Please add at least one item', 'warning');
        return;
    }

    const submitBtn = document.getElementById('submitOrderBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Placing Order...';

    const items = [
        ...entries.map(([stockId, quantity]) => ({
            stockId: parseInt(stockId),
            quantity
        })),
        ...manualEntries.map(([name, quantity]) => ({
            stockId: null,
            itemName: name,
            quantity
        }))
    ];

    try {
        const res = await fetch('/api/customer/order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uniqueCode, customerId, items, notes: "" })
        });
        const data = await res.json();

        if (data.success) {
            // Show success
            const overlay = document.getElementById('orderSuccessOverlay');
            overlay.style.display = 'flex';
            overlay.innerHTML = `
                <div class="order-success-overlay">
                  <div class="order-success-card">
                    <div class="success-icon">✅</div>
                    <h2>Order Placed Successfully!</h2>
                    <p class="text-muted">Your order has been submitted for processing.</p>
                    <div class="order-num">${data.orderNumber}</div>
                    <button class="btn btn-primary" onclick="resetOrder()">Place Another Order</button>
                  </div>
                </div>
            `;

            // Reset cart
            cart = {};
            manualCart = {};
            updateSummaryBar();
            loadStock(); // Refresh stock quantities immediately
        } else {
            showToast(data.error || 'Failed to place order', 'error');
        }
    } catch (err) {
        showToast('Network error. Please try again.', 'error');
    }

    submitBtn.disabled = false;
    submitBtn.textContent = 'Place Order →';
}

function resetOrder() {
    document.getElementById('orderSuccessOverlay').style.display = 'none';
    loadStock(); // Reload stock
}

// ===== ORDER HISTORY =====
let loadedOrders = [];

function openOrderDetails(orderNumber) {
    const order = loadedOrders.find(o => o.order_number === orderNumber);
    if (!order) return;

    document.getElementById('detailOrderNumber').textContent = order.order_number;
    document.getElementById('detailOrderDate').textContent = `Placed on ${new Date(order.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`;

    const list = document.getElementById('detailItemsList');
    const items = order.items || [];

    let totalPriceSum = 0;
    const hasPTR = items.some(it => parseFloat(it.dist_price) > 0);
    const hasPrice = items.some(it => parseFloat(it.unit_price) > 0);

    let gridLayout = `1.5fr 1fr 0.5fr`;
    if (hasPTR) gridLayout += ` 0.8fr`;
    if (hasPrice) gridLayout += ` 0.8fr`;

    let html = `
        <div class="history-table-header" style="display: grid; grid-template-columns: ${gridLayout}; gap: 8px; font-size: 0.6rem; padding: 12px 16px; background: #f1f5f9; position: sticky; top: 0; z-index: 2;">
            <span>ITEM</span>
            <span>OFFER</span>
            <span style="text-align:center;">QTY</span>
            ${hasPTR ? `<span style="text-align:right;">PTR RATE</span>` : ''}
            ${hasPrice ? `<span style="text-align:right;">PRICE</span>` : ''}
        </div>
    `;

    html += items.map(item => {
        const dp = parseFloat(item.dist_price) || 0;
        const up = parseFloat(item.unit_price) || 0;
        const rowTotal = up * item.quantity;
        totalPriceSum += rowTotal;

        return `
            <div style="border-bottom: 1px solid #f1f5f9; padding: 12px 0;">
                <div class="history-table-row" style="display: grid; grid-template-columns: ${gridLayout}; gap: 8px; padding: 0 16px; align-items: start; font-size: 0.78rem; border: none;">
                    <div style="font-weight: 600; color: #1e293b; line-height: 1.4; word-break: break-word;">${item.item_name}</div>
                    <div style="color: #64748b; line-height: 1.4;">${item.offer_skipped ? (item.missed_offer_text || 'Offer') : (item.applied_offer || '—')}</div>
                    <div style="text-align:center; font-weight: 700; font-size: 0.85rem; display: flex; align-items: center; justify-content: center; gap: 4px;">
                        <span>${item.quantity}</span>
                        ${item.bonus_quantity > 0 ? `<span style="font-size:0.6rem; color:#166534; background:#dcfce7; padding:1px 4px; border-radius:3px; border:1px solid #bbf7d0;">+${item.bonus_quantity} Free</span>` : ''}
                    </div>
                    ${hasPTR ? `<div style="text-align:right; color: #64748b;">${dp ? '₹' + dp.toFixed(2) : '—'}</div>` : ''}
                    ${hasPrice ? `<div style="text-align:right; font-weight: 700; color: #0f172a;">${up ? '₹' + up.toFixed(2) : '—'}</div>` : ''}
                </div>
                ${item.offer_skipped ? `
                    <div style="padding: 4px 16px 0 16px; font-size: 0.68rem; color: #dc2626; font-weight: 700; font-style: italic;">
                        (Low stock - offer not applied)
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');

    if (hasPrice) {
        html += `
            <div style="display: flex; justify-content: flex-end; padding: 12px 16px; background: #f8fafc; border-top: 1px solid #e2e8f0; gap: 24px;">
                <div style="text-align: right;">
                    <span style="font-size: 0.7rem; color: #94a3b8; text-transform: uppercase; font-weight: 700; display: block;">Grand Sum</span>
                    <span style="font-size: 1rem; font-weight: 800; color: #0f172a;">₹${totalPriceSum.toFixed(2)}</span>
                </div>
            </div>
        `;
    }

    list.innerHTML = html;

    const notesEl = document.getElementById('detailOrderNotes');
    let userNote = order.notes || '';
    const autoPattern = /Offer\s*\(.*?\)\s*for\s*".*?"\s*could\s*not\s*be\s*applied\s*due\s*to\s*low\s*stock\.\s*Team\s*will\s*contact\s*you\./gi;
    userNote = userNote.replace(autoPattern, '').split('\n').map(s => s.trim()).filter(Boolean).join('\n');

    if (userNote) {
        notesEl.style.display = 'block';
        notesEl.innerHTML = `
            <div style="margin-top: 12px; padding: 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px;">
                <span style="font-weight:700; color:#475569; display:block; margin-bottom:8px; font-size:0.65rem; text-transform:uppercase;">Customer Note</span>
                <div style="font-size: 0.85rem; color: #1e293b; line-height: 1.5; white-space: pre-line;">${userNote}</div>
            </div>
        `;
    } else {
        notesEl.style.display = 'none';
    }

    document.getElementById('orderDetailModal').classList.add('active');
}

async function showHistory() {
    try {
        const res = await fetch(`/api/customer/orders/${uniqueCode}/${customerId}`);
        const data = await res.json();
        loadedOrders = data.orders || [];

        const content = document.getElementById('historyContent');

        if (!data.orders || data.orders.length === 0) {
            content.innerHTML = '<div class="empty-state" style="padding:32px;"><div class="empty-icon">📋</div><h3>No orders yet</h3></div>';
        } else {
            const statusColors = { pending: 'warning', processing: 'primary', completed: 'success', cancelled: 'danger' };
            content.innerHTML = data.orders.map(o => {
                if (!o) return '';
                return `
                    <div class="history-item" style="padding: 20px 0; border-bottom: 1px solid #f1f5f9;">
                      <div class="history-item-main" style="padding: 0 20px;" onclick="openOrderDetails('${o.order_number}')">
                        <div>
                          <div class="font-semibold" style="color:#0f172a; font-size:1rem; letter-spacing:-0.01em;">${o.order_number || 'N/A'}</div>
                          <div class="text-xs" style="color:#64748b; margin-top:4px; font-weight:500;">${o.created_at ? new Date(o.created_at).toLocaleDateString([], { dateStyle: 'medium' }) : ''}</div>
                        </div>
                        <div style="text-align:right; margin-right: 32px;">
                          <span class="badge badge-${statusColors[o.status] || 'neutral'}" style="font-size:0.65rem; text-transform:uppercase; font-weight:700; padding:4px 10px; border-radius:30px;">${o.status || 'pending'}</span>
                        </div>
                      </div>
                    </div>
                `;
            }).join('');
        }

        document.getElementById('historyModal').classList.add('active');
    } catch (err) {
        showToast(`Failed to load history`, 'error');
    }
}
