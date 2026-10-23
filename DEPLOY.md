# Deployment

Operator runbook for Android APK releases and the production PWA. The observed Lulio PWA deployment is recorded below. Android release/signing and physical-device acceptance are separate checks; do not infer them from successful web publication.

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

### Android 1.2.0 publication receipt (2026-10-23)

- **Release:** https://github.com/Chernikovmax/lulio-baby-tracker/releases/tag/v1.2.0 — published at **19:50:32Z**, not draft or prerelease, marked latest.
- **APK source:** exact commit `e2e2c30c9fc6c78e4b34069d6bc562c3590d5cd2`, including saved-record timestamp editing from `a5a7c65`. Remote `main` already pointed to this revision; the new `v1.2.0` tag was pushed at exactly this commit without moving any existing tag. This documentation receipt is subsequent evidence, not APK source.
- **Isolation and checks:** all release commands ran in the physical checkout `/Users/chernikovmax/orca/workspaces/lulio-android-v1.1.1`, not the shared virtual workspace/root. Node **22.23.2**; sequential `npm ci`, `npx tsc --noEmit`, `npm run build`, `npx ng test --watch=false` passed (**70 tests, 15 files**).
- **CI:** https://github.com/Chernikovmax/lulio-baby-tracker/actions/runs/40013796967 — completed successfully at the source commit; both **build** and **release** jobs succeeded, including signing and publication.
- **Downloaded release bytes:** actual GitHub Release attachments `lulio-baby-tracker-v1.2.0.apk` and `SHA256SUMS`, retained locally under `dist/android-release-verification/v1.2.0/`. `shasum -a 256 -c SHA256SUMS` passed. APK SHA-256: `3798fca1f09cfebbf558ba9256725020cb188a09ace29ad7fdaa7c6e85eb9eef`.
- **Independent APK inspection:** installed Android build-tools **35.0.0** `apksigner verify --verbose --print-certs` passed with one signer and v2/v3 signatures; `zipalign -c -p 4` passed. `aapt dump badging` confirmed package **io.ionic.starter**, versionName **1.2.0**, versionCode **1002000**, min SDK **24**, target SDK **36**.
- **Signing continuity:** downloaded trusted previous release **v1.1.1**, checked its published checksum and signature, and compared public signer certificate SHA-256 fingerprints. Both are `caf549bd5fdb2248856e820b70efbda2c895890328eee189fa512df35156ee13`. No private signing material was accessed or identity replaced.
- **Limits:** `adb devices -l` listed no connected devices. Physical installation, launch, in-place update, and diary/timer persistence after restart remain **unverified**. Parent-reported browser scenarios are not physical Android acceptance.
- **Scope:** Android only; no PWA deployment, source/version changes, generated Android edits, root staged artifacts, or unrelated research/sync work were touched. CI emitted action-runtime/setup-java deprecation notices; these did not fail either job.


## PWA → Yandex Object Storage

### Current local configuration and required hosting decisions

- `angular.json` builds production by default into **`www/`**, not `www/browser/` (`outputPath.base: "www"`, `browser: ""`), with hashed bundles and `ngsw-config.json`. `npm run build` is the production build command. Inspect fresh output; an existing `www/` can be stale.
- Current sources include `src/manifest.webmanifest`, icons, and production web-only registration of `ngsw-worker.js` in `src/main.ts` (disabled for native Capacitor). `ngsw-config.json` prefetches the shell/assets, has no API data cache groups, and enables navigation handling. Configuration presence is not proof of a generated or deployed working PWA.
- The HTML base, manifest ID/start URL/scope, and SW cache paths currently assume **origin root `/`**. Deploy at root. Subdirectory hosting requires a coordinated configuration change and separate scope/navigation verification, not just uploading beneath a prefix.
- Before publishing, confirm the generated `index.html`, manifest, icons, `ngsw.json`, and worker scripts exist and match the intended build. Coordinate with the PWA implementation owner and recheck these settings after their changes.
- Use a dedicated **Russia-region** bucket with a name **without dots**, STANDARD storage, and public **object read only**. Keep listing/configuration administration private. The primary deployed bucket is `lulio`; the previous `lulio-baby-tracker` website and all anonymous access have been disabled, and all 62 old publication objects have subsequently been deleted with the owner's explicit approval. That old bucket is empty; local release archives remain available for rollback.
- Use **`https://<bucket>.website.yandexcloud.net/`** at origin root. The current deployed and HTTPS-verified primary address is **https://lulio.website.yandexcloud.net/**. Do not use `https://website.yandexcloud.net/<bucket>` with this root-scoped build.
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

