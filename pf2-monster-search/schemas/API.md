# PF2 Monster Search API

This document describes the JSON REST API exposed by the Express server in `server/src/server.js`.

The machine-readable specification lives in [`openapi.yaml`](./openapi.yaml) (OpenAPI 3.0.3, API version 1.0.0).

## Overview

| Property | Value |
|----------|-------|
| Base URL (production) | `http://localhost:3333` — UI and API on the same port |
| Base URL (development) | `http://localhost:5173` — Vite proxies `/api` and `/schemas` to Express |
| Default port | `3333` (`PORT` env var) |
| Content type | `application/json` |
| Methods | `GET` only |
| Authentication | None |

All endpoints are prefixed with `/api`.

**Production:** run `npm run build && npm start`, then open `http://localhost:3333`. The API docs page (`/api-docs`) and Swagger Try it use the same origin — no separate dev server required.

**Development:** run `npm run dev` and open `http://localhost:5173`. The Vite dev server proxies `/api` and `/schemas` to Express on port `3333`.

### Common search response shape

Search endpoints (`/api/monsters`, `/api/npcs`, `/api/spells`, `/api/feats`, `/api/equipment`) return:

```json
{
  "rows": [],
  "total": 0,
  "limit": 100,
  "offset": 0
}
```

- `rows` — matching records for the current page
- `total` — total matches before pagination
- `limit` — page size (default `100`, max `500`)
- `offset` — rows skipped (default `0`)
- `debug` — optional SQL debug object when `DEBUG_SQL=true`

### Filter conventions

| Filter style | Behavior |
|--------------|----------|
| Most string params | SQL `LIKE '%value%'` (substring match) |
| `rarity`, `size`, `alignment`, `tradition`, `trait` | Exact match |
| `levelMin` / `levelMax`, `rankMin` / `rankMax`, etc. | Inclusive numeric range |
| `isUnique`, `isStandardAncestryFeat` | Boolean: `true`, `false`, `1`, or `0` |
| `text` | SQL Server full-text search |

---

## Endpoints

### `GET /api/health`

Checks that the API is running and can query SQL Server.

**Example request**

```bash
curl "http://localhost:3333/api/health"
```

**Example response (200)**

```json
{
  "ok": true,
  "db": true,
  "elapsedMs": 38
}
```

**Example error (500)**

```json
{
  "ok": false,
  "error": "Connection timeout"
}
```

---

### `GET /api/lookups`

Returns dropdown values for monster/NPC search filters.

**Example request**

```bash
curl "http://localhost:3333/api/lookups"
```

**Example response (200)**

```json
{
  "rarity": [
    { "id": 1, "name": "Common" },
    { "id": 2, "name": "Uncommon" }
  ],
  "size": [
    { "id": 3, "name": "Medium" }
  ],
  "alignment": [
    { "id": 7, "name": "N" }
  ],
  "family": [
    { "id": 12, "name": "Dragon" }
  ],
  "sourceBook": [
    { "id": 1, "name": "Bestiary" }
  ]
}
```

---

### `GET /api/spell-lookups`

Returns dropdown values for spell search filters.

**Example request**

```bash
curl "http://localhost:3333/api/spell-lookups"
```

**Example response (200)**

```json
{
  "rarity": [{ "id": 1, "name": "Common" }],
  "sourceBook": [{ "id": 4, "name": "Core Rulebook" }],
  "tradition": [
    { "id": 1, "name": "Arcane" },
    { "id": 2, "name": "Divine" }
  ],
  "trait": [{ "id": 42, "name": "Fire" }]
}
```

---

### `GET /api/feat-lookups`

Returns dropdown values for feat search filters.

**Example request**

```bash
curl "http://localhost:3333/api/feat-lookups"
```

**Example response (200)**

```json
{
  "rarity": [{ "id": 1, "name": "Common" }],
  "sourceBook": [{ "id": 4, "name": "Core Rulebook" }],
  "trait": [{ "id": 10, "name": "Humanoid" }]
}
```

---

### `GET /api/equipment-lookups`

Returns dropdown values for equipment search filters.

**Example request**

```bash
curl "http://localhost:3333/api/equipment-lookups"
```

**Example response (200)**

```json
{
  "rarity": [{ "id": 1, "name": "Common" }],
  "sourceBook": [{ "id": 4, "name": "Core Rulebook" }],
  "trait": [{ "id": 5, "name": "Magical" }]
}
```

