const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, '..', 'data', 'medical_orders.db');
let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function initialize() {
  const database = getDb();

  try {
    // 1. Create Admins table (inc. unique_code for new setups)
    database.exec(`
      CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        company_name TEXT,
        unique_code TEXT UNIQUE,
        role TEXT NOT NULL DEFAULT 'admin',
        is_active INTEGER DEFAULT 1,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES admins(id)
      )
    `);

    // 2. Migration: Ensure unique_code column exists for existing setups
    const adminCols = database.prepare("PRAGMA table_info(admins)").all();
    const hasUniqueCode = adminCols.some(c => c.name === 'unique_code');
    if (!hasUniqueCode) {
      console.log('📝 Migrating admins table: adding unique_code column...');
      database.exec("ALTER TABLE admins ADD COLUMN unique_code TEXT");
      database.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_unique_code ON admins(unique_code)");
    }

    // 3. Customers table
    database.exec(`
      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_id INTEGER NOT NULL,
        customer_id_external TEXT,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT,
        address TEXT,
        city TEXT,
        unique_code TEXT,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (admin_id) REFERENCES admins(id)
      )
    `);

    // 4. Migration: Ensure customer_id_external uniqueness and Remove old phone constraint
    database.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_external_id ON customers(admin_id, customer_id_external)");

    // Thorough check for any unique index involving 'phone'
    let phoneConstraintExists = false;
    const indexes = database.prepare("PRAGMA index_list(customers)").all();
    for (const idx of indexes) {
      if (idx.unique === 1) {
        const columns = database.prepare(`PRAGMA index_info('${idx.name}')`).all();
        if (columns.some(col => col.name === 'phone')) {
          phoneConstraintExists = true;
          break;
        }
      }
    }

    if (phoneConstraintExists) {
      console.log('📝 Migrating customers table: removing unique phone constraint...');
      database.exec("PRAGMA foreign_keys = OFF;");
      database.exec(`
        BEGIN TRANSACTION;
        CREATE TABLE customers_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          admin_id INTEGER NOT NULL,
          customer_id_external TEXT,
          name TEXT NOT NULL,
          phone TEXT NOT NULL,
          email TEXT,
          address TEXT,
          city TEXT,
          unique_code TEXT,
          is_active INTEGER DEFAULT 1,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (admin_id) REFERENCES admins(id)
        );
        INSERT INTO customers_new (id, admin_id, customer_id_external, name, phone, email, address, city, unique_code, is_active, created_at, updated_at)
        SELECT id, admin_id, customer_id_external, name, phone, email, address, city, unique_code, is_active, created_at, updated_at FROM customers;
        DROP TABLE customers;
        ALTER TABLE customers_new RENAME TO customers;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_external_id ON customers(admin_id, customer_id_external);
        COMMIT;
      `);
      database.exec("PRAGMA foreign_keys = ON;");
      console.log('✅ Customers table migration complete: phone constraint removed.');
    }

    // 5. Stock table
    database.exec(`
      CREATE TABLE IF NOT EXISTS stock (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_id INTEGER NOT NULL,
        item_code TEXT NOT NULL,
        item_name TEXT NOT NULL,
        category TEXT,
        unit TEXT DEFAULT 'Pcs',
        quantity INTEGER DEFAULT 0,
        price REAL DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (admin_id) REFERENCES admins(id),
        UNIQUE(admin_id, item_code)
      )
    `);

    // 6. Special Offers table
    database.exec(`
      CREATE TABLE IF NOT EXISTS special_offers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_id INTEGER NOT NULL,
        stock_id INTEGER NOT NULL,
        offer_text TEXT NOT NULL,
        discount_percent REAL DEFAULT 0,
        offer_price REAL,
        is_active INTEGER DEFAULT 1,
        start_date DATETIME,
        end_date DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (admin_id) REFERENCES admins(id),
        FOREIGN KEY (stock_id) REFERENCES stock(id)
      )
    `);

    try {
      database.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_offer_stock_admin ON special_offers(admin_id, stock_id)");
    } catch (e) { }

    // 7. Orders table
    database.exec(`
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_id INTEGER NOT NULL,
        order_number TEXT UNIQUE NOT NULL,
        customer_id INTEGER NOT NULL,
        total_amount REAL DEFAULT 0,
        status TEXT DEFAULT 'pending',
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (admin_id) REFERENCES admins(id),
        FOREIGN KEY (customer_id) REFERENCES customers(id)
      )
    `);

    // 8. Order Items table
    database.exec(`
      CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        stock_id INTEGER,
        item_name TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        unit_price REAL NOT NULL,
        total_price REAL NOT NULL,
        is_offer_item INTEGER DEFAULT 0,
        bonus_quantity INTEGER DEFAULT 0,
        applied_offer TEXT,
        offer_skipped INTEGER DEFAULT 0,
        missed_offer_text TEXT,
        dist_price REAL DEFAULT 0,
        mrp REAL DEFAULT 0,
        FOREIGN KEY (order_id) REFERENCES orders(id),
        FOREIGN KEY (stock_id) REFERENCES stock(id)
      )
    `);

    // Migration for SQLite: check if stock_id is not null
    const itemCols = database.prepare("PRAGMA table_info(order_items)").all();
    const stockIdCol = itemCols.find(c => c.name === 'stock_id');

    // Check if we need to add missing columns OR make stock_id nullable
    const hasBonusQty = itemCols.some(c => c.name === 'bonus_quantity');
    const isLocked = stockIdCol && stockIdCol.notnull === 1;

    if (isLocked || !hasBonusQty) {
      console.log('📝 Migrating order_items table: updating schema...');
      database.exec("PRAGMA foreign_keys = OFF;");
      database.exec(`
            BEGIN TRANSACTION;
            CREATE TABLE order_items_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER NOT NULL,
                stock_id INTEGER,
                item_name TEXT NOT NULL,
                quantity INTEGER NOT NULL,
                unit_price REAL NOT NULL,
                total_price REAL NOT NULL,
                is_offer_item INTEGER DEFAULT 0,
                bonus_quantity INTEGER DEFAULT 0,
                applied_offer TEXT,
                offer_skipped INTEGER DEFAULT 0,
                missed_offer_text TEXT,
                dist_price REAL DEFAULT 0,
                mrp REAL DEFAULT 0,
                FOREIGN KEY (order_id) REFERENCES orders(id),
                FOREIGN KEY (stock_id) REFERENCES stock(id)
            );
            
            -- Dynamic migration based on existing columns
            INSERT INTO order_items_new (id, order_id, stock_id, item_name, quantity, unit_price, total_price, is_offer_item${hasBonusQty ? ', bonus_quantity, applied_offer, offer_skipped, missed_offer_text, dist_price, mrp' : ''})
            SELECT id, order_id, stock_id, item_name, quantity, unit_price, total_price, is_offer_item${hasBonusQty ? ', bonus_quantity, applied_offer, offer_skipped, missed_offer_text, dist_price, mrp' : ''} FROM order_items;
            
            DROP TABLE order_items;
            ALTER TABLE order_items_new RENAME TO order_items;
            COMMIT;
        `);
      database.exec("PRAGMA foreign_keys = ON;");
    }

    // 9. Import logs
    database.exec(`
      CREATE TABLE IF NOT EXISTS import_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_id INTEGER NOT NULL,
        import_type TEXT NOT NULL,
        filename TEXT NOT NULL,
        records_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'success',
        message TEXT,
        imported_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (admin_id) REFERENCES admins(id),
        FOREIGN KEY (imported_by) REFERENCES admins(id)
      )
    `);

    // 10. Default state
    const existingAdmin = database.prepare('SELECT id FROM admins WHERE username = ?').get('superadmin');
    if (!existingAdmin) {
      const hashedPassword = bcrypt.hashSync('admin123', 10);
      const uniqueCode = uuidv4().substring(0, 8);
      database.prepare(
        'INSERT INTO admins (username, password, name, company_name, unique_code, role) VALUES (?, ?, ?, ?, ?, ?)'
      ).run('superadmin', hashedPassword, 'Super Administrator', 'Platform', uniqueCode, 'superadmin');
      console.log('✅ Default super admin created (username: superadmin, password: admin123)');
    }

    // 11. Final Migration: Ensure all admins have a unique_code
    const adminsWithoutCode = database.prepare("SELECT id FROM admins WHERE unique_code IS NULL OR unique_code = ''").all();
    for (const admin of adminsWithoutCode) {
      database.prepare('UPDATE admins SET unique_code = ? WHERE id = ?').run(uuidv4().substring(0, 8), admin.id);
    }

    console.log('✅ Database initialized successfully');
  } catch (err) {
    console.error('❌ Database initialization error:', err.message);
    throw err;
  }
}

module.exports = { getDb, initialize };