#### Historical preparation (2026-10-21)

Local evidence (not a cloud deployment): 62 staged objects passed byte/MIME/cache-control checks through a strict local static server. Direct extensionless/trailing-slash routes returned 200 and missing JS returned 404. Chromium accepted the manifest/installability and root SW; offline reload and a full browser-process restart retained a completed diary entry. Profile, active timer, JSON download, and a whole-version update with a changed main bundle passed. A 3.2-second frozen-page timer resumed correctly. Mobile WebKit at 390 × 844 passed rendering/focus/offline checks with no page errors, but cannot prove installation, physical keyboard geometry, or OS storage retention on an iPhone. The update candidate was generated only in a disposable local artifact; no second public release was published.

The prepared 2026-10-21 artifact is `dist/baby-tracker-pwa.zip` (517,757 bytes, 62 public objects plus upload plan); checksum file: `dist/baby-tracker-pwa.zip.sha256`. SHA-256: `0c4211861dcf750843d7ab5baed26efc90066632d46c026369e1ef344e7439c6`. It contains `pwa/upload-plan.json` and only the plan-listed `pwa/files/*`, not source files or diary data. Unpack beneath `dist/` to restore the staged layout; use the publisher, not a recursive upload. These bytes represent the checked-out working state, including pre-existing user edits; no release commit/tag or cloud publication was created.

Sequential mandatory checks passed: `npx tsc --noEmit`, Angular MCP `app:build:production` (equivalent to `npm run build`), and Angular MCP `app:test` with `watch: false` (43 tests in 12 files). The staged artifact and production runtime scenarios were exercised after the final build. Temporary browser scenarios ran in isolated local processes, not the user's occupied MCP browser.

Deployment authorization update (2026-10-21): the owner explicitly accepted Object Storage charges beyond the free tier for this minimal Russia-region deployment, without a paid domain/CDN or extra services. This does not authorize reading credentials, keys, tokens, or environment files. An Orca tab was opened at `https://console.yandex.cloud/`; it redirected to the Yandex Cloud login page and displayed “Войти с помощью Yandex”. No authenticated cloud session is available in that tab. The owner must complete sign-in there privately and return to the console before publication can proceed. No bucket was created or files uploaded; actual bucket name, region evidence, deployed build, HTTPS URL, and public acceptance remain unavailable. Cost approval is no longer the blocker; cloud authentication is.

#### Initial production deployment: Lulio (2026-10-22)

