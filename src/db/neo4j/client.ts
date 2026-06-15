import dotenv from 'dotenv';
import neo4j from 'neo4j-driver';

dotenv.config();

const NEO4J_HOST = process.env.NEO4J_HOST;
const NEO4J_PORT = process.env.NEO4J_PORT || '7687';
const NEO4J_DB_NAME = process.env.NEO4J_DB_NAME || 'neo4j';

if (!NEO4J_HOST) {
  throw new Error('NEO4J_HOST is not set in environment');
}

const uri = `bolt://${NEO4J_HOST}:${NEO4J_PORT}`;
const driver = neo4j.driver(
  uri,
  neo4j.auth.basic(process.env.NEO4J_USER || '', process.env.NEO4J_PASS || ''),
);

export function getDriver() {
  return driver;
}

export function getSession(database: string = NEO4J_DB_NAME) {
  return driver.session({ database });
}

export async function closeDriver() {
  await driver.close();
}
