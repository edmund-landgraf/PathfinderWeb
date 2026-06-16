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

## Notes

This app expects your joined view to exist:

```sql
SELECT TOP 10 * FROM pf2.vwMonsterFull;
```

The grid can show a lot of columns, but the default layout emphasizes common encounter-building fields first.
