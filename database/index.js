require('dotenv').config();
const DB_TYPE = process.env.DB_TYPE || 'postgres';

console.log(`📡 Database Driver: ${DB_TYPE.toUpperCase()}`);

if (DB_TYPE === 'sqlite') {
  module.exports = require('./sqlite.wrapper');
} else {
  module.exports = require('./postgres');
}