- **Initial URL, now retired:** https://lulio-baby-tracker.website.yandexcloud.net/ — the current primary URL is https://lulio.website.yandexcloud.net/ (see the migration and retirement records below). Origin root, title/manifest name **Lulio: baby tracker**, short name and iPhone home-screen metadata **Lulio**. Version **1.1.0**, source commit `485eef5c395853d72b298bfd9e615140778b3a13` (`feat: rename app to Lulio; release v1.1.0`, committed at 14:01:14Z). Application/storage/sync identifiers remain unchanged.
- **Cloud:** bucket `lulio-baby-tracker`, folder `b1g76scolnksmil9po8q`, STANDARD, maximum size **1,073,741,824 bytes**, versioning disabled, object reads public, listing/configuration reads private. Authenticated inventory after publication: **62 objects, 1,617,411 bytes**. No source checkout, credentials, environment files, unnecessary source maps, or diary exports were uploaded.
- **Region evidence:** the owner authenticated in the Russia console `https://console.yandex.cloud`; the bucket was created in that console's folder and its objects were verified through `https://storage.yandexcloud.net`. The official [region mapping](https://yandex.cloud/ru/docs/overview/concepts/region), checked on 2026-10-22, identifies these as Russia and distinguishes Kazakhstan's `kz.console.yandex.cloud` / `storage.yandexcloud.kz`. This evidence is not merely a CLI signing-region argument.
- The owner privately completed sign-in and linked billing after the earlier blockers. No payment details or credentials were requested in chat or read from files. Cost exposure was explicitly accepted. Free tier is not a spending cap; a bucket size limit does not cap request/traffic charges.
- **Cost notification configured:** `lulio-monthly-cost-alert` (ID `dn2nfgm7ol8tlvtagcvu`) was saved and observed **Active** in Cloud Center. Monthly **10 RUB**, type **expense / К оплате**, threshold **100%**, account-owner recipient, all clouds/services on the billing account, valid through **2027-10-31**. It is an alert only: no hard spending cap, auto-top-up, payment-card change, or automatic resource shutdown was configured. Email delivery itself was not tested.
- A pre-rebranding empty bucket, `baby-tracker-chernikov-20261022`, was also created before the owner requested a Lulio hostname. It received **no production objects** and was preserved, not deleted or used as a second public application. Do not migrate users to its origin: browser diary storage is origin-specific.
- **Authentication/upload method:** the owner's preauthorized Yandex Cloud Shell, **yc 1.41.0 linux/amd64**. The existing `prepare-pwa.mjs` generated the authoritative ordered upload plan. A production-only ZIP was transferred into Cloud Shell and its SHA-256 checked before upload. A temporary Python operator loop invoked `yc storage s3api put-object` for each plan entry and fetched each final public URL to verify HTTP 200, bytes, Content-Type, and Cache-Control before continuing. Dependencies preceded entrypoints; `ngsw.json` was last; no remote objects were deleted. AWS CLI was present in Cloud Shell but reported `NoCredentials`, so it was not used for uploads. No access keys were created or exported. Temporary transfer files were removed after success.
- **Website settings:** `{"index":"index.html"}`, no error-document fallback, proxy, custom domain, CDN, gateway, or backend service. Exact and trailing-slash SPA aliases return HTTP 200; a genuinely missing JS file returns HTTP 404, not the application shell. Although the provider's general hosting guide suggests public listing, the deployed exact-key/alias configuration was exercised successfully with listing private; do not broaden permissions unnecessarily.
- **Builds/checks:** Node `v22.23.2`; locked dependencies installed with `npm ci --no-audit --no-fund`. Both branded builds passed sequential `npx tsc --noEmit`, Angular MCP `app:build:production` (the target used by `npm run build`), and Angular MCP `app:test` with `watch: false` (**53 tests, 12 files**). Initial branded build: **14:05:37.523Z**, all 62 objects published/verified at **14:18:10Z**. Final build: **14:22:10.726Z**, final manifest published/verified at **14:23:14Z**.
- The second build used unchanged application sources. Only `ngsw.json.timestamp` differed; every other dependency was byte-verified before publishing that manifest last. The update check therefore proves a real public SW-version transition and data preservation, **not** a transition between different JavaScript bundles.
- **Final archive:** `dist/lulio-pwa-20261022T142210Z.zip`, **527,376 bytes**, adjacent `.sha256` file. SHA-256: `041253873a5e94b2b9119447293ec9b7ce9457392f74344cab66b846197f4c63`. Final `ngsw.json` SHA-256: `c8a4f72f3f98929c76ce02ce5ec2301c4f1bb2d77f82d3cb930c9a9937ff4103`.
- **Rollback archive:** `dist/lulio-pwa-20261022T140537Z.zip`, **527,375 bytes**, SHA-256 `16c3614bb4663de426f3abbe7b2d4ee4f0674246d2e784b08a4c8028cc628d4b`; its original SW manifest SHA-256 is `b787dd6ee17f1f4fbca07321d33fcf700d702ac673828ecba62e1af5605474e5`. All older local archives were preserved. For this timestamp-only update, restoring that original manifest restores the matching first release; verify all its unchanged dependencies first. For future code changes, restore the complete matching release as described above. No automatic chunk-retention cleanup policy was introduced.

Observed public acceptance, using a separate temporary Chromium profile rather than the owner's browser:

