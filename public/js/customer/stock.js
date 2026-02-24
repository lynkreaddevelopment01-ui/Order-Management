// ===== LOAD STOCK =====
async function loadStock(page = 1, append = false) {
    if (customerPagination.loading) return;
    customerPagination.loading = true;
    customerPagination.page = page;

    const area = document.getElementById('stockListArea');

    // If searching, use paginated flat list
    if (customerPagination.search) {
        if (!append) area.innerHTML = '<div style="text-align:center; padding:40px;"><div class="spinner"></div></div>';
        try {
            const search = customerPagination.search;
            const url = `/api/customer/stock/${uniqueCode}?page=${page}&limit=${customerPagination.limit}&search=${encodeURIComponent(search)}`;
            const res = await fetch(url);
            const data = await res.json();
            customerPagination.totalPages = data.totalPages;

            if (append) {
                stockItems = [...stockItems, ...data.stock];
            } else {
                stockItems = data.stock;
                area.innerHTML = '';
            }
            renderFlatStockList(stockItems);
            renderLoadMore();
        } catch (err) {
            showToast('Search failed', 'error');
        } finally {
            customerPagination.loading = false;
        }
        return;
    }

    // Normal view: Lazy Accordion mode
    if (!append) {
        area.innerHTML = '<div style="text-align:center; padding:40px;"><div class="spinner"></div></div>';
    }

    try {
        // Fetch JUST manufacturers
        const res = await fetch(`/api/customer/manufacturers/${uniqueCode}`);
        const data = await res.json();
        renderManufacturerAccordions(data.manufacturers);
    } catch (err) {
        showToast('Failed to load manufacturers', 'error');
        area.innerHTML = '<p style="text-align:center; padding:40px; color:var(--danger-500);">Error loading manufacturers.</p>';
    } finally {
        customerPagination.loading = false;
    }
}

function renderManufacturerAccordions(manufacturers) {
    const area = document.getElementById('stockListArea');

    // Clear manual request inputs but keep the manual cart area
    document.getElementById('manualRequestsArea').innerHTML = '';

    if (!manufacturers || manufacturers.length === 0) {
        area.innerHTML = '<div class="empty-state"><h3>No items available</h3></div>';
        renderManualCartItems();
        return;
    }

    let html = '';
    manufacturers.forEach((mfr, index) => {
        const groupId = `group-${index}`;
        const isSpecial = mfr.includes('Special Offers');
        html += `
            <div class="order-manufacturer-header ${isSpecial ? 'special-offers-header' : ''}" 
                 onclick="toggleAccordion('${groupId}', '${encodeURIComponent(mfr)}')" id="header-${groupId}">
                <span>${mfr}</span>
                <span class="accordion-icon">▼</span>
            </div>
            <div class="accordion-content" id="${groupId}">
                <div style="text-align:center; padding:20px;"><div class="spinner-sm"></div></div>
            </div>
        `;
    });

    area.innerHTML = html;
    renderManualCartItems();
}

async function toggleAccordion(groupId, mfrNameEncoded, forceOpen = false) {
    const content = document.getElementById(groupId);
    const header = document.getElementById(`header-${groupId}`);
    if (!content || !header) return;

    const isOpening = forceOpen || !content.classList.contains('show');

    if (isOpening) {
        content.classList.add('show');
        header.classList.add('active');

        // Lazy load products if needed
        if (content.getAttribute('data-loaded') !== 'true' && mfrNameEncoded) {
            content.innerHTML = '<div style="text-align:center; padding:20px;"><div class="spinner-sm"></div></div>';
            try {
                const res = await fetch(`/api/customer/stock-by-manufacturer/${uniqueCode}?manufacturer=${mfrNameEncoded}`);
                const data = await res.json();
                renderProductsIntoAccordion(content, data.stock);
                content.setAttribute('data-loaded', 'true');
            } catch (err) {
                content.innerHTML = '<p style="padding:10px; color:red; font-size:0.8rem;">Failed to load items.</p>';
            }
        }
    } else {
        content.classList.remove('show');
        header.classList.remove('active');
    }
}

