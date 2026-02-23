require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
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

const db = {
  pool,
  query: (text, params) => pool.query(text, params),
  initialize: async () => {
    console.log('🔄 Attempting to connect to PostgreSQL...');
    let client;
    try {
      client = await pool.connect();
      console.log('✅ Connected to PostgreSQL pool');
      await client.query('BEGIN');

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
        console.log('✅ Default super admin created (username: superadmin, password: admin123)');
      }

      await client.query('COMMIT');
      console.log('✅ PostgreSQL Database initialized successfully');
    } catch (err) {
      if (client) await client.query('ROLLBACK');
      console.error('❌ PostgreSQL Initialization Error:', err);
      throw err;
    } finally {
      if (client) client.release();
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

module.exports = {
  ...db,
  getDb: () => db
};
