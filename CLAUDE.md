# RedlineD1 — Claude Code Operating Context

## Project

**RedlineD1** — Next.js App Router + TypeScript + Supabase automotive shop management platform for D1 Imports, a two-location auto repair business in Laos.

- **Production:** redlined1.com (Vercel, auto-deploys from GitHub `main`)
- **Repo:** `C:\Users\wallyd1\REDLINE`
- **Supabase project:** `redlined1` in `d1group` org

---

## Production Shop IDs

| Shop | UUID |
|------|------|
| D1 Imports (Shop 1) | `38d55fae-741b-4bac-b520-f96eed65bf38` |
| D1 Imports — Location 2 (Shop 2) | `90b72748-bf01-4456-999f-f4ba48091606` |

Both shops are linked bidirectionally via the `shop_mirrors` table.

**Query rule:**
- `getShopIds()` — for all SELECT filters (returns active shop + mirrored shops)
- `getShopId()` — for INSERT `shop_id` only (active shop only)

---

## Hard Constraints

These are non-negotiable. Never violate without explicit written approval from the owner.

1. **Production stability always wins.** Never break Job Cards, Estimates, Repair Orders, Invoices, Payments, or any staff daily workflow.
2. **No AI in product code.** No AI chat, voice AI, embeddings, OpenAI API, Claude API, or external LLM calls unless explicitly approved per feature.
3. **Provider abstraction only.** RedlineD1 must never hard-depend on a single AI platform. Use the Intelligence Provider abstraction layer.
4. **Billing off by default.** `NEXT_PUBLIC_BILLING_ENABLED=false` until commercial billing is explicitly activated by the owner.
5. **No secrets in source.** No API keys, tokens, or credentials in committed code.
6. **Do not block D1 internal shops.** Internal shop access must never be gated.
7. **No destructive SQL on production.** No `DROP`, `TRUNCATE`, or data-deleting migrations without explicit approval and a tested rollback.
8. **VIN is shop-private.** Never expose VIN in shared, public, or cross-shop contexts.
9. **`share_to_network` stays false.** Global data sharing must not be enabled by default.
10. **Feature flags required.** Every experimental feature must be behind a flag. Disabled by default.
11. **Fire-and-forget for hooks.** Intelligence, billing, and event hooks must be wrapped in `try/catch` and must never block the main workflow.
12. **Resilience required.** If any intelligence provider, billing system, or external service is offline, RedlineD1 must continue operating normally.

---

## Development Workflow

### Before every commit

```
1. npx tsc --noEmit          # TypeScript must pass clean
2. npm run build             # Build must succeed
3. Run relevant tests        # When available
4. Review changed files      # git diff --stat
5. git commit locally        # Commit with a clear message
```

### Push policy

- **Do NOT push to `main`/production automatically.**
- For normal work: commit locally and report what changed. Wait for approval.
- For hotfixes: state the change and ask "Shall I push?" before running `git push`.
- Push is only allowed when the user explicitly says **"push"**, **"deploy"**, or **"go ahead and push"**.

### Windows environment

- This is a **Windows 11** machine.
- Use **PowerShell** for bulk file operations, loops, and multi-file replacements.
- Do not use Bash-only syntax (no `&&` chaining, no `/dev/null`, no `grep -P`).
- Git Bash is available for simple git commands only.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14+ App Router |
| Language | TypeScript (strict mode) |
| UI | React 19, custom CSS variables |
| Database | Supabase PostgreSQL with RLS |
| Auth | Supabase Auth |
| File imports | SheetJS (XLSX) |
| Deployment | Vercel (main branch) |
| Currency | USD + THB (mixed per line item on estimates) |
| Languages | English + Lao (ລາວ) bilingual documents |

---

## Recent Completed Work

- **Shop mirror** — both D1 shops share all data bidirectionally via `shop_mirrors` table; `⇄` toggle in sidebar
- **Parts bulk XLS import** — smart header detection skips title/dashboard rows; column alias mapping (SKU→part_number, QTY→quantity, etc.)
- **Estimate phantom $10 fix** — `shop_supplies` removed from calculation; `taxRate` defaults to 0; tax/discount rows hidden when zero
- **Vehicle intake sync** — completing triage now auto-registers the vehicle in Vehicle Management
- **Multi-currency estimates** — THB + USD per line item; multi-currency totals display correctly
- **Feature flags system** — complete
- **Observability** — complete
- **Playwright regression framework** — complete
- **Commercial billing scaffold** — complete but disabled (`NEXT_PUBLIC_BILLING_ENABLED=false`)
- **Intelligence Provider abstraction** — complete
- **Intelligence Bus** — complete
- **D1 Command Center UI** — live
- **Live Intelligence Pipeline** — feeding Command Center metrics

---

## Pending / Not Yet Active

- Staging environment: Vercel env vars + Namecheap CNAME still needed (5 steps remain)
- Commercial Creem billing: scaffolded, not live
- Billing enforcement: disabled
- Sapelee integration: not connected (provider abstraction ready)
- AI/LLM in product code: not enabled

---

## Next Recommended Phase

**SI-5 — Evidence Engine + Actionable Recommendations**

Transform the D1 Command Center from a metrics dashboard into a decision dashboard.

Every recommendation must answer:
1. **What** should the owner do?
2. **Why** does it matter?
3. **What evidence** supports it? (specific records, counts, amounts)
4. **What revenue or risk impact** is expected?
5. **What action** can the owner take next? (direct link or button)

> **Do not implement SI-5 until explicitly instructed.**

---

## Cross-Reference

- `CLAUDE.md` — root operating instructions for Claude Code (this file)
- `docs/development/CLAUDE_CODE_CONTEXT.md` — human-readable archive of the same context