function renderProductsIntoAccordion(container, items) {
    if (!items || items.length === 0) {
        container.innerHTML = '<p style="padding:20px; color:var(--text-muted); text-align:center;">No items available.</p>';
        return;
    }

    container.innerHTML = items.map(item => renderItemHtml(item)).join('');
}

function renderItemHtml(item) {
    const qtyInCart = cart[item.id] || 0;
    const isOutOfStock = item.quantity <= 0;
    const isLowStock = !isOutOfStock && item.quantity <= 10;

    return `
        <div class="stock-item ${isOutOfStock ? 'out-of-stock-item' : ''}" id="item-${item.id}">
            <div class="item-info">
                <div class="item-name">${item.item_name}</div>
                <div class="item-meta">
                    ${item.item_code} | ${item.unit} | 
                    <span style="font-weight: 700; color: ${isOutOfStock ? '#ef4444' : (isLowStock ? '#f59e0b' : '#10b981')}">
                        ${isOutOfStock ? '🚫 Out of Stock' : `✅ Available: ${item.quantity}`}
                    </span>
                    ${item.has_offer ? `<span class="badge badge-warning" style="margin-left:8px;">🏷️ ${item.offer_text}</span>` : ''}
                    ${isLowStock ? `<span style="margin-left:8px; color:#9a3412; font-weight:800; font-size:0.6rem; text-transform:uppercase; background:#ffedd5; padding:2px 8px; border-radius:100px; border:1px solid #fed7aa; display:inline-flex; align-items:center; gap:3px;">⚠️ Low Stock</span>` : ''}
                </div>
            </div>
            <div class="qty-controls">
                <button class="qty-btn" onclick="updateQty(${item.id}, -1, ${item.quantity})">−</button>
                <div class="qty-value" id="qty-${item.id}">${qtyInCart}</div>
                <button class="qty-btn" onclick="updateQty(${item.id}, 1, ${item.quantity})">+</button>
            </div>
        </div>
    `;
}

function renderFlatStockList(items) {
    const area = document.getElementById('stockListArea');
    const searchVal = customerPagination.search;

    // Clear manual lists from search results
    document.getElementById('manualRequestsArea').innerHTML = '';

    if (items.length === 0) {
        let emptyHtml = `
          <div class="empty-state">
            <div class="empty-icon">🔍</div>
            <h3>No matching items</h3>
            <p>We couldn't find "${searchVal}" in our stock list.</p>
          </div>
        `;

        area.innerHTML = emptyHtml;
        if (searchVal) {
            renderManualRequestInResults(searchVal);
        }
        renderManualCartItems();
        return;
    }

    const available = items.filter(i => i.quantity > 0);
    const outOfStock = items.filter(i => i.quantity <= 0);

    let html = '';

    if (available.length > 0) {
        html += available.map(item => renderItemHtml(item)).join('');
    }

    if (outOfStock.length > 0) {
        html += `
            <div style="padding: 24px 16px 12px; font-size: 0.7rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; display: flex; align-items: center; gap: 12px;">
                <span style="flex-shrink: 0;">Currently Out of Stock</span>
                <div style="height: 1px; background: #e2e8f0; flex-grow: 1;"></div>
            </div>
        `;
        html += outOfStock.map(item => renderItemHtml(item)).join('');
    }

    area.innerHTML = html;

    // Add manual option at the bottom if searching
    if (searchVal) {
        renderManualRequestInResults(searchVal);
    }

    renderManualCartItems();
}

