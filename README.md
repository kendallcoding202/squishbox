# Squishbox

A kids' digital collectible prototype. Open steamer baskets, collect squishy dumplings across five rarities, and trade spares with neighbors through an escrow-style trade that is designed to be scam-proof.

This is a **retention experiment**, not a product. The question it exists to answer: do kids come back on their own for a week?

## What's in the prototype

- **Shop.** Three box types with the odds printed on every box, as "percent" and "1 in N". Free daily coins with a small streak bonus. No real money anywhere.
- **Lucky meter.** A Rare or better is guaranteed every 10 boxes, shown as a meter that fills up.
- **Opening.** Tap the box three times: steam, escalating hits, a glow tease for a Rare or better, then the reveal. Epics and legendaries get confetti; the legendary gets a golden flash.
- **Squish.** Press and drag any dumpling to deform it; release and it springs back with a wobble. Squeaks, pops and fanfares are synthesized in-app (no audio files) with a mute button, plus native haptics on iOS.
- **Collection.** 30 procedurally drawn dumplings (Series 1, "Steamer Pals") across four body shapes and five patterns. Owned ones are squishable; unowned ones show as silhouettes. Kids can give each one a nickname.
- **Steam Pot.** Sell spare dumplings for coins, always keeping the last copy. This is the in-app resale, in coins only.
- **Album goals.** Coin rewards for completing each rarity set and the whole album.
- **Trade with friends.** Each kid gets a friend code like `TARO-71`. Add a friend by code, then trade through the trading post server in `server/` with the same escrow rules as below. Parents can switch it off. See [docs/SERVER.md](docs/SERVER.md).
- **Trade with neighbors.** Five neighbor bots use the same trade engine, so there's always someone to trade with. Rules:
  1. Atomic swap. Nobody gives first.
  2. Any change to either side clears both confirmations, so there is no last-second swap.
  3. A 3-second "read it over" cooldown after every change before Confirm unlocks.
  4. Ownership is re-checked at execution, so ghost or duplicated items can't be traded.
  5. Lopsided trades show a warning before the kid can confirm.
  6. Kids can only trade spares. Everyone keeps one of everything.
- **Parent corner.** PIN-gated. Activity stats, a full log, a trading on/off switch, a boxes-per-day cap, and a reset.

Everything is stored in the browser's local storage. With friend trading on, the trading post receives an anonymous id, a chosen basket name, and the inventory list, and nothing else.

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
- Accounts and personal data. Friend trading uses random ids and made-up names only.
- Physical toys. If the characters get a following, that is a licensing conversation, not a manufacturing one.

## Store screenshots

`store/screenshots/` holds App Store screenshots at Apple's required sizes, generated from the web build with a seeded save. They were produced with a Playwright script that loads a populated save into the preview server and captures each tab at iPhone 6.9" (440x956 @3x) and iPad 13" (1032x1376 @2x) viewports. Regenerate them after any visual change.
