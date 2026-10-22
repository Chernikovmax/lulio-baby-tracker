# Deployment

Operator runbook for Android APK releases and the production PWA. This document is not evidence of a completed release or deployment. Cloud resources, public URLs, signing readiness, and device acceptance remain prerequisites until verified by an authorized operator.

## Safety and release preparation

- Obtain explicit approval before network access or publication. Never create/push release tags without approval. Use only an approved authenticated tool or the user's authorized cloud session; never request credentials or secrets in chat.
- Do not read `.env` files, private configuration, keys, credentials, or secret values. Secret names below describe CI prerequisites, not permission to retrieve their values.
- Release an agreed, committed revision, including the matching lockfile. Preserve unrelated uncommitted work; do not build a release from another agent's in-progress checkout. Record the commit, version, CI run, and verification results.
- For an actual deployment, use a supported Node.js version (see `AGENTS.md`) and run, sequentially, `npm ci`, `npx tsc --noEmit`, `npm run build`, and `npx ng test --watch=false`. These are release preparation steps, not a request to run them during documentation-only work. Coordinate shared build output with other agents.

## Android APK → GitHub Releases

Source of truth: [workflow](.github/workflows/android-release.yml), [version script](scripts/android-version.gradle), and `package.json`.

### Prerequisites and versioning

- The repository must have Actions and Releases enabled, the workflow's release job must be allowed `contents: write`, and an authorized maintainer must have configured `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD` as GitHub repository secrets. Do not inspect their values or change the signing identity for this process.
- `package.json.version` must be numeric `major.minor.patch`, without prerelease/build suffixes. Keep `package-lock.json` metadata consistent. The release tag must be exactly `v<version>` at the agreed commit.
- The Gradle init script overrides `versionName` with that version and calculates `versionCode = major * 1000000 + minor * 1000 + patch`. Bounds: major ≤ 2100, minor/patch ≤ 999, and final code between 1 and 2100000000. Every update needs a code greater than the installed release. Do not edit generated Android version fields instead.
- Keep the existing application identity and signing certificate. The Capacitor configuration currently declares `io.ionic.starter`; confirm the resulting APK's application ID matches the installed app before attempting an update. Back up valuable diary data through the app without placing the backup in the repository or public artifacts.

### Build, sign, publish

1. Agree the version and commit with the maintainer, update version metadata, complete checks, and merge the intended revision. Confirm the tag target contains exactly those changes.
2. With explicit approval, create and push the exact `v<version>` tag to the intended repository. A push to `main`, PR targeting `main`, or manual dispatch also builds, but a normal branch run does **not** publish a Release. The release job is gated by a `refs/tags/v` ref; a manual run must also target the exact matching tag to qualify.
3. Inspect the **Android APK** Actions run for that tag and commit. CI uses Node 22.23.2, Java 21, Android platform 36/build-tools 36.0.0; it validates version/tag agreement, runs `npm ci`, TypeScript checks, production build, unit tests, and `npx cap sync android`, then runs:

   ```sh
   # From android/; normally executed by CI, not a publication command.
   bash ./gradlew --no-daemon --init-script ../scripts/android-version.gradle assembleRelease
   ```

4. The build job uploads `android/app/build/outputs/apk/release/app-release-unsigned.apk` as **unsigned-apk**, retained for **7 days**. This is an unsigned intermediate, **not an installable signed release** and not interchangeable with the Release download.
5. On a qualifying tag, the release job downloads that artifact, zipaligns and signs it with the preconfigured identity, runs `apksigner verify --verbose` and `zipalign -c -p 4`, then generates `SHA256SUMS`. It creates a draft Release if one does not exist, uploads `release/lulio-baby-tracker-v<version>.apk` and `release/SHA256SUMS`, then publishes it and marks it latest. Publication is automatic; the draft is not a manual approval gate. A rerun overwrites same-named attachments (`--clobber`); do not rerun casually after distribution.
6. Confirm both jobs succeeded and the published GitHub Release points to the intended tag/commit, with **lulio-baby-tracker-v<version>.apk** and **SHA256SUMS** attached. Do not report success from the unsigned artifact alone. If signing/publication fails, fix the authorized prerequisite and inspect existing Release state before any approved retry; never fall back to an unsigned APK or a replacement key.

