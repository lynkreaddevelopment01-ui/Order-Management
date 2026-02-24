const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

/**
 * Parses offer text (e.g., "5+1", "6+2") and calculates bonus quantity
 */
function calculateBonus(offerText, purchasedQty) {
    if (!offerText) return 0;
    const match = offerText.match(/(\d+)\s*\+\s*(\d+)/);
    if (match) {
        const buyQty = parseInt(match[1]);
        const freeQty = parseInt(match[2]);
        if (buyQty > 0 && purchasedQty >= buyQty) {
            return Math.floor(purchasedQty / buyQty) * freeQty;
        }
    }
    return 0;
}

// Verify customer by subdomain or unique code
router.post('/verify', async (req, res) => {
    try {
        const { uniqueCode, customerId } = req.body;
        const db = getDb();

        // If we have a tenant from subdomain, use that. Otherwise use uniqueCode from body.
        const codeToUse = req.tenant ? req.tenant.unique_code : (uniqueCode || '');

        console.log(`[AUTH] Verifying Customer: ${customerId} | Vendor: ${codeToUse}`);

        const customer = await db.prepare(`
      SELECT c.*, a.company_name
      FROM customers c
      JOIN admins a ON c.admin_id = a.id
      WHERE a.unique_code = $1 AND c.customer_id_external = $2 AND c.is_active = 1 AND a.is_active = 1
    `).get([String(codeToUse), String(customerId || '')]);

        if (!customer) {
            console.warn(`[AUTH] FAILED: Customer ${customerId} not found for Vendor ${codeToUse}`);
            return res.status(401).json({ error: 'Invalid Customer ID. Please check and try again.' });
        }

        console.log(`[AUTH] SUCCESS: Verified ${customer.name} (ID: ${customer.id})`);

        res.json({
            success: true,
            customer: {
                id: customer.id,
                name: customer.name,
                phone: customer.phone,
                address: customer.address,
                city: customer.city,
                customer_id_external: customer.customer_id_external,
                admin_id: customer.admin_id,
                company_name: customer.company_name
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get list of manufacturers for a tenant
router.get('/manufacturers/:uniqueCode', async (req, res) => {
    try {
        const db = getDb();
        const code = req.params.uniqueCode;

        const admin = await db.prepare(`
          SELECT id FROM admins WHERE unique_code = $1 AND is_active = 1
        `).get([code]);

        if (!admin) return res.status(404).json({ error: 'Vendor not found' });

        const manufacturersRows = await db.prepare(`
            SELECT DISTINCT CASE WHEN category IS NULL OR category = '' THEN 'General' ELSE category END as name 
            FROM stock 
            WHERE admin_id = $1 AND is_active = 1 AND quantity > 0
            ORDER BY name ASC
        `).all([admin.id]);

        const hasOffers = await db.prepare(`
            SELECT 1 FROM special_offers WHERE admin_id = $1 AND is_active = 1 LIMIT 1
        `).get([admin.id]);

        // Filter out General and Special Offers if they exist in the names to re-order them
        let names = manufacturersRows.map(m => m.name).filter(n => n !== 'General');

        const finalList = ['General'];
        if (hasOffers) {
            finalList.push('Special Offers ✨');
        }

        // Combine with alphabetical others
        res.json({ manufacturers: [...finalList, ...names] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get products for a specific manufacturer
router.get('/stock-by-manufacturer/:uniqueCode', async (req, res) => {
    try {
        const db = getDb();
        const code = req.params.uniqueCode;
        const manufacturer = req.query.manufacturer || 'General';

        const admin = await db.prepare(`
          SELECT id FROM admins WHERE unique_code = $1 AND is_active = 1
        `).get([code]);

        if (!admin) return res.status(404).json({ error: 'Vendor not found' });

        let whereClause = 'WHERE s.admin_id = $1 AND s.is_active = 1 AND s.quantity > 0';
        let params = [admin.id];

        if (manufacturer === 'Special Offers ✨') {
            whereClause += " AND so.id IS NOT NULL AND so.is_active = 1";
        } else if (manufacturer === 'General') {
            whereClause += " AND (s.category IS NULL OR s.category = '')";
        } else {
            whereClause += " AND s.category = $2";
            params.push(manufacturer);
        }

        const stock = await db.prepare(`
            SELECT s.id, s.item_code, s.item_name, s.category, s.unit, s.quantity, s.price,
                CASE WHEN so.id IS NOT NULL AND so.is_active = 1 THEN 1 ELSE 0 END as has_offer,
                so.offer_text, so.discount_percent, so.offer_price
            FROM stock s
            LEFT JOIN special_offers so ON s.id = so.stock_id AND so.is_active = 1
            ${whereClause}
            ORDER BY has_offer DESC, s.item_name ASC
        `).all(params);

        res.json({ stock });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get available stock for customer (scoped to the admin/company) with pagination and search
router.get(['/stock', '/stock/:uniqueCode'], async (req, res) => {
    try {
        const db = getDb();
        const code = req.tenant ? req.tenant.unique_code : req.params.uniqueCode;

        if (!code) {
            return res.status(404).json({ error: 'Order link invalid' });
        }

        const admin = await db.prepare(`
          SELECT * FROM admins WHERE unique_code = $1 AND is_active = 1
        `).get([code]);

        if (!admin) {
            return res.status(404).json({ error: 'Company portal not found or invalid link.' });
        }

        const adminId = admin.id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';

        let whereClause = 'WHERE s.admin_id = $1 AND s.is_active = 1';
        let params = [adminId];

        if (search) {
            // When searching, include items with zero stock
            whereClause += " AND (LOWER(s.item_name) LIKE LOWER($2) OR LOWER(COALESCE(s.category, 'General')) LIKE LOWER($2) OR LOWER(s.item_code) LIKE LOWER($2))";
            params.push(`%${search}%`);
        } else {
            // Default view only shows in-stock items
            whereClause += " AND s.quantity > 0";
        }

        // Get total count for pagination
        const countQuery = `SELECT COUNT(*) as count FROM stock s ${whereClause}`;
        const totalRow = await db.prepare(countQuery).get(params);
        const total = totalRow.count;

        // Get paginated stock
        const stock = await db.prepare(`
            SELECT s.id, s.item_code, s.item_name, s.category, s.unit, s.quantity, s.price,
                CASE WHEN so.id IS NOT NULL AND so.is_active = 1 THEN 1 ELSE 0 END as has_offer,
                so.offer_text, so.discount_percent, so.offer_price
            FROM stock s
            LEFT JOIN special_offers so ON s.id = so.stock_id AND so.is_active = 1
            ${whereClause}
            ORDER BY has_offer DESC, s.item_name ASC
            LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `).all([...params, limit, offset]);

        res.json({
            stock,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            company_name: admin.company_name
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Place order — scoped to the admin/company
router.post('/order', async (req, res) => {
    try {
        const { uniqueCode, customerId, items, notes } = req.body;
        const db = getDb();

        const codeToUse = req.tenant ? req.tenant.unique_code : (uniqueCode || '');

        // Verify customer
        const customer = await db.prepare(`
          SELECT c.*, a.company_name, a.unique_code as vendor_code
          FROM customers c
          JOIN admins a ON c.admin_id = a.id
          WHERE a.unique_code = $1 AND c.customer_id_external = $2 AND c.is_active = 1 AND a.is_active = 1
        `).get([String(codeToUse), String(customerId || '')]);

        if (!customer) {
            return res.status(401).json({ error: 'Identity verification failed. Please check your Customer ID.' });
        }

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Please add at least one item to your order' });
        }

        const adminId = Number(customer.admin_id);
        console.log(`[ORDER] Processing order for Admin ID: ${adminId}, Customer: ${customer.name}`);

        // Generate order number: ORD-(FIRST 4 OF COMPANY)-000001
        const compPrefix = (customer.company_name || 'MED')
            .toUpperCase()
            .replace(/[^A-Z0-9]| /g, '')
            .substring(0, 4)
            .padEnd(4, 'X');

        // Find the highest sequence number for this specific admin
        const maxOrderRow = await db.prepare(`
            SELECT MAX(CAST(SUBSTR(order_number, 10) AS INTEGER)) as max_num 
            FROM orders 
            WHERE admin_id = $1
        `).get([adminId]);

        const nextNum = (maxOrderRow && maxOrderRow.max_num) ? (parseInt(maxOrderRow.max_num) + 1) : 1;
        const orderNumber = `ORD-${compPrefix}-${String(nextNum).padStart(6, '0')}`;
        console.log(`[ORDER] Generated Branded Order Number: ${orderNumber}`);

        let totalAmount = 0;
        const orderItems = [];
        const offerWarnings = [];

        for (const item of items) {
            const qty = parseInt(item.quantity) || 1;
            const stockId = item.stockId ? parseInt(item.stockId) : null;

            if (!stockId) {
                // Manual Item Request
                orderItems.push({
                    stockId: null,
                    itemName: String(item.itemName || 'Custom Item'),
                    quantity: Number(qty),
                    unitPrice: 0,
                    totalPrice: 0,
                    isOffer: 0,
                    bonusQty: 0,
                    appliedOffer: null,
                    offerSkipped: 0,
                    missedOfferText: null,
                    distPrice: 0,
                    mrp: 0
                });
                continue;
            }

            const stockItem = await db.prepare(`
                SELECT s.*, so.offer_price, so.offer_text, so.is_active as offer_active
                FROM stock s
                LEFT JOIN special_offers so ON s.id = so.stock_id AND so.is_active = 1
                WHERE s.id = $1 AND s.admin_id = $2
            `).get([stockId, adminId]);

            if (stockItem) {
                // First: Basic stock check for purchased qty
                // Allow backordering (Zero stock ordering)
                if (stockItem.quantity < qty) {
                    console.log(`[ORDER] Backorder for ${stockItem.item_name}: Requested ${qty}, Available ${stockItem.quantity}`);
                    // We allow it, but we won't give bonuses if stock is low for the bonus itself
                }

                let bonusQty = stockItem.offer_active ? calculateBonus(stockItem.offer_text, qty) : 0;
                let appliedOffer = stockItem.offer_active ? stockItem.offer_text : null;
                let offerSkipped = 0;
                let missedOfferText = null;

                if (bonusQty > 0 && stockItem.quantity < (qty + bonusQty)) {
                    console.warn(`[ORDER] Offer stock low for ${stockItem.item_name}. (Req: ${qty}, Bonus: ${bonusQty}, Avail: ${stockItem.quantity})`);
                    offerSkipped = 1;
                    missedOfferText = stockItem.offer_text;
                    bonusQty = 0;
                    appliedOffer = null;
                }

                const rawPrice = (stockItem.offer_active && stockItem.offer_price) ? stockItem.offer_price : stockItem.price;
                const unitPrice = parseFloat(rawPrice) || 0;

                orderItems.push({
                    stockId: Number(stockItem.id),
                    itemName: String(stockItem.item_name),
                    quantity: Number(qty),
                    unitPrice: Number(unitPrice),
                    totalPrice: Number(unitPrice * qty),
                    isOffer: appliedOffer ? 1 : 0,
                    bonusQty: bonusQty,
                    appliedOffer: appliedOffer,
                    offerSkipped: offerSkipped,
                    missedOfferText: missedOfferText,
                    distPrice: Number(stockItem.dist_price || 0),
                    mrp: Number(stockItem.mrp || 0)
                });
                totalAmount += (unitPrice * qty);
            } else {
                return res.status(404).json({ error: `Item not found.` });
            }
        }

        if (orderItems.length === 0) {
            console.warn('[ORDER] No valid items found in request');
            return res.status(400).json({ error: 'No valid items in order or insufficient stock' });
        }

        // Manual Transaction
        const client = await db.pool.connect();
        try {
            await client.query('BEGIN');

            console.log(`[ORDER] TX START for Customer ${customer.id}`);

            // Combine user notes with system generated offer warnings
            const finalNotes = [notes, ...offerWarnings].filter(Boolean).join('\n');

            // Use RETURNING id for PostgreSQL, which our mockQuery handles for SQLite too
            const orderRes = await client.query(
                'INSERT INTO orders (admin_id, order_number, customer_id, total_amount, status, notes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
                [adminId, orderNumber, customer.id, totalAmount, 'pending', finalNotes]
            );

            console.log(`[ORDER] Inserted record into 'orders' table. result:`, !!orderRes);

            const orderId = orderRes.insertId || (orderRes.rows && orderRes.rows.length > 0 ? orderRes.rows[0].id : null);
            console.log(`[ORDER] Retrieved Order ID: ${orderId}`);

            if (!orderId) {
                throw new Error('Failed to retrieve new order ID after insertion');
            }

            for (const oi of orderItems) {
                console.log(`[ORDER] Inserting item: ${oi.itemName} (Qty: ${oi.quantity}, Bonus: ${oi.bonusQty})`);
                await client.query(
                    'INSERT INTO order_items (order_id, stock_id, item_name, quantity, unit_price, total_price, is_offer_item, bonus_quantity, applied_offer, offer_skipped, missed_offer_text, dist_price, mrp) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)',
                    [orderId, oi.stockId, oi.itemName, oi.quantity, oi.unitPrice, oi.totalPrice, oi.isOffer, oi.bonusQty, oi.appliedOffer, oi.offerSkipped, oi.missedOfferText, oi.distPrice, oi.mrp]
                );

                if (oi.stockId) {
                    console.log(`[ORDER] Updating stock for ID ${oi.stockId} (Reducing by ${oi.quantity + oi.bonusQty})`);
                    await client.query(
                        'UPDATE stock SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                        [oi.quantity + oi.bonusQty, oi.stockId]
                    );
                }
            }

            await client.query('COMMIT');
            console.log(`[ORDER] TX COMMIT SUCCESS: ${orderNumber}`);
            res.json({ success: true, orderNumber, orderId, totalAmount });
        } catch (txErr) {
            console.error('[ORDER] TRANSACTION ERROR:', txErr.message);
            console.error(txErr.stack);
            await client.query('ROLLBACK');
            throw txErr;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('[ORDER] FATAL ERROR:', err.message);
        console.error(err.stack);
        res.status(500).json({ error: err.message });
    }
});

// Get customer's order history
router.get('/orders/:uniqueCode/:customerId', async (req, res) => {
    try {
        const db = getDb();
        const customer = await db.prepare(`
      SELECT c.* 
      FROM customers c
      JOIN admins a ON c.admin_id = a.id
      WHERE a.unique_code = $1 AND c.customer_id_external = $2 AND c.is_active = 1
    `).get([req.params.uniqueCode, req.params.customerId]);

        if (!customer) {
            return res.status(401).json({ error: 'Invalid customer' });
        }

        const orders = await db.prepare(`
      SELECT * FROM orders WHERE customer_id = $1 AND admin_id = $2 ORDER BY created_at DESC
    `).all([customer.id, customer.admin_id]);

        // Fetch items for each order
        for (const order of orders) {
            order.items = await db.prepare('SELECT * FROM order_items WHERE order_id = $1').all([order.id]);
        }

        res.json({ orders });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
