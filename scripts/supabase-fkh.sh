#!/usr/bin/env bash
# Run the Supabase CLI against the FKH project using a repo-scoped access token.
#
# The machine-wide `supabase login` belongs to the legendsyba account, which cannot
# see the FKH project while it still lives in the rcarrier32 org. Rather than flip
# that global credential — the legendsyba repo relies on it, and its AGENTS.md has a
# hard guardrail against account confusion — this wrapper exports an rcarrier32 token
# for the duration of one command. Mirrors scripts/supabase-legends.sh in that repo.
#
# One-time setup:
#   1. Sign in to https://supabase.com/dashboard/account/tokens as rcarrier32
#   2. Generate a token named something like "fkh-cli"
#   3. Add it to .env.local (gitignored) as:
#        SUPABASE_CLI_ACCESS_TOKEN=sbp_...
#
# Usage:
#   ./scripts/supabase-fkh.sh projects list
#   ./scripts/supabase-fkh.sh functions deploy send-push --project-ref jjwaspyuldkwasfyrqbw
#   ./scripts/supabase-fkh.sh secrets list --project-ref jjwaspyuldkwasfyrqbw
#
# Once the project transfers into the Legends org, the plain `supabase` login reaches
# it directly — delete this script and revoke the token.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env.local}"
FKH_SUPABASE_REF="${FKH_SUPABASE_REF:-jjwaspyuldkwasfyrqbw}"
export FKH_SUPABASE_REF

read -r TOKEN < <(python3 <<PY
from pathlib import Path
p = Path("$ENV_FILE")
if not p.exists():
    print("")
    raise SystemExit(0)
vals = {}
for line in p.read_text().splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, v = line.split("=", 1)
    vals[k.strip()] = v.strip().strip('"').strip("'")
print(vals.get("SUPABASE_CLI_ACCESS_TOKEN", ""))
PY
)

if [[ -z "$TOKEN" ]]; then
  echo "Missing SUPABASE_CLI_ACCESS_TOKEN in $ENV_FILE."
  echo "Create one at https://supabase.com/dashboard/account/tokens while signed in as"
  echo "rcarrier32, then add it to .env.local as:"
  echo "  SUPABASE_CLI_ACCESS_TOKEN=sbp_..."
  exit 1
fi

export SUPABASE_ACCESS_TOKEN="$TOKEN"
exec supabase "$@"
