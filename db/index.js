const { Pool } = require('pg');
require('dotenv').config();

const dbConfig = {
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
};

// Only add password if it's explicitly set by the user, avoiding the SCRAM undefined crash
if (process.env.DB_PASSWORD) {
  dbConfig.password = process.env.DB_PASSWORD;
}

const pool = new Pool(dbConfig);

module.exports = {
  query: (text, params) => pool.query(text, params),
};
