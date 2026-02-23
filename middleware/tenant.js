const { prepare } = require('../db');

/**
 * Middleware to identify the vendor/admin based on the subdomain.
 * Example: medical1.lynkread.com -> subdomain 'medical1'
 */
async function tenantHandler(req, res, next) {
    const host = req.headers.host; // e.g., 'vendor1.localhost:3000'
    if (!host) return next();

    let subdomain = null;

    // Improved detection for both production domains and local development
    if (host.includes('localhost')) {
        const parts = host.split('.');
        if (parts.length > 1) subdomain = parts[0];
    } else {
        const mainDomain = process.env.DOMAIN || 'lynkread.com';
        if (host.includes(`.${mainDomain}`)) {
            subdomain = host.split(`.${mainDomain}`)[0];
        }
    }

    if (subdomain && subdomain !== 'www' && subdomain !== 'admin') {
        try {
            // Using a case-insensitive check for the subdomain (which maps to username/vendorName)
            const admin = await prepare('SELECT * FROM admins WHERE LOWER(username) = LOWER($1) AND is_active = 1').get([subdomain]);
            if (admin) {
                req.tenant = admin;
                console.log(`[TENANT] Identified: ${admin.company_name} (${subdomain})`);
            }
        } catch (err) {
            console.error('Tenant identification error:', err);
        }
    }
    next();
}

module.exports = { tenantHandler };
