const jwt = require('jsonwebtoken');
const { getDb } = require('../database');
const JWT_SECRET = process.env.JWT_SECRET || 'medical-order-mgmt-secret-key-2024';

async function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization']?.split(' ')[1];
    const token = authHeader || req.cookies?.token || req.query?.token;

    if (!token) {
        return res.status(401).json({ error: 'Access denied. Please login.' });
    }

    try {
        console.log(`[AUTH] Verifying token for request to ${req.url}`);
        const decoded = jwt.verify(token, JWT_SECRET);
        console.log(`[AUTH] Token decoded for user ID: ${decoded.id}`);

        // Verify the user still exists in the database
        const db = getDb();
        const user = await db.prepare('SELECT id, role, is_active FROM admins WHERE id = $1').get([decoded.id]);
        if (!user) {
            return res.status(401).json({ error: 'Session expired. Please login again.' });
        }
        if (!user.is_active) {
            return res.status(403).json({ error: 'Your account has been deactivated.' });
        }

        req.user = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Invalid or expired token.' });
    }
}

function requireSuperAdmin(req, res, next) {
    if (req.user.role !== 'superadmin') {
        return res.status(403).json({ error: 'Super Admin access required.' });
    }
    next();
}

function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
        return res.status(403).json({ error: 'Admin access required.' });
    }
    next();
}

module.exports = { authenticateToken, requireSuperAdmin, requireAdmin, JWT_SECRET };
