#!/bin/bash
set -e

PROJECT=vibehub-490503
INSTANCE="$PROJECT:us-west1:vibehub-db"

DB_PASS=$(gcloud secrets versions access latest --secret=DATABASE_PASSWORD --project="$PROJECT")
ENCODED=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$DB_PASS")

echo -n "postgresql://postgres:${ENCODED}@/vibehub?host=/cloudsql/${INSTANCE}" | \
  gcloud secrets versions add DATABASE_URL --data-file=- --project="$PROJECT"

echo "DATABASE_URL secret updated."
