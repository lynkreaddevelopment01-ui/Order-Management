require('dotenv').config();
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

let db;

if (process.env.DB_TYPE === 'sqlite') {
  const Database = require('better-sqlite3');
  const DB_PATH = path.join(__dirname, 'data', 'medical_orders.db');

  // Ensure data directory exists
  const fs = require('fs');
  if (!fs.existsSync(path.join(__dirname, 'data'))) {
    fs.mkdirSync(path.join(__dirname, 'data'));
  }

  const sqliteDb = new Database(DB_PATH);
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('foreign_keys = ON');

  // Helper to convert $1, $2 to ? for SQLite compatibility
  const convertSql = (sql) => sql.replace(/\$\d+/g, '?');

  // Mock PG interface for SQLite
  const mockQuery = async (sql, params = []) => {
    const trimmedSql = sql.trim().toUpperCase();

    // Handle manual transactions for SQLite
    if (trimmedSql === 'BEGIN' || trimmedSql === 'COMMIT' || trimmedSql === 'ROLLBACK') {
      sqliteDb.exec(trimmedSql);
      return { rows: [], rowCount: 0 };
    }

    const convertedSql = convertSql(sql);
    try {
      const stmt = sqliteDb.prepare(convertedSql);
      const p = params ? (Array.isArray(params) ? params : [params]) : [];

      if (trimmedSql.startsWith('SELECT')) {
        const rows = stmt.all(...p);
        return { rows, rowCount: rows.length };
      } else {
        const result = stmt.run(...p);
        return { rows: [], rowCount: result.changes, insertId: result.lastInsertRowid };
      }
    } catch (err) {
      console.error(`[DB ERROR] SQL: ${sql}`);
      console.error(`[DB ERROR] Params:`, params);
      console.error(`[DB ERROR] Message: ${err.message}`);
      throw err;
    }
  };

  db = {
    sqlite: sqliteDb,
    // Mock pool for routes that use db.pool.connect()
    pool: {
      connect: async () => ({
        query: mockQuery,
        release: () => { } // No-op for SQLite
      })
    },
    query: mockQuery,
    prepare: (sql) => ({
      get: async (params) => {
        const p = params ? (Array.isArray(params) ? params : [params]) : [];
        const row = sqliteDb.prepare(convertSql(sql)).get(...p);
        return row;
      },
      all: async (params) => {
        const p = params ? (Array.isArray(params) ? params : [params]) : [];
        const rows = sqliteDb.prepare(convertSql(sql)).all(...p);
        return rows;
      },
      run: async (params) => {
        const p = params ? (Array.isArray(params) ? params : [params]) : [];
        const result = sqliteDb.prepare(convertSql(sql)).run(...p);
        return { lastInsertRowid: result.lastInsertRowid, changes: result.changes };
      }
    }),
    initialize: async () => {
      // Create tables using SQLite syntax
      sqliteDb.exec(`
                CREATE TABLE IF NOT EXISTS admins (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    password TEXT NOT NULL,
                    name TEXT NOT NULL,
                    company_name TEXT,
                    unique_code TEXT UNIQUE,
                    subdomain TEXT UNIQUE,
                    role TEXT NOT NULL DEFAULT 'admin',
                    is_active INTEGER DEFAULT 1,
                    created_by INTEGER,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS customers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    admin_id INTEGER NOT NULL REFERENCES admins(id),
                    customer_id_external TEXT,
                    name TEXT NOT NULL,
                    phone TEXT NOT NULL,
                    email TEXT,
                    address TEXT,
                    city TEXT,
                    unique_code TEXT,
                    is_active INTEGER DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_ext_id ON customers(admin_id, customer_id_external);

                CREATE TABLE IF NOT EXISTS stock (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    admin_id INTEGER NOT NULL REFERENCES admins(id),
                    item_code TEXT NOT NULL,
                    item_name TEXT NOT NULL,
                    category TEXT,
                    unit TEXT DEFAULT 'Pcs',
                    quantity INTEGER DEFAULT 0,
                    price DECIMAL(10,2) DEFAULT 0,
                    dist_price DECIMAL(10,2) DEFAULT 0,
                    mrp DECIMAL(10,2) DEFAULT 0,
                    is_active INTEGER DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(admin_id, item_code)
                );

                CREATE TABLE IF NOT EXISTS special_offers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    admin_id INTEGER NOT NULL REFERENCES admins(id),
                    stock_id INTEGER NOT NULL REFERENCES stock(id),
                    offer_text TEXT NOT NULL,
                    discount_percent DECIMAL(5,2) DEFAULT 0,
                    offer_price DECIMAL(10,2),
                    is_active INTEGER DEFAULT 1,
                    start_date TIMESTAMP,
                    end_date TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                CREATE UNIQUE INDEX IF NOT EXISTS idx_offer_stock_admin ON special_offers(admin_id, stock_id);

                CREATE TABLE IF NOT EXISTS orders (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    admin_id INTEGER NOT NULL REFERENCES admins(id),
                    order_number TEXT NOT NULL,
                    customer_id INTEGER NOT NULL REFERENCES customers(id),
                    total_amount DECIMAL(12,2) DEFAULT 0,
                    status TEXT DEFAULT 'pending',
                    notes TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(admin_id, order_number)
                );

                CREATE TABLE IF NOT EXISTS order_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    order_id INTEGER NOT NULL REFERENCES orders(id),
                    stock_id INTEGER NOT NULL REFERENCES stock(id),
                    item_name TEXT NOT NULL,
                    quantity INTEGER NOT NULL,
                    unit_price DECIMAL(10,2) NOT NULL,
                    total_price DECIMAL(12,2) NOT NULL,
                    is_offer_item INTEGER DEFAULT 0,
                    bonus_quantity INTEGER DEFAULT 0,
                    applied_offer TEXT,
                    offer_skipped INTEGER DEFAULT 0,
                    missed_offer_text TEXT,
                    dist_price DECIMAL(10,2) DEFAULT 0,
                    mrp DECIMAL(10,2) DEFAULT 0
                );

                CREATE TABLE IF NOT EXISTS import_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    admin_id INTEGER NOT NULL REFERENCES admins(id),
                    import_type TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    records_count INTEGER DEFAULT 0,
                    status TEXT DEFAULT 'success',
                    message TEXT,
                    imported_by INTEGER REFERENCES admins(id),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

      // Default superadmin
      const row = sqliteDb.prepare('SELECT id FROM admins WHERE username = ?').get('superadmin');
      if (!row) {
        const hashedPassword = bcrypt.hashSync('admin123', 10);
        const uniqueCode = uuidv4().substring(0, 8);
        sqliteDb.prepare(
          'INSERT INTO admins (username, password, name, company_name, unique_code, role) VALUES (?, ?, ?, ?, ?, ?)'
        ).run('superadmin', hashedPassword, 'Super Administrator', 'Platform', uniqueCode, 'superadmin');
        console.log('✅ Default super admin created (username: superadmin, password: admin123)');
      }
      console.log('✅ SQLite Database initialized successfully');
    }
  };
} else {
  // Original PostgreSQL implementation
  const { Pool } = require('pg');
  const poolConfig = process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
    : {
      host: process.env.PGHOST || 'localhost',
      port: process.env.PGPORT || 5432,
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE || 'medical_orders',
    };

  const pool = new Pool(poolConfig);

  db = {
    pool,
    query: (text, params) => pool.query(text, params),
    initialize: async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // (PG table creation logic remains here as in previous db.js...)
        // For brevity, I'm assuming you have the full PG init logic or I can keep the existing one.
        // To be safe, I'll include the essential PG init logic here.
        await client.query(`
                    CREATE TABLE IF NOT EXISTS admins (
                        id SERIAL PRIMARY KEY,
                        username TEXT UNIQUE NOT NULL,
                        password TEXT NOT NULL,
                        name TEXT NOT NULL,
                        company_name TEXT,
                        unique_code TEXT UNIQUE,
                        subdomain TEXT UNIQUE,
                        role TEXT NOT NULL DEFAULT 'admin',
                        is_active INTEGER DEFAULT 1,
                        created_by INTEGER,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                    CREATE TABLE IF NOT EXISTS customers (
                        id SERIAL PRIMARY KEY,
                        admin_id INTEGER NOT NULL REFERENCES admins(id),
                        customer_id_external TEXT,
                        name TEXT NOT NULL,
                        phone TEXT NOT NULL,
                        email TEXT,
                        address TEXT,
                        city TEXT,
                        unique_code TEXT,
                        is_active INTEGER DEFAULT 1,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                    CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_ext_id ON customers(admin_id, customer_id_external);
                    CREATE TABLE IF NOT EXISTS stock (
                        id SERIAL PRIMARY KEY,
                        admin_id INTEGER NOT NULL REFERENCES admins(id),
                        item_code TEXT NOT NULL,
                        item_name TEXT NOT NULL,
                        category TEXT,
                        unit TEXT DEFAULT 'Pcs',
                        quantity INTEGER DEFAULT 0,
                        price DECIMAL(10,2) DEFAULT 0,
                        dist_price DECIMAL(10,2) DEFAULT 0,
                        mrp DECIMAL(10,2) DEFAULT 0,
                        is_active INTEGER DEFAULT 1,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE(admin_id, item_code)
                    );
                    CREATE TABLE IF NOT EXISTS special_offers (
                        id SERIAL PRIMARY KEY,
                        admin_id INTEGER NOT NULL REFERENCES admins(id),
                        stock_id INTEGER NOT NULL REFERENCES stock(id),
                        offer_text TEXT NOT NULL,
                        discount_percent DECIMAL(5,2) DEFAULT 0,
                        offer_price DECIMAL(10,2),
                        is_active INTEGER DEFAULT 1,
                        start_date TIMESTAMP,
                        end_date TIMESTAMP,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                    CREATE UNIQUE INDEX IF NOT EXISTS idx_offer_stock_admin ON special_offers(admin_id, stock_id);
                    CREATE TABLE IF NOT EXISTS orders (
                        id SERIAL PRIMARY KEY,
                        admin_id INTEGER NOT NULL REFERENCES admins(id),
                        order_number TEXT NOT NULL,
                        customer_id INTEGER NOT NULL REFERENCES customers(id),
                        total_amount DECIMAL(12,2) DEFAULT 0,
                        status TEXT DEFAULT 'pending',
                        notes TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE(admin_id, order_number)
                    );
                    CREATE TABLE IF NOT EXISTS order_items (
                        id SERIAL PRIMARY KEY,
                        order_id INTEGER NOT NULL REFERENCES orders(id),
                        stock_id INTEGER NOT NULL REFERENCES stock(id),
                        item_name TEXT NOT NULL,
                        quantity INTEGER NOT NULL,
                        unit_price DECIMAL(10,2) NOT NULL,
                        total_price DECIMAL(12,2) NOT NULL,
                        is_offer_item INTEGER DEFAULT 0,
                        bonus_quantity INTEGER DEFAULT 0,
                        applied_offer TEXT,
                        offer_skipped INTEGER DEFAULT 0,
                        missed_offer_text TEXT,
                        dist_price DECIMAL(10,2) DEFAULT 0,
                        mrp DECIMAL(10,2) DEFAULT 0
                    );
                    CREATE TABLE IF NOT EXISTS import_logs (
                        id SERIAL PRIMARY KEY,
                        admin_id INTEGER NOT NULL REFERENCES admins(id),
                        import_type TEXT NOT NULL,
                        filename TEXT NOT NULL,
                        records_count INTEGER DEFAULT 0,
                        status TEXT DEFAULT 'success',
                        message TEXT,
                        imported_by INTEGER REFERENCES admins(id),
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                `);

        const res = await client.query('SELECT id FROM admins WHERE username = $1', ['superadmin']);
        if (res.rowCount === 0) {
          const hashedPassword = bcrypt.hashSync('admin123', 10);
          const uniqueCode = uuidv4().substring(0, 8);
          await client.query(
            'INSERT INTO admins (username, password, name, company_name, unique_code, role) VALUES ($1, $2, $3, $4, $5, $6)',
            ['superadmin', hashedPassword, 'Super Administrator', 'Platform', uniqueCode, 'superadmin']
          );
        }

        await client.query('COMMIT');
        console.log('✅ PostgreSQL Database initialized successfully');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
    prepare: (text) => ({
      get: async (params) => {
        const res = await pool.query(text, params);
        return res.rows[0];
      },
      all: async (params) => {
        const res = await pool.query(text, params);
        return res.rows;
      },
      run: async (params) => {
        const res = await pool.query(text, params);
        return { lastInsertRowid: res.insertId, changes: res.rowCount };
      }
    })
  };
}

module.exports = {
  ...db,
  getDb: () => db
};
