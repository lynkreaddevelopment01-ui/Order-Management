const { getDb, initialize } = require('./db');
(async () => {
    try {
        await initialize();
        const db = getDb();
        const admins = await db.prepare('SELECT id, username, unique_code FROM admins').all();
        console.log('ADMINS:', JSON.stringify(admins, null, 2));

        const stock = await db.prepare('SELECT id, admin_id, item_name, quantity, is_active FROM stock').all();
        console.log('STOCK:', JSON.stringify(stock, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
})();