---

### `GET /api/monsters`

Searches creatures from `pf2.vwMonsterFull`, excluding NPCs.

**Query parameters**

| Parameter | Description |
|-----------|-------------|
| `name` | Partial name |
| `levelMin`, `levelMax` | Level range |
| `rarity`, `size`, `alignment` | Exact match |
| `family`, `sourceBook` | Partial match |
| `text` | Full-text search |
| `languages`, `skills`, `senses`, `speed` | Partial match |
| `isUnique` | Boolean |
| `hpMin`, `hpMax`, `acMin`, `acMax` | Stat ranges |
| `limit`, `offset` | Pagination |
| `sortBy` | `Name`, `Level`, `Rarity`, `Size`, `Alignment`, `Family`, `SourceBook`, `HP`, `AC`, `Fortitude`, `Reflex`, `Will`, `Perception` |
| `sortDir` | `asc` or `desc` |

**Example request**

```bash
curl "http://localhost:3333/api/monsters?name=dragon&levelMin=5&levelMax=15&family=Dragon&sortBy=Level&sortDir=desc&limit=5"
```

**Example response (200)**

```json
{
  "rows": [
    {
      "MonsterId": 1234,
      "Name": "Adult Red Dragon",
      "Level": 14,
      "Rarity": "Uncommon",
      "Size": "Huge",
      "Alignment": "CE",
      "Family": "Dragon",
      "SourceBook": "Bestiary",
      "SourcePurchaseURL": "https://paizo.com/products/...",
      "HP": 270,
      "AC": 35,
      "Fortitude": 28,
      "Reflex": 24,
      "Will": 26,
      "Perception": 26,
      "Speed": "fly 120 feet",
      "IsNPC": false,
      "IsUnique": false,
      "AonUrl": "https://2e.aonprd.com/Monsters.aspx?ID=123"
    }
  ],
  "total": 42,
  "limit": 5,
  "offset": 0
}
```

---

### `GET /api/npcs`

Same filters and response as `/api/monsters`, but returns only NPCs (`IsNPC = 1`).

**Example request**

```bash
curl "http://localhost:3333/api/npcs?name=guard&levelMin=1&levelMax=5&limit=10"
```

**Example response (200)**

```json
{
  "rows": [
    {
      "MonsterId": 5678,
      "Name": "City Guard",
      "Level": 1,
      "Rarity": "Common",
      "Size": "Medium",
      "Alignment": "LN",
      "Family": "Humanoid",
      "SourceBook": "Gamemastery Guide",
      "SourcePurchaseURL": null,
      "HP": 20,
      "AC": 18,
      "IsNPC": true
    }
  ],
  "total": 3,
  "limit": 10,
  "offset": 0
}
```

---

### `GET /api/spells`

Searches spells from `pf2.Spell`.

**Query parameters**

| Parameter | Description |
|-----------|-------------|
| `name` | Partial name |
| `rankMin`, `rankMax` | Spell rank range |
| `spellType`, `sourceBook`, `actions`, `defense`, `duration` | Partial match |
| `rarity` | Exact match |
| `tradition`, `trait` | Exact match (junction tables) |
| `text` | Full-text search |
| `limit`, `offset` | Pagination |
| `sortBy` | `Name`, `Rank`, `SpellType`, `Rarity`, `SourceBook`, `Traditions`, `Traits`, `Actions`, `Defense`, `Duration` |
| `sortDir` | `asc` or `desc` |

**Example request**

```bash
curl "http://localhost:3333/api/spells?name=fireball&tradition=Arcane&rankMin=3&rankMax=3&limit=5"
```

**Example response (200)**

```json
{
  "rows": [
    {
      "SpellId": 101,
      "Name": "Fireball",
      "Rank": 3,
      "SpellType": "Spell",
      "Rarity": "Common",
      "SourceBook": "Core Rulebook",
      "SourcePurchaseURL": "https://paizo.com/products/...",
      "Traditions": "Arcane, Primal",
      "Traits": "Evocation, Fire",
      "Actions": "[three-actions]",
      "RangeText": "500 feet",
      "Area": "20-foot burst",
      "Defense": "basic Reflex",
      "Summary": "A ball of fire explodes...",
      "AonUrl": "https://2e.aonprd.com/Spells.aspx?ID=101"
    }
  ],
  "total": 1,
  "limit": 5,
  "offset": 0
}
```

