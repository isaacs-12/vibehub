#!/bin/bash
set -e

PROJECT=vibehub-490503
INSTANCE="$PROJECT:us-west1:vibehub-db"

# Kill any existing proxy
lsof -ti:5499 | xargs kill -9 2>/dev/null || true
sleep 1

# Start proxy
cloud-sql-proxy "$INSTANCE" --port 5499 &
PROXY_PID=$!
sleep 3

# Get and encode password
DB_PASS=$(gcloud secrets versions access latest --secret=DATABASE_PASSWORD --project="$PROJECT")
ENCODED=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$DB_PASS")

# Grant permissions to IAM users
node -e "
const pg = require('pg');
const client = new pg.Client('postgresql://postgres:${ENCODED}@localhost:5499/vibehub');

async function run() {
  await client.connect();
  const grants = [
    'GRANT ALL ON SCHEMA public TO \"isaacmckeesmith@gmail.com\"',
    'GRANT ALL ON ALL TABLES IN SCHEMA public TO \"isaacmckeesmith@gmail.com\"',
    'GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO \"isaacmckeesmith@gmail.com\"',
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO \"isaacmckeesmith@gmail.com\"',
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO \"isaacmckeesmith@gmail.com\"',
    'GRANT ALL ON SCHEMA public TO \"vibehub-backend@vibehub-490503.iam\"',
    'GRANT ALL ON ALL TABLES IN SCHEMA public TO \"vibehub-backend@vibehub-490503.iam\"',
    'GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO \"vibehub-backend@vibehub-490503.iam\"',
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO \"vibehub-backend@vibehub-490503.iam\"',
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO \"vibehub-backend@vibehub-490503.iam\"',
  ];
  for (const sql of grants) {
    try {
      await client.query(sql);
      console.log('OK:', sql.substring(0, 60) + '...');
    } catch (e) {
      console.error('FAIL:', e.message);
    }
  }
  await client.end();
}
run();
"

# Cleanup
kill $PROXY_PID 2>/dev/null || true
