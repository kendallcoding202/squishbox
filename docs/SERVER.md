# The trading post (server)

Friend-to-friend trading runs through a small service in `server/`. Everything else in the game
stays on the device. The service knows only:

- a random player id and bearer token (generated on first launch, stored on the device)
- a short friend code like `TARO-71`
- a chosen basket name (the app tells kids not to use a real name)
- the list of dumplings owned, so it can enforce "spares only" and swap items atomically

No email, no real name, no location, no device identifier. Friends are added by code only. There
is no search, no chat, and no way to find a player who hasn't shared their code.

## What it does

- `POST /v1/register` → id, token, code
- `GET /v1/me` → friends, open trades, and *deliveries*: completed trades the device hasn't applied yet
- `PUT /v1/inventory` → the device's current inventory snapshot
- `POST /v1/friends` `{code}` → mutual friendship
- `POST /v1/trades` `{friendId}`, `PUT /v1/trades/:id/offer` `{items}`, `POST /v1/trades/:id/confirm`, `POST /v1/trades/:id/decline`
- `POST /v1/deliveries/:id/ack`

Trades use the exact same engine as the in-app neighbor trades (`src/game/trade.ts`): both sides
confirm, any change resets both confirmations, a 3-second read-over cooldown is enforced on the
server, only spares can be offered, ownership is re-checked at execution, and the swap is atomic.
Open trades expire after 24 hours.

Storage is a single SQLite file via Node's built-in `node:sqlite`. No dependencies.

## Run it locally

```sh
npm run build:server          # bundles server/ + shared game code into server/dist/index.js
npm run dev:server            # serves on :8080 with ./server/dev.db
VITE_API_URL=http://localhost:8080 npm run dev    # point the app at it
```

`npm test` includes an end-to-end test that boots the server in memory and runs a full trade.

## Deploy to Fly.io

From your Mac, inside the repo, with `flyctl` installed and logged in:

```sh
fly launch --config server/fly.toml --dockerfile server/Dockerfile --copy-config --no-deploy
fly volumes create squishbox_data --size 1 --region sjc      # pick your region; match primary_region
fly deploy --config server/fly.toml --dockerfile server/Dockerfile
curl https://squishbox-api.fly.dev/health                    # {"ok":true}
```

If the app name `squishbox-api` is taken, `fly launch` asks for another. Then the app has to know
the new URL:

- **Web (GitHub Pages):** in the GitHub repo, Settings → Secrets and variables → Actions →
  Variables → add `VITE_API_URL` = `https://<your-app>.fly.dev`. The next push rebuilds with it.
- **iOS:** build with `VITE_API_URL=https://<your-app>.fly.dev npm run ios:sync` before archiving.

The Fly config stops the machine when idle and starts it on the first request, so the first sync
after a quiet spell takes a couple of seconds. That's fine for this; the app retries on its own.

## Backups

The database is the volume at `/data/squishbox.db`.

Fly takes daily volume snapshots on its own (5 days retained), and that is the real safety
net. For a copy on your Mac:

```sh
fly ssh sftp get /data/squishbox.db squishbox-backup.db --app squishbox-api
```

Don't reach for `sqlite3 ... .dump` over `fly ssh console`: the runtime image is
`node:22-slim` and has no `sqlite3` binary, so that command fails on first use.

Losing the file loses friends lists and pending trades, not anyone's collection —
collections live on the devices.

## Known limits (deliberate for the friends-and-family test)

- The device is trusted about its own inventory. A kid who edits their save file could claim
  items they don't have. The server still only moves spares and only what both sides agreed to.
  Moving the whole economy server-side is the fix if this ever matters.
- One open trade per pair of friends, five open trades per player.
- No push notifications. Offers show up on the next sync (every 20 seconds, on app focus, or on
  opening the Trade tab).
