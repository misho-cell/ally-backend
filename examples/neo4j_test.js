#!/usr/bin/env node
const dotenv = require('dotenv');
dotenv.config();
const neo4j = require('neo4j-driver');

const {
  NEO4J_HOST,
  NEO4J_PORT = '7687',
  NEO4J_DB_NAME = 'neo4j',
  NEO4J_USER,
  NEO4J_PASS,
} = process.env;

if (!NEO4J_HOST || !NEO4J_USER || !NEO4J_PASS) {
  console.error('Missing NEO4J_* env vars. Please set NEO4J_HOST, NEO4J_USER and NEO4J_PASS.');
  process.exit(1);
}

const uri = `bolt://${NEO4J_HOST}:${NEO4J_PORT}`;
const driver = neo4j.driver(uri, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS));

async function runTest() {
  const session = driver.session({ database: NEO4J_DB_NAME });
  try {
    const result = await session.run('RETURN 1 AS value');
    const record = result.records[0];
    const value = record.get('value');
    console.log('Connected to Neo4j:', NEO4J_HOST, 'DB:', NEO4J_DB_NAME);
    console.log('Query result:', value.toNumber ? value.toNumber() : value);
    process.exitCode = 0;
  } catch (err) {
    console.error('Neo4j connection/query error:', err && err.message ? err.message : err);
    process.exitCode = 2;
  } finally {
    await session.close();
    await driver.close();
  }
}

runTest();
