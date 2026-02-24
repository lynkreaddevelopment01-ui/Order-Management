const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}

const DB_PATH = path.join(dataDir, 'medical_orders.db');
let database;

function getDb() {
    if (!database) {
        database = new Database(DB_PATH);
        database.pragma('journal_mode = WAL');
        database.pragma('foreign_keys = ON');
    }
    return database;
}

const db = {
    getDb,
    initialize: async () => {
        const sqliteDb = require('./sqlite.js');
        return sqliteDb.initialize();
    },
    query: async (text, params) => {
        const d = getDb();
        return d.prepare(text).run(params);
    },
    prepare: (text) => {
        const d = getDb();
        const stmt = d.prepare(text);
        return {
            get: async (params) => stmt.get(params),
            all: async (params) => stmt.all(params),
            run: async (params) => {
                const res = stmt.run(params);
                return { insertId: res.lastInsertRowid, rowsAffected: res.changes };
            }
        };
    },
    // Mocking a pool-like structure for transactions if needed
    pool: {
        connect: async () => {
            const d = getDb();
            return {
                query: async (text, params) => {
                    // better-sqlite3 uses ? instead of $1
                    const sql = text.replace(/\$(\d+)/g, '?');
                    const stmt = d.prepare(sql);
                    if (sql.trim().toUpperCase().startsWith('SELECT')) {
                        const rows = stmt.all(params);
                        return { rows };
                    } else {
                        const res = stmt.run(params);
                        return { insertId: res.lastInsertRowid, rowsAffected: res.changes };
                    }
                },
                release: () => { }
            };
        }
    }
};

module.exports = db;
