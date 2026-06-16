#!/bin/bash

CSV="$HOME/connectivity-log.csv"
DB="$HOME/connectivity.db"

# Create DB + table if it doesn't exist
sqlite3 "$DB" <<EOF
CREATE TABLE IF NOT EXISTS log (
  timestamp TEXT NOT NULL,
  status TEXT NOT NULL,
  ping_ms REAL
);
EOF

# Import new rows from CSV (skip header, ignore dupes)
tail -n +2 "$CSV" | sqlite3 "$DB" \
  -cmd ".mode csv" \
  -cmd ".import /dev/stdin log"