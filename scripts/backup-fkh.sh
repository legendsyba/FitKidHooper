#!/usr/bin/env bash
# Take a full, restorable snapshot of the FKH Supabase project to local disk.
#
# The Free plan has no automated backups and does not let you download Supabase's
# own. That only rules out *their* backups — nothing stops us dumping the database
# ourselves, which is what this does. Run it weekly, and before anything risky.
#
#   ./scripts/backup-fkh.sh
#
# What it writes, into backups/<timestamp>/ :
#   roles.sql    cluster roles
#   schema.sql   public schema DDL
#   data.sql     public schema rows
#   auth.sql     auth.users and friends — WITHOUT THIS NOBODY CAN LOG IN AFTER A
#                RESTORE, because password hashes live here and nowhere else
#   storage/     every object in every bucket (avatars, training videos)
#   MANIFEST.txt what was captured, and how to put it back
#
# ─────────────────────────────────────────────────────────────────────────────
# THE OUTPUT CONTAINS CHILDREN'S PERSONAL DATA: names, parent email addresses,
# consent records, password hashes. This repository is PUBLIC. backups/ is
# gitignored and this script refuses to run if that ever stops being true.
# Keep the files encrypted at rest and off shared drives.
# ─────────────────────────────────────────────────────────────────────────────
#
# Requires, in .env.local (gitignored):
#   SUPABASE_DB_PASSWORD=...       from Supabase → Project Settings → Database.
#                                  Without it pg_dump stops at an interactive
#                                  prompt, which in a scheduled job looks exactly
#                                  like a backup that is running fine.
#
# The project must also be linked:
#   supabase link --project-ref jjwaspyuldkwasfyrqbw
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env.local"
OUT_ROOT="${FKH_BACKUP_DIR:-$ROOT/backups}"
STAMP="$(date +%Y-%m-%dT%H-%M-%S)"
OUT="$OUT_ROOT/$STAMP"

read_env() {
  [[ -f "$ENV_FILE" ]] || return 0
  sed -n "s/^$1=//p" "$ENV_FILE" | head -1 | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

# Refuse to write personal data anywhere git might pick it up.
if ! git -C "$ROOT" check-ignore -q "$OUT_ROOT" 2>/dev/null; then
  echo "REFUSING TO RUN: $OUT_ROOT is not gitignored." >&2
  echo "These dumps contain children's names, parent emails and password hashes," >&2
  echo "and this repository is public. Add it to .gitignore first." >&2
  exit 1
fi

if [[ -z "${SUPABASE_DB_PASSWORD:-}" ]]; then
  SUPABASE_DB_PASSWORD="$(read_env SUPABASE_DB_PASSWORD)"
fi
if [[ -z "$SUPABASE_DB_PASSWORD" ]]; then
  echo "Missing SUPABASE_DB_PASSWORD (checked the environment and .env.local)." >&2
  echo "Supabase Dashboard → Project Settings → Database → Database password." >&2
  echo "Then add it to .env.local as SUPABASE_DB_PASSWORD=..." >&2
  exit 1
fi
export SUPABASE_DB_PASSWORD

# FKH lives in the Legends org now, which the machine-wide supabase login reaches.
SUPA="supabase"

mkdir -p "$OUT/storage"
echo "→ backing up to $OUT"

echo "  roles"
$SUPA db dump --linked --role-only -f "$OUT/roles.sql"

echo "  public schema"
$SUPA db dump --linked -f "$OUT/schema.sql"

echo "  public data"
$SUPA db dump --linked --data-only -f "$OUT/data.sql"

# auth is a separate schema and is NOT in the default dump. Skipping it produces a
# backup that restores every row of training history against zero accounts able to
# reach it.
echo "  auth + storage metadata"
$SUPA db dump --linked --data-only --schema auth,storage -f "$OUT/auth.sql"

echo "  storage objects"
# `storage ls` answers with JSON: {"paths":["fkh-videos/","fkh-avatars/"], ...}
BUCKETS="$($SUPA storage ls --linked --experimental 2>/dev/null | python3 -c '
import sys, json
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)
for p in d.get("paths", []):
    print(p.strip("/"))
' || true)"
if [[ -z "$BUCKETS" ]]; then
  echo "    (no buckets listed — check the CLI can reach the project)" >&2
else
  while IFS= read -r bucket; do
    echo "    $bucket"
    # cp recreates the bucket folder itself, so copy into storage/ — passing
    # storage/$bucket lands everything at storage/<bucket>/<bucket>/…
    $SUPA storage cp -r "ss:///$bucket" "$OUT/storage" --linked --experimental >/dev/null
  done <<< "$BUCKETS"
fi

{
  echo "Fit Kid Hooper — Supabase snapshot"
  echo "taken:  $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
  echo "by:     $(whoami)@$(hostname)"
  echo
  echo "contents:"
  ( cd "$OUT" && find . -type f | sort | sed 's/^/  /' )
  echo
  echo "restore order: roles.sql → schema.sql → data.sql → auth.sql → storage/"
  echo "auth.sql is not optional; password hashes live there and nowhere else."
} > "$OUT/MANIFEST.txt"

# Keep the newest plus three prior and drop the rest — about a month of weekly
# cover, ~190MB. A snapshot is ~47MB, almost all of it training videos that
# rarely change, so unbounded weekly runs quietly eat a couple of GB a year.
KEEP="${FKH_BACKUP_KEEP:-4}"
PRUNED=0
while IFS= read -r old; do
  rm -rf "$old"
  PRUNED=$((PRUNED + 1))
done < <(ls -1d "$OUT_ROOT"/*/ 2>/dev/null | sort -r | tail -n +$((KEEP + 1)))

echo
echo "✓ done — $(du -sh "$OUT" | cut -f1) in $OUT"
[[ "$PRUNED" -gt 0 ]] && echo "  pruned $PRUNED older snapshot(s), keeping $KEEP"
echo "  Keep it encrypted. It contains personal data about children."
