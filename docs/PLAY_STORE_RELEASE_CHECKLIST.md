# Rillcod Academy — Google Play release checklist

## Automated in this repository

- Package: `com.rillcod.academy`
- Android target/compile SDK: 36
- Cleartext traffic disabled
- Android cloud backup disabled
- Release code/resource shrinking enabled with Capacitor bridge preservation
- Status bar, splash, safe areas, native Back, offline recovery, push handling, custom and HTTPS deep links configured
- Public account-deletion resource: `/account-deletion`
- In-app deletion path: Dashboard → Profile → Privacy & account
- Admin review queue: Dashboard → Deletion Requests
- Privacy policy deletion section linked

## Requires the Play Console owner

1. Build with the final release keystore and enrol in Play App Signing.
2. Copy the SHA-256 certificate fingerprint from Play Console → Setup → App integrity.
3. Run `node scripts/generate-assetlinks.mjs "AA:BB:..."` and deploy the generated `public/.well-known/assetlinks.json`.
4. Confirm `https://www.rillcod.com/.well-known/assetlinks.json` returns HTTP 200 with `application/json` and no redirect.
5. Complete Data Safety accurately for account/profile data, school/student data, payments, files/photos, notifications, camera/microphone, and analytics actually collected in production.
6. Enter `https://www.rillcod.com/account-deletion` as the account deletion URL.
7. Supply reviewer credentials for each restricted role needed to review the app.
8. Complete target audience, content rating, ads, financial features, and privacy declarations.
9. Upload phone screenshots, feature graphic, support email, privacy URL, and store description.
10. Upload the signed AAB to Internal Testing first and run the Pre-launch report.

## Required manual device matrix

- Small Android phone (360px CSS width)
- Large Android phone
- Android tablet
- Portrait and landscape
- Light and dark themes
- Admin, teacher, school, parent, and student roles
- Online, slow connection, connection loss, and restored connection

## Critical flow checklist

- Login, password reset, logout, session expiry
- Dashboard tabs, drawer, Android Back, deep links
- Report Builder class/course confirmation, autosave, draft/publish, next student/class, return/resume
- Classes, transfer, attendance, assignments, grading
- Finance payment redirect and return
- Inbox, WhatsApp, meetings, PDFs, printing/sharing
- Profile, notification opt-in, account deletion request

## Release commands

- Type check: `tsc --noEmit`
- Sync native project: `npx cap sync android`
- Build AAB: `cd android && gradlew bundleRelease`
- Output: `android/app/build/outputs/bundle/release/app-release.aab`

Do not commit the keystore, passwords, service-role key, `google-services.json`, or private signing fingerprints.