#!/usr/bin/env bash
#
# Clone the production SCHEMA into a second Supabase project.
#
# Schema only. No customer rows, no vehicles, no invoices, no auth users. The
# point of the second project is a place where the test suite can create and
# destroy data freely, and copying real customer records into it would defeat
# that on day one — it would just be production with a different URL.
#
# What this does NOT carry across, because pg_dump does not put it in a schema
# dump, and each needs a deliberate decision:
#
#   * auth.users        — sign up on staging instead; that exercises the real
#                         provisioning path, which is worth testing anyway
#   * storage buckets   — rows in storage.buckets, created by the seed script
#   * secrets / vault   — never copy these; staging gets its own
#   * edge functions    — deployed per project, not stored in the database
#
# Usage:
#
#   export PROD_DB_URL='postgresql://postgres.<ref>:<password>@<host>:5432/postgres'
#   export STAGING_DB_URL='postgresql://postgres.<ref>:<password>@<host>:5432/postgres'
#   bash scripts/clone-schema-to-staging.sh
#
# Both URLs contain passwords. Export them in your shell; do not put them in a
# file, do not paste them into a commit, and do not echo them. This script
# never prints either one.

set -euo pipefail

PRODUCTION_REF='ldjrlvjkmzrcdqhetqoh'
DUMP_FILE="${DUMP_FILE:-supabase/schema-snapshot.sql}"

fail() { echo "ERROR: $*" >&2; exit 1; }

[[ -n "${PROD_DB_URL:-}" ]]    || fail "PROD_DB_URL is not set."
[[ -n "${STAGING_DB_URL:-}" ]] || fail "STAGING_DB_URL is not set."

# Refs are extracted purely to compare them. Neither URL is ever printed.
ref_of() { sed -E 's#.*postgres\.([a-z0-9]+):.*#\1#' <<<"$1"; }
PROD_REF="$(ref_of "$PROD_DB_URL")"
STAGING_REF="$(ref_of "$STAGING_DB_URL")"

[[ "$PROD_REF" == "$PRODUCTION_REF" ]] \
  || fail "PROD_DB_URL does not point at the known production project. Refusing to guess which database is which."

# The whole safety of this script is one comparison: the target must not be
# production. A dump applied to the source instead of the target is the shape
# of accident that ends a business.
[[ "$STAGING_REF" != "$PRODUCTION_REF" ]] \
  || fail "STAGING_DB_URL points at PRODUCTION ($PRODUCTION_REF). Refusing."
[[ -n "$STAGING_REF" && "$STAGING_REF" != "$STAGING_DB_URL" ]] \
  || fail "Could not read a project ref out of STAGING_DB_URL. Expected postgresql://postgres.<ref>:..."

echo "Source: $PROD_REF (production, read-only)"
echo "Target: $STAGING_REF"
echo

# ── 1. Dump ─────────────────────────────────────────────────────────────────
# --schema-only is doing the work here. Without it this becomes a copy of every
# customer record the shop has.
echo "Dumping production schema (no data)…"
npx supabase db dump --db-url "$PROD_DB_URL" --schema-only -f "$DUMP_FILE"

# Role-level grants and RLS policies live in the same dump, but verify rather
# than assume — a clone missing its policies is a database with no tenancy
# boundary, and it would look perfectly healthy until two shops saw each other.
POLICIES="$(grep -c 'CREATE POLICY' "$DUMP_FILE" || true)"
TABLES="$(grep -c 'CREATE TABLE' "$DUMP_FILE" || true)"
FUNCTIONS="$(grep -c 'CREATE FUNCTION\|CREATE OR REPLACE FUNCTION' "$DUMP_FILE" || true)"

echo "  $TABLES tables, $POLICIES policies, $FUNCTIONS functions"
[[ "$POLICIES" -gt 0 ]] || fail "The dump contains no RLS policies. Something is wrong — stopping before applying it."
[[ "$TABLES"   -gt 0 ]] || fail "The dump contains no tables. Stopping."

# ── 2. Apply ────────────────────────────────────────────────────────────────
echo
echo "Applying to $STAGING_REF…"
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f "$DUMP_FILE"

# ── 3. Report ───────────────────────────────────────────────────────────────
echo
echo "Applied. Verify parity before trusting it:"
echo "  psql \"\$STAGING_DB_URL\" -f scripts/verify-schema-parity.sql"
echo "  psql \"\$PROD_DB_URL\"    -f scripts/verify-schema-parity.sql"
echo
echo "The two outputs should match. Then seed the buckets:"
echo "  psql \"\$STAGING_DB_URL\" -f scripts/seed-staging-buckets.sql"