- All 62 objects passed independent HTTPS byte/MIME/cache-control verification. Root, exact route aliases, and all five trailing-slash routes returned 200. Each of `/tabs/tracker`, `/tabs/stats`, `/tabs/leaps`, `/tabs/settings` rendered its actual page on a fresh client with SW blocked. Missing JS returned 404. Anonymous bucket listing, website configuration, and ACL reads each returned 403.
- Chromium installability reported **zero errors** in a clean persistent profile. The manifest/icons loaded; `ngsw-worker.js` activated, controlled the page, and had root scope. No certificate bypass was used.
- A profile, a real diary entry created through the diaper modal, and an active sleep timer were saved through the UI. Offline reload and a complete browser-process restart preserved the profile/entry; all four application routes opened offline. The active timer retained its original `startedAt` after offline reload and continued displaying elapsed time.
- After the second public build, **Check for update** showed the real update banner. **Reload** adopted SW version `6d1c4b8ee64d3ec566644d513581fb0675d40dfc` from `e17555ed75c983f60316c33476739df67507739f`; SW debug state remained `NORMAL`, with no hash errors. The complete serialized diary/profile/timer state was identical before/after reload and after a subsequent offline browser-process restart.
- JSON export contained the test profile, diary entry, and original timer start. It stayed in the isolated local browser download area and was never published. The actual 390 × 844 surface was inspected: four primary actions were about 79 px tall, at y=700 in the bottom third. No browser page errors occurred.
- **Not verified:** physical-iPhone installation/lifecycle/keyboard/storage eviction, availability from Russian access networks, real-account Yandex Disk OAuth/CORS/two-parent sync, and a public update with changed JS bundles. Earlier local WebKit/changed-bundle checks above remain historical evidence, not physical-device or public changed-bundle acceptance.

Reproducible configuration and publication, with explicit cost approval and privately authorized tools:

```sh
# Existing bucket: inspect before modifying; never create a competing release.
yc storage bucket get --name lulio --full --no-pager --format json
yc storage bucket update --name lulio \
  --website-settings '{"index":"index.html"}' --no-pager
# From dist/ on the build machine:
shasum -a 256 -c lulio-pwa-20261022T142210Z.zip.sha256
# For later fresh builds, repeat the sequential checks and prepare-pwa.mjs first.
# With an approved AWS-authenticated environment, the existing publisher is:
node scripts/publish-pwa.mjs lulio
node scripts/publish-pwa.mjs lulio --confirm-billable-operations
```

The checksum command runs from `dist/`; the publisher commands run from the checkout root. Never treat the dry run as publication. For the exercised Cloud Shell method, transfer only the checksum-verified production ZIP privately into the shell (not to the public bucket), then use the plan's explicit keys/files in order. The installed `yc 1.41.0` accepts a plain local file path for `--body`, **not** `@path`; the current online CLI documentation differs, so check the installed tool's help. The per-object operation actually exercised was:

```sh
yc storage s3api put-object --bucket lulio \
  --key '<plan key>' --body '<local staged file path>' \
  --content-type '<plan contentType>' --cache-control '<plan cacheControl>' \
  --storage-class STANDARD --no-pager
```

After every operation, fetch `https://lulio.website.yandexcloud.net/<plan key>` and compare status, both metadata headers, and complete bytes to the local file before advancing. Validate all unchanged dependencies before a manifest-only update. Do not print credentials or copy the repository, browser profile, diary data, or source files into Cloud Shell.

#### Short-origin migration (2026-10-22)