---

### `GET /api/feats`

Searches feats from `pf2.Feat`.

**Query parameters**

| Parameter | Description |
|-----------|-------------|
| `name`, `featType`, `sourceBook`, `pfs` | Partial match |
| `levelMin`, `levelMax` | Level range |
| `rarity` | Exact match |
| `trait` | Exact match |
| `isStandardAncestryFeat` | Boolean |
| `text` | Full-text search |
| `limit`, `offset` | Pagination |
| `sortBy` | `Name`, `Level`, `FeatType`, `Rarity`, `SourceBook`, `Traits`, `PFS`, `IsStandardAncestryFeat` |
| `sortDir` | `asc` or `desc` |

**Example request**

```bash
curl "http://localhost:3333/api/feats?name=power%20attack&levelMin=1&levelMax=20&limit=5"
```

**Example response (200)**

```json
{
  "rows": [
    {
      "FeatId": 55,
      "Name": "Power Attack",
      "Level": 1,
      "FeatType": "Class",
      "Rarity": "Common",
      "SourceBook": "Core Rulebook",
      "SourcePurchaseURL": "https://paizo.com/products/...",
      "Traits": "Fighter, Flourish",
      "PFS": "Standard",
      "IsStandardAncestryFeat": false,
      "Summary": "You unleash a powerful attack...",
      "AonUrl": "https://2e.aonprd.com/Feats.aspx?ID=55"
    }
  ],
  "total": 1,
  "limit": 5,
  "offset": 0
}
```

---

### `GET /api/equipment`

Searches equipment from `pf2.Equipment`.

**Query parameters**

| Parameter | Description |
|-----------|-------------|
| `name`, `equipmentType`, `searchCategory`, `itemCategory`, `itemSubcategory` | Partial match |
| `levelMin`, `levelMax` | Level range |
| `rarity` | Exact match |
| `sourceBook`, `pfs`, `price`, `bulk` | Partial match |
| `priceMin`, `priceMax` | Price in copper pieces |
| `weaponCategory`, `weaponGroup`, `weaponType`, `damageType`, `armorCategory` | Partial match |
| `trait` | Exact match |
| `text` | Full-text search |
| `limit`, `offset` | Pagination |
| `sortBy` | `Name`, `Level`, `EquipmentType`, `SearchCategory`, `ItemCategory`, `ItemSubcategory`, `Rarity`, `SourceBook`, `Traits`, `PriceCp`, `BulkValue`, `WeaponCategory`, `ArmorCategory` |
| `sortDir` | `asc` or `desc` |

**Example request**

```bash
curl "http://localhost:3333/api/equipment?name=longsword&weaponCategory=Martial&levelMin=0&levelMax=5&limit=5"
```

**Example response (200)**

```json
{
  "rows": [
    {
      "EquipmentId": 200,
      "Name": "Longsword",
      "Level": 0,
      "EquipmentType": "Weapon",
      "SearchCategory": "Weapons",
      "ItemCategory": "Martial",
      "Rarity": "Common",
      "SourceBook": "Core Rulebook",
      "SourcePurchaseURL": "https://paizo.com/products/...",
      "Traits": "Versatile P",
      "PriceCp": 100,
      "PriceText": "1 gp",
      "BulkValue": 1,
      "BulkText": "1",
      "WeaponCategory": "Martial",
      "WeaponGroup": "Sword",
      "Damage": "1d8",
      "DamageType": "S",
      "Summary": "A standard martial sword.",
      "AonUrl": "https://2e.aonprd.com/Equipment.aspx?ID=200"
    }
  ],
  "total": 1,
  "limit": 5,
  "offset": 0
}
```

---

## Error responses

Lookup endpoints return HTTP 500 with:

```json
{ "error": "Error message" }
```

Search endpoints return HTTP 500 with:

```json
{
  "error": "Error message",
  "debug": { "query": { "name": "dragon" } }
}
```

The `debug` field is present only when `DEBUG_SQL=true`.

---

## Using the OpenAPI spec

Import `schemas/openapi.yaml` into tools such as Swagger UI, Stoplight, or Postman to browse and test the API interactively.

```bash
# Example: serve with Swagger UI via npx (requires network)
npx @redocly/cli preview-docs schemas/openapi.yaml
```
