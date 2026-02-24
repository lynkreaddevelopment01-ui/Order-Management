const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const db = require('./database');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const customerRoutes = require('./routes/customer');

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


// Pattern: /portal-admin (Staff Dashboard)
app.get('/portal-admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-dashboard.html'));
});

// Pattern: /portal-customer (Customer Ordering)
app.get('/portal-customer', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'customer-order.html'));
});


app.get('/', (req, res) => {
    if (req.tenant) {
        // If visiting a tenant subdomain (e.g. srinivasa.lynkmanage.com), go to customer portal
        return res.redirect('/portal-customer');
    }
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
            console.log(`   - Company Staff: http://[company].localhost:${PORT}/portal-admin`);
            console.log(`   - Customer Portal: http://[company].localhost:${PORT}/portal-customer`);
        });
    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
})();