function renderManualRequestInResults(val) {
    const container = document.getElementById('manualRequestsArea');
    const safeVal = val.replace(/'/g, "\\'");
    container.innerHTML = `
        <div style="padding: 24px 16px 12px; font-size: 0.7rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; display: flex; align-items: center; gap: 12px;">
            <span style="flex-shrink: 0;">Not found in list?</span>
            <div style="height: 1px; background: #e2e8f0; flex-grow: 1;"></div>
        </div>
        <div class="stock-item" style="background: var(--primary-50); border: 1px dashed var(--primary-200); margin-top:0;">
            <div class="item-info">
                <div class="item-name" style="color: var(--primary-700);">Order Special: "${val}"</div>
                <div class="item-meta" style="font-size: 0.75rem;">Request this item manually 🛍️</div>
            </div>
            <button class="btn btn-primary btn-sm" onclick="addManualItem('${safeVal}')" style="padding: 10px 20px; font-size: 0.8rem; border-radius:10px;">
                Add to Order
            </button>
        </div>
    `;
}

function addManualItem(name) {
    if (!name) return;
    manualCart[name] = (manualCart[name] || 0) + 1;
    showToast(`Added "${name}" to requests`, 'success');
    updateSummaryBar();
    renderManualCartItems();
}

function updateManualQty(name, delta) {
    const current = manualCart[name] || 0;
    const newQty = Math.max(0, current + delta);
    if (newQty === 0) {
        delete manualCart[name];
    } else {
        manualCart[name] = newQty;
    }
    updateSummaryBar();
    renderManualCartItems();
}

function renderManualCartItems() {
    const entries = Object.entries(manualCart);
    let container = document.getElementById('manualItemsCartList');
    if (!container) {
        container = document.createElement('div');
        container.id = 'manualItemsCartList';
        document.getElementById('manualRequestsArea').appendChild(container);
    }

    if (entries.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = `
        <div style="padding: 24px 16px 8px; font-size: 0.75rem; font-weight: 800; color: var(--accent-600); text-transform: uppercase; letter-spacing: 0.1em; display:flex; align-items:center; gap:12px;">
            <span>Custom Item Requests</span>
            <div style="height: 2px; background: var(--accent-100); flex-grow: 1;"></div>
        </div>
        ${entries.map(([name, qty]) => {
        const safeName = name.replace(/'/g, "\\'");
        return `
            <div class="stock-item" style="border-left: 4px solid var(--accent-400); background: #fffdf5; border-radius:12px; margin-bottom:12px; border:1px solid var(--accent-100); border-left:4px solid var(--accent-400);">
                <div class="item-info">
                    <div class="item-name" style="font-weight:700;">${name}</div>
                    <div class="item-meta" style="color:var(--accent-700); font-weight:500;">Product request (Pending pricing)</div>
                </div>
                <div class="qty-controls">
                    <button class="qty-btn" onclick="updateManualQty('${safeName}', -1)">−</button>
                    <div class="qty-value" style="background:var(--accent-50); min-width:32px; display:inline-block; text-align:center;">${qty}</div>
                    <button class="qty-btn" onclick="updateManualQty('${safeName}', 1)">+</button>
                </div>
            </div>
        `}).join('')}
    `;
}

function renderLoadMore() {
    const existing = document.getElementById('loadMoreContainer');
    if (existing) existing.remove();

    if (customerPagination.page < customerPagination.totalPages) {
        const container = document.createElement('div');
        container.id = 'loadMoreContainer';
        container.style.cssText = 'padding: 24px; text-align: center;';
        container.innerHTML = `
            <button class="btn btn-outline" style="width:100%; max-width:300px; border-radius:12px;" onclick="loadStock(${customerPagination.page + 1}, true)">
                Load More Results
            </button>
        `;
        document.getElementById('stockListArea').appendChild(container);
    }
}

function filterItems(query) {
    customerPagination.search = query.trim();
    if (searchTimeout) clearTimeout(searchTimeout);

    searchTimeout = setTimeout(() => {
        loadStock(1, false);
    }, 300);
}