- At the owner's request, the preferred URL became **https://lulio.website.yandexcloud.net/**. Bucket `lulio` was created at **14:42:46.301143Z** in the same Russia folder `b1g76scolnksmil9po8q`, STANDARD, maximum **1,073,741,824 bytes**, versioning disabled, public object read only. Website settings are `{"index":"index.html"}`; there is no error-document SPA fallback or paid custom domain.
- This is a hostname-only migration of the exact already-tested **1.1.0** release, not an application change or a fresh build. The pinned archive `dist/lulio-pwa-20261022T142210Z.zip` passed its existing SHA-256 check. Its explicit 62-object plan and per-object SHA-256 values were reused. In preauthorized Cloud Shell, an operator loop required an empty destination, downloaded each production object from the old public origin, checked bytes/hash/MIME/cache-control against that pinned inventory, and uploaded only that object with the same metadata using `yc storage s3api put-object`. Each new public object was fetched and checked before continuing. Dependencies came first and `ngsw.json` last. Completion receipt: **14:45:11Z**, **62 verified objects**. Temporary body files were removed automatically.
- At migration time, no objects or settings at `lulio-baby-tracker` were overwritten or removed and no redirect was added. Its then-public SW manifest had SHA-256 `c8a4f72f3f98929c76ce02ce5ec2301c4f1bb2d77f82d3cb930c9a9937ff4103`, matching the shorter origin. The owner subsequently requested retirement of the old address; it is now private with website hosting disabled as recorded below. Local release/rollback archives remain unchanged.
- Independent final checks at the short origin passed for all 62 objects: HTTP 200, exact bytes, MIME and cache-control. Root and all five trailing-slash SPA aliases returned 200; fresh SW-blocked clients directly rendered tracker, stats, leaps and settings. A missing JS resource returned 404. Anonymous listing, website configuration and ACL reads each returned 403.
- A clean isolated persistent Chromium profile reported zero installability errors. The activated worker is `https://lulio.website.yandexcloud.net/ngsw-worker.js`, with scope `https://lulio.website.yandexcloud.net/`; secure context and control were verified without certificate bypass. Offline reload and a complete browser-process restart reopened the application and preserved imported diary data exactly. No page errors were observed.
- The actual migration procedure was exercised with synthetic data: create a profile/diary entry through the old-origin UI, export its JSON, confirm the new origin initially has separate empty storage, import the file through the new-origin confirmation flow, and reload. The profile and entry appeared at the new origin and survived an offline cold restart; the old-origin stored diary remained identical. No private user diary was read, exported, imported, or uploaded. Temporary browser profiles/downloads are disposable acceptance data.
- **User data migration is manual.** The old origin was initially retained for diary export; the owner subsequently declared it unnecessary and requested retirement. The old site is no longer an online export endpoint. Already cached old clients may still open offline, but no cache/data clearing or automatic migration was performed. Existing JSON backups can be imported at the new origin or inside the new installed PWA; import replaces local data, so back up the destination first. Safari and an installed PWA may have different storage. Use one origin consistently. Any temporary reopening of the old origin requires the owner's explicit request.
- The existing **10 RUB monthly notification** covers all clouds/services of the billing account and therefore also the new bucket. It is not a 50 RUB hard spending cap. The official [budget documentation](https://yandex.cloud/ru/docs/billing/concepts/budget), checked on 2026-10-22, states that reaching a threshold does not affect further resource consumption. No payment-card limit, automatic top-up, resource-shutdown automation, or new paid services were configured.
- Physical-iPhone acceptance, real-account Disk sync and access from Russian consumer networks remain unverified. The earlier public update/timer checks belong to the previous origin and the identical release; no second SW-version deployment was performed at the short origin.




#### Previous-origin retirement (2026-10-22)

- At the owner's request, only the previous public application origin `lulio-baby-tracker.website.yandexcloud.net` was initially retired. In authorized Cloud Shell, its configuration was inspected, then website settings were removed and `public-read`, `public-list`, and `public-config-read` set to false. At that stage no objects or buckets were deleted; files were initially retained privately. The owner later explicitly authorized deleting those files, as recorded below. No redirect was created.
- Applied operation: `yc storage bucket update --name lulio-baby-tracker --remove-website-settings --public-read=false --public-list=false --public-config-read=false --no-pager --format json`.
- Verified at **2026-10-22T15:07:34.662Z**: the old website root returns HTTP **404 / NoSuchWebsiteConfiguration**; anonymous S3 reads of its `index.html` and `ngsw.json` return HTTP **403 / AccessDenied**. The live `lulio` bucket was not modified, and all **62 objects** at https://lulio.website.yandexcloud.net/ were independently rechecked for HTTP 200, complete bytes, MIME and cache-control against the pinned release.
- Retiring hosting does not revoke already cached service-worker shells or delete browser-local diaries. No user browser data was read, cleared or transferred. The current public address and the existing cost notification remain unchanged. The subsequent file-removal record below supersedes the initial private-file retention.

#### Authorized old-publication file removal (2026-10-22)

- The owner explicitly stated that the old publication had not been used and authorized deleting its files. Scope was only bucket **`lulio-baby-tracker`**, not the working **`lulio`** bucket, local release archives, or unrelated resources.
- The pinned previous-release plan contains **62 objects**: **47 root files** and **15 nested files** under `assets/` and `tabs/`. The authenticated console showed 62 objects before cleanup. Its root selection was **49 entries**: the 47 files plus the 2 virtual folders. The deletion confirmation listed the expected production assets, bundles, entrypoints, worker files and route aliases.
- Cloud Shell lost its connection, so the scripted deletion attempt could not be confirmed there. Cleanup was reconciled and completed through the authorized Object Storage console. A freshly navigated old-bucket object page then showed **“У вас пока нет объектов”**, zero object rows and no production-object links. The empty bucket itself was not deleted; website hosting and anonymous access remain disabled.
- Final checks at **2026-10-22T19:26:43.230Z**: the old website returns HTTP 404; https://lulio.website.yandexcloud.net/ and its manifest return HTTP 200. All **62 live objects** were independently verified for bytes, MIME and cache-control against SHA-256 values from the immutable `lulio-pwa-20261022T142210Z.zip` release, whose archive SHA-256 remains `041253873a5e94b2b9119447293ec9b7ce9457392f74344cab66b846197f4c63`. The current manifest remains `c8a4f72f3f98929c76ce02ce5ec2301c4f1bb2d77f82d3cb930c9a9937ff4103`.
- Local `dist/pwa` staging had been changed by another process during this work; it was not restored, overwritten, or used as release identity after that mismatch was detected. Verification used the pinned archive instead. Application sources and existing local archives were not modified, and no user diary was accessed.

#### Disk diagnostic update (2026-10-22)

- Published to **https://lulio.website.yandexcloud.net/**, existing Russia bucket **`lulio`**, folder **`b1g76scolnksmil9po8q`**. Version remains **1.1.0**; production build completed at **19:08:56.831Z**. This working-tree build adds stage-specific Disk request diagnostics; no new release commit/tag was created. Sequential TypeScript, production build and unit checks passed before staging (**60 tests, 13 files**).
- Pinned production-only archive: **`dist/lulio-pwa-20261022T190856Z.zip`**, **524,518 bytes**, SHA-256 **`17b4ca8b851d2ea36a0631db1b1b366f9296efb9d913984a7956637275a15691`**; adjacent checksum file retained. Its explicit upload plan contains **62 objects**. No source checkout, credentials, diary exports or unnecessary maps were transferred to the public bucket.
- Used the authorized Cloud Shell session and `yc storage s3api put-object`, with the plan's exact keys, STANDARD storage, explicit MIME/cache metadata and per-object public byte verification. The privately transferred ZIP's SHA-256 was checked before extraction. Dependencies preceded entrypoints; **`ngsw.json` was last**. No remote objects were deleted, bucket permissions/hosting were unchanged, and old hashed dependencies remain available.
- The first attempt encountered **`Network is unreachable`** during verification near the end of the plan. The operator restored the previous mutable objects, reported **`LULIO_ROLLED_BACK`**, and the old manifest remained public. A second attempt used IPv4 public HTTP verification with bounded curl retries and skipped already matching objects. Final receipt: **`LULIO_PUBLISHED 2026-10-22T19:31:29Z 62 objects`**. The private transfer ZIP was removed after success.
- Independent build-machine HTTPS checks passed for all **62 objects**: status 200, full bytes, Content-Type and Cache-Control. Root and all five trailing-slash aliases matched the new index; a missing JS resource returned 404. New `ngsw.json` SHA-256: **`967bbe9287ff301ab46fb35309691936ab3245d31715cfcc477b2003caadfd10`**. The prior release remains available in the local pinned `lulio-pwa-20261022T142210Z.zip` archive for rollback; do not rely on the retired/deleted old-origin objects.
- A separate browser client on the actual public origin cached the previous version, then saved a synthetic profile, a 90 ml bottle entry and an active sleep timer through the UI. **Check for update → Reload** adopted changed JavaScript (`main-N7O33MXU.js`), transitioning SW version **`6d1c4b8ee64d3ec566644d513581fb0675d40dfc` → `a73a1d888790bf9f87bcae68fac009649c92cd5f`**. The complete serialized diary was identical across the update; the worker remained **NORMAL**, with an empty debug log. No user storage was cleared to force adoption.
- After updating, all four app routes opened with networking disabled. The synthetic profile, bottle entry and original sleep `startedAt` were retained, and the running timer rendered on the tracker. In a separate fresh 390 × 844 browser context with SW disabled solely for synthetic request interception, the **published UI** displayed distinct **`YD-METADATA`**, **`YD-DOWNLOAD-LINK`** and **`YD-DOWNLOAD`** HTTP 404 messages through the real login/connect controls. Synthetic tokens, paths and signed-link hosts did not appear in those messages. This is diagnostic UI acceptance with controlled responses, **not real-account Disk sync**.
- Physical-iPhone update/install/lifecycle behavior and successful real-account Disk exchange remain unverified. Existing PWA users should use **Profile → Check for update → Reload**, then sign into Yandex again because the browser OAuth session is memory-only. Do not clear site data or reinstall to obtain this update.


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
