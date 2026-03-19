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

# Query tables
node -e "
const pg = require('pg');
const client = new pg.Client('postgresql://postgres:${ENCODED}@localhost:5499/vibehub');
client.connect().then(() =>
  client.query(\"SELECT tablename FROM pg_tables WHERE schemaname='public'\")
).then(r => { console.log('Tables:', r.rows); client.end(); })
.catch(e => { console.error(e.message); client.end(); });
"

# Cleanup
kill $PROXY_PID 2>/dev/null || true
