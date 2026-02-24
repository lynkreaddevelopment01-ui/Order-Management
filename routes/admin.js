const express = require('express');
const router = express.Router();
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// Configure multer for CSV uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'uploads')),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
            cb(null, true);
        } else {
            cb(new Error('Only CSV files are allowed'), false);
        }
    }
});

// Helper: get the admin_id for data scoping
function getAdminId(req) {
    return req.user.id;
}

// ========== TEMPLATE DOWNLOADS ==========
router.get('/templates/stock', (req, res) => {
    const file = path.join(__dirname, '..', 'uploads', 'sample_stock_data.csv');
    res.download(file, 'stock_template.csv');
});

router.get('/templates/customer', (req, res) => {
    const file = path.join(__dirname, '..', 'uploads', 'sample_customer_data.csv');
    res.download(file, 'customer_template.csv');
});

// ========== STOCK MANAGEMENT ==========

// Get all stock items for this admin's company
router.get('/stock', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const db = getDb();
        const adminId = getAdminId(req);
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';

        let whereClause = 'WHERE s.is_active = 1 AND s.admin_id = $1';
        let params = [adminId];

        if (search) {
            whereClause += " AND (LOWER(s.item_name) LIKE LOWER($2) OR LOWER(s.item_code) LIKE LOWER($2) OR LOWER(COALESCE(s.category, 'General')) LIKE LOWER($2))";
            params.push(`%${search}%`);
        }

        const countQuery = `SELECT COUNT(*) as count FROM stock s ${whereClause}`;
        const totalRow = await db.prepare(countQuery).get(params);
        const total = totalRow.count;

        const stock = await db.prepare(`
      SELECT s.*, 
        CASE WHEN so.id IS NOT NULL AND so.is_active = 1 THEN 1 ELSE 0 END as has_offer,
        so.offer_text, so.discount_percent, so.offer_price
      FROM stock s
      LEFT JOIN special_offers so ON s.id = so.stock_id AND so.is_active = 1
      ${whereClause}
      ORDER BY s.item_name
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `).all([...params, limit, offset]);

        res.json({ stock, total, page, limit, totalPages: Math.ceil(total / limit) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Import stock CSV
router.post('/stock/import', authenticateToken, requireAdmin, upload.single('csvFile'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No CSV file uploaded' });
    }

    const db = getDb();
    const adminId = getAdminId(req);
    const client = await db.pool.connect();
    let recordsCount = 0;
    let offerCount = 0;

    try {
        await client.query('BEGIN');

        await client.query('UPDATE stock SET is_active = 0 WHERE admin_id = $1', [adminId]);
        await client.query('UPDATE special_offers SET is_active = 0 WHERE admin_id = $1', [adminId]);

        const stream = fs.createReadStream(req.file.path).pipe(csv());

        for await (const item of stream) {
            recordsCount++;
            // Priority Mapping for User Requested Headers
            const itemName = item['Product Name'] || item.item_name || item.product_name || item.ProductName ||
                item.item_name || item.ItemName || item.name || item.Name || '';

            if (!itemName) continue;

            const rawCode = item['Item Code'] || item.item_code || item.ItemCode || item.code || item.Code || '';
            const itemCode = rawCode || ('PRD-' + String(recordsCount).padStart(4, '0'));
            const category = item.manufacturer || item.Manufacturer || item.category || item.Category || '';
            const unit = item.unit || item.Unit || 'Pcs';

            // Priority for Qty
            const quantity = parseInt(item.Qty || item.quantity || item.Quantity || item.qty || item.QTY || 0) || 0;

            // Pricing Logic
            const distPrice = parseFloat(item['PTR rate'] || item['PTR Rate'] || item['Dist Price'] || item['Dist.Price'] || item.dist_price || item.DistPrice || 0) || 0;
            const mrp = parseFloat(item.mrp || item.MRP || item['Max Retail Price'] || 0) || 0;

            // Base price falls back to Dist Price if not provided
            const price = parseFloat(item.price || item.Price || distPrice || 0) || 0;

            await client.query(`
                INSERT INTO stock (admin_id, item_code, item_name, category, unit, quantity, price, dist_price, mrp, is_active)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1)
                ON CONFLICT(admin_id, item_code) DO UPDATE SET
                    item_name = EXCLUDED.item_name,
                    category = EXCLUDED.category,
                    unit = EXCLUDED.unit,
                    quantity = EXCLUDED.quantity,
                    price = EXCLUDED.price,
                    dist_price = EXCLUDED.dist_price,
                    mrp = EXCLUDED.mrp,
                    is_active = 1,
                    updated_at = CURRENT_TIMESTAMP
            `, [adminId, itemCode, itemName, category, unit, quantity, price, distPrice, mrp]);

            // Offer Logic
            const offerText = item['Exclusive Offer'] || item.exclusive_offer || item.offer || '';
            if (offerText.trim()) {
                const stockRow = await client.query('SELECT id FROM stock WHERE admin_id = $1 AND item_code = $2', [adminId, itemCode]);
                if (stockRow.rows[0]) {
                    await client.query(`
                        INSERT INTO special_offers (admin_id, stock_id, offer_text, is_active)
                        VALUES ($1, $2, $3, 1)
                        ON CONFLICT(admin_id, stock_id) DO UPDATE SET
                            offer_text = EXCLUDED.offer_text,
                            is_active = 1
                    `, [adminId, stockRow.rows[0].id, offerText.trim()]);
                    offerCount++;
                }
            }
        }

        await client.query(
            'INSERT INTO import_logs (admin_id, import_type, filename, records_count, imported_by) VALUES ($1, $2, $3, $4, $5)',
            [adminId, 'stock', req.file.originalname, recordsCount, req.user.id]
        );

        await client.query('COMMIT');
        res.json({ success: true, message: `${recordsCount} items imported, ${offerCount} offers created` });
    } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.error('[IMPORT ERROR]', err);
        res.status(500).json({ error: 'Failed to import CSV: ' + err.message });
    } finally {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        if (client) client.release();
    }
});

// Add stock item manually
router.post('/stock', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { item_code, item_name, category, unit, quantity, price, dist_price, mrp } = req.body;
        const db = getDb();
        const adminId = getAdminId(req);

        await db.prepare(
            'INSERT INTO stock (admin_id, item_code, item_name, category, unit, quantity, price, dist_price, mrp) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)'
        ).run([adminId, item_code || '', item_name || '', category || '', unit || 'Pcs', quantity || 0, price || 0, dist_price || 0, mrp || 0]);

        res.json({ success: true, message: 'Stock item added successfully' });
    } catch (err) {
        if (err.message.includes('unique constraint') || err.message.includes('UNIQUE')) {
            return res.status(400).json({ error: 'Item code already exists for your company' });
        }
        res.status(500).json({ error: err.message });
    }
});

