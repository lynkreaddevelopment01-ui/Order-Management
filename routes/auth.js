const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db');
const { v4: uuidv4 } = require('uuid');
const { authenticateToken, requireSuperAdmin, JWT_SECRET } = require('../middleware/auth');

// Admin Login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const db = getDb();
        const user = await db.prepare('SELECT * FROM admins WHERE username = $1').get([username]);

        if (!user || !bcrypt.compareSync(password, user.password)) {
            console.warn(`[AUTH] Failed login attempt for user: ${username}`);
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        console.log(`[AUTH] Successful login for user: ${username} (ID: ${user.id}, Role: ${user.role})`);

        if (!user.is_active) {
            return res.status(403).json({ error: 'Account is deactivated' });
        }

        const token = jwt.sign({
            id: user.id,
            username: user.username,
            role: user.role,
            name: user.name,
            company_name: user.company_name,
            unique_code: user.unique_code,
            subdomain: user.subdomain
        }, JWT_SECRET, { expiresIn: '24h' });

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                name: user.name,
                role: user.role,
                company_name: user.company_name,
                unique_code: user.unique_code,
                subdomain: user.subdomain
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get current user info
router.get('/me', authenticateToken, (req, res) => {
    res.json({ user: req.user });
});

// Create new company admin — Super Admin only
router.post('/create-admin', authenticateToken, requireSuperAdmin, async (req, res) => {
    try {
        const { username, password, name, company_name, subdomain } = req.body;
        const db = getDb();

        const existing = await db.prepare('SELECT id FROM admins WHERE username = $1').get([username]);
        if (existing) {
            return res.status(400).json({ error: 'Username already taken' });
        }

        const hashedPassword = bcrypt.hashSync(password, 10);
        const uniqueCode = uuidv4().substring(0, 8);

        await db.prepare(
            'INSERT INTO admins (username, password, name, company_name, unique_code, subdomain, role, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)'
        ).run([username, hashedPassword, name, company_name, uniqueCode, subdomain || null, 'admin', req.user.id]);

        res.json({ success: true, message: `Admin "${name}" for company "${company_name}" created successfully` });
    } catch (err) {
        if (err.message.includes('unique constraint') || err.message.includes('UNIQUE')) {
            return res.status(400).json({ error: 'Username or Subdomain already taken' });
        }
        res.status(500).json({ error: err.message });
    }
});

// List all admins (companies) — Super Admin only
router.get('/admins', authenticateToken, requireSuperAdmin, async (req, res) => {
    try {
        console.log('[AUTH] Inside /admins route handler');
        const db = getDb();
        const admins = await db.prepare(
            'SELECT id, username, name, company_name, unique_code, subdomain, role, is_active, created_at FROM admins ORDER BY created_at DESC'
        ).all();
        res.json({ admins });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get admin details with stats — Super Admin only
router.get('/admins/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
    try {
        const db = getDb();
        const admin = await db.prepare(
            'SELECT id, username, name, company_name, unique_code, subdomain, role, is_active, created_at FROM admins WHERE id = $1'
        ).get([req.params.id]);

        if (!admin) {
            return res.status(404).json({ error: 'Admin not found' });
        }

        const stockCount = await db.prepare('SELECT COUNT(*) as count FROM stock WHERE admin_id = $1 AND is_active = 1').get([admin.id]);
        const customerCount = await db.prepare('SELECT COUNT(*) as count FROM customers WHERE admin_id = $1 AND is_active = 1').get([admin.id]);
        const orderCount = await db.prepare('SELECT COUNT(*) as count FROM orders WHERE admin_id = $1').get([admin.id]);
        const revenue = await db.prepare('SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE admin_id = $1').get([admin.id]);

        res.json({
            admin,
            stats: {
                stockCount: parseInt(stockCount.count),
                customerCount: parseInt(customerCount.count),
                orderCount: parseInt(orderCount.count),
                revenue: parseFloat(revenue.total)
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update admin (company) — Super Admin only
router.put('/admins/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
    try {
        const { name, company_name, username, subdomain } = req.body;
        const db = getDb();

        const admin = await db.prepare('SELECT * FROM admins WHERE id = $1').get([req.params.id]);
        if (!admin) return res.status(404).json({ error: 'Admin not found' });
        if (admin.role === 'superadmin') return res.status(400).json({ error: 'Cannot modify system super admin' });

        await db.prepare('UPDATE admins SET name = $1, company_name = $2, username = $3, subdomain = $4 WHERE id = $5')
            .run([name, company_name, username, subdomain || null, req.params.id]);

        res.json({ success: true, message: 'Company details updated successfully' });
    } catch (err) {
        if (err.message.includes('unique constraint') || err.message.includes('UNIQUE')) {
            return res.status(400).json({ error: 'Username or Subdomain already taken' });
        }
        res.status(500).json({ error: err.message });
    }
});

// Toggle admin active/inactive — Super Admin only
router.put('/admins/:id/toggle', authenticateToken, requireSuperAdmin, async (req, res) => {
    try {
        const db = getDb();
        const admin = await db.prepare('SELECT * FROM admins WHERE id = $1').get([req.params.id]);
        if (!admin) return res.status(404).json({ error: 'Admin not found' });
        if (admin.role === 'superadmin') return res.status(400).json({ error: 'Cannot deactivate super admin' });

        const newStatus = admin.is_active ? 0 : 1;
        await db.prepare('UPDATE admins SET is_active = $1 WHERE id = $2').run([newStatus, req.params.id]);
        res.json({ success: true, message: `Admin ${newStatus ? 'activated' : 'deactivated'}` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete admin — Super Admin only
router.delete('/admins/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
    try {
        const db = getDb();
        const admin = await db.prepare('SELECT * FROM admins WHERE id = $1').get([req.params.id]);
        if (admin && admin.role === 'superadmin') {
            return res.status(400).json({ error: 'Cannot delete super admin' });
        }
        await db.prepare('DELETE FROM admins WHERE id = $1').run([req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Super Admin Dashboard — platform-wide stats
router.get('/platform-stats', authenticateToken, requireSuperAdmin, async (req, res) => {
    try {
        const db = getDb();
        const totalAdmins = await db.prepare("SELECT COUNT(*) as count FROM admins WHERE role = 'admin'").get();
        const activeAdmins = await db.prepare("SELECT COUNT(*) as count FROM admins WHERE role = 'admin' AND is_active = 1").get();
        const totalOrders = await db.prepare('SELECT COUNT(*) as count FROM orders').get();
        const totalRevenue = await db.prepare('SELECT COALESCE(SUM(total_amount), 0) as total FROM orders').get();
        const totalCustomers = await db.prepare('SELECT COUNT(*) as count FROM customers WHERE is_active = 1').get();
        const totalStock = await db.prepare('SELECT COUNT(*) as count FROM stock WHERE is_active = 1').get();

        const recentOrders = await db.prepare(`
      SELECT o.*, c.name as customer_name, a.company_name
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      JOIN admins a ON o.admin_id = a.id
      ORDER BY o.created_at DESC
      LIMIT 10
    `).all();

        const companyStats = await db.prepare(`
      SELECT a.id, a.name, a.company_name, a.unique_code, a.subdomain, a.is_active,
        (SELECT COUNT(*) FROM orders WHERE admin_id = a.id) as order_count,
        (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE admin_id = a.id) as revenue,
        (SELECT COUNT(*) FROM customers WHERE admin_id = a.id AND is_active = 1) as customer_count
      FROM admins a
      WHERE a.role = 'admin'
      ORDER BY revenue DESC
    `).all();

        res.json({
            stats: {
                totalAdmins: parseInt(totalAdmins.count),
                activeAdmins: parseInt(activeAdmins.count),
                totalOrders: parseInt(totalOrders.count),
                totalRevenue: parseFloat(totalRevenue.total),
                totalCustomers: parseInt(totalCustomers.count),
                totalStock: parseInt(totalStock.count)
            },
            recentOrders,
            companyStats
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get current tenant info (public branding)
router.get('/current-tenant', async (req, res) => {
    if (!req.tenant) return res.status(404).json({ error: 'No tenant context found' });
    res.json({
        company_name: req.tenant.company_name,
        username: req.tenant.username,
        unique_code: req.tenant.unique_code,
        id: req.tenant.id
    });
});

module.exports = router;
