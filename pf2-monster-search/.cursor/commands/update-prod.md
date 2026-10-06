---
description: Give the one-liner to update PF2 Search production on the VPS
---

# Update production

When the user asks to update prod, give them this command to run **on the VPS** at `administrator@vps-jxnm` (do not SSH from the agent unless keys work).

Repo path: `~/node-sites/pf2-search`
App path: `~/node-sites/pf2-search/pf2-monster-search`
PM2 process: `pf2-api`
Live site: `https://pf2.unwhelm.online`

`updates.json` is generated on build and is often dirty on the VPS. Discard it before `git pull`.

One line:

```bash
cd ~/node-sites/pf2-search && git checkout -- pf2-monster-search/client/public/updates.json 2>/dev/null; git pull && cd pf2-monster-search && npm run install:all && npm run build && pm2 restart pf2-api
```

After restart, they can confirm with:

```bash
pm2 logs pf2-api --lines 25 --nostream
curl -sS http://127.0.0.1:3333/api/health
```

Do not change `server/.env` unless they asked. Keep `ENABLE_ART` as already set on prod.