### Verify the downloaded release

Download both attachments from the actual Release into the same directory using an approved authenticated session if required. Verify the downloaded bytes, not just the CI workspace:

```sh
shasum -a 256 -c SHA256SUMS
# Use the installed Android SDK build-tools apksigner executable:
apksigner verify --verbose --print-certs lulio-baby-tracker-v<VERSION>.apk
# With an authorized, connected Android test device:
adb install lulio-baby-tracker-v<VERSION>.apk
# On a device with the previous release already installed:
adb install -r lulio-baby-tracker-v<VERSION>.apk
```

Replace `<VERSION>` with the numeric version. Compare the public signer certificate fingerprint with the trusted previous release; checksum agreement alone does not establish publisher identity. Confirm package ID, version name/code using SDK APK inspection tools. On a real device, verify launch, diary entry/timer persistence after restart, and, where a previous signed release is available, an in-place update retaining data. Never uninstall or clear storage to disguise a failed update. Record unavailable device/update checks as unverified.

## PWA → Yandex Object Storage

### Current local configuration and required hosting decisions

- `angular.json` builds production by default into **`www/`**, not `www/browser/` (`outputPath.base: "www"`, `browser: ""`), with hashed bundles and `ngsw-config.json`. `npm run build` is the production build command. Inspect fresh output; an existing `www/` can be stale.
- Current sources include `src/manifest.webmanifest`, icons, and production web-only registration of `ngsw-worker.js` in `src/main.ts` (disabled for native Capacitor). `ngsw-config.json` prefetches the shell/assets, has no API data cache groups, and enables navigation handling. Configuration presence is not proof of a generated or deployed working PWA.
- The HTML base, manifest ID/start URL/scope, and SW cache paths currently assume **origin root `/`**. Deploy at root. Subdirectory hosting requires a coordinated configuration change and separate scope/navigation verification, not just uploading beneath a prefix.
- Before publishing, confirm the generated `index.html`, manifest, icons, `ngsw.json`, and worker scripts exist and match the intended build. Coordinate with the PWA implementation owner and recheck these settings after their changes.
- Select a dedicated **Russia-region** bucket with a name **without dots**, STANDARD storage, and public **object read only**. Keep listing/configuration administration private. No bucket or cloud resources were provisioned in this session.
- Use **`https://<bucket>.website.yandexcloud.net/`** at origin root. The official hosting documentation currently documents this HTTPS endpoint; it still needs certificate/header/SW verification against the actual bucket. Do not use `https://website.yandexcloud.net/<bucket>` with this root-scoped build.
- The staging utility emits exact HTML objects for `tabs`, `tabs/tracker`, `tabs/stats`, `tabs/leaps`, and `tabs/settings`, plus each route's `index.html` for trailing-slash requests. This avoids a paid SPA proxy and avoids returning an error-document HTTP 404 for a first visit. Configure the website index document as `index.html`; leave missing assets as real 404 responses, not HTML. Keep the alias list in `scripts/prepare-pwa.mjs` aligned with router changes. Verify Object Storage's actual exact-key/index behavior after upload.
- [Hosting](https://yandex.cloud/ru/docs/storage/concepts/hosting) and [pricing](https://yandex.cloud/ru/docs/storage/pricing) were fetched on 2026-10-21. The documented monthly allowances are 1 GiB STANDARD storage, 10,000 PUT/POST/PATCH/LIST, 100,000 GET/HEAD/OPTIONS, and 100 GiB outgoing traffic. These are **not a spending cap**; aggregate usage and public traffic can exceed them. Obtain explicit cost approval before creation/uploads, configure billing alerts, and do not promise a zero bill. No paid domain, CDN, gateway, or push/backend service is required by this deployment plan.

### Publish only the production web artifact

Review the fresh `www/` inventory and embedded public configuration before upload. Publish only required, safe production web files. Never upload the source checkout, `.git`, backups/diary exports, credentials, environment files, private configuration, or unnecessary source maps. Browser bundles are publicly readable: server secrets must never be embedded in them. Do not recursively upload the repository or blindly synchronize with deletion enabled.

Set object metadata explicitly and verify it at the final HTTPS URL:

| Objects | Content-Type | Cache-Control |
| --- | --- | --- |
| `index.html` and SPA HTML responses | `text/html; charset=utf-8` | `no-cache` |
| `manifest.webmanifest` | `application/manifest+json` | `no-cache` |
| `ngsw.json` | `application/json` | `no-cache` |
| Worker scripts, including `ngsw-worker.js` | `text/javascript` | `no-cache` |
| Content-hashed JS/CSS and immutable assets | `text/javascript`, `text/css`, or actual asset type | `public, max-age=31536000, immutable` |
| Stable-name icons and other mutable assets | Actual type, e.g. `image/png` | `no-cache` or an explicitly justified short TTL |

Do not mark mutable filenames immutable. Compression metadata must match the actual uploaded encoding. Keep worker scripts on the app origin with valid JavaScript MIME and root scope; do not cache HTML or SW metadata indefinitely at an intermediary.

1. Preserve the previous release's web files and entrypoint/SW metadata for rollback. Agree retention before any cleanup.
2. Upload new hashed bundles and dependencies first, then all other required assets and worker scripts. Verify their availability and metadata before exposing entrypoints.
3. Publish the matching `index.html` and web manifest only after their dependencies are available; publish the generated **`ngsw.json` last**, after every resource it references is accessible. Prefer a staged, atomic release switch where supported. A non-atomic object upload is not an atomic deployment: minimize the entrypoint transition window and check for SW hash/version errors.
4. Retain older chunks/assets while old tabs and service-worker versions can still reference them. Do not delete them as part of the upload. Mutable asset changes also require care with older cached versions. Cleanup needs an explicit retention policy and evidence that supported clients no longer need those files.
5. If verification fails, restore the complete matching previous entrypoints and SW manifest while retaining their dependencies; retest existing clients as well as a clean session. Never clear user data as a rollback step.

### Prepared artifact and exact operator commands

Run these from the existing checkout after the sequential TypeScript/build/test checks above:

```sh
node scripts/prepare-pwa.mjs
# Dry run: no network requests, no uploads, no bucket creation.
node scripts/publish-pwa.mjs <bucket-without-dots>
```

`dist/pwa/upload-plan.json` is the authoritative ordered allowlist. Its `file` entries point to local encoded filenames beneath `dist/pwa/files`; its `key` entries are actual S3 keys. This separation permits an extensionless `tabs` object and `tabs/index.html` simultaneously. Do **not** recursively upload `files/` using their local filenames. The preparer validates every SW-listed resource against its generated SHA-1 before staging. It includes only those resources, SW runtime scripts, license notices, and the explicit HTML aliases. A reused staging directory may contain old files; only the current plan is publishable.

The publisher requires a preinstalled **AWS CLI** and an explicitly authorized authenticated environment. Configure authentication privately using the operator's approved mechanism; never print/read credential files or paste keys into this session. Use the Yandex console to create/configure the dedicated Russia bucket, enable website hosting with index `index.html`, and allow public object reads only. Do not set up extra billable services.

After the operator explicitly approves potentially billable operations:

```sh
node scripts/publish-pwa.mjs <actual-bucket-without-dots> --confirm-billable-operations
```

The script calls `aws --endpoint-url https://storage.yandexcloud.net --region ru-central1 s3api put-object` with STANDARD storage and explicit MIME/cache metadata. It does not create a bucket, change permissions, or delete remote objects. Confirm the actual bucket region in the console; a CLI signing-region argument alone does not provision or prove its location. Each uploaded object is fetched from `https://<bucket>.website.yandexcloud.net/<key>` and verified for HTTP 200, MIME, cache-control, and byte equality before proceeding. `ngsw.json` is last. Stop on errors and apply the matching-release rollback procedure above; uploads are not atomic.

Local evidence (not a cloud deployment): 62 staged objects passed byte/MIME/cache-control checks through a strict local static server. Direct extensionless/trailing-slash routes returned 200 and missing JS returned 404. Chromium accepted the manifest/installability and root SW; offline reload and a full browser-process restart retained a completed diary entry. Profile, active timer, JSON download, and a whole-version update with a changed main bundle passed. A 3.2-second frozen-page timer resumed correctly. Mobile WebKit at 390 × 844 passed rendering/focus/offline checks with no page errors, but cannot prove installation, physical keyboard geometry, or OS storage retention on an iPhone. The update candidate was generated only in a disposable local artifact; no second public release was published.

The prepared 2026-10-21 artifact is `dist/baby-tracker-pwa.zip` (517,757 bytes, 62 public objects plus upload plan); checksum file: `dist/baby-tracker-pwa.zip.sha256`. SHA-256: `0c4211861dcf750843d7ab5baed26efc90066632d46c026369e1ef344e7439c6`. It contains `pwa/upload-plan.json` and only the plan-listed `pwa/files/*`, not source files or diary data. Unpack beneath `dist/` to restore the staged layout; use the publisher, not a recursive upload. These bytes represent the checked-out working state, including pre-existing user edits; no release commit/tag or cloud publication was created.

Sequential mandatory checks passed: `npx tsc --noEmit`, Angular MCP `app:build:production` (equivalent to `npm run build`), and Angular MCP `app:test` with `watch: false` (43 tests in 12 files). The staged artifact and production runtime scenarios were exercised after the final build. Temporary browser scenarios ran in isolated local processes, not the user's occupied MCP browser.

Deployment authorization update (2026-10-21): the owner explicitly accepted Object Storage charges beyond the free tier for this minimal Russia-region deployment, without a paid domain/CDN or extra services. This does not authorize reading credentials, keys, tokens, or environment files. An Orca tab was opened at `https://console.yandex.cloud/`; it redirected to the Yandex Cloud login page and displayed “Войти с помощью Yandex”. No authenticated cloud session is available in that tab. The owner must complete sign-in there privately and return to the console before publication can proceed. No bucket was created or files uploaded; actual bucket name, region evidence, deployed build, HTTPS URL, and public acceptance remain unavailable. Cost approval is no longer the blocker; cloud authentication is.


### Acceptance at the real HTTPS origin

Record the actual non-secret bucket name, region, HTTPS URL, deployed commit/build, upload method, cache/routing settings, and date after authorized deployment. Until recorded and exercised, these remain prerequisites, not a deployment status.

- Open the real HTTPS URL without certificate errors; inspect response headers and browser console/network for missing resources, MIME errors, mixed content, and stale entrypoints. Test a direct deep link and reload in a fresh browser session before SW control.
- Confirm the manifest loads with correct name, icons, start URL, and scope. Confirm the production worker installs, activates, controls the page, and serves a complete cached version without hash failures.
- After one successful online load and completed SW caching, create test diary data, close the app, disable networking, and cold-start/reload from its installed entrypoint. Verify shell, routes, saved diary, and timers remain usable. A first-ever visit without network is not expected to work.
- Deploy a second approved build; verify an existing client can detect/adopt it, reload into a consistent new version, and retain diary data. Check an older open tab can still load its chunks. Test recovery after reconnecting. Do not clear site storage to make an update pass.
- On a **real iPhone**, open the HTTPS URL in **Safari**, use **Share → Add to Home Screen** (Russian UI: **Поделиться → На экран «Домой»**), then launch from the icon. Verify standalone layout, safe areas, icons, online/offline reopen, updates, and data retention. WebKit emulation is useful but is **not** proof of real iPhone installation or lifecycle behavior.
- Do not promise background execution, push notifications, or native-equivalent reminders without separately implemented and real-device-verified support. Browser suspension/storage eviction remain platform constraints; keep user-managed backups private.

### Hosting is not diary synchronization

Object Storage serves public application files; it does not synchronize private diary data. Follow [README.md](README.md) for the independent sync setup. In the browser, Yandex Disk requests depend on Yandex CORS, and the token is held **only in tab memory**: after reload, a new login is required. Successful PWA hosting/offline tests do not establish working Disk sync. Verify the real browser authorization/exchange separately with the user's authorized accounts, or explicitly report that sync as unverified. Never put diary exports or tokens into the public hosting bucket.
