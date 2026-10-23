# PF2 Monster Search

A split-pane React + Node/Express search screen for your `pf2.vwMonsterFull` SQL Server view.

## Install

```bash
npm run install:all
```

## Configure

Copy:

```bash
server/.env.example server/.env
```

Edit `server/.env` for your SQL Server instance/database.

Art visibility and admin edits use different secrets:

- `ENABLE_ART` / `ENABLE_ART_PWD` — easy shared password that only shows creature art. Failures are rate-limited lightly (30 failures, then 2 minutes per IP).
- `ADMIN_UNLOCK_SECRET` and `ADMIN_COOKIE_SECRET` — two different server-side secrets, each at least 16 characters. Admin unlock compares a SHA-256 digest in constant time and fails closed when either value is unset or too short. Five wrong attempts lock that IP out for 15 minutes. The admin cookie is signed with `ADMIN_COOKIE_SECRET` and is the only cookie that can create, edit, rename, delete, or upload custom creatures. The art cookie cannot grant admin.
- `TRUST_PROXY_HOPS` — set to `1` behind nginx so lockouts use the client IP.
- `DEBUG_SQL` — leave unset. Set to `true` only on a dev box to include SQL debug in API responses.

Default assumes:

- SQL Server on `localhost`
- Database `PathfinderUtil`
- Windows trusted connection
- View `pf2.vwMonsterFull`

## Run dev mode

```bash
npm run dev
```

Then open:

```text
http://localhost:5173
```

The React client proxies `/api` calls to the Express server on port `3333`.

## Run server only

```bash
npm --prefix server start
```

## Production

Build the client, then start the server. Express serves `client/dist` and the API on the same port (default `3333`):

```bash
npm run build
npm start
```

Open `http://localhost:3333` (or your server IP on that port). The UI, API (`/api/*`), schema files (`/schemas/*`), and API docs page (`/api-docs`) all run on this port. No dev server or `preview` needed.

If `client/dist` is missing, the server runs API-only until you build.

### Update the VPS (`pf2.unwhelm.online`)

Run on the box (`~/node-sites/pf2-search`). Discard generated `updates.json` if git refuses to pull, then install, build, and restart `pf2-api`:

```bash
cd ~/node-sites/pf2-search && git checkout -- pf2-monster-search/client/public/updates.json 2>/dev/null; git pull && cd pf2-monster-search && npm run install:all && npm run build && pm2 restart pf2-api
```

## API

Health:

```text
GET /api/health
```

Lookup values:

```text
GET /api/lookups
```

Search:

```text
GET /api/monsters?name=dragon&levelMin=1&levelMax=10&rarity=common
```

Search routes accept `limit` (default 100, maximum 500) and `offset`. List rows omit `RawHtml`, `RawText`, `RawMD`, and `RawJson`. Load one full record from `GET /api/monsters/:monsterId`, `GET /api/spells/:spellId`, `GET /api/feats/:featId`, or `GET /api/equipment/:equipmentId`.

Custom-creature writes require the admin cookie (`POST /api/admin/unlock`). Without it those routes return `401`.

## Notes

This app expects your joined view to exist:

```sql
SELECT TOP 10 * FROM pf2.vwMonsterFull;
```

The grid can show a lot of columns, but the default layout emphasizes common encounter-building fields first.
