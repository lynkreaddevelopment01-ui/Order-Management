const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const db = require('./db');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const customerRoutes = require('./routes/customer');
const reportRoutes = require('./routes/reports');

const { tenantHandler } = require('./middleware/tenant');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(tenantHandler); // Add tenant detection
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/reports', reportRoutes);

// 1. Super Admin Portal
app.get('/super-admin', (req, res) => {
    console.log('[ROUTE] Hit /super-admin');
    res.sendFile(path.join(__dirname, 'public', 'super-admin-login.html'));
});

// Super Admin Dashboard
app.get('/super-admin/dashboard', (req, res) => {
    console.log('[ROUTE] Hit /super-admin/dashboard');
    res.sendFile(path.join(__dirname, 'public', 'admin-dashboard.html'));
});

// Pattern: /portal (Unified Login/Access Entry)
app.get('/portal', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'portal-login.html'));
});

// Internal routes for Smart Redirection
app.get('/portal-admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-dashboard.html'));
});
app.get('/portal-customer', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'customer-order.html'));
});

// Pattern: /vendor-name/unique-code/admin
app.get('/:vendorName/:uniqueCode/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-dashboard.html'));
});

// Pattern: /vendor-name/unique-code
app.get('/:vendorName/:uniqueCode', (req, res, next) => {
    console.log('[ROUTE] Hit wildcard:', req.params.vendorName, req.params.uniqueCode);
    // Skip if this is a super-admin route
    if (req.params.vendorName === 'super-admin') {
        console.log('[ROUTE] Skipping wildcard for super-admin');
        return next();
    }
    res.sendFile(path.join(__dirname, 'public', 'customer-order.html'));
});

// 3. Legacy/Support Routes
app.get('/order/:uniqueCode', (req, res) => {
    res.redirect(`/vendor/${req.params.uniqueCode}`);
});

app.get('/vendor/:uniqueCode', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'customer-order.html'));
});

// 4. Fallbacks
app.get('/', (req, res) => {
    if (req.tenant) {
        // If visiting a tenant subdomain (e.g. srinivasa.localhost), go to the portal
        return res.redirect('/portal');
    }
    // Otherwise go to the platform super-admin login
    res.redirect('/super-admin');
});

// Initialize database and start server
(async () => {
    try {
        await db.initialize();
        app.listen(PORT, () => {
            console.log(`\n🏥 Medical Order Management System (Universal Driver)`);
            console.log(`   Local Mode: ${process.env.DB_TYPE === 'sqlite' ? 'SQLite' : 'PostgreSQL'}`);
            console.log(`\n   Portals:`);
            console.log(`   - Super Admin: http://localhost:${PORT}/super-admin`);
            console.log(`   - Company Portal: http://[company].localhost:${PORT}/portal`);
        });
    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
})();