// Update stock item
router.put('/stock/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { item_name, category, unit, quantity, price, dist_price, mrp } = req.body;
        const db = getDb();
        const adminId = getAdminId(req);

        const existing = await db.prepare('SELECT id FROM stock WHERE id = $1 AND admin_id = $2').get([req.params.id, adminId]);
        if (!existing) return res.status(404).json({ error: 'Stock item not found' });

        await db.prepare(
            'UPDATE stock SET item_name=$1, category=$2, unit=$3, quantity=$4, price=$5, dist_price=$6, mrp=$7, updated_at=CURRENT_TIMESTAMP WHERE id=$8 AND admin_id=$9'
        ).run([item_name || '', category || '', unit || 'Pcs', quantity || 0, price || 0, dist_price || 0, mrp || 0, req.params.id, adminId]);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete stock item (soft)
router.delete('/stock/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const db = getDb();
        const adminId = getAdminId(req);
        await db.prepare('UPDATE stock SET is_active = 0 WHERE id = $1 AND admin_id = $2').run([req.params.id, adminId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== SPECIAL OFFERS ==========

// Get all offers for this admin
router.get('/offers', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const db = getDb();
        const adminId = getAdminId(req);
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const totalRow = await db.prepare(`
            SELECT COUNT(*) as count 
            FROM special_offers so 
            JOIN stock s ON so.stock_id = s.id 
            WHERE so.is_active = 1 AND so.admin_id = $1
        `).get([adminId]);
        const total = totalRow.count;

        const offers = await db.prepare(`
      SELECT so.*, s.item_name, s.item_code, s.price as original_price
      FROM special_offers so
      JOIN stock s ON so.stock_id = s.id
      WHERE so.is_active = 1 AND so.admin_id = $1
      ORDER BY so.created_at DESC
      LIMIT $2 OFFSET $3
    `).all([adminId, limit, offset]);
        res.json({ offers, total, page, limit, totalPages: Math.ceil(total / limit) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create offer
router.post('/offers', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { stock_id, offer_text, discount_percent, offer_price } = req.body;
        const db = getDb();
        const adminId = getAdminId(req);

        const stockItem = await db.prepare('SELECT id FROM stock WHERE id = $1 AND admin_id = $2').get([stock_id, adminId]);
        if (!stockItem) return res.status(404).json({ error: 'Stock item not found' });

        await db.prepare('UPDATE special_offers SET is_active = 0 WHERE stock_id = $1 AND admin_id = $2').run([stock_id, adminId]);

        await db.prepare(
            'INSERT INTO special_offers (admin_id, stock_id, offer_text, discount_percent, offer_price) VALUES ($1, $2, $3, $4, $5)'
        ).run([adminId, stock_id, offer_text, discount_percent || 0, offer_price || null]);

        res.json({ success: true, message: 'Offer created successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete offer
router.delete('/offers/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const db = getDb();
        const adminId = getAdminId(req);
        await db.prepare('UPDATE special_offers SET is_active = 0 WHERE id = $1 AND admin_id = $2').run([req.params.id, adminId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== CUSTOMER MANAGEMENT ==========

// Get all customers for this admin's company
router.get('/customers', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const db = getDb();
        const adminId = getAdminId(req);
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';

        let whereClause = 'WHERE is_active = 1 AND admin_id = $1';
        let params = [adminId];

        if (search) {
            whereClause += " AND (LOWER(name) LIKE LOWER($2) OR LOWER(phone) LIKE LOWER($2) OR LOWER(customer_id_external) LIKE LOWER($2))";
            params.push(`%${search}%`);
        }

        const countQuery = `SELECT COUNT(*) as count FROM customers ${whereClause}`;
        const totalRow = await db.prepare(countQuery).get(params);
        const total = totalRow.count;

        const customers = await db.prepare(
            `SELECT * FROM customers ${whereClause} ORDER BY name LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
        ).all([...params, limit, offset]);
        res.json({ customers, total, page, limit, totalPages: Math.ceil(total / limit) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Import customer CSV
router.post('/customers/import', authenticateToken, requireAdmin, upload.single('csvFile'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No CSV file uploaded' });
    }

    const db = getDb();
    const adminId = getAdminId(req);
    const client = await db.pool.connect();
    let recordsCount = 0;

    try {
        await client.query('BEGIN');
        // Clear active status for existing customers to perform a fresh sync
        await client.query('UPDATE customers SET is_active = 0 WHERE admin_id = $1', [adminId]);

        const stream = fs.createReadStream(req.file.path).pipe(csv());

        for await (const item of stream) {
            recordsCount++;
            const uniqueCode = uuidv4().substring(0, 8);
            const phone = String(item.PhoneNumber || item.phone || item.mobile || item.Phone || item['Phone Number'] || '');
            const customerIdExt = item.CustomerID || item.customer_id || item['Customer ID'] || item.id || '';
            let name = item['Customer Name'] || item.name || item.Name || item.CustomerName || '';

            const address = item.address || item.Address || item['Street Address'] || item.addr || item.Location || '';
            const city = item.city || item.City || item.Town || item.District || '';

            if (!name) {
                name = customerIdExt ? `Customer ${customerIdExt}` : (phone ? `Customer ${phone}` : 'Unknown');
            }

            const finalId = customerIdExt || phone;
            if (!finalId) continue;

            await client.query(`
                INSERT INTO customers (admin_id, customer_id_external, name, phone, email, address, city, unique_code, is_active)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1)
                ON CONFLICT(admin_id, customer_id_external) DO UPDATE SET
                    name = EXCLUDED.name,
                    phone = EXCLUDED.phone,
                    email = EXCLUDED.email,
                    address = EXCLUDED.address,
                    city = EXCLUDED.city,
                    is_active = 1,
                    updated_at = CURRENT_TIMESTAMP
            `, [adminId, finalId, name, phone, item.email || item.Email || '', address, city, uniqueCode]);
        }

        await client.query(
            'INSERT INTO import_logs (admin_id, import_type, filename, records_count, imported_by) VALUES ($1, $2, $3, $4, $5)',
            [adminId, 'customer', req.file.originalname, recordsCount, req.user.id]
        );

        await client.query('COMMIT');
        res.json({ success: true, message: `${recordsCount} customers imported` });
    } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.error('[IMPORT ERROR]', err);
        res.status(500).json({ error: 'Failed to import CSV: ' + err.message });
    } finally {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        if (client) client.release();
    }
});

// Add customer manually
router.post('/customers', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { customer_id_external, name, phone, email, address, city } = req.body;
        const uniqueCode = uuidv4().substring(0, 8);
        const db = getDb();
        const adminId = getAdminId(req);

        await db.prepare(
            'INSERT INTO customers (admin_id, customer_id_external, name, phone, email, address, city, unique_code) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)'
        ).run([adminId, customer_id_external || '', name || '', phone || '', email || '', address || '', city || '', uniqueCode]);

        res.json({ success: true, message: 'Customer added successfully', uniqueCode });
    } catch (err) {
        if (err.message.includes('unique constraint') || err.message.includes('UNIQUE')) {
            return res.status(400).json({ error: 'Customer ID already exists for your company' });
        }
        res.status(500).json({ error: err.message });
    }
});

// ========== ORDER MANAGEMENT ==========

// Get all orders
router.get('/orders', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const db = getDb();
        const adminId = getAdminId(req);
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';
        const status = req.query.status || '';

        let whereClause = 'WHERE o.admin_id = $1';
        let params = [adminId];

        if (status) {
            whereClause += ` AND o.status = $${params.length + 1}`;
            params.push(status);
        }

        if (search) {
            whereClause += ` AND (LOWER(o.order_number) LIKE LOWER($${params.length + 1}) 
                OR LOWER(c.name) LIKE LOWER($${params.length + 1}) 
                OR LOWER(c.phone) LIKE LOWER($${params.length + 1})
                OR LOWER(c.city) LIKE LOWER($${params.length + 1}))`;
            params.push(`%${search}%`);
        }

        const countQuery = `SELECT COUNT(*) as count FROM orders o JOIN customers c ON o.customer_id = c.id ${whereClause}`;
        const totalRow = await db.prepare(countQuery).get(params);
        const total = totalRow.count;

        const orders = await db.prepare(`
      SELECT o.*, c.customer_id_external, c.name as customer_name, c.phone as customer_phone, c.city as customer_city
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      ${whereClause}
      ORDER BY o.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `).all([...params, limit, offset]);

        res.json({ orders, total, page, limit, totalPages: Math.ceil(total / limit) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get order details
router.get('/orders/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const db = getDb();
        const adminId = getAdminId(req);
        const order = await db.prepare(`
      SELECT o.*, c.customer_id_external, c.name as customer_name, c.phone as customer_phone, 
             c.email as customer_email, c.address as customer_address, c.city as customer_city
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      WHERE o.id = $1 AND o.admin_id = $2
    `).get([req.params.id, adminId]);

        if (!order) return res.status(404).json({ error: 'Order not found' });

        const items = await db.prepare('SELECT * FROM order_items WHERE order_id = $1').all([order.id]);
        res.json({ order, items });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update status
router.put('/orders/:id/status', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { status } = req.body;
        const db = getDb();
        const adminId = getAdminId(req);
        await db.prepare('UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND admin_id = $3')
            .run([status || 'pending', req.params.id, adminId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Dashboard stats
router.get('/dashboard', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const db = getDb();
        const adminId = getAdminId(req);

        const totalStock = await db.prepare('SELECT COUNT(*) as count FROM stock WHERE is_active = 1 AND admin_id = $1').get([adminId]);
        const totalCustomers = await db.prepare('SELECT COUNT(*) as count FROM customers WHERE is_active = 1 AND admin_id = $1').get([adminId]);
        const totalOrders = await db.prepare('SELECT COUNT(*) as count FROM orders WHERE admin_id = $1').get([adminId]);
        const pendingOrders = await db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'pending' AND admin_id = $1").get([adminId]);
        const todayOrders = await db.prepare(
            "SELECT COUNT(*) as count FROM orders WHERE DATE(created_at) = CURRENT_DATE AND admin_id = $1"
        ).get([adminId]);
        const totalRevenue = await db.prepare('SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE admin_id = $1').get([adminId]);

        const recentOrders = await db.prepare(`
      SELECT o.*, c.customer_id_external, c.name as customer_name, c.phone as customer_phone
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      WHERE o.admin_id = $1
      ORDER BY o.created_at DESC
      LIMIT 10
    `).all([adminId]);

        const lowStockItems = await db.prepare(
            'SELECT * FROM stock WHERE is_active = 1 AND admin_id = $1 AND quantity <= 10 ORDER BY quantity ASC LIMIT 10'
        ).all([adminId]);

        const admin = await db.prepare('SELECT unique_code FROM admins WHERE id = $1').get([adminId]);

        res.json({
            stats: {
                totalStock: parseInt(totalStock.count),
                totalCustomers: parseInt(totalCustomers.count),
                totalOrders: parseInt(totalOrders.count),
                pendingOrders: parseInt(pendingOrders.count),
                todayOrders: parseInt(todayOrders.count),
                totalRevenue: parseFloat(totalRevenue.total),
                uniqueCode: admin.unique_code
            },
            recentOrders,
            lowStockItems
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
