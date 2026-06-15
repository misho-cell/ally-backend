require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function run() {
  const pool = new Pool({
    host: process.env.POSTGRES_HOST,
    port: Number(process.env.POSTGRES_PORT) || 5432,
    database: process.env.POSTGRES_DB || 'postgres',
    user: process.env.POSTGRES_NAME,
    password: process.env.POSTGRES_PASS,
    max: 1,
    ssl:
      process.env.POSTGRES_SSL && process.env.POSTGRES_SSL.toLowerCase() !== 'false'
        ? { rejectUnauthorized: false }
        : false,
  });

  try {
    const sqlPath = path.join(__dirname, '..', 'migrations', '001_create_users_table.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await pool.query(sql);
    console.log('Migration applied successfully');
  } catch (err) {
    console.error('Migration failed:', err.message || err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
