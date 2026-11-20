# Releasing

A release is three things in order, each started by hand from GitHub Actions (or by a Claude
session with access to this repository):

1. **iOS release** builds the app, signs it and uploads it to App Store Connect.
2. **App Store → prepare** creates the version, attaches the build, sets the release notes and
   replaces the screenshots.
3. **App Store → submit** sends it to review.

Nothing runs on a push. Every step is a button, and only step 3 cannot be taken back.

## Before you start

- **Stamp the version.** `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` in
  `ios/App/App.xcodeproj/project.pbxproj` (both configurations) name the build. The workflows
  read them and refuse to change them. A build number can never be reused once uploaded.
- **Write the release notes** in `store/metadata/whats-new.txt`. The first line names the
  version they are for (`# 1.5`); notes written for another version are refused.
- **Regenerate the screenshots** if anything visible changed: `npm run screenshots`. Commit
  the result. Do not put seasonal content in them; see the note in `scripts/screenshots.mjs`.
- Optional: `store/metadata/promotional-text.txt` and `store/metadata/review-notes.txt`. If
  present they are applied; if absent the store keeps what it has.

## Running it

| Step | Workflow | Inputs |
| --- | --- | --- |
| Build and upload | iOS release | `ref` (default `main`), `runner` and `xcode` (the toolchain) |
| Look at the store | App Store | `action: status` |
| How each build was made | App Store | `action: builds` |
| Rehearse | App Store | `action: prepare`, `version`, `build`, `dry_run: true` |
| Prepare | App Store | `action: prepare`, `version`, `build` |
| Submit | App Store | `action: submit`, `version` |
| Promotional line | App Store | `action: promo` |

After the upload Apple processes the build for a few minutes. `prepare` waits for it, up to
twenty minutes, so it can be started straight after the upload finishes.

`withdraw` takes a version back out of review so its build can be swapped. It gives up the
place in the queue, so upload and check the replacement build first.

`prepare` is safe to repeat. It compares what is in the store with what is in the repository
and only changes what differs, so a run that died half way is fixed by running it again.
`submit` checks the screenshots and notes one last time and refuses if they are not the
committed ones.

`promo` needs no build and no review. It puts today's promotional line on the live listing:
the seasonal one from `store/metadata/promotional-seasonal.json` while its window is open, and
`store/metadata/promotional-text.txt` otherwise. Run it on the day a seasonal set opens and
again the day after it shuts. A new seasonal set needs a line in that file; a test fails if
one is missing or its dates differ from the game's.

The same script runs locally: `node scripts/asc.mjs status` with the three `ASC_*` variables
set.

## Updates must not lose saves

A player updated from 1.3 to 1.4 and found the collection gone. The cause was never pinned
down on a simulator, but two things were found and both are now handled:

- **The toolchain changed without anybody choosing it.** 1.3 was built on a Mac with the
  iOS 27 SDK, 1.4 (13) on a runner with the iOS 26.5 SDK. `action: builds` prints the SDK
  and entitlements Apple recorded for every uploaded build. The release workflow now names
  its runner and Xcode as inputs, defaulting to Xcode 27.0; change them on purpose or not at
  all, and check `builds` afterwards.
- **The save lived in one place**, the web view's local storage, and a start-up that read it
  as empty began a new game and saved over it. It is now kept in three: local storage, the
  app's preferences (written on every save), and a reading the app itself takes from the web
  view's storage file at launch (`SavePreflight` in `AppDelegate.swift`). `src/game/keeper.ts`
  chooses between them and will not save a new game over a collection.

**Before any release that touches the native project, the save code, or the toolchain, run
the "iOS upgrade test" workflow.** It builds the old releases and the new one with both
toolchains, installs them over one another on an iOS 27 simulator, and prints what each
launch read from storage, what was on screen, and what is on disk. The runs named `blind-…`
make the web view unable to read the save back, which is the failure on demand: the
collection must still come up. `new_ref` is the commit to test; update `old_ref` and
`mid_ref` to the releases people actually have.

Its screenshots lag on hosted runners (a screen can be captured before it has drawn). Go by
what the page reports, not by the picture.

## One-time setup: repository secrets

Settings → Secrets and variables → Actions. Six secrets.

| Secret | What it is |
| --- | --- |
| `ASC_KEY_ID` | App Store Connect API key ID |
| `ASC_ISSUER_ID` | Issuer ID, from Users and Access → Integrations |
| `ASC_PRIVATE_KEY` | The whole contents of the `AuthKey_<id>.p8` file |
| `IOS_DIST_CERT_P12` | An Apple Distribution certificate with its private key, as base64 of a `.p12` |
| `IOS_DIST_CERT_PASSWORD` | The password that `.p12` was exported with |
| `IOS_PROVISIONING_PROFILE` | An App Store profile for `com.kendallcoding202.squishbox` made with that certificate, as base64 |

The API key needs the App Manager role or higher. The first three are enough for the App Store
workflow; the iOS release workflow needs all six.

Making a certificate for CI without touching the one in the Mac's keychain:

```sh
mkdir -p ~/squishbox-ci && cd ~/squishbox-ci
/usr/bin/openssl genrsa -out dist.key 2048
/usr/bin/openssl req -new -key dist.key -out dist.csr -subj "/CN=Squishbox CI/C=US"
# developer.apple.com → Certificates → + → Apple Distribution → upload dist.csr → download the .cer
/usr/bin/openssl x509 -inform DER -in distribution.cer -out dist.pem
/usr/bin/openssl pkcs12 -export -inkey dist.key -in dist.pem -out dist.p12   # asks for a password
# developer.apple.com → Profiles → + → App Store Connect → this app → the NEW certificate
#   name it "Squishbox App Store CI"; leave the existing profile alone, the Mac still uses it
base64 -i dist.p12 | gh secret set IOS_DIST_CERT_P12 --repo kendallcoding202/squishbox
base64 -i Squishbox_App_Store_CI.mobileprovision | gh secret set IOS_PROVISIONING_PROFILE --repo kendallcoding202/squishbox
```

Use the system `/usr/bin/openssl`. A newer OpenSSL writes a `.p12` the macOS keychain cannot
read unless `-legacy` is added.

This repository is public. Secrets are not readable from the code or the logs, are not given
to workflows started from forks, and these two workflows can only be started by someone with
write access.

## If something goes wrong

- **A build was uploaded with a mistake in it.** Bump the build number, commit, run again. A
  number is spent once Apple has seen it.
- **Review rejects the version.** Fix it, bump the build number, run all three steps again with
  the same version.
- **The Mac route still works.** Everything here can be done by hand from a Mac with Xcode:
  archive with `-project App.xcodeproj` (there is no workspace), manual signing, export with
  `manageAppVersionAndBuildNumber` off, upload with `xcrun altool`.
