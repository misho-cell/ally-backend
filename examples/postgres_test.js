#!/usr/bin/env node
const dotenv = require('dotenv');
dotenv.config();
const { Client } = require('pg');

const {
  POSTGRES_HOST,
  POSTGRES_PORT = '5432',
  POSTGRES_DB = 'postgres',
  POSTGRES_NAME,
  POSTGRES_PASS,
  POSTGRES_SSL = 'true',
} = process.env;

if (!POSTGRES_HOST || !POSTGRES_NAME || !POSTGRES_PASS) {
  console.error('Missing POSTGRES_* env vars. Please set POSTGRES_HOST, POSTGRES_NAME, and POSTGRES_PASS.');
  process.exit(1);
}

const ssl = POSTGRES_SSL.toLowerCase() !== 'false' ? { rejectUnauthorized: false } : false;

const client = new Client({
  host: POSTGRES_HOST,
  port: Number(POSTGRES_PORT),
  database: POSTGRES_DB,
  user: POSTGRES_NAME,
  password: POSTGRES_PASS,
  ssl,
});

async function runTest() {
  try {
    await client.connect();
    const res = await client.query('SELECT 1 AS value');
    const value = res.rows[0].value;
    console.log('Connected to Postgres:', POSTGRES_HOST, 'DB:', POSTGRES_DB);
    console.log('Query result:', value);
    process.exitCode = 0;
  } catch (err) {
    console.error('Postgres connection/query error:', err.message || err);
    process.exitCode = 2;
  } finally {
    await client.end();
  }
}

runTest();
