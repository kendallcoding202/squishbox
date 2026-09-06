# Shipping Squishbox to TestFlight and the App Store

The web app is the whole app. Capacitor wraps `dist/` in a native iOS shell so it can go through
App Store Connect. Everything below happens on a Mac with Xcode installed and your Apple Developer
account signed in to Xcode (Xcode > Settings > Accounts).

## 0. One-time decisions

- **Bundle ID.** Edit `appId` in `capacitor.config.ts` to your own reverse-domain id, for example
  `com.yourname.squishbox`. It must match the identifier you register in App Store Connect and it
  cannot be changed after the first upload.
- **App name.** "Squishbox" is set in `capacitor.config.ts`. Check the name is free in App Store
  Connect when you create the app record; if it is taken, pick a variant there and in the config.

## 1. Generate the iOS project (first time only)

```sh
npm install
npm run ios:add        # builds the web app, creates ios/, generates icons and splash screens
```

Commit the `ios/` folder. It is the Xcode project and should live in the repo.

## 2. Open in Xcode and set signing

```sh
npm run ios:open
```

In Xcode: select the **App** target > **Signing & Capabilities** > tick *Automatically manage
signing* and choose your Team. Confirm the Bundle Identifier matches `capacitor.config.ts`.

Set **Deployment Info** to iOS 15.0 or later, and tick both iPhone and iPad.

Run once on a simulator or a plugged-in iPad (Product > Run) and open every tab.

## 3. Every later change

```sh
npm run ios:sync       # rebuilds the web app and copies it into the iOS project
```

Then Product > Archive in Xcode. Bump the build number in Xcode (General > Build) before each
upload; App Store Connect rejects a repeated build number.

## 4. TestFlight (the friends-and-family test)

1. In App Store Connect create the app record: **My Apps > + > New App**, platform iOS, the bundle
   id from step 0, SKU anything (e.g. `squishbox-1`).
2. In Xcode: Product > Archive > Distribute App > App Store Connect > Upload. Wait for the
   "processing" email (usually 10 to 30 minutes).
3. In App Store Connect > TestFlight, fill in **Test Information** (what to test, your email).
4. Under **External Testing** create a group, enable a **Public Link**, and add the build. The first
   build in an external group goes through Beta App Review, typically within a day.
5. Send parents the public link. They install the TestFlight app, tap the link, tap Install.
   Builds expire after 90 days; upload a new one before then.

## 5. App Store submission

Fill these in on the app record. All of them are required before "Submit for Review".

| Field | What to enter |
|---|---|
| Category | Games > Family, or Entertainment. Also opt into the **Kids** category (ages 6-8 or 9-11). |
| Age rating | Answer the questionnaire honestly; result should be 4+. Say **No** to "Unrestricted Web Access", "Gambling", and "Contests". Simulated gambling: **No** (no real stakes, odds shown, nothing cashable). |
| Privacy policy URL | `https://kendallcoding202.github.io/squishbox/privacy.html` |
| Support URL | `https://github.com/kendallcoding202/squishbox` (or any page you control) |
| App Privacy | "Data Not Collected". Nothing leaves the device. |
| Screenshots | Required sizes: 6.9" iPhone and 13" iPad. Take them in the Simulator (Cmd+S) on "iPhone 16 Pro Max" and "iPad Pro 13-inch". Three to five each: shop, reveal, collection, trade, parent corner. |
| Description | See below. |
| Keywords | dumpling, squishy, blind box, collect, trade, kids, mystery box |
| Copyright | Your name, 2026 |
| Content rights | You own all content (the art is generated in-app). |

Suggested description:

> Open steamer baskets, collect squishy dumplings, and trade spares with neighbors. Every box shows
> its odds before you open it. No ads, no purchases, no accounts: coins are free once a day and
> everything stays on your device. A Parent corner with a PIN lets grown-ups set a daily box limit
> and turn trading off.

## 6. Kids Category rules that apply to us

Apple reviews Kids apps against guideline 1.3. Squishbox complies as built; keep it that way:

- No third-party analytics or advertising SDKs. Do not add any.
- No links out of the app without a parental gate. The only link is in the privacy page, which is
  not reachable from inside the app.
- No purchases. If coin packs are ever added, they must be behind a parental gate and the odds
  disclosure must stay on every box (guideline 3.1.1).
- Nothing collected from children (COPPA). The app has no network calls at all.

## 7. Common first-review rejections and the fix

- **"Minimum functionality / web wrapper" (4.2).** Usually avoided because the app works offline
  and has native-feeling interaction. If it comes up, reply that the app is fully functional
  offline and stores state locally; do not add a website link.
- **Missing iPad screenshots.** The 13" iPad set is mandatory because the app supports iPad.
- **Build number reused.** Increment and re-upload.
- **Age rating questionnaire flagged "simulated gambling".** Reply explaining the boxes are
  free, non-purchasable, show odds, and nothing has cash value. Keep the answer "No".
