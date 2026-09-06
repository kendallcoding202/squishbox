# Squishbox

A kids' digital collectible prototype. Open steamer baskets, collect squishy dumplings across five rarities, and trade spares with neighbors through an escrow-style trade that is designed to be scam-proof.

This is a **retention experiment**, not a product. The question it exists to answer: do kids come back on their own for a week?

## What's in the prototype

- **Shop.** Three box types with the odds printed on every box, as "percent" and "1 in N". Free daily coins with a small streak bonus. No real money anywhere.
- **Opening.** Tap the box three times to squish it, then a reveal with a rarity glow. Epics and legendaries get confetti.
- **Collection.** 30 procedurally drawn dumplings (Series 1, "Steamer Pals"). Owned ones are squishable; unowned ones show as silhouettes. Filter by rarity.
- **Trade.** Four neighbor bots stand in for real friends and use the same trade engine a real friend would. Rules:
  1. Atomic swap. Nobody gives first.
  2. Any change to either side clears both confirmations, so there is no last-second swap.
  3. A 3-second "read it over" cooldown after every change before Confirm unlocks.
  4. Ownership is re-checked at execution, so ghost or duplicated items can't be traded.
  5. Lopsided trades show a warning before the kid can confirm.
  6. Kids can only trade spares. Everyone keeps one of everything.
- **Parent corner.** PIN-gated. Activity stats, a full log, a trading on/off switch, a boxes-per-day cap, and a reset.

Everything is stored in the browser's local storage. Nothing leaves the device.

## Run it

```sh
npm install
npm run dev        # local dev server, open the printed URL on your phone (same wifi)
npm test           # odds, daily coins, box caps, trade rules
npm run build      # production build to dist/
```

The app is a mobile-first web page with a manifest, so it can be added to a phone's home screen for testing without an app store.

## Deploy

Pushing to `main` runs the tests and publishes the app to `https://<user>.github.io/squishbox/`.

## iOS app (TestFlight and App Store)

The same code ships as a native iOS app through Capacitor. The Xcode project is committed in
`ios/`. On a Mac with Xcode:

```sh
npm install
npm run ios:sync    # rebuild the web app and copy it into ios/ (run after every change)
npm run ios:open    # opens Xcode; set your Team under Signing & Capabilities, then Archive
```

Full walkthrough, App Store Connect fields, and Kids Category rules: [docs/APP_STORE.md](docs/APP_STORE.md).

## Layout

```
src/data/characters.ts   the 30 dumplings and rarity table
src/data/boxes.ts        box prices and published odds
src/game/odds.ts         weighted roll (seedable for tests)
src/game/state.ts        save state, daily coins, opening, caps, persistence
src/game/trade.ts        escrow trade engine (pure, no DOM)
src/game/bots.ts         neighbor inventories and accept/propose logic
src/ui/dumpling.ts       procedural SVG art and squish physics
src/ui/screens/*.ts      the four tabs
tests/                   vitest
```

## The experiment plan

1. Put it in front of 10 to 20 kids aged roughly 6 to 11 and watch them, don't explain it.
2. Measure return visits over 7 days without prompting. The log in the Parent corner shows daily claims.
3. Kill criterion: if most kids don't come back on their own by day 3, stop.
4. If they do come back: add coin packs via in-app purchase, a real friend-to-friend trade backend, and a second series.

## Things deliberately left out

- Real money and cash-out. Random paid boxes plus resale is what regulators treat as gambling for minors.
- Accounts, servers, and any data collection. Adding those means COPPA, so they wait until the retention question is answered.
- Physical toys. If the characters get a following, that is a licensing conversation, not a manufacturing one.
