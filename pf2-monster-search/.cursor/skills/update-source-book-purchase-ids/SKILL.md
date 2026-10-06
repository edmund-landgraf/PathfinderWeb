---
name: update-source-book-purchase-ids
description: >-
  Finds pf2.SourceBook rows with NULL SourcePurchaseID, searches store.paizo.com
  by source name, inserts or reuses pf2.SourceBookPurchase rows, and links the FK.
  Use when the user asks to update SourcePurchaseID, fill missing Paizo purchase
  links, refresh source book purchase mappings, or run the sourceBookPurchaseIDs workflow.
---

# Update SourceBookPurchase IDs

Multi-step workflow for linking `pf2.SourceBook.SourcePurchaseID` to `pf2.SourceBookPurchase`.

## Prerequisites

1. Schema must exist. If not, run first:
   - `server/scripts/create_source_book_purchase.sql`
2. SQL auth from `server/`:
   - Windows auth: `$env:SQL_TRUSTED_CONNECTION="true"`
   - Or set `SQL_USER` / `SQL_PASSWORD` in `server/.env`
3. Run commands from `server/` directory.

## Workflow

Copy this checklist and track progress:

```text
Task Progress:
- [ ] Step 1: Confirm schema (SourceBookPurchase + SourcePurchaseID)
- [ ] Step 2: Preview null rows and proposed matches (--dry-run)
- [ ] Step 3: Apply updates (insert purchase rows + link IDs)
- [ ] Step 4: Verify counts and review low-confidence links
```

### Step 1: Confirm schema

```powershell
cd server
$env:SQL_TRUSTED_CONNECTION="true"
node -e "import { getPool } from './src/db.js'; const p=await getPool(); const r=await p.request().query(`SELECT COUNT(*) AS NullLinks FROM pf2.SourceBook WHERE SourcePurchaseID IS NULL`); console.table(r.recordset); process.exit(0);"
```

If `create_source_book_purchase.sql` has not been run, run it before continuing.

### Step 2: Preview matches (no writes)

```powershell
cd server
$env:SQL_TRUSTED_CONNECTION="true"
node scripts/update_source_book_purchase_ids.mjs --dry-run
```

Optional flags:

| Flag | Default | Purpose |
|------|---------|---------|
| `--dry-run` | off | Search Paizo and report only; no INSERT/UPDATE |
| `--limit=N` | all null rows | Process first N unlinked source books |
| `--min-score=N` | 50 | Minimum match score before linking |

Review JSON output:

- `linked` / `would_link`: good candidates
- `no_match`: Paizo search returned nothing useful
- `low_score`: matches found but below threshold
- `createdPurchase`: new row added to `SourceBookPurchase`
- `purchasesReused`: existing `StoreUrl` reused

### Step 3: Apply updates

```powershell
cd server
$env:SQL_TRUSTED_CONNECTION="true"
node scripts/update_source_book_purchase_ids.mjs
```

For conservative auto-linking:

```powershell
node scripts/update_source_book_purchase_ids.mjs --min-score=80
```

What the script does for each `SourceBook` row where `SourcePurchaseID IS NULL`:

1. Search `https://store.paizo.com/search.php` using the source book name
2. Score results and pick the best candidate
3. Fetch product JSON-LD (name, price, long description) from the product page
4. `INSERT` into `pf2.SourceBookPurchase` when `StoreUrl` is new
5. `UPDATE pf2.SourceBook SET SourcePurchaseID = ...`

### Step 4: Verify

```powershell
node scripts/update_source_book_purchase_ids.mjs --dry-run --limit=5
```

Or query SQL:

```sql
SELECT
    sb.SourceBookId,
    sb.Name,
    sb.SourcePurchaseID,
    sbp.Name AS PurchaseName,
    sbp.StoreUrl,
    sbp.Price
FROM pf2.SourceBook sb
LEFT JOIN pf2.SourceBookPurchase sbp
  ON sbp.SourceBookPurchaseId = sb.SourcePurchaseID
WHERE sb.SourcePurchaseID IS NULL
ORDER BY sb.Name;
```

## Schema reference

**`pf2.SourceBook`**

- `SourceBookId` — existing PK
- `Name` — Archives of Nethys source name
- `SourcePurchaseID` — nullable FK to `pf2.SourceBookPurchase`

**`pf2.SourceBookPurchase`**

- `SourceBookPurchaseId` — `INT IDENTITY(1,1)` PK
- `Name` — Paizo product title
- `StoreUrl` — unique Paizo store URL
- `LongDescription` — product description
- `Price` — `DECIMAL(10,2)`

## Match quality notes

- Adventure Path volumes (`Pathfinder #179: ...`) usually match well.
- Generic names (`Bestiary`, `Player Core`) may match accessories/PDFs/minis — use `--dry-run` first.
- PFS scenarios, web supplements, and free articles often have no store product — expect remaining NULLs.
- If a wrong link was applied, set `SourcePurchaseID = NULL` for that row and rerun with a higher `--min-score`, or update manually.

## Related scripts

| Script | Purpose |
|--------|---------|
| `server/scripts/update_source_book_purchase_ids.mjs` | Main incremental workflow (this skill) |
| `server/scripts/create_source_book_purchase.sql` | One-time schema setup |
| `server/scripts/seed_source_book_purchase.sql` | Bulk seed all known Paizo URLs |
| `server/scripts/update_source_book_purchase_ids.sql` | Bulk SQL link from precomputed URL map |
| `server/scripts/match_source_purchase_urls.mjs` | Offline JSON match report only |

## When to use which approach

- **Incremental null fill (default):** `update_source_book_purchase_ids.mjs`
- **Full rebuild from cached match JSON:** `generate_source_book_purchase_sql.mjs` + seed/update SQL files
- **Manual correction:** update `SourcePurchaseID` directly in SQL after reviewing `SourceBookPurchase`
