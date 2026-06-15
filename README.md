# ally-backend

Quick notes for local development.

## Neo4j connection test

A small test script is included at `examples/neo4j_test.js` that uses `dotenv` and `neo4j-driver` to verify connectivity.

Create a `.env` file in the project root with your Neo4j credentials (DO NOT commit this file):

NEO4J_HOST=46.224.233.89
NEO4J_PORT=7687
NEO4J_DB_NAME=neo4j
NEO4J_USER=neo4j
NEO4J_PASS=r6xJbKHz86s6

Run the test:

```bash
# install deps (if not already installed)
npm install

# run using the .env file
npm run test:neo4j

# or run inline without .env
NEO4J_HOST=46.224.233.89 NEO4J_PORT=7687 NEO4J_DB_NAME=neo4j NEO4J_USER=neo4j NEO4J_PASS='r6xJbKHz86s6' node examples/neo4j_test.js
```

Security: keep `.env` out of version control (add to `.gitignore`) and rotate credentials if shared.

## Postgres connection test

A small test script is included at `examples/postgres_test.js` that uses `dotenv` and `pg` to verify connectivity.

Add Postgres credentials to your `.env` file:

POSTGRES_HOST=aurora-db-ally-api.cluster-cuqs7syzcx2e.eu-central-1.rds.amazonaws.com
POSTGRES_PORT=5432
POSTGRES_DB=postgres
POSTGRES_NAME=allyPgDbpostgres
POSTGRES_PASS=AMNH679GBQYqtyh34786w8924LALAb67cvbmy
POSTGRES_SSL=true

Run the test:

```bash
# install deps (if not already installed)
npm install

# run using the .env file
npm run test:postgres

# or run inline without .env
POSTGRES_HOST=aurora-db-ally-api.cluster-cuqs7syzcx2e.eu-central-1.rds.amazonaws.com POSTGRES_PORT=5432 POSTGRES_DB=postgres POSTGRES_NAME=allyPgDbpostgres POSTGRES_PASS='AMNH679GBQYqtyh34786w8924LALAb67cvbmy' node examples/postgres_test.js
```

Security: keep `.env` out of version control (add to `.gitignore`) and rotate credentials if shared.
